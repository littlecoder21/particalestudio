import { defaultKnobs } from "./generators";
import { DEFAULT_MASK, DEFAULT_PROJECT, normalizeProject } from "./project";
import { newBaseLayer, newLayer } from "./stack";
import { DEFAULT_TOUCH } from "./touch";
import type {
  BlendMode,
  GeneratorId,
  LayerKind,
  ShaderLayer,
  ShaderMask,
  ShaderPreset,
  ShaderProject,
  TouchSettings,
} from "./types";

type StackLayer = Partial<ShaderLayer> & { kind: LayerKind };

type Extra = Partial<Omit<ShaderProject, "generator" | "knobs" | "palette" | "accent" | "name" | "layers" | "mask" | "touch">> & {
  /** shorthand for one generator layer on top of the stack */
  overlay?: { enabled?: boolean; generator?: GeneratorId; blend?: BlendMode; opacity?: number };
  /** extra layers above the main field, top layer first */
  layers?: StackLayer[];
  mask?: Partial<ShaderMask>;
  touch?: Partial<TouchSettings>;
};

export function mk(
  name: string,
  tag: string,
  generator: GeneratorId,
  knobs: number[],
  palette: string[],
  accent: string,
  extra: Extra = {},
): ShaderPreset {
  const { overlay, layers, mask, touch, ...rest } = extra;
  const stack: ShaderLayer[] = [];
  if (overlay?.enabled) {
    const g = overlay.generator ?? "stars";
    stack.push(newLayer("field", {
      name: "Overlay",
      generator: g,
      knobs: defaultKnobs(g),
      blend: overlay.blend ?? "Add",
      opacity: overlay.opacity ?? 0.7,
      ownColors: false,
    }));
  }
  for (const layer of layers ?? []) stack.push(newLayer(layer.kind, layer));
  stack.push(newBaseLayer());

  const project = normalizeProject({
    ...DEFAULT_PROJECT,
    ...rest,
    name,
    generator,
    knobs,
    palette,
    palettePositions: undefined,
    accent,
    layers: stack,
    mask: { ...DEFAULT_MASK, ...mask },
    touch: { ...DEFAULT_TOUCH, ...touch },
  });
  return { name, tag, project };
}

export const SHADER_PRESETS: ShaderPreset[] = [
  /* ── Fluid ── */
  mk("Midnight Ink", "Slow indigo smoke", "fluid", [1.4, 1, 1.1, 0],
    ["#05060f", "#141a52", "#3a4fd6", "#8ab4ff", "#f2f7ff"], "#9fe8ff",
    { warp: 0.3, grain: 0.2, vignette: 0.45, contrast: 1.1, glow: 0.2 }),
  mk("Molten Gold", "Liquid metal glow", "fluid", [1.1, 1.2, 1.2, 0.25],
    ["#120700", "#5a2a05", "#c9730c", "#ffc65a", "#fff4cf"], "#fff1b8",
    { relief: 1.4, shine: 0.8, lightAngle: 55, vignette: 0.5 }),
  mk("Neon Smoke", "Electric magenta haze", "fluid", [1.8, 0.9, 1, 0.5],
    ["#06020f", "#3b0a6e", "#e01a9b", "#2de2ff", "#f4fdff"], "#ffffff",
    { speed: 1.2, glow: 0.5, aberration: 0.25, grain: 0.25 }),
  mk("Opal Milk", "Pearly pastel marble", "fluid", [0.9, 0.8, 0.9, 0],
    ["#f7efe9", "#f3c9d6", "#c9b6f2", "#a8d8f0", "#fbf7ff"], "#ffffff",
    { vignette: 0.1, contrast: 0.95, grain: 0.1, relief: 0.6, shine: 0.5, speed: 0.7 }),

  /* ── Black holes ── */
  mk("Event Horizon", "The original lensing hole", "blackhole", [1, 1, 1, 0.66],
    ["#734a2e", "#296ba8", "#b3dbeb", "#f7f5ed", "#8cd9ff"], "#8cd9ff",
    { tone: 1, grain: 0.04, vignette: 0.25 }),
  mk("Ember Singularity", "Fiery accretion disk", "blackhole", [1.1, 1.2, 1.2, 0.5],
    ["#8c290d", "#591a47", "#ff8c40", "#ffebc7", "#ffb359"], "#ffb359",
    { tone: 1, grain: 0.04, vignette: 0.3 }),
  mk("Aurora Maw", "Green-violet void", "blackhole", [0.9, 0.9, 1.4, 0.8],
    ["#1a8c61", "#4d33a6", "#8cf2d9", "#ebfff7", "#b3ffcc"], "#b3ffcc",
    { tone: 1, grain: 0.04, vignette: 0.3 }),
  mk("Mono Lens", "Monochrome gravity", "blackhole", [1.2, 0.8, 0.7, 0.3],
    ["#4d4d4d", "#333842", "#bfc4cc", "#ffffff", "#e6f2ff"], "#e6f2ff",
    { tone: 1, grain: 0.06, vignette: 0.35 }),

  /* ── Light ── */
  mk("Northern Veil", "Aurora over a starry sky", "aurora", [1, 0.5, 1, 1],
    ["#020814", "#06402f", "#12b57c", "#6af0c1", "#b99bff"], "#d9fff1",
    { glow: 0.3, vignette: 0.5, overlay: { enabled: true, generator: "stars", blend: "Add", opacity: 0.8 } }),
  mk("Polar Ember", "Warm winter lights", "aurora", [1.3, 0.4, 1.3, 1.1],
    ["#0a0210", "#5a0f3a", "#f0486a", "#ffa65c", "#fff0b0"], "#fff0b0",
    { glow: 0.35, vignette: 0.45 }),
  mk("Arctic Glass", "Icy translucent curtains", "aurora", [0.9, 0.7, 0.7, 1.6],
    ["#03101c", "#0a3a63", "#2fa0d8", "#a6ecff", "#ffffff"], "#ffffff",
    { relief: 0.5, shine: 0.6, grain: 0.2 }),
  mk("Acid Plasma", "Hyper-saturated waves", "plasma", [4, 0.9, 1.2, 0.2],
    ["#0b0020", "#7a00ff", "#00e5ff", "#b6ff2e", "#fff94a"], "#ffffff",
    { paletteSpeed: 0.15, saturation: 1.15 }),
  mk("Sunset Plasma", "Slow warm gradient", "plasma", [3.8, 0.9, 1.5, 0],
    ["#1c0638", "#6a1b6f", "#e8436a", "#ff9d4d", "#ffe9a8"], "#ffffff",
    { vignette: 0.35, speed: 0.7 }),
  mk("Kaleido Bloom", "Eight-fold mirrored plasma", "plasma", [3, 1, 1.4, 0.1],
    ["#08010f", "#5b1fd1", "#ff3fa4", "#ffd447", "#ffffff"], "#ffffff",
    { symmetry: 8, spin: 4, scale: 1.3 }),
  mk("Solar Burst", "Radiant sun shafts", "rays", [18, 0.9, 0.6, 0],
    ["#0a0200", "#5a1200", "#e5560a", "#ffb020", "#fff7d0"], "#ffffff",
    { glow: 0.5, vignette: 0.4 }),
  mk("Divine Light", "Soft golden god rays", "rays", [28, 0.6, 0.45, 0.1],
    ["#06081a", "#1a2150", "#5b6ac0", "#f0d9a0", "#ffffff"], "#ffffff",
    { glow: 0.6, grain: 0.15, overlay: { enabled: true, generator: "bokeh", blend: "Add", opacity: 0.35 } }),
  mk("Plasma Arcs", "Crawling blue lightning", "electric", [2, 0.05, 1.2, 0.6],
    ["#010208", "#071a4a", "#1a5cff", "#5ee0ff", "#ffffff"], "#ffffff",
    { glow: 0.6 }),
  mk("Violet Storm", "Crackling purple energy", "electric", [1.4, 0.07, 0.9, 0.9],
    ["#05010c", "#2a0a5a", "#7a2cff", "#d28aff", "#ffffff"], "#ffffff",
    { glow: 0.7, aberration: 0.3 }),
  mk("City Bokeh", "Warm out-of-focus lights", "bokeh", [4, 0.8, 1, 0.5],
    ["#0a0612", "#3a1450", "#c4366a", "#ff9a3a", "#ffe6a0"], "#ffffff",
    { glow: 0.3, vignette: 0.5 }),

  /* ── Pattern ── */
  mk("Cracked Neon", "Glowing cell fractures", "voronoi", [6, 0.3, 1, 0],
    ["#04050c", "#0b1233", "#10245e", "#143c8c", "#1a5cc0"], "#27f5ff",
    { glow: 0.3 }),
  mk("Stained Glass", "Lead-lined jewel tones", "voronoi", [5, 0.12, 0.35, 0],
    ["#7a1020", "#d0802a", "#e6c34a", "#2d8a6e", "#2a58b8", "#6b2a9e"], "#0c0a12",
    { vignette: 0.2, grain: 0.1, speed: 0.6 }),
  mk("Cellular Bloom", "Soft glowing petals", "voronoi", [4, 0.15, 0.9, 0.85],
    ["#2b0f3a", "#7a2f8f", "#e6639a", "#ffb38a", "#fff0d6"], "#ffffff",
    { glow: 0.3 }),
  mk("Low-Poly Dusk", "Faceted sunset mosaic", "facets", [4, 0.65, 0.3, 0.4],
    ["#1b0b3a", "#51207a", "#a23b86", "#f0638a", "#ffc5a1"], "#ffffff",
    { vignette: 0.35 }),
  mk("Emerald Crystal", "Polished gem facets", "facets", [3, 0.8, 0.5, 0.5],
    ["#021a14", "#04503c", "#0a9a6a", "#5fe0a8", "#e1fff0"], "#e1fff0",
    { relief: 0.8, shine: 0.5 }),
  mk("Hex Pulse", "Honeycomb energy cells", "hex", [6, 0.25, 1, 0.7],
    ["#05030f", "#2a0f5a", "#7a2cff", "#2fd6ff", "#ffffff"], "#ffffff",
    { glow: 0.3 }),
  mk("Neon Grid", "Retro-futurist lattice", "lattice", [12, 0.08, 0.6, 0.6],
    ["#07010f", "#2a0a5a", "#ff2fa8", "#2fe1ff", "#ffffff"], "#ffffff",
    { aberration: 0.2, glow: 0.3 }),
  mk("Hologram Net", "Scanning cyan mesh", "lattice", [18, 0.05, 0.9, 0.8],
    ["#01080c", "#04323f", "#0aa0b8", "#6cf0ff", "#e6ffff"], "#e6ffff",
    { scanlines: 0.5, glow: 0.4 }),
  mk("Topographic", "Survey-map contour lines", "contours", [1.1, 22, 0.3, 0],
    ["#efe6d2", "#d9c6a0", "#b5a17a", "#8a7556", "#4a3e2c"], "#2c2418",
    { grain: 0.2, vignette: 0.2, speed: 0.6 }),
  mk("Agate Slice", "Banded mineral cross-section", "contours", [0.9, 18, 0.15, 0.7],
    ["#2d0f2a", "#8a2f6b", "#d9588a", "#f5a6a1", "#fff0e0"], "#fff4ea",
    { relief: 0.8, shine: 0.5 }),
  mk("Ripple Moiré", "Overlapping wave rings", "interference", [3, 26, 1, 0.45],
    ["#020611", "#0a2a6a", "#2a6cff", "#8ad0ff", "#ffffff"], "#ffffff",
    {}),
  mk("Sonar Rings", "Radar-green pulses", "interference", [2, 40, 1.2, 0.3],
    ["#000a05", "#003a1a", "#00a84a", "#4aff90", "#d9ffe6"], "#d9ffe6",
    { scanlines: 0.3, vignette: 0.6 }),
  mk("Halftone Bloom", "Pop-art dot screen", "halftone", [30, 0.95, 0.5, 1.2],
    ["#1a0a2e", "#7a1fa2", "#ff3d8a", "#ffb02e", "#fff3c4"], "#ffffff",
    { vignette: 0.15, grain: 0.2 }),

  /* ── Fluid, continued ── */
  mk("Deep Ocean", "Heavy blue swell", "waves", [2.6, 0.4, 0.5, 0.6],
    ["#01101f", "#04406e", "#0a7fa8", "#3fc9d0", "#d3fbf3"], "#ffffff",
    { relief: 1.2, shine: 0.6 }),
  mk("Liquid Chrome", "Mirror-polished metal", "waves", [1.6, 0.1, 0.8, 0.4],
    ["#08090d", "#3b4252", "#9aa3b8", "#e6ebf5", "#ffffff"], "#ffffff",
    { relief: 2, shine: 1, contrast: 1.2 }),
  mk("Sunset Swell", "Coral and gold ripples", "waves", [3, 0.6, 0.7, 2],
    ["#2a0c3a", "#8a2b66", "#ee5b5b", "#ffb35a", "#fff0c2"], "#ffffff",
    { relief: 0.8, shine: 0.6 }),
  mk("Lava Lamp", "Warm rising blobs", "lava", [5, 1, 0.55, 0.35],
    ["#2a0505", "#8a1111", "#ee4a14", "#ffa31a", "#fff0a0"], "#ffe28a",
    { relief: 0.6, vignette: 0.4 }),
  mk("Blue Jelly", "Glassy gel droplets", "lava", [4, 1.2, 0.6, 0.2],
    ["#02081c", "#0a2a8a", "#2a6dff", "#7fc8ff", "#f0faff"], "#ffffff",
    { relief: 1.8, shine: 1.2 }),
  mk("Satin Ribbons", "Folded rose silk", "silk", [7, 0.9, 0.35, 0.8],
    ["#2a0212", "#8a0f35", "#d9345a", "#ff8a9f", "#ffe2e8"], "#ffffff",
    { relief: 2, shine: 1 }),
  mk("Midnight Silk", "Cool navy drapery", "silk", [10, 1.3, 0.2, 2.4],
    ["#02030a", "#0a1235", "#1b3a8a", "#6f8fd6", "#d6e2ff"], "#ffffff",
    { relief: 1.6, shine: 0.8 }),
  mk("Mesh Gradient", "Soft multicolour blend", "mesh", [5, 1.2, 1, 0.3],
    ["#ff6a9f", "#ffb86a", "#7a8cff", "#5fe3c8", "#c28cff"], "#ffffff",
    { grain: 0.25, vignette: 0.1 }),
  mk("Sunrise Mesh", "Peach and violet dawn", "mesh", [4, 1, 0.8, 0.4],
    ["#ffd08a", "#ff8a6a", "#e9487a", "#7a3a9a", "#2a2a7a"], "#ffffff",
    { grain: 0.3, vignette: 0.15, speed: 0.8 }),
  mk("Pool Light", "Sun-dappled caustics", "caustics", [0.7, 1, 8, 5],
    ["#01283a", "#04708f", "#18b6d0", "#8ff0f0", "#ffffff"], "#ffffff",
    { vignette: 0.2 }),

  /* ── Cosmic ── */
  mk("Deep Nebula", "Violet gas clouds", "nebula", [1.2, 0.6, 0.6, 1],
    ["#030312", "#1a1060", "#6a2bb0", "#e0529c", "#ffd6c0"], "#ffffff",
    { glow: 0.3, overlay: { enabled: true, generator: "stars", blend: "Screen", opacity: 0.6 } }),
  mk("Crimson Cloud", "Red dust and embers", "nebula", [1, 0.35, 0.8, 0.7],
    ["#050103", "#3a0614", "#a3141f", "#f2641c", "#ffd27a"], "#fff4d6",
    { glow: 0.2 }),
  mk("Spiral Galaxy", "A classic two-arm spiral", "galaxy", [2, 3, 1, 0.6],
    ["#010108", "#141a50", "#3a4fd0", "#9fb4ff", "#fff4dc"], "#ffffff",
    {}),
  mk("Rose Galaxy", "Three-arm pink spiral", "galaxy", [3, 2.4, 1.2, 0.8],
    ["#08010c", "#3a0a4a", "#9a2a8a", "#ff7ab0", "#ffe9d0"], "#ffffff",
    { glow: 0.2 }),
  mk("Wormhole", "A tunnel through space", "tunnel", [4, 1.5, 3, 1],
    ["#02030a", "#18135a", "#5a3bd6", "#27c8ff", "#e8fbff"], "#ffffff",
    { glow: 0.4 }),
  mk("Hyperdrive", "Warp-speed light streaks", "tunnel", [6, 0.4, 8, 0.6],
    ["#020306", "#0b1d3a", "#1f6dff", "#ff7a1a", "#ffe3b0"], "#ffffff",
    { aberration: 0.5, scanlines: 0.2 }),
  mk("Julia Bloom", "Fractal flower", "fractal", [1.2, 0.78, 2, 64],
    ["#02010a", "#1a0a5a", "#7a1fd0", "#ff4fa0", "#ffd7a0"], "#ffffff",
    { glow: 0.2 }),
  mk("Dream Orbs", "Pastel floating bubbles", "bokeh", [3, 1.1, 0.8, 0.8],
    ["#1a1033", "#6a4bd0", "#ff8fd0", "#8fe8ff", "#ffffff"], "#ffffff",
    { glow: 0.2 }),

  /* ── Shapes: an image mask drives the shader ── */
  mk("Aurora Butterfly", "Glowing silhouette with stars", "aurora", [1.1, 0.55, 1.2, 1.2],
    ["#020814", "#06402f", "#12b57c", "#6af0c1", "#b99bff"], "#d9fff1",
    {
      grain: 0.12, vignette: 0.4,
      mask: { enabled: true, source: { kind: "shape", id: "butterfly" }, scale: 1.02, glow: 0.55, halo: 1.1, distort: 0.6, flow: 0.5, edge: 0.08, background: "#02040a" },
      layers: [{ kind: "field", generator: "stars", blend: "Add", opacity: 0.75, region: "Inside" }],
    }),
  mk("Ember Skull", "Smoking, spark-filled skull", "fluid", [1.3, 1.1, 1.2, 0.2],
    ["#120200", "#6a1403", "#e8590c", "#ffb347", "#fff3c4"], "#ffe2a8",
    {
      relief: 0.8, shine: 0.5, vignette: 0.5,
      mask: { enabled: true, source: { kind: "shape", id: "skull" }, scale: 1.05, smoke: 0.5, particles: 0.3, halo: 1.2, flow: 0.8, glow: 0.6, background: "#060201", edge: 0.15 },
    }),
  mk("Chrome Heart", "Liquid metal pillow", "waves", [1.6, 0.1, 0.8, 0.4],
    ["#08090d", "#3b4252", "#9aa3b8", "#e6ebf5", "#ffffff"], "#ffffff",
    {
      relief: 1.6, shine: 1, contrast: 1.15,
      mask: { enabled: true, source: { kind: "shape", id: "heart" }, scale: 1, bevel: 1.2, outline: 0.25, halo: 0.5, background: "#05060b", edge: 0.05 },
    }),
  mk("Smoke Moon", "A crescent that dissolves", "fluid", [1.5, 1, 1.1, 0.1],
    ["#04040c", "#1b1f5c", "#5b6cff", "#b8c6ff", "#ffffff"], "#dfe6ff",
    {
      grain: 0.2,
      mask: { enabled: true, source: { kind: "shape", id: "moon" }, scale: 1.1, smoke: 0.8, smokeScale: 1.4, halo: 1.1, edge: 0.5, glow: 0.3, background: "#03030a" },
    }),
  mk("Particle Flower", "A bloom made of drifting dots", "mesh", [5, 1.2, 1, 0.3],
    ["#ff6a9f", "#ffb86a", "#7a8cff", "#5fe3c8", "#c28cff"], "#ffffff",
    {
      mask: { enabled: true, source: { kind: "shape", id: "flower" }, scale: 1.05, particles: 1, particleSize: 0.9, particleSpeed: 0.8, glow: 0.5, halo: 0.8, background: "#0a0612" },
    }),
  mk("Echo Star", "Contour rings follow the edge", "plasma", [3.5, 0.9, 1.1, 0.2],
    ["#07010f", "#2a0a5a", "#ff2fa8", "#2fe1ff", "#ffffff"], "#ffffff",
    {
      glow: 0.2,
      mask: { enabled: true, source: { kind: "shape", id: "star" }, scale: 1.05, pattern: "Echo", patternAmount: 0.9, outline: 0.6, halo: 0.7, background: "#05010c" },
    }),
  mk("Hologram Drop", "Scanning cyan water drop", "lattice", [16, 0.06, 0.8, 0.8],
    ["#01080c", "#04323f", "#0aa0b8", "#6cf0ff", "#e6ffff"], "#e6ffff",
    {
      aberration: 0.25, scanlines: 0.3,
      mask: { enabled: true, source: { kind: "shape", id: "drop" }, scale: 1.05, pattern: "Scan", patternAmount: 0.6, halo: 0.8, glow: 0.4, background: "#010608" },
    }),

  /* ── Stacks: several layers working together ── */
  mk("Dream Haze", "Soft gradient, bloom and grain", "mesh", [5, 1.1, 0.8, 0.3],
    ["#ff9ad5", "#ffc58a", "#8f9bff", "#7be3d2", "#d6a8ff"], "#ffffff",
    {
      vignette: 0.15, grain: 0.05,
      layers: [
        { kind: "grain", name: "Film grain", blend: "Overlay", opacity: 0.4, knobs: [0.6, 1.4, 0.1, 0.5] },
        { kind: "glow", name: "Bloom", blend: "Screen", opacity: 0.7, knobs: [-0.35, 0.2, 0.75, 1.6], colors: ["#ff9ad5", "#ffffff"] },
        { kind: "noise", name: "Haze", blend: "Soft Light", opacity: 0.45, colors: ["#6a5acd", "#ffe6f7"], knobs: [1.2, 0.8, 1.2, 0.5] },
      ],
    }),
  mk("Synthwave Horizon", "Neon grid with a gradient wash", "lattice", [12, 0.07, 0.6, 0.6],
    ["#07010f", "#2a0a5a", "#ff2fa8", "#2fe1ff", "#ffffff"], "#ffffff",
    {
      glow: 0.3,
      layers: [
        { kind: "pattern", name: "Scanlines", pattern: "stripes", blend: "Multiply", opacity: 0.35, colors: ["#000000", "#ffffff"], knobs: [9, 0.45, 0.2, 90] },
        { kind: "vignette", name: "Edge shade", opacity: 0.8, knobs: [0.65, 0.7, 1, 0] },
        { kind: "linear", name: "Sky wash", blend: "Soft Light", opacity: 0.7, colors: ["#ff2fa8", "#2fe1ff"], knobs: [180, 1, 0, 0] },
      ],
    }),
  mk("Paper Print", "Halftone on warm paper", "halftone", [34, 0.95, 0.5, 1.2],
    ["#1a0a2e", "#7a1fa2", "#ff3d8a", "#ffb02e", "#fff3c4"], "#ffffff",
    {
      grain: 0.05, vignette: 0.1,
      layers: [
        { kind: "grain", name: "Paper tooth", blend: "Multiply", opacity: 0.35, knobs: [0.7, 2.2, 0, 0.15] },
        { kind: "solid", name: "Paper tint", blend: "Multiply", opacity: 0.92, colors: ["#f3ead6", "#f3ead6"] },
      ],
    }),
  mk("Deep Sea Glass", "Caustics under a dark lens", "caustics", [0.7, 1, 8, 5],
    ["#01283a", "#04708f", "#18b6d0", "#8ff0f0", "#ffffff"], "#ffffff",
    {
      relief: 0.5,
      layers: [
        { kind: "noise", name: "Plankton", blend: "Screen", opacity: 0.25, colors: ["#000000", "#9ff6ff"], knobs: [2.4, 0.9, 2, 0.4], keyed: true },
        { kind: "radial", name: "Depth", blend: "Multiply", opacity: 0.8, colors: ["#ffffff", "#021018"], knobs: [0, 0, 1.1, 1] },
      ],
    }),
  mk("Gilded Night", "Nebula, stars and a golden glow", "nebula", [1.1, 0.5, 0.6, 1],
    ["#030312", "#1a1060", "#6a2bb0", "#e0529c", "#ffd6c0"], "#ffffff",
    {
      glow: 0.2,
      layers: [
        { kind: "vignette", name: "Frame", opacity: 0.7, knobs: [0.7, 0.8, 1, 0] },
        { kind: "glow", name: "Gold light", blend: "Screen", opacity: 0.6, knobs: [0.2, 0.25, 0.55, 1.8], colors: ["#b8860b", "#fff1b8"] },
        { kind: "field", name: "Stars", generator: "stars", knobs: defaultKnobs("stars"), blend: "Add", opacity: 0.8 },
      ],
    }),
];

/** Ready-to-use palettes for the colour panel (dark → light). Some carry their own stop positions. */
export const PALETTE_LIBRARY: Array<{ name: string; colors: string[]; accent: string; positions?: number[]; soft?: number }> = [
  { name: "Midnight", colors: ["#05060f", "#141a52", "#3a4fd6", "#8ab4ff", "#f2f7ff"], accent: "#9fe8ff" },
  { name: "Ember", colors: ["#120700", "#5a2a05", "#c9730c", "#ffc65a", "#fff4cf"], accent: "#fff1b8" },
  { name: "Neon", colors: ["#06020f", "#3b0a6e", "#e01a9b", "#2de2ff", "#f4fdff"], accent: "#ffffff" },
  { name: "Aurora", colors: ["#020814", "#06402f", "#12b57c", "#6af0c1", "#b99bff"], accent: "#d9fff1" },
  { name: "Sunset", colors: ["#1c0638", "#6a1b6f", "#e8436a", "#ff9d4d", "#ffe9a8"], accent: "#ffffff" },
  { name: "Ocean", colors: ["#01101f", "#04406e", "#0a7fa8", "#3fc9d0", "#d3fbf3"], accent: "#ffffff" },
  { name: "Orchid", colors: ["#08010c", "#3a0a4a", "#9a2a8a", "#ff7ab0", "#ffe9d0"], accent: "#ffffff" },
  { name: "Chrome", colors: ["#08090d", "#3b4252", "#9aa3b8", "#e6ebf5", "#ffffff"], accent: "#ffffff" },
  { name: "Acid", colors: ["#0b0020", "#7a00ff", "#00e5ff", "#b6ff2e", "#fff94a"], accent: "#ffffff" },
  { name: "Forest", colors: ["#021a14", "#04503c", "#0a9a6a", "#5fe0a8", "#e1fff0"], accent: "#e1fff0" },
  { name: "Candy", colors: ["#ff6a9f", "#ffb86a", "#7a8cff", "#5fe3c8", "#c28cff"], accent: "#ffffff" },
  { name: "Paper", colors: ["#efe6d2", "#d9c6a0", "#b5a17a", "#8a7556", "#4a3e2c"], accent: "#2c2418" },
  { name: "Mono", colors: ["#050505", "#2a2a2a", "#7a7a7a", "#cfcfcf", "#ffffff"], accent: "#ffffff" },
  { name: "Lava", colors: ["#2a0505", "#8a1111", "#ee4a14", "#ffa31a", "#fff0a0"], accent: "#ffe28a" },
  { name: "Duotone Burn", colors: ["#0b0b12", "#ff3d6e", "#ffd166"], accent: "#ffffff", positions: [0, 0.72, 1] },
  { name: "Deep Dive", colors: ["#00060f", "#003a66", "#00b4d8", "#caf0f8"], accent: "#ffffff", positions: [0, 0.4, 0.78, 1] },
  { name: "Late Glow", colors: ["#10002b", "#7b2cbf", "#ff6d00", "#ffe066"], accent: "#ffffff", positions: [0, 0.3, 0.75, 1] },
  { name: "Mint Cream", colors: ["#f1fff8", "#b8f2d8", "#4fd1a5", "#0f766e"], accent: "#052e2b", positions: [0, 0.35, 0.7, 1] },
  { name: "Hard Bands", colors: ["#1b1b3a", "#693668", "#a74482", "#f84aa7", "#ff3562"], accent: "#ffffff", soft: 0 },
  { name: "Risograph", colors: ["#f4ecd8", "#ff6f91", "#3a6ea5", "#1b1b3a"], accent: "#ffffff", positions: [0, 0.33, 0.66, 1], soft: 0.15 },
  { name: "Terminal", colors: ["#000000", "#003b12", "#00ff66", "#d6ffe3"], accent: "#00ff66", positions: [0, 0.5, 0.85, 1] },
  { name: "Rose Gold", colors: ["#2b1118", "#8a4b5a", "#e8a598", "#ffe8dc"], accent: "#ffffff", positions: [0, 0.4, 0.8, 1] },
  { name: "Glacier", colors: ["#041428", "#1b5e8a", "#7fd0ee", "#e8fbff", "#ffffff"], accent: "#ffffff", positions: [0, 0.3, 0.6, 0.88, 1] },
  { name: "Toxic", colors: ["#0b1a00", "#2d6a00", "#9be000", "#f4ff7a"], accent: "#ffffff", positions: [0, 0.45, 0.8, 1] },
];
