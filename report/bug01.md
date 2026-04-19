# Bug 01: `run_terminal` startup commands are never executed

## Severity
High

## Summary
The startup configuration format supports terminal commands with both a `title` and a `cmd`, but the frontend startup runner discards `cmd` and only creates a tab title. As a result, `.ide-startup.yaml` cannot actually launch agent CLIs or background services on boot, even though the feature is documented as supported.

## Evidence
- `src/utils/startup.ts:8-9` defines `run_terminal` commands as `{ title, cmd }[]`.
- `src/utils/startup.ts:59-60` applies `run_terminal` by calling only `runner.addTerminal(c.title)`.
- `src/store/useIdeStore.ts:11-14` stores terminals as `{ id, title }` with no field for the command.
- `src/store/useIdeStore.ts:26` and `src/store/useIdeStore.ts:72-75` define `addTerminal(title)` so the command is lost before a terminal tab is created.
- `src-tauri/src/startup.rs:14-17` deserializes `cmd` on the Rust side, so the config loader preserves the command correctly.
- `docs/llm-wiki.md:108` says `.ide-startup.yaml` can "spawn agent CLIs as named terminals on boot".
- `docs/llm-wiki.md:134-141` shows `run_terminal` examples where `cmd` is the thing that should be launched.
- `src/utils/startup.test.ts:34-43` only asserts that terminal titles are added, which explains why the current test suite passes while the feature is still broken.

## Reproduction
1. Create `.ide-startup.yaml` in the project root:

```yaml
startup:
  - action: run_terminal
    commands:
      - title: BootTerm
        cmd: echo startup-ok
```

2. Launch the app.
3. Wait for startup automation to run.
4. Open the `BootTerm` tab.

## Expected
The app should spawn the terminal and execute `echo startup-ok`, or at minimum pass the configured command into the terminal/PTY layer so it can be executed automatically.

## Actual
The app only creates a terminal tab named `BootTerm`. The configured shell command is never executed.

## Impact
- Startup automation for agent CLIs does not work.
- Background services such as `npm run dev` cannot be bootstrapped from `.ide-startup.yaml`.
- The documented onboarding path for "Wiring a new agent" is broken.

## Root Cause
`cmd` is parsed from YAML but dropped in the frontend state model and runner interface. There is no code path that carries a startup command into `TerminalTab` or the PTY commands (`pty_spawn` / `pty_write`).

## Suggested Fix
- Extend `TerminalEntry` to store an optional startup command.
- Change `addTerminal` and `StartupRunner` to accept both `title` and `cmd`.
- On terminal mount, if a startup command exists, write it into the PTY once after spawn.
- Add a regression test that asserts the command itself is forwarded, not just the tab title.
