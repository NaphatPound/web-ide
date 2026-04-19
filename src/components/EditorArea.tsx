import { useEffect, useRef, useState } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { initVimMode, type VimMode } from "monaco-vim";
import { useIdeStore } from "../store/useIdeStore";

export default function EditorArea() {
  const { files, activeFile, updateFile, mode } = useIdeStore();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const vimRef = useRef<VimMode | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const [editorReady, setEditorReady] = useState(false);

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

  return (
    <section
      data-testid="editor-area"
      className="bg-ide-bg flex flex-col min-h-0"
    >
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
      <div
        ref={statusRef}
        data-testid="vim-status"
        className="px-2 py-1 text-xs bg-ide-panel border-t border-ide-border font-mono"
      />
    </section>
  );
}
