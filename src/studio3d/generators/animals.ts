import type { GeneratorDef } from "../types";
import { clamp, hash3, vnoise } from "../math";
import { defineShape, featherSurface, norm3, sstep, mixn, type V3 } from "./sculpt";
import { ANI, frame, limb, hairLines } from "./quadrupeds";

/** Edge distance of a 3D cellular (Voronoi) pattern: small near cell borders. */
export function cell3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let f1 = 9, f2 = 9;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const hx = ix + a, hy = iy + b, hz = iz + c, px = hx + hash3(hx, hy, hz), py = hy + hash3(hy, hz, hx + 7), pz = hz + hash3(hz, hx + 3, hy), d = Math.hypot(px - x, py - y, pz - z);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return f2 - f1;
}

/* ───────────── Cat ───────────── */
export const cat = defineShape({
  id: "animal-cat", name: "Cat", tag: ANI,
  description: "A seated tabby cat with upright triangular ears, large eyes, whiskers, tucked paws and a tail curled around its feet.",
  palette: [[0, "#150d08"], [0.25, "#5a3315"], [0.5, "#b8661f"], [0.75, "#f0a850"], [1, "#fff1dc"]],
  count: 100000, size: 0.0055, fit: 1.3, camera: { distance: 4.4, yaw: 0.6, pitch: 0.12, autoRotate: 0.08 },
  build(sc, { detail }) {
    const rng = sc.rng, s = sc.solid(0.05);
    s.ell([-0.18, 0.42, 0], [0.4, 0.4, 0.34], { c: 0.5, k: 0.1 });                                  // haunch
    s.tube([[-0.2, 0.4, 0], [0.05, 0.75, 0], [0.2, 1.0, 0]], [0.32, 0.27, 0.2], { seg: 10, c: 0.5, k: 0.1 });
    s.ell([0.12, 0.62, 0], [0.22, 0.38, 0.24], { c: 0.8, k: 0.08 });                                // chest (lighter)
    const H = frame([0.3, 1.2, 0], -0.05, 1.1);
    s.ell(H(0, 0, 0), [0.2, 0.17, 0.2], { c: 0.52, k: 0.05 });
    s.ell(H(0.14, -0.06, 0), [0.1, 0.07, 0.11], { c: 0.85, k: 0.04 });                                // muzzle
    s.ell(H(0.23, -0.02, 0), [0.025, 0.02, 0.03], { c: 0.12, k: 0.008 });                              // nose
    s.ell(H(0.1, 0.05, 0.09), [0.04, 0.05, 0.035], { sym: "z", c: 0.95, k: 0.006 });                  // eye
    s.ell(H(0.135, 0.05, 0.092), [0.012, 0.045, 0.012], { sym: "z", c: 0.0, k: 0.003, sz: 1.2 });
    s.cone(H(-0.04, 0.12, 0.1), H(-0.1, 0.34, 0.15), 0.09, 0.01, { sym: "z", c: 0.45, k: 0.02 });    // ears
    s.cone(H(-0.04, 0.12, 0.1), H(-0.1, 0.3, 0.14), 0.05, 0.006, { sym: "z", c: 0.9, k: 0.01 });
    limb(s, [[0.3, 0.8, 0.12], [0.36, 0.4, 0.1], [0.4, 0.06, 0.1]], [0.08, 0.055, 0.05], 0.5, 0.03);
    s.ell([0.44, 0.04, 0.1], [0.09, 0.04, 0.05], { sym: "z", c: 0.85, k: 0.01 });
    s.ell([0.1, 0.05, 0.28], [0.22, 0.05, 0.1], { sym: "z", c: 0.5, k: 0.02 });                       // hind feet
    s.tube([[-0.55, 0.2, 0.1], [-0.5, 0.05, 0.42], [-0.05, 0.04, 0.6], [0.5, 0.05, 0.34]], [0.07, 0.065, 0.06, 0.045], { seg: 20, c: 0.45, k: 0.02 });
    s.shade = (x, y, z, _nx, ny, _nz, t) => { const stripe = Math.sin((y * 0.8 + 0.18 * vnoise(x * 6, y * 6, z * 6)) * 70 + z * 9) > 0.62 ? -0.18 : 0; return t + stripe * (y < 1.0 ? 1 : 0.5) + 0.08 * (vnoise(x * 12, y * 12, z * 12) - 0.5) * detail - 0.04 * Math.max(0, ny); };
    const wh = (z: number, a: number) => hairLines(rng, 1, 8, () => (k) => { const p = H(0.2 + 0.3 * k, -0.04 + a * k, z + Math.sign(z) * 0.28 * k); return [p[0], p[1], p[2]]; });
    sc.strands([wh(0.07, 0.04), wh(0.08, -0.02), wh(0.07, -0.07), wh(-0.07, 0.04), wh(-0.08, -0.02), wh(-0.07, -0.07)].flat(), { r: 0.0035, dens: 7, c0: 1, c1: 1, taper: true });
  },
});

/* ───────────── Red stag ───────────── */
export const stag = defineShape({
  id: "animal-stag", name: "Red Stag", tag: ANI,
  description: "A red stag with a thick maned neck, slender legs, white rump and a crown of branching antlers.",
  palette: [[0, "#150b06"], [0.28, "#5b2f14"], [0.5, "#9a5424"], [0.72, "#d49a60"], [0.9, "#f4e3c4"], [1, "#fffaf0"]],
  count: 120000, size: 0.0054, fit: 1.4, camera: { distance: 5.2, yaw: 0.6, pitch: 0.1, autoRotate: 0.08 },
  build(sc, { detail }) {
    const rng = sc.rng, s = sc.solid(0.05);
    const cg = (_x: number, y: number) => 0.46 + 0.32 * (1 - clamp((y - 0.6) / 0.5, 0, 1));
    s.ell([0.32, 1.0, 0], [0.42, 0.37, 0.22], { c: 0.5, cg, k: 0.1 });
    s.ell([-0.12, 1.02, 0], [0.42, 0.26, 0.19], { c: 0.5, cg, k: 0.1 });
    s.ell([-0.52, 1.02, 0], [0.3, 0.27, 0.19], { c: 0.5, cg, k: 0.1 });
    limb(s, [[0.45, 0.85, 0.1], [0.43, 0.6, 0.09], [0.47, 0.34, 0.07], [0.48, 0.1, 0.065], [0.5, 0.02, 0.07]], [0.085, 0.055, 0.036, 0.026, 0.03], 0.46);
    limb(s, [[-0.55, 0.92, 0.12], [-0.4, 0.66, 0.1], [-0.65, 0.4, 0.075], [-0.63, 0.12, 0.065], [-0.61, 0.02, 0.07]], [0.12, 0.07, 0.036, 0.026, 0.03], 0.46);
    s.tube([[0.5, 1.15, 0], [0.72, 1.4, 0], [0.9, 1.62, 0]], [0.3, 0.23, 0.18], { seg: 10, c: 0.48 });
    const H = frame([1.02, 1.72, 0], -0.75, 1.4);
    s.ell(H(0, 0, 0), [0.16, 0.1, 0.09], { c: 0.5 });
    s.cone(H(0.1, -0.01, 0), H(0.42, -0.06, 0), 0.075, 0.048, { c: 0.55, k: 0.04 });
    s.ell(H(0.44, -0.06, 0), [0.032, 0.036, 0.048], { c: 0.06, k: 0.01 });
    s.sph(H(0.09, 0.06, 0.08), 0.02, { sym: "z", c: 0.0, k: 0.004, sz: 1.3 });
    s.ell(H(-0.07, 0.1, 0.16), [0.1, 0.045, 0.035], { sym: "z", rot: [0, 0, 0.4], c: 0.45, k: 0.02 }); // ears
    s.tube([[-0.8, 1.05, 0], [-0.86, 0.98, 0]], [0.04, 0.03], { seg: 3, c: 0.9 });
    // antlers: main beam with tines
    const beam = (side: number): V3[] => [H(-0.05, 0.08, 0.05 * side), H(-0.1, 0.2, 0.12 * side), H(-0.2, 0.3, 0.22 * side), H(-0.36, 0.38, 0.28 * side), H(-0.55, 0.46, 0.26 * side)];
    for (const side of [1, -1]) {
      const b = beam(side);
      s.tube(b, [0.034, 0.028, 0.022, 0.016, 0.006], { seg: 16, c: 0.88, k: 0.01 });
      const tines: Array<[number, V3]> = [[1, [0.1, 0.12, 0.02]], [2, [0.14, 0.16, 0.03]], [3, [0.1, 0.2, 0.02]], [3, [-0.04, 0.2, 0.06]], [4, [0.06, 0.2, -0.02]], [4, [-0.08, 0.12, 0.08]]];
      for (const [i, d] of tines) { const base = b[i], tip: V3 = [base[0] + d[0], base[1] + d[1], base[2] + d[2] * side]; s.tube([base, [(base[0] + tip[0]) / 2 + 0.02, (base[1] + tip[1]) / 2, (base[2] + tip[2]) / 2], tip], [0.016, 0.012, 0.004], { seg: 6, c: 0.9, k: 0.008 }); }
    }
    s.shade = (x, y, z, _nx, ny, _nz, t) => mixn(t, 0.94, sstep(-0.74, -0.84, x) * sstep(0.8, 0.95, y) * (y < 1.2 ? 1 : 0)) + 0.1 * (vnoise(x * 10, y * 10, z * 10) - 0.5) * detail - 0.05 * Math.max(0, ny);
    // neck mane
    sc.strands(hairLines(rng, 200, 4, (_i, r) => { const k0 = r.next(), a = r.next() * 6.283; const px = 0.55 + 0.45 * k0, py = 1.2 + 0.48 * k0; return (k) => [px - 0.02 - 0.05 * k, py - 0.1 - 0.1 * k + 0.15 * Math.sin(a) * (1 - k0 * 0.3), 0.15 * Math.cos(a)]; }), { r: 0.008, dens: 0.6, c0: 0.3, c1: 0.15 });
  },
});

/* ───────────── Giraffe ───────────── */
export const giraffe = defineShape({
  id: "animal-giraffe", name: "Giraffe", tag: ANI,
  description: "A giraffe with a very long neck, sloping back, tall slender legs, ossicones, tufted tail and a coat of irregular brown patches on cream.",
  palette: [[0, "#1a0e06"], [0.28, "#5c3414"], [0.5, "#9a5f24"], [0.72, "#e0b878"], [1, "#fff0cf"]],
  count: 130000, size: 0.0052, fit: 1.5, camera: { distance: 6.4, yaw: 0.6, pitch: 0.08, autoRotate: 0.08 },
  build(sc, { detail }) {
    const rng = sc.rng, s = sc.solid(0.05);
    s.ell([0.3, 1.42, 0], [0.4, 0.4, 0.22], { rot: [0, 0, 0.1], c: 0.5, k: 0.1 });
    s.ell([-0.2, 1.38, 0], [0.4, 0.3, 0.2], { c: 0.5, k: 0.1 });
    s.ell([-0.58, 1.34, 0], [0.28, 0.3, 0.19], { c: 0.5, k: 0.1 });
    limb(s, [[0.38, 1.2, 0.12], [0.36, 0.72, 0.1], [0.38, 0.36, 0.085], [0.4, 0.06, 0.09]], [0.1, 0.065, 0.05, 0.05], 0.5);
    limb(s, [[-0.58, 1.2, 0.12], [-0.5, 0.8, 0.1], [-0.6, 0.4, 0.085], [-0.6, 0.06, 0.085]], [0.12, 0.07, 0.05, 0.05], 0.5);
    s.ell([0.43, 0.04, 0.09], [0.07, 0.04, 0.05], { sym: "z", c: 0.05 }); s.ell([-0.57, 0.04, 0.085], [0.07, 0.04, 0.05], { sym: "z", c: 0.05 });
    s.tube([[0.45, 1.55, 0], [0.62, 2.1, 0], [0.8, 2.8, 0], [0.94, 3.2, 0]], [0.21, 0.14, 0.1, 0.085], { seg: 20, c: 0.5 });
    const H = frame([1.06, 3.3, 0], -0.5, 1.0);
    s.ell(H(0, 0, 0), [0.17, 0.1, 0.09], { c: 0.5 });
    s.cone(H(0.1, -0.01, 0), H(0.38, -0.05, 0), 0.075, 0.055, { c: 0.7, k: 0.04 });
    s.ell(H(0.4, -0.05, 0), [0.04, 0.045, 0.055], { c: 0.08, k: 0.01 });
    s.sph(H(0.08, 0.075, 0.09), 0.026, { sym: "z", c: 0.0, k: 0.004, sz: 1.3 });
    s.ell(H(-0.07, 0.1, 0.2), [0.12, 0.04, 0.035], { sym: "z", rot: [0, 0, 0.3], c: 0.45, k: 0.02 });
    for (const x of [0.0, -0.06]) { s.cone(H(x, 0.08, 0.05), H(x - 0.03, 0.3, 0.06), 0.028, 0.02, { sym: "z", c: 0.45, k: 0.01 }); s.sph(H(x - 0.03, 0.31, 0.06), 0.03, { sym: "z", c: 0.15, k: 0.01 }); }
    s.tube([[-0.85, 1.38, 0], [-0.95, 1.1, 0], [-0.95, 0.5, 0]], [0.03, 0.022, 0.018], { seg: 10, c: 0.45 });
    s.ell([-0.95, 0.4, 0], [0.04, 0.12, 0.04], { c: 0.05 });
    s.shade = (x, y, z, _nx, ny, _nz, t) => {
      void t; const e = cell3(x * 4.2 + 3.1, y * 4.2, z * 4.2), patch = sstep(0.08, 0.16, e), belly = sstep(0.95, 0.45, y) * 0.0;
      return mixn(0.78, 0.28 + 0.12 * vnoise(x * 6, y * 6, z * 6) * (1 + detail), patch) + belly - 0.04 * Math.max(0, ny);
    };
    sc.strands(hairLines(rng, 120, 3, (_i, r) => { const k0 = r.next(), p = [0.45 + 0.5 * k0, 1.6 + 1.65 * k0] as const; return (k) => [p[0] - 0.02 - 0.03 * k, p[1] + 0.2 - 0.0 + 0.0 * k + 0.0, 0.0 + 0.0 * k + (r.next() - 0.5) * 0.02]; }), { r: 0.006, dens: 0.5, c0: 0.1, c1: 0.1 });
  },
});

/* ───────────── African elephant ───────────── */
export const elephant = defineShape({
  id: "animal-elephant", name: "Elephant", tag: ANI,
  description: "An African elephant with a massive domed head, wide fan ears, a long curling trunk, ivory tusks, pillar legs and wrinkled grey skin.",
  palette: [[0, "#0d0e12"], [0.25, "#363a43"], [0.5, "#6b7079"], [0.75, "#a7aab0"], [1, "#e7e4dd"]],
  count: 140000, size: 0.005, fit: 1.4, camera: { distance: 5.6, yaw: 0.65, pitch: 0.1, autoRotate: 0.08 },
  build(sc, { detail }) {
    const s = sc.solid(0.06);
    s.ell([0.38, 1.15, 0], [0.55, 0.56, 0.42], { c: 0.5, k: 0.14 });
    s.ell([-0.2, 1.2, 0], [0.55, 0.52, 0.42], { c: 0.5, k: 0.14 });
    s.ell([-0.72, 1.12, 0], [0.4, 0.5, 0.38], { c: 0.5, k: 0.14 });
    limb(s, [[0.5, 1.0, 0.24], [0.5, 0.5, 0.22], [0.5, 0.06, 0.22]], [0.22, 0.19, 0.2], 0.5, 0.06);
    limb(s, [[-0.7, 1.0, 0.24], [-0.7, 0.5, 0.22], [-0.7, 0.06, 0.22]], [0.22, 0.19, 0.2], 0.5, 0.06);
    for (const x of [0.5, -0.7]) for (let i = -1; i <= 1; i++) s.ell([x + 0.12, 0.03, 0.22 + i * 0.08], [0.04, 0.03, 0.03], { sym: "z", c: 0.9, k: 0.004 });
    // head, trunk, tusks, ears
    s.ell([1.08, 1.3, 0], [0.45, 0.48, 0.36], { c: 0.5, k: 0.1 });
    const trunk: V3[] = [[1.3, 1.1, 0], [1.55, 0.7, 0], [1.68, 0.3, 0], [1.62, -0.0, 0], [1.4, -0.12, 0]], tr = [0.17, 0.14, 0.11, 0.085, 0.06];
    s.tube(trunk, tr, { seg: 20, c: 0.46, k: 0.04 });
    s.ell([1.28, 0.0, 0], [0.04, 0.05, 0.07], { c: 0.3, k: 0.01 });
    s.tube([[1.25, 0.95, 0.15], [1.55, 0.62, 0.24], [1.9, 0.55, 0.26]], [0.055, 0.045, 0.008], { seg: 10, sym: "z", c: 1, k: 0.01 });
    s.ell([0.8, 1.25, 0.46], [0.04, 0.5, 0.42], { sym: "z", rot: [0, 0.35, 0.18], c: 0.42, k: 0.03 });
    s.sph([1.35, 1.45, 0.22], 0.028, { sym: "z", c: 0.0, k: 0.004, sz: 1.3 });
    s.tube([[-0.98, 1.3, 0], [-1.08, 1.0, 0], [-1.06, 0.45, 0]], [0.045, 0.03, 0.025], { seg: 8, c: 0.4 });
    s.ell([-1.06, 0.38, 0], [0.04, 0.1, 0.04], { c: 0.15 });
    s.disp = (x, y, z) => 0.014 * (vnoise(x * 4, y * 28, z * 4) - 0.5) * (0.5 + detail) + 0.01 * (vnoise(x * 14, y * 14, z * 14) - 0.5);
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.12 * (vnoise(x * 6, y * 6, z * 6) - 0.5) - 0.06 * Math.max(0, ny) + (y < 0.3 ? 0.0 : 0);
  },
});

/* ───────────── Emperor penguin ───────────── */
export const penguin = defineShape({
  id: "animal-penguin", name: "Emperor Penguin", tag: "Birds",
  description: "An emperor penguin standing upright: sleek torpedo body, black head and back, white belly, golden ear patches, paddle flippers, curved beak and webbed feet.",
  palette: [[0, "#06080d"], [0.2, "#222a38"], [0.45, "#7e889c"], [0.7, "#f6f4ec"], [0.86, "#ffd04a"], [1, "#ff9a4a"]],
  count: 90000, size: 0.0058, fit: 1.25, camera: { distance: 4.2, yaw: 0.6, pitch: 0.1, autoRotate: 0.09 },
  build(sc, { detail }) {
    const s = sc.solid(0.06);
    s.ell([0, 0.62, 0], [0.34, 0.62, 0.3], { c: 0.5, k: 0.1 });
    s.ell([0.02, 1.1, 0], [0.27, 0.3, 0.25], { c: 0.4, k: 0.1 });
    s.ell([0.04, 1.4, 0], [0.17, 0.18, 0.15], { c: 0.1, k: 0.06 });
    s.cone([0.15, 1.4, 0], [0.42, 1.31, 0], 0.045, 0.012, { c: 0.99, k: 0.012 });
    s.cone([0.15, 1.36, 0], [0.38, 1.29, 0], 0.025, 0.01, { c: 0.99, k: 0.012 });
    s.sph([0.13, 1.45, 0.1], 0.017, { sym: "z", c: 0.0, k: 0.003, sz: 1.3 });
    s.ell([0.04, 0.76, 0.34], [0.12, 0.42, 0.045], { sym: "z", rot: [0, 0, -0.35], c: 0.1, k: 0.03 }); // flippers
    s.ell([0.12, 0.03, 0.1], [0.16, 0.04, 0.08], { sym: "z", c: 0.1, k: 0.02 });
    s.cone([-0.2, 0.2, 0], [-0.48, 0.02, 0], 0.09, 0.02, { c: 0.1, k: 0.03 });
    s.shade = (x, y, z, _nx, ny, _nz, t) => {
      void t; let c = 0.08 + 0.64 * sstep(-0.14, 0.16, x - 0.1 * Math.max(0, y - 1.0));
      if (y > 1.22) c = mixn(c, 0.06, sstep(1.3, 1.38, y)); if (y > 1.38) c = 0.07;
      if (x > -0.05 && y > 1.0 && y < 1.4 && Math.abs(z) > 0.05) c = mixn(c, 0.86, sstep(1.05, 1.15, y) * (1 - sstep(1.3, 1.4, y)) * sstep(0.04, 0.13, Math.abs(z)) * 0.95);
      return c + 0.04 * (vnoise(x * 18, y * 18, z * 18) - 0.5) * (0.5 + detail) - 0.03 * Math.max(0, ny);
    };
  },
});

/* ───────────── Owl ───────────── */
export const owl = defineShape({
  id: "animal-owl", name: "Great Horned Owl", tag: "Birds",
  description: "A great horned owl perched on a branch: broad round head with facial discs, huge amber eyes, ear tufts, folded wings, barred plumage and gripping talons.",
  palette: [[0, "#120b07"], [0.22, "#4a301a"], [0.45, "#8a5f34"], [0.68, "#c9a46e"], [0.85, "#f2e2bd"], [1, "#ffbf3a"]],
  count: 110000, size: 0.0056, fit: 1.3, camera: { distance: 4.6, yaw: 0.55, pitch: 0.1, autoRotate: 0.08 },
  build(sc, { detail }) {
    const s = sc.solid(0.06);
    s.ell([0, 0.75, 0], [0.38, 0.6, 0.38], { c: 0.5, k: 0.12 });
    s.ell([0.06, 1.4, 0], [0.36, 0.33, 0.4], { c: 0.5, k: 0.1 });
    s.ell([0.28, 1.4, 0.17], [0.07, 0.25, 0.2], { sym: "z", rot: [0, 0.3, 0], c: 0.78, k: 0.02 });        // facial discs
    s.sph([0.33, 1.42, 0.17], 0.09, { sym: "z", c: 0.97, k: 0.006, sz: 1.3 });
    s.sph([0.405, 1.425, 0.172], 0.04, { sym: "z", c: 0.0, k: 0.003 });
    s.cone([0.38, 1.35, 0], [0.5, 1.2, 0], 0.06, 0.008, { c: 0.15, k: 0.012 });                           // beak
    s.cone([0.1, 1.68, 0.17], [0.0, 2.02, 0.25], 0.07, 0.01, { sym: "z", c: 0.35, k: 0.02 });            // ear tufts
    s.ell([-0.08, 0.8, 0.36], [0.2, 0.58, 0.07], { sym: "z", rot: [0, 0, -0.12], c: 0.4, k: 0.04 });     // folded wings
    s.ell([-0.3, 0.18, 0], [0.14, 0.4, 0.14], { rot: [0, 0, 0.45], c: 0.45, k: 0.04 });                  // tail
    s.ell([0.12, 0.3, 0.2], [0.14, 0.26, 0.12], { sym: "z", c: 0.7, k: 0.04 });                          // leg feathers
    for (let i = -1; i <= 1; i++) s.cone([0.18, 0.08, 0.2 + i * 0.05], [0.34, 0.02, 0.2 + i * 0.09], 0.028, 0.006, { sym: "z", c: 0.15, k: 0.008 });
    s.tube([[0.1, 0.02, -1.0], [0.08, 0.05, -0.3], [0.1, 0.03, 0.4], [0.1, 0.0, 1.0]], [0.06, 0.07, 0.07, 0.05], { seg: 16, c: 0.25, k: 0.02 });
    s.shade = (x, y, z, _nx, ny, _nz, t) => {
      let c = t + 0.1 * (vnoise(x * 14, y * 14, z * 14) - 0.5) * (0.5 + detail) - 0.04 * Math.max(0, ny);
      if (y < 1.05 && x > 0.1) c = mixn(c, 0.8, 0.5);
      if (y < 1.1) c -= 0.14 * (Math.sin(y * 52 + 3 * vnoise(x * 4, y * 4, z * 4)) > 0.5 ? 1 : 0);
      return c;
    };
  },
});

/* ───────────── Swan ───────────── */
export const swan = defineShape({
  id: "animal-swan", name: "Swan", tag: "Birds",
  description: "A mute swan gliding on water: S-curved neck, orange beak with black knob, boat-shaped body with raised wings and rippling rings.",
  palette: [[0, "#0a1a2e"], [0.25, "#2b5a8a"], [0.5, "#8fb7d9"], [0.75, "#f2f6fb"], [0.9, "#ff9a3a"], [1, "#ffffff"]],
  count: 110000, size: 0.0056, fit: 1.35, camera: { distance: 5.0, yaw: 0.6, pitch: 0.18, autoRotate: 0.08 },
  build(sc, { detail }) {
    const rng = sc.rng, s = sc.solid(0.06);
    s.ell([0, 0.3, 0], [0.7, 0.3, 0.4], { c: 0.78, k: 0.1 });
    s.ell([-0.62, 0.42, 0], [0.34, 0.12, 0.2], { rot: [0, 0, 0.3], c: 0.78, k: 0.08 });
    s.ell([-0.05, 0.62, 0.3], [0.45, 0.22, 0.09], { sym: "z", rot: [0, 0, -0.18], c: 0.76, k: 0.05 });    // raised wings
    s.tube([[0.5, 0.45, 0], [0.7, 0.75, 0], [0.62, 1.1, 0], [0.7, 1.45, 0], [0.9, 1.62, 0]], [0.14, 0.085, 0.065, 0.062, 0.058], { seg: 22, c: 0.78, k: 0.03 });
    s.ell([0.98, 1.62, 0], [0.12, 0.07, 0.065], { c: 0.78, k: 0.03 });
    s.cone([1.04, 1.62, 0], [1.28, 1.52, 0], 0.052, 0.034, { c: 0.9, k: 0.02 });
    s.sph([1.06, 1.68, 0], 0.03, { c: 0.04, k: 0.01 });
    s.sph([1.0, 1.66, 0.058], 0.014, { sym: "z", c: 0.0, k: 0.003 });
    for (let i = 0; i < 12; i++) { const a = -0.5 + i / 11 * 1.0; sc.sheet(featherSurface([-0.15 + 0.03 * i, 0.64, 0.3], norm3([-1, 0.12, 0.1 + a * 0.2]), 0.42, 0.045, { bend: 0.08, up: [0, 1, 0] }), { dens: 1, thick: 0.004, sym: "z", c: 0.72 + 0.05 * i / 11 }); }
    s.shade = (x, y, z, _nx, ny, _nz, t) => t + 0.05 * (vnoise(x * 14, y * 14, z * 14) - 0.5) * (0.5 + detail) - 0.05 * Math.max(0, ny);
    const rings = [0.95, 1.2, 1.45, 1.7].map((r) => { const l: V3[] = []; for (let i = 0; i <= 120; i++) { const a = i / 120 * 6.283; l.push([r * 1.15 * Math.cos(a) * 1, 0.0 + 0.012 * Math.sin(a * 9), r * Math.sin(a) * 0.9]); } return l; });
    sc.strands(rings, { r: 0.006, dens: 1.4, c0: 0.45, c1: 0.5, al: 0.6 });
    void rng;
  },
});

/* ───────────── Hummingbird ───────────── */
export const hummingbird = defineShape({
  id: "animal-hummingbird", name: "Hummingbird", tag: "Birds",
  description: "A hovering hummingbird with a long needle bill, iridescent throat, blurred raised wings and a forked tail.",
  palette: [[0, "#06211a"], [0.28, "#168a5a"], [0.52, "#3de0a8"], [0.78, "#ff3fa0"], [1, "#ffd6ef"]],
  count: 90000, size: 0.0058, fit: 1.25, camera: { distance: 4.4, yaw: 0.6, pitch: 0.15, autoRotate: 0.09 }, look: { glow: 0.8 },
  build(sc, { detail }) {
    const s = sc.solid(0.04);
    s.tube([[-0.2, -0.06, 0], [0.0, 0.07, 0], [0.18, 0.2, 0]], [0.04, 0.095, 0.085], { seg: 10, c: 0.4, k: 0.05 });
    s.sph([0.3, 0.28, 0], 0.075, { c: 0.42, k: 0.04 });
    s.cone([0.36, 0.27, 0], [0.88, 0.1, 0], 0.017, 0.003, { c: 0.1, k: 0.006 });
    s.sph([0.33, 0.32, 0.062], 0.014, { sym: "z", c: 0.0, k: 0.003, sz: 1.3 });
    s.ell([0.22, 0.16, 0], [0.1, 0.06, 0.07], { c: 0.88, k: 0.04 });
    s.shade = (x, y, z, _nx, ny, _nz, t) => { const gorget = sstep(0.18, 0.26, x) * (y < 0.24 ? 1 : 0) * (1 - sstep(0.3, 0.38, x)); return mixn(t, 0.85, gorget * 0.9) + 0.05 * (vnoise(x * 30, y * 30, z * 30) - 0.5) * detail - 0.03 * Math.max(0, ny); };
    for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.16; sc.sheet(featherSurface([-0.22, -0.16, 0], norm3([-0.8, -0.55, a]), 0.42, 0.038, { bend: 0.05, up: [0, 1, 0] }), { dens: 1, thick: 0.004, c: 0.3 + 0.08 * i }); }
    for (const side of [1, -1]) for (let i = 0; i < 9; i++) {
      const t = i / 8, d = norm3([-0.55 - 0.25 * t, 0.7 + 0.12 * t, side * (0.55 + 0.45 * t)]);
      sc.sheet(featherSurface([0.0, 0.14, side * 0.05], d, 0.55 * (1 - 0.1 * Math.abs(t - 0.5)) + 0.12 * t, 0.045 - 0.008 * t, { bend: 0.04, up: [0, 0, side] }), { dens: 0.7, thick: 0.003, c: (u) => 0.3 + 0.1 * u, al: 0.7 });
    }
  },
});

export const ANIMAL_SHAPES: GeneratorDef[] = [cat, stag, giraffe, elephant, penguin, owl, swan, hummingbird];
