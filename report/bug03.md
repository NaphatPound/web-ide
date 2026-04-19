# Bug Report: Terminal Initialization and Persistence Issues

## Summary
There are multiple issues related to how terminals are initialized and persisted in the Web IDE, especially when switching between layouts and using the startup configuration.

## 1. Terminal Remounting and Re-initialization on Layout Toggle
When toggling between the "tabs" and "split" layout in the `TerminalPanel`, all `TerminalTab` components are unmounted and then remounted because the DOM hierarchy changes significantly.

### Symptoms
- Every time the layout is toggled, the terminal resets (clears) and re-initializes.
- If the terminal was created with an `initialCmd` (e.g., from the startup config or AI startup spec), the command will be **re-executed** every time the layout is toggled.
- This leads to repeated execution of potentially long-running or side-effectful commands.

### Root Cause
In `src/components/TerminalPanel.tsx`, the layout ternary structure changes the parent of the `TerminalTab` components:

```tsx
{layout === "split" ? (
  <div data-testid="split-grid" className="...">
    {terminals.map((t) => (
      <div key={t.id} ...>
        <TerminalTab id={t.id} />
      </div>
    ))}
  </div>
) : (
  <div className="flex-1 min-h-0 relative">
    {terminals.map((t) => (
      <div key={t.id} ...>
        <TerminalTab id={t.id} />
      </div>
    ))}
  </div>
)}
```

Because the `TerminalTab` components are rendered under different parent DOM nodes when `layout === "split"`, React performs an unmount and mount for all of them.

### Reproduction
1. Open the Web IDE with at least two terminals.
2. Ensure one of the terminals was created with an `initialCmd` (e.g., `npm run dev`).
3. Toggle the "Split" button.
4. Observe that the terminal restarts and the command is executed again.
5. Toggle "Unsplit" and observe the same behavior.

---

## 2. Startup Config Ignores Initial Commands (`initialCmd`)
The `applyStartup` function in `src/utils/startup.ts` fails to pass the `cmd` parameter from the configuration to the `addTerminal` function.

### Symptoms
- Terminals specified in `.ide-startup.yaml` with an `action: run_terminal` only open with the correct `title`, but they **do not execute the specified `cmd`**.

### Root Cause
In `src/utils/startup.ts`, the `applyStartup` function and the `StartupRunner` interface are missing the second argument for `addTerminal`:

```typescript
export interface StartupRunner {
  // ...
  addTerminal: (title: string) => string; // Missing initialCmd?
}

export function applyStartup(config: StartupConfig, runner: StartupRunner): void {
  for (const step of config.startup) {
    switch (step.action) {
      // ...
      case "run_terminal":
        step.commands.forEach((c) => runner.addTerminal(c.title)); // Missing c.cmd
        break;
    }
  }
}
```

---

## 3. Tauri Mode Lacks Initial Command Support
Even if the `initialCmd` was correctly passed from the store, the `attachPty` function used in Tauri mode does not accept or handle it. Furthermore, the Rust backend (`pty_spawn` command) does not take an initial command to run.

### Symptoms
- In Tauri mode, terminals always open with the default shell prompt and ignore any `initialCmd`.

### Root Cause
In `src/components/Terminal/TerminalTab.tsx`, the call to `attachPty` is missing the `initialCmd`:
```typescript
if (inTauri()) {
  cleanup = attachPty(term, fit, hostRef.current!); // Missing initialCmd
}
```

And in `src-tauri/src/pty.rs`, `pty_spawn` only takes `shell` and `cwd`, but no command to execute after spawning the shell.

---

## Suggested Fixes

1.  **Fix Remounting:** In `TerminalPanel.tsx`, use a single `map` over `terminals` and use CSS classes or inline styles to toggle between a grid layout (split) and a relative layout (tabs). This ensures the `TerminalTab` components stay mounted.
2.  **Fix `applyStartup`:** Update the `StartupRunner` interface and the `applyStartup` function in `src/utils/startup.ts` to pass the `cmd` to `addTerminal`.
3.  **Enhance Tauri Support:** Update `pty_spawn` in Rust to optionally take an initial command (or use `pty_write` to send it immediately after spawn) and pass the `initialCmd` through `attachPty` in the frontend.
