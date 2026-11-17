import type { GeneratorDef } from "../types";
import { defineShape, splinePoints, splineScalars, norm3, type Scene, type Solid, type V3 } from "./sculpt";
import { vnoise, type Rng } from "../math";
import { wing } from "./birds";

export const ANI = "Animals & creatures";
export const MYTH = "Mythical creatures";

/** Local frame: x forward, y up, z side, pitched by `a` about z, scaled by k, placed at c. */
export type Frame = (x: number, y: number, z: number) => V3;
export const frame = (c: V3, a = 0, k = 1): Frame => (x, y, z) => [c[0] + (x * Math.cos(a) - y * Math.sin(a)) * k, c[1] + (x * Math.sin(a) + y * Math.cos(a)) * k, z * k];
/** Limb: control points with z ≥ 0 are mirrored to both sides. */
export const limb = (s: Solid, pts: V3[], r: number[], c: number, k = 0.025, seg = 30) => s.tube(pts, r, { seg, sym: "z", c, k });

/** Fur / hair strands: `n` roots each producing a polyline of `m` points. */
export function hairLines(rng: Rng, n: number, m: number, make: (i: number, r: Rng) => (k: number) => V3): V3[][] {
  const out: V3[][] = [];
  for (let i = 0; i < n; i++) { const f = make(i, rng), line: V3[] = []; for (let k = 0; k < m; k++) line.push(f(k / (m - 1))); out.push(line); }
  return out;
}
/** Evenly samples a spline (points + radii) into [position, radius] pairs. */
export function along(pts: V3[], rad: number[], n: number): Array<[V3, number, V3]> {
  const P = splinePoints(pts, n), R = splineScalars(rad, n), out: Array<[V3, number, V3]> = [];
  for (let i = 0; i <= n; i++) out.push([P[i], R[i], norm3([P[Math.min(n, i + 1)][0] - P[Math.max(0, i - 1)][0], P[Math.min(n, i + 1)][1] - P[Math.max(0, i - 1)][1], P[Math.min(n, i + 1)][2] - P[Math.max(0, i - 1)][2]])]);
  return out;
}

/* ───────────── Lion ───────────── */
export const lion = defineShape({
  id: "form-lion", name: "Lion", tag: ANI,
  description: "A male lion in profile: deep chest, powerful shoulders, broad head with a heavy brow and muzzle, a flowing mane and a tufted tail.",
  palette: [[0, "#1d0f08"], [0.18, "#5b3414"], [0.4, "#a8692a"], [0.62, "#d9a04a"], [0.82, "#f0cf8c"], [1, "#fff2cf"]],
  count: 110000, size: 0.0056, fit: 1.35, camera: { distance: 4.8, yaw: 0.55, pitch: 0.12, autoRotate: 0.08 },
  deformers: [{ type: "breathe", amount: 0.012, speed: 0.6 }],
  build(sc, { detail }) {
    const rng = sc.rng, s = sc.solid(0.05);
    // torso: chest, belly and hip masses blended into one body with a tucked waist
    const cg = (_x: number, y: number) => 0.5 + 0.35 * (1 - Math.min(1, Math.max(0, (y - 0.45) / 0.65)));
    s.ell([0.42, 0.86, 0], [0.4, 0.36, 0.25], { c: 0.58, cg, k: 0.12 });
    s.ell([-0.12, 0.9, 0], [0.42, 0.27, 0.21], { c: 0.58, cg, k: 0.12 });
    s.ell([-0.62, 0.9, 0], [0.33, 0.3, 0.2], { c: 0.58, cg, k: 0.12 });
    s.ell([-0.62, 0.9, 0.12], [0.26, 0.28, 0.14], { sym: "z", c: 0.55 });  // haunch
    s.ell([0.5, 0.82, 0.15], [0.22, 0.26, 0.12], { sym: "z", c: 0.55 });    // shoulder muscle
    // legs
    limb(s, [[0.58, 0.72, 0.17], [0.55, 0.46, 0.16], [0.6, 0.2, 0.15], [0.66, 0.06, 0.15]], [0.115, 0.085, 0.066, 0.07], 0.55);
    limb(s, [[-0.72, 0.76, 0.19], [-0.52, 0.45, 0.17], [-0.8, 0.28, 0.14], [-0.74, 0.06, 0.14]], [0.16, 0.095, 0.06, 0.06], 0.52);
    s.ell([0.73, 0.04, 0.15], [0.11, 0.05, 0.075], { sym: "z", c: 0.45 }); s.ell([-0.68, 0.04, 0.14], [0.12, 0.05, 0.07], { sym: "z", c: 0.45 });
    // neck + head
    s.tube([[0.62, 0.95, 0], [0.82, 1.0, 0], [0.98, 1.0, 0]], [0.3, 0.26, 0.22], { seg: 10, c: 0.55 });
    const H = frame([1.1, 0.96, 0], -0.1, 1.2);
    s.ell(H(0, 0, 0), [0.21, 0.18, 0.17], { rot: [0, 0, -0.08], c: 0.6 });
    s.ell(H(0.17, -0.07, 0), [0.17, 0.095, 0.115], { rot: [0, 0, -0.1], c: 0.72, k: 0.05 });  // muzzle
    s.ell(H(0.3, -0.04, 0), [0.07, 0.06, 0.07], { c: 0.74 });
    s.ell(H(0.37, -0.01, 0), [0.04, 0.032, 0.05], { c: 0.04, k: 0.012 });                      // nose
    s.ell(H(0.2, -0.16, 0), [0.13, 0.05, 0.085], { c: 0.78 });                                 // jaw
    s.ell(H(0.12, 0.11, 0.1), [0.1, 0.035, 0.05], { sym: "z", rot: [0, 0, 0.25], c: 0.48 });  // brow
    s.sph(H(0.12, 0.06, 0.1), 0.026, { sym: "z", c: 0.0, k: 0.006, sz: 1.2 });
    s.cone(H(-0.04, 0.16, 0.12), H(-0.07, 0.25, 0.15), 0.06, 0.05, { sym: "z", c: 0.42, k: 0.03 });  // round ears
    // tail with tuft
    s.tube([[-0.92, 0.82, 0], [-1.08, 0.7, 0], [-1.18, 0.4, 0], [-1.12, 0.1, 0]], [0.04, 0.034, 0.03, 0.028], { seg: 14, c: 0.5 });
    s.ell([-1.12, 0.04, 0], [0.05, 0.12, 0.05], { c: 0.12 });
    s.shade = (x, _y, z, _nx, ny, _nz, t) => t + 0.04 * Math.sin(x * 33 + z * 21) * detail - 0.06 * Math.max(0, ny);
    // mane: strands radiating around the head and falling over the shoulders
    const mane = hairLines(rng, 650, 6, (_i, r) => {
      const th = r.next() * 6.283, ring = 0.17 + 0.1 * r.next(), ox = Math.cos(th), oz = Math.sin(th) * 1.05, back = 0.45 + 0.55 * r.next(), sag = 0.003 + 0.003 * r.next(), len = 0.05 + 0.03 * r.next();
      const root: V3 = [1.1 - 0.06 * r.next(), 0.96 + ring * ox * 0.95, ring * oz];
      return (k) => { const q = k * 5; return [root[0] - len * back * q * 1.05 - 0.01 * q * q, root[1] + len * ox * q * 0.95 - sag * q * q, root[2] + len * oz * q * 0.95]; };
    });
    sc.strands(mane, { r: 0.012, dens: 0.55, c0: 0.5, c1: 0.12, taper: false });
  },
});

/* ───────────── Wolf ───────────── */
export const wolf = defineShape({
  id: "form-wolf", name: "Wolf", tag: ANI,
  description: "A grey wolf mid-stride: lean deep-chested body, long legs, ruffed neck, pointed ears, long muzzle and a bushy hanging tail.",
  palette: [[0, "#0d0f13"], [0.22, "#33383f"], [0.45, "#6f747c"], [0.7, "#a9adb2"], [1, "#efede6"]],
  count: 110000, size: 0.0055, fit: 1.35, camera: { distance: 4.8, yaw: 0.6, pitch: 0.12, autoRotate: 0.08 },
  deformers: [{ type: "breathe", amount: 0.012, speed: 0.6 }],
  build(sc, { detail }) {
    const rng = sc.rng, s = sc.solid(0.05);
    const cg = (_x: number, y: number) => 0.38 + 0.32 * (1 - Math.min(1, Math.max(0, (y - 0.55) / 0.5)));
    s.ell([0.4, 0.9, 0], [0.36, 0.3, 0.15], { c: 0.5, cg, k: 0.12 });
    s.ell([-0.08, 0.93, 0], [0.4, 0.22, 0.13], { c: 0.5, cg, k: 0.12 });
    s.ell([-0.56, 0.93, 0], [0.28, 0.23, 0.13], { c: 0.5, cg, k: 0.12 });
    s.ell([-0.62, 0.84, 0.08], [0.2, 0.2, 0.1], { sym: "z", c: 0.45 });
    s.ell([0.5, 0.86, 0.09], [0.18, 0.22, 0.07], { sym: "z", c: 0.45 });
    // legs (stride: one fore forward / one hind back via mirrored x offset is skipped to keep symmetry)
    limb(s, [[0.55, 0.72, 0.1], [0.5, 0.5, 0.1], [0.55, 0.28, 0.1], [0.62, 0.05, 0.1]], [0.07, 0.05, 0.036, 0.034], 0.45);
    limb(s, [[-0.62, 0.76, 0.12], [-0.42, 0.52, 0.11], [-0.7, 0.3, 0.09], [-0.64, 0.05, 0.09]], [0.1, 0.065, 0.036, 0.034], 0.42);
    s.ell([0.66, 0.03, 0.1], [0.075, 0.035, 0.05], { sym: "z", c: 0.3 }); s.ell([-0.6, 0.03, 0.09], [0.075, 0.035, 0.05], { sym: "z", c: 0.3 });
    s.tube([[0.6, 0.94, 0], [0.82, 1.05, 0], [0.96, 1.08, 0]], [0.18, 0.15, 0.13], { seg: 10, c: 0.5 });
    const H = frame([1.07, 1.07, 0], -0.12);
    s.ell(H(0, 0, 0), [0.15, 0.125, 0.115], { c: 0.52 });
    s.ell(H(-0.02, -0.06, 0), [0.11, 0.1, 0.125], { c: 0.62 });                         // cheek ruff
    s.cone(H(0.1, -0.005, 0), H(0.38, -0.055, 0), 0.075, 0.036, { c: 0.6, k: 0.04 });   // muzzle
    s.ell(H(0.39, -0.045, 0), [0.032, 0.026, 0.035], { c: 0.02, k: 0.01 });
    s.cone(H(0.06, -0.085, 0), H(0.3, -0.1, 0), 0.04, 0.024, { c: 0.8, k: 0.02 });       // lower jaw
    s.ell(H(0.1, 0.045, 0.075), [0.04, 0.016, 0.02], { sym: "z", rot: [0, 0, 0.35], c: 0.3, k: 0.01 });
    s.sph(H(0.11, 0.04, 0.077), 0.016, { sym: "z", c: 0.9, k: 0.004 });
    s.cone(H(-0.03, 0.09, 0.06), H(-0.1, 0.3, 0.085), 0.058, 0.008, { sym: "z", c: 0.35, k: 0.02 });
    s.cone(H(-0.025, 0.1, 0.06), H(-0.085, 0.27, 0.078), 0.036, 0.006, { sym: "z", c: 0.15, k: 0.01 });
    // bushy tail
    s.tube([[-0.8, 0.86, 0], [-1.0, 0.76, 0], [-1.12, 0.52, 0], [-1.14, 0.2, 0]], [0.045, 0.075, 0.085, 0.05], { seg: 14, c: 0.42 });
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.12 * (vnoise(x * 12, y * 12, z * 12) - 0.5) * detail - 0.05 * Math.max(0, ny);
    // fur: neck ruff, back line, tail
    sc.strands(hairLines(rng, 260, 4, (_i, r) => { const a = r.next() * 6.283, x = 0.62 + 0.3 * r.next(), y = 1.0 + 0.04 * x; return (k) => [x - 0.1 * k - 0.03 * r.next() * k, y + 0.14 * Math.sin(a) - 0.1 * k * (1 + Math.sin(a) * 0.5), 0.15 * Math.cos(a) * (1 + k * 0.2)]; }), { r: 0.009, dens: 0.8, c0: 0.55, c1: 0.25 });
    sc.strands(hairLines(rng, 140, 4, (_i, r) => { const k0 = r.next(), p = splinePoints([[-0.8, 0.86, 0], [-1.0, 0.76, 0], [-1.12, 0.52, 0], [-1.14, 0.2, 0]], 30), q = p[Math.floor(k0 * 29)], a = r.next() * 6.283; return (k) => [q[0] - 0.03 * k + 0.09 * Math.cos(a), q[1] - 0.09 * k, 0.1 * Math.sin(a) * (1 + k)]; }), { r: 0.008, dens: 0.8, c0: 0.45, c1: 0.1 });
  },
});

/* ───────────── Horse (shared with unicorn & pegasus) ───────────── */
function horseBody(sc: Scene, o: { c: number; cMane: number; wings?: boolean; horn?: boolean; detail: number }) {
  const rng = sc.rng, s = sc.solid(0.05), { c } = o;
  const cg = (_x: number, y: number) => c - 0.08 + 0.1 * (1 - Math.min(1, Math.max(0, (y - 0.55) / 0.6)));
  s.ell([0.3, 0.92, 0], [0.42, 0.37, 0.22], { c, cg, k: 0.1 });
  s.ell([-0.16, 0.96, 0], [0.45, 0.29, 0.22], { c, cg, k: 0.1 });
  s.ell([-0.55, 0.98, 0], [0.34, 0.3, 0.21], { c, cg, k: 0.1 });
  s.ell([-0.52, 0.96, 0.1], [0.2, 0.24, 0.14], { sym: "z", c });
  s.ell([0.42, 0.92, 0.12], [0.2, 0.23, 0.08], { sym: "z", c });
  limb(s, [[0.44, 0.8, 0.12], [0.42, 0.58, 0.11], [0.46, 0.36, 0.1], [0.46, 0.13, 0.095], [0.5, 0.03, 0.095]], [0.1, 0.06, 0.04, 0.03, 0.036], c - 0.02);
  limb(s, [[-0.58, 0.88, 0.14], [-0.4, 0.65, 0.12], [-0.66, 0.4, 0.095], [-0.64, 0.13, 0.085], [-0.62, 0.03, 0.085]], [0.14, 0.08, 0.042, 0.03, 0.036], c - 0.02);
  s.ell([0.53, 0.03, 0.095], [0.06, 0.035, 0.045], { sym: "z", c: 0.03 }); s.ell([-0.59, 0.03, 0.085], [0.06, 0.035, 0.045], { sym: "z", c: 0.03 });
  s.tube([[0.44, 1.02, 0], [0.64, 1.28, 0], [0.84, 1.52, 0], [0.97, 1.66, 0]], [0.27, 0.21, 0.15, 0.12], { seg: 14, c });
  const H = frame([1.08, 1.62, 0], -1.0, 1.12);
  s.ell(H(0, 0, 0), [0.19, 0.12, 0.1], { c });
  s.ell(H(0.03, -0.06, 0), [0.13, 0.1, 0.105], { c });
  s.cone(H(0.12, -0.015, 0), H(0.48, -0.07, 0), 0.085, 0.056, { c: c + 0.02, k: 0.04 });
  s.ell(H(0.5, -0.075, 0), [0.04, 0.05, 0.06], { c: c + 0.02 });
  s.ell(H(0.53, -0.06, 0.025), [0.02, 0.014, 0.014], { sym: "z", c: 0.0, k: 0.005 });
  s.ell(H(0.1, 0.07, 0.09), [0.035, 0.02, 0.02], { sym: "z", c: 0.02, k: 0.006, sz: 1.2 });
  s.cone(H(-0.06, 0.1, 0.055), H(-0.12, 0.32, 0.08), 0.042, 0.008, { sym: "z", c: c - 0.05, k: 0.02 });
  s.tube([[-0.78, 1.0, 0], [-0.9, 0.9, 0], [-0.93, 0.76, 0]], [0.05, 0.045, 0.03], { seg: 6, c });
  s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.06 * (vnoise(x * 8, y * 8, z * 8) - 0.5) * o.detail - 0.04 * Math.max(0, ny);
  // mane along the crest, forelock, tail
  const neck = along([[0.44, 1.02, 0], [0.64, 1.28, 0], [0.84, 1.52, 0], [0.97, 1.66, 0]], [0.23, 0.19, 0.14, 0.11], 40);
  sc.strands(hairLines(rng, 230, 4, (_i, r) => { const q = neck[Math.floor(r.next() * 40)], side = r.next() < 0.85 ? 1 : -1; return (k) => [q[0][0] - 0.04 * k, q[0][1] + q[1] * 0.95 - 0.16 * k * k + 0.03 * k, side * (0.05 + 0.1 * k)]; }), { r: 0.0085, dens: 0.9, c0: o.cMane, c1: o.cMane });
  sc.strands(hairLines(rng, 40, 4, (_i, r) => { const z = (r.next() - 0.5) * 0.06; return (k) => { const p = H(0.02 + 0.08 * k, 0.12 - 0.04 * k, z); return [p[0], p[1] - 0.03 * k, p[2]]; }; }), { r: 0.007, dens: 0.8, c0: o.cMane, c1: o.cMane });
  sc.strands(hairLines(rng, 200, 5, (_i, r) => { const a = r.next() * 6.283, rad = 0.05 * Math.sqrt(r.next()); return (k) => [-0.76 - 0.1 * Math.sin(k * 2.4) - 0.04 * k * r.next(), 0.98 - 0.76 * k * (0.9 + 0.1 * Math.sin(a * 3)), rad * Math.cos(a) * (1 + k * 1.8) + 0.03 * Math.sin(k * 6 + a)]; }), { r: 0.007, dens: 0.9, c0: o.cMane, c1: o.cMane });
  if (o.horn) {
    s.cone(H(0.02, 0.1, 0), H(0.42, 0.44, 0), 0.036, 0.005, { c: 0.97, k: 0.01 });
    const dirv = norm3([0.4, 0.34, 0]), up2: V3 = [0, 0, 1], s1 = norm3([dirv[1] * up2[2], -dirv[0] * up2[2], 0]);
    for (let w = 0; w < 2; w++) {
      const line: V3[] = [];
      for (let i = 0; i <= 60; i++) { const k = i / 60, r = 0.034 * (1 - k) + 0.004, ang = k * 6.283 * 4 + w * Math.PI, base = H(0.02 + 0.4 * k, 0.1 + 0.34 * k, 0); line.push([base[0] + s1[0] * r * Math.cos(ang), base[1] + s1[1] * r * Math.cos(ang), base[2] + r * Math.sin(ang)]); }
      sc.strands([line], { r: 0.004, dens: 3, c0: 0.6, c1: 1 });
    }
  }
}

export const horse = defineShape({
  id: "animal-horse", name: "Horse", tag: ANI,
  description: "A standing chestnut horse with arched neck, refined head, strong shoulders and quarters, clean legs with hooves, flowing mane and tail.",
  palette: [[0, "#120a06"], [0.3, "#4f2610"], [0.5, "#8a4a20"], [0.7, "#b8723a"], [1, "#e7b98a"]],
  count: 100000, size: 0.0058, fit: 1.35, camera: { distance: 4.9, yaw: 0.6, pitch: 0.1, autoRotate: 0.08 },
  build(sc, { detail }) { horseBody(sc, { c: 0.5, cMane: 0.14, detail }); },
});

export const unicorn = defineShape({
  id: "myth-unicorn", name: "Unicorn", tag: MYTH,
  description: "A pearl-white horse with a long spiralling horn, luminous flowing mane and tail.",
  palette: [[0, "#2a1f4d"], [0.3, "#7c6fd6"], [0.55, "#d9d4ff"], [0.8, "#ffd9f2"], [1, "#ffffff"]],
  count: 100000, size: 0.0058, fit: 1.35, camera: { distance: 4.9, yaw: 0.6, pitch: 0.1, autoRotate: 0.08 }, look: { glow: 0.9 },
  build(sc, { detail }) {
    horseBody(sc, { c: 0.78, cMane: 0.3, horn: true, detail });
  },
});

export const pegasus = defineShape({
  id: "myth-pegasus", name: "Pegasus", tag: MYTH,
  description: "A winged white horse in flight: arched neck, raised feathered wings, flowing mane and tail.",
  palette: [[0, "#1a2a55"], [0.3, "#5f84d8"], [0.55, "#c6dcff"], [0.8, "#fff3df"], [1, "#ffffff"]],
  count: 110000, size: 0.0056, fit: 1.4, camera: { distance: 5.2, yaw: 0.6, pitch: 0.16, autoRotate: 0.08 }, look: { glow: 0.8 },
  build(sc, { detail }) {
    horseBody(sc, { c: 0.74, cMane: 0.35, detail });
    for (const side of [1, -1]) {
      wing(sc, side, { arm: [[0.3, 1.2, 0.12], [0.1, 1.6, 0.3], [-0.12, 1.95, 0.55]], secN: 12, priN: 9, secLen: 0.55, priLen: 0.85, spread: [0.5, 1.2], covertDepth: 0.22, cBase: 0.62, cTip: 0.95, up: 1.4, tipBend: 0.2 });
    }
  },
});

export const QUAD_SHAPES: GeneratorDef[] = [lion, wolf, horse, unicorn, pegasus];
