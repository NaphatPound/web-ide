import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ShortcutManager from "./ShortcutManager";
import { useIdeStore } from "../store/useIdeStore";

beforeEach(() => {
  window.localStorage.clear();
  useIdeStore.setState({
    shortcuts: [
      { id: "s1", name: "ls", command: "ls -la" },
      { id: "s2", name: "status", command: "git status" },
    ],
  });
});

describe("ShortcutManager", () => {
  it("edits a shortcut's command via the input field", () => {
    render(<ShortcutManager onClose={() => {}} />);
    const input = screen.getByTestId("shortcut-cmd-s1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ls -lah" } });
    const updated = useIdeStore.getState().shortcuts.find((s) => s.id === "s1");
    expect(updated?.command).toBe("ls -lah");
  });

  it("renames a shortcut via the name input", () => {
    render(<ShortcutManager onClose={() => {}} />);
    const input = screen.getByTestId("shortcut-name-s2") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Git" } });
    const updated = useIdeStore.getState().shortcuts.find((s) => s.id === "s2");
    expect(updated?.name).toBe("Git");
  });

  it("deletes a shortcut", () => {
    render(<ShortcutManager onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("shortcut-delete-s1"));
    const ids = useIdeStore.getState().shortcuts.map((s) => s.id);
    expect(ids).toEqual(["s2"]);
  });

  it("adds a new shortcut", () => {
    render(<ShortcutManager onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("shortcut-manager-add"));
    expect(useIdeStore.getState().shortcuts).toHaveLength(3);
  });

  it("calls onClose when the × button is pressed", () => {
    const onClose = vi.fn();
    render(<ShortcutManager onClose={onClose} />);
    fireEvent.click(screen.getByTestId("shortcut-manager-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<ShortcutManager onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
