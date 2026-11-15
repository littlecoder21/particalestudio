import type { Project3D } from "../types";
import { ATTR_COMPONENTS, DTYPE_BYTES, encodePsb, psbByteLength, PSB_VERSION, type AttrName, type AttributeInput, type DType, type EncodeReport } from "./format";

/**
 * Intelligent particle data packing.
 *
 * Three levels share one container (format.ts) and one runtime:
 *   hero      static GPU snapshot for backgrounds. Exact Float32 positions, GPU-exact normals, compact colour,
 *             size and alpha. No velocity / home / weight unless the look reads velocity.
 *   animated  everything the particle simulation needs, with attributes that don't need Float32 compacted.
 *   full      Float32 everywhere (what the original exporter wrote), for complex simulations.
 *
 * Particle count is never reduced and positions are never quantized.
 */

export type ExportMode = "hero" | "animated" | "full";
export type CompressionLevel = "auto" | "off";

export const EXPORT_MODES: { id: ExportMode; label: string; summary: string }[] = [
  { id: "hero", label: "Hero", summary: "Static snapshot for website backgrounds. Smallest file; orbit, zoom and shader animation work, forces and deformers do not." },
  { id: "animated", label: "Animated", summary: "Runs the particle simulation (behaviours, deformers, pointer forces) with compact attributes." },
  { id: "full", label: "Full quality", summary: "Float32 for every attribute. For complex simulations and advanced interactive scenes." },
];

export interface ParticleSource {
  n: number;
  pos: Float32Array;
  nrm: Float32Array;
  t: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  phase: Float32Array;
  weight: Float32Array;
  layer: Uint8Array;
  radius: number;
  velocity: Float32Array;
  homeBase: Float32Array;
}

export interface SceneAnalysis {
  needsSimulation: boolean;
  reasons: string[];
  /** The look reads per-particle velocity (colour shift or stretch), so velocity is a render attribute too. */
  velocityInLook: boolean;
  /** Per-particle phase feeds a hash in the shaders, so it must stay Float32 to reproduce the same size jitter. */
  phaseSensitive: boolean;
  complex: boolean;
  recommendedMode: ExportMode;
}

const NEIGHBOR_OR_COMPLEX = new Set(["cohesion", "separation", "alignment", "custom", "collider"]);

export function analyzeScene(project: Project3D, interaction = true): SceneAnalysis {
  const reasons: string[] = [];
  const behaviors = project.behaviors.filter((b) => b.enabled && b.type !== "home");
  const deformers = project.deformers.filter((d) => d.enabled && d.amount !== 0);
  if (behaviors.length) reasons.push(`${behaviors.length} force behaviour${behaviors.length > 1 ? "s move" : " moves"} particles over time`);
  if (deformers.length) reasons.push(`${deformers.length} deformer${deformers.length > 1 ? "s animate" : " animates"} the shape`);
  if (interaction && project.interaction.tool !== "none") reasons.push(`pointer tool "${project.interaction.tool}" pushes particles`);
  const complex = behaviors.some((b) => NEIGHBOR_OR_COMPLEX.has(b.type)) || behaviors.length + deformers.length >= 4 || project.sim.substeps > 1;
  const needsSimulation = reasons.length > 0;
  return {
    needsSimulation,
    reasons,
    velocityInLook: project.look.velocityColor > 0 || project.look.velocityStretch > 0,
    phaseSensitive: project.look.sizeVariation > 0 || project.beams.some((b) => b.enabled),
    complex,
    recommendedMode: !needsSimulation ? "hero" : complex ? "full" : "animated",
  };
}

export interface AttributePlan { name: AttrName; dtype: DType; normalized?: boolean }

export interface PackOptions {
  mode: ExportMode;
  /** "auto" compacts per mode; "off" keeps Float32 for every attribute that is written. */
  compression: CompressionLevel;
  /** Per-attribute dtype override (or "omit" for attributes the runtime can default). */
  overrides?: Partial<Record<AttrName, DType | "omit">>;
  /** Whether pointer forces are part of the export (affects hero/animated recommendation only). */
  interaction?: boolean;
}

const ALLOWED_OVERRIDES: Partial<Record<AttrName, DType[]>> = {
  normal: ["i8", "i16", "f16", "f32"],
  velocity: ["f16", "f32"],
  homeBase: ["f32", "f16"],
  t: ["u16", "u8", "f16", "f32"],
  size: ["f16", "f32"],
  alpha: ["u8", "u16", "f16", "f32"],
  phase: ["u16", "f32"],
  weight: ["u8", "u16", "f16", "f32"],
};
const OMITTABLE: AttrName[] = ["normal", "velocity", "homeBase", "weight"];

/** Which attributes are written, and with what storage type. Depends only on the project and options, never on the data. */
export function planAttributes(project: Project3D, options: PackOptions): AttributePlan[] {
  const analysis = analyzeScene(project, options.interaction ?? true);
  const lossless = options.compression === "off";
  const f = (name: AttrName): AttributePlan => ({ name, dtype: "f32" });
  const { mode } = options;
  const plan: AttributePlan[] = [{ name: "position", dtype: "f32" }];
  const pick = (name: AttrName, compact: DType, normalized?: boolean): AttributePlan => ({ name, dtype: lossless || mode === "full" ? "f32" : compact, normalized: lossless || mode === "full" ? undefined : normalized });

  plan.push(mode === "hero" ? (lossless ? f("normal") : { name: "normal", dtype: "i8" }) : pick("normal", "i16"));
  if (mode === "hero") { if (analysis.velocityInLook) plan.push(pick("velocity", "f16")); }
  else plan.push(pick("velocity", "f16"));
  if (mode !== "hero") plan.push(f("homeBase"));
  plan.push(pick("t", "u16", true), pick("size", "f16"), pick("alpha", "u8", true));
  plan.push(analysis.phaseSensitive ? f("phase") : pick("phase", "u16", true));
  if (mode !== "hero") plan.push(pick("weight", "u8", true));
  plan.push({ name: "layer", dtype: "u8", normalized: false });

  const overrides = options.overrides ?? {};
  const out: AttributePlan[] = [];
  for (const item of plan) {
    const override = overrides[item.name];
    if (!override) { out.push(item); continue; }
    if (override === "omit") { if (OMITTABLE.includes(item.name)) continue; out.push(item); continue; }
    const allowed = ALLOWED_OVERRIDES[item.name];
    if (!allowed || !allowed.includes(override)) { out.push(item); continue; }
    out.push({ name: item.name, dtype: override, normalized: override === "u8" || override === "u16" ? true : undefined });
  }
  // An override can add an attribute the mode would otherwise drop.
  for (const name of OMITTABLE) {
    const override = overrides[name];
    if (override && override !== "omit" && !out.some((item) => item.name === name) && ALLOWED_OVERRIDES[name]?.includes(override)) out.push({ name, dtype: override });
  }
  return out;
}

export function bytesPerParticle(plan: AttributePlan[]): number {
  return plan.reduce((sum, item) => sum + ATTR_COMPONENTS[item.name] * DTYPE_BYTES[item.dtype], 0);
}

function packMeta(options: PackOptions, plan: AttributePlan[], count: number, radius: number) {
  return {
    generator: "particle-studio",
    formatVersion: PSB_VERSION,
    mode: options.mode,
    compression: options.compression,
    count,
    radius,
    layout: plan.map((item) => [item.name, item.dtype]),
  };
}

export interface PackResult {
  bytes: Uint8Array;
  plan: AttributePlan[];
  bytesPerParticle: number;
  report: EncodeReport;
}

export function packParticles(source: ParticleSource, project: Project3D, options: PackOptions): PackResult {
  const plan = planAttributes(project, options);
  const n = source.n;
  const data: Record<AttrName, ArrayLike<number>> = {
    position: source.pos, normal: source.nrm, velocity: source.velocity, homeBase: source.homeBase,
    t: source.t, size: source.size, alpha: source.alpha, phase: source.phase, weight: source.weight, layer: source.layer,
  };
  const inputs: AttributeInput[] = plan.map((item) => ({ name: item.name, dtype: item.dtype, normalized: item.normalized, data: data[item.name] }));
  const { bytes, report } = encodePsb(n, inputs, packMeta(options, plan, n, source.radius));
  return { bytes, plan, bytesPerParticle: bytesPerParticle(plan), report };
}

/** Exact byte length `packParticles` will produce for this scene. */
export function estimatePackedBytes(count: number, radius: number, project: Project3D, options: PackOptions): { bytes: number; bytesPerParticle: number; plan: AttributePlan[] } {
  const plan = planAttributes(project, options);
  const metaBytes = new TextEncoder().encode(JSON.stringify(packMeta(options, plan, count, radius))).length;
  return { bytes: psbByteLength(count, plan, metaBytes), bytesPerParticle: bytesPerParticle(plan), plan };
}
