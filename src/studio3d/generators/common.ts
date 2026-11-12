import type { Formation, ParamDef, ParamMap } from "../types";
import type { SurfaceOptions, SampleBatch } from "../sampling";
import { Rng, gnoise } from "../math";

export const num = (p: ParamMap, k: string, d = 0): number => (typeof p[k] === "number" ? (p[k] as number) : d);
export const str = (p: ParamMap, k: string, d = ""): string => (typeof p[k] === "string" ? (p[k] as string) : d);
export const bool = (p: ParamMap, k: string, d = false): boolean => (typeof p[k] === "boolean" ? (p[k] as boolean) : d);

export const range = (key: string, label: string, min: number, max: number, step: number, def: number, hint?: string): ParamDef => ({ key, label, type: "range", min, max, step, def, hint });
export const select = (key: string, label: string, options: [string, string][], def: string, hint?: string): ParamDef => ({ key, label, type: "select", options: options.map(([value, l]) => ({ value, label: l })), def, hint });
export const toggle = (key: string, label: string, def: boolean, hint?: string): ParamDef => ({ key, label, type: "toggle", def, hint });
export const text = (key: string, label: string, def: string, hint?: string): ParamDef => ({ key, label, type: "text", def, hint });

/** Shared sampling controls for every surface based generator. */
export const samplingParams = (): ParamDef[] => [
  select("distribution", "Distribution", [["uniform", "Uniform (even)"], ["random", "Random"], ["poisson", "Poisson disk (blue noise)"]], "uniform", "How particles are spread over the surface."),
  range("randomness", "Randomness", 0, 1, 0.01, 0.55, "0 = regular lattice look, 1 = fully scattered."),
];
export function surfaceOptions(p: ParamMap): SurfaceOptions {
  const d = str(p, "distribution", "uniform");
  return { distribution: d === "random" || d === "poisson" ? d : "uniform", randomness: num(p, "randomness", 0.55) };
}

export function put(f: Formation, i: number, x: number, y: number, z: number, t: number, size = 1, alpha = 1, weight = 1, nx = 0, ny = 0, nz = 0) {
  const o = i * 3;
  f.pos[o] = x; f.pos[o + 1] = y; f.pos[o + 2] = z;
  f.nrm[o] = nx; f.nrm[o + 1] = ny; f.nrm[o + 2] = nz;
  f.t[i] = t; f.size[i] = size; f.alpha[i] = alpha; f.weight[i] = weight;
}
/** Copies a sample batch into the formation starting at `at`; map() returns [t,size,alpha,weight]. */
export function writeBatch(f: Formation, b: SampleBatch, at: number, map: (i: number, b: SampleBatch) => [number, number, number, number], thick = 0, rng?: Rng) {
  for (let i = 0; i < b.n; i++) {
    const o = i * 3;
    let x = b.pos[o], y = b.pos[o + 1], z = b.pos[o + 2];
    const nx = b.nrm[o], ny = b.nrm[o + 1], nz = b.nrm[o + 2];
    if (thick > 0 && rng) { const j = rng.gauss() * thick; x += nx * j; y += ny * j; z += nz * j; }
    const m = map(i, b);
    put(f, at + i, x, y, z, m[0], m[1], m[2], m[3], nx, ny, nz);
  }
}
export const noise3 = (x: number, y: number, z: number) => gnoise(x, y, z) * 0.5 + 0.5;
/** Fills a Formation with a flat count if a generator under-produced. */
export function fillRemaining(f: Formation, from: number, rng: Rng) {
  for (let i = from; i < f.n; i++) {
    const s = rng.int(Math.max(1, from)), o = s * 3;
    put(f, i, f.pos[o] + rng.gauss() * 0.01, f.pos[o + 1] + rng.gauss() * 0.01, f.pos[o + 2] + rng.gauss() * 0.01, f.t[s], f.size[s], f.alpha[s], f.weight[s], f.nrm[o], f.nrm[o + 1], f.nrm[o + 2]);
  }
}
