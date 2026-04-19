import { describe, it, expect, beforeEach } from "vitest";
import { useIdeStore } from "./useIdeStore";

describe("useIdeStore", () => {
  beforeEach(() => {
    useIdeStore.setState({
      mode: "vs_code",
      activeFile: "src/index.tsx",
      terminals: [{ id: "t1", title: "Term 1" }],
    });
  });

  it("toggles between vs_code and vim modes", () => {
    expect(useIdeStore.getState().mode).toBe("vs_code");
    useIdeStore.getState().toggleMode();
    expect(useIdeStore.getState().mode).toBe("vim");
    useIdeStore.getState().toggleMode();
    expect(useIdeStore.getState().mode).toBe("vs_code");
  });

  it("opens an existing file", () => {
    useIdeStore.getState().openFile("README.md");
    expect(useIdeStore.getState().activeFile).toBe("README.md");
  });

  it("ignores opening a missing file", () => {
    useIdeStore.getState().openFile("does/not/exist");
    expect(useIdeStore.getState().activeFile).toBe("src/index.tsx");
  });

  it("updates file content", () => {
    useIdeStore.getState().updateFile("README.md", "# new");
    expect(useIdeStore.getState().files["README.md"].content).toBe("# new");
  });

  it("adds and removes terminals", () => {
    const id = useIdeStore.getState().addTerminal("Build");
    expect(useIdeStore.getState().terminals.find((t) => t.id === id)).toBeDefined();
    useIdeStore.getState().removeTerminal(id);
    expect(useIdeStore.getState().terminals.find((t) => t.id === id)).toBeUndefined();
  });

  it("loads a folder and sets first file active", () => {
    useIdeStore.getState().loadFolder("demo-root", {
      "demo-root/a.ts": { path: "demo-root/a.ts", language: "typescript", content: "a" },
      "demo-root/b.ts": { path: "demo-root/b.ts", language: "typescript", content: "b" },
    });
    const s = useIdeStore.getState();
    expect(s.rootName).toBe("demo-root");
    expect(Object.keys(s.files)).toHaveLength(2);
    expect(s.activeFile).toBe("demo-root/a.ts");
  });

  it("stores rootPath when provided", () => {
    useIdeStore.getState().loadFolder(
      "proj",
      { "proj/a": { path: "proj/a", language: "plaintext", content: "" } },
      "/Users/me/proj"
    );
    expect(useIdeStore.getState().rootPath).toBe("/Users/me/proj");
  });

  it("startAiTerminals replaces terminals with 3 AI presets and flips layout", () => {
    useIdeStore.getState().startAiTerminals();
    const s = useIdeStore.getState();
    expect(s.terminals.map((t) => t.title)).toEqual(["gemini", "claude", "codex"]);
    expect(s.terminals.every((t) => typeof t.initialCmd === "string" && t.initialCmd.length > 0)).toBe(
      true
    );
    expect(s.preferredLayout).toBe("split");
    expect(s.layoutVersion).toBeGreaterThan(0);
  });

  it("addTerminal persists initialCmd when provided", () => {
    const id = useIdeStore.getState().addTerminal("Scripts", "npm run build");
    const entry = useIdeStore.getState().terminals.find((t) => t.id === id);
    expect(entry?.initialCmd).toBe("npm run build");
  });
});
