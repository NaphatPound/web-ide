import { useState } from "react";
import { useIdeStore } from "../store/useIdeStore";
import {
  isOpenFolderSupported,
  openFolderFromBrowser,
  openFolderFromTauri,
} from "../utils/openFolder";
import { pickFolderFromHost } from "../utils/devHostApi";
import { inTauri } from "../utils/tauriEnv";
import FileTree from "./FileTree";

export default function Sidebar() {
  const {
    files,
    activeFile,
    openFile,
    loadFolder,
    rootName,
    rootPath,
    addTerminal,
    startAiTerminals,
    mode,
  } = useIdeStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (mode === "vim") return null;

  const handleOpenFolder = async () => {
    setError(null);
    setBusy(true);
    try {
      let loaded = false;

      if (inTauri()) {
        try {
          const viaTauri = await openFolderFromTauri();
          if (viaTauri) {
            loadFolder(viaTauri.rootName, viaTauri.files, viaTauri.rootPath ?? null);
            loaded = true;
          }
        } catch (tauriErr) {
          console.warn("tauri folder picker failed", tauriErr);
          setError((tauriErr as Error).message);
        }
      }

      if (!loaded && !inTauri()) {
        try {
          const viaHost = await pickFolderFromHost();
          if (viaHost) {
            loadFolder(viaHost.rootName, viaHost.files, viaHost.rootPath);
            loaded = true;
          }
        } catch (hostErr) {
          console.warn("host folder picker failed, falling back", hostErr);
        }
        if (!loaded) {
          const result = await openFolderFromBrowser();
          if (result) {
            loadFolder(result.rootName, result.files, result.rootPath ?? null);
            loaded = true;
          }
        }
      }

      if (loaded) {
        startAiTerminals();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenTerminal = () => {
    const title = rootName ? `${rootName}` : `Term ${useIdeStore.getState().terminals.length + 1}`;
    addTerminal(title);
  };

  const pickerSupported =
    inTauri() ||
    (typeof window !== "undefined" &&
      ("showDirectoryPicker" in window || isOpenFolderSupported()));

  return (
    <aside
      data-testid="sidebar"
      className="bg-ide-panel border-r border-ide-border overflow-y-auto flex flex-col"
    >
      <div className="flex items-center justify-between px-2 pt-2 pb-1">
        <div className="text-[11px] uppercase tracking-wider text-ide-text/60 font-semibold">
          Explorer
        </div>
        <div className="flex gap-1">
          <button
            data-testid="open-folder"
            onClick={handleOpenFolder}
            disabled={busy}
            title="Open a folder from this computer"
            className="text-[11px] px-2 py-0.5 rounded border border-ide-border hover:bg-white/5 disabled:opacity-40"
          >
            {busy ? "Opening…" : "Open"}
          </button>
          <button
            data-testid="open-terminal-here"
            onClick={handleOpenTerminal}
            disabled={!rootName}
            title={
              rootPath
                ? `Open terminal in ${rootPath}`
                : rootName
                  ? "Open a new terminal"
                  : "Open a folder first to spawn a terminal here"
            }
            className="text-[11px] px-2 py-0.5 rounded border border-ide-border hover:bg-white/5 disabled:opacity-40"
          >
            Terminal
          </button>
        </div>
      </div>

      {rootName && (
        <div className="px-2 py-1 border-y border-ide-border bg-black/20">
          <div
            className="text-[11px] font-semibold uppercase tracking-wider text-ide-text/80 truncate"
            title={rootPath ?? rootName}
          >
            {rootName}
          </div>
          {rootPath && (
            <div className="text-[10px] text-ide-text/40 truncate" title={rootPath}>
              {rootPath}
            </div>
          )}
        </div>
      )}

      {!pickerSupported && !rootPath && (
        <div className="text-[11px] text-ide-text/50 px-2 py-1 italic">
          Click "Open" to pick a folder from this computer.
        </div>
      )}

      {error && (
        <div role="alert" className="text-xs text-red-400 px-2 py-1 whitespace-pre-wrap">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        <FileTree files={files} activePath={activeFile} onOpen={openFile} />
      </div>
    </aside>
  );
}
