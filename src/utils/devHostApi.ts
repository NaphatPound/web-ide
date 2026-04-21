import type { FileEntry } from "../store/useIdeStore";
import {
  termSocket,
  type ExecEvent,
  type ExecOptions,
} from "./termSocket";

export type { ExecEvent, ExecOptions } from "./termSocket";

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
  return listFolderFromHost(picked.path);
}

export async function listFolderFromHost(
  rootPath: string
): Promise<PickFolderResult> {
  const list = await fetch(`/__listFolder?path=${encodeURIComponent(rootPath)}`);
  if (!list.ok) throw new Error(`listFolder: HTTP ${list.status}`);
  return (await list.json()) as PickFolderResult;
}

export async function sendExecInput(id: string, data: string): Promise<void> {
  termSocket.stdin(id, data);
}

export async function sendExecResize(id: string, cols: number, rows: number): Promise<void> {
  termSocket.resize(id, cols, rows);
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

export async function readFileFromHost(
  rootPath: string,
  relPath: string
): Promise<string | null> {
  const res = await fetch(
    `/__readFile?rootPath=${encodeURIComponent(rootPath)}&relPath=${encodeURIComponent(relPath)}`
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const body = (await res.json()) as { content: string };
  return body.content;
}

export interface PathStat {
  exists: boolean;
  isDir?: boolean;
  isFile?: boolean;
  mtimeMs?: number;
  size?: number;
}

export async function statPathOnHost(
  rootPath: string,
  relPath: string
): Promise<PathStat> {
  const res = await fetch(
    `/__statPath?rootPath=${encodeURIComponent(rootPath)}&relPath=${encodeURIComponent(relPath)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as PathStat;
}

export interface DirEntry {
  name: string;
  isDir: boolean;
  isFile: boolean;
}

export async function listDirOnHost(
  rootPath: string,
  relPath: string
): Promise<DirEntry[]> {
  const res = await fetch(
    `/__listDir?rootPath=${encodeURIComponent(rootPath)}&relPath=${encodeURIComponent(relPath)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const body = (await res.json()) as { entries: DirEntry[] };
  return body.entries;
}

export async function renamePathOnHost(
  rootPath: string,
  fromRel: string,
  toRel: string
): Promise<void> {
  const res = await fetch("/__renamePath", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rootPath, fromRel, toRel }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}

export async function deletePathOnHost(
  rootPath: string,
  relPath: string
): Promise<void> {
  const res = await fetch("/__deletePath", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rootPath, relPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}

export async function createFolderOnHost(
  rootPath: string,
  relPath: string
): Promise<void> {
  const res = await fetch("/__createFolder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rootPath, relPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}

export async function deleteFileFromHost(
  rootPath: string,
  relPath: string
): Promise<void> {
  const res = await fetch("/__deleteFile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rootPath, relPath }),
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
  return new Promise<void>((resolve, reject) => {
    let execId: string | null = null;
    let settled = false;
    let abortedBeforeSpawn = false;
    const finish = (err?: Error): void => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };

    const handleEvent = (ev: ExecEvent): void => {
      if (ev.type === "spawned") {
        execId = ev.id;
        if (abortedBeforeSpawn) {
          termSocket.kill(ev.id);
          return;
        }
      }
      if (settled) return;
      onEvent(ev);
      if (ev.type === "exit") finish();
    };

    const onAbort = (): void => {
      if (execId) termSocket.kill(execId);
      else abortedBeforeSpawn = true;
      finish(new DOMException("Aborted", "AbortError"));
    };

    if (signal) {
      if (signal.aborted) {
        finish(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    termSocket
      .spawn(cwd, cmd, options, handleEvent)
      .then((id) => {
        execId = id;
      })
      .catch((err) => finish(err as Error));
  });
}
