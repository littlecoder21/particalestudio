import type { EasingName, Vec3 } from "./math";
import type { Rng } from "./math";

export type { Vec3, EasingName };
export const SCHEMA_VERSION = 3;
export const MAX_LAYERS = 4;

export type ParamValue = number | boolean | string;
export type ParamMap = Record<string, ParamValue>;
export type ParamDef =
  | { key: string; label: string; type: "range"; min: number; max: number; step: number; def: number; hint?: string }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; def: string; hint?: string }
  | { key: string; label: string; type: "toggle"; def: boolean; hint?: string }
  | { key: string; label: string; type: "text"; def: string; hint?: string };

export type GeneratorId =
  | "sphere" | "torus" | "helix" | "galaxy" | "mobius" | "cube" | "klein" | "mandelbulb" | "wave" | "flower"
  | "smoke" | "fabric" | "wormhole" | "vortex" | "crystal" | "dust-cloud" | "dust-veil" | "dust-motes" | "neural" | "atom" | "knot" | "explosion" | "fluid"
  | "geo-sphere" | "geo-cube" | "geo-torus" | "geo-torus-knot" | "geo-icosahedron" | "geo-dodecahedron" | "geo-octahedron" | "geo-tetrahedron" | "geo-pyramid" | "geo-helix"
  | "space-saturn" | "space-galaxy" | "space-black-hole" | "space-wormhole" | "space-nebula" | "space-asteroid" | "space-comet" | "space-supernova" | "space-star-cluster" | "space-planetary-system"
  | "nature-butterfly" | "nature-brain" | "nature-skull" | "nature-dna" | "nature-tree" | "nature-flower" | "nature-rose" | "nature-jellyfish" | "nature-seahorse" | "nature-dragon"
  | "math-klein-bottle" | "math-mobius-strip" | "math-trefoil-knot" | "math-mobius-torus" | "math-gyroid" | "math-mandelbulb" | "math-lorenz-attractor" | "math-clifford-attractor" | "math-fibonacci-spiral" | "math-spherical-harmonics"
  | "form-human-face" | "form-human-body" | "form-human-hand" | "form-eagle" | "form-wolf" | "form-lion" | "form-phoenix" | "form-dna-molecule" | "form-crystal-cluster" | "form-infinity"
  | "text3d";

export const MAX_LIGHT_BEAMS = 20;
export type LightBeamStyle = "shaft" | "fan" | "arc" | "helix";
export interface LightBeam {
  id: string;
  name: string;
  enabled: boolean;
  style: LightBeamStyle;
  origin: Vec3;
  azimuth: number;
  elevation: number;
  length: number;
  width: number;
  spread: number;
  bend: number;
  twist: number;
  intensity: number;
  colorPosition: number;
  fadeIn: number;
  fadeOut: number;
  speed: number;
  motion: number;
  seed: number;
}

/** One generated particle formation — structure of arrays, every array has length n (or 3n). */
export interface Formation {
  n: number;
  pos: Float32Array;    // 3n   home position
  nrm: Float32Array;    // 3n   unit surface normal (0,0,0 when none)
  t: Float32Array;      // n    colour-gradient position 0..1
  size: Float32Array;   // n    relative size
  alpha: Float32Array;  // n    relative opacity
  phase: Float32Array;  // n    0..1 per-particle phase
  weight: Float32Array; // n    how strongly deformers move this particle (0 = rigid)
  layer: Uint8Array;    // n    project layer index (palette row)
  radius: number;       // bounding radius
}

export type TextMask = { w: number; h: number; pts: Int32Array } | null;
export interface GenContext {
  n: number;
  rng: Rng;
  seed: number;
  params: ParamMap;
  /** Rasterises text to lit pixels. Absent in non-DOM environments. */
  text?: (value: string) => TextMask;
}

export interface PaletteStop { t: number; color: string }

export interface GeneratorRecipe {
  count: number;
  params?: ParamMap;
  look?: Partial<Look>;
  behaviors?: BehaviorSeed[];
  deformers?: DeformerSeed[];
  camera?: Partial<CameraSettings>;
}
export interface GeneratorDef {
  id: GeneratorId;
  name: string;
  tag: string;
  method: string;
  description: string;
  heavy?: boolean;
  params: ParamDef[];
  recipe: GeneratorRecipe;
  generate: (ctx: GenContext, out: Formation) => void;
}

export type BlendMode3D = "additive" | "alpha" | "screen";
export type ParticleShape = "soft" | "hard" | "ring" | "spark" | "square" | "diamond";
export interface Look {
  palette: PaletteStop[];
  size: number;
  sizeVariation: number;
  sizeAttenuation: boolean;
  opacity: number;
  emission: number;
  shape: ParticleShape;
  softness: number;
  blend: BlendMode3D;
  glow: number;
  glowRadius: number;
  edgeBrightness: number;
  depthFade: number;
  depthColor: number;
  velocityColor: number;
  velocityStretch: number;
  lighting: number;
  lightAzimuth: number;
  lightElevation: number;
  grain: number;
  spin: number;
  trails: number;
  exposure: number;
  background: string;
  transparent: boolean;
  vignette: number;
  autoNormalize: boolean;
}

export type BehaviorType =
  | "home" | "release" | "gravity" | "attractor" | "repeller" | "vortex" | "curl" | "turbulence" | "magnetic"
  | "radial" | "directional" | "wave" | "drag" | "cohesion" | "separation" | "alignment" | "collider" | "custom";
export type Falloff = "none" | "linear" | "smooth" | "inverse";
export type BehaviorBlend = "add" | "replace" | "max";
export type BehaviorAnim = "none" | "pulse" | "sine" | "noise";
export interface Behavior {
  id: string;
  type: BehaviorType;
  enabled: boolean;
  intensity: number;
  scale: number;
  speed: number;
  radius: number;
  falloff: Falloff;
  dir: Vec3;
  center: Vec3;
  blend: BehaviorBlend;
  anim: BehaviorAnim;
  animRate: number;
  animDepth: number;
  aux: number;
  aux2: number;
  expr?: [string, string, string];
}
export type BehaviorSeed = Partial<Behavior> & { type: BehaviorType };

export type DeformerType = "breathe" | "twist" | "bend" | "wave" | "noise" | "rotate" | "stretch";
export interface Deformer {
  id: string;
  type: DeformerType;
  enabled: boolean;
  amount: number;
  scale: number;
  speed: number;
  axis: "x" | "y" | "z";
}
export type DeformerSeed = Partial<Deformer> & { type: DeformerType };

export interface CameraSettings {
  projection: "perspective" | "orthographic";
  fov: number;
  distance: number;
  yaw: number;
  pitch: number;
  target: Vec3;
  near: number;
  far: number;
  autoRotate: number;
}

export interface Layer {
  id: string;
  name: string;
  generator: GeneratorId;
  params: ParamMap;
  seed: number;
  share: number;
  visible: boolean;
  offset: Vec3;
  scale: number;
  rotY: number;
  palette: PaletteStop[] | null;
  sizeMul: number;
  opacityMul: number;
}

export type InteractionTool = "none" | "attract" | "repel" | "swirl" | "vortex" | "push" | "pull" | "stir" | "scatter" | "gather" | "distort";
export interface InteractionSettings {
  tool: InteractionTool;
  radius: number;
  strength: number;
  dragMode: "orbit" | "force";
  clickAction: "burst" | "none";
}
export interface TimelineStep { id: string; generator: GeneratorId; hold: number }
export interface TimelineSettings {
  steps: TimelineStep[];
  mode: "once" | "loop" | "pingpong";
  morph: number;
  easing: EasingName;
}
export interface SimSettings {
  substeps: number;
  damping: number;
  maxSpeed: number;
  massVariation: number;
  massInfluence: number;
}
export type QualityLevel = "low" | "medium" | "high" | "ultra";
export interface QualityProfile {
  maxCount: number;
  dpr: number;
  bloom: number; // 0 off, 1 half-chain, 2 full chain
  maxSubsteps: number;
  neighborStride: number;
}
export const QUALITY: Record<QualityLevel, QualityProfile> = {
  low: { maxCount: 30000, dpr: 1, bloom: 0, maxSubsteps: 1, neighborStride: 12 },
  medium: { maxCount: 80000, dpr: 1.25, bloom: 1, maxSubsteps: 2, neighborStride: 8 },
  high: { maxCount: 160000, dpr: 2, bloom: 2, maxSubsteps: 3, neighborStride: 5 },
  ultra: { maxCount: 300000, dpr: 2, bloom: 2, maxSubsteps: 4, neighborStride: 3 },
};

export interface Project3D {
  version: number;
  name: string;
  count: number;
  layers: Layer[];
  beams: LightBeam[];
  activeLayer: string;
  look: Look;
  behaviors: Behavior[];
  deformers: Deformer[];
  sim: SimSettings;
  camera: CameraSettings;
  interaction: InteractionSettings;
  timeline: TimelineSettings;
  quality: QualityLevel;
}
