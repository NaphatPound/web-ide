import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { applyStartup, parseStartup, type StartupConfig } from "../utils/startup";
import { inTauri } from "../utils/tauriEnv";
import { useIdeStore } from "../store/useIdeStore";

const STARTUP_PATH = "/.ide-startup.yaml";

async function loadConfig(path: string): Promise<StartupConfig | null> {
  if (inTauri()) {
    const result = await invoke<StartupConfig | null>("read_startup_config");
    return result ?? null;
  }
  const res = await fetch(path);
  if (!res.ok) return null;
  return parseStartup(await res.text());
}

export function useStartupConfig(path: string = STARTUP_PATH) {
  const setMode = useIdeStore((s) => s.setMode);
  const openFile = useIdeStore((s) => s.openFile);
  const addTerminal = useIdeStore((s) => s.addTerminal);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await loadConfig(path);
        if (cancelled || !config) return;
        applyStartup(config, { setMode, openFile, addTerminal });
      } catch (err) {
        console.warn(`[ide] startup config skipped: ${(err as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, setMode, openFile, addTerminal]);
}
