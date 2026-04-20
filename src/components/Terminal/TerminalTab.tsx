import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "xterm/css/xterm.css";
import { useIdeStore } from "../../store/useIdeStore";
import { buildContextPrompt } from "../../utils/contextApi";
import { inTauri } from "../../utils/tauriEnv";
import {
  runExec,
  sendExecInput,
  sendExecResize,
  type ExecOptions,
} from "../../utils/devHostApi";
import { registerTerminalSender } from "../../utils/terminalBus";

interface Props {
  id: string;
}

interface PtyDataEvent {
  id: string;
  data: string;
}

interface Attachment {
  cleanup: () => void;
  send: (text: string) => void;
}

const MIN_COLS = 120;

function applyFit(term: Terminal, fit: FitAddon): void {
  try {
    fit.fit();
  } catch {
    return;
  }
  if (term.cols < MIN_COLS) {
    term.resize(MIN_COLS, term.rows);
  }
}

export default function TerminalTab({ id }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const store = useIdeStore;

  useEffect(() => {
    if (!hostRef.current) return;
    const term = new Terminal({
      theme: { background: "#1e1e1e", foreground: "#cccccc" },
      fontSize: 13,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      cursorBlink: true,
      convertEol: true,
    });
    const fit = new FitAddon();
    const links = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(hostRef.current);
    applyFit(term, fit);

    const tab = store.getState().terminals.find((t) => t.id === id);
    term.writeln(`\x1b[36m[${tab?.title ?? "term"}] AI Command Center\x1b[0m`);

    const markActive = (): void => {
      if (store.getState().activeTerminalId !== id) {
        store.getState().setActiveTerminalId(id);
      }
    };
    const hostEl = hostRef.current;
    hostEl.addEventListener("focusin", markActive);
    hostEl.addEventListener("mousedown", markActive);

    const attachment: Attachment = inTauri()
      ? attachPty(term, fit, hostRef.current!, tab?.initialCmd ?? null)
      : attachDevHostShell(
          term,
          fit,
          hostRef.current!,
          store,
          tab?.initialCmd ?? null,
          {
            tty: tab?.initialTty,
            autoEnter: tab?.initialAutoEnter,
          }
        );

    const unregisterSender = registerTerminalSender(id, attachment.send);

    return () => {
      hostEl.removeEventListener("focusin", markActive);
      hostEl.removeEventListener("mousedown", markActive);
      unregisterSender();
      attachment.cleanup();
    };
  }, [id, store]);

  return <div ref={hostRef} className="w-full h-full overflow-x-auto" />;
}

function attachPty(
  term: Terminal,
  fit: FitAddon,
  host: HTMLElement,
  initialCmd: string | null
): Attachment {
  let ptyId: string | null = null;
  let unlistenData: UnlistenFn | null = null;
  let unlistenExit: UnlistenFn | null = null;
  let disposed = false;
  const dataDisposable = term.onData((data) => {
    if (ptyId) invoke("pty_write", { id: ptyId, data }).catch(() => {});
  });

  (async () => {
    try {
      ptyId = await invoke<string>("pty_spawn", {
        cols: term.cols,
        rows: term.rows,
        shell: null,
        cwd: useIdeStore.getState().rootPath ?? null,
        initialCmd: initialCmd ?? null,
      });
      if (disposed && ptyId) {
        invoke("pty_kill", { id: ptyId }).catch(() => {});
        return;
      }
      unlistenData = await listen<PtyDataEvent>("pty:data", (e) => {
        if (e.payload.id === ptyId) term.write(e.payload.data);
      });
      unlistenExit = await listen<PtyDataEvent>("pty:exit", (e) => {
        if (e.payload.id === ptyId) term.writeln("\r\n\x1b[33m[pty exited]\x1b[0m");
      });
    } catch (err) {
      term.writeln(`\r\n\x1b[31m[pty error]\x1b[0m ${(err as Error).message ?? err}`);
    }
  })();

  const ro = new ResizeObserver(() => {
    applyFit(term, fit);
    if (ptyId) {
      invoke("pty_resize", {
        id: ptyId,
        cols: term.cols,
        rows: term.rows,
      }).catch(() => {});
    }
  });
  ro.observe(host);

  return {
    cleanup: () => {
      disposed = true;
      dataDisposable.dispose();
      ro.disconnect();
      if (unlistenData) unlistenData();
      if (unlistenExit) unlistenExit();
      if (ptyId) invoke("pty_kill", { id: ptyId }).catch(() => {});
      term.dispose();
    },
    send: (text: string) => {
      if (!ptyId) return;
      invoke("pty_write", { id: ptyId, data: text }).catch(() => {});
    },
  };
}

function attachDevHostShell(
  term: Terminal,
  fit: FitAddon,
  host: HTMLElement,
  store: typeof useIdeStore,
  initialCmd: string | null,
  initialOptions: ExecOptions = {}
): Attachment {
  let buffer = "";
  let running = false;
  let abort: AbortController | null = null;
  let disposed = false;
  let activeExecId: string | null = null;
  let ttyMode = false;

  const rootPath = (): string | null => store.getState().rootPath;

  const prompt = () => {
    const cwd = rootPath();
    const label = cwd ? cwd.replace(/^.*\//, "") : "web-ide";
    term.write(`\r\n\x1b[32m${label}\x1b[0m $ `);
  };

  term.writeln(
    "\x1b[2mReal shell via dev-host. Open a folder first to pin a working directory. Ctrl+C aborts.\x1b[0m"
  );

  const runLine = async (line: string, options: ExecOptions = {}): Promise<void> => {
    const trimmed = line.trim();
    if (!trimmed) {
      prompt();
      return;
    }
    if (trimmed === "clear") {
      term.clear();
      prompt();
      return;
    }
    if (trimmed === "context") {
      term.writeln("\r\n" + buildContextPrompt(store.getState()));
      prompt();
      return;
    }
    running = true;
    abort = new AbortController();
    activeExecId = null;
    ttyMode = !!options.tty;
    term.write("\r\n");
    const merged: ExecOptions = {
      ...options,
      cols: options.cols ?? term.cols,
      rows: options.rows ?? term.rows,
    };
    try {
      await runExec(
        rootPath(),
        trimmed,
        (ev) => {
          if (disposed) return;
          if (ev.type === "spawned") {
            activeExecId = ev.id;
          } else if (ev.type === "data") {
            term.write(ev.data);
          } else if (ev.type === "exit") {
            if (ev.signal) term.writeln(`\x1b[33m[signal ${ev.signal}]\x1b[0m`);
            else if (ev.code && ev.code !== 0)
              term.writeln(`\x1b[33m[exit ${ev.code}]\x1b[0m`);
          }
        },
        abort.signal,
        merged
      );
    } catch (err) {
      const name = (err as Error).name;
      if (name !== "AbortError") {
        term.writeln(`\r\n\x1b[31m[exec error]\x1b[0m ${(err as Error).message}`);
      }
    } finally {
      running = false;
      ttyMode = false;
      activeExecId = null;
      abort = null;
      if (!disposed) prompt();
    }
  };

  if (initialCmd) {
    term.writeln(`\x1b[2m$ ${initialCmd}\x1b[0m`);
    void runLine(initialCmd, initialOptions);
  } else {
    prompt();
  }

  const feedIdleBuffer = (data: string): void => {
    for (const ch of data) {
      if (ch === "\r" || ch === "\n") {
        void runLine(buffer);
        buffer = "";
      } else if (ch === "\u007f") {
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          term.write("\b \b");
        }
      } else if (ch === "\x1b") {
        continue;
      } else if (ch === "\x03") {
        term.writeln("^C");
        buffer = "";
        prompt();
      } else {
        buffer += ch;
        term.write(ch);
      }
    }
  };

  const dataDisposable = term.onData((data) => {
    if (running && ttyMode && activeExecId) {
      void sendExecInput(activeExecId, data);
      return;
    }
    if (running) {
      if (data === "\x03") {
        abort?.abort();
        term.writeln("^C");
      }
      return;
    }
    feedIdleBuffer(data);
  });

  const ro = new ResizeObserver(() => {
    applyFit(term, fit);
    if (running && ttyMode && activeExecId) {
      void sendExecResize(activeExecId, term.cols, term.rows);
    }
  });
  ro.observe(host);

  return {
    cleanup: () => {
      disposed = true;
      abort?.abort();
      dataDisposable.dispose();
      ro.disconnect();
      term.dispose();
    },
    send: (text: string) => {
      if (disposed) return;
      if (running && ttyMode && activeExecId) {
        void sendExecInput(activeExecId, text);
        return;
      }
      if (running) return;
      feedIdleBuffer(text);
    },
  };
}
