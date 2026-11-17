import type { GeneratorDef } from "../types";
import { vnoise, type Rng } from "../math";
import { defineShape, norm3, splinePoints, ringLine, type Scene, type V3 } from "./sculpt";
import { PLANT, petal } from "./plants";

const TAU = Math.PI * 2;
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/* ───────────── Pine / fir tree ───────────── */
export const pine = defineShape({
  id: "plant-pine", name: "Pine Tree", tag: PLANT,
  description: "A conifer with a straight trunk and whorls of drooping branches, each bearing dense needles, graduating from broad skirts to a narrow crown, with hanging cones.",
  palette: [[0, "#120a05"], [0.18, "#4a2f18"], [0.35, "#0d4228"], [0.6, "#26884a"], [0.85, "#96dc9c"], [1, "#f4fff0"]],
  count: 130000, size: 0.0052, fit: 1.4, camera: { distance: 6.0, yaw: 0.3, pitch: 0.1, autoRotate: 0.08 },
  build(sc) {
    const rng = sc.rng, s = sc.solid(0.03), H = 3.6;
    s.tube([[0, -0.1, 0], [0.01, 1.2, 0], [0, 2.6, 0.01], [0, H, 0]], [0.14, 0.09, 0.05, 0.01], { seg: 22, c: 0.2, k: 0.02 });
    s.shade = (x, y, z, _nx, _ny, _nz, t) => t + 0.1 * (vnoise(x * 18, y * 6, z * 18) - 0.5);
    const branches: V3[][] = [], needles: V3[][] = [];
    const tiers = 24;
    for (let i = 0; i < tiers; i++) {
      const y = 0.45 + (i / (tiers - 1)) * (H - 0.6), f = 1 - (y - 0.3) / (H - 0.1), L = 0.2 + 1.25 * Math.pow(Math.max(0, f), 0.85), n = Math.max(5, Math.round(5 + 7 * f)), off = rng.next() * TAU;
      for (let k = 0; k < n; k++) {
        const a = off + (k / n) * TAU + rng.range(-0.15, 0.15), out: V3 = [Math.cos(a), 0, Math.sin(a)], side: V3 = [-Math.sin(a), 0, Math.cos(a)], len = L * rng.range(0.82, 1.1), root: V3 = [0, y + rng.range(-0.05, 0.05), 0];
        const pts: V3[] = []; for (let j = 0; j <= 5; j++) { const t = j / 5; pts.push([root[0] + out[0] * len * t, root[1] + 0.12 * len * Math.sin(t * 2.2) - 0.28 * len * t * t + 0.0, root[2] + out[2] * len * t]); }
        branches.push(pts);
        const lay = (p: V3, d: V3, l: number, nn: number) => { for (let q = 0; q < nn; q++) { const sg = q % 2 ? 1 : -1, dir = norm3([d[0] * 0.55 + side[0] * sg * 0.8, -0.35 + d[1] * 0.2 + rng.range(-0.1, 0.2), d[2] * 0.55 + side[2] * sg * 0.8]); needles.push([add(p, dir, 0.0), add(p, dir, l * (0.75 + 0.5 * rng.next()))]); } };
        for (let j = 1; j <= 5; j++) { const p = pts[j]; lay(p, out, 0.11, 6); }
        for (let sb = 0; sb < 6; sb++) {
          const t = 0.25 + 0.7 * (sb / 6), p = pts[Math.min(5, Math.floor(t * 5))], sg = sb % 2 ? 1 : -1, tl = len * 0.3 * (1.05 - t), td = norm3([out[0] * 0.6 + side[0] * sg, -0.28, out[2] * 0.6 + side[2] * sg]);
          const tw: V3[] = [p, add(p, td, tl * 0.5), add(p, td, tl)]; branches.push(tw);
          for (let q = 0; q < 8; q++) { const tt = 0.15 + q / 9, pp = add(p, td, tl * tt), sg2 = q % 2 ? 1 : -1; needles.push([pp, add(pp, norm3([td[0] + side[0] * sg2 * 0.6, -0.4 + rng.range(-0.1, 0.1), td[2] + side[2] * sg2 * 0.6]), 0.1 * (1.1 - tt))]); }
        }
      }
    }
    sc.strands(branches, { r: 0.0075, dens: 1.2, c0: 0.22, c1: 0.3, taper: true });
    sc.strands(needles, { r: 0.0042, dens: 0.55, c0: 0.4, c1: 0.78 });
    for (let i = 0; i < 12; i++) { const a = rng.next() * TAU, y = 0.8 + rng.next() * 2, r = 0.2 + 0.8 * (1 - y / H) * rng.next(), p: V3 = [Math.cos(a) * r, y, Math.sin(a) * r]; s.ell([p[0], p[1] - 0.1, p[2]], [0.05, 0.12, 0.05], { c: 0.16, k: 0.01 }); }
    sc.points(0.4, (r, o) => { const a = r.next() * TAU, rr = 1.4 * r.next(); o[0] = rr * Math.cos(a); o[1] = -0.05; o[2] = rr * Math.sin(a); o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0.95; });
  },
});

/* ───────────── Palm tree ───────────── */
export const palm = defineShape({
  id: "plant-palm", name: "Palm Tree", tag: PLANT,
  description: "A coconut palm on a sandy mound: gently curved ringed trunk, a crown of long arching pinnate fronds with drooping leaflets and a cluster of coconuts.",
  palette: [[0, "#120c05"], [0.15, "#5a3d1e"], [0.3, "#2c7a28"], [0.55, "#76c02a"], [0.78, "#e7d8a0"], [1, "#fff6d6"]],
  count: 120000, size: 0.0054, fit: 1.4, camera: { distance: 6.0, yaw: 0.35, pitch: 0.18, autoRotate: 0.08 },
  deformers: [{ type: "wave", amount: 0.025, scale: 0.8, speed: 0.6, axis: "y" }],
  build(sc) {
    const rng = sc.rng, s = sc.solid(0.03), trunk: V3[] = [[0, 0, 0], [0.18, 1.0, 0.0], [0.5, 2.0, 0.02], [0.62, 3.0, 0.0]], tr = [0.2, 0.15, 0.13, 0.12];
    s.tube(trunk, tr, { seg: 30, c: 0.2, k: 0.02 });
    s.ell([0, -0.1, 0], [1.7, 0.14, 1.7], { c: 0.84, k: 0.05 });
    const sp = splinePoints(trunk, 60);
    s.disp = (x, y) => (y > 0.2 && y < 3.0 ? 0.018 * Math.max(0, Math.sin(y * 34)) : 0) + 0 * x;
    s.shade = (x, y, z, _nx, _ny, _nz, t) => (y < 0.0 ? 0.84 + 0.05 * (vnoise(x * 12, 0, z * 12) - 0.5) : t + 0.1 * (vnoise(x * 20, y * 5, z * 20) - 0.5));
    const top = sp[59], fronds = 13, rach: V3[][] = [], leaflets: V3[][] = [];
    for (let k = 0; k < fronds; k++) {
      const a = (k / fronds) * TAU + rng.range(-0.1, 0.1), out: V3 = [Math.cos(a), 0, Math.sin(a)], side: V3 = [-Math.sin(a), 0, Math.cos(a)], L = rng.range(1.5, 1.95), rise = rng.range(0.55, 0.95), pts: V3[] = [];
      for (let j = 0; j <= 16; j++) { const t = j / 16; pts.push([top[0] + out[0] * L * t, top[1] + 0.05 + rise * Math.sin(t * 2.0) * 0.85 - 0.75 * L * t * t * (0.3 + 0.7 * t) * 0.9, top[2] + out[2] * L * t]); }
      rach.push(pts);
      for (let j = 2; j <= 16; j++) {
        const t = j / 16, p = pts[j], q = pts[Math.min(16, j + 1)], tg = norm3([q[0] - p[0], q[1] - p[1], q[2] - p[2]]), ll = 0.62 * Math.sin(Math.PI * (0.1 + 0.9 * t)) ** 0.7 + 0.08;
        for (let m = 0; m < 3; m++) for (const sg of [1, -1]) {
          const f = (m + 0.5) / 3, base = add(p, tg, 0.0 + f * (L / 16)), dir = norm3([tg[0] * 0.55 + side[0] * sg * 0.9, tg[1] * 0.55 - 0.55 - 0.25 * t, tg[2] * 0.55 + side[2] * sg * 0.9]);
          leaflets.push([base, add(base, dir, ll * 0.5 + (add(base, dir, 0)[1] * 0)), add(add(base, dir, ll), [0, -0.12 * ll, 0])]);
        }
      }
    }
    sc.strands(rach, { r: 0.016, dens: 1.5, c0: 0.3, c1: 0.4, taper: true });
    sc.strands(leaflets, { r: 0.0045, dens: 0.7, c0: 0.42, c1: 0.62, taper: true });
    for (let i = 0; i < 7; i++) { const a = i * 2.4; s.sph([top[0] + 0.14 * Math.cos(a), top[1] - 0.12 - 0.06 * (i % 2), top[2] + 0.14 * Math.sin(a)], 0.1, { c: 0.1, k: 0.02 }); }
    sc.strands([ringLine(2.1, -0.05, 160, (a) => 0.04 * Math.sin(a * 7))], { r: 0.008, dens: 1.2, c0: 0.8, c1: 0.8, al: 0.5 });
  },
});

/* ───────────── Fly agaric mushrooms ───────────── */
function mushroom(sc: Scene, rng: Rng, off: V3, k: number, tilt: number) {
  const T = (p: V3): V3 => [off[0] + (p[0] * Math.cos(tilt) - p[1] * Math.sin(tilt)) * k, off[1] + (p[0] * Math.sin(tilt) + p[1] * Math.cos(tilt)) * k, off[2] + p[2] * k];
  const s = sc.solid(0.04);
  s.ell(T([0, 1.2, 0]), [0.85 * k, 0.5 * k, 0.85 * k], { c: 0.55, k: 0.03 });
  s.ell(T([0, 0.9, 0]), [0.74 * k, 0.4 * k, 0.74 * k], { neg: true, k: 0.02 });
  s.tube([T([0, 0, 0]), T([0.03, 0.5, 0]), T([0, 1.0, 0])], [0.22 * k, 0.14 * k, 0.12 * k], { seg: 12, c: 0.82, k: 0.04 });
  s.ell(T([0, 0.1, 0]), [0.3 * k, 0.2 * k, 0.3 * k], { c: 0.78, k: 0.05 });
  for (let i = 0; i < 70; i++) { const ph = Math.acos(1 - rng.next() * 0.95), th = rng.next() * TAU, w = (0.045 + 0.03 * rng.next()) * (1 - 0.4 * ph) * k; s.sph(T([0.865 * Math.sin(ph) * Math.cos(th), 1.2 + 0.505 * Math.cos(ph), 0.865 * Math.sin(ph) * Math.sin(th)]), w, { c: 0.8, k: 0.004 }); }
  const gills: V3[][] = []; for (let i = 0; i < 150; i++) { const a = (i / 150) * TAU; gills.push([T([0.14 * Math.cos(a), 0.96, 0.14 * Math.sin(a)]), T([0.72 * Math.cos(a), 0.92, 0.72 * Math.sin(a)])]); }
  sc.strands(gills, { r: 0.006 * k, dens: 2, c0: 0.78, c1: 0.74, taper: false });
  sc.sheet({ u0: 0, u1: TAU, v0: 0, v1: 1, eval(u, v, o) { const r = (0.13 + 0.3 * v) * (1 + 0.06 * Math.sin(u * 28) * v), p = T([r * Math.cos(u), 0.85 - 0.3 * Math.pow(v, 0.8), r * Math.sin(u)]); o[0] = p[0]; o[1] = p[1]; o[2] = p[2]; } }, { dens: 1.6 / Math.max(0.3, k), thick: 0.004, c: 0.82, al: 0.95 });
}
export const mushroom1 = defineShape({
  id: "plant-mushroom", name: "Fly Agaric Mushrooms", tag: PLANT,
  description: "A cluster of fly agaric toadstools: scarlet domed caps spotted with white warts, pale gills, a ringed skirt, bulbous stems and a moss and grass bed.",
  palette: [[0, "#120a05"], [0.12, "#2a6a22"], [0.25, "#5aa830"], [0.4, "#8a0f10"], [0.58, "#e0201c"], [0.78, "#f4ede0"], [1, "#ffffff"]],
  count: 110000, size: 0.0056, fit: 1.35, camera: { distance: 5.0, yaw: 0.3, pitch: 0.2, autoRotate: 0.09 },
  build(sc, { detail }) {
    const rng = sc.rng;
    mushroom(sc, rng, [0, 0, 0], 1, 0.0); mushroom(sc, rng, [-1.25, 0, 0.5], 0.55, 0.22); mushroom(sc, rng, [1.0, 0, -0.55], 0.4, -0.3);
    const g = sc.solid(0.06);
    g.ell([0, -0.08, 0], [2.0, 0.22, 1.7], { c: 0.22, k: 0.05 });
    g.shade = (x, y, z, _nx, _ny, _nz, t) => t + 0.12 * (vnoise(x * 9, y * 9, z * 9) - 0.5) * (0.6 + detail);
    const grass: V3[][] = []; for (let i = 0; i < 420; i++) { const a = rng.next() * TAU, r = 0.35 + 1.55 * Math.sqrt(rng.next()), x = r * Math.cos(a) * 1.0, z = r * Math.sin(a) * 0.85, h = 0.12 + 0.28 * rng.next(), bend = rng.range(-0.15, 0.15); grass.push([[x, 0.0, z], [x + bend * 0.5, h * 0.6, z], [x + bend, h, z + 0.04]]); }
    sc.strands(grass, { r: 0.006, dens: 0.8, c0: 0.2, c1: 0.38, taper: true });
  },
});

/* ───────────── Saguaro cactus ───────────── */
export const cactus = defineShape({
  id: "plant-cactus", name: "Saguaro Cactus", tag: PLANT,
  description: "A saguaro cactus with deeply ribbed columnar trunk and upturned arms, clusters of pale spines along every ridge and a pink flower crowning the top, on desert sand.",
  palette: [[0, "#0c1a0a"], [0.22, "#1f6a35"], [0.45, "#4aa851"], [0.66, "#a8d878"], [0.8, "#fff6c8"], [0.92, "#ff5aa0"], [1, "#ffe066"]],
  count: 120000, size: 0.0054, fit: 1.4, camera: { distance: 6.0, yaw: 0.3, pitch: 0.1, autoRotate: 0.08 },
  build(sc) {
    const rng = sc.rng, s = sc.solid(0.05), RIB = 14;
    const trunk: V3[] = [[0, 0, 0], [0, 1.1, 0], [0, 2.5, 0]], arm1: V3[] = [[0.2, 1.25, 0], [0.72, 1.32, 0], [0.98, 1.6, 0], [0.98, 2.3, 0]], arm2: V3[] = [[-0.2, 0.9, 0], [-0.68, 0.98, 0], [-0.9, 1.25, 0], [-0.9, 1.85, 0]];
    s.tube(trunk, [0.38, 0.36, 0.3], { seg: 22, c: 0.4, k: 0.04 }); s.sph([0, 2.5, 0], 0.3, { c: 0.4, k: 0.04 });
    s.tube(arm1, [0.2, 0.19, 0.18, 0.17], { seg: 20, c: 0.4, k: 0.04 }); s.sph([0.98, 2.3, 0], 0.17, { c: 0.4, k: 0.03 });
    s.tube(arm2, [0.18, 0.17, 0.16, 0.15], { seg: 18, c: 0.4, k: 0.04 }); s.sph([-0.9, 1.85, 0], 0.15, { c: 0.4, k: 0.03 });
    const axisX = (x: number, y: number) => (x > 0.55 && y > 1.2 ? 0.98 : x < -0.5 && y > 0.95 ? -0.9 : 0);
    const rib = (x: number, y: number, z: number) => Math.cos(Math.atan2(z, x - axisX(x, y)) * RIB);
    s.disp = (x, y, z) => -0.034 * (0.5 - 0.5 * rib(x, y, z)) + 0.006 * (vnoise(x * 20, y * 20, z * 20) - 0.5);
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.18 * (0.5 * rib(x, y, z) + 0.5 - 0.5) + 0.06 * (vnoise(x * 14, y * 14, z * 14) - 0.5) - 0.03 * Math.max(0, ny);
    const spines: V3[][] = [];
    const cluster = (c: V3, out: V3) => { for (let q = 0; q < 6; q++) { const a = (q / 6) * TAU, d = norm3([out[0] + 0.5 * Math.cos(a) * 0.5, out[1] + 0.5 * Math.sin(a), out[2] + 0.25 * Math.cos(a) * 0.4]); spines.push([c, add(c, d, 0.1 + 0.03 * rng.next())]); } };
    const ridge = (pts: V3[], r: number[], n: number) => { const P = splinePoints(pts, n * 4), R = splinePoints(r.map((v): V3 => [v, 0, 0]), n * 4); for (let i = 1; i < n * 4; i += 2) for (let k = 0; k < RIB; k++) { const a = ((k + 0.0) / RIB) * TAU, p = P[i], q = P[Math.min(n * 4, i + 1)], rr = R[i][0] + 0.003, tg = norm3([q[0] - p[0], q[1] - p[1], q[2] - p[2]]); if (Math.abs(tg[1]) < 0.5) continue; const out: V3 = [Math.cos(a), 0, Math.sin(a)]; cluster([p[0] + out[0] * rr, p[1], p[2] + out[2] * rr], out); } };
    ridge(trunk, [0.38, 0.36, 0.3], 24); ridge(arm1.slice(1), [0.19, 0.18, 0.17], 12); ridge(arm2.slice(1), [0.17, 0.16, 0.15], 10);
    sc.strands(spines, { r: 0.0036, dens: 0.35, c0: 0.74, c1: 0.8 });
    // flower on top
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, out: V3 = [Math.cos(a), 0, Math.sin(a)]; sc.sheet(petal([0.04 * out[0], 2.78, 0.04 * out[2]], add([0, 1, 0], out, 0.7), [-Math.sin(a), 0, Math.cos(a)], 0.26, 0.07, { cup: 0.3 }), { dens: 2, thick: 0.003, c: 0.9 + 0.03 * (k % 2) }); }
    s.sph([0, 2.8, 0], 0.045, { c: 1, k: 0.01 });
    const sand = sc.solid(0.05); sand.ell([0, -0.1, 0], [2.4, 0.13, 2.4], { c: 0.76, k: 0.05 });
    sand.shade = (x, _y, z, _nx, _ny, _nz, t) => t + 0.1 * Math.sin(x * 5 + z * 2 + 1.5 * vnoise(x * 2, 0, z * 2)) * 0.5;
  },
});

/* ───────────── Oak tree ───────────── */
export const oak = defineShape({
  id: "nature-tree", name: "Oak Tree", tag: PLANT,
  description: "A broad oak: buttressed roots, a thick fissured trunk dividing into spreading limbs, a recursive network of branches and a rounded canopy of leaf clusters.",
  palette: [[0, "#1c0f07"], [0.18, "#5a3a1c"], [0.36, "#2d6a22"], [0.58, "#5eaa2c"], [0.8, "#b0dc48"], [1, "#f4ffa8"]],
  count: 140000, size: 0.0052, fit: 1.5, camera: { distance: 6.4, yaw: 0.3, pitch: 0.1, autoRotate: 0.07 },
  deformers: [{ type: "wave", amount: 0.018, scale: 1.0, speed: 0.5, axis: "y" }],
  build(sc) {
    const rng = sc.rng, s = sc.solid(0.06), twigs: V3[][] = [], tips: V3[] = [];
    s.tube([[0, -0.02, 0], [0.02, 0.6, 0], [0.0, 1.15, 0.02]], [0.34, 0.24, 0.2], { seg: 14, c: 0.2, k: 0.04 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; s.tube([[0.08 * Math.cos(a), 0.5, 0.08 * Math.sin(a)], [0.42 * Math.cos(a), 0.1, 0.42 * Math.sin(a)], [0.85 * Math.cos(a), -0.05, 0.85 * Math.sin(a)]], [0.13, 0.09, 0.03], { seg: 8, c: 0.18, k: 0.05 }); }
    s.disp = (x, y, z) => 0.025 * Math.abs(Math.sin(Math.atan2(z, x) * 7 + 3 * vnoise(x * 3, y * 3, z * 3))) * (y < 1.3 ? 1 : 0) - 0.012;
    s.shade = (x, y, z, _nx, _ny, _nz, t) => t + 0.12 * (vnoise(x * 10, y * 4, z * 10) - 0.5);
    const grow = (p: V3, d: V3, len: number, depth: number, r: number) => {
      const pts: V3[] = [p]; let q = p, dd = d;
      for (let i = 0; i < 4; i++) { dd = norm3([dd[0] + (rng.next() - 0.5) * 0.34, dd[1] + (rng.next() - 0.5) * 0.3, dd[2] + (rng.next() - 0.5) * 0.34]); q = add(q, dd, len / 4); pts.push(q); }
      if (depth >= 4) s.tube(pts, [r, r * 0.92, r * 0.85, r * 0.78, r * 0.72], { seg: 8, c: 0.2, k: 0.04 }); else twigs.push(pts);
      if (depth <= 0) { tips.push(q); return; }
      const n = depth > 4 ? 3 : 2 + (rng.next() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) { const sp = depth > 4 ? 1.1 : 0.95; grow(q, norm3([dd[0] + (rng.next() - 0.5) * 2 * sp, dd[1] * 0.7 + (rng.next() - 0.35) * 0.9, dd[2] + (rng.next() - 0.5) * 2 * sp]), len * (0.78 + rng.next() * 0.12), depth - 1, r * 0.66); }
    };
    grow([0, 1.1, 0], [0, 1, 0], 0.62, 6, 0.2);
    sc.strands(twigs, { r: 0.016, dens: 0.9, c0: 0.2, c1: 0.15, taper: true });
    sc.points(6.2, (r, o) => { const p = tips[Math.floor(r.next() * tips.length)], a = r.next() * TAU, b = Math.acos(2 * r.next() - 1), rr = 0.5 * Math.cbrt(r.next()); o[0] = p[0] + rr * Math.sin(b) * Math.cos(a); o[1] = p[1] + rr * Math.cos(b) * 0.8; o[2] = p[2] + rr * Math.sin(b) * Math.sin(a); o[3] = Math.sin(b) * Math.cos(a); o[4] = Math.cos(b); o[5] = Math.sin(b) * Math.sin(a); o[6] = 0.4 + 0.5 * vnoise(p[0] * 2, p[1] * 2, p[2] * 2) + 0.14 * (o[1] / 4); });
    sc.points(0.4, (r, o) => { const a = r.next() * TAU, rr = 2.2 * Math.sqrt(r.next()); o[0] = rr * Math.cos(a); o[1] = -0.12; o[2] = rr * Math.sin(a); o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0.45 + 0.2 * r.next(); });
  },
});

export const PLANT2_SHAPES: GeneratorDef[] = [pine, palm, mushroom1, cactus, oak];
