import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerTerminalSender,
  sendToTerminal,
  hasTerminalSender,
  __resetTerminalBusForTests,
} from "./terminalBus";

beforeEach(() => {
  __resetTerminalBusForTests();
});

describe("terminalBus", () => {
  it("returns false when no sender is registered for the id", () => {
    expect(sendToTerminal("missing", "hi")).toBe(false);
    expect(hasTerminalSender("missing")).toBe(false);
  });

  it("routes text to the registered sender for that id", () => {
    const a = vi.fn();
    const b = vi.fn();
    registerTerminalSender("t-a", a);
    registerTerminalSender("t-b", b);
    expect(sendToTerminal("t-a", "alpha")).toBe(true);
    expect(sendToTerminal("t-b", "beta")).toBe(true);
    expect(a).toHaveBeenCalledWith("alpha");
    expect(b).toHaveBeenCalledWith("beta");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("unregister removes the sender only if it still matches", () => {
    const firstSender = vi.fn();
    const secondSender = vi.fn();
    const unregisterFirst = registerTerminalSender("t-a", firstSender);
    registerTerminalSender("t-a", secondSender);
    unregisterFirst();
    expect(hasTerminalSender("t-a")).toBe(true);
    sendToTerminal("t-a", "x");
    expect(secondSender).toHaveBeenCalledWith("x");
    expect(firstSender).not.toHaveBeenCalled();
  });

  it("unregister cleans up when called with the current sender", () => {
    const sender = vi.fn();
    const unregister = registerTerminalSender("t-a", sender);
    unregister();
    expect(hasTerminalSender("t-a")).toBe(false);
    expect(sendToTerminal("t-a", "x")).toBe(false);
  });
});
