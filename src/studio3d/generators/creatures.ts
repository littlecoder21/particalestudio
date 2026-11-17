import type { GeneratorDef } from "../types";
import { clamp, vnoise } from "../math";
import type { ParamSurface } from "../sampling";
import { defineShape, polyAt, splinePoints, norm3, type V3 } from "./sculpt";
import { MYTH, ANI, frame, limb, hairLines, along } from "./quadrupeds";
import { wing } from "./birds";

const v = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/* ───────────── Western dragon ───────────── */
export const dragon = defineShape({
  id: "nature-dragon", name: "Dragon", tag: MYTH,
  description: "A western dragon: horned head with an open toothed jaw, long arched neck, powerful clawed legs, spined back, whip-like tail and bat wings with finger bones and scalloped membranes.",
  palette: [[0, "#14040a"], [0.22, "#6a0d16"], [0.45, "#c2271b"], [0.68, "#f07a2a"], [0.86, "#ffd27a"], [1, "#fff4cf"]],
  count: 130000, size: 0.0052, fit: 1.45, camera: { distance: 5.6, yaw: 0.65, pitch: 0.14, autoRotate: 0.07 },
  look: { glow: 0.7 }, deformers: [{ type: "breathe", amount: 0.012, speed: 0.5 }],
  build(sc, { detail }) {
    const rng = sc.rng, s = sc.solid(0.05);
    const cg = (_x: number, y: number) => 0.46 + 0.38 * (1 - clamp((y - 0.3) / 0.6, 0, 1));
    s.ell([0.2, 0.8, 0], [0.42, 0.34, 0.26], { c: 0.5, cg, k: 0.12 });
    s.ell([-0.28, 0.78, 0], [0.42, 0.28, 0.23], { c: 0.5, cg, k: 0.12 });
    s.ell([-0.72, 0.8, 0], [0.32, 0.3, 0.22], { c: 0.5, cg, k: 0.12 });
    limb(s, [[0.34, 0.64, 0.2], [0.3, 0.4, 0.31], [0.44, 0.2, 0.27], [0.52, 0.05, 0.27]], [0.14, 0.09, 0.06, 0.05], 0.45);
    limb(s, [[-0.68, 0.64, 0.22], [-0.46, 0.38, 0.33], [-0.8, 0.22, 0.27], [-0.66, 0.05, 0.27]], [0.2, 0.11, 0.07, 0.055], 0.45);
    for (const fx of [0.5, -0.66]) for (let i = -1; i <= 1; i++) s.cone([fx, 0.05, 0.27 + i * 0.05], [fx + 0.16, 0.015, 0.27 + i * 0.075], 0.03, 0.004, { sym: "z", c: 0.95, k: 0.01 });
    // neck and head
    const neck: V3[] = [[0.45, 0.95, 0], [0.7, 1.2, 0], [0.82, 1.52, 0], [1.05, 1.74, 0]], neckR = [0.26, 0.18, 0.14, 0.12];
    s.tube(neck, neckR, { seg: 14, c: 0.5 });
    const H = frame([1.2, 1.76, 0], -0.22);
    s.ell(H(0, 0, 0), [0.21, 0.13, 0.12], { c: 0.5 });
    s.cone(H(0.1, -0.005, 0), H(0.5, -0.04, 0), 0.09, 0.055, { c: 0.55, k: 0.04 });
    s.ell(H(0.5, 0.0, 0.032), [0.03, 0.022, 0.022], { sym: "z", c: 0.15, k: 0.01 });
    s.cone(H(0.03, -0.16, 0), H(0.46, -0.27, 0), 0.055, 0.03, { c: 0.7, k: 0.03 });
    s.ell(H(0.12, 0.1, 0.09), [0.1, 0.03, 0.04], { sym: "z", rot: [0, 0, 0.2], c: 0.4, k: 0.02 });
    s.sph(H(0.1, 0.065, 0.108), 0.022, { sym: "z", c: 1, k: 0.004, sz: 1.5 });
    for (let i = 0; i < 6; i++) {
      const x = 0.14 + i * 0.06, z = 0.075 - i * 0.008;
      s.cone(H(x, -0.07, z), H(x + 0.008, -0.135, z), 0.016, 0.003, { sym: "z", c: 1, k: 0.004 });
      s.cone(H(x + 0.02, -0.13, z * 0.9), H(x + 0.012, -0.075, z * 0.9), 0.014, 0.003, { sym: "z", c: 1, k: 0.004 });
    }
    s.tube([H(-0.02, 0.1, 0.07), H(-0.2, 0.2, 0.12), H(-0.42, 0.24, 0.14), H(-0.6, 0.18, 0.12)], [0.048, 0.032, 0.017, 0.004], { seg: 12, sym: "z", c: 0.93, k: 0.01 });
    s.cone(H(0.0, -0.02, 0.12), H(-0.16, -0.02, 0.2), 0.03, 0.004, { sym: "z", c: 0.9, k: 0.01 });
    for (let i = 0; i < 4; i++) s.cone(H(0.1 + i * 0.1, -0.2 - i * 0.02, 0), H(0.1 + i * 0.1, -0.3 - i * 0.015, 0), 0.016, 0.004, { c: 0.9, k: 0.005 });
    // tail with spade
    const tail: V3[] = [[-0.95, 0.82, 0], [-1.35, 0.6, 0.12], [-1.85, 0.32, 0.32], [-2.35, 0.38, 0.2], [-2.75, 0.62, -0.06]], tailR = [0.2, 0.14, 0.09, 0.05, 0.016];
    s.tube(tail, tailR, { seg: 28, c: 0.48 });
    // dorsal spines along neck, back and tail
    const back: V3[] = [[1.1, 1.86, 0], [0.88, 1.64, 0], [0.68, 1.36, 0], [0.45, 1.16, 0], [0.1, 1.14, 0], [-0.4, 1.06, 0], [-0.8, 1.1, 0], [-1.0, 0.98, 0]];
    const bp = splinePoints(back, 22);
    bp.forEach((p, i) => { if (i % 2 === 0) { const h = 0.09 + 0.05 * Math.sin(i * 0.9) - 0.0016 * i; s.cone(p, [p[0] - 0.03, p[1] + h, 0], 0.03, 0.004, { c: 0.88, k: 0.012 }); } });
    const tl = along(tail, tailR, 28);
    tl.forEach(([p, r], i) => { if (i % 2 === 0 && i < 27) s.cone([p[0], p[1] + r * 0.95, p[2]], [p[0] - 0.02, p[1] + r * 0.95 + 0.09 * (1 - i / 30), p[2]], 0.024 * (1 - i / 34), 0.004, { c: 0.88, k: 0.01 }); });
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.13 * (vnoise(x * 14, y * 14, z * 14) - 0.5) * detail - 0.05 * Math.max(0, ny);
    // spade at the tail tip
    const tip = tail[4];
    sc.sheet({ u0: 0, u1: 1, v0: -1, v1: 1, eval(u, w, o) { const a = 0.05 + 0.24 * Math.sin(Math.PI * u) ** 0.8 * (1 - 0.2 * u); o[0] = tip[0] - 0.04 + 0.34 * u; o[1] = tip[1] + 0.1 * u + w * a * 0.6; o[2] = tip[2] - 0.02 * u + w * a * 0.2; } }, { dens: 1, thick: 0.006, c: 0.52 });
    // bat wings
    const S: V3 = [0.1, 1.02, 0.2], E: V3 = [-0.22, 1.7, 0.62], W: V3 = [0.22, 2.1, 1.2], B: V3 = [-0.6, 0.98, 0.2];
    const tips: V3[] = [[0.9, 2.28, 2.05], [0.2, 2.6, 2.3], [-0.5, 2.38, 2.2], [-1.0, 1.85, 1.75], B];
    const mem: ParamSurface = {
      u0: 0, u1: 1, v0: 0, v1: 1,
      eval(u, w, o) {
        const edge = polyAt(tips, u), fr = (u * 4) % 1, r = 1 - 0.22 * Math.sin(Math.PI * fr) ** 0.9 * (u < 0.999 ? 1 : 0), k = w * r;
        o[0] = W[0] + (edge[0] - W[0]) * k; o[1] = W[1] + (edge[1] - W[1]) * k - 0.12 * Math.sin(Math.PI * w) * Math.sin(Math.PI * fr * 0.9 + 0.1); o[2] = W[2] + (edge[2] - W[2]) * k;
      },
    };
    const patch: ParamSurface = { u0: 0, u1: 1, v0: 0, v1: 1, eval(u, w, o) { const p = polyAt([S, E, W], u), q = v(p, B, w); o[0] = q[0]; o[1] = q[1] - 0.05 * Math.sin(Math.PI * w); o[2] = q[2]; } };
    const veins = (u: number, w: number) => 0.5 + 0.28 * w + 0.12 * Math.pow(Math.abs(Math.sin(u * 4 * Math.PI)), 6) * (1 - w * 0.3);
    sc.sheet(mem, { dens: 1.8, thick: 0.005, sym: "z", c: (u, w) => veins(u, w), al: 0.92 });
    sc.sheet(patch, { dens: 1.6, thick: 0.005, sym: "z", c: (_u, w) => 0.42 + 0.2 * w, al: 0.92 });
    const bones = sc.solid(0.02);
    bones.tube([S, E, W], [0.075, 0.052, 0.036], { seg: 14, sym: "z", c: 0.35, k: 0.02 });
    for (const t of tips.slice(0, 4)) bones.tube([W, v(W, t, 0.5), t], [0.026, 0.014, 0.004], { seg: 8, sym: "z", c: 0.3, k: 0.01 });
    bones.cone(W, [W[0] + 0.1, W[1] + 0.2, W[2] + 0.02], 0.03, 0.005, { sym: "z", c: 0.92, k: 0.01 }); // thumb claw
    void rng;
  },
});

/* ───────────── Chinese dragon ───────────── */
export const chineseDragon = defineShape({
  id: "myth-chinese-dragon", name: "Chinese Dragon", tag: MYTH,
  description: "A serpentine Eastern dragon: long scaled body in flowing coils, antlered horned head with whiskers and beard, flowing mane, four clawed legs and a pearl.",
  palette: [[0, "#031a16"], [0.22, "#0a6b52"], [0.48, "#2fd08a"], [0.72, "#e8c04a"], [0.9, "#fff0a8"], [1, "#ffffff"]],
  count: 130000, size: 0.0052, fit: 1.5, camera: { distance: 6.2, yaw: 0.4, pitch: 0.18, autoRotate: 0.07 },
  look: { glow: 0.8 }, deformers: [{ type: "wave", amount: 0.04, scale: 1.2, speed: 0.6, axis: "y" }],
  build(sc, { detail }) {
    const rng = sc.rng, s = sc.solid(0.05);
    const P: V3[] = [[1.55, 0.95, 0], [1.1, 1.25, 0.1], [0.55, 0.85, 0.35], [0.05, 0.35, 0.15], [-0.45, 0.55, -0.25], [-0.95, 1.15, -0.35], [-1.5, 1.05, -0.1], [-1.95, 0.55, 0.15], [-2.4, 0.45, 0.35], [-2.85, 0.75, 0.2]];
    const R = [0.15, 0.16, 0.17, 0.17, 0.16, 0.145, 0.12, 0.085, 0.045, 0.012];
    s.tube(P, R, { seg: 90, c: 0.5, cgFromT: (t) => 0.3 + 0.35 * Math.sin(t * 9) * 0.3 + 0.3 * t });
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.12 * (vnoise(x * 16, y * 16, z * 16) - 0.5) * detail + 0.1 * Math.max(0, -ny) - 0.04 * Math.max(0, ny);
    // head
    const H = frame([1.72, 1.02, 0], -0.12, 1.15);
    s.ell(H(0, 0, 0), [0.2, 0.15, 0.14], { c: 0.5 });
    s.cone(H(0.1, 0.0, 0), H(0.5, 0.02, 0), 0.1, 0.07, { c: 0.55, k: 0.04 });
    s.ell(H(0.52, 0.04, 0), [0.07, 0.05, 0.09], { c: 0.56, k: 0.02 });                // upturned nose pad
    s.sph(H(0.55, 0.06, 0.07), 0.03, { sym: "z", c: 0.15, k: 0.01 });
    s.cone(H(0.03, -0.14, 0), H(0.46, -0.2, 0), 0.06, 0.035, { c: 0.7, k: 0.03 });
    s.ell(H(0.1, 0.12, 0.1), [0.1, 0.04, 0.05], { sym: "z", rot: [0, 0, 0.3], c: 0.4, k: 0.02 });
    s.sph(H(0.1, 0.075, 0.12), 0.026, { sym: "z", c: 1, k: 0.004, sz: 1.5 });
    for (let i = 0; i < 5; i++) { const x = 0.15 + i * 0.07; s.cone(H(x, -0.07, 0.08), H(x + 0.006, -0.14, 0.08), 0.016, 0.003, { sym: "z", c: 1, k: 0.004 }); }
    // antlers
    const antler = (a: V3[], r: number[]) => s.tube(a, r, { seg: 10, sym: "z", c: 0.88, k: 0.01 });
    antler([H(-0.04, 0.12, 0.07), H(-0.2, 0.3, 0.1), H(-0.45, 0.38, 0.12), H(-0.7, 0.3, 0.1)], [0.036, 0.026, 0.016, 0.004]);
    antler([H(-0.2, 0.3, 0.1), H(-0.28, 0.46, 0.12), H(-0.34, 0.58, 0.12)], [0.02, 0.012, 0.004]);
    antler([H(-0.4, 0.37, 0.12), H(-0.5, 0.5, 0.12), H(-0.56, 0.58, 0.12)], [0.016, 0.01, 0.004]);
    // ears + chin beard
    s.ell(H(-0.12, 0.02, 0.15), [0.06, 0.07, 0.025], { sym: "z", c: 0.5, k: 0.01 });
    // whiskers, beard, mane
    const whisk = (z: number) => hairLines(rng, 1, 18, () => (k) => { const p = H(0.5 - 1.1 * k, 0.02 + 0.22 * Math.sin(k * 6) - 0.1 * k, z + Math.sign(z) * (0.12 + 0.55 * k * k)); return [p[0], p[1], p[2]]; });
    sc.strands([...whisk(0.07), ...whisk(-0.07)], { r: 0.008, dens: 9, c0: 0.8, c1: 1, taper: true });
    sc.strands(hairLines(rng, 40, 8, (_i, r) => { const x = 0.05 + r.next() * 0.3, z = (r.next() - 0.5) * 0.1; return (k) => { const p = H(x - 0.1 * k, -0.16 - 0.14 * k, z * (1 + k)); return p; }; }), { r: 0.005, dens: 0.7, c0: 0.8, c1: 1, taper: true });
    const sp = along(P, R, 120);
    sc.strands(hairLines(rng, 520, 4, (_i, r) => { const q = sp[6 + Math.floor(r.next() * 112)], side = r.next() < 0.5 ? 1 : -1, len = 0.22 + 0.25 * r.next(); return (k) => [q[0][0] - 0.8 * len * k, q[0][1] + q[1] * 0.95 + 0.9 * len * k * (1 - 0.6 * k) , q[0][2] + side * 0.25 * len * k]; }), { r: 0.006, dens: 1.1, c0: 0.62, c1: 0.95, taper: true });
    // four legs with claws
    for (const t of [0.2, 0.27, 0.58, 0.66]) {
      const q = sp[Math.round(t * 120)], root: V3 = [q[0][0], q[0][1] - q[1] * 0.7, q[0][2] + q[1] * 0.5];
      const knee: V3 = [root[0] + 0.12, root[1] - 0.26, root[2] + 0.2], foot: V3 = [knee[0] - 0.08, knee[1] - 0.3, knee[2] + 0.08];
      s.tube([root, knee, foot], [0.07, 0.04, 0.032], { seg: 8, sym: "z", c: 0.48, k: 0.02 });
      s.tube([[root[0], root[1], -root[2]], [knee[0], knee[1], -knee[2]], [foot[0], foot[1], -foot[2]]], [0.07, 0.04, 0.032], { seg: 8, c: 0.48, k: 0.02 });
      for (let c = 0; c < 4; c++) { const a = (c - 1.5) * 0.45; s.cone(foot, [foot[0] + 0.09 * Math.cos(a), foot[1] - 0.07, foot[2] + 0.1 * Math.sin(a)], 0.022, 0.004, { c: 1, k: 0.006 }); s.cone([foot[0], foot[1], -foot[2]], [foot[0] + 0.09 * Math.cos(a), foot[1] - 0.07, -foot[2] - 0.1 * Math.sin(a)], 0.022, 0.004, { c: 1, k: 0.006 }); }
    }
    // flaming pearl
    s.sph(H(0.85, 0.14, 0), 0.1, { c: 0.9, k: 0.01, sz: 1.3 });
    void rng;
  },
});

/* ───────────── Tyrannosaurus rex ───────────── */
export const trex = defineShape({
  id: "animal-trex", name: "Tyrannosaurus Rex", tag: ANI,
  description: "A bipedal T. rex with a massive skull and serrated teeth, short two-fingered arms, powerful thighs, three-toed clawed feet and a thick counterbalancing tail.",
  palette: [[0, "#14110a"], [0.25, "#3f4a1c"], [0.5, "#79893a"], [0.75, "#c2b26a"], [1, "#f4ebc0"]],
  count: 120000, size: 0.0055, fit: 1.4, camera: { distance: 5.4, yaw: 0.65, pitch: 0.12, autoRotate: 0.07 },
  build(sc, { detail }) {
    const s = sc.solid(0.05), cg = (_x: number, y: number) => 0.52 + 0.3 * (1 - clamp((y - 0.7) / 0.7, 0, 1));
    s.ell([0.1, 1.28, 0], [0.62, 0.42, 0.3], { rot: [0, 0, 0.12], c: 0.5, cg, k: 0.12 });
    s.ell([0.6, 1.4, 0], [0.3, 0.3, 0.24], { c: 0.52, cg, k: 0.1 });
    s.ell([-0.35, 1.2, 0], [0.4, 0.34, 0.27], { c: 0.5, cg, k: 0.1 });
    // legs: thigh, shin, foot, toes
    limb(s, [[0.0, 1.1, 0.26], [0.3, 0.7, 0.3], [-0.05, 0.42, 0.26], [0.0, 0.1, 0.25]], [0.27, 0.13, 0.085, 0.07], 0.48, 0.05);
    s.ell([0.18, 0.05, 0.26], [0.22, 0.05, 0.1], { sym: "z", c: 0.45, k: 0.02 });
    for (let i = -1; i <= 1; i++) { s.cone([0.15, 0.05, 0.26 + i * 0.07], [0.46, 0.02, 0.26 + i * 0.12], 0.04, 0.012, { sym: "z", c: 0.5, k: 0.01 }); s.cone([0.4, 0.03, 0.26 + i * 0.11], [0.5, 0.0, 0.26 + i * 0.14], 0.02, 0.003, { sym: "z", c: 1, k: 0.004 }); }
    // arms
    limb(s, [[0.7, 1.28, 0.24], [0.82, 1.05, 0.26], [0.95, 0.95, 0.26]], [0.07, 0.045, 0.035], 0.5, 0.02, 8);
    for (let i = 0; i < 2; i++) s.cone([0.95, 0.95, 0.24 + i * 0.045], [1.04, 0.84, 0.24 + i * 0.045], 0.018, 0.003, { sym: "z", c: 1, k: 0.004 });
    // neck + skull
    s.tube([[0.7, 1.5, 0], [0.95, 1.72, 0], [1.1, 1.78, 0]], [0.26, 0.2, 0.2], { seg: 10, c: 0.52 });
    const H = frame([1.3, 1.78, 0], -0.12, 1.05);
    s.ell(H(0, 0, 0), [0.3, 0.2, 0.19], { c: 0.5 });
    s.cone(H(0.15, 0.0, 0), H(0.7, -0.02, 0), 0.15, 0.09, { c: 0.52, k: 0.06 });
    s.ell(H(0.72, 0.02, 0), [0.06, 0.06, 0.1], { c: 0.55 });
    s.cone(H(0.05, -0.16, 0), H(0.62, -0.2, 0), 0.1, 0.05, { c: 0.7, k: 0.05 });
    s.ell(H(0.12, 0.17, 0.12), [0.12, 0.05, 0.06], { sym: "z", rot: [0, 0, 0.2], c: 0.35, k: 0.02 });
    s.sph(H(0.12, 0.1, 0.17), 0.026, { sym: "z", c: 1, k: 0.004, sz: 1.3 });
    s.ell(H(0.68, 0.06, 0.06), [0.03, 0.02, 0.02], { sym: "z", c: 0.05, k: 0.005 });
    for (let i = 0; i < 10; i++) {
      const x = 0.1 + i * 0.062, z = 0.1 - i * 0.004, h = 0.075 - Math.abs(i - 3) * 0.004;
      s.cone(H(x, -0.07, z * 1.15), H(x + 0.006, -0.07 - h, z * 1.15), 0.018, 0.003, { sym: "z", c: 1, k: 0.004 });
      if (i < 9) s.cone(H(x + 0.03, -0.14, z * 0.95), H(x + 0.024, -0.14 + h * 0.8, z * 0.95), 0.014, 0.003, { sym: "z", c: 1, k: 0.004 });
    }
    // tail
    s.tube([[-0.5, 1.2, 0], [-1.1, 1.12, 0], [-1.8, 1.0, 0], [-2.5, 0.88, 0]], [0.3, 0.22, 0.11, 0.015], { seg: 24, c: 0.46 });
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.15 * (vnoise(x * 12, y * 12, z * 12) - 0.5) * detail + (ny > 0.2 ? -0.08 * Math.sin(x * 22) : 0) - 0.05 * Math.max(0, ny);
  },
});

/* ───────────── Cobra ───────────── */
export const cobra = defineShape({
  id: "animal-cobra", name: "King Cobra", tag: ANI,
  description: "A coiled king cobra rearing up with a flared hood, scaled body, flickering forked tongue and alert head.",
  palette: [[0, "#0d0a05"], [0.25, "#3a2c12"], [0.5, "#6e5a22"], [0.75, "#c9b25a"], [1, "#f5ecbf"]],
  count: 100000, size: 0.0055, fit: 1.3, camera: { distance: 4.8, yaw: 0.5, pitch: 0.2, autoRotate: 0.08 },
  build(sc, { detail }) {
    const rng = sc.rng, s = sc.solid(0.04);
    const pts: V3[] = [];
    // coiled base that spirals in, then rises into an S-shaped neck
    for (let i = 0; i <= 26; i++) { const t = i / 26, a = t * 6.283 * 2.4 + 0.4, r = 0.95 - 0.5 * t; pts.push([r * Math.cos(a), 0.09 + 0.1 * Math.sin(t * 9) * 0.3 + 0.17 * t, r * Math.sin(a)]); }
    const last = pts[pts.length - 1];
    pts.push([last[0] * 0.8, 0.3, last[2] * 0.8], [0.18, 0.55, 0.1], [0.05, 0.95, 0.0], [0.0, 1.35, 0.0], [0.04, 1.62, 0.0], [0.14, 1.78, 0.0]);
    const rad = pts.map((_, i) => 0.085 + 0.045 * Math.min(1, i / 20) - (i < 6 ? 0.06 * (1 - i / 6) : 0) + (i > pts.length - 4 ? 0.02 : 0));
    s.tube(pts, rad, { seg: 200, c: 0.4, cgFromT: (t) => 0.38 + 0.2 * Math.sin(t * 90) });
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.12 * (vnoise(x * 20, y * 20, z * 20) - 0.5) * detail + 0.12 * Math.max(0, -ny) - 0.04 * Math.max(0, ny);
    // hood
    s.ell([0.02, 1.45, 0], [0.04, 0.34, 0.42], { rot: [0, 0, 0.12], c: 0.5, k: 0.05 });
    s.ell([0.0, 1.45, 0], [0.04, 0.26, 0.33], { rot: [0, 0, 0.12], c: 0.8, k: 0.05 });
    // head
    const H = frame([0.24, 1.8, 0], -0.15);
    s.ell(H(0, 0, 0), [0.14, 0.075, 0.085], { c: 0.52, k: 0.03 });
    s.ell(H(0.12, -0.01, 0), [0.08, 0.055, 0.065], { c: 0.55, k: 0.03 });
    s.sph(H(0.07, 0.04, 0.07), 0.02, { sym: "z", c: 1, k: 0.004, sz: 1.3 });
    s.sph(H(0.075, 0.042, 0.082), 0.009, { sym: "z", c: 0.0, k: 0.002 });
    // forked tongue
    const tg = (z: number) => [H(0.19, -0.04, 0), H(0.3, -0.06, 0), H(0.38, -0.06, z)];
    sc.strands([tg(0.025), tg(-0.025)], { r: 0.0035, dens: 6, c0: 0.95, c1: 0.95 });
    void rng;
  },
});

/* ───────────── Griffin ───────────── */
export const griffin = defineShape({
  id: "myth-griffin", name: "Griffin", tag: MYTH,
  description: "A griffin: lion hindquarters and tufted tail, eagle head with hooked golden beak, taloned forelegs, a feathered chest and great spread wings.",
  palette: [[0, "#2a1608"], [0.2, "#6b3f17"], [0.42, "#b27a2a"], [0.65, "#e3b04e"], [0.85, "#f7e2a0"], [1, "#fffdf3"]],
  count: 130000, size: 0.0054, fit: 1.45, camera: { distance: 5.6, yaw: 0.65, pitch: 0.16, autoRotate: 0.07 },
  build(sc, { detail }) {
    const rng = sc.rng, s = sc.solid(0.05);
    const cg = (_x: number, y: number) => 0.55 + 0.3 * (1 - clamp((y - 0.45) / 0.65, 0, 1));
    s.ell([0.42, 0.9, 0], [0.4, 0.36, 0.25], { c: 0.82, cg: (x) => 0.55 + 0.32 * clamp((x - 0.0) / 0.5, 0, 1), k: 0.12 });
    s.ell([-0.12, 0.9, 0], [0.42, 0.27, 0.21], { c: 0.55, cg, k: 0.12 });
    s.ell([-0.62, 0.9, 0], [0.33, 0.3, 0.2], { c: 0.52, cg, k: 0.12 });
    s.ell([-0.62, 0.9, 0.12], [0.26, 0.28, 0.14], { sym: "z", c: 0.5 });
    limb(s, [[-0.72, 0.76, 0.19], [-0.52, 0.45, 0.17], [-0.8, 0.28, 0.14], [-0.74, 0.06, 0.14]], [0.16, 0.095, 0.06, 0.06], 0.5);
    s.ell([-0.68, 0.04, 0.14], [0.12, 0.05, 0.07], { sym: "z", c: 0.45 });
    // eagle forelegs with talons
    limb(s, [[0.58, 0.72, 0.17], [0.6, 0.45, 0.15], [0.7, 0.2, 0.15]], [0.1, 0.06, 0.045], 0.9);
    for (let i = -1; i <= 1; i++) { s.cone([0.7, 0.14, 0.15 + i * 0.04], [0.84, 0.03, 0.15 + i * 0.07], 0.03, 0.004, { sym: "z", c: 0.97, k: 0.006 }); }
    s.cone([0.7, 0.14, 0.15], [0.6, 0.04, 0.15], 0.025, 0.004, { sym: "z", c: 0.97, k: 0.006 });
    // neck + eagle head
    s.tube([[0.66, 1.0, 0], [0.82, 1.2, 0], [0.96, 1.38, 0]], [0.24, 0.17, 0.14], { seg: 8, c: 0.85 });
    const H = frame([1.06, 1.48, 0], -0.05, 1.3);
    s.ell(H(0, 0, 0), [0.16, 0.13, 0.11], { c: 0.95 });
    s.cone(H(0.1, -0.01, 0), H(0.28, -0.06, 0), 0.075, 0.055, { c: 0.78, k: 0.02 });
    s.tube([H(0.24, -0.04, 0), H(0.34, -0.06, 0), H(0.4, -0.13, 0)], [0.05, 0.034, 0.008], { seg: 6, c: 0.8, k: 0.01 });
    s.ell(H(0.3, -0.12, 0), [0.07, 0.014, 0.03], { c: 0.78, k: 0.01 });
    s.ell(H(0.08, 0.075, 0.075), [0.05, 0.018, 0.025], { sym: "z", rot: [0, 0, 0.3], c: 0.95, k: 0.01 });
    s.sph(H(0.08, 0.05, 0.08), 0.02, { sym: "z", c: 0.8, k: 0.004, sz: 1.3 });
    s.sph(H(0.088, 0.05, 0.088), 0.008, { sym: "z", c: 0.0, k: 0.002 });
    s.cone(H(-0.04, 0.1, 0.05), H(-0.18, 0.3, 0.08), 0.05, 0.008, { sym: "z", c: 0.9, k: 0.02 });  // ear tufts
    // lion tail with tuft
    s.tube([[-0.9, 0.9, 0], [-1.1, 0.78, 0], [-1.25, 0.5, 0], [-1.18, 0.2, 0]], [0.04, 0.034, 0.03, 0.028], { seg: 14, c: 0.5 });
    s.ell([-1.18, 0.12, 0], [0.06, 0.15, 0.06], { c: 0.88 });
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.1 * (vnoise(x * 11, y * 11, z * 11) - 0.5) * detail - 0.05 * Math.max(0, ny);
    // chest feathers, collar ruff
    sc.strands(hairLines(rng, 260, 4, (_i, r) => { const a = r.next() * 6.283, x = 0.55 + 0.3 * r.next(); return (k) => [x + 0.05 * k, 1.05 + 0.22 * Math.sin(a) * 1.0 - 0.14 * k, 0.2 * Math.cos(a)]; }), { r: 0.009, dens: 0.6, c0: 0.9, c1: 0.7 });
    for (const side of [1, -1]) wing(sc, side, { arm: [[0.32, 1.2, 0.16], [0.05, 1.75, 0.4], [-0.2, 2.15, 0.8]], secN: 12, priN: 10, secLen: 0.55, priLen: 0.95, spread: [0.5, 1.25], covertDepth: 0.22, cBase: 0.55, cTip: 0.9, up: 1.4, tipBend: 0.2 });
    norm3([1, 0, 0]);
  },
});

export const CREATURE_SHAPES: GeneratorDef[] = [dragon, chineseDragon, trex, cobra, griffin];
