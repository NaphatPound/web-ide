# Bug 02: Switching Vim/VS Code mode destroys live terminal sessions

## Severity
High

## Summary
Toggling the editor mode remounts the entire application subtree because `App` keys the animated wrapper by `mode`. That unmounts every `TerminalTab`, and each terminal cleanup kills or aborts the underlying shell/process. A mode switch that is supposed to be a UI-only change therefore terminates live terminal sessions and resets terminal state.

## Evidence
- `src/hooks/useModeHotkey.ts:7-14` binds `Cmd/Ctrl + Alt/Shift + V` to `toggleMode()`.
- `src/App.tsx:12-23` renders `<motion.div key={mode}>`, so changing the mode forces React to unmount the old tree and mount a new one.
- `src/components/Terminal/TerminalTab.tsx:26-60` creates the terminal session inside `useEffect`, so every remount recreates the terminal from scratch.
- `src/components/Terminal/TerminalTab.tsx:113-120` kills the desktop PTY in cleanup via `invoke("pty_kill", { id: ptyId })`.
- `src/components/Terminal/TerminalTab.tsx:236-241` aborts the browser/dev-host process in cleanup via `abort?.abort()`.
- `src/components/Terminal/TerminalTab.tsx:195-197` reruns `initialCmd` on mount, so a remount caused by mode switching restarts startup commands again in browser/dev-host mode.
- `plan.md:25-27` describes the mode hotkey as a UI mode switch with animation, not as an action that should reset terminals or kill background work.

## Reproduction
1. Open the app and start any long-running command in a terminal, for example `npm run dev`, `sleep 9999`, or one of the auto-start AI terminals.
2. Press `Cmd/Ctrl + Alt + V` or `Cmd/Ctrl + Shift + V` to toggle modes.
3. Return to the terminal pane.

## Expected
The mode toggle should only change the UI presentation. Existing terminals, running commands, and shell history should remain intact.

## Actual
All terminal components unmount and remount. On desktop/Tauri, the PTY is killed. In browser/dev-host mode, the running command is aborted, and any `initialCmd` is started again from scratch.

## Impact
- Long-running processes are terminated by a purely cosmetic mode switch.
- Interactive CLI sessions lose state and conversation history.
- Background services can be interrupted unexpectedly.
- Auto-start commands may restart multiple times in browser/dev-host mode.

## Root Cause
`mode` is used as the React key for the top-level animated container in `App`, so a mode change is treated as a full component replacement instead of a visual state update. Terminal lifetime is tied to component mount/unmount, making the animation strategy destructive.

## Suggested Fix
- Keep the app subtree mounted when the mode changes; animate with props or class changes instead of `key={mode}`.
- Scope any exit/enter animation to the parts of the UI that actually need visual transitions.
- Add an integration test that starts a terminal session, toggles mode, and asserts the terminal backend is not killed or restarted.

## Verification Notes
The current test suite still passes (`29` tests), but it only covers store/hooks/utils. There are no tests exercising the interaction between `App`, `useModeHotkey`, and `TerminalTab`, which is why this regression is currently invisible to CI.
