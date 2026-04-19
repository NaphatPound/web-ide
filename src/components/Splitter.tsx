import { useCallback } from "react";

type Direction = "col" | "row";

interface Props {
  direction: Direction;
  onDragStart: () => void;
  onDragMove: (delta: number) => void;
  onDragEnd?: () => void;
  ariaLabel?: string;
}

export default function Splitter({
  direction,
  onDragStart,
  onDragMove,
  onDragEnd,
  ariaLabel,
}: Props) {
  const handleDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startPoint = direction === "col" ? e.clientX : e.clientY;
      onDragStart();
      document.body.style.cursor = direction === "col" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: MouseEvent) => {
        const curr = direction === "col" ? ev.clientX : ev.clientY;
        onDragMove(curr - startPoint);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        onDragEnd?.();
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [direction, onDragStart, onDragMove, onDragEnd]
  );

  const base = "bg-ide-border hover:bg-ide-accent transition-colors";
  const sized =
    direction === "col"
      ? "w-[4px] h-full cursor-col-resize"
      : "h-[4px] w-full cursor-row-resize";

  return (
    <div
      role="separator"
      aria-orientation={direction === "col" ? "vertical" : "horizontal"}
      aria-label={ariaLabel}
      onMouseDown={handleDown}
      data-testid={`splitter-${direction}`}
      className={`${base} ${sized}`}
    />
  );
}
