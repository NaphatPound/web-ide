import { useEffect, useMemo, useRef, useState } from "react";
import type { ShortcutEntry } from "../store/useIdeStore";
import {
  extractTemplateVars,
  fillTemplate,
} from "../utils/shortcutTemplate";

interface Props {
  shortcut: ShortcutEntry;
  onClose: () => void;
  onSubmit: (filledCommand: string) => void;
}

export default function ShortcutTemplateDialog({ shortcut, onClose, onSubmit }: Props) {
  const vars = useMemo(() => extractTemplateVars(shortcut.command), [shortcut.command]);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(vars.map((v) => [v, ""]))
  );
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

  const preview = useMemo(
    () => fillTemplate(shortcut.command, values),
    [shortcut.command, values]
  );

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    onSubmit(preview);
  };

  if (vars.length === 0) {
    return (
      <div
        data-testid="shortcut-template-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Run ${shortcut.name}`}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onClick={onClose}
      >
        <div
          className="bg-ide-panel border border-ide-border rounded-md shadow-xl w-[min(520px,90vw)] p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-sm font-semibold mb-2 text-ide-text">{shortcut.name}</h2>
          <p className="text-xs text-ide-text/70 mb-3">
            This template has no <code>{"{{variables}}"}</code>. Edit the shortcut to
            add placeholders, or send it as-is.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1 rounded border border-ide-border hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSubmit(shortcut.command)}
              className="text-xs px-3 py-1 rounded border border-ide-border bg-white/10 hover:bg-white/20"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="shortcut-template-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={`Fill ${shortcut.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-ide-panel border border-ide-border rounded-md shadow-xl w-[min(560px,92vw)] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-ide-border">
          <h2 className="text-sm font-semibold text-ide-text">{shortcut.name}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-base opacity-60 hover:opacity-100 px-2"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {vars.map((name, i) => (
            <label key={name} className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-ide-text/60">
                {name}
              </span>
              <input
                ref={i === 0 ? firstInputRef : null}
                data-testid={`template-input-${name}`}
                value={values[name] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [name]: e.target.value }))
                }
                placeholder={`Value for {{${name}}}`}
                className="w-full px-2 py-1 bg-ide-bg border border-ide-border rounded text-xs text-ide-text focus:outline-none focus:border-ide-accent"
              />
            </label>
          ))}

          <div className="pt-2">
            <div className="text-[11px] uppercase tracking-wider text-ide-text/60 mb-1">
              Preview
            </div>
            <pre
              data-testid="template-preview"
              className="text-xs font-mono bg-ide-bg border border-ide-border rounded px-2 py-1 whitespace-pre-wrap break-all text-ide-text/90"
            >
              {preview}
            </pre>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-ide-border">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1 rounded border border-ide-border hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            data-testid="template-send"
            type="submit"
            className="text-xs px-3 py-1 rounded border border-ide-border bg-white/10 hover:bg-white/20"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
