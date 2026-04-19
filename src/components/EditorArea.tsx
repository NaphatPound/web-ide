import { useEffect, useRef, useState } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { initVimMode, type VimMode } from "monaco-vim";
import { useIdeStore } from "../store/useIdeStore";
import EditorTabs from "./EditorTabs";
import { writeFileToHost } from "../utils/devHostApi";

export default function EditorArea() {
  const { files, activeFile, updateFile, mode, markFileSaved, closeFile, rootName } =
    useIdeStore();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const vimRef = useRef<VimMode | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const file = activeFile ? files[activeFile] : undefined;

  useEffect(() => {
    if (!editorReady || !editorRef.current) return;
    if (mode === "vim" && !vimRef.current && statusRef.current) {
      vimRef.current = initVimMode(editorRef.current, statusRef.current);
    } else if (mode !== "vim" && vimRef.current) {
      vimRef.current.dispose();
      vimRef.current = null;
    }
  }, [mode, editorReady]);

  useEffect(() => {
    return () => {
      if (vimRef.current) {
        vimRef.current.dispose();
        vimRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        const active = useIdeStore.getState().activeFile;
        const entry = active ? useIdeStore.getState().files[active] : null;
        if (!active || !entry) return;
        setSaveError(null);
        const root = useIdeStore.getState().rootName;
        const path = useIdeStore.getState().rootPath;
        if (path && root) {
          const relPath = active.startsWith(root + "/")
            ? active.slice(root.length + 1)
            : active;
          try {
            await writeFileToHost(path, relPath, entry.content);
          } catch (err) {
            setSaveError((err as Error).message);
            return;
          }
        }
        markFileSaved(active);
      } else if (key === "w") {
        const active = useIdeStore.getState().activeFile;
        if (active) {
          e.preventDefault();
          closeFile(active);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [markFileSaved, closeFile]);

  return (
    <section
      data-testid="editor-area"
      className="bg-ide-bg flex flex-col min-h-0"
    >
      <EditorTabs />
      {saveError && (
        <div role="alert" className="text-[11px] text-red-400 px-3 py-1 bg-red-950/30 border-b border-red-900/50">
          Save failed: {saveError}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          theme="vs-dark"
          path={activeFile ?? "untitled"}
          defaultLanguage={file?.language ?? "plaintext"}
          value={file?.content ?? "// Open a file from the sidebar"}
          onChange={(v) => activeFile && updateFile(activeFile, v ?? "")}
          onMount={(editor) => {
            editorRef.current = editor;
            setEditorReady(true);
          }}
        />
      </div>
      <div
        data-testid="editor-status"
        className="px-2 py-1 text-[11px] bg-ide-panel border-t border-ide-border font-mono text-ide-text/70 flex items-center gap-3 min-h-[22px]"
      >
        <span>{activeFile ?? "no file"}</span>
        {file?.dirty && <span className="text-amber-300">● unsaved</span>}
        {rootName && <span className="ml-auto text-ide-text/50 truncate">{rootName}</span>}
        <div ref={statusRef} data-testid="vim-status" className="min-w-[40px]" />
      </div>
    </section>
  );
}
