import { useState } from "react";
import { useIdeStore, type ShortcutEntry } from "../store/useIdeStore";
import { sendToTerminal } from "../utils/terminalBus";
import { SHORTCUT_TYPE_META } from "../utils/shortcutTypes";
import ShortcutManager from "./ShortcutManager";
import ShortcutTemplateDialog from "./ShortcutTemplateDialog";

const TYPE_SUFFIX: Record<ShortcutEntry["type"], string> = {
  command: "",
  text: "",
  template: " …",
};

export default function ShortcutBar() {
  const { shortcuts, activeTerminalId, terminals } = useIdeStore();
  const [managerOpen, setManagerOpen] = useState(false);
  const [templateTarget, setTemplateTarget] = useState<ShortcutEntry | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const activeExists =
    activeTerminalId !== null &&
    terminals.some((t) => t.id === activeTerminalId);

  const showFlash = (msg: string): void => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 1400);
  };

  const deliver = (payload: string): void => {
    if (!activeExists || !activeTerminalId) {
      showFlash("Select a terminal first");
      return;
    }
    const ok = sendToTerminal(activeTerminalId, payload);
    if (!ok) showFlash("Terminal not ready");
  };

  const handleShortcutClick = (s: ShortcutEntry): void => {
    if (s.type === "template") {
      if (!activeExists) {
        showFlash("Select a terminal first");
        return;
      }
      setTemplateTarget(s);
      return;
    }
    if (s.type === "text") {
      deliver(s.command);
      return;
    }
    deliver(s.command + "\r");
  };

  const handleTemplateSubmit = (filled: string): void => {
    setTemplateTarget(null);
    deliver(filled + "\r");
  };

  return (
    <>
      <div
        data-testid="shortcut-bar"
        className="bg-ide-panel border-t border-ide-border px-2 py-1 flex items-center gap-1 overflow-x-auto"
      >
        {shortcuts.length === 0 && (
          <span className="text-[11px] text-ide-text/50 italic px-1">
            No shortcuts yet — click Manage to add one
          </span>
        )}
        {shortcuts.map((s) => {
          const meta = SHORTCUT_TYPE_META[s.type];
          return (
            <button
              key={s.id}
              data-testid={`shortcut-${s.id}`}
              data-shortcut-type={s.type}
              onClick={() => handleShortcutClick(s)}
              disabled={!activeExists}
              title={`[${meta.label}] ${s.command}`}
              className={`flex-shrink-0 text-xs px-2 py-0.5 rounded border ${meta.buttonClass} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {s.name}
              {TYPE_SUFFIX[s.type]}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
          {flash && (
            <span className="text-[11px] text-amber-300 px-1" role="status">
              {flash}
            </span>
          )}
          <button
            data-testid="shortcut-manage"
            onClick={() => setManagerOpen(true)}
            className="text-xs px-2 py-0.5 rounded hover:bg-white/5 border border-ide-border"
            title="Manage shortcuts"
          >
            Manage
          </button>
        </div>
      </div>
      {managerOpen && <ShortcutManager onClose={() => setManagerOpen(false)} />}
      {templateTarget && (
        <ShortcutTemplateDialog
          shortcut={templateTarget}
          onClose={() => setTemplateTarget(null)}
          onSubmit={handleTemplateSubmit}
        />
      )}
    </>
  );
}
