import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-testid="context-menu"
      role="menu"
      className="fixed z-50 min-w-[140px] bg-ide-panel border border-ide-border rounded shadow-lg py-1 text-[12px]"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          data-testid={`context-menu-${item.label.toLowerCase()}`}
          role="menuitem"
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className={`w-full text-left px-3 py-1 hover:bg-white/10 ${
            item.danger ? "text-red-400" : "text-ide-text"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
