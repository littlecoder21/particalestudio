/**
 * Elements library.
 *
 * Every entry is a ready-made layer (or, for recipes, a small group of layers)
 * that can be dropped on the stack: flat backgrounds, gradients, all 24
 * generators, patterns, light and atmosphere, grain and noise. Pick them as a
 * background or stack as many as you like — blend modes and opacity do the rest.
 */
import { GENERATORS, defaultKnobs } from "./generators";
import { DEFAULT_PROJECT, normalizeProject } from "./project";
import { newBaseLayer, newLayer } from "./stack";
import { cssGradient, toStops } from "./stops";
import type { GeneratorId, LayerKind, ShaderLayer, ShaderProject } from "./types";

export type LayerPreset = Partial<ShaderLayer> & { kind: LayerKind };

export const LIBRARY_FAMILIES = ["Backgrounds", "Gradients", "Fields", "Patterns", "Light", "Texture", "Recipes"] as const;
export type LibraryFamily = (typeof LIBRARY_FAMILIES)[number];

export interface LibraryItem {
  id: string;
  label: string;
  family: LibraryFamily;
  /** extra words the search box matches */
  tags: string;
  /** one layer, or several for a recipe (top layer first) */
  layers: LayerPreset[];
}

const item = (id: string, label: string, family: LibraryFamily, tags: string, ...layers: LayerPreset[]): LibraryItem =>
  ({ id, label, family, tags, layers });

/* ───────────── backgrounds ───────────── */

const SOLIDS: Array<[string, string, string]> = [
  ["ink", "Ink Black", "#05060b"], ["midnight", "Midnight", "#0b1020"], ["navy", "Deep Navy", "#0a1a3a"],
  ["graphite", "Graphite", "#1c1f2a"], ["slate", "Slate", "#2b3245"], ["paper", "Paper", "#f1ebdd"],
  ["snow", "Snow", "#f7f8fb"], ["sand", "Sand", "#e9d8b9"], ["blush", "Blush", "#f6c9d4"],
  ["mint", "Mint", "#bdebd6"], ["sky", "Sky", "#bfe3f7"], ["lavender", "Lavender", "#cfc2f5"],
  ["sun", "Sun", "#ffd36a"], ["coral", "Coral", "#ff7a6b"], ["forest", "Forest", "#0f3b2e"], ["wine", "Wine", "#4a0e24"],
];

const backgrounds = SOLIDS.map(([id, label, hex]) =>
  item(`solid-${id}`, label, "Backgrounds", "solid flat colour color background", { kind: "solid", name: label, colors: [hex, hex] }),
);

/* ───────────── gradients ───────────── */

const lin = (id: string, label: string, colors: string[], angle = 160): LibraryItem =>
  item(`lin-${id}`, label, "Gradients", "linear gradient background", { kind: "linear", name: label, colors, knobs: [angle, 1, 0, 0] });
const rad = (id: string, label: string, colors: string[], radius = 0.8): LibraryItem =>
  item(`rad-${id}`, label, "Gradients", "radial gradient background", { kind: "radial", name: label, colors, knobs: [0, 0, radius, 1] });

const gradients: LibraryItem[] = [
  lin("sunset", "Sunset", ["#ff7a59", "#ff3e7f", "#5b2a86"]),
  lin("ocean", "Ocean", ["#00c6ff", "#0072ff", "#021b79"]),
  lin("northern", "Northern", ["#0f2027", "#2c7a6b", "#7be0b5"]),
  lin("candy", "Candy", ["#ff9a9e", "#fad0c4", "#a18cd1"]),
  lin("night", "Night Fade", ["#05060f", "#1a1f4d"]),
  lin("peach", "Peach", ["#ffecd2", "#fcb69f"]),
  lin("lagoon", "Lagoon", ["#43cea2", "#185a9d"]),
  lin("ember", "Ember", ["#200122", "#6f0000", "#ff8a00"]),
  lin("mono", "Mono Fade", ["#000000", "#ffffff"]),
  lin("dusk", "Neon Dusk", ["#3a0ca3", "#f72585", "#4cc9f0"]),
  lin("steel", "Steel", ["#232526", "#414345"]),
  lin("spring", "Spring", ["#a8ff78", "#78ffd6"]),
  rad("spot", "Spotlight", ["#ffffff", "#10131c"]),
  rad("sun", "Sun Glow", ["#fff3b0", "#ff8a00", "#7a1c00"]),
  rad("space", "Deep Space", ["#1b2a6b", "#05060f"], 1),
  rad("moon", "Moon Glow", ["#dfe9ff", "#0a0f26"], 0.9),
  rad("rose", "Rose Bloom", ["#ffd1dc", "#d6336c", "#2b0a1c"]),
  item("con-rainbow", "Rainbow Wheel", "Gradients", "conic gradient colour wheel", {
    kind: "conic", name: "Rainbow Wheel", colors: ["#ff5f5f", "#ffd25f", "#5fff8f", "#5fd2ff", "#a05fff"], knobs: [0, 0, 0, 1],
  }),
  item("con-sunburst", "Sunburst", "Gradients", "conic gradient rays", {
    kind: "conic", name: "Sunburst", colors: ["#ffe29a", "#ff8a3d", "#ffe29a"], knobs: [0, 0, 0, 3],
  }),
  item("con-holo", "Holo Sweep", "Gradients", "conic gradient holographic", {
    kind: "conic", name: "Holo Sweep", colors: ["#ff9ad5", "#9ad1ff", "#c8ff9a", "#ff9ad5"], knobs: [0, 0, 0, 1],
  }),
  item("dia-glass", "Diamond Glass", "Gradients", "diamond gradient", {
    kind: "diamond", name: "Diamond Glass", colors: ["#fbbf24", "#f43f5e", "#1e1b4b"], knobs: [0, 0, 0.8, 0],
  }),
  item("spi-candy", "Candy Spiral", "Gradients", "spiral gradient swirl", {
    kind: "spiral", name: "Candy Spiral", colors: ["#ff5f9e", "#ffffff"], knobs: [4, 3, 0, 0],
  }),
  item("spi-hypno", "Hypno", "Gradients", "spiral gradient hypnotic", {
    kind: "spiral", name: "Hypno", colors: ["#000000", "#ffffff"], knobs: [6, 6, 0, 0],
  }),
];

/* ───────────── fields: every generator ───────────── */

const SCREEN_FIELDS = new Set<GeneratorId>(["stars", "bokeh", "rays", "electric", "aurora"]);

const fields = GENERATORS.map((g) =>
  item(`field-${g.id}`, g.name, "Fields", `${g.category} ${g.description} generator`, {
    kind: "field",
    name: g.name,
    generator: g.id,
    knobs: defaultKnobs(g.id),
    blend: SCREEN_FIELDS.has(g.id) ? "Screen" : "Normal",
    ownColors: false,
  }),
);

/* ───────────── patterns ───────────── */

const pat = (
  id: string,
  label: string,
  pattern: ShaderLayer["pattern"],
  knobs: [number, number, number, number],
  colors: string[],
  extra: Partial<ShaderLayer> = {},
): LibraryItem =>
  item(`pat-${id}`, label, "Patterns", `pattern ${pattern}`, { kind: "pattern", name: label, pattern, knobs, colors, ...extra });

const patterns: LibraryItem[] = [
  pat("pinstripe", "Pinstripes", "stripes", [10, 0.18, 0.06, 0], ["#000000", "#ffffff"], { fill: false, opacity: 0.6 }),
  pat("bold", "Bold Stripes", "stripes", [2.5, 0.5, 0.04, 0], ["#111827", "#f9fafb"]),
  pat("diagonal", "Diagonal Stripes", "stripes", [4, 0.5, 0.05, 45], ["#0f172a", "#fbbf24"]),
  pat("checker", "Checker", "checker", [2, 0.5, 0.1, 0], ["#101827", "#e5e7eb"]),
  pat("softcheck", "Soft Checker", "checker", [3, 0.5, 0.9, 45], ["#1e1b4b", "#a5b4fc"]),
  pat("polka", "Polka Dots", "dots", [2, 0.6, 0.08, 0], ["#fdf2f8", "#be185d"]),
  pat("halftone", "Halftone Dots", "dots", [5, 0.5, 0.5, 30], ["#000000", "#ffffff"], { fill: false, blend: "Overlay", opacity: 0.5 }),
  pat("grid", "Grid", "grid", [3, 0.1, 0.05, 0], ["#000000", "#8ab4ff"], { fill: false, opacity: 0.5 }),
  pat("finegrid", "Fine Grid", "grid", [8, 0.08, 0.05, 0], ["#000000", "#ffffff"], { fill: false, opacity: 0.35 }),
  pat("zigzag", "Zigzag", "zigzag", [3, 0.3, 0.08, 0], ["#0b132b", "#5bc0be"]),
  pat("rings", "Rings", "rings", [2, 0.35, 0.1, 0], ["#1b1b3a", "#ff6f91"]),
  pat("waves", "Waves", "waves", [3, 0.3, 0.1, 0], ["#03045e", "#90e0ef"]),
  pat("hatch", "Crosshatch", "hatch", [4, 0.18, 0.08, 0], ["#ffffff", "#000000"], { fill: false, blend: "Multiply", opacity: 0.5 }),
  pat("triangles", "Triangles", "triangles", [3, 0.5, 0.1, 0], ["#240046", "#9d4edd"]),
  pat("plus", "Plus Signs", "plus", [4, 0.5, 0.1, 0], ["#000000", "#ffffff"], { fill: false, opacity: 0.4 }),
  pat("scanlines", "Scanlines", "stripes", [26, 0.4, 0.3, 90], ["#ffffff", "#000000"], { fill: false, blend: "Multiply", opacity: 0.3, space: "Screen" }),
];

/* ───────────── light & atmosphere ───────────── */

const glow = (id: string, label: string, colors: string[], knobs: [number, number, number, number], opacity = 0.8, blend: ShaderLayer["blend"] = "Screen"): LibraryItem =>
  item(`glow-${id}`, label, "Light", "glow light bloom", { kind: "glow", name: label, colors, knobs, blend, opacity });

const vig = (id: string, label: string, color: string, knobs: [number, number, number, number], opacity: number, blend: ShaderLayer["blend"] = "Normal"): LibraryItem =>
  item(`vig-${id}`, label, "Light", "vignette edge frame", { kind: "vignette", name: label, colors: [color, color], knobs, opacity, blend });

const light: LibraryItem[] = [
  glow("soft", "Soft Glow", ["#6d5bff", "#ffffff"], [0, 0, 0.55, 1.6]),
  glow("warm", "Warm Glow", ["#ff7a18", "#fff1b8"], [0, 0, 0.55, 1.6]),
  glow("cool", "Cool Glow", ["#2a6cff", "#bfe9ff"], [0, 0, 0.55, 1.6]),
  glow("rose", "Rose Glow", ["#ff4d8d", "#ffd6e8"], [0, 0, 0.55, 1.6]),
  glow("corner", "Corner Glow", ["#7a5cff", "#ffffff"], [-0.55, 0.3, 0.7, 1.4]),
  glow("spot", "Spot", ["#ffffff", "#ffffff"], [0, 0.1, 0.35, 2.4], 0.6, "Add"),
  glow("leak", "Light Leak", ["#ff6a00", "#ffe08a"], [0.55, 0.35, 0.9, 1.2]),
  glow("bloom", "Lens Bloom", ["#ffffff", "#ffffff"], [0, 0, 1.2, 1.1], 0.5, "Soft Light"),
  vig("soft", "Vignette Soft", "#000000", [0.75, 0.7, 1, 0], 0.6),
  vig("heavy", "Vignette Heavy", "#000000", [0.55, 0.5, 1, 0], 0.9),
  vig("light", "Vignette Light", "#ffffff", [0.7, 0.8, 1, 0], 0.5),
  vig("color", "Vignette Colour", "#2a0a5a", [0.65, 0.7, 1, 0], 0.7),
  item("shade-top", "Top Shade", "Light", "gradient shade fade", {
    kind: "linear", name: "Top Shade", colors: ["#000000", "#000000"], knobs: [180, 1, 0, 0.3], fade: 1, opacity: 0.7,
  }),
  item("shade-bottom", "Bottom Shade", "Light", "gradient shade fade", {
    kind: "linear", name: "Bottom Shade", colors: ["#000000", "#000000"], knobs: [0, 1, 0, 0.3], fade: 1, opacity: 0.7,
  }),
];

/* ───────────── grain & noise ───────────── */

const grain = (id: string, label: string, knobs: [number, number, number, number], blend: ShaderLayer["blend"], opacity: number): LibraryItem =>
  item(`grain-${id}`, label, "Texture", "grain film noise", { kind: "grain", name: label, knobs, blend, opacity });

const texture: LibraryItem[] = [
  grain("film", "Film Grain", [0.5, 1.2, 0, 0.6], "Overlay", 0.6),
  grain("fine", "Fine Grain", [0.4, 0.8, 0, 0.4], "Soft Light", 0.6),
  grain("coarse", "Coarse Grain", [0.6, 2.4, 0, 0.5], "Overlay", 0.5),
  grain("colour", "Colour Grain", [0.5, 1.2, 1, 0.6], "Overlay", 0.5),
  grain("paper", "Paper Grain", [0.7, 2.4, 0, 0], "Multiply", 0.25),
  grain("static", "TV Static", [1, 1.5, 1, 1], "Add", 0.2),
  item("noise-cloud", "Cloud Noise", "Texture", "noise clouds", {
    kind: "noise", name: "Cloud Noise", colors: ["#0b1020", "#cfe3ff"], knobs: [1.4, 0.8, 1.2, 0.5], blend: "Soft Light", opacity: 0.5,
  }),
  item("noise-smoke", "Smoke Noise", "Texture", "noise smoke", {
    kind: "noise", name: "Smoke Noise", colors: ["#000000", "#ffffff"], knobs: [2, 0.9, 2, 0.8], blend: "Screen", opacity: 0.3, keyed: true,
  }),
  item("noise-fog", "Fog", "Texture", "noise fog haze mist", {
    kind: "noise", name: "Fog", colors: ["#ffffff", "#ffffff"], knobs: [0.8, 0.7, 1, 0.3], blend: "Screen", opacity: 0.35, keyed: true,
  }),
  item("noise-dust", "Dust", "Texture", "noise dust specks", {
    kind: "noise", name: "Dust", colors: ["#000000", "#ffffff"], knobs: [4, 0.6, 3, 0.2], blend: "Screen", opacity: 0.25, keyed: true,
  }),
  item("noise-marble", "Marble", "Texture", "marble stone veins", {
    kind: "field", name: "Marble", generator: "fluid", knobs: [1.1, 1.2, 1, 1], ownColors: true, colors: ["#f5f5f4", "#a8a29e", "#292524"],
  }),
  item("noise-cells", "Cell Noise", "Texture", "voronoi cells", {
    kind: "field", name: "Cell Noise", generator: "voronoi", knobs: defaultKnobs("voronoi"), blend: "Overlay", opacity: 0.6, ownColors: false,
  }),
];

/* ───────────── recipes ───────────── */

const recipes: LibraryItem[] = [
  item("rec-film", "Film Look", "Recipes", "vignette grain warm cinematic",
    { kind: "grain", name: "Film grain", blend: "Overlay", opacity: 0.5, knobs: [0.5, 1.2, 0, 0.6] },
    { kind: "glow", name: "Warm bloom", blend: "Screen", opacity: 0.3, colors: ["#ff7a18", "#fff1b8"], knobs: [0, 0, 0.9, 1.4] },
    { kind: "vignette", name: "Vignette", opacity: 0.55, knobs: [0.7, 0.7, 1, 0] }),
  item("rec-neon", "Neon Night", "Recipes", "scanlines grid glow synthwave",
    { kind: "pattern", name: "Scanlines", pattern: "stripes", blend: "Multiply", opacity: 0.3, fill: false, space: "Screen", colors: ["#ffffff", "#000000"], knobs: [26, 0.4, 0.3, 90] },
    { kind: "pattern", name: "Grid", pattern: "grid", blend: "Screen", opacity: 0.35, fill: false, colors: ["#000000", "#2fe1ff"], knobs: [3, 0.06, 0.05, 0] },
    { kind: "glow", name: "Cyan glow", blend: "Screen", opacity: 0.6, colors: ["#2a6cff", "#bfe9ff"], knobs: [0.3, -0.2, 0.8, 1.5] }),
  item("rec-paper", "Paper Print", "Recipes", "paper multiply halftone",
    { kind: "grain", name: "Paper tooth", blend: "Multiply", opacity: 0.35, knobs: [0.7, 2.2, 0, 0.15] },
    { kind: "solid", name: "Paper tint", blend: "Multiply", opacity: 0.92, colors: ["#f3ead6", "#f3ead6"] }),
  item("rec-haze", "Dream Haze", "Recipes", "bloom soft pastel haze",
    { kind: "grain", name: "Film grain", blend: "Overlay", opacity: 0.4, knobs: [0.6, 1.4, 0.1, 0.5] },
    { kind: "glow", name: "Bloom", blend: "Screen", opacity: 0.7, colors: ["#ff9ad5", "#ffffff"], knobs: [-0.35, 0.2, 0.75, 1.6] },
    { kind: "noise", name: "Haze", blend: "Soft Light", opacity: 0.45, colors: ["#6a5acd", "#ffe6f7"], knobs: [1.2, 0.8, 1.2, 0.5] }),
  item("rec-glass", "Glass Light", "Recipes", "sheen reflection overlay",
    { kind: "vignette", name: "Frame", opacity: 0.4, knobs: [0.8, 0.8, 1, 0] },
    { kind: "glow", name: "Highlight", blend: "Screen", opacity: 0.5, colors: ["#ffffff", "#ffffff"], knobs: [-0.4, 0.3, 0.6, 1.8] },
    { kind: "linear", name: "Sheen", blend: "Overlay", opacity: 0.5, colors: ["#ffffff", "#000000"], knobs: [135, 1, 0, 0] }),
  item("rec-frame", "Dark Frame", "Recipes", "shade vignette cinematic",
    { kind: "vignette", name: "Vignette", opacity: 0.9, knobs: [0.55, 0.5, 1, 0] },
    { kind: "linear", name: "Top shade", colors: ["#000000", "#000000"], knobs: [180, 1, 0, 0.3], fade: 1, opacity: 0.6 },
    { kind: "linear", name: "Bottom shade", colors: ["#000000", "#000000"], knobs: [0, 1, 0, 0.3], fade: 1, opacity: 0.6 }),
];

export const LIBRARY_ITEMS: LibraryItem[] = [...backgrounds, ...gradients, ...fields, ...patterns, ...light, ...texture, ...recipes];

export function librarySearch(items: LibraryItem[], family: LibraryFamily | "All", query: string): LibraryItem[] {
  const q = query.trim().toLowerCase();
  return items.filter(
    (it) => (family === "All" || it.family === family) && (!q || `${it.label} ${it.tags} ${it.family}`.toLowerCase().includes(q)),
  );
}

/** Real layers for an item, ready to insert. */
export function libraryLayers(it: LibraryItem): ShaderLayer[] {
  return it.layers.map((preset) => newLayer(preset.kind, preset));
}

/* ───────────── thumbnails ───────────── */

/** Items that can be drawn with plain CSS (no shader bake needed). */
export function cssSwatch(it: LibraryItem): string | null {
  if (it.layers.length !== 1) return null;
  const layer = it.layers[0] as LayerPreset;
  const colors = layer.colors ?? [];
  if (colors.length === 0) return null;
  const stops = toStops(colors, layer.positions ?? []);
  if ((layer.fade ?? 0) > 0 || (layer.opacity ?? 1) < 0.99) return null;
  if (layer.kind === "solid") return colors[0] ?? null;
  if (layer.kind === "linear") return cssGradient(stops, 1, layer.knobs?.[0] ?? 160);
  if (layer.kind === "radial") {
    const body = [...stops].sort((a, b) => a.pos - b.pos).map((s) => `${s.color} ${(s.pos * 100).toFixed(1)}%`).join(", ");
    return `radial-gradient(circle at 50% 50%, ${body})`;
  }
  if (layer.kind === "conic") {
    const body = [...stops].sort((a, b) => a.pos - b.pos).map((s) => `${s.color} ${(s.pos * 100).toFixed(1)}%`).join(", ");
    return `conic-gradient(from 0deg, ${body})`;
  }
  return null;
}

/** A small project that shows one library item on a neutral dark backdrop. */
export function thumbProject(it: LibraryItem): ShaderProject {
  const isRecipe = it.family === "Recipes";
  const backdrop = newLayer("linear", { name: "Backdrop", colors: ["#2d365a", "#10142a"], knobs: [160, 1, 0, 0] });
  const layers: ShaderLayer[] = isRecipe
    ? [...libraryLayers(it), newBaseLayer()]
    : [...libraryLayers(it), backdrop, newBaseLayer({ visible: false })];
  return normalizeProject({
    ...DEFAULT_PROJECT,
    name: it.label,
    vignette: 0,
    grain: 0,
    layers,
  });
}
