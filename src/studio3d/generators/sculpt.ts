/**
 * Sculpting toolkit for anatomically convincing 3D particle formations.
 *
 * A model is a union of solid primitives (ellipsoids, tapered capsules, splined tubes, lofted
 * bodies) that are blended with a smooth-minimum signed distance field, plus thin sheets
 * (wings, fins, petals, feathers) and strand bundles (tentacles, mane, whiskers).
 * Solid skin is sampled uniformly by area on every primitive, culled where another primitive
 * covers it, then projected onto the blended surface so joints read as continuous flesh.
 */
import type { BehaviorSeed, CameraSettings, DeformerSeed, Formation, GeneratorDef, GeneratorId, Look } from "../types";
import { Rng, TAU, clamp } from "../math";
import { sampleSurfaces, type ParamSurface } from "../sampling";
import { put, range } from "./common";

export type V3 = [number, number, number];
export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
export const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len3v = (a: V3) => Math.sqrt(dot3(a, a));
export const norm3 = (a: V3): V3 => { const l = len3v(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mixn = (a: number, b: number, t: number) => a + (b - a) * t;
export const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export type ColorFn = (x: number, y: number, z: number) => number;
/** `true`/"x" mirrors across the yz plane, "z" across the xy plane. */
export type Sym = boolean | "x" | "z";
const mirrorV = (a: V3, sym: Sym): V3 => (sym === "z" ? [a[0], a[1], -a[2]] : [-a[0], a[1], a[2]]);
export interface PrimOpts { c?: number; k?: number; sz?: number; al?: number; dens?: number; sym?: Sym; cg?: ColorFn; neg?: boolean }

/* ───────── catmull-rom helpers ───────── */
function cr(p0: number, p1: number, p2: number, p3: number, f: number) {
  const f2 = f * f, f3 = f2 * f;
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
}
export function crScalar(vals: number[], s: number): number {
  const n = vals.length - 1;
  if (n <= 0) return vals[0];
  const i = Math.min(n - 1, Math.max(0, Math.floor(s))), f = clamp(s - i, 0, 1);
  const g = (k: number) => vals[Math.min(n, Math.max(0, k))];
  return cr(g(i - 1), g(i), g(i + 1), g(i + 2), f);
}
export function crPoint(pts: V3[], s: number): V3 {
  return [crScalar(pts.map((p) => p[0]), s), crScalar(pts.map((p) => p[1]), s), crScalar(pts.map((p) => p[2]), s)];
}
/** seg+1 points along a Catmull-Rom spline through the control points (uniform in parameter). */
export function splinePoints(pts: V3[], seg: number): V3[] {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), zs = pts.map((p) => p[2]), n = pts.length - 1, out: V3[] = [];
  for (let i = 0; i <= seg; i++) { const s = (i / seg) * n; out.push([crScalar(xs, s), crScalar(ys, s), crScalar(zs, s)]); }
  return out;
}
export function splineScalars(vals: number[], seg: number): number[] {
  const n = vals.length - 1, out: number[] = [];
  for (let i = 0; i <= seg; i++) out.push(crScalar(vals, (i / seg) * n));
  return out;
}
/** Evaluates a polyline at u in [0,1] by arc length. */
export function polyAt(pts: V3[], u: number): V3 {
  const lens: number[] = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + len3v(sub3(pts[i], pts[i - 1])));
  const target = clamp(u, 0, 1) * lens[lens.length - 1];
  for (let i = 1; i < pts.length; i++) if (target <= lens[i]) return mix3(pts[i - 1], pts[i], (target - lens[i - 1]) / ((lens[i] - lens[i - 1]) || 1));
  return pts[pts.length - 1];
}

/* ───────── orientation ───────── */
type Axes = [V3, V3, V3];
export function eulerAxes(rx: number, ry: number, rz: number): Axes {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    [cz * cy, sz * cy, -sy],
    [cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx],
    [cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx],
  ];
}
export function dirAxes(dir: V3, up: V3 = [0, 1, 0]): Axes {
  const ex = norm3(dir);
  let ez = cross3(ex, up);
  if (len3v(ez) < 1e-5) ez = cross3(ex, [0, 0, 1]);
  ez = norm3(ez);
  const ey = cross3(ez, ex);
  return [ex, ey, ez];
}

/* ───────── primitives ───────── */
type Sample6 = Float64Array;
abstract class Prim {
  bx = 0; by = 0; bz = 0; br = 1;
  area = 1; k = 0.05; c = 0.5; sz = 1; al = 1; dens = 1; neg = false;
  cg?: ColorFn;
  abstract dist(x: number, y: number, z: number): number;
  abstract sample(rng: Rng, o: Sample6): void;
  lb(x: number, y: number, z: number) { return Math.sqrt((x - this.bx) ** 2 + (y - this.by) ** 2 + (z - this.bz) ** 2) - this.br; }
}

class EllPrim extends Prim {
  constructor(readonly c0: V3, readonly r: V3, readonly ax: Axes) {
    super();
    this.bx = c0[0]; this.by = c0[1]; this.bz = c0[2]; this.br = Math.max(r[0], r[1], r[2]);
    const [a, b, c] = r, p = 1.6075;
    this.area = 4 * Math.PI * Math.pow((Math.pow(a * b, p) + Math.pow(a * c, p) + Math.pow(b * c, p)) / 3, 1 / p);
  }
  dist(x: number, y: number, z: number) {
    const dx = x - this.c0[0], dy = y - this.c0[1], dz = z - this.c0[2], { ax, r } = this;
    const qx = (ax[0][0] * dx + ax[0][1] * dy + ax[0][2] * dz) / r[0], qy = (ax[1][0] * dx + ax[1][1] * dy + ax[1][2] * dz) / r[1], qz = (ax[2][0] * dx + ax[2][1] * dy + ax[2][2] * dz) / r[2];
    const k0 = Math.sqrt(qx * qx + qy * qy + qz * qz);
    const k1 = Math.sqrt((qx / r[0]) ** 2 + (qy / r[1]) ** 2 + (qz / r[2]) ** 2);
    return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
  }
  sample(rng: Rng, o: Sample6) {
    const [rx, ry, rz] = this.r, wmax = Math.max(ry * rz, rx * rz, rx * ry);
    let dx = 0, dy = 0, dz = 0;
    for (let t = 0; t < 12; t++) {
      const z = rng.next() * 2 - 1, a = rng.next() * TAU, s = Math.sqrt(1 - z * z);
      dx = s * Math.cos(a); dy = z; dz = s * Math.sin(a);
      const f = Math.sqrt((ry * rz * dx) ** 2 + (rx * rz * dy) ** 2 + (rx * ry * dz) ** 2);
      if (rng.next() * wmax <= f) break;
    }
    const lx = dx * rx, ly = dy * ry, lz = dz * rz, { ax } = this;
    o[0] = this.c0[0] + ax[0][0] * lx + ax[1][0] * ly + ax[2][0] * lz;
    o[1] = this.c0[1] + ax[0][1] * lx + ax[1][1] * ly + ax[2][1] * lz;
    o[2] = this.c0[2] + ax[0][2] * lx + ax[1][2] * ly + ax[2][2] * lz;
    const nx = dx / rx, ny = dy / ry, nz = dz / rz;
    const wx = ax[0][0] * nx + ax[1][0] * ny + ax[2][0] * nz, wy = ax[0][1] * nx + ax[1][1] * ny + ax[2][1] * nz, wz = ax[0][2] * nx + ax[1][2] * ny + ax[2][2] * nz, l = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1;
    o[3] = wx / l; o[4] = wy / l; o[5] = wz / l;
  }
}

class ConePrim extends Prim {
  private readonly ba: V3; private readonly l2: number; private readonly rr: number; private readonly a2: number; private readonly il2: number;
  private readonly axis: V3; private readonly u: V3; private readonly w: V3; private readonly sinB: number; private readonly cosB: number;
  private readonly aF: number; private readonly aA: number; private readonly aB: number; private readonly L: number;
  constructor(readonly A: V3, readonly B: V3, readonly ra: number, readonly rb: number) {
    super();
    this.ba = sub3(B, A); this.l2 = dot3(this.ba, this.ba); this.L = Math.sqrt(this.l2);
    this.rr = ra - rb; this.a2 = this.l2 - this.rr * this.rr; this.il2 = 1 / Math.max(1e-12, this.l2);
    this.axis = norm3(this.ba);
    const ax = dirAxes(this.axis); this.u = ax[1]; this.w = ax[2];
    this.sinB = clamp(this.rr / Math.max(1e-9, this.L), -0.999, 0.999); this.cosB = Math.sqrt(1 - this.sinB * this.sinB);
    this.aF = Math.PI * (ra + rb) * this.L * this.cosB * this.cosB;
    this.aA = 2 * Math.PI * ra * ra * (1 + this.sinB); this.aB = 2 * Math.PI * rb * rb * (1 - this.sinB);
    this.area = this.aF + this.aA + this.aB;
    this.bx = (A[0] + B[0]) / 2; this.by = (A[1] + B[1]) / 2; this.bz = (A[2] + B[2]) / 2; this.br = this.L / 2 + Math.max(ra, rb);
  }
  dist(x: number, y: number, z: number) {
    const { A, ba, l2, rr, a2, il2 } = this, r1 = this.ra, r2 = this.rb;
    const pax = x - A[0], pay = y - A[1], paz = z - A[2];
    const y1 = pax * ba[0] + pay * ba[1] + paz * ba[2], z1 = y1 - l2;
    const qx = pax * l2 - ba[0] * y1, qy = pay * l2 - ba[1] * y1, qz = paz * l2 - ba[2] * y1;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = y1 * y1 * l2, z2 = z1 * z1 * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z1) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(y1) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + y1 * rr) * il2 - r1;
  }
  sample(rng: Rng, o: Sample6) {
    const q = rng.next() * this.area, phi = rng.next() * TAU, cp = Math.cos(phi), sp = Math.sin(phi), { axis, u, w, sinB, cosB } = this;
    let nx: number, ny: number, nz: number, px: number, py: number, pz: number;
    if (q < this.aF) {
      const ra = this.ra, rb = this.rb, U = rng.next(), d = rb - ra;
      const s = Math.abs(d) < 1e-6 * (ra + rb) ? U : (-ra + Math.sqrt(ra * ra + d * (ra + rb) * U)) / d;
      const rx = cp * u[0] + sp * w[0], ry = cp * u[1] + sp * w[1], rz = cp * u[2] + sp * w[2];
      nx = cosB * rx + sinB * axis[0]; ny = cosB * ry + sinB * axis[1]; nz = cosB * rz + sinB * axis[2];
      const r = mixn(ra, rb, s);
      px = this.A[0] + this.ba[0] * s + nx * r; py = this.A[1] + this.ba[1] * s + ny * r; pz = this.A[2] + this.ba[2] * s + nz * r;
    } else {
      const capA = q < this.aF + this.aA, z = capA ? -1 + rng.next() * (1 + sinB) : sinB + rng.next() * (1 - sinB), s = Math.sqrt(Math.max(0, 1 - z * z));
      nx = z * axis[0] + s * (cp * u[0] + sp * w[0]); ny = z * axis[1] + s * (cp * u[1] + sp * w[1]); nz = z * axis[2] + s * (cp * u[2] + sp * w[2]);
      const C = capA ? this.A : this.B, r = capA ? this.ra : this.rb;
      px = C[0] + nx * r; py = C[1] + ny * r; pz = C[2] + nz * r;
    }
    o[0] = px; o[1] = py; o[2] = pz; o[3] = nx; o[4] = ny; o[5] = nz;
  }
}

function applyOpts(p: Prim, o: PrimOpts, kDefault: number) {
  p.c = o.c ?? 0.5; p.k = o.k ?? kDefault; p.sz = o.sz ?? 1; p.al = o.al ?? 1; p.dens = o.dens ?? 1; p.cg = o.cg; p.neg = !!o.neg;
  return p;
}

export type Sink = (x: number, y: number, z: number, nx: number, ny: number, nz: number, t: number, size: number, alpha: number) => void;
export interface Emitter { w: number; /** Optional weight that depends on the surface particle density (particles per unit area). */ dyn?: (rho: number) => number; emit(n: number, rng: Rng, sink: Sink): void }

const smin = (a: number, b: number, k: number) => { if (k <= 1e-9) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

/* ───────── solid: smooth union of primitives ───────── */
export interface EllOpts extends PrimOpts { rot?: V3; dir?: V3; up?: V3 }
export interface TubeOpts extends PrimOpts { seg?: number; cgFromT?: (t: number) => number }
export class Solid implements Emitter {
  readonly pos: Prim[] = []; readonly negs: Prim[] = [];
  w = 1; disp?: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number; shade?: (x: number, y: number, z: number, nx: number, ny: number, nz: number, t: number) => number;
  private lbs: Float64Array = new Float64Array(0);
  constructor(public k = 0.05) {}

  private push(p: Prim) { (p.neg ? this.negs : this.pos).push(p); this.lbs = new Float64Array(this.pos.length); }
  /** Ellipsoid with radii (rx along local x ...). `dir` aims local x; `rot` is Euler XYZ. */
  ell(c: V3, r: V3, o: EllOpts = {}): this {
    const ax = o.dir ? dirAxes(o.dir, o.up) : eulerAxes(o.rot?.[0] ?? 0, o.rot?.[1] ?? 0, o.rot?.[2] ?? 0);
    this.push(applyOpts(new EllPrim(c, r, ax), o, this.k));
    if (o.sym) {
      const m = (a: V3) => mirrorV(a, o.sym as Sym);
      this.push(applyOpts(new EllPrim(m(c), r, [m(ax[0]), m(ax[1]), m(ax[2])]), o, this.k));
    }
    return this;
  }
  sph(c: V3, r: number, o: PrimOpts = {}): this { return this.ell(c, [r, r, r], o); }
  /** Tapered capsule (round cone) between a and b. */
  cone(a: V3, b: V3, ra: number, rb: number, o: PrimOpts = {}): this {
    const L = len3v(sub3(b, a));
    if (L <= Math.abs(ra - rb) + 1e-5) { // one end swallows the other
      const big = ra >= rb ? a : b, r = Math.max(ra, rb);
      return this.ell(big, [r, r, r], o);
    }
    this.push(applyOpts(new ConePrim(a, b, ra, rb), o, this.k));
    if (o.sym) this.push(applyOpts(new ConePrim(mirrorV(a, o.sym), mirrorV(b, o.sym), ra, rb), o, this.k));
    return this;
  }
  /** Smooth tube through control points; radii are per control point. */
  tube(pts: V3[], radii: number[], o: TubeOpts = {}): this {
    const seg = o.seg ?? Math.max(6, (pts.length - 1) * 6), P = splinePoints(pts, seg), R = splineScalars(radii, seg);
    for (let i = 0; i < seg; i++) {
      const t = (i + 0.5) / seg;
      this.cone(P[i], P[i + 1], Math.max(0.002, R[i]), Math.max(0.002, R[i + 1]), { ...o, cg: o.cgFromT ? () => o.cgFromT!(t) : o.cg });
    }
    return this;
  }
  /** Loft of overlapping ellipsoids along a spine: rw = half width (local z), rh = half height (local y). */
  loft(spine: V3[], rw: number[], rh: number[], o: PrimOpts & { seg?: number; up?: V3; overlap?: number; cgFromT?: (t: number) => number } = {}): this {
    const seg = o.seg ?? Math.max(8, (spine.length - 1) * 7), P = splinePoints(spine, seg), W = splineScalars(rw, seg), H = splineScalars(rh, seg), ov = o.overlap ?? 1.15;
    for (let i = 0; i <= seg; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(seg, i + 1)], dir = sub3(b, a), step = len3v(sub3(P[Math.min(seg, i + 1)], P[Math.max(0, i - 1)])) / (i === 0 || i === seg ? 1 : 2);
      const t = i / seg;
      this.ell(P[i], [Math.max(0.004, step * ov), Math.max(0.004, H[i]), Math.max(0.004, W[i])], { ...o, dir, up: o.up, cg: o.cgFromT ? () => o.cgFromT!(t) : o.cg });
    }
    return this;
  }

  sdf(x: number, y: number, z: number): number {
    const P = this.pos, n = P.length, lbs = this.lbs;
    let best = 0, bestLb = Infinity, kmax = 0;
    for (let i = 0; i < n; i++) { const l = P[i].lb(x, y, z); lbs[i] = l; if (l < bestLb) { bestLb = l; best = i; } if (P[i].k > kmax) kmax = P[i].k; }
    let d = P[best].dist(x, y, z);
    const thresh = d + kmax;
    for (let i = 0; i < n; i++) {
      if (i === best || lbs[i] >= thresh) continue;
      d = smin(d, P[i].dist(x, y, z), P[i].k);
    }
    for (let j = 0; j < this.negs.length; j++) {
      const c = this.negs[j];
      if (c.lb(x, y, z) < c.k - d) d = -smin(-d, c.dist(x, y, z), c.k);
    }
    return d;
  }
  /** Hard-union distance ignoring `skip` (for culling hidden skin). */
  private covered(x: number, y: number, z: number, skip: Prim): boolean {
    const P = this.pos;
    for (let i = 0; i < P.length; i++) { const p = P[i]; if (p === skip || p.lb(x, y, z) > 0) continue; if (p.dist(x, y, z) < -0.0025) return true; }
    return false;
  }
  private inCarve(x: number, y: number, z: number, skip?: Prim): boolean {
    for (const c of this.negs) { if (c === skip || c.lb(x, y, z) > 0) continue; if (c.dist(x, y, z) < -0.0025) return true; }
    return false;
  }
  private inBody(x: number, y: number, z: number): boolean {
    for (const p of this.pos) { if (p.lb(x, y, z) > 0) continue; if (p.dist(x, y, z) < 0.004) return true; }
    return false;
  }

  private cdf: Float64Array = new Float64Array(0); private total = 0;
  private prepare() {
    const all = [...this.pos, ...this.negs], cdf = new Float64Array(all.length);
    let acc = 0;
    all.forEach((p, i) => { acc += p.area * p.dens * (p.neg ? 0.7 : 1); cdf[i] = acc; });
    this.cdf = cdf; this.total = acc;
  }
  private draw(rng: Rng, o: Sample6): Prim | null {
    const all = this.pos.length + this.negs.length;
    let lo = 0, hi = all - 1;
    const q = rng.next() * this.total;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.cdf[m] < q) lo = m + 1; else hi = m; }
    const p = lo < this.pos.length ? this.pos[lo] : this.negs[lo - this.pos.length];
    p.sample(rng, o);
    const x = o[0], y = o[1], z = o[2];
    if (p.neg) { // carve surface: keep only where it lies inside the body and outside other carves
      if (!this.inBody(x, y, z) || this.inCarve(x, y, z, p)) return null;
      o[3] = -o[3]; o[4] = -o[4]; o[5] = -o[5];
      return p;
    }
    if (this.covered(x, y, z, p) || this.inCarve(x, y, z)) return null;
    return p;
  }
  /** Exposed surface area (relative units) used to share particles between emitters. */
  estimate(rng: Rng): number {
    this.prepare();
    if (!this.total) { this.w = 0; return 0; }
    const o = new Float64Array(6); let ok = 0; const T = 500;
    for (let i = 0; i < T; i++) if (this.draw(rng, o)) ok++;
    this.w = this.total * Math.max(0.05, ok / T);
    return this.w;
  }
  emit(n: number, rng: Rng, sink: Sink) {
    if (!this.cdf.length) this.prepare();
    const o = new Float64Array(6), h = 0.0018;
    for (let i = 0; i < n; i++) {
      let prim: Prim | null = null;
      for (let t = 0; t < 40 && !prim; t++) prim = this.draw(rng, o);
      if (!prim) { prim = this.pos[0]; prim.sample(rng, o); }
      let x = o[0], y = o[1], z = o[2];
      for (let it = 0; it < 4; it++) { // project onto the blended surface
        const d = this.sdf(x, y, z);
        if (Math.abs(d) < 0.0006) break;
        const gx = (this.sdf(x + h, y, z) - d) / h, gy = (this.sdf(x, y + h, z) - d) / h, gz = (this.sdf(x, y, z + h) - d) / h, gl = gx * gx + gy * gy + gz * gz;
        if (gl < 1e-9) break;
        const s = clamp(d, -0.2, 0.2) / gl;
        x -= gx * s; y -= gy * s; z -= gz * s;
      }
      const e = 0.0025, nx0 = this.sdf(x + e, y, z) - this.sdf(x - e, y, z), ny0 = this.sdf(x, y + e, z) - this.sdf(x, y - e, z), nz0 = this.sdf(x, y, z + e) - this.sdf(x, y, z - e), nl = Math.sqrt(nx0 * nx0 + ny0 * ny0 + nz0 * nz0) || 1;
      let nx = nx0 / nl, ny = ny0 / nl, nz = nz0 / nl;
      if (this.disp) {
        const dd = this.disp(x, y, z, nx, ny, nz), q = 0.005;
        const gx = (this.disp(x + q, y, z, nx, ny, nz) - dd) / q, gy = (this.disp(x, y + q, z, nx, ny, nz) - dd) / q, gz = (this.disp(x, y, z + q, nx, ny, nz) - dd) / q;
        const gn = gx * nx + gy * ny + gz * nz; // tilt the shading normal by the tangential slope of the displacement
        let mx = nx - (gx - gn * nx), my = ny - (gy - gn * ny), mz = nz - (gz - gn * nz);
        const ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
        mx /= ml; my /= ml; mz /= ml;
        x += nx * dd; y += ny * dd; z += nz * dd; nx = mx; ny = my; nz = mz;
      }
      let t = prim.cg ? prim.cg(x, y, z) : prim.c;
      if (this.shade) t = this.shade(x, y, z, nx, ny, nz, t);
      if (nl < 1e-9) { nx = o[3]; ny = o[4]; nz = o[5]; }
      sink(x, y, z, nx, ny, nz, t, prim.sz, prim.al);
    }
  }
}

/* ───────── sheets & strands ───────── */
export interface SheetOpts { dens?: number; thick?: number; c?: number | ((u: number, v: number, x: number, y: number, z: number) => number); sz?: number; al?: number; sym?: Sym; alpha?: (u: number, v: number) => number; rand?: number }
function surfaceArea(s: ParamSurface, g = 28): number {
  const a: V3 = [0, 0, 0], b: V3 = [0, 0, 0], c: V3 = [0, 0, 0], du = (s.u1 - s.u0) / g, dv = (s.v1 - s.v0) / g;
  let acc = 0;
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
    const u = s.u0 + i * du, v = s.v0 + j * dv;
    s.eval(u, v, a); s.eval(u + du, v, b); s.eval(u, v + dv, c);
    acc += len3v(cross3(sub3(b, a), sub3(c, a)));
  }
  return acc;
}
export function sheetEmitter(surf: ParamSurface, o: SheetOpts = {}): Emitter {
  const dens = o.dens ?? 1, thick = o.thick ?? 0.004;
  const mk = (s: ParamSurface): Emitter => ({
    w: surfaceArea(s) * dens * 1.15,
    emit(n, rng, sink) {
      const b = sampleSurfaces([s], n, rng, { distribution: "uniform", randomness: o.rand ?? 0.6 });
      for (let i = 0; i < n; i++) {
        const k = i * 3, ok = Number.isFinite(b.nrm[k] + b.nrm[k + 1] + b.nrm[k + 2]), j = rng.gauss() * thick, x = b.pos[k] + (ok ? b.nrm[k] * j : 0), y = b.pos[k + 1] + (ok ? b.nrm[k + 1] * j : 0), z = b.pos[k + 2] + (ok ? b.nrm[k + 2] * j : 0);
        const t = typeof o.c === "function" ? o.c(b.u[i], b.v[i], x, y, z) : o.c ?? 0.5;
        const al = (o.al ?? 1) * (o.alpha ? o.alpha(b.u[i], b.v[i]) : 1);
        sink(x, y, z, ok ? b.nrm[k] : 0, ok ? b.nrm[k + 1] : 0, ok ? b.nrm[k + 2] : 0, t, o.sz ?? 1, al);
      }
    },
  });
  if (!o.sym) return mk(surf);
  const mir: ParamSurface = { u0: surf.u0, u1: surf.u1, v0: surf.v0, v1: surf.v1, eval(u, v, out) { surf.eval(u, v, out); if (o.sym === "z") out[2] = -out[2]; else out[0] = -out[0]; } };
  const a = mk(surf), b = mk(mir);
  return { w: a.w + b.w, emit(n, rng, sink) { const na = Math.round((n * a.w) / (a.w + b.w)); a.emit(na, rng, sink); b.emit(n - na, rng, sink); } };
}
export interface StrandOpts { r?: number; dens?: number; c0?: number; c1?: number; sz?: number; al?: number; taper?: boolean; sym?: Sym }
export function strandEmitter(lines: V3[][], o: StrandOpts = {}): Emitter {
  const all = o.sym ? [...lines, ...lines.map((l) => l.map((p): V3 => mirrorV(p, o.sym as Sym)))] : lines;
  const lens = all.map((l) => { let s = 0; for (let i = 1; i < l.length; i++) s += len3v(sub3(l[i], l[i - 1])); return s; });
  const cdf: number[] = []; let acc = 0;
  lens.forEach((l) => { acc += l; cdf.push(acc); });
  const r = o.r ?? 0.006;
  return {
    w: 0,
    dyn: (rho: number) => (acc * (o.dens ?? 1) * 3 * (r / 0.006)) / Math.sqrt(Math.max(1, rho)),
    emit(n, rng, sink) {
      for (let i = 0; i < n; i++) {
        const q = rng.next() * acc;
        let lo = 0, hi = cdf.length - 1;
        while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < q) lo = m + 1; else hi = m; }
        const line = all[lo], s = rng.next(), p = polyAt(line, s), p2 = polyAt(line, Math.min(1, s + 0.02)), t = norm3(sub3(p2, p));
        const a = dirAxes(len3v(t) < 1e-6 ? [0, 1, 0] : t), rad = r * (o.taper ? 1 - 0.75 * s : 1) * Math.sqrt(rng.next()), ph = rng.next() * TAU;
        const nx = Math.cos(ph) * a[1][0] + Math.sin(ph) * a[2][0], ny = Math.cos(ph) * a[1][1] + Math.sin(ph) * a[2][1], nz = Math.cos(ph) * a[1][2] + Math.sin(ph) * a[2][2];
        sink(p[0] + nx * rad, p[1] + ny * rad, p[2] + nz * rad, nx, ny, nz, mixn(o.c0 ?? 0.5, o.c1 ?? o.c0 ?? 0.5, s), o.sz ?? 1, o.al ?? 1);
      }
    },
  };
}
/** Free-form emitter: weight plus a function that places one particle. */
export function pointEmitter(w: number, place: (rng: Rng, out: Sample6) => void): Emitter {
  return {
    w,
    emit(n, rng, sink) {
      const o = new Float64Array(9);
      for (let i = 0; i < n; i++) { o[6] = 0.5; o[7] = 1; o[8] = 1; place(rng, o); sink(o[0], o[1], o[2], o[3], o[4], o[5], o[6], o[7], o[8]); }
    },
  };
}

/* ───────── scene ───────── */
export class Scene {
  readonly parts: Emitter[] = [];
  constructor(readonly rng: Rng, readonly detail: number, readonly seed: number) {}
  solid(k = 0.05): Solid { const s = new Solid(k); this.parts.push(s); return s; }
  sheet(surf: ParamSurface, o?: SheetOpts) { this.parts.push(sheetEmitter(surf, o)); return this; }
  strands(lines: V3[][], o?: StrandOpts) { this.parts.push(strandEmitter(lines, o)); return this; }
  points(w: number, place: (rng: Rng, out: Sample6) => void) { this.parts.push(pointEmitter(w, place)); return this; }
  add(e: Emitter) { this.parts.push(e); return this; }
  /** Renders into a formation, recentres and scales to the fit radius. */
  render(f: Formation, fit: number, keepOrigin = false) {
    const n = f.n;
    for (const p of this.parts) if (p instanceof Solid) p.estimate(this.rng);
    const area = this.parts.reduce((a, p) => a + p.w, 0) || 1;
    let rho = n / area, weights = this.parts.map((p) => p.w);
    for (let it = 0; it < 6; it++) {
      weights = this.parts.map((p) => (p.dyn ? p.dyn(rho) : p.w));
      rho = n / (weights.reduce((a, b) => a + b, 0) || 1);
    }
    const total = weights.reduce((a, b) => a + b, 0) || 1, counts = weights.map((w) => Math.floor((n * w) / total));
    let rest = n - counts.reduce((a, b) => a + b, 0), i = 0;
    while (rest > 0) { counts[i % counts.length]++; rest--; i++; }
    let at = 0;
    const sink: Sink = (x, y, z, nx, ny, nz, t, sz, al) => {
      if (at >= n) return;
      if (!Number.isFinite(x + y + z)) { // never let a degenerate sample reach the formation
        const s = Math.max(0, at - 1), o = s * 3;
        put(f, at++, f.pos[o], f.pos[o + 1], f.pos[o + 2], f.t[s], f.size[s], f.alpha[s], 1, f.nrm[o], f.nrm[o + 1], f.nrm[o + 2]);
        return;
      }
      put(f, at++, x, y, z, clamp(Number.isFinite(t) ? t : 0.5, 0, 1), sz, al, 1, Number.isFinite(nx + ny + nz) ? nx : 0, Number.isFinite(nx + ny + nz) ? ny : 0, Number.isFinite(nx + ny + nz) ? nz : 0);
    };
    this.parts.forEach((p, k) => p.emit(counts[k], this.rng, sink));
    while (at < n) { const s = Math.max(0, at - 1), o = s * 3; put(f, at, f.pos[o], f.pos[o + 1], f.pos[o + 2], f.t[s], f.size[s], f.alpha[s], 1, f.nrm[o], f.nrm[o + 1], f.nrm[o + 2]); at++; }
    fitFormation(f, fit, keepOrigin);
  }
}

/** Parameter 0..1 of the nearest point on a spline through `pts` (used for ring ridges, colour ramps). */
export function spineParam(pts: V3[], seg = 220): (x: number, y: number, z: number) => number {
  const P = splinePoints(pts, seg), flat = new Float64Array(P.length * 3);
  P.forEach((p, i) => { flat[i * 3] = p[0]; flat[i * 3 + 1] = p[1]; flat[i * 3 + 2] = p[2]; });
  return (x, y, z) => {
    let best = 1e9, bi = 0;
    for (let i = 0; i < P.length; i++) { const d = (flat[i * 3] - x) ** 2 + (flat[i * 3 + 1] - y) ** 2 + (flat[i * 3 + 2] - z) ** 2; if (d < best) { best = d; bi = i; } }
    return bi / seg;
  };
}
/** Surface of revolution about the y axis: prof(v) -> [radius, y], v in [0,1]. */
export function revolve(prof: (v: number) => [number, number], u0 = 0, u1 = TAU): ParamSurface {
  return { u0, u1, v0: 0, v1: 1, eval(u, v, o) { const [r, y] = prof(v); o[0] = r * Math.cos(u); o[1] = y; o[2] = r * Math.sin(u); } };
}
/** A ring (closed polyline) in the xz plane at height y. */
export function ringLine(r: number, y: number, seg = 64, wob?: (a: number) => number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * TAU, rr = r + (wob ? wob(a) : 0); out.push([rr * Math.cos(a), y, rr * Math.sin(a)]); }
  return out;
}

/** Centres on the bounding box and scales so the 99.5th percentile radius equals `fit`. */
export function fitFormation(f: Formation, fit: number, keepOrigin = false) {
  const n = f.n;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  const lo = Math.floor(n * 0.002), hi = n - 1 - lo;
  const xs = new Float32Array(n), ys = new Float32Array(n), zs = new Float32Array(n);
  for (let i = 0; i < n; i++) { xs[i] = f.pos[i * 3]; ys[i] = f.pos[i * 3 + 1]; zs[i] = f.pos[i * 3 + 2]; }
  xs.sort(); ys.sort(); zs.sort();
  x0 = xs[lo]; x1 = xs[hi]; y0 = ys[lo]; y1 = ys[hi]; z0 = zs[lo]; z1 = zs[hi];
  const cx = keepOrigin ? 0 : (x0 + x1) / 2, cy = keepOrigin ? 0 : (y0 + y1) / 2, cz = keepOrigin ? 0 : (z0 + z1) / 2;
  const rs = new Float32Array(n);
  for (let i = 0; i < n; i++) rs[i] = Math.hypot(f.pos[i * 3] - cx, f.pos[i * 3 + 1] - cy, f.pos[i * 3 + 2] - cz);
  rs.sort();
  const ref = rs[Math.min(n - 1, Math.floor(n * 0.995))] || 1, k = fit / ref;
  for (let i = 0; i < n; i++) { f.pos[i * 3] = (f.pos[i * 3] - cx) * k; f.pos[i * 3 + 1] = (f.pos[i * 3 + 1] - cy) * k; f.pos[i * 3 + 2] = (f.pos[i * 3 + 2] - cz) * k; }
}

/* ───────── shape definition + cache ───────── */
export interface ShapeSpec {
  id: GeneratorId; name: string; tag: string; description: string;
  palette: Array<[number, string]>;
  build: (sc: Scene, o: { detail: number; seed: number }) => void;
  count?: number; fit?: number; heavy?: boolean; keepOrigin?: boolean; size?: number;
  look?: Partial<Look>; deformers?: DeformerSeed[]; behaviors?: BehaviorSeed[]; camera?: Partial<CameraSettings>;
}
interface Cached { pos: Float32Array; nrm: Float32Array; t: Float32Array; size: Float32Array; alpha: Float32Array }
const CACHE = new Map<string, Cached>();
export function defineShape(s: ShapeSpec): GeneratorDef {
  return {
    id: s.id, name: s.name, tag: s.tag, method: "Sculpted smooth-union anatomy + sheets/strands, area-uniform sampling", description: s.description, heavy: s.heavy ?? true,
    params: [range("detail", "Detail", 0, 1, 0.01, 0.55, "Amount of fine surface detail (folds, scales, fur, ridges).")],
    recipe: {
      count: s.count ?? 60000,
      look: { palette: s.palette.map(([t, color]) => ({ t, color })), size: s.size ?? 0.0075, glow: 0.55, edgeBrightness: 0.7, ...(s.look ?? {}) },
      behaviors: s.behaviors ?? [{ type: "home", intensity: 62 }, { type: "drag", intensity: 1.1 }],
      ...(s.deformers ? { deformers: s.deformers } : {}),
      camera: { distance: 4, yaw: 0.5, pitch: 0.18, autoRotate: 0.1, ...(s.camera ?? {}) },
    },
    generate(ctx, f) {
      const detail = typeof ctx.params.detail === "number" ? ctx.params.detail : 0.55, key = `${s.id}|${f.n}|${ctx.seed}|${detail.toFixed(2)}`, hit = CACHE.get(key);
      if (hit) { f.pos.set(hit.pos); f.nrm.set(hit.nrm); f.t.set(hit.t); f.size.set(hit.size); f.alpha.set(hit.alpha); return; }
      const sc = new Scene(ctx.rng, detail, ctx.seed);
      s.build(sc, { detail, seed: ctx.seed });
      sc.render(f, s.fit ?? 1.2, s.keepOrigin);
      CACHE.set(key, { pos: f.pos.slice(), nrm: f.nrm.slice(), t: f.t.slice(), size: f.size.slice(), alpha: f.alpha.slice() });
      if (CACHE.size > 6) CACHE.delete(CACHE.keys().next().value as string);
    },
  };
}

/* ───────── feathers ───────── */
export interface FeatherOpts { up?: V3; bend?: number; wave?: number; widthAt?: (u: number) => number; camber?: number }
/** A single vaned feather: root, direction, length, half-width. u runs along the rachis, v in [-1,1] across the vane. */
export function featherSurface(root: V3, dir: V3, len: number, wid: number, o: FeatherOpts = {}): ParamSurface {
  const a = norm3(dir), upIn: V3 = o.up ?? [0, 1, 0];
  let side = cross3(a, upIn);
  if (len3v(side) < 1e-4) side = cross3(a, [0, 0, 1]);
  side = norm3(side);
  const up = norm3(cross3(side, a)), bend = o.bend ?? 0.08, wave = o.wave ?? 0, cam = o.camber ?? 0.18;
  const wAt = o.widthAt ?? ((u: number) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + 0.94 * Math.pow(u, 0.82))), 0.55));
  return {
    u0: 0, u1: 1, v0: -1, v1: 1,
    eval(u0, v, out) {
      const u = u0 < 0 ? 0 : u0 > 1 ? 1 : u0, sw = wave * len * Math.sin(u * Math.PI * 2) * u, w = wid * wAt(u), lift = bend * len * u * u, ca = cam * w * v * v;
      for (let c = 0; c < 3; c++) out[c] = root[c] + a[c] * len * u + up[c] * (lift + ca) + side[c] * (v * w + sw);
    },
  };
}
