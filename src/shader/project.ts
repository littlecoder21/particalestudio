import { GENERATORS, GENERATOR_MAP, clampKnobs, defaultKnobs } from "./generators";
import {
  BLEND_MODES,
  GENERATOR_IDS,
  INTERACTION_MODES,
  MAX_PALETTE,
  MIN_PALETTE,
  RANGES,
  type BlendMode,
  type GeneratorId,
  type InteractionMode,
  type RangeDef,
  type ShaderOverlay,
  type ShaderProject,
} from "./types";

export const HEX_COLOR = /^#[\da-f]{6}$/i;

export const DEFAULT_PROJECT: ShaderProject = {
  name: "Untitled shader",
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

  palette: ["#070a1c", "#26308f", "#4aa8ff", "#e6f4ff"],
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

  overlay: {
    enabled: false,
    generator: "stars",
    knobs: defaultKnobs("stars"),
    blend: "Add",
    opacity: 0.7,
    scale: 1,
    speed: 1,
    shift: 0,
  },
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

function palette(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const colors = value.filter((c): c is string => typeof c === "string" && HEX_COLOR.test(c)).map((c) => c.toLowerCase());
  return colors.length >= MIN_PALETTE ? colors.slice(0, MAX_PALETTE) : [...fallback];
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((n): n is number => typeof n === "number") : [];
}

function normalizeOverlay(value: unknown, base: ShaderOverlay): ShaderOverlay {
  const o = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const generator = oneOf<GeneratorId>(o.generator, GENERATOR_IDS, base.generator);
  return {
    enabled: bool(o.enabled, base.enabled),
    generator,
    knobs: o.knobs === undefined && generator === base.generator ? [...base.knobs] : clampKnobs(generator, numbers(o.knobs)),
    blend: oneOf<BlendMode>(o.blend, BLEND_MODES, base.blend),
    opacity: num(o.opacity, base.opacity, RANGES.overlayOpacity),
    scale: num(o.scale, base.scale, RANGES.overlayScale),
    speed: num(o.speed, base.speed, RANGES.overlaySpeed),
    shift: num(o.shift, base.shift, RANGES.overlayShift),
  };
}

/** Accepts any JSON-ish value and returns a complete, clamped project. Unknown / invalid fields fall back to defaults. */
export function normalizeProject(input: unknown, base: ShaderProject = DEFAULT_PROJECT): ShaderProject {
  if (!input || typeof input !== "object") throw new Error("This is not a shader project.");
  const v = input as Record<string, unknown>;
  const generator = oneOf<GeneratorId>(v.generator, GENERATOR_IDS, base.generator);
  const sameGenerator = generator === base.generator;
  return {
    name: typeof v.name === "string" && v.name.trim() ? v.name.trim().slice(0, 60) : base.name,
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

    palette: palette(v.palette, base.palette),
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

    interaction: oneOf<InteractionMode>(v.interaction, INTERACTION_MODES, base.interaction),
    interactionRadius: num(v.interactionRadius, base.interactionRadius, RANGES.interactionRadius),
    interactionStrength: num(v.interactionStrength, base.interactionStrength, RANGES.interactionStrength),
    ripples: bool(v.ripples, base.ripples),
    idleDrift: bool(v.idleDrift, base.idleDrift),

    overlay: normalizeOverlay(v.overlay, base.overlay),
    playing: bool(v.playing, base.playing),
  };
}

export function cloneProject(p: ShaderProject): ShaderProject {
  return { ...p, knobs: [...p.knobs], palette: [...p.palette], overlay: { ...p.overlay, knobs: [...p.overlay.knobs] } };
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
  const useOverlay = rand() > 0.65;
  const overlayDef = GENERATORS[Math.floor(rand() * GENERATORS.length)] ?? GENERATOR_MAP.stars;
  return normalizeProject({
    ...DEFAULT_PROJECT,
    name: `${def.name} remix`,
    generator: def.id,
    knobs,
    palette: colors.palette,
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
    overlay: {
      ...DEFAULT_PROJECT.overlay,
      enabled: useOverlay,
      generator: overlayDef.id,
      knobs: defaultKnobs(overlayDef.id),
      blend: (["Add", "Screen", "Overlay"] as const)[Math.floor(rand() * 3)] ?? "Add",
      opacity: 0.35 + rand() * 0.4,
    },
  });
}
