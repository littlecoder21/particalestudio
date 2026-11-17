import type { GeneratorDef } from "../types";
import { vnoise, type Rng } from "../math";
import type { ParamSurface } from "../sampling";
import { defineShape, ringLine, norm3, cross3, splinePoints, sstep, type Scene, type V3 } from "./sculpt";

export const PLANT = "Plants & flowers";
const TAU = Math.PI * 2, GOLD = 2.399963;
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** A cupped petal/leaf: base B, growth axis a, side s (width direction); u∈[-1,1] across, v∈[0,1] along. */
export function petal(B: V3, axis: V3, side: V3, L: number, W: number, o: { cup?: number; curl?: number; shape?: (v: number) => number; wave?: number; fold?: number } = {}): ParamSurface {
  const a = norm3(axis), n = norm3(cross3(side, a)), s = norm3(cross3(a, n)), cup = o.cup ?? 0.3, curl = o.curl ?? 0, wave = o.wave ?? 0, fold = o.fold ?? 0;
  const shape = o.shape ?? ((v: number) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + 0.9 * Math.pow(v, 0.9))), 0.7));
  return {
    u0: -1, u1: 1, v0: 0, v1: 1,
    eval(u, v, out) {
      const w = W * shape(v) * u, lift = curl * L * v * v + cup * (w * w) / Math.max(0.02, W) + wave * Math.sin(u * 5 + v * 9) * v * W * 0.2 - fold * Math.abs(u) * W * 0.4;
      out[0] = B[0] + a[0] * L * v + s[0] * w + n[0] * lift; out[1] = B[1] + a[1] * L * v + s[1] * w + n[1] * lift; out[2] = B[2] + a[2] * L * v + s[2] * w + n[2] * lift;
    },
  };
}
const sideOf = (a: V3, up: V3 = [0, 1, 0]): V3 => { const s = cross3(a, up); return Math.hypot(...s) < 1e-3 ? [1, 0, 0] : norm3(s); };

/** Veined leaf colour: midrib + lateral veins. */
const leafCol = (base: number, vein: number) => (u: number, v: number) => (Math.abs(u) < 0.05 ? vein : Math.abs(Math.sin((v * 9 - Math.abs(u) * 3.2) * Math.PI)) < 0.07 && Math.abs(u) > 0.05 ? vein - 0.03 : base + 0.1 * v - 0.05 * Math.abs(u));

/* ───────────── Sunflower ───────────── */
export const sunflower = defineShape({
  id: "plant-sunflower", name: "Sunflower", tag: PLANT,
  description: "A sunflower with a golden-angle seed spiral disc, two rings of lance-shaped ray petals, green bracts, a hairy curved stem and broad veined leaves.",
  palette: [[0, "#120a04"], [0.14, "#47290f"], [0.3, "#2f7a2a"], [0.48, "#8cba2a"], [0.66, "#f2b110"], [0.84, "#ffd84a"], [1, "#fff2a0"]],
  count: 110000, size: 0.0056, fit: 1.4, camera: { distance: 4.8, yaw: 0.0, pitch: 0.12, autoRotate: 0.08 },
  build(sc, { detail }) {
    const rng = sc.rng, C: V3 = [0, 2.1, 0], f: V3 = norm3([0, 0.22, 1]), e1: V3 = [1, 0, 0], e2: V3 = [0, f[2], -f[1]];
    const W = (a: number, b: number, h: number): V3 => [C[0] + e1[0] * a + e2[0] * b + f[0] * h, C[1] + e1[1] * a + e2[1] * b + f[1] * h, C[2] + e1[2] * a + e2[2] * b + f[2] * h];
    const N = 1100;
    sc.points(2.4, (r, o) => {
      const i = Math.floor(r.next() * N), rr = 0.5 * Math.sqrt((i + 0.5) / N), th = i * GOLD, a = r.next() * TAU, j = 0.011 * Math.sqrt(r.next()), x = rr * Math.cos(th) + j * Math.cos(a), y = rr * Math.sin(th) + j * Math.sin(a), h = 0.07 * (1 - (rr / 0.5) ** 2) + 0.01 * Math.sin(i * 0.9) + 0.006 * r.next();
      const p = W(x, y, h); o[0] = p[0]; o[1] = p[1]; o[2] = p[2]; o[3] = f[0]; o[4] = f[1]; o[5] = f[2]; o[6] = 0.05 + 0.1 * Math.min(1, rr / 0.5) + 0.03 * ((i % 21) / 21);
    });
    for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 24; k++) {
      const th = (k / 24) * TAU + ring * 0.13 + 0.03 * Math.sin(k * 5.7), out = add(add([0, 0, 0], e1, Math.cos(th)), e2, Math.sin(th)), B = W(0.5 * Math.cos(th), 0.5 * Math.sin(th), -0.02 * ring);
      const axis = norm3(add(add(out, f, 0.25 - 0.15 * ring), [0, -1, 0], 0.12 + 0.1 * ring + 0.1 * Math.abs(Math.sin(k * 2.1)))), L = 0.52 + 0.1 * Math.sin(k * 3.3) - 0.06 * ring;
      sc.sheet(petal(B, axis, norm3(cross3(axis, f)), L, 0.1, { cup: 0.35, curl: 0.12 + 0.05 * ring, wave: 0.4 }), { dens: 1.1, thick: 0.004, c: (u, v) => 0.68 + 0.16 * v + 0.05 * Math.abs(u) + 0.04 * Math.sin(u * 14) });
    }
    for (let k = 0; k < 18; k++) { const th = (k / 18) * TAU, out = add(add([0, 0, 0], e1, Math.cos(th)), e2, Math.sin(th)), B = W(0.5 * Math.cos(th), 0.5 * Math.sin(th), -0.08); sc.sheet(petal(B, add(out, f, -0.7), norm3(cross3(out, f)), 0.28, 0.06, { cup: 0.2 }), { dens: 1, thick: 0.004, c: 0.4 }); }
    const s = sc.solid(0.04), stem: V3[] = [[0, 2.05, -0.15], [0, 1.5, -0.32], [0.1, 0.7, -0.2], [0, 0.0, 0]];
    s.tube(stem, [0.065, 0.055, 0.07, 0.09], { seg: 24, c: 0.38, k: 0.03 });
    s.ell(C.map((v, i) => v - f[i] * 0.04) as V3, [0.06, 0.52, 0.52], { dir: f, up: [0, 1, 0], c: 0.16, k: 0.01 });
    s.shade = (x, y, z, _nx, _ny, _nz, t) => t + 0.08 * (vnoise(x * 10, y * 10, z * 10) - 0.5) * detail;
    sc.strands(Array.from({ length: 160 }, () => { const t = rng.next(), p = splinePoints(stem, 30)[Math.floor(t * 29)], a = rng.next() * TAU; return [[p[0] + 0.06 * Math.cos(a), p[1], p[2] + 0.06 * Math.sin(a)], [p[0] + 0.11 * Math.cos(a), p[1] - 0.03, p[2] + 0.11 * Math.sin(a)]] as V3[]; }), { r: 0.004, dens: 0.5, c0: 0.45, c1: 0.45 });
    for (const sg of [1, -1]) { const B: V3 = [0.02 * sg, 0.8 + 0.2 * sg, -0.22]; sc.sheet(petal(B, norm3([0.9 * sg, 0.45, -0.1]), [0, 0, 1], 0.95, 0.42, { cup: 0.2, curl: -0.3, wave: 0.3, shape: (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + 0.9 * Math.pow(v, 0.7))), 0.55) * (1 - 0.15 * v) }), { dens: 1.4, thick: 0.005, c: leafCol(0.36, 0.5) }); }
  },
});

/* ───────────── Tulip ───────────── */
export const tulip = defineShape({
  id: "plant-tulip", name: "Tulip", tag: PLANT,
  description: "A tulip with a cup of six overlapping satin petals, a slender stem, long arching strap leaves and visible stamens.",
  palette: [[0, "#0e1c08"], [0.16, "#2a7a2a"], [0.34, "#86cf4a"], [0.5, "#bd1038"], [0.74, "#ff4d6e"], [1, "#ffd6df"]],
  count: 90000, size: 0.0058, fit: 1.35, camera: { distance: 4.6, yaw: 0.3, pitch: 0.1, autoRotate: 0.09 },
  build(sc) {
    const s = sc.solid(0.04), stem: V3[] = [[0, 0, 0], [0.04, 0.8, 0], [-0.02, 1.5, 0], [0.0, 1.9, 0]];
    s.tube(stem, [0.05, 0.04, 0.035, 0.04], { seg: 16, c: 0.2, k: 0.02 });
    s.ell([0, 1.97, 0], [0.12, 0.08, 0.12], { c: 0.3, k: 0.03 });
    const cupPetal = (a: number, h: number, lean: number, w: number, layer: number) => {
      const B: V3 = [0.07 * Math.cos(a), 1.95, 0.07 * Math.sin(a)], out: V3 = [Math.cos(a), 0, Math.sin(a)], axis = norm3(add(add([0, 1, 0], out, lean), [0, 0, 0])), side: V3 = norm3([-Math.sin(a), 0, Math.cos(a)]);
      sc.sheet(petal(B, axis, side, h, w, { cup: -0.95 + 0.1 * layer, curl: -lean * 0.12, wave: 0.15, shape: (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + 0.82 * Math.pow(v, 0.85))), 0.55) }), { dens: 1.8, thick: 0.005, c: (u, v) => 0.5 + 0.3 * v + 0.05 * layer + 0.04 * Math.sin(u * 9) + (v < 0.18 ? -0.18 : 0) });
    };
    for (let i = 0; i < 3; i++) cupPetal((i / 3) * TAU + 0.4, 0.78, 0.38, 0.27, 0);
    for (let i = 0; i < 3; i++) cupPetal((i / 3) * TAU + 0.4 + Math.PI / 3, 0.74, 0.28, 0.25, 1);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; s.cone([0.03 * Math.cos(a), 1.98, 0.03 * Math.sin(a)], [0.07 * Math.cos(a), 2.5, 0.07 * Math.sin(a)], 0.01, 0.008, { c: 0.1, k: 0.004 }); s.sph([0.07 * Math.cos(a), 2.5, 0.07 * Math.sin(a)], 0.022, { c: 0.04, k: 0.004 }); }
    s.ell([0, 1.97, 0], [0.04, 0.2, 0.04], { c: 0.3, k: 0.01 });
    for (const [ang, L, w] of [[0.3, 1.5, 0.22], [3.4, 1.25, 0.2], [1.9, 0.95, 0.17]] as const) {
      const lf: ParamSurface = { u0: -1, u1: 1, v0: 0, v1: 1, eval(u, v, o) { const r = 0.05 + L * v * 0.55 + 0.0, out = 0.12 + 0.55 * v * v * 0.6 + 0.5 * v; const wd = w * Math.pow(Math.sin(Math.PI * Math.min(1, 0.04 + 0.96 * v)), 0.7) * u, a2 = ang + 0.1 * Math.sin(v * 3); o[0] = (0.04 + out * 0.55) * Math.cos(a2) - Math.sin(a2) * wd; o[1] = 0.02 + L * (v * 0.7 - 0.28 * v * v * (L > 1.2 ? 1.2 : 1.4)) * 0.8 + 0.4 * Math.sin(v * 3.1) * 0 + 0.0 * r; o[2] = (0.04 + out * 0.55) * Math.sin(a2) + Math.cos(a2) * wd + 0.02 * u * u; } };
      sc.sheet(lf, { dens: 1.6, thick: 0.005, c: leafCol(0.24, 0.4) });
    }
  },
});

/* ───────────── Sacred lotus ───────────── */
export const lotus = defineShape({
  id: "plant-lotus", name: "Lotus", tag: PLANT,
  description: "A sacred lotus in bloom: layered pink-tipped petals around a golden seed pod with stamens, resting on a round pad above rippling water.",
  palette: [[0, "#06140e"], [0.18, "#1f6e48"], [0.34, "#5fb25a"], [0.5, "#f08ab4"], [0.72, "#ffd0e0"], [0.88, "#ffe27a"], [1, "#ffffff"]],
  count: 110000, size: 0.0056, fit: 1.4, camera: { distance: 5.0, yaw: 0.0, pitch: 0.42, autoRotate: 0.08 },
  build(sc) {
    const rng = sc.rng, s = sc.solid(0.03);
    const layers: Array<[number, number, number, number, number]> = [[9, 1.2, 0.62, 1.15, 0.32], [8, 1.15, 0.5, 0.95, 0.28], [8, 1.05, 0.34, 0.78, 0.23], [6, 0.82, 0.2, 0.52, 0.19]];
    layers.forEach(([n, L, lean, openY, W], li) => {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + li * 0.37, out: V3 = [Math.cos(a), 0, Math.sin(a)], B: V3 = [out[0] * (0.08 + 0.04 * li), 0.06 + 0.04 * li, out[2] * (0.08 + 0.04 * li)], axis = norm3(add([0, 1, 0], out, lean * 1.5 * (1.0 - 0.0)));
        sc.sheet(petal(B, axis, [-Math.sin(a), 0, Math.cos(a)], L * (0.9 + 0.1 * Math.sin(k * 2.3)), W, { cup: 0.55, curl: 0.08 + 0.05 * li, shape: (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + 0.88 * Math.pow(v, 0.9))), 0.5) * (1 - 0.2 * Math.pow(v, 3)) }), { dens: 1.5, thick: 0.004, c: (u, v) => 0.4 + 0.12 * v * (li > 1 ? 1.2 : 1) + 0.28 * Math.pow(1 - v, 2) * (1 - Math.abs(u) * 0.5) + 0.05 * Math.sin(u * 16) });
        void openY;
      }
    });
    s.ell([0, 0.32, 0], [0.12, 0.05, 0.12], { c: 0.84, k: 0.02 });
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; s.cone([0.1 * Math.cos(a), 0.2, 0.1 * Math.sin(a)], [0.2 * Math.cos(a), 0.52, 0.2 * Math.sin(a)], 0.01, 0.005, { c: 0.88, k: 0.004 }); s.sph([0.2 * Math.cos(a), 0.53, 0.2 * Math.sin(a)], 0.015, { c: 0.9, k: 0.003 }); }
    // lily pad leaf with a notch, floating beneath
    sc.sheet({ u0: 0.08, u1: TAU - 0.08, v0: 0, v1: 1, eval(u, v, o) { const r = 1.7 * v * (1 + 0.02 * Math.sin(u * 20)); o[0] = r * Math.cos(u) + 0.0; o[1] = -0.3 + 0.07 * v * v * 3 + 0.015 * Math.sin(r * 9 + u * 2); o[2] = r * Math.sin(u); } }, { dens: 1.1, thick: 0.005, c: (u, v) => 0.26 + 0.1 * v + (Math.abs(Math.sin(u * 9)) < 0.05 ? 0.12 : 0) });
    for (const r of [0.3, 0.52, 0.76]) sc.strands([ringLine(1.9 + r * 1.0, -0.42, 160, (a) => 0.02 * Math.sin(a * 13))], { r: 0.006, dens: 1.1, c0: 0.7, c1: 0.7, al: 0.5 });
    void rng;
  },
});

/* ───────────── Rose ───────────── */
export const rose = defineShape({
  id: "nature-rose", name: "Rose", tag: PLANT,
  description: "A rose in full bloom: tightly spiralled inner petals opening to reflexed outer petals, sepals, a thorny stem and serrated leaves.",
  palette: [[0, "#0a1608"], [0.12, "#27661f"], [0.26, "#4b8a2a"], [0.4, "#4a0812"], [0.58, "#a80f26"], [0.78, "#e43048"], [1, "#ffa8b0"]],
  count: 120000, size: 0.0056, fit: 1.4, camera: { distance: 4.6, yaw: 0.25, pitch: 0.3, autoRotate: 0.08 },
  build(sc, { detail }) {
    const rng = sc.rng, N = 44, s = sc.solid(0.03);
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), a = i * GOLD, rr = 0.025 + 0.38 * Math.pow(t, 0.8), y = 0.22 - 0.2 * Math.pow(t, 1.3) + (t > 0.8 ? -0.1 * (t - 0.8) * 4 : 0), out: V3 = [Math.cos(a), 0, Math.sin(a)];
      const open = Math.pow(t, 1.15), axis = norm3(add([0, 1, 0], out, 0.1 + 2.0 * open * open)), L = 0.22 + 0.55 * Math.pow(t, 0.8), W = 0.12 + 0.2 * Math.pow(t, 0.7);
      sc.sheet(petal([out[0] * rr, y, out[2] * rr], axis, [-Math.sin(a), 0, Math.cos(a)], L, W, { cup: 0.8 - 0.35 * t, curl: 0.1 + 0.5 * Math.pow(t, 2.2), wave: 0.15 + 0.3 * t, fold: 0.2 * (1 - t), shape: (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.16 + 0.84 * Math.pow(v, 0.8))), 0.5) * (1 + 0.1 * Math.sin(v * 3)) }), { dens: 1.8 - 0.5 * t, thick: 0.004, c: (u, v) => 0.4 + 0.22 * t + 0.28 * v + 0.05 * Math.sin(u * 10 + i) - (v < 0.2 ? 0.1 : 0) });
    }
    // sepals, receptacle, thorny stem
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + 0.4, out: V3 = [Math.cos(a), 0, Math.sin(a)]; sc.sheet(petal([out[0] * 0.08, -0.14, out[2] * 0.08], norm3(add([0, -0.45, 0], out, 0.9)), [-Math.sin(a), 0, Math.cos(a)], 0.55, 0.07, { cup: 0.3, curl: 0.2, wave: 0.5 }), { dens: 1.2, thick: 0.004, c: 0.22 }); }
    s.ell([0, -0.1, 0], [0.13, 0.12, 0.13], { c: 0.2, k: 0.02 });
    const stem: V3[] = [[0, -0.15, 0], [0.04, -0.7, 0.02], [-0.1, -1.5, 0], [0, -2.2, 0.05]];
    s.tube(stem, [0.045, 0.04, 0.042, 0.05], { seg: 20, c: 0.16, k: 0.02 });
    const sp = splinePoints(stem, 40);
    for (let i = 0; i < 9; i++) { const p = sp[6 + i * 4], a = i * 2.3; s.cone([p[0] + 0.03 * Math.cos(a), p[1], p[2] + 0.03 * Math.sin(a)], [p[0] + 0.15 * Math.cos(a), p[1] - 0.05, p[2] + 0.15 * Math.sin(a)], 0.035, 0.004, { c: 0.5, k: 0.01 }); }
    s.shade = (x, y, z, _nx, _ny, _nz, t) => t + 0.05 * (vnoise(x * 12, y * 12, z * 12) - 0.5) * detail;
    const leaf = (B: V3, d: V3, L: number, sc2 = 1) => {
      const lf = petal(B, d, sideOf(d), L, 0.2 * sc2, { cup: 0.25, curl: -0.15, wave: 0.2, shape: (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + 0.94 * v)), 0.6) * (1 + 0.1 * Math.sin(v * 40)) });
      sc.sheet(lf, { dens: 1.6, thick: 0.004, c: leafCol(0.26, 0.4) });
    };
    leaf(sp[18], norm3([1, 0.55, 0.2]), 0.7); leaf(sp[18], norm3([1.2, 0.3, 0.2]), 0.42, 0.7);
    leaf(sp[28], norm3([-1, 0.5, -0.3]), 0.72); leaf(sp[28], norm3([-1.1, 0.3, -0.35]), 0.44, 0.7);
    void rng;
  },
});

/* ───────────── Cherry blossom branch ───────────── */
function blossom(sc: Scene, rng: Rng, C: V3, f: V3, r: number, open: number) {
  const up: V3 = Math.abs(f[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], e1 = norm3(cross3(up, f)), e2 = norm3(cross3(f, e1)), rot = rng.next() * TAU;
  for (let k = 0; k < 5; k++) {
    const a = rot + (k / 5) * TAU, d = add(add([0, 0, 0], e1, Math.cos(a)), e2, Math.sin(a)), axis = norm3(add(d, f, 0.25 + 0.4 * (1 - open)));
    sc.sheet(petal(add(C, d, 0.015), axis, norm3(cross3(axis, f)), r, r * 0.52, { cup: 0.35, curl: -0.2, shape: (v) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + 0.9 * v)), 0.45) * (v > 0.92 ? 1 - (v - 0.92) * 6 * (1 - Math.abs(0)) : 1) }), { dens: 2.5, thick: 0.003, c: (u, v) => 0.56 + 0.3 * v - 0.4 * Math.max(0, 0.2 - v) * 1.5 + 0.05 * Math.abs(u) });
  }
  const lines: V3[][] = [];
  for (let k = 0; k < 14; k++) { const a = rng.next() * TAU, d = add(add([0, 0, 0], e1, Math.cos(a)), e2, Math.sin(a)); lines.push([C, add(add(C, d, r * 0.5), f, r * 0.3), add(add(C, d, r * 0.65), f, r * 0.5)]); }
  sc.strands(lines, { r: 0.0035, dens: 4, c0: 0.45, c1: 0.9 });
}
export const cherry = defineShape({
  id: "nature-flower", name: "Cherry Blossom Branch", tag: PLANT,
  description: "A gnarled cherry branch in spring: five-petalled pink blossoms with notched petals and long stamens, buds and a few fresh leaves.",
  palette: [[0, "#0e0806"], [0.16, "#4a2a1a"], [0.3, "#7a4a30"], [0.5, "#ffa6c4"], [0.74, "#ffd9e6"], [1, "#ffffff"]],
  count: 120000, size: 0.0056, fit: 1.4, camera: { distance: 5.2, yaw: 0.2, pitch: 0.12, autoRotate: 0.08 },
  build(sc) {
    const rng = sc.rng, s = sc.solid(0.03), twigs: V3[][] = [], tips: Array<[V3, V3]> = [];
    const grow = (p: V3, d: V3, len: number, depth: number, r: number) => {
      const pts: V3[] = [p]; let q = p, dd = d;
      for (let i = 0; i < 4; i++) { dd = norm3([dd[0] + (rng.next() - 0.5) * 0.5, dd[1] + (rng.next() - 0.5) * 0.4 - 0.04, dd[2] + (rng.next() - 0.5) * 0.5]); q = add(q, dd, len / 4); pts.push(q); }
      if (depth >= 3) s.tube(pts, [r, r * 0.9, r * 0.8, r * 0.72, r * 0.65], { seg: 8, c: 0.22 + 0.02 * depth, k: 0.015 }); else twigs.push(pts);
      if (depth <= 0) { tips.push([q, dd]); return; }
      const n = depth > 2 ? 2 : rng.next() < 0.5 ? 3 : 2;
      for (let i = 0; i < n; i++) grow(q, norm3([dd[0] + (rng.next() - 0.5) * 1.3, dd[1] + (rng.next() - 0.3) * 0.7, dd[2] + (rng.next() - 0.5) * 1.3]), len * (0.7 + rng.next() * 0.1), depth - 1, r * 0.72);
    };
    grow([-1.6, -0.2, 0], norm3([1, 0.35, 0]), 1.3, 5, 0.1);
    sc.strands(twigs, { r: 0.012, dens: 1.4, c0: 0.28, c1: 0.24, taper: true });
    for (const [p, d] of tips) for (let k = 0; k < 5; k++) { if (rng.next() < 0.2) continue; const c = add(p, [rng.range(-0.15, 0.15), rng.range(-0.1, 0.15), rng.range(-0.15, 0.15)]); blossom(sc, rng, c, norm3([d[0] + rng.range(-0.8, 0.8), d[1] + rng.range(-0.3, 1), d[2] + rng.range(-0.8, 0.8)]), 0.16 + 0.06 * rng.next(), 0.5 + 0.5 * rng.next()); }
    sc.points(0.15, (r, o) => { const [p] = tips[Math.floor(r.next() * tips.length)], a = r.next() * TAU, b = Math.acos(2 * r.next() - 1), rr = 0.25 * Math.cbrt(r.next()); o[0] = p[0] + rr * Math.sin(b) * Math.cos(a); o[1] = p[1] + rr * Math.cos(b); o[2] = p[2] + rr * Math.sin(b) * Math.sin(a); o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0.6 + 0.3 * r.next(); });
  },
});

/* ───────────── Maple leaf ───────────── */
export const maple = defineShape({
  id: "plant-maple-leaf", name: "Maple Leaf", tag: PLANT,
  description: "A palmate maple leaf with five serrated lobes, a branching vein network and a curved petiole, shaded from crimson to gold.",
  palette: [[0, "#2a0603"], [0.22, "#a81808"], [0.5, "#ec5a16"], [0.76, "#ffa824"], [1, "#ffe48a"]],
  count: 90000, size: 0.0058, fit: 1.3, camera: { distance: 4.2, yaw: 0.3, pitch: 0.55, autoRotate: 0.09 },
  build(sc) {
    const lobes: Array<[number, number, number]> = [[Math.PI / 2, 0.8, 0.82], [Math.PI / 2 - 0.95, 0.66, 0.7], [Math.PI / 2 + 0.95, 0.66, 0.7], [Math.PI / 2 - 1.9, 0.42, 0.55], [Math.PI / 2 + 1.9, 0.42, 0.55]];
    const R = (u: number) => { let best = 0.28; for (const [c, a, w] of lobes) { let d = Math.abs(((u - c + Math.PI * 3) % TAU) - Math.PI); d = Math.PI - d; const e = Math.max(0, 1 - d / w), ser = 1 + 0.08 * Math.sin(d * 34 / 0.9) * e * (1 - 0.3 * e), v = 0.28 + a * Math.pow(e, 0.6) * ser; if (v > best) best = v; } return best; };
    const leaf: ParamSurface = { u0: 0, u1: TAU, v0: 0, v1: 1, eval(u, v, o) { const r = R(u) * v; o[0] = r * Math.cos(u); o[1] = r * Math.sin(u) + 0.0; o[2] = 0.07 * Math.sin(r * 5 + u * 2) * v + 0.1 * (r * r) * (0.5 - 0.5 * Math.cos(u * 0)) - 0.05 * Math.abs(Math.cos(u)) * v; } };
    const col = (u: number, v: number) => { const vein = lobes.some(([c]) => { let d = Math.abs(((u - c + Math.PI * 3) % TAU) - Math.PI); d = Math.PI - d; return d < 0.03 + 0.02 * (1 - v) && v > 0.05; }) || Math.abs(Math.sin(u * 24 + v * 3)) < 0.035 && v > 0.3; return vein ? 0.12 + 0.1 * v : 0.7 - 0.28 * v + 0.2 * (0.5 + 0.5 * Math.sin(u * 5)) * v; };
    sc.sheet(leaf, { dens: 3.2, thick: 0.006, c: col });
    const s = sc.solid(0.02);
    s.tube([[0, 0.0, 0.0], [0.04, -0.3, 0.06], [-0.02, -0.62, 0.0], [0.05, -0.95, -0.12]], [0.032, 0.026, 0.022, 0.016], { seg: 12, c: 0.2, k: 0.01 });
    void sstep;
  },
});

export const PLANT_SHAPES: GeneratorDef[] = [sunflower, tulip, lotus, rose, cherry, maple];
