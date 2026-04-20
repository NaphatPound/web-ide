import { useState } from "react";
import { useIdeStore } from "../store/useIdeStore";
import { sendToTerminal } from "../utils/terminalBus";
import ShortcutManager from "./ShortcutManager";

export default function ShortcutBar() {
  const { shortcuts, activeTerminalId, terminals, addShortcut } = useIdeStore();
  const [managerOpen, setManagerOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const activeExists =
    activeTerminalId !== null &&
    terminals.some((t) => t.id === activeTerminalId);

  const handleRun = (command: string): void => {
    if (!activeExists || !activeTerminalId) {
      setFlash("Select a terminal first");
      window.setTimeout(() => setFlash(null), 1400);
      return;
    }
    const ok = sendToTerminal(activeTerminalId, command + "\r");
    if (!ok) {
      setFlash("Terminal not ready");
      window.setTimeout(() => setFlash(null), 1400);
    }
  };

  const handleQuickAdd = (): void => {
    const name = window.prompt("Shortcut name?");
    if (!name) return;
    const command = window.prompt("Command?", "");
    if (command === null) return;
    addShortcut(name.trim() || "New", command);
  };

  return (
    <>
      <div
        data-testid="shortcut-bar"
        className="bg-ide-panel border-t border-ide-border px-2 py-1 flex items-center gap-1 overflow-x-auto"
      >
        {shortcuts.length === 0 && (
          <span className="text-[11px] text-ide-text/50 italic px-1">
            No shortcuts yet
          </span>
        )}
        {shortcuts.map((s) => (
          <button
            key={s.id}
            data-testid={`shortcut-${s.id}`}
            onClick={() => handleRun(s.command)}
            disabled={!activeExists}
            title={s.command}
            className="flex-shrink-0 text-xs px-2 py-0.5 rounded border border-ide-border hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {s.name}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
          {flash && (
            <span className="text-[11px] text-amber-300 px-1" role="status">
              {flash}
            </span>
          )}
          <button
            data-testid="shortcut-quick-add"
            onClick={handleQuickAdd}
            className="text-xs px-2 py-0.5 rounded hover:bg-white/5 border border-ide-border"
            title="Add a shortcut"
          >
            + new
          </button>
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
    </>
  );
}
