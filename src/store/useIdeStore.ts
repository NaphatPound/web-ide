import { create } from "zustand";
import { AI_STARTUP_TERMINALS } from "../utils/aiStartup";

export type Mode = "vs_code" | "vim";
export type TerminalLayout = "tabs" | "split";

export interface FileEntry {
  path: string;
  language: string;
  content: string;
}

export interface TerminalEntry {
  id: string;
  title: string;
  initialCmd?: string;
  initialTty?: boolean;
  initialAutoEnter?: { count: number; intervalMs: number };
}

interface IdeState {
  mode: Mode;
  files: Record<string, FileEntry>;
  activeFile: string | null;
  rootName: string | null;
  rootPath: string | null;
  terminals: TerminalEntry[];
  preferredLayout: TerminalLayout;
  layoutVersion: number;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
  addFile: (file: FileEntry) => void;
  openFile: (path: string) => void;
  updateFile: (path: string, content: string) => void;
  loadFolder: (
    rootName: string,
    files: Record<string, FileEntry>,
    rootPath?: string | null
  ) => void;
  addTerminal: (title: string, initialCmd?: string) => string;
  removeTerminal: (id: string) => void;
  startAiTerminals: () => void;
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
  rootName: null,
  rootPath: null,
  terminals: [{ id: "t1", title: "Term 1" }],
  preferredLayout: "tabs",
  layoutVersion: 0,

  setMode: (mode) => set({ mode }),
  toggleMode: () =>
    set((s) => ({ mode: s.mode === "vs_code" ? "vim" : "vs_code" })),

  addFile: (file) =>
    set((s) => ({ files: { ...s.files, [file.path]: file } })),

  openFile: (path) => {
    if (!get().files[path]) return;
    set({ activeFile: path });
  },

  updateFile: (path, content) =>
    set((s) => {
      const existing = s.files[path];
      if (!existing) return s;
      return {
        files: { ...s.files, [path]: { ...existing, content } },
      };
    }),

  loadFolder: (rootName, files, rootPath = null) => {
    const first = Object.keys(files)[0] ?? null;
    set({ rootName, rootPath, files, activeFile: first });
  },

  addTerminal: (title, initialCmd) => {
    const id = `t${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ terminals: [...s.terminals, { id, title, initialCmd }] }));
    return id;
  },

  removeTerminal: (id) =>
    set((s) => ({ terminals: s.terminals.filter((t) => t.id !== id) })),

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
      preferredLayout: "split",
      layoutVersion: s.layoutVersion + 1,
    }));
  },
}));
