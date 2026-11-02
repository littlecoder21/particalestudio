/**
 * Touch engine.
 *
 * Every pointer behaviour — the 25 predefined modes and anything built in the
 * custom builder — is a short stack of *rules*. A rule is one effect (pull,
 * swirl, wave, hue shift …) with a falloff, a trigger and a source. The GLSL
 * for the active rules is generated at build time, so only the effects that are
 * really used cost anything on the GPU.
 */
import {
  INTERACTION_MODES,
  MAX_RULES,
  type Falloff,
  type InteractionMode,
  type ShaderProject,
  type TouchEffect,
  type TouchRule,
  type TouchSettings,
  type Trigger,
} from "./types";

const RAD = Math.PI / 180;

export interface TouchParam {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** multiplier applied when the value is sent to the GPU (for example degrees → radians) */
  scale?: number;
  unit?: string;
}

const prm = (label: string, min: number, max: number, step: number, value: number, extra: Partial<TouchParam> = {}): TouchParam =>
  ({ label, min, max, step, value, ...extra });

/* ───────────────────────── effects ───────────────────────── */

export type EffectKind = "warp" | "pre" | "post" | "prism";

export interface EffectDef {
  id: TouchEffect;
  label: string;
  kind: EffectKind;
  icon: string;
  description: string;
  p1?: TouchParam;
  p2?: TouchParam;
  /**
   * Body of the effect. Available names: `p` (warp only: the position being bent),
   * `col` (post only), `dm` (offset from the centre), `c` (centre), `w` (falloff 0..1),
   * `a` (strength × trigger), `p1`, `p2`, `R` (radius), `o` (prism only).
   */
  glsl: string;
}

export const EFFECTS: Record<TouchEffect, EffectDef> = {
  Pull: {
    id: "Pull", label: "Pull", kind: "warp", icon: "⊙",
    description: "Samples the field closer to the pointer — a magnifying bulge.",
    glsl: "p -= dm * w * .55 * a;",
  },
  Push: {
    id: "Push", label: "Push", kind: "warp", icon: "◌",
    description: "Samples the field farther away — the surface is pushed aside.",
    glsl: "p += dm * w * .55 * a;",
  },
  Swirl: {
    id: "Swirl", label: "Swirl", kind: "warp", icon: "↻",
    description: "A tangential push that grows with pointer speed.",
    p1: prm("Motion boost", 0, 1.5, 0.05, 0.6),
    glsl: "p += vec2(-dm.y, dm.x) * w * a * (.12 + p1 * uStir);",
  },
  Twist: {
    id: "Twist", label: "Twist", kind: "warp", icon: "⟲",
    description: "Rotates the field around the pointer like a turned dial.",
    glsl: "p = c + rot(a * w * 2.2) * dm;",
  },
  Wave: {
    id: "Wave", label: "Wave", kind: "warp", icon: "◠",
    description: "Concentric ripples travelling away from the pointer.",
    p1: prm("Frequency", 4, 50, 1, 18),
    p2: prm("Speed", 0, 10, 0.25, 3),
    glsl: "float r = length(dm) + 1e-4; p += dm / r * sin(r * p1 - uTime * p2) * w * a * .06;",
  },
  Noise: {
    id: "Noise", label: "Noise", kind: "warp", icon: "≋",
    description: "Churns the field with flowing turbulence.",
    p1: prm("Scale", 1, 14, 0.5, 5),
    p2: prm("Speed", 0, 4, 0.1, 1),
    glsl: "p += vec2(fbm(p * p1 + vec2(0., uTime * p2 * .3)), fbm(p * p1 + vec2(5.2, 1.3) - uTime * p2 * .25)) * w * a * .5;",
  },
  Shear: {
    id: "Shear", label: "Shear", kind: "warp", icon: "⇢",
    description: "Drags the field along with the pointer's velocity.",
    glsl: "p -= uVel * w * a * .14;",
  },
  Mosaic: {
    id: "Mosaic", label: "Mosaic", kind: "warp", icon: "▦",
    description: "Snaps the field into square tiles near the pointer.",
    p1: prm("Cells", 6, 90, 1, 28),
    glsl: "vec2 mq = (floor(p * p1) + .5) / p1; p = mix(p, mq, smoothstep(.05, .5, w) * clamp(a, 0., 1.));",
  },
  Mirror: {
    id: "Mirror", label: "Mirror", kind: "warp", icon: "⫴",
    description: "Reflects the field across a line through the pointer.",
    p1: prm("Axis angle", 0, 180, 1, 0, { scale: RAD, unit: "°" }),
    glsl: "vec2 mm = rot(-p1) * dm; mm.x = abs(mm.x); mm = rot(p1) * mm; p = mix(p, c + mm, smoothstep(.05, .5, w) * clamp(a, 0., 1.));",
  },
  Kaleido: {
    id: "Kaleido", label: "Kaleido", kind: "warp", icon: "✲",
    description: "Folds space into mirrored segments around the pointer.",
    p1: prm("Segments", 2, 16, 1, 6),
    p2: prm("Spin", -2, 2, 0.1, 0.4),
    glsl: "float ks = max(floor(p1 + .5), 2.); float ka = atan(dm.y, dm.x) + p2 * uTime * .25; float kseg = TAU / ks; ka = abs(mod(ka, kseg) - kseg * .5); p = mix(p, c + length(dm) * vec2(cos(ka), sin(ka)), smoothstep(.05, .5, w) * clamp(a, 0., 1.));",
  },
  Glitch: {
    id: "Glitch", label: "Glitch", kind: "warp", icon: "▤",
    description: "Slices the field into bands that jump sideways.",
    p1: prm("Bands", 8, 140, 1, 44),
    p2: prm("Rate", 1, 30, 1, 10),
    glsl: "float gr = floor(p.y * p1); float gt = floor(uTime * p2); p.x += (hash11(gr * 7.13 + gt) - .5) * step(.55, hash11(gr * 3.7 + gt * 1.3)) * w * a * .6;",
  },
  Pulse: {
    id: "Pulse", label: "Pulse", kind: "warp", icon: "◯",
    description: "Rings that expand outward from the pointer, again and again.",
    p1: prm("Ring width", 0.3, 3, 0.05, 1),
    p2: prm("Rate", 0.2, 4, 0.1, 1),
    glsl: "float r = length(dm) + 1e-4; float ph = fract(uTime * p2 * .3); float x = (r - ph * R * 2.4) / (R * .16 * p1); p += dm / r * exp(-x * x) * (1. - ph) * w * a * .22;",
  },
  Palette: {
    id: "Palette", label: "Palette", kind: "pre", icon: "♨",
    description: "Slides the colour ramp near the pointer, like heat.",
    p1: prm("Palette push", -1, 1, 0.02, 0.5),
    glsl: "gPalOff += w * a * p1;",
  },
  Light: {
    id: "Light", label: "Light", kind: "post", icon: "✦",
    description: "The pointer becomes a light source that moves the highlight.",
    glsl: "col *= mix(1., .5 + 1.2 * w, clamp(a, 0., 1.));",
  },
  Spotlight: {
    id: "Spotlight", label: "Spotlight", kind: "post", icon: "◐",
    description: "Darkens everything except a pool around the pointer.",
    glsl: "col *= mix(1., .06 + .94 * w, clamp(a, 0., 1.));",
  },
  Glow: {
    id: "Glow", label: "Glow", kind: "post", icon: "☼",
    description: "Adds a soft bloom of accent colour.",
    p1: prm("Scene tint", 0, 1, 0.02, 0.2),
    glsl: "col += mix(uAccent, col * 2., p1) * w * a * .6;",
  },
  Hue: {
    id: "Hue", label: "Hue", kind: "post", icon: "◑",
    description: "Rotates the colours near the pointer.",
    p1: prm("Hue shift", -180, 180, 1, 100, { scale: RAD, unit: "°" }),
    glsl: "col = hueShift(col, p1 * w * clamp(a, -1.5, 1.5));",
  },
  Invert: {
    id: "Invert", label: "Invert", kind: "post", icon: "◪",
    description: "Flips the colours inside the radius into a negative.",
    glsl: "col = mix(col, 1. - col, smoothstep(.05, .6, w) * clamp(a, 0., 1.));",
  },
  Prism: {
    id: "Prism", label: "Prism", kind: "prism", icon: "◭",
    description: "Splits red and blue apart around the pointer.",
    p1: prm("Spread", 0, 3, 0.05, 1),
    glsl: "o += dm * w * a * p1 * .2;",
  },
};

export const EFFECT_LIST: EffectDef[] = (Object.keys(EFFECTS) as TouchEffect[]).map((id) => EFFECTS[id]);

/** Falloffs as GLSL expressions of q = distance / radius. */
export const FALLOFF_GLSL: Record<Falloff, string> = {
  Gauss: "exp(-q * q)",
  Smooth: "(1. - smoothstep(0., 1., q))",
  Linear: "max(1. - q, 0.)",
  Plateau: "(1. - smoothstep(.55, 1., q))",
  Ring: "exp(-((q - .62) * 3.4) * ((q - .62) * 3.4))",
  Spike: "max(1. / (1. + 10. * q * q) - .06, 0.)",
};

/** The same curves in JS, for the little chart in the rule cards. */
export const FALLOFF_FN: Record<Falloff, (q: number) => number> = {
  Gauss: (q) => Math.exp(-q * q),
  Smooth: (q) => { const t = Math.min(1, Math.max(0, q)); return 1 - t * t * (3 - 2 * t); },
  Linear: (q) => Math.max(1 - q, 0),
  Plateau: (q) => { const t = Math.min(1, Math.max(0, (q - 0.55) / 0.45)); return 1 - t * t * (3 - 2 * t); },
  Ring: (q) => Math.exp(-(((q - 0.62) * 3.4) ** 2)),
  Spike: (q) => Math.max(1 / (1 + 10 * q * q) - 0.06, 0),
};

export const TRIGGER_GLSL: Record<Trigger, string> = {
  Always: "1.",
  Press: "uPress",
  Move: "uStir",
  Boost: "(1. + uPress)",
  Still: "(1. - uStir)",
};

export const TRIGGER_HINT: Record<Trigger, string> = {
  Always: "Active whenever the pointer is over the shader",
  Press: "Fades in while the button is held",
  Move: "Strength follows pointer speed",
  Boost: "Always on, extra strong while pressed",
  Still: "Strongest when the pointer is resting",
};

/* ───────────────────────── rules ───────────────────────── */

export function makeRule(effect: TouchEffect, over: Partial<TouchRule> = {}): TouchRule {
  const def = EFFECTS[effect];
  return {
    effect,
    enabled: true,
    amount: 1,
    radius: 1,
    p1: def.p1?.value ?? 0,
    p2: def.p2?.value ?? 0,
    falloff: "Gauss",
    trigger: "Always",
    source: "Pointer",
    ...over,
  };
}

const R = makeRule;

/* ───────────────────────── predefined modes ───────────────────────── */

export const MODE_CATEGORIES = ["Classic", "Warp", "Motion", "Colour"] as const;
export type ModeCategory = (typeof MODE_CATEGORIES)[number];

export interface ModeDef {
  id: InteractionMode;
  category: ModeCategory;
  icon: string;
  tag: string;
  description: string;
  /** zero, one or two mode-specific sliders */
  params: TouchParam[];
  /** the mode paints with the pointer trail */
  trail?: boolean;
  rules: (a: number, b: number) => TouchRule[];
}

export const MODE_DEFS: ModeDef[] = [
  /* Classic */
  { id: "Off", category: "Classic", icon: "⊘", tag: "No reaction", description: "The pointer is ignored. Only click ripples (if enabled) react to input.", params: [], rules: () => [] },
  {
    id: "Stir", category: "Classic", icon: "↻", tag: "Swirl around the cursor", description: "The field swirls around your cursor — faster movement stirs harder.",
    params: [prm("Motion boost", 0, 1.5, 0.05, 0.6)],
    rules: (a) => [R("Swirl", { p1: a })],
  },
  {
    id: "Attract", category: "Classic", icon: "⊙", tag: "Lens bulge", description: "The field bulges toward your cursor like a lens. Hold the button for a stronger pull.",
    params: [prm("Pull force", 0.3, 2.2, 0.05, 1)],
    rules: (a) => [R("Pull", { amount: a, trigger: "Boost" })],
  },
  {
    id: "Repel", category: "Classic", icon: "◌", tag: "Push away", description: "The field is pushed away from your cursor. Hold the button to push harder.",
    params: [prm("Push force", 0.3, 2.2, 0.05, 1)],
    rules: (a) => [R("Push", { amount: a, trigger: "Boost" })],
  },
  {
    id: "Light", category: "Classic", icon: "✦", tag: "Cursor lamp", description: "Your cursor becomes a light source — it brightens the surface and moves the highlight.",
    params: [prm("Pool strength", 0.2, 1, 0.05, 1)],
    rules: (a) => [R("Light", { amount: a, radius: 1.22 })],
  },

  /* Warp */
  {
    id: "Whirlpool", category: "Warp", icon: "◎", tag: "Spin and suck in", description: "A drain: the field spins around the pointer while being pulled into it.",
    params: [prm("Spin", 0.3, 3, 0.05, 1.4), prm("Suction", 0, 1.5, 0.05, 0.5)],
    rules: (a, b) => [R("Swirl", { amount: a, p1: 0.8 }), R("Pull", { amount: b, trigger: "Boost" })],
  },
  {
    id: "Twirl", category: "Warp", icon: "⟲", tag: "Rigid twist", description: "Turns the area under the pointer like a dial. Press to twist harder.",
    params: [prm("Twist", -2, 2, 0.05, 1.2)],
    rules: (a) => [R("Twist", { amount: a, falloff: "Smooth", trigger: "Boost" })],
  },
  {
    id: "Fisheye", category: "Warp", icon: "◍", tag: "Flat-top magnifier", description: "A crisp magnifying glass with a flat top instead of a soft bulge.",
    params: [prm("Magnify", 0.4, 2.4, 0.05, 1.5)],
    rules: (a) => [R("Pull", { amount: a, falloff: "Plateau", radius: 1.1, trigger: "Boost" })],
  },
  {
    id: "Gravity Lens", category: "Warp", icon: "◉", tag: "Heavy mass bends space", description: "A long-tailed gravity well that bends the whole field and drags it round.",
    params: [prm("Mass", 0.4, 2.4, 0.05, 1.4), prm("Frame drag", 0, 1.5, 0.05, 0.5)],
    rules: (a, b) => [R("Pull", { amount: a, falloff: "Spike", radius: 1.3 }), R("Swirl", { amount: b, falloff: "Spike", radius: 1.3, p1: 0.2 })],
  },
  {
    id: "Mirror", category: "Warp", icon: "⫴", tag: "Fold across a line", description: "Reflects the field across a line through the pointer.",
    params: [prm("Axis angle", 0, 180, 1, 0, { unit: "°" })],
    rules: (a) => [R("Mirror", { p1: a, falloff: "Plateau", radius: 1.4 })],
  },
  {
    id: "Mosaic", category: "Warp", icon: "▦", tag: "Pixel lens", description: "A circular window that turns the shader into chunky tiles.",
    params: [prm("Cells", 6, 90, 1, 28)],
    rules: (a) => [R("Mosaic", { p1: a, falloff: "Plateau" })],
  },
  {
    id: "Kaleido Lens", category: "Warp", icon: "✲", tag: "Kaleidoscope window", description: "A kaleidoscope that follows the pointer.",
    params: [prm("Segments", 2, 16, 1, 6), prm("Spin", -2, 2, 0.1, 0.4)],
    rules: (a, b) => [R("Kaleido", { p1: a, p2: b, falloff: "Plateau", radius: 1.3 })],
  },
  {
    id: "Turbulence", category: "Warp", icon: "≋", tag: "Churning noise", description: "Stirs the field with flowing turbulence near the pointer.",
    params: [prm("Scale", 1, 14, 0.5, 5), prm("Speed", 0, 4, 0.1, 1)],
    rules: (a, b) => [R("Noise", { amount: 1.2, p1: a, p2: b, falloff: "Smooth", radius: 1.3 })],
  },
  {
    id: "Glitch", category: "Warp", icon: "▤", tag: "Data corruption", description: "Horizontal bands jump sideways around the pointer.",
    params: [prm("Bands", 8, 140, 1, 44), prm("Rate", 1, 30, 1, 10)],
    rules: (a, b) => [R("Glitch", { p1: a, p2: b, falloff: "Plateau" })],
  },

  /* Motion */
  {
    id: "Ripple Pond", category: "Motion", icon: "◠", tag: "Endless ripples", description: "Concentric waves spread continuously from the pointer.",
    params: [prm("Frequency", 6, 50, 1, 24), prm("Speed", 0, 10, 0.25, 4)],
    rules: (a, b) => [R("Wave", { amount: 1.2, p1: a, p2: b, radius: 1.6 })],
  },
  {
    id: "Shockwave", category: "Motion", icon: "◯", tag: "Expanding rings", description: "Rings burst outward from the pointer on a steady beat.",
    params: [prm("Ring width", 0.3, 3, 0.05, 1), prm("Rate", 0.2, 4, 0.1, 1)],
    rules: (a, b) => [R("Pulse", { amount: 1.1, p1: a, p2: b, falloff: "Plateau", radius: 2.2 })],
  },
  {
    id: "Jelly", category: "Motion", icon: "∿", tag: "Wobbly and elastic", description: "The surface wobbles like jelly when you move, and settles when you stop.",
    params: [prm("Wobble", 6, 20, 0.5, 11), prm("Bounce", 2, 10, 0.25, 6)],
    rules: (a, b) => [
      R("Wave", { amount: 1.6, p1: a, p2: b, falloff: "Smooth", radius: 1.5, trigger: "Move" }),
      R("Pull", { amount: 0.35, falloff: "Smooth", radius: 1.3 }),
    ],
  },
  {
    id: "Smear", category: "Motion", icon: "⇢", tag: "Drag the paint", description: "Smears the field in the direction you move.",
    params: [prm("Smear", 0.4, 3, 0.05, 1.6)],
    rules: (a) => [R("Shear", { amount: a, radius: 1.2 })],
  },
  {
    id: "Comet Trail", category: "Motion", icon: "☄", tag: "Glowing tail", description: "Leaves a glowing, swirling tail behind the pointer that fades away.",
    params: [prm("Glow", 0.2, 2, 0.05, 1.1), prm("Tail swirl", 0, 1.5, 0.05, 0.4)],
    trail: true,
    rules: (a, b) => [
      R("Glow", { source: "Trail", amount: a, radius: 0.5, p1: 0.3 }),
      R("Swirl", { source: "Trail", amount: b, radius: 0.6, p1: 0.6 }),
    ],
  },
  {
    id: "Ink Drop", category: "Motion", icon: "●", tag: "Ink in water", description: "Every point of the pointer's path twists the field into a drifting ink swirl.",
    params: [prm("Swirl", -2, 2, 0.05, 1.6), prm("Pigment", 0, 1.5, 0.05, 0.5)],
    trail: true,
    rules: (a, b) => [
      R("Twist", { source: "Trail", amount: a, falloff: "Smooth", radius: 0.55 }),
      R("Glow", { source: "Trail", amount: b, radius: 0.5, p1: 0.4 }),
    ],
  },

  /* Colour & light */
  {
    id: "Spotlight", category: "Colour", icon: "◐", tag: "Flashlight reveal", description: "Everything goes dark except a pool of light around the pointer.",
    params: [prm("Darkness", 0.3, 1, 0.02, 0.9), prm("Warm glow", 0, 1, 0.05, 0)],
    rules: (a, b) => [
      R("Spotlight", { amount: a, falloff: "Smooth", radius: 1.4 }),
      R("Glow", { amount: b, falloff: "Smooth", radius: 1.2, p1: 0.2 }),
    ],
  },
  {
    id: "Prism", category: "Colour", icon: "◭", tag: "Colour split lens", description: "Red and blue separate around the pointer like light through glass.",
    params: [prm("Split", 0.2, 3, 0.05, 1.2)],
    rules: (a) => [R("Prism", { amount: a, falloff: "Smooth", radius: 1.5 })],
  },
  {
    id: "Chroma Shift", category: "Colour", icon: "◑", tag: "Hue lens", description: "Colours rotate around the colour wheel under the pointer.",
    params: [prm("Hue shift", -180, 180, 1, 110, { unit: "°" })],
    rules: (a) => [R("Hue", { p1: a, falloff: "Smooth", radius: 1.3 })],
  },
  {
    id: "Negative", category: "Colour", icon: "◪", tag: "Photo negative", description: "A window that shows the inverted colours of the shader.",
    params: [prm("Amount", 0.2, 1, 0.02, 1)],
    rules: (a) => [R("Invert", { amount: a, falloff: "Plateau" })],
  },
  {
    id: "Heat", category: "Colour", icon: "♨", tag: "Thermal camera", description: "The colour ramp slides near the pointer, with a hot glow at the centre.",
    params: [prm("Palette push", -1, 1, 0.02, 0.55), prm("Hot glow", 0, 1, 0.05, 0.3)],
    rules: (a, b) => [
      R("Palette", { p1: a, falloff: "Smooth", radius: 1.4 }),
      R("Glow", { amount: b, falloff: "Smooth", radius: 1.1, p1: 0.6 }),
    ],
  },
];

export const MODE_MAP: Record<InteractionMode, ModeDef> = Object.fromEntries(
  MODE_DEFS.map((def) => [def.id, def]),
) as Record<InteractionMode, ModeDef>;

/* the definition list and the type-level list must agree */
if (MODE_DEFS.length !== INTERACTION_MODES.length) {
  throw new Error("MODE_DEFS and INTERACTION_MODES are out of sync");
}

export function defaultModeParams(mode: InteractionMode): [number, number] {
  const def = MODE_MAP[mode];
  return [def.params[0]?.value ?? 0, def.params[1]?.value ?? 0];
}

export function clampParam(def: TouchParam | undefined, value: number): number {
  if (!def) return 0;
  return Number.isFinite(value) ? Math.min(def.max, Math.max(def.min, value)) : def.value;
}

export const DEFAULT_TOUCH: TouchSettings = {
  source: "mode",
  params: defaultModeParams("Stir"),
  falloff: "Auto",
  trigger: "Auto",
  response: 7,
  trail: 1.2,
  custom: [],
};

/** The rules that are actually running: the selected mode's rules or the custom stack. */
export function activeRules(p: Pick<ShaderProject, "interaction" | "touch">): TouchRule[] {
  const t = p.touch;
  if (t.source === "custom") return t.custom.filter((rule) => rule.enabled).slice(0, MAX_RULES);
  if (p.interaction === "Off") return [];
  const def = MODE_MAP[p.interaction];
  const rules = def.rules(clampParam(def.params[0], t.params[0]), clampParam(def.params[1], t.params[1]));
  return rules.slice(0, MAX_RULES).map((rule) => ({
    ...rule,
    falloff: t.falloff === "Auto" ? rule.falloff : t.falloff,
    trigger: t.trigger === "Auto" ? rule.trigger : t.trigger,
  }));
}

/** Rules of the selected predefined mode, for "copy into the custom builder". */
export function modeRulesOf(p: Pick<ShaderProject, "interaction" | "touch">): TouchRule[] {
  return activeRules({ interaction: p.interaction, touch: { ...p.touch, source: "mode" } });
}

/** One rule as the four numbers the shader reads. */
export function ruleUniform(rule: TouchRule, strength: number, radius: number): number[] {
  const def = EFFECTS[rule.effect];
  return [
    rule.amount * strength,
    rule.radius * radius,
    rule.p1 * (def.p1?.scale ?? 1),
    rule.p2 * (def.p2?.scale ?? 1),
  ];
}

export function clampRule(raw: unknown): TouchRule | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const effect = EFFECT_LIST.find((e) => e.id === v.effect)?.id;
  if (!effect) return null;
  const def = EFFECTS[effect];
  const num = (value: unknown, lo: number, hi: number, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : fallback;
  const falloffs = Object.keys(FALLOFF_GLSL) as Falloff[];
  const triggers = Object.keys(TRIGGER_GLSL) as Trigger[];
  return {
    effect,
    enabled: typeof v.enabled === "boolean" ? v.enabled : true,
    amount: num(v.amount, -2, 2, 1),
    radius: num(v.radius, 0.2, 3, 1),
    p1: def.p1 ? num(v.p1, def.p1.min, def.p1.max, def.p1.value) : 0,
    p2: def.p2 ? num(v.p2, def.p2.min, def.p2.max, def.p2.value) : 0,
    falloff: falloffs.find((f) => f === v.falloff) ?? "Gauss",
    trigger: triggers.find((t) => t === v.trigger) ?? "Always",
    source: v.source === "Trail" ? "Trail" : "Pointer",
  };
}

/** Starting points for the custom builder. */
export const TOUCH_TEMPLATES: Array<{ name: string; tag: string; rules: () => TouchRule[] }> = [
  {
    name: "Silk drag", tag: "Smear plus a little swirl",
    rules: () => [R("Shear", { amount: 1.4, radius: 1.3 }), R("Swirl", { amount: 0.4, p1: 0.8 })],
  },
  {
    name: "Neon comet", tag: "Glowing, hue-shifting tail",
    rules: () => [
      R("Glow", { source: "Trail", amount: 1.2, radius: 0.5, p1: 0.3 }),
      R("Hue", { source: "Trail", amount: 0.9, radius: 0.55, falloff: "Smooth", p1: 70 }),
      R("Shear", { amount: 0.6 }),
    ],
  },
  {
    name: "Glass lens", tag: "Magnifier with colour fringing",
    rules: () => [R("Pull", { amount: 1.6, falloff: "Plateau", trigger: "Boost" }), R("Prism", { amount: 0.9, falloff: "Smooth", radius: 1.3 })],
  },
  {
    name: "Gravity well", tag: "Pull, twist and dim the room",
    rules: () => [
      R("Pull", { amount: 1.8, falloff: "Spike", radius: 1.2 }),
      R("Twist", { amount: 0.6, falloff: "Smooth" }),
      R("Spotlight", { amount: 0.35, falloff: "Smooth", radius: 1.8 }),
    ],
  },
  {
    name: "Liquid touch", tag: "Churn, ripple and light",
    rules: () => [
      R("Noise", { amount: 1.2, falloff: "Smooth", trigger: "Move", radius: 1.3 }),
      R("Wave", { amount: 1, p1: 20, p2: 3 }),
      R("Light", { amount: 0.6, radius: 1.2 }),
    ],
  },
  {
    name: "Heat haze", tag: "Shimmering thermal distortion",
    rules: () => [
      R("Wave", { amount: 0.8, falloff: "Smooth", p1: 30, p2: 6, radius: 1.4 }),
      R("Palette", { falloff: "Smooth", p1: 0.5, radius: 1.4 }),
      R("Glow", { amount: 0.3, falloff: "Smooth", p1: 0.6 }),
    ],
  },
  {
    name: "Ink wake", tag: "Swirling ink along the path",
    rules: () => [
      R("Twist", { source: "Trail", amount: 1.4, falloff: "Smooth", radius: 0.5 }),
      R("Glow", { source: "Trail", amount: 0.7, radius: 0.5, p1: 0.4 }),
      R("Shear", { amount: 0.7 }),
    ],
  },
  {
    name: "Mirror ball", tag: "Kaleidoscope with a hue shift",
    rules: () => [
      R("Kaleido", { falloff: "Plateau", radius: 1.4, p1: 8, p2: 0.4 }),
      R("Hue", { falloff: "Smooth", p1: 40 }),
      R("Glow", { amount: 0.35, falloff: "Smooth" }),
    ],
  },
];

/* ───────────────────────── GLSL generation ───────────────────────── */

function centreCode(i: number, rule: TouchRule, pos: string): string {
  const R_ = `max(uCA[${i}].y, .02)`;
  const fo = FALLOFF_GLSL[rule.falloff];
  if (rule.source === "Trail") {
    return `float R = ${R_}; vec2 c = uMouse; float w = 0.;
    for (int j = 0; j < 12; j++){
      vec4 tr = uTrail[j];
      if (tr.z >= 0.){
        float q = length(${pos} - tr.xy) / R;
        float wj = (${fo}) * tr.w;
        if (wj > w){ w = wj; c = tr.xy; }
      }
    }
    vec2 dm = ${pos} - c;`;
  }
  return `float R = ${R_}; vec2 c = uMouse; vec2 dm = ${pos} - c; float q = length(dm) / R; float w = ${fo};`;
}

export interface TouchFlags {
  light: boolean;
  prism: boolean;
}

export function touchFlags(rules: TouchRule[]): TouchFlags {
  return {
    light: rules.some((r) => r.effect === "Light"),
    prism: rules.some((r) => r.effect === "Prism"),
  };
}

/** A compact signature for the shader cache key: only things that change the GLSL. */
export function touchSignature(rules: TouchRule[]): string {
  return rules.map((r) => `${r.effect}.${r.falloff}.${r.trigger}.${r.source}`).join(",");
}

/** Generates touchWarp / touchPre / touchPost / touchPrism for the given rules. */
export function buildTouchGlsl(rules: TouchRule[]): string {
  const warp: string[] = [];
  const pre: string[] = [];
  const post: string[] = [];
  const prism: string[] = [];

  rules.forEach((rule, i) => {
    const def = EFFECTS[rule.effect];
    const pos = def.kind === "warp" ? "p" : "uv";
    const head = `${centreCode(i, rule, pos)} float a = uCA[${i}].x * ${TRIGGER_GLSL[rule.trigger]}; float p1 = uCA[${i}].z; float p2 = uCA[${i}].w;`;
    const block = `  { ${head}\n    ${def.glsl} }`;
    if (def.kind === "warp") warp.push(block);
    else if (def.kind === "pre") pre.push(block);
    else if (def.kind === "post") post.push(block);
    else prism.push(block);
  });

  return `
vec2 touchWarp(vec2 p){
${warp.join("\n")}
  return p;
}
void touchPre(vec2 uv){
${pre.join("\n")}
}
vec3 touchPost(vec3 col, vec2 uv){
${post.join("\n")}
  return col;
}
vec2 touchPrism(vec2 uv){
  vec2 o = vec2(0.);
${prism.join("\n")}
  return o;
}
`;
}
