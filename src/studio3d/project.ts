import type { CameraSettings, GeneratorId, InteractionSettings, Layer, Look, PaletteStop, Project3D, QualityLevel, SimSettings, TimelineSettings, Vec3 } from "./types";
import { MAX_LAYERS, SCHEMA_VERSION } from "./types";
import { DEFAULT_CAMERA } from "./camera";
import { EASING_NAMES, clamp, type EasingName } from "./math";
import { makeBehavior, makeDeformer, newId, BEHAVIOR_TYPES, DEFORMER_TYPES } from "./behaviors";
import { PALETTE_PRESETS } from "./palette";
import { defaultParams, getGenerator, isGeneratorId, normalizeParams } from "./generators/index";

export const DEFAULT_LOOK: Look = {
  palette: PALETTE_PRESETS[0].stops.map((s) => ({ ...s })), size: 0.0075, sizeVariation: 0.35, sizeAttenuation: true, opacity: 0.85, emission: 1.1, shape: "soft", softness: 0.8, blend: "additive",
  glow: 0.65, glowRadius: 0.6, edgeBrightness: 1.1, depthFade: 0.5, depthColor: 0, velocityColor: 0, velocityStretch: 0, lighting: 0, lightAzimuth: 40, lightElevation: 35, grain: 0.2, spin: 0, trails: 0,
  exposure: 1.3, background: "#05070d", transparent: false, vignette: 0.25, autoNormalize: true,
};
export const DEFAULT_SIM: SimSettings = { substeps: 1, damping: 1, maxSpeed: 40, massVariation: 0, massInfluence: 0 };
export const DEFAULT_INTERACTION: InteractionSettings = { tool: "swirl", radius: 0.35, strength: 1, dragMode: "orbit", clickAction: "burst" };
export const DEFAULT_TIMELINE: TimelineSettings = { steps: [], mode: "loop", morph: 2.4, easing: "easeInOut" };
export const defaultSteps = (ids: GeneratorId[], hold = 3) => ids.map((g) => ({ id: newId("s"), generator: g, hold }));

export function makeLayer(generator: GeneratorId, over: Partial<Layer> = {}): Layer {
  const def = getGenerator(generator);
  return { id: newId("l"), name: def.name, generator, params: defaultParams(def), seed: 1, share: 1, visible: true, offset: [0, 0, 0], scale: 1, rotY: 0, palette: null, sizeMul: 1, opacityMul: 1, ...over };
}
/** A complete project from a generator's recipe (look, behaviours, deformers, camera). Keeps quality, interaction and timeline from `prev`. */
export function projectFromGenerator(id: GeneratorId, prev?: Project3D): Project3D {
  const def = getGenerator(id), r = def.recipe, layer = makeLayer(id);
  return {
    version: SCHEMA_VERSION, name: def.name, count: r.count, layers: [layer], activeLayer: layer.id,
    look: { ...DEFAULT_LOOK, palette: DEFAULT_LOOK.palette.map((s) => ({ ...s })), ...(r.look ?? {}) } as Look,
    behaviors: (r.behaviors ?? []).map(makeBehavior), deformers: (r.deformers ?? []).map(makeDeformer), sim: { ...DEFAULT_SIM },
    camera: { ...DEFAULT_CAMERA, target: [0, 0, 0], ...(r.camera ?? {}) } as CameraSettings,
    interaction: prev ? { ...prev.interaction } : { ...DEFAULT_INTERACTION },
    timeline: prev ? { ...prev.timeline, steps: prev.timeline.steps.map((s) => ({ ...s })) } : { ...DEFAULT_TIMELINE, steps: defaultSteps(["sphere", "torus", "galaxy", "knot"]) },
    quality: prev?.quality ?? "high",
  };
}
export const defaultProject = () => projectFromGenerator("sphere");

/* ───────────── validation & migration ───────────── */
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const n = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : d);
const s = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (typeof v === "string" && (ok as readonly string[]).includes(v) ? (v as T) : d);
const vec = (v: unknown, d: Vec3): Vec3 => (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? [v[0], v[1], v[2]] : [...d] as Vec3);
const color = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : d);
function palette(v: unknown, d: PaletteStop[] | null): PaletteStop[] | null {
  if (!Array.isArray(v)) return d;
  const out = v.filter(isObj).map((p) => ({ t: n(p.t, 0, 0, 1), color: color(p.color, "#ffffff") })).slice(0, 8);
  return out.length >= 2 ? out : d;
}
function look(raw: unknown, base: Look): Look {
  if (!isObj(raw)) return { ...base, palette: base.palette.map((p) => ({ ...p })) };
  const L = base;
  return {
    palette: palette(raw.palette, L.palette) as PaletteStop[], size: n(raw.size, L.size, 0.001, 0.06), sizeVariation: n(raw.sizeVariation, L.sizeVariation, 0, 1), sizeAttenuation: typeof raw.sizeAttenuation === "boolean" ? raw.sizeAttenuation : L.sizeAttenuation,
    opacity: n(raw.opacity, L.opacity, 0, 2), emission: n(raw.emission, L.emission, 0, 6), shape: s(raw.shape, ["soft", "hard", "ring", "spark", "square", "diamond"] as const, L.shape), softness: n(raw.softness, L.softness, 0, 1),
    blend: s(raw.blend, ["additive", "alpha", "screen"] as const, L.blend), glow: n(raw.glow, L.glow, 0, 3), glowRadius: n(raw.glowRadius, L.glowRadius, 0, 1.5), edgeBrightness: n(raw.edgeBrightness, L.edgeBrightness, 0, 3),
    depthFade: n(raw.depthFade, L.depthFade, 0, 1), depthColor: n(raw.depthColor, L.depthColor, -1, 1), velocityColor: n(raw.velocityColor, L.velocityColor, 0, 1), velocityStretch: n(raw.velocityStretch, L.velocityStretch, 0, 2),
    lighting: n(raw.lighting, L.lighting, 0, 1), lightAzimuth: n(raw.lightAzimuth, L.lightAzimuth, -180, 180), lightElevation: n(raw.lightElevation, L.lightElevation, -90, 90), grain: n(raw.grain, L.grain, 0, 1), spin: n(raw.spin, L.spin, -6, 6),
    trails: n(raw.trails, L.trails, 0, 0.95), exposure: n(raw.exposure, L.exposure, 0.1, 6), background: color(raw.background, L.background), transparent: typeof raw.transparent === "boolean" ? raw.transparent : L.transparent,
    vignette: n(raw.vignette, L.vignette, 0, 1), autoNormalize: typeof raw.autoNormalize === "boolean" ? raw.autoNormalize : L.autoNormalize,
  };
}
export interface MigrationResult { project: Project3D; warnings: string[]; fromVersion: number }
/** Accepts any parsed JSON (current, older unversioned, partial or hostile) and returns a valid, clamped project. */
export function migrateProject(raw: unknown): MigrationResult {
  const warnings: string[] = [];
  const base = defaultProject();
  if (!isObj(raw)) { warnings.push("File is not a project object; using defaults."); return { project: base, warnings, fromVersion: -1 }; }
  const fromVersion = typeof raw.version === "number" ? raw.version : 0;
  if (fromVersion > SCHEMA_VERSION) warnings.push(`Project was saved by a newer version (${fromVersion}); unknown settings were ignored.`);
  let layersRaw: unknown = raw.layers;
  if (!Array.isArray(layersRaw)) { // v0: flat shape { generator|preset, params }
    const g = raw.generator ?? raw.preset;
    if (isGeneratorId(g)) { layersRaw = [{ generator: g, params: raw.params, seed: raw.seed }]; warnings.push("Upgraded a v0 single-shape project to layers."); }
  }
  const layers: Layer[] = [];
  if (Array.isArray(layersRaw)) for (const l of layersRaw.slice(0, MAX_LAYERS)) {
    if (!isObj(l) || !isGeneratorId(l.generator)) { warnings.push("Dropped a layer with an unknown shape."); continue; }
    const def = getGenerator(l.generator), d = makeLayer(l.generator);
    layers.push({ id: typeof l.id === "string" ? l.id : d.id, name: typeof l.name === "string" ? l.name.slice(0, 40) : def.name, generator: l.generator, params: normalizeParams(def, l.params), seed: Math.floor(n(l.seed, 1, 0, 1e9)), share: n(l.share, 1, 0.01, 10), visible: l.visible !== false, offset: vec(l.offset, [0, 0, 0]), scale: n(l.scale, 1, 0.1, 4), rotY: n(l.rotY, 0, -360, 360), palette: palette(l.palette, null), sizeMul: n(l.sizeMul, 1, 0.1, 4), opacityMul: n(l.opacityMul, 1, 0, 3) });
  }
  if (!layers.length) { warnings.push("No valid layers found; using the default shape."); layers.push(...base.layers); }
  const q = s(raw.quality, ["low", "medium", "high", "ultra"] as const, "high") as QualityLevel;
  const cam = isObj(raw.camera) ? raw.camera : {}, simR = isObj(raw.sim) ? raw.sim : {}, ir = isObj(raw.interaction) ? raw.interaction : {}, tl = isObj(raw.timeline) ? raw.timeline : {};
  const behaviors = (Array.isArray(raw.behaviors) ? raw.behaviors : base.behaviors).filter(isObj).filter((b) => BEHAVIOR_TYPES.includes(b.type as never)).slice(0, 24).map((b) => {
    const m = makeBehavior({ type: b.type as never });
    return { ...m, id: typeof b.id === "string" ? b.id : m.id, enabled: b.enabled !== false, intensity: n(b.intensity, m.intensity, -200, 400), scale: n(b.scale, m.scale, 0.01, 20), speed: n(b.speed, m.speed, 0, 20), radius: n(b.radius, m.radius, 0, 20), falloff: s(b.falloff, ["none", "linear", "smooth", "inverse"] as const, m.falloff), dir: vec(b.dir, m.dir), center: vec(b.center, m.center), blend: s(b.blend, ["add", "replace", "max"] as const, "add"), anim: s(b.anim, ["none", "pulse", "sine", "noise"] as const, "none"), animRate: n(b.animRate, 1, 0, 20), animDepth: n(b.animDepth, 0.5, 0, 4), aux: n(b.aux, m.aux, -50, 50), aux2: n(b.aux2, 0, -50, 50), expr: Array.isArray(b.expr) && b.expr.length === 3 ? ([String(b.expr[0]).slice(0, 240), String(b.expr[1]).slice(0, 240), String(b.expr[2]).slice(0, 240)] as [string, string, string]) : m.expr };
  });
  const deformers = (Array.isArray(raw.deformers) ? raw.deformers : base.deformers).filter(isObj).filter((d) => DEFORMER_TYPES.includes(d.type as never)).slice(0, 16).map((d) => {
    const m = makeDeformer({ type: d.type as never });
    return { ...m, id: typeof d.id === "string" ? d.id : m.id, enabled: d.enabled !== false, amount: n(d.amount, m.amount, -10, 10), scale: n(d.scale, m.scale, 0.01, 20), speed: n(d.speed, m.speed, 0, 20), axis: s(d.axis, ["x", "y", "z"] as const, "y") };
  });
  const steps = (Array.isArray(tl.steps) ? tl.steps : []).filter(isObj).filter((x) => isGeneratorId(x.generator)).slice(0, 12).map((x) => ({ id: typeof x.id === "string" ? x.id : newId("s"), generator: x.generator as GeneratorId, hold: n(x.hold, 3, 0.2, 60) }));
  const project: Project3D = {
    version: SCHEMA_VERSION, name: typeof raw.name === "string" ? raw.name.slice(0, 60) : "Imported project", count: Math.round(n(raw.count, base.count, 1000, 400000)), layers,
    activeLayer: layers.some((l) => l.id === raw.activeLayer) ? (raw.activeLayer as string) : layers[0].id, look: look(raw.look, DEFAULT_LOOK), behaviors, deformers,
    sim: { substeps: Math.round(n(simR.substeps, 1, 1, 4)), damping: n(simR.damping, 1, 0, 10), maxSpeed: n(simR.maxSpeed, 40, 1, 200), massVariation: n(simR.massVariation, 0, 0, 1), massInfluence: n(simR.massInfluence, 0, 0, 1) },
    camera: { projection: s(cam.projection, ["perspective", "orthographic"] as const, "perspective"), fov: n(cam.fov, 45, 15, 100), distance: n(cam.distance, 3.4, 0.5, 30), yaw: n(cam.yaw, 0.45, -50, 50), pitch: n(cam.pitch, 0.22, -1.55, 1.55), target: vec(cam.target, [0, 0, 0]), near: n(cam.near, 0.05, 0.001, 5), far: n(cam.far, 60, 5, 500), autoRotate: n(cam.autoRotate, 0.12, -3, 3) },
    interaction: { tool: s(ir.tool, ["none", "attract", "repel", "swirl", "vortex", "push", "pull", "stir", "scatter", "gather", "distort"] as const, "swirl"), radius: n(ir.radius, 0.35, 0.05, 2), strength: n(ir.strength, 1, 0, 5), dragMode: s(ir.dragMode, ["orbit", "force"] as const, "orbit"), clickAction: s(ir.clickAction, ["burst", "none"] as const, "burst") },
    timeline: { steps: steps.length ? steps : DEFAULT_TIMELINE.steps, mode: s(tl.mode, ["once", "loop", "pingpong"] as const, "loop"), morph: n(tl.morph, 2.4, 0.2, 20), easing: s(tl.easing, EASING_NAMES as readonly EasingName[], "easeInOut") },
    quality: q,
  };
  return { project, warnings, fromVersion };
}
export const serializeProject = (p: Project3D) => JSON.stringify({ ...p, version: SCHEMA_VERSION }, null, 2);
