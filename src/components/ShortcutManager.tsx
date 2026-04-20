import { useEffect, useRef } from "react";
import { useIdeStore, type ShortcutType } from "../store/useIdeStore";
import { extractTemplateVars } from "../utils/shortcutTemplate";
import { SHORTCUT_TYPE_LIST, SHORTCUT_TYPE_META } from "../utils/shortcutTypes";

interface Props {
  onClose: () => void;
}

export default function ShortcutManager({ onClose }: Props) {
  const { shortcuts, addShortcut, updateShortcut, removeShortcut } = useIdeStore();
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const handleAdd = (): void => {
    addShortcut("New Shortcut", "", "command");
  };

  return (
    <div
      data-testid="shortcut-manager"
      role="dialog"
      aria-modal="true"
      aria-label="Manage shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-ide-panel border border-ide-border rounded-md shadow-xl w-[min(780px,92vw)] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-ide-border">
          <h2 className="text-sm font-semibold text-ide-text">
            Manage Shortcuts
          </h2>
          <button
            data-testid="shortcut-manager-close"
            aria-label="Close"
            onClick={onClose}
            className="text-base opacity-60 hover:opacity-100 px-2"
          >
            ×
          </button>
        </div>

        <div
          data-testid="shortcut-legend"
          className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ide-text/70 border-b border-ide-border"
        >
          <span className="font-semibold text-ide-text/80">Legend:</span>
          {SHORTCUT_TYPE_LIST.map((meta) => (
            <span
              key={meta.value}
              className="flex items-center gap-1.5"
              data-testid={`legend-${meta.value}`}
            >
              <span
                className={`inline-block w-3 h-3 rounded border ${meta.swatchClass}`}
              />
              <span className="font-semibold">{meta.label}</span>
              <span className="text-ide-text/50">— {meta.hint}</span>
            </span>
          ))}
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {shortcuts.length === 0 && (
            <div className="text-xs text-ide-text/60 italic text-center py-6">
              No shortcuts yet. Click "+ Add" below to create one.
            </div>
          )}

          {shortcuts.map((s, i) => {
            const meta = SHORTCUT_TYPE_META[s.type];
            const vars =
              s.type === "template" ? extractTemplateVars(s.command) : [];
            return (
              <div
                key={s.id}
                data-testid={`shortcut-row-${s.id}`}
                className="border border-ide-border rounded p-2 bg-ide-bg/40 space-y-1"
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`inline-block w-2.5 h-2.5 rounded-full border flex-shrink-0 ${meta.swatchClass}`}
                    title={meta.label}
                  />
                  <select
                    data-testid={`shortcut-type-${s.id}`}
                    value={s.type}
                    onChange={(e) =>
                      updateShortcut(s.id, {
                        type: e.target.value as ShortcutType,
                      })
                    }
                    className="px-1 py-1 bg-ide-bg border border-ide-border rounded text-xs text-ide-text focus:outline-none focus:border-ide-accent"
                    title={meta.hint}
                  >
                    {SHORTCUT_TYPE_LIST.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    ref={i === 0 ? firstInputRef : null}
                    data-testid={`shortcut-name-${s.id}`}
                    value={s.name}
                    onChange={(e) =>
                      updateShortcut(s.id, { name: e.target.value })
                    }
                    placeholder="Name"
                    className="w-40 px-2 py-1 bg-ide-bg border border-ide-border rounded text-xs text-ide-text focus:outline-none focus:border-ide-accent"
                  />
                  <input
                    data-testid={`shortcut-cmd-${s.id}`}
                    value={s.command}
                    onChange={(e) =>
                      updateShortcut(s.id, { command: e.target.value })
                    }
                    placeholder={
                      s.type === "template"
                        ? "e.g. kubectl delete pod {{podName}}"
                        : "Command"
                    }
                    className="flex-1 px-2 py-1 bg-ide-bg border border-ide-border rounded text-xs text-ide-text font-mono focus:outline-none focus:border-ide-accent"
                  />
                  <button
                    data-testid={`shortcut-delete-${s.id}`}
                    aria-label={`Delete shortcut ${s.name}`}
                    onClick={() => removeShortcut(s.id)}
                    className="text-xs px-2 py-1 rounded border border-ide-border text-red-300 hover:bg-red-500/20"
                  >
                    Delete
                  </button>
                </div>

                {s.type === "template" && (
                  <div
                    data-testid={`shortcut-vars-${s.id}`}
                    className="text-[11px] text-ide-text/60 pl-6"
                  >
                    {vars.length === 0 ? (
                      <span className="italic">
                        No variables yet. Add <code>{"{{name}}"}</code> in the command.
                      </span>
                    ) : (
                      <span>
                        Variables:{" "}
                        {vars.map((v, idx) => (
                          <span key={v}>
                            <code className="text-ide-text/80">{`{{${v}}}`}</code>
                            {idx < vars.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-ide-border">
          <button
            data-testid="shortcut-manager-add"
            onClick={handleAdd}
            className="text-xs px-3 py-1 rounded border border-ide-border hover:bg-white/5"
          >
            + Add
          </button>
          <button
            onClick={onClose}
            className="text-xs px-3 py-1 rounded border border-ide-border hover:bg-white/5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
