/**
 * Settings model for the 2D studio upgrade: Shape-Locked Motion, scene lighting,
 * extra FX and advanced backdrops. Everything lives under `ParticleSettings.studio`
 * (optional), so older projects and presets keep working unchanged.
 */

import { LOCK_STYLE_NAMES, type LockStyle } from "./catalogs";
export const LOCK_STYLES = LOCK_STYLE_NAMES;
export type { LockStyle } from "./catalogs";

export const COLOR_MODES = ["Palette", "Linear", "Radial", "Angular", "Vertical"] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

export const BACKDROP_KINDS = [
  "None", "Nebula", "Aurora", "Starfield", "Floor Glow", "Grid Floor", "Mesh Gradient", "Haze",
] as const;
export type BackdropKind = (typeof BACKDROP_KINDS)[number];

export interface ShapeLockSettings {
  /** Master switch. When false the engine behaves exactly as before. */
  enabled: boolean;
  style: LockStyle;
  /** 0-1: how strongly the formation resists other forces. */
  strength: number;
  /** 0-1: wobble amplitude (as a share of the maximum displacement). */
  amount: number;
  /** 0.1-3: animation speed multiplier. */
  speed: number;
  /** 0-1: how different each particle's amplitude and frequency are. */
  variation: number;
  /** 0-1: 0 = neighbours move together, 1 = every particle has its own phase. */
  independence: number;
  /** 1-80: hard limit in px on a 600px-tall reference canvas (scales with canvas size). */
  maxDisplacement: number;
  /** 0.2-3: spring stiffness back to the home position. */
  returnStrength: number;
  /** 0-1: spring damping (higher = no overshoot). */
  damping: number;
  /** 0-1: formation breathing amount. */
  breathing: number;
  /** 0-1: ripple / pulse wave strength. */
  ripple: number;
  /** 0-1: extra pull-back while a pointer has pushed particles away. */
  recovery: number;
  /** 0-4: how far (in multiples of max displacement) a pointer may push particles. */
  pointerReach: number;
}

export interface LightBeam {
  /** Beam origin and end, as fractions of the canvas (may lie outside 0-1). */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Half-width of the beam core as a fraction of the shorter canvas side. */
  width: number;
  /** How much the beam widens along its length. */
  spread: number;
  fadeIn: number;
  fadeOut: number;
  strength: number;
  color: string;
}

export interface LightSettings {
  enabled: boolean;
  beams: LightBeam[];
  /** Brightness of a particle outside any light (0 = invisible, 1 = fully visible). */
  ambient: number;
  intensity: number;
  /** 0-1: how many particles flash brightly as they catch the light. */
  reflectivity: number;
  /** 0-1: size of the flare drawn on very bright particles. */
  glint: number;
  /** 0-1: how far beams slowly sway. */
  sway: number;
  swaySpeed: number;
  /** A soft light that follows the pointer or finger. */
  torch: boolean;
  torchRadius: number;
  torchStrength: number;
  torchColor: string;
  /** Draw a faint volumetric haze for each beam (the beam is otherwise never drawn). */
  haze: number;
  /** Draw dashed guides and handles while editing. */
  showGuide: boolean;
  /** Also light the free-floating dust (see FX). */
  lightDust: boolean;
}

export interface RingSettings {
  enabled: boolean;
  count: number;
  perRing: number;
  radius: number;
  tilt: number;
  speed: number;
  trail: number;
  size: number;
}

export interface FxSettings {
  colorMode: ColorMode;
  gradientAngle: number;
  gradientFlow: number;
  rings: RingSettings;
  dust: { enabled: boolean; amount: number; drift: number };
  glints: number;
  bokeh: number;
  bloom: number;
  shockwave: boolean;
  shockStrength: number;
}

export interface BackdropSettings {
  kind: BackdropKind;
  intensity: number;
  speed: number;
  colorA: string;
  colorB: string;
  colorC: string;
  scale: number;
  stars: number;
  vignette: number;
  grain: number;
  parallax: number;
}

export interface Studio2DSettings {
  shapeLock: ShapeLockSettings;
  light: LightSettings;
  fx: FxSettings;
  backdrop: BackdropSettings;
}

export type Studio2DPatch = {
  shapeLock?: Partial<ShapeLockSettings>;
  light?: Partial<Omit<LightSettings, "beams">> & { beams?: LightBeam[] };
  fx?: Partial<Omit<FxSettings, "rings" | "dust">> & { rings?: Partial<RingSettings>; dust?: Partial<FxSettings["dust"]> };
  backdrop?: Partial<BackdropSettings>;
};

export const DEFAULT_BEAMS: LightBeam[] = [
  { fromX: -0.07, fromY: 0.03, toX: 0.44, toY: 0.62, width: 0.03, spread: 0.9, fadeIn: 0.16, fadeOut: 0.42, strength: 1, color: "#eef0f6" },
  { fromX: 1.12, fromY: 0.66, toX: 0.66, toY: 0.4, width: 0.026, spread: 0.8, fadeIn: 0.14, fadeOut: 0.5, strength: 0.85, color: "#eef0f6" },
];

export const MAX_BEAMS = 4;

export function defaultStudio2D(): Studio2DSettings {
  return {
    shapeLock: {
      enabled: false,
      style: "Gentle Float",
      strength: 0.85,
      amount: 0.5,
      speed: 1,
      variation: 0.6,
      independence: 0.55,
      maxDisplacement: 10,
      returnStrength: 1.4,
      damping: 0.7,
      breathing: 0.25,
      ripple: 0.35,
      recovery: 0.6,
      pointerReach: 2.2,
    },
    light: {
      enabled: false,
      beams: DEFAULT_BEAMS.map((beam) => ({ ...beam })),
      ambient: 0.14,
      intensity: 1,
      reflectivity: 0.6,
      glint: 0.6,
      sway: 0.25,
      swaySpeed: 0.6,
      torch: false,
      torchRadius: 150,
      torchStrength: 0.9,
      torchColor: "#cfe6ff",
      haze: 0,
      showGuide: false,
      lightDust: true,
    },
    fx: {
      colorMode: "Palette",
      gradientAngle: 20,
      gradientFlow: 0,
      rings: { enabled: false, count: 3, perRing: 90, radius: 1.05, tilt: 62, speed: 0.6, trail: 0.35, size: 1 },
      dust: { enabled: false, amount: 0.35, drift: 0.4 },
      glints: 0,
      bokeh: 0,
      bloom: 0,
      shockwave: false,
      shockStrength: 1,
    },
    backdrop: {
      kind: "None",
      intensity: 0.85,
      speed: 1,
      colorA: "#3b2bb0",
      colorB: "#12b5d6",
      colorC: "#c13fa5",
      scale: 1,
      stars: 0.6,
      vignette: 0,
      grain: 0,
      parallax: 0.5,
    },
  };
}

export const DEFAULT_STUDIO2D: Studio2DSettings = Object.freeze(defaultStudio2D()) as Studio2DSettings;

const HEX = /^#[\da-f]{6}$/i;

function num(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function hex(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value) ? value : fallback;
}
function pick<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}
function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeBeam(value: unknown, fallback: LightBeam): LightBeam {
  const v = obj(value);
  return {
    fromX: num(v.fromX, -1, 2, fallback.fromX),
    fromY: num(v.fromY, -1, 2, fallback.fromY),
    toX: num(v.toX, -1, 2, fallback.toX),
    toY: num(v.toY, -1, 2, fallback.toY),
    width: num(v.width, 0.005, 0.25, fallback.width),
    spread: num(v.spread, 0, 3, fallback.spread),
    fadeIn: num(v.fadeIn, 0, 0.7, fallback.fadeIn),
    fadeOut: num(v.fadeOut, 0, 0.95, fallback.fadeOut),
    strength: num(v.strength, 0, 1.6, fallback.strength),
    color: hex(v.color, fallback.color),
  };
}

/** Merge unknown (saved / preset) data into a complete, range-checked settings object. */
export function normalizeStudio2D(value: unknown, base: Studio2DSettings = DEFAULT_STUDIO2D): Studio2DSettings {
  const v = obj(value);
  const lk = obj(v.shapeLock), lt = obj(v.light), fx = obj(v.fx), bd = obj(v.backdrop);
  const rg = obj(fx.rings), ds = obj(fx.dust);
  const b = base;
  const beams = Array.isArray(lt.beams)
    ? lt.beams.slice(0, MAX_BEAMS).map((beam, index) => normalizeBeam(beam, b.light.beams[index] ?? DEFAULT_BEAMS[index % DEFAULT_BEAMS.length]))
    : b.light.beams.map((beam) => ({ ...beam }));
  return {
    shapeLock: {
      enabled: bool(lk.enabled, b.shapeLock.enabled),
      style: pick(lk.style, LOCK_STYLES, b.shapeLock.style),
      strength: num(lk.strength, 0, 1, b.shapeLock.strength),
      amount: num(lk.amount, 0, 1, b.shapeLock.amount),
      speed: num(lk.speed, 0.1, 3, b.shapeLock.speed),
      variation: num(lk.variation, 0, 1, b.shapeLock.variation),
      independence: num(lk.independence, 0, 1, b.shapeLock.independence),
      maxDisplacement: num(lk.maxDisplacement, 1, 80, b.shapeLock.maxDisplacement),
      returnStrength: num(lk.returnStrength, 0.2, 3, b.shapeLock.returnStrength),
      damping: num(lk.damping, 0, 1, b.shapeLock.damping),
      breathing: num(lk.breathing, 0, 1, b.shapeLock.breathing),
      ripple: num(lk.ripple, 0, 1, b.shapeLock.ripple),
      recovery: num(lk.recovery, 0, 1, b.shapeLock.recovery),
      pointerReach: num(lk.pointerReach, 0, 4, b.shapeLock.pointerReach),
    },
    light: {
      enabled: bool(lt.enabled, b.light.enabled),
      beams,
      ambient: num(lt.ambient, 0, 0.8, b.light.ambient),
      intensity: num(lt.intensity, 0, 2.5, b.light.intensity),
      reflectivity: num(lt.reflectivity, 0, 1, b.light.reflectivity),
      glint: num(lt.glint, 0, 1, b.light.glint),
      sway: num(lt.sway, 0, 1, b.light.sway),
      swaySpeed: num(lt.swaySpeed, 0.1, 3, b.light.swaySpeed),
      torch: bool(lt.torch, b.light.torch),
      torchRadius: num(lt.torchRadius, 40, 500, b.light.torchRadius),
      torchStrength: num(lt.torchStrength, 0, 2, b.light.torchStrength),
      torchColor: hex(lt.torchColor, b.light.torchColor),
      haze: num(lt.haze, 0, 1, b.light.haze),
      showGuide: bool(lt.showGuide, b.light.showGuide),
      lightDust: bool(lt.lightDust, b.light.lightDust),
    },
    fx: {
      colorMode: pick(fx.colorMode, COLOR_MODES, b.fx.colorMode),
      gradientAngle: num(fx.gradientAngle, 0, 360, b.fx.gradientAngle),
      gradientFlow: num(fx.gradientFlow, 0, 1, b.fx.gradientFlow),
      rings: {
        enabled: bool(rg.enabled, b.fx.rings.enabled),
        count: Math.round(num(rg.count, 1, 6, b.fx.rings.count)),
        perRing: Math.round(num(rg.perRing, 20, 260, b.fx.rings.perRing)),
        radius: num(rg.radius, 0.4, 1.8, b.fx.rings.radius),
        tilt: num(rg.tilt, 0, 85, b.fx.rings.tilt),
        speed: num(rg.speed, 0.1, 3, b.fx.rings.speed),
        trail: num(rg.trail, 0, 1, b.fx.rings.trail),
        size: num(rg.size, 0.4, 3, b.fx.rings.size),
      },
      dust: {
        enabled: bool(ds.enabled, b.fx.dust.enabled),
        amount: num(ds.amount, 0, 1, b.fx.dust.amount),
        drift: num(ds.drift, 0, 1, b.fx.dust.drift),
      },
      glints: num(fx.glints, 0, 1, b.fx.glints),
      bokeh: num(fx.bokeh, 0, 0.6, b.fx.bokeh),
      bloom: num(fx.bloom, 0, 1, b.fx.bloom),
      shockwave: bool(fx.shockwave, b.fx.shockwave),
      shockStrength: num(fx.shockStrength, 0, 2.5, b.fx.shockStrength),
    },
    backdrop: {
      kind: pick(bd.kind, BACKDROP_KINDS, b.backdrop.kind),
      intensity: num(bd.intensity, 0, 1.5, b.backdrop.intensity),
      speed: num(bd.speed, 0, 3, b.backdrop.speed),
      colorA: hex(bd.colorA, b.backdrop.colorA),
      colorB: hex(bd.colorB, b.backdrop.colorB),
      colorC: hex(bd.colorC, b.backdrop.colorC),
      scale: num(bd.scale, 0.4, 2.5, b.backdrop.scale),
      stars: num(bd.stars, 0, 1, b.backdrop.stars),
      vignette: num(bd.vignette, 0, 1, b.backdrop.vignette),
      grain: num(bd.grain, 0, 1, b.backdrop.grain),
      parallax: num(bd.parallax, 0, 1, b.backdrop.parallax),
    },
  };
}

/** Apply a partial patch (a preset or a single control change) on top of existing settings. */
export function patchStudio2D(current: Studio2DSettings, patch: Studio2DPatch): Studio2DSettings {
  return normalizeStudio2D(
    {
      shapeLock: { ...current.shapeLock, ...patch.shapeLock },
      light: { ...current.light, ...patch.light },
      fx: {
        ...current.fx,
        ...patch.fx,
        rings: { ...current.fx.rings, ...patch.fx?.rings },
        dust: { ...current.fx.dust, ...patch.fx?.dust },
      },
      backdrop: { ...current.backdrop, ...patch.backdrop },
    },
    current,
  );
}
