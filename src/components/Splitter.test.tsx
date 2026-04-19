import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import Splitter from "./Splitter";

afterEach(() => {
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
});

describe("Splitter", () => {
  it("reports deltas in pixels for a column drag", () => {
    const onStart = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const { getByTestId } = render(
      <Splitter
        direction="col"
        onDragStart={onStart}
        onDragMove={onMove}
        onDragEnd={onEnd}
      />
    );
    const handle = getByTestId("splitter-col");
    fireEvent.mouseDown(handle, { clientX: 100, clientY: 50 });
    expect(onStart).toHaveBeenCalledTimes(1);

    fireEvent.mouseMove(window, { clientX: 140, clientY: 80 });
    expect(onMove).toHaveBeenLastCalledWith(40);

    fireEvent.mouseMove(window, { clientX: 90, clientY: 80 });
    expect(onMove).toHaveBeenLastCalledWith(-10);

    fireEvent.mouseUp(window);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("reports vertical deltas for a row drag", () => {
    const onMove = vi.fn();
    const { getByTestId } = render(
      <Splitter
        direction="row"
        onDragStart={() => {}}
        onDragMove={onMove}
      />
    );
    const handle = getByTestId("splitter-row");
    fireEvent.mouseDown(handle, { clientX: 10, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 200, clientY: 250 });
    expect(onMove).toHaveBeenLastCalledWith(-50);
    fireEvent.mouseUp(window);
  });

  it("detaches window listeners after mouseup", () => {
    const onMove = vi.fn();
    const { getByTestId } = render(
      <Splitter direction="col" onDragStart={() => {}} onDragMove={onMove} />
    );
    const handle = getByTestId("splitter-col");
    fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(window);
    onMove.mockClear();
    fireEvent.mouseMove(window, { clientX: 50, clientY: 0 });
    expect(onMove).not.toHaveBeenCalled();
  });
});
