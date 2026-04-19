import { describe, it, expect } from "vitest";
import { ancestorPaths, buildFileTree } from "./fileTree";

describe("buildFileTree", () => {
  it("returns folders before files, alphabetically", () => {
    const tree = buildFileTree([
      "proj/README.md",
      "proj/src/index.ts",
      "proj/src/App.tsx",
      "proj/src/components/Button.tsx",
      "proj/package.json",
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ type: "dir", name: "proj" });
    const proj = tree[0] as { children: unknown[] };
    const names = (proj.children as Array<{ type: string; name: string }>).map((c) => `${c.type}:${c.name}`);
    expect(names).toEqual(["dir:src", "file:package.json", "file:README.md"]);
  });

  it("nests arbitrarily deep", () => {
    const tree = buildFileTree(["a/b/c/d/e.txt"]);
    let node = tree[0] as { type: string; name: string; children?: unknown[] };
    const trail = [node.name];
    while (node.type === "dir" && node.children) {
      node = (node.children as Array<typeof node>)[0];
      trail.push(node.name);
    }
    expect(trail).toEqual(["a", "b", "c", "d", "e.txt"]);
  });

  it("ignores empty segments", () => {
    const tree = buildFileTree(["", "proj//README.md"]);
    expect(tree[0]).toMatchObject({ name: "proj" });
  });
});

describe("ancestorPaths", () => {
  it("returns each ancestor folder path up to the file", () => {
    expect(ancestorPaths("proj/src/components/Button.tsx")).toEqual([
      "proj",
      "proj/src",
      "proj/src/components",
    ]);
  });

  it("returns empty for a top-level file", () => {
    expect(ancestorPaths("README.md")).toEqual([]);
  });
});
