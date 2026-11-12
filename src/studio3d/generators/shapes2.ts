import type { GeneratorDef, Vec3 } from "../types";
import { TAU, clamp, len3, smoothstep } from "../math";
import { sampleSurfaces, sampleSegments, sampleSDFSurface, type ParamSurface } from "../sampling";
import { num, str, range, select, samplingParams, surfaceOptions, put, writeBatch } from "./common";

/* ───────────── 6. Particle Cube ───────────── */
export const cube: GeneratorDef = {
  id: "cube", name: "Particle Cube", tag: "Four sampling modes", method: "Face sampling, SDF projection, volume, edge and lattice sampling",
  description: "A cube you can sample as a surface, solid volume, wireframe edges or a vertex lattice; optionally rounded.",
  params: [
    range("size", "Half size", 0.3, 1.1, 0.01, 0.72), range("roundness", "Roundness", 0, 0.4, 0.005, 0),
    select("mode", "Sampling mode", [["surface", "Surface"], ["volume", "Volume"], ["edges", "Edges"], ["lattice", "Lattice"]], "surface"), range("edgeGlow", "Edge glow", 0, 1, 0.01, 0.7), ...samplingParams(),
  ],
  recipe: { count: 70000, look: { palette: [{ t: 0, color: "#3b82f6" }, { t: 0.55, color: "#22d3ee" }, { t: 1, color: "#ffffff" }], size: 0.008, glow: 0.7 }, behaviors: [{ type: "home", intensity: 60 }, { type: "drag", intensity: 1.2 }], deformers: [{ type: "rotate", amount: 0.4, axis: "y", scale: 0 }], camera: { pitch: 0.5, yaw: 0.6, distance: 3.6 } },
  generate(ctx, f) {
    const { rng, params: p } = ctx, s = num(p, "size", 0.72), mode = str(p, "mode", "surface"), rd = num(p, "roundness", 0) * s * 2, glow = num(p, "edgeGlow", 0.7);
    const shade = (x: number, y: number, z: number): [number, number, number, number] => {
      const ex = Math.abs(x) > s * 0.93, ey = Math.abs(y) > s * 0.93, ez = Math.abs(z) > s * 0.93, edge = (ex ? 1 : 0) + (ey ? 1 : 0) + (ez ? 1 : 0) >= 2;
      return [clamp(0.18 + 0.32 * (y / s * 0.5 + 0.5) + 0.2 * (x / s * 0.5 + 0.5) + (edge ? 0.35 * glow : 0), 0, 1), edge ? 1 + 0.5 * glow : 1, edge ? 1 : 0.85, 1];
    };
    if (mode === "volume") {
      for (let i = 0; i < f.n; i++) { const x = rng.range(-s, s), y = rng.range(-s, s), z = rng.range(-s, s); const m = shade(x, y, z); put(f, i, x, y, z, m[0] * 0.8, 0.9, 0.6, 1); }
    } else if (mode === "edges") {
      const c = [-s, s], segs: number[] = [];
      for (const a of c) for (const b of c) segs.push(-s, a, b, s, a, b, a, -s, b, a, s, b, a, b, -s, a, b, s);
      const b = sampleSegments(Float32Array.from(segs), f.n, rng);
      for (let i = 0; i < f.n; i++) { const o = i * 3, j = rng.gauss() * 0.006; put(f, i, b.pos[o] + j, b.pos[o + 1] + j, b.pos[o + 2] + rng.gauss() * 0.006, 0.55 + 0.4 * rng.next(), 1.1, 0.9, 1); }
    } else if (mode === "lattice") {
      const k = Math.max(2, Math.ceil(Math.cbrt(f.n))), total = k * k * k, idx = new Uint32Array(total);
      for (let i = 0; i < total; i++) idx[i] = i;
      for (let i = 0; i < Math.min(f.n, total); i++) { const j = i + rng.int(total - i), t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      for (let i = 0; i < f.n; i++) {
        const q = idx[i % total], ix = q % k, iy = ((q / k) | 0) % k, iz = (q / (k * k)) | 0, x = (ix / (k - 1) * 2 - 1) * s, y = (iy / (k - 1) * 2 - 1) * s, z = (iz / (k - 1) * 2 - 1) * s;
        const m = shade(x, y, z); put(f, i, x, y, z, m[0], m[1] * 0.9, 0.8, 1);
      }
    } else if (rd > 1e-4) {
      const inner = s - rd, sdf = (x: number, y: number, z: number) => { const qx = Math.abs(x) - inner, qy = Math.abs(y) - inner, qz = Math.abs(z) - inner; return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rd; };
      const b = sampleSDFSurface(sdf, s * 1.8, f.n, rng, { iterations: 10 });
      writeBatch(f, b, 0, (i, bb) => shade(bb.pos[i * 3], bb.pos[i * 3 + 1], bb.pos[i * 3 + 2]));
    } else {
      const faces: ParamSurface[] = [];
      for (let ax = 0; ax < 6; ax++) {
        const axis = ax >> 1, sg = ax & 1 ? 1 : -1;
        faces.push({ u0: -s, u1: s, v0: -s, v1: s, eval(u, v, o) { const q: Vec3 = [0, 0, 0]; q[axis] = sg * s; q[(axis + 1) % 3] = u; q[(axis + 2) % 3] = sg > 0 ? v : -v; o[0] = q[0]; o[1] = q[1]; o[2] = q[2]; } });
      }
      const b = sampleSurfaces(faces, f.n, rng, surfaceOptions(p));
      writeBatch(f, b, 0, (i, bb) => shade(bb.pos[i * 3], bb.pos[i * 3 + 1], bb.pos[i * 3 + 2]));
    }
  },
};

/* ───────────── 7. Klein Bottle ───────────── */
export const klein: GeneratorDef = {
  id: "klein", name: "Klein Bottle", tag: "Non-orientable", method: "Parametric figure-8 immersion, area-weighted",
  description: "The classic figure-8 immersion of the Klein bottle, a surface with no inside or outside.",
  params: [range("size", "Size", 0.5, 1.5, 0.01, 1), range("tube", "Tube profile", 1.2, 3.2, 0.05, 2), range("thickness", "Shell thickness", 0, 0.05, 0.001, 0.008), ...samplingParams()],
  recipe: { count: 75000, look: { palette: [{ t: 0, color: "#6366f1" }, { t: 0.5, color: "#ec4899" }, { t: 1, color: "#fde68a" }], size: 0.0078, glow: 0.7 }, behaviors: [{ type: "home", intensity: 60 }, { type: "drag", intensity: 1.2 }], deformers: [{ type: "rotate", amount: 0.3, axis: "y", scale: 0 }], camera: { pitch: 0.35, yaw: 0.5, distance: 3.8 } },
  generate(ctx, f) {
    const p = ctx.params, a = num(p, "tube", 2), sc = num(p, "size", 1) * 0.31;
    const surf: ParamSurface = { u0: 0, u1: TAU, v0: 0, v1: TAU, eval(u, v, o) { const cu = Math.cos(u / 2), su = Math.sin(u / 2), w = a + cu * Math.sin(v) - su * Math.sin(2 * v); o[0] = w * Math.cos(u) * sc; o[2] = w * Math.sin(u) * sc; o[1] = (su * Math.sin(v) + cu * Math.sin(2 * v)) * sc * 1.15; } };
    const b = sampleSurfaces([surf], f.n, ctx.rng, surfaceOptions(p));
    writeBatch(f, b, 0, (i, s) => [0.5 + 0.5 * Math.sin(s.u[i] * TAU + s.v[i] * 2), 1, 0.95, 1], num(p, "thickness", 0.008), ctx.rng);
  },
};

/* ───────────── 8. Mandelbulb ───────────── */
/** Iterates z -> z^8 + c with the polynomial expansion (no trig). Axis convention: y is the polar axis. */
export function bulbStep8(x: number, y: number, z: number, cx: number, cy: number, cz: number, o: Vec3) {
  const x2 = x * x, y2 = y * y, z2 = z * z, x4 = x2 * x2, y4 = y2 * y2, z4 = z2 * z2, k3 = x2 + z2;
  const k2 = 1 / Math.sqrt(k3 * k3 * k3 * k3 * k3 * k3 * k3);
  const k1 = x4 + y4 + z4 - 6 * y2 * z2 - 6 * x2 * y2 + 2 * z2 * x2, k4 = x2 - y2 + z2;
  o[0] = cx + 64 * x * y * z * (x2 - z2) * k4 * (x4 - 6 * x2 * z2 + z4) * k1 * k2;
  o[1] = cy - 16 * y2 * k3 * k4 * k4 + k1 * k1;
  o[2] = cz - 8 * y * k4 * (x4 * x4 - 28 * x4 * x2 * z2 + 70 * x4 * z4 - 28 * x2 * z2 * z4 + z4 * z4) * k1 * k2;
}
/** Same iteration with trigonometry for any power (used to validate the polynomial form and for power != 8). */
export function bulbStepTrig(x: number, y: number, z: number, cx: number, cy: number, cz: number, power: number, o: Vec3) {
  const r = Math.sqrt(x * x + y * y + z * z), th = Math.acos(clamp(y / (r || 1), -1, 1)) * power, ph = Math.atan2(x, z) * power, rn = Math.pow(r, power), st = Math.sin(th);
  o[0] = cx + rn * st * Math.sin(ph); o[1] = cy + rn * Math.cos(th); o[2] = cz + rn * st * Math.cos(ph);
}
const BT: Vec3 = [0, 0, 0];
/** Distance estimate (and orbit trap in trap[0]) for the Mandelbulb. */
export function bulbDE(cx: number, cy: number, cz: number, power: number, iters: number, trap: Float64Array): number {
  let x = cx, y = cy, z = cz, dr = 1, r = 0, tr = 1e9;
  for (let i = 0; i < iters; i++) {
    r = Math.sqrt(x * x + y * y + z * z);
    if (r > 2) break;
    if (r < tr) tr = r;
    dr = Math.pow(r, power - 1) * power * dr + 1;
    if (power === 8) bulbStep8(x, y, z, cx, cy, cz, BT); else bulbStepTrig(x, y, z, cx, cy, cz, power, BT);
    x = BT[0]; y = BT[1]; z = BT[2];
  }
  trap[0] = tr;
  return (0.5 * Math.log(Math.max(r, 1e-9)) * r) / dr;
}
export const mandelbulb: GeneratorDef = {
  id: "mandelbulb", name: "Mandelbulb", tag: "3D fractal", heavy: true, method: "Distance-estimated ray marching, orbit-trap colouring",
  description: "The power-8 Mandelbulb fractal, found by marching random rays to its surface with a distance estimator.",
  params: [range("power", "Power", 3, 12, 0.5, 8, "8 is the classic bulb (fast path)."), range("iterations", "Detail iterations", 4, 12, 1, 7), range("scale", "Scale", 0.5, 1.4, 0.01, 0.95), range("shell", "Surface thickness", 0, 0.03, 0.001, 0.004)],
  recipe: { count: 45000, look: { palette: [{ t: 0, color: "#0ea5e9" }, { t: 0.4, color: "#a78bfa" }, { t: 0.75, color: "#fb7185" }, { t: 1, color: "#fff1c9" }], size: 0.0062, glow: 0.75 }, behaviors: [{ type: "home", intensity: 60 }, { type: "drag", intensity: 1.2 }], deformers: [{ type: "rotate", amount: 0.25, axis: "y", scale: 0 }], camera: { pitch: 0.25, yaw: 0.7, distance: 3.6 } },
  generate(ctx, f) {
    const { rng, params: p } = ctx, power = num(p, "power", 8), iters = Math.round(num(p, "iterations", 7)), sc = num(p, "scale", 0.95) / 1.12, shell = num(p, "shell", 0.004);
    const trap = new Float64Array(1), d: Vec3 = [0, 0, 0], g: Vec3 = [0, 0, 0];
    let got = 0, tries = 0;
    const eps = 0.0016, h = 0.0025;
    while (got < f.n && tries < f.n * 12) {
      tries++;
      rng.onSphere(d);
      const ax = rng.gauss() * 0.25, ay = rng.gauss() * 0.25, az = rng.gauss() * 0.25;
      const ox = d[0] * 1.7, oy = d[1] * 1.7, oz = d[2] * 1.7;
      let dx = ax - ox, dy = ay - oy, dz = az - oz; const dl = len3(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      let t = 0, hit = false;
      for (let s = 0; s < 70; s++) {
        const q = bulbDE(ox + dx * t, oy + dy * t, oz + dz * t, power, iters, trap);
        if (q < eps) { hit = true; break; }
        t += q * 0.95;
        if (t > 3.6) break;
      }
      if (!hit) continue;
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t, t0 = trap[0];
      const c0 = bulbDE(x, y, z, power, iters, trap);
      g[0] = bulbDE(x + h, y, z, power, iters, trap) - c0; g[1] = bulbDE(x, y + h, z, power, iters, trap) - c0; g[2] = bulbDE(x, y, z + h, power, iters, trap) - c0;
      const gl = len3(g[0], g[1], g[2]) || 1, nx = g[0] / gl, ny = g[1] / gl, nz = g[2] / gl;
      if (Math.abs(nx * dx + ny * dy + nz * dz) < 0.12 && rng.next() < 0.5) continue; // thin out grazing hits
      const j = rng.gauss() * shell;
      put(f, got, (x + nx * j) * sc, (y + ny * j) * sc, (z + nz * j) * sc, clamp(smoothstep(0.35, 1.2, t0) * 0.85 + 0.1 * rng.next(), 0, 1), 1, 0.9, 1, nx, ny, nz);
      got++;
    }
    for (let i = got; i < f.n; i++) { const s = rng.int(Math.max(1, got)) * 3; put(f, i, f.pos[s] + rng.gauss() * 0.004, f.pos[s + 1] + rng.gauss() * 0.004, f.pos[s + 2] + rng.gauss() * 0.004, f.t[s / 3], 1, 0.9, 1, f.nrm[s], f.nrm[s + 1], f.nrm[s + 2]); }
  },
};

/* ───────────── 9. Wave Surface ───────────── */
export const wave: GeneratorDef = {
  id: "wave", name: "Wave Field", tag: "Rippling sheets", method: "Height-field surface, area-weighted, layered sheets",
  description: "Stacked sheets displaced by crossing plane waves and a radial ripple; the Wave deformer makes it ocean-like.",
  params: [
    range("size", "Half width", 0.5, 1.6, 0.01, 1.15), range("amplitude", "Amplitude", 0.02, 0.6, 0.01, 0.2), range("frequency", "Frequency", 0.5, 8, 0.05, 2.6), range("ripple", "Radial ripple", 0, 0.6, 0.01, 0.22),
    range("layers", "Layers", 1, 5, 1, 2), range("spacing", "Layer spacing", 0.03, 0.5, 0.01, 0.16), ...samplingParams(),
  ],
  recipe: { count: 80000, look: { palette: [{ t: 0, color: "#0b3d91" }, { t: 0.5, color: "#22d3ee" }, { t: 1, color: "#e0fbff" }], size: 0.0072, glow: 0.65 }, behaviors: [{ type: "home", intensity: 55 }, { type: "drag", intensity: 1.2 }], deformers: [{ type: "wave", amount: 0.1, scale: 0.9, speed: 1.2, axis: "y" }], camera: { pitch: 0.5, yaw: 0.35, distance: 3.7, autoRotate: 0.1 } },
  generate(ctx, f) {
    const p = ctx.params, S = num(p, "size", 1.15), A = num(p, "amplitude", 0.2), k = num(p, "frequency", 2.6), rip = num(p, "ripple", 0.22), L = Math.round(num(p, "layers", 2)), sp = num(p, "spacing", 0.16);
    const h = (x: number, z: number, l: number) => { const r = Math.sqrt(x * x + z * z); return A * (0.55 * Math.sin(k * x + 0.7 * z + l) + 0.45 * Math.sin(1.3 * k * z - 0.4 * x + 1.7 + l * 0.6)) + rip * Math.cos(2 * k * r - l) * Math.exp(-r / 1.1) * 0.5 + (l - (L - 1) / 2) * sp; };
    const surfs: ParamSurface[] = [];
    for (let l = 0; l < L; l++) surfs.push({ u0: -S, u1: S, v0: -S, v1: S, eval(u, v, o) { o[0] = u; o[1] = h(u, v, l); o[2] = v; } });
    const b = sampleSurfaces(surfs, f.n, ctx.rng, surfaceOptions(p));
    writeBatch(f, b, 0, (i, s) => { const edge = Math.max(Math.abs(s.u[i] * 2 - 1), Math.abs(s.v[i] * 2 - 1)); return [clamp(0.5 + 0.5 * (s.pos[i * 3 + 1] / (A + rip * 0.5 + 0.05)) * 0.8 + s.id[i] * 0.04, 0, 1), 1, 1 - smoothstep(0.82, 1, edge) * 0.95, 1]; });
  },
};

/* ───────────── 10. Particle Flower ───────────── */
export const flower: GeneratorDef = {
  id: "flower", name: "Particle Flower", tag: "Layered petals", method: "Per-petal parametric surfaces + phyllotaxis stamen disc",
  description: "Rings of curved petals around a golden-angle seed disc, from an open bloom to a tight bud.",
  params: [
    range("petals", "Petals per ring", 3, 16, 1, 8), range("rings", "Rings", 1, 6, 1, 3), range("length", "Petal length", 0.5, 1.4, 0.01, 1), range("width", "Petal width", 0.3, 1.3, 0.01, 0.9),
    range("open", "Openness", 0.4, 1.8, 0.01, 1), range("droop", "Tip droop", 0, 1, 0.01, 0.4), range("ruffle", "Ruffle", 0, 1, 0.01, 0.35), range("center", "Seed disc share", 0, 0.3, 0.005, 0.1), ...samplingParams(),
  ],
  recipe: { count: 80000, look: { palette: [{ t: 0, color: "#ff7ab6" }, { t: 0.55, color: "#ffc2e0" }, { t: 0.85, color: "#ffe29a" }, { t: 1, color: "#fff7cf" }], size: 0.0078, glow: 0.6 }, behaviors: [{ type: "home", intensity: 55 }, { type: "drag", intensity: 1.2 }], deformers: [{ type: "breathe", amount: 0.025, speed: 0.8 }, { type: "twist", amount: 0.25, axis: "y", scale: 1, speed: 0.4 }], camera: { pitch: 0.75, yaw: 0.2, distance: 3.5 } },
  generate(ctx, f) {
    const { rng, params: p } = ctx, P = Math.round(num(p, "petals", 8)), L = Math.round(num(p, "rings", 3)), len = num(p, "length", 1), wf = num(p, "width", 0.9), open = num(p, "open", 1), droop = num(p, "droop", 0.4), ruf = num(p, "ruffle", 0.35);
    const nC = Math.floor(f.n * num(p, "center", 0.1)), nP = f.n - nC, surfs: ParamSurface[] = [];
    for (let l = 0; l < L; l++) for (let j = 0; j < P; j++) {
      const Rl = len * (1 - 0.55 * (l / L)), tilt = Math.min(1.45, (0.3 + 0.8 * (l / Math.max(1, L - 1))) * open), th0 = (j * TAU) / P + l * (Math.PI / P) * 0.9 + l * 0.33;
      surfs.push({ u0: 0, u1: 1, v0: -1, v1: 1, eval(s, w, o) {
        const hw = (Math.PI / P) * wf * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(s, 0.75))), 0.85), th = th0 + w * hw, rho = Rl * s;
        const y = rho * Math.sin(tilt) - droop * 0.45 * rho * s * s + ruf * 0.05 * Math.sin(9 * s + 5 * w) * s, rr = rho * Math.cos(tilt);
        o[0] = rr * Math.cos(th); o[1] = y + 0.02 * (L - l); o[2] = rr * Math.sin(th);
      } });
    }
    const b = sampleSurfaces(surfs, nP, rng, { ...surfaceOptions(p), grid: 16 });
    writeBatch(f, b, 0, (i, s) => { const l = Math.floor(s.id[i] / P); return [clamp(0.1 + 0.62 * s.u[i] + 0.04 * l, 0, 0.92), 1, 0.85, 1]; });
    const sd = 0.06 * len;
    for (let k = 0; k < nC; k++) { const r = sd * Math.sqrt((k + rng.next()) / nC) * 2.4, a = k * 2.399963; put(f, nP + k, r * Math.cos(a), 0.12 * len * (1 - (r / (sd * 2.4)) ** 2) + 0.03, r * Math.sin(a), 0.97, 1.1, 1, 0.8, 0, 1, 0); }
  },
};

export const SHAPES2 = [cube, klein, mandelbulb, wave, flower];
