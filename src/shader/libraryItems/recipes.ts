import { familyMaker, type BlendMode, type Knob4, type LayerPreset, type LibraryItem } from "../libraryCore";
import type { PatternId } from "../types";

/**
 * Recipes: a finished "look" made of two to four layers that is added to the stack in one tap
 * (top layer first). Each shelf is built from the same few ingredients below, so every recipe
 * is easy to read and to take apart in the Stack tab afterwards.
 */
const make = familyMaker("Recipes", "rec");

/* ───────────── ingredients ───────────── */

const grain = (amount: number, size: number, colour: number, flicker: number, blend: BlendMode, opacity: number, name = "Grain"): LayerPreset =>
  ({ kind: "grain", name, knobs: [amount, size, colour, flicker], blend, opacity });

const glow = (edge: string, core: string, x: number, y: number, radius: number, falloff: number, blend: BlendMode, opacity: number, name = "Glow"): LayerPreset =>
  ({ kind: "glow", name, colors: [edge, core], knobs: [x, y, radius, falloff], blend, opacity });

const vignette = (color: string, radius: number, softness: number, opacity: number, name = "Vignette", blend: BlendMode = "Normal"): LayerPreset =>
  ({ kind: "vignette", name, colors: [color, color], knobs: [radius, softness, 1, 0], opacity, blend });

const tint = (color: string, blend: BlendMode, opacity: number, name = "Tint"): LayerPreset =>
  ({ kind: "solid", name, colors: [color, color], blend, opacity });

const sheen = (from: string, to: string, angle: number, blend: BlendMode, opacity: number, name = "Sheen"): LayerPreset =>
  ({ kind: "linear", name, colors: [from, to], knobs: [angle, 1, 0, 0], blend, opacity });

const shade = (color: string, angle: number, opacity: number, name = "Shade"): LayerPreset =>
  ({ kind: "linear", name, colors: [color, color], knobs: [angle, 1, 0, 0.3], fade: 1, opacity });

const noise = (from: string, to: string, knobs: Knob4, blend: BlendMode, opacity: number, keyed: boolean, name = "Haze"): LayerPreset =>
  ({ kind: "noise", name, colors: [from, to], knobs, blend, opacity, keyed });

const lines = (pattern: PatternId, knobs: Knob4, colors: [string, string], blend: BlendMode, opacity: number, name: string, space: "Scene" | "Screen" = "Scene"): LayerPreset =>
  ({ kind: "pattern", name, pattern, knobs, colors, blend, opacity, fill: false, space });

const SCAN = lines("stripes", [26, 0.4, 0.3, 90], ["#ffffff", "#000000"], "Multiply", 0.3, "Scanlines", "Screen");
const desaturate = (opacity: number): LayerPreset => tint("#808080", "Saturation", opacity, "Desaturate");

/* ───────────── film & cinema ───────────── */

const film = make("Film & Cinema");
const FILM: LibraryItem[] = [
  film("Film Look", "vignette grain warm cinematic", grain(0.5, 1.2, 0, 0.6, "Overlay", 0.5, "Film grain"), glow("#ff7a18", "#fff1b8", 0, 0, 0.9, 1.4, "Screen", 0.3, "Warm bloom"), vignette("#000000", 0.7, 0.7, 0.55)),
  film("Teal & Orange", "cinema grade blockbuster", grain(0.4, 1, 0, 0.5, "Overlay", 0.4), glow("#ff7a18", "#ffd9a0", 0.5, 0.3, 0.8, 1.5, "Screen", 0.45, "Orange key"), tint("#0a6a70", "Soft Light", 0.4, "Teal shadows"), vignette("#000000", 0.7, 0.7, 0.5)),
  film("Faded Matinee", "vintage faded matte", grain(0.35, 1.4, 0, 0.5, "Overlay", 0.4), tint("#f3ead6", "Soft Light", 0.55, "Fade"), vignette("#2a1a10", 0.8, 0.8, 0.35)),
  film("Noir", "black white monochrome dramatic", grain(0.7, 1.8, 0, 0.8, "Overlay", 0.6), vignette("#000000", 0.55, 0.5, 0.9), desaturate(1)),
  film("Sepia Reel", "sepia brown antique", grain(0.5, 1.6, 0, 0.6, "Overlay", 0.5), tint("#704214", "Color", 0.65, "Sepia"), vignette("#1a0e04", 0.65, 0.6, 0.6)),
  film("Super 8", "home movie 8mm leak", glow("#ff6a00", "#ffe08a", 0.65, 0.3, 0.9, 1.2, "Screen", 0.5, "Light leak"), grain(0.75, 2.2, 0.3, 1, "Overlay", 0.6, "8mm grain"), tint("#d9a35a", "Soft Light", 0.35, "Warm cast"), vignette("#000000", 0.6, 0.6, 0.6)),
  film("Night Cinema", "blue night moonlight", tint("#0a1a4a", "Soft Light", 0.55, "Night grade"), glow("#2a6cff", "#bfe9ff", -0.4, 0.3, 0.8, 1.6, "Screen", 0.45, "Moonlight"), grain(0.45, 1.2, 0, 0.6, "Overlay", 0.5), vignette("#000000", 0.6, 0.6, 0.7)),
  film("Golden Hour Film", "golden sunset warm", glow("#ffb347", "#fff1b8", 0.6, 0.3, 1, 1.3, "Screen", 0.6, "Low sun"), tint("#ff9a3c", "Soft Light", 0.4, "Warm grade"), grain(0.35, 1, 0, 0.4, "Overlay", 0.4), vignette("#2a0e00", 0.75, 0.7, 0.4)),
  film("Bleach Bypass", "gritty desaturated war", desaturate(0.55), grain(0.8, 1.6, 0, 0.7, "Overlay", 0.65), vignette("#000000", 0.65, 0.6, 0.6)),
  film("Cool Documentary", "cool blue neutral real", tint("#6a8aaa", "Soft Light", 0.45, "Cool grade"), grain(0.3, 0.9, 0, 0.4, "Soft Light", 0.6), vignette("#000000", 0.8, 0.8, 0.3)),
  film("Polaroid", "instant print retro soft", vignette("#f3ead6", 0.7, 0.8, 0.4, "Fade edge"), glow("#ffb27a", "#fff3e0", -0.3, 0.3, 0.9, 1.5, "Screen", 0.35, "Warm bloom"), grain(0.5, 1.8, 0.4, 0.3, "Overlay", 0.5), tint("#f3ead6", "Multiply", 0.2, "Paper tint")),
  film("Disposable Flash", "flash party snapshot", grain(0.65, 1.8, 0.2, 0.8, "Overlay", 0.55), glow("#ffffff", "#ffffff", 0, 0.1, 0.5, 2, "Add", 0.35, "Flash"), vignette("#000000", 0.45, 0.5, 0.9)),
  film("Dusty Western", "dust desert sepia sun", noise("#000000", "#e3c9a0", [3, 0.6, 2.6, 1.2], "Screen", 0.25, true, "Dust"), tint("#c28a4a", "Color", 0.35, "Dust tint"), grain(0.6, 2, 0, 0.5, "Overlay", 0.5), vignette("#2a1408", 0.6, 0.6, 0.65)),
  film("Old Hollywood", "glamour silver soft", glow("#ffffff", "#ffffff", 0, 0.1, 0.9, 1.4, "Soft Light", 0.55, "Soft focus"), grain(0.3, 0.8, 0, 0.3, "Soft Light", 0.7), vignette("#000000", 0.55, 0.55, 0.8), desaturate(1)),
];

/* ───────────── neon & synthwave ───────────── */

const neon = make("Neon & Synthwave");
const NEON: LibraryItem[] = [
  neon("Neon Night", "scanlines grid glow synthwave", SCAN, lines("grid", [3, 0.06, 0.05, 0], ["#000000", "#2fe1ff"], "Screen", 0.35, "Grid"), glow("#2a6cff", "#bfe9ff", 0.3, -0.2, 0.8, 1.5, "Screen", 0.6, "Cyan glow")),
  neon("Synth Sunset", "retro 80s sun grid pink", SCAN, lines("grid", [4, 0.05, 0.05, 0], ["#000000", "#ff2fa0"], "Screen", 0.4, "Pink grid"), glow("#ff2fa0", "#ffd166", 0, -0.1, 0.9, 1.4, "Screen", 0.7, "Sun")),
  neon("Cyber Blue", "cyberpunk blue grid", SCAN, lines("grid", [6, 0.05, 0.05, 0], ["#000000", "#38e8ff"], "Screen", 0.35, "Grid"), glow("#0a1a6a", "#2a5cff", -0.3, 0.2, 1, 1.6, "Screen", 0.6), vignette("#000000", 0.6, 0.6, 0.6)),
  neon("Vapor Dream", "vaporwave pastel pink cyan", glow("#ff4fc3", "#ffffff", -0.4, 0.2, 0.8, 1.6, "Screen", 0.55, "Pink bloom"), glow("#4fe3ff", "#ffffff", 0.45, -0.2, 0.8, 1.6, "Screen", 0.5, "Cyan bloom"), lines("grid", [3, 0.05, 0.05, 0], ["#000000", "#ffffff"], "Soft Light", 0.4, "Grid")),
  neon("Arcade Carpet", "retro arcade neon dots", lines("plus", [6, 0.25, 0.08, 20], ["#000000", "#ff2fa0"], "Screen", 0.4, "Plus signs"), lines("triangles", [4, 0.4, 0.1, 0], ["#000000", "#00e5ff"], "Screen", 0.3, "Triangles"), vignette("#000000", 0.6, 0.6, 0.7)),
  neon("Laser Show", "laser beams red green", glow("#ff1a3d", "#ffd0d8", -0.6, 0.3, 0.6, 2, "Add", 0.5, "Red beam"), glow("#00ff90", "#d9ffe9", 0.6, -0.2, 0.6, 2, "Add", 0.5, "Green beam"), SCAN),
  neon("Tron Floor", "grid floor cyan dark", lines("grid", [8, 0.05, 0.04, 0], ["#000000", "#00d4ff"], "Screen", 0.55, "Grid"), shade("#000000", 180, 0.85, "Horizon fade"), glow("#00d4ff", "#ffffff", 0, 0.3, 0.9, 1.8, "Screen", 0.35)),
  neon("Miami Heat", "miami pink orange teal", glow("#ff6a1a", "#ffe08a", 0.4, -0.2, 0.9, 1.4, "Screen", 0.6), glow("#00c6c6", "#c8fff2", -0.5, 0.3, 0.8, 1.5, "Screen", 0.5), SCAN),
  neon("Acid Rave", "rave lime violet strobe", glow("#a6ff2f", "#ffffff", 0, 0, 0.6, 2, "Add", 0.4, "Strobe"), lines("stripes", [8, 0.3, 0.08, 45], ["#000000", "#7a3cff"], "Screen", 0.45, "Violet bars"), vignette("#000000", 0.55, 0.5, 0.8)),
  neon("Hologram", "hologram scan blue", SCAN, lines("hatch", [10, 0.1, 0.06, 0], ["#000000", "#7fe8ff"], "Screen", 0.25, "Mesh"), glow("#2fb6ff", "#ffffff", 0, 0, 0.7, 1.7, "Screen", 0.55)),
  neon("Terminal Green", "terminal matrix green crt", SCAN, noise("#000000", "#00ff7a", [4, 0.4, 2.4, 1.4], "Screen", 0.25, true, "Phosphor"), glow("#00ff7a", "#d9ffe9", 0, 0, 0.9, 1.8, "Screen", 0.3), vignette("#000000", 0.55, 0.5, 0.8)),
  neon("Ultraviolet Club", "uv blacklight violet club", glow("#7a3cff", "#e5d4ff", 0, 0.1, 0.8, 1.6, "Screen", 0.65), lines("dots", [6, 0.3, 0.1, 30], ["#000000", "#ff2fa0"], "Screen", 0.3, "Dots"), vignette("#10043a", 0.6, 0.6, 0.7)),
  neon("Retro Arcade", "arcade crt cabinet", SCAN, grain(0.7, 2, 0.6, 1, "Overlay", 0.5, "CRT noise"), glow("#ff2fa0", "#00e5ff", 0, 0, 0.9, 1.5, "Screen", 0.4), vignette("#000000", 0.6, 0.5, 0.7)),
  neon("Glitch City", "glitch rgb offset digital", lines("stripes", [30, 0.25, 0.05, 0], ["#000000", "#ff2fa0"], "Screen", 0.3, "Magenta slices", "Screen"), lines("stripes", [22, 0.2, 0.05, 0], ["#000000", "#00e5ff"], "Screen", 0.3, "Cyan slices", "Screen"), grain(0.6, 1.6, 1, 1, "Add", 0.15)),
];

/* ───────────── soft & dreamy ───────────── */

const dream = make("Soft & Dreamy");
const DREAMY: LibraryItem[] = [
  dream("Dream Haze", "bloom soft pastel haze", grain(0.4, 1.4, 0.1, 0.5, "Overlay", 0.4, "Film grain"), glow("#ff9ad5", "#ffffff", -0.35, 0.2, 0.75, 1.6, "Screen", 0.7, "Bloom"), noise("#6a5acd", "#ffe6f7", [1.2, 0.8, 1.2, 0.5], "Soft Light", 0.45, false)),
  dream("Cotton Candy Sky", "pink blue sweet pastel", glow("#ffc2e2", "#ffffff", -0.4, 0.25, 0.9, 1.5, "Screen", 0.6), glow("#bfe3f7", "#ffffff", 0.45, -0.2, 0.9, 1.5, "Screen", 0.55), noise("#ffffff", "#ffd0ea", [1.1, 0.6, 1.1, 0.3], "Soft Light", 0.5, false)),
  dream("Peach Fuzz", "peach warm soft", glow("#ffb27a", "#fff3e6", 0, 0.1, 1, 1.4, "Screen", 0.6), grain(0.35, 1.6, 0, 0.3, "Soft Light", 0.7), tint("#ffd3b8", "Soft Light", 0.4)),
  dream("Lavender Mist", "lavender calm purple", glow("#a392e0", "#faf7ff", 0.2, 0.2, 1, 1.5, "Screen", 0.6), noise("#5a4a9a", "#dcd2f8", [1.3, 0.7, 1.1, 0.4], "Soft Light", 0.6, false), vignette("#2a1a50", 0.8, 0.8, 0.3)),
  dream("Morning Light", "morning sun gentle gold", glow("#ffe08a", "#ffffff", 0.5, 0.4, 1.1, 1.3, "Screen", 0.6), noise("#000000", "#fff4e0", [0.9, 0.6, 1.2, 0.3], "Screen", 0.3, true, "Mist"), grain(0.25, 1, 0, 0.3, "Soft Light", 0.6)),
  dream("Rose Quartz", "rose pink gem soft", glow("#f4c7d6", "#ffffff", -0.2, 0.2, 0.9, 1.6, "Screen", 0.65), tint("#f4c7d6", "Soft Light", 0.45), grain(0.3, 1.4, 0, 0.3, "Overlay", 0.4)),
  dream("Mint Cream", "mint fresh soft green", glow("#bdebd6", "#ffffff", 0.2, 0.2, 1, 1.5, "Screen", 0.6), tint("#c3f0e4", "Soft Light", 0.4), noise("#ffffff", "#bdebd6", [1.1, 0.6, 1, 0.3], "Soft Light", 0.5, false)),
  dream("Sunday Haze", "lazy warm yellow hazy", glow("#fbeaa6", "#ffffff", 0.3, 0.3, 1.1, 1.4, "Screen", 0.65), noise("#fff4b8", "#ffffff", [0.8, 0.6, 1, 0.2], "Soft Light", 0.55, false), grain(0.3, 1.2, 0, 0.3, "Soft Light", 0.6)),
  dream("Pearl Shimmer", "pearl iridescent soft", glow("#ffd6fb", "#ffffff", -0.3, 0.2, 0.8, 1.6, "Screen", 0.5), glow("#bfe9ff", "#ffffff", 0.35, -0.15, 0.8, 1.6, "Screen", 0.5), sheen("#ffffff", "#c8b8ff", 135, "Soft Light", 0.5)),
  dream("Cloud Nine", "clouds white sky soft", noise("#ffffff", "#ffffff", [1.4, 0.7, 1.4, 0.4], "Soft Light", 0.55, false, "Cloud"), glow("#ffffff", "#ffffff", 0, 0.2, 1, 1.5, "Screen", 0.45), vignette("#7aa6d6", 0.8, 0.8, 0.3)),
  dream("Aura Bloom", "aura bloom pink violet", glow("#ff6fb5", "#ffd6fb", 0, 0, 0.8, 1.7, "Screen", 0.55, "Pink aura"), glow("#6a2cf0", "#ffffff", 0, 0, 1.2, 1.4, "Screen", 0.35, "Violet aura"), grain(0.3, 1.2, 0.2, 0.4, "Overlay", 0.4)),
  dream("Gentle Dusk", "dusk calm evening", shade("#2a1240", 180, 0.55, "Sky"), glow("#ff7a6e", "#ffd2a1", 0, -0.3, 0.9, 1.5, "Screen", 0.55, "Horizon"), grain(0.3, 1.2, 0, 0.3, "Overlay", 0.4)),
  dream("Baby Blue Fade", "blue calm sky pastel", sheen("#ffffff", "#9ec9ff", 170, "Soft Light", 0.55), glow("#cfe6ff", "#ffffff", 0, 0.2, 1, 1.5, "Screen", 0.55), grain(0.25, 1, 0, 0.3, "Soft Light", 0.6)),
  dream("Sorbet", "sorbet orange pink summer", glow("#ff9a8b", "#fff0e6", -0.3, 0.2, 0.9, 1.5, "Screen", 0.6), glow("#ffd36a", "#ffffff", 0.4, -0.2, 0.8, 1.5, "Screen", 0.5), grain(0.3, 1.4, 0.2, 0.4, "Overlay", 0.4)),
];

/* ───────────── dark & moody ───────────── */

const moody = make("Dark & Moody");
const MOODY: LibraryItem[] = [
  moody("Dark Frame", "shade vignette cinematic", vignette("#000000", 0.55, 0.5, 0.9), shade("#000000", 180, 0.6, "Top shade"), shade("#000000", 0, 0.6, "Bottom shade")),
  moody("Deep Well", "dark centre well black", vignette("#000000", 0.4, 0.5, 0.95), glow("#2a1a5e", "#6d5bff", 0, 0, 0.6, 2, "Screen", 0.35)),
  moody("Midnight Library", "navy warm lamp dark", vignette("#02040a", 0.6, 0.6, 0.85), glow("#ff9d2e", "#ffe08a", -0.5, 0.2, 0.5, 2.2, "Screen", 0.5, "Lamp"), grain(0.4, 1.2, 0, 0.5, "Overlay", 0.4)),
  moody("Crimson Hour", "red dark blood moody", vignette("#1a0006", 0.55, 0.55, 0.85), glow("#e11d48", "#ffd0d8", 0, 0.1, 0.7, 1.8, "Screen", 0.4), grain(0.45, 1.4, 0, 0.5, "Overlay", 0.45)),
  moody("Forest Gloom", "green dark forest fog", noise("#000000", "#8ff0b8", [1.1, 0.7, 1.4, 0.4], "Screen", 0.25, true, "Mist"), vignette("#04140d", 0.55, 0.55, 0.85), tint("#0a3a2a", "Soft Light", 0.4)),
  moody("Stormy Sea", "sea storm blue grey", noise("#000000", "#9ec9ff", [1.6, 0.9, 2, 0.9], "Screen", 0.25, true, "Spray"), tint("#10283a", "Soft Light", 0.5), vignette("#000000", 0.55, 0.6, 0.8)),
  moody("Candle Room", "candle warm dark amber", vignette("#0a0402", 0.5, 0.55, 0.9), glow("#ff8a1f", "#ffe08a", 0, -0.05, 0.45, 2.4, "Screen", 0.6, "Flame"), grain(0.45, 1.4, 0, 0.7, "Overlay", 0.45)),
  moody("Violet Dusk", "violet dark purple night", vignette("#10043a", 0.55, 0.6, 0.85), glow("#7a3cff", "#e5d4ff", 0.3, 0.2, 0.7, 1.8, "Screen", 0.4), grain(0.35, 1.2, 0.1, 0.5, "Overlay", 0.4)),
  moody("Graphite Studio", "grey studio neutral dark", vignette("#000000", 0.6, 0.7, 0.8), sheen("#ffffff", "#000000", 160, "Overlay", 0.3), desaturate(0.7)),
  moody("Smoke & Mirrors", "smoke dark mist", noise("#000000", "#ffffff", [2, 0.9, 2, 0.8], "Screen", 0.3, true, "Smoke"), vignette("#000000", 0.55, 0.55, 0.85), grain(0.4, 1.4, 0, 0.5, "Overlay", 0.4)),
  moody("Ember Night", "ember orange black fire", glow("#ff3b00", "#ffe08a", 0, -0.35, 0.8, 1.8, "Screen", 0.5, "Heat"), noise("#000000", "#ff6a1a", [1.6, 0.9, 2, 1.1], "Add", 0.2, true, "Embers"), vignette("#000000", 0.5, 0.5, 0.9)),
  moody("Abyss", "deep ocean blue black", shade("#000000", 0, 0.8, "Depth"), glow("#00a6a6", "#c8fff2", 0, 0.4, 0.8, 1.8, "Screen", 0.3, "Surface light"), vignette("#00060a", 0.55, 0.55, 0.85)),
  moody("Gothic", "gothic purple red dark", vignette("#0a0014", 0.5, 0.55, 0.9), glow("#8f2a85", "#ffd6fb", 0, 0.2, 0.6, 2, "Screen", 0.35), grain(0.5, 1.6, 0, 0.6, "Overlay", 0.5)),
  moody("Rainy Window", "rain blue grey window", lines("stripes", [40, 0.1, 0.4, 100], ["#000000", "#cfe3ff"], "Screen", 0.12, "Rain", "Screen"), tint("#10283a", "Soft Light", 0.5), vignette("#000000", 0.6, 0.6, 0.7)),
];

/* ───────────── paper & print ───────────── */

const print = make("Paper & Print");
const paperTooth = (opacity = 0.35): LayerPreset => grain(0.7, 2.2, 0, 0.15, "Multiply", opacity, "Paper tooth");
const PRINT: LibraryItem[] = [
  print("Paper Print", "paper multiply halftone", paperTooth(), tint("#f3ead6", "Multiply", 0.92, "Paper tint")),
  print("Halftone Poster", "halftone dots print pop", lines("dots", [5, 0.5, 0.5, 30], ["#000000", "#ffffff"], "Overlay", 0.5, "Halftone"), paperTooth(0.3), tint("#f3ead6", "Multiply", 0.9)),
  print("Newspaper", "news print grey old", lines("dots", [9, 0.4, 0.4, 45], ["#000000", "#ffffff"], "Multiply", 0.35, "Halftone"), paperTooth(0.45), tint("#e6dfcc", "Multiply", 0.95, "Newsprint")),
  print("Blueprint", "blueprint technical grid blue", lines("grid", [6, 0.05, 0.04, 0], ["#000000", "#cfe3ff"], "Screen", 0.5, "Fine grid"), lines("grid", [1.5, 0.08, 0.04, 0], ["#000000", "#ffffff"], "Screen", 0.5, "Major grid"), tint("#0a3a8a", "Multiply", 0.9, "Blue")),
  print("Graph Paper", "graph grid school", lines("grid", [8, 0.05, 0.04, 0], ["#000000", "#6a9ad6"], "Multiply", 0.5, "Squares"), paperTooth(0.3), tint("#fbf9f0", "Multiply", 0.95)),
  print("Riso Duo", "risograph two colour print", lines("dots", [6, 0.45, 0.4, 15], ["#000000", "#ff48b0"], "Multiply", 0.5, "Pink dots"), lines("dots", [6, 0.45, 0.4, 75], ["#000000", "#00a6e0"], "Multiply", 0.45, "Blue dots"), paperTooth(0.4)),
  print("Linocut", "linocut stripes ink bold", lines("stripes", [14, 0.5, 0.04, 20], ["#000000", "#10131c"], "Multiply", 0.5, "Carved lines"), paperTooth(0.45), tint("#f1ebdd", "Multiply", 0.95)),
  print("Sketchbook", "sketch hatch pencil", lines("hatch", [8, 0.12, 0.08, 0], ["#ffffff", "#3a3a44"], "Multiply", 0.4, "Pencil hatch"), paperTooth(0.4), tint("#f6f1e4", "Multiply", 0.95)),
  print("Kraft Label", "kraft brown cardboard", grain(0.8, 3, 0, 0, "Multiply", 0.5, "Fibre"), tint("#c4a070", "Multiply", 0.9, "Kraft")),
  print("Comic Pop", "comic dots pop art", lines("dots", [7, 0.55, 0.15, 45], ["#000000", "#ff5f8f"], "Multiply", 0.5, "Ben-Day dots"), paperTooth(0.25), tint("#fff7d0", "Multiply", 0.9)),
  print("Letterpress", "letterpress deboss cream", grain(0.9, 3, 0, 0, "Multiply", 0.5, "Pressed fibre"), vignette("#6a5a3a", 0.8, 0.8, 0.25, "Ink edge"), tint("#f3ead6", "Multiply", 0.92)),
  print("Washi Tape", "washi japanese stripes", lines("stripes", [6, 0.35, 0.05, 45], ["#ffffff", "#ff9ac0"], "Multiply", 0.5, "Stripes"), grain(0.6, 3.4, 0, 0, "Multiply", 0.3, "Fibre"), tint("#fff6f8", "Multiply", 0.9)),
  print("Receipt", "receipt thermal white", lines("stripes", [40, 0.1, 0.4, 90], ["#ffffff", "#bdbdbd"], "Multiply", 0.25, "Thermal bands"), paperTooth(0.2), tint("#f7f7f2", "Multiply", 0.95)),
  print("Vintage Postcard", "postcard stamp old paper", vignette("#7a5a2a", 0.7, 0.6, 0.4, "Age"), paperTooth(0.45), tint("#ecdcb0", "Multiply", 0.9, "Aged paper")),
];

/* ───────────── glass & gloss ───────────── */

const glass = make("Glass & Gloss");
const GLASS: LibraryItem[] = [
  glass("Glass Light", "sheen reflection overlay", vignette("#000000", 0.8, 0.8, 0.4, "Frame"), glow("#ffffff", "#ffffff", -0.4, 0.3, 0.6, 1.8, "Screen", 0.5, "Highlight"), sheen("#ffffff", "#000000", 135, "Overlay", 0.5)),
  glass("Frosted Pane", "frosted glass blur white", noise("#ffffff", "#ffffff", [2.4, 0.6, 1.2, 0.2], "Soft Light", 0.5, false, "Frost"), tint("#ffffff", "Soft Light", 0.3, "Milk"), grain(0.35, 1.4, 0, 0.2, "Overlay", 0.4)),
  glass("Chrome Bar", "chrome metal sheen silver", sheen("#ffffff", "#000000", 100, "Overlay", 0.6), sheen("#000000", "#ffffff", 20, "Soft Light", 0.5, "Reflection"), vignette("#000000", 0.7, 0.7, 0.35)),
  glass("Glossy Pill", "gloss highlight candy", glow("#ffffff", "#ffffff", -0.2, 0.35, 0.45, 2, "Screen", 0.6, "Top shine"), shade("#000000", 0, 0.35, "Underside"), vignette("#000000", 0.8, 0.7, 0.3)),
  glass("Soap Bubble", "bubble iridescent film", glow("#ff9ad5", "#ffffff", -0.3, 0.25, 0.5, 1.8, "Screen", 0.4), glow("#7fe8ff", "#ffffff", 0.3, -0.2, 0.5, 1.8, "Screen", 0.4), sheen("#ffd6fb", "#9ad1ff", 150, "Soft Light", 0.5)),
  glass("Gold Foil", "gold foil metallic shine", sheen("#fff1b8", "#a87000", 120, "Overlay", 0.6), sheen("#a87000", "#fff1b8", 30, "Soft Light", 0.5), glow("#ffe08a", "#ffffff", 0.3, 0.3, 0.5, 2, "Screen", 0.4)),
  glass("Rose Gold", "rose gold metallic pink", sheen("#ffe0d6", "#a85a4a", 125, "Overlay", 0.6), sheen("#a85a4a", "#ffe0d6", 35, "Soft Light", 0.5), glow("#ffc0b0", "#ffffff", -0.3, 0.3, 0.5, 2, "Screen", 0.35)),
  glass("Holo Foil", "holographic foil rainbow", sheen("#ff9ad5", "#9ad1ff", 130, "Overlay", 0.5), sheen("#c8ff9a", "#ff9ad5", 40, "Soft Light", 0.5), grain(0.3, 1, 0.8, 0.3, "Soft Light", 0.5)),
  glass("Wet Look", "wet shine rain highlight", glow("#ffffff", "#ffffff", 0.25, 0.3, 0.7, 1.6, "Soft Light", 0.7, "Sheen"), vignette("#000000", 0.7, 0.7, 0.5), sheen("#ffffff", "#000000", 160, "Soft Light", 0.4)),
  glass("Ice Sheet", "ice frozen cold glass", noise("#06141f", "#ffffff", [1.8, 0.8, 1.5, 0.2], "Soft Light", 0.55, false, "Frost"), glow("#bfe9ff", "#ffffff", -0.3, 0.3, 0.8, 1.6, "Screen", 0.5), tint("#4fb3d6", "Soft Light", 0.3)),
  glass("Lens Flare", "lens flare camera light", glow("#ffe08a", "#ffffff", 0.5, 0.3, 0.3, 2.4, "Add", 0.6, "Flare core"), glow("#ff6fb5", "#ffffff", 0.2, 0.1, 0.5, 1.6, "Screen", 0.3, "Flare halo"), glow("#7fe8ff", "#ffffff", -0.1, -0.1, 0.35, 2, "Screen", 0.3, "Ghost")),
  glass("Silk Sheen", "silk satin soft light", sheen("#ffffff", "#000000", 150, "Soft Light", 0.6), glow("#ffffff", "#ffffff", 0, 0.1, 1, 1.4, "Soft Light", 0.4), grain(0.2, 0.8, 0, 0.2, "Soft Light", 0.5)),
  glass("Spotlit Stage", "spotlight stage cone", glow("#ffffff", "#ffffff", 0, 0.2, 0.5, 2.2, "Add", 0.5, "Spot"), vignette("#000000", 0.5, 0.5, 0.9), shade("#000000", 180, 0.4)),
  glass("Crystal Edge", "crystal bevel prism edge", vignette("#ffffff", 0.75, 0.3, 0.35, "Rim light"), sheen("#7fe8ff", "#ff9ad5", 135, "Soft Light", 0.4, "Prism"), glow("#ffffff", "#ffffff", -0.4, 0.3, 0.4, 2, "Screen", 0.45)),
];

/* ───────────── atmosphere: sky, weather and time of day ───────────── */

const air = make("Atmosphere");
const AIR: LibraryItem[] = [
  air("Dawn", "dawn sunrise pink sky", glow("#ff9a8b", "#fff0e6", 0, -0.35, 0.9, 1.5, "Screen", 0.6, "Horizon"), shade("#2a3a6a", 180, 0.5, "Sky"), grain(0.25, 1, 0, 0.3, "Soft Light", 0.5)),
  air("High Noon", "noon bright sun clear", glow("#fff6d0", "#ffffff", 0, 0.35, 0.6, 1.8, "Screen", 0.6, "Sun"), tint("#8ac4ff", "Soft Light", 0.35, "Blue sky")),
  air("Golden Fog", "golden fog warm mist", noise("#000000", "#ffd27a", [0.8, 0.6, 1.2, 0.3], "Screen", 0.45, true, "Fog"), glow("#ffb347", "#fff1b8", 0.5, 0.2, 1, 1.4, "Screen", 0.45)),
  air("Blue Hour", "blue hour twilight cold", tint("#0a2a6a", "Soft Light", 0.5, "Twilight"), glow("#4f8cff", "#cfe3ff", 0, -0.3, 0.9, 1.6, "Screen", 0.4, "Afterglow"), vignette("#000814", 0.65, 0.6, 0.5)),
  air("Starry Night", "stars night sky dark", noise("#000000", "#ffffff", [6, 0.3, 3, 0.2], "Add", 0.5, true, "Stars"), shade("#000000", 0, 0.5, "Ground"), glow("#2a3a9a", "#7a9aff", 0, 0.3, 1, 1.6, "Screen", 0.35)),
  air("Thunderhead", "storm thunder dark clouds", glow("#ffffff", "#cfe3ff", 0.4, 0.3, 0.4, 2.4, "Add", 0.35, "Flash"), noise("#05070d", "#6a7488", [1.1, 0.9, 1.7, 0.8], "Overlay", 0.65, false, "Cloud deck"), vignette("#000000", 0.6, 0.6, 0.6)),
  air("Snow Day", "snow white cold winter", noise("#000000", "#ffffff", [5.5, 0.3, 3, 1.4], "Screen", 0.5, true, "Snowfall"), tint("#dfeaf7", "Soft Light", 0.5, "Overcast"), grain(0.25, 1, 0, 0.3, "Soft Light", 0.5)),
  air("Desert Heat", "desert heat haze sand", glow("#ffd36a", "#ffffff", 0.2, 0.35, 1, 1.4, "Screen", 0.55), noise("#000000", "#e3c9a0", [0.9, 0.6, 1.3, 0.8], "Screen", 0.3, true, "Heat haze"), tint("#d9a35a", "Soft Light", 0.4)),
  air("Tropical", "tropical turquoise sun beach", glow("#00c6c6", "#c8fff2", -0.3, 0.2, 0.9, 1.5, "Screen", 0.5), glow("#ffd43d", "#ffffff", 0.5, 0.35, 0.6, 1.8, "Screen", 0.5, "Sun"), tint("#04696a", "Soft Light", 0.3)),
  air("Aurora Sky", "aurora northern green sky", glow("#3df5c4", "#d9ffe9", -0.2, 0.2, 0.8, 1.5, "Screen", 0.45, "Green band"), glow("#b45fff", "#f3eaff", 0.4, 0.25, 0.7, 1.6, "Screen", 0.35, "Violet band"), shade("#000814", 0, 0.6, "Night ground")),
  air("Volcanic Ash", "volcano ash smoke red", noise("#000000", "#b4b4be", [1.4, 0.9, 1.8, 0.6], "Screen", 0.4, true, "Ash"), glow("#ff3b00", "#ffe08a", 0, -0.35, 0.7, 1.8, "Screen", 0.45, "Lava glow"), vignette("#000000", 0.55, 0.55, 0.8)),
  air("Cherry Blossom Air", "spring blossom pink petals", noise("#000000", "#ffc7e6", [5, 0.4, 3, 1], "Screen", 0.4, true, "Petals"), glow("#f4c7d6", "#ffffff", 0, 0.2, 1, 1.5, "Screen", 0.45), tint("#ffd0e0", "Soft Light", 0.3)),
  air("Autumn Haze", "autumn orange fall warm", noise("#000000", "#e8a13a", [1.1, 0.7, 1.3, 0.5], "Screen", 0.35, true, "Haze"), tint("#c2501a", "Soft Light", 0.4, "Fall grade"), vignette("#150602", 0.65, 0.6, 0.5)),
  air("Moonlit Mist", "moon night mist cool", glow("#dfe9ff", "#ffffff", -0.3, 0.35, 0.45, 2.2, "Screen", 0.55, "Moon"), noise("#000000", "#dfe9ff", [0.6, 0.6, 1.1, 0.2], "Screen", 0.4, true, "Mist"), vignette("#000a1a", 0.6, 0.6, 0.6)),
  air("Sunset Strip", "sunset orange pink horizon", glow("#ff3e7f", "#ffd166", 0, -0.25, 1, 1.4, "Screen", 0.65, "Horizon"), shade("#2a1240", 180, 0.55, "Sky"), grain(0.3, 1.2, 0, 0.3, "Overlay", 0.4)),
  air("Overcast", "overcast grey flat cloudy", tint("#9aa4b8", "Soft Light", 0.5, "Flat light"), noise("#6e6e78", "#ffffff", [1.2, 0.6, 1, 0.3], "Soft Light", 0.5, false, "Cloud deck"), desaturate(0.4)),
];

export const RECIPE_ITEMS: LibraryItem[] = [...FILM, ...NEON, ...DREAMY, ...MOODY, ...PRINT, ...GLASS, ...AIR];
