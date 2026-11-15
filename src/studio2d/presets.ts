import type { ParticleSettings } from "../particleEngine";
import type { Studio2DPatch } from "./types";

export interface StudioPreset {
  name: string;
  tag: string;
  color: string;
  accent: string;
  settings: Partial<ParticleSettings>;
  studio?: Studio2DPatch;
  /** true: start from default Studio 2D settings. false/undefined: only patch the listed groups. */
  replaceStudio?: boolean;
  /** Built-in library shape (see shapes.ts) loaded as the particle source. */
  shape?: string;
}

const SPECTRUM = ["#2fb6ff", "#7a63ff", "#ff4fd0", "#ff9a2f"];
const SCENE_BG = { backgroundMode: "Solid" as const, backgroundColor: "#05060d", ambientLight: 0, trails: false };

/**
 * Shape-Locked Motion presets. They only touch the Shape Preservation group (plus the shape and
 * particle count they are named after), so colours, glow, physics and everything else stay yours.
 */
const shapeLockPresets: StudioPreset[] = [
  {
    name: "Living Logo", tag: "Shape-locked · alive", color: "#2fe0ff", accent: "#ff4fd0", shape: "logo",
    settings: { count: 1400 },
    studio: { shapeLock: { enabled: true, style: "Gentle Float", strength: 0.9, amount: 0.5, maxDisplacement: 7, breathing: 0.3, variation: 0.55, independence: 0.5, speed: 1 } },
  },
  {
    name: "Gentle Butterfly", tag: "Shape-locked · wings", color: "#ff9a2f", accent: "#ff4fd0", shape: "butterfly",
    settings: { count: 1600 },
    studio: { shapeLock: { enabled: true, style: "Organic Wiggle", strength: 0.85, amount: 0.45, maxDisplacement: 9, variation: 0.7, independence: 0.35, speed: 1.1, breathing: 0.2 } },
  },
  {
    name: "Organic Heart", tag: "Shape-locked · breathing", color: "#ff4f9a", accent: "#c01fe0", shape: "heart",
    settings: { count: 1400 },
    studio: { shapeLock: { enabled: true, style: "Shape Breathing", strength: 0.88, amount: 0.35, maxDisplacement: 11, breathing: 0.65, variation: 0.5, independence: 0.45, speed: 0.9 } },
  },
  {
    name: "Floating Text", tag: "Shape-locked · readable", color: "#2fb6ff", accent: "#ff4fd0", shape: "text",
    settings: { count: 1600 },
    studio: { shapeLock: { enabled: true, style: "Gentle Float", strength: 0.96, amount: 0.4, maxDisplacement: 5, breathing: 0.1, variation: 0.45, independence: 0.6, speed: 0.9 } },
  },
  {
    name: "Breathing Galaxy Shape", tag: "Shape-locked · slow pulse", color: "#ff8a3d", accent: "#8a5cff", shape: "galaxy",
    settings: { count: 2200 },
    studio: { shapeLock: { enabled: true, style: "Shape Breathing", strength: 0.85, amount: 0.3, maxDisplacement: 16, breathing: 0.75, variation: 0.55, independence: 0.4, speed: 0.7 } },
  },
  {
    name: "Soft Particle Wave", tag: "Shape-locked · ripple", color: "#2fe0ff", accent: "#ff4fd0", shape: "wave",
    settings: { count: 1600 },
    studio: { shapeLock: { enabled: true, style: "Surface Ripple", strength: 0.82, amount: 0.3, maxDisplacement: 14, ripple: 0.65, variation: 0.5, independence: 0.3, speed: 1 } },
  },
  {
    name: "Living SVG", tag: "Shape-locked · your SVG", color: "#78d8ff", accent: "#bd8cff",
    settings: {},
    studio: { shapeLock: { enabled: true, style: "Organic Wiggle", strength: 0.88, amount: 0.5, maxDisplacement: 8, variation: 0.6, independence: 0.55, speed: 1 } },
  },
  {
    name: "Almost Still Formation", tag: "Shape-locked · calm", color: "#bfe8ff", accent: "#8a8cff",
    settings: {},
    studio: { shapeLock: { enabled: true, style: "Almost Still", strength: 0.95, amount: 0.25, maxDisplacement: 5, variation: 0.4, independence: 0.5, speed: 0.8, breathing: 0.1 } },
  },
];

/** Complete showcase scenes: SVG shape + gradient colours + Shape-Locked Motion + light/FX/backdrop. */
const scenePresets: StudioPreset[] = [
  {
    name: "Neural Brain", tag: "Scene · glowing cortex", color: SPECTRUM[0], accent: SPECTRUM[2], shape: "brain", replaceStudio: true,
    settings: { ...SCENE_BG, count: 2200, size: 1.5, glow: 8, opacity: 1, motion: "Off", palette: SPECTRUM, preserveSvgColors: true },
    studio: {
      shapeLock: { enabled: true, style: "Organic Wiggle", amount: 0.5, maxDisplacement: 7, strength: 0.88 },
      fx: { bloom: 0.3, glints: 0.55, rings: { enabled: true, count: 3, perRing: 90, radius: 1.05, tilt: 64 } },
      backdrop: { kind: "Nebula", intensity: 0.4, vignette: 0.55, grain: 0.2, colorA: "#2a2a9a", colorB: "#0e8fb0", colorC: "#8a2f9a" },
    },
  },
  {
    name: "Aura Figure", tag: "Scene · orbiting energy", color: SPECTRUM[0], accent: SPECTRUM[3], shape: "human", replaceStudio: true,
    settings: { ...SCENE_BG, count: 2400, size: 1.4, glow: 8, opacity: 1, motion: "Off", palette: SPECTRUM, preserveSvgColors: false },
    studio: {
      shapeLock: { enabled: true, style: "Shape Breathing", amount: 0.4, breathing: 0.45, maxDisplacement: 6, strength: 0.9 },
      fx: { colorMode: "Linear", gradientAngle: 0, bloom: 0.35, glints: 0.4, rings: { enabled: true, count: 4, perRing: 110, radius: 0.95, tilt: 74, trail: 0.4 }, dust: { enabled: true, amount: 0.25, drift: 0.3 } },
      backdrop: { kind: "Floor Glow", intensity: 0.8, colorA: "#3b6cff", colorB: "#c13fa5", colorC: "#2a1a6a", vignette: 0.4, stars: 0.5 },
    },
  },
  {
    name: "Plasma Orb", tag: "Scene · cyan sphere", color: "#35e0ff", accent: "#a47bff", shape: "orb", replaceStudio: true,
    settings: { ...SCENE_BG, count: 2200, size: 1.4, glow: 9, opacity: 1, motion: "Off", palette: ["#bff6ff", "#35e0ff", "#4aa0ff", "#a47bff"], preserveSvgColors: false },
    studio: {
      shapeLock: { enabled: true, style: "Surface Ripple", amount: 0.4, ripple: 0.55, maxDisplacement: 8, strength: 0.85 },
      fx: { colorMode: "Radial", bloom: 0.35, bokeh: 0.12, glints: 0.3 },
      backdrop: { kind: "Nebula", intensity: 0.35, colorA: "#0a3a6a", colorB: "#1a2a9a", colorC: "#3a1a7a", vignette: 0.6, stars: 0.4 },
    },
  },
  {
    name: "Crystal Cube", tag: "Scene · hologram lattice", color: SPECTRUM[0], accent: SPECTRUM[3], shape: "cube", replaceStudio: true,
    settings: { ...SCENE_BG, count: 1800, size: 1.5, glow: 8, opacity: 1, motion: "Off", palette: SPECTRUM, preserveSvgColors: true },
    studio: {
      shapeLock: { enabled: true, style: "Energy Pulse", amount: 0.3, ripple: 0.5, maxDisplacement: 6, strength: 0.92 },
      fx: { glints: 0.75, bloom: 0.35, rings: { enabled: true, count: 2, perRing: 70, radius: 1.25, tilt: 72 } },
      backdrop: { kind: "Grid Floor", intensity: 0.7, colorA: "#7a63ff", colorB: "#2fb6ff", colorC: "#3a1a7a", vignette: 0.5 },
    },
  },
  {
    name: "Spiral Galaxy", tag: "Scene · slow orbit", color: "#ffb347", accent: "#8a5cff", shape: "galaxy", replaceStudio: true,
    settings: { ...SCENE_BG, count: 2200, size: 1.4, glow: 7, opacity: 1, motion: "Off", palette: ["#ffd36b", "#ff4fd0", "#8a5cff", "#2fb6ff"], preserveSvgColors: false },
    studio: {
      shapeLock: { enabled: true, style: "Shape Breathing", amount: 0.35, breathing: 0.6, maxDisplacement: 12, strength: 0.85 },
      fx: { colorMode: "Radial", bloom: 0.4, glints: 0.5, dust: { enabled: true, amount: 0.3, drift: 0.2 } },
      backdrop: { kind: "Starfield", stars: 0.8, vignette: 0.4 },
    },
  },
  {
    name: "Silk Ribbon", tag: "Scene · flowing silk", color: SPECTRUM[1], accent: SPECTRUM[2], shape: "ribbon", replaceStudio: true,
    settings: { ...SCENE_BG, count: 2400, size: 1.2, glow: 9, opacity: 1, motion: "Off", palette: SPECTRUM, preserveSvgColors: true },
    studio: {
      shapeLock: { enabled: true, style: "Surface Ripple", amount: 0.4, ripple: 0.6, maxDisplacement: 10, strength: 0.8 },
      fx: { bloom: 0.4, glints: 0.3 },
      backdrop: { kind: "Aurora", intensity: 0.45, colorA: "#1a4aaa", colorB: "#7a2aaa", colorC: "#0e8a9a", vignette: 0.5, stars: 0.4 },
    },
  },
  {
    name: "Smoke Veil", tag: "Scene · rising curls", color: "#8a5cff", accent: "#ff4fd0", shape: "smoke", replaceStudio: true,
    settings: { ...SCENE_BG, count: 2000, size: 1.1, glow: 6, opacity: 0.95, motion: "Off", palette: ["#2fb6ff", "#8a5cff", "#ff4fd0", "#ff9ac8"], preserveSvgColors: true },
    studio: {
      shapeLock: { enabled: true, style: "Gentle Float", amount: 0.9, maxDisplacement: 16, strength: 0.7, variation: 0.8, independence: 0.3, speed: 0.8 },
      fx: { bokeh: 0.25, bloom: 0.3 },
      backdrop: { kind: "Haze", intensity: 0.5, colorA: "#2a1a5a", vignette: 0.7, stars: 0.3 },
    },
  },
  {
    name: "Dust in the Light", tag: "Scene · sunbeams", color: "#eef0f6", accent: "#ffd9a8", replaceStudio: true,
    settings: { ...SCENE_BG, count: 200, emitter: "Circle", spread: 100, size: 1.2, glow: 4, opacity: 1, motion: "Flow", speed: 0.6, palette: ["#eef0f6", "#ffd9a8"] },
    studio: {
      light: { enabled: true, ambient: 0.07, haze: 0.45, glint: 0.8, reflectivity: 0.7, sway: 0.35 },
      fx: { dust: { enabled: true, amount: 0.9, drift: 0.5 }, bloom: 0.2 },
      backdrop: { kind: "Haze", intensity: 0.2, colorA: "#556", vignette: 0.65, stars: 0 },
    },
  },
  {
    name: "Torch Reveal", tag: "Scene · pointer light", color: "#cfe6ff", accent: "#8a8cff", replaceStudio: true,
    settings: { ...SCENE_BG, count: 1400, emitter: "Circle", spread: 100, size: 1.5, glow: 6, opacity: 1, motion: "Float", speed: 0.5, palette: ["#cfe6ff", "#8a8cff", "#ff9ac8"], interaction: "Off" },
    studio: {
      light: { enabled: true, beams: [], ambient: 0.03, torch: true, torchRadius: 170, torchStrength: 1.1, glint: 0.7, reflectivity: 0.8 },
      fx: { bloom: 0.25, glints: 0.3 },
      backdrop: { kind: "Starfield", stars: 0.4, vignette: 0.5 },
    },
  },
  {
    name: "Ripple Wave", tag: "Scene · tap for shockwaves", color: "#2fe0ff", accent: "#ff4fd0", shape: "wave", replaceStudio: true,
    settings: { ...SCENE_BG, count: 1800, size: 1.3, glow: 8, opacity: 1, motion: "Off", palette: ["#2fe0ff", "#8a5cff", "#ff4fd0"], preserveSvgColors: false },
    studio: {
      shapeLock: { enabled: true, style: "Surface Ripple", amount: 0.4, ripple: 0.6, maxDisplacement: 12, strength: 0.8, recovery: 0.7 },
      fx: { colorMode: "Linear", gradientAngle: 0, shockwave: true, shockStrength: 1.2, bloom: 0.3 },
      backdrop: { kind: "Mesh Gradient", intensity: 0.35, colorA: "#0a2a6a", colorB: "#4a1a8a", colorC: "#050a1a", vignette: 0.5 },
    },
  },
];

export const studio2dPresets: StudioPreset[] = [...shapeLockPresets, ...scenePresets];
