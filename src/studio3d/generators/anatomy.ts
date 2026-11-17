import type { GeneratorDef } from "../types";
import { gnoise } from "../math";
import { defineShape, pointEmitter, sstep, mixn, type V3 } from "./sculpt";

const ANAT = "Human anatomy";
const SKIN: Array<[number, string]> = [[0, "#3d2233"], [0.22, "#9a5348"], [0.5, "#e2a47f"], [0.78, "#f8d3ab"], [1, "#fff4e0"]];

/* ───────────── Human brain ───────────── */
export const brain = defineShape({
  id: "nature-brain", name: "Human Brain", tag: ANAT,
  description: "Two folded cerebral hemispheres with a longitudinal fissure, frontal, temporal and occipital lobes, a folded cerebellum and the brainstem.",
  palette: [[0, "#3e1a3d"], [0.3, "#b0487a"], [0.55, "#ee8c92"], [0.8, "#ffc9a8"], [1, "#fff3e4"]],
  count: 90000, size: 0.0066, camera: { distance: 4.0, yaw: 0.95, pitch: 0.22 }, look: { glow: 0.45 },
  build(sc, { detail }) {
    const s = sc.solid(0.012);
    s.ell([0.02, 0.07, 0.34], [0.88, 0.53, 0.37], { sym: "z", c: 0.5 });          // parietal / central mass
    s.ell([0.52, 0.0, 0.31], [0.39, 0.4, 0.31], { sym: "z", c: 0.3 });              // frontal lobe
    s.ell([-0.53, 0.0, 0.3], [0.36, 0.36, 0.29], { sym: "z", c: 0.82 });            // occipital lobe
    s.ell([0.12, -0.33, 0.52], [0.5, 0.19, 0.2], { sym: "z", rot: [0, 0.1, 0.1], c: 0.65 }); // temporal lobe
    s.ell([-0.52, -0.43, 0.17], [0.31, 0.19, 0.25], { sym: "z", rot: [0, 0, 0.15], c: 0.34 });          // cerebellum
    s.tube([[-0.12, -0.4, 0], [-0.2, -0.72, 0], [-0.27, -1.03, 0]], [0.13, 0.09, 0.07], { c: 0.96, seg: 10 });
    const isCereb = (x: number, y: number) => x < -0.2 && y < -0.28 && y > -0.75;
    const isStem = (x: number, y: number, z: number) => y < -0.52 || (Math.abs(z) < 0.16 && y < -0.42 && x < -0.05);
    const groove = (x: number, y: number, z: number) => {
      const wx = x + 0.12 * gnoise(y * 3 + 1, z * 3, x * 3), wy = y + 0.12 * gnoise(z * 3 + 7, x * 3, y * 3), wz = z + 0.12 * gnoise(x * 3 + 3, y * 3, z * 3 + 5);
      const a = Math.abs(gnoise(wx * 4.3 + 1.7, wy * 4.3, wz * 4.3 + 9.1)), b = Math.abs(gnoise(wx * 8.2 + 5, wy * 8.2 + 2, wz * 8.2));
      let g = Math.min(1, 1 - sstep(0.02, 0.11, a) + 0.8 * (1 - sstep(0.015, 0.075, b)));
      const cs = 1 - sstep(0.006, 0.02, Math.abs(Math.abs(x) * 0 + x - (-0.05 + 0.58 * (0.5 - y)))); // central sulcus
      g = Math.max(g, cs * sstep(0.0, 0.12, y + 0.05) * sstep(0.08, 0.2, Math.abs(z) + (y > 0.3 ? 0.2 : 0)));
      return g;
    };
    s.disp = (x, y, z) => {
      if (isStem(x, y, z)) return 0;
      if (isCereb(x, y)) return -0.016 * (0.4 + detail) * (0.5 + 0.5 * Math.cos(y * 118 + 2 * gnoise(x * 4, 0, z * 4)));
      const g = groove(x, y, z);
      return (-0.06 * g + 0.014 * (1 - g)) * (0.4 + detail * 1.2);
    };
    s.shade = (x, y, z, _nx, _ny, _nz, t) => {
      if (isStem(x, y, z)) return 0.95;
      if (isCereb(x, y)) return 0.34 + 0.3 * (0.5 + 0.5 * Math.cos(y * 118));
      const g = groove(x, y, z);
      return Math.min(1, t * 0.5 + 0.5 * (1 - g * 0.9) + 0.02);
    };
  },
});

/* ───────────── Human skull ───────────── */
export const skull = defineShape({
  id: "nature-skull", name: "Human Skull", tag: ANAT,
  description: "An anatomical skull: domed cranium with sutures, deep orbits, nasal aperture, cheekbones, maxilla and teeth, and a separate mandible.",
  palette: [[0, "#2a2118"], [0.3, "#7d6a52"], [0.6, "#d8c7a6"], [0.85, "#f4ead2"], [1, "#fffaf0"]],
  count: 80000, size: 0.0068, camera: { distance: 3.7, yaw: 0.55, pitch: 0.1 },
  build(sc, { detail }) {
    const s = sc.solid(0.02), B = 0.62;
    s.ell([0, 0.16, -0.07], [0.34, 0.355, 0.43], { c: B });                                  // cranium
    s.ell([0, 0.12, 0.17], [0.25, 0.2, 0.15], { c: B });                                      // frontal bone
    s.ell([0, -0.11, 0.17], [0.235, 0.21, 0.2], { c: B + 0.05 });                            // maxilla
    s.ell([0, 0.1, 0.31], [0.245, 0.03, 0.05], { c: B + 0.1 });                               // brow ridge
    s.ell([0.27, -0.03, 0.19], [0.09, 0.065, 0.075], { sym: true, rot: [0, -0.35, 0.2], c: B + 0.12 }); // zygomatic bones
    s.tube([[0.3, -0.03, 0.18], [0.35, -0.03, 0.02], [0.33, -0.02, -0.12]], [0.032, 0.026, 0.03], { sym: true, seg: 8, c: B + 0.12 }); // zygomatic arch
    s.ell([0.15, 0.0, 0.3], [0.105, 0.09, 0.12], { sym: true, neg: true, k: 0.02 });         // orbits
    s.ell([0, -0.1, 0.34], [0.05, 0.075, 0.11], { neg: true, k: 0.015 });                     // nasal aperture
    s.ell([0, -0.01, 0.36], [0.035, 0.05, 0.04], { c: B + 0.1 });                            // nasal bone
    s.cone([0, -0.19, 0.33], [0, -0.17, 0.4], 0.014, 0.006, { c: 0.9 });                     // nasal spine
    for (let i = 0; i < 14; i++) { // upper teeth along the arch
      const a = (-0.5 + i / 13) * Math.PI * 0.95, x = Math.sin(a) * 0.15, z = 0.17 + Math.cos(a) * 0.14 - 0.0;
      s.ell([x, -0.285, z], [0.021, 0.034, 0.016], { dir: [Math.cos(a), 0, -Math.sin(a)], c: 1, k: 0.004 });
    }
    s.ell([0, -0.265, 0.15], [0.17, 0.045, 0.14], { c: B });                                 // alveolar process
    // mandible: a blade-like U of oriented ellipsoids, ramus up to the condyle
    const jaw: V3[] = [[0.31, -0.13, -0.11], [0.305, -0.3, -0.09], [0.275, -0.42, -0.03], [0.2, -0.47, 0.1], [0.1, -0.49, 0.22], [0.0, -0.5, 0.27]];
    for (let i = 0; i < jaw.length - 1; i++) {
      const p = jaw[i], q = jaw[i + 1], d: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(d[0], d[1], d[2]);
      s.ell([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], [L * 0.85, i < 2 ? 0.075 : 0.05, 0.026], { dir: d, up: i < 2 ? [0, 0, 1] : [0, 1, 0], sym: true, c: B - 0.04, k: 0.03 });
    }
    s.ell([0.3, -0.25, -0.075], [0.022, 0.13, 0.085], { sym: true, c: B - 0.05 });          // ramus plate
    s.cone([0.3, -0.12, -0.04], [0.285, 0.0, 0.0], 0.02, 0.01, { sym: true, c: B - 0.02 }); // coronoid process
    s.sph([0.31, -0.12, -0.12], 0.03, { sym: true, c: B });                                  // condyle
    s.ell([0, -0.46, 0.27], [0.09, 0.05, 0.045], { c: B + 0.05 });                           // chin
    for (let i = 0; i < 14; i++) {
      const a = (-0.5 + i / 13) * Math.PI * 0.95, x = Math.sin(a) * 0.135, z = 0.16 + Math.cos(a) * 0.13;
      s.ell([x, -0.355, z], [0.019, 0.03, 0.015], { dir: [Math.cos(a), 0, -Math.sin(a)], c: 1, k: 0.004 });
    }
    s.ell([0, -0.4, 0.12], [0.17, 0.06, 0.13], { c: B - 0.04 });
    s.disp = (x, y, z) => {
      const cor = 1 - sstep(0.004, 0.012, Math.abs(z - (0.07 - 0.1 * (y - 0.3)))), sag = 1 - sstep(0.003, 0.009, Math.abs(x)), lam = 1 - sstep(0.004, 0.012, Math.abs(z + 0.2 + 0.2 * Math.abs(x)));
      const g = Math.max(cor * (y > 0.18 ? 1 : 0), sag * (y > 0.28 ? 1 : 0), lam * (y > 0.1 ? 1 : 0));
      return -0.012 * g * detail * 1.8 + 0.004 * gnoise(x * 12, y * 12, z * 12) * detail;
    };
    s.shade = (x, y, z, _nx, _ny, _nz, t) => Math.min(1, t + 0.1 * gnoise(x * 5, y * 5, z * 5));
  },
});

/* ───────────── Human face ───────────── */
export const face = defineShape({
  id: "form-human-face", name: "Human Face", tag: ANAT,
  description: "A sculpted human head and bust: brow, deep-set eyes with lids and irises, nose with nostrils, lips, cheekbones, jaw, ears, brows and hair.",
  palette: SKIN, count: 90000, size: 0.0062, fit: 1.1, camera: { distance: 3.4, yaw: 0, pitch: 0.04, autoRotate: 0.05 }, look: { glow: 0.35, lighting: 0.5 },
  build(sc, { detail }) {
    const s = sc.solid(0.035), K = 0.56;
    s.ell([0, 0.16, -0.05], [0.335, 0.37, 0.41], { c: K });
    s.ell([0, -0.04, 0.08], [0.285, 0.36, 0.28], { c: K });
    s.ell([0, -0.24, 0.12], [0.19, 0.15, 0.19], { c: K });
    s.ell([0, -0.34, 0.2], [0.1, 0.07, 0.088], { c: K });
    s.ell([0.15, -0.22, 0.02], [0.075, 0.14, 0.12], { sym: true, rot: [0, 0, 0.25], c: K });
    s.ell([0.2, 0.0, 0.2], [0.11, 0.065, 0.08], { sym: true, rot: [0, -0.3, 0.2], c: K + 0.03 });
    s.ell([0, 0.19, 0.27], [0.27, 0.05, 0.075], { c: K });
    s.ell([0, 0.3, 0.2], [0.25, 0.19, 0.17], { c: K });
    // nose
    s.cone([0, 0.12, 0.26], [0, -0.07, 0.372], 0.03, 0.044, { c: K, k: 0.03 });
    s.sph([0, -0.082, 0.378], 0.05, { c: K + 0.02, k: 0.02 });
    s.ell([0.052, -0.085, 0.335], [0.034, 0.04, 0.04], { sym: true, c: K });
    s.ell([0.028, -0.108, 0.354], [0.017, 0.011, 0.022], { sym: true, neg: true, k: 0.01 });
    // eyes
    s.ell([0.118, 0.115, 0.262], [0.078, 0.054, 0.06], { sym: true, neg: true, k: 0.03 });
    s.sph([0.118, 0.112, 0.234], 0.059, { sym: true, c: 0.98, k: 0.004, sz: 1.2 });
    s.ell([0.118, 0.112, 0.288], [0.036, 0.036, 0.013], { sym: true, c: 0.1, k: 0.004, sz: 1.2 });
    s.ell([0.118, 0.112, 0.298], [0.015, 0.015, 0.006], { sym: true, c: 0.0, k: 0.002 });
    s.ell([0.118, 0.152, 0.262], [0.073, 0.02, 0.04], { sym: true, rot: [0.5, 0, 0], c: K + 0.02, k: 0.012 });
    s.ell([0.118, 0.072, 0.262], [0.068, 0.014, 0.036], { sym: true, rot: [-0.4, 0, 0], c: K, k: 0.012 });
    // mouth
    s.ell([0, -0.17, 0.318], [0.09, 0.023, 0.042], { c: 0.2, k: 0.012 });
    s.ell([0, -0.205, 0.314], [0.078, 0.029, 0.042], { c: 0.22, k: 0.012 });
    s.ell([0, -0.187, 0.347], [0.1, 0.005, 0.03], { neg: true, k: 0.004 });
    s.sph([0.095, -0.188, 0.298], 0.017, { sym: true, c: 0.3 });
    // ears + neck + shoulders
    s.ell([0.338, 0.0, -0.02], [0.03, 0.095, 0.065], { sym: true, rot: [0, 0.3, 0], c: K - 0.04 });
    s.ell([0.347, 0.0, 0.0], [0.025, 0.05, 0.035], { sym: true, neg: true });
    s.tube([[0, -0.28, -0.04], [0, -0.5, -0.06], [0, -0.74, -0.07]], [0.135, 0.14, 0.155], { c: K - 0.04 });
    s.cone([0.08, -0.55, -0.05], [0.4, -0.78, -0.05], 0.085, 0.075, { sym: true, c: K - 0.04 });
    s.ell([0, -0.8, -0.06], [0.46, 0.09, 0.19], { c: K - 0.06 });
    s.disp = (x, y, z) => 0.0035 * detail * gnoise(x * 24, y * 24, z * 24);
    // eyebrows
    const brow = (side: number): V3[] => [0, 1, 2, 3, 4, 5].map((i) => [side * (0.05 + i * 0.034), 0.222 + 0.028 * Math.sin((i / 5) * Math.PI) + 0.002 * i, 0.298 - i * 0.012]);
    sc.strands([brow(1), brow(-1)], { r: 0.0085, dens: 3.2, c0: 0.03, c1: 0.06, sz: 1.1 });
    // hair shell
    sc.add(pointEmitter(3.2, (rng, o) => {
      for (let tries = 0; tries < 30; tries++) {
        const zz = rng.next() * 2 - 1, a = rng.next() * Math.PI * 2, r = Math.sqrt(1 - zz * zz), dx = r * Math.cos(a), dy = zz, dz = r * Math.sin(a);
        const px = 0.345 * dx, py = 0.385 * dy + 0.17, pz = 0.425 * dz - 0.05;
        const line = mixn(0.37, -0.14, sstep(0.28, -0.3, pz)), side = Math.abs(px) > 0.27 ? 0.06 : 9;
        if (py < Math.min(line, side) || pz > 0.36) continue;
        const bump = 0.03 + 0.03 * gnoise(px * 14, py * 14, pz * 14) + 0.012 * gnoise(px * 40, py * 40, pz * 40);
        const k = 1 + bump / 0.4;
        o[0] = px * k; o[1] = (py - 0.17) * k + 0.17; o[2] = (pz + 0.05) * k - 0.05; o[3] = dx; o[4] = dy; o[5] = dz; o[6] = 0.05 + 0.07 * rng.next(); o[7] = 1; o[8] = 0.9;
        return;
      }
      o[0] = 0; o[1] = 0.5; o[2] = -0.1; o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0.05;
    }));
  },
});

/* ───────────── Human body (anatomical mannequin) ───────────── */
export const body = defineShape({
  id: "form-human-body", name: "Human Body", tag: ANAT,
  description: "A standing human figure in eight-head proportions: head with face, neck, shoulders, chest, waist, hips, arms with hands and fingers, and legs with feet.",
  palette: SKIN, count: 90000, size: 0.0058, fit: 1.25, camera: { distance: 4.6, yaw: 0.25, pitch: 0.06, autoRotate: 0.08 }, look: { glow: 0.35 },
  build(sc, { detail }) {
    const s = sc.solid(0.04), K = 0.55;
    // head
    s.ell([0, 0.885, 0], [0.098, 0.122, 0.112], { c: K });
    s.ell([0, 0.83, 0.025], [0.083, 0.098, 0.088], { c: K });
    s.ell([0, 0.775, 0.05], [0.04, 0.03, 0.04], { c: K });
    s.ell([0.093, 0.885, -0.0], [0.014, 0.034, 0.022], { sym: true, c: K - 0.05 });
    s.cone([0, 0.87, 0.085], [0, 0.835, 0.122], 0.011, 0.018, { c: K + 0.02 });
    s.sph([0.035, 0.885, 0.092], 0.012, { sym: true, c: 0.95, k: 0.004 });
    s.tube([[0, 0.76, -0.01], [0, 0.69, -0.012], [0, 0.64, 0]], [0.047, 0.05, 0.056], { c: K - 0.04, seg: 6 });
    // torso
    s.loft([[0, 0.64, 0], [0, 0.5, 0], [0, 0.34, 0], [0, 0.18, 0], [0, 0.04, 0]], [0.17, 0.19, 0.155, 0.135, 0.165], [0.085, 0.115, 0.1, 0.09, 0.105], { up: [0, 0, 1], seg: 20, c: K, overlap: 1.6 });
    s.ell([0.085, 0.49, 0.065], [0.088, 0.062, 0.045], { sym: true, c: K + 0.04 });  // pectorals
    s.ell([0.1, -0.005, -0.075], [0.085, 0.085, 0.09], { sym: true, c: K });          // glutes
    s.ell([0.05, 0.26, 0.08], [0.04, 0.09, 0.025], { sym: true, c: K + 0.02 });       // abdominals
    // shoulders and arms (A pose)
    s.sph([0.235, 0.58, 0], 0.066, { sym: true, c: K });
    s.cone([0.235, 0.58, 0], [0.31, 0.32, 0.005], 0.058, 0.043, { sym: true, c: K });
    s.cone([0.31, 0.32, 0.005], [0.375, 0.07, 0.03], 0.043, 0.027, { sym: true, c: K });
    s.ell([0.33, 0.25, 0.012], [0.04, 0.085, 0.04], { sym: true, rot: [0, 0, -0.25], c: K });
    // hands
    for (const side of [1, -1]) {
      const wx = 0.375 * side, palm: V3 = [wx + 0.012 * side, 0.01, 0.034];
      s.ell(palm, [0.026, 0.05, 0.016], { c: K + 0.03, k: 0.01 });
      const fingers: Array<[number, number, number]> = [[-0.016, 0.1, 0.0], [-0.006, 0.108, 0.0], [0.006, 0.1, 0.0], [0.016, 0.082, 0.0]];
      fingers.forEach(([dx, len], i) => {
        const bx = palm[0] + dx * side, by = -0.04 - 0.002 * i;
        s.tube([[bx, palm[1] - 0.02, palm[2]], [bx + 0.005 * side * (i - 1), by - len * 0.5, palm[2] + 0.004], [bx + 0.009 * side * (i - 1), by - len, palm[2] + 0.012]], [0.0105, 0.0085, 0.0065], { seg: 4, c: K + 0.03, k: 0.006 });
        void fingers;
      });
      s.tube([[palm[0] - 0.02 * side, 0.0, palm[2] + 0.01], [palm[0] - 0.04 * side, -0.035, palm[2] + 0.02], [palm[0] - 0.045 * side, -0.07, palm[2] + 0.034]], [0.014, 0.0115, 0.009], { seg: 4, c: K + 0.03, k: 0.006 });
    }
    // legs
    s.cone([0.087, 0.02, 0], [0.098, -0.5, 0.012], 0.092, 0.054, { sym: true, c: K });
    s.ell([0.1, -0.14, 0.02], [0.09, 0.2, 0.085], { sym: true, rot: [0, 0, 0.03], c: K });
    s.cone([0.098, -0.5, 0.012], [0.095, -0.93, -0.005], 0.054, 0.032, { sym: true, c: K });
    s.ell([0.1, -0.66, -0.028], [0.048, 0.12, 0.05], { sym: true, c: K });
    s.sph([0.098, -0.5, 0.015], 0.052, { sym: true, c: K });
    s.ell([0.095, -0.975, 0.06], [0.04, 0.026, 0.105], { sym: true, c: K + 0.02 });
    s.ell([0.096, -0.985, 0.14], [0.044, 0.016, 0.04], { sym: true, c: K + 0.03 });
    s.disp = (x, y, z) => 0.0025 * detail * gnoise(x * 30, y * 30, z * 30);
    // short hair cap
    sc.add(pointEmitter(0.14, (rng, o) => {
      for (let t = 0; t < 20; t++) {
        const zz = rng.next() * 2 - 1, a = rng.next() * Math.PI * 2, r = Math.sqrt(1 - zz * zz), dx = r * Math.cos(a), dy = zz, dz = r * Math.sin(a);
        if (dy < 0.18 || (dz > 0.45 && dy < 0.55)) continue;
        const k = 1.06 + 0.015 * gnoise(dx * 9, dy * 9, dz * 9);
        o[0] = 0.098 * dx * k; o[1] = 0.885 + 0.122 * dy * k; o[2] = 0.112 * dz * k; o[3] = dx; o[4] = dy; o[5] = dz; o[6] = 0.06 + 0.06 * rng.next(); return;
      }
      o[0] = 0; o[1] = 1.0; o[2] = 0; o[6] = 0.06;
    }));
  },
});

/* ───────────── Human hand ───────────── */
export const hand = defineShape({
  id: "form-human-hand", name: "Human Hand", tag: ANAT,
  description: "An open right hand, palm toward you: palm with thenar pad, four fingers with knuckles and nails, an opposable thumb and the wrist.",
  palette: SKIN, count: 80000, size: 0.0056, fit: 1.2, camera: { distance: 3.7, yaw: 0.3, pitch: 0.1 }, look: { glow: 0.35 },
  build(sc, { detail }) {
    const s = sc.solid(0.03), K = 0.56;
    s.ell([0, 0.0, 0], [0.215, 0.2, 0.055], { c: K });
    s.ell([-0.12, -0.08, 0.04], [0.08, 0.12, 0.04], { c: K + 0.03, rot: [0, 0, 0.35] });
    s.ell([0.09, -0.1, 0.03], [0.075, 0.08, 0.032], { c: K, rot: [0, 0, -0.2] });
    s.tube([[0, -0.15, 0], [0, -0.32, 0], [0, -0.52, -0.01]], [0.085, 0.07, 0.068], { c: K - 0.04, seg: 6 });
    const base = [[-0.138, 0.18], [-0.047, 0.2], [0.045, 0.192], [0.134, 0.15]], len = [0.34, 0.375, 0.35, 0.27], splay = [-0.08, -0.02, 0.05, 0.14], curl = [0.03, 0.025, 0.03, 0.04];
    base.forEach(([bx, by], i) => {
      const L = len[i], d: V3 = [Math.sin(splay[i]), Math.cos(splay[i]), 0], p = (t: number, dz: number): V3 => [bx + d[0] * L * t, by + d[1] * L * t, 0.01 + dz];
      const pts = [p(0, 0), p(0.43, curl[i] * 0.5), p(0.72, curl[i]), p(1, curl[i] * 1.4)];
      s.tube(pts, [0.05 - i * 0.003, 0.044 - i * 0.003, 0.038 - i * 0.0026, 0.032 - i * 0.002], { seg: 12, c: K + 0.02, k: 0.012 });
      s.sph(p(0.0, 0.02), 0.052 - i * 0.003, { c: K + 0.04, k: 0.01 });     // knuckle
      s.ell(p(0.97, curl[i] * 1.4 + 0.018), [0.034, 0.026, 0.0085], { dir: [d[0], d[1], 0], c: 0.85, k: 0.004, up: [0, 0, 1] }); // nail
    });
    const th: V3[] = [[-0.15, -0.03, 0.03], [-0.29, 0.03, 0.05], [-0.38, 0.14, 0.055], [-0.43, 0.27, 0.05], [-0.455, 0.37, 0.04]];
    s.tube(th, [0.072, 0.058, 0.05, 0.043, 0.037], { seg: 12, c: K + 0.02, k: 0.012 });
    s.ell([-0.45, 0.365, 0.062], [0.028, 0.02, 0.008], { dir: [-0.2, 1, 0], up: [0, 0, 1], c: 0.85, k: 0.004 });
    s.disp = (x, y, z) => 0.0028 * detail * gnoise(x * 34, y * 34, z * 34) - 0.004 * detail * (1 - sstep(0, 0.012, Math.abs(Math.sin(y * 70)))) * (z > 0.03 && y > 0.14 ? 1 : 0);
  },
});

export const ANATOMY_SHAPES: GeneratorDef[] = [brain, skull, face, body, hand];
