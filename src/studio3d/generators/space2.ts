import { defineShape, splinePoints, type V3 } from "./sculpt";
import { TAU, circle, disc, torus, box, quad, xf, rotZ } from "./objkit";
import { SPACE, put, unitRand, clamp, smooth, ridge, fbm, vnoise, cyl, balls, type Ball } from "./spacekit";

const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/* ───────────── Comet ───────────── */
export const comet = defineShape({
  id: "space-comet", name: "Comet", tag: SPACE,
  description: "A comet near the Sun: a dark, bi-lobed icy nucleus with active gas jets, a glowing green-blue coma, a broad curved yellow dust tail and a long, straight, filamentary blue ion tail pointing away from the Sun.",
  palette: [[0, "#1e1a16"], [0.1, "#5a4d40"], [0.25, "#16408a"], [0.45, "#34c8ff"], [0.65, "#b8f4ff"], [0.82, "#ffe9b0"], [1, "#ffffff"]],
  count: 130000, size: 0.0044, fit: 1.5, camera: { distance: 7.5, yaw: 0.5, pitch: 0.2, autoRotate: 0.08 },
  build(sc) {
    const nuc = sc.solid(0.08);
    nuc.ell([0, 0, 0], [0.26, 0.19, 0.17], { c: 0.06, dens: 2.2, rot: [0.2, 0.3, 0.1] });
    nuc.ell([-0.17, 0.04, 0.02], [0.17, 0.14, 0.13], { c: 0.06, dens: 2.2, rot: [0.1, -0.2, 0.2] });
    nuc.disp = (x, y, z) => 0.03 * (fbm(x * 6, y * 6, z * 6) - 0.5) + 0.008 * (vnoise(x * 22, y * 22, z * 22) - 0.5);
    nuc.shade = (x, y, z) => clamp(0.04 + 0.1 * fbm(x * 8, y * 8, z * 8) + (x > 0.08 ? 0.12 * ridge(x * 10, y * 10, z * 10) : 0), 0, 0.3);
    const jets: V3[][] = [];
    for (const [dx, dy, dz, L] of [[1, 0.2, 0.3, 0.8], [0.9, -0.3, -0.35, 0.65], [0.8, 0.5, -0.3, 0.55], [0.95, 0.0, 0.1, 0.9], [0.7, -0.5, 0.4, 0.5]] as number[][]) {
      const d = norm([dx, dy, dz]); const ln: V3[] = [];
      for (let s = 0; s <= 10; s++) { const t = s / 10; ln.push([0.22 + d[0] * L * t * 0.9 - 1.4 * t * t * L * 0.5, d[1] * L * t * (1 - 0.3 * t), d[2] * L * t * (1 - 0.3 * t)]); }
      jets.push(ln);
    }
    sc.strands(jets, { r: 0.012, dens: 0.7, c0: 0.78, c1: 0.55, taper: true, al: 0.85 });
    sc.points(9, (r, o) => { const d = unitRand(r), rad = 0.18 - 0.12 * Math.log(1 - r.next() * 0.97) * (d[0] > 0 ? 0.65 : 1.5); put(o, [d[0] * rad, d[1] * rad, d[2] * rad], d, 0.5 + 0.18 * (1 - smooth(0.2, 1, rad)), 0.8, 0.25 + 0.4 * (1 - smooth(0.2, 1.0, rad))); }); // coma
    sc.points(20, (r, o) => { // dust tail: curved fan
      const s = Math.pow(r.next(), 1.5), x = -0.2 - 3.4 * s, w = 0.1 + 0.62 * s, bend = 0.5 * s * s * 3.4;
      const ang = (r.next() - 0.5) * 2 * (0.6 + 0.4 * s), rad = w * Math.sqrt(r.next());
      put(o, [x, rad * Math.sin(ang * 1.7) * 0.5 + 0.2 * w * r.gauss(), bend + rad * Math.cos(ang) * 0.9 * Math.sign(ang || 1) * 0.35 + w * 0.25 * r.gauss()], unitRand(r), 0.9 - 0.2 * s + 0.06 * (r.next() - 0.5), 0.8, (0.22 + 0.5 * (1 - s)) * (0.6 + 0.4 * fbm(s * 5, ang * 2, 1)));
    });
    const syn: V3[][] = [];
    for (let k = 0; k < 14; k++) { const sp = (k / 13 - 0.5) * 1.8, ln: V3[] = []; for (let i = 0; i <= 18; i++) { const s = i / 18; ln.push([-0.2 - 3.4 * s, 0.05 * Math.sin(k + s * 5), 0.5 * s * s * 3.4 + sp * (0.1 + 0.55 * s) * 0.5]); } syn.push(ln); }
    sc.strands(syn, { r: 0.012, dens: 0.14, c0: 0.88, c1: 0.78, al: 0.45, sz: 0.9 });
    sc.points(14, (r, o) => { // ion tail: straight, narrow, braided into filaments
      const s = Math.pow(r.next(), 1.2), x = -0.15 - 4.0 * s, k = r.int(11), ph = (k / 11) * TAU + 2.6 * s + 0.4 * Math.sin(s * 9 + k), w = (0.05 + 0.07 * s) * (0.35 + 0.65 * (k % 3) / 2), kink = 0.08 * Math.sin(s * 14 + k * 1.7) * s;
      put(o, [x, w * Math.cos(ph) + kink + 0.012 * r.gauss(), w * Math.sin(ph) + 0.01 * r.gauss()], unitRand(r), 0.3 + 0.2 * r.next(), 0.8, (0.7 - 0.45 * s) * (0.7 + 0.3 * r.next()));
    });
    const ions: V3[][] = [];
    for (let k = 0; k < 10; k++) { const ln: V3[] = []; for (let i = 0; i <= 24; i++) { const s = i / 24, w = (0.04 + 0.06 * s) * (0.4 + 0.6 * (k % 3) / 2), ph = (k / 10) * TAU + 2.6 * s; ln.push([-0.15 - 4.0 * s, w * Math.cos(ph) + 0.06 * s * Math.sin(s * 9 + k), w * Math.sin(ph)]); } ions.push(ln); }
    sc.strands(ions, { r: 0.004, dens: 0.35, c0: 0.5, c1: 0.28, al: 0.7 });
  },
});

/* ───────────── Supernova remnant ───────────── */
export const supernova = defineShape({
  id: "space-supernova", name: "Supernova", tag: SPACE,
  description: "A young supernova remnant in the manner of Cassiopeia A and the Crab: a lumpy shell of ejecta woven into red and green filaments, radial streaks of fast knots, a bright pulsar-wind core with equatorial ring and jets, and a faint outer blast wave.",
  palette: [[0, "#14031c"], [0.2, "#7a0a5a"], [0.4, "#ff3a3a"], [0.55, "#ffa030"], [0.7, "#6affc0"], [0.85, "#9ad0ff"], [1, "#ffffff"]],
  count: 130000, size: 0.0046, fit: 1.5, camera: { distance: 6, yaw: 0.5, pitch: 0.25, autoRotate: 0.07 },
  deformers: [{ type: "breathe", amount: 0.015, speed: 0.8 }],
  build(sc) {
    const R = (d: V3) => 1 + 0.2 * (fbm(d[0] * 2.2 + 4, d[1] * 2.2, d[2] * 2.2) - 0.5) * 2;
    const filament = (d: V3, k: number) => Math.pow(ridge(d[0] * k, d[1] * k, d[2] * k), 3);
    sc.points(30, (r, o) => { // outer shell filaments
      let d = unitRand(r); for (let i = 0; i < 10 && r.next() > 0.12 + 0.88 * filament(d, 3.4); i++) d = unitRand(r);
      const rad = R(d) + r.gauss() * 0.026, g = fbm(d[0] * 5, d[1] * 5, d[2] * 5), t = g > 0.56 ? 0.68 + 0.08 * r.next() : 0.38 + 0.22 * r.next();
      put(o, [d[0] * rad, d[1] * rad, d[2] * rad], d, t, 0.8 + 0.5 * r.next(), 0.45 + 0.5 * r.next());
    });
    sc.points(9, (r, o) => { // inner reverse-shock shell
      let d = unitRand(r); for (let i = 0; i < 8 && r.next() > 0.1 + 0.9 * filament(d, 2.4); i++) d = unitRand(r);
      const rad = 0.62 * R(d) + r.gauss() * 0.03; put(o, [d[0] * rad, d[1] * rad, d[2] * rad], d, 0.45 + 0.15 * r.next(), 0.8, 0.5);
    });
    const knots: V3[] = []; for (let i = 0; i < 70; i++) { const d = unitRand(sc.rng), rad = R(d) * (0.85 + 0.15 * sc.rng.next()); knots.push([d[0] * rad, d[1] * rad, d[2] * rad]); }
    sc.points(8, (r, o) => { const k = knots[r.int(knots.length)], s = 0.035 * Math.sqrt(r.next()), d = unitRand(r); put(o, [k[0] + d[0] * s, k[1] + d[1] * s, k[2] + d[2] * s], d, 0.5 + 0.2 * r.next(), 1.5, 0.95); });
    const streaks: V3[][] = [];
    for (let i = 0; i < 110; i++) { const d = unitRand(sc.rng), a = 0.15 + 0.5 * sc.rng.next(), b = R(d) * (0.8 + 0.2 * sc.rng.next()); streaks.push([[d[0] * a, d[1] * a, d[2] * a], [d[0] * b, d[1] * b, d[2] * b]]); }
    sc.strands(streaks, { r: 0.004, dens: 0.22, c0: 0.3, c1: 0.55, al: 0.55, taper: true });
    sc.points(5, (r, o) => { const d = unitRand(r), rad = 0.1 + 0.07 * r.gauss(); put(o, [d[0] * Math.abs(rad), d[1] * Math.abs(rad), d[2] * Math.abs(rad)], d, 0.9 + 0.1 * r.next(), 1.1, 0.9); }); // pulsar-wind core
    sc.points(3, (r, o) => { const a = r.next() * TAU, rad = 0.2 + 0.03 * r.gauss(), tilt = 0.5; const x = rad * Math.cos(a), y0 = 0.02 * r.gauss(), z = rad * Math.sin(a); put(o, [x, y0 * Math.cos(tilt) - z * Math.sin(tilt) * 0.3, z], [0, 1, 0], 0.88 + 0.1 * r.next(), 1, 0.85); });
    sc.points(2.4, (r, o) => { const h = 0.1 + 0.55 * Math.pow(r.next(), 1.2), sg = r.next() < 0.5 ? 1 : -1, ph = r.next() * TAU, rho = (0.02 + 0.05 * h) * Math.sqrt(r.next()); put(o, [rho * Math.cos(ph), sg * h, rho * Math.sin(ph)], [0, 1, 0], 0.92, 1, 0.8 * (1 - 0.5 * h)); });
    sc.points(5, (r, o) => { const d = unitRand(r), n = fbm(d[0] * 3, d[1] * 3, d[2] * 3); if (n < 0.4) { const e = unitRand(r); d[0] = e[0]; d[1] = e[1]; d[2] = e[2]; } const rad = 1.4 * (1 + 0.04 * (fbm(d[0] * 2, d[1] * 2, d[2] * 2) - 0.5)) + r.gauss() * 0.012; put(o, [d[0] * rad, d[1] * rad, d[2] * rad], d, 0.17 + 0.06 * r.next(), 0.8, 0.28); }); // blast wave
  },
});

/* ───────────── Globular star cluster ───────────── */
export const starCluster = defineShape({
  id: "space-star-cluster", name: "Cosmic Star Cluster", tag: SPACE,
  description: "A globular cluster in the style of M13: a hundred thousand stars following a Plummer density profile, crowded into a blazing yellow core with orange red giants, scattered blue stragglers, and a few bright foreground stars with diffraction spikes.",
  palette: [[0, "#0c0a24"], [0.25, "#3a50ff"], [0.45, "#bcd0ff"], [0.65, "#fff0d0"], [0.82, "#ffc060"], [1, "#ff8a40"]],
  count: 120000, size: 0.0038, fit: 1.5, camera: { distance: 6, yaw: 0.3, pitch: 0.2, autoRotate: 0.06 },
  build(sc) {
    const plummer = (r: { next(): number }, a: number, max: number): number => { let rad = max + 1; for (let i = 0; i < 12 && rad > max; i++) { const u = clamp(r.next(), 1e-4, 0.9999); rad = a / Math.sqrt(Math.pow(u, -2 / 3) - 1); } return Math.min(rad, max); };
    sc.points(40, (r, o) => {
      const d = unitRand(r), rad = plummer(r, 0.42, 2.4), q = r.next(); let t: number, sz: number;
      if (q < 0.07) { t = 0.28 + 0.15 * r.next(); sz = 1.0; } // blue stragglers / horizontal branch
      else if (q < 0.2) { t = 0.9 + 0.1 * r.next(); sz = 1.5 + 0.6 * r.next(); } // red giants
      else { t = 0.58 + 0.2 * r.next(); sz = 0.6 + 0.5 * r.next(); }
      put(o, [d[0] * rad, d[1] * rad, d[2] * rad], d, t, sz, clamp(0.45 + 0.6 * (1 - smooth(0, 2.2, rad)) * r.next() + 0.2 * r.next(), 0.3, 1));
    });
    sc.points(5, (r, o) => { const d = unitRand(r), rad = plummer(r, 1.1, 2.6); put(o, [d[0] * rad, d[1] * rad, d[2] * rad], d, 0.45 + 0.3 * r.next(), 0.6, 0.22); }); // unresolved halo glow
    sc.points(4, (r, o) => { const d = unitRand(r), rad = plummer(r, 0.14, 0.5); put(o, [d[0] * rad, d[1] * rad, d[2] * rad], d, 0.7 + 0.15 * r.next(), 1.1, 0.8); }); // saturated core
    const spikes: V3[][] = [], glow: V3[] = [];
    for (let i = 0; i < 7; i++) { const d = unitRand(sc.rng), rad = 0.5 + 1.5 * sc.rng.next(), c: V3 = [d[0] * rad, d[1] * rad, d[2] * rad], L = 0.28 + 0.2 * sc.rng.next(), ph = sc.rng.next() * 3; glow.push(c); for (let k = 0; k < 2; k++) { const a = ph + k * Math.PI / 2, e: V3 = [Math.cos(a) * L, Math.sin(a) * L, 0]; spikes.push([add(c, e, -1), c, add(c, e, 1)]); } }
    sc.strands(spikes, { r: 0.004, dens: 0.3, c0: 0.5, c1: 0.5, al: 0.85, taper: false });
    sc.points(1.4, (r, o) => { const c = glow[r.int(glow.length)], d = unitRand(r), s = Math.abs(r.gauss()) * 0.022; put(o, [c[0] + d[0] * s, c[1] + d[1] * s, c[2] + d[2] * s], d, 0.45 + 0.2 * r.next(), 2.2, 1); });
  },
});

/* ───────────── Planetary system ───────────── */
const ORB = [0.5, 0.72, 0.95, 1.2, 1.66, 2.1, 2.5, 2.86];
const PR = [0.03, 0.055, 0.058, 0.04, 0.15, 0.125, 0.085, 0.082];
const PT = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
const PA = [0.6, 2.4, 4.1, 5.5, 1.2, 3.4, 5.0, 0.2];
export const planetarySystem = defineShape({
  id: "space-planetary-system", name: "Planetary System", tag: SPACE,
  description: "The solar system as an orrery (sizes exaggerated): a glowing Sun, the eight planets on slightly eccentric orbit paths with Earth's Moon, banded Jupiter, ringed Saturn, the main asteroid belt between Mars and Jupiter and a faint Kuiper belt.",
  palette: [[0, "#222a3a"], [0.1, "#8a8a8a"], [0.2, "#e8c880"], [0.3, "#2a6aff"], [0.35, "#3c9a54"], [0.4, "#c84a28"], [0.5, "#d8a878"], [0.6, "#e8d098"], [0.7, "#7ad8e8"], [0.8, "#3a5ae8"], [0.9, "#ffd84a"], [1, "#fffbe8"]],
  count: 130000, size: 0.0044, fit: 1.5, camera: { distance: 7.5, yaw: 0.3, pitch: 0.55, autoRotate: 0.07 },
  build(sc) {
    const ecc = (i: number) => (i === 0 ? 0.2 : i === 3 ? 0.09 : 0.03 + 0.01 * i), incl = (i: number) => 0.035 * Math.sin(i * 1.7);
    const orbitPos = (i: number, a: number): V3 => { const e = ecc(i), A = ORB[i], B = A * Math.sqrt(1 - e * e), x = A * Math.cos(a) - A * e, z = B * Math.sin(a), c = Math.cos(incl(i)), s = Math.sin(incl(i)); return [x, z * s, z * c]; };
    const orbits: V3[][] = ORB.map((_, i) => Array.from({ length: 181 }, (_u, k): V3 => orbitPos(i, (k / 180) * TAU)));
    sc.strands(orbits, { r: 0.0035, dens: 1.5, c0: 0, c1: 0, al: 0.65 });
    const sunS = sc.solid(0.02);
    sunS.sph([0, 0, 0], 0.24, { c: 0.92, dens: 8 / (4 * Math.PI * 0.24 * 0.24 * 1.15) });
    sunS.shade = (x, y, z) => clamp(0.9 + 0.1 * (fbm(x * 30, y * 30, z * 30) - 0.5) * 2, 0.8, 1);
    sc.points(2.6, (r, o) => { const d = unitRand(r), rad = 0.25 - 0.1 * Math.log(1 - r.next() * 0.95); put(o, [d[0] * rad, d[1] * rad, d[2] * rad], d, 0.95, 0.8, 0.3 * (1 - smooth(0.25, 0.7, rad))); });
    ORB.forEach((_, i) => {
      const c = orbitPos(i, PA[i]), r = PR[i], s = sc.solid(0.004), w = 1.6 + 8 * r;
      s.sph(c, r, {
        c: PT[i], dens: w / (4 * Math.PI * r * r * 1.15),
        cg: i === 4 ? (_x, y) => 0.5 + 0.08 * Math.sin((y - c[1]) / r * 14 + 2 * fbm(_x * 6, y * 6, 1)) : i === 2 ? (x, y, z) => { const n = fbm((x - c[0]) / r * 1.6, (y - c[1]) / r * 1.6, (z - c[2]) / r * 1.6); return n > 0.55 ? 0.35 + 0.05 * n : n < 0.3 ? 0.98 : 0.3; } : i === 5 ? () => 0.6 : undefined,
      });
      if (i === 2) { const m = sc.solid(0.004), mc = add(c, [0.11, 0.015, 0.05]); m.sph(mc, 0.014, { c: 0.1, dens: 80 }); }
      if (i === 5) { // Saturn's rings
        const ring = disc(c, r * 2.25, r * 1.35, "y"), tf = xf(ring, (p) => rotZ(p, 0.466, c));
        sc.sheet(tf, { dens: 1.2 / (Math.PI * (2.25 ** 2 - 1.35 ** 2) * r * r), thick: 0.003, c: (_u, v) => 0.55 + 0.12 * Math.sin(v * 40), al: 0.9 });
      }
    });
    sc.points(1.5, (r, o) => { const a = r.next() * TAU, rad = 1.35 + 0.17 * r.next() + 0.02 * r.gauss(); put(o, [rad * Math.cos(a), 0.025 * r.gauss(), rad * Math.sin(a)], unitRand(r), 0.1 + 0.15 * r.next(), 0.6, 0.85); }); // asteroid belt
    sc.points(0.7, (r, o) => { const a = r.next() * TAU, rad = 3.1 + 0.35 * r.next(); put(o, [rad * Math.cos(a), 0.06 * r.gauss(), rad * Math.sin(a)], unitRand(r), 0.02, 0.6, 0.35); }); // Kuiper belt
  },
});

/* ───────────── Pulsar ───────────── */
export const pulsar = defineShape({
  id: "space-pulsar", name: "Pulsar", tag: SPACE,
  description: "A rotating neutron star: a tiny blazing sphere with a tilted magnetic dipole whose closed field lines loop around it, twin hollow lighthouse beams streaming from the magnetic poles with expanding wavefront rings, and a rippled equatorial current sheet.",
  palette: [[0, "#070a2a"], [0.25, "#2a3aff"], [0.5, "#4ad0ff"], [0.75, "#c8f4ff"], [1, "#ffffff"]],
  count: 120000, size: 0.0044, fit: 1.5, camera: { distance: 7, yaw: 0.2, pitch: 0.25, autoRotate: 0.04 },
  deformers: [{ type: "rotate", amount: 0.55, axis: "y" }],
  build(sc) {
    const al = 0.5, m: V3 = [Math.sin(al), Math.cos(al), 0], e2: V3 = [Math.cos(al), -Math.sin(al), 0], e3: V3 = [0, 0, 1];
    const st = sc.solid(0.01); st.sph([0, 0, 0], 0.11, { c: 1, dens: 5 });
    sc.points(2.5, (r, o) => { const d = unitRand(r), rad = 0.1 + Math.abs(r.gauss()) * 0.07; put(o, [d[0] * rad, d[1] * rad, d[2] * rad], d, 0.8 + 0.2 * r.next(), 1, 0.5); });
    const lines: V3[][] = [], cols: number[] = [];
    for (const L of [0.35, 0.55, 0.8, 1.15, 1.6, 2.1]) for (let k = 0; k < 12; k++) {
      const ph = (k / 12) * TAU, w: V3 = add([0, 0, 0], e2, Math.cos(ph)); const w2 = add(w, e3, Math.sin(ph)), ln: V3[] = [];
      for (let i = 0; i <= 40; i++) { const th = 0.14 + ((Math.PI - 0.28) * i) / 40, r = L * Math.sin(th) ** 2; ln.push(add([0, 0, 0], add([0, 0, 0], m, Math.cos(th)), r)); const p = ln[ln.length - 1]; const q = add(add([0, 0, 0], w2, Math.sin(th) * r), [0, 0, 0]); ln[ln.length - 1] = [p[0] + q[0], p[1] + q[1], p[2] + q[2]]; }
      lines.push(ln); cols.push(L);
    }
    sc.strands(lines, { r: 0.0045, dens: 0.42, c0: 0.55, c1: 0.4, al: 0.8 });
    for (const sg of [1, -1]) {
      const tb = 0.14;
      sc.points(6, (r, o) => { const h = 0.16 + 2.5 * Math.pow(r.next(), 0.8), a = r.next() * TAU, rad = h * tb * (1 + 0.07 * r.gauss()), c = add([0, 0, 0], m, sg * h); const p = add(add(c, e2, rad * Math.cos(a)), e3, rad * Math.sin(a)); put(o, p, [Math.cos(a), 0, Math.sin(a)], 1 - 0.5 * smooth(0, 2.6, h), 0.85, 0.75 * (1 - 0.8 * smooth(0, 2.7, h))); });
      const rings: V3[][] = []; for (let k = 1; k <= 8; k++) { const h = 0.3 * k + 0.08, c = add([0, 0, 0], m, sg * h), rad = h * tb; rings.push(Array.from({ length: 49 }, (_, i): V3 => { const a = (i / 48) * TAU; return add(add(c, e2, rad * Math.cos(a)), e3, rad * Math.sin(a)); })); }
      sc.strands(rings, { r: 0.004, dens: 0.55, c0: 0.8, c1: 0.8, al: 0.55 });
    }
    const skirt = { u0: 0, u1: TAU, v0: 0, v1: 1, eval(u: number, v: number, out: { [i: number]: number }) { const rr = 0.3 + 1.9 * v, y = 0.06 * Math.sin(5 * rr - 1.2 * Math.cos(u * 2)) * (0.3 + rr * 0.3), p = add(add([0, 0, 0], e2, rr * Math.cos(u)), e3, rr * Math.sin(u)); out[0] = p[0] + m[0] * y; out[1] = p[1] + m[1] * y; out[2] = p[2] + m[2] * y; } };
    sc.sheet(skirt, { dens: 0.1, thick: 0.004, c: (_u, v) => 0.4 - 0.2 * v, al: 0.4 });
  },
});

/* ───────────── Astronaut ───────────── */
export const astronaut = defineShape({
  id: "space-astronaut", name: "Astronaut", tag: SPACE,
  description: "A spacewalking astronaut in an EVA suit: white hard-shell torso with a chest control box, gold-mirrored helmet visor with side lamps, a life-support backpack, jointed arms and gloves, boots, and a safety tether trailing behind.",
  palette: [[0, "#0a0c12"], [0.1, "#3a3f4a"], [0.25, "#2a5ad8"], [0.4, "#c8302a"], [0.5, "#e8a824"], [0.7, "#c8ccd4"], [0.88, "#eef0f4"], [1, "#ffffff"]],
  count: 130000, size: 0.0044, fit: 1.5, camera: { distance: 6.6, yaw: 0.45, pitch: 0.12, autoRotate: 0.09 },
  deformers: [{ type: "breathe", amount: 0.006, speed: 0.9 }],
  build(sc) {
    const W = 0.88, S = sc.solid(0.06);
    S.ell([0, 0.35, 0], [0.46, 0.62, 0.32], { c: W, dens: 1.4 }); // torso
    S.ell([0, -0.38, 0], [0.42, 0.26, 0.3], { c: W, dens: 1.4 }); // hips
    S.ell([0.5, 0.8, 0], [0.2, 0.17, 0.2], { c: W, dens: 1.4, sym: true }); // shoulders
    S.ell([0, 1.0, 0], [0.3, 0.09, 0.3], { c: 0.1, dens: 1.6 }); // neck ring
    const arm = (sg: number, pts: V3[]) => {
      const A = sc.solid(0.04), p = pts.map((q): V3 => [q[0] * sg, q[1], q[2]]);
      A.tube(p, [0.16, 0.15, 0.12], { seg: 18, c: W, dens: 1.5, cgFromT: (t) => (t > 0.9 ? 0.25 : t > 0.12 && t < 0.2 ? 0.4 : W) });
      const w = p[2], fwd = norm([p[2][0] - p[1][0], p[2][1] - p[1][1], p[2][2] - p[1][2]]);
      A.ell(add(w, fwd, 0.12), [0.14, 0.11, 0.15], { c: 0.8, dens: 1.8, dir: fwd });
      for (let k = 0; k < 4; k++) { const off = (k - 1.5) * 0.045, tip = add(add(w, fwd, 0.35), [0, off, 0]); A.cone(add(add(w, fwd, 0.18), [0, off, 0]), tip, 0.04, 0.03, { c: 0.8, dens: 2 }); }
      A.cone(add(w, [sg * -0.0, -0.06, 0.1], 1), add(w, [sg * -0.1, -0.12, 0.28]), 0.04, 0.03, { c: 0.8, dens: 2 });
    };
    arm(1, [[0.52, 0.78, 0], [0.82, 0.5, 0.18], [0.78, 0.18, 0.55]]);
    arm(-1, [[0.52, 0.78, 0], [0.86, 0.38, 0.05], [0.95, -0.02, 0.3]]);
    const leg = (sg: number) => {
      const L = sc.solid(0.04), p: V3[] = [[0.2 * sg, -0.5, 0], [0.27 * sg, -1.08, 0.12], [0.3 * sg, -1.6, -0.05]];
      L.tube(p, [0.19, 0.16, 0.13], { seg: 18, c: W, dens: 1.5 });
      L.ell([0.27 * sg, -1.08, 0.2], [0.15, 0.15, 0.08], { c: 0.7, dens: 1.6 });
      L.ell([0.3 * sg, -1.78, 0.08], [0.14, 0.1, 0.28], { c: 0.1, dens: 1.6 });
      L.ell([0.3 * sg, -1.88, 0.1], [0.15, 0.035, 0.3], { c: 0.05, dens: 1.6 });
    };
    leg(1); leg(-1);
    const H: V3 = [0, 1.48, 0.02], helm = sc.solid(0.02);
    helm.sph(H, 0.43, { c: W, dens: 1.4 });
    helm.sph([0.43, 1.46, 0.0], 0.08, { c: 0.7, dens: 2.2, sym: true });
    helm.sph([0.22, 1.83, 0.2], 0.04, { c: 1, dens: 3, sym: true });
    const visor = { u0: -1.05, u1: 1.05, v0: -0.55, v1: 0.85, eval(u: number, v: number, o: { [i: number]: number }) { const R = 0.445; o[0] = H[0] + R * Math.cos(v) * Math.sin(u); o[1] = H[1] + R * Math.sin(v); o[2] = H[2] + R * Math.cos(v) * Math.cos(u); } };
    sc.sheet(visor, { dens: 3.2, thick: 0.004, c: (u, v) => clamp(0.5 + 0.12 * Math.sin(u * 2.4 + v * 3) + 0.35 * Math.exp(-((u + 0.45) ** 2 + (v - 0.45) ** 2) / 0.12), 0.3, 1) });
    const vrim: V3[] = []; for (let i = 0; i <= 60; i++) { const a = (i / 60) * TAU, u = 1.05 * Math.cos(a), v = 0.15 + 0.7 * Math.sin(a) * (Math.sin(a) > 0 ? 1 : 0.78); vrim.push([H[0] + 0.45 * Math.cos(v) * Math.sin(u), H[1] + 0.45 * Math.sin(v), H[2] + 0.45 * Math.cos(v) * Math.cos(u)]); }
    sc.strands([vrim], { r: 0.012, dens: 1.2, c0: 0.7, c1: 0.7, al: 0.9 });
    sc.sheet(torus([0, 1.0, 0], 0.3, 0.045, "y"), { dens: 2, thick: 0.002, c: 0.25 });
    box(sc, [0, 0.45, -0.46], [0.37, 0.58, 0.17], { dens: 1.6, thick: 0.005, c: (_u, _v, x, y) => 0.72 + 0.06 * Math.sin(x * 20) * Math.sin(y * 20) }); // life-support pack
    sc.strands([[[0.37, 0.95, -0.46], [0.37, -0.1, -0.46]], [[-0.37, 0.95, -0.46], [-0.37, -0.1, -0.46]], [[-0.37, 0.7, -0.63], [0.37, 0.7, -0.63]]], { r: 0.008, dens: 0.4, c0: 0.1, c1: 0.1, al: 0.8 });
    sc.strands([[[0.3, 0.98, -0.5], [0.42, 1.4, -0.58], [0.5, 1.8, -0.62]]], { r: 0.007, dens: 0.4, c0: 0.7, c1: 0.7 });
    box(sc, [0, 0.52, 0.34], [0.21, 0.15, 0.035], { dens: 1.6, thick: 0.004, c: 0.12 }); // chest control box
    balls(sc, [{ c: [-0.12, 0.54, 0.385], r: 0.028, t: 0.25 }, { c: [0, 0.54, 0.385], r: 0.028, t: 0.4 }, { c: [0.12, 0.54, 0.385], r: 0.028, t: 0.5 }, { c: [-0.06, 0.48, 0.385], r: 0.02, t: 0.88 }, { c: [0.06, 0.48, 0.385], r: 0.02, t: 0.88 }], 3);
    const tether = splinePoints([[0, 0.05, -0.62], [0.3, -0.25, -0.95], [0.1, -0.7, -1.2], [-0.25, -0.95, -1.45], [-0.1, -1.2, -1.7]], 60);
    sc.strands([tether], { r: 0.014, dens: 0.8, c0: 0.88, c1: 0.7, al: 0.9 });
  },
});

/* ───────────── Satellite ───────────── */
export const satellite = defineShape({
  id: "space-satellite", name: "Satellite", tag: SPACE,
  description: "An Earth-observation satellite: a gold-foil wrapped bus with a white radiator face, two three-panel solar wings with silver cell grids on hinged booms, a parabolic high-gain dish on a mast with a tripod feed horn, a baffled telescope, thrusters and a magnetometer boom.",
  palette: [[0, "#0a0c12"], [0.12, "#3a3f4a"], [0.25, "#1a3aa8"], [0.35, "#3a6af0"], [0.5, "#d8a838"], [0.65, "#c8ccd4"], [0.85, "#eef0f4"], [1, "#ffffff"]],
  count: 130000, size: 0.0044, fit: 1.5, camera: { distance: 7.4, yaw: 0.6, pitch: 0.3, autoRotate: 0.1 },
  build(sc) {
    const gold = (_u: number, _v: number, x: number, y: number, z: number) => clamp(0.5 + 0.2 * (fbm(x * 8, y * 8, z * 8) - 0.5) + 0.07 * Math.sin(x * 33 + z * 21), 0.38, 0.62);
    box(sc, [0, 0, 0], [0.5, 0.5, 0.7], { dens: 1.5, thick: 0.005, c: gold, skip: ["-y"] });
    sc.sheet(quad([-0.5, -0.5, -0.7], [0.5, -0.5, -0.7], [0.5, -0.5, 0.7], [-0.5, -0.5, 0.7]), { dens: 1.5, thick: 0.005, c: (u, v) => (Math.abs(u * 6 % 1 - 0.5) > 0.47 || Math.abs(v * 8 % 1 - 0.5) > 0.47 ? 0.3 : 0.86) });
    const cellsC = (nu: number, nv: number) => (u: number, v: number) => {
      const fu = (u * nu) % 1, fv = (v * nv) % 1;
      if (fu < 0.05 || fv < 0.07) return 0.66;
      return 0.25 + 0.1 * vnoise(u * 40, v * 40, 2) + 0.06 * Math.sin((u * nu + v * nv) * 3);
    };
    for (const sg of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        const x0 = 0.9 + k * 0.9, x1 = x0 + 0.85, P = (x: number, z: number): V3 => [x * sg, 0, z];
        sc.sheet(quad(P(x0, -0.7), P(x1, -0.7), P(x1, 0.7), P(x0, 0.7)), { dens: 2.4, thick: 0.006, c: cellsC(5, 8) });
        sc.strands([[P(x0, -0.72), P(x1, -0.72), P(x1, 0.72), P(x0, 0.72), P(x0, -0.72)]], { r: 0.008, dens: 1, c0: 0.8, c1: 0.8 });
      }
      sc.strands([[[0.5 * sg, 0, 0], [0.9 * sg, 0, 0]], [[0.9 * sg, 0, 0], [3.5 * sg, 0, 0]]], { r: 0.012, dens: 1.2, c0: 0.62, c1: 0.62 });
      sc.sheet(cyl([0.5 * sg, 0, 0], [0.92 * sg, 0, 0], 0.05), { dens: 3, thick: 0.002, c: 0.65 });
    }
    // high-gain dish on a mast
    const Rd = 0.6, f = 0.55, tilt = -0.4, C: V3 = [0, 1.45, 0.15], ct = Math.cos(tilt), st = Math.sin(tilt);
    const rot = (p: V3): V3 => [C[0] + p[0], C[1] + p[1] * ct - p[2] * st, C[2] + p[1] * st + p[2] * ct];
    const dish = { u0: 0, u1: TAU, v0: 0, v1: 1, eval(u: number, v: number, o: { [i: number]: number }) { const r = Rd * v, p = rot([r * Math.cos(u), (r * r) / (4 * f), r * Math.sin(u)]); o[0] = p[0]; o[1] = p[1]; o[2] = p[2]; } };
    sc.sheet(dish, { dens: 2.4, thick: 0.004, c: (_u, v) => 0.88 - 0.1 * v, al: 0.95 });
    const rim = Array.from({ length: 73 }, (_, i): V3 => { const a = (i / 72) * TAU; return rot([Rd * Math.cos(a), (Rd * Rd) / (4 * f), Rd * Math.sin(a)]); });
    const focus = rot([0, f, 0]);
    sc.strands([rim, ...[0, 1, 2].map((k): V3[] => [rim[k * 24], focus])], { r: 0.008, dens: 1, c0: 0.7, c1: 0.7 });
    sc.sheet(cyl(focus, rot([0, f - 0.1, 0]), (v) => 0.02 + 0.05 * v), { dens: 4, thick: 0.002, c: 0.6 });
    sc.sheet(cyl([0, 0.5, 0], rot([0, 0.05, 0]), 0.045), { dens: 3, thick: 0.002, c: 0.7 });
    // telescope
    sc.sheet(cyl([0, -0.05, 0.7], [0, -0.05, 1.3], (v) => 0.27 + 0.09 * v), { dens: 2.2, thick: 0.004, c: 0.15 });
    sc.strands([circle([0, -0.05, 1.3], 0.36, 60, "z"), circle([0, -0.05, 1.0], 0.33, 60, "z")], { r: 0.008, dens: 1.2, c0: 0.85, c1: 0.85 });
    sc.sheet(disc([0, -0.05, 1.05], 0.28, 0, "z"), { dens: 1.2, thick: 0.003, c: 0.33, al: 0.6 });
    // thrusters, star trackers, magnetometer boom, whip antenna
    const th = sc.solid(0.01);
    for (const [x, y] of [[0.33, 0.33], [-0.33, 0.33], [0.33, -0.33], [-0.33, -0.33]]) th.cone([x, y, -0.7], [x * 1.2, y * 1.2, -0.92], 0.035, 0.08, { c: 0.12, dens: 3 });
    box(sc, [0.58, 0.3, 0.3], [0.08, 0.1, 0.12], { dens: 2, thick: 0.004, c: 0.12 }); box(sc, [-0.58, 0.3, 0.3], [0.08, 0.1, 0.12], { dens: 2, thick: 0.004, c: 0.12 });
    sc.strands([[[0, 0, -0.7], [0, 0.02, -2.2]], [[0.35, 0.5, -0.4], [0.5, 1.5, -0.6]]], { r: 0.008, dens: 0.3, c0: 0.65, c1: 0.65 });
    balls(sc, [{ c: [0, 0.02, -2.2], r: 0.06, t: 0.5 }, { c: [0.5, 1.5, -0.6], r: 0.03, t: 0.85 }] as Ball[], 3);
  },
});

export const SPACE2_SHAPES = [comet, supernova, starCluster, planetarySystem, pulsar, astronaut, satellite];
