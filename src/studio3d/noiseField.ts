import { gnoise } from "./math";

/** Tileable divergence-free curl-noise volume (N^3 vec3). Built lazily once, shared by every simulation. */
export const NOISE_N = 32;
const FEATURES = 4;          // lattice cells across the volume (period)
export const SAMPLES_PER_FEATURE = NOISE_N / FEATURES;
let volume: Float32Array | null = null;

export function getNoiseVolume(): Float32Array {
  if (volume) return volume;
  const N = NOISE_N, pot = [new Float32Array(N * N * N), new Float32Array(N * N * N), new Float32Array(N * N * N)], v = new Float32Array(N * N * N * 3);
  const k = FEATURES / N;
  for (let c = 0; c < 3; c++) for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = x * k, py = y * k, pz = z * k;
    pot[c][(z * N + y) * N + x] = gnoise(px, py, pz, FEATURES, c * 17 + 3) + 0.5 * gnoise(px * 2, py * 2, pz * 2, FEATURES * 2, c * 29 + 11);
  }
  const at = (a: Float32Array, x: number, y: number, z: number) => a[(((z + N) % N) * N + ((y + N) % N)) * N + ((x + N) % N)];
  let maxL = 1e-6;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = ((z * N + y) * N + x) * 3;
    const dy3 = at(pot[2], x, y + 1, z) - at(pot[2], x, y - 1, z), dz2 = at(pot[1], x, y, z + 1) - at(pot[1], x, y, z - 1);
    const dz1 = at(pot[0], x, y, z + 1) - at(pot[0], x, y, z - 1), dx3 = at(pot[2], x + 1, y, z) - at(pot[2], x - 1, y, z);
    const dx2 = at(pot[1], x + 1, y, z) - at(pot[1], x - 1, y, z), dy1 = at(pot[0], x, y + 1, z) - at(pot[0], x, y - 1, z);
    v[o] = dy3 - dz2; v[o + 1] = dz1 - dx3; v[o + 2] = dx2 - dy1;
    const l = Math.hypot(v[o], v[o + 1], v[o + 2]); if (l > maxL) maxL = l;
  }
  const inv = 1 / (maxL * 0.55);
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return (volume = v);
}
/** Trilinear, wrapping lookup. (x,y,z) are in feature units (1 unit = one noise feature). Writes into out[0..2]. */
export function sampleNoise(vol: Float32Array, x: number, y: number, z: number, out: Float32Array | number[]) {
  const N = NOISE_N, S = SAMPLES_PER_FEATURE, fx = x * S, fy = y * S, fz = z * S, x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
  const tx = fx - x0, ty = fy - y0, tz = fz - z0, M = N - 1, ix0 = x0 & M, ix1 = (x0 + 1) & M, iy0 = y0 & M, iy1 = (y0 + 1) & M, iz0 = z0 & M, iz1 = (z0 + 1) & M;
  const w000 = (1 - tx) * (1 - ty) * (1 - tz), w100 = tx * (1 - ty) * (1 - tz), w010 = (1 - tx) * ty * (1 - tz), w110 = tx * ty * (1 - tz);
  const w001 = (1 - tx) * (1 - ty) * tz, w101 = tx * (1 - ty) * tz, w011 = (1 - tx) * ty * tz, w111 = tx * ty * tz;
  const a = ((iz0 * N + iy0) * N + ix0) * 3, b = ((iz0 * N + iy0) * N + ix1) * 3, c = ((iz0 * N + iy1) * N + ix0) * 3, d = ((iz0 * N + iy1) * N + ix1) * 3;
  const e = ((iz1 * N + iy0) * N + ix0) * 3, f = ((iz1 * N + iy0) * N + ix1) * 3, g = ((iz1 * N + iy1) * N + ix0) * 3, h = ((iz1 * N + iy1) * N + ix1) * 3;
  for (let k = 0; k < 3; k++) out[k] = vol[a + k] * w000 + vol[b + k] * w100 + vol[c + k] * w010 + vol[d + k] * w110 + vol[e + k] * w001 + vol[f + k] * w101 + vol[g + k] * w011 + vol[h + k] * w111;
}
