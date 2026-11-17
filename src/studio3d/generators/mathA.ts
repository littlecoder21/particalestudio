import type { GeneratorDef } from "../types";
import type { ParamSurface } from "../sampling";
import { defineShape, norm3, cross3, type V3 } from "./sculpt";
import { TAU, tubeSurf, curveLine, isoU, isoV, clamp01, lerp3, scale3, dist3, triSurf, quad } from "./objkit";
import { icoVerts, icosahedron, dual } from "./geo";

export const MATH = "Advanced mathematical objects";
const SPEC: Array<[number, string]> = [[0, "#ff3a6e"], [0.2, "#ff9a3a"], [0.4, "#f6e84a"], [0.6, "#3ad68a"], [0.8, "#3a8aff"], [1, "#b04aff"]];
const evalAt = (s: ParamSurface, u: number, v: number): V3 => { const o: V3 = [0, 0, 0]; s.eval(u, v, o as unknown as Parameters<ParamSurface["eval"]>[2]); return [o[0], o[1], o[2]]; };
const gridLines = (s: ParamSurface, nu: number, nv: number, seg = 60): V3[][] => { const L: V3[][] = []; for (let i = 0; i < nu; i++) L.push(isoU(s, i / nu, seg)); for (let j = 0; j < nv; j++) L.push(isoV(s, j / nv, seg)); return L; };
const cam = (d: number, yaw = 0.5, pitch = 0.3, auto = 0.12) => ({ distance: d, yaw, pitch, autoRotate: auto });

/* ───────────── Klein bottle ───────────── */
export const kleinBottle = defineShape({
  id: "math-klein-bottle", name: "Klein Bottle", tag: MATH,
  description: "Gray's immersion of the Klein bottle: a closed surface with no inside or outside whose narrow neck swings round and passes through its own wall, with a flowing parameter mesh.",
  palette: SPEC, count: 110000, size: 0.0054, fit: 1.5, heavy: false, camera: cam(5.6, 0.7, 0.2),
  build(sc) {
    const S: ParamSurface = { u0: 0, u1: TAU, v0: 0, v1: TAU, eval(u, v, o) {
      const r = 4 * (1 - Math.cos(u) / 2); let x: number, y: number, z: number;
      if (u < Math.PI) { x = 6 * Math.cos(u) * (1 + Math.sin(u)) + r * Math.cos(u) * Math.cos(v); y = 16 * Math.sin(u) + r * Math.sin(u) * Math.cos(v); } else { x = 6 * Math.cos(u) * (1 + Math.sin(u)) + r * Math.cos(v + Math.PI); y = 16 * Math.sin(u); }
      z = r * Math.sin(v); o[0] = x * 0.1; o[1] = y * 0.1 + 0.2; o[2] = z * 0.1;
    } };
    sc.sheet(S, { dens: 1.0, thick: 0.004, c: (u, v) => (u / TAU + 0.12 * Math.sin(v * 2)) % 1 });
    sc.strands(gridLines(S, 40, 14, 80), { r: 0.0045, dens: 0.7, c0: 0.5, c1: 0.5, al: 0.8 });
  },
});

/* ───────────── Möbius strip ───────────── */
export const mobiusStrip = defineShape({
  id: "math-mobius-strip", name: "Möbius Strip", tag: MATH,
  description: "The one-sided Möbius band: a ribbon given a single half twist and joined end to end, with cross ribs, a bright centre line and a single continuous edge.",
  palette: SPEC, count: 100000, size: 0.0056, fit: 1.5, heavy: false, camera: cam(5.0, 0.4, 0.5),
  build(sc) {
    const R = 1.3, w = 0.55, S: ParamSurface = { u0: 0, u1: TAU, v0: -1, v1: 1, eval(t, s, o) { const r = R + w * s * Math.cos(t / 2); o[0] = r * Math.cos(t); o[1] = w * s * Math.sin(t / 2); o[2] = r * Math.sin(t); } };
    sc.sheet(S, { dens: 1.0, thick: 0.004, c: (u, v) => (u / TAU) * 0.9 + 0.05 * Math.sin(v * 7 + u * 3) });
    const ribs: V3[][] = []; for (let i = 0; i < 48; i++) ribs.push(isoU(S, i / 48, 8));
    sc.strands(ribs, { r: 0.0045, dens: 0.9, c0: 0.5, c1: 0.5, al: 0.8 });
    const edge: V3[] = []; for (let i = 0; i <= 400; i++) { const t = (i / 400) * 2 * TAU; edge.push(evalAt(S, t % TAU, t < TAU ? 1 : -1)); }
    sc.strands([isoV(S, 0.5, 200), edge.slice(0, 201), edge.slice(200)], { r: 0.008, dens: 1.6, c0: 1.0, c1: 1.0 });
  },
});

/* ───────────── Trefoil knot ───────────── */
export const trefoil = defineShape({
  id: "math-trefoil-knot", name: "Trefoil Knot", tag: MATH,
  description: "The trefoil, the simplest non-trivial knot: a tube with three over-under crossings, banded rings along its length and a luminous core filament.",
  palette: [[0, "#1a0838"], [0.25, "#7a1fd6"], [0.5, "#ff4aa0"], [0.75, "#ffb84a"], [1, "#fffbe0"]], count: 110000, size: 0.0054, fit: 1.5, heavy: false, camera: cam(5.4, 0.5, 0.35),
  build(sc) {
    const k = (t: number): V3 => [0.5 * (Math.sin(t) + 2 * Math.sin(2 * t)), 0.5 * (Math.cos(t) - 2 * Math.cos(2 * t)), -0.5 * Math.sin(3 * t)];
    const S = tubeSurf(k, 0.24, 0, TAU);
    sc.sheet(S, { dens: 1.0, thick: 0.003, c: (u, v) => (u / TAU) * 0.8 + 0.1 + 0.08 * Math.sin(v) });
    const rings: V3[][] = []; for (let i = 0; i < 110; i++) { const t = (i / 110) * TAU, ln: V3[] = []; for (let j = 0; j <= 16; j++) ln.push(evalAt(S, t, (j / 16) * TAU)); rings.push(ln); }
    sc.strands(rings, { r: 0.005, dens: 0.9, c0: 0.95, c1: 0.95, al: 0.8 }); sc.strands([curveLine(k, 0, TAU, 400)], { r: 0.012, dens: 1.4, c0: 1.0, c1: 1.0 });
  },
});

/* ───────────── Möbius torus (twisted torus) ───────────── */
export const mobiusTorus = defineShape({
  id: "math-mobius-torus", name: "Möbius Torus", tag: MATH,
  description: "A torus with an elliptical cross-section that rotates through one and a half turns as it circles the axis, giving a three-lobed twisting ribbon-like body with stripes and ring bands.",
  palette: SPEC, count: 110000, size: 0.0054, fit: 1.5, heavy: false, camera: cam(5.0, 0.4, 0.5),
  build(sc) {
    const R = 1.25, a = 0.62, b = 0.18, S: ParamSurface = { u0: 0, u1: TAU, v0: 0, v1: TAU, eval(t, th, o) { const ph = 1.5 * t, lx = a * Math.cos(th) * Math.cos(ph) - b * Math.sin(th) * Math.sin(ph), ly = a * Math.cos(th) * Math.sin(ph) + b * Math.sin(th) * Math.cos(ph); o[0] = (R + lx) * Math.cos(t); o[1] = ly; o[2] = (R + lx) * Math.sin(t); } };
    sc.sheet(S, { dens: 1.0, thick: 0.004, c: (u, v) => (u / TAU + 0.18 * Math.sin(v * 2)) % 1 });
    sc.strands(gridLines(S, 90, 10, 60), { r: 0.0042, dens: 0.8, c0: 0.5, c1: 0.5, al: 0.75 });
  },
});

/* ───────────── Dini's surface ───────────── */
export const dini = defineShape({
  id: "math-dini-surface", name: "Dini's Surface", tag: MATH,
  description: "Dini's surface: a pseudosphere twisted into a spiralling trumpet of constant negative curvature, whose profile is the tractrix, drawn with its asymptotic mesh.",
  palette: [[0, "#06142a"], [0.25, "#1a6fd6"], [0.5, "#2ad6c8"], [0.75, "#ffe27a"], [1, "#ff5a8a"]], count: 110000, size: 0.0054, fit: 1.5, heavy: false, camera: cam(5.6, 0.6, 0.25),
  build(sc) {
    const A = 1, B = 0.2, S: ParamSurface = { u0: 0, u1: 4 * Math.PI, v0: 0.04, v1: 2, eval(u, v, o) { o[0] = A * Math.cos(u) * Math.sin(v); o[2] = A * Math.sin(u) * Math.sin(v); o[1] = A * (Math.cos(v) + Math.log(Math.tan(v / 2))) + B * u - 1.2; } };
    sc.sheet(S, { dens: 1.0, thick: 0.004, c: (u, v) => clamp01(0.1 + 0.5 * (v - 0.04) / 1.96 + 0.3 * (0.5 + 0.5 * Math.sin(u * 1.5))) });
    sc.strands(gridLines(S, 64, 26, 80), { r: 0.0042, dens: 0.8, c0: 0.78, c1: 0.78, al: 0.75 });
  },
});

/* ───────────── Enneper's surface ───────────── */
export const enneper = defineShape({
  id: "math-enneper", name: "Enneper's Surface", tag: MATH,
  description: "Enneper's minimal surface: a self-intersecting saddle with a flat middle and four-fold curling lobes, shown with its polar mesh of curvature lines.",
  palette: [[0, "#1a0a2a"], [0.25, "#6a1fd6"], [0.5, "#ff4a9a"], [0.75, "#ffc04a"], [1, "#f6ffe0"]], count: 110000, size: 0.0054, fit: 1.5, heavy: false, camera: cam(5.2, 0.5, 0.4),
  build(sc) {
    const S: ParamSurface = { u0: 0, u1: TAU, v0: 0, v1: 1.5, eval(t, r, o) { o[0] = r * Math.cos(t) - (r * r * r * Math.cos(3 * t)) / 3; o[2] = -r * Math.sin(t) - (r * r * r * Math.sin(3 * t)) / 3; o[1] = r * r * Math.cos(2 * t); } };
    sc.sheet(S, { dens: 1.0, thick: 0.004, c: (u, v) => clamp01(0.15 + 0.6 * (v / 1.5) + 0.15 * Math.sin(u * 2)) });
    sc.strands(gridLines(S, 48, 14, 70), { r: 0.0042, dens: 0.8, c0: 0.9, c1: 0.9, al: 0.75 });
  },
});

/* ───────────── Spherical harmonics ───────────── */
function plm(l: number, m: number, x: number): number {
  let pmm = 1; if (m > 0) { const s = Math.sqrt((1 - x) * (1 + x)); let f = 1; for (let i = 1; i <= m; i++) { pmm *= -f * s; f += 2; } }
  if (l === m) return pmm;
  let pm1 = x * (2 * m + 1) * pmm; if (l === m + 1) return pm1;
  let pl = 0; for (let ll = m + 2; ll <= l; ll++) { pl = ((2 * ll - 1) * x * pm1 - (ll + m - 1) * pmm) / (ll - m); pmm = pm1; pm1 = pl; }
  return pl;
}
export const sphericalHarmonics = defineShape({
  id: "math-spherical-harmonics", name: "Spherical Harmonics", tag: MATH,
  description: "A superposition of real spherical harmonics (l = 5, m = 3 and l = 4, m = 2): a many-lobed orbital whose radius is the field magnitude, coloured by sign with nodal lines drawn.",
  palette: [[0, "#0a1a5a"], [0.25, "#1f6fff"], [0.45, "#9ad8ff"], [0.5, "#f4f4f4"], [0.55, "#ffd09a"], [0.75, "#ff7a2a"], [1, "#9a0a1a"]], count: 110000, size: 0.0054, fit: 1.5, heavy: false, camera: cam(5.0, 0.5, 0.3),
  build(sc) {
    const Y = (th: number, ph: number) => 0.8 * plm(5, 3, Math.cos(th)) * Math.cos(3 * ph) + 0.6 * plm(4, 2, Math.cos(th)) * Math.cos(2 * ph + 0.6);
    let mx = 0; for (let i = 0; i <= 40; i++) for (let j = 0; j < 80; j++) mx = Math.max(mx, Math.abs(Y((i / 40) * Math.PI, (j / 80) * TAU)));
    const S: ParamSurface = { u0: 0, u1: TAU, v0: 0, v1: Math.PI, eval(ph, th, o) { const r = (Math.abs(Y(th, ph)) / mx) * 1.6 + 0.02; o[0] = r * Math.sin(th) * Math.cos(ph); o[1] = r * Math.cos(th); o[2] = r * Math.sin(th) * Math.sin(ph); } };
    sc.sheet(S, { dens: 1.0, thick: 0.004, c: (ph, th) => { const y = Y(th, ph) / mx; return y >= 0 ? 0.55 + 0.45 * Math.sqrt(y) : 0.45 - 0.45 * Math.sqrt(-y); } });
    sc.strands(gridLines(S, 36, 18, 80), { r: 0.0038, dens: 0.6, c0: 0.5, c1: 0.5, al: 0.6 });
  },
});

/* ───────────── Fibonacci / golden spiral nautilus ───────────── */
export const fibonacciSpiral = defineShape({
  id: "math-fibonacci-spiral", name: "Golden Spiral Shell", tag: MATH,
  description: "A nautilus-like shell grown on the golden logarithmic spiral (each quarter turn widens by φ), with chamber septa, a luminous growth line and golden-angle seed dots on its flank.",
  palette: [[0, "#2a1204"], [0.25, "#8a4a14"], [0.5, "#e0a040"], [0.75, "#fff0c0"], [1, "#ffffff"]], count: 110000, size: 0.0054, fit: 1.5, heavy: false, camera: cam(5.4, 0.5, 0.45),
  build(sc) {
    const PHI = (1 + Math.sqrt(5)) / 2, bgr = Math.log(PHI) / (Math.PI / 2), k = 0.5;
    const S: ParamSurface = { u0: -2.6 * Math.PI, u1: 2 * Math.PI, v0: 0, v1: TAU, eval(t, v, o) { const r = Math.exp(bgr * t) * 0.5, q = 1 + k * Math.cos(v); o[0] = r * q * Math.cos(t); o[1] = r * k * Math.sin(v) * 0.9; o[2] = r * q * Math.sin(t); } };
    sc.sheet(S, { dens: 1.0, thick: 0.003, c: (t, v) => clamp01(0.2 + 0.5 * ((t + 2.6 * Math.PI) / (4.6 * Math.PI)) + 0.1 * Math.sin(v)) });
    const sep: V3[][] = []; for (let i = 0; i < 70; i++) { const t = S.u0 + ((S.u1 - S.u0) * i) / 70, ln: V3[] = []; for (let j = 0; j <= 18; j++) ln.push(evalAt(S, t, (j / 18) * TAU)); sep.push(ln); }
    sc.strands(sep, { r: 0.0045, dens: 0.9, c0: 0.9, c1: 0.9, al: 0.8 });
    const gl: V3[] = []; for (let i = 0; i <= 400; i++) gl.push(evalAt(S, S.u0 + ((S.u1 - S.u0) * i) / 400, 0)); sc.strands([gl], { r: 0.01, dens: 1.4, c0: 1.0, c1: 1.0 });
  },
});

/* ───────────── Infinity symbol ───────────── */
export const infinity = defineShape({
  id: "form-infinity", name: "Infinity Symbol (3D)", tag: "Complex 3D particle formations",
  description: "A lemniscate of Bernoulli swept into a glossy tube that rises and dips through its crossing, braided with three luminous helical filaments and a bright inner core.",
  palette: [[0, "#06143a"], [0.25, "#1f6fff"], [0.5, "#2ad6e8"], [0.75, "#ff6ad0"], [1, "#fff0ff"]], count: 110000, size: 0.0054, fit: 1.55, heavy: false, camera: cam(5.6, 0.4, 0.35),
  build(sc) {
    const k = (t: number): V3 => { const d = 1 + Math.sin(t) ** 2; return [1.9 * Math.cos(t) / d, 0.45 * Math.sin(2 * t) * 0.8 / 1 + 0, 1.9 * Math.sin(t) * Math.cos(t) / d * 1.0]; };
    const S = tubeSurf(k, 0.2, 0, TAU);
    sc.sheet(S, { dens: 1.0, thick: 0.003, c: (u, v) => (u / TAU + 0.05 * Math.sin(v * 2)) % 1 });
    const fil: V3[][] = []; for (let h = 0; h < 3; h++) { const ln: V3[] = []; for (let i = 0; i <= 600; i++) { const t = (i / 600) * TAU; ln.push(evalAt(S, t, 6 * t + (h * TAU) / 3)); } fil.push(ln); }
    sc.strands(fil, { r: 0.007, dens: 1.5, c0: 0.95, c1: 0.95 }); sc.strands([curveLine(k, 0, TAU, 400)], { r: 0.014, dens: 1.2, c0: 1.0, c1: 1.0, al: 0.8 });
  },
});

/* ───────────── Hopf fibration ───────────── */
export const hopf = defineShape({
  id: "math-hopf-fibration", name: "Hopf Fibration", tag: MATH,
  description: "The Hopf fibration, stereographically projected: nested tori filled with mutually linked circles, each a fibre over one point of the 2-sphere, colour-coded by the torus they lie on.",
  palette: [[0, "#ff3a6e"], [0.2, "#ff9a3a"], [0.4, "#f6e84a"], [0.6, "#3ad68a"], [0.8, "#3a8aff"], [1, "#b04aff"]], count: 100000, size: 0.0052, fit: 1.5, heavy: false, camera: cam(5.0, 0.5, 0.45),
  build(sc) {
    const etas = [0.62, 0.88, 1.12, 1.34];
    etas.forEach((eta, li) => {
      const lines: V3[][] = [];
      for (let j = 0; j < 20; j++) { const d = (j / 20) * TAU, ln: V3[] = []; for (let i = 0; i <= 140; i++) { const tau = (i / 140) * TAU, x1 = Math.sin(eta) * Math.cos(tau), x2 = Math.sin(eta) * Math.sin(tau), x3 = Math.cos(eta) * Math.cos(tau + d), x4 = Math.cos(eta) * Math.sin(tau + d), q = 1 / (1.15 - x4); ln.push([x1 * q, x3 * q, x2 * q]); } lines.push(ln); }
      sc.strands(lines, { r: 0.009, dens: 1.2, c0: 0.12 + li * 0.25, c1: 0.2 + li * 0.25 });
    });
  },
});

/* ───────────── Tesseract ───────────── */
export const tesseract = defineShape({
  id: "math-tesseract", name: "Tesseract", tag: MATH,
  description: "A four-dimensional hypercube rotated through the XW, ZW and XY planes and perspective-projected to 3D: sixteen vertices, thirty-two edges and twenty-four translucent square faces, coloured by depth in the fourth dimension.",
  palette: [[0, "#1a0a3a"], [0.3, "#5a2ad6"], [0.55, "#2ad6e8"], [0.8, "#ffd84a"], [1, "#ffffff"]], count: 100000, size: 0.0054, fit: 1.5, heavy: false, camera: cam(5.0, 0.5, 0.3),
  build(sc) {
    const rot = (p: number[], i: number, j: number, a: number) => { const c = Math.cos(a), s = Math.sin(a), x = p[i], y = p[j]; p[i] = x * c - y * s; p[j] = x * s + y * c; };
    const verts: number[][] = []; for (let m = 0; m < 16; m++) verts.push([m & 1 ? 1 : -1, m & 2 ? 1 : -1, m & 4 ? 1 : -1, m & 8 ? 1 : -1]);
    const P3: V3[] = [], W: number[] = [];
    for (const v of verts) { const p = v.slice(); rot(p, 0, 3, 0.7); rot(p, 2, 3, 0.5); rot(p, 0, 1, 0.3); const q = 1 / (3 - p[3]); P3.push([p[0] * q * 2.4, p[1] * q * 2.4, p[2] * q * 2.4]); W.push(p[3]); }
    const wc = (i: number) => clamp01((W[i] + 1.4) / 2.8);
    for (let a = 0; a < 16; a++) for (let b = 0; b < 4; b++) { const o = a ^ (1 << b); if (o > a) sc.strands([[P3[a], P3[o]]], { r: 0.012, dens: 2.0, c0: wc(a), c1: wc(o) }); }
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { const others = [0, 1, 2, 3].filter((x) => x !== i && x !== j); for (let m = 0; m < 4; m++) { const base = (m & 1 ? 1 << others[0] : 0) | (m & 2 ? 1 << others[1] : 0), a = base, b = base | (1 << i), c = base | (1 << i) | (1 << j), d = base | (1 << j); sc.sheet(quad(P3[a], P3[b], P3[c], P3[d]), { dens: 0.25, thick: 0.004, c: wc(a) * 0.5 + wc(c) * 0.5, al: 0.7 }); } }
    const nd = sc.solid(0.01); P3.forEach((p, i) => nd.sph(p, 0.07, { c: wc(i), k: 0.01, sz: 1.1 }));
  },
});

/* ───────────── Buckminsterfullerene (C60) ───────────── */
export const buckyball = defineShape({
  id: "math-buckyball", name: "Buckyball (C60)", tag: MATH,
  description: "Buckminsterfullerene: sixty carbon atoms at the vertices of a truncated icosahedron, joined by 90 bonds (double bonds on hexagon–hexagon edges), with twelve golden pentagons and twenty blue hexagons shaded in.",
  palette: [[0, "#06101c"], [0.25, "#1a5fd6"], [0.45, "#2ad0e0"], [0.7, "#ffd25a"], [0.9, "#ff6a3a"], [1, "#ffffff"]], count: 110000, size: 0.0054, fit: 1.5, heavy: false, camera: cam(4.8, 0.5, 0.3),
  build(sc) {
    const I = icosahedron(), D = dual(I), R = 1.75, pt = new Map<string, V3>(), key = (a: number, b: number) => `${a}>${b}`;
    let e = 9; for (let b = 1; b < I.V.length; b++) e = Math.min(e, dist3(I.V[0], I.V[b]));
    for (let a = 0; a < I.V.length; a++) for (let b = 0; b < I.V.length; b++) if (a !== b && Math.abs(dist3(I.V[a], I.V[b]) - e) < 1e-3) pt.set(key(a, b), lerp3(I.V[a], I.V[b], 1 / 3));
    void icoVerts; void triSurf;
    const P = (a: number, b: number) => scale3(norm3(pt.get(key(a, b)) as V3), R);
    const atoms = [...pt.values()].map((p) => scale3(norm3(p), R)), nd = sc.solid(0.012), bonds = sc.solid(0.012);
    atoms.forEach((p) => nd.sph(p, 0.13, { c: 0.32, k: 0.012, sz: 1.1 }));
    const bondList: Array<[V3, V3, boolean]> = [];
    for (const [k1] of pt) { const [a, b] = k1.split(">").map(Number); if (a < b) bondList.push([P(a, b), P(b, a), true]); }
    D.F.forEach((_face, vi) => { const ring: V3[] = []; const around = I.V.map((_, j) => j).filter((j) => pt.has(key(vi, j))); const n0 = I.V[vi], e1 = norm3(cross3(n0, Math.abs(n0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = cross3(n0, e1); around.sort((x, y) => { const ax = pt.get(key(vi, x)) as V3, ay = pt.get(key(vi, y)) as V3; return Math.atan2(ax[0] * e2[0] + ax[1] * e2[1] + ax[2] * e2[2], ax[0] * e1[0] + ax[1] * e1[1] + ax[2] * e1[2]) - Math.atan2(ay[0] * e2[0] + ay[1] * e2[1] + ay[2] * e2[2], ay[0] * e1[0] + ay[1] * e1[1] + ay[2] * e1[2]); }); around.forEach((j) => ring.push(P(vi, j)));
      for (let q = 0; q < ring.length; q++) bondList.push([ring[q], ring[(q + 1) % ring.length], false]);
      const cen = scale3(norm3(n0), R * 0.985); for (let q = 0; q < ring.length; q++) sc.sheet(triSurf(cen, scale3(ring[q], 0.985), scale3(ring[(q + 1) % ring.length], 0.985)), { dens: 1.4, thick: 0.004, c: 0.72, al: 0.8 }); });
    I.F.forEach(([a, b, c]) => { const hex = [P(a, b), P(b, a), P(b, c), P(c, b), P(c, a), P(a, c)], cen = scale3(norm3(centroid3(hex)), R * 0.985); for (let q = 0; q < 6; q++) sc.sheet(triSurf(cen, scale3(hex[q], 0.985), scale3(hex[(q + 1) % 6], 0.985)), { dens: 1.1, thick: 0.004, c: 0.3, al: 0.7 }); });
    for (const [a, b, dbl] of bondList) bonds.cone(a, b, dbl ? 0.05 : 0.036, dbl ? 0.05 : 0.036, { c: dbl ? 0.9 : 0.55, k: 0.01 });
  },
});
const centroid3 = (p: V3[]): V3 => { const c: V3 = [0, 0, 0]; p.forEach((q) => { c[0] += q[0]; c[1] += q[1]; c[2] += q[2]; }); return [c[0] / p.length, c[1] / p.length, c[2] / p.length]; };

export const MATHA_SHAPES: GeneratorDef[] = [kleinBottle, mobiusStrip, trefoil, mobiusTorus, dini, enneper, sphericalHarmonics, fibonacciSpiral, infinity, hopf, tesseract, buckyball];
