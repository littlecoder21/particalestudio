import type { GeneratorDef } from "../types";
import { TAU } from "../math";
import type { ParamSurface } from "../sampling";
import { defineShape, ringLine, spineParam, sstep, type V3 } from "./sculpt";


/* ───────────── Jellyfish (moon jelly / sea nettle) ───────────── */
export const jellyfish = defineShape({
  id: "nature-jellyfish", name: "Jellyfish", tag: "Ocean life",
  description: "A translucent scalloped bell with radial canals, four horseshoe gonads, ruffled oral arms and a veil of trailing tentacles.",
  palette: [[0, "#1d2f8f"], [0.28, "#2bc4ff"], [0.55, "#b36bff"], [0.8, "#ff7fd1"], [1, "#fff1fb"]],
  count: 70000, size: 0.0068, camera: { distance: 4.4, yaw: 0.35, pitch: 0.12 },
  look: { glow: 0.8, depthFade: 0.35 },
  deformers: [{ type: "breathe", amount: 0.035, speed: 0.7 }, { type: "wave", amount: 0.03, scale: 1.4, speed: 0.8, axis: "y" }],
  build(sc, { detail }) {
    const R = 0.95, H = 0.7, LOB = 16, rng = sc.rng;
    const bellPt = (u: number, v: number, inset: number, o: number[]) => {
      const phi = v * (Math.PI * 0.5 + 0.1), rim = sstep(0.8, 1, v);
      let r = R * Math.sin(phi) * (1 + 0.05 * Math.sin(phi * 2)) * (1 - inset);
      let y = H * Math.cos(phi) * (1 - inset * 0.8) - inset * 0.05;
      r *= 1 + 0.05 * Math.sin(LOB * u) * rim + 0.014 * Math.cos(8 * u) * Math.sin(phi);
      y -= 0.07 * rim * (0.5 + 0.5 * Math.cos(LOB * u));
      o[0] = r * Math.cos(u); o[1] = y; o[2] = r * Math.sin(u);
    };
    const outer: ParamSurface = { u0: 0, u1: TAU, v0: 0, v1: 1, eval: (u, v, o) => bellPt(u, v, 0, o) };
    const inner: ParamSurface = { u0: 0, u1: TAU, v0: 0.02, v1: 0.985, eval: (u, v, o) => bellPt(u, v, 0.075, o) };
    const canals = (u: number, v: number) => 0.5 + 0.5 * Math.cos(8 * u) * sstep(0.1, 0.35, v) * (1 - sstep(0.8, 1, v));
    sc.sheet(outer, { dens: 1.1, thick: 0.012, c: (u, v) => 0.18 + 0.5 * v + 0.12 * canals(u, v) });
    sc.sheet(inner, { dens: 0.55, thick: 0.008, c: (u, v) => 0.34 + 0.4 * v + 0.15 * canals(u, v), al: 0.8 });
    // bell margin
    sc.strands([ringLine(R * 0.995, -0.05, 160, (a) => R * 0.05 * Math.sin(LOB * a))], { r: 0.014, dens: 3, c0: 0.92, c1: 0.92, sz: 1.15 });
    // four horseshoe gonads
    for (let k = 0; k < 4; k++) {
      const a0 = (k * TAU) / 4 + Math.PI / 4, cx = 0.3 * Math.cos(a0), cz = 0.3 * Math.sin(a0), line: V3[] = [];
      for (let i = 0; i <= 28; i++) { const a = a0 + Math.PI + (-0.5 + i / 28) * TAU * 0.82; line.push([cx + 0.17 * Math.cos(a), 0.2 - 0.04 * Math.sin(a * 2), cz + 0.17 * Math.sin(a)]); }
      sc.strands([line], { r: 0.026, dens: 2.2, c0: 0.78, c1: 0.9, sz: 1.2 });
    }
    // four ruffled oral arms
    for (let k = 0; k < 4; k++) {
      const th = (k * TAU) / 4 + 0.35, wob = rng.next() * TAU;
      const arm: ParamSurface = {
        u0: 0, u1: 1, v0: -1, v1: 1,
        eval(u, v, o) {
          const a = th + 0.5 * u * Math.sin(wob + u * 3), len = 1.45, w = 0.2 * Math.pow(1 - u * 0.85, 0.9);
          const cx = (0.1 + 0.16 * u) * Math.cos(a) + 0.05 * Math.sin(u * 7 + wob), cz = (0.1 + 0.16 * u) * Math.sin(a) + 0.05 * Math.cos(u * 6 + wob), cy = 0.02 - len * u;
          const ex = -Math.sin(a + u * 1.2), ez = Math.cos(a + u * 1.2), ruf = 0.045 * Math.sin(26 * u + 5 * v) * Math.abs(v) * (1 - u * 0.5);
          o[0] = cx + ex * v * w + Math.cos(a) * ruf; o[1] = cy + 0.03 * Math.sin(38 * u + v * 3) * Math.abs(v); o[2] = cz + ez * v * w + Math.sin(a) * ruf;
        },
      };
      sc.sheet(arm, { dens: 0.9, thick: 0.006, c: (u) => 0.66 + 0.3 * u });
    }
    // marginal tentacles
    const T = Math.round(70 + detail * 150), lines: V3[][] = [];
    for (let i = 0; i < T; i++) {
      const a = (i / T) * TAU + rng.range(-0.02, 0.02), long = rng.next() < 0.14, L = long ? rng.range(1.7, 2.3) : rng.range(0.7, 1.35), ph = rng.next() * TAU, line: V3[] = [];
      const x0 = R * 0.985 * Math.cos(a), z0 = R * 0.985 * Math.sin(a);
      for (let j = 0; j <= 16; j++) {
        const s = j / 16, drift = 1 - 0.3 * s, sway = 0.07 * s * (long ? 1.6 : 1);
        line.push([x0 * drift + sway * Math.sin(5 * s + ph) * Math.cos(a + 1.57), -0.07 - L * s, z0 * drift + sway * Math.sin(5 * s + ph + 1.3) * Math.sin(a + 1.57)]);
      }
      lines.push(line);
    }
    sc.strands(lines, { r: 0.0042, dens: 0.75, c0: 0.62, c1: 1, al: 0.85, taper: true });
    sc.strands(lines.filter((_, i) => i % 9 === 0), { r: 0.009, dens: 0.8, c0: 0.55, c1: 0.9, taper: true });
  },
});

/* ───────────── Seahorse ───────────── */
export const seahorse = defineShape({
  id: "nature-seahorse", name: "Seahorse", tag: "Ocean life",
  description: "An upright seahorse: bony ringed trunk, pot belly, horse-like bent head with a tubular snout and coronet, dorsal fin and a prehensile spiral tail.",
  palette: [[0, "#5b2a86"], [0.25, "#e8508b"], [0.55, "#ff9f43"], [0.85, "#ffd86b"], [1, "#fff7d6"]],
  count: 70000, size: 0.0072, camera: { distance: 4.2, yaw: 0.9, pitch: 0.1 },
  look: { glow: 0.65 },
  deformers: [{ type: "bend", amount: 0.05, speed: 0.5, axis: "z" }],
  build(sc, { detail }) {
    const body: V3[] = [[0.21, -0.97, 0], [0.14, -0.9, 0], [0.19, -0.78, 0], [0.31, -0.79, 0], [0.38, -0.93, 0], [0.31, -1.1, 0], [0.12, -1.17, 0], [-0.07, -1.04, 0], [-0.13, -0.8, 0], [-0.06, -0.54, 0], [0.03, -0.28, 0], [0.14, 0.02, 0], [0.21, 0.32, 0], [0.12, 0.62, 0], [0.0, 0.86, 0], [0.01, 0.98, 0]];
    const rad = [0.011, 0.016, 0.023, 0.03, 0.037, 0.045, 0.055, 0.066, 0.078, 0.092, 0.122, 0.165, 0.2, 0.125, 0.088, 0.085];
    const rings = spineParam(body, 300), s = sc.solid(0.05);
    s.tube(body, rad, { seg: 90, c: 0.4 });
    s.ell([0.27, 0.22, 0], [0.17, 0.36, 0.17], { rot: [0, 0, -0.12], c: 0.5 }); // belly pouch
    // head: skull bent forward, short tubular snout, jaw
    s.ell([0.08, 1.05, 0], [0.17, 0.135, 0.115], { rot: [0, 0, -0.45], c: 0.7 });
    s.tube([[0.19, 1.0, 0], [0.33, 0.92, 0], [0.47, 0.83, 0]], [0.072, 0.05, 0.032], { seg: 8, c: 0.72 });
    s.ell([0.3, 0.9, 0], [0.13, 0.03, 0.045], { rot: [0, 0, -0.55], c: 0.55 }); // lower jaw
    s.ell([0.1, 0.96, 0], [0.11, 0.11, 0.1], { c: 0.6 }); // cheek
    // bulging eyes + brow ridge
    s.sph([0.17, 1.1, 0.098], 0.052, { c: 1, sz: 1.5, k: 0.01 }); s.sph([0.17, 1.1, -0.098], 0.052, { c: 1, sz: 1.5, k: 0.01 });
    s.ell([0.15, 1.15, 0.088], [0.07, 0.025, 0.04], { rot: [0, 0, -0.4], c: 0.8 }); s.ell([0.15, 1.15, -0.088], [0.07, 0.025, 0.04], { rot: [0, 0, -0.4], c: 0.8 });
    // coronet crown
    for (let i = 0; i < 5; i++) s.cone([-0.04 + i * 0.045, 1.14 + 0.03 * (i === 2 ? 1 : 0), 0], [-0.1 + i * 0.055, 1.3 - Math.abs(i - 2) * 0.035, 0], 0.034, 0.006, { c: 0.95 });
    // body ridges (rings along spine) + tail ridges
    s.disp = (x, y, z) => {
      const t = rings(x, y, z), ph = t * (t < 0.5 ? 46 : 52);
      const ridge = 0.5 + 0.5 * Math.cos(ph * TAU * (t < 0.55 ? 1 : 0.8)), keel = y < 0.7 ? 0.5 + 0.5 * Math.cos(Math.atan2(z, x - 0.12) * 4) : 0;
      return (0.009 * ridge + 0.006 * keel * ridge) * detail * 1.6;
    };
    s.shade = (x, y, z, _nx, _ny, _nz, t) => { const u = rings(x, y, z); return 0.12 + 0.72 * (1 - u) + 0.1 * Math.cos(u * 52 * TAU) * (u > 0.12 ? 1 : 0) + (t > 0.9 ? 0.2 : 0); };
    // dorsal fin
    const fin: ParamSurface = {
      u0: 0, u1: 1, v0: 0, v1: 1,
      eval(u, v, o) { const by = 0.34 - 0.5 * u, bx = 0.05 - 0.02 * u - 0.07 + 0.06 * u * 0, len = 0.3 * Math.sin(Math.PI * (0.1 + 0.8 * u)) ** 0.8; o[0] = bx - v * len; o[1] = by - v * 0.04 + 0.02 * Math.sin(10 * v); o[2] = 0.012 * Math.sin(46 * u) * v; },
    };
    sc.sheet(fin, { dens: 0.9, thick: 0.004, c: (u, v) => 0.35 + 0.5 * v + 0.1 * Math.sin(u * 140) });
    // pectoral fins
    for (const side of [1, -1]) {
      const pf: ParamSurface = { u0: 0, u1: 1, v0: 0, v1: 1, eval(u, v, o) { const a = -0.6 + 1.2 * u; o[0] = 0.0 - 0.17 * v * Math.cos(a * 0.7); o[1] = 0.8 + 0.15 * v * Math.sin(a * 1.5) - 0.05 * v; o[2] = side * (0.1 + 0.1 * v * (1 - 0.4 * Math.abs(a))); } };
      sc.sheet(pf, { dens: 0.7, thick: 0.003, c: 0.7 });
    }
  },
});

export const SEA_SHAPES: GeneratorDef[] = [jellyfish, seahorse];
