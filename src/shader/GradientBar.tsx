import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { RangeControl } from "./controls";
import {
  colorAt,
  cssGradient,
  distributeStops,
  fromStops,
  mirrorStops,
  reverseStops,
  sortStops,
  toStops,
  widestGap,
  type Stop,
} from "./stops";

interface GradientBarProps {
  colors: string[];
  positions: number[];
  min: number;
  max: number;
  onChange: (colors: string[], positions: number[]) => void;
  /** 0 = hard colour bands, 1 = smooth. Omit to hide the control. */
  soft?: number;
  onSoftChange?: (value: number) => void;
  /** Show only the first colour picker detail (single-colour kinds). */
  compact?: boolean;
}

const HEX = /^#[\da-f]{6}$/i;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * A gradient bar where every colour stop can be placed anywhere.
 *
 *  - tap the bar to add a stop (its colour is sampled from the gradient)
 *  - drag a handle to move it; stops re-order themselves as they pass each other
 *  - pick a stop to change its colour, type an exact position or delete it
 *  - reverse / mirror / distribute evenly in one tap
 */
export default function GradientBar({ colors, positions, min, max, onChange, soft, onSoftChange, compact = false }: GradientBarProps) {
  const stops = useMemo(() => toStops(colors, positions), [colors, positions]);
  const [sel, setSel] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; offset: number; index: number } | null>(null);
  const live = useRef<Stop[]>(stops);
  live.current = stops;
  const tap = useRef<{ x: number; y: number; time: number; id: number } | null>(null);

  const selected = Math.min(sel, stops.length - 1);
  const current = stops[selected] as Stop;

  useEffect(() => {
    if (sel > stops.length - 1) setSel(Math.max(0, stops.length - 1));
  }, [sel, stops.length]);

  /** Applies new stops (sorted) and returns the index of `pick` afterwards. */
  const emit = (next: Stop[], pick?: Stop): number => {
    const sorted = sortStops(next);
    const out = fromStops(sorted);
    live.current = toStops(out.colors, out.positions);
    onChange(out.colors, out.positions);
    const index = pick ? Math.max(0, sorted.indexOf(pick)) : -1;
    if (pick) setSel(index);
    return index;
  };

  const posOf = (clientX: number, offset = 0): number => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return round3(clamp01((clientX - offset - rect.left) / rect.width));
  };

  const addAt = (pos: number) => {
    if (stops.length >= max) return;
    const fresh: Stop = { color: colorAt(stops, pos), pos };
    emit([...stops, fresh], fresh);
  };

  const remove = () => {
    if (stops.length <= min) return;
    emit(stops.filter((_, i) => i !== selected));
    setSel(Math.max(0, selected - 1));
  };

  const duplicate = () => {
    if (stops.length >= max) return;
    const copy: Stop = { color: current.color, pos: round3(Math.min(1, current.pos + 0.05)) };
    emit([...stops, copy], copy);
  };

  const replaceCurrent = (patch: Partial<Stop>) => {
    const changed: Stop = { ...current, ...patch };
    emit(stops.map((s, i) => (i === selected ? changed : s)), changed);
  };

  /* markers */
  const markerDown = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, offset: event.clientX - (rect.left + rect.width / 2), index };
    setSel(index);
  };

  const markerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const now = live.current;
    const base = now[d.index];
    if (!base) return;
    const moved: Stop = { color: base.color, pos: posOf(event.clientX, d.offset) };
    d.index = emit(now.map((s, i) => (i === d.index ? moved : s)), moved);
  };

  const markerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (drag.current?.id === event.pointerId) drag.current = null;
  };

  const markerKey = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const stop = stops[index] as Stop;
    const step = event.shiftKey ? 0.05 : 0.01;
    let pos: number | null = null;
    if (event.key === "ArrowLeft") pos = stop.pos - step;
    else if (event.key === "ArrowRight") pos = stop.pos + step;
    else if (event.key === "Home") pos = 0;
    else if (event.key === "End") pos = 1;
    if (pos === null) return;
    event.preventDefault();
    const moved: Stop = { color: stop.color, pos: round3(clamp01(pos)) };
    emit(stops.map((s) => (s === stop ? moved : s)), moved);
  };

  /* tapping the empty bar adds a stop; a scroll or drag that starts there does not */
  const barDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    tap.current = { x: event.clientX, y: event.clientY, time: performance.now(), id: event.pointerId };
  };
  const barMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const t = tap.current;
    if (t && t.id === event.pointerId && Math.hypot(event.clientX - t.x, event.clientY - t.y) > 7) tap.current = null;
  };
  const barUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const t = tap.current;
    tap.current = null;
    if (t && t.id === event.pointerId && performance.now() - t.time < 450 && event.target === event.currentTarget) addAt(posOf(event.clientX));
  };

  const hex = current.color;
  const [hexDraft, setHexDraft] = useState(hex);
  useEffect(() => setHexDraft(hex), [hex, selected]);

  return (
    <div className="gradient-editor">
      <div className="gb-bar-wrap">
        <div
          ref={barRef}
          className="gb-track"
          style={{ background: cssGradient(stops, soft ?? 1, 90) }}
          onPointerDown={barDown}
          onPointerMove={barMove}
          onPointerUp={barUp}
          onPointerCancel={() => {
            tap.current = null;
          }}
          aria-label="Gradient bar. Tap to add a colour stop."
        >
          {stops.map((stop, i) => (
            <button
              key={i}
              type="button"
              className={`gb-marker ${i === selected ? "selected" : ""}`}
              style={{ left: `${stop.pos * 100}%`, zIndex: i === selected ? 3 : 1 }}
              aria-label={`Colour stop ${i + 1} of ${stops.length} at ${Math.round(stop.pos * 100)} percent. Arrow keys move it.`}
              onPointerDown={(event) => markerDown(event, i)}
              onPointerMove={markerMove}
              onPointerUp={markerUp}
              onPointerCancel={markerUp}
              onKeyDown={(event) => markerKey(event, i)}
              onFocus={() => setSel(i)}
            >
              <span style={{ background: stop.color }} />
            </button>
          ))}
        </div>
      </div>
      <p className="gb-hint">Tap the bar to add a stop · drag a handle to move it</p>

      <div className="gb-stop">
        <label className="gb-swatch" aria-label="Stop colour">
          <input type="color" value={hex} onChange={(event) => replaceCurrent({ color: event.target.value.toLowerCase() })} />
          <span style={{ background: hex }} />
        </label>
        <input
          className="gb-hex"
          value={hexDraft}
          spellCheck={false}
          maxLength={7}
          aria-label="Stop colour hex"
          onChange={(event) => {
            const next = event.target.value.startsWith("#") ? event.target.value : `#${event.target.value}`;
            setHexDraft(next);
            if (HEX.test(next)) replaceCurrent({ color: next.toLowerCase() });
          }}
        />
        <span className="gb-count">
          {selected + 1} / {stops.length}
        </span>
      </div>

      {!compact && (
        <RangeControl
          label="Position"
          value={Math.round(current.pos * 1000) / 10}
          min={0}
          max={100}
          step={0.5}
          display={`${(current.pos * 100).toFixed(1)}%`}
          onChange={(v) => replaceCurrent({ pos: round3(v / 100) })}
        />
      )}

      {soft !== undefined && onSoftChange && (
        <RangeControl
          label="Blend"
          value={soft}
          min={0}
          max={1}
          step={0.01}
          display={soft < 0.02 ? "Hard bands" : soft > 0.98 ? "Smooth" : `${Math.round(soft * 100)}%`}
          onChange={onSoftChange}
        />
      )}

      <div className="gb-tools">
        <button type="button" className="text-action" disabled={stops.length >= max} onClick={() => addAt(widestGap(stops))}>
          + Stop
        </button>
        <button type="button" className="text-action" disabled={stops.length >= max} onClick={duplicate}>
          Duplicate
        </button>
        <button type="button" className="text-action" disabled={stops.length <= min} onClick={remove}>
          Delete
        </button>
        <button type="button" className="text-action" onClick={() => emit(reverseStops(stops))}>
          Reverse
        </button>
        <button type="button" className="text-action" disabled={stops.length < 2} onClick={() => emit(mirrorStops(stops, max))}>
          Mirror
        </button>
        <button type="button" className="text-action" onClick={() => emit(distributeStops(stops))}>
          Even
        </button>
      </div>
    </div>
  );
}
