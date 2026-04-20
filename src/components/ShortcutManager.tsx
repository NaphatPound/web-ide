import { useEffect, useRef } from "react";
import { useIdeStore } from "../store/useIdeStore";

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
    addShortcut("New Shortcut", "");
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
        className="bg-ide-panel border border-ide-border rounded-md shadow-xl w-[min(640px,90vw)] max-h-[80vh] flex flex-col"
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

        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          {shortcuts.length === 0 && (
            <div className="text-xs text-ide-text/60 italic text-center py-6">
              No shortcuts yet. Click "+ Add" below to create one.
            </div>
          )}
          {shortcuts.map((s, i) => (
            <div
              key={s.id}
              data-testid={`shortcut-row-${s.id}`}
              className="flex items-center gap-2"
            >
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
                placeholder="Command"
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
          ))}
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
