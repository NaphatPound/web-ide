import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "../store/useIdeStore";
import { inTauri } from "./tauriEnv";

const MAX_FILES = 200;
const MAX_FILE_BYTES = 512 * 1024;
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "target",
  ".turbo",
  ".cache",
]);

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  md: "markdown",
  css: "css",
  scss: "scss",
  html: "html",
  rs: "rust",
  py: "python",
  go: "go",
  java: "java",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sh: "shell",
  sql: "sql",
};

function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXT[ext] ?? "plaintext";
}

function isTextLikely(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext in LANGUAGE_BY_EXT || ext === "txt" || ext === "gitignore" || !name.includes(".");
}

export interface OpenedFolder {
  rootName: string;
  files: Record<string, FileEntry>;
  rootPath?: string | null;
}

interface TauriLoadedFolder {
  rootName: string;
  rootPath: string;
  files: Record<string, FileEntry>;
}

export function isTauriFolderPickerAvailable(): boolean {
  return inTauri();
}

export async function openFolderFromTauri(): Promise<OpenedFolder | null> {
  const result = await invoke<TauriLoadedFolder | null>("pick_and_load_folder");
  if (!result) return null;
  return {
    rootName: result.rootName,
    rootPath: result.rootPath,
    files: result.files,
  };
}

export function isOpenFolderSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function openFolderFromBrowser(): Promise<OpenedFolder | null> {
  if (!isOpenFolderSupported()) {
    throw new Error(
      "Folder picker unavailable in this browser. Use Chrome, Edge, or Opera."
    );
  }
  const picker = (
    window as unknown as {
      showDirectoryPicker: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await picker({ mode: "read" });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") return null;
    throw err;
  }
  const files: Record<string, FileEntry> = {};
  await walkDirectory(handle, handle.name, files);
  return { rootName: handle.name, files };
}

async function walkDirectory(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: Record<string, FileEntry>
): Promise<void> {
  const entries = (dir as unknown as {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  }).entries();
  for await (const [name, entry] of entries) {
    if (Object.keys(out).length >= MAX_FILES) return;
    const path = `${prefix}/${name}`;
    if (entry.kind === "directory") {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      await walkDirectory(entry as FileSystemDirectoryHandle, path, out);
      continue;
    }
    if (!isTextLikely(name)) continue;
    const file = await (entry as FileSystemFileHandle).getFile();
    if (file.size > MAX_FILE_BYTES) continue;
    const content = await file.text();
    out[path] = { path, language: languageFor(path), content };
  }
}
