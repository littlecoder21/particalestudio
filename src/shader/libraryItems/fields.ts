import { GENERATORS, defaultKnobs } from "../generators";
import { ITEMS_PER_FAMILY, familyMaker, type Knob4, type LibraryItem } from "../libraryCore";
import { SHADER_PRESETS } from "../presets";
import { GENERATOR_CATEGORIES, type BlendMode, type GeneratorId } from "../types";

const make = familyMaker("Fields", "field");

/** Fields made of light sit on top of other layers — they look best added with Screen. */
const SCREEN_FIELDS = new Set<GeneratorId>(["stars", "bokeh", "rays", "electric", "aurora"]);
const blendFor = (id: GeneratorId): BlendMode => (SCREEN_FIELDS.has(id) ? "Screen" : "Normal");

/* One "raw" field per generator: default knobs, painted with the project palette. */
const rawFields: LibraryItem[] = GENERATORS.map((g) =>
  make(g.category)(g.name, `${g.category} ${g.description} generator palette`, {
    kind: "field",
    name: g.name,
    generator: g.id,
    knobs: defaultKnobs(g.id),
    blend: blendFor(g.id),
    ownColors: false,
  }),
);

/* The rest are coloured variants taken from the built-in presets that are a single field
   (no masks, overlays or extra layers). They carry their own colours, so they look the same
   whatever the project palette is. Generators are visited round-robin across categories so
   every shelf gets a share. */
const rawNames = new Set(GENERATORS.map((g) => g.name.toLowerCase()));
const singles = SHADER_PRESETS.filter(
  (p) => p.project.layers.length === 1 && !p.project.mask.enabled && !rawNames.has(p.name.toLowerCase()),
);

/* per category: candidates ordered so every generator gets one before any gets a second */
const candidates = GENERATOR_CATEGORIES.map((category) => {
  const lists = GENERATORS.filter((g) => g.category === category).map((g) => singles.filter((p) => p.project.generator === g.id));
  const depth = Math.max(0, ...lists.map((l) => l.length));
  const ordered: typeof singles = [];
  for (let r = 0; r < depth; r++) for (const list of lists) if (list[r]) ordered.push(list[r] as (typeof singles)[number]);
  return { category, ordered, used: 0 };
});

const wanted = ITEMS_PER_FAMILY - rawFields.length;
const variants: LibraryItem[] = [];
while (variants.length < wanted) {
  let added = false;
  for (const c of candidates) {
    const preset = c.ordered[c.used];
    if (!preset || variants.length >= wanted) continue;
    c.used++;
    added = true;
    const gen = preset.project.generator;
    variants.push(
      make(c.category)(preset.name, `${c.category} ${preset.tag} ${gen} coloured variant`, {
        kind: "field",
        name: preset.name,
        generator: gen,
        knobs: preset.project.knobs.slice(0, 4) as Knob4,
        colors: [...preset.project.palette],
        ownColors: true,
        blend: blendFor(gen),
      }),
    );
  }
  if (!added) break;
}

/* shelf order = category order, the raw generator first inside each shelf */
export const FIELD_ITEMS: LibraryItem[] = GENERATOR_CATEGORIES.flatMap((category) => [
  ...rawFields.filter((it) => it.group === category),
  ...variants.filter((it) => it.group === category),
]);
