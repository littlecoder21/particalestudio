import type { ParamSurface } from "../sampling";
import type { Rng } from "../math";
import { fbm, vnoise } from "../math";
import { norm3, cross3, sub3, len3v, type Scene, type V3 } from "./sculpt";
import { TAU } from "./objkit";

export const SPACE = "Space & cosmic objects";
export type PtOut = { [i: number]: number };
export const put = (o: PtOut, p: V3, n: V3, t: number, size = 1, al = 1) => { o[0] = p[0]; o[1] = p[1]; o[2] = p[2]; o[3] = n[0]; o[4] = n[1]; o[5] = n[2]; o[6] = t; o[7] = size; o[8] = al; };
export const unitRand = (r: Rng): V3 => { const a = r.next() * TAU, z = 2 * r.next() - 1, s = Math.sqrt(Math.max(0, 1 - z * z)); return [s * Math.cos(a), z, s * Math.sin(a)]; };
export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** Ridged noise in 0..1 — thin bright filaments where the base noise crosses 0.5. */
export const ridge = (x: number, y: number, z: number) => 1 - Math.abs(2 * fbm(x, y, z) - 1);
export { fbm, vnoise };

/** Orthonormal frame (u, v) perpendicular to axis `a`. */
export function frame(a: V3): [V3, V3] {
  const n = norm3(a);
  let u = cross3(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  u = norm3(u);
  return [u, cross3(n, u)];
}

/** Cylinder (open tube) between two points. u = angle, v = along. */
export function cyl(a: V3, b: V3, r: number | ((v: number) => number)): ParamSurface {
  const [e1, e2] = frame(sub3(b, a));
  return {
    u0: 0, u1: TAU, v0: 0, v1: 1,
    eval(u, v, o) {
      const rr = typeof r === "number" ? r : r(v), c = Math.cos(u) * rr, s = Math.sin(u) * rr;
      for (let i = 0; i < 3; i++) o[i] = a[i] + (b[i] - a[i]) * v + c * e1[i] + s * e2[i];
    },
  };
}

export interface Ball { c: V3; r: number; t: number }
/** Uniform-surface sphere cloud: lots of small spheres without paying for a smooth-union solid. */
export function balls(sc: Scene, list: Ball[], dens = 1.6, al = 1, sz = 1) {
  if (!list.length) return;
  const cdf: number[] = []; let acc = 0;
  for (const b of list) { acc += b.r * b.r; cdf.push(acc); }
  sc.points(acc * 4 * Math.PI * dens * 1.15, (rng, o) => {
    const q = rng.next() * acc; let lo = 0, hi = cdf.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < q) lo = m + 1; else hi = m; }
    const b = list[lo], n = unitRand(rng);
    put(o, [b.c[0] + n[0] * b.r, b.c[1] + n[1] * b.r, b.c[2] + n[2] * b.r], n, b.t, sz, al);
  });
}

/** Cratered-surface displacement. Craters are defined on the surface (centre + radius); depth profile = bowl, raised rim, optional central peak. */
export interface Crater { c: V3; r: number; d: number }
export function makeCraters(rng: Rng, anchors: V3[], n: number, rMin: number, rMax: number, pow = 1.7): Crater[] {
  const out: Crater[] = [];
  for (let i = 0; i < n; i++) {
    const c = anchors[rng.int(anchors.length)], r = Math.min(rMax, rMin * Math.pow(1 - rng.next() * 0.999, -1 / (pow - 1)));
    out.push({ c, r, d: r * (0.2 + 0.1 * rng.next()) });
  }
  return out;
}
/** Returns [height, floorMask(0..1), rimMask(0..1)] at p. */
export function craterField(p: V3, cs: Crater[], out: V3 = [0, 0, 0]): V3 {
  let h = 0, floor = 0, rim = 0;
  for (const k of cs) {
    const dx = p[0] - k.c[0], dy = p[1] - k.c[1], dz = p[2] - k.c[2], d2 = dx * dx + dy * dy + dz * dz, lim = k.r * 1.5;
    if (d2 > lim * lim) continue;
    const s = Math.sqrt(d2) / k.r;
    if (s < 1) { const bowl = 1 - s * s; h -= k.d * bowl * (1 - 0.35 * Math.exp(-s * s * 40)); floor = Math.max(floor, bowl); } // bowl with a small central peak
    const rm = Math.exp(-(((s - 1.02) / 0.22) ** 2)); h += k.d * 0.55 * rm; rim = Math.max(rim, rm);
  }
  out[0] = h; out[1] = floor; out[2] = rim; return out;
}

/** Direction from latitude/longitude (degrees), +z = sub-observer point, +y = north. */
export const latlon = (lat: number, lon: number): V3 => { const a = (lat * Math.PI) / 180, b = (lon * Math.PI) / 180; return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)]; };
export const angTo = (a: V3, b: V3) => Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
export const mulv = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const lenv = len3v;
