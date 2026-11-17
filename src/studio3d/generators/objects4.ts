import type { GeneratorDef } from "../types";
import { vnoise } from "../math";
import { defineShape, splinePoints, norm3, cross3, type V3 } from "./sculpt";
import { OBJ, TAU, lathe, torus, circle, disc, box, isoU, isoV, radiusAt } from "./objkit";

/* ───────────── Hourglass ───────────── */
export const hourglass = defineShape({
  id: "obj-hourglass", name: "Hourglass", tag: OBJ,
  description: "An antique sand timer: two blown-glass bulbs pinched at the neck, golden sand draining in a thin stream and piling into a cone below, held between turned wooden plates by four baluster pillars.",
  palette: [[0, "#140b05"], [0.18, "#4a2a14"], [0.32, "#8b5a2b"], [0.45, "#e8b84a"], [0.55, "#f7dc8c"], [0.7, "#a9d6e6"], [0.85, "#d9a441"], [1, "#ffffff"]],
  count: 120000, size: 0.0054, fit: 1.5, camera: { distance: 6.2, yaw: 0.5, pitch: 0.1, autoRotate: 0.1 },
  build(sc) {
    const gp: Array<[number, number]> = [[0.3, 1.54], [0.5, 1.46], [0.62, 1.1], [0.6, 0.7], [0.4, 0.3], [0.14, 0.08], [0.055, 0.0], [0.14, -0.08], [0.4, -0.3], [0.6, -0.7], [0.62, -1.1], [0.5, -1.46], [0.3, -1.54]];
    const glass = lathe(gp);
    sc.sheet(glass, { dens: 0.5, thick: 0.003, c: (_u, v) => 0.7 + 0.03 * Math.sin(v * 8), al: 0.5 });
    sc.strands([isoU(glass, 0.62, 60), isoU(glass, 0.66, 60), isoV(glass, 0.5, 60)], { r: 0.0065, dens: 1, c0: 0.95, c1: 0.95, al: 0.55 });
    sc.strands([isoV(glass, 0.04, 80), isoV(glass, 0.96, 80)], { r: 0.006, dens: 1, c0: 0.7, c1: 0.7, al: 0.7 });
    // sand
    const wallR = (y: number) => radiusAt(gp, y) * 0.965;
    const grain = (u: number, v: number) => 0.46 + 0.07 * vnoise(u * 9, v * 20, 0) + 0.03 * Math.sin(v * 50);
    sc.sheet(lathe([0.64, 0.5, 0.38, 0.26, 0.16, 0.08, 0.02].map((y): [number, number] => [wallR(y), y])), { dens: 2.6, thick: 0.01, c: grain });
    sc.sheet(lathe([[0.575, 0.65], [0.44, 0.58], [0.26, 0.45], [0.11, 0.27], [0.045, 0.1]]), { dens: 3, thick: 0.012, c: (u, v) => 0.5 + 0.07 * vnoise(u * 8, v * 14, 1) });
    sc.sheet(lathe([[0.0, -1.0], [0.12, -1.06], [0.3, -1.2], [0.5, -1.32], [0.57, -1.37]]), { dens: 3, thick: 0.012, c: (u, v) => 0.5 + 0.07 * vnoise(u * 8, v * 14, 2) });
    sc.sheet(lathe([-1.36, -1.42, -1.48, -1.52].map((y): [number, number] => [wallR(y), y])), { dens: 2.6, thick: 0.01, c: grain });
    sc.sheet(disc([0, -1.525, 0], 0.34, 0, "y"), { dens: 1.5, thick: 0.01, c: 0.45 });
    sc.strands([[[0, 0.07, 0], [0, -1.0, 0]]], { r: 0.012, dens: 2.5, c0: 0.5, c1: 0.5 });
    sc.points(0.25, (r, o) => { const y = 0.05 - 1.05 * Math.pow(r.next(), 0.9), a = r.next() * TAU, rr = Math.abs(r.gauss()) * 0.02; o[0] = rr * Math.cos(a); o[1] = y; o[2] = rr * Math.sin(a); o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0.5 + 0.05 * r.next(); o[7] = 0.8; });
    // plates and pillars
    for (const [y0, flip] of [[-1.75, false], [1.75, true]] as Array<[number, boolean]>) {
      const pp: Array<[number, number]> = [[0, 0], [0.9, 0], [0.96, 0.04], [0.96, 0.1], [0.9, 0.14], [0.84, 0.15], [0.84, 0.19], [0.36, 0.19], [0.0, 0.19]].map(([r, h]): [number, number] => [r, flip ? y0 - h : y0 + h]);
      sc.sheet(lathe(pp), { dens: 1.5, thick: 0.005, c: (u, v) => 0.3 + 0.04 * Math.sin(u * 3 + v * 20) + 0.02 * Math.sin(u * 30) });
      sc.sheet(torus([0, flip ? y0 - 0.17 : y0 + 0.17, 0], 0.3, 0.03, "y"), { dens: 2.2, thick: 0.002, c: 0.85 });
      sc.strands([circle([0, flip ? y0 - 0.1 : y0 + 0.1, 0], 0.97, 100, "y"), circle([0, flip ? y0 - 0.15 : y0 + 0.15, 0], 0.86, 100, "y")], { r: 0.006, dens: 1, c0: 0.85, c1: 0.85 });
    }
    const pl = sc.solid(0.01), ys = Array.from({ length: 13 }, (_, i) => -1.57 + (3.14 * i) / 12), rad = [0.08, 0.08, 0.11, 0.06, 0.05, 0.05, 0.05, 0.05, 0.05, 0.06, 0.11, 0.08, 0.08];
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + Math.PI / 4; pl.tube(ys.map((y): V3 => [0.76 * Math.cos(a), y, 0.76 * Math.sin(a)]), rad, { seg: 36, c: 0.3, k: 0.01 }); for (const yy of [-1.1, 0, 1.1]) pl.ell([0.76 * Math.cos(a), yy, 0.76 * Math.sin(a)], [0.09, 0.02, 0.09], { c: 0.85, k: 0.01 }); }
    void box; void splinePoints;
  },
});

/* ───────────── Light bulb ───────────── */
export const lightbulb = defineShape({
  id: "obj-lightbulb", name: "Edison Light Bulb", tag: OBJ,
  description: "A vintage Edison bulb: blown-glass envelope with a reflective highlight, a glass stem carrying a glowing double-loop tungsten coil filament, a threaded brass screw base with insulator and contact, and a corona of light rays.",
  palette: [[0, "#0a0a12"], [0.2, "#3a2f22"], [0.4, "#9a7b3a"], [0.55, "#e0b64a"], [0.7, "#cfe9f5"], [0.85, "#ffcf5a"], [1, "#fffbe8"]],
  count: 120000, size: 0.0052, fit: 1.5, camera: { distance: 6.0, yaw: 0.4, pitch: 0.08, autoRotate: 0.1 },
  deformers: [{ type: "breathe", amount: 0.01, speed: 1.2 }],
  build(sc) {
    const gp: Array<[number, number]> = [[0.0, 2.18], [0.45, 2.1], [0.8, 1.82], [0.92, 1.35], [0.82, 0.85], [0.6, 0.45], [0.4, 0.2], [0.34, 0.05]];
    const glass = lathe(gp);
    sc.sheet(glass, { dens: 0.12, thick: 0.003, c: (_u, v) => 0.7 + 0.04 * v, al: 0.55 });
    sc.strands([isoU(glass, 0.1, 48), isoU(glass, 0.13, 48)], { r: 0.008, dens: 1.2, c0: 1.0, c1: 1.0, al: 0.7 });
    // base
    sc.sheet(lathe([[0.34, 0.05], [0.34, -0.2], [0.34, -0.5], [0.33, -0.62]], { wob: (u, v) => 0.03 * Math.sin(u + v * TAU * 6) }), { dens: 2.2, thick: 0.003, c: (u, v) => 0.47 + 0.14 * Math.sin(u + v * TAU * 6) });
    sc.sheet(torus([0, 0.06, 0], 0.345, 0.03, "y"), { dens: 2.2, thick: 0.002, c: 0.55 });
    sc.sheet(lathe([[0.33, -0.62], [0.28, -0.68], [0.2, -0.72], [0.12, -0.76], [0.0, -0.77]]), { dens: 1.6, thick: 0.003, c: 0.2 });
    const base = sc.solid(0.02); base.sph([0, -0.8, 0], 0.1, { c: 0.5, k: 0.02 });
    // stem + mount
    sc.sheet(lathe([[0.24, 0.1], [0.13, 0.3], [0.075, 0.5], [0.062, 0.9]]), { dens: 1.5, thick: 0.003, c: 0.7, al: 0.4 });
    const wires: V3[][] = [];
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as Array<[number, number]>) wires.push([[x * 0.03, 0.88, z * 0.03], [x * 0.14, 1.05, z * 0.1], [x * 0.26, 1.22, z * 0.1]]);
    wires.push([[0, 0.9, 0], [0, 1.1, 0]]);
    sc.strands(wires, { r: 0.0045, dens: 1.2, c0: 0.5, c1: 0.5 });
    // filament coil
    const coil: V3[][] = [];
    for (const z of [-0.1, 0.1]) {
      const C = splinePoints([[-0.26, 1.22, z], [-0.21, 1.5, z], [-0.08, 1.68, z], [0.08, 1.7, z], [0.21, 1.5, z], [0.26, 1.22, z]], 420), ln: V3[] = [];
      for (let i = 0; i <= 420; i++) {
        const p = C[i], q = C[Math.min(420, i + 1)], pr = C[Math.max(0, i - 1)], T = norm3([q[0] - pr[0], q[1] - pr[1], q[2] - pr[2]]);
        let N = cross3(T, [0, 0, 1]); if (Math.hypot(...N) < 1e-4) N = [1, 0, 0]; N = norm3(N); const B = cross3(T, N), ph = (i / 420) * TAU * 30;
        ln.push([p[0] + 0.03 * (Math.cos(ph) * N[0] + Math.sin(ph) * B[0]), p[1] + 0.03 * (Math.cos(ph) * N[1] + Math.sin(ph) * B[1]), p[2] + 0.03 * (Math.cos(ph) * N[2] + Math.sin(ph) * B[2])]);
      }
      coil.push(ln);
    }
    sc.strands(coil, { r: 0.0058, dens: 2.4, c0: 1.0, c1: 1.0 });
    sc.points(0.18, (r, o) => { const a = r.next() * TAU, b = Math.acos(2 * r.next() - 1), rr = 0.5 * Math.pow(r.next(), 1.8); o[0] = rr * Math.sin(b) * Math.cos(a) * 0.9; o[1] = 1.45 + rr * Math.cos(b) * 0.8; o[2] = rr * Math.sin(b) * Math.sin(a) * 0.9; o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0.85 + 0.15 * (1 - rr * 2); o[7] = 0.9; o[8] = 0.18 + 0.4 * (1 - rr * 2); });
    // rays
    const rays: V3[][] = [];
    for (let k = 0; k < 40; k++) { const a = sc.rng.next() * TAU, e = Math.acos(2 * sc.rng.next() - 1), d: V3 = [Math.sin(e) * Math.cos(a), Math.cos(e), Math.sin(e) * Math.sin(a)]; if (d[1] < -0.35) continue; const r0 = 1.12 + 0.05 * sc.rng.next(), r1 = r0 + 0.16 + 0.26 * sc.rng.next(); rays.push([[d[0] * r0, 1.35 + d[1] * r0 * 1.0, d[2] * r0], [d[0] * r1, 1.35 + d[1] * r1 * 1.0, d[2] * r1]]); }
    sc.strands(rays, { r: 0.008, dens: 1.2, c0: 0.9, c1: 0.85, al: 0.6, taper: true });
    void disc;
  },
});

/* ───────────── Chess knight ───────────── */
export const chessKnight = defineShape({
  id: "obj-chess-knight", name: "Chess Knight", tag: OBJ,
  description: "A Staunton chess knight: turned stepped base with collar, a carved horse head with flared nostrils, pricked ears, almond eye and a flowing mane of carved locks, standing on a checkered tile.",
  palette: [[0, "#120b06"], [0.12, "#2a1a0d"], [0.3, "#7a4a24"], [0.5, "#c99a5b"], [0.62, "#e8cf9a"], [0.78, "#f6e8c8"], [0.92, "#fffaf0"], [1, "#ffffff"]],
  count: 120000, size: 0.0054, fit: 1.5, camera: { distance: 6.2, yaw: 0.5, pitch: 0.12, autoRotate: 0.1 },
  build(sc) {
    const bp: Array<[number, number]> = ([[0.0, 0.0], [0.8, 0.0], [0.84, 0.05], [0.84, 0.14], [0.76, 0.22], [0.62, 0.3], [0.52, 0.5], [0.48, 0.75], [0.5, 0.9], [0.66, 0.98], [0.7, 1.05], [0.66, 1.1]] as Array<[number, number]>).map(([r, y]): [number, number] => [r * 0.78, y]);
    sc.sheet(lathe(bp), { dens: 1.0, thick: 0.004, c: (_u, v) => 0.64 + 0.04 * Math.sin(v * 30) });
    sc.sheet(disc([0, 1.1, 0], 0.51, 0, "y"), { dens: 1.2, thick: 0.004, c: 0.64 });
    sc.sheet(disc([0, 0.002, 0], 0.62, 0, "y"), { dens: 1.2, thick: 0.004, c: 0.12 });
    sc.sheet(torus([0, 0.98, 0], 0.53, 0.04, "y"), { dens: 2, thick: 0.002, c: 0.68 }); sc.sheet(torus([0, 0.12, 0], 0.64, 0.03, "y"), { dens: 2, thick: 0.002, c: 0.66 });
    // checker plinth
    for (const [i, j] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as Array<[number, number]>) box(sc, [i * 1.4 + 0.7, -0.07, j * 1.4 + 0.7], [0.7, 0.07, 0.7], { dens: 0.2, thick: 0.004, c: (i + j) % 2 === 0 ? 0.1 : 0.82, skip: ["-y"] });
    // horse
    const h = sc.solid(0.1);
    h.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.05 * ny + 0.05 * (vnoise(x * 8, y * 8, z * 8) - 0.5);
    h.ell([0, 1.4, 0], [0.62, 0.42, 0.52], { dens: 2.4, c: 0.63 });
    h.tube([[-0.1, 1.4, 0], [-0.22, 1.9, 0], [-0.12, 2.35, 0], [0.0, 2.55, 0]], [0.46, 0.38, 0.3, 0.26], { seg: 20, dens: 2.4, c: 0.63, k: 0.1 });
    h.ell([0.12, 2.55, 0], [0.36, 0.27, 0.22], { dir: [1, -0.45, 0], dens: 2.4, c: 0.64, k: 0.08 });
    h.ell([0.62, 2.28, 0], [0.32, 0.16, 0.14], { dir: [1, -0.7, 0], dens: 2.4, c: 0.64, k: 0.07 });
    h.ell([0.92, 2.1, 0], [0.13, 0.13, 0.11], { dir: [1, -0.7, 0], dens: 2.4, c: 0.62, k: 0.05 });
    h.ell([0.4, 2.12, 0], [0.3, 0.1, 0.1], { dir: [1, -0.6, 0], dens: 2.4, c: 0.6, k: 0.06 });
    h.ell([0.14, 2.4, 0.13], [0.2, 0.17, 0.1], { dens: 2.4, c: 0.64, k: 0.06, sym: "z" });
    h.cone([-0.08, 2.78, 0.11], [-0.2, 3.12, 0.1], 0.08, 0.016, { dens: 2.4, c: 0.62, k: 0.03, sym: "z" });
    const dk = sc.solid(0.005);
    dk.ell([0.36, 2.66, 0.2], [0.045, 0.05, 0.025], { c: 0.0, k: 0.005, sym: "z", sz: 1.2 }); dk.ell([0.99, 2.12, 0.08], [0.035, 0.03, 0.03], { c: 0.0, k: 0.005, sym: "z", sz: 1.2 });
    // mane
    const crest = splinePoints([[-0.1, 2.85, 0], [-0.38, 2.55, 0], [-0.5, 2.2, 0], [-0.52, 1.8, 0], [-0.45, 1.45, 0]], 26), m = sc.solid(0.02);
    m.tube(crest, crest.map(() => 0.06), { seg: 26, c: 0.55, k: 0.02 });
    for (let i = 1; i < 26; i += 1) { const p = crest[i], sg = i % 2 ? 1 : -1, L = 0.2 + 0.07 * Math.sin(i * 1.3); m.cone([p[0], p[1], sg * 0.06], [p[0] - 0.14 * L / 0.2 - 0.04, p[1] - 0.12 * L / 0.2, sg * (0.1 + 0.07 * L)], 0.07, 0.012, { c: 0.5 + 0.04 * (i % 3), k: 0.02 }); }
    m.cone([0.1, 2.85, 0], [0.34, 2.7, 0], 0.06, 0.012, { c: 0.5, k: 0.02 });
    sc.strands([[[0.52, 2.12, 0.095], [0.8, 2.02, 0.095], [0.97, 1.99, 0.08]]], { r: 0.006, dens: 1.2, c0: 0.12, c1: 0.12, sym: "z" });
  },
});

export const OBJECTS4_SHAPES: GeneratorDef[] = [hourglass, lightbulb, chessKnight];
