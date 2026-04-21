import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  createFolderOnHost,
  deletePathOnHost,
  renamePathOnHost,
  runExec,
  sendExecInput,
  sendExecResize,
  writeFileToHost,
  type ExecEvent,
} from "./devHostApi";
import {
  __setWebSocketCtorForTests,
  __resetTermSocketForTests,
} from "./termSocket";

type Listener = (ev: unknown) => void;

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  private listeners = new Map<string, Set<Listener>>();
  OPEN = 1;
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => this.open());
  }

  addEventListener(type: string, cb: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }

  removeEventListener(type: string, cb: Listener): void {
    this.listeners.get(type)?.delete(cb);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.dispatch("close", {});
  }

  private open(): void {
    this.readyState = 1;
    this.dispatch("open", {});
  }

  private dispatch(type: string, ev: unknown): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const cb of set) cb(ev);
  }

  emitMessage(payload: unknown): void {
    this.dispatch("message", { data: JSON.stringify(payload) });
  }

  emitClose(): void {
    this.readyState = 3;
    this.dispatch("close", {});
  }
}

function latestSocket(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

function parseLatestSend(index = -1): Record<string, unknown> {
  const socket = latestSocket();
  const idx = index < 0 ? socket.sent.length + index : index;
  return JSON.parse(socket.sent[idx]) as Record<string, unknown>;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  MockWebSocket.instances = [];
  __setWebSocketCtorForTests(MockWebSocket as unknown as typeof WebSocket);
  __resetTermSocketForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  __setWebSocketCtorForTests(null);
  __resetTermSocketForTests();
});

describe("runExec (over WebSocket)", () => {
  it("sends a spawn op and forwards spawned/data/exit events", async () => {
    const events: ExecEvent[] = [];
    const done = runExec("/tmp", "echo hi", (ev) => events.push(ev), undefined, {
      tty: true,
      cols: 80,
      rows: 24,
    });

    await flush();
    const sock = latestSocket();
    const spawnMsg = JSON.parse(sock.sent[0]) as Record<string, unknown>;
    expect(spawnMsg.op).toBe("spawn");
    expect(spawnMsg.cmd).toBe("echo hi");
    expect(spawnMsg.cwd).toBe("/tmp");
    expect(spawnMsg.tty).toBe(true);
    const localId = spawnMsg.localId as string;

    sock.emitMessage({ event: "spawned", localId, execId: "exec-1" });
    sock.emitMessage({ event: "data", execId: "exec-1", stream: "stdout", data: "hi\n" });
    sock.emitMessage({ event: "exit", execId: "exec-1", code: 0, signal: null });

    await done;
    expect(events.map((e) => e.type)).toEqual(["spawned", "data", "exit"]);
    expect(events[0]).toEqual({ type: "spawned", id: "exec-1" });
    expect(events[1]).toMatchObject({ type: "data", data: "hi\n" });
    expect(events[2]).toMatchObject({ type: "exit", code: 0 });
  });

  it("rejects on spawn-error", async () => {
    const p = runExec(null, "x", () => {});
    await flush();
    const sock = latestSocket();
    const localId = (JSON.parse(sock.sent[0]) as { localId: string }).localId;
    sock.emitMessage({ event: "spawn-error", localId, error: "boom" });
    await expect(p).rejects.toThrow(/boom/);
  });

  it("sends a kill op and rejects with AbortError when aborted", async () => {
    const controller = new AbortController();
    const p = runExec(null, "sleep 9999", () => {}, controller.signal);
    await flush();
    const sock = latestSocket();
    const localId = (JSON.parse(sock.sent[0]) as { localId: string }).localId;
    sock.emitMessage({ event: "spawned", localId, execId: "exec-kill" });
    await flush();

    controller.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    const killMsg = parseLatestSend();
    expect(killMsg).toEqual({ op: "kill", execId: "exec-kill" });
  });
});

describe("sendExecInput / sendExecResize (over WebSocket)", () => {
  it("sends a stdin op to the existing socket", async () => {
    runExec(null, "sh", () => {}).catch(() => {});
    await flush();
    const sock = latestSocket();
    const localId = (JSON.parse(sock.sent[0]) as { localId: string }).localId;
    sock.emitMessage({ event: "spawned", localId, execId: "exec-123" });
    await flush();

    await sendExecInput("exec-123", "\r");
    expect(parseLatestSend()).toEqual({ op: "stdin", execId: "exec-123", data: "\r" });
  });

  it("sends a resize op to the existing socket", async () => {
    runExec(null, "sh", () => {}).catch(() => {});
    await flush();
    const sock = latestSocket();
    const localId = (JSON.parse(sock.sent[0]) as { localId: string }).localId;
    sock.emitMessage({ event: "spawned", localId, execId: "exec-123" });
    await flush();

    await sendExecResize("exec-123", 120, 30);
    expect(parseLatestSend()).toEqual({ op: "resize", execId: "exec-123", cols: 120, rows: 30 });
  });

  it("reuses a single WebSocket across multiple terminals in a tab", async () => {
    const a = runExec(null, "sh", () => {});
    await flush();
    const b = runExec(null, "bash", () => {});
    await flush();
    expect(MockWebSocket.instances).toHaveLength(1);
    const sock = latestSocket();
    const spawnA = JSON.parse(sock.sent[0]) as { localId: string };
    const spawnB = JSON.parse(sock.sent[1]) as { localId: string };
    sock.emitMessage({ event: "spawned", localId: spawnA.localId, execId: "a" });
    sock.emitMessage({ event: "spawned", localId: spawnB.localId, execId: "b" });
    sock.emitMessage({ event: "exit", execId: "a", code: 0, signal: null });
    sock.emitMessage({ event: "exit", execId: "b", code: 0, signal: null });
    await a;
    await b;
  });
});

describe("writeFileToHost", () => {
  it("POSTs rootPath/relPath/content and resolves on 200", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    await writeFileToHost("/Users/me/proj", "src/a.ts", "export const x = 1\n");
    expect(spy).toHaveBeenCalledWith(
      "/__writeFile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          rootPath: "/Users/me/proj",
          relPath: "src/a.ts",
          content: "export const x = 1\n",
        }),
      })
    );
  });

  it("throws a descriptive error on non-2xx", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response('{"error":"path escapes workspace root"}', { status: 403 })
    );
    await expect(writeFileToHost("/a", "b", "x")).rejects.toThrow(/escapes/);
  });
});

describe("renamePathOnHost", () => {
  it("POSTs rootPath/fromRel/toRel and resolves on 200", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    await renamePathOnHost("/Users/me/proj", "src/foo.ts", "src/bar.ts");
    expect(spy).toHaveBeenCalledWith(
      "/__renamePath",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          rootPath: "/Users/me/proj",
          fromRel: "src/foo.ts",
          toRel: "src/bar.ts",
        }),
      })
    );
  });

  it("throws on 404 source not found", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response('{"error":"source not found"}', { status: 404 })
    );
    await expect(renamePathOnHost("/a", "x", "y")).rejects.toThrow(/not found/);
  });
});

describe("deletePathOnHost", () => {
  it("POSTs rootPath/relPath and resolves on 200", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    await deletePathOnHost("/Users/me/proj", "src/old-folder");
    expect(spy).toHaveBeenCalledWith(
      "/__deletePath",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          rootPath: "/Users/me/proj",
          relPath: "src/old-folder",
        }),
      })
    );
  });

  it("throws when the server forbids deleting the root", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response('{"error":"cannot delete workspace root"}', { status: 400 })
    );
    await expect(deletePathOnHost("/a", "")).rejects.toThrow(/workspace root/);
  });
});

describe("createFolderOnHost", () => {
  it("POSTs rootPath/relPath and resolves on 200", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    await createFolderOnHost("/Users/me/proj", "docs/guides");
    expect(spy).toHaveBeenCalledWith(
      "/__createFolder",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          rootPath: "/Users/me/proj",
          relPath: "docs/guides",
        }),
      })
    );
  });

  it("throws a descriptive error on non-2xx", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response('{"error":"path escapes workspace root"}', { status: 403 })
    );
    await expect(createFolderOnHost("/a", "../../evil")).rejects.toThrow(/escapes/);
  });
});
