import { describe, it, expect, vi, afterEach } from "vitest";
import { runExec, sendExecInput, sendExecResize, type ExecEvent } from "./devHostApi";

function streamingResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runExec", () => {
  it("parses newline-delimited JSON events", async () => {
    const events: ExecEvent[] = [];
    vi.spyOn(global, "fetch").mockResolvedValue(
      streamingResponse([
        '{"type":"data","stream":"stdout","data":"hi\\n"}\n',
        '{"type":"exit","code":0,"signal":null}\n',
      ])
    );
    await runExec("/tmp", "echo hi", (ev) => events.push(ev));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "data", data: "hi\n" });
    expect(events[1]).toMatchObject({ type: "exit", code: 0 });
  });

  it("handles chunked frames split across reads", async () => {
    const events: ExecEvent[] = [];
    vi.spyOn(global, "fetch").mockResolvedValue(
      streamingResponse([
        '{"type":"data","stream":"stdout","data":"par',
        'tial"}\n{"type":"exit","code":0,"signal":null}',
      ])
    );
    await runExec(null, "x", (ev) => events.push(ev));
    expect(events.map((e) => e.type)).toEqual(["data", "exit"]);
    expect((events[0] as { data: string }).data).toBe("partial");
  });

  it("throws on non-2xx", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("no", { status: 500 })
    );
    await expect(runExec(null, "x", () => {})).rejects.toThrow(/HTTP 500/);
  });

  it("surfaces spawned events with the exec id", async () => {
    const events: ExecEvent[] = [];
    vi.spyOn(global, "fetch").mockResolvedValue(
      streamingResponse([
        '{"type":"spawned","id":"abc-123"}\n',
        '{"type":"data","stream":"stdout","data":"hi"}\n',
        '{"type":"exit","code":0,"signal":null}\n',
      ])
    );
    await runExec("/tmp", "x", (ev) => events.push(ev));
    expect(events[0]).toEqual({ type: "spawned", id: "abc-123" });
  });
});

describe("sendExecInput / sendExecResize", () => {
  it("POSTs keystrokes to /__execStdin with id + data", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}"));
    await sendExecInput("abc-123", "\r");
    expect(spy).toHaveBeenCalledWith(
      "/__execStdin",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "abc-123", data: "\r" }),
      })
    );
  });

  it("POSTs resize to /__execResize", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}"));
    await sendExecResize("abc-123", 120, 30);
    expect(spy).toHaveBeenCalledWith(
      "/__execResize",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "abc-123", cols: 120, rows: 30 }),
      })
    );
  });
});
