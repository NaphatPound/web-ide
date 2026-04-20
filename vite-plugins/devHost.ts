import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import { join, basename, resolve } from "node:path";
import type { Connect, Plugin, ViteDevServer, PreviewServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket as WsConnection } from "ws";

type UpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
type UpgradableServer = {
  on(event: "upgrade", handler: UpgradeHandler): unknown;
  off(event: "upgrade", handler: UpgradeHandler): unknown;
};

interface PtyLike {
  onData(cb: (data: string) => void): void;
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

function newExecId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    if (g.crypto?.randomUUID) return String(g.crypto.randomUUID());
  } catch {
    // ignore
  }
  return `exec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const requireCjs = createRequire(import.meta.url);
let ptyModule: { spawn: (file: string, args: string[], opts: unknown) => PtyLike } | null = null;
function loadPty(): typeof ptyModule {
  if (ptyModule !== null) return ptyModule;
  try {
    ptyModule = requireCjs("node-pty");
  } catch (err) {
    console.warn("[devHost] node-pty unavailable:", (err as Error).message);
    ptyModule = null;
  }
  return ptyModule;
}

const MAX_FILES = 400;
const MAX_FILE_BYTES = 512 * 1024;
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "target",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
]);
const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  md: "markdown",
  css: "css",
  scss: "scss",
  html: "html",
  rs: "rust",
  py: "python",
  go: "go",
  java: "java",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sh: "shell",
  sql: "sql",
};

function languageFor(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXT[ext] ?? "plaintext";
}

function isTextName(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext in LANGUAGE_BY_EXT || ext === "txt" || ext === "gitignore" || !name.includes(".");
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function pickFolderMac(): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("osascript", [
      "-e",
      'try',
      "-e",
      'POSIX path of (choose folder with prompt "Open folder in Web IDE")',
      "-e",
      'on error',
      "-e",
      'return ""',
      "-e",
      'end try',
    ]);
    let out = "";
    child.stdout.on("data", (c) => (out += c.toString()));
    child.on("close", () => {
      const path = out.trim();
      resolve(path.length > 0 ? path.replace(/\/$/, "") : null);
    });
    child.on("error", () => resolve(null));
  });
}

async function walkDir(
  root: string,
  current: string,
  prefix: string,
  out: Record<string, { path: string; language: string; content: string }>
): Promise<void> {
  if (Object.keys(out).length >= MAX_FILES) return;
  let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[];
  try {
    entries = await fs.readdir(current, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (Object.keys(out).length >= MAX_FILES) return;
    const abs = join(current, entry.name);
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      await walkDir(root, abs, path, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!isTextName(entry.name)) continue;
    try {
      const stat = await fs.stat(abs);
      if (stat.size > MAX_FILE_BYTES) continue;
      const content = await fs.readFile(abs, "utf8");
      out[path] = { path, language: languageFor(entry.name), content };
    } catch {
      // skip
    }
  }
}

interface PtyEntry {
  pty: PtyLike;
  autoEnterTimer: ReturnType<typeof setInterval> | null;
  isShim: boolean;
}

interface TermSession {
  ws: WsConnection;
  ptys: Map<string, PtyEntry>;
}

type SpawnMsg = {
  op: "spawn";
  localId: string;
  cwd?: string;
  cmd: string;
  tty?: boolean;
  cols?: number;
  rows?: number;
  autoEnter?: { count: number; intervalMs: number };
};
type StdinMsg = { op: "stdin"; execId: string; data: string };
type ResizeMsg = { op: "resize"; execId: string; cols: number; rows: number };
type KillMsg = { op: "kill"; execId: string };
type ClientMsg = SpawnMsg | StdinMsg | ResizeMsg | KillMsg;

function safeSend(ws: WsConnection, msg: unknown): void {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // ignore send errors on closed sockets
  }
}

function spawnPtyForSession(session: TermSession, msg: SpawnMsg, pty: NonNullable<typeof ptyModule>): void {
  const shell = process.env.SHELL || "/bin/sh";
  const cwd = msg.cwd && msg.cwd.length > 0 ? msg.cwd : process.cwd();
  const cols = Math.max(20, msg.cols ?? 120);
  const rows = Math.max(5, msg.rows ?? 30);

  let child: PtyLike;
  try {
    child = pty.spawn(shell, ["-lc", msg.cmd], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM: "xterm-256color" },
    });
  } catch (err) {
    safeSend(session.ws, {
      event: "spawn-error",
      localId: msg.localId,
      error: (err as Error).message,
    });
    return;
  }

  const execId = newExecId();
  const entry: PtyEntry = { pty: child, autoEnterTimer: null, isShim: false };
  session.ptys.set(execId, entry);
  safeSend(session.ws, { event: "spawned", localId: msg.localId, execId });

  let finished = false;
  const cleanup = (): void => {
    if (finished) return;
    finished = true;
    if (entry.autoEnterTimer) {
      clearInterval(entry.autoEnterTimer);
      entry.autoEnterTimer = null;
    }
    session.ptys.delete(execId);
  };

  child.onData((chunk) => {
    safeSend(session.ws, { event: "data", execId, stream: "stdout", data: chunk });
  });

  if (msg.autoEnter && msg.autoEnter.count > 0) {
    const { count, intervalMs } = msg.autoEnter;
    let sent = 0;
    entry.autoEnterTimer = setInterval(() => {
      if (finished) return;
      child.write("\r");
      sent += 1;
      if (sent >= count && entry.autoEnterTimer) {
        clearInterval(entry.autoEnterTimer);
        entry.autoEnterTimer = null;
      }
    }, Math.max(50, intervalMs));
  }

  child.onExit(({ exitCode, signal }) => {
    cleanup();
    safeSend(session.ws, {
      event: "exit",
      execId,
      code: exitCode ?? null,
      signal: signal ? String(signal) : null,
    });
  });
}

function spawnPipeForSession(session: TermSession, msg: SpawnMsg, prelude?: string): void {
  const shell = process.env.SHELL || "/bin/sh";
  const cwd = msg.cwd && msg.cwd.length > 0 ? msg.cwd : process.cwd();
  const child = spawn(shell, ["-lc", msg.cmd], {
    cwd,
    env: { ...process.env, TERM: process.env.TERM || "xterm-256color" },
  });
  const execId = newExecId();
  const shim: PtyLike = {
    onData: () => {},
    onExit: () => {},
    write: (data: string) => {
      child.stdin?.write(data);
    },
    resize: () => {},
    kill: (sig?: string) => {
      try {
        child.kill((sig ?? "SIGTERM") as NodeJS.Signals);
      } catch {
        // ignore
      }
    },
  };
  session.ptys.set(execId, { pty: shim, autoEnterTimer: null, isShim: true });
  safeSend(session.ws, { event: "spawned", localId: msg.localId, execId });
  if (prelude) {
    safeSend(session.ws, { event: "data", execId, stream: "stderr", data: prelude });
  }
  child.stdout.on("data", (c: Buffer) =>
    safeSend(session.ws, { event: "data", execId, stream: "stdout", data: c.toString("utf8") })
  );
  child.stderr.on("data", (c: Buffer) =>
    safeSend(session.ws, { event: "data", execId, stream: "stderr", data: c.toString("utf8") })
  );
  child.on("error", (err) =>
    safeSend(session.ws, {
      event: "data",
      execId,
      stream: "stderr",
      data: `[exec error] ${err.message}\n`,
    })
  );
  child.on("close", (code, signal) => {
    session.ptys.delete(execId);
    safeSend(session.ws, {
      event: "exit",
      execId,
      code: code ?? null,
      signal: signal ?? null,
    });
  });
}

function handleSpawn(session: TermSession, msg: SpawnMsg): void {
  if (!msg.cmd || !msg.cmd.trim()) {
    safeSend(session.ws, {
      event: "spawn-error",
      localId: msg.localId,
      error: "missing cmd",
    });
    return;
  }
  if (msg.tty) {
    const pty = loadPty();
    if (!pty) {
      spawnPipeForSession(
        session,
        msg,
        "[dev-host] node-pty unavailable; falling back to pipe mode.\n"
      );
      return;
    }
    spawnPtyForSession(session, msg, pty);
    return;
  }
  spawnPipeForSession(session, msg);
}

function handleWsConnection(ws: WsConnection): void {
  const session: TermSession = { ws, ptys: new Map() };

  ws.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
    let msg: ClientMsg;
    try {
      const text =
        typeof raw === "string"
          ? raw
          : Buffer.isBuffer(raw)
            ? raw.toString("utf8")
            : Array.isArray(raw)
              ? Buffer.concat(raw).toString("utf8")
              : Buffer.from(raw as ArrayBuffer).toString("utf8");
      msg = JSON.parse(text) as ClientMsg;
    } catch {
      return;
    }
    switch (msg.op) {
      case "spawn":
        handleSpawn(session, msg);
        break;
      case "stdin": {
        const entry = session.ptys.get(msg.execId);
        if (!entry) return;
        try {
          entry.pty.write(msg.data);
        } catch {
          // ignore write-on-dead-pty
        }
        break;
      }
      case "resize": {
        const entry = session.ptys.get(msg.execId);
        if (!entry || entry.isShim) return;
        try {
          entry.pty.resize(Math.max(10, msg.cols), Math.max(5, msg.rows));
        } catch {
          // ignore
        }
        break;
      }
      case "kill": {
        const entry = session.ptys.get(msg.execId);
        if (!entry) return;
        if (entry.autoEnterTimer) {
          clearInterval(entry.autoEnterTimer);
          entry.autoEnterTimer = null;
        }
        try {
          entry.pty.kill("SIGTERM");
        } catch {
          // ignore
        }
        session.ptys.delete(msg.execId);
        break;
      }
    }
  });

  const tearDown = (): void => {
    for (const entry of session.ptys.values()) {
      if (entry.autoEnterTimer) clearInterval(entry.autoEnterTimer);
      try {
        entry.pty.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    session.ptys.clear();
  };

  ws.on("close", tearDown);
  ws.on("error", () => {});
}

function attachWs(httpServer: UpgradableServer | null | undefined): () => void {
  if (!httpServer) return () => {};
  const wss = new WebSocketServer({ noServer: true });

  const onUpgrade: UpgradeHandler = (req, socket, head) => {
    let pathname = "";
    try {
      pathname = new URL(req.url ?? "", "http://x").pathname;
    } catch {
      return;
    }
    if (pathname !== "/__term-ws") return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleWsConnection(ws);
    });
  };

  httpServer.on("upgrade", onUpgrade);
  return () => {
    httpServer.off("upgrade", onUpgrade);
    wss.close();
  };
}

function attach(middlewares: Connect.Server): void {
  middlewares.use("/__pickFolder", (req, res) => {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }
    if (process.platform !== "darwin") {
      sendJson(res, 501, { error: `folder picker not supported on ${process.platform}` });
      return;
    }
    pickFolderMac().then(
      (path) => {
        if (!path) {
          sendJson(res, 200, { cancelled: true });
          return;
        }
        sendJson(res, 200, { path, name: basename(path) });
      },
      (err: Error) => sendJson(res, 500, { error: err.message })
    );
  });

  middlewares.use("/__listFolder", (req, res) => {
    const url = new URL(req.url ?? "", "http://x");
    const p = url.searchParams.get("path");
    if (!p) {
      sendJson(res, 400, { error: "missing path" });
      return;
    }
    const files: Record<string, { path: string; language: string; content: string }> = {};
    const rootName = basename(p);
    walkDir(p, p, rootName, files).then(
      () => sendJson(res, 200, { rootName, rootPath: p, files }),
      (err: Error) => sendJson(res, 500, { error: err.message })
    );
  });

  middlewares.use("/__writeFile", (req, res) => {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }
    readJsonBody<{ rootPath?: string; relPath?: string; content?: string }>(req).then(
      async (body) => {
        if (
          !body.rootPath ||
          !body.relPath ||
          typeof body.content !== "string"
        ) {
          sendJson(res, 400, { error: "missing rootPath/relPath/content" });
          return;
        }
        const root = resolve(body.rootPath);
        const target = resolve(root, body.relPath);
        const withSep = root.endsWith("/") ? root : root + "/";
        if (target !== root && !target.startsWith(withSep)) {
          sendJson(res, 403, { error: "path escapes workspace root" });
          return;
        }
        try {
          await fs.mkdir(join(target, ".."), { recursive: true });
          await fs.writeFile(target, body.content, "utf8");
          sendJson(res, 200, { ok: true, path: target });
        } catch (err) {
          sendJson(res, 500, { error: (err as Error).message });
        }
      },
      (err: Error) => sendJson(res, 400, { error: err.message })
    );
  });
}

export function devHost(): Plugin {
  return {
    name: "web-ide-dev-host",
    configureServer(server: ViteDevServer) {
      attach(server.middlewares);
      attachWs(server.httpServer as unknown as UpgradableServer | null);
    },
    configurePreviewServer(server: PreviewServer) {
      attach(server.middlewares);
      attachWs(server.httpServer as unknown as UpgradableServer | null);
    },
  };
}
