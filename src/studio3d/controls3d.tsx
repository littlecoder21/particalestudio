import type { ReactNode } from "react";
import type { PaletteStop } from "./types";

export function Range({ label, value, min, max, step, onChange, hint, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; hint?: string; fmt?: (v: number) => string }) {
  const shown = fmt ? fmt(value) : Math.abs(step) >= 1 ? String(Math.round(value)) : value.toFixed(step < 0.01 ? 3 : 2);
  return (
    <label className="s3-range" title={hint}>
      <span className="s3-row"><span>{label}</span><output>{shown}</output></span>
      <input type="range" min={min} max={max} step={step} value={Number.isFinite(value) ? value : min} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="s3-toggle" title={hint}>
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}
export function Select<T extends string>({ label, value, options, onChange, hint }: { label?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hint?: string }) {
  return (
    <label className="s3-select" title={hint}>
      {label && <span>{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    </label>
  );
}
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return <div className="s3-seg" role="group">{options.map((o) => <button key={o.value} type="button" className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}
export function TextField({ label, value, onChange, hint, mono }: { label: string; value: string; onChange: (v: string) => void; hint?: string; mono?: boolean }) {
  return (
    <label className="s3-text" title={hint}>
      <span>{label}</span>
      <input type="text" value={value} spellCheck={false} className={mono ? "mono" : ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return <section className="s3-section"><header><h3>{title}</h3>{right}</header>{children}</section>;
}
export function Vec3Input({ label, value, onChange, range = 2 }: { label: string; value: [number, number, number]; onChange: (v: [number, number, number]) => void; range?: number }) {
  return (
    <div className="s3-vec">
      <span>{label}</span>
      {(["x", "y", "z"] as const).map((a, i) => (
        <label key={a}><b>{a}</b><input type="number" step={0.05} min={-range * 4} max={range * 4} value={Number(value[i].toFixed(3))} onChange={(e) => { const v = [...value] as [number, number, number]; v[i] = Number(e.target.value) || 0; onChange(v); }} /></label>
      ))}
    </div>
  );
}
export function GradientEditor({ stops, onChange }: { stops: PaletteStop[]; onChange: (s: PaletteStop[]) => void }) {
  const sorted = [...stops].sort((a, b) => a.t - b.t), css = `linear-gradient(90deg, ${sorted.map((s) => `${s.color} ${Math.round(s.t * 100)}%`).join(", ")})`;
  const set = (i: number, patch: Partial<PaletteStop>) => onChange(stops.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  return (
    <div className="s3-grad">
      <div className="s3-grad-bar" style={{ background: css }} />
      {stops.map((s, i) => (
        <div className="s3-stop" key={i}>
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(s.color) ? s.color : "#ffffff"} onChange={(e) => set(i, { color: e.target.value })} aria-label={`Stop ${i + 1} colour`} />
          <input type="range" min={0} max={1} step={0.01} value={s.t} onChange={(e) => set(i, { t: Number(e.target.value) })} aria-label={`Stop ${i + 1} position`} />
          <button type="button" className="s3-x" disabled={stops.length <= 2} onClick={() => onChange(stops.filter((_, k) => k !== i))} aria-label="Remove stop">×</button>
        </div>
      ))}
      <button type="button" className="s3-btn" disabled={stops.length >= 8} onClick={() => onChange([...stops, { t: 0.5, color: "#ffffff" }])}>+ Colour stop</button>
    </div>
  );
}
