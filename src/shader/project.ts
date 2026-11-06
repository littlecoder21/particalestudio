import { GENERATORS, GENERATOR_MAP, clampKnobs, defaultKnobs } from "./generators";
import { evenPositions, normalizeStops } from "./stops";
import { cloneLayer, newBaseLayer, newLayer, normalizeStack } from "./stack";
import { DEFAULT_TOUCH, MODE_MAP, clampParam, clampRule, defaultModeParams } from "./touch";
import {
  BLEND_MODES,
  FALLOFFS,
  GENERATOR_IDS,
  INTERACTION_MODES,
  MASK_PATTERNS,
  MASK_SHAPES,
  MAX_TEXT_LENGTH,
  MAX_TEXT_LINES,
  MAX_PALETTE,
  MAX_RULES,
  MIN_PALETTE,
  RANGES,
  TEXT_FONT_FAMILIES,
  TEXT_FONT_WEIGHTS,
  TRIGGERS,
  type BlendMode,
  type GeneratorId,
  type InteractionMode,
  type MaskPattern,
  type MaskShapeId,
  type MaskSource,
  type RangeDef,
  type ShaderLayer,
  type ShaderMask,
  type ShaderProject,
  type TouchRule,
  type TouchSettings,
} from "./types";
import { validateGeometryDocument } from "../geometry/model";

export const HEX_COLOR = /^#[\da-f]{6}$/i;

export const DEFAULT_MASK: ShaderMask = {
  enabled: false,
  source: { kind: "shape", id: "butterfly" },
  threshold: 0.5,
  invert: false,
  grow: 0,
  edge: 0.1,
  smoke: 0,
  smokeScale: 1.2,
  scale: 0.95,
  x: 0,
  y: 0,
  rotation: 0,
  follow: 0,
  breathe: 0,
  ghost: 0,
  background: "#05060b",
  innerBoost: 0,
  innerHue: 0,
  glow: 0,
  halo: 0.6,
  outline: 0,
  bevel: 0,
  distort: 0,
  flow: 0,
  particles: 0,
  particleSize: 1,
  particleSpeed: 1,
  pattern: "None",
  patternAmount: 0.6,
  patternScale: 1,
  patternAngle: 0,
  patternSpeed: 0.3,
};

const DEFAULT_PALETTE = ["#070a1c", "#26308f", "#4aa8ff", "#e6f4ff"];

export const DEFAULT_PROJECT: ShaderProject = {
  name: "Untitled shader",
  geometryMode: false,
  generator: "fluid",
  knobs: defaultKnobs("fluid"),

  scale: 1,
  speed: 1,
  seed: 0,
  rotation: 0,
  spin: 0,
  warp: 0,
  warpScale: 1,
  swirl: 0,
  symmetry: 0,
  pixelate: 0,

  palette: DEFAULT_PALETTE,
  palettePositions: evenPositions(DEFAULT_PALETTE.length),
  paletteSoft: 1,
  accent: "#a8ecff",
  paletteShift: 0,
  paletteSpeed: 0,
  paletteRepeat: 1,
  contrast: 1,
  exposure: 0,
  saturation: 1,
  hue: 0,
  glow: 0,
  tone: 0,

  relief: 0,
  lightAngle: 45,
  shine: 0.5,

  aberration: 0,
  vignette: 0.3,
  grain: 0.15,
  scanlines: 0,
  posterize: 0,

  interaction: "Stir",
  interactionRadius: 0.33,
  interactionStrength: 1,
  ripples: true,
  idleDrift: true,
  touch: DEFAULT_TOUCH,

  mask: DEFAULT_MASK,

  layers: [newBaseLayer()],
  canvas: "#000000",
  playing: true,
};

function num(value: unknown, fallback: number, range: RangeDef): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(range.max, Math.max(range.min, value))
    : fallback;
}

function oneOf<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((n): n is number => typeof n === "number") : [];
}

/* ───────────── touch ───────────── */

function normalizeTouch(value: unknown, interaction: InteractionMode, base: ShaderProject["touch"]): TouchSettings {
  const t = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const def = MODE_MAP[interaction];
  const rawParams = numbers(t.params);
  const params: [number, number] = [
    t.params === undefined ? defaultModeParams(interaction)[0] : clampParam(def.params[0], rawParams[0] ?? def.params[0]?.value ?? 0),
    t.params === undefined ? defaultModeParams(interaction)[1] : clampParam(def.params[1], rawParams[1] ?? def.params[1]?.value ?? 0),
  ];
  const custom: TouchRule[] = Array.isArray(t.custom)
    ? t.custom.map(clampRule).filter((r): r is TouchRule => r !== null).slice(0, MAX_RULES)
    : base.custom.map((r) => ({ ...r }));
  const falloff = t.falloff === "Auto" ? "Auto" : oneOf(t.falloff, FALLOFFS, base.falloff === "Auto" ? "Gauss" : base.falloff);
  const trigger = t.trigger === "Auto" ? "Auto" : oneOf(t.trigger, TRIGGERS, base.trigger === "Auto" ? "Always" : base.trigger);
  return {
    source: t.source === "custom" ? "custom" : t.source === "mode" ? "mode" : base.source,
    params,
    falloff: t.falloff === undefined ? base.falloff : falloff,
    trigger: t.trigger === undefined ? base.trigger : trigger,
    response: num(t.response, base.response, RANGES.touchResponse),
    trail: num(t.trail, base.trail, RANGES.touchTrail),
    custom,
  };
}

/* ───────────── mask ───────────── */

function normalizeMaskSource(value: unknown, base: MaskSource): MaskSource {
  if (!value || typeof value !== "object") return { ...base };
  const s = value as Record<string, unknown>;
  if (s.kind === "designer") {
    try {
      return { kind: "designer", document: validateGeometryDocument(s.document) };
    } catch {
      return { ...base };
    }
  }
  if (s.kind === "image" && typeof s.data === "string" && s.data.startsWith("data:image/") && s.data.length < 3_000_000) {
    return { kind: "image", name: typeof s.name === "string" ? s.name.slice(0, 40) : "Image", data: s.data };
  }
  if (s.kind === "text") {
    const rawText = typeof s.text === "string"
      ? s.text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, MAX_TEXT_LENGTH)
      : "";
    const text = rawText.split("\n").slice(0, MAX_TEXT_LINES).join("\n");
    const tracking = typeof s.tracking === "number" && Number.isFinite(s.tracking) ? Math.min(20, Math.max(-4, s.tracking)) : 0;
    const lineSpacing = typeof s.lineSpacing === "number" && Number.isFinite(s.lineSpacing) ? Math.min(1.8, Math.max(0.8, s.lineSpacing)) : 1.15;
    return {
      kind: "text",
      text,
      fontFamily: oneOf(s.fontFamily, TEXT_FONT_FAMILIES, "system-ui, sans-serif"),
      fontWeight: oneOf(s.fontWeight, TEXT_FONT_WEIGHTS, "800"),
      italic: bool(s.italic, false),
      tracking,
      lineSpacing,
      align: oneOf(s.align, ["left", "center", "right"] as const, "center"),
    };
  }
  if (s.kind === "shape") return { kind: "shape", id: oneOf<MaskShapeId>(s.id, MASK_SHAPES, "butterfly") };
  return { ...base };
}

export function normalizeMask(value: unknown, base: ShaderMask = DEFAULT_MASK): ShaderMask {
  const m = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    enabled: bool(m.enabled, base.enabled),
    source: normalizeMaskSource(m.source, base.source),
    threshold: num(m.threshold, base.threshold, RANGES.maskThreshold),
    invert: bool(m.invert, base.invert),
    grow: num(m.grow, base.grow, RANGES.maskGrow),
    edge: num(m.edge, base.edge, RANGES.maskEdge),
    smoke: num(m.smoke, base.smoke, RANGES.maskSmoke),
    smokeScale: num(m.smokeScale, base.smokeScale, RANGES.maskSmokeScale),
    scale: num(m.scale, base.scale, RANGES.maskScale),
    x: num(m.x, base.x, RANGES.maskX),
    y: num(m.y, base.y, RANGES.maskY),
    rotation: num(m.rotation, base.rotation, RANGES.maskRotation),
    follow: num(m.follow, base.follow, RANGES.maskFollow),
    breathe: num(m.breathe, base.breathe, RANGES.maskBreathe),
    ghost: num(m.ghost, base.ghost, RANGES.maskGhost),
    background: color(m.background, base.background),
    innerBoost: num(m.innerBoost, base.innerBoost, RANGES.maskInnerBoost),
    innerHue: num(m.innerHue, base.innerHue, RANGES.maskInnerHue),
    glow: num(m.glow, base.glow, RANGES.maskGlow),
    halo: num(m.halo, base.halo, RANGES.maskHalo),
    outline: num(m.outline, base.outline, RANGES.maskOutline),
    bevel: num(m.bevel, base.bevel, RANGES.maskBevel),
    distort: num(m.distort, base.distort, RANGES.maskDistort),
    flow: num(m.flow, base.flow, RANGES.maskFlow),
    particles: num(m.particles, base.particles, RANGES.maskParticles),
    particleSize: num(m.particleSize, base.particleSize, RANGES.maskParticleSize),
    particleSpeed: num(m.particleSpeed, base.particleSpeed, RANGES.maskParticleSpeed),
    pattern: oneOf<MaskPattern>(m.pattern, MASK_PATTERNS, base.pattern),
    patternAmount: num(m.patternAmount, base.patternAmount, RANGES.maskPatternAmount),
    patternScale: num(m.patternScale, base.patternScale, RANGES.maskPatternScale),
    patternAngle: num(m.patternAngle, base.patternAngle, RANGES.maskPatternAngle),
    patternSpeed: num(m.patternSpeed, base.patternSpeed, RANGES.maskPatternSpeed),
  };
}

/* ───────────── layers ───────────── */

/** Projects saved before the layer stack had a single overlay. It becomes the top layer. */
function legacyOverlayLayer(value: unknown): ShaderLayer | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (o.enabled !== true) return null;
  const generator = oneOf<GeneratorId>(o.generator, GENERATOR_IDS, "stars");
  const legacyBlend = o.blend === "Mix" ? "Normal" : o.blend;
  const blend = oneOf<BlendMode>(legacyBlend, BLEND_MODES, "Add");
  const oldScale = typeof o.scale === "number" && o.scale > 0 ? o.scale : 1;
  return newLayer("field", {
    name: "Overlay",
    generator,
    knobs: clampKnobs(generator, numbers(o.knobs)),
    blend,
    keyed: o.blend === "Mix",
    opacity: num(o.opacity, 0.7, RANGES.layerOpacity),
    scale: num(1 / oldScale, 1, RANGES.layerScale),
    speed: num(o.speed, 1, RANGES.layerSpeed),
    shift: num(o.shift, 0, RANGES.layerShift),
    ownColors: false,
  });
}

/** Accepts any JSON-ish value and returns a complete, clamped project. Unknown / invalid fields fall back to defaults. */
export function normalizeProject(input: unknown, base: ShaderProject = DEFAULT_PROJECT): ShaderProject {
  if (!input || typeof input !== "object") throw new Error("This is not a shader project.");
  const v = input as Record<string, unknown>;
  const generator = oneOf<GeneratorId>(v.generator, GENERATOR_IDS, base.generator);
  const geometryMode = bool(v.geometryMode, base.geometryMode);
  const mask = normalizeMask(v.mask, base.mask);
  const sameGenerator = generator === base.generator;
  const interaction = oneOf<InteractionMode>(v.interaction, INTERACTION_MODES, base.interaction);
  const stops = normalizeStops(v.palette, v.palettePositions, { min: MIN_PALETTE, max: MAX_PALETTE }, base.palette);

  let layerSource: unknown = v.layers;
  if (!Array.isArray(layerSource)) {
    const legacy = legacyOverlayLayer(v.overlay);
    layerSource = legacy ? [legacy, newBaseLayer()] : base.layers;
  }

  return {
    name: typeof v.name === "string" && v.name.trim() ? v.name.trim().slice(0, 60) : base.name,
    geometryMode,
    generator,
    knobs: v.knobs === undefined && sameGenerator ? [...base.knobs] : clampKnobs(generator, numbers(v.knobs)),

    scale: num(v.scale, base.scale, RANGES.scale),
    speed: num(v.speed, base.speed, RANGES.speed),
    seed: num(v.seed, base.seed, RANGES.seed),
    rotation: num(v.rotation, base.rotation, RANGES.rotation),
    spin: num(v.spin, base.spin, RANGES.spin),
    warp: num(v.warp, base.warp, RANGES.warp),
    warpScale: num(v.warpScale, base.warpScale, RANGES.warpScale),
    swirl: num(v.swirl, base.swirl, RANGES.swirl),
    symmetry: Math.round(num(v.symmetry, base.symmetry, RANGES.symmetry)),
    pixelate: Math.round(num(v.pixelate, base.pixelate, RANGES.pixelate)),

    palette: stops.colors,
    palettePositions: stops.positions,
    paletteSoft: num(v.paletteSoft, base.paletteSoft, RANGES.paletteSoft),
    accent: color(v.accent, base.accent),
    paletteShift: num(v.paletteShift, base.paletteShift, RANGES.paletteShift),
    paletteSpeed: num(v.paletteSpeed, base.paletteSpeed, RANGES.paletteSpeed),
    paletteRepeat: num(v.paletteRepeat, base.paletteRepeat, RANGES.paletteRepeat),
    contrast: num(v.contrast, base.contrast, RANGES.contrast),
    exposure: num(v.exposure, base.exposure, RANGES.exposure),
    saturation: num(v.saturation, base.saturation, RANGES.saturation),
    hue: num(v.hue, base.hue, RANGES.hue),
    glow: num(v.glow, base.glow, RANGES.glow),
    tone: num(v.tone, base.tone, RANGES.tone),

    relief: num(v.relief, base.relief, RANGES.relief),
    lightAngle: num(v.lightAngle, base.lightAngle, RANGES.lightAngle),
    shine: num(v.shine, base.shine, RANGES.shine),

    aberration: num(v.aberration, base.aberration, RANGES.aberration),
    vignette: num(v.vignette, base.vignette, RANGES.vignette),
    grain: num(v.grain, base.grain, RANGES.grain),
    scanlines: num(v.scanlines, base.scanlines, RANGES.scanlines),
    posterize: Math.round(num(v.posterize, base.posterize, RANGES.posterize)),

    interaction,
    interactionRadius: num(v.interactionRadius, base.interactionRadius, RANGES.interactionRadius),
    interactionStrength: num(v.interactionStrength, base.interactionStrength, RANGES.interactionStrength),
    ripples: bool(v.ripples, base.ripples),
    idleDrift: bool(v.idleDrift, base.idleDrift),
    touch: normalizeTouch(v.touch, interaction, base.touch),

    mask: geometryMode ? { ...mask, enabled: true } : mask,

    layers: normalizeStack(layerSource, newBaseLayer()),
    canvas: color(v.canvas, base.canvas),
    playing: bool(v.playing, base.playing),
  };
}

export function cloneProject(p: ShaderProject): ShaderProject {
  return {
    ...p,
    knobs: [...p.knobs],
    palette: [...p.palette],
    palettePositions: [...p.palettePositions],
    touch: { ...p.touch, params: [...p.touch.params], custom: p.touch.custom.map((r) => ({ ...r })) },
    mask: { ...p.mask, source: { ...p.mask.source } },
    layers: p.layers.map((l) => cloneLayer(l, true)),
  };
}

/* ───────────── randomizer ───────────── */

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** A dark-to-light palette built from a base hue and one of a few harmony rules. */
export function randomPalette(rand: () => number = Math.random): { palette: string[]; accent: string } {
  const hue = rand() * 360;
  const spread = [30, 60, 150, 180][Math.floor(rand() * 4)] ?? 60;
  const count = 4 + Math.floor(rand() * 3);
  const palette: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const h = (hue + spread * t * (rand() > 0.5 ? 1 : -1) + 360) % 360;
    palette.push(hslToHex(h, 0.55 + rand() * 0.35 - t * 0.15, 0.06 + t * (0.55 + rand() * 0.25)));
  }
  return { palette, accent: hslToHex((hue + 180) % 360, 0.5 + rand() * 0.4, 0.8) };
}

/** Surprise me: a random generator with random knobs, palette and a tasteful dose of post effects. */
export function randomProject(rand: () => number = Math.random): ShaderProject {
  const def = GENERATORS[Math.floor(rand() * GENERATORS.length)] ?? GENERATOR_MAP.fluid;
  const knobs = def.knobs.map((k) => {
    const raw = k.min + rand() * (k.max - k.min);
    const stepped = Math.round(raw / k.step) * k.step;
    return Math.min(k.max, Math.max(k.min, Number(stepped.toFixed(4))));
  });
  const colors = randomPalette(rand);
  const overlayDef = GENERATORS[Math.floor(rand() * GENERATORS.length)] ?? GENERATOR_MAP.stars;
  const layers: ShaderLayer[] = [newBaseLayer()];
  if (rand() > 0.65) {
    layers.unshift(
      newLayer("field", {
        generator: overlayDef.id,
        knobs: defaultKnobs(overlayDef.id),
        blend: (["Add", "Screen", "Overlay"] as const)[Math.floor(rand() * 3)] ?? "Add",
        opacity: 0.35 + rand() * 0.4,
      }),
    );
  }
  return normalizeProject({
    ...DEFAULT_PROJECT,
    name: `${def.name} remix`,
    generator: def.id,
    knobs,
    palette: colors.palette,
    palettePositions: undefined,
    accent: colors.accent,
    seed: Math.floor(rand() * 100),
    warp: rand() > 0.6 ? Number((rand() * 0.8).toFixed(2)) : 0,
    swirl: rand() > 0.8 ? Number(((rand() - 0.5) * 3).toFixed(2)) : 0,
    symmetry: rand() > 0.82 ? 2 + Math.floor(rand() * 8) : 0,
    relief: rand() > 0.55 ? Number((0.5 + rand() * 1.5).toFixed(2)) : 0,
    glow: rand() > 0.5 ? Number((rand() * 0.6).toFixed(2)) : 0,
    aberration: rand() > 0.8 ? Number((rand() * 0.4).toFixed(2)) : 0,
    grain: Number((0.1 + rand() * 0.25).toFixed(2)),
    vignette: Number((0.2 + rand() * 0.4).toFixed(2)),
    layers,
  });
}
