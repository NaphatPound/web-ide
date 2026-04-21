import { describe, it, expect, beforeEach } from "vitest";
import { useIdeStore } from "./useIdeStore";

describe("useIdeStore.autoDev", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useIdeStore.setState({
      autoDev: {
        running: false,
        phase: "idle",
        iter: 0,
        maxIter: 3,
        roleIds: { sa: null, dev: null, qa: null },
        log: [],
        error: null,
      },
    });
  });

  it("setAutoDevMaxIter clamps to [1, 20] and persists to localStorage", () => {
    useIdeStore.getState().setAutoDevMaxIter(50);
    expect(useIdeStore.getState().autoDev.maxIter).toBe(20);
    expect(window.localStorage.getItem("web-ide:autoDevMaxIter")).toBe("20");

    useIdeStore.getState().setAutoDevMaxIter(0);
    expect(useIdeStore.getState().autoDev.maxIter).toBe(1);

    useIdeStore.getState().setAutoDevMaxIter(5);
    expect(useIdeStore.getState().autoDev.maxIter).toBe(5);
  });

  it("setAutoDev merges partial state without clobbering unspecified keys", () => {
    useIdeStore.getState().setAutoDev({ running: true, phase: "sa" });
    const s = useIdeStore.getState().autoDev;
    expect(s.running).toBe(true);
    expect(s.phase).toBe("sa");
    expect(s.maxIter).toBe(3);
    expect(s.iter).toBe(0);
  });

  it("pushAutoDevLog appends entries and caps at 500", () => {
    const push = useIdeStore.getState().pushAutoDevLog;
    for (let i = 0; i < 510; i += 1) push("info", `msg-${i}`);
    const log = useIdeStore.getState().autoDev.log;
    expect(log).toHaveLength(500);
    expect(log[0].message).toBe("msg-10");
    expect(log[499].message).toBe("msg-509");
    expect(log[0].level).toBe("info");
  });

  it("pushAutoDevLog respects severity levels", () => {
    useIdeStore.getState().pushAutoDevLog("warn", "hi");
    useIdeStore.getState().pushAutoDevLog("error", "bad");
    const log = useIdeStore.getState().autoDev.log;
    expect(log[0].level).toBe("warn");
    expect(log[1].level).toBe("error");
  });

  it("resetAutoDevLog clears entries", () => {
    useIdeStore.getState().pushAutoDevLog("info", "a");
    useIdeStore.getState().pushAutoDevLog("info", "b");
    expect(useIdeStore.getState().autoDev.log).toHaveLength(2);
    useIdeStore.getState().resetAutoDevLog();
    expect(useIdeStore.getState().autoDev.log).toHaveLength(0);
  });
});
