import { describe, it, expect } from "vitest";
import { snapshotContext, buildContextPrompt } from "./contextApi";

const state = {
  files: {
    "a.ts": { path: "a.ts", language: "typescript", content: "" },
    "b.md": { path: "b.md", language: "markdown", content: "" },
  },
  activeFile: "a.ts",
};

describe("contextApi", () => {
  it("snapshots active file context", () => {
    const ctx = snapshotContext(state);
    expect(ctx.activeFile).toBe("a.ts");
    expect(ctx.language).toBe("typescript");
    expect(ctx.fileCount).toBe(2);
    expect(ctx.openFiles).toEqual(["a.ts", "b.md"]);
  });

  it("builds a deterministic prompt", () => {
    expect(buildContextPrompt(state)).toContain("active_file: a.ts");
    expect(buildContextPrompt(state)).toContain("language:    typescript");
  });

  it("handles no active file", () => {
    const ctx = snapshotContext({ ...state, activeFile: null });
    expect(ctx.activeFile).toBeNull();
    expect(ctx.language).toBeNull();
    expect(ctx.excerpt).toBe("");
  });

  it("includes a code excerpt capped at 40 lines", () => {
    const long = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    const s = {
      files: { "x.ts": { path: "x.ts", language: "typescript", content: long } },
      activeFile: "x.ts",
    };
    const ctx = snapshotContext(s);
    expect(ctx.excerpt.split("\n")).toHaveLength(40);
    expect(ctx.excerpt).toContain("line 0");
    expect(ctx.excerpt).not.toContain("line 40");

    const prompt = buildContextPrompt(s);
    expect(prompt).toContain("--- x.ts (first 40 lines) ---");
    expect(prompt).toContain("line 39");
  });
});
