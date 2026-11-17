import type { ParamSurface } from "../sampling";
import { crScalar, norm3, cross3, type Scene, type SheetOpts, type V3 } from "./sculpt";

export const TAU = Math.PI * 2;
export const OBJ = "Objects & landmarks";
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const addv = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** Bilinear patch A(0,0) B(1,0) C(1,1) D(0,1). */
export function quad(A: V3, B: V3, C: V3, D: V3): ParamSurface {
  return { u0: 0, u1: 1, v0: 0, v1: 1, eval(u, v, o) { for (let i = 0; i < 3; i++) o[i] = (A[i] * (1 - u) + B[i] * u) * (1 - v) + (D[i] * (1 - u) + C[i] * u) * v; } };
}
/** Re-maps every point of a surface. */
export function xf(s: ParamSurface, f: (p: V3, u: number, v: number) => V3): ParamSurface {
  const t: V3 = [0, 0, 0];
  return { u0: s.u0, u1: s.u1, v0: s.v0, v1: s.v1, eval(u, v, o) { s.eval(u, v, t as unknown as Parameters<ParamSurface["eval"]>[2]); const p = f([t[0], t[1], t[2]], u, v); o[0] = p[0]; o[1] = p[1]; o[2] = p[2]; } };
}
/** Surface of revolution about y through spline-interpolated (radius, height) control points. `sides` > 2 makes a polygonal lathe. */
export function lathe(prof: Array<[number, number]>, o: { u0?: number; u1?: number; sides?: number; rot?: number; wob?: (u: number, v: number) => number } = {}): ParamSurface {
  const rs = prof.map((p) => p[0]), ys = prof.map((p) => p[1]), n = prof.length - 1, sides = o.sides ?? 0, rot = o.rot ?? 0;
  return {
    u0: o.u0 ?? 0, u1: o.u1 ?? TAU, v0: 0, v1: 1,
    eval(u, v, out) {
      let r = crScalar(rs, v * n);
      if (sides > 2) { const a = ((u - rot) % (TAU / sides) + TAU / sides) % (TAU / sides) - Math.PI / sides; r *= Math.cos(Math.PI / sides) / Math.cos(a); }
      if (o.wob) r += o.wob(u, v);
      out[0] = r * Math.cos(u); out[1] = crScalar(ys, v * n); out[2] = r * Math.sin(u);
    },
  };
}
/** Torus around `axis` through centre c. */
export function torus(c: V3, R: number, r: number, axis: "x" | "y" | "z" = "y", u0 = 0, u1 = TAU): ParamSurface {
  return {
    u0, u1, v0: 0, v1: TAU,
    eval(u, v, o) {
      const q = R + r * Math.cos(v), a = q * Math.cos(u), b = r * Math.sin(v), d = q * Math.sin(u);
      if (axis === "y") { o[0] = c[0] + a; o[1] = c[1] + b; o[2] = c[2] + d; } else if (axis === "z") { o[0] = c[0] + a; o[1] = c[1] + d; o[2] = c[2] + b; } else { o[0] = c[0] + b; o[1] = c[1] + a; o[2] = c[2] + d; }
    },
  };
}
/** Closed circle polyline. axis = normal direction. */
export function circle(c: V3, R: number, seg = 64, axis: "x" | "y" | "z" = "y"): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * TAU, p = R * Math.cos(a), q = R * Math.sin(a); out.push(axis === "y" ? [c[0] + p, c[1], c[2] + q] : axis === "z" ? [c[0] + p, c[1] + q, c[2]] : [c[0], c[1] + p, c[2] + q]); }
  return out;
}
/** Disc / annulus about axis. */
export function disc(c: V3, R: number, r0 = 0, axis: "x" | "y" | "z" = "y"): ParamSurface {
  return { u0: 0, u1: TAU, v0: 0, v1: 1, eval(u, v, o) { const r = r0 + (R - r0) * v, p = r * Math.cos(u), q = r * Math.sin(u); if (axis === "y") { o[0] = c[0] + p; o[1] = c[1]; o[2] = c[2] + q; } else if (axis === "z") { o[0] = c[0] + p; o[1] = c[1] + q; o[2] = c[2]; } else { o[0] = c[0]; o[1] = c[1] + p; o[2] = c[2] + q; } } };
}
/** Axis-aligned box made of six sheets. */
export function box(sc: Scene, c: V3, h: V3, o: SheetOpts & { skip?: Array<"+x" | "-x" | "+y" | "-y" | "+z" | "-z"> } = {}) {
  const [x0, y0, z0] = [c[0] - h[0], c[1] - h[1], c[2] - h[2]], [x1, y1, z1] = [c[0] + h[0], c[1] + h[1], c[2] + h[2]];
  const faces: Array<[string, V3, V3, V3, V3]> = [
    ["+x", [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], ["-x", [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    ["+y", [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], ["-y", [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
    ["+z", [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], ["-z", [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
  ];
  const { skip, ...rest } = o;
  for (const [n, a, b, cc, d] of faces) if (!skip?.includes(n as "+x")) sc.sheet(quad(a, b, cc, d), rest);
}
/** Strand outline of a (possibly rotated) rectangle given its four corners. */
export const rectLine = (A: V3, B: V3, C: V3, D: V3): V3[] => [A, B, C, D, A];
/** Rotates a point about the y axis. */
export const rotY = (p: V3, a: number): V3 => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
/** Rotates a point about the z axis around `o`. */
export const rotZ = (p: V3, a: number, o: V3 = [0, 0, 0]): V3 => { const x = p[0] - o[0], y = p[1] - o[1]; return [o[0] + x * Math.cos(a) - y * Math.sin(a), o[1] + x * Math.sin(a) + y * Math.cos(a), p[2]]; };
/** Spiral polyline around the y axis. */
export function spiral(r: (t: number) => number, y0: number, y1: number, turns: number, seg = 120, ph = 0): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= seg; i++) { const t = i / seg, a = ph + t * turns * TAU, rr = r(t); out.push([rr * Math.cos(a), y0 + (y1 - y0) * t, rr * Math.sin(a)]); }
  return out;
}
export const unitCross = (a: V3, b: V3): V3 => norm3(cross3(a, b));
/** Polyline along u at fixed v on a surface (e.g. a ring on a lathe). */
export function isoV(s: ParamSurface, v: number, seg = 72): V3[] {
  const o: V3 = [0, 0, 0], out: V3[] = [];
  for (let i = 0; i <= seg; i++) { s.eval(s.u0 + ((s.u1 - s.u0) * i) / seg, s.v0 + (s.v1 - s.v0) * v, o); out.push([o[0], o[1], o[2]]); }
  return out;
}
/** Polyline along v at fixed u (e.g. a meridian). */
export function isoU(s: ParamSurface, u: number, seg = 24): V3[] {
  const o: V3 = [0, 0, 0], out: V3[] = [];
  for (let i = 0; i <= seg; i++) { s.eval(s.u0 + (s.u1 - s.u0) * u, s.v0 + ((s.v1 - s.v0) * i) / seg, o); out.push([o[0], o[1], o[2]]); }
  return out;
}
/** Radius of a lathe profile at height y (profile heights must be monotonic). */
export function radiusAt(prof: Array<[number, number]>, y: number): number {
  const n = prof.length - 1, rs = prof.map((p) => p[0]), ys = prof.map((p) => p[1]), up = ys[n] > ys[0];
  let lo = 0, hi = 1;
  for (let i = 0; i < 32; i++) { const m = (lo + hi) / 2, ym = crScalar(ys, m * n); if (up ? ym < y : ym > y) lo = m; else hi = m; }
  return crScalar(rs, lo * n);
}
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Triangle patch: u is the distance from A, v runs along edge B–C (area-correct under table sampling). */
export function triSurf(A: V3, B: V3, C: V3): ParamSurface {
  return { u0: 0, u1: 1, v0: 0, v1: 1, eval(u, v, o) { for (let i = 0; i < 3; i++) o[i] = A[i] + u * ((B[i] - A[i]) + v * (C[i] - B[i])); } };
}
export const centroid = (pts: V3[]): V3 => { const c: V3 = [0, 0, 0]; for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length]; };
export const scale3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dist3 = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Tube surface around a space curve (Frenet frame by finite differences). u = curve parameter, v = angle around the tube. */
export function tubeSurf(curve: (t: number) => V3, r: number | ((t: number) => number), t0: number, t1: number): ParamSurface {
  const h = 2e-3;
  return {
    u0: t0, u1: t1, v0: 0, v1: TAU,
    eval(t, th, o) {
      const p = curve(t), a = curve(t - h), b = curve(t + h), T = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const acc: V3 = [a[0] + b[0] - 2 * p[0], a[1] + b[1] - 2 * p[1], a[2] + b[2] - 2 * p[2]], d = acc[0] * T[0] + acc[1] * T[1] + acc[2] * T[2];
      let N = norm3([acc[0] - T[0] * d, acc[1] - T[1] * d, acc[2] - T[2] * d]); if (!Number.isFinite(N[0] + N[1] + N[2])) N = [0, 1, 0];
      const B = cross3(T, N), rr = typeof r === "number" ? r : r(t), c = Math.cos(th), s = Math.sin(th);
      o[0] = p[0] + rr * (c * N[0] + s * B[0]); o[1] = p[1] + rr * (c * N[1] + s * B[1]); o[2] = p[2] + rr * (c * N[2] + s * B[2]);
    },
  };
}
/** Samples a curve into a polyline. */
export function curveLine(curve: (t: number) => V3, t0: number, t1: number, seg = 200): V3[] { const out: V3[] = []; for (let i = 0; i <= seg; i++) out.push(curve(t0 + ((t1 - t0) * i) / seg)); return out; }
