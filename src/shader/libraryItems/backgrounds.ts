import { familyMaker, type LibraryItem } from "../libraryCore";

const make = familyMaker("Backgrounds", "bg");

type Swatch = [label: string, hex: string];

const solids = (group: string, tags: string, list: Swatch[]): LibraryItem[] => {
  const g = make(group);
  return list.map(([label, hex]) => g(label, `solid flat colour color background ${tags}`, { kind: "solid", name: label, colors: [hex, hex] }));
};

const DARKS: Swatch[] = [
  ["Ink Black", "#05060b"], ["Midnight", "#0b1020"], ["Deep Navy", "#0a1a3a"], ["Graphite", "#1c1f2a"], ["Slate", "#2b3245"],
  ["Obsidian", "#0a0a0d"], ["Void", "#020308"], ["Eclipse", "#0e0b1c"], ["Nightshade", "#1a1030"], ["Aubergine", "#2a1233"],
  ["Oxblood", "#3a0b14"], ["Wine", "#4a0e24"], ["Forest", "#0f3b2e"], ["Deep Teal", "#062f33"], ["Abyss", "#031a2b"],
  ["Pine Night", "#0b1f1a"], ["Coal Brown", "#1a1210"], ["Iron", "#25282e"], ["Indigo Ink", "#14123a"], ["Charcoal Blue", "#1b2433"],
];

const NEUTRALS: Swatch[] = [
  ["Paper", "#f1ebdd"], ["Snow", "#f7f8fb"], ["Bone", "#e8e0cf"], ["Ivory", "#fbf6e6"], ["Cream", "#f6ecd2"], ["Linen", "#ece4d6"],
  ["Fog", "#d9dde3"], ["Cloud", "#e8ebf0"], ["Ash", "#b9bcc4"], ["Stone", "#9a9c9f"], ["Pewter", "#7b8089"], ["Smoke", "#5a5e68"],
  ["Mist", "#cfd6dc"], ["Chalk", "#f3f1ea"], ["Parchment", "#e9dcb8"], ["Pearl", "#ece9f2"],
];

const PASTELS: Swatch[] = [
  ["Blush", "#f6c9d4"], ["Mint", "#bdebd6"], ["Sky", "#bfe3f7"], ["Lavender", "#cfc2f5"], ["Butter", "#fbeaa6"], ["Peach", "#ffd3b8"],
  ["Lilac", "#dcc9f2"], ["Seafoam", "#c3f0e4"], ["Baby Blue", "#cfe6ff"], ["Rose Quartz", "#f4c7d6"], ["Apricot", "#ffdcb2"],
  ["Pistachio", "#d4eec0"], ["Periwinkle", "#c5cdf7"], ["Cotton Candy", "#ffc7e6"], ["Lemon Chiffon", "#fff4b8"], ["Powder", "#d9ecf2"],
];

const VIVID: Swatch[] = [
  ["Sun", "#ffd36a"], ["Coral", "#ff7a6b"], ["Electric Blue", "#1f5cff"], ["Hot Pink", "#ff2d8a"], ["Violet", "#7a3cff"], ["Lime", "#a6ff2f"],
  ["Tangerine", "#ff8a1f"], ["Cyan", "#14d9ff"], ["Crimson", "#e11d48"], ["Emerald", "#10b981"], ["Magenta", "#d61fd6"], ["Cobalt", "#1747d4"],
  ["Signal Red", "#ff3b30"], ["Aqua", "#00e0c0"], ["Canary", "#ffe600"], ["Ultraviolet", "#5a2dff"],
];

const EARTH: Swatch[] = [
  ["Clay", "#b5684a"], ["Terracotta", "#c8563a"], ["Rust", "#8f3a1e"], ["Ochre", "#c99a2e"], ["Olive", "#6b6b2a"], ["Moss", "#4a6a2a"],
  ["Sage", "#9caf88"], ["Fern", "#3f7a4a"], ["Sea Glass", "#8fc7b7"], ["Driftwood", "#a58b6f"], ["Sandstone", "#d1b48a"], ["Dune", "#e3c9a0"],
  ["Cocoa", "#4a2f22"], ["Walnut", "#5b3c2a"], ["Slate Rock", "#4b5a63"], ["Glacier", "#bde3ee"],
];

/** Barely-there two-tone fades: a backdrop with a little depth instead of a dead flat colour. */
const DUOTONES: Array<[label: string, from: string, to: string, angle: number]> = [
  ["Dusk Haze", "#1a1030", "#2e1f4f", 170], ["Ocean Floor", "#031a2b", "#0b3a52", 175], ["Ember Floor", "#1a0a08", "#3a1410", 170],
  ["Forest Floor", "#07140f", "#14332a", 175], ["Steel Haze", "#14161c", "#2a2f3a", 165], ["Paper Warm", "#f4ecda", "#e8dcc0", 170],
  ["Paper Cool", "#f4f6fa", "#dfe5ee", 170], ["Rose Milk", "#ffe6ee", "#f6c3d4", 160], ["Mint Milk", "#e6fbf1", "#bfe9d6", 160],
  ["Sky Milk", "#e6f4ff", "#bcdcf5", 165], ["Sunrise Milk", "#fff0d8", "#ffd1b0", 155], ["Lavender Milk", "#f0e9ff", "#cfc0f2", 160],
  ["Night Gradient", "#05060f", "#141a3a", 180], ["Plum Night", "#0d0618", "#2a1245", 175], ["Teal Night", "#021014", "#0a3a42", 175],
  ["Wine Night", "#14040a", "#3d0f22", 170],
];

const duo = make("Soft Duotones");

export const BACKGROUND_ITEMS: LibraryItem[] = [
  ...solids("Darks", "dark black night", DARKS),
  ...solids("Neutrals & Paper", "neutral grey gray white paper light", NEUTRALS),
  ...solids("Pastels", "pastel soft light", PASTELS),
  ...solids("Vivid", "vivid bright saturated neon", VIVID),
  ...solids("Earth & Nature", "earth natural warm", EARTH),
  ...DUOTONES.map(([label, from, to, angle]) =>
    duo(label, "duotone gradient fade subtle backdrop", { kind: "linear", name: label, colors: [from, to], knobs: [angle, 1, 0, 0] }),
  ),
];
