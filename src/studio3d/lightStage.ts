/**
 * Light stage + particle FX: the "Dust in the Light" look as a set of validated, serialisable settings.
 *
 * Everything here is pure data (no DOM, no GL). Defaults reproduce the renderer's original behaviour
 * exactly, so a project saved before these controls existed renders identically until the user changes something.
 */
import type { GeneratorId, LightBeam, Look } from "./types";
import { clamp } from "./math";
import { hexToRgb01, makeLightBeam } from "./lightBeams";

/* ───────────── light stage (how beams reveal and glint particles) ───────────── */
export interface LightStage {
  /** 0 = beams only add colour (original behaviour) · 1 = particles are hidden outside the light. */
  reveal: number;
  /** Visibility of particles outside every beam when reveal > 0. */
  ambient: number;
  /** How much far-away particles dim further in the ambient state. */
  ambientDepth: number;
  /** Global brightness multiplier for all beams. */
  gain: number;
  /** Beam energy at which a particle counts as fully lit (lower = lit sooner). */
  litKnee: number;
  /** Share of a lit particle's brightness that flickers as it tumbles (original: 0.18). */
  glintDepth: number;
  /** Exponent of the glint flash: higher = rarer, sharper sparkles (original: 8). */
  glintSharpness: number;
  /** Tumbling speed multiplier. */
  glintRate: number;
  /** Extra brightness at the peak of a glint. */
  glintBoost: number;
  /** How much lit particles grow (scaled by light and glint). */
  litSize: number;
  /** >1 makes only a few particles very reflective, <1 makes reflectivity more even. */
  reflectivityBias: number;
  /** 0 = reflectivity is random per particle · 1 = normals facing the beam reflect more. */
  normalResponse: number;
  /** Colour the beams light particles with (mixed over the palette colour). */
  lightColor: string;
  lightColorMix: number;
  /** Preview-only: draw each beam's axis and cross-section. Never exported to PNG. */
  guides: boolean;
}

export const STAGE_LIMITS = {
  reveal: [0, 1], ambient: [0, 1], ambientDepth: [0, 1], gain: [0, 4], litKnee: [0.02, 2],
  glintDepth: [0, 1], glintSharpness: [1, 24], glintRate: [0, 4], glintBoost: [0, 4], litSize: [0, 2],
  reflectivityBias: [0.3, 4], normalResponse: [0, 1], lightColorMix: [0, 1],
} as const satisfies Record<string, readonly [number, number]>;

export const DEFAULT_STAGE: Readonly<LightStage> = Object.freeze({
  reveal: 0, ambient: 0.15, ambientDepth: 0.5, gain: 1, litKnee: 0.5,
  glintDepth: 0.18, glintSharpness: 8, glintRate: 1, glintBoost: 0, litSize: 0,
  reflectivityBias: 1, normalResponse: 1, lightColor: "#eef0f6", lightColorMix: 0, guides: false,
});

/* ───────────── particle FX (per-particle appearance and air motion) ───────────── */
export interface ParticleFx {
  /** Simulation speed multiplier (0 freezes motion, 1 is normal). */
  timeScale: number;
  /** Size distribution exponent: >1 = many small, a few large. 1 = uniform. */
  sizeCurve: number;
  /** Smallest / largest on-screen particle size in pixels (the GPU may cap the maximum). */
  minPx: number;
  maxPx: number;
  /** Fraction of particles that become big, soft, dim motes, and how big / bright they are. */
  moteShare: number;
  moteScale: number;
  moteAlpha: number;
  /** Per-particle random opacity and palette-position variation. */
  opacityJitter: number;
  colorJitter: number;
  /** Independent shimmer of every particle (not tied to beams). */
  twinkle: number;
  twinkleRate: number;
  twinkleSharp: number;
  /** Depth of field: particles away from the focus plane grow; dofDim compensates their brightness. */
  dof: number;
  dofDim: number;
  /** Visual-only motion: per-particle wobble and a shared air-current field (neighbours move together). */
  wander: number;
  wanderSpeed: number;
  flow: number;
  flowScale: number;
  flowSpeed: number;
}

export const FX_LIMITS = {
  timeScale: [0, 3], sizeCurve: [0.25, 4], minPx: [1, 8], maxPx: [8, 256], moteShare: [0, 0.2], moteScale: [1, 10], moteAlpha: [0, 1],
  opacityJitter: [0, 1], colorJitter: [0, 1], twinkle: [0, 1], twinkleRate: [0, 8], twinkleSharp: [1, 16],
  dof: [0, 3], dofDim: [0, 1], wander: [0, 0.15], wanderSpeed: [0, 4], flow: [0, 0.3], flowScale: [0.2, 6], flowSpeed: [0, 3],
} as const satisfies Record<string, readonly [number, number]>;

export const DEFAULT_FX: Readonly<ParticleFx> = Object.freeze({
  timeScale: 1, sizeCurve: 1, minPx: 1, maxPx: 120, moteShare: 0, moteScale: 4, moteAlpha: 0.5,
  opacityJitter: 0, colorJitter: 0, twinkle: 0, twinkleRate: 1.5, twinkleSharp: 3,
  dof: 0, dofDim: 0.5, wander: 0, wanderSpeed: 0.6, flow: 0, flowScale: 1.4, flowSpeed: 0.35,
});

export const defaultStage = (): LightStage => ({ ...DEFAULT_STAGE });
export const defaultFx = (): ParticleFx => ({ ...DEFAULT_FX });

/* ───────────── validation (safe defaults for hostile / partial / older JSON) ───────────── */
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, d: number, lim: readonly [number, number]) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lim[0], lim[1]) : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : d);

export function normalizeStage(raw: unknown): LightStage {
  const r = isObj(raw) ? raw : {}, D = DEFAULT_STAGE, L = STAGE_LIMITS;
  return {
    reveal: num(r.reveal, D.reveal, L.reveal), ambient: num(r.ambient, D.ambient, L.ambient), ambientDepth: num(r.ambientDepth, D.ambientDepth, L.ambientDepth),
    gain: num(r.gain, D.gain, L.gain), litKnee: num(r.litKnee, D.litKnee, L.litKnee),
    glintDepth: num(r.glintDepth, D.glintDepth, L.glintDepth), glintSharpness: num(r.glintSharpness, D.glintSharpness, L.glintSharpness),
    glintRate: num(r.glintRate, D.glintRate, L.glintRate), glintBoost: num(r.glintBoost, D.glintBoost, L.glintBoost), litSize: num(r.litSize, D.litSize, L.litSize),
    reflectivityBias: num(r.reflectivityBias, D.reflectivityBias, L.reflectivityBias), normalResponse: num(r.normalResponse, D.normalResponse, L.normalResponse),
    lightColor: hex(r.lightColor, D.lightColor), lightColorMix: num(r.lightColorMix, D.lightColorMix, L.lightColorMix),
    guides: typeof r.guides === "boolean" ? r.guides : D.guides,
  };
}

export function normalizeFx(raw: unknown): ParticleFx {
  const r = isObj(raw) ? raw : {}, D = DEFAULT_FX, L = FX_LIMITS;
  const minPx = num(r.minPx, D.minPx, L.minPx);
  return {
    timeScale: num(r.timeScale, D.timeScale, L.timeScale), sizeCurve: num(r.sizeCurve, D.sizeCurve, L.sizeCurve),
    minPx, maxPx: Math.max(minPx, num(r.maxPx, D.maxPx, L.maxPx)),
    moteShare: num(r.moteShare, D.moteShare, L.moteShare), moteScale: num(r.moteScale, D.moteScale, L.moteScale), moteAlpha: num(r.moteAlpha, D.moteAlpha, L.moteAlpha),
    opacityJitter: num(r.opacityJitter, D.opacityJitter, L.opacityJitter), colorJitter: num(r.colorJitter, D.colorJitter, L.colorJitter),
    twinkle: num(r.twinkle, D.twinkle, L.twinkle), twinkleRate: num(r.twinkleRate, D.twinkleRate, L.twinkleRate), twinkleSharp: num(r.twinkleSharp, D.twinkleSharp, L.twinkleSharp),
    dof: num(r.dof, D.dof, L.dof), dofDim: num(r.dofDim, D.dofDim, L.dofDim),
    wander: num(r.wander, D.wander, L.wander), wanderSpeed: num(r.wanderSpeed, D.wanderSpeed, L.wanderSpeed),
    flow: num(r.flow, D.flow, L.flow), flowScale: num(r.flowScale, D.flowScale, L.flowScale), flowSpeed: num(r.flowSpeed, D.flowSpeed, L.flowSpeed),
  };
}

/* ───────────── GPU uniform packing (nine vec4s; layout is mirrored by the shader in shaders.ts) ───────────── */
export interface StageUniforms {
  stageA: Float32Array; stageB: Float32Array; stageC: Float32Array; stageColor: Float32Array;
  fxA: Float32Array; fxB: Float32Array; fxC: Float32Array; fxD: Float32Array; fxE: Float32Array;
}
export const createStageUniforms = (): StageUniforms => ({
  stageA: new Float32Array(4), stageB: new Float32Array(4), stageC: new Float32Array(4), stageColor: new Float32Array(4),
  fxA: new Float32Array(4), fxB: new Float32Array(4), fxC: new Float32Array(4), fxD: new Float32Array(4), fxE: new Float32Array(4),
});

/** Packs (possibly absent) stage + FX settings into the shader's uniform vectors. Absent = original look. */
export function packStageUniforms(stage: LightStage | undefined, fx: ParticleFx | undefined, out: StageUniforms): StageUniforms {
  const s = normalizeStage(stage ?? DEFAULT_STAGE), f = normalizeFx(fx ?? DEFAULT_FX), c = hexToRgb01(s.lightColor);
  out.stageA.set([s.reveal, s.ambient, s.ambientDepth, s.gain]);
  out.stageB.set([s.litKnee, s.glintDepth, s.glintSharpness, s.glintRate]);
  out.stageC.set([s.glintBoost, s.litSize, s.reflectivityBias, s.normalResponse]);
  out.stageColor.set([c[0], c[1], c[2], s.lightColorMix]);
  out.fxA.set([f.sizeCurve, f.minPx, f.maxPx, f.moteShare]);
  out.fxB.set([f.moteScale, f.moteAlpha, f.opacityJitter, f.colorJitter]);
  out.fxC.set([f.twinkle, f.twinkleRate, f.twinkleSharp, f.dof]);
  out.fxD.set([f.dofDim, f.wander, f.wanderSpeed, f.flow]);
  out.fxE.set([f.flowScale, f.flowSpeed, 0, 0]);
  return out;
}

/* ───────────── presets ───────────── */
export interface StagePresetBuild {
  generator?: GeneratorId;
  count?: number;
  stage: LightStage;
  particles: ParticleFx;
  beams: LightBeam[];
  look: Partial<Look>;
}
export interface StagePreset { id: string; label: string; hint: string; build: () => StagePresetBuild }

const stage = (over: Partial<LightStage>): LightStage => normalizeStage({ ...DEFAULT_STAGE, ...over });
const fx = (over: Partial<ParticleFx>): ParticleFx => normalizeFx({ ...DEFAULT_FX, ...over });
const pal = (...colors: string[]) => colors.map((color, i) => ({ t: colors.length === 1 ? 0 : i / (colors.length - 1), color }));

export const STAGE_PRESETS: StagePreset[] = [
  {
    id: "dust-in-light", label: "Dust in the light", hint: "Two crossing shafts reveal drifting dust; far specks stay almost black.",
    build: () => ({
      generator: "dust-veil", count: 80000,
      stage: stage({ reveal: 0.92, ambient: 0.14, ambientDepth: 0.6, gain: 1.5, litKnee: 0.35, glintDepth: 0.55, glintSharpness: 9, glintRate: 1.2, glintBoost: 1.6, litSize: 1.1, reflectivityBias: 2, normalResponse: 0.4, lightColor: "#eef0f6", lightColorMix: 0.85 }),
      particles: fx({ sizeCurve: 1.8, moteShare: 0.004, moteScale: 4.5, moteAlpha: 0.35, opacityJitter: 0.5, dof: 0.5, wander: 0.012, wanderSpeed: 0.8, flow: 0.03, flowScale: 1.2, flowSpeed: 0.3 }),
      beams: [
        makeLightBeam({ name: "Shaft A", origin: [-1.6, 1.3, 0], azimuth: 90, elevation: -35, length: 3.6, width: 0.09, spread: 0.9, intensity: 1.4, colorPosition: 0.9, fadeIn: 0.16, fadeOut: 0.42, speed: 0.4, motion: 0.5, seed: 1 }),
        makeLightBeam({ name: "Shaft B", origin: [1.7, -0.85, 0.1], azimuth: -90, elevation: 25, length: 3.4, width: 0.08, spread: 0.8, intensity: 1.15, colorPosition: 0.9, fadeIn: 0.14, fadeOut: 0.5, speed: 0.35, motion: 0.5, seed: 2 }),
      ],
      look: { palette: pal("#8d96a8", "#f2f5ff"), background: "#000000", size: 0.0065, sizeVariation: 0.5, opacity: 1, emission: 1.9, shape: "soft", softness: 0.55, blend: "additive", glow: 0.6, glowRadius: 0.5, exposure: 1.5, vignette: 0.5, grain: 0.12, depthFade: 0.6, autoNormalize: true },
    }),
  },
  {
    id: "cathedral", label: "Cathedral rays", hint: "Three widening gold fans fall from above through hanging dust.",
    build: () => ({
      generator: "dust-cloud", count: 70000,
      stage: stage({ reveal: 0.85, ambient: 0.2, ambientDepth: 0.5, gain: 1.2, litKnee: 0.4, glintDepth: 0.4, glintSharpness: 7, glintRate: 0.8, glintBoost: 0.8, litSize: 0.4, reflectivityBias: 1.5, normalResponse: 0.3, lightColor: "#ffd9a0", lightColorMix: 0.8 }),
      particles: fx({ sizeCurve: 1.4, opacityJitter: 0.3, wander: 0.01, wanderSpeed: 0.5, flow: 0.02, flowScale: 1, flowSpeed: 0.25 }),
      beams: [-0.9, 0, 0.9].map((x, i) => makeLightBeam({ style: "fan", name: `Ray ${i + 1}`, origin: [x, 1.7, -0.3], azimuth: x * 9, elevation: -72, length: 3.8, width: 0.07, spread: 1.4, intensity: 1.3, colorPosition: 0.85, fadeIn: 0.1, fadeOut: 0.5, speed: 0.3, motion: 0.45, seed: i + 3 })),
      look: { palette: pal("#8a6a3c", "#ffe2b0"), background: "#020203", size: 0.005, sizeVariation: 0.5, opacity: 0.9, emission: 1.2, shape: "soft", softness: 0.6, blend: "additive", glow: 0.6, glowRadius: 0.7, exposure: 1.4, vignette: 0.55, grain: 0.14, depthFade: 0.5, autoNormalize: true },
    }),
  },
  {
    id: "laser-sweep", label: "Laser sweep", hint: "Two helical neon beams cut through motes.",
    build: () => ({
      generator: "dust-motes", count: 60000,
      stage: stage({ reveal: 0.8, ambient: 0.1, ambientDepth: 0.4, gain: 1.3, litKnee: 0.3, glintDepth: 0.5, glintSharpness: 6, glintRate: 1.6, glintBoost: 1.2, litSize: 0.5, reflectivityBias: 1.2, normalResponse: 0, lightColor: "#ffffff", lightColorMix: 0 }),
      particles: fx({ sizeCurve: 1.3, twinkle: 0.25, twinkleRate: 2, twinkleSharp: 4, wander: 0.008, wanderSpeed: 1 }),
      beams: [
        makeLightBeam({ style: "helix", name: "Magenta helix", origin: [-1.5, -0.6, 0], azimuth: 90, elevation: 12, length: 3.2, width: 0.05, spread: 1, twist: 3, intensity: 1.5, fadeIn: 0.1, fadeOut: 0.3, speed: 1.4, motion: 0.6, seed: 7, lightColor: "#ff3df2", lightMix: 0.9 }),
        makeLightBeam({ style: "helix", name: "Cyan helix", origin: [1.5, 0.6, 0], azimuth: -90, elevation: -12, length: 3.2, width: 0.05, spread: 1, twist: -3, intensity: 1.5, fadeIn: 0.1, fadeOut: 0.3, speed: 1.2, motion: 0.6, seed: 8, lightColor: "#35f0ff", lightMix: 0.9 }),
      ],
      look: { palette: pal("#5b6cff", "#ffffff"), background: "#000000", size: 0.005, sizeVariation: 0.45, opacity: 0.9, emission: 1.3, shape: "soft", softness: 0.5, blend: "additive", glow: 0.9, glowRadius: 0.8, exposure: 1.4, vignette: 0.5, grain: 0.1, depthFade: 0.4, autoNormalize: true },
    }),
  },
  {
    id: "spotlight", label: "Spotlight on a shape", hint: "One soft fan lights a sphere; the rest falls into shadow.",
    build: () => ({
      generator: "sphere",
      stage: stage({ reveal: 0.75, ambient: 0.18, ambientDepth: 0.3, gain: 1.4, litKnee: 0.45, glintDepth: 0.3, glintSharpness: 8, glintRate: 1, glintBoost: 0.6, litSize: 0.2, reflectivityBias: 1, normalResponse: 1, lightColor: "#eef4ff", lightColorMix: 0.6 }),
      particles: fx({ opacityJitter: 0.2 }),
      beams: [makeLightBeam({ style: "fan", name: "Spot", origin: [-1.8, 1.4, 1.2], azimuth: 125, elevation: -30, length: 3.6, width: 0.2, spread: 1.1, intensity: 1.5, colorPosition: 0.9, fadeIn: 0.1, fadeOut: 0.35, speed: 0.3, motion: 0.3, seed: 11 })],
      look: { background: "#020306", glow: 0.55, exposure: 1.3, vignette: 0.45 },
    }),
  },
];
