import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useStartupConfig } from "./useStartupConfig";
import { useIdeStore } from "../store/useIdeStore";

const yaml = `
startup:
  - action: set_mode
    mode: vim
  - action: run_terminal
    commands:
      - title: "BootTerm"
        cmd: "echo hi"
`;

describe("useStartupConfig", () => {
  beforeEach(() => {
    useIdeStore.setState({
      mode: "vs_code",
      terminals: [{ id: "t1", title: "Term 1" }],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies startup config fetched from public dir", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(yaml, { status: 200, headers: { "content-type": "text/yaml" } })
        )
      )
    );
    renderHook(() => useStartupConfig());
    await waitFor(() => {
      expect(useIdeStore.getState().mode).toBe("vim");
    });
    expect(
      useIdeStore.getState().terminals.some((t) => t.title === "BootTerm")
    ).toBe(true);
  });

  it("silently no-ops when the file is absent (404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 404 })))
    );
    renderHook(() => useStartupConfig());
    await new Promise((r) => setTimeout(r, 10));
    expect(useIdeStore.getState().mode).toBe("vs_code");
  });

  it("warns but does not throw on invalid yaml", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response("not: valid", { status: 200 }))
      )
    );
    renderHook(() => useStartupConfig());
    await waitFor(() => {
      expect(warn).toHaveBeenCalled();
    });
    warn.mockRestore();
  });
});
