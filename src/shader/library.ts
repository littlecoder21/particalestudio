/**
 * Elements library.
 *
 * Seven families of exactly 100 ready-made layers each — 700 in total — and every
 * family is organised into named groups (shelves) so they are easy to browse:
 *
 *   Backgrounds  flat colours and soft duotone fades
 *   Gradients    linear, radial, conic, diamond and spiral ramps
 *   Fields       every procedural generator, plus coloured variants of each
 *   Patterns     ten pattern types in ten styles, as backdrops or overlays
 *   Light        glows, light leaks, vignettes, shades and beams
 *   Texture      grain, clouds, fog, dust, stone, cells and paper
 *   Recipes      finished looks that add several layers at once
 *
 * Pick one as a background or stack as many as you like — blend modes and opacity do
 * the rest. The data lives in ./libraryItems (one file per family); this module puts
 * the families together and provides search, insertion and thumbnail helpers.
 */
import { DEFAULT_PROJECT, normalizeProject } from "./project";
import { newBaseLayer, newLayer } from "./stack";
import { cssGradient, toStops } from "./stops";
import type { ShaderLayer, ShaderProject } from "./types";
import { LIBRARY_FAMILIES, groupsOf, type LayerPreset, type LibraryFamily, type LibraryItem } from "./libraryCore";
import { BACKGROUND_ITEMS } from "./libraryItems/backgrounds";
import { FIELD_ITEMS } from "./libraryItems/fields";
import { GRADIENT_ITEMS } from "./libraryItems/gradients";
import { LIGHT_ITEMS } from "./libraryItems/light";
import { PATTERN_ITEMS } from "./libraryItems/patterns";
import { RECIPE_ITEMS } from "./libraryItems/recipes";
import { TEXTURE_ITEMS } from "./libraryItems/texture";

export { LIBRARY_FAMILIES, ITEMS_PER_FAMILY } from "./libraryCore";
export type { LayerPreset, LibraryFamily, LibraryItem } from "./libraryCore";

/** Families in display order. */
export const LIBRARY_ITEMS: LibraryItem[] = [
  ...BACKGROUND_ITEMS,
  ...GRADIENT_ITEMS,
  ...FIELD_ITEMS,
  ...PATTERN_ITEMS,
  ...LIGHT_ITEMS,
  ...TEXTURE_ITEMS,
  ...RECIPE_ITEMS,
];

/** The shelves of each family, in display order. */
export const LIBRARY_GROUPS: Record<LibraryFamily, string[]> = Object.fromEntries(
  LIBRARY_FAMILIES.map((family) => [family, groupsOf(LIBRARY_ITEMS.filter((it) => it.family === family))]),
) as Record<LibraryFamily, string[]>;

export function librarySearch(
  items: LibraryItem[],
  family: LibraryFamily | "All",
  query: string,
  group: string | "All" = "All",
): LibraryItem[] {
  const q = query.trim().toLowerCase();
  return items.filter(
    (it) =>
      (family === "All" || it.family === family) &&
      (group === "All" || family === "All" || it.group === group) &&
      (!q || `${it.label} ${it.group} ${it.tags} ${it.family}`.toLowerCase().includes(q)),
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
  const body = (): string => [...stops].sort((a, b) => a.pos - b.pos).map((s) => `${s.color} ${(s.pos * 100).toFixed(1)}%`).join(", ");
  const k = layer.knobs ?? [];
  if (layer.kind === "solid") return colors[0] ?? null;
  if (layer.kind === "linear") return (k[1] ?? 1) === 1 ? cssGradient(stops, 1, k[0] ?? 160) : null;
  if (layer.kind === "radial") {
    const centred = (k[0] ?? 0) === 0 && (k[1] ?? 0) === 0 && (k[3] ?? 1) === 1;
    return centred ? `radial-gradient(circle at 50% 50%, ${body()})` : null;
  }
  if (layer.kind === "conic") {
    return (k[3] ?? 1) === 1 && (k[0] ?? 0) === 0 && (k[1] ?? 0) === 0 ? `conic-gradient(from ${k[2] ?? 0}deg, ${body()})` : null;
  }
  return null;
}

const DARKENING = new Set<string>(["Darken", "Multiply", "Color Burn", "Linear Burn", "Subtract"]);
const CONTRASTING = new Set<string>(["Overlay", "Soft Light", "Hard Light", "Vivid Light", "Linear Light", "Pin Light"]);

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const n = parseInt(m[1] as string, 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/**
 * The backdrop a thumbnail is drawn on. Light-adding elements read best on the dark default,
 * but anything that darkens (multiply, black vignettes and shades) needs a light surface, and
 * contrast blends (overlay, soft light — grain, clouds) need a mid-grey one to show up at all.
 */
function thumbBackdrop(it: LibraryItem): [string, string] {
  const main = it.layers[0] as LayerPreset;
  const blend = main.blend ?? "Normal";
  if (DARKENING.has(blend)) return ["#e6eaf3", "#a9b2ca"];
  if (CONTRASTING.has(blend)) return ["#939cb6", "#626b88"];
  const dims = main.kind === "vignette" || (main.kind === "linear" && (main.fade ?? 0) > 0);
  if (dims && luminance(main.colors?.[0] ?? "#000000") < 0.4) return ["#e6eaf3", "#a9b2ca"];
  return ["#2d365a", "#10142a"];
}

/** A small project that shows one library item on a neutral backdrop. */
export function thumbProject(it: LibraryItem): ShaderProject {
  const isRecipe = it.family === "Recipes";
  const backdrop = newLayer("linear", { name: "Backdrop", colors: thumbBackdrop(it), knobs: [160, 1, 0, 0] });
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
