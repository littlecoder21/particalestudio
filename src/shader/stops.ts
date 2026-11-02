/**
 * Colour stops: a colour plus a position (0..1) on the gradient bar.
 * Palettes are stored as two parallel arrays (`colors`, `positions`) so existing
 * projects that only have colours keep working — missing positions are spread evenly.
 */

export interface Stop {
  color: string;
  pos: number;
}

const HEX = /^#[\da-f]{6}$/i;

export const evenPositions = (count: number): number[] =>
  Array.from({ length: count }, (_, i) => (count <= 1 ? 0 : round3(i / (count - 1))));

const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function toStops(colors: readonly string[], positions: readonly number[]): Stop[] {
  const even = evenPositions(colors.length);
  return colors.map((color, i) => ({
    color,
    pos: typeof positions[i] === "number" && Number.isFinite(positions[i]) ? clamp01(positions[i] as number) : (even[i] ?? 0),
  }));
}

/** Sorted by position; ties keep their order. */
export function sortStops(stops: Stop[]): Stop[] {
  return stops
    .map((stop, i) => ({ stop, i }))
    .sort((a, b) => a.stop.pos - b.stop.pos || a.i - b.i)
    .map(({ stop }) => stop);
}

export function fromStops(stops: Stop[]): { colors: string[]; positions: number[] } {
  const sorted = sortStops(stops);
  return { colors: sorted.map((s) => s.color), positions: sorted.map((s) => round3(clamp01(s.pos))) };
}

/** Repairs imported data: valid hex colours, matching positions, ascending order. */
export function normalizeStops(
  rawColors: unknown,
  rawPositions: unknown,
  limits: { min: number; max: number },
  fallback: readonly string[],
): { colors: string[]; positions: number[] } {
  const colors = Array.isArray(rawColors)
    ? rawColors.filter((c): c is string => typeof c === "string" && HEX.test(c)).map((c) => c.toLowerCase()).slice(0, limits.max)
    : [];
  const base = colors.length >= limits.min ? colors : fallback.slice(0, limits.max).map((c) => c.toLowerCase());
  const positions = Array.isArray(rawPositions)
    ? rawPositions.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    : [];
  const usable = colors.length >= limits.min && positions.length >= base.length ? positions : [];
  return fromStops(toStops(base, usable));
}

const hexToRgb = (hex: string): [number, number, number] => {
  const v = HEX.test(hex) ? hex : "#000000";
  return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
};
const channel = (n: number): string => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
export const rgbToHex = (r: number, g: number, b: number): string => `#${channel(r)}${channel(g)}${channel(b)}`;

/** The ramp colour at position x (mirrors the shader's smooth blend). */
export function colorAt(stops: Stop[], x: number): string {
  const s = sortStops(stops);
  if (s.length === 0) return "#000000";
  const first = s[0] as Stop;
  const last = s[s.length - 1] as Stop;
  if (x <= first.pos) return first.color;
  if (x >= last.pos) return last.color;
  for (let i = 1; i < s.length; i++) {
    const hi = s[i] as Stop;
    const lo = s[i - 1] as Stop;
    if (x <= hi.pos) {
      const t = (x - lo.pos) / Math.max(hi.pos - lo.pos, 1e-4);
      const a = hexToRgb(lo.color);
      const b = hexToRgb(hi.color);
      return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    }
  }
  return last.color;
}

/** CSS gradient string for the bar, `soft` = 0 gives hard bands. */
export function cssGradient(stops: Stop[], soft = 1, angle = 90): string {
  const s = sortStops(stops);
  if (s.length === 0) return "none";
  if (soft < 0.02) {
    const parts: string[] = [];
    s.forEach((stop, i) => {
      const next = s[i + 1];
      const end = next ? (stop.pos + next.pos) / 2 : 1;
      const start = i === 0 ? 0 : ((s[i - 1] as Stop).pos + stop.pos) / 2;
      parts.push(`${stop.color} ${(start * 100).toFixed(2)}% ${(end * 100).toFixed(2)}%`);
    });
    return `linear-gradient(${angle}deg, ${parts.join(", ")})`;
  }
  const first = s[0] as Stop;
  const last = s[s.length - 1] as Stop;
  const body = s.map((stop) => `${stop.color} ${(stop.pos * 100).toFixed(2)}%`).join(", ");
  return `linear-gradient(${angle}deg, ${first.color} 0%, ${body}, ${last.color} 100%)`;
}

export const reverseStops = (stops: Stop[]): Stop[] => sortStops(stops.map((s) => ({ color: s.color, pos: round3(1 - s.pos) })));

/** Mirrors the bar around its middle: A B C → A B C B A (squeezed to fit). */
export function mirrorStops(stops: Stop[], max: number): Stop[] {
  const s = sortStops(stops);
  const out: Stop[] = s.map((stop) => ({ color: stop.color, pos: round3(stop.pos / 2) }));
  for (let i = s.length - 2; i >= 0; i--) {
    const stop = s[i] as Stop;
    out.push({ color: stop.color, pos: round3(1 - stop.pos / 2) });
  }
  return out.slice(0, max);
}

export function distributeStops(stops: Stop[]): Stop[] {
  const s = sortStops(stops);
  const even = evenPositions(s.length);
  return s.map((stop, i) => ({ color: stop.color, pos: even[i] ?? 0 }));
}

/** Largest gap between neighbours — where a new stop is easiest to place. */
export function widestGap(stops: Stop[]): number {
  const s = sortStops(stops);
  if (s.length < 2) return 0.5;
  let best = { gap: -1, pos: 0.5 };
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i] as Stop;
    const b = s[i + 1] as Stop;
    if (b.pos - a.pos > best.gap) best = { gap: b.pos - a.pos, pos: (a.pos + b.pos) / 2 };
  }
  return round3(best.pos);
}
