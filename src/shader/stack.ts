/**
 * Layer stack.
 *
 * A shader is a stack of layers composited bottom → top with Photoshop-style
 * alpha-aware blend modes. The project's main generator is one entry of the
 * stack ("base"); everything else is an independent layer: another generator,
 * a solid colour, a gradient, noise, grain, a vignette, a glow or a pattern.
 *
 * This module owns the layer model and turns the stack into GLSL. The layer
 * list is stored top-first (like the layer list in the UI), the shader walks it
 * bottom-first.
 */
import { GENERATOR_MAP, clampKnobs, defaultKnobs } from "./generators";
import { evenPositions, normalizeStops } from "./stops";
import {
  BLEND_MODES,
  LAYER_KINDS,
  LAYER_SPACES,
  MAX_LAYERS,
  MAX_LAYER_COLORS,
  MIN_LAYER_COLORS,
  PATTERN_IDS,
  RANGES,
  REGIONS,
  type BlendMode,
  type GeneratorId,
  type Knobs,
  type LayerKind,
  type LayerSpace,
  type PatternId,
  type RangeDef,
  type ShaderLayer,
} from "./types";

const RAD = Math.PI / 180;
const HEX = /^#[\da-f]{6}$/i;

/* ───────────────────────── kind definitions ───────────────────────── */

export interface LayerKnobDef {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** stored in degrees, sent to the GPU in radians */
  deg?: boolean;
}

const kb = (label: string, min: number, max: number, step: number, value: number, deg = false): LayerKnobDef =>
  ({ label, min, max, step, value, deg });

export interface KindDef {
  kind: LayerKind;
  label: string;
  icon: string;
  description: string;
  knobs: LayerKnobDef[];
  /** how many colour pickers make sense: 0 none, 1 a single colour, 2+ a ramp */
  colors: 0 | 1 | 2;
  /** reverse + fade controls */
  gradient: boolean;
  /** "alpha from brightness" makes sense */
  keyable: boolean;
  /** pattern fill toggle */
  fillable: boolean;
  /** fields and noise may borrow the project palette */
  sharesPalette: boolean;
  space: LayerSpace;
  /** the kind responds to the layer speed slider */
  animated: boolean;
  /** the layer adds height for relief lighting */
  height: boolean;
}

export const KIND_DEFS: Record<LayerKind, KindDef> = {
  base: {
    kind: "base", label: "Field", icon: "◎", description: "The project's main generator. Edit it in the Field, Motion and Color tabs.",
    knobs: [], colors: 0, gradient: false, keyable: false, fillable: false, sharesPalette: false, space: "Scene", animated: false, height: true,
  },
  field: {
    kind: "field", label: "Field", icon: "◎", description: "Any of the 24 procedural generators as a layer of its own.",
    knobs: [], colors: 2, gradient: false, keyable: true, fillable: false, sharesPalette: true, space: "Scene", animated: true, height: true,
  },
  solid: {
    kind: "solid", label: "Solid", icon: "■", description: "A flat colour — a background, a tint or a colour-blend layer.",
    knobs: [], colors: 1, gradient: false, keyable: false, fillable: false, sharesPalette: false, space: "Screen", animated: false, height: true,
  },
  linear: {
    kind: "linear", label: "Linear", icon: "↗", description: "A straight gradient with any angle, repeat and mirror.",
    knobs: [kb("Angle", 0, 360, 1, 160, true), kb("Repeat", 1, 8, 0.25, 1), kb("Mirror repeat", 0, 1, 1, 0), kb("Ease", 0, 1, 0.05, 0)],
    colors: 2, gradient: true, keyable: false, fillable: false, sharesPalette: false, space: "Screen", animated: false, height: true,
  },
  radial: {
    kind: "radial", label: "Radial", icon: "◉", description: "A gradient that spreads from a centre point.",
    knobs: [kb("Center X", -0.9, 0.9, 0.01, 0), kb("Center Y", -0.6, 0.6, 0.01, 0), kb("Radius", 0.1, 2, 0.02, 0.8), kb("Squash", 0.3, 3, 0.05, 1)],
    colors: 2, gradient: true, keyable: false, fillable: false, sharesPalette: false, space: "Screen", animated: false, height: true,
  },
  conic: {
    kind: "conic", label: "Conic", icon: "◔", description: "Colours sweep around a centre point like a colour wheel.",
    knobs: [kb("Center X", -0.9, 0.9, 0.01, 0), kb("Center Y", -0.6, 0.6, 0.01, 0), kb("Start angle", 0, 360, 1, 0, true), kb("Repeat", 1, 6, 1, 1)],
    colors: 2, gradient: true, keyable: false, fillable: false, sharesPalette: false, space: "Screen", animated: false, height: true,
  },
  diamond: {
    kind: "diamond", label: "Diamond", icon: "◆", description: "A gradient that grows outward in a diamond or square shape.",
    knobs: [kb("Center X", -0.9, 0.9, 0.01, 0), kb("Center Y", -0.6, 0.6, 0.01, 0), kb("Size", 0.1, 2, 0.02, 0.8), kb("Rotate", 0, 90, 1, 0, true)],
    colors: 2, gradient: true, keyable: false, fillable: false, sharesPalette: false, space: "Screen", animated: false, height: true,
  },
  spiral: {
    kind: "spiral", label: "Spiral", icon: "꩜", description: "Colour arms that wind around a centre point.",
    knobs: [kb("Arms", 1, 8, 1, 3), kb("Twist", 0, 12, 0.1, 4), kb("Center X", -0.9, 0.9, 0.01, 0), kb("Center Y", -0.6, 0.6, 0.01, 0)],
    colors: 2, gradient: true, keyable: false, fillable: false, sharesPalette: false, space: "Scene", animated: true, height: true,
  },
  noise: {
    kind: "noise", label: "Noise", icon: "☁", description: "Soft cloudy noise mapped through a colour ramp.",
    knobs: [kb("Scale", 0.3, 6, 0.05, 1.6), kb("Detail", 0, 1, 0.05, 0.8), kb("Contrast", 0.4, 3, 0.05, 1.4), kb("Flow", 0, 3, 0.05, 0.6)],
    colors: 2, gradient: true, keyable: true, fillable: false, sharesPalette: true, space: "Scene", animated: true, height: true,
  },
  grain: {
    kind: "grain", label: "Grain", icon: "░", description: "Per-pixel film grain. Best with Overlay or Soft Light.",
    knobs: [kb("Amount", 0, 1, 0.02, 0.5), kb("Size", 0.5, 6, 0.1, 1.2), kb("Colour", 0, 1, 0.05, 0), kb("Flicker", 0, 1, 0.05, 0.6)],
    colors: 0, gradient: false, keyable: false, fillable: false, sharesPalette: false, space: "Screen", animated: false, height: false,
  },
  vignette: {
    kind: "vignette", label: "Vignette", icon: "◍", description: "Darkens — or tints — the edges of the frame.",
    knobs: [kb("Radius", 0.2, 1.6, 0.02, 0.7), kb("Softness", 0.02, 1.5, 0.02, 0.55), kb("Roundness", 0.4, 2, 0.05, 1), kb("Shift", -0.5, 0.5, 0.01, 0)],
    colors: 1, gradient: false, keyable: false, fillable: false, sharesPalette: false, space: "Screen", animated: false, height: false,
  },
  glow: {
    kind: "glow", label: "Glow", icon: "☼", description: "A soft light blob that fades to transparent.",
    knobs: [kb("Center X", -0.9, 0.9, 0.01, 0), kb("Center Y", -0.6, 0.6, 0.01, 0), kb("Radius", 0.05, 1.6, 0.02, 0.55), kb("Falloff", 0.6, 4, 0.05, 1.6)],
    colors: 2, gradient: false, keyable: false, fillable: false, sharesPalette: false, space: "Screen", animated: false, height: false,
  },
  pattern: {
    kind: "pattern", label: "Pattern", icon: "▦", description: "Stripes, checks, dots, grids and more — as a backdrop or an overlay.",
    knobs: [kb("Scale", 0.2, 40, 0.05, 1), kb("Thickness", 0.05, 1, 0.01, 0.5), kb("Softness", 0, 1, 0.01, 0.08), kb("Angle", 0, 180, 1, 0, true)],
    colors: 2, gradient: false, keyable: false, fillable: true, sharesPalette: false, space: "Scene", animated: true, height: false,
  },
};

export const PATTERN_LABELS: Record<PatternId, string> = {
  stripes: "Stripes", checker: "Checker", dots: "Dots", grid: "Grid", zigzag: "Zigzag",
  rings: "Rings", waves: "Waves", hatch: "Hatch", triangles: "Triangles", plus: "Plus",
};

/** Groups for the blend-mode menu. */
export const BLEND_GROUPS: Array<{ label: string; modes: BlendMode[] }> = [
  { label: "Basic", modes: ["Normal"] },
  { label: "Darken", modes: ["Darken", "Multiply", "Color Burn", "Linear Burn"] },
  { label: "Lighten", modes: ["Lighten", "Screen", "Color Dodge", "Add"] },
  { label: "Contrast", modes: ["Overlay", "Soft Light", "Hard Light", "Vivid Light", "Linear Light", "Pin Light", "Hard Mix"] },
  { label: "Compare", modes: ["Difference", "Exclusion", "Subtract", "Divide"] },
  { label: "Colour", modes: ["Hue", "Saturation", "Color", "Luminosity"] },
];

/* ───────────────────────── model helpers ───────────────────────── */

let counter = 0;
export const uid = (): string => `l${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const DEFAULT_COLORS: Record<LayerKind, string[]> = {
  base: ["#0b1020", "#4f46e5", "#22d3ee"],
  field: ["#0b1020", "#4f46e5", "#22d3ee"],
  solid: ["#1b2033", "#2a3350"],
  linear: ["#ff7a59", "#7a3cff"],
  radial: ["#ffffff", "#10131c"],
  conic: ["#ff5f9e", "#7a5cff", "#22d3ee"],
  diamond: ["#fbbf24", "#f43f5e", "#1e1b4b"],
  spiral: ["#22d3ee", "#7c3aed"],
  noise: ["#0b1020", "#3a4fd6", "#cfe3ff"],
  grain: ["#ffffff", "#000000"],
  vignette: ["#000000", "#000000"],
  glow: ["#6d5bff", "#ffffff"],
  pattern: ["#0b0f1a", "#ffffff"],
};

export function layerKnobDefs(layer: Pick<ShaderLayer, "kind" | "generator">): LayerKnobDef[] {
  if (layer.kind === "field" || layer.kind === "base") return [...GENERATOR_MAP[layer.generator].knobs];
  return KIND_DEFS[layer.kind].knobs;
}

function kindKnobs(kind: LayerKind, generator: GeneratorId): Knobs {
  if (kind === "field" || kind === "base") return defaultKnobs(generator);
  const defs = KIND_DEFS[kind].knobs;
  return [defs[0]?.value ?? 0, defs[1]?.value ?? 0, defs[2]?.value ?? 0, defs[3]?.value ?? 0];
}

export function defaultLayerKnobs(layer: Pick<ShaderLayer, "kind" | "generator">): Knobs {
  return kindKnobs(layer.kind, layer.generator);
}

export function newLayer(kind: LayerKind, over: Partial<ShaderLayer> = {}): ShaderLayer {
  const def = KIND_DEFS[kind];
  const generator = over.generator ?? "fluid";
  const layer: ShaderLayer = {
    id: uid(),
    name: kind === "field" ? GENERATOR_MAP[generator].name : def.label,
    kind,
    visible: true,
    blend: "Normal",
    opacity: 1,
    region: "All",
    space: def.space,
    scale: 1,
    speed: 1,
    rotation: 0,
    x: 0,
    y: 0,
    generator,
    knobs: kindKnobs(kind, generator),
    pattern: "stripes",
    colors: [...DEFAULT_COLORS[kind]],
    positions: evenPositions(DEFAULT_COLORS[kind].length),
    ownColors: kind !== "field",
    shift: 0,
    reverse: false,
    fade: 0,
    keyed: false,
    fill: true,
    ...over,
  };
  const colors = [...layer.colors];
  const positions = layer.positions.length === colors.length ? [...layer.positions] : evenPositions(colors.length);
  return { ...layer, knobs: [...layer.knobs], colors, positions };
}

export function newBaseLayer(over: Partial<ShaderLayer> = {}): ShaderLayer {
  return newLayer("base", { name: "Main field", id: "base", ownColors: false, ...over });
}

export function cloneLayer(layer: ShaderLayer, keepId = false): ShaderLayer {
  return { ...layer, id: keepId ? layer.id : uid(), knobs: [...layer.knobs], colors: [...layer.colors], positions: [...layer.positions] };
}

function num(value: unknown, fallback: number, range: RangeDef): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, value)) : fallback;
}

function oneOf<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Accepts anything and returns a complete, clamped layer — or null if it isn't one. */
export function normalizeLayer(raw: unknown): ShaderLayer | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const kind = oneOf<LayerKind>(v.kind, LAYER_KINDS, "field");
  const generator = oneOf<GeneratorId>(v.generator, Object.keys(GENERATOR_MAP) as GeneratorId[], "fluid");
  const base = newLayer(kind, { generator });

  const rawKnobs = Array.isArray(v.knobs) ? v.knobs.filter((n): n is number => typeof n === "number") : [];
  let knobs: Knobs;
  if (kind === "field" || kind === "base") {
    knobs = v.knobs === undefined ? base.knobs : clampKnobs(generator, rawKnobs);
  } else {
    const defs = KIND_DEFS[kind].knobs;
    const pick = (i: number): number => {
      const def = defs[i];
      const value = rawKnobs[i];
      if (!def) return 0;
      return typeof value === "number" && Number.isFinite(value) ? Math.min(def.max, Math.max(def.min, value)) : def.value;
    };
    knobs = [pick(0), pick(1), pick(2), pick(3)];
  }

  const stops = normalizeStops(v.colors, v.positions, { min: MIN_LAYER_COLORS, max: MAX_LAYER_COLORS }, base.colors);

  const legacyBlend = v.blend === "Mix" ? "Normal" : v.blend;

  return {
    id: typeof v.id === "string" && v.id ? v.id.slice(0, 40) : uid(),
    name: typeof v.name === "string" && v.name.trim() ? v.name.trim().slice(0, 40) : base.name,
    kind,
    visible: typeof v.visible === "boolean" ? v.visible : true,
    blend: oneOf<BlendMode>(legacyBlend, BLEND_MODES, "Normal"),
    opacity: num(v.opacity, 1, RANGES.layerOpacity),
    region: oneOf(v.region, REGIONS, "All"),
    space: oneOf<LayerSpace>(v.space, LAYER_SPACES, base.space),
    scale: num(v.scale, 1, RANGES.layerScale),
    speed: num(v.speed, 1, RANGES.layerSpeed),
    rotation: num(v.rotation, 0, RANGES.layerRotation),
    x: num(v.x, 0, RANGES.layerOffset),
    y: num(v.y, 0, RANGES.layerOffset),
    generator,
    knobs,
    pattern: oneOf<PatternId>(v.pattern, PATTERN_IDS, "stripes"),
    colors: stops.colors,
    positions: stops.positions,
    ownColors: typeof v.ownColors === "boolean" ? v.ownColors : base.ownColors,
    shift: num(v.shift, 0, RANGES.layerShift),
    reverse: typeof v.reverse === "boolean" ? v.reverse : false,
    fade: num(v.fade, 0, RANGES.layerFade),
    keyed: typeof v.keyed === "boolean" ? v.keyed : false,
    fill: typeof v.fill === "boolean" ? v.fill : true,
  };
}

/** Exactly one base layer, at most MAX_LAYERS entries, unique ids. */
export function normalizeStack(raw: unknown, fallbackBase: ShaderLayer): ShaderLayer[] {
  const list = Array.isArray(raw) ? raw.map(normalizeLayer).filter((l): l is ShaderLayer => l !== null) : [];
  const seen = new Set<string>();
  const out: ShaderLayer[] = [];
  let hasBase = false;
  for (const layer of list) {
    if (layer.kind === "base") {
      if (hasBase) continue;
      hasBase = true;
      layer.id = "base";
      layer.name = layer.name || "Main field";
    }
    while (seen.has(layer.id)) layer.id = uid();
    seen.add(layer.id);
    out.push(layer);
    if (out.length >= MAX_LAYERS) break;
  }
  if (!hasBase) {
    if (out.length >= MAX_LAYERS) out.pop();
    out.push(fallbackBase);
  }
  return out;
}

/** Visible layers, bottom first — the order the shader composites them in. */
export function stackOrder(layers: readonly ShaderLayer[]): ShaderLayer[] {
  return [...layers].reverse().filter((l) => l.visible).slice(0, MAX_LAYERS);
}

export function usesOwnColors(layer: ShaderLayer): boolean {
  if (layer.kind === "base") return false;
  return KIND_DEFS[layer.kind].sharesPalette ? layer.ownColors : true;
}

/* ───────────────────────── blend modes ───────────────────────── */

export const blendFnName = (mode: BlendMode): string => `bm${BLEND_MODES.indexOf(mode)}`;

const BLEND_BODY: Record<BlendMode, string> = {
  Normal: "return b;",
  Multiply: "return a * b;",
  Screen: "return 1. - (1. - a) * (1. - b);",
  Overlay: "return mix(2. * a * b, 1. - 2. * (1. - a) * (1. - b), step(.5, a));",
  Darken: "return min(a, b);",
  Lighten: "return max(a, b);",
  "Color Dodge": "return min(a / max(1. - b, 1e-3), vec3(1.));",
  "Color Burn": "return 1. - min((1. - a) / max(b, 1e-3), vec3(1.));",
  "Hard Light": "return mix(2. * a * b, 1. - 2. * (1. - a) * (1. - b), step(.5, b));",
  "Soft Light": "vec3 d = mix(((16. * a - 12.) * a + 4.) * a, sqrt(a), step(.25, a)); return mix(a - (1. - 2. * b) * a * (1. - a), a + (2. * b - 1.) * (d - a), step(.5, b));",
  Difference: "return abs(a - b);",
  Exclusion: "return a + b - 2. * a * b;",
  Add: "return a + b;",
  Subtract: "return max(a - b, 0.);",
  Divide: "return min(a / max(b, 1e-3), vec3(1.));",
  "Linear Burn": "return max(a + b - 1., 0.);",
  "Linear Light": "return clamp(a + 2. * b - 1., 0., 1.);",
  "Vivid Light": "return mix(1. - min((1. - a) / max(2. * b, 1e-3), vec3(1.)), min(a / max(2. * (1. - b), 1e-3), vec3(1.)), step(.5, b));",
  "Pin Light": "return mix(min(a, 2. * b), max(a, 2. * b - 1.), step(.5, b));",
  "Hard Mix": "return step(vec3(1.), a + b);",
  Hue: "return setLum(setSat(b, sat3(a)), lum3(a));",
  Saturation: "return setLum(setSat(a, sat3(b)), lum3(a));",
  Color: "return setLum(b, lum3(a));",
  Luminosity: "return setLum(a, lum3(b));",
};

const BLEND_HELPERS = /* glsl */`
float lum3(vec3 c){ return dot(c, vec3(.3, .59, .11)); }
float sat3(vec3 c){ return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }
vec3 clipColor(vec3 c){
  float l = lum3(c), n = min(min(c.r, c.g), c.b), x = max(max(c.r, c.g), c.b);
  if (n < 0.) c = l + (c - l) * l / (l - n + 1e-5);
  if (x > 1.) c = l + (c - l) * (1. - l) / (x - l + 1e-5);
  return c;
}
vec3 setLum(vec3 c, float l){ return clipColor(c + (l - lum3(c))); }
vec3 setSat(vec3 c, float s){
  float mn = min(min(c.r, c.g), c.b), mx = max(max(c.r, c.g), c.b);
  return mx > mn ? (c - mn) * s / (mx - mn) : vec3(0.);
}
`;

export function blendLibrary(modes: ReadonlySet<BlendMode>): string {
  const used = [...modes].filter((m) => m !== "Normal");
  if (used.length === 0) return "";
  const fns = used.map((m) => `vec3 ${blendFnName(m)}(vec3 a, vec3 b){ ${BLEND_BODY[m]} }`);
  return `${BLEND_HELPERS}\n${fns.join("\n")}\n`;
}

/* ───────────────────────── GLSL ───────────────────────── */

export const fieldFnName = (id: GeneratorId): string => `fld_${id}`;

const PATTERN_GLSL: Record<PatternId, string> = {
  stripes: "v = 1. - smoothstep(K.y - sft, K.y + sft, abs(fract(pq.x) - .5) * 2.);",
  checker:
    "float e = max(sft * .25, fwidth(pq.x) * .5 + 1e-4); float sx = smoothstep(.5 - e, .5 + e, fract(pq.x * .5)); float sy = smoothstep(.5 - e, .5 + e, fract(pq.y * .5)); v = abs(sx - sy);",
  dots: "v = 1. - smoothstep(K.y * .5 - sft * .5, K.y * .5 + sft * .5 + 1e-3, length(fract(pq) - .5));",
  grid: "vec2 g = abs(fract(pq) - .5) * 2.; v = smoothstep(1. - K.y * .5 - sft, 1. - K.y * .5 + sft + 1e-3, max(g.x, g.y));",
  zigzag: "float zz = pq.y + abs(fract(pq.x) - .5) * 1.4; v = 1. - smoothstep(K.y - sft, K.y + sft, abs(fract(zz) - .5) * 2.);",
  rings: "float rr = length(pq); v = 1. - smoothstep(K.y - sft, K.y + sft, abs(fract(rr) - .5) * 2.);",
  waves: "float wy = pq.y + sin(pq.x * 1.4 + lt * .5) * .35; v = 1. - smoothstep(K.y - sft, K.y + sft, abs(fract(wy) - .5) * 2.);",
  hatch:
    "float h1 = 1. - smoothstep(K.y - sft, K.y + sft, abs(fract(pq.x + pq.y) - .5) * 2.); float h2 = 1. - smoothstep(K.y - sft, K.y + sft, abs(fract(pq.x - pq.y) - .5) * 2.); v = max(h1, h2);",
  triangles: "vec2 sk = pq + (pq.x + pq.y) * .366; vec2 f2 = fract(sk); v = smoothstep(-sft * .2, sft * .2 + 1e-3, f2.x - f2.y);",
  plus:
    "vec2 g = abs(fract(pq) - .5); v = (1. - smoothstep(K.y * .25 - sft * .25, K.y * .25 + sft * .25 + 1e-3, min(g.x, g.y))) * (1. - smoothstep(.3, .34, max(g.x, g.y)));",
};

function kindCode(layer: ShaderLayer, j: number, generator: GeneratorId, geometryMode: boolean): string {
  const K = `uLK[${j}]`;
  const rev = `uLF[${j}].y`;
  const fade = `uLF[${j}].x`;
  const keyed = `uLF[${j}].z`;
  const fill = `uLF[${j}].w`;
  switch (layer.kind) {
    case "base":
      if (geometryMode) {
        return `
    float depth = clamp(mk.z, 0., 1.);
    float bands = .5 + .5 * cos(depth * 30. - lt * 1.2);
    float fv = clamp(depth * .8 + bands * .2, 0., 1.);
    r = vec4(ramp(fv), shape); lh = depth; lhole = 0.;`;
      }
      return `
    gHas = 0.;
    vec4 f = ${fieldFnName(generator)}(q, lt, uK);
    vec3 c = mix(ramp(clamp(f.x, 0., 1.)), gCol, gHas);
    c = mix(c, uAccent, clamp(f.y, 0., 1.));
    r = vec4(c, 1.); lh = f.z; lhole = f.w;`;
    case "field":
      return `
    gHas = 0.;
    vec4 f = ${fieldFnName(layer.generator)}(q, lt, ${K});
    float fv = clamp(f.x, 0., 1.);
    vec3 c = mix(ramp(mix(fv, 1. - fv, ${rev})), gCol, gHas);
    c = mix(c, uAccent, clamp(f.y, 0., 1.));
    r = vec4(c, mix(1., fv, ${keyed})); lh = f.z; lhole = f.w;`;
    case "solid":
      return `r = vec4(gPal[0], 1.);`;
    case "linear":
      return `
    vec2 dir = vec2(sin(${K}.x), cos(${K}.x));
    float ext = .5 * (abs(dir.x) * uRes.x / uRes.y + abs(dir.y));
    float v = dot(q, dir) / (2. * ext) + .5;
    float rv = v * ${K}.y;
    rv = ${K}.z > .5 ? 1. - abs(1. - mod(rv, 2.)) : (${K}.y > 1.001 ? fract(rv) : clamp(rv, 0., 1.));
    rv = mix(rv, rv * rv * (3. - 2. * rv), ${K}.w);
    r = vec4(ramp(mix(rv, 1. - rv, ${rev})), 1. - ${fade} * rv);`;
    case "radial":
      return `
    vec2 d = q - ${K}.xy; d.y /= max(${K}.w, .05);
    float v = clamp(length(d) / max(${K}.z, .02), 0., 1.);
    r = vec4(ramp(mix(v, 1. - v, ${rev})), 1. - ${fade} * v);`;
    case "conic":
      return `
    vec2 d = q - ${K}.xy;
    float an = (atan(d.y, d.x) - ${K}.z) / TAU;
    float v = 1. - abs(1. - 2. * fract(an * ${K}.w));
    r = vec4(ramp(mix(v, 1. - v, ${rev})), 1. - ${fade} * v);`;
    case "diamond":
      return `
    vec2 d = rot(${K}.w) * (q - ${K}.xy);
    float v = clamp((abs(d.x) + abs(d.y)) / max(${K}.z, .02), 0., 1.);
    r = vec4(ramp(mix(v, 1. - v, ${rev})), 1. - ${fade} * v);`;
    case "spiral":
      return `
    vec2 d = q - ${K}.zw;
    float an = atan(d.y, d.x) / TAU;
    float v = 1. - abs(1. - 2. * fract(an * ${K}.x + length(d) * ${K}.y - lt * .1));
    r = vec4(ramp(mix(v, 1. - v, ${rev})), 1. - ${fade} * v);`;
    case "noise":
      return `
    vec2 nq = q * ${K}.x * 2. + vec2(lt * .05 * ${K}.w, -lt * .04 * ${K}.w);
    float n = mix(gnoise(nq * 1.3), fbm(nq), ${K}.y);
    float v = clamp(.5 + n * ${K}.z * 1.4, 0., 1.);
    r = vec4(ramp(mix(v, 1. - v, ${rev})), mix(1., v, ${keyed}) * (1. - ${fade} * v));`;
    case "grain":
      return `
    vec2 gp = floor(gl_FragCoord.xy / max(${K}.y, .5));
    float ft = ${K}.w > .001 ? floor(uTime * (2. + 22. * ${K}.w)) : 0.;
    float n1 = hash21(gp + ft * 17.31), n2 = hash21(gp + 5.7 + ft * 3.13), n3 = hash21(gp + 11.3 + ft * 7.71);
    r = vec4(mix(vec3(n1), vec3(n1, n2, n3), ${K}.z), ${K}.x);`;
    case "vignette":
      return `
    vec2 d = q; d.y += ${K}.w;
    float rr = length(d * vec2(1., 1. / max(${K}.z, .3)));
    r = vec4(gPal[0], smoothstep(${K}.x, ${K}.x + max(${K}.y, .02), rr));`;
    case "glow":
      return `
    float g = exp(-pow(max(length(q - ${K}.xy) / max(${K}.z, .02), 1e-4), ${K}.w) * 2.2);
    r = vec4(ramp(mix(g, 1. - g, ${rev})), g);`;
    case "pattern":
      return `
    vec4 K = ${K};
    vec2 pq = rot(K.w) * q * K.x * 8.;
    float sft = max(K.z, .015);
    float v = 0.;
    ${PATTERN_GLSL[layer.pattern]}
    float pv = mix(v, 1. - v, ${rev});
    r = mix(vec4(ramp(1.), v), vec4(ramp(pv), 1.), ${fill});`;
  }
}

function ownPaletteCode(j: number): string {
  const lines = [];
  for (let i = 0; i < MAX_LAYER_COLORS; i++) lines.push(`gPal[${i}] = uLP[${j * MAX_LAYER_COLORS + i}];`);
  lines.push(`gPal[5] = gPal[4];`);
  lines.push(`gPos[0] = uLQ[${j * 2}].x; gPos[1] = uLQ[${j * 2}].y; gPos[2] = uLQ[${j * 2}].z; gPos[3] = uLQ[${j * 2}].w; gPos[4] = uLQ[${j * 2 + 1}].x; gPos[5] = 1.;`);
  lines.push(`gPalN = uLB[${j}].w; gRep = 1.; gSh = uLB[${j}].z; gSoft = 1.;`);
  return lines.join(" ");
}

export interface StackGlsl {
  /** statements for scene(): declare + composite every layer into cb / ab / h / hole */
  code: string;
  generators: GeneratorId[];
  modes: Set<BlendMode>;
}

/**
 * GLSL that composites the stack. `layers` is bottom-first (see stackOrder).
 * It expects `p`, `uv`, `t` and — when a mask is present — `cov` to exist, and it
 * declares and fills `cb`, `ab`, `h` and `hole`.
 */
export function buildStackGlsl(layers: ShaderLayer[], baseGenerator: GeneratorId, hasMask: boolean, geometryMode = false): StackGlsl {
  const generators = new Set<GeneratorId>();
  const modes = new Set<BlendMode>();
  const blocks: string[] = [];

  layers.forEach((layer, j) => {
    const def = KIND_DEFS[layer.kind];
    if (layer.kind === "base" && !geometryMode) generators.add(baseGenerator);
    if (layer.kind === "field") generators.add(layer.generator);
    modes.add(layer.blend);

    const palette = usesOwnColors(layer) ? ownPaletteCode(j) : `palProject(uLB[${j}].z);`;
    const src = layer.kind === "base" ? "p" : layer.space === "Scene" ? "p" : "uv";
    const coords =
      layer.kind === "base"
        ? "vec2 q = p; float lt = t;"
        : `vec2 q = rot(uLA[${j}].w) * (${src} - uLB[${j}].xy) / max(uLA[${j}].y, .01); float lt = t * uLA[${j}].z;`;
    const region =
      hasMask && layer.region === "Inside" ? " * cov" : hasMask && layer.region === "Outside" ? " * (1. - cov)" : "";

    const compose =
      layer.blend === "Normal"
        ? "float ar = al + ab * (1. - al); cb = ar > 1e-5 ? mix(cb, r.rgb, al / ar) : r.rgb; ab = ar;"
        : `vec3 bl = ${blendFnName(layer.blend)}(cb, r.rgb); float ar = al + ab * (1. - al); cb = ar > 1e-5 ? (1. - al / ar) * cb + (al / ar) * ((1. - ab) * r.rgb + ab * bl) : r.rgb; ab = ar;`;

    const heightWeight = layer.blend === "Normal" ? "1." : ".5";
    const height = def.height ? `h = mix(h, lh, al * ${heightWeight}); hole = max(hole, lhole * al);` : "";

    blocks.push(`  { // ${layer.kind}${layer.kind === "field" ? ` · ${layer.generator}` : ""}${layer.kind === "pattern" ? ` · ${layer.pattern}` : ""}
    ${palette}
    ${coords}
    vec4 r = vec4(0.); float lh = 0.; float lhole = 0.;
    ${kindCode(layer, j, baseGenerator, geometryMode)}
    float al = clamp(r.a, 0., 1.) * uLA[${j}].x${region};
    ${compose}
    ${height}
  }`);
  });

  const code = `  vec3 cb = vec3(0.); float ab = 0.; float h = 0.; float hole = 0.;
${blocks.join("\n")}
  palProject(0.);`;
  return { code, generators: [...generators], modes };
}

export const STACK_GLSL_HELPERS = /* glsl */`
void palProject(float shift){
  for (int i = 0; i < 6; i++){ gPal[i] = uPal[i]; gPos[i] = uPalPos[i]; }
  gPalN = uPalN; gRep = uPalRep; gSh = uPalShift + gPalOff + shift; gSoft = uPalSoft;
}
`;

/** Everything about the stack that changes the GLSL (as opposed to plain uniform values). */
export function stackSignature(layers: ShaderLayer[], hasMask: boolean, geometryMode = false): string {
  return layers
    .map((l) =>
      [
        l.kind,
        l.kind === "field" ? l.generator : "",
        l.kind === "pattern" ? l.pattern : "",
        BLEND_MODES.indexOf(l.blend),
        l.kind === "base" ? "" : l.space === "Scene" ? "s" : "f",
        l.kind === "base" && geometryMode ? "g" : "",
        hasMask ? l.region[0] : "",
        usesOwnColors(l) ? "o" : "p",
      ].join("."),
    )
    .join("|");
}

/* ───────────────────────── uniforms ───────────────────────── */

function rgb(hex: string): [number, number, number] {
  const value = HEX.test(hex) ? hex : "#000000";
  return [parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255];
}

/** uLA / uLB / uLK / uLF (vec4 × 8) and uLP (vec3 × 40) for a bottom-first layer list. */
export function stackUniforms(layers: ShaderLayer[]): Array<[string, number[]]> {
  const la: number[] = [];
  const lb: number[] = [];
  const lk: number[] = [];
  const lf: number[] = [];
  const lp: number[] = [];
  const lq: number[] = [];
  for (let j = 0; j < MAX_LAYERS; j++) {
    const l = layers[j];
    if (!l) {
      la.push(0, 1, 1, 0);
      lb.push(0, 0, 0, 2);
      lk.push(0, 0, 0, 0);
      lf.push(0, 0, 0, 0);
      for (let i = 0; i < MAX_LAYER_COLORS; i++) lp.push(0, 0, 0);
      lq.push(0, 1, 1, 1, 1, 1, 1, 1);
      continue;
    }
    const defs = layerKnobDefs(l);
    la.push(l.opacity, l.scale, l.speed, l.rotation * RAD);
    lb.push(l.x, l.y, l.shift, Math.max(MIN_LAYER_COLORS, Math.min(MAX_LAYER_COLORS, l.colors.length)));
    lk.push(...l.knobs.map((value, i) => (l.kind !== "field" && l.kind !== "base" && defs[i] && (defs[i] as LayerKnobDef).deg ? value * RAD : value)));
    lf.push(l.fade, l.reverse ? 1 : 0, l.keyed ? 1 : 0, l.fill ? 1 : 0);
    for (let i = 0; i < MAX_LAYER_COLORS; i++) lp.push(...rgb(l.colors[Math.min(i, l.colors.length - 1)] ?? "#000000"));
    const even = evenPositions(l.colors.length);
    const pos = (i: number): number => (i < l.colors.length ? (l.positions[i] ?? even[i] ?? 1) : 1);
    lq.push(pos(0), pos(1), pos(2), pos(3), pos(4), 1, 1, 1);
  }
  return [
    ["uLA[0]", la],
    ["uLB[0]", lb],
    ["uLK[0]", lk],
    ["uLF[0]", lf],
    ["uLP[0]", lp],
    ["uLQ[0]", lq],
  ];
}

/** One-line description for the layer list. */
export function layerSummary(layer: ShaderLayer): string {
  const def = KIND_DEFS[layer.kind];
  const what =
    layer.kind === "field" ? GENERATOR_MAP[layer.generator].name : layer.kind === "pattern" ? PATTERN_LABELS[layer.pattern] : def.label;
  const bits = [what];
  if (layer.blend !== "Normal") bits.push(layer.blend);
  if (layer.opacity < 0.995) bits.push(`${Math.round(layer.opacity * 100)}%`);
  return bits.join(" · ");
}
