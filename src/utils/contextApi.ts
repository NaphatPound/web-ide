import type { FileEntry } from "../store/useIdeStore";

const EXCERPT_LINES = 40;

export interface IdeContextSnapshot {
  activeFile: string | null;
  openFiles: string[];
  language: string | null;
  excerpt: string;
  fileCount: number;
}

interface StateLike {
  files: Record<string, FileEntry>;
  activeFile: string | null;
}

export function snapshotContext(state: StateLike): IdeContextSnapshot {
  const active = state.activeFile ? state.files[state.activeFile] : null;
  const excerpt = active
    ? active.content.split("\n").slice(0, EXCERPT_LINES).join("\n")
    : "";
  return {
    activeFile: state.activeFile,
    openFiles: Object.keys(state.files),
    language: active?.language ?? null,
    excerpt,
    fileCount: Object.keys(state.files).length,
  };
}

export function buildContextPrompt(state: StateLike): string {
  const ctx = snapshotContext(state);
  const lines = [
    "[ide-context]",
    `active_file: ${ctx.activeFile ?? "<none>"}`,
    `language:    ${ctx.language ?? "<none>"}`,
    `file_count:  ${ctx.fileCount}`,
    `open_files:  ${ctx.openFiles.join(", ") || "<none>"}`,
  ];
  if (ctx.excerpt) {
    lines.push(`--- ${ctx.activeFile} (first ${EXCERPT_LINES} lines) ---`);
    lines.push(ctx.excerpt);
  }
  return lines.join("\n");
}
