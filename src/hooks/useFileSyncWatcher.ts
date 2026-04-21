import { useEffect } from "react";
import { useIdeStore } from "../store/useIdeStore";
import {
  isDevHostAvailable,
  readFileFromHost,
  statPathOnHost,
} from "../utils/devHostApi";

const POLL_MS = 1500;

function storeToRel(storePath: string, rootName: string): string | null {
  if (storePath === rootName) return null;
  if (storePath.startsWith(rootName + "/")) {
    return storePath.slice(rootName.length + 1);
  }
  return null;
}

export function useFileSyncWatcher(): void {
  useEffect(() => {
    if (!isDevHostAvailable()) return;
    let cancelled = false;
    const seenMtime = new Map<string, number>();

    const tick = async (): Promise<void> => {
      if (cancelled) return;
      const { files, openFiles, rootName, rootPath, syncFileFromDisk } =
        useIdeStore.getState();
      if (!rootName || !rootPath || openFiles.length === 0) return;

      for (const storePath of openFiles) {
        if (cancelled) return;
        const entry = files[storePath];
        if (!entry) continue;
        const rel = storeToRel(storePath, rootName);
        if (!rel) continue;
        let mtimeMs: number | undefined;
        try {
          const st = await statPathOnHost(rootPath, rel);
          if (!st.exists || !st.isFile || typeof st.mtimeMs !== "number") {
            continue;
          }
          mtimeMs = st.mtimeMs;
        } catch {
          continue;
        }
        const lastSeen = seenMtime.get(storePath) ?? entry.mtimeMs;
        if (lastSeen === undefined) {
          seenMtime.set(storePath, mtimeMs);
          continue;
        }
        if (mtimeMs <= lastSeen) {
          seenMtime.set(storePath, mtimeMs);
          continue;
        }
        seenMtime.set(storePath, mtimeMs);
        try {
          const content = await readFileFromHost(rootPath, rel);
          if (cancelled || content === null) continue;
          syncFileFromDisk(storePath, content, mtimeMs);
        } catch {
          // swallow transient read errors; next tick will retry
        }
      }
    };

    const id = setInterval(() => {
      void tick().catch(() => {
        // never let polling die due to an unexpected throw
      });
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
}
