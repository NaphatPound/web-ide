import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import { join, basename, resolve } from "node:path";
import type { Connect, Plugin, ViteDevServer, PreviewServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

interface PtyLike {
  onData(cb: (data: string) => void): void;
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

const ptyRegistry = new Map<string, PtyLike>();

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

interface ExecBody {
  cwd?: string;
  cmd?: string;
  tty?: boolean;
  cols?: number;
  rows?: number;
  autoEnter?: { count: number; intervalMs: number };
}

function handleExec(req: IncomingMessage, res: ServerResponse, body: ExecBody): void {
  const cwd = typeof body.cwd === "string" && body.cwd.length > 0 ? body.cwd : process.cwd();
  const cmd = typeof body.cmd === "string" ? body.cmd : "";
  if (!cmd.trim()) {
    sendJson(res, 400, { error: "missing cmd" });
    return;
  }
  res.statusCode = 200;
  res.setHeader("content-type", "application/x-ndjson");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("x-accel-buffering", "no");

  const write = (obj: unknown): void => {
    res.write(JSON.stringify(obj) + "\n");
  };

  if (body.tty) {
    const pty = loadPty();
    if (!pty) {
      write({
        type: "data",
        stream: "stderr",
        data: "[dev-host] node-pty unavailable; falling back to pipe mode.\n",
      });
    } else {
      runInPty(req, res, cwd, cmd, body, write, pty);
      return;
    }
  }

  const shell = process.env.SHELL || "/bin/sh";
  const child = spawn(shell, ["-lc", cmd], {
    cwd,
    env: { ...process.env, TERM: process.env.TERM || "xterm-256color" },
  });
  child.stdout.on("data", (c: Buffer) => write({ type: "data", stream: "stdout", data: c.toString("utf8") }));
  child.stderr.on("data", (c: Buffer) => write({ type: "data", stream: "stderr", data: c.toString("utf8") }));
  child.on("error", (err) => write({ type: "data", stream: "stderr", data: `[exec error] ${err.message}\n` }));
  child.on("close", (code, signal) => {
    write({ type: "exit", code: code ?? null, signal: signal ?? null });
    res.end();
  });
  req.on("close", () => {
    if (!child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  });
}

function runInPty(
  req: IncomingMessage,
  res: ServerResponse,
  cwd: string,
  cmd: string,
  body: ExecBody,
  write: (obj: unknown) => void,
  pty: NonNullable<typeof ptyModule>
): void {
  const shell = process.env.SHELL || "/bin/sh";
  const cols = Math.max(20, body.cols ?? 120);
  const rows = Math.max(5, body.rows ?? 30);
  let child: PtyLike;
  try {
    child = pty.spawn(shell, ["-lc", cmd], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM: "xterm-256color" },
    });
  } catch (err) {
    write({ type: "data", stream: "stderr", data: `[pty error] ${(err as Error).message}\n` });
    write({ type: "exit", code: 1, signal: null });
    res.end();
    return;
  }

  const id = newExecId();
  ptyRegistry.set(id, child);
  write({ type: "spawned", id });

  let finished = false;
  const cleanup = (): void => {
    if (finished) return;
    finished = true;
    ptyRegistry.delete(id);
    if (autoEnterTimer) {
      clearInterval(autoEnterTimer);
      autoEnterTimer = null;
    }
  };

  child.onData((chunk) => write({ type: "data", stream: "stdout", data: chunk }));

  let autoEnterTimer: ReturnType<typeof setInterval> | null = null;
  if (body.autoEnter && body.autoEnter.count > 0) {
    const { count, intervalMs } = body.autoEnter;
    let sent = 0;
    autoEnterTimer = setInterval(() => {
      if (finished) return;
      child.write("\r");
      sent += 1;
      if (sent >= count && autoEnterTimer) {
        clearInterval(autoEnterTimer);
        autoEnterTimer = null;
      }
    }, Math.max(50, intervalMs));
  }

  child.onExit(({ exitCode, signal }) => {
    cleanup();
    write({ type: "exit", code: exitCode ?? null, signal: signal ? String(signal) : null });
    res.end();
  });

  req.on("close", () => {
    if (finished) return;
    cleanup();
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  });
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

  middlewares.use("/__execStdin", (req, res) => {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }
    readJsonBody<{ id?: string; data?: string }>(req).then(
      (body) => {
        if (!body.id || typeof body.data !== "string") {
          sendJson(res, 400, { error: "missing id or data" });
          return;
        }
        const pty = ptyRegistry.get(body.id);
        if (!pty) {
          sendJson(res, 404, { error: "no such exec" });
          return;
        }
        try {
          pty.write(body.data);
          sendJson(res, 200, { ok: true });
        } catch (err) {
          sendJson(res, 500, { error: (err as Error).message });
        }
      },
      (err: Error) => sendJson(res, 400, { error: err.message })
    );
  });

  middlewares.use("/__execResize", (req, res) => {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }
    readJsonBody<{ id?: string; cols?: number; rows?: number }>(req).then(
      (body) => {
        if (!body.id || !body.cols || !body.rows) {
          sendJson(res, 400, { error: "missing id/cols/rows" });
          return;
        }
        const pty = ptyRegistry.get(body.id);
        if (!pty) {
          sendJson(res, 404, { error: "no such exec" });
          return;
        }
        try {
          pty.resize(Math.max(10, body.cols), Math.max(5, body.rows));
          sendJson(res, 200, { ok: true });
        } catch (err) {
          sendJson(res, 500, { error: (err as Error).message });
        }
      },
      (err: Error) => sendJson(res, 400, { error: err.message })
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

  middlewares.use("/__exec", (req, res) => {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }
    readJsonBody<{ cwd?: string; cmd?: string }>(req).then(
      (body) => handleExec(req, res, body),
      (err: Error) => sendJson(res, 400, { error: err.message })
    );
  });
}

export function devHost(): Plugin {
  return {
    name: "web-ide-dev-host",
    configureServer(server: ViteDevServer) {
      attach(server.middlewares);
    },
    configurePreviewServer(server: PreviewServer) {
      attach(server.middlewares);
    },
  };
}
