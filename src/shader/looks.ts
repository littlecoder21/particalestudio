/**
 * Mask looks.
 *
 * A look is a complete shader style (generator, palette, edge effects, particles,
 * patterns…) that is designed to be poured into *any* shape. Applying one keeps
 * the current silhouette, its threshold / invert and its placement, and swaps
 * everything else — so a butterfly, a skull or your own logo can become a
 * glowing, smoky, particle-filled or chrome shape in one tap.
 */
import { mk } from "./presets";
import type { ShaderPreset, ShaderProject } from "./types";

const butterfly = { enabled: true, source: { kind: "shape", id: "butterfly" } as const, scale: 1.02 };

export const MASK_LOOKS: ShaderPreset[] = [
  mk("Neon Glow", "Bright rim, wide halo", "plasma", [4, 0.9, 1.2, 0.2],
    ["#07010f", "#2a0a5a", "#ff2fa8", "#2fe1ff", "#ffffff"], "#ffffff",
    { glow: 0.3, mask: { ...butterfly, glow: 1.1, halo: 1.2, outline: 0.5, edge: 0.06, background: "#05010c" } }),
  mk("Smoke Shape", "Edges dissolve into smoke", "fluid", [1.5, 1, 1.1, 0.2],
    ["#04040c", "#1b1f5c", "#5b6cff", "#b8c6ff", "#ffffff"], "#dfe6ff",
    { grain: 0.2, mask: { ...butterfly, smoke: 0.8, smokeScale: 1.3, halo: 1, edge: 0.5, glow: 0.3, background: "#03030a" } }),
  mk("Ember Particles", "Rising sparks fill the shape", "fluid", [1.3, 1.1, 1.2, 0.2],
    ["#120200", "#6a1403", "#e8590c", "#ffb347", "#fff3c4"], "#ffe2a8",
    { vignette: 0.5, mask: { ...butterfly, particles: 0.55, particleSize: 0.8, particleSpeed: 1.2, halo: 1, glow: 0.5, smoke: 0.2, background: "#060201" } }),
  mk("Liquid Chrome", "Mirror metal pillow", "waves", [1.6, 0.1, 0.8, 0.4],
    ["#08090d", "#3b4252", "#9aa3b8", "#e6ebf5", "#ffffff"], "#ffffff",
    { relief: 1.6, shine: 1, contrast: 1.15, mask: { ...butterfly, bevel: 1.3, outline: 0.2, halo: 0.4, edge: 0.05, background: "#05060b" } }),
  mk("Aurora Cutout", "Northern lights inside", "aurora", [1.1, 0.55, 1.2, 1.2],
    ["#020814", "#06402f", "#12b57c", "#6af0c1", "#b99bff"], "#d9fff1",
    { vignette: 0.4, mask: { ...butterfly, halo: 0.9, glow: 0.4, distort: 0.5, flow: 0.4, background: "#02040a" } }),
  mk("Echo Contours", "Rings that follow the edge", "plasma", [3.5, 0.9, 1.1, 0.2],
    ["#07010f", "#2a0a5a", "#ff2fa8", "#2fe1ff", "#ffffff"], "#ffffff",
    { mask: { ...butterfly, pattern: "Echo", patternAmount: 0.9, outline: 0.6, halo: 0.7, background: "#05010c" } }),
  mk("Halftone Print", "Dot screen on paper", "halftone", [34, 0.95, 0.5, 1.2],
    ["#1a0a2e", "#7a1fa2", "#ff3d8a", "#ffb02e", "#fff3c4"], "#ffffff",
    { grain: 0.1, vignette: 0.05, mask: { ...butterfly, pattern: "Dots", patternAmount: 0.35, patternScale: 1.4, halo: 0, glow: 0, edge: 0.04, background: "#f3ead6" } }),
  mk("Hologram", "Scanning cyan projection", "lattice", [16, 0.06, 0.8, 0.8],
    ["#01080c", "#04323f", "#0aa0b8", "#6cf0ff", "#e6ffff"], "#e6ffff",
    { aberration: 0.2, scanlines: 0.3, mask: { ...butterfly, pattern: "Scan", patternAmount: 0.7, outline: 0.4, glow: 0.5, halo: 0.8, background: "#010608" } }),
  mk("Ghost Outline", "Faint fill, sharp outline", "fluid", [1.2, 1, 1, 0],
    ["#05060f", "#141a52", "#3a4fd6", "#8ab4ff", "#f2f7ff"], "#9fe8ff",
    { mask: { ...butterfly, ghost: 0.35, outline: 0.9, glow: 0.2, halo: 0.5, innerBoost: -0.3, background: "#04050d" } }),
  mk("Stained Glass", "Leaded jewel cells", "voronoi", [5, 0.12, 0.35, 0],
    ["#7a1020", "#d0802a", "#e6c34a", "#2d8a6e", "#2a58b8", "#6b2a9e"], "#0c0a12",
    { grain: 0.1, mask: { ...butterfly, outline: 0.5, bevel: 0.5, halo: 0.3, glow: 0.2, background: "#08060c" } }),
  mk("Galaxy Silhouette", "A cosmos in the shape", "galaxy", [2, 3, 1, 0.6],
    ["#010108", "#141a50", "#3a4fd0", "#9fb4ff", "#fff4dc"], "#ffffff",
    { mask: { ...butterfly, halo: 1.2, glow: 0.5, flow: 0.5, background: "#010108" } }),
  mk("Molten", "Glowing lava skin", "lava", [5, 1, 0.55, 0.35],
    ["#2a0505", "#8a1111", "#ee4a14", "#ffa31a", "#fff0a0"], "#ffe28a",
    { relief: 0.6, mask: { ...butterfly, bevel: 1, glow: 0.8, smoke: 0.25, halo: 1.1, background: "#080101" } }),
];

/**
 * Pours a look into the current project: the silhouette (source, threshold,
 * invert, placement) and the pointer setup stay, everything visual is replaced.
 * The layer stack of the project is kept as well, with the base field restyled.
 */
export function applyLook(current: ShaderProject, look: ShaderPreset): ShaderProject {
  const l = look.project;
  const keepLayers = current.layers.map((layer) => ({ ...layer, knobs: [...layer.knobs] as typeof layer.knobs, colors: [...layer.colors], positions: [...layer.positions] }));
  return {
    ...l,
    name: current.name,
    layers: keepLayers,
    interaction: current.interaction,
    interactionRadius: current.interactionRadius,
    interactionStrength: current.interactionStrength,
    ripples: current.ripples,
    idleDrift: current.idleDrift,
    touch: current.touch,
    playing: current.playing,
    mask: {
      ...l.mask,
      enabled: true,
      source: current.mask.source,
      threshold: current.mask.threshold,
      invert: current.mask.invert,
      scale: current.mask.scale,
      x: current.mask.x,
      y: current.mask.y,
      rotation: current.mask.rotation,
    },
  };
}
