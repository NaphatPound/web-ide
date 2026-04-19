import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useModeHotkey } from "./useModeHotkey";
import { useIdeStore } from "../store/useIdeStore";

function press(opts: { alt?: boolean; shift?: boolean }) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "v",
      ctrlKey: true,
      altKey: !!opts.alt,
      shiftKey: !!opts.shift,
    })
  );
}

describe("useModeHotkey", () => {
  beforeEach(() => {
    useIdeStore.setState({ mode: "vs_code" });
  });

  it("toggles mode on Ctrl+Alt+V", () => {
    renderHook(() => useModeHotkey());
    press({ alt: true });
    expect(useIdeStore.getState().mode).toBe("vim");
    press({ alt: true });
    expect(useIdeStore.getState().mode).toBe("vs_code");
  });

  it("also toggles on Ctrl+Shift+V", () => {
    renderHook(() => useModeHotkey());
    press({ shift: true });
    expect(useIdeStore.getState().mode).toBe("vim");
  });

  it("does not toggle on plain V", () => {
    renderHook(() => useModeHotkey());
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "v" }));
    expect(useIdeStore.getState().mode).toBe("vs_code");
  });
});
