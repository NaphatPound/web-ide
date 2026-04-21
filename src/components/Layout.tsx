import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import EditorArea from "./EditorArea";
import TerminalPanel from "./TerminalPanel";
import ShortcutBar from "./ShortcutBar";
import AutoDevPanel from "./AutoDevPanel";
import Splitter from "./Splitter";
import { useIdeStore } from "../store/useIdeStore";

const SIDEBAR_DEFAULT = 240;
const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 520;

const TERMINAL_DEFAULT = 240;
const TERMINAL_MIN = 80;
const TERMINAL_MAX_RATIO = 0.9;

const STORAGE_KEY = "web-ide:layout-sizes";

interface Sizes {
  sidebarW: number;
  terminalH: number;
}

function readStored(): Partial<Sizes> {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage?.getItem(STORAGE_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Sizes>;
    return {
      sidebarW: typeof parsed.sidebarW === "number" ? parsed.sidebarW : undefined,
      terminalH: typeof parsed.terminalH === "number" ? parsed.terminalH : undefined,
    };
  } catch {
    return {};
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export default function Layout() {
  const mode = useIdeStore((s) => s.mode);
  const stored = useRef<Partial<Sizes>>(readStored());
  const [sidebarW, setSidebarW] = useState<number>(
    () => stored.current.sidebarW ?? SIDEBAR_DEFAULT
  );
  const [terminalH, setTerminalH] = useState<number>(
    () => stored.current.terminalH ?? TERMINAL_DEFAULT
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sidebarStart = useRef(sidebarW);
  const terminalStart = useRef(terminalH);

  useEffect(() => {
    try {
      window.localStorage?.setItem(
        STORAGE_KEY,
        JSON.stringify({ sidebarW, terminalH })
      );
    } catch {
      // ignore (e.g. private mode quota errors)
    }
  }, [sidebarW, terminalH]);

  const onSidebarDragStart = useCallback(() => {
    sidebarStart.current = sidebarW;
  }, [sidebarW]);

  const onTerminalDragStart = useCallback(() => {
    terminalStart.current = terminalH;
  }, [terminalH]);

  const onSidebarDrag = useCallback(
    (delta: number) => {
      setSidebarW(clamp(sidebarStart.current + delta, SIDEBAR_MIN, SIDEBAR_MAX));
    },
    []
  );

  const onTerminalDrag = useCallback((delta: number) => {
    const rootHeight = rootRef.current?.clientHeight ?? window.innerHeight;
    const max = Math.max(TERMINAL_MIN, rootHeight * TERMINAL_MAX_RATIO);
    setTerminalH(clamp(terminalStart.current - delta, TERMINAL_MIN, max));
  }, []);

  const showSidebar = mode !== "vim";
  const columns = showSidebar ? `${sidebarW}px 4px 1fr` : "1fr";

  return (
    <div
      ref={rootRef}
      data-testid="ide-layout"
      className="grid h-full"
      style={{ gridTemplateColumns: columns }}
    >
      {showSidebar && <Sidebar />}
      {showSidebar && (
        <Splitter
          direction="col"
          ariaLabel="Resize sidebar"
          onDragStart={onSidebarDragStart}
          onDragMove={onSidebarDrag}
        />
      )}
      <div
        className="grid min-h-0 min-w-0"
        style={{ gridTemplateRows: `1fr 4px ${terminalH}px auto auto` }}
      >
        <EditorArea />
        <Splitter
          direction="row"
          ariaLabel="Resize terminal panel"
          onDragStart={onTerminalDragStart}
          onDragMove={onTerminalDrag}
        />
        <TerminalPanel />
        <ShortcutBar />
        <AutoDevPanel />
      </div>
    </div>
  );
}
