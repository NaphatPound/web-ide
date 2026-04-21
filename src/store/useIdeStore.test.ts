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

  it("renamePath renames a single file and updates activeFile/openFiles", () => {
    useIdeStore.getState().openFile("README.md");
    useIdeStore.getState().renamePath("README.md", "README.rst");
    const s = useIdeStore.getState();
    expect(s.files["README.md"]).toBeUndefined();
    expect(s.files["README.rst"]).toMatchObject({ path: "README.rst" });
    expect(s.activeFile).toBe("README.rst");
    expect(s.openFiles).toContain("README.rst");
  });

  it("renamePath rewrites every descendant when a folder is renamed", () => {
    useIdeStore.setState({
      files: {
        "proj/src/a.ts": { path: "proj/src/a.ts", language: "typescript", content: "a" },
        "proj/src/sub/b.ts": { path: "proj/src/sub/b.ts", language: "typescript", content: "b" },
        "proj/other.ts": { path: "proj/other.ts", language: "typescript", content: "x" },
      },
      activeFile: "proj/src/sub/b.ts",
      openFiles: ["proj/src/a.ts", "proj/src/sub/b.ts"],
    });
    useIdeStore.getState().renamePath("proj/src", "proj/lib");
    const s = useIdeStore.getState();
    expect(Object.keys(s.files).sort()).toEqual([
      "proj/lib/a.ts",
      "proj/lib/sub/b.ts",
      "proj/other.ts",
    ]);
    expect(s.activeFile).toBe("proj/lib/sub/b.ts");
    expect(s.openFiles).toEqual(["proj/lib/a.ts", "proj/lib/sub/b.ts"]);
  });

  it("renamePath is a no-op when old equals new", () => {
    const before = useIdeStore.getState().files;
    useIdeStore.getState().renamePath("README.md", "README.md");
    expect(useIdeStore.getState().files).toBe(before);
  });

  it("removePath deletes a single file and closes its tab", () => {
    useIdeStore.getState().openFile("README.md");
    useIdeStore.getState().removePath("README.md");
    const s = useIdeStore.getState();
    expect(s.files["README.md"]).toBeUndefined();
    expect(s.openFiles).not.toContain("README.md");
    expect(s.activeFile).toBe("src/index.tsx");
  });

  it("removePath drops every descendant when a folder is deleted", () => {
    useIdeStore.setState({
      files: {
        "proj/src/a.ts": { path: "proj/src/a.ts", language: "typescript", content: "a" },
        "proj/src/sub/b.ts": { path: "proj/src/sub/b.ts", language: "typescript", content: "b" },
        "proj/keep.ts": { path: "proj/keep.ts", language: "typescript", content: "x" },
      },
      activeFile: "proj/src/sub/b.ts",
      openFiles: ["proj/src/a.ts", "proj/src/sub/b.ts", "proj/keep.ts"],
    });
    useIdeStore.getState().removePath("proj/src");
    const s = useIdeStore.getState();
    expect(Object.keys(s.files)).toEqual(["proj/keep.ts"]);
    expect(s.openFiles).toEqual(["proj/keep.ts"]);
    expect(s.activeFile).toBe("proj/keep.ts");
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
