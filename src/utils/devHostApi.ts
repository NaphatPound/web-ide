import type { FileEntry } from "../store/useIdeStore";

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

export interface PickFolderResult {
  rootName: string;
  rootPath: string;
  files: Record<string, FileEntry>;
}

export function isDevHostAvailable(): boolean {
  return typeof window !== "undefined" && window.location.protocol.startsWith("http");
}

export async function pickFolderFromHost(): Promise<PickFolderResult | null> {
  const pick = await fetch("/__pickFolder", { method: "POST" });
  if (pick.status === 501 || pick.status === 404) return null;
  if (!pick.ok) throw new Error(`pickFolder: HTTP ${pick.status}`);
  const picked = (await pick.json()) as
    | { cancelled: true }
    | { path: string; name: string };
  if ("cancelled" in picked) return null;
  const list = await fetch(
    `/__listFolder?path=${encodeURIComponent(picked.path)}`
  );
  if (!list.ok) throw new Error(`listFolder: HTTP ${list.status}`);
  const listed = (await list.json()) as {
    rootName: string;
    rootPath: string;
    files: Record<string, FileEntry>;
  };
  return listed;
}

export interface ExecOptions {
  tty?: boolean;
  cols?: number;
  rows?: number;
  autoEnter?: { count: number; intervalMs: number };
}

export async function sendExecInput(id: string, data: string): Promise<void> {
  await fetch("/__execStdin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, data }),
  }).catch(() => {});
}

export async function sendExecResize(id: string, cols: number, rows: number): Promise<void> {
  await fetch("/__execResize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, cols, rows }),
  }).catch(() => {});
}

export async function writeFileToHost(
  rootPath: string,
  relPath: string,
  content: string
): Promise<void> {
  const res = await fetch("/__writeFile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rootPath, relPath, content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}

export async function runExec(
  cwd: string | null,
  cmd: string,
  onEvent: (ev: ExecEvent) => void,
  signal?: AbortSignal,
  options: ExecOptions = {}
): Promise<void> {
  const res = await fetch("/__exec", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cwd, cmd, ...options }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`/__exec HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf("\n");
    while (idx !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.trim().length > 0) {
        try {
          onEvent(JSON.parse(line) as ExecEvent);
        } catch {
          // ignore malformed line
        }
      }
      idx = buffer.indexOf("\n");
    }
  }
  if (buffer.trim().length > 0) {
    try {
      onEvent(JSON.parse(buffer) as ExecEvent);
    } catch {
      // ignore
    }
  }
}
