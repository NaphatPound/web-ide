import { useEffect, useRef, useState } from "react";
import { useIdeStore } from "../store/useIdeStore";
import {
  isOpenFolderSupported,
  languageFor,
  openFolderFromBrowser,
  openFolderFromTauri,
} from "../utils/openFolder";
import {
  createFolderOnHost,
  deletePathOnHost,
  pickFolderFromHost,
  renamePathOnHost,
  writeFileToHost,
} from "../utils/devHostApi";
import { inTauri } from "../utils/tauriEnv";
import FileTree from "./FileTree";
import ContextMenu from "./ContextMenu";
import type { FileTreeNode } from "../utils/fileTree";

type CreateMode = "file" | "folder";

function normalizeCreatePath(raw: string): string | null {
  const trimmed = raw.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!trimmed) return null;
  const parts = trimmed.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return null;
  return parts.join("/");
}

function validName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (trimmed === "." || trimmed === "..") return false;
  if (trimmed.includes("/")) return false;
  return true;
}

function storeToRel(storePath: string, rootName: string): string {
  if (storePath === rootName) return "";
  if (storePath.startsWith(rootName + "/")) return storePath.slice(rootName.length + 1);
  return storePath;
}

function parentStorePath(storePath: string): string | null {
  const idx = storePath.lastIndexOf("/");
  if (idx === -1) return null;
  return storePath.slice(0, idx);
}

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
    addFile,
    renamePath,
    removePath,
    mode,
  } = useIdeStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode | null>(null);
  const [createValue, setCreateValue] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const createInputRef = useRef<HTMLInputElement | null>(null);

  const [menu, setMenu] = useState<{
    node: FileTreeNode;
    x: number;
    y: number;
  } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    node: FileTreeNode;
  } | null>(null);
  const [fsBusy, setFsBusy] = useState(false);

  useEffect(() => {
    if (createMode) {
      createInputRef.current?.focus();
      createInputRef.current?.select();
    }
  }, [createMode]);

  if (mode === "vim") return null;

  const beginCreate = (m: CreateMode): void => {
    if (!rootPath) {
      setError("Open a folder first.");
      return;
    }
    setError(null);
    setCreateError(null);
    setCreateValue(m === "file" ? "newfile.ts" : "newfolder");
    setCreateMode(m);
  };

  const cancelCreate = (): void => {
    setCreateMode(null);
    setCreateValue("");
    setCreateError(null);
  };

  const openContextMenu = (node: FileTreeNode, x: number, y: number): void => {
    if (!rootName || node.path === rootName) return;
    setMenu({ node, x, y });
  };

  const closeContextMenu = (): void => setMenu(null);

  const beginRename = (node: FileTreeNode): void => {
    setRenamingPath(node.path);
    setError(null);
  };

  const cancelRename = (): void => setRenamingPath(null);

  const submitRename = async (node: FileTreeNode, newName: string): Promise<void> => {
    setRenamingPath(null);
    if (!rootName || !rootPath) return;
    const trimmed = newName.trim();
    if (!trimmed || !validName(trimmed) || trimmed === node.name) return;
    const parent = parentStorePath(node.path);
    const newStorePath = parent ? `${parent}/${trimmed}` : trimmed;
    if (files[newStorePath]) {
      setError(`"${trimmed}" already exists.`);
      return;
    }
    const fromRel = storeToRel(node.path, rootName);
    const toRel = storeToRel(newStorePath, rootName);
    if (!fromRel || !toRel) return;
    setFsBusy(true);
    try {
      await renamePathOnHost(rootPath, fromRel, toRel);
      renamePath(node.path, newStorePath);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFsBusy(false);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDelete || !rootName || !rootPath) return;
    const { node } = pendingDelete;
    const rel = storeToRel(node.path, rootName);
    if (!rel) {
      setPendingDelete(null);
      return;
    }
    setFsBusy(true);
    try {
      await deletePathOnHost(rootPath, rel);
      removePath(node.path);
      setPendingDelete(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFsBusy(false);
    }
  };

  const submitCreate = async (): Promise<void> => {
    if (!createMode || !rootPath || !rootName || creating) return;
    const rel = normalizeCreatePath(createValue);
    if (!rel) {
      setCreateError("Invalid path.");
      return;
    }
    const storeFilePath =
      createMode === "file" ? `${rootName}/${rel}` : `${rootName}/${rel}/.gitkeep`;
    if (files[storeFilePath]) {
      setCreateError("Path already exists.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      if (createMode === "file") {
        await writeFileToHost(rootPath, rel, "");
        addFile({
          path: storeFilePath,
          language: languageFor(rel),
          content: "",
        });
        openFile(storeFilePath);
      } else {
        await createFolderOnHost(rootPath, rel);
        await writeFileToHost(rootPath, `${rel}/.gitkeep`, "");
        addFile({
          path: storeFilePath,
          language: "plaintext",
          content: "",
        });
      }
      cancelCreate();
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

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
            data-testid="new-file"
            onClick={() => beginCreate("file")}
            disabled={!rootPath}
            title={rootPath ? "New file in workspace" : "Open a folder first"}
            className="text-[11px] px-2 py-0.5 rounded border border-ide-border hover:bg-white/5 disabled:opacity-40"
          >
            +File
          </button>
          <button
            data-testid="new-folder"
            onClick={() => beginCreate("folder")}
            disabled={!rootPath}
            title={rootPath ? "New folder in workspace" : "Open a folder first"}
            className="text-[11px] px-2 py-0.5 rounded border border-ide-border hover:bg-white/5 disabled:opacity-40"
          >
            +Folder
          </button>
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

      {createMode && (
        <div
          data-testid="create-input-row"
          className="px-2 py-1 border-y border-ide-border bg-black/20"
        >
          <label className="text-[10px] text-ide-text/60 uppercase tracking-wider">
            New {createMode}
          </label>
          <input
            ref={createInputRef}
            data-testid="create-input"
            value={createValue}
            onChange={(e) => {
              setCreateValue(e.target.value);
              setCreateError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitCreate();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelCreate();
              }
            }}
            disabled={creating}
            placeholder={
              createMode === "file" ? "src/hooks/useFoo.ts" : "docs/guides"
            }
            className="w-full mt-0.5 bg-ide-bg border border-ide-border rounded px-1.5 py-0.5 text-[12px] text-ide-text focus:outline-none focus:border-ide-accent disabled:opacity-50"
          />
          {createError && (
            <div
              role="alert"
              data-testid="create-error"
              className="text-[11px] text-red-400 mt-1"
            >
              {createError}
            </div>
          )}
        </div>
      )}

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

      {pendingDelete && (
        <div
          data-testid="delete-confirm"
          className="px-2 py-1 border-y border-ide-border bg-red-900/20 flex items-center gap-2"
        >
          <span className="text-[11px] text-ide-text/80 truncate flex-1" title={pendingDelete.node.path}>
            Delete {pendingDelete.node.type === "dir" ? "folder" : "file"} "{pendingDelete.node.name}"?
          </span>
          <button
            data-testid="delete-confirm-yes"
            onClick={() => void confirmDelete()}
            disabled={fsBusy}
            className="text-[11px] px-2 py-0.5 rounded border border-red-700 bg-red-700/40 hover:bg-red-700/60 disabled:opacity-40"
          >
            Delete
          </button>
          <button
            data-testid="delete-confirm-no"
            onClick={() => setPendingDelete(null)}
            disabled={fsBusy}
            className="text-[11px] px-2 py-0.5 rounded border border-ide-border hover:bg-white/5 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        <FileTree
          files={files}
          activePath={activeFile}
          onOpen={openFile}
          onContextMenu={openContextMenu}
          renamingPath={renamingPath}
          onRenameSubmit={(node, v) => void submitRename(node, v)}
          onRenameCancel={cancelRename}
        />
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={closeContextMenu}
          items={[
            {
              label: "Rename",
              onSelect: () => beginRename(menu.node),
            },
            {
              label: "Delete",
              danger: true,
              onSelect: () => setPendingDelete({ node: menu.node }),
            },
          ]}
        />
      )}
    </aside>
  );
}
