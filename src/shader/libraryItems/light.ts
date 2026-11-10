import { ITEMS_PER_FAMILY, familyMaker, type BlendMode, type Knob4, type LibraryItem } from "../libraryCore";
import { SHADER_PRESETS } from "../presets";
import type { GeneratorId } from "../types";

const make = familyMaker("Light", "light");

/* ───────────── glows: 14 colours × (centre, corner) ───────────── */

const GLOWS: Array<[label: string, edge: string, core: string]> = [
  ["Violet", "#6d5bff", "#ffffff"], ["Amber", "#ff7a18", "#fff1b8"], ["Azure", "#2a6cff", "#bfe9ff"], ["Rose", "#ff4d8d", "#ffd6e8"],
  ["Mint", "#10b981", "#d1ffe8"], ["Gold", "#e0a82e", "#fff6d0"], ["Sunset", "#ff3e7f", "#ffd166"], ["Aqua", "#00b8d4", "#e0ffff"],
  ["Lime", "#6bd100", "#f4ffb0"], ["Fuchsia", "#d61fd6", "#ffd6fb"], ["Ice", "#4fb3d6", "#ffffff"], ["Ember", "#ff3b00", "#ffe08a"],
  ["Lilac", "#a392e0", "#faf7ff"], ["Pure White", "#ffffff", "#ffffff"],
];

const glowGroup = make("Glows");
const glows: LibraryItem[] = GLOWS.flatMap(([label, edge, core], i) => {
  const corner: [number, number] = [[-0.55, 0.3], [0.55, 0.3], [-0.55, -0.25], [0.55, -0.25]][i % 4] as [number, number];
  return [
    glowGroup(`${label} Glow`, "glow light bloom soft centre", {
      kind: "glow", name: `${label} Glow`, colors: [edge, core], knobs: [0, 0, 0.55, 1.6] as Knob4, blend: "Screen", opacity: 0.8,
    }),
    glowGroup(`${label} Corner Glow`, "glow light bloom corner edge", {
      kind: "glow", name: `${label} Corner Glow`, colors: [edge, core], knobs: [corner[0], corner[1], 0.7, 1.4] as Knob4, blend: "Screen", opacity: 0.8,
    }),
  ];
});

/* ───────────── light leaks ───────────── */

const LEAKS: Array<[label: string, edge: string, core: string, x: number, y: number, radius: number, blend: BlendMode]> = [
  ["Amber Leak", "#ff6a00", "#ffe08a", 0.55, 0.35, 0.9, "Screen"], ["Rose Leak", "#ff3d7f", "#ffd1e0", -0.6, 0.3, 0.95, "Screen"],
  ["Teal Leak", "#00a6a6", "#c8fff2", 0.6, -0.3, 0.9, "Screen"], ["Gold Leak", "#e0a82e", "#fff6d0", -0.55, -0.3, 1, "Screen"],
  ["Violet Leak", "#6a2cf0", "#e5d4ff", 0.6, 0.3, 1, "Screen"], ["Sunset Leak", "#ff3e7f", "#ffd166", -0.65, 0.2, 1.1, "Screen"],
  ["Magenta Leak", "#d61fd6", "#ffd6fb", 0.65, -0.2, 0.9, "Add"], ["Cyan Leak", "#00d4ff", "#e0ffff", -0.6, -0.25, 0.85, "Add"],
  ["Orange Flare", "#ff7a18", "#fff1b8", 0.8, 0.1, 0.7, "Add"], ["Pink Flare", "#ff6fb5", "#ffffff", -0.8, 0.15, 0.7, "Add"],
  ["Blue Flare", "#2a6cff", "#ffffff", 0.75, -0.35, 0.75, "Add"], ["White Flare", "#ffffff", "#ffffff", -0.7, 0.35, 0.55, "Add"],
  ["Green Leak", "#14b86a", "#d9ffe9", 0.55, 0.4, 0.9, "Screen"], ["Red Leak", "#e11d48", "#ffd0d8", -0.6, -0.3, 0.95, "Screen"],
];

const leakGroup = make("Light Leaks");
const leaks: LibraryItem[] = LEAKS.map(([label, edge, core, x, y, radius, blend]) =>
  leakGroup(label, "light leak flare lens film edge", {
    kind: "glow", name: label, colors: [edge, core], knobs: [x, y, radius, 1.2] as Knob4, blend, opacity: blend === "Add" ? 0.6 : 0.8,
  }),
);

/* ───────────── vignettes ───────────── */

const VIGNETTES: Array<[label: string, color: string, radius: number, softness: number, roundness: number, opacity: number, blend: BlendMode]> = [
  ["Black Whisper", "#000000", 0.85, 0.8, 1, 0.35, "Normal"], ["Black Soft", "#000000", 0.75, 0.7, 1, 0.6, "Normal"],
  ["Black Medium", "#000000", 0.65, 0.6, 1, 0.75, "Normal"], ["Black Heavy", "#000000", 0.55, 0.5, 1, 0.9, "Normal"],
  ["Black Tunnel", "#000000", 0.35, 0.45, 1, 0.95, "Normal"], ["Wide Frame", "#000000", 0.7, 0.5, 1.6, 0.7, "Normal"],
  ["Tall Frame", "#000000", 0.7, 0.5, 0.6, 0.7, "Normal"], ["White Fade", "#ffffff", 0.7, 0.8, 1, 0.5, "Normal"],
  ["White Frost", "#ffffff", 0.55, 0.6, 1, 0.75, "Normal"], ["Violet Edge", "#2a0a5a", 0.65, 0.7, 1, 0.7, "Normal"],
  ["Navy Edge", "#031a3a", 0.65, 0.7, 1, 0.75, "Normal"], ["Wine Edge", "#3a0615", 0.65, 0.7, 1, 0.75, "Normal"],
  ["Forest Edge", "#06231a", 0.65, 0.7, 1, 0.75, "Normal"], ["Sepia Edge", "#3a2410", 0.7, 0.8, 1, 0.65, "Normal"],
  ["Teal Edge", "#03343a", 0.65, 0.7, 1, 0.7, "Normal"], ["Rose Edge", "#6a1030", 0.7, 0.8, 1, 0.55, "Normal"],
  ["Multiply Shade", "#10131c", 0.6, 0.7, 1, 0.9, "Multiply"], ["Soft Light Frame", "#000000", 0.55, 0.9, 1, 0.8, "Soft Light"],
  ["Overlay Burn", "#000000", 0.6, 0.8, 1, 0.8, "Overlay"], ["Colour Burn Rim", "#1a0a40", 0.6, 0.8, 1, 0.55, "Color Burn"],
];

const vigGroup = make("Vignettes");
const vignettes: LibraryItem[] = VIGNETTES.map(([label, color, radius, softness, roundness, opacity, blend]) =>
  vigGroup(label, "vignette edge frame darken tint", {
    kind: "vignette", name: label, colors: [color, color], knobs: [radius, softness, roundness, 0] as Knob4, opacity, blend,
  }),
);

/* ───────────── shades & fades: a colour that fades away from one side ───────────── */

const SHADES: Array<[label: string, color: string, angle: number, opacity: number]> = [
  ["Top Shade", "#000000", 180, 0.7], ["Bottom Shade", "#000000", 0, 0.7], ["Left Shade", "#000000", 90, 0.7], ["Right Shade", "#000000", 270, 0.7],
  ["Top Light", "#ffffff", 180, 0.6], ["Bottom Light", "#ffffff", 0, 0.6], ["Left Light", "#ffffff", 90, 0.6], ["Right Light", "#ffffff", 270, 0.6],
  ["Corner Shade TL", "#000000", 135, 0.7], ["Corner Shade BR", "#000000", 315, 0.7],
  ["Amber Top Wash", "#ff9d2e", 180, 0.55], ["Violet Bottom Wash", "#6a2cf0", 0, 0.6], ["Teal Left Wash", "#00a6a6", 90, 0.55], ["Rose Right Wash", "#ff4d8d", 270, 0.55],
];

const shadeGroup = make("Shades & Fades");
const shades: LibraryItem[] = SHADES.map(([label, color, angle, opacity]) =>
  shadeGroup(label, "gradient shade fade wash side", {
    kind: "linear", name: label, colors: [color, color], knobs: [angle, 1, 0, 0.3] as Knob4, fade: 1, opacity,
  }),
);

/* ───────────── beams & sparkle: generators made of light, taken from the built-in looks ───────────── */

const LIGHT_GENERATORS = new Set<GeneratorId>(["rays", "stars", "bokeh", "electric", "aurora", "plasma", "caustics"]);
const beamGroup = make("Beams & Sparkle");
const needed = ITEMS_PER_FAMILY - glows.length - leaks.length - vignettes.length - shades.length;
const beamPool = SHADER_PRESETS.filter(
  (p) => LIGHT_GENERATORS.has(p.project.generator) && p.project.layers.length === 1 && !p.project.mask.enabled,
);
/* take generators in turn so rays, stars, bokeh, aurora … are all represented */
const buckets = [...LIGHT_GENERATORS].map((id) => beamPool.filter((p) => p.project.generator === id));
const beams: LibraryItem[] = [];
for (let r = 0; beams.length < needed && r < 40; r++) {
  for (const bucket of buckets) {
    const preset = bucket[r];
    if (!preset || beams.length >= needed) continue;
    beams.push(
      beamGroup(preset.name, `light beam sparkle ${preset.tag} ${preset.project.generator} screen overlay`, {
        kind: "field",
        name: preset.name,
        generator: preset.project.generator,
        knobs: preset.project.knobs.slice(0, 4) as Knob4,
        colors: [...preset.project.palette],
        ownColors: true,
        blend: "Screen",
        opacity: 0.9,
      }),
    );
  }
}

export const LIGHT_ITEMS: LibraryItem[] = [...glows, ...leaks, ...vignettes, ...shades, ...beams];
