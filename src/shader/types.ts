/**
 * Shader Studio — shared types and constants.
 *
 * A ShaderProject is plain JSON: it fully describes one procedural shader
 * (a layer stack, palette, transforms, lighting, post effects, pointer
 * behaviour and an optional image mask). The GLSL is assembled from it on
 * demand, so the live preview and every export use exactly the same source.
 */

export const GENERATOR_IDS = [
  "fluid", "silk", "waves", "lava", "mesh", "caustics",
  "blackhole", "nebula", "galaxy", "tunnel", "fractal", "stars",
  "aurora", "plasma", "rays", "electric", "bokeh",
  "voronoi", "facets", "hex", "lattice", "contours", "interference", "halftone",
  "linearGradient", "radialGradient", "conicGradient", "diamondGradient", "spiralGradient",
  "reflectedGradient", "sunsetGradient", "iridescentGradient", "holographicGradient",
  "liquidGradient", "noiseGradient", "topographicGradient", "prismaticGradient",
] as const;
export type GeneratorId = (typeof GENERATOR_IDS)[number];

export const GENERATOR_CATEGORIES = ["Fluid", "Cosmic", "Light", "Pattern", "Gradient"] as const;
export type GeneratorCategory = (typeof GENERATOR_CATEGORIES)[number];

/* ───────────────────────── pointer ───────────────────────── */

/** 25 ready-made pointer modes (the first five are the originals). */
export const INTERACTION_MODES = [
  "Off", "Stir", "Attract", "Repel", "Light",
  "Whirlpool", "Twirl", "Fisheye", "Gravity Lens", "Mirror", "Mosaic", "Kaleido Lens", "Turbulence", "Glitch",
  "Ripple Pond", "Shockwave", "Jelly", "Smear", "Comet Trail", "Ink Drop",
  "Spotlight", "Prism", "Chroma Shift", "Negative", "Heat",
] as const;
export type InteractionMode = (typeof INTERACTION_MODES)[number];

/** Building blocks of the custom touch builder. */
export const TOUCH_EFFECTS = [
  "Pull", "Push", "Swirl", "Twist", "Wave", "Noise", "Shear", "Mosaic", "Mirror", "Kaleido", "Glitch", "Pulse",
  "Palette", "Light", "Spotlight", "Glow", "Hue", "Invert", "Prism",
] as const;
export type TouchEffect = (typeof TOUCH_EFFECTS)[number];

export const FALLOFFS = ["Gauss", "Smooth", "Linear", "Plateau", "Ring", "Spike"] as const;
export type Falloff = (typeof FALLOFFS)[number];

export const TRIGGERS = ["Always", "Press", "Move", "Boost", "Still"] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const TOUCH_SOURCES = ["Pointer", "Trail"] as const;
export type TouchSource = (typeof TOUCH_SOURCES)[number];

export interface TouchRule {
  effect: TouchEffect;
  enabled: boolean;
  /** strength multiplier (negative values invert the effect) */
  amount: number;
  /** radius multiplier on top of the master radius */
  radius: number;
  p1: number;
  p2: number;
  falloff: Falloff;
  trigger: Trigger;
  source: TouchSource;
}

export interface TouchSettings {
  /** "mode" runs one of the 25 predefined modes, "custom" runs the rule stack below. */
  source: "mode" | "custom";
  /** the two mode-specific sliders of the selected predefined mode */
  params: [number, number];
  falloff: Falloff | "Auto";
  trigger: Trigger | "Auto";
  /** how quickly the smoothed pointer follows the real one */
  response: number;
  /** seconds a trail point stays alive */
  trail: number;
  custom: TouchRule[];
}

export const MAX_RULES = 6;

/* ───────────────────────── layers ───────────────────────── */

export const BLEND_MODES = [
  "Normal", "Multiply", "Screen", "Overlay", "Darken", "Lighten", "Color Dodge", "Color Burn",
  "Hard Light", "Soft Light", "Difference", "Exclusion", "Add", "Subtract", "Divide", "Linear Burn",
  "Linear Light", "Vivid Light", "Pin Light", "Hard Mix", "Hue", "Saturation", "Color", "Luminosity",
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export const LAYER_KINDS = [
  "base", "field", "solid", "linear", "radial", "conic", "diamond", "spiral",
  "noise", "grain", "vignette", "glow", "pattern",
] as const;
export type LayerKind = (typeof LAYER_KINDS)[number];

export const PATTERN_IDS = ["stripes", "checker", "dots", "grid", "zigzag", "rings", "waves", "hatch", "triangles", "plus"] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

export const LAYER_SPACES = ["Scene", "Screen"] as const;
export type LayerSpace = (typeof LAYER_SPACES)[number];

export const REGIONS = ["All", "Inside", "Outside"] as const;
export type Region = (typeof REGIONS)[number];

/** Layers in the stack, including the base field. */
export const MAX_LAYERS = 8;
export const MIN_LAYER_COLORS = 2;
export const MAX_LAYER_COLORS = 5;

export type Knobs = [number, number, number, number];

export interface ShaderLayer {
  id: string;
  name: string;
  /** "base" is the project's main field (edited in the Field / Motion / Color tabs). */
  kind: LayerKind;
  visible: boolean;
  blend: BlendMode;
  opacity: number;
  /** show the layer everywhere, only inside the image mask or only outside it */
  region: Region;
  /** "Scene" follows pointer warps, symmetry and rotation; "Screen" stays fixed to the frame */
  space: LayerSpace;

  /* placement */
  scale: number;
  speed: number;
  rotation: number;
  x: number;
  y: number;

  /** generator id when kind is "field" */
  generator: GeneratorId;
  /** generator knobs for fields, kind-specific knobs for everything else */
  knobs: Knobs;
  pattern: PatternId;

  /* colour */
  colors: string[];
  /** position of every colour stop on the gradient bar, 0..1, ascending (same length as colors) */
  positions: number[];
  /** fields and noise can use the project palette instead of their own colours */
  ownColors: boolean;
  shift: number;
  reverse: boolean;
  /** gradient kinds: fade the far end of the ramp to transparent */
  fade: number;
  /** use the layer's brightness as its alpha */
  keyed: boolean;
  /** patterns: fill the gaps with the ramp's first colour instead of leaving them transparent */
  fill: boolean;
}

/* ───────────────────────── image mask ───────────────────────── */

export const MASK_SHAPES = [
  "circle", "ring", "heart", "star", "flower", "butterfly", "moon", "drop", "bolt", "hexagon", "spiral", "infinity", "skull",
] as const;
export type MaskShapeId = (typeof MASK_SHAPES)[number];

export const TEXT_FONT_FAMILIES = [
  "system-ui, sans-serif",
  "Arial, sans-serif",
  "Georgia, serif",
  "Impact, sans-serif",
  "Courier New, monospace",
  "monospace",
] as const;
export type TextFontFamily = (typeof TEXT_FONT_FAMILIES)[number];

export const TEXT_FONT_WEIGHTS = ["300", "400", "500", "600", "700", "800", "900"] as const;
export type TextFontWeight = (typeof TEXT_FONT_WEIGHTS)[number];
export const MAX_TEXT_LENGTH = 160;
export const MAX_TEXT_LINES = 6;

export interface TextMaskSource {
  kind: "text";
  text: string;
  fontFamily: TextFontFamily;
  fontWeight: TextFontWeight;
  italic: boolean;
  tracking: number;
  lineSpacing: number;
  align: "left" | "center" | "right";
}

export type MaskSource =
  | { kind: "shape"; id: MaskShapeId }
  | { kind: "image"; name: string; data: string }
  | TextMaskSource;

export const MASK_PATTERNS = ["None", "Stripes", "Dots", "Grid", "Echo", "Checker", "Hatch", "Scan"] as const;
export type MaskPattern = (typeof MASK_PATTERNS)[number];

export interface ShaderMask {
  enabled: boolean;
  source: MaskSource;

  /* processing */
  threshold: number;
  invert: boolean;

  /* shape edge */
  grow: number;
  edge: number;
  smoke: number;
  smokeScale: number;

  /* placement */
  scale: number;
  x: number;
  y: number;
  rotation: number;
  follow: number;
  breathe: number;

  /* fill */
  ghost: number;
  background: string;
  innerBoost: number;
  innerHue: number;

  /* edge looks */
  glow: number;
  halo: number;
  outline: number;
  bevel: number;
  distort: number;
  flow: number;

  /* particles */
  particles: number;
  particleSize: number;
  particleSpeed: number;

  /* pattern inside the shape */
  pattern: MaskPattern;
  patternAmount: number;
  patternScale: number;
  patternAngle: number;
  patternSpeed: number;
}

/* ───────────────────────── ranges ───────────────────────── */

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
  paletteSoft: { min: 0, max: 1, step: 0.01 },
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

  /* touch */
  touchResponse: { min: 2, max: 16, step: 0.5 },
  touchTrail: { min: 0.2, max: 3, step: 0.1 },
  ruleAmount: { min: -2, max: 2, step: 0.05 },
  ruleRadius: { min: 0.2, max: 3, step: 0.05 },

  /* layers */
  layerOpacity: { min: 0, max: 1, step: 0.01 },
  layerScale: { min: 0.2, max: 4, step: 0.05 },
  layerSpeed: { min: 0, max: 3, step: 0.05 },
  layerRotation: { min: -180, max: 180, step: 1 },
  layerOffset: { min: -1, max: 1, step: 0.01 },
  layerShift: { min: 0, max: 1, step: 0.01 },
  layerFade: { min: 0, max: 1, step: 0.02 },

  /* mask */
  maskThreshold: { min: 0.05, max: 0.95, step: 0.01 },
  maskGrow: { min: -1, max: 1, step: 0.02 },
  maskEdge: { min: 0, max: 1, step: 0.02 },
  maskSmoke: { min: 0, max: 1, step: 0.02 },
  maskSmokeScale: { min: 0.3, max: 4, step: 0.05 },
  maskScale: { min: 0.2, max: 2.4, step: 0.02 },
  maskX: { min: -0.9, max: 0.9, step: 0.01 },
  maskY: { min: -0.6, max: 0.6, step: 0.01 },
  maskRotation: { min: -180, max: 180, step: 1 },
  maskFollow: { min: 0, max: 1, step: 0.02 },
  maskBreathe: { min: 0, max: 1, step: 0.02 },
  maskGhost: { min: 0, max: 1, step: 0.02 },
  maskInnerBoost: { min: -1.5, max: 1.5, step: 0.05 },
  maskInnerHue: { min: -180, max: 180, step: 1 },
  maskGlow: { min: 0, max: 2, step: 0.02 },
  maskHalo: { min: 0, max: 2, step: 0.02 },
  maskOutline: { min: 0, max: 1, step: 0.02 },
  maskBevel: { min: 0, max: 2, step: 0.02 },
  maskDistort: { min: 0, max: 2, step: 0.02 },
  maskFlow: { min: 0, max: 2, step: 0.02 },
  maskParticles: { min: 0, max: 1, step: 0.02 },
  maskParticleSize: { min: 0.3, max: 2.5, step: 0.05 },
  maskParticleSpeed: { min: 0, max: 3, step: 0.05 },
  maskPatternAmount: { min: 0, max: 1, step: 0.02 },
  maskPatternScale: { min: 0.3, max: 4, step: 0.05 },
  maskPatternAngle: { min: 0, max: 180, step: 1 },
  maskPatternSpeed: { min: -2, max: 2, step: 0.05 },
} as const satisfies Record<string, RangeDef>;

export type RangeKey = keyof typeof RANGES;

/* ───────────────────────── project ───────────────────────── */

export interface ShaderProject {
  name: string;
  /** the base field — one entry of the layer stack points at it */
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
  /** position of every palette stop on the gradient bar, 0..1, ascending (same length as palette) */
  palettePositions: number[];
  /** 0 = hard colour bands, 1 = smooth blends between stops */
  paletteSoft: number;
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
  touch: TouchSettings;

  mask: ShaderMask;

  /** layer stack, top layer first. Exactly one entry has kind "base". */
  layers: ShaderLayer[];
  /** colour that shows through wherever the stack is transparent */
  canvas: string;
  playing: boolean;
}

export interface ShaderPreset {
  name: string;
  tag: string;
  project: ShaderProject;
}

export const MIN_PALETTE = 2;
export const MAX_PALETTE = 6;
