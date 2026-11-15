import type { Behavior, CameraSettings, Deformer, InteractionSettings, InteractionTool, LightBeam, Look, PaletteStop, Project3D, QualityLevel, SimSettings } from "../types";
import { QUALITY } from "../types";
import type { ExportMode } from "./packing";

/**
 * `particle-config.json`: everything the engine needs besides the binary particle data.
 * Shared by the studio-side exporter (builds it), the engine (validates it) and the tests.
 */
export const CONFIG_SCHEMA = "particle-studio-scene";
export const CONFIG_VERSION = 1;

export type WheelZoom = "off" | "modifier" | "always";
export type TouchBehavior = "scroll" | "capture";

export interface ExportLayerLook { palette: PaletteStop[] | null; sizeMul: number; opacityMul: number }
export interface ExportInteraction {
  /** Any pointer handling at all. false = a pure background that never touches input. */
  enabled: boolean;
  /** Dragging orbits the camera. */
  orbit: boolean;
  /** Mouse wheel / trackpad: "modifier" only zooms with Ctrl/Cmd held, so page scrolling is never hijacked. */
  zoom: WheelZoom;
  /** "scroll": vertical swipes scroll the page, horizontal drags orbit. "capture": the scene owns every touch. */
  touch: TouchBehavior;
  tool: InteractionTool;
  radius: number;
  strength: number;
  clickAction: InteractionSettings["clickAction"];
}
export interface ExportRender {
  quality: QualityLevel;
  /** Upper bound for devicePixelRatio. */
  pixelRatio: number;
  /** Lower the internal resolution automatically when frames get slow. */
  adaptive: boolean;
  /** 0 off, 1 half bloom chain, 2 full chain (same meaning as the studio quality profile). */
  bloomLevel: 0 | 1 | 2;
}
export interface ExportConfig {
  schema: typeof CONFIG_SCHEMA;
  version: number;
  name: string;
  mode: ExportMode;
  data: { format: "psb"; version: number; count: number; radius: number; active: number };
  engine: { simulation: boolean };
  state: { time: number; tick: number; cameraYawVelocity: number; cameraPitchVelocity: number };
  render: ExportRender;
  animation: { enabled: boolean; respectReducedMotion: boolean };
  interaction: ExportInteraction;
  scene: { look: Look; layers: ExportLayerLook[]; beams: LightBeam[]; camera: CameraSettings };
  /** Present for animated / full quality exports only. */
  simulation?: { sim: SimSettings; behaviors: Behavior[]; deformers: Deformer[] };
}

export type PostEffects = { bloom: boolean; vignette: boolean; grain: boolean; trails: boolean };
export const DEFAULT_POST_EFFECTS: PostEffects = { bloom: true, vignette: true, grain: true, trails: true };

export interface ConfigOptions {
  mode: ExportMode;
  /** null = use the quality profile's cap. */
  pixelRatio: number | null;
  animation: boolean;
  interaction: boolean;
  zoom: WheelZoom;
  touch: TouchBehavior;
  effects: PostEffects;
  adaptive: boolean;
  /** Pass the evaluated simulation clock so the export continues where the preview is. */
  state: ExportConfig["state"];
  count: number;
  radius: number;
  active: number;
  dataVersion: number;
}

export const DEFAULT_CONFIG_OPTIONS: Omit<ConfigOptions, "count" | "radius" | "active" | "dataVersion" | "state"> = {
  mode: "hero", pixelRatio: null, animation: true, interaction: true, zoom: "modifier", touch: "scroll", effects: DEFAULT_POST_EFFECTS, adaptive: true,
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function buildExportConfig(project: Project3D, camera: CameraSettings, options: ConfigOptions): ExportConfig {
  const quality = QUALITY[project.quality];
  const needsSimulation = options.mode !== "hero";
  const look = clone(project.look);
  if (!options.effects.bloom) look.glow = 0;
  if (!options.effects.vignette) look.vignette = 0;
  if (!options.effects.grain) look.grain = 0;
  if (!options.effects.trails) look.trails = 0;
  const config: ExportConfig = {
    schema: CONFIG_SCHEMA,
    version: CONFIG_VERSION,
    name: project.name,
    mode: options.mode,
    data: { format: "psb", version: options.dataVersion, count: options.count, radius: options.radius, active: Math.min(options.count, Math.max(1, options.active)) },
    engine: { simulation: needsSimulation },
    state: { ...options.state },
    render: {
      quality: project.quality,
      pixelRatio: options.pixelRatio ?? quality.dpr,
      adaptive: options.adaptive,
      bloomLevel: (options.effects.bloom ? quality.bloom : 0) as 0 | 1 | 2,
    },
    animation: { enabled: options.animation, respectReducedMotion: true },
    interaction: {
      enabled: options.interaction,
      orbit: project.interaction.dragMode === "orbit",
      zoom: options.zoom,
      touch: options.touch,
      tool: needsSimulation ? project.interaction.tool : "none",
      radius: project.interaction.radius,
      strength: project.interaction.strength,
      clickAction: needsSimulation ? project.interaction.clickAction : "none",
    },
    scene: {
      look,
      layers: project.layers.map((layer) => ({ palette: layer.palette ? clone(layer.palette) : null, sizeMul: layer.sizeMul, opacityMul: layer.opacityMul })),
      beams: clone(project.beams),
      camera: clone(camera),
    },
  };
  if (needsSimulation) config.simulation = { sim: clone(project.sim), behaviors: clone(project.behaviors), deformers: clone(project.deformers) };
  return config;
}

export const serializeConfig = (config: ExportConfig, pretty = true) => JSON.stringify(config, null, pretty ? 2 : undefined);

export class ConfigError extends Error {
  constructor(message: string) { super(message); this.name = "ConfigError"; }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Validates untrusted JSON (from a file or a fetch) and returns it typed. Throws ConfigError with the offending path. */
export function parseConfig(input: unknown): ExportConfig {
  let raw = input;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { throw new ConfigError("particle-config.json is not valid JSON."); }
  }
  if (!isObject(raw)) throw new ConfigError("particle-config.json must contain an object.");
  if (raw.schema !== CONFIG_SCHEMA) throw new ConfigError(`Not a Particle Studio scene config (schema "${String(raw.schema)}").`);
  if (!isNumber(raw.version) || raw.version < 1 || raw.version > CONFIG_VERSION) throw new ConfigError(`Config version ${String(raw.version)} is not supported (this engine reads up to ${CONFIG_VERSION}).`);
  if (raw.mode !== "hero" && raw.mode !== "animated" && raw.mode !== "full") throw new ConfigError(`Unknown export mode "${String(raw.mode)}".`);
  const need = (cond: boolean, path: string) => { if (!cond) throw new ConfigError(`Config is missing or has an invalid "${path}".`); };
  need(isObject(raw.data) && isNumber(raw.data.count) && raw.data.count >= 1 && isNumber(raw.data.radius) && isNumber(raw.data.active), "data");
  need(isObject(raw.engine) && typeof raw.engine.simulation === "boolean", "engine.simulation");
  need(isObject(raw.state) && isNumber(raw.state.time) && isNumber(raw.state.tick), "state");
  need(isObject(raw.render) && isNumber(raw.render.pixelRatio) && isNumber(raw.render.bloomLevel) && typeof raw.render.quality === "string" && raw.render.quality in QUALITY, "render");
  need(isObject(raw.animation) && typeof raw.animation.enabled === "boolean", "animation");
  need(isObject(raw.interaction) && typeof raw.interaction.enabled === "boolean", "interaction");
  need(isObject(raw.scene) && isObject(raw.scene.look) && Array.isArray(raw.scene.layers) && Array.isArray(raw.scene.beams) && isObject(raw.scene.camera), "scene");
  const simulationNeeded = (raw.engine as { simulation: boolean }).simulation;
  if (simulationNeeded) need(isObject(raw.simulation) && Array.isArray(raw.simulation.behaviors) && Array.isArray(raw.simulation.deformers) && isObject(raw.simulation.sim), "simulation");
  return raw as unknown as ExportConfig;
}

/** Deep-merges a partial update into a config (objects merge, arrays and primitives replace). Used by updateConfig(). */
export function mergeConfig<T extends object>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = Array.isArray(base) ? ([...(base as unknown[])] as unknown as Record<string, unknown>) : { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(patch)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const next = patch[key];
    const prev = out[key];
    out[key] = isObject(next) && isObject(prev) ? mergeConfig(prev, next) : next;
  }
  return out as T;
}
