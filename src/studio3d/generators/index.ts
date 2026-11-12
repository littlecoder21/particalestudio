import type { Formation, GeneratorDef, GeneratorId, Layer, ParamDef, ParamMap, TextMask } from "../types";
import { Rng } from "../math";
import { allocFormation, finalizeFormation, shuffleFormation, rasterizeText } from "../sampling";
import { SHAPES1 } from "./shapes1";
import { SHAPES2 } from "./shapes2";
import { SHAPES3 } from "./shapes3";
import { SHAPES4 } from "./shapes4";
import { SHAPES5 } from "./shapes5";

export const GENERATORS: GeneratorDef[] = [...SHAPES1, ...SHAPES2, ...SHAPES3, ...SHAPES4, ...SHAPES5];
const BY_ID = new Map<string, GeneratorDef>(GENERATORS.map((g) => [g.id, g]));
export const GENERATOR_IDS = GENERATORS.map((g) => g.id) as GeneratorId[];
export const isGeneratorId = (id: unknown): id is GeneratorId => typeof id === "string" && BY_ID.has(id);
export function getGenerator(id: GeneratorId): GeneratorDef {
  const g = BY_ID.get(id);
  if (!g) throw new Error(`Unknown generator: ${id}`);
  return g;
}
export function defaultParams(def: GeneratorDef): ParamMap {
  const out: ParamMap = {};
  for (const p of def.params) out[p.key] = p.def;
  return { ...out, ...(def.recipe.params ?? {}) };
}
function clampParam(def: ParamDef, v: unknown): number | boolean | string {
  switch (def.type) {
    case "range": { const n = typeof v === "number" && Number.isFinite(v) ? v : def.def; return Math.min(def.max, Math.max(def.min, n)); }
    case "toggle": return typeof v === "boolean" ? v : def.def;
    case "select": return typeof v === "string" && def.options.some((o) => o.value === v) ? v : def.def;
    case "text": return typeof v === "string" ? v.slice(0, 48) : def.def;
  }
}
/** Fills defaults, clamps ranges and drops unknown keys. */
export function normalizeParams(def: GeneratorDef, raw: unknown): ParamMap {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}, out: ParamMap = {}, dflt = defaultParams(def);
  for (const p of def.params) out[p.key] = clampParam(p, p.key in src ? src[p.key] : dflt[p.key]);
  return out;
}

const hashSeed = (seed: number, i: number) => (Math.imul(seed | 0, 2654435761) ^ Math.imul(i + 1, 1597334677)) >>> 0;
export interface BuildOptions { text?: (value: string) => TextMask }
/** Generates one layer at an exact particle count (no transform). */
export function generateLayer(layer: Pick<Layer, "generator" | "params" | "seed">, n: number, opts: BuildOptions = {}, index = 0): Formation {
  const def = getGenerator(layer.generator), f = allocFormation(n), rng = new Rng(hashSeed(layer.seed, index));
  def.generate({ n, rng, seed: layer.seed, params: normalizeParams(def, layer.params), text: opts.text ?? rasterizeText }, f);
  return f;
}
/** Composes all visible layers into one shuffled, finalised formation of exactly `total` particles. */
export function buildFormation(layers: Layer[], total: number, seed = 1, opts: BuildOptions = {}): Formation {
  const vis = layers.filter((l) => l.visible);
  const use = vis.length ? vis : layers.slice(0, 1);
  const shareSum = use.reduce((a, l) => a + Math.max(0.01, l.share), 0);
  const counts = use.map((l) => Math.floor((total * Math.max(0.01, l.share)) / shareSum));
  counts[0] += total - counts.reduce((a, b) => a + b, 0);
  const out = allocFormation(total);
  let at = 0;
  use.forEach((layer, li) => {
    const n = counts[li];
    if (n <= 0) return;
    const f = generateLayer(layer, n, opts, li), c = Math.cos((layer.rotY * Math.PI) / 180), s = Math.sin((layer.rotY * Math.PI) / 180), k = layer.scale;
    for (let i = 0; i < n; i++) {
      const o = i * 3, x = f.pos[o], y = f.pos[o + 1], z = f.pos[o + 2], q = (at + i) * 3;
      out.pos[q] = (x * c + z * s) * k + layer.offset[0]; out.pos[q + 1] = y * k + layer.offset[1]; out.pos[q + 2] = (-x * s + z * c) * k + layer.offset[2];
      const nx = f.nrm[o], ny = f.nrm[o + 1], nz = f.nrm[o + 2];
      out.nrm[q] = nx * c + nz * s; out.nrm[q + 1] = ny; out.nrm[q + 2] = -nx * s + nz * c;
      out.t[at + i] = f.t[i]; out.size[at + i] = f.size[i]; out.alpha[at + i] = f.alpha[i]; out.phase[at + i] = f.phase[i]; out.weight[at + i] = f.weight[i]; out.layer[at + i] = Math.min(3, layers.indexOf(layer));
    }
    at += n;
  });
  const rng = new Rng(hashSeed(seed, 99));
  shuffleFormation(out, rng);
  finalizeFormation(out, rng);
  return out;
}
