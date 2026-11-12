/**
 * Geometry sampling engine. Turns parametric surfaces, meshes, curves, signed distance
 * fields and density fields into well-distributed particle positions.
 * Modes: uniform (stratified), random, poisson-disk (blue noise), density-weighted,
 * volume, edge and vertex sampling.
 */
import type { Formation, Vec3 } from "./types";
import { Rng, TAU, anyPerp, len3, lerp } from "./math";

export type Distribution = "uniform" | "random" | "poisson";
export interface SampleBatch { n: number; pos: Float32Array; nrm: Float32Array; u: Float32Array; v: Float32Array; id: Uint16Array }
export const newBatch = (n: number): SampleBatch => ({ n, pos: new Float32Array(n * 3), nrm: new Float32Array(n * 3), u: new Float32Array(n), v: new Float32Array(n), id: new Uint16Array(n) });

/* ───────── formation helpers ───────── */
export function allocFormation(n: number): Formation {
  return {
    n, pos: new Float32Array(n * 3), nrm: new Float32Array(n * 3), t: new Float32Array(n), size: new Float32Array(n).fill(1),
    alpha: new Float32Array(n).fill(1), phase: new Float32Array(n), weight: new Float32Array(n).fill(1), layer: new Uint8Array(n), radius: 1,
  };
}
function swap(a: Float32Array, i: number, j: number) { const t = a[i]; a[i] = a[j]; a[j] = t; }
/** Random permutation so that truncating to the first k particles stays uniform. */
export function shuffleFormation(f: Formation, rng: Rng) {
  const { n } = f;
  for (let i = n - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    if (j === i) continue;
    for (let c = 0; c < 3; c++) {
      let a = f.pos[i * 3 + c]; f.pos[i * 3 + c] = f.pos[j * 3 + c]; f.pos[j * 3 + c] = a;
      a = f.nrm[i * 3 + c]; f.nrm[i * 3 + c] = f.nrm[j * 3 + c]; f.nrm[j * 3 + c] = a;
    }
    swap(f.t, i, j); swap(f.size, i, j); swap(f.alpha, i, j); swap(f.phase, i, j); swap(f.weight, i, j);
    const l = f.layer[i]; f.layer[i] = f.layer[j]; f.layer[j] = l;
  }
}
/** Normalises normals, fills missing phases and computes the bounding radius. A fitRadius > 0 rescales the shape so its 99.5th-percentile radius equals it. */
export function finalizeFormation(f: Formation, rng: Rng, fitRadius = 0) {
  const rs = new Float32Array(f.n);
  let maxR = 0;
  for (let i = 0; i < f.n; i++) {
    const o = i * 3, r = len3(f.pos[o], f.pos[o + 1], f.pos[o + 2]);
    rs[i] = r; if (r > maxR) maxR = r;
  }
  if (fitRadius > 0 && maxR > 0) {
    const sorted = Float32Array.from(rs).sort();
    const ref = sorted[Math.min(f.n - 1, Math.floor(f.n * 0.995))] || maxR;
    const k = fitRadius / ref;
    for (let i = 0; i < f.n * 3; i++) f.pos[i] *= k;
    maxR *= k;
  }
  for (let i = 0; i < f.n; i++) {
    const o = i * 3, l = len3(f.nrm[o], f.nrm[o + 1], f.nrm[o + 2]);
    if (l > 1e-6) { f.nrm[o] /= l; f.nrm[o + 1] /= l; f.nrm[o + 2] /= l; }
    if (f.phase[i] === 0) f.phase[i] = rng.next();
    const t = f.t[i]; f.t[i] = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  // robust bounding radius: ignore the outermost 0.5 % (stray particles)
  const sorted = Float32Array.from(rs).sort();
  f.radius = (sorted[Math.min(f.n - 1, Math.floor(f.n * 0.995))] || maxR || 1);
}

/* ───────── parametric surfaces ───────── */
export interface ParamSurface {
  u0: number; u1: number; v0: number; v1: number;
  eval(u: number, v: number, out: Vec3): void;
  /** optional density weight ≥ 0 (density-weighted sampling) */
  weight?(u: number, v: number): number;
}
export interface SurfaceOptions { distribution: Distribution; randomness: number; grid?: number }

const R2A = 0.7548776662466927, R2B = 0.5698402909980532;
const P0: Vec3 = [0, 0, 0], P1: Vec3 = [0, 0, 0], P2: Vec3 = [0, 0, 0];

interface Table { gu: number; gv: number; cdf: Float64Array; area: number }
function buildTable(s: ParamSurface, grid: number): Table {
  const gu = grid, gv = grid, cdf = new Float64Array(gu * gv);
  let acc = 0;
  const du = (s.u1 - s.u0) / gu, dv = (s.v1 - s.v0) / gv;
  for (let j = 0; j < gv; j++) for (let i = 0; i < gu; i++) {
    const u = s.u0 + i * du, v = s.v0 + j * dv;
    s.eval(u, v, P0); s.eval(u + du, v, P1); s.eval(u, v + dv, P2);
    const ax = P1[0] - P0[0], ay = P1[1] - P0[1], az = P1[2] - P0[2], bx = P2[0] - P0[0], by = P2[1] - P0[1], bz = P2[2] - P0[2];
    let a = len3(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    if (s.weight) a *= Math.max(0, s.weight(u + du / 2, v + dv / 2));
    acc += a; cdf[j * gu + i] = acc;
  }
  return { gu, gv, cdf, area: acc };
}
function pickCell(cdf: Float64Array, q: number): number {
  let lo = 0, hi = cdf.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < q) lo = m + 1; else hi = m; }
  return lo;
}
const NA: Vec3 = [0, 0, 0], NB: Vec3 = [0, 0, 0], NC: Vec3 = [0, 0, 0], ND: Vec3 = [0, 0, 0];
function surfaceNormal(s: ParamSurface, u: number, v: number, out: Float32Array, o: number) {
  const e = 1e-3, du = (s.u1 - s.u0) * e, dv = (s.v1 - s.v0) * e;
  s.eval(u - du, v, NA); s.eval(u + du, v, NB); s.eval(u, v - dv, NC); s.eval(u, v + dv, ND);
  const ax = NB[0] - NA[0], ay = NB[1] - NA[1], az = NB[2] - NA[2], bx = ND[0] - NC[0], by = ND[1] - NC[1], bz = ND[2] - NC[2];
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const l = len3(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  out[o] = nx; out[o + 1] = ny; out[o + 2] = nz;
}

/** Samples n particles over one or several parametric surfaces. */
export function sampleSurfaces(surfaces: ParamSurface[], n: number, rng: Rng, opts: SurfaceOptions): SampleBatch {
  const out = newBatch(n);
  if (!surfaces.length || n <= 0) return out;
  const grid = opts.grid ?? (surfaces.length > 8 ? 24 : 72);
  const tables = surfaces.map((s) => buildTable(s, grid));
  const total = tables.reduce((a, t) => a + t.area, 0) || 1;
  const counts = tables.map((t) => Math.floor((n * t.area) / total));
  let rest = n - counts.reduce((a, b) => a + b, 0);
  for (let k = 0; rest > 0; k = (k + 1) % counts.length, rest--) counts[tables[k].area > 0 ? k : 0]++;
  let w = 0;
  const r = Math.min(1, Math.max(0, opts.randomness));
  for (let si = 0; si < surfaces.length; si++) {
    const s = surfaces[si], t = tables[si], m = counts[si];
    if (m <= 0 || t.area <= 0) continue;
    const du = (s.u1 - s.u0) / t.gu, dv = (s.v1 - s.v0) / t.gv;
    const first = w;
    const place = (u: number, v: number) => {
      s.eval(u, v, P0);
      out.pos[w * 3] = P0[0]; out.pos[w * 3 + 1] = P0[1]; out.pos[w * 3 + 2] = P0[2];
      surfaceNormal(s, u, v, out.nrm, w * 3);
      out.u[w] = (u - s.u0) / (s.u1 - s.u0); out.v[w] = (v - s.v0) / (s.v1 - s.v0); out.id[w] = si; w++;
    };
    if (opts.distribution === "poisson") {
      const d = 0.62 * Math.sqrt((2 * t.area) / (Math.sqrt(3) * m)), inv = 1 / d; // 0.62 keeps the target below random-packing saturation
      const grid3 = new Map<number, number[]>();
      const cellKey = (x: number, y: number, z: number) => ((x + 4096) * 8192 + (y + 4096)) * 8192 + (z + 4096);
      let accepted = 0, tries = 0;
      const max = m * 40;
      while (accepted < m && tries < max) {
        tries++;
        const c = pickCell(t.cdf, rng.next() * t.area), ci = c % t.gu, cj = (c / t.gu) | 0;
        const u = s.u0 + (ci + rng.next()) * du, v = s.v0 + (cj + rng.next()) * dv;
        s.eval(u, v, P0);
        const x = P0[0], y = P0[1], z = P0[2];
        const bx = Math.floor(x * inv), by = Math.floor(y * inv), bz = Math.floor(z * inv);
        let ok = true;
        for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1 && ok; b++) for (let c2 = -1; c2 <= 1 && ok; c2++) {
          const list = grid3.get(cellKey(bx + a, by + b, bz + c2));
          if (!list) continue;
          for (let q = 0; q < list.length; q++) {
            const o = list[q] * 3, dx = out.pos[o] - x, dy = out.pos[o + 1] - y, dz = out.pos[o + 2] - z;
            if (dx * dx + dy * dy + dz * dz < d * d) { ok = false; break; }
          }
        }
        if (!ok) continue;
        const key = cellKey(bx, by, bz), list = grid3.get(key);
        if (list) list.push(w); else grid3.set(key, [w]);
        place(u, v); accepted++;
      }
      for (; accepted < m; accepted++) { // top up if packing saturated
        const c = pickCell(t.cdf, rng.next() * t.area);
        place(s.u0 + ((c % t.gu) + rng.next()) * du, s.v0 + (((c / t.gu) | 0) + rng.next()) * dv);
      }
    } else {
      for (let k = 0; k < m; k++) {
        const q = opts.distribution === "uniform" ? (k + 0.5 + (rng.next() - 0.5) * r) / m : rng.next();
        const c = pickCell(t.cdf, Math.min(0.999999, Math.max(0, q)) * t.area), ci = c % t.gu, cj = (c / t.gu) | 0;
        let a: number, b: number;
        if (opts.distribution === "uniform") {
          a = lerp((0.5 + (first + k) * R2A) % 1, rng.next(), r); b = lerp((0.5 + (first + k) * R2B) % 1, rng.next(), r);
        } else { a = rng.next(); b = rng.next(); }
        place(s.u0 + (ci + a) * du, s.v0 + (cj + b) * dv);
      }
    }
  }
  return out;
}

/* ───────── triangle meshes ───────── */
/** Area-weighted triangle sampling. tris holds 9 floats per triangle. */
export function sampleMesh(tris: Float32Array, n: number, rng: Rng, weights?: Float32Array): SampleBatch {
  const tc = tris.length / 9, out = newBatch(n), cdf = new Float64Array(tc);
  let acc = 0;
  for (let i = 0; i < tc; i++) {
    const o = i * 9, ax = tris[o + 3] - tris[o], ay = tris[o + 4] - tris[o + 1], az = tris[o + 5] - tris[o + 2];
    const bx = tris[o + 6] - tris[o], by = tris[o + 7] - tris[o + 1], bz = tris[o + 8] - tris[o + 2];
    acc += 0.5 * len3(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) * (weights ? weights[i] : 1);
    cdf[i] = acc;
  }
  for (let k = 0; k < n; k++) {
    const i = pickCell(cdf, rng.next() * acc), o = i * 9;
    let a = rng.next(), b = rng.next();
    if (a + b > 1) { a = 1 - a; b = 1 - b; }
    for (let c = 0; c < 3; c++) out.pos[k * 3 + c] = tris[o + c] + a * (tris[o + 3 + c] - tris[o + c]) + b * (tris[o + 6 + c] - tris[o + c]);
    const ax = tris[o + 3] - tris[o], ay = tris[o + 4] - tris[o + 1], az = tris[o + 5] - tris[o + 2];
    const bx = tris[o + 6] - tris[o], by = tris[o + 7] - tris[o + 1], bz = tris[o + 8] - tris[o + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, l = len3(nx, ny, nz) || 1;
    out.nrm[k * 3] = nx / l; out.nrm[k * 3 + 1] = ny / l; out.nrm[k * 3 + 2] = nz / l;
    out.u[k] = a; out.v[k] = b; out.id[k] = Math.min(65535, i);
  }
  return out;
}

/* ───────── curves with parallel-transport frames ───────── */
export class Curve {
  readonly m: number;
  readonly length: number;
  private pts: Float32Array; private tan: Float32Array; private nor: Float32Array; private cum: Float64Array;
  constructor(fn: (s: number, out: Vec3) => void, readonly closed = false, segments = 600) {
    const m = (this.m = segments), N = m + 1, p: Vec3 = [0, 0, 0];
    this.pts = new Float32Array(N * 3); this.tan = new Float32Array(N * 3); this.nor = new Float32Array(N * 3); this.cum = new Float64Array(N);
    for (let i = 0; i < N; i++) { fn(closed ? (i % m) / m : i / m, p); this.pts.set(p, i * 3); }
    let acc = 0;
    for (let i = 1; i < N; i++) { acc += len3(this.pts[i * 3] - this.pts[i * 3 - 3], this.pts[i * 3 + 1] - this.pts[i * 3 - 2], this.pts[i * 3 + 2] - this.pts[i * 3 - 1]); this.cum[i] = acc; }
    this.length = acc;
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
      let tx = this.pts[b * 3] - this.pts[a * 3], ty = this.pts[b * 3 + 1] - this.pts[a * 3 + 1], tz = this.pts[b * 3 + 2] - this.pts[a * 3 + 2];
      const l = len3(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
      this.tan[i * 3] = tx; this.tan[i * 3 + 1] = ty; this.tan[i * 3 + 2] = tz;
    }
    const nn: Vec3 = [0, 0, 0];
    anyPerp(this.tan[0], this.tan[1], this.tan[2], nn);
    for (let i = 0; i < N; i++) {
      const tx = this.tan[i * 3], ty = this.tan[i * 3 + 1], tz = this.tan[i * 3 + 2];
      const d = nn[0] * tx + nn[1] * ty + nn[2] * tz;
      nn[0] -= d * tx; nn[1] -= d * ty; nn[2] -= d * tz;
      const l = len3(nn[0], nn[1], nn[2]) || 1; nn[0] /= l; nn[1] /= l; nn[2] /= l;
      this.nor.set(nn, i * 3);
    }
  }
  /** f in [0,1) by arc length. Writes position, tangent, normal, binormal. */
  at(f: number, P: Vec3, T: Vec3, N: Vec3, B: Vec3) {
    const target = (f - Math.floor(f)) * this.length;
    let lo = 0, hi = this.m;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.cum[mid] < target) lo = mid + 1; else hi = mid; }
    const i1 = Math.max(1, lo), i0 = i1 - 1, span = this.cum[i1] - this.cum[i0] || 1, k = (target - this.cum[i0]) / span;
    for (let c = 0; c < 3; c++) {
      P[c] = lerp(this.pts[i0 * 3 + c], this.pts[i1 * 3 + c], k);
      T[c] = lerp(this.tan[i0 * 3 + c], this.tan[i1 * 3 + c], k);
      N[c] = lerp(this.nor[i0 * 3 + c], this.nor[i1 * 3 + c], k);
    }
    const tl = len3(T[0], T[1], T[2]) || 1; T[0] /= tl; T[1] /= tl; T[2] /= tl;
    const d = N[0] * T[0] + N[1] * T[1] + N[2] * T[2];
    N[0] -= d * T[0]; N[1] -= d * T[1]; N[2] -= d * T[2];
    const nl = len3(N[0], N[1], N[2]) || 1; N[0] /= nl; N[1] /= nl; N[2] /= nl;
    B[0] = T[1] * N[2] - T[2] * N[1]; B[1] = T[2] * N[0] - T[0] * N[2]; B[2] = T[0] * N[1] - T[1] * N[0];
  }
}
/** Particles on a tube around a curve. radiusAt(f) lets the tube vary; fill 0 = hollow shell, 1 = solid. */
export function sampleTube(curve: Curve, n: number, rng: Rng, radiusAt: (f: number) => number, fill = 0, uniformAlong = true): SampleBatch {
  const out = newBatch(n), P: Vec3 = [0, 0, 0], T: Vec3 = [0, 0, 0], N: Vec3 = [0, 0, 0], B: Vec3 = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    const f = uniformAlong ? (k + rng.next()) / n : rng.next();
    curve.at(f, P, T, N, B);
    const a = rng.next() * TAU, rr = radiusAt(f) * (fill > 0 ? (1 - fill) + fill * Math.sqrt(rng.next()) : 1);
    const c = Math.cos(a), s = Math.sin(a);
    for (let q = 0; q < 3; q++) {
      out.nrm[k * 3 + q] = N[q] * c + B[q] * s;
      out.pos[k * 3 + q] = P[q] + out.nrm[k * 3 + q] * rr;
    }
    out.u[k] = f; out.v[k] = a / TAU;
  }
  return out;
}

/* ───────── signed distance fields ───────── */
export type SDF = (x: number, y: number, z: number) => number;
export interface SDFOptions { iterations?: number; tolerance?: number }
/** Surface sampling by Newton projection of random points onto the zero level set. */
export function sampleSDFSurface(sdf: SDF, bound: number, n: number, rng: Rng, opts: SDFOptions = {}): SampleBatch {
  const out = newBatch(n), iters = opts.iterations ?? 8, tol = (opts.tolerance ?? 0.002) * bound, h = bound * 1e-3;
  let got = 0, tries = 0;
  const max = n * 30;
  while (got < n && tries < max) {
    tries++;
    let x = rng.range(-bound, bound), y = rng.range(-bound, bound), z = rng.range(-bound, bound);
    if (x * x + y * y + z * z > bound * bound) continue;
    let ok = false, gx = 0, gy = 0, gz = 0;
    for (let it = 0; it < iters; it++) {
      const d = sdf(x, y, z);
      gx = (sdf(x + h, y, z) - d) / h; gy = (sdf(x, y + h, z) - d) / h; gz = (sdf(x, y, z + h) - d) / h;
      const gl = gx * gx + gy * gy + gz * gz;
      if (gl < 1e-12) break;
      if (Math.abs(d) < tol) { ok = true; break; }
      const k = d / gl; // Newton step: p -= d * g / |g|^2
      x -= gx * k; y -= gy * k; z -= gz * k;
    }
    if (!ok) continue;
    const l = len3(gx, gy, gz) || 1;
    out.pos[got * 3] = x; out.pos[got * 3 + 1] = y; out.pos[got * 3 + 2] = z;
    out.nrm[got * 3] = gx / l; out.nrm[got * 3 + 1] = gy / l; out.nrm[got * 3 + 2] = gz / l;
    got++;
  }
  for (let k = got; k < n; k++) { // fallback so n is always honoured
    const s = k % Math.max(1, got), o = s * 3;
    for (let c = 0; c < 3; c++) { out.pos[k * 3 + c] = out.pos[o + c]; out.nrm[k * 3 + c] = out.nrm[o + c]; }
  }
  return out;
}
/** Volume sampling by rejection against a density in [0,1]. */
export function sampleDensity(density: (x: number, y: number, z: number) => number, min: Vec3, max: Vec3, n: number, rng: Rng): SampleBatch {
  const out = newBatch(n);
  let got = 0, tries = 0;
  const maxTries = n * 60;
  while (got < n && tries < maxTries) {
    tries++;
    const x = rng.range(min[0], max[0]), y = rng.range(min[1], max[1]), z = rng.range(min[2], max[2]);
    if (rng.next() > density(x, y, z)) continue;
    out.pos[got * 3] = x; out.pos[got * 3 + 1] = y; out.pos[got * 3 + 2] = z; got++;
  }
  for (let k = got; k < n; k++) {
    out.pos[k * 3] = rng.range(min[0], max[0]) * 0.3; out.pos[k * 3 + 1] = rng.range(min[1], max[1]) * 0.3; out.pos[k * 3 + 2] = rng.range(min[2], max[2]) * 0.3;
  }
  return out;
}
/** Edge sampling: points along line segments (6 floats per segment). */
export function sampleSegments(segs: Float32Array, n: number, rng: Rng): SampleBatch {
  const sc = segs.length / 6, out = newBatch(n), cdf = new Float64Array(sc);
  let acc = 0;
  for (let i = 0; i < sc; i++) { acc += len3(segs[i * 6 + 3] - segs[i * 6], segs[i * 6 + 4] - segs[i * 6 + 1], segs[i * 6 + 5] - segs[i * 6 + 2]); cdf[i] = acc; }
  for (let k = 0; k < n; k++) {
    const i = pickCell(cdf, rng.next() * acc), t = rng.next();
    for (let c = 0; c < 3; c++) out.pos[k * 3 + c] = lerp(segs[i * 6 + c], segs[i * 6 + 3 + c], t);
    out.u[k] = t; out.id[k] = i;
  }
  return out;
}
/** Poisson-disk filtered point set inside an ellipsoid (neural nodes etc.). */
export function poissonBall(count: number, radius: Vec3, minDist: number, rng: Rng): Float32Array {
  const pts: number[] = [];
  let tries = 0;
  while (pts.length / 3 < count && tries < count * 200) {
    tries++;
    const x = rng.range(-1, 1), y = rng.range(-1, 1), z = rng.range(-1, 1);
    if (x * x + y * y + z * z > 1) continue;
    const px = x * radius[0], py = y * radius[1], pz = z * radius[2];
    let ok = true;
    for (let i = 0; i < pts.length; i += 3) { const dx = pts[i] - px, dy = pts[i + 1] - py, dz = pts[i + 2] - pz; if (dx * dx + dy * dy + dz * dz < minDist * minDist) { ok = false; break; } }
    if (ok) pts.push(px, py, pz);
  }
  return Float32Array.from(pts);
}

/* ───────── text ───────── */
export type TextMaskT = { w: number; h: number; pts: Int32Array } | null;
/** Text -> lit pixel list. Needs a DOM; returns null elsewhere. */
export function rasterizeText(text: string): TextMaskT {
  if (typeof document === "undefined" || !text.trim()) return null;
  const font = '900 200px "Arial Black","Helvetica Neue",Impact,system-ui,sans-serif';
  const c = document.createElement("canvas"), g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 40, h = 320;
  c.width = w; c.height = h;
  g.font = font; g.textBaseline = "middle"; g.textAlign = "center"; g.fillStyle = "#fff"; g.fillText(text, w / 2, h / 2);
  const data = g.getImageData(0, 0, w, h).data, list: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 140) list.push(x, y);
  return list.length ? { w, h, pts: Int32Array.from(list) } : null;
}

/** i-th of n evenly spread golden-spiral directions on the unit sphere. */
export function fibonacciSphere(i: number, n: number, out: Vec3) {
  const z = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(Math.max(0, 1 - z * z)), a = i * 2.399963229728653;
  out[0] = r * Math.cos(a); out[1] = z; out[2] = r * Math.sin(a);
}
