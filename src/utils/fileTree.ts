export type FileTreeNode =
  | { type: "file"; name: string; path: string }
  | { type: "dir"; name: string; path: string; children: FileTreeNode[] };

type DirMap = Map<string, DirMap | true>;

export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: DirMap = new Map();

  for (const raw of paths) {
    const parts = raw.split("/").filter((p) => p.length > 0);
    if (parts.length === 0) continue;
    let cursor = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i];
      const existing = cursor.get(name);
      let next: DirMap;
      if (existing instanceof Map) {
        next = existing;
      } else {
        next = new Map();
        cursor.set(name, next);
      }
      cursor = next;
    }
    const leaf = parts[parts.length - 1];
    if (!cursor.has(leaf)) cursor.set(leaf, true);
  }

  const toNodes = (dir: DirMap, prefix: string): FileTreeNode[] => {
    const entries = Array.from(dir.entries());
    entries.sort(([an, av], [bn, bv]) => {
      const aDir = av instanceof Map;
      const bDir = bv instanceof Map;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return an.localeCompare(bn, undefined, { sensitivity: "base" });
    });
    return entries.map(([name, val]) => {
      const path = prefix ? `${prefix}/${name}` : name;
      if (val instanceof Map) {
        return { type: "dir", name, path, children: toNodes(val, path) };
      }
      return { type: "file", name, path };
    });
  };

  return toNodes(root, "");
}

export function ancestorPaths(filePath: string): string[] {
  const parts = filePath.split("/");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    out.push(parts.slice(0, i).join("/"));
  }
  return out;
}
