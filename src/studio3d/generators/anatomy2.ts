import type { GeneratorDef } from "../types";
import { vnoise, type Rng } from "../math";
import type { ParamSurface } from "../sampling";
import { defineShape, splinePoints, norm3, cross3, sstep, mixn, type Solid, type V3 } from "./sculpt";
import { tri } from "./marine";

const ANAT = "Human anatomy";
const TAU = Math.PI * 2;

/** Drops a 2D path onto the solid's front surface (searching along +z). */
function snapFront(s: Solid, path: Array<[number, number]>, lift = 0.012, z0 = 1.0): V3[] {
  let last = 0.4;
  return path.map(([x, y]) => { let z = z0, hit = false; for (; z > -0.2; z -= 0.01) if (s.sdf(x, y, z) < 0) { hit = true; break; } if (hit) last = z + lift; return [x, y, last] as V3; });
}

/* ───────────── Heart ───────────── */
export const heart = defineShape({
  id: "body-heart", name: "Human Heart", tag: ANAT,
  description: "An anatomical heart: four chambers, auricles, the aortic arch with branching arteries, pulmonary trunk, venae cavae and a network of coronary vessels on the surface.",
  palette: [[0, "#2a46c0"], [0.12, "#4a1020"], [0.4, "#a8141f"], [0.7, "#e8483c"], [1, "#ffc9b0"]],
  count: 110000, size: 0.0056, fit: 1.35, camera: { distance: 4.6, yaw: 0.35, pitch: 0.1, autoRotate: 0.08 }, look: { glow: 0.6 },
  deformers: [{ type: "breathe", amount: 0.035, speed: 1.1 }],
  build(sc, { detail }) {
    const rng = sc.rng, s = sc.solid(0.06);
    s.ell([0.08, -0.15, -0.02], [0.46, 0.72, 0.44], { rot: [0, 0, 0.35], c: 0.42, k: 0.08 });
    s.ell([-0.4, -0.12, 0.24], [0.36, 0.56, 0.3], { rot: [0, 0, 0.2], c: 0.36, k: 0.08 });
    s.ell([0.15, 0.52, -0.25], [0.3, 0.2, 0.26], { c: 0.3, k: 0.06 });
    s.ell([-0.52, 0.4, 0.06], [0.26, 0.3, 0.24], { c: 0.28, k: 0.06 });
    s.ell([-0.2, 0.52, 0.34], [0.14, 0.1, 0.1], { rot: [0, 0, 0.5], c: 0.3, k: 0.04 });
    s.ell([0.38, 0.5, 0.14], [0.14, 0.1, 0.1], { rot: [0, 0, -0.5], c: 0.32, k: 0.04 });
    const art = (pts: V3[], r: number[], c = 0.5) => s.tube(pts, r, { seg: 12, c, k: 0.04 });
    art([[0.0, 0.5, 0.0], [0.05, 0.95, -0.02], [0.35, 1.22, -0.08], [0.68, 1.06, -0.12], [0.72, 0.6, -0.16], [0.7, 0.05, -0.2]], [0.17, 0.15, 0.14, 0.13, 0.12, 0.11]);
    art([[0.14, 1.12, -0.04], [0.14, 1.5, -0.04]], [0.05, 0.045]); art([[0.34, 1.22, -0.06], [0.36, 1.6, -0.06]], [0.05, 0.045]); art([[0.54, 1.18, -0.1], [0.68, 1.5, -0.1]], [0.05, 0.045]);
    art([[-0.16, 0.46, 0.18], [-0.12, 0.92, 0.1], [-0.3, 1.14, 0.0]], [0.14, 0.13, 0.12], 0.1);
    art([[-0.3, 1.14, 0.0], [-0.78, 1.22, -0.1]], [0.09, 0.07], 0.1); art([[-0.3, 1.14, 0.0], [0.2, 1.1, -0.34]], [0.08, 0.06], 0.1);
    art([[-0.56, 0.5, 0.06], [-0.6, 1.0, 0.04], [-0.55, 1.5, 0.04]], [0.11, 0.1, 0.1], 0.02);
    art([[-0.48, 0.1, 0.1], [-0.5, -0.5, 0.1], [-0.5, -0.9, 0.1]], [0.1, 0.1, 0.1], 0.02);
    for (const [x, y, z] of [[0.45, 0.55, -0.45], [0.0, 0.6, -0.55]] as const) art([[x * 0.5, y - 0.05, z * 0.4], [x, y, z], [x + 0.3 * Math.sign(x || 1), y + 0.1, z - 0.1]], [0.06, 0.05, 0.045], 0.45);
    s.disp = (x, y, z) => 0.012 * (vnoise(x * 5, y * 5, z * 5) - 0.5) * (0.5 + detail);
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.06 * (vnoise(x * 8, y * 8, z * 8) - 0.5) - 0.04 * Math.max(0, ny);
    // coronary vessels on the surface
    const branch = (line: V3[], c0: number, n: number) => {
      const out: V3[][] = [line];
      for (let i = 0; i < n; i++) { const k = 1 + Math.floor(rng.next() * (line.length - 2)), p = line[k], q = line[k + 1], d: V3 = [q[0] - p[0] + (rng.next() - 0.5) * 0.3, q[1] - p[1] - 0.12, 0]; const [px, py] = [p[0] + d[0] * 1.8, p[1] + d[1] * 1.8], [mx, my] = [p[0] + d[0] * 0.9, p[1] + d[1] * 0.9]; out.push(snapFront(s, [[p[0], p[1]], [mx, my], [px, py]], 0.01)); }
      void c0; return out;
    };
    const lad = splinePoints(snapFront(s, [[0.0, 0.5], [0.0, 0.1], [0.1, -0.3], [0.25, -0.7], [0.3, -0.9]], 0.012), 18);
    const cx = splinePoints(snapFront(s, [[0.1, 0.5], [0.42, 0.3], [0.6, 0.0], [0.62, -0.35]], 0.012), 14);
    const rca = splinePoints(snapFront(s, [[-0.5, 0.45], [-0.7, 0.15], [-0.62, -0.3], [-0.35, -0.7]], 0.012), 14);
    sc.strands([...branch(lad, 0.5, 8), ...branch(cx, 0.5, 5), ...branch(rca, 0.5, 5)], { r: 0.014, dens: 5, c0: 0.62, c1: 0.55, taper: true });
    const vein = splinePoints(snapFront(s, [[-0.1, 0.45], [-0.02, 0.0], [0.12, -0.4], [0.28, -0.8]], 0.012), 14).map((p): V3 => [p[0] - 0.05, p[1], p[2]]);
    sc.strands(branch(vein, 0.05, 4), { r: 0.011, dens: 5, c0: 0.05, c1: 0.03, taper: true });
  },
});

/* ───────────── Human eye ───────────── */
export const eye = defineShape({
  id: "body-eye", name: "Human Eye", tag: ANAT,
  description: "A human eyeball: veined white sclera, glassy cornea dome, fibrous coloured iris with collarette and a dark pupil, with the optic nerve trailing behind.",
  palette: [[0, "#020306"], [0.16, "#8a2018"], [0.3, "#2a6a9e"], [0.5, "#6cc0dc"], [0.72, "#f4efe8"], [1, "#ffffff"]],
  count: 110000, size: 0.0054, fit: 1.4, camera: { distance: 4.4, yaw: -0.5, pitch: 0.12, autoRotate: 0.1 }, look: { glow: 0.6 },
  build(sc, { detail }) {
    const rng = sc.rng, th0 = Math.asin(0.5);
    sc.sheet({ u0: 0, u1: TAU, v0: th0, v1: Math.PI, eval(u, v, o) { o[0] = Math.sin(v) * Math.cos(u); o[1] = Math.sin(v) * Math.sin(u); o[2] = Math.cos(v); } }, { dens: 4.2, thick: 0.012, c: (u, v) => 0.7 + 0.04 * Math.sin(u * 7 + v * 5) });
    const iris: ParamSurface = { u0: 0, u1: TAU, v0: 0, v1: 1, eval(u, v, o) { const r = 0.17 + v * 0.33, z = Math.sqrt(Math.max(0, 1 - r * r)) - 0.045 - 0.06 * (1 - v); o[0] = r * Math.cos(u); o[1] = r * Math.sin(u); o[2] = z; } };
    sc.sheet(iris, { dens: 5, thick: 0.01, c: (u, v) => { const f = 0.5 + 0.5 * Math.sin(u * 58 + 3 * vnoise(u * 3, v * 9, 1)), ring = sstep(0.35, 0.42, v) * (1 - sstep(0.46, 0.55, v)); const limb = sstep(0.86, 0.98, v); return 0.3 + 0.18 * f + 0.2 * v + 0.12 * ring - 0.2 * limb - 0.1 * (1 - sstep(0.0, 0.2, v)); } });
    sc.sheet({ u0: 0, u1: TAU, v0: 0, v1: 1, eval(u, v, o) { const r = v * 0.19; o[0] = r * Math.cos(u); o[1] = r * Math.sin(u); o[2] = 0.86 + 0.12 * v * v - 0.14; } }, { dens: 4, thick: 0.01, c: 0.0 });
    const cc = 0.4788, R = 0.641, cap = 0.9456;
    sc.sheet({ u0: 0, u1: TAU, v0: 0, v1: cap, eval(u, v, o) { o[0] = R * Math.sin(v) * Math.cos(u); o[1] = R * Math.sin(v) * Math.sin(u); o[2] = cc + R * Math.cos(v); } }, { dens: 2.0, thick: 0.01, c: 0.85, al: 0.32 });
    sc.points(0.08, (r, o) => { const a = r.next() * TAU, rr = 0.06 * Math.sqrt(r.next()); o[0] = 0.28 + rr * Math.cos(a); o[1] = 0.3 + rr * Math.sin(a); o[2] = cc + Math.sqrt(R * R - (0.28 + rr * Math.cos(a)) ** 2 - (0.3 + rr * Math.sin(a)) ** 2) + 0.004; o[3] = 0.3; o[4] = 0.3; o[5] = 0.9; o[6] = 1; });
    // blood vessels crawling on the sclera
    const lines: V3[][] = [];
    for (let i = 0; i < 70; i++) {
      let p: V3 = norm3([rng.range(-1, 1), rng.range(-1, 1), rng.range(-0.55, 0.35)]), d: V3 = norm3([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]); const line: V3[] = [];
      if (p[2] > 0.5 && Math.hypot(p[0], p[1]) < 0.55) continue;
      for (let j = 0; j < 14; j++) { line.push([p[0] * 1.012, p[1] * 1.012, p[2] * 1.012]); const w: V3 = norm3(cross3(p, d)); d = norm3([d[0] + (rng.next() - 0.5) * 0.45 - p[0] * 0.0, d[1] + (rng.next() - 0.5) * 0.45, d[2] + (rng.next() - 0.5) * 0.45 - 0.08]); p = norm3([p[0] + (d[0] - p[0] * (p[0] * d[0] + p[1] * d[1] + p[2] * d[2])) * 0.09 + w[0] * 0, p[1] + (d[1] - p[1] * (p[0] * d[0] + p[1] * d[1] + p[2] * d[2])) * 0.09, p[2] + (d[2] - p[2] * (p[0] * d[0] + p[1] * d[1] + p[2] * d[2])) * 0.09]); }
      lines.push(line);
    }
    sc.strands(lines, { r: 0.0042, dens: 1.5, c0: 0.17, c1: 0.15, taper: true });
    const s = sc.solid(0.04);
    s.tube([[0, 0, -1.0], [0.05, -0.1, -1.5], [0.0, -0.2, -2.2]], [0.17, 0.15, 0.14], { seg: 10, c: 0.66, k: 0.02 });
    s.shade = (x, y, z, _nx, _ny, _nz, t) => t + 0.05 * (vnoise(x * 12, y * 12, z * 12) - 0.5) * detail;
    void mixn;
  },
});

/* ───────────── Lungs & airways ───────────── */
function bronchi(rng: Rng, root: V3, dir: V3, len: number, depth: number, out: V3[][], spread: number) {
  const tip: V3 = [root[0] + dir[0] * len, root[1] + dir[1] * len, root[2] + dir[2] * len], mid: V3 = [(root[0] + tip[0]) / 2 + (rng.next() - 0.5) * len * 0.12, (root[1] + tip[1]) / 2 + (rng.next() - 0.5) * len * 0.12, (root[2] + tip[2]) / 2 + (rng.next() - 0.5) * len * 0.12];
  out.push([root, mid, tip]);
  if (depth <= 0) return;
  for (let i = 0; i < 2; i++) {
    const sg = i === 0 ? 1 : -1, d: V3 = norm3([dir[0] + sg * spread * (rng.next() * 0.6 + 0.5) + (rng.next() - 0.5) * 0.2, dir[1] - 0.15 + (rng.next() - 0.5) * 0.25, dir[2] + (rng.next() - 0.5) * spread * 1.2]);
    bronchi(rng, tip, d, len * (0.68 + rng.next() * 0.1), depth - 1, out, spread);
  }
}
export const lungs = defineShape({
  id: "body-lungs", name: "Lungs & Bronchial Tree", tag: ANAT,
  description: "Both lungs with their lobes and fissures, the trachea with cartilage rings and a branching bronchial tree glowing through the tissue.",
  palette: [[0, "#14060f"], [0.28, "#7a2448"], [0.5, "#d9667a"], [0.72, "#ffb8b0"], [0.9, "#fff2e6"], [1, "#ffffff"]],
  count: 120000, size: 0.0052, fit: 1.4, camera: { distance: 5.2, yaw: 0.3, pitch: 0.1, autoRotate: 0.08 }, look: { glow: 0.6 },
  deformers: [{ type: "breathe", amount: 0.05, speed: 0.8 }],
  build(sc, { detail }) {
    const rng = sc.rng, s = sc.solid(0.04), lung = 0.42;
    // left lung (viewer's right) with cardiac notch
    s.ell([0.72, 0.5, 0], [0.44, 0.66, 0.34], { rot: [0, 0, -0.08], c: lung, k: 0.015 });
    s.ell([0.62, -0.3, 0], [0.44, 0.62, 0.36], { rot: [0, 0, -0.05], c: lung + 0.04, k: 0.015 });
    // right lung with three lobes
    s.ell([-0.72, 0.52, 0], [0.44, 0.6, 0.34], { rot: [0, 0, 0.08], c: lung, k: 0.015 });
    s.ell([-0.76, 0.0, 0.1], [0.4, 0.26, 0.3], { c: lung + 0.06, k: 0.015 });
    s.ell([-0.66, -0.4, -0.02], [0.46, 0.62, 0.38], { rot: [0, 0, 0.04], c: lung + 0.02, k: 0.015 });
    // trachea + main bronchi
    const tr = s.tube([[0, 1.9, 0], [0, 1.2, 0], [0, 0.72, 0]], [0.12, 0.12, 0.12], { seg: 14, c: 0.7, k: 0.03 });
    void tr;
    s.tube([[0, 0.72, 0], [0.22, 0.52, 0], [0.5, 0.34, 0]], [0.1, 0.085, 0.07], { seg: 10, c: 0.7, k: 0.03 });
    s.tube([[0, 0.72, 0], [-0.22, 0.54, 0], [-0.5, 0.38, 0]], [0.1, 0.085, 0.07], { seg: 10, c: 0.7, k: 0.03 });
    s.disp = (x, y, z) => (y > 0.7 && Math.abs(x) < 0.2 ? 0.012 * Math.sin(y * 42) : 0) + 0.01 * (vnoise(x * 7, y * 7, z * 7) - 0.5) * (0.5 + detail) + (y < 0.9 ? 0.01 * (vnoise(x * 18, y * 18, z * 18) - 0.5) : 0);
    s.shade = (x, y, z, _nx, ny, _nz, t) => (y > 0.7 && Math.abs(x) < 0.2 ? 0.9 : t + 0.1 * (vnoise(x * 6, y * 6, z * 6) - 0.5) - 0.04 * Math.max(0, ny));
    // bronchial tree glowing inside the lungs
    const lines: V3[][] = [];
    bronchi(rng, [0.5, 0.34, 0], norm3([0.5, -0.2, 0]), 0.2, 6, lines, 0.4);
    bronchi(rng, [-0.5, 0.38, 0], norm3([-0.5, -0.2, 0]), 0.2, 6, lines, 0.4);
    sc.strands(lines, { r: 0.0065, dens: 2.2, c0: 0.95, c1: 0.8, taper: true, al: 0.9 });
    sc.strands([[[0, 1.9, 0], [0, 0.72, 0]]], { r: 0.02, dens: 3, c0: 0.95, c1: 0.95 });
  },
});

/* ───────────── Rib cage ───────────── */
export const ribcage = defineShape({
  id: "body-ribcage", name: "Rib Cage", tag: ANAT, heavy: true,
  description: "A human thoracic skeleton: twelve pairs of ribs curving from the spine, costal cartilage to the sternum, clavicles and the thoracic vertebrae.",
  palette: [[0, "#1a120a"], [0.28, "#7a6844"], [0.58, "#d6c69c"], [0.84, "#f3ead2"], [1, "#fffdf3"]],
  count: 80000, size: 0.0052, fit: 1.4, camera: { distance: 5.2, yaw: -0.4, pitch: 0.12, autoRotate: 0.08 },
  build(sc) {
    const s = sc.solid(0.012);
    for (let i = 0; i < 12; i++) {
      const y = 1.0 - i * 0.145, a = 0.46 + 0.5 * Math.sin(Math.min(1, (i + 1.2) / 8.4) * 1.3) * (i > 8 ? 0.82 : 1), b = 0.34 + 0.12 * Math.sin(Math.min(1, (i + 1) / 7) * 1.2), pts: V3[] = [], rad: number[] = [];
      const last = i < 7 ? 0.84 : i < 10 ? 0.7 : 0.4;
      for (let j = 0; j <= 18; j++) {
        const t = j / 18, ph = 0.04 + t * Math.PI * (i < 10 ? 0.93 : 0.62) * (i < 10 ? 1 : 1), slope = -0.34 * Math.pow(t, 1.3) * (1 + i * 0.05);
        pts.push([a * Math.sin(ph) * (1 - 0.1 * Math.pow(t, 3)), y + slope - 0.06 * (1 - t) * (i + 1) * 0.1 * 0 + 0.07 * Math.sin(t * Math.PI) * 0, -b * Math.cos(ph) * (i < 10 ? 1 : 1) - 0.0]);
        rad.push(0.026 - 0.004 * Math.sin(t * Math.PI) + (t > last ? 0.004 : 0));
      }
      const mk = (sg: number) => pts.map((p): V3 => [p[0] * sg, p[1], p[2]]);
      s.tube(mk(1), rad, { seg: 18, c: 0.55, k: 0.01 }); s.tube(mk(-1), rad, { seg: 18, c: 0.55, k: 0.01 });
      if (i < 10) { const cut = Math.floor(last * 18); for (const sg of [1, -1]) s.tube(mk(sg).slice(cut), rad.slice(cut).map((r) => r * 1.0), { seg: 5, c: 0.85, k: 0.01 }); }
    }
    // sternum (manubrium, body, xiphoid)
    s.ell([0, 0.78, 0.42], [0.14, 0.12, 0.035], { c: 0.8, k: 0.02 });
    s.ell([0, 0.3, 0.44], [0.065, 0.42, 0.03], { c: 0.8, k: 0.02 });
    s.cone([0, -0.12, 0.45], [0, -0.3, 0.46], 0.035, 0.008, { c: 0.8, k: 0.01 });
    // clavicles
    for (const sg of [1, -1]) s.tube([[0.1 * sg, 0.84, 0.42], [0.45 * sg, 0.9, 0.35], [0.85 * sg, 0.88, 0.1], [1.0 * sg, 0.84, -0.12]], [0.03, 0.026, 0.026, 0.03], { seg: 16, c: 0.6, k: 0.012 });
    // thoracic vertebrae
    for (let i = 0; i < 12; i++) {
      const y = 1.0 - i * 0.145 + 0.01, sz = 0.9 + 0.012 * i * 3, z = -0.34 - 0.12 * Math.sin(Math.min(1, (i + 1) / 7) * 1.2) - 0.0;
      s.ell([0, y, z - 0.0], [0.07 * sz, 0.05, 0.07 * sz], { c: 0.65, k: 0.01 });
      s.cone([0, y + 0.02, z - 0.05], [0, y - 0.05, z - 0.3], 0.03, 0.008, { c: 0.6, k: 0.01 });
      s.cone([0.06, y, z - 0.02], [0.2, y + 0.01, z - 0.06], 0.025, 0.012, { sym: "x", c: 0.6, k: 0.01 });
    }
    void norm3;
  },
});

/* ───────────── Spine ───────────── */
export const spine = defineShape({
  id: "body-spine", name: "Vertebral Column", tag: ANAT,
  description: "The human spine with its natural S-curve: cervical, thoracic and lumbar vertebrae with spinous and transverse processes, intervertebral discs, sacrum and coccyx.",
  palette: [[0, "#1a120a"], [0.25, "#6a5a3c"], [0.5, "#c8b78e"], [0.76, "#efe3c5"], [1, "#fffbea"]],
  count: 80000, size: 0.0054, fit: 1.4, camera: { distance: 5.6, yaw: 0.2, pitch: 0.05, autoRotate: 0.09 },
  build(sc) {
    const s = sc.solid(0.01);
    const centre: V3[] = [[0.0, 2.1, 0.0], [-0.1, 1.5, 0.0], [0.0, 0.8, 0.0], [0.12, 0.0, 0.0], [0.0, -0.8, 0.0], [-0.14, -1.45, 0.0], [-0.32, -1.9, 0.0]];
    const C = splinePoints(centre, 200), N = 24;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), idx = Math.min(199, Math.round((0.0 + t * 0.78) * 200)), p = C[idx], q = C[Math.min(199, idx + 3)], tg = norm3([q[0] - p[0], q[1] - p[1], 0]);
      const size = i < 7 ? 0.62 + 0.03 * i : i < 19 ? 0.8 + 0.03 * (i - 7) : 1.18, a: V3 = [-tg[1], tg[0], 0], z: V3 = [0, 0, 1], bz = (v: V3, u: number, w: number, k: number): V3 => [p[0] + v[0] * u + a[0] * w + 0 * k, p[1] + v[1] * u + a[1] * w, z[2] * k];
      void bz;
      const ax: V3 = [-tg[1], tg[0], 0]; // anterior-facing axis (+x side for a rightward tangent)
      const along = (n: number, f: number, g: number): V3 => [p[0] + ax[0] * n + tg[0] * f, p[1] + ax[1] * n + tg[1] * f, g];
      s.ell(p, [0.05 * size, 0.17 * size, 0.15 * size], { dir: tg, up: [0, 0, 1], c: 0.55 + 0.1 * (i % 2), k: 0.01 });
      s.ell(along(0, 0.075 * size, 0), [0.012, 0.15 * size, 0.13 * size], { dir: tg, up: [0, 0, 1], c: 0.25, k: 0.006 });   // disc below
      s.tube([along(-0.1 * size, 0, 0.12 * size), along(-0.22 * size, 0.01, 0.12 * size), along(-0.3 * size, 0.0, 0.0), along(-0.22 * size, 0.01, -0.12 * size), along(-0.1 * size, 0, -0.12 * size)], [0.028 * size, 0.026 * size, 0.026 * size, 0.026 * size, 0.028 * size], { seg: 10, c: 0.6, k: 0.01 });
      s.cone(along(-0.3 * size, 0, 0), along(-0.55 * size, -0.12 * size, 0), 0.035 * size, 0.009, { c: 0.6, k: 0.01 });
      s.cone(along(-0.2 * size, 0, 0.1 * size), along(-0.24 * size, 0.02, 0.38 * size), 0.028 * size, 0.012, { sym: "z", c: 0.6, k: 0.01 });
      s.cone(along(-0.2 * size, 0.0, 0.1 * size), along(-0.3 * size, 0.1 * size, 0.18 * size), 0.02 * size, 0.01, { sym: "z", c: 0.6, k: 0.01 });
    }
    // sacrum + coccyx
    const sp = C[Math.min(199, Math.round(0.82 * 200))], sc2 = C[199];
    s.ell([sp[0] - 0.02, sp[1] - 0.2, 0], [0.12, 0.36, 0.3], { rot: [0, 0, 0.18], c: 0.6, k: 0.03 });
    s.cone([sc2[0] - 0.04, sc2[1] + 0.05, 0], [sc2[0] - 0.18, sc2[1] - 0.18, 0], 0.07, 0.015, { c: 0.55, k: 0.02 });
    s.ell([sp[0] + 0.0, sp[1] - 0.08, 0.3], [0.1, 0.3, 0.08], { sym: "z", c: 0.6, k: 0.03 });
    void cross3; void mixn;
  },
});

/* ───────────── Neuron ───────────── */
function dendrite(rng: Rng, p: V3, d: V3, len: number, depth: number, out: Array<{ line: V3[]; depth: number }>) {
  const pts: V3[] = [p]; let q = p, dd = d;
  for (let i = 0; i < 4; i++) { dd = norm3([dd[0] + (rng.next() - 0.5) * 0.5, dd[1] + (rng.next() - 0.5) * 0.5, dd[2] + (rng.next() - 0.5) * 0.5]); q = [q[0] + dd[0] * len / 4, q[1] + dd[1] * len / 4, q[2] + dd[2] * len / 4]; pts.push(q); }
  out.push({ line: pts, depth });
  if (depth <= 0) return;
  const n = rng.next() < 0.3 ? 3 : 2;
  for (let i = 0; i < n; i++) dendrite(rng, q, norm3([dd[0] + (rng.next() - 0.5) * 1.4, dd[1] + (rng.next() - 0.5) * 1.4, dd[2] + (rng.next() - 0.5) * 1.4]), len * (0.66 + rng.next() * 0.15), depth - 1, out);
}
export const neuron = defineShape({
  id: "body-neuron", name: "Neuron", tag: ANAT,
  description: "A pyramidal neuron: soma with nucleus, a forest of branching dendrites with spines, a long axon wrapped in myelin sheaths and branching synaptic terminals.",
  palette: [[0, "#100628"], [0.28, "#5a2ad8"], [0.52, "#2fb0ff"], [0.78, "#7dffd2"], [1, "#ffffff"]],
  count: 110000, size: 0.0054, fit: 1.4, camera: { distance: 6.0, yaw: 0.4, pitch: 0.1, autoRotate: 0.09 }, look: { glow: 1.0 },
  build(sc) {
    const rng = sc.rng, s = sc.solid(0.05);
    s.cone([0, 0.45, 0], [0, -0.12, 0], 0.02, 0.3, { c: 0.4, k: 0.06 });
    s.ell([0, 0.12, 0], [0.34, 0.34, 0.3], { c: 0.45, k: 0.08 });
    s.sph([0.03, 0.14, 0.02], 0.14, { c: 0.9, k: 0.02, al: 0.9, sz: 1.2 });
    const dl: Array<{ line: V3[]; depth: number }> = [];
    dendrite(rng, [0, 0.45, 0], [0, 1, 0], 1.3, 3, dl);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.3; dendrite(rng, [0.22 * Math.cos(a), 0.08 + 0.05 * Math.sin(a * 3), 0.2 * Math.sin(a)], norm3([Math.cos(a), 0.2, Math.sin(a)]), 0.65, 3, dl); }
    for (let d = 0; d <= 3; d++) sc.strands(dl.filter((x) => x.depth === d).map((x) => x.line), { r: 0.012 + 0.012 * d, dens: 1.1, c0: 0.4 + 0.1 * (3 - d), c1: 0.6, taper: true });
    sc.points(0.5, (r, o) => { const seg = dl[Math.floor(r.next() * dl.length)], k = r.next() * (seg.line.length - 1), i = Math.min(seg.line.length - 2, Math.floor(k)), f = k - i, a = seg.line[i], b = seg.line[i + 1], j = 0.03; o[0] = a[0] + (b[0] - a[0]) * f + (r.next() - 0.5) * j; o[1] = a[1] + (b[1] - a[1]) * f + (r.next() - 0.5) * j; o[2] = a[2] + (b[2] - a[2]) * f + (r.next() - 0.5) * j; o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0.95; });
    // axon with myelin
    const ax: V3[] = [[0, -0.12, 0], [0.05, -0.7, 0.05], [-0.1, -1.4, 0.1], [0.1, -2.1, -0.05], [0.0, -2.8, 0.0], [-0.1, -3.4, 0.1]];
    const A = splinePoints(ax, 120);
    sc.strands([A], { r: 0.012, dens: 2, c0: 0.55, c1: 0.55 });
    const my = sc.solid(0.01);
    for (let i = 0; i < 6; i++) { const idx = 18 + i * 17, p = A[idx], q = A[Math.min(119, idx + 4)], tg = norm3([q[0] - p[0], q[1] - p[1], q[2] - p[2]]); my.ell([p[0] + tg[0] * 0.17, p[1] + tg[1] * 0.17, p[2] + tg[2] * 0.17], [0.18, 0.055, 0.055], { dir: tg, up: [1, 0, 0], c: 0.82, k: 0.01, al: 0.9 }); }
    // terminals
    const end = A[119], term: V3[][] = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; const p1: V3 = [end[0] + 0.22 * Math.cos(a), end[1] - 0.18, end[2] + 0.22 * Math.sin(a)], p2: V3 = [end[0] + 0.45 * Math.cos(a + 0.2), end[1] - 0.32, end[2] + 0.45 * Math.sin(a + 0.2)]; term.push([end, p1, p2]); s.sph(p2, 0.05, { c: 0.95, k: 0.01, sz: 1.2 }); }
    sc.strands(term, { r: 0.01, dens: 2, c0: 0.6, c1: 0.7, taper: true });
  },
});

/* ───────────── Bacteriophage ───────────── */
export const phage = defineShape({
  id: "body-virus", name: "Bacteriophage", tag: ANAT,
  description: "A T4 bacteriophage: elongated icosahedral head packed with coiled DNA, collar, ribbed contractile tail sheath, hexagonal base plate and six bent tail fibres.",
  palette: [[0, "#050c24"], [0.28, "#1b4fb8"], [0.5, "#34c4ff"], [0.76, "#b9ffe2"], [1, "#ffffff"]],
  count: 100000, size: 0.0054, fit: 1.4, camera: { distance: 5.4, yaw: 0.4, pitch: 0.1, autoRotate: 0.09 }, look: { glow: 0.9 },
  build(sc) {
    const phi = (1 + Math.sqrt(5)) / 2, st = 1.45, base: V3[] = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) { base.push([0, a, b * phi], [a, b * phi, 0], [b * phi, 0, a]); }
    const V = base.map((v): V3 => { const n = Math.hypot(v[0], v[1], v[2]); return [(v[0] / n) * 0.62, (v[1] / n) * 0.62 * st + 1.6, (v[2] / n) * 0.62]; });
    const faces: Array<[number, number, number]> = [];
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
      const e = (a: number, b: number) => Math.hypot(base[a][0] - base[b][0], base[a][1] - base[b][1], base[a][2] - base[b][2]);
      if (Math.abs(e(i, j) - 2) < 0.01 && Math.abs(e(j, k) - 2) < 0.01 && Math.abs(e(i, k) - 2) < 0.01) faces.push([i, j, k]);
    }
    const edges: V3[][] = [];
    for (const [a, b, c] of faces) { sc.sheet(tri(V[a], V[b], V[c]), { dens: 0.8, thick: 0.01, c: 0.45, al: 0.55 }); edges.push([V[a], V[b]], [V[b], V[c]], [V[c], V[a]]); }
    sc.strands(edges, { r: 0.012, dens: 3, c0: 0.82, c1: 0.82 });
    // DNA coil inside the head
    const dna: V3[] = []; for (let i = 0; i <= 600; i++) { const t = i / 600, a = t * TAU * 14, r = 0.36 * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.6 * (0.55 + 0.45 * Math.cos(t * 30)); dna.push([r * Math.cos(a), 1.6 + (t - 0.5) * 1.0, r * Math.sin(a)]); }
    sc.strands([dna], { r: 0.0048, dens: 1.0, c0: 0.62, c1: 0.62, al: 0.9 });
    const s = sc.solid(0.02);
    s.tube([[0, 0.85, 0], [0, 0.7, 0]], [0.2, 0.2], { seg: 4, c: 0.7, k: 0.02 });
    s.tube([[0, 0.7, 0], [0, -0.7, 0]], [0.16, 0.16], { seg: 6, c: 0.55, k: 0.02 });
    s.disp = (x, y) => (y < 0.65 && y > -0.65 ? 0.016 * Math.sin(y * 70) : 0) + (0 * x);
    s.ell([0, 0.78, 0], [0.26, 0.035, 0.26], { c: 0.85, k: 0.01 });
    s.ell([0, -0.8, 0], [0.3, 0.07, 0.3], { c: 0.75, k: 0.02 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3, ca = Math.cos(a), sa = Math.sin(a); s.cone([0.2 * ca, -0.84, 0.2 * sa], [0.28 * ca, -1.22, 0.28 * sa], 0.022, 0.006, { c: 0.9, k: 0.006 }); }
    sc.strands(Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * TAU + 0.3, ca = Math.cos(a), sa = Math.sin(a); return [[0.3 * ca, -0.8, 0.3 * sa], [0.78 * ca, -0.55, 0.78 * sa], [1.08 * ca, -0.95, 1.08 * sa], [1.5 * ca, -1.15, 1.5 * sa]] as V3[]; }), { r: 0.014, dens: 2.2, c0: 0.7, c1: 0.5, taper: true });
    void norm3;
  },
});

/* ───────────── Molar tooth ───────────── */
export const tooth = defineShape({
  id: "body-tooth", name: "Molar Tooth", tag: ANAT,
  description: "A human molar: enamel crown with four cusps and a central fissure, a neck, two tapering roots and a glowing pulp canal inside.",
  palette: [[0, "#2a1a0a"], [0.25, "#a8803a"], [0.5, "#e8d6a0"], [0.75, "#fbf7e6"], [1, "#ffffff"]],
  count: 90000, size: 0.0056, fit: 1.3, camera: { distance: 4.4, yaw: 0.5, pitch: 0.12, autoRotate: 0.1 },
  build(sc, { detail }) {
    const s = sc.solid(0.05);
    s.ell([0, 0.5, 0], [0.62, 0.42, 0.58], { c: 0.88, k: 0.1 });
    for (const [x, z] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]] as const) s.ell([x, 0.84, z], [0.26, 0.17, 0.26], { c: 0.95, k: 0.04 });
    s.ell([0, 0.02, 0], [0.5, 0.3, 0.46], { c: 0.62, k: 0.1 });
    s.tube([[0.25, -0.1, 0.05], [0.3, -0.7, 0.08], [0.2, -1.35, 0.04], [0.14, -1.7, 0.02]], [0.22, 0.17, 0.1, 0.02], { seg: 18, c: 0.5, k: 0.05 });
    s.tube([[-0.25, -0.1, -0.05], [-0.32, -0.7, -0.1], [-0.2, -1.3, -0.04], [-0.1, -1.62, -0.02]], [0.22, 0.17, 0.1, 0.02], { seg: 18, c: 0.48, k: 0.05 });
    s.disp = (x, y, z) => y > 0.7 ? 0.012 * (vnoise(x * 6, y * 6, z * 6) - 0.5) : 0.01 * (vnoise(x * 18, y * 5, z * 18) - 0.5) * (0.5 + detail);
    s.shade = (x, y, z, _nx, ny, _nz, t) => (y > 0.18 ? t + 0.05 * (vnoise(x * 9, y * 9, z * 9) - 0.5) : 0.46 + 0.1 * (vnoise(x * 9, y * 9, z * 9) - 0.5)) - 0.03 * Math.max(0, ny);
    // pulp chamber and root canals glowing through
    sc.strands([[[0, 0.6, 0], [0, 0.2, 0], [0.22, -0.4, 0.06], [0.18, -1.3, 0.04]], [[0, 0.2, 0], [-0.24, -0.4, -0.08], [-0.14, -1.28, -0.03]], [[0, 0.7, 0], [0.2, 0.9, 0.2]], [[0, 0.7, 0], [-0.2, 0.9, -0.2]]], { r: 0.035, dens: 1.2, c0: 0.1, c1: 0.2, taper: true, al: 0.8 });
  },
});

export const ANATOMY2_SHAPES: GeneratorDef[] = [heart, eye, lungs, ribcage, spine, neuron, phage, tooth];
