/**
 * Shader Studio — shared types and constants.
 *
 * A ShaderProject is plain JSON: it fully describes one procedural shader
 * (generator, optional overlay layer, palette, transforms, lighting, post
 * effects and pointer behaviour). The GLSL is assembled from it on demand,
 * so the live preview and every export use exactly the same source.
 */

export const GENERATOR_IDS = [
  "fluid", "silk", "waves", "lava", "mesh", "caustics",
  "blackhole", "nebula", "galaxy", "tunnel", "fractal", "stars",
  "aurora", "plasma", "rays", "electric", "bokeh",
  "voronoi", "facets", "hex", "lattice", "contours", "interference", "halftone",
] as const;
export type GeneratorId = (typeof GENERATOR_IDS)[number];

export const GENERATOR_CATEGORIES = ["Fluid", "Cosmic", "Light", "Pattern"] as const;
export type GeneratorCategory = (typeof GENERATOR_CATEGORIES)[number];

export const INTERACTION_MODES = ["Stir", "Attract", "Repel", "Light", "Off"] as const;
export type InteractionMode = (typeof INTERACTION_MODES)[number];

export const BLEND_MODES = ["Mix", "Add", "Screen", "Multiply", "Overlay", "Difference"] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export type Knobs = [number, number, number, number];

export interface RangeDef {
  min: number;
  max: number;
  step: number;
}

/** Slider ranges for every numeric project field (also used to clamp imports). */
export const RANGES = {
  scale: { min: 0.3, max: 4, step: 0.05 },
  speed: { min: 0, max: 3, step: 0.05 },
  seed: { min: 0, max: 100, step: 1 },
  rotation: { min: -180, max: 180, step: 1 },
  spin: { min: -40, max: 40, step: 0.5 },
  warp: { min: 0, max: 2, step: 0.02 },
  warpScale: { min: 0.3, max: 4, step: 0.05 },
  swirl: { min: -4, max: 4, step: 0.05 },
  symmetry: { min: 0, max: 16, step: 1 },
  pixelate: { min: 0, max: 160, step: 2 },
  paletteShift: { min: 0, max: 2, step: 0.01 },
  paletteSpeed: { min: -1, max: 1, step: 0.02 },
  paletteRepeat: { min: 0.25, max: 4, step: 0.05 },
  contrast: { min: 0.5, max: 2.5, step: 0.02 },
  exposure: { min: -2, max: 2, step: 0.05 },
  saturation: { min: 0, max: 2, step: 0.02 },
  hue: { min: -180, max: 180, step: 1 },
  glow: { min: 0, max: 2, step: 0.02 },
  tone: { min: 0, max: 1, step: 0.02 },
  relief: { min: 0, max: 3, step: 0.05 },
  lightAngle: { min: 0, max: 360, step: 1 },
  shine: { min: 0, max: 1.5, step: 0.02 },
  aberration: { min: 0, max: 1, step: 0.02 },
  vignette: { min: 0, max: 1.2, step: 0.02 },
  grain: { min: 0, max: 1, step: 0.02 },
  scanlines: { min: 0, max: 1, step: 0.02 },
  posterize: { min: 0, max: 16, step: 1 },
  interactionRadius: { min: 0.08, max: 0.9, step: 0.01 },
  interactionStrength: { min: 0, max: 2, step: 0.05 },
  overlayOpacity: { min: 0, max: 1, step: 0.02 },
  overlayScale: { min: 0.3, max: 4, step: 0.05 },
  overlaySpeed: { min: 0, max: 3, step: 0.05 },
  overlayShift: { min: 0, max: 1, step: 0.01 },
} as const satisfies Record<string, RangeDef>;

export type RangeKey = keyof typeof RANGES;

export interface ShaderOverlay {
  enabled: boolean;
  generator: GeneratorId;
  knobs: Knobs;
  blend: BlendMode;
  opacity: number;
  scale: number;
  speed: number;
  shift: number;
}

export interface ShaderProject {
  name: string;
  generator: GeneratorId;
  knobs: Knobs;

  /* transform */
  scale: number;
  speed: number;
  seed: number;
  rotation: number;
  spin: number;
  warp: number;
  warpScale: number;
  swirl: number;
  symmetry: number;
  pixelate: number;

  /* colour */
  palette: string[];
  accent: string;
  paletteShift: number;
  paletteSpeed: number;
  paletteRepeat: number;
  contrast: number;
  exposure: number;
  saturation: number;
  hue: number;
  glow: number;
  tone: number;

  /* surface */
  relief: number;
  lightAngle: number;
  shine: number;

  /* post */
  aberration: number;
  vignette: number;
  grain: number;
  scanlines: number;
  posterize: number;

  /* pointer */
  interaction: InteractionMode;
  interactionRadius: number;
  interactionStrength: number;
  ripples: boolean;
  idleDrift: boolean;

  overlay: ShaderOverlay;
  playing: boolean;
}

export interface ShaderPreset {
  name: string;
  tag: string;
  project: ShaderProject;
}

export const MIN_PALETTE = 2;
export const MAX_PALETTE = 6;
