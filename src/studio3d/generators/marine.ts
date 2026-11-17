import type { GeneratorDef } from "../types";
import { clamp, vnoise } from "../math";
import type { ParamSurface } from "../sampling";
import { defineShape, ringLine, norm3, mixn, sstep, type V3 } from "./sculpt";
import { frame, limb, hairLines } from "./quadrupeds";
import { cell3 } from "./animals";

const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Triangular fin: A leading root, B tip, C trailing root; `bow` bends the middle sideways. */
export const tri = (A: V3, B: V3, C: V3, bow = 0): ParamSurface => ({
  u0: 0, u1: 1, v0: 0, v1: 1,
  eval(u, v, o) { const p = lerp3(lerp3(A, B, u), lerp3(C, B, u), v); o[0] = p[0]; o[1] = p[1] + bow * Math.sin(Math.PI * v) * (1 - u); o[2] = p[2]; },
});

/* ───────────── Humpback whale ───────────── */
export const whale = defineShape({
  id: "animal-whale", name: "Humpback Whale", tag: "Ocean life",
  description: "A humpback whale with a knobbed rostrum, throat pleats, very long pectoral flippers, a small dorsal hump and broad notched tail flukes.",
  palette: [[0, "#040813"], [0.28, "#17304f"], [0.52, "#3a6892"], [0.78, "#a3c4dd"], [1, "#f2f9ff"]],
  count: 130000, size: 0.0054, fit: 1.5, camera: { distance: 6.2, yaw: 0.5, pitch: 0.12, autoRotate: 0.07 }, look: { glow: 0.5 },
  build(sc, { detail }) {
    const s = sc.solid(0.08);
    s.loft([[-1.5, 0.32, 0], [-0.95, 0.12, 0], [-0.1, 0.0, 0], [0.8, -0.04, 0], [1.4, -0.07, 0]], [0.04, 0.13, 0.36, 0.34, 0.22], [0.05, 0.15, 0.4, 0.36, 0.22], { seg: 26, c: 0.35, up: [0, 1, 0], cg: (_x, y) => 0.22 + 0.62 * sstep(-0.02, -0.26, y) });
    s.ell([1.36, -0.04, 0], [0.34, 0.2, 0.25], { c: 0.3, k: 0.1 });
    s.ell([1.22, -0.2, 0], [0.5, 0.1, 0.27], { c: 0.78, k: 0.06 });
    s.ell([-0.55, 0.37, 0], [0.12, 0.05, 0.05], { c: 0.3, k: 0.05 });
    s.ell([-0.5, 0.35, 0], [0.18, 0.09, 0.05], { rot: [0, 0, 0.35], c: 0.3, k: 0.05 });
    for (const [x, z] of [[1.55, 0.04], [1.62, -0.04], [1.5, 0.0], [1.45, 0.08], [1.45, -0.08]]) s.sph([x, 0.1, z], 0.022, { c: 0.4, k: 0.01 });
    s.sph([1.0, -0.12, 0.3], 0.03, { sym: "z", c: 0.0, k: 0.004, sz: 1.3 });
    s.ell([0.78, -0.3, 0.38], [0.6, 0.035, 0.13], { sym: "z", dir: [-0.4, -0.6, 1], up: [0, 1, 0], c: 0.7, k: 0.03 });
    s.disp = (x, y, z) => (y < -0.04 && x > 0.5 && x < 1.5 ? 0.014 * Math.sin(z * 55) * sstep(0.5, 0.9, x) : 0) + 0.006 * (vnoise(x * 6, y * 6, z * 6) - 0.5) * detail;
    const span = 0.95;
    sc.sheet({ u0: -1, u1: 1, v0: 0, v1: 1, eval(u, w, o) { const a = Math.abs(u), xl = -1.5 - 0.3 * Math.pow(a, 1.2), xt = -1.66 - 0.42 * Math.pow(a, 1.1) + 0.1 * Math.exp(-30 * u * u); o[0] = xl + (xt - xl) * w; o[1] = 0.36 + 0.05 * a - 0.02 * w; o[2] = span * u; } }, { dens: 1.3, thick: 0.01, c: (_u, w) => 0.22 + 0.4 * w });
    const mouth: V3[] = [[0.95, -0.17, 0.26], [1.25, -0.2, 0.25], [1.55, -0.14, 0.17], [1.66, -0.1, 0.08]];
    sc.strands([mouth], { r: 0.005, dens: 4, c0: 0.1, c1: 0.1, sym: "z" });
  },
});

/* ───────────── Great white shark ───────────── */
export const shark = defineShape({
  id: "animal-shark", name: "Great White Shark", tag: "Ocean life",
  description: "A great white shark: torpedo body, conical snout, gill slits, tall triangular dorsal fin, swept pectoral fins and a crescent tail with a long upper lobe.",
  palette: [[0, "#050a10"], [0.25, "#2c3a48"], [0.5, "#5f7488"], [0.78, "#c9d6e0"], [1, "#fbfdff"]],
  count: 110000, size: 0.0054, fit: 1.45, camera: { distance: 6.0, yaw: 0.5, pitch: 0.14, autoRotate: 0.07 },
  build(sc, { detail }) {
    const s = sc.solid(0.07);
    s.loft([[-1.35, 0.02, 0], [-0.85, 0.0, 0], [-0.1, 0.0, 0], [0.7, -0.03, 0], [1.2, -0.06, 0]], [0.03, 0.09, 0.3, 0.26, 0.16], [0.035, 0.1, 0.33, 0.28, 0.17], { seg: 24, c: 0.3, up: [0, 1, 0], cg: (_x, y) => 0.18 + 0.7 * sstep(0.0, -0.17, y) });
    s.cone([1.0, -0.06, 0], [1.6, -0.1, 0], 0.17, 0.02, { c: 0.3, k: 0.06, cg: (_x, y) => 0.18 + 0.7 * sstep(-0.02, -0.1, y) });
    s.sph([1.12, 0.0, 0.17], 0.026, { sym: "z", c: 0.0, k: 0.004, sz: 1.3 });
    s.ell([-1.2, 0.04, 0], [0.12, 0.05, 0.05], { c: 0.3, k: 0.03 });
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.05 * (vnoise(x * 12, y * 12, z * 12) - 0.5) * detail - 0.04 * Math.max(0, ny);
    const f = (a: V3, b: V3, c: V3, bow = 0, col = 0.35) => sc.sheet(tri(a, b, c, bow), { dens: 1.2, thick: 0.01, sym: "z", c: col });
    sc.sheet(tri([0.05, 0.3, 0], [-0.42, 0.78, 0], [-0.42, 0.3, 0], 0.04), { dens: 1.4, thick: 0.012, c: (_u, w) => 0.3 + 0.1 * w });    // dorsal
    f([0.55, -0.15, 0.2], [-0.05, -0.62, 1.0], [-0.15, -0.12, 0.28], 0.04);                                                              // pectorals
    f([-0.75, 0.0, 0.0], [-1.62, 0.78, 0], [-1.38, 0.05, 0], 0.05, 0.33);                                                                // caudal upper
    sc.sheet(tri([-1.2, 0.0, 0], [-1.52, -0.46, 0], [-1.38, 0.0, 0], 0.03), { dens: 1.4, thick: 0.01, c: 0.3 });
    sc.sheet(tri([-0.7, -0.1, 0.05], [-0.82, -0.28, 0.2], [-0.95, -0.08, 0.05]), { dens: 1.4, thick: 0.008, sym: "z", c: 0.3 });
    for (let i = 0; i < 5; i++) sc.strands([[[0.55 - i * 0.04, 0.17, 0.22 + 0.008 * i], [0.57 - i * 0.04, -0.07, 0.3 + 0.01 * i]]], { r: 0.0045, dens: 6, c0: 0.04, c1: 0.04, sym: "z" });
    sc.strands([[[1.15, -0.1, 0.12], [1.3, -0.1, 0.14], [1.45, -0.09, 0.08]]], { r: 0.005, dens: 5, c0: 0.04, c1: 0.04, sym: "z" });
  },
});

/* ───────────── Dolphin ───────────── */
export const dolphin = defineShape({
  id: "animal-dolphin", name: "Dolphin", tag: "Ocean life",
  description: "A bottlenose dolphin leaping in an arc: streamlined body, melon forehead and short beak, curved dorsal fin, pectoral flippers and horizontal tail flukes.",
  palette: [[0, "#06101c"], [0.3, "#38566f"], [0.55, "#6d8ba3"], [0.8, "#c6d6e2"], [1, "#f6fbff"]],
  count: 110000, size: 0.0054, fit: 1.4, camera: { distance: 5.6, yaw: 0.5, pitch: 0.1, autoRotate: 0.08 },
  build(sc, { detail }) {
    const s = sc.solid(0.06), sp: V3[] = [[-1.45, -0.55, 0], [-0.9, -0.2, 0], [-0.2, 0.1, 0], [0.5, 0.2, 0], [1.05, 0.14, 0]], rw = [0.055, 0.13, 0.24, 0.24, 0.16];
    s.loft(sp, rw, rw.map((r) => r * 1.05), { seg: 24, c: 0.35, up: [0, 1, 0], cg: (_x, y) => 0.3 + 0.5 * sstep(0.0, -0.3, y - 0.2 * _x * 0) });
    const H = frame([1.05, 0.14, 0], -0.1);
    s.ell(H(0.0, 0.03, 0), [0.2, 0.15, 0.15], { c: 0.35, k: 0.06 });
    s.cone(H(0.1, -0.04, 0), H(0.5, -0.07, 0), 0.07, 0.04, { c: 0.55, k: 0.04 });
    s.sph(H(0.07, 0.04, 0.12), 0.02, { sym: "z", c: 0.0, k: 0.004, sz: 1.3 });
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.04 * (vnoise(x * 10, y * 10, z * 10) - 0.5) * detail - 0.04 * Math.max(0, ny);
    sc.sheet(tri([-0.05, 0.32, 0], [-0.4, 0.62, 0], [-0.4, 0.28, 0], 0.0), { dens: 1.4, thick: 0.01, c: 0.35 });
    sc.sheet(tri([0.62, -0.02, 0.17], [0.2, -0.3, 0.5], [0.3, 0.0, 0.2], 0.03), { dens: 1.4, thick: 0.008, sym: "z", c: 0.4 });
    sc.sheet({ u0: -1, u1: 1, v0: 0, v1: 1, eval(u, w, o) { const a = Math.abs(u); o[0] = -1.5 - 0.12 * w - 0.3 * Math.pow(a, 1.2) * (0.3 + 0.7 * w) + 0.08 * Math.exp(-40 * u * u) * w; o[1] = -0.6 - 0.18 * w; o[2] = 0.55 * u; } }, { dens: 1.3, thick: 0.008, c: 0.38 });
    void ringLine; void clamp;
  },
});

/* ───────────── Manta ray ───────────── */
export const manta = defineShape({
  id: "animal-manta-ray", name: "Manta Ray", tag: "Ocean life",
  description: "A giant manta ray gliding: broad diamond wings with curved tips, forward cephalic fins, wide mouth, white underside markings and a whip tail.",
  palette: [[0, "#030a14"], [0.3, "#112b46"], [0.55, "#2b5f8a"], [0.8, "#8fc0e0"], [1, "#f6fcff"]],
  count: 100000, size: 0.0056, fit: 1.5, camera: { distance: 5.6, yaw: 0.3, pitch: 0.55, autoRotate: 0.08 },
  deformers: [{ type: "wave", amount: 0.06, scale: 0.9, speed: 0.7, axis: "z" }],
  build(sc, { detail }) {
    const s = sc.solid(0.05);
    s.ell([0.1, 0.0, 0], [0.55, 0.16, 0.34], { c: 0.3, k: 0.08 });
    s.sph([0.72, 0.0, 0.14], 0.028, { sym: "z", c: 0.02, k: 0.004, sz: 1.3 });
    s.ell([0.78, -0.09, 0], [0.1, 0.045, 0.28], { c: 0.12, k: 0.03 });
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.05 * (vnoise(x * 9, y * 9, z * 9) - 0.5) * detail - 0.04 * Math.max(0, ny);
    sc.sheet({
      u0: -1, u1: 1, v0: 0, v1: 1,
      eval(u, w, o) { const a = Math.abs(u), xl = 0.55 - 0.62 * Math.pow(a, 1.25), xt = -0.5 + 0.42 * Math.pow(a, 1.1), body = Math.exp(-5 * a * a); o[0] = xl + (xt - xl) * w; o[1] = 0.22 * Math.pow(a, 2) - 0.1 * Math.sin(Math.PI * w) * a + 0.1 * body * Math.sin(Math.PI * w) * 0.6; o[2] = 1.5 * u; },
    }, { dens: 1.3, thick: 0.012, c: (u, w) => 0.18 + 0.3 * Math.abs(u) * w + 0.15 * w * w });
    for (const side of [1, -1]) sc.sheet(tri([0.74, -0.06, 0.14 * side], [1.05, -0.04, 0.32 * side], [0.8, -0.02, 0.28 * side], 0.0), { dens: 1.5, thick: 0.01, c: 0.35 });
    sc.strands([[[-0.5, 0, 0], [-1.0, 0.02, 0.02], [-1.6, 0.0, -0.02], [-2.3, -0.03, 0.04]]], { r: 0.014, dens: 3, c0: 0.25, c1: 0.2, taper: true });
    // pale underside spots (visible through the sparse wing)
    sc.points(0.1, (rng, o) => { const a = rng.next() * 6.283, r = Math.sqrt(rng.next()) * 0.3; o[0] = -0.05 + r * Math.cos(a) * 0.7; o[1] = -0.1; o[2] = r * Math.sin(a) * 1.2; o[3] = 0; o[4] = -1; o[5] = 0; o[6] = 0.95; });
  },
});

/* ───────────── Koi ───────────── */
export const koi = defineShape({
  id: "animal-koi", name: "Koi Carp", tag: "Ocean life",
  description: "A curving koi carp with red and black patches on white scales, barbels, a fanned tail, long pectoral fins and rippling water rings.",
  palette: [[0, "#080808"], [0.22, "#c4200c"], [0.45, "#ff5a22"], [0.7, "#fff0e0"], [1, "#fffdf8"]],
  count: 100000, size: 0.0058, fit: 1.3, camera: { distance: 5.0, yaw: 0.0, pitch: 1.1, autoRotate: 0.08 },
  deformers: [{ type: "wave", amount: 0.05, scale: 1.2, speed: 0.9, axis: "y" }],
  build(sc, { detail }) {
    const s = sc.solid(0.06), sp: V3[] = [[1.0, 0.0, -0.1], [0.5, 0.0, 0.05], [0.0, 0.0, 0.2], [-0.5, 0.0, 0.1], [-0.95, 0.0, -0.1], [-1.2, 0.0, -0.3]], rw = [0.1, 0.2, 0.24, 0.17, 0.07, 0.03], rh = [0.1, 0.18, 0.2, 0.15, 0.06, 0.03];
    s.loft(sp, rw, rh, { seg: 24, c: 0.6, up: [0, 1, 0] });
    s.sph([0.88, 0.07, 0.04], 0.03, { c: 0.0, k: 0.004, sz: 1.3 }); s.sph([0.92, 0.07, -0.16], 0.03, { c: 0.0, k: 0.004, sz: 1.3 });
    s.cone([1.02, -0.01, -0.12], [1.12, -0.05, -0.2], 0.012, 0.004, { c: 0.5, k: 0.004 }); s.cone([1.02, -0.01, -0.02], [1.12, -0.05, 0.05], 0.012, 0.004, { c: 0.5, k: 0.004 });
    s.shade = (x, y, z, _nx, ny, _nz, t) => { void t; const n = vnoise(x * 2.6 + 4, y * 2.6, z * 2.6); const red = n > 0.52 ? 0.34 : 0.82, sumi = vnoise(x * 5 + 9, y * 5, z * 5) > 0.7 ? 0.0 : red; return sumi + 0.05 * (vnoise(x * 24, y * 24, z * 24) - 0.5) * (0.5 + detail) - 0.03 * Math.max(0, ny); };
    // fins: fan tail, dorsal, pectorals
    const tailBase: V3 = [-1.15, 0, -0.27];
    sc.sheet({ u0: -1, u1: 1, v0: 0, v1: 1, eval(u, w, o) { const sw = 0.25 * Math.sin(w * 2.0 + u * 1.4); o[0] = tailBase[0] - 0.7 * w * (1 - 0.18 * Math.abs(u)) * Math.cos(u * 0.8); o[1] = 0.62 * u * w; o[2] = tailBase[2] - 0.3 * w + sw * w; } }, { dens: 1.6, thick: 0.007, c: (u, w) => 0.5 + 0.3 * w + 0.04 * Math.sin(u * 26), al: 0.85 });
    sc.sheet({ u0: 0, u1: 1, v0: 0, v1: 1, eval(u, w, o) { const p = lerp3([0.45, 0.19, 0.04], [-0.55, 0.14, 0.12], u); o[0] = p[0]; o[1] = p[1] + 0.16 * w * Math.sin(Math.PI * u) ** 0.7; o[2] = p[2]; } }, { dens: 1.4, thick: 0.006, c: 0.5, al: 0.85 });
    for (const [sgn, x0] of [[1, 0.5], [-1, 0.5]] as const) sc.sheet({ u0: 0, u1: 1, v0: 0, v1: 1, eval(u, w, o) { const root: V3 = [x0, -0.07, 0.05 + sgn * 0.2]; const tip: V3 = [x0 - 0.45, -0.1, 0.05 + sgn * 0.62]; const p = lerp3(root, tip, w); o[0] = p[0] - 0.12 * u * (1 - w * 0.6); o[1] = p[1]; o[2] = p[2] + 0.04 * u; } }, { dens: 1.4, thick: 0.006, c: 0.7, al: 0.85 });
    for (const r of [0.5, 0.78, 1.06, 1.34]) sc.strands([ringLine(r * 1.3, -0.34, 140, (a) => 0.015 * Math.sin(a * 11))], { r: 0.006, dens: 1.6, c0: 0.8, c1: 0.8, al: 0.45 });
    void limb; void hairLines; void norm3; void mixn;
  },
});

/* ───────────── Sea turtle ───────────── */
export const seaTurtle = defineShape({
  id: "animal-sea-turtle", name: "Sea Turtle", tag: "Ocean life",
  description: "A green sea turtle swimming: domed scuted carapace, beaked head, long paddle front flippers raised mid-stroke and small hind flippers.",
  palette: [[0, "#0c1208"], [0.25, "#3b4a1c"], [0.5, "#7c8a34"], [0.75, "#cdbb6a"], [1, "#f5ecc0"]],
  count: 110000, size: 0.0056, fit: 1.35, camera: { distance: 5.2, yaw: 0.4, pitch: 0.55, autoRotate: 0.08 },
  deformers: [{ type: "bend", amount: 0.04, speed: 0.6, axis: "x" }],
  build(sc, { detail }) {
    const s = sc.solid(0.06);
    s.ell([0, 0.0, 0], [0.82, 0.3, 0.64], { c: 0.5, k: 0.05, cg: (_x, y) => (y < 0.0 ? 0.78 : 0.45) });
    s.ell([0, -0.12, 0], [0.7, 0.14, 0.54], { c: 0.8, k: 0.05 });
    s.tube([[0.72, 0.02, 0], [0.95, 0.06, 0]], [0.14, 0.12], { seg: 4, c: 0.55, k: 0.05 });
    s.ell([1.1, 0.07, 0], [0.17, 0.12, 0.12], { c: 0.55, k: 0.05 });
    s.cone([1.18, 0.05, 0], [1.34, 0.0, 0], 0.07, 0.035, { c: 0.7, k: 0.02 });
    s.sph([1.12, 0.12, 0.1], 0.02, { sym: "z", c: 0.0, k: 0.004, sz: 1.3 });
    s.ell([0.5, 0.06, 0.95], [0.6, 0.03, 0.13], { sym: "z", dir: [-0.35, 0.3, 1], up: [0, 1, 0], c: 0.55, k: 0.03 });
    s.ell([-0.62, -0.02, 0.62], [0.25, 0.025, 0.1], { sym: "z", dir: [-0.6, 0.0, 1], up: [0, 1, 0], c: 0.55, k: 0.03 });
    s.cone([-0.78, -0.02, 0], [-1.0, -0.06, 0], 0.05, 0.01, { c: 0.5, k: 0.02 });
    s.disp = (x, y, z) => y > 0.02 ? -0.02 * (1 - sstep(0.0, 0.07, cell3(x * 3.6, y * 3.6 + 2, z * 3.6))) * (0.4 + detail) : 0;
    s.shade = (x, y, z, _nx, ny, _nz, t) => { if (y > 0.02) { const e = cell3(x * 3.6, y * 3.6 + 2, z * 3.6); return 0.38 + 0.28 * sstep(0.0, 0.2, e) + 0.12 * vnoise(x * 5, y * 5, z * 5); } return t + 0.05 * (vnoise(x * 14, y * 14, z * 14) - 0.5) - 0.03 * Math.max(0, ny); };
  },
});

/* ───────────── Octopus ───────────── */
export const octopus = defineShape({
  id: "animal-octopus", name: "Octopus", tag: "Ocean life",
  description: "An octopus with a bulbous mantle, large eyes, and eight curling tapered arms lined with suckers.",
  palette: [[0, "#26062f"], [0.28, "#9b1b6c"], [0.55, "#ff4f4a"], [0.8, "#ffb088"], [1, "#fff0e0"]],
  count: 130000, size: 0.0054, fit: 1.4, camera: { distance: 5.0, yaw: 0.4, pitch: 0.15, autoRotate: 0.08 },
  deformers: [{ type: "wave", amount: 0.06, scale: 1.3, speed: 0.8, axis: "y" }],
  build(sc, { detail }) {
    const rng = sc.rng, s = sc.solid(0.07);
    s.ell([0, 0.9, 0], [0.5, 0.62, 0.46], { rot: [0, 0, 0.18], c: 0.45, k: 0.1 });
    s.ell([0.18, 0.4, 0], [0.45, 0.32, 0.42], { c: 0.5, k: 0.1 });
    for (const sg of [1, -1]) { s.sph([0.45, 0.45, 0.28 * sg], 0.1, { c: 0.78, k: 0.03 }); s.sph([0.53, 0.45, 0.3 * sg], 0.055, { c: 0.0, k: 0.01, sz: 1.2 }); }
    const suck: V3[][] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.283 + 0.2, ph = rng.next() * 6.283, curl = 0.7 + 0.6 * rng.next(), pts: V3[] = [], rad: number[] = [];
      for (let j = 0; j <= 10; j++) {
        const t = j / 10, r = 0.38 + 0.9 * Math.sin(t * 1.5) * 0.8 + 0.2 * t, w = a + curl * t * t * 1.6 * Math.sin(ph) + 0.3 * Math.sin(t * 5 + ph), y = 0.28 - 1.3 * Math.pow(t, 0.8) + 0.5 * Math.sin(t * 3 + ph) * t * t * 0.7 + 0.12 * Math.max(0, t - 0.7) * 3;
        pts.push([r * Math.cos(w) * 0.82, Math.max(-1.2, y), r * Math.sin(w) * 0.82]); rad.push(0.15 * Math.pow(1 - t, 0.9) + 0.012);
      }
      s.tube(pts, rad, { seg: 36, c: 0.48, k: 0.05 });
      suck.push(pts.map((p, j) => [p[0], p[1] - rad[j] * 0.8, p[2]] as V3));
    }
    sc.strands(suck, { r: 0.012, dens: 1.4, c0: 0.92, c1: 0.7, taper: true });
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.12 * (vnoise(x * 10, y * 10, z * 10) - 0.5) * (0.5 + detail) + 0.1 * Math.max(0, -ny) - 0.03 * Math.max(0, ny);
  },
});

/* ───────────── Crab ───────────── */
export const crab = defineShape({
  id: "animal-crab", name: "Crab", tag: "Ocean life",
  description: "A rock crab: broad domed carapace with eye stalks, two large toothed claws, four jointed walking legs per side and tucked abdomen.",
  palette: [[0, "#1a0805"], [0.28, "#8a1c0c"], [0.52, "#e0481c"], [0.78, "#ff9a58"], [1, "#fff0d8"]],
  count: 110000, size: 0.0056, fit: 1.35, camera: { distance: 4.8, yaw: 0.5, pitch: 0.55, autoRotate: 0.08 },
  build(sc, { detail }) {
    const s = sc.solid(0.05);
    s.ell([0, 0.12, 0], [0.58, 0.22, 0.72], { c: 0.5, k: 0.06 });
    s.ell([0.35, 0.1, 0], [0.18, 0.1, 0.5], { c: 0.5, k: 0.06 });
    s.ell([-0.2, 0.0, 0], [0.4, 0.1, 0.45], { c: 0.75, k: 0.05 });
    for (const z of [0.12, -0.12]) { s.cone([0.52, 0.28, z], [0.62, 0.42, z * 1.4], 0.024, 0.02, { c: 0.6, k: 0.01 }); s.sph([0.62, 0.45, z * 1.4], 0.04, { c: 0.1, k: 0.01, sz: 1.3 }); }
    // claws
    for (const sg of [1, -1]) {
      s.tube([[0.4, 0.1, 0.55 * sg], [0.7, 0.1, 0.8 * sg], [0.95, 0.15, 0.78 * sg]], [0.09, 0.07, 0.06], { seg: 8, c: 0.5, k: 0.03 });
      s.ell([1.1, 0.18, 0.78 * sg], [0.24, 0.12, 0.14], { c: 0.55, k: 0.03 });
      s.cone([1.18, 0.14, 0.7 * sg], [1.5, 0.08, 0.62 * sg], 0.09, 0.012, { c: 0.8, k: 0.02 });
      s.cone([1.2, 0.22, 0.85 * sg], [1.48, 0.28, 0.72 * sg], 0.07, 0.012, { c: 0.8, k: 0.02 });
    }
    // walking legs
    for (let i = 0; i < 4; i++) for (const sg of [1, -1]) {
      const x = 0.3 - i * 0.22, spread = 0.7 + 0.2 * Math.sin(i * 1.1);
      s.tube([[x, 0.12, 0.5 * sg], [x + 0.05 - 0.04 * i, 0.46, 0.85 * sg], [x - 0.1 - 0.08 * i, 0.3, (0.85 + 0.25 * spread) * sg], [x - 0.14 - 0.1 * i, -0.2, (1.02 + 0.2 * spread) * sg]], [0.065, 0.05, 0.04, 0.012], { seg: 16, c: 0.55, k: 0.02 });
    }
    s.disp = (x, y, z) => 0.012 * (vnoise(x * 12, y * 12, z * 12) - 0.5) * (0.4 + detail);
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.12 * (vnoise(x * 7, y * 7, z * 7) - 0.5) + 0.1 * Math.max(0, -ny) - 0.03 * Math.max(0, ny);
  },
});

export const MARINE_SHAPES: GeneratorDef[] = [whale, shark, dolphin, manta, koi, seaTurtle, octopus, crab];
