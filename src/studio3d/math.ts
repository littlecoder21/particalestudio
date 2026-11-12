/** Small, allocation-free math helpers shared by every 3D module (no DOM / React). */
export type Vec3 = [number, number, number];
export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const smoothstep = (a: number, b: number, x: number) => smooth(clamp((x - a) / (b - a), 0, 1));
export const fract = (x: number) => x - Math.floor(x);

/** Deterministic PRNG (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(n: number) { return Math.floor(this.next() * n); }
  /** ~N(0,1) via sum of uniforms (cheap, bounded). */
  gauss() { return (this.next() + this.next() + this.next() + this.next() - 2) * 1.7320508; }
  expo() { return Math.min(6, -Math.log(this.next() + 1e-6)); }
  /** Uniform direction on the unit sphere written into out[o..o+2]. */
  onSphere(out: ArrayLike<number> & { [i: number]: number }, o = 0) {
    const z = this.next() * 2 - 1, a = this.next() * TAU, r = Math.sqrt(1 - z * z);
    out[o] = r * Math.cos(a); out[o + 1] = z; out[o + 2] = r * Math.sin(a);
  }
}

/** Integer hash -> [0,1). */
export function hash3(i: number, j: number, k: number): number {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(k | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function hash1(x: number): number { return hash3(Math.floor(x * 4096) | 0, 17, 91); }

/** Value noise in [0,1]. */
export function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = smooth(x - xi), v = smooth(y - yi), w = smooth(z - zi);
  const a = hash3(xi, yi, zi), b = hash3(xi + 1, yi, zi), c = hash3(xi, yi + 1, zi), d = hash3(xi + 1, yi + 1, zi);
  const e = hash3(xi, yi, zi + 1), f = hash3(xi + 1, yi, zi + 1), g = hash3(xi, yi + 1, zi + 1), h = hash3(xi + 1, yi + 1, zi + 1);
  const x0 = lerp(lerp(a, b, u), lerp(c, d, u), v), x1 = lerp(lerp(e, f, u), lerp(g, h, u), v);
  return lerp(x0, x1, w);
}
export function fbm(x: number, y: number, z: number): number {
  return (vnoise(x, y, z) * 0.5 + vnoise(x * 2.03 + 5.2, y * 2.03 + 1.3, z * 2.03 + 8.7) * 0.25 + vnoise(x * 4.1 + 2.1, y * 4.1 + 9.4, z * 4.1 + 3.3) * 0.125) / 0.875;
}

const G3 = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1];
function grad(h: number, x: number, y: number, z: number, period: number, ix: number, iy: number, iz: number): number {
  if (period > 0) { ix = ((ix % period) + period) % period; iy = ((iy % period) + period) % period; iz = ((iz % period) + period) % period; }
  const g = Math.floor(hash3(ix + h, iy, iz) * 12) * 3;
  return G3[g] * x + G3[g + 1] * y + G3[g + 2] * z;
}
/** Gradient noise in about [-1,1]; optional integer lattice period makes it tileable. */
export function gnoise(x: number, y: number, z: number, period = 0, salt = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi, u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10), w = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const n = (a: number, b: number, c: number) => grad(salt, fx - a, fy - b, fz - c, period, xi + a, yi + b, zi + c);
  const x0 = lerp(lerp(n(0, 0, 0), n(1, 0, 0), u), lerp(n(0, 1, 0), n(1, 1, 0), u), v);
  const x1 = lerp(lerp(n(0, 0, 1), n(1, 0, 1), u), lerp(n(0, 1, 1), n(1, 1, 1), u), v);
  return lerp(x0, x1, w) * 1.15;
}

export const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

/** Unit vector perpendicular to (x,y,z); writes into out. */
export function anyPerp(x: number, y: number, z: number, out: Vec3) {
  if (Math.abs(x) < 0.9) { out[0] = 0; out[1] = z; out[2] = -y; } else { out[0] = -z; out[1] = 0; out[2] = x; }
  const l = len3(out[0], out[1], out[2]) || 1;
  out[0] /= l; out[1] /= l; out[2] /= l;
}

/* ───────── mat4 (column-major, Float32Array(16)) ───────── */
export type Mat4 = Float32Array;
export const mat4 = () => new Float32Array(16);
export function mat4Perspective(o: Mat4, fovY: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  o.fill(0);
  o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
}
export function mat4Ortho(o: Mat4, halfH: number, aspect: number, near: number, far: number) {
  const r = halfH * aspect, nf = 1 / (near - far);
  o.fill(0);
  o[0] = 1 / r; o[5] = 1 / halfH; o[10] = 2 * nf; o[14] = (far + near) * nf; o[15] = 1;
}
export function mat4LookAt(o: Mat4, ex: number, ey: number, ez: number, tx: number, ty: number, tz: number) {
  let zx = ex - tx, zy = ey - ty, zz = ez - tz;
  const zl = len3(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
  let xx = zz, xy = 0, xz = -zx; // up = (0,1,0): x = up × z
  const xl = len3(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
  o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
  o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
  o[12] = -(xx * ex + xy * ey + xz * ez); o[13] = -(yx * ex + yy * ey + yz * ez); o[14] = -(zx * ex + zy * ey + zz * ez); o[15] = 1;
}
export function mat4Mul(o: Mat4, a: Mat4, b: Mat4) {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
}

/* ───────── easing ───────── */
export type EasingName = "linear" | "easeInOut" | "easeOut" | "easeInOutSine" | "expoOut" | "backOut" | "elastic";
export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  expoOut: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  backOut: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  elastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};
export const EASING_NAMES = Object.keys(EASINGS) as EasingName[];
