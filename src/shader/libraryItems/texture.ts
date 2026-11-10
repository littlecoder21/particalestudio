import { familyMaker, type BlendMode, type Knob4, type LibraryItem } from "../libraryCore";
import type { GeneratorId } from "../types";

const make = familyMaker("Texture", "tex");

/* ───────────── grain: [amount, size, colour, flicker] ───────────── */

const GRAIN: Array<[label: string, knobs: Knob4, blend: BlendMode, opacity: number]> = [
  ["Film Grain", [0.5, 1.2, 0, 0.6], "Overlay", 0.6], ["Fine Grain", [0.4, 0.8, 0, 0.4], "Soft Light", 0.6],
  ["Coarse Grain", [0.6, 2.4, 0, 0.5], "Overlay", 0.5], ["Colour Grain", [0.5, 1.2, 1, 0.6], "Overlay", 0.5],
  ["Paper Grain", [0.7, 2.4, 0, 0], "Multiply", 0.25], ["TV Static", [1, 1.5, 1, 1], "Add", 0.2],
  ["Silver Halide", [0.45, 1, 0, 0.3], "Soft Light", 0.8], ["Pushed Film", [0.8, 1.8, 0, 0.7], "Overlay", 0.7],
  ["Super 16", [0.65, 2, 0.3, 0.8], "Overlay", 0.6], ["Newsprint", [0.6, 3, 0, 0], "Multiply", 0.3],
  ["Sand Grit", [0.75, 3.6, 0, 0], "Overlay", 0.45], ["Photocopy", [0.9, 2.2, 0, 0.2], "Multiply", 0.4],
  ["Riso Speckle", [0.7, 2.8, 0.6, 0], "Multiply", 0.35], ["Soft Bloom Grain", [0.35, 1.6, 0.2, 0.4], "Soft Light", 0.9],
  ["Low-light Noise", [0.85, 1.4, 0.5, 1], "Overlay", 0.55], ["VHS Noise", [0.7, 2.2, 0.8, 1], "Screen", 0.18],
  ["CRT Fuzz", [0.9, 1.2, 0.4, 1], "Add", 0.14], ["Gritty Dark", [1, 2, 0, 0.3], "Multiply", 0.35],
  ["Clean Fine", [0.2, 0.6, 0, 0.2], "Soft Light", 0.7], ["Heavy Overlay", [1, 1.6, 0, 0.6], "Hard Light", 0.35],
];

const grainGroup = make("Grain");
const grain = GRAIN.map(([label, knobs, blend, opacity]) =>
  grainGroup(label, "grain film noise speckle", { kind: "grain", name: label, knobs, blend, opacity }),
);

/* ───────────── clouds: soft noise through a two- or three-colour ramp ───────────── */

type CloudSpec = [label: string, colors: string[], knobs: Knob4, blend: BlendMode, opacity: number, keyed?: boolean];

const CLOUDS: CloudSpec[] = [
  ["Cloud Noise", ["#0b1020", "#cfe3ff"], [1.4, 0.8, 1.2, 0.5], "Soft Light", 0.5], ["Storm Clouds", ["#05070d", "#4a5568", "#cbd5e1"], [1.1, 0.9, 1.6, 0.8], "Overlay", 0.6],
  ["Cirrus", ["#3a6ea5", "#ffffff"], [0.7, 0.5, 1.2, 0.3], "Soft Light", 0.55], ["Cumulus", ["#4f8fd6", "#ffffff"], [1.5, 0.8, 1.8, 0.4], "Overlay", 0.5],
  ["Dusk Clouds", ["#2a0f4a", "#ff7a6e", "#ffd2a1"], [1.2, 0.7, 1.3, 0.5], "Soft Light", 0.7], ["Violet Clouds", ["#10043a", "#8e7bff", "#efeaff"], [1.3, 0.8, 1.4, 0.5], "Overlay", 0.5],
  ["Peach Clouds", ["#a8503a", "#ffcaa0", "#fff3e6"], [1.2, 0.7, 1.2, 0.4], "Soft Light", 0.7], ["Mint Clouds", ["#0a3a30", "#52c2a0", "#f4fffa"], [1.3, 0.7, 1.3, 0.4], "Soft Light", 0.6],
  ["Rose Clouds", ["#4a1245", "#f59ab8", "#fff0f5"], [1.2, 0.8, 1.2, 0.5], "Soft Light", 0.65], ["Golden Clouds", ["#3a1a00", "#ffae3d", "#fff0c8"], [1.1, 0.7, 1.3, 0.4], "Overlay", 0.5],
  ["Slate Clouds", ["#080b10", "#4f5d78", "#eef2f9"], [1.6, 0.9, 1.5, 0.6], "Overlay", 0.55], ["Cotton Wool", ["#e8ebf0", "#ffffff"], [2.2, 0.6, 1, 0.3], "Soft Light", 0.6],
  ["Billow", ["#000000", "#ffffff"], [0.9, 1, 2, 0.5], "Soft Light", 0.5], ["Wispy", ["#000000", "#ffffff"], [3, 0.4, 2.4, 0.9], "Screen", 0.25],
  ["Heavy Overcast", ["#0a0a0b", "#6e6e78"], [0.8, 0.6, 1, 0.2], "Multiply", 0.6], ["Teal Haze", ["#00141a", "#00a6a6", "#e0fff6"], [1.3, 0.7, 1.2, 0.5], "Soft Light", 0.6],
  ["Ember Clouds", ["#120502", "#c2501a", "#f6e2a0"], [1.2, 0.8, 1.5, 0.7], "Overlay", 0.5], ["Ice Mist", ["#06141f", "#4fb3d6", "#ffffff"], [1.2, 0.7, 1.1, 0.4], "Soft Light", 0.7],
  ["Lavender Drift", ["#5a4a9a", "#dcd2f8", "#ffffff"], [1.5, 0.6, 1.1, 0.4], "Soft Light", 0.65], ["Neon Nebula", ["#02020c", "#ff2fa0", "#00e5ff"], [1.4, 0.9, 1.6, 0.8], "Screen", 0.35],
];

const cloudGroup = make("Clouds");
const clouds = CLOUDS.map(([label, colors, knobs, blend, opacity]) =>
  cloudGroup(label, "noise clouds sky soft", { kind: "noise", name: label, colors, knobs, blend, opacity }),
);

/* ───────────── fog & smoke: keyed noise, so only the bright wisps remain ───────────── */

const FOG: CloudSpec[] = [
  ["Smoke Noise", ["#000000", "#ffffff"], [2, 0.9, 2, 0.8], "Screen", 0.3, true], ["Fog", ["#ffffff", "#ffffff"], [0.8, 0.7, 1, 0.3], "Screen", 0.35, true],
  ["Ground Fog", ["#000000", "#dfe8f2"], [0.7, 0.6, 1.4, 0.3], "Screen", 0.45, true], ["Morning Mist", ["#000000", "#fff4e0"], [0.9, 0.7, 1.2, 0.4], "Screen", 0.4, true],
  ["Cold Smoke", ["#000000", "#9ec9ff"], [1.8, 0.9, 2, 0.9], "Screen", 0.35, true], ["Warm Smoke", ["#000000", "#ffb27a"], [1.8, 0.9, 2, 0.9], "Screen", 0.35, true],
  ["Violet Haze", ["#000000", "#b18cff"], [1.2, 0.7, 1.5, 0.5], "Screen", 0.4, true], ["Green Mist", ["#000000", "#8ff0b8"], [1.1, 0.7, 1.4, 0.4], "Screen", 0.35, true],
  ["Ash Cloud", ["#000000", "#b4b4be"], [1.4, 0.9, 1.8, 0.6], "Screen", 0.4, true], ["Incense", ["#000000", "#ffffff"], [2.6, 0.5, 2.6, 1.2], "Screen", 0.3, true],
  ["Steam", ["#000000", "#ffffff"], [1.5, 0.6, 1.2, 1.5], "Screen", 0.4, true], ["Dry Ice", ["#000000", "#cdeeff"], [1, 0.7, 1.3, 0.8], "Screen", 0.5, true],
  ["Rose Haze", ["#000000", "#ff9ec2"], [1, 0.6, 1.2, 0.4], "Screen", 0.4, true], ["Blue Smog", ["#000000", "#5b8cff"], [0.8, 0.8, 1.6, 0.4], "Screen", 0.4, true],
  ["Fire Smoke", ["#000000", "#ff6a1a"], [1.6, 0.9, 2, 1.1], "Add", 0.3, true], ["Moon Fog", ["#000000", "#dfe9ff"], [0.6, 0.6, 1.1, 0.2], "Screen", 0.45, true],
];

const fogGroup = make("Fog & Smoke");
const fog = FOG.map(([label, colors, knobs, blend, opacity, keyed]) =>
  fogGroup(label, "noise fog smoke haze mist atmosphere", { kind: "noise", name: label, colors, knobs, blend, opacity, keyed: keyed ?? false }),
);

/* ───────────── dust & specks: real particles from the star and bokeh generators, added with Screen ───────────── */

const DUST: Array<[label: string, generator: "stars" | "bokeh", knobs: Knob4, colors: string[], blend: BlendMode, opacity: number]> = [
  ["Dust", "stars", [70, 0.5, 0.3, 0.3], ["#000000", "#c8d0e0", "#ffffff"], "Screen", 0.8], ["Fine Dust", "stars", [80, 0.35, 0.2, 0.4], ["#000000", "#d8dde8", "#ffffff"], "Screen", 0.7],
  ["Floating Dust", "bokeh", [7, 0.25, 1.4, 0.8], ["#000000", "#fff0cc", "#fff8e6"], "Screen", 0.55], ["Pollen", "bokeh", [6, 0.3, 1, 0.5], ["#000000", "#ffd84a", "#fff2a8"], "Screen", 0.6],
  ["Ash Fall", "stars", [48, 0.9, 0.2, 0.25], ["#000000", "#8a8a96", "#c8c8d0"], "Screen", 0.7], ["Snowfall", "stars", [40, 1.5, 0.5, 0.3], ["#000000", "#dfeaf7", "#ffffff"], "Screen", 0.9],
  ["Glitter Dust", "stars", [60, 0.8, 1, 0.3], ["#000000", "#ff9ad5", "#ffffff"], "Add", 0.8], ["Star Dust", "stars", [75, 0.6, 0.8, 0.35], ["#000000", "#7a9aff", "#ffffff"], "Add", 0.8],
  ["Sparks", "stars", [30, 1.1, 0.9, 0.12], ["#000000", "#ff7a18", "#ffe08a"], "Add", 0.9], ["Sand Blow", "stars", [80, 0.45, 0.1, 0.5], ["#000000", "#c4ac7a", "#f3e3b8"], "Screen", 0.6],
];

const dustGroup = make("Dust & Specks");
const dust = DUST.map(([label, generator, knobs, colors, blend, opacity]) =>
  dustGroup(label, "dust specks particles sparkle snow pollen", { kind: "field", name: label, generator, knobs, ownColors: true, colors, blend, opacity }),
);

/* ───────────── stone, marble and cells: whole generators used as a surface ───────────── */

type SurfaceSpec = [label: string, generator: GeneratorId, knobs: Knob4, colors: string[], blend?: BlendMode, opacity?: number];

const surface = (group: string, tags: string, specs: SurfaceSpec[]): LibraryItem[] => {
  const g = make(group);
  return specs.map(([label, generator, knobs, colors, blend, opacity]) =>
    g(label, `${tags} surface texture`, {
      kind: "field", name: label, generator, knobs, ownColors: true, colors, ...(blend ? { blend } : {}), ...(opacity !== undefined ? { opacity } : {}),
    }),
  );
};

const STONE: SurfaceSpec[] = [
  ["Marble", "fluid", [1.1, 1.2, 1, 1], ["#f5f5f4", "#a8a29e", "#292524"]], ["Carrara", "fluid", [0.9, 1, 1.1, 0.6], ["#ffffff", "#c9ced6", "#4b5563"]],
  ["Black Gold Marble", "fluid", [1.2, 1.4, 1, 0.8], ["#050505", "#2b2b2b", "#d4af37"]], ["Rose Marble", "fluid", [1, 1.1, 1, 0.7], ["#fff0f5", "#e8a3b8", "#6a2a45"]],
  ["Jade Marble", "fluid", [1.1, 1.2, 1, 0.8], ["#02150f", "#14a371", "#e8fff3"]], ["Lapis Marble", "fluid", [1.2, 1.3, 1, 0.9], ["#04123a", "#1f5cff", "#d4af37"]],
  ["Onyx", "fluid", [1.4, 1.5, 1.2, 0.5], ["#050505", "#3a3a3a", "#d6d6d6"]], ["Travertine", "silk", [10, 0.8, 0.15, 1.2], ["#e8d6aa", "#c4ac7a", "#7a6a48"]],
  ["Granite", "valueNoise", [4, 5, 1.6, 0.2], ["#2b2b2b", "#8a8a8a", "#e0e0e0"]], ["Sandstone", "ridgedNoise", [3, 1.2, 4, 0.3], ["#7a5a3a", "#c4a070", "#f0dcb0"]],
  ["Slate", "ridgedNoise", [3.5, 2, 5, 0.3], ["#14181f", "#3a4452", "#8794a8"]], ["Concrete", "simplexNoise", [5, 6, 0.8, 0.1], ["#5a5e68", "#9aa0aa", "#d4d8de"]],
  ["Ink Marble", "fluidDye", [8, 1.2, 4, 0.5], ["#fbf6ea", "#a89d85", "#1a1712"]], ["Agate", "contours", [1.1, 14, 0.3, 0.5], ["#2a1233", "#c0356a", "#f9c8d6"]],
];

const CELLS: SurfaceSpec[] = [
  ["Cell Noise", "voronoi", [6, 0.5, 0.5, 0.5], ["#10131c", "#7a8aa8", "#e6edf9"], "Overlay", 0.6], ["Cracked Earth", "voronoi", [5, 0.15, 0.9, 0.1], ["#2a1a10", "#8a5a2a", "#d8bb6a"]],
  ["Leaf Cells", "cellular", [6, 0.8, 0.7, 0.4], ["#04120a", "#2f8f4e", "#eaffe6"]], ["Honeycomb", "hex", [6, 0.5, 0.4, 0.3], ["#140a00", "#d68a00", "#fff6d0"]],
  ["Soap Film", "voronoi", [4, 0.4, 0.6, 0.6], ["#10122a", "#9af0ff", "#ffb8f0"], "Screen", 0.7], ["Frog Skin", "cellGrowth", [6, 4, 0.5, 0.5], ["#02150f", "#14a371", "#6fe3b0"]],
  ["Crystal Facets", "facets", [8, 0.5, 0.5, 0.5], ["#06141f", "#4fb3d6", "#ffffff"]], ["Dry Mud", "voronoi", [7, 0.12, 0.8, 0.05], ["#1a1210", "#6a4a32", "#c4ac7a"]],
  ["Foam", "cellular", [7, 0.9, 0.8, 0.5], ["#0a1a16", "#52c2a0", "#f4fffa"], "Screen", 0.8], ["Mosaic", "facets", [10, 0.6, 0.3, 0.2], ["#240046", "#ff6f91", "#ffe3ec"]],
];

/* ───────────── paper, canvas and film stock: large soft grain that multiplies into the image ───────────── */

const PAPER: Array<[label: string, knobs: Knob4, blend: BlendMode, opacity: number]> = [
  ["Paper Tooth", [0.7, 2.2, 0, 0.15], "Multiply", 0.35], ["Cardboard", [0.8, 3.2, 0, 0], "Multiply", 0.4], ["Canvas", [0.6, 3.8, 0, 0], "Overlay", 0.35],
  ["Linen", [0.55, 4.6, 0, 0], "Soft Light", 0.7], ["Watercolour Paper", [0.5, 5, 0, 0], "Multiply", 0.3], ["Kraft", [0.75, 2.8, 0, 0], "Multiply", 0.45],
  ["Tracing Paper", [0.3, 1.8, 0, 0], "Soft Light", 0.6], ["Letterpress", [0.9, 3, 0, 0], "Multiply", 0.5], ["Newsprint Fibre", [0.65, 2.6, 0.1, 0], "Overlay", 0.35],
  ["Old Photograph", [0.7, 2.4, 0.2, 0.1], "Overlay", 0.5],
];

const paperGroup = make("Paper & Canvas");
const paper = PAPER.map(([label, knobs, blend, opacity]) =>
  paperGroup(label, "paper canvas fabric grain tooth print", { kind: "grain", name: label, knobs, blend, opacity }),
);

export const TEXTURE_ITEMS: LibraryItem[] = [
  ...grain,
  ...clouds,
  ...fog,
  ...dust,
  ...surface("Stone & Marble", "marble stone veins rock", STONE),
  ...surface("Cells & Cracks", "cells voronoi cracks organic", CELLS),
  ...paper,
];
