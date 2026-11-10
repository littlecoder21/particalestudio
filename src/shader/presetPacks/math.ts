import { inGroup } from "../presetBuilder";
import { pal } from "./palettes";

const m = inGroup("Math & Fractal");

/** Roses, spirals, Lissajous curves, moiré and fractals. */
export const MATH_PRESETS = [
  m("Rose Window", "A cathedral rose in royal colours", "polarRose", [8, 5, 0.6, 0.6], pal("royal"), "#fff2c2",
    { glow: 0.25, vignette: 0.35 }),
  m("Petal Radar", "Green petals sweeping", "polarRose", [5, 8, 1.4, 0.4], pal("neonGreen"), "#e6fff4",
    { glow: 0.3, vignette: 0.45 }),
  m("Mandala Bloom", "Pink-violet symmetry", "polarRose", [12, 4, 0.3, 0.8], pal("fuchsia"), "#ffe6fb",
    { glow: 0.3, vignette: 0.3 }),
  m("Nautilus", "A golden growth spiral", "spiralArms", [2, 3, 0.9, 0.4], pal("honey"), "#fff6d0",
    { relief: 0.6, shine: 0.4, vignette: 0.4 }),
  m("Whirl", "Cobalt arms winding in", "spiralArms", [5, 4.5, 0.4, 0.5], pal("cobalt"), "#f0f5ff",
    { glow: 0.2, vignette: 0.35 }),
  m("Fiber Spiral", "Jade strands twisting", "spiralArms", [9, 2, 0.7, 0.8], pal("jade"), "#e8fff3",
    { vignette: 0.3, grain: 0.1 }),
  m("Oscilloscope", "A green phosphor figure", "lissajous", [3, 2, 0.5, 0.012], pal("neonGreen"), "#e6fff4",
    { glow: 0.5, scanlines: 0.4, vignette: 0.5 }),
  m("Silk Orbit", "Pink-and-cyan looping wire", "lissajous", [5, 4, 0.3, 0.02], pal("vapor"), "#f4fffe",
    { glow: 0.4, vignette: 0.3 }),
  m("Moiré Silk", "Grey interference weave", "moire", [70, 0.05, 1, 0.5], pal("graphite"), "#eceef2",
    { vignette: 0.25, contrast: 1.1 }),
  m("Interference Veil", "Holographic line beats", "moire", [110, 0.03, 2, 0.8], pal("holo"), "#fff7d6",
    { glow: 0.2, vignette: 0.2 }),
  m("Seahorse Valley", "A sapphire deep zoom", "mandelbrot", [5.4, 150, 3, 0.6], pal("sapphire"), "#e6f2ff",
    { glow: 0.2 }),
  m("Burning Ship Glow", "Orange filaments, black void", "mandelbrot", [7.5, 190, 4.5, 0.5], pal("solar"), "#fffbe0",
    { glow: 0.3, vignette: 0.3 }),
  m("Kaleido Nebula", "Folded pink space", "kaliIfs", [0.85, 16, 0.4, 3], pal("nebulaPink"), "#ffe0d0",
    { glow: 0.3, vignette: 0.3 }),
  m("Fold Crystal", "Icy mirrored geometry", "kaliIfs", [0.7, 12, 0.8, 4], pal("iceBlue"), "#ffffff",
    { glow: 0.25, vignette: 0.3 }),
];
