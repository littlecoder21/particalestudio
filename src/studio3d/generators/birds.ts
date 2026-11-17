import type { GeneratorDef } from "../types";
import { defineShape, featherSurface, polyAt, norm3, mixn, type Scene, type V3 } from "./sculpt";


/** Adds one wing (z side = +1 / -1): arm bones, coverts, secondaries, primaries. */
export function wing(sc: Scene, side: number, o: { arm: V3[]; secN: number; priN: number; secLen: number; priLen: number; spread: [number, number]; covertDepth: number; cBase: number; cTip: number; up?: number; sweep?: number; tipBend?: number }) {
  const arm = o.arm.map((p): V3 => [p[0], p[1], p[2] * side]);
  const up = o.up ?? 0, sw = o.sweep ?? 0;
  // coverts: scalloped patch behind the arm
  sc.sheet({
    u0: 0, u1: 1, v0: 0, v1: 1,
    eval(u, v, out) { const p = polyAt(arm, u); out[0] = p[0] - v * o.covertDepth * (0.75 + 0.5 * Math.sin(u * 3)); out[1] = p[1] - 0.01 * v + 0.02 * Math.sin(v * 3); out[2] = p[2] + side * 0.03 * v; },
  }, { dens: 1.3, thick: 0.006, c: (u, v) => o.cBase + 0.1 * Math.sin(v * 18 + u * 9) + 0.03 * v });
  // secondaries along the trailing edge of the arm
  for (let i = 0; i < o.secN; i++) {
    const t = i / (o.secN - 1), root = polyAt(arm, 0.08 + 0.84 * t), r2: V3 = [root[0] - o.covertDepth * 0.75, root[1], root[2]];
    const d = norm3([-1, up * 0.12 - 0.02, side * (0.1 + 0.4 * t + sw)]);
    sc.sheet(featherSurface(r2, d, o.secLen * (0.9 + 0.12 * Math.sin(t * 3) + 0.1 * t), 0.062, { bend: 0.04 + 0.06 * t, up: [0, 1, 0] }), { dens: 1.05, thick: 0.004, c: (u, v) => mixn(o.cBase, o.cTip, u * 0.9) + 0.05 * Math.abs(v) });
  }
  // primaries fan out from the wrist
  const wrist = arm[arm.length - 1];
  for (let j = 0; j < o.priN; j++) {
    const t = j / (o.priN - 1), th = mixn(o.spread[0], o.spread[1], t), L = o.priLen * (1 - 0.34 * Math.pow(Math.abs(t - 0.25) / 0.75, 1.3));
    const d = norm3([-Math.cos(th), 0.03 + up * 0.35 * t, side * Math.sin(th)]), r2: V3 = [wrist[0] - 0.02 + 0.03 * t, wrist[1] - 0.005 * j, wrist[2] - side * 0.04 * (1 - t) + side * 0.05 * t];
    sc.sheet(featherSurface(r2, d, L, 0.052 - 0.006 * t, { bend: o.tipBend ?? 0.1, up: [0, 1, 0] }), { dens: 1.05, thick: 0.004, c: (u, v) => mixn(o.cBase + 0.02, o.cTip, u) + 0.05 * Math.abs(v) });
  }
}

/* ───────────── Eagle ───────────── */
export const eagle = defineShape({
  id: "form-eagle", name: "Eagle", tag: "Birds",
  description: "A soaring bald eagle: hooked beak and fierce brow, white head and tail, powerful chest and feathered legs with talons, broad wings with ten fingered primaries.",
  palette: [[0, "#24150c"], [0.18, "#4a2c17"], [0.42, "#8a5a2b"], [0.7, "#f0c14b"], [1, "#fffdf5"]],
  count: 100000, size: 0.0058, fit: 1.3, camera: { distance: 4.7, yaw: 0.6, pitch: 0.38, autoRotate: 0.06 },
  deformers: [{ type: "bend", amount: 0.04, speed: 0.5, axis: "x" }],
  build(sc) {
    const s = sc.solid(0.04);
    s.loft([[-0.42, 0, 0], [-0.1, 0.0, 0], [0.16, 0.03, 0]], [0.045, 0.115, 0.11], [0.04, 0.11, 0.1], { seg: 12, c: 0.14, up: [0, 1, 0] });
    s.ell([0.12, -0.02, 0], [0.2, 0.125, 0.115], { c: 0.16 });
    s.tube([[0.2, 0.05, 0], [0.32, 0.11, 0]], [0.075, 0.062], { seg: 4, c: 0.95 });
    s.ell([0.41, 0.125, 0], [0.105, 0.088, 0.08], { c: 1 });
    s.tube([[0.48, 0.13, 0], [0.56, 0.125, 0], [0.625, 0.1, 0]], [0.056, 0.04, 0.014], { seg: 6, c: 0.74 });
    s.ell([0.545, 0.085, 0], [0.07, 0.014, 0.03], { c: 0.72 });
    s.ell([0.47, 0.155, 0.066], [0.045, 0.014, 0.02], { sym: "z", rot: [0, 0, -0.3], c: 0.95 });
    s.sph([0.462, 0.14, 0.064], 0.02, { sym: "z", c: 0.72, k: 0.004, sz: 1.3 });
    s.sph([0.469, 0.14, 0.068], 0.009, { sym: "z", c: 0.0, k: 0.002 });
    s.ell([0.0, -0.1, 0.075], [0.11, 0.1, 0.06], { sym: "z", c: 0.2 });
    for (const sd of [1, -1]) {
      s.tube([[0.0, -0.16, 0.075 * sd], [-0.06, -0.3, 0.075 * sd], [-0.1, -0.37, 0.075 * sd]], [0.032, 0.022, 0.02], { seg: 4, c: 0.74 });
      for (const [dx, dz] of [[0.09, -0.025], [0.1, 0.0], [0.09, 0.025], [-0.07, 0]]) {
        s.tube([[-0.1, -0.37, 0.075 * sd], [-0.1 + dx * 0.6, -0.395, 0.075 * sd + dz * sd * 0.6], [-0.1 + dx, -0.43, 0.075 * sd + dz * sd]], [0.014, 0.011, 0.006], { seg: 3, c: 0.74, k: 0.006 });
      }
    }
    const arm: V3[] = [[0.1, 0.06, 0.1], [0.02, 0.1, 0.38], [-0.04, 0.12, 0.66], [0.0, 0.14, 0.95]];
    for (const sd of [1, -1]) {
      s.tube(arm.map((p): V3 => [p[0], p[1], p[2] * sd]), [0.06, 0.05, 0.04, 0.03], { seg: 10, c: 0.22 });
      wing(sc, sd, { arm, secN: 11, priN: 10, secLen: 0.5, priLen: 0.8, spread: [0.5, 1.72], covertDepth: 0.2, cBase: 0.2, cTip: 0.07, up: 0.5, sweep: 0.1, tipBend: 0.14 });
    }
    for (let i = 0; i < 12; i++) { // fan tail
      const a = (i / 11 - 0.5) * 0.95;
      sc.sheet(featherSurface([-0.4, 0.0, 0], norm3([-Math.cos(a), -0.05, Math.sin(a)]), 0.62, 0.062, { bend: 0.02 }), { dens: 1.05, thick: 0.004, c: (u, v) => 0.94 + 0.05 * Math.abs(v) - 0.03 * u });
    }
  },
});

/* ───────────── Phoenix ───────────── */
export const phoenix = defineShape({
  id: "form-phoenix", name: "Phoenix", tag: "Mythical creatures",
  description: "A mythic firebird rising with raised, flame-coloured wings, a crested head and long curling tail plumes.",
  palette: [[0, "#2a0500"], [0.2, "#b3140a"], [0.45, "#ff5a0a"], [0.72, "#ffb41f"], [1, "#fff6b0"]],
  count: 100000, size: 0.0058, fit: 1.3, camera: { distance: 4.8, yaw: 0.25, pitch: 0.1, autoRotate: 0.08 },
  look: { glow: 0.9, emission: 1.25 },
  deformers: [{ type: "wave", amount: 0.05, scale: 1.2, speed: 1, axis: "y" }],
  build(sc) {
    const s = sc.solid(0.05);
    s.loft([[0, -0.5, 0], [0.04, -0.15, 0], [0.1, 0.18, 0]], [0.06, 0.13, 0.11], [0.06, 0.13, 0.11], { seg: 12, c: 0.45, up: [0, 0, 1] });
    s.ell([0.12, 0.05, 0], [0.12, 0.17, 0.12], { c: 0.55 });
    s.tube([[0.12, 0.2, 0], [0.19, 0.42, 0], [0.24, 0.52, 0]], [0.08, 0.065, 0.06], { seg: 6, c: 0.6 });
    s.ell([0.3, 0.6, 0], [0.11, 0.095, 0.085], { c: 0.78, rot: [0, 0, -0.2] });
    s.tube([[0.37, 0.62, 0], [0.46, 0.6, 0], [0.52, 0.55, 0]], [0.05, 0.036, 0.012], { seg: 5, c: 1 });
    s.sph([0.35, 0.65, 0.07], 0.018, { sym: "z", c: 1, k: 0.004, sz: 1.4 });
    for (let i = 0; i < 5; i++) { // head crest plumes
      const a = i - 2;
      sc.sheet(featherSurface([0.27, 0.68, a * 0.02], norm3([-0.55, 1, a * 0.3]), 0.32 + 0.05 * (2 - Math.abs(a)), 0.026, { bend: -0.35, up: [1, 0, 0], wave: 0.05 }), { dens: 1, thick: 0.003, c: (u) => 0.55 + 0.45 * u });
    }
    const arm: V3[] = [[0.08, 0.1, 0.12], [0.0, 0.46, 0.4], [-0.1, 0.8, 0.62], [-0.06, 1.05, 0.8]];
    for (const sd of [1, -1]) {
      s.tube(arm.map((p): V3 => [p[0], p[1], p[2] * sd]), [0.045, 0.04, 0.03, 0.024], { seg: 10, c: 0.4 });
      wing(sc, sd, { arm, secN: 11, priN: 11, secLen: 0.55, priLen: 0.95, spread: [0.5, 1.5], covertDepth: 0.2, cBase: 0.4, cTip: 0.92, up: 1.2, sweep: 0.0, tipBend: 0.12 });
    }
    // long curling tail plumes
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 2, len = 1.35 + 0.55 * (1 - Math.abs(a)), z = a * 0.07;
      sc.sheet(featherSurface([0.0, -0.5, z], norm3([-0.15 - 0.35 * Math.abs(a), -1, a * 0.45]), len, 0.06 + 0.02 * (1 - Math.abs(a)), { bend: 0.0, up: [0, 0, 1], wave: 0.11 + 0.04 * a }), { dens: 1.1, thick: 0.004, c: (u, v) => 0.3 + 0.7 * u * u + 0.08 * Math.abs(v) });
    }
    sc.strands([[[0.0, -0.45, 0], [0.04, -0.7, 0.02], [0, -1.1, 0.0]]], { r: 0.01, dens: 1, c0: 0.5, c1: 1 });
  },
});

export const BIRD_SHAPES: GeneratorDef[] = [eagle, phoenix];
