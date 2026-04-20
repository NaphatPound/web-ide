export interface ExecChunk {
  type: "data";
  stream: "stdout" | "stderr";
  data: string;
}

export interface ExecExit {
  type: "exit";
  code: number | null;
  signal: string | null;
}

export interface ExecSpawned {
  type: "spawned";
  id: string;
}

export type ExecEvent = ExecChunk | ExecExit | ExecSpawned;

export interface ExecOptions {
  tty?: boolean;
  cols?: number;
  rows?: number;
  autoEnter?: { count: number; intervalMs: number };
}

type Handler = (ev: ExecEvent) => void;

interface PendingSpawn {
  resolve: (execId: string) => void;
  reject: (err: Error) => void;
  onEvent: Handler;
}

type WebSocketCtor = typeof WebSocket;

let webSocketCtor: WebSocketCtor | null = null;

function getWebSocketCtor(): WebSocketCtor {
  if (webSocketCtor) return webSocketCtor;
  const g = globalThis as unknown as { WebSocket?: WebSocketCtor };
  if (!g.WebSocket) {
    throw new Error("WebSocket is not available in this environment");
  }
  return g.WebSocket;
}

export function __setWebSocketCtorForTests(ctor: WebSocketCtor | null): void {
  webSocketCtor = ctor;
}

class TermSocket {
  private ws: WebSocket | null = null;
  private opening: Promise<WebSocket> | null = null;
  private handlers = new Map<string, Handler>();
  private pendingSpawns = new Map<string, PendingSpawn>();
  private nextLocalId = 0;

  private buildUrl(): string {
    const loc = (globalThis as unknown as { location?: Location }).location;
    const proto = loc?.protocol === "https:" ? "wss:" : "ws:";
    const host = loc?.host ?? "127.0.0.1:5173";
    return `${proto}//${host}/__term-ws`;
  }

  private ensure(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === 1) return Promise.resolve(this.ws);
    if (this.opening) return this.opening;
    const Ctor = getWebSocketCtor();
    const ws = new Ctor(this.buildUrl());
    this.opening = new Promise<WebSocket>((resolve, reject) => {
      const onOpen = (): void => {
        ws.removeEventListener("error", onError);
        this.ws = ws;
        this.opening = null;
        resolve(ws);
      };
      const onError = (): void => {
        ws.removeEventListener("open", onOpen);
        this.opening = null;
        reject(new Error("WebSocket connection failed"));
      };
      ws.addEventListener("open", onOpen, { once: true });
      ws.addEventListener("error", onError, { once: true });
      ws.addEventListener("message", (ev: MessageEvent) =>
        this.handleMessage(String(ev.data))
      );
      ws.addEventListener("close", () => this.handleClose(ws));
    });
    return this.opening;
  }

  private handleClose(ws: WebSocket): void {
    if (this.ws === ws) this.ws = null;
    for (const h of this.handlers.values()) {
      h({ type: "exit", code: null, signal: "CLOSED" });
    }
    this.handlers.clear();
    for (const p of this.pendingSpawns.values()) {
      p.reject(new Error("WebSocket closed before spawn acknowledged"));
    }
    this.pendingSpawns.clear();
  }

  private handleMessage(raw: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const event = msg.event as string | undefined;
    if (event === "spawned") {
      const localId = String(msg.localId);
      const execId = String(msg.execId);
      const pending = this.pendingSpawns.get(localId);
      if (!pending) return;
      this.pendingSpawns.delete(localId);
      this.handlers.set(execId, pending.onEvent);
      pending.onEvent({ type: "spawned", id: execId });
      pending.resolve(execId);
      return;
    }
    if (event === "spawn-error") {
      const localId = String(msg.localId);
      const pending = this.pendingSpawns.get(localId);
      if (!pending) return;
      this.pendingSpawns.delete(localId);
      pending.reject(new Error(String(msg.error ?? "spawn failed")));
      return;
    }
    if (event === "data") {
      const execId = String(msg.execId);
      const h = this.handlers.get(execId);
      if (!h) return;
      h({
        type: "data",
        stream: msg.stream === "stderr" ? "stderr" : "stdout",
        data: String(msg.data ?? ""),
      });
      return;
    }
    if (event === "exit") {
      const execId = String(msg.execId);
      const h = this.handlers.get(execId);
      this.handlers.delete(execId);
      if (!h) return;
      h({
        type: "exit",
        code: typeof msg.code === "number" ? msg.code : null,
        signal: typeof msg.signal === "string" ? msg.signal : null,
      });
      return;
    }
  }

  async spawn(
    cwd: string | null,
    cmd: string,
    options: ExecOptions,
    onEvent: Handler
  ): Promise<string> {
    const ws = await this.ensure();
    const localId = `l-${++this.nextLocalId}`;
    return new Promise<string>((resolve, reject) => {
      this.pendingSpawns.set(localId, { resolve, reject, onEvent });
      ws.send(
        JSON.stringify({
          op: "spawn",
          localId,
          cwd: cwd ?? undefined,
          cmd,
          tty: options.tty,
          cols: options.cols,
          rows: options.rows,
          autoEnter: options.autoEnter,
        })
      );
    });
  }

  stdin(execId: string, data: string): void {
    const ws = this.ws;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ op: "stdin", execId, data }));
    }
  }

  resize(execId: string, cols: number, rows: number): void {
    const ws = this.ws;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ op: "resize", execId, cols, rows }));
    }
  }

  kill(execId: string): void {
    const ws = this.ws;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ op: "kill", execId }));
    }
    this.handlers.delete(execId);
  }
}

export const termSocket = new TermSocket();

export function __resetTermSocketForTests(): void {
  const anySocket = termSocket as unknown as {
    ws: WebSocket | null;
    opening: Promise<WebSocket> | null;
    handlers: Map<string, Handler>;
    pendingSpawns: Map<string, PendingSpawn>;
    nextLocalId: number;
  };
  anySocket.ws = null;
  anySocket.opening = null;
  anySocket.handlers = new Map();
  anySocket.pendingSpawns = new Map();
  anySocket.nextLocalId = 0;
}
