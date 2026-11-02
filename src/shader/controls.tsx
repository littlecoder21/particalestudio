import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

export function formatValue(value: number, step: number): string {
  if (step >= 1) return String(Math.round(value));
  const decimals = Math.min(3, Math.max(1, Math.ceil(-Math.log10(step) - 1e-9)));
  return value.toFixed(decimals);
}

/* ───────────────────────── smart range ───────────────────────── */

interface RangeControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Optional custom read-out (for example "Off" at zero). */
  display?: string;
  /** Double-click / double-tap the label to jump back to this value. */
  reset?: number;
}

interface DragState {
  id: number;
  startX: number;
  startY: number;
  startValue: number;
  startTime: number;
  touch: boolean;
  active: boolean;
  width: number;
}

/** Pixels a finger has to travel sideways before a touch counts as a slider drag. */
const DRAG_SLOP = 7;
/** Pixels of vertical travel after which a touch is treated as page scrolling. */
const SCROLL_SLOP = 9;

/**
 * A slider that is safe to put inside a scrolling panel.
 *
 * - Mouse / pen: press anywhere on the track to jump, then drag.
 * - Touch: a touch that lands on the slider changes nothing. Only a clearly
 *   horizontal drag moves the value (relative to where the drag started, so it
 *   never jumps), and a clearly vertical one is left to the page to scroll.
 *   A quick tap still sets the value at that spot.
 *
 * `touch-action: pan-y` on the track lets the browser scroll vertically on its
 * own while horizontal drags are delivered to this component.
 */
export function RangeControl({ label, value, min, max, step, onChange, display, reset }: RangeControlProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const [active, setActive] = useState(false);

  const span = max - min || 1;
  const ratio = Math.min(1, Math.max(0, (value - min) / span));
  const decimals = step >= 1 ? 0 : Math.min(4, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));

  const snap = (raw: number): number => {
    const stepped = Math.round((raw - min) / step) * step + min;
    return Number(Math.min(max, Math.max(min, stepped)).toFixed(decimals));
  };

  const valueAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return value;
    return snap(min + ((clientX - rect.left) / rect.width) * span);
  };

  const commit = (next: number) => {
    if (next !== value) onChange(next);
  };

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const touch = event.pointerType !== "mouse";
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startValue: value,
      startTime: performance.now(),
      touch,
      active: false,
      width: Math.max(1, rect.width),
    };
    if (!touch) {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current.active = true;
      setActive(true);
      commit(valueAt(event.clientX));
    }
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    if (!d.active) {
      const dx = event.clientX - d.startX;
      const dy = event.clientY - d.startY;
      if (Math.abs(dy) > SCROLL_SLOP && Math.abs(dy) >= Math.abs(dx) * 0.8) {
        drag.current = null; // the page is scrolling — hands off
        return;
      }
      if (Math.abs(dx) > DRAG_SLOP && Math.abs(dx) > Math.abs(dy) * 1.25) {
        d.active = true;
        d.startX = event.clientX; // measure from here so the value never jumps
        d.startValue = value;
        setActive(true);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* the pointer may already be gone */
        }
      }
      return;
    }
    if (d.touch) commit(snap(d.startValue + ((event.clientX - d.startX) / d.width) * span));
    else commit(valueAt(event.clientX));
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    setActive(false);
    if (cancelled || d.active || !d.touch) return;
    const moved = Math.hypot(event.clientX - d.startX, event.clientY - d.startY);
    if (moved < DRAG_SLOP && performance.now() - d.startTime < 450) commit(valueAt(event.clientX)); // a deliberate tap
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const big = event.shiftKey ? 10 : 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = value + step * big;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = value - step * big;
    else if (event.key === "PageUp") next = value + step * 10;
    else if (event.key === "PageDown") next = value - step * 10;
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    if (next === null) return;
    event.preventDefault();
    commit(snap(next));
  };

  const readout = display ?? formatValue(value, step);

  return (
    <div className="range-control">
      <span className="range-title">
        <span onDoubleClick={reset === undefined ? undefined : () => commit(snap(reset))}>{label}</span>
        <span className="range-value">{readout}</span>
      </span>
      <div
        ref={trackRef}
        className={`smart-range ${active ? "active" : ""}`}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={readout}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={(event) => finish(event, false)}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={() => {
          drag.current = null;
          setActive(false);
        }}
        onKeyDown={onKeyDown}
      >
        <span className="sr-rail" />
        <span className="sr-fill" style={{ width: `${ratio * 100}%` }} />
        <span className="sr-thumb" style={{ left: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

/* ───────────────────────── choice / toggle / colour ───────────────────────── */

interface ChoiceGroupProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}

export function ChoiceGroup<T extends string>({ label, value, options, onChange }: ChoiceGroupProps<T>) {
  return (
    <div className="choice-control">
      <span className="control-label">{label}</span>
      <div className="choice-grid">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`choice-button ${option === value ? "selected" : ""}`}
            aria-pressed={option === value}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ToggleRowProps {
  title: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function ToggleRow({ title, description, enabled, onChange }: ToggleRowProps) {
  return (
    <button
      type="button"
      className={`toggle-row ${enabled ? "enabled" : ""}`}
      aria-pressed={enabled}
      onClick={() => onChange(!enabled)}
    >
      <span>
        <b>{title}</b>
        <small>{description}</small>
      </span>
      <span className="toggle-switch" />
    </button>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <label className="color-control">
      {label}
      <span className="color-input-wrap">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  );
}

interface SectionHeadingProps {
  number: string;
  title: string;
  description: string;
}

export function SectionHeading({ number, title, description }: SectionHeadingProps) {
  return (
    <div className="control-heading">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <span className="section-number">{number}</span>
    </div>
  );
}

export function SoftTip({ children }: { children: ReactNode }) {
  return (
    <div className="soft-tip">
      <span>✦</span>
      <p>{children}</p>
    </div>
  );
}

/* ───────────────────────── sub panels ───────────────────────── */

interface SubTabsProps<T extends string> {
  value: T;
  tabs: ReadonlyArray<{ id: T; label: string; hint?: string }>;
  onChange: (value: T) => void;
  label: string;
}

/** Pill tabs for panels that contain several sub panels (Touch → Modes / Custom, Shape → …). */
export function SubTabs<T extends string>({ value, tabs, onChange, label }: SubTabsProps<T>) {
  return (
    <div className="sub-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === value}
          className={tab.id === value ? "active" : ""}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.hint ? <small>{tab.hint}</small> : null}
        </button>
      ))}
    </div>
  );
}

interface FoldProps {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** A collapsible group of controls. */
export function Fold({ title, hint, defaultOpen = false, children }: FoldProps) {
  return (
    <details className="fold" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {hint ? <small>{hint}</small> : null}
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
