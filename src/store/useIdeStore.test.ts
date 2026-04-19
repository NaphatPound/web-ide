import { describe, it, expect, beforeEach } from "vitest";
import { useIdeStore } from "./useIdeStore";

describe("useIdeStore", () => {
  beforeEach(() => {
    useIdeStore.setState({
      mode: "vs_code",
      activeFile: "src/index.tsx",
      openFiles: ["src/index.tsx"],
      terminals: [{ id: "t1", title: "Term 1" }],
      rootName: null,
      rootPath: null,
      files: {
        "src/index.tsx": {
          path: "src/index.tsx",
          language: "typescript",
          content: "// seed\n",
        },
        "README.md": {
          path: "README.md",
          language: "markdown",
          content: "# Welcome\n",
        },
      },
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

  it("openFile adds to openFiles when not already open", () => {
    useIdeStore.getState().openFile("README.md");
    const s = useIdeStore.getState();
    expect(s.openFiles).toEqual(["src/index.tsx", "README.md"]);
    expect(s.activeFile).toBe("README.md");
  });

  it("openFile does not duplicate already-open files", () => {
    useIdeStore.getState().openFile("README.md");
    useIdeStore.getState().openFile("src/index.tsx");
    expect(useIdeStore.getState().openFiles).toEqual(["src/index.tsx", "README.md"]);
  });

  it("closeFile removes from openFiles and selects a neighbour", () => {
    useIdeStore.getState().openFile("README.md");
    useIdeStore.getState().closeFile("src/index.tsx");
    const s = useIdeStore.getState();
    expect(s.openFiles).toEqual(["README.md"]);
    expect(s.activeFile).toBe("README.md");
  });

  it("closeFile clears activeFile when last tab is closed", () => {
    useIdeStore.getState().closeFile("src/index.tsx");
    const s = useIdeStore.getState();
    expect(s.openFiles).toEqual([]);
    expect(s.activeFile).toBeNull();
  });

  it("updateFile marks the file dirty; markFileSaved clears it", () => {
    useIdeStore.getState().updateFile("README.md", "# edited");
    expect(useIdeStore.getState().files["README.md"].dirty).toBe(true);
    useIdeStore.getState().markFileSaved("README.md");
    expect(useIdeStore.getState().files["README.md"].dirty).toBe(false);
  });

  it("loadFolder resets openFiles to just the first file", () => {
    useIdeStore.getState().loadFolder("proj", {
      "proj/a": { path: "proj/a", language: "plaintext", content: "" },
      "proj/b": { path: "proj/b", language: "plaintext", content: "" },
    });
    const s = useIdeStore.getState();
    expect(s.openFiles).toEqual(["proj/a"]);
    expect(s.activeFile).toBe("proj/a");
  });
});
