import { familyMaker, loop, type Knob4, type LibraryItem } from "../libraryCore";

const make = familyMaker("Gradients", "grad");

type Ramp = [label: string, colors: string[]];

/* ───────────── linear ───────────── */

const linear = (group: string, tags: string, ramps: Ramp[], angles: number[]): LibraryItem[] => {
  const g = make(group);
  return ramps.map(([label, colors], i) =>
    g(label, `linear gradient background ${tags}`, { kind: "linear", name: label, colors, knobs: [angles[i % angles.length] as number, 1, 0, 0] }),
  );
};

const WARM: Ramp[] = [
  ["Sunset", ["#ff7a59", "#ff3e7f", "#5b2a86"]], ["Ember", ["#200122", "#6f0000", "#ff8a00"]], ["Peach", ["#ffecd2", "#fcb69f"]],
  ["Golden Hour", ["#fff1b8", "#ffb347", "#c2410c"]], ["Rosewood", ["#ffd1dc", "#e0568a", "#4a0e24"]], ["Campfire", ["#2a0a00", "#c2410c", "#ffd166"]],
  ["Papaya", ["#ffe29a", "#ff7a59"]], ["Cherry Cola", ["#3a0215", "#b3132e", "#ff6f61"]], ["Saffron", ["#fff3b0", "#ffb703", "#fb5607"]],
  ["Terracotta Fade", ["#f8d9c4", "#d9774f", "#5a2210"]], ["Mango Lassi", ["#fff6d6", "#ffc15a", "#ff7a2a"]], ["Hot Coral", ["#ff9a8b", "#ff4e6b", "#c2185b"]],
];

const COOL: Ramp[] = [
  ["Ocean", ["#00c6ff", "#0072ff", "#021b79"]], ["Northern", ["#0f2027", "#2c7a6b", "#7be0b5"]], ["Lagoon", ["#43cea2", "#185a9d"]],
  ["Neon Dusk", ["#3a0ca3", "#f72585", "#4cc9f0"]], ["Spring", ["#a8ff78", "#78ffd6"]], ["Glacier", ["#e0f7ff", "#6ec1e4", "#16527a"]],
  ["Arctic", ["#f5fcff", "#a5d8ff", "#4f8cff"]], ["Deep Sea", ["#031d44", "#04395e", "#70a288"]], ["Teal Dream", ["#d4fff4", "#34d1bf", "#0b4f6c"]],
  ["Mojito Fade", ["#f4ffd9", "#7be0a8", "#1b998b"]], ["Indigo Hour", ["#cbd5ff", "#5b6cff", "#1a1f6b"]], ["Iceberg", ["#ffffff", "#a8e6ff", "#3a86ff"]],
];

const DARK: Ramp[] = [
  ["Night Fade", ["#05060f", "#1a1f4d"]], ["Steel", ["#232526", "#414345"]], ["Mono Fade", ["#000000", "#ffffff"]],
  ["Eclipse", ["#000000", "#2a1a5e"]], ["Noir Wine", ["#0b0204", "#4a0e24"]], ["Carbon", ["#0c0c0e", "#2b2f36"]],
];

const SOFT: Ramp[] = [
  ["Candy", ["#ff9a9e", "#fad0c4", "#a18cd1"]], ["Cotton Sky", ["#e0f2ff", "#ffe3f1"]], ["Lilac Dream", ["#f3e8ff", "#c4b5fd", "#8b5cf6"]],
  ["Honey Milk", ["#fff7e0", "#ffe0a3"]], ["Pistachio Cream", ["#f6ffe0", "#c7ecb0"]], ["Bubblegum", ["#ffc2e2", "#b5a8ff", "#9bf6ff"]],
];

/* ───────────── radial ───────────── */

const RADIAL: Array<[label: string, colors: string[], radius: number, squash: number]> = [
  ["Spotlight", ["#ffffff", "#10131c"], 0.8, 1], ["Sun Glow", ["#fff3b0", "#ff8a00", "#7a1c00"], 0.8, 1], ["Deep Space", ["#1b2a6b", "#05060f"], 1, 1],
  ["Moon Glow", ["#dfe9ff", "#0a0f26"], 0.9, 1], ["Rose Bloom", ["#ffd1dc", "#d6336c", "#2b0a1c"], 0.8, 1],
  ["Aurora Core", ["#b8ffe0", "#1a8f7a", "#03140f"], 0.85, 1.2], ["Violet Halo", ["#e5d4ff", "#7a3cff", "#0a0218"], 0.75, 1],
  ["Ember Core", ["#fff1a8", "#ff5a1f", "#240500"], 0.7, 1.3], ["Ice Orb", ["#ffffff", "#8fd3ff", "#06162b"], 0.6, 1],
  ["Toxic Core", ["#f4ffb0", "#5ad11f", "#041a00"], 0.8, 0.8], ["Candy Pop", ["#fff0fb", "#ff6fb5", "#6a1fa8"], 0.9, 1],
  ["Gold Halo", ["#fff6d0", "#e0a82e", "#2a1800"], 0.7, 1], ["Ocean Pearl", ["#e6ffff", "#2aa6c9", "#021d33"], 1.05, 1],
  ["Blood Moon", ["#ffb199", "#a3132f", "#12020a"], 0.65, 1], ["Mint Mist", ["#ffffff", "#b6f0e0", "#2f8f7a"], 1, 1],
  ["Plum Dusk", ["#ffd0e8", "#8f2a85", "#10040f"], 0.9, 1.4], ["Neon Pulse", ["#ffffff", "#00e5ff", "#3a0ca3"], 0.75, 1],
  ["Lava Glow", ["#ffe9a0", "#ff6a1a", "#3a0a2e"], 0.8, 0.7], ["Sky Hole", ["#ffffff", "#8ab4ff", "#1e2a6b"], 1.1, 1],
  ["Silver Moon", ["#ffffff", "#9aa4b8", "#0b0d12"], 0.55, 1],
];

/* ───────────── conic ───────────── */

const CONIC: Array<[label: string, colors: string[], start: number, repeat: number]> = [
  ["Rainbow Wheel", ["#ff5f5f", "#ffd25f", "#5fff8f", "#5fd2ff", "#a05fff"], 0, 1], ["Sunburst", ["#ffe29a", "#ff8a3d"], 0, 3],
  ["Holo Sweep", ["#ff9ad5", "#9ad1ff", "#c8ff9a"], 0, 1], ["Aurora Wheel", ["#3df5c4", "#4d7cff", "#b45fff"], 30, 1],
  ["Ember Wheel", ["#ff3b30", "#ff9500", "#ffd60a"], 0, 1], ["Candy Wheel", ["#ff6fb5", "#ffd36a", "#7fe8ff"], 90, 1],
  ["Ocean Wheel", ["#0ea5e9", "#22d3ee", "#1e3a8a"], 0, 2], ["Neon Wheel", ["#ff2fa0", "#00e5ff", "#fffd8a"], 45, 1],
  ["Pastel Wheel", ["#ffc2e2", "#c7f0ff", "#e2ffc7"], 0, 1], ["Mono Fan", ["#111111", "#e8e8e8"], 0, 4],
  ["Fire & Ice Wheel", ["#2fb6ff", "#ffffff", "#ff8a3a"], 120, 1], ["Forest Wheel", ["#14532d", "#86efac", "#fef08a"], 0, 1],
  ["Dusk Wheel", ["#3a0ca3", "#f72585", "#ffb703"], 200, 1], ["Gold Fan", ["#fff1b8", "#c99a2e"], 0, 5],
];

/* ───────────── diamond ───────────── */

const DIAMOND: Array<[label: string, colors: string[], size: number, rotate: number]> = [
  ["Diamond Glass", ["#fbbf24", "#f43f5e", "#1e1b4b"], 0.8, 0], ["Gem Cut", ["#ffffff", "#7ad7ff", "#0a1a3a"], 0.9, 0],
  ["Ruby Facet", ["#ffd1dc", "#e11d48", "#2a0410"], 0.8, 0], ["Emerald Facet", ["#d1ffe8", "#10b981", "#02150f"], 0.85, 0],
  ["Gold Plate", ["#fff6d0", "#d68a00", "#140a00"], 0.75, 0], ["Amethyst Cut", ["#f3eaff", "#7a2fd0", "#0a0214"], 0.9, 45],
  ["Sapphire Cut", ["#e6f2ff", "#1a63e0", "#020418"], 0.85, 45], ["Sunrise Gem", ["#ffeaa8", "#f0566a", "#2a1240"], 1, 0],
  ["Ice Crystal", ["#ffffff", "#b4ebf7", "#14506f"], 0.8, 45], ["Neon Diamond", ["#fffd8a", "#ff2fa0", "#02020c"], 0.7, 0],
  ["Copper Lozenge", ["#ffe8d2", "#b5602e", "#120602"], 0.95, 30], ["Mono Rhombus", ["#ffffff", "#000000"], 0.8, 45],
];

/* ───────────── spiral ───────────── */

const SPIRAL: Array<[label: string, colors: string[], arms: number, twist: number]> = [
  ["Candy Spiral", ["#ff5f9e", "#ffffff"], 4, 3], ["Hypno", ["#000000", "#ffffff"], 6, 6], ["Ocean Vortex", ["#00c6ff", "#021b79"], 3, 4],
  ["Fire Vortex", ["#ffd166", "#c2410c", "#200122"], 3, 5], ["Galaxy Swirl", ["#a78bfa", "#0a0214", "#f0abfc"], 2, 6], ["Mint Swirl", ["#d4fff4", "#34d1bf"], 5, 3],
  ["Peppermint", ["#ffffff", "#e11d48"], 8, 2], ["Gold Whirl", ["#fff1b8", "#8a5a00"], 4, 4], ["Violet Whirl", ["#f3e8ff", "#6a2cf0"], 3, 7],
  ["Lime Twist", ["#f4ffd9", "#4ad11f"], 5, 5], ["Sunset Spiral", ["#ff7a59", "#5b2a86"], 2, 3], ["Moiré Spiral", ["#111111", "#eeeeee"], 8, 10],
  ["Neon Spiral", ["#00e5ff", "#ff2fa0"], 3, 4], ["Rose Swirl", ["#ffd1dc", "#c0356a"], 6, 4], ["Aqua Drain", ["#06141f", "#4fb3d6"], 2, 8],
  ["Toxic Swirl", ["#050a00", "#d6ff3a"], 4, 6], ["Cobalt Twist", ["#040a24", "#7aa8ff"], 5, 2], ["Rainbow Spiral", ["#ff5f5f", "#ffd25f", "#5fff8f", "#5fd2ff", "#a05fff"], 1, 2],
];

const radial = make("Radial");
const conic = make("Conic");
const diamond = make("Diamond");
const spiral = make("Spiral");

export const GRADIENT_ITEMS: LibraryItem[] = [
  ...linear("Linear · Warm", "warm sunset", WARM, [160, 135, 200, 180, 120, 150]),
  ...linear("Linear · Cool", "cool blue green", COOL, [160, 140, 180, 120, 200, 90]),
  ...linear("Linear · Dark", "dark night black", DARK, [180, 160, 200, 140]),
  ...linear("Linear · Soft", "soft pastel light", SOFT, [150, 170, 135, 190]),
  ...RADIAL.map(([label, colors, r, sq], i) =>
    radial(label, "radial gradient glow orb spot", {
      kind: "radial", name: label, colors, knobs: [(i % 5 === 3 ? 0.25 : 0) * (i % 2 ? 1 : -1), i % 4 === 2 ? -0.15 : 0, r, sq] as Knob4,
    }),
  ),
  ...CONIC.map(([label, colors, start, repeat]) =>
    conic(label, "conic gradient colour wheel sweep", { kind: "conic", name: label, colors: loop(colors), knobs: [0, 0, start, repeat] as Knob4 }),
  ),
  ...DIAMOND.map(([label, colors, size, rotate]) =>
    diamond(label, "diamond gradient square rhombus", { kind: "diamond", name: label, colors, knobs: [0, 0, size, rotate] as Knob4 }),
  ),
  ...SPIRAL.map(([label, colors, arms, twist]) =>
    spiral(label, "spiral gradient swirl vortex", { kind: "spiral", name: label, colors, knobs: [arms, twist, 0, 0] as Knob4 }),
  ),
];
