# Bug 04: Desktop/Tauri users cannot open folders via the Sidebar

## Severity
High (Critical for Tauri users)

## Summary
The "Open Folder" feature in the Sidebar relies solely on the browser's `showDirectoryPicker` API or a development-mode fallback (`pickFolderFromHost`). It does not integrate with the Tauri-specific filesystem dialogs. As a result, users running the application as a Tauri desktop app cannot open folders unless they are also running the dev-host server on localhost.

## Evidence
- `src/components/Sidebar.tsx:21-42` defines `handleOpenFolder`, which first tries `pickFolderFromHost` (fails in desktop mode without dev-host) and then `openFolderFromBrowser`.
- `src/utils/openFolder.ts:46-48` defines `isOpenFolderSupported` as a check for `showDirectoryPicker` in `window`.
- Most Tauri WebViews do not support the `showDirectoryPicker` API (it's a Chrome/Edge feature).
- `src/components/Sidebar.tsx:51-54` defines `pickerSupported` which will be `false` for Tauri users, yet the UI still invites them to click "Open" (`lines 102-106`).
- When a Tauri user clicks "Open", it falls through to `openFolderFromBrowser()` which throws "Folder picker unavailable in this browser" (`src/utils/openFolder.ts:51-54`).
- There is no logic that uses `@tauri-apps/plugin-dialog` or similar desktop-native APIs to select folders.

## Reproduction
1. Launch the application as a Tauri desktop app (without the `dev-host` backend running).
2. Click the "Open" button in the Sidebar.
3. Observe the error message: "Folder picker unavailable in this browser".

## Expected
When running in Tauri mode, clicking "Open" should trigger a native folder selection dialog, and the resulting folder structure should be loaded into the IDE.

## Actual
The folder picker fails because it only supports browser-native or dev-host-specific folder picking.

## Impact
- Tauri users cannot load their local projects into the IDE.
- The "Open Folder" feature is effectively broken for all desktop distribution builds.

## Root Cause
The `handleOpenFolder` logic lacks a branch for Tauri. It ignores the available desktop-native APIs in favor of browser-only APIs.

## Suggested Fix
- Update `handleOpenFolder` in `src/components/Sidebar.tsx` to detect `inTauri()`.
- If `inTauri()` is true, use `@tauri-apps/plugin-dialog` (or a custom Tauri command) to pick a folder.
- Add a new utility function for recursive directory listing in Tauri (as `FileSystemDirectoryHandle` is not available for local paths).
- Ensure `pickerSupported` returns `true` when `inTauri()` is true.

---

# Secondary Bug: Sidebar Terminal button disabled for browser-picked folders

## Severity
Medium

## Summary
The "Terminal" button in the Sidebar is disabled if `rootPath` is not set. However, when a folder is opened via the browser's folder picker, `rootPath` is intentionally set to `null` (since browser JS cannot see the real local path). This prevents browser users from spawning new terminals from the Sidebar, even though the terminal panel itself supports it.

## Evidence
- `src/components/Sidebar.tsx:102`: The button is `disabled={!rootPath}`.
- `src/components/Sidebar.tsx:37`: Browser-picked folders call `loadFolder` with `null` as the third argument.
- `src/components/TerminalPanel.tsx:39-43`: The `+ new` button in the terminal panel is always enabled and does not depend on `rootPath`.

## Root Cause
The button's disabled state is too restrictive. It should depend on having a project loaded (`rootName` or `files` not empty) rather than the physical path on disk.

## Suggested Fix
Change `disabled={!rootPath}` to `disabled={!rootName}` (or similar) in `src/components/Sidebar.tsx`.
