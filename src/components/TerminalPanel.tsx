import { useEffect, useMemo, useState } from "react";
import TerminalTab from "./Terminal/TerminalTab";
import { useIdeStore } from "../store/useIdeStore";

type Layout = "tabs" | "split";

export default function TerminalPanel() {
  const { terminals, addTerminal, removeTerminal, rootName, preferredLayout, layoutVersion } =
    useIdeStore();
  const [active, setActive] = useState<string | null>(terminals[0]?.id ?? null);
  const [layout, setLayout] = useState<Layout>(preferredLayout);

  useEffect(() => {
    if (terminals.length === 0) {
      if (active !== null) setActive(null);
      return;
    }
    if (!active || !terminals.some((t) => t.id === active)) {
      setActive(terminals[0].id);
    }
  }, [terminals, active]);

  useEffect(() => {
    if (terminals.length < 2 && layout === "split") setLayout("tabs");
  }, [terminals.length, layout]);

  useEffect(() => {
    setLayout(preferredLayout);
  }, [preferredLayout, layoutVersion]);

  const onAdd = () => {
    const label = rootName ? `${rootName} ${terminals.length + 1}` : `Term ${terminals.length + 1}`;
    const id = addTerminal(label);
    setActive(id);
  };

  const gridCols = useMemo(() => {
    if (layout !== "split") return undefined;
    const n = terminals.length || 1;
    const cols = Math.min(n, 3);
    return `repeat(${cols}, minmax(0, 1fr))`;
  }, [layout, terminals.length]);

  const split = layout === "split";

  return (
    <section
      data-testid="terminal-panel"
      className="bg-ide-panel border-t border-ide-border flex flex-col min-h-0"
    >
      <div className="flex items-center gap-1 px-2 py-1 border-b border-ide-border">
        {terminals.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded cursor-pointer ${
              !split && active === t.id ? "bg-ide-bg" : "hover:bg-white/5"
            }`}
            onClick={() => {
              setLayout("tabs");
              setActive(t.id);
            }}
          >
            <span>{t.title}</span>
            <button
              aria-label={`close-${t.title}`}
              className="opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                removeTerminal(t.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {terminals.length > 1 && (
            <button
              data-testid="toggle-split"
              onClick={() => setLayout((l) => (l === "tabs" ? "split" : "tabs"))}
              className={`text-xs px-2 py-0.5 rounded hover:bg-white/5 border border-ide-border ${
                split ? "bg-white/10" : ""
              }`}
              title="Show all terminals side by side"
            >
              {split ? "Unsplit" : "Split"}
            </button>
          )}
          <button
            onClick={onAdd}
            className="text-xs px-2 py-0.5 rounded hover:bg-white/5"
            title={rootName ? `New terminal in ${rootName}` : "New terminal"}
          >
            + new
          </button>
        </div>
      </div>

      <div
        data-testid={split ? "split-grid" : "terminal-stack"}
        className={
          split
            ? "flex-1 min-h-0 grid gap-px bg-ide-border"
            : "flex-1 min-h-0 relative"
        }
        style={split ? { gridTemplateColumns: gridCols } : undefined}
      >
        {terminals.map((t) => {
          const visible = split || active === t.id;
          return (
            <div
              key={t.id}
              data-pane-id={t.id}
              className={split ? "relative min-h-0 bg-ide-bg" : "absolute inset-0"}
              style={{ display: visible ? undefined : "none" }}
            >
              <div
                className="absolute top-0 left-0 right-0 text-[10px] px-2 py-0.5 bg-black/40 text-ide-text/70 flex items-center justify-between z-10"
                style={{ display: split ? undefined : "none" }}
              >
                <span className="truncate">{t.title}</span>
                <button
                  aria-label={`close-pane-${t.title}`}
                  className="opacity-60 hover:opacity-100"
                  onClick={() => removeTerminal(t.id)}
                >
                  ×
                </button>
              </div>
              <div
                className="absolute inset-0"
                style={{ paddingTop: split ? "20px" : "0" }}
              >
                <TerminalTab id={t.id} />
              </div>
            </div>
          );
        })}
        {terminals.length === 0 && (
          <div className="p-4 text-xs text-ide-text/60">
            No terminals open. Click "+ new" to spawn one.
          </div>
        )}
      </div>
    </section>
  );
}
