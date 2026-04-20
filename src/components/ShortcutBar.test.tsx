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
      { id: "s1", name: "ls", command: "ls -la", type: "command" },
      { id: "s2", name: "status", command: "git status", type: "command" },
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

  it("type=command click sends command + CR to the active terminal", () => {
    const sender = vi.fn();
    registerTerminalSender("t1", sender);
    render(<ShortcutBar />);
    fireEvent.click(screen.getByTestId("shortcut-s1"));
    expect(sender).toHaveBeenCalledWith("ls -la\r");
  });

  it("type=text click sends command without CR", () => {
    useIdeStore.setState({
      shortcuts: [
        { id: "sx", name: "plain", command: "hello world", type: "text" },
      ],
    });
    const sender = vi.fn();
    registerTerminalSender("t1", sender);
    render(<ShortcutBar />);
    fireEvent.click(screen.getByTestId("shortcut-sx"));
    expect(sender).toHaveBeenCalledWith("hello world");
  });

  it("type=template click opens the template dialog, not the sender", () => {
    useIdeStore.setState({
      shortcuts: [
        {
          id: "sy",
          name: "delete pod",
          command: "kubectl delete pod {{name}}",
          type: "template",
        },
      ],
    });
    const sender = vi.fn();
    registerTerminalSender("t1", sender);
    render(<ShortcutBar />);
    fireEvent.click(screen.getByTestId("shortcut-sy"));
    expect(screen.getByTestId("shortcut-template-dialog")).toBeDefined();
    expect(sender).not.toHaveBeenCalled();
  });

  it("type=template dialog submission sends the filled command + CR", () => {
    useIdeStore.setState({
      shortcuts: [
        {
          id: "sy",
          name: "delete pod",
          command: "kubectl delete pod {{name}}",
          type: "template",
        },
      ],
    });
    const sender = vi.fn();
    registerTerminalSender("t1", sender);
    render(<ShortcutBar />);
    fireEvent.click(screen.getByTestId("shortcut-sy"));
    const input = screen.getByTestId("template-input-name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "api-7" } });
    fireEvent.click(screen.getByTestId("template-send"));
    expect(sender).toHaveBeenCalledWith("kubectl delete pod api-7\r");
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

  it("no longer renders the quick-add button", () => {
    render(<ShortcutBar />);
    expect(screen.queryByTestId("shortcut-quick-add")).toBeNull();
  });

  it("applies a type-specific color class to each button", () => {
    useIdeStore.setState({
      shortcuts: [
        { id: "c", name: "cmd", command: "ls", type: "command" },
        { id: "t", name: "txt", command: "hi", type: "text" },
        { id: "tp", name: "tpl", command: "echo {{x}}", type: "template" },
      ],
    });
    render(<ShortcutBar />);
    expect(screen.getByTestId("shortcut-c").className).toMatch(/sky/);
    expect(screen.getByTestId("shortcut-t").className).toMatch(/emerald/);
    expect(screen.getByTestId("shortcut-tp").className).toMatch(/violet/);
  });
});
