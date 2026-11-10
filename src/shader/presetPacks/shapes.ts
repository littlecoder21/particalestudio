import { inGroup } from "../presetBuilder";
import { pal } from "./palettes";

const m = inGroup("Shapes");

/** An image mask drives the shader: the shape is filled, haloed and dissolved by the field. */
export const SHAPE_PRESETS = [
  m("Neon Bolt", "A lightning bolt of plasma", "plasma", [4, 1, 1.2, 0.2], pal("cyber"), "#fffd8a",
    { glow: 0.2, mask: { enabled: true, source: { kind: "shape", id: "bolt" }, scale: 1.05, glow: 0.7, halo: 1, outline: 0.4, background: "#04010c" } }),
  m("Hex Crystal", "A faceted sapphire hexagon", "facets", [4, 0.6, 0.4, 0.5], pal("sapphire"), "#e6f2ff",
    { mask: { enabled: true, source: { kind: "shape", id: "hexagon" }, scale: 1.05, bevel: 1, outline: 0.3, halo: 0.6, background: "#02040f" } }),
  m("Infinity Silk", "A looping ribbon of vapor light", "silk", [8, 1, 0.3, 1], pal("vapor"), "#f4fffe",
    { relief: 1.4, shine: 0.8, mask: { enabled: true, source: { kind: "shape", id: "infinity" }, scale: 1.1, glow: 0.4, halo: 0.8, background: "#05020f" } }),
  m("Spiral Nebula", "Gas winding into a spiral", "nebula", [1.1, 0.5, 0.7, 1], pal("nebulaPink"), "#ffe0d0",
    { mask: { enabled: true, source: { kind: "shape", id: "spiral" }, scale: 1.05, smoke: 0.5, halo: 1.1, flow: 0.6, glow: 0.4, background: "#03010a" } }),
  m("Solar Ring", "A ring of burning rays", "rays", [22, 0.8, 0.6, 0], pal("solar"), "#fffbe0",
    { mask: { enabled: true, source: { kind: "shape", id: "ring" }, scale: 1.05, glow: 0.6, halo: 1, outline: 0.3, background: "#050100" } }),
  m("Sun Disc", "A warm plasma sun", "plasma", [3.4, 0.9, 1.4, 0], pal("sunrise"), "#ffeaa8",
    { mask: { enabled: true, source: { kind: "shape", id: "circle" }, scale: 1, glow: 0.5, halo: 0.9, background: "#08030e" } }),
  m("Rose Smoke Heart", "A heart that drifts into smoke", "fluid", [1.4, 1, 1.1, 0.1], pal("rose"), "#fff0f5",
    { grain: 0.15, mask: { enabled: true, source: { kind: "shape", id: "heart" }, scale: 1.02, smoke: 0.8, smokeScale: 1.3, halo: 1, edge: 0.4, glow: 0.35, background: "#0a0206" } }),
  m("Amber Star Burst", "A beveled gold star with sparks", "lava", [5, 1, 0.6, 0.3], pal("amber"), "#fff0c8",
    { relief: 0.9, shine: 0.7, mask: { enabled: true, source: { kind: "shape", id: "star" }, scale: 1.05, bevel: 0.8, outline: 0.3, halo: 0.7, particles: 0.4, background: "#0a0300" } }),
  m("Ghost Skull", "A pale skull dissolving into fog", "fluid", [1.2, 1.2, 1, 0.2], pal("graphite"), "#eceef2",
    { grain: 0.15, mask: { enabled: true, source: { kind: "shape", id: "skull" }, scale: 1.05, smoke: 0.9, halo: 1.2, flow: 0.7, glow: 0.3, particles: 0.2, background: "#030304" } }),
];
