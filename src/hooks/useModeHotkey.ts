import { useEffect } from "react";
import { useIdeStore } from "../store/useIdeStore";

export function useModeHotkey() {
  const toggleMode = useIdeStore((s) => s.toggleMode);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const isToggle =
        mod && (e.altKey || e.shiftKey) && e.key.toLowerCase() === "v";
      if (isToggle) {
        e.preventDefault();
        toggleMode();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleMode]);
}
