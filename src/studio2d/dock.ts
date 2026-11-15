import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

const STORAGE_KEY = "particle-studio-2d-dock";
const MIN_FRACTION = 0.24;
const MAX_FRACTION = 0.8;
const DEFAULT_FRACTION = 0.52;

function loadFraction(): number {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return value >= MIN_FRACTION && value <= MAX_FRACTION ? value : DEFAULT_FRACTION;
  } catch {
    return DEFAULT_FRACTION;
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface DragState {
  startY: number;
  startFraction: number;
  startOpen: boolean;
  height: number;
  moved: boolean;
}

/**
 * Draggable bottom sheet for narrow screens (same behaviour as the 3D and Shader studios):
 * drag the handle bar to resize the sheet, tap it to collapse or expand, or use the arrow keys.
 * On desktop the bar is hidden and the dock is a normal side panel.
 */
export function useDockSheet(open: boolean, setOpen: (value: boolean | ((current: boolean) => boolean)) => void) {
  const [fraction, setFraction] = useState(loadFraction);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<DragState | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(fraction));
    } catch {
      // Storage can be unavailable (private mode); the sheet simply forgets its size.
    }
  }, [fraction]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    const workspace = event.currentTarget.closest(".workspace");
    const height = workspace ? workspace.getBoundingClientRect().height : window.innerHeight;
    drag.current = { startY: event.clientY, startFraction: fraction, startOpen: open, height: Math.max(height, 1), moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state) return;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.abs(dy) < 5) return;
    state.moved = true;
    const raw = (state.startOpen ? state.startFraction : 0) - dy / state.height;
    if (raw < MIN_FRACTION - 0.07) {
      if (open) setOpen(false);
      return;
    }
    if (!open) setOpen(true);
    setFraction(clamp(raw, MIN_FRACTION, MAX_FRACTION));
  };

  const finish = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (state && !state.moved && event.type === "pointerup") setOpen((current) => !current);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      else setFraction((current) => clamp(current + 0.06, MIN_FRACTION, MAX_FRACTION));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (open && fraction <= MIN_FRACTION + 0.001) setOpen(false);
      else setFraction((current) => clamp(current - 0.06, MIN_FRACTION, MAX_FRACTION));
    }
  };

  return {
    dragging,
    style: { "--s2-dock-frac": fraction } as CSSProperties,
    barProps: {
      role: "button" as const,
      tabIndex: 0,
      "aria-label": open ? "Resize or collapse controls" : "Expand controls",
      "aria-expanded": open,
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onKeyDown,
    },
  };
}
