import { create } from "zustand";
import { AI_STARTUP_TERMINALS } from "../utils/aiStartup";

export type Mode = "vs_code" | "vim";
export type TerminalLayout = "tabs" | "split";

export interface FileEntry {
  path: string;
  language: string;
  content: string;
  dirty?: boolean;
}

export interface TerminalEntry {
  id: string;
  title: string;
  initialCmd?: string;
  initialTty?: boolean;
  initialAutoEnter?: { count: number; intervalMs: number };
}

export type ShortcutType = "command" | "text" | "template";

export interface ShortcutEntry {
  id: string;
  name: string;
  command: string;
  type: ShortcutType;
}

const SHORTCUTS_STORAGE_KEY = "web-ide:shortcuts";

const DEFAULT_SHORTCUTS: ShortcutEntry[] = [
  { id: "s-ls", name: "ls", command: "ls -la", type: "command" },
  { id: "s-git-status", name: "git status", command: "git status", type: "command" },
  { id: "s-clear", name: "clear", command: "clear", type: "command" },
];

function coerceType(raw: unknown): ShortcutType {
  return raw === "text" || raw === "template" ? raw : "command";
}

function loadShortcuts(): ShortcutEntry[] {
  if (typeof window === "undefined") return DEFAULT_SHORTCUTS.map((s) => ({ ...s }));
  try {
    const raw = window.localStorage?.getItem(SHORTCUTS_STORAGE_KEY);
    if (!raw) return DEFAULT_SHORTCUTS.map((s) => ({ ...s }));
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_SHORTCUTS.map((s) => ({ ...s }));
    return parsed
      .filter(
        (s): s is { id: string; name: string; command: string; type?: unknown } =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as { id?: unknown }).id === "string" &&
          typeof (s as { name?: unknown }).name === "string" &&
          typeof (s as { command?: unknown }).command === "string"
      )
      .map((s) => ({
        id: s.id,
        name: s.name,
        command: s.command,
        type: coerceType(s.type),
      }));
  } catch {
    return DEFAULT_SHORTCUTS.map((s) => ({ ...s }));
  }
}

function saveShortcuts(shortcuts: ShortcutEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(
      SHORTCUTS_STORAGE_KEY,
      JSON.stringify(shortcuts)
    );
  } catch {
    // ignore storage errors (private mode / quota)
  }
}

function newShortcutId(): string {
  try {
    const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
    if (g.crypto?.randomUUID) return `s-${g.crypto.randomUUID()}`;
  } catch {
    // fall through
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface IdeState {
  mode: Mode;
  files: Record<string, FileEntry>;
  activeFile: string | null;
  openFiles: string[];
  rootName: string | null;
  rootPath: string | null;
  terminals: TerminalEntry[];
  activeTerminalId: string | null;
  preferredLayout: TerminalLayout;
  layoutVersion: number;
  shortcuts: ShortcutEntry[];
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
  addFile: (file: FileEntry) => void;
  openFile: (path: string) => void;
  closeFile: (path: string) => void;
  updateFile: (path: string, content: string) => void;
  markFileSaved: (path: string) => void;
  loadFolder: (
    rootName: string,
    files: Record<string, FileEntry>,
    rootPath?: string | null
  ) => void;
  addTerminal: (title: string, initialCmd?: string) => string;
  removeTerminal: (id: string) => void;
  setActiveTerminalId: (id: string | null) => void;
  startAiTerminals: () => void;
  addShortcut: (name: string, command: string, type?: ShortcutType) => string;
  updateShortcut: (
    id: string,
    updates: Partial<Omit<ShortcutEntry, "id">>
  ) => void;
  removeShortcut: (id: string) => void;
}

const seedFiles: Record<string, FileEntry> = {
  "src/index.tsx": {
    path: "src/index.tsx",
    language: "typescript",
    content:
      "// Welcome to the Web AI IDE\n" +
      "// Press Cmd/Ctrl+Alt+V to toggle Vim/Zen mode.\n",
  },
  "README.md": {
    path: "README.md",
    language: "markdown",
    content: "# Welcome\n\nA Hybrid AI-powered IDE.\n",
  },
};

export const useIdeStore = create<IdeState>((set, get) => ({
  mode: "vs_code",
  files: seedFiles,
  activeFile: "src/index.tsx",
  openFiles: ["src/index.tsx"],
  rootName: null,
  rootPath: null,
  terminals: [{ id: "t1", title: "Term 1" }],
  activeTerminalId: "t1",
  preferredLayout: "tabs",
  layoutVersion: 0,
  shortcuts: loadShortcuts(),

  setMode: (mode) => set({ mode }),
  toggleMode: () =>
    set((s) => ({ mode: s.mode === "vs_code" ? "vim" : "vs_code" })),

  addFile: (file) =>
    set((s) => ({ files: { ...s.files, [file.path]: file } })),

  openFile: (path) => {
    if (!get().files[path]) return;
    set((s) => ({
      activeFile: path,
      openFiles: s.openFiles.includes(path) ? s.openFiles : [...s.openFiles, path],
    }));
  },

  closeFile: (path) =>
    set((s) => {
      const idx = s.openFiles.indexOf(path);
      if (idx === -1) return s;
      const openFiles = s.openFiles.filter((p) => p !== path);
      let activeFile = s.activeFile;
      if (activeFile === path) {
        activeFile = openFiles[Math.min(idx, openFiles.length - 1)] ?? null;
      }
      return { openFiles, activeFile };
    }),

  updateFile: (path, content) =>
    set((s) => {
      const existing = s.files[path];
      if (!existing) return s;
      if (existing.content === content && !!existing.dirty === false) return s;
      return {
        files: { ...s.files, [path]: { ...existing, content, dirty: true } },
      };
    }),

  markFileSaved: (path) =>
    set((s) => {
      const existing = s.files[path];
      if (!existing || !existing.dirty) return s;
      return {
        files: { ...s.files, [path]: { ...existing, dirty: false } },
      };
    }),

  loadFolder: (rootName, files, rootPath = null) => {
    const first = Object.keys(files)[0] ?? null;
    set({
      rootName,
      rootPath,
      files,
      activeFile: first,
      openFiles: first ? [first] : [],
    });
  },

  addTerminal: (title, initialCmd) => {
    const id = `t${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({
      terminals: [...s.terminals, { id, title, initialCmd }],
      activeTerminalId: id,
    }));
    return id;
  },

  removeTerminal: (id) =>
    set((s) => {
      const terminals = s.terminals.filter((t) => t.id !== id);
      const activeTerminalId =
        s.activeTerminalId === id
          ? (terminals[0]?.id ?? null)
          : s.activeTerminalId;
      return { terminals, activeTerminalId };
    }),

  setActiveTerminalId: (id) => set({ activeTerminalId: id }),

  startAiTerminals: () => {
    const now = Date.now();
    const terminals: TerminalEntry[] = AI_STARTUP_TERMINALS.map((spec, i) => ({
      id: `ai-${now}-${i}`,
      title: spec.title,
      initialCmd: spec.cmd,
      initialTty: spec.tty,
      initialAutoEnter: spec.autoEnter,
    }));
    set((s) => ({
      terminals,
      activeTerminalId: terminals[0]?.id ?? null,
      preferredLayout: "split",
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  addShortcut: (name, command, type = "command") => {
    const id = newShortcutId();
    set((s) => {
      const shortcuts = [...s.shortcuts, { id, name, command, type }];
      saveShortcuts(shortcuts);
      return { shortcuts };
    });
    return id;
  },

  updateShortcut: (id, updates) =>
    set((s) => {
      const shortcuts = s.shortcuts.map((sc) =>
        sc.id === id ? { ...sc, ...updates } : sc
      );
      saveShortcuts(shortcuts);
      return { shortcuts };
    }),

  removeShortcut: (id) =>
    set((s) => {
      const shortcuts = s.shortcuts.filter((sc) => sc.id !== id);
      saveShortcuts(shortcuts);
      return { shortcuts };
    }),
}));
