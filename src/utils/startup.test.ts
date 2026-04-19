import { describe, it, expect, vi } from "vitest";
import { parseStartup, applyStartup } from "./startup";

const sample = `
startup:
  - action: open_files
    files: ["src/index.tsx", "README.md"]
  - action: set_mode
    mode: vim
  - action: run_terminal
    commands:
      - title: Frontend
        cmd: npm run dev
      - title: Agent
        cmd: cline start
`;

describe("startup", () => {
  it("parses a valid config", () => {
    const cfg = parseStartup(sample);
    expect(cfg.startup).toHaveLength(3);
  });

  it("rejects invalid yaml", () => {
    expect(() => parseStartup("foo: bar")).toThrow(/missing 'startup'/);
  });

  it("rejects unknown actions", () => {
    expect(() =>
      parseStartup("startup:\n  - action: nuke\n")
    ).toThrow(/unknown startup action/);
  });

  it("applies steps to the runner in order", () => {
    const setMode = vi.fn();
    const openFile = vi.fn();
    const addTerminal = vi.fn(() => "id");
    applyStartup(parseStartup(sample), { setMode, openFile, addTerminal });
    expect(openFile).toHaveBeenCalledWith("src/index.tsx");
    expect(openFile).toHaveBeenCalledWith("README.md");
    expect(setMode).toHaveBeenCalledWith("vim");
    expect(addTerminal).toHaveBeenCalledWith("Frontend", "npm run dev");
    expect(addTerminal).toHaveBeenCalledWith("Agent", "cline start");
  });
});
