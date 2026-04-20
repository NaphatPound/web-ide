import { describe, it, expect, beforeEach } from "vitest";
import { useIdeStore } from "./useIdeStore";

const STORAGE_KEY = "web-ide:shortcuts";

beforeEach(() => {
  window.localStorage.clear();
  useIdeStore.setState({ shortcuts: [] });
});

describe("shortcuts store", () => {
  it("addShortcut appends and persists to localStorage", () => {
    const id = useIdeStore.getState().addShortcut("deploy", "npm run deploy");
    const shortcuts = useIdeStore.getState().shortcuts;
    expect(shortcuts).toHaveLength(1);
    expect(shortcuts[0]).toMatchObject({
      id,
      name: "deploy",
      command: "npm run deploy",
      type: "command",
    });
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual(shortcuts);
  });

  it("addShortcut accepts an explicit type", () => {
    useIdeStore.getState().addShortcut("hello", "echo {{who}}", "template");
    expect(useIdeStore.getState().shortcuts[0].type).toBe("template");
  });

  it("updateShortcut can change the type", () => {
    const id = useIdeStore.getState().addShortcut("raw", "text only");
    useIdeStore.getState().updateShortcut(id, { type: "text" });
    expect(useIdeStore.getState().shortcuts[0].type).toBe("text");
  });

  it("updateShortcut changes only the named fields", () => {
    const id = useIdeStore.getState().addShortcut("build", "npm run build");
    useIdeStore.getState().updateShortcut(id, { command: "pnpm build" });
    const entry = useIdeStore.getState().shortcuts.find((s) => s.id === id);
    expect(entry).toMatchObject({ name: "build", command: "pnpm build" });
  });

  it("updateShortcut can rename without touching the command", () => {
    const id = useIdeStore.getState().addShortcut("test", "npm test");
    useIdeStore.getState().updateShortcut(id, { name: "unit test" });
    const entry = useIdeStore.getState().shortcuts.find((s) => s.id === id);
    expect(entry).toMatchObject({ name: "unit test", command: "npm test" });
  });

  it("removeShortcut deletes the row and syncs localStorage", () => {
    const keepId = useIdeStore.getState().addShortcut("a", "echo a");
    const dropId = useIdeStore.getState().addShortcut("b", "echo b");
    useIdeStore.getState().removeShortcut(dropId);
    const shortcuts = useIdeStore.getState().shortcuts;
    expect(shortcuts.map((s) => s.id)).toEqual([keepId]);
    const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEY) as string);
    expect(persisted.map((s: { id: string }) => s.id)).toEqual([keepId]);
  });
});

describe("activeTerminalId invariants", () => {
  beforeEach(() => {
    useIdeStore.setState({
      terminals: [{ id: "t1", title: "Term 1" }],
      activeTerminalId: "t1",
    });
  });

  it("addTerminal switches active to the new terminal", () => {
    const id = useIdeStore.getState().addTerminal("Build");
    expect(useIdeStore.getState().activeTerminalId).toBe(id);
  });

  it("removeTerminal moves active to the first remaining when removing the active one", () => {
    const id = useIdeStore.getState().addTerminal("Build");
    useIdeStore.getState().removeTerminal(id);
    expect(useIdeStore.getState().activeTerminalId).toBe("t1");
  });

  it("removeTerminal leaves a non-active terminal's active id untouched", () => {
    useIdeStore.getState().addTerminal("Build");
    useIdeStore.setState({ activeTerminalId: "t1" });
    useIdeStore.getState().removeTerminal(
      useIdeStore.getState().terminals.find((t) => t.title === "Build")!.id
    );
    expect(useIdeStore.getState().activeTerminalId).toBe("t1");
  });

  it("removeTerminal clears active id when no terminals remain", () => {
    useIdeStore.setState({
      terminals: [{ id: "only", title: "solo" }],
      activeTerminalId: "only",
    });
    useIdeStore.getState().removeTerminal("only");
    expect(useIdeStore.getState().activeTerminalId).toBeNull();
  });

  it("startAiTerminals sets active to the first AI terminal", () => {
    useIdeStore.getState().startAiTerminals();
    const s = useIdeStore.getState();
    expect(s.activeTerminalId).toBe(s.terminals[0].id);
  });
});
