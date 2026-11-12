import type { PaletteStop } from "./types";
import { clamp } from "./math";

export function parseColor(hex: string): [number, number, number] {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
}
export function sortedStops(stops: PaletteStop[]): PaletteStop[] {
  const s = stops.length ? [...stops].sort((a, b) => a.t - b.t) : [{ t: 0, color: "#ffffff" }];
  return s.length === 1 ? [{ t: 0, color: s[0].color }, { t: 1, color: s[0].color }] : s;
}
/** Samples a gradient at t in 0..1 (linear RGB lerp). */
export function samplePalette(stops: PaletteStop[], t: number): [number, number, number] {
  const s = sortedStops(stops).map((p) => ({ t: p.t, c: parseColor(p.color) }));
  t = clamp(t, 0, 1);
  if (t <= s[0].t) return s[0].c;
  for (let i = 1; i < s.length; i++) if (t <= s[i].t) { const a = s[i - 1], b = s[i], k = (t - a.t) / Math.max(1e-6, b.t - a.t); return [a.c[0] + (b.c[0] - a.c[0]) * k, a.c[1] + (b.c[1] - a.c[1]) * k, a.c[2] + (b.c[2] - a.c[2]) * k]; }
  return s[s.length - 1].c;
}
/** 256 x rows RGBA8 lookup (rows = up to 4 layers). */
export function paletteBytes(rows: PaletteStop[][]): Uint8Array {
  const out = new Uint8Array(256 * 4 * 4);
  for (let r = 0; r < 4; r++) {
    const stops = rows[Math.min(r, rows.length - 1)] ?? rows[0];
    for (let i = 0; i < 256; i++) { const c = samplePalette(stops, i / 255), o = (r * 256 + i) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255; }
  }
  return out;
}
export const PALETTE_PRESETS: { name: string; stops: PaletteStop[] }[] = [
  { name: "Nova", stops: [{ t: 0, color: "#1f6bff" }, { t: 0.4, color: "#3de2ff" }, { t: 0.68, color: "#9a60ff" }, { t: 1, color: "#e4fbff" }] },
  { name: "Ember", stops: [{ t: 0, color: "#fff3b0" }, { t: 0.35, color: "#ff9a3d" }, { t: 0.7, color: "#ff3d6e" }, { t: 1, color: "#5b2cff" }] },
  { name: "Aurora", stops: [{ t: 0, color: "#0b3d91" }, { t: 0.45, color: "#22d3ee" }, { t: 0.75, color: "#a3e635" }, { t: 1, color: "#f0fdf4" }] },
  { name: "Orchid", stops: [{ t: 0, color: "#5b3bff" }, { t: 0.45, color: "#c04bff" }, { t: 0.75, color: "#ff7ab3" }, { t: 1, color: "#ffe6f2" }] },
  { name: "Gold", stops: [{ t: 0, color: "#3b1d00" }, { t: 0.4, color: "#d97706" }, { t: 0.8, color: "#fcd34d" }, { t: 1, color: "#fffbe6" }] },
  { name: "Ice", stops: [{ t: 0, color: "#1e3a8a" }, { t: 0.5, color: "#7dd3fc" }, { t: 1, color: "#ffffff" }] },
  { name: "Mono", stops: [{ t: 0, color: "#6b7280" }, { t: 1, color: "#ffffff" }] },
];
