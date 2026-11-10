import { inGroup } from "../presetBuilder";
import { pal } from "./palettes";

/** A seamless looping palette: the last stop blends back into the first (for conic / spiral sweeps). */
const loop = (stops: string[]): string[] => [...stops, stops[0]];

const m = inGroup("Gradients & Minimal");

/** Calm, simple looks: gradient generators, metaballs and quiet meshes. */
export const GRADIENT_PRESETS = [
  m("Dusk Wash", "A slow purple-to-coral fade", "linearGradient", [1.4, 0.5, 0.5, 0.5], pal("dusk"), "#ffd2a1",
    { grain: 0.15, vignette: 0.15 }),
  m("Soft Orb", "A pastel sphere of light", "radialGradient", [1.4, 0, 0.4, 0.4], pal("pastelDream"), "#fff9ec",
    { grain: 0.2, vignette: 0.1 }),
  m("Prism Wheel", "A colour wheel with soft spokes", "conicGradient", [1.2, 0, 0.3, 0.4], loop(["#5a1fa8", "#ff4fc3", "#4fe3ff", "#f4fffe"]), "#5a1fa8",
    { glow: 0.15, grain: 0.1 }),
  m("Diamond Dawn", "Warm light opening in a diamond", "diamondGradient", [1.3, 0.8, 0.3, 0.4], pal("sunrise"), "#ffeaa8",
    { grain: 0.15, vignette: 0.2 }),
  m("Hypno Candy", "A sweet spiral", "spiralGradient", [1.6, 0, 0.6, 0.6], loop(["#ff5fa8", "#ffb26a", "#fff4fb", "#9af0d6"]), "#ff5fa8",
    { saturation: 1.1, grain: 0.1 }),
  m("Copper Dune", "Copper tones folded in the middle", "reflectedGradient", [2.2, 0.5, 1.3, 0.8], pal("copper"), "#fff8e4",
    { grain: 0.2, vignette: 0.15 }),
  m("Golden Hour", "Low sun, long light", "sunsetGradient", [1.4, 0, 0.4, 0.5], pal("saffron"), "#fff5d6",
    { grain: 0.18, vignette: 0.25 }),
  m("Oil Film", "Petrol-slick colour shifts", "iridescentGradient", [1.5, 0.6, 0.8, 0.7], pal("oilSlick"), "#f2d36a",
    { relief: 0.5, shine: 0.7, vignette: 0.3 }),
  m("Holo Foil", "Silver foil that shifts hue", "holographicGradient", [1.4, -0.6, 0.7, 0.6], pal("holo"), "#fff7d6",
    { relief: 0.6, shine: 0.8, grain: 0.1 }),
  m("Rose Lava", "A slow-swirling rose gradient", "liquidGradient", [1.3, 0.2, 1.2, 0.9], pal("rose"), "#fff0f5",
    { grain: 0.15, vignette: 0.2 }),
  m("Grain Gradient", "A gritty lilac fade", "noiseGradient", [1.3, 0.9, 1, 0.4], pal("lilac"), "#faf7ff",
    { grain: 0.35, vignette: 0.15 }),
  m("Contour Wash", "Mint topographic bands", "topographicGradient", [1.2, 0, 0.6, 0.4], pal("mint"), "#f4fffa",
    { grain: 0.1, vignette: 0.1 }),
  m("Prism Break", "Light split into electric bands", "holographicGradient", [1.3, 0.5, 0.8, 0.7], pal("electric"), "#ffffff",
    { glow: 0.2, vignette: 0.3 }),
  m("Metaball Pair", "Two blue drops about to merge", "sdfBlend", [0.3, 2, 0.4, 0.7], pal("cobalt"), "#f0f5ff",
    { glow: 0.15, vignette: 0.3 }),
  m("Goo Orbit", "Violet blobs circling", "sdfBlend", [0.45, 4, 0.3, 1.2], pal("grape"), "#f3eaff",
    { glow: 0.2, vignette: 0.35 }),
  m("Soft Blobs", "Peach shapes floating", "sdfBlend", [0.55, 5, 0.2, 0.8], pal("peach"), "#fff3e6",
    { grain: 0.15, vignette: 0.15 }),
  m("Quiet Mesh", "A whisper of macaron colour", "mesh", [3, 0.7, 0.5, 0.2], pal("macaron"), "#fffaf0",
    { grain: 0.2, vignette: 0.05, speed: 0.6 }),
  m("Mint Fade", "Cool, fresh and simple", "linearGradient", [1.1, 1.57, 0.2, 0.2], pal("mint"), "#f4fffa",
    { grain: 0.12, vignette: 0.05 }),
  m("Moon Halo", "Steel-blue glow in the dark", "radialGradient", [1.8, 0, 0.3, 0.3], pal("steel"), "#eef3fb",
    { grain: 0.15, vignette: 0.3 }),
  m("Pearl Sheen", "Opal shimmer, barely moving", "iridescentGradient", [1.2, -0.4, 0.5, 0.4], pal("opal"), "#fffcf6",
    { relief: 0.4, shine: 0.6, grain: 0.1, speed: 0.6 }),
];
