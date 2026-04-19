import { useMemo, useRef } from "react";
import { useIdeStore } from "../store/useIdeStore";

function basename(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(idx + 1) : p;
}

export default function EditorTabs() {
  const openFiles = useIdeStore((s) => s.openFiles);
  const activeFile = useIdeStore((s) => s.activeFile);
  const files = useIdeStore((s) => s.files);
  const openFile = useIdeStore((s) => s.openFile);
  const closeFile = useIdeStore((s) => s.closeFile);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const labels = useMemo(() => {
    const byBase = new Map<string, number>();
    for (const p of openFiles) {
      const b = basename(p);
      byBase.set(b, (byBase.get(b) ?? 0) + 1);
    }
    return openFiles.map((p) => {
      const b = basename(p);
      if ((byBase.get(b) ?? 0) > 1) {
        const parent = p.split("/").slice(-2, -1)[0] ?? "";
        return parent ? `${b} — ${parent}` : b;
      }
      return b;
    });
  }, [openFiles]);

  if (openFiles.length === 0) {
    return (
      <div
        data-testid="editor-tabs-empty"
        className="h-[30px] bg-ide-panel border-b border-ide-border flex items-center px-3 text-[11px] text-ide-text/40"
      >
        No file open
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      data-testid="editor-tabs"
      className="h-[30px] bg-ide-panel border-b border-ide-border flex items-end overflow-x-auto overflow-y-hidden select-none"
      role="tablist"
    >
      {openFiles.map((path, i) => {
        const entry = files[path];
        const dirty = !!entry?.dirty;
        const active = activeFile === path;
        return (
          <div
            key={path}
            role="tab"
            aria-selected={active}
            data-testid={`editor-tab-${path}`}
            title={path}
            onClick={() => openFile(path)}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                closeFile(path);
              }
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                closeFile(path);
              }
            }}
            className={`group flex items-center gap-1.5 pl-3 pr-1 h-[30px] text-[12px] cursor-pointer border-r border-ide-border relative ${
              active
                ? "bg-ide-bg text-white"
                : "bg-ide-panel text-ide-text/70 hover:text-white hover:bg-white/5"
            }`}
          >
            {active && (
              <span className="absolute top-0 left-0 right-0 h-[2px] bg-ide-accent" aria-hidden />
            )}
            <span className="truncate max-w-[200px]">{labels[i]}</span>
            {dirty ? (
              <button
                aria-label={`close-${path}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(path);
                }}
                className="w-4 h-4 inline-flex items-center justify-center rounded text-ide-text/80 hover:bg-white/10"
                title="Unsaved changes"
              >
                <span className="group-hover:hidden text-[10px]">●</span>
                <span className="hidden group-hover:inline text-[12px] leading-none">×</span>
              </button>
            ) : (
              <button
                aria-label={`close-${path}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(path);
                }}
                className="w-4 h-4 inline-flex items-center justify-center rounded text-ide-text/60 hover:bg-white/10 hover:text-white"
              >
                <span className="text-[12px] leading-none">×</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
