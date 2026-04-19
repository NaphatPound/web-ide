import { useState } from "react";
import { useIdeStore } from "../store/useIdeStore";
import { isOpenFolderSupported, openFolderFromBrowser } from "../utils/openFolder";
import { pickFolderFromHost } from "../utils/devHostApi";

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
          loadFolder(result.rootName, result.files, null);
          loaded = true;
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
    typeof window !== "undefined" &&
    ("showDirectoryPicker" in window || isOpenFolderSupported());

  return (
    <aside
      data-testid="sidebar"
      className="bg-ide-panel border-r border-ide-border p-2 overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wide text-ide-text/60">
          Explorer
        </div>
        <div className="flex gap-1">
          <button
            data-testid="open-folder"
            onClick={handleOpenFolder}
            disabled={busy}
            title="Open a folder from this computer"
            className="text-xs px-2 py-0.5 rounded border border-ide-border hover:bg-white/5 disabled:opacity-40"
          >
            {busy ? "Opening…" : "Open Folder"}
          </button>
          <button
            data-testid="open-terminal-here"
            onClick={handleOpenTerminal}
            disabled={!rootPath}
            title={
              rootPath
                ? `Open terminal in ${rootPath}`
                : "Open a folder first to spawn a terminal here"
            }
            className="text-xs px-2 py-0.5 rounded border border-ide-border hover:bg-white/5 disabled:opacity-40"
          >
            Terminal
          </button>
        </div>
      </div>
      {rootName && (
        <div className="text-xs text-ide-text/70 mb-1 truncate" title={rootPath ?? rootName}>
          📁 {rootName}
        </div>
      )}
      {rootPath && (
        <div className="text-[10px] text-ide-text/40 mb-2 truncate" title={rootPath}>
          {rootPath}
        </div>
      )}
      {!pickerSupported && !rootPath && (
        <div className="text-[11px] text-ide-text/50 mb-2">
          Use "Open Folder" to pick a directory from this computer.
        </div>
      )}
      {error && (
        <div role="alert" className="text-xs text-red-400 mb-2 whitespace-pre-wrap">
          {error}
        </div>
      )}
      <ul className="text-sm">
        {Object.keys(files).map((path) => (
          <li key={path}>
            <button
              onClick={() => openFile(path)}
              className={`w-full text-left px-2 py-1 rounded hover:bg-white/5 ${
                activeFile === path ? "bg-white/10" : ""
              }`}
            >
              {path}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
