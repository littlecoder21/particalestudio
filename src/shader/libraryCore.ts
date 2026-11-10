/**
 * Shared types and helpers for the Elements library.
 *
 * The library is split by family (one file per family under ./libraryItems), each
 * holding exactly 100 items that are organised into named groups. library.ts puts
 * the families together and keeps the public API the panel and thumbnails use.
 */
import type { BlendMode, LayerKind, ShaderLayer } from "./types";

export type LayerPreset = Partial<ShaderLayer> & { kind: LayerKind };

export const LIBRARY_FAMILIES = ["Backgrounds", "Gradients", "Fields", "Patterns", "Light", "Texture", "Recipes"] as const;
export type LibraryFamily = (typeof LIBRARY_FAMILIES)[number];

/** How many items every family holds. */
export const ITEMS_PER_FAMILY = 100;

export interface LibraryItem {
  id: string;
  label: string;
  family: LibraryFamily;
  /** the shelf inside the family the item is filed under (e.g. "Darks", "Radial") */
  group: string;
  /** extra words the search box matches */
  tags: string;
  /** one layer, or several for a recipe (top layer first) */
  layers: LayerPreset[];
}

export type Knob4 = [number, number, number, number];
export type { BlendMode };

export const slug = (text: string): string =>
  text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** A maker bound to one family; call the result with a group to get an item factory. */
export const familyMaker = (family: LibraryFamily, prefix: string) =>
  (group: string) =>
    (label: string, tags: string, ...layers: LayerPreset[]): LibraryItem => ({
      id: `${prefix}-${slug(group)}-${slug(label)}`,
      label,
      family,
      group,
      tags: `${group} ${tags}`,
      layers,
    });

/** A closed colour loop: the last stop repeats the first so a conic or spiral sweep has no seam. */
export const loop = (colors: readonly string[]): string[] => [...colors, colors[0] as string];

/** The group names of one family, in the order their first item appears. */
export function groupsOf(items: readonly LibraryItem[]): string[] {
  const seen: string[] = [];
  for (const it of items) if (!seen.includes(it.group)) seen.push(it.group);
  return seen;
}
