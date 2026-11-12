import type { GeneratorDef, Vec3 } from "../types";
import { TAU, clamp, fbm, gnoise, len3 } from "../math";
import { sampleSDFSurface, sampleTube, Curve, poissonBall } from "../sampling";
import { num, str, range, select, put, writeBatch } from "./common";

/* ───────────── 16. Neural Network ───────────── */
export const neural: GeneratorDef = {
  id: "neural", name: "Neural Network", tag: "Nodes + axons", method: "Poisson-disk nodes, k-nearest links, curved bezier edges, pulse highlights",
  description: "Glowing nodes joined to their nearest neighbours by curved axons, with signal pulses travelling along some of them.",
  params: [range("nodes", "Nodes", 12, 220, 1, 70), range("links", "Links per node", 1, 7, 1, 3), range("spread", "Spread", 0.5, 1.4, 0.01, 1), range("nodeSize", "Node radius", 0.01, 0.09, 0.001, 0.034), range("curve", "Axon curvature", 0, 0.5, 0.01, 0.2), range("active", "Active links", 0, 0.8, 0.01, 0.25), range("nodeShare", "Node particles", 0.1, 0.6, 0.01, 0.3)],
  recipe: { count: 70000, look: { palette: [{ t: 0, color: "#1d4ed8" }, { t: 0.4, color: "#22d3ee" }, { t: 0.8, color: "#a78bfa" }, { t: 1, color: "#ffffff" }], size: 0.006, glow: 0.95, depthFade: 0.4 }, behaviors: [{ type: "home", intensity: 50 }, { type: "drag", intensity: 1.3 }], deformers: [{ type: "breathe", amount: 0.02, speed: 0.8 }, { type: "rotate", amount: 0.25, axis: "y", scale: 0 }], camera: { pitch: 0.25, yaw: 0.4, distance: 3.9 } },
  generate(ctx, f) {
    const { rng, params: p } = ctx, M = Math.round(num(p, "nodes", 70)), K = Math.round(num(p, "links", 3)), S = num(p, "spread", 1), nr = num(p, "nodeSize", 0.034), cv = num(p, "curve", 0.2), act = num(p, "active", 0.25);
    const minD = 0.9 * Math.cbrt((4.19 * S * S * S * 0.72) / M) * 0.85, nodes = poissonBall(M, [1 * S, 0.78 * S, 0.9 * S], minD, rng), m = nodes.length / 3;
    const edges: [number, number][] = [], seen = new Set<number>();
    for (let a = 0; a < m; a++) {
      const ds: [number, number][] = [];
      for (let b = 0; b < m; b++) if (b !== a) ds.push([len3(nodes[a * 3] - nodes[b * 3], nodes[a * 3 + 1] - nodes[b * 3 + 1], nodes[a * 3 + 2] - nodes[b * 3 + 2]), b]);
      ds.sort((x, y) => x[0] - y[0]);
      for (let q = 0; q < Math.min(K, ds.length); q++) { const b = ds[q][1], key = Math.min(a, b) * 4096 + Math.max(a, b); if (!seen.has(key)) { seen.add(key); edges.push([a, b]); } }
    }
    const ctrl = new Float32Array(edges.length * 3), cdf = new Float64Array(edges.length), flag = new Float32Array(edges.length);
    let acc = 0;
    edges.forEach(([a, b], i) => {
      const L = len3(nodes[a * 3] - nodes[b * 3], nodes[a * 3 + 1] - nodes[b * 3 + 1], nodes[a * 3 + 2] - nodes[b * 3 + 2]);
      for (let c = 0; c < 3; c++) ctrl[i * 3 + c] = (nodes[a * 3 + c] + nodes[b * 3 + c]) / 2 + rng.gauss() * cv * L;
      acc += L; cdf[i] = acc; flag[i] = rng.next() < act ? rng.next() : -1;
    });
    const nNode = Math.floor(f.n * num(p, "nodeShare", 0.3)), nEdge = f.n - nNode;
    for (let i = 0; i < nEdge; i++) {
      const q = rng.next() * acc; let lo = 0, hi = edges.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < q) lo = mid + 1; else hi = mid; }
      const [a, b] = edges[lo], s = rng.next(), u = 1 - s, w = [0, 0, 0];
      for (let c = 0; c < 3; c++) w[c] = u * u * nodes[a * 3 + c] + 2 * u * s * ctrl[lo * 3 + c] + s * s * nodes[b * 3 + c] + rng.gauss() * 0.0035;
      const pulse = flag[lo] >= 0 && ((s * 2.5 + flag[lo] + ctx.seed * 0.01) % 1) < 0.16;
      put(f, i, w[0], w[1], w[2], pulse ? 0.9 : 0.22 + 0.25 * s, pulse ? 1.5 : 0.8, pulse ? 1 : 0.55, 1);
    }
    for (let i = 0; i < nNode; i++) {
      const n0 = rng.int(m) * 3, d: Vec3 = [0, 0, 0]; rng.onSphere(d); const r = nr * Math.cbrt(rng.next()) * (0.7 + 0.3 * rng.next());
      put(f, nEdge + i, nodes[n0] + d[0] * r, nodes[n0 + 1] + d[1] * r, nodes[n0 + 2] + d[2] * r, 0.95 + 0.05 * rng.next(), 1.25, 1, 1, d[0], d[1], d[2]);
    }
  },
};

/* ───────────── 17. Atomic Structure ───────────── */
export const atom: GeneratorDef = {
  id: "atom", name: "Atomic Structure", tag: "Nucleus + orbitals", method: "Nucleon ball, elliptical orbits with comet-tail electrons, sampled p-orbital probability lobes",
  description: "A nucleus of two-tone nucleons, tilted elliptical electron orbits with glowing electrons and orbital probability clouds.",
  params: [range("orbits", "Orbits", 1, 7, 1, 3), range("nucleus", "Nucleus radius", 0.05, 0.35, 0.005, 0.15), range("orbitR", "Orbit radius", 0.4, 1.3, 0.01, 0.82), range("ecc", "Eccentricity", 0, 0.8, 0.01, 0.28), range("electrons", "Electrons / orbit", 1, 4, 1, 2), range("cloud", "Probability cloud", 0, 0.5, 0.01, 0.22), range("tail", "Electron trail", 0.05, 1, 0.01, 0.4)],
  recipe: { count: 80000, look: { palette: [{ t: 0, color: "#ff4d6d" }, { t: 0.35, color: "#ffb86b" }, { t: 0.7, color: "#4dd2ff" }, { t: 1, color: "#e9fbff" }], size: 0.0066, glow: 0.9 }, behaviors: [{ type: "home", intensity: 55 }, { type: "drag", intensity: 1.2 }], deformers: [{ type: "rotate", amount: 0.7, axis: "y", scale: 0.35 }, { type: "breathe", amount: 0.015 }], camera: { pitch: 0.35, yaw: 0.5, distance: 3.9 } },
  generate(ctx, f) {
    const { rng, params: p } = ctx, O = Math.round(num(p, "orbits", 3)), nuc = num(p, "nucleus", 0.15), R = num(p, "orbitR", 0.82), e = num(p, "ecc", 0.28), E = Math.round(num(p, "electrons", 2)), tail = num(p, "tail", 0.4);
    const nNuc = Math.floor(f.n * 0.13), nEl = Math.floor(f.n * 0.1), nCloud = Math.floor(f.n * num(p, "cloud", 0.22)), nRing = f.n - nNuc - nEl - nCloud;
    const orient = (i: number, x: number, y: number, z: number, o: Vec3) => { const tl = 0.5 + i * 0.55, ph = i * (Math.PI / O) * 1.1, y1 = y * Math.cos(tl) - z * Math.sin(tl), z1 = y * Math.sin(tl) + z * Math.cos(tl); o[0] = x * Math.cos(ph) + z1 * Math.sin(ph); o[1] = y1; o[2] = -x * Math.sin(ph) + z1 * Math.cos(ph); };
    const q: Vec3 = [0, 0, 0], d: Vec3 = [0, 0, 0];
    for (let i = 0; i < nNuc; i++) { rng.onSphere(d); const r = nuc * Math.cbrt(rng.next()); put(f, i, d[0] * r, d[1] * r, d[2] * r, i % 2 ? 0.06 : 0.3, 1.25, 1, 0.9, d[0], d[1], d[2]); }
    let at = nNuc;
    for (let i = 0; i < nRing; i++) {
      const o = i % O, A = R * (0.55 + 0.45 * ((o + 1) / O)), B = A * Math.sqrt(1 - e * e), a = rng.next() * TAU;
      orient(o, A * Math.cos(a) - A * e * 0.0, rng.gauss() * 0.005, B * Math.sin(a), q); put(f, at++, q[0], q[1], q[2], 0.5 + 0.08 * o, 0.7, 0.4, 1);
    }
    for (let i = 0; i < nEl; i++) {
      const o = i % O, k = ((i / O) | 0) % E, A = R * (0.55 + 0.45 * ((o + 1) / O)), B = A * Math.sqrt(1 - e * e), head = (k / E) * TAU + o * 1.3 + ctx.seed * 0.01, dist = rng.expo() * tail * 0.5, a = head - dist;
      const rr = 0.014 + 0.02 * Math.min(1, dist * 2);
      orient(o, A * Math.cos(a) + rng.gauss() * rr, rng.gauss() * rr, B * Math.sin(a) + rng.gauss() * rr, q); put(f, at++, q[0], q[1], q[2], clamp(1 - dist * 0.8, 0.5, 1), 1.5 - dist, 1, 1);
    }
    for (let i = 0; i < nCloud; i++) {
      const ax = i % 3, r = -Math.log(rng.next() * rng.next() * rng.next() + 1e-6) * R * 0.14, c = (rng.next() < 0.5 ? -1 : 1) * Math.cbrt(rng.next()), s = Math.sqrt(1 - c * c), az = rng.next() * TAU, lobe = [s * Math.cos(az), s * Math.sin(az), c], pp: Vec3 = [0, 0, 0];
      pp[ax] = lobe[2]; pp[(ax + 1) % 3] = lobe[0]; pp[(ax + 2) % 3] = lobe[1];
      put(f, at++, pp[0] * r, pp[1] * r, pp[2] * r, 0.55 + 0.15 * rng.next(), 0.9, 0.28, 1);
    }
  },
};

/* ───────────── 18. Particle Knot ───────────── */
export const knot: GeneratorDef = {
  id: "knot", name: "Particle Knot", tag: "Torus / figure-8 / Lissajous", method: "Curve with parallel-transport frames, tube sampling",
  description: "Knotted tubes: (p,q) torus knots, the figure-eight knot and a 3D Lissajous knot.",
  params: [select("type", "Knot type", [["torus", "Torus knot (p,q)"], ["figure8", "Figure-eight"], ["lissajous", "Lissajous"]], "torus"), range("p", "p (turns around)", 1, 7, 1, 2), range("q", "q (turns through)", 1, 9, 1, 3), range("size", "Size", 0.5, 1.3, 0.01, 0.95), range("tube", "Tube radius", 0.02, 0.22, 0.002, 0.085), range("ripple", "Tube ripple", 0, 0.5, 0.01, 0.12), range("fill", "Hollow ↔ solid", 0, 1, 0.01, 0.25)],
  recipe: { count: 70000, look: { palette: [{ t: 0, color: "#f43f5e" }, { t: 0.4, color: "#fb923c" }, { t: 0.75, color: "#facc15" }, { t: 1, color: "#fffbe6" }], size: 0.0075, glow: 0.7, lighting: 0.3 }, behaviors: [{ type: "home", intensity: 60 }, { type: "drag", intensity: 1.2 }], deformers: [{ type: "rotate", amount: 0.45, axis: "y", scale: 0 }], camera: { pitch: 0.4, yaw: 0.5, distance: 3.6 } },
  generate(ctx, f) {
    const { rng, params: p } = ctx, type = str(p, "type", "torus"), P = num(p, "p", 2), Q = num(p, "q", 3), S = num(p, "size", 0.95), tube = num(p, "tube", 0.085), rp = num(p, "ripple", 0.12);
    const curve = new Curve((s, o) => {
      const t = s * TAU;
      if (type === "figure8") { const r = 2 + Math.cos(2 * t); o[0] = r * Math.cos(3 * t) * 0.27 * S; o[1] = Math.sin(4 * t) * 0.27 * S * 1.2; o[2] = r * Math.sin(3 * t) * 0.27 * S; }
      else if (type === "lissajous") { o[0] = Math.cos(3 * t + 0.7) * 0.85 * S; o[1] = Math.cos(2 * t) * 0.85 * S; o[2] = Math.cos(7 * t + 0.3) * 0.85 * S; }
      else { const r = Math.cos(Q * t) + 2; o[0] = r * Math.cos(P * t) * 0.3 * S; o[2] = r * Math.sin(P * t) * 0.3 * S; o[1] = -Math.sin(Q * t) * 0.3 * S * 1.2; }
    }, true, 1200);
    const b = sampleTube(curve, f.n, rng, (u) => tube * (1 + rp * Math.sin(u * TAU * 14)), num(p, "fill", 0.25));
    writeBatch(f, b, 0, (i, s) => [0.5 + 0.5 * Math.sin(s.u[i] * TAU * Math.max(2, P) + s.v[i] * 2), 1, 0.95, 1]);
  },
};

/* ───────────── 19. Particle Explosion ───────────── */
export const explosion: GeneratorDef = {
  id: "explosion", name: "Particle Explosion", tag: "Frozen blast", method: "Noise-distorted shock shells, ray jets, gaussian debris clumps",
  description: "A frozen detonation: concentric shock shells, jets and debris. The default behaviors make it blow apart and reform.",
  params: [range("radius", "Blast radius", 0.5, 1.5, 0.01, 1), range("shells", "Shock shells", 1, 6, 1, 3), range("rays", "Jet share", 0, 0.6, 0.01, 0.3), range("debris", "Debris share", 0, 0.4, 0.01, 0.12), range("turb", "Turbulence", 0, 0.7, 0.01, 0.28), range("asym", "Asymmetry", 0, 1, 0.01, 0.3), range("jets", "Jet count", 6, 80, 1, 34)],
  recipe: { count: 90000, look: { palette: [{ t: 0, color: "#fff7d6" }, { t: 0.3, color: "#ffb02e" }, { t: 0.65, color: "#ff4d2e" }, { t: 1, color: "#5a1a14" }], size: 0.0068, glow: 0.95, velocityStretch: 0.3, velocityColor: 0.1 }, behaviors: [{ type: "release", intensity: 0.55, speed: 0.16, aux: 0.6 }, { type: "home", intensity: 24, aux: 0.5 }, { type: "radial", intensity: 4.5, radius: 0, falloff: "none" }, { type: "drag", intensity: 1.2 }], deformers: [], camera: { pitch: 0.2, yaw: 0.4, distance: 4.0, autoRotate: 0.1 } },
  generate(ctx, f) {
    const { rng, params: p } = ctx, R = num(p, "radius", 1), SH = Math.round(num(p, "shells", 3)), tb = num(p, "turb", 0.28), as = num(p, "asym", 0.3), J = Math.round(num(p, "jets", 34)), off = ctx.seed * 0.013;
    const nRay = Math.floor(f.n * num(p, "rays", 0.3)), nDeb = Math.floor(f.n * num(p, "debris", 0.12)), nShell = f.n - nRay - nDeb;
    const jets: Vec3[] = [], d: Vec3 = [0, 0, 0];
    for (let j = 0; j < J; j++) { const v: Vec3 = [0, 0, 0]; rng.onSphere(v); v[1] *= 1 + as * 0.7; const l = len3(v[0], v[1], v[2]); jets.push([v[0] / l, v[1] / l, v[2] / l]); }
    for (let i = 0; i < nShell; i++) {
      const sh = rng.int(SH), base = R * (0.32 + 0.62 * ((sh + 1) / SH)); rng.onSphere(d);
      const r = base * (1 + tb * (fbm(d[0] * 3 + sh * 4 + off, d[1] * 3, d[2] * 3) - 0.5) * 2) * (1 + as * 0.2 * d[1]) + rng.gauss() * (0.012 + 0.01 * sh);
      put(f, i, d[0] * r, d[1] * r, d[2] * r, clamp(0.08 + 0.55 * (sh / SH) + 0.25 * rng.next(), 0, 1), 1, 0.6 + 0.4 * rng.next(), 1, d[0], d[1], d[2]);
    }
    for (let i = 0; i < nRay; i++) {
      const j = jets[rng.int(J)], r = R * (0.1 + 1.2 * Math.pow(rng.next(), 0.85)), lat = 0.008 + 0.03 * (r / R);
      put(f, nShell + i, j[0] * r + rng.gauss() * lat, j[1] * r + rng.gauss() * lat, j[2] * r + rng.gauss() * lat, clamp(r / (R * 1.3), 0, 1) * 0.85, 1.1, 0.8, 1, j[0], j[1], j[2]);
    }
    const chunks: Vec3[] = [];
    for (let c = 0; c < 36; c++) { rng.onSphere(d); const r = R * (0.45 + 0.75 * rng.next()); chunks.push([d[0] * r, d[1] * r * (1 + as * 0.4), d[2] * r]); }
    for (let i = 0; i < nDeb; i++) { const c = chunks[rng.int(36)], s = 0.035 + 0.03 * rng.next(); put(f, nShell + nRay + i, c[0] + rng.gauss() * s, c[1] + rng.gauss() * s, c[2] + rng.gauss() * s, 0.8 + 0.2 * rng.next(), 1.35, 1, 1); }
  },
};

/* ───────────── 20. Fluid Sculpture ───────────── */
function smin(a: number, b: number, k: number) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
export const fluid: GeneratorDef = {
  id: "fluid", name: "Fluid Sculpture", tag: "Metaball liquid", heavy: true, method: "Smooth-union SDF metaballs + noise displacement, Newton projection sampling",
  description: "Merging liquid blobs smoothed together and rippled by noise; curl flow and cohesion keep the surface alive.",
  params: [range("blobs", "Blobs", 2, 9, 1, 5), range("size", "Size", 0.5, 1.4, 0.01, 0.95), range("smooth", "Merge smoothness", 0.04, 0.6, 0.01, 0.28), range("ripple", "Surface ripple", 0, 0.16, 0.002, 0.05), range("freq", "Ripple frequency", 1, 9, 0.1, 3.6)],
  recipe: { count: 50000, look: { palette: [{ t: 0, color: "#06b6d4" }, { t: 0.45, color: "#6366f1" }, { t: 0.8, color: "#e879f9" }, { t: 1, color: "#fff0ff" }], size: 0.008, glow: 0.7, lighting: 0.4, depthFade: 0.3 }, behaviors: [{ type: "home", intensity: 30, aux: 0.6 }, { type: "curl", intensity: 1.4, scale: 1.3, speed: 0.4 }, { type: "cohesion", intensity: 0.6, radius: 0.12 }, { type: "drag", intensity: 1.5 }], deformers: [{ type: "noise", amount: 0.07, scale: 1.1, speed: 0.4 }], camera: { pitch: 0.3, yaw: 0.5, distance: 3.6 } },
  generate(ctx, f) {
    const { rng, params: p } = ctx, B = Math.round(num(p, "blobs", 5)), S = num(p, "size", 0.95), k = num(p, "smooth", 0.28), amp = num(p, "ripple", 0.05), fr = num(p, "freq", 3.6), off = ctx.seed * 0.021;
    const cs: Vec3[] = [], rs: number[] = [];
    for (let i = 0; i < B; i++) { cs.push([0.42 * Math.sin(1.3 * i + 0.4) * S, 0.38 * Math.sin(1.9 * i + 1.1) * S, 0.42 * Math.cos(1.1 * i + 2.0) * S]); rs.push((0.26 + 0.1 * ((i * 0.618) % 1)) * S); }
    const sdf = (x: number, y: number, z: number) => { let d = 1e9; for (let i = 0; i < B; i++) { const c = cs[i], di = Math.sqrt((x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2) - rs[i]; d = i === 0 ? di : smin(d, di, k); } return d + amp * gnoise(x * fr + off, y * fr, z * fr); };
    const b = sampleSDFSurface(sdf, 1.5 * S, f.n, rng, { iterations: 7, tolerance: 0.004 });
    writeBatch(f, b, 0, (i, s) => { const o = i * 3; return [clamp(0.35 + 0.35 * s.nrm[o + 1] + 0.3 * fbm(s.pos[o] * 2 + off, s.pos[o + 1] * 2, s.pos[o + 2] * 2), 0, 1), 1, 0.9, 1]; });
  },
};

export const SHAPES4 = [neural, atom, knot, explosion, fluid];
