import { useEffect, useRef, useState } from "react";
import { useIdeStore, type AutoDevPhase } from "../store/useIdeStore";
import { startAutoDev, stopAutoDev } from "../orchestrator/engine";

const PHASE_LABEL: Record<AutoDevPhase, string> = {
  idle: "Idle",
  sa: "SA (planning)",
  dev: "DEV (coding)",
  qa: "QA (testing)",
  dev_fix: "DEV (fixing bugs)",
  done: "Done",
  stopped_max: "Stopped — max iterations",
  error: "Error",
};

const PHASE_COLOR: Record<AutoDevPhase, string> = {
  idle: "text-ide-text/50",
  sa: "text-sky-300",
  dev: "text-emerald-300",
  qa: "text-amber-300",
  dev_fix: "text-orange-300",
  done: "text-emerald-400",
  stopped_max: "text-red-300",
  error: "text-red-400",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export default function AutoDevPanel() {
  const autoDev = useIdeStore((s) => s.autoDev);
  const rootPath = useIdeStore((s) => s.rootPath);
  const setAutoDevMaxIter = useIdeStore((s) => s.setAutoDevMaxIter);
  const [expanded, setExpanded] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [autoDev.log.length, expanded]);

  const canStart = !autoDev.running && !!rootPath;
  const canStop = autoDev.running;

  const iterLabel =
    autoDev.iter > 0 ? `iter ${autoDev.iter}/${autoDev.maxIter}` : `max ${autoDev.maxIter}`;

  return (
    <div
      data-testid="autodev-panel"
      className="bg-ide-panel border-t border-ide-border text-[12px]"
    >
      <div className="flex items-center gap-2 px-2 py-1">
        <button
          className="text-ide-text/60 hover:text-ide-text px-1"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse log" : "Expand log"}
        >
          {expanded ? "▾" : "▸"}
        </button>
        <span className="font-semibold text-ide-text/80">Auto-Dev</span>
        <span className={`${PHASE_COLOR[autoDev.phase]} font-mono`}>
          {PHASE_LABEL[autoDev.phase]}
        </span>
        <span className="text-ide-text/50 font-mono">{iterLabel}</span>
        {autoDev.error && (
          <span className="text-red-400 truncate max-w-[40ch]" title={autoDev.error}>
            {autoDev.error}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1 text-ide-text/60">
            Max iter
            <input
              type="number"
              min={1}
              max={20}
              value={autoDev.maxIter}
              disabled={autoDev.running}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setAutoDevMaxIter(n);
              }}
              className="w-12 bg-ide-bg border border-ide-border rounded px-1 py-0.5 text-right disabled:opacity-50"
            />
          </label>
          <button
            onClick={() => void startAutoDev()}
            disabled={!canStart}
            className="px-2 py-0.5 rounded border border-ide-border bg-emerald-700/40 hover:bg-emerald-700/60 disabled:opacity-40"
            title={rootPath ? "Start auto-dev loop" : "Open a folder first"}
          >
            Start
          </button>
          <button
            onClick={stopAutoDev}
            disabled={!canStop}
            className="px-2 py-0.5 rounded border border-ide-border bg-red-700/40 hover:bg-red-700/60 disabled:opacity-40"
          >
            Stop
          </button>
        </div>
      </div>
      {expanded && (
        <div
          ref={logRef}
          className="border-t border-ide-border max-h-40 overflow-y-auto px-2 py-1 font-mono text-[11px] leading-snug"
        >
          {autoDev.log.length === 0 ? (
            <div className="text-ide-text/40 italic">
              No activity yet. Edit ./REQ/requirement.md, then click Start.
            </div>
          ) : (
            autoDev.log.map((entry, i) => (
              <div
                key={i}
                className={
                  entry.level === "error"
                    ? "text-red-400"
                    : entry.level === "warn"
                      ? "text-amber-300"
                      : "text-ide-text/80"
                }
              >
                <span className="text-ide-text/40 mr-2">{formatTime(entry.ts)}</span>
                {entry.message}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
