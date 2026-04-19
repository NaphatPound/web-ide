import { parse as parseYaml } from "yaml";
import type { Mode } from "../store/useIdeStore";

export type StartupAction =
  | { action: "open_files"; files: string[] }
  | { action: "set_mode"; mode: Mode }
  | {
      action: "run_terminal";
      commands: { title: string; cmd: string }[];
    };

export interface StartupConfig {
  startup: StartupAction[];
}

export function parseStartup(yaml: string): StartupConfig {
  const parsed = parseYaml(yaml);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as { startup?: unknown }).startup)
  ) {
    throw new Error("invalid .ide-startup.yaml: missing 'startup' list");
  }
  const config = parsed as StartupConfig;
  for (const step of config.startup) {
    if (!step || typeof step !== "object" || !("action" in step)) {
      throw new Error("invalid startup step: missing 'action'");
    }
    if (
      step.action !== "open_files" &&
      step.action !== "set_mode" &&
      step.action !== "run_terminal"
    ) {
      throw new Error(`unknown startup action: ${(step as { action: string }).action}`);
    }
  }
  return config;
}

export interface StartupRunner {
  setMode: (mode: Mode) => void;
  openFile: (path: string) => void;
  addTerminal: (title: string, initialCmd?: string) => string;
}

export function applyStartup(
  config: StartupConfig,
  runner: StartupRunner
): void {
  for (const step of config.startup) {
    switch (step.action) {
      case "set_mode":
        runner.setMode(step.mode);
        break;
      case "open_files":
        step.files.forEach((f) => runner.openFile(f));
        break;
      case "run_terminal":
        step.commands.forEach((c) => runner.addTerminal(c.title, c.cmd));
        break;
    }
  }
}
