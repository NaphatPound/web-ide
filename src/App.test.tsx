import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { useIdeStore } from "./store/useIdeStore";

vi.mock("@monaco-editor/react", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-monaco" />,
}));
vi.mock("monaco-vim", () => ({
  initVimMode: () => ({ dispose: () => {} }),
}));
vi.mock("./components/Terminal/TerminalTab", async () => {
  const react = await import("react");
  const mounts: Record<string, number> = {};
  const Mock = ({ id }: { id: string }) => {
    const [seq] = react.useState(() => {
      mounts[id] = (mounts[id] ?? 0) + 1;
      return mounts[id];
    });
    return <div data-testid={`mock-term-${id}`} data-mount-seq={String(seq)} />;
  };
  return { __esModule: true, default: Mock };
});
vi.mock("./hooks/useStartupConfig", () => ({
  useStartupConfig: () => {},
}));

const App = (await import("./App")).default;

describe("App mode toggle stability", () => {
  beforeEach(() => {
    useIdeStore.setState({
      mode: "vs_code",
      terminals: [{ id: "t1", title: "Term 1" }],
      activeFile: "README.md",
      preferredLayout: "tabs",
      layoutVersion: 0,
    });
  });

  it("keeps terminal DOM node mounted across mode toggles", () => {
    const { getByTestId } = render(<App />);
    const panelBefore = getByTestId("terminal-panel");
    const termBefore = getByTestId("mock-term-t1");
    act(() => {
      useIdeStore.getState().toggleMode();
    });
    act(() => {
      useIdeStore.getState().toggleMode();
    });
    const panelAfter = getByTestId("terminal-panel");
    const termAfter = getByTestId("mock-term-t1");
    expect(panelAfter).toBe(panelBefore);
    expect(termAfter).toBe(termBefore);
    expect(termAfter.getAttribute("data-mount-seq")).toBe(
      termBefore.getAttribute("data-mount-seq")
    );
  });

  it("reflects mode via data-mode attribute on the root", () => {
    const { container } = render(<App />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-mode")).toBe("vs_code");
    act(() => {
      useIdeStore.getState().toggleMode();
    });
    expect(root.getAttribute("data-mode")).toBe("vim");
  });

  it("keeps TerminalTab mounted across Split/Unsplit layout toggles", () => {
    useIdeStore.setState({
      terminals: [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ],
    });
    const { getByTestId } = render(<App />);
    const termA = getByTestId("mock-term-a");
    const termB = getByTestId("mock-term-b");
    const seqA = termA.getAttribute("data-mount-seq");
    const seqB = termB.getAttribute("data-mount-seq");

    const splitBtn = getByTestId("toggle-split");
    act(() => {
      splitBtn.click();
    });
    act(() => {
      splitBtn.click();
    });

    const termAAfter = getByTestId("mock-term-a");
    const termBAfter = getByTestId("mock-term-b");
    expect(termAAfter).toBe(termA);
    expect(termBAfter).toBe(termB);
    expect(termAAfter.getAttribute("data-mount-seq")).toBe(seqA);
    expect(termBAfter.getAttribute("data-mount-seq")).toBe(seqB);
  });
});
