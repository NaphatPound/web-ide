import { isTauri } from "@tauri-apps/api/core";

let cached: boolean | null = null;

export function inTauri(): boolean {
  if (cached === null) {
    try {
      cached = isTauri();
    } catch {
      cached = false;
    }
  }
  return cached;
}
