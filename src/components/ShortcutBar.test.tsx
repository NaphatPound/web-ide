import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ShortcutBar from "./ShortcutBar";
import { useIdeStore } from "../store/useIdeStore";
import {
  registerTerminalSender,
  __resetTerminalBusForTests,
} from "../utils/terminalBus";

beforeEach(() => {
  __resetTerminalBusForTests();
  useIdeStore.setState({
    terminals: [{ id: "t1", title: "Term 1" }],
    activeTerminalId: "t1",
    shortcuts: [
      { id: "s1", name: "ls", command: "ls -la" },
      { id: "s2", name: "status", command: "git status" },
    ],
  });
});

afterEach(() => {
  __resetTerminalBusForTests();
});

describe("ShortcutBar", () => {
  it("renders one button per shortcut", () => {
    render(<ShortcutBar />);
    expect(screen.getByTestId("shortcut-s1")).toHaveTextContent("ls");
    expect(screen.getByTestId("shortcut-s2")).toHaveTextContent("status");
  });

  it("clicking a shortcut sends the command + CR to the active terminal", () => {
    const sender = vi.fn();
    registerTerminalSender("t1", sender);
    render(<ShortcutBar />);
    fireEvent.click(screen.getByTestId("shortcut-s1"));
    expect(sender).toHaveBeenCalledWith("ls -la\r");
  });

  it("disables buttons when there is no active terminal", () => {
    useIdeStore.setState({ terminals: [], activeTerminalId: null });
    render(<ShortcutBar />);
    const btn = screen.getByTestId("shortcut-s1") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("opens the manager dialog when Manage is clicked", () => {
    render(<ShortcutBar />);
    fireEvent.click(screen.getByTestId("shortcut-manage"));
    expect(screen.getByTestId("shortcut-manager")).toBeDefined();
  });
});
