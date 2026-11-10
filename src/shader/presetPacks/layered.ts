import { inGroup } from "../presetBuilder";
import { pal } from "./palettes";

const m = inGroup("Layered looks");

/** Several layers working together: a field, light, texture and a frame. */
export const LAYERED_PRESETS = [
  m("Golden Hour Film", "Warm mesh, bloom, grain and a frame", "mesh", [5, 1, 0.8, 0.3], pal("sunrise"), "#ffeaa8", {
    layers: [
      { kind: "grain", name: "Film grain", blend: "Overlay", opacity: 0.45, knobs: [0.5, 1.2, 0, 0.6] },
      { kind: "glow", name: "Sun bloom", blend: "Screen", opacity: 0.5, colors: ["#ff9a3d", "#fff1b8"], knobs: [0.3, 0.2, 0.9, 1.5] },
      { kind: "vignette", name: "Frame", opacity: 0.6, knobs: [0.7, 0.7, 1, 0] },
    ],
  }),
  m("Nocturne Glass", "Indigo nebula, stars and a violet glow", "nebula", [1.2, 0.5, 0.6, 1], pal("indigo"), "#efeaff", {
    layers: [
      { kind: "vignette", name: "Frame", opacity: 0.8, knobs: [0.65, 0.7, 1, 0] },
      { kind: "glow", name: "Violet light", blend: "Screen", opacity: 0.35, colors: ["#5a35c8", "#efeaff"], knobs: [-0.3, 0.2, 0.7, 1.6] },
      { kind: "field", name: "Stars", generator: "stars", blend: "Add", opacity: 0.7 },
    ],
  }),
  m("Riso Poster", "Candy halftone printed on cream paper", "halftone", [30, 0.9, 0.5, 1.3], pal("candy"), "#ffffff", {
    grain: 0.05,
    layers: [
      { kind: "grain", name: "Paper tooth", blend: "Multiply", opacity: 0.3, knobs: [0.7, 2, 0, 0.15] },
      { kind: "solid", name: "Paper tint", blend: "Multiply", opacity: 0.9, colors: ["#f6ecd8", "#f6ecd8"] },
    ],
  }),
  m("Vaporwave Sunset", "Pink-cyan grid with scanlines", "lattice", [14, 0.06, 0.7, 0.6], pal("vapor"), "#f4fffe", {
    glow: 0.25,
    layers: [
      { kind: "pattern", name: "Scanlines", pattern: "stripes", blend: "Multiply", opacity: 0.3, colors: ["#000000", "#ffffff"], space: "Screen", knobs: [26, 0.4, 0.3, 90] },
      { kind: "linear", name: "Sky wash", blend: "Soft Light", opacity: 0.6, colors: ["#ff4fc3", "#4fe3ff"], knobs: [180, 1, 0, 0] },
      { kind: "vignette", name: "Edge shade", opacity: 0.7, knobs: [0.65, 0.7, 1, 0] },
    ],
  }),
  m("Ocean Depth", "Waves fading to black with plankton", "waves", [2.6, 0.4, 0.5, 0.6], pal("abyss"), "#d8f3ff", {
    relief: 0.8,
    layers: [
      { kind: "noise", name: "Plankton", blend: "Screen", opacity: 0.25, colors: ["#000000", "#bfeaff"], keyed: true, knobs: [1.4, 0.8, 1.6, 0.5] },
      { kind: "radial", name: "Depth", blend: "Multiply", opacity: 0.75, colors: ["#ffffff", "#01101f"], knobs: [0, 0, 1, 1] },
    ],
  }),
  m("Cyber Rain", "Blue lightning behind a neon grid", "electric", [2, 0.05, 1.4, 0.7], pal("electric"), "#ffffff", {
    glow: 0.4,
    layers: [
      { kind: "grain", name: "Film grain", blend: "Overlay", opacity: 0.4, knobs: [0.5, 1.2, 0, 0.6] },
      { kind: "pattern", name: "Grid", pattern: "grid", blend: "Screen", opacity: 0.25, fill: false, colors: ["#000000", "#38e8ff"], knobs: [4, 0.05, 0.05, 0] },
      { kind: "vignette", name: "Frame", opacity: 0.8, knobs: [0.6, 0.6, 1, 0] },
    ],
  }),
  m("Soft Pastel Bloom", "Dreamy mesh with a pink bloom", "mesh", [4, 1, 0.7, 0.3], pal("pastelDream"), "#fff9ec", {
    layers: [
      { kind: "grain", name: "Film grain", blend: "Soft Light", opacity: 0.4, knobs: [0.6, 1.4, 0.1, 0.5] },
      { kind: "glow", name: "Bloom", blend: "Screen", opacity: 0.6, colors: ["#ffb8d9", "#ffffff"], knobs: [-0.2, 0.2, 0.8, 1.6] },
    ],
  }),
  m("Ember Smoke", "Red smoke lit from below", "fluid", [1.5, 1.2, 1.1, 0.2], pal("magma"), "#ffe9a0", {
    layers: [
      { kind: "vignette", name: "Frame", opacity: 0.6, knobs: [0.7, 0.7, 1, 0] },
      { kind: "noise", name: "Smoke", blend: "Screen", opacity: 0.3, colors: ["#000000", "#ffffff"], keyed: true, knobs: [2, 0.9, 2, 0.8] },
      { kind: "glow", name: "Fire glow", blend: "Screen", opacity: 0.45, colors: ["#ff6a1a", "#ffe9a0"], knobs: [0, -0.2, 0.7, 1.8] },
    ],
  }),
  m("Mono Cinema", "Black-and-white smoke with film grain", "fluid", [1.2, 1, 1, 0], pal("graphite"), "#ffffff", {
    layers: [
      { kind: "grain", name: "Film grain", blend: "Overlay", opacity: 0.55, knobs: [0.55, 1.3, 0, 0.6] },
      { kind: "vignette", name: "Frame", opacity: 0.9, knobs: [0.55, 0.5, 1, 0] },
    ],
  }),
  m("Prism Haze", "Holographic gradient under soft light", "iridescentGradient", [1.4, 0.5, 0.8, 0.6], pal("holo"), "#fff7d6", {
    layers: [
      { kind: "grain", name: "Film grain", blend: "Overlay", opacity: 0.3, knobs: [0.5, 1.2, 0.1, 0.5] },
      { kind: "glow", name: "Cyan light", blend: "Screen", opacity: 0.5, colors: ["#9af0ff", "#ffffff"], knobs: [0.3, 0.1, 0.8, 1.5] },
      { kind: "noise", name: "Haze", blend: "Soft Light", opacity: 0.45, colors: ["#6a5acd", "#fff7d6"], knobs: [1.2, 0.8, 1.2, 0.5] },
    ],
  }),
];
