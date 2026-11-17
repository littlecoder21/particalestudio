import type { GeneratorDef } from "../types";
import { clamp, vnoise } from "../math";
import type { ParamSurface } from "../sampling";
import { defineShape, sstep, mixn, type V3 } from "./sculpt";
import { ANI, hairLines } from "./quadrupeds";
import { cell3 } from "./animals";

const BUG = "Insects & small creatures";
const TAU = Math.PI * 2;

/* ───────────── Monarch butterfly ───────────── */
export const butterfly = defineShape({
  id: "nature-butterfly", name: "Monarch Butterfly", tag: BUG,
  description: "A monarch butterfly with scalloped fore- and hindwings, black veins and borders dotted in white, a segmented body and clubbed antennae.",
  palette: [[0, "#080504"], [0.28, "#d8560c"], [0.55, "#ff8f12"], [0.8, "#ffc95a"], [1, "#ffffff"]],
  count: 100000, size: 0.0056, fit: 1.35, camera: { distance: 4.4, yaw: 0.0, pitch: 0.95, autoRotate: 0.08 },
  deformers: [{ type: "wave", amount: 0.08, scale: 0.7, speed: 1.4, axis: "z" }],
  build(sc) {
    const H: V3 = [0.06, 0.02, 0.07];
    const dir = (a: number): V3 => [-Math.sin(a), 0, Math.cos(a)];
    const fore = (a: number) => 0.6 + 0.62 * Math.exp(-(((a - 0.1) / 0.62) ** 2)) + 0.04 * Math.sin(a * 11);
    const hind = (a: number) => 0.6 + 0.36 * Math.sin((a - 0.88) * 3.6) + 0.03 * Math.cos(a * 17);
    const wingSurf = (a0: number, a1: number, R: (a: number) => number, lift: number): ParamSurface => ({
      u0: 0, u1: 1, v0: 0, v1: 1,
      eval(u, v, o) { const a = a0 + u * (a1 - a0), r = v * R(a), d = dir(a); o[0] = H[0] + r * d[0]; o[1] = H[1] + lift * r + 0.05 * Math.sin(r * 6) * v; o[2] = H[2] + r * d[2]; },
    });
    const col = (n: number) => (u: number, v: number) => {
      const vein = 1 - sstep(0.0, 0.1, Math.abs(Math.sin(u * Math.PI * n))), border = sstep(0.84, 0.9, v), dots = v > 0.91 && v < 0.97 && Math.abs(Math.sin(u * Math.PI * n * 1.5)) < 0.2 ? 1 : 0;
      if (dots) return 1;
      if (border > 0.5) return 0.0;
      return vein * (v > 0.12 ? 1 : 0) > 0.5 ? 0.0 : 0.36 + 0.26 * v + 0.08 * Math.sin(u * 18);
    };
    sc.sheet(wingSurf(-0.4, 1.45, fore, 0.18), { dens: 2.4, thick: 0.004, sym: "z", c: col(7) });
    sc.sheet(wingSurf(0.9, 1.78, hind, 0.12), { dens: 2.4, thick: 0.004, sym: "z", c: col(6) });
    const s = sc.solid(0.03);
    s.ell([0.0, 0.0, 0], [0.12, 0.06, 0.06], { c: 0.04, k: 0.02 });
    s.tube([[-0.08, 0, 0], [-0.35, -0.01, 0], [-0.68, -0.03, 0]], [0.05, 0.045, 0.012], { seg: 10, c: 0.05, k: 0.01 });
    s.sph([0.16, 0.02, 0], 0.05, { c: 0.04, k: 0.01 });
    s.sph([0.19, 0.04, 0.035], 0.02, { sym: "z", c: 0.02, k: 0.004 });
    s.shade = (x, _y, z, _nx, _ny, _nz, t) => (Math.abs(z) > 0.025 && Math.sin(x * 60) > 0.6 && x < 0.1 ? 0.97 : t);
    const ant = (sg: number): V3[] => [[0.2, 0.05, 0.02 * sg], [0.4, 0.2, 0.08 * sg], [0.62, 0.3, 0.2 * sg]];
    sc.strands([ant(1), ant(-1)], { r: 0.004, dens: 5, c0: 0.05, c1: 0.05, taper: false });
    sc.points(0.04, (rng, o) => { const sg = rng.next() < 0.5 ? 1 : -1, a = rng.next() * TAU; o[0] = 0.62 + 0.012 * Math.cos(a); o[1] = 0.3 + 0.012 * Math.sin(a); o[2] = 0.2 * sg; o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0.05; });
  },
});

/* ───────────── Orb-weaver spider on its web ───────────── */
export const spider = defineShape({
  id: "animal-spider", name: "Spider & Orb Web", tag: BUG,
  description: "A garden orb-weaver spider with eight jointed legs, patterned abdomen and eyes, resting at the hub of a dew-spangled spiral web.",
  palette: [[0, "#0a0704"], [0.28, "#3d2a12"], [0.55, "#b9892a"], [0.8, "#f3d680"], [1, "#fbfdff"]],
  count: 120000, size: 0.0054, fit: 1.5, camera: { distance: 5.4, yaw: 0.5, pitch: 0.75, autoRotate: 0.08 }, look: { glow: 0.7 },
  build(sc, { detail }) {
    const rng = sc.rng, s = sc.solid(0.04);
    s.ell([-0.3, 0.2, 0], [0.34, 0.26, 0.27], { rot: [0, 0, 0.08], c: 0.5, k: 0.05 });
    s.ell([0.18, 0.17, 0], [0.2, 0.14, 0.16], { c: 0.3, k: 0.04 });
    for (let i = 0; i < 4; i++) s.sph([0.34 + 0.01 * (i % 2), 0.24 + 0.02 * Math.floor(i / 2), 0.04 + 0.04 * (i % 2)], 0.022, { sym: "z", c: 1, k: 0.004 });
    s.cone([0.36, 0.12, 0.04], [0.45, 0.02, 0.05], 0.035, 0.008, { sym: "z", c: 0.2, k: 0.01 });
    s.tube([[0.34, 0.1, 0.1], [0.45, 0.1, 0.17], [0.52, 0.06, 0.2]], [0.02, 0.016, 0.008], { seg: 5, sym: "z", c: 0.3, k: 0.005 });
    for (let i = 0; i < 4; i++) {
      const a = [0.65, 1.2, 1.85, 2.5][i], P0: V3 = [0.24 - 0.09 * i, 0.15, 0.1], cs = Math.cos(a), sn = Math.sin(a), len = [1.0, 0.85, 0.85, 1.05][i];
      const K: V3 = [P0[0] + cs * 0.5 * len, 0.62, P0[2] + sn * 0.5 * len], A: V3 = [K[0] + cs * 0.42 * len, 0.3, K[2] + sn * 0.42 * len], T: V3 = [A[0] + cs * 0.4 * len, 0.0, A[2] + sn * 0.4 * len];
      s.tube([P0, [(P0[0] + K[0]) / 2, 0.45, (P0[2] + K[2]) / 2], K, A, T], [0.045, 0.04, 0.034, 0.024, 0.01], { seg: 14, sym: "z", c: 0.35, k: 0.015 });
    }
    s.shade = (x, y, z, _nx, ny, _nz, t) => (x < -0.05 ? mixn(0.8, 0.28, sstep(0.0, 0.3, Math.abs(Math.sin(x * 14 + 0.6) * 0.9 + 0.3 * Math.cos(z * 18)))) * (0.8 + 0.2 * (ny > 0 ? 1 : 0.5)) : t) + 0.08 * (vnoise(x * 18, y * 18, z * 18) - 0.5) * detail;
    // orb web in the xz-plane
    const SP = 26, R = 2.3, spokes: V3[][] = [];
    for (let k = 0; k < SP; k++) { const a = (k / SP) * TAU + 0.05 * Math.sin(k * 3.1), l: V3[] = []; for (let i = 0; i <= 8; i++) { const r = (i / 8) * R; l.push([r * Math.cos(a), -0.02 * Math.sin((i / 8) * Math.PI) * 0.0, r * Math.sin(a)]); } spokes.push(l); }
    sc.strands(spokes, { r: 0.0035, dens: 0.35, c0: 0.8, c1: 0.9, al: 0.8 });
    const spiral: V3[] = [], T = 15 * TAU;
    for (let i = 0; i <= 900; i++) { const th = (i / 900) * T, r = 0.36 + (R * 0.95 - 0.36) * (th / T), sag = 1 - 0.022 * Math.sin((th * SP) / 2) ** 2; spiral.push([r * sag * Math.cos(th), 0.0, r * sag * Math.sin(th)]); }
    sc.strands([spiral], { r: 0.0028, dens: 0.16, c0: 0.78, c1: 0.9, al: 0.65 });
    sc.points(0.5, (r, o) => { const th = r.next() * T, rr = 0.36 + (R * 0.95 - 0.36) * (th / T); o[0] = rr * Math.cos(th); o[1] = 0.012; o[2] = rr * Math.sin(th); o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 1; });
    void rng; void hairLines; void clamp;
  },
});

/* ───────────── Scorpion ───────────── */
export const scorpion = defineShape({
  id: "animal-scorpion", name: "Scorpion", tag: BUG,
  description: "A desert scorpion with segmented armoured body, two grasping pincers, eight walking legs and a curled tail ending in a venomous stinger.",
  palette: [[0, "#120a05"], [0.25, "#4a2a10"], [0.5, "#a8641c"], [0.75, "#e8b050"], [1, "#fff0c0"]],
  count: 110000, size: 0.0054, fit: 1.4, camera: { distance: 4.8, yaw: 0.5, pitch: 0.55, autoRotate: 0.08 },
  build(sc, { detail }) {
    const s = sc.solid(0.03);
    s.ell([0.3, 0.14, 0], [0.32, 0.11, 0.26], { c: 0.5, k: 0.04 });
    for (let i = 0; i < 7; i++) s.ell([0.0 - i * 0.12, 0.13 - i * 0.006, 0], [0.12, 0.1 - i * 0.004, 0.24 - i * 0.012], { c: 0.46 + 0.02 * (i % 2), k: 0.015 });
    for (const z of [0.09, -0.09]) s.sph([0.46, 0.25, z], 0.03, { c: 0.1, k: 0.006, sz: 1.2 });
    // tail
    const tail: V3[] = [[-0.8, 0.12, 0], [-1.1, 0.22, 0], [-1.22, 0.55, 0], [-1.02, 0.86, 0], [-0.68, 0.98, 0], [-0.38, 0.92, 0]], tr = [0.1, 0.085, 0.075, 0.065, 0.055, 0.045];
    s.tube(tail, tr, { seg: 40, c: 0.55, k: 0.02 });
    s.ell([-0.3, 0.88, 0], [0.07, 0.065, 0.065], { c: 0.6, k: 0.02 });
    s.cone([-0.27, 0.9, 0], [-0.1, 0.72, 0], 0.045, 0.004, { c: 0.04, k: 0.008 });
    // pincers
    for (const sg of [1, -1]) {
      s.tube([[0.55, 0.14, 0.13 * sg], [0.85, 0.14, 0.3 * sg], [1.08, 0.14, 0.34 * sg]], [0.06, 0.055, 0.05], { seg: 8, c: 0.5, k: 0.02 });
      s.ell([1.28, 0.14, 0.4 * sg], [0.24, 0.09, 0.12], { c: 0.55, k: 0.02 });
      s.cone([1.36, 0.12, 0.34 * sg], [1.66, 0.14, 0.2 * sg], 0.075, 0.008, { c: 0.7, k: 0.012 });
      s.cone([1.36, 0.14, 0.47 * sg], [1.62, 0.15, 0.36 * sg], 0.06, 0.008, { c: 0.7, k: 0.012 });
    }
    for (let i = 0; i < 4; i++) for (const sg of [1, -1]) {
      const x = 0.34 - i * 0.2, out = 0.4 + 0.05 * i, back = -0.08 * i;
      s.tube([[x, 0.1, 0.18 * sg], [x + 0.08 + back, 0.3, (0.18 + out * 0.6) * sg], [x + 0.05 + 2 * back, 0.12, (0.18 + out * 1.2) * sg], [x + 0.0 + 3 * back, 0.0, (0.18 + out * 1.7) * sg]], [0.04, 0.034, 0.026, 0.01], { seg: 12, c: 0.5, k: 0.01 });
    }
    s.disp = (x, y, z) => 0.012 * (vnoise(x * 24, y * 24, z * 24) - 0.5) * (0.5 + detail);
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.1 * (vnoise(x * 9, y * 9, z * 9) - 0.5) + 0.08 * (Math.sin(x * 28) > 0.4 ? -1 : 0) * (x < 0.1 ? 1 : 0) - 0.03 * Math.max(0, ny);
  },
});

/* ───────────── Dragonfly ───────────── */
export const dragonfly = defineShape({
  id: "animal-dragonfly", name: "Dragonfly", tag: BUG,
  description: "A dragonfly with huge compound eyes, a long segmented abdomen, six folded legs and four veined translucent wings spread wide.",
  palette: [[0, "#041018"], [0.3, "#0a6a8a"], [0.55, "#25c7d9"], [0.8, "#a8f2ea"], [1, "#ffffff"]],
  count: 100000, size: 0.0056, fit: 1.4, camera: { distance: 4.6, yaw: 0.2, pitch: 0.8, autoRotate: 0.08 }, look: { glow: 0.7 },
  build(sc, { detail }) {
    const s = sc.solid(0.03);
    s.ell([0.1, 0.05, 0], [0.18, 0.1, 0.1], { c: 0.4, k: 0.03 });
    s.tube([[-0.05, 0.03, 0], [-0.6, 0.0, 0], [-1.3, -0.04, 0], [-1.9, -0.06, 0]], [0.065, 0.045, 0.035, 0.03], { seg: 20, c: 0.5, k: 0.02 });
    s.sph([0.3, 0.07, 0], 0.075, { c: 0.4, k: 0.02 });
    for (const sg of [1, -1]) s.sph([0.34, 0.11, 0.075 * sg], 0.07, { c: 0.85, k: 0.01, sz: 1.2 });
    s.ell([-1.97, -0.06, 0], [0.06, 0.02, 0.025], { c: 0.3, k: 0.01 });
    s.shade = (x, y, z, _nx, _ny, _nz, t) => (x < -0.1 ? t + 0.18 * (Math.sin(x * 38) > 0.3 ? -1 : 0.4) : t) + 0.06 * (vnoise(x * 20, y * 20, z * 20) - 0.5) * detail;
    for (let i = 0; i < 3; i++) for (const sg of [1, -1]) s.tube([[0.12 - i * 0.05, -0.02, 0.05 * sg], [0.2 - i * 0.05, -0.14, 0.13 * sg], [0.34 - i * 0.04, -0.24, 0.16 * sg]], [0.012, 0.01, 0.006], { seg: 5, c: 0.3, k: 0.004 });
    const wing = (x0: number, sweep: number, len: number, chord: number): ParamSurface => ({
      u0: 0, u1: 1, v0: -1, v1: 1,
      eval(u, v, o) { const wid = chord * Math.pow(Math.sin(Math.PI * (0.06 + 0.86 * u)), 0.55) * (1 + 0.4 * Math.sin(Math.PI * u) ** 2 * 0), lead = x0 - sweep * u; o[0] = lead - (0.5 + 0.5 * v) * wid; o[1] = 0.08 + 0.05 * u * u - 0.02 * v * v; o[2] = 0.07 + len * u; },
    });
    for (const [x0, sw, len, ch] of [[0.18, 0.12, 1.55, 0.3], [0.0, 0.0, 1.45, 0.38]] as const) {
      sc.sheet(wing(x0, sw, len, ch), { dens: 1.6, thick: 0.003, sym: "z", c: (u, v, x, _y, z) => { const e = cell3(z * 7.5, x * 11, 0.7 * v), vein = 1 - sstep(0.04, 0.12, e), edge = u < 0.04 || Math.abs(v) > 0.93 ? 1 : 0; return vein > 0.5 || edge ? 0.95 : 0.55 + 0.2 * u; }, alpha: (u, v) => 0.4 + 0.6 * ((1 - sstep(0.04, 0.12, cell3(u * 11, v * 4 + 3, 0.7))) > 0.5 ? 1 : 0) });
    }
  },
});

/* ───────────── Honey bee ───────────── */
export const bee = defineShape({
  id: "animal-bee", name: "Honey Bee", tag: BUG,
  description: "A honey bee with a fuzzy thorax, banded abdomen, large compound eyes, six legs with pollen baskets and four translucent wings.",
  palette: [[0, "#0b0804"], [0.28, "#3a2a08"], [0.55, "#f2b705"], [0.8, "#ffe27a"], [1, "#fff8d6"]],
  count: 100000, size: 0.0056, fit: 1.3, camera: { distance: 4.0, yaw: 0.5, pitch: 0.35, autoRotate: 0.09 }, look: { glow: 0.5 },
  build(sc, { detail }) {
    const rng = sc.rng, s = sc.solid(0.03);
    s.ell([0.0, 0.0, 0], [0.26, 0.22, 0.22], { c: 0.62, k: 0.03 });
    s.ell([-0.5, -0.04, 0], [0.4, 0.2, 0.19], { rot: [0, 0, 0.1], c: 0.4, k: 0.03 });
    s.cone([-0.88, -0.07, 0], [-1.02, -0.1, 0], 0.07, 0.006, { c: 0.1, k: 0.01 });
    s.ell([0.36, 0.0, 0], [0.13, 0.15, 0.14], { c: 0.12, k: 0.02 });
    for (const sg of [1, -1]) { s.ell([0.42, 0.05, 0.1 * sg], [0.06, 0.09, 0.05], { c: 0.04, k: 0.01 }); s.cone([0.46, 0.14, 0.04 * sg], [0.72, 0.34, 0.14 * sg], 0.01, 0.006, { c: 0.1, k: 0.004 }); }
    s.cone([0.46, -0.05, 0], [0.58, -0.14, 0], 0.03, 0.008, { c: 0.2, k: 0.008 });
    for (let i = 0; i < 3; i++) for (const sg of [1, -1]) s.tube([[0.15 - 0.17 * i, -0.15, 0.1 * sg], [0.22 - 0.17 * i, -0.3, 0.24 * sg], [0.1 - 0.17 * i - 0.04 * i, -0.45, 0.3 * sg]], [0.028, 0.02, 0.008], { seg: 6, c: 0.15, k: 0.006 });
    for (const sg of [1, -1]) s.ell([-0.2, -0.3, 0.3 * sg], [0.06, 0.07, 0.04], { c: 0.62, k: 0.01 });
    s.shade = (x, y, z, _nx, ny, _nz, t) => { if (x < -0.18) { const b = Math.sin((x + 0.18) * 17 + 1.2); return (b > 0 ? 0.62 : 0.06) + 0.04 * (vnoise(x * 18, y * 18, z * 18) - 0.5); } return t + 0.05 * (vnoise(x * 14, y * 14, z * 14) - 0.5) * detail - 0.02 * Math.max(0, ny); };
    // thorax fuzz
    sc.strands(hairLines(rng, 520, 3, (_i, r) => { const th = Math.acos(2 * r.next() - 1), ph = r.next() * TAU, nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph); const b: V3 = [0.26 * nx, 0.22 * ny, 0.22 * nz]; return (k) => [b[0] + nx * 0.04 * k - 0.02 * k, b[1] + ny * 0.04 * k, b[2] + nz * 0.04 * k]; }), { r: 0.0055, dens: 0.8, c0: 0.78, c1: 0.9 });
    const wing = (sx: number, len: number, wid: number): ParamSurface => ({ u0: 0, u1: 1, v0: -1, v1: 1, eval(u, v, o) { const w = wid * Math.sin(Math.PI * Math.pow(u, 0.7)) ** 0.8; o[0] = -0.02 - sx * 0.1 * u - (0.5 + 0.5 * v) * w + 0.1; o[1] = 0.2 + 0.55 * u * 0.9; o[2] = 0.08 + len * u * 0.55 + 0.1 * u; } });
    sc.sheet(wing(1, 0.8, 0.28), { dens: 1.8, thick: 0.003, sym: "z", c: (u, v) => (Math.abs(v) > 0.92 || u < 0.04 || Math.abs(Math.sin(v * 7 + u * 3)) < 0.06 ? 0.95 : 0.78), alpha: (u, v) => (Math.abs(v) > 0.92 || Math.abs(Math.sin(v * 7 + u * 3)) < 0.06 ? 1 : 0.45) });
    sc.sheet(wing(0, 0.55, 0.2), { dens: 1.8, thick: 0.003, sym: "z", c: 0.85, alpha: () => 0.5 });
  },
});

/* ───────────── Garden snail ───────────── */
export const snail = defineShape({
  id: "animal-snail", name: "Snail", tag: BUG,
  description: "A garden snail with a logarithmic spiral banded shell, a soft rippled body, extended eye stalks and a glistening slime trail.",
  palette: [[0, "#1a0e08"], [0.25, "#5a3418"], [0.5, "#b06a2a"], [0.75, "#e8c280"], [1, "#fff0d0"]],
  count: 100000, size: 0.0056, fit: 1.35, camera: { distance: 4.6, yaw: 0.6, pitch: 0.15, autoRotate: 0.08 },
  build(sc, { detail }) {
    const s = sc.solid(0.05), sh = sc.solid(0.01);
    // spiral shell
    const b = 0.125, pts: V3[] = [], rad: number[] = [], C: V3 = [-0.28, 0.72, 0];
    for (let i = 0; i <= 160; i++) { const th = (i / 160) * TAU * 3.1, R = 0.62 * Math.exp(-b * th), a = th + 0.6; pts.push([C[0] + R * Math.cos(a), C[1] + R * Math.sin(a), 0.22 * R * (1 - th / 20)]); rad.push(0.46 * R + 0.012); }
    sh.tube(pts, rad, { seg: 160, c: 0.45, k: 0.01 });
    sh.shade = (x, y, z, _nx, _ny, _nz, t) => { void t; const a = Math.atan2(y - C[1], x - C[0]), r = Math.hypot(x - C[0], y - C[1]); const band = Math.sin((a + 6 * Math.log(r + 0.02)) * 1) > 0.2 ? 0 : 0.2; return 0.32 + 0.28 * (0.5 + 0.5 * Math.sin(Math.log(r + 0.02) * 22)) + band + 0.06 * (vnoise(x * 10, y * 10, z * 10) - 0.5) * detail; };
    // body
    s.ell([-0.05, 0.15, 0], [1.0, 0.15, 0.24], { c: 0.8, k: 0.06 });
    s.tube([[0.55, 0.16, 0], [0.9, 0.35, 0], [1.02, 0.62, 0]], [0.16, 0.13, 0.11], { seg: 10, c: 0.8, k: 0.05 });
    s.ell([1.07, 0.66, 0], [0.12, 0.1, 0.12], { c: 0.8, k: 0.04 });
    for (const sg of [1, -1]) {
      s.tube([[1.05, 0.72, 0.05 * sg], [1.12, 0.95, 0.1 * sg], [1.2, 1.18, 0.14 * sg]], [0.028, 0.022, 0.016], { seg: 8, c: 0.78, k: 0.01 });
      s.sph([1.2, 1.2, 0.14 * sg], 0.032, { c: 0.1, k: 0.01 });
      s.tube([[1.15, 0.62, 0.06 * sg], [1.3, 0.55, 0.1 * sg]], [0.022, 0.012], { seg: 4, c: 0.78, k: 0.008 });
    }
    s.disp = (x, y, z) => 0.01 * (vnoise(x * 16, y * 9, z * 16) - 0.5) * (0.5 + detail);
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.1 * (vnoise(x * 8, y * 8, z * 8) - 0.5) - 0.05 * Math.max(0, ny);
    const trail: V3[] = []; for (let i = 0; i <= 40; i++) trail.push([-0.9 - i * 0.04, 0.0, 0.03 * Math.sin(i * 0.4)]);
    sc.strands([trail], { r: 0.1, dens: 0.0, c0: 0.9, c1: 0.9, al: 0.3 });
    sc.sheet({ u0: 0, u1: 1, v0: -1, v1: 1, eval(u, v, o) { o[0] = -0.5 - 1.5 * u; o[1] = 0.004; o[2] = v * 0.2 * (1 - 0.3 * u) + 0.03 * Math.sin(u * 14); } }, { dens: 1.4, thick: 0.002, c: 0.92, al: 0.55 });
  },
});

export const INSECT_SHAPES: GeneratorDef[] = [butterfly, spider, scorpion, dragonfly, bee, snail];
void ANI;
