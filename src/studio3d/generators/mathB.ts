import type { GeneratorDef } from "../types";
import type { Rng } from "../math";
import { defineShape, type V3 } from "./sculpt";
import { TAU, clamp01 } from "./objkit";
import { MATH } from "./mathA";

export const cam = (d: number, yaw = 0.5, pitch = 0.3, auto = 0.12) => ({ distance: d, yaw, pitch, autoRotate: auto });
export type PtOut = { [i: number]: number };
export const put = (o: PtOut, p: V3, n: V3, t: number, size = 1, al = 1) => { o[0] = p[0]; o[1] = p[1]; o[2] = p[2]; o[3] = n[0]; o[4] = n[1]; o[5] = n[2]; o[6] = t; o[7] = size; o[8] = al; };
export const unitRand = (r: Rng): V3 => { const a = r.next() * TAU, z = 2 * r.next() - 1, s = Math.sqrt(1 - z * z); return [s * Math.cos(a), z, s * Math.sin(a)]; };

/* ───────── generic strange attractor ───────── */
interface AttrCfg { id: GId; name: string; description: string; palette: Array<[number, string]>; f: (x: number, y: number, z: number) => V3; init: V3; dt: number; steps: number; burn?: number; jitter?: number; cam?: ReturnType<typeof cam>; size?: number }
type GId = GeneratorDef["id"];
function attractor(c: AttrCfg): GeneratorDef {
  return defineShape({
    id: c.id, name: c.name, tag: MATH, description: c.description, palette: c.palette, count: 110000, size: c.size ?? 0.0046, fit: 1.5, heavy: false, camera: c.cam ?? cam(5.4, 0.6, 0.3),
    build(sc) {
      let [x, y, z] = c.init; const N = c.steps, P = new Float32Array(N * 3), SP = new Float32Array(N), f = c.f, dt = c.dt;
      const step = () => { const k1 = f(x, y, z), k2 = f(x + 0.5 * dt * k1[0], y + 0.5 * dt * k1[1], z + 0.5 * dt * k1[2]), k3 = f(x + 0.5 * dt * k2[0], y + 0.5 * dt * k2[1], z + 0.5 * dt * k2[2]), k4 = f(x + dt * k3[0], y + dt * k3[1], z + dt * k3[2]); x += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); y += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); z += (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]); return k1; };
      for (let i = 0; i < (c.burn ?? 3000); i++) step();
      let mx = 0, my = 0, mz = 0, smax = 1e-9;
      for (let i = 0; i < N; i++) { const k = step(); P[3 * i] = x; P[3 * i + 1] = y; P[3 * i + 2] = z; SP[i] = Math.hypot(k[0], k[1], k[2]); mx += x; my += y; mz += z; if (SP[i] > smax) smax = SP[i]; }
      mx /= N; my /= N; mz /= N; let rms = 0; for (let i = 0; i < N; i++) rms += (P[3 * i] - mx) ** 2 + (P[3 * i + 1] - my) ** 2 + (P[3 * i + 2] - mz) ** 2; rms = Math.sqrt(rms / N) || 1;
      const k = 1.25 / rms, jit = c.jitter ?? 0.01;
      sc.points(1, (r, o) => { const i = Math.floor(r.next() * (N - 1)), p: V3 = [(P[3 * i] - mx) * k + r.gauss() * jit, (P[3 * i + 1] - my) * k + r.gauss() * jit, (P[3 * i + 2] - mz) * k + r.gauss() * jit]; put(o, p, unitRand(r), clamp01(0.7 * Math.pow(SP[i] / smax, 0.6) + 0.3 * (i / N)), 1, 0.9); });
    },
  });
}
const SP1: Array<[number, string]> = [[0, "#1a0a4a"], [0.25, "#4a2aff"], [0.5, "#2ad6ff"], [0.75, "#ffe27a"], [1, "#ff4a7a"]];
const SP2: Array<[number, string]> = [[0, "#14052a"], [0.3, "#c02aff"], [0.55, "#ff4a8a"], [0.8, "#ffc04a"], [1, "#fffbe0"]];
const SP3: Array<[number, string]> = [[0, "#031a1a"], [0.3, "#0a8a7a"], [0.55, "#2ae0a0"], [0.8, "#d8ff6a"], [1, "#ffffff"]];
const SP4: Array<[number, string]> = [[0, "#2a0a04"], [0.3, "#d6401a"], [0.55, "#ff9a2a"], [0.8, "#ffe27a"], [1, "#ffffff"]];

export const lorenz = attractor({ id: "math-lorenz-attractor", name: "Lorenz Attractor", description: "Lorenz's 1963 convection model (σ = 10, ρ = 28, β = 8/3): a single trajectory tracing the butterfly-wing double lobe of deterministic chaos, hotter where the flow is faster.", palette: SP1, f: (x, y, z) => [10 * (y - x), x * (28 - z) - y, x * y - (8 / 3) * z], init: [1, 1, 1], dt: 0.004, steps: 140000, cam: cam(5.2, 0.4, 0.2) });
export const aizawa = attractor({ id: "math-aizawa", name: "Aizawa Attractor", description: "The Aizawa attractor: a trajectory that spirals up a central tube, flares into a disc and winds back, forming a toroidal sphere with a spiky polar jet.", palette: SP2, f: (x, y, z) => [(z - 0.7) * x - 3.5 * y, 3.5 * x + (z - 0.7) * y, 0.6 + 0.95 * z - (z * z * z) / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x * x * x], init: [0.1, 0, 0], dt: 0.01, steps: 150000, cam: cam(5.0, 0.5, 0.3) });
export const thomas = attractor({ id: "math-thomas", name: "Thomas Attractor", description: "Thomas' cyclically symmetric attractor (b = 0.208): a lattice-like labyrinth of looping flow filling a cube with three-fold symmetry about its diagonal.", palette: SP3, f: (x, y, z) => [Math.sin(y) - 0.208 * x, Math.sin(z) - 0.208 * y, Math.sin(x) - 0.208 * z], init: [1.1, 1.1, -0.01], dt: 0.05, steps: 160000, jitter: 0.012, cam: cam(5.2, 0.6, 0.35) });
export const rossler = attractor({ id: "math-rossler", name: "Rössler Attractor", description: "The Rössler attractor (a = 0.2, b = 0.2, c = 5.7): a flat spiral band that periodically lifts into a single fold and folds back, the simplest chaotic flow.", palette: SP4, f: (x, y, z) => [-y - z, x + 0.2 * y, 0.2 + z * (x - 5.7)], init: [1, 1, 0], dt: 0.012, steps: 150000, cam: cam(5.4, 0.5, 0.45) });
export const halvorsen = attractor({ id: "math-halvorsen", name: "Halvorsen Attractor", description: "The Halvorsen attractor (a = 1.89): three interlocked cyclically-symmetric wings swirling around a common centre like a trefoil of flow.", palette: SP1, f: (x, y, z) => [-1.89 * x - 4 * y - 4 * z - y * y, -1.89 * y - 4 * z - 4 * x - z * z, -1.89 * z - 4 * x - 4 * y - x * x], init: [-1.48, -1.51, 2.04], dt: 0.004, steps: 150000, cam: cam(5.2, 0.6, 0.35) });

/* Clifford (folded 3D map) */
export const clifford = defineShape({
  id: "math-clifford-attractor", name: "Clifford Attractor", tag: MATH,
  description: "Clifford Pickover's map (a = −1.4, b = 1.6, c = 1, d = 0.7) lifted into three dimensions: the familiar swirling fabric folds over itself in a third coordinate, giving a silk-like sheet.",
  palette: SP2, count: 110000, size: 0.0044, fit: 1.5, heavy: false, camera: cam(5.0, 0.4, 0.3),
  build(sc) {
    const N = 200000, P = new Float32Array(N * 3); let x = 0.1, y = 0.1, px = 0, mx = 0, my = 0, mz = 0;
    for (let i = 0; i < 500; i++) { const nx = Math.sin(-1.4 * y) + Math.cos(-1.4 * x), ny = Math.sin(1.6 * x) + 0.7 * Math.cos(1.6 * y); px = x; x = nx; y = ny; }
    for (let i = 0; i < N; i++) { const nx = Math.sin(-1.4 * y) + Math.cos(-1.4 * x), ny = Math.sin(1.6 * x) + 0.7 * Math.cos(1.6 * y); px = x; x = nx; y = ny; const z = 0.9 * Math.sin(1.5 * (px + y)) + 0.35 * Math.cos(2.2 * x); P[3 * i] = x; P[3 * i + 1] = z; P[3 * i + 2] = y; mx += x; my += z; mz += y; }
    mx /= N; my /= N; mz /= N;
    sc.points(1, (r, o) => { const i = Math.floor(r.next() * N), p: V3 = [(P[3 * i] - mx) * 0.7 + r.gauss() * 0.006, (P[3 * i + 1] - my) * 0.7 + r.gauss() * 0.006, (P[3 * i + 2] - mz) * 0.7 + r.gauss() * 0.006]; put(o, p, unitRand(r), clamp01(0.5 + 0.5 * Math.sin(P[3 * i + 1] * 2 + P[3 * i] * 0.8)), 1, 0.9); });
  },
});

/* ───────── Sierpinski tetrahedron ───────── */
export const sierpinski = defineShape({
  id: "math-sierpinski", name: "Sierpinski Tetrahedron", tag: MATH,
  description: "The Sierpiński tetrahedron: a tetrahedron recursively divided into four half-scale copies, drawn by the chaos game and coloured by which sub-tetrahedron each point falls in.",
  palette: [[0, "#ff3a6e"], [0.3, "#ffb83a"], [0.55, "#3ad68a"], [0.8, "#3a8aff"], [1, "#b04aff"]], count: 110000, size: 0.005, fit: 1.5, heavy: false, camera: cam(4.8, 0.6, 0.35),
  build(sc) {
    const V: V3[] = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((p) => [p[0] * 1.0, p[1] * 1.0, p[2] * 1.0] as V3);
    sc.points(1, (r, o) => { let x = r.next() * 2 - 1, y = r.next() * 2 - 1, z = r.next() * 2 - 1, d1 = 0, d2 = 0, d3 = 0; for (let i = 0; i < 14; i++) { const k = Math.floor(r.next() * 4); x = (x + V[k][0]) / 2; y = (y + V[k][1]) / 2; z = (z + V[k][2]) / 2; d3 = d2; d2 = d1; d1 = k; } const n = unitRand(r); put(o, [x * 1.15, y * 1.15, z * 1.15], [x, y, z], (d1 * 16 + d2 * 4 + d3) / 63, 1, 1); void n; });
  },
});

/* ───────── Menger sponge ───────── */
export const menger = defineShape({
  id: "math-menger-sponge", name: "Menger Sponge", tag: MATH,
  description: "The level-3 Menger sponge: a cube from which the centre of every face and the core are removed repeatedly, leaving 8000 tiny cubes and a surface of infinite fractal area, shaded by depth.",
  palette: [[0, "#0a0a1a"], [0.25, "#1a3aa0"], [0.5, "#3a9ae0"], [0.75, "#ffd27a"], [1, "#ffffff"]], count: 120000, size: 0.0048, fit: 1.5, heavy: false, camera: cam(5.0, 0.7, 0.4),
  build(sc) {
    const G = 27, solid = (i: number, j: number, k: number) => { if (i < 0 || j < 0 || k < 0 || i >= G || j >= G || k >= G) return false; let a = i, b = j, c = k; for (let l = 0; l < 3; l++) { const d = (a % 3 === 1 ? 1 : 0) + (b % 3 === 1 ? 1 : 0) + (c % 3 === 1 ? 1 : 0); if (d >= 2) return false; a = Math.floor(a / 3); b = Math.floor(b / 3); c = Math.floor(c / 3); } return true; };
    const faces: number[] = [], dirs: Array<[number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) for (let k = 0; k < G; k++) if (solid(i, j, k)) dirs.forEach((d, di) => { if (!solid(i + d[0], j + d[1], k + d[2])) faces.push(i, j, k, di); });
    const nF = faces.length / 4, s = 2 / G;
    sc.points(1, (r, o) => { const f = Math.floor(r.next() * nF) * 4, i = faces[f], j = faces[f + 1], k = faces[f + 2], d = dirs[faces[f + 3]], u = r.next(), v = r.next(); const c: V3 = [i + 0.5, j + 0.5, k + 0.5]; let p: V3; if (d[0] !== 0) p = [c[0] + d[0] * 0.5, j + u, k + v]; else if (d[1] !== 0) p = [i + u, c[1] + d[1] * 0.5, k + v]; else p = [i + u, j + v, c[2] + d[2] * 0.5]; const q: V3 = [(p[0] - G / 2) * s, (p[1] - G / 2) * s, (p[2] - G / 2) * s]; const depth = Math.hypot(q[0], q[1], q[2]); put(o, q, d, clamp01(0.15 + 0.5 * (1 - depth / 1.8) + 0.3 * ((i * 7 + j * 13 + k * 17) % 9) / 9 * (faces[f + 3] % 2)), 1, 1); });
  },
});

/* ───────── Mandelbulb ───────── */
export const mandelbulb = defineShape({
  id: "math-mandelbulb", name: "Mandelbulb", tag: MATH,
  description: "The power-8 Mandelbulb, Daniel White and Paul Nylander's three-dimensional analogue of the Mandelbrot set, ray-marched with a distance estimator and shaded by orbit trap.",
  palette: [[0, "#0a0418"], [0.2, "#3a1a8a"], [0.4, "#c02a8a"], [0.6, "#ff7a3a"], [0.8, "#ffe27a"], [1, "#fffff0"]], count: 70000, size: 0.0056, fit: 1.5, heavy: true, camera: cam(4.6, 0.5, 0.25),
  build(sc) {
    let trap = 1;
    const de = (px: number, py: number, pz: number): number => { let zx = px, zy = py, zz = pz, dr = 1, r = 0; trap = 9; for (let i = 0; i < 7; i++) { r = Math.sqrt(zx * zx + zy * zy + zz * zz); if (r > 2) break; if (r < trap) trap = r; const th = Math.acos(zz / r) * 8, ph = Math.atan2(zy, zx) * 8, r7 = Math.pow(r, 7); dr = r7 * 8 * dr + 1; const rr = r7 * r, st = Math.sin(th); zx = rr * st * Math.cos(ph) + px; zy = rr * st * Math.sin(ph) + py; zz = rr * Math.cos(th) + pz; } return 0.5 * Math.log(Math.max(r, 1e-6)) * r / dr; };
    sc.points(1, (r, o) => {
      for (let tries = 0; tries < 8; tries++) {
        const d = unitRand(r), tg = unitRand(r), tr = 0.85 * Math.cbrt(r.next()); const ox = d[0] * 1.6, oy = d[1] * 1.6, oz = d[2] * 1.6; let dx = tg[0] * tr - ox, dy = tg[1] * tr - oy, dz = tg[2] * tr - oz; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
        let t = 0, hit = false; for (let s = 0; s < 56 && t < 3.2; s++) { const dd = de(ox + dx * t, oy + dy * t, oz + dz * t); if (dd < 0.0015) { hit = true; break; } t += dd * 0.9; }
        if (!hit) continue;
        const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t, e = 0.004, tp = trap; const gx = de(x + e, y, z) - de(x - e, y, z), gy = de(x, y + e, z) - de(x, y - e, z), gz = de(x, y, z + e) - de(x, y, z - e), gl = Math.hypot(gx, gy, gz) || 1;
        put(o, [x * 1.35, y * 1.35, z * 1.35], [gx / gl, gy / gl, gz / gl], clamp01(0.08 + 0.95 * (1 - Math.min(1, tp * 0.9))), 1, 1); return;
      }
      put(o, [0, 0, 0], [0, 1, 0], 0, 0.01, 0);
    });
  },
});

/* ───────── Apollonian sphere packing ───────── */
export const apollonian = defineShape({
  id: "math-apollonian", name: "Apollonian Spheres", tag: MATH,
  description: "A three-dimensional Apollonian gasket: spheres packed into every gap between four mutually tangent spheres by Soddy–Gosset inversion, shaded by size down to tiny grains.",
  palette: [[0, "#ff3a6e"], [0.2, "#ff9a3a"], [0.4, "#f6e84a"], [0.6, "#3ad68a"], [0.8, "#3a8aff"], [1, "#b04aff"]], count: 110000, size: 0.005, fit: 1.5, heavy: false, camera: cam(4.6, 0.5, 0.3),
  build(sc) {
    interface S { k: number; m: V3 }
    const c0 = 1 / Math.SQRT2, tets: V3[] = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((p) => [p[0] * c0, p[1] * c0, p[2] * c0] as V3);
    const inner: S[] = tets.map((c) => ({ k: 1, m: c })), Ro = 1 + Math.hypot(c0, c0, c0), outer: S = { k: -1 / Ro, m: [0, 0, 0] };
    const out: Array<{ c: V3; r: number }> = inner.map((s) => ({ c: s.m, r: 1 })), minR = 0.045;
    const rec = (tuple: S[], skip: number, depth: number) => {
      if (out.length > 9000 || depth > 9) return;
      for (let j = 0; j < 5; j++) {
        if (j === skip) continue;
        let k = -tuple[j].k; const m: V3 = [-tuple[j].m[0], -tuple[j].m[1], -tuple[j].m[2]];
        tuple.forEach((s, i) => { if (i !== j) { k += s.k; m[0] += s.m[0]; m[1] += s.m[1]; m[2] += s.m[2]; } });
        if (!(k > 0) || 1 / k < minR) continue;
        out.push({ c: [m[0] / k, m[1] / k, m[2] / k], r: 1 / k });
        const nt = tuple.slice(); nt[j] = { k, m }; rec(nt, j, depth + 1);
      }
    };
    rec([...inner, outer], -1, 0);
    const cdf: number[] = []; let acc = 0; out.forEach((s) => { acc += s.r * s.r; cdf.push(acc); });
    sc.points(1, (r, o) => { const q = r.next() * acc; let lo = 0, hi = cdf.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < q) lo = m + 1; else hi = m; } const s = out[lo], n = unitRand(r); put(o, [s.c[0] + n[0] * s.r, s.c[1] + n[1] * s.r, s.c[2] + n[2] * s.r], n, clamp01(Math.log(1 / s.r) / Math.log(1 / minR)), 1, 1); });
  },
});

/* ───────── triply periodic minimal surfaces ───────── */
function implicit(id: GId, name: string, description: string, palette: Array<[number, string]>, F: (x: number, y: number, z: number) => number, G: (x: number, y: number, z: number) => V3, L: number): GeneratorDef {
  return defineShape({
    id, name, tag: MATH, description, palette, count: 110000, size: 0.0048, fit: 1.5, heavy: false, camera: cam(5.0, 0.6, 0.4),
    build(sc) {
      sc.points(1, (r, o) => {
        for (let t = 0; t < 400; t++) {
          const x = (r.next() * 2 - 1) * L, y = (r.next() * 2 - 1) * L, z = (r.next() * 2 - 1) * L;
          if (Math.pow(x / L, 6) + Math.pow(y / L, 6) + Math.pow(z / L, 6) > 1) continue;
          const g = G(x, y, z), gl = Math.hypot(g[0], g[1], g[2]) || 1;
          if (Math.abs(F(x, y, z)) > 0.05 * gl) continue;
          const k = 1.35 / L; put(o, [x * k, y * k, z * k], [g[0] / gl, g[1] / gl, g[2] / gl], clamp01(0.5 + 0.28 * (x + y * 0.6 - z * 0.8) / L + 0.2 * Math.sin(x * 0.9 + z * 0.7)), 1, 1); return;
        }
        put(o, [0, 0, 0], [0, 1, 0], 0, 0.01, 0);
      });
    },
  });
}
export const gyroid = implicit("math-gyroid", "Gyroid", "Alan Schoen's gyroid, sin x cos y + sin y cos z + sin z cos x = 0: a triply periodic minimal surface with no straight lines or mirror planes, dividing space into two interwoven labyrinths.",
  [[0, "#04101a"], [0.25, "#0a4a8a"], [0.5, "#16b4c8"], [0.75, "#7af0d0"], [1, "#fffbe0"]],
  (x, y, z) => Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x),
  (x, y, z) => [Math.cos(x) * Math.cos(y) - Math.sin(z) * Math.sin(x), -Math.sin(x) * Math.sin(y) + Math.cos(y) * Math.cos(z), -Math.sin(y) * Math.sin(z) + Math.cos(z) * Math.cos(x)], 5.0);
export const schwarzP = implicit("math-schwarz-p", "Schwarz P Surface", "Schwarz's primitive surface, cos x + cos y + cos z = 0: a cubic triply periodic minimal surface of tunnels opening along all three axes, clipped to a rounded cube.",
  [[0, "#14031a"], [0.25, "#6a1fd6"], [0.5, "#ff4aa0"], [0.75, "#ffc04a"], [1, "#fffbe0"]],
  (x, y, z) => Math.cos(x) + Math.cos(y) + Math.cos(z),
  (x, y, z) => [-Math.sin(x), -Math.sin(y), -Math.sin(z)], 4.7);

export const MATHB_SHAPES: GeneratorDef[] = [lorenz, clifford, aizawa, thomas, rossler, halvorsen, sierpinski, menger, mandelbulb, apollonian, gyroid, schwarzP];
