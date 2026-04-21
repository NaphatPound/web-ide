import { useEffect, useMemo, useState } from "react";
import { ancestorPaths, buildFileTree, type FileTreeNode } from "../utils/fileTree";

interface Props {
  files: Record<string, unknown>;
  activePath: string | null;
  onOpen: (path: string) => void;
  onContextMenu?: (node: FileTreeNode, x: number, y: number) => void;
  renamingPath?: string | null;
  onRenameSubmit?: (node: FileTreeNode, newName: string) => void;
  onRenameCancel?: () => void;
  selectedDirPath?: string | null;
  onSelectDir?: (dirPath: string) => void;
  onMove?: (srcPath: string, targetDirPath: string) => void;
}

function fileIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "TS";
  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "JS";
  if (lower.endsWith(".json")) return "{}";
  if (lower.endsWith(".md")) return "M↓";
  if (lower.endsWith(".css") || lower.endsWith(".scss")) return "#";
  if (lower.endsWith(".html")) return "<>";
  if (lower.endsWith(".rs")) return "RS";
  if (lower.endsWith(".py")) return "py";
  if (lower.endsWith(".go")) return "go";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "Y";
  if (lower.endsWith(".toml")) return "T";
  if (lower.endsWith(".sh")) return "$";
  return "•";
}

function iconColor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "text-sky-400";
  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs"))
    return "text-yellow-300";
  if (lower.endsWith(".json")) return "text-amber-300";
  if (lower.endsWith(".md")) return "text-blue-300";
  if (lower.endsWith(".css") || lower.endsWith(".scss")) return "text-pink-300";
  if (lower.endsWith(".html")) return "text-orange-300";
  if (lower.endsWith(".rs")) return "text-orange-400";
  if (lower.endsWith(".py")) return "text-emerald-300";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "text-violet-300";
  return "text-ide-text/60";
}

interface RowProps {
  node: FileTreeNode;
  depth: number;
  activePath: string | null;
  expanded: Set<string>;
  toggle: (path: string) => void;
  onOpen: (path: string) => void;
  onContextMenu?: (node: FileTreeNode, x: number, y: number) => void;
  renamingPath?: string | null;
  onRenameSubmit?: (node: FileTreeNode, newName: string) => void;
  onRenameCancel?: () => void;
  selectedDirPath?: string | null;
  onSelectDir?: (dirPath: string) => void;
  onMove?: (srcPath: string, targetDirPath: string) => void;
  dragOverPath: string | null;
  setDragOverPath: (p: string | null) => void;
}

const DRAG_MIME = "application/x-webide-path";

function parentDirPath(path: string): string | null {
  const idx = path.lastIndexOf("/");
  if (idx <= 0) return null;
  return path.slice(0, idx);
}

function RenameInput({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (v: string) => void;
  onCancel: () => void;
}) {
  return (
    <input
      data-testid="rename-input"
      autoFocus
      defaultValue={initial}
      onFocus={(e) => {
        const dot = initial.lastIndexOf(".");
        if (dot > 0) e.currentTarget.setSelectionRange(0, dot);
        else e.currentTarget.select();
      }}
      onBlur={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onSubmit((e.currentTarget as HTMLInputElement).value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className="flex-1 bg-ide-bg border border-ide-accent rounded px-1 py-0 text-[12px] text-ide-text focus:outline-none"
    />
  );
}

function Row({
  node,
  depth,
  activePath,
  expanded,
  toggle,
  onOpen,
  onContextMenu,
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
  selectedDirPath,
  onSelectDir,
  onMove,
  dragOverPath,
  setDragOverPath,
}: RowProps) {
  const indent = 6 + depth * 12;
  const renaming = renamingPath === node.path;

  const dragProps = onMove
    ? {
        draggable: !renaming,
        onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
          e.dataTransfer.setData(DRAG_MIME, node.path);
          e.dataTransfer.effectAllowed = "move";
        },
      }
    : {};

  if (node.type === "file") {
    const active = activePath === node.path;
    return (
      <div
        {...dragProps}
        onClick={() => {
          if (renaming) return;
          onSelectDir?.(parentDirPath(node.path) ?? node.path);
          onOpen(node.path);
        }}
        onContextMenu={(e) => {
          if (!onContextMenu) return;
          e.preventDefault();
          onContextMenu(node, e.clientX, e.clientY);
        }}
        title={node.path}
        className={`group w-full text-left flex items-center gap-1.5 pr-2 py-[3px] text-[13px] leading-snug transition-colors cursor-pointer ${
          active
            ? "bg-ide-accent/25 text-white"
            : "text-ide-text/85 hover:bg-white/5"
        }`}
        style={{ paddingLeft: `${indent}px` }}
      >
        <span className="w-3 inline-block" />
        <span
          className={`text-[10px] font-mono font-semibold w-4 text-center ${iconColor(node.name)}`}
          aria-hidden
        >
          {fileIcon(node.name)}
        </span>
        {renaming && onRenameSubmit && onRenameCancel ? (
          <RenameInput
            initial={node.name}
            onSubmit={(v) => onRenameSubmit(node, v)}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className="truncate">{node.name}</span>
        )}
      </div>
    );
  }
  const isOpen = expanded.has(node.path);
  const isSelectedDir = selectedDirPath === node.path;
  const isDragOver = dragOverPath === node.path;

  const dropProps = onMove
    ? {
        onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dragOverPath !== node.path) setDragOverPath(node.path);
        },
        onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
          if (
            !e.currentTarget.contains(e.relatedTarget as Node | null) &&
            dragOverPath === node.path
          ) {
            setDragOverPath(null);
          }
        },
        onDrop: (e: React.DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          const src = e.dataTransfer.getData(DRAG_MIME);
          setDragOverPath(null);
          if (src) onMove(src, node.path);
        },
      }
    : {};

  return (
    <>
      <div
        {...dragProps}
        {...dropProps}
        onClick={() => {
          if (renaming) return;
          onSelectDir?.(node.path);
          toggle(node.path);
        }}
        onContextMenu={(e) => {
          if (!onContextMenu) return;
          e.preventDefault();
          onContextMenu(node, e.clientX, e.clientY);
        }}
        title={node.path}
        data-testid={`tree-folder-${node.path}`}
        className={`w-full text-left flex items-center gap-1.5 pr-2 py-[3px] text-[13px] leading-snug text-ide-text cursor-pointer transition-colors ${
          isDragOver
            ? "bg-ide-accent/40 ring-1 ring-ide-accent"
            : isSelectedDir
              ? "bg-white/10"
              : "hover:bg-white/5"
        }`}
        style={{ paddingLeft: `${indent}px` }}
      >
        <span
          aria-hidden
          className="text-[10px] w-3 inline-block text-ide-text/70 transition-transform"
          style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          ▶
        </span>
        <span className="text-[11px] w-4 text-center text-amber-300/90" aria-hidden>
          {isOpen ? "▾" : "▸"}
        </span>
        {renaming && onRenameSubmit && onRenameCancel ? (
          <RenameInput
            initial={node.name}
            onSubmit={(v) => onRenameSubmit(node, v)}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className="truncate font-medium">{node.name}</span>
        )}
      </div>
      {isOpen &&
        node.children.map((c) => (
          <Row
            key={c.path}
            node={c}
            depth={depth + 1}
            activePath={activePath}
            expanded={expanded}
            toggle={toggle}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
            renamingPath={renamingPath}
            onRenameSubmit={onRenameSubmit}
            onRenameCancel={onRenameCancel}
            selectedDirPath={selectedDirPath}
            onSelectDir={onSelectDir}
            onMove={onMove}
            dragOverPath={dragOverPath}
            setDragOverPath={setDragOverPath}
          />
        ))}
    </>
  );
}

export default function FileTree({
  files,
  activePath,
  onOpen,
  onContextMenu,
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
  selectedDirPath,
  onSelectDir,
  onMove,
}: Props) {
  const paths = useMemo(() => Object.keys(files), [files]);
  const tree = useMemo(() => buildFileTree(paths), [paths]);

  const defaultExpanded = useMemo(() => {
    const set = new Set<string>();
    // expand the single top-level root folder if the tree has one
    if (tree.length === 1 && tree[0].type === "dir") set.add(tree[0].path);
    if (activePath) ancestorPaths(activePath).forEach((p) => set.add(p));
    return set;
  }, [tree, activePath]);

  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (tree.length === 1 && tree[0].type === "dir") next.add(tree[0].path);
      if (activePath) ancestorPaths(activePath).forEach((p) => next.add(p));
      return next;
    });
  }, [tree, activePath]);

  const toggle = (p: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  if (tree.length === 0) {
    return (
      <div className="text-[11px] text-ide-text/50 px-2 py-1 italic">
        No files. Use "Open Folder" to load a workspace.
      </div>
    );
  }

  return (
    <div data-testid="file-tree" className="flex flex-col">
      {tree.map((n) => (
        <Row
          key={n.path}
          node={n}
          depth={0}
          activePath={activePath}
          expanded={expanded}
          toggle={toggle}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
          renamingPath={renamingPath}
          onRenameSubmit={onRenameSubmit}
          onRenameCancel={onRenameCancel}
          selectedDirPath={selectedDirPath}
          onSelectDir={onSelectDir}
          onMove={onMove}
          dragOverPath={dragOverPath}
          setDragOverPath={setDragOverPath}
        />
      ))}
    </div>
  );
}
