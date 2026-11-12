import type { Behavior, BehaviorSeed, BehaviorType, Deformer, DeformerSeed, DeformerType } from "./types";

export interface FieldDef { key: "intensity" | "scale" | "speed" | "radius" | "aux" | "aux2"; label: string; min: number; max: number; step: number }
export interface BehaviorDef { label: string; hint: string; fields: FieldDef[]; dir?: boolean; center?: boolean; falloff?: boolean; expr?: boolean; defaults: Partial<Behavior> }
const I = (label: string, min: number, max: number, step: number): FieldDef => ({ key: "intensity", label, min, max, step });
const F = (key: FieldDef["key"], label: string, min: number, max: number, step: number): FieldDef => ({ key, label, min, max, step });

export const BEHAVIOR_DEFS: Record<BehaviorType, BehaviorDef> = {
  home: { label: "Hold shape (spring)", hint: "Springs every particle back to its place in the formation.", fields: [I("Stiffness", 0, 200, 1), F("aux", "Damping ratio", 0, 2, 0.01)], defaults: { intensity: 60, aux: 0.9 } },
  release: { label: "Release & return", hint: "Lets a share of particles slip free, drift, then spring back. Place before Hold shape.", fields: [I("Share released", 0, 1, 0.01), F("speed", "Cycle speed", 0.02, 1.5, 0.01), F("aux", "Looseness", 0, 1, 0.01)], defaults: { intensity: 0.15, speed: 0.2, aux: 0.7 } },
  gravity: { label: "Gravity", hint: "Constant acceleration along a direction.", fields: [I("Strength", 0, 20, 0.05)], dir: true, defaults: { intensity: 1.5, dir: [0, -1, 0] } },
  attractor: { label: "Attractor", hint: "Pulls particles toward a point.", fields: [I("Strength", 0, 40, 0.1), F("radius", "Radius", 0, 4, 0.05)], center: true, falloff: true, defaults: { intensity: 6, radius: 1.6, falloff: "smooth" } },
  repeller: { label: "Repeller", hint: "Pushes particles away from a point.", fields: [I("Strength", 0, 40, 0.1), F("radius", "Radius", 0, 4, 0.05)], center: true, falloff: true, defaults: { intensity: 6, radius: 1.2, falloff: "smooth" } },
  vortex: { label: "Vortex", hint: "Swirls particles around an axis.", fields: [I("Strength", -20, 20, 0.1), F("radius", "Radius", 0, 4, 0.05), F("aux", "Lift along axis", -4, 4, 0.05)], dir: true, center: true, falloff: true, defaults: { intensity: 3, radius: 0, dir: [0, 1, 0], falloff: "none", aux: 0 } },
  curl: { label: "Curl-noise flow", hint: "Divergence-free flow: swirling, fluid motion.", fields: [I("Strength", 0, 12, 0.05), F("scale", "Scale", 0.1, 5, 0.05), F("speed", "Evolution speed", 0, 3, 0.01)], defaults: { intensity: 1.4, scale: 1.2, speed: 0.4 } },
  turbulence: { label: "Turbulence", hint: "Noisy accelerations for jittery, gusty motion.", fields: [I("Strength", 0, 20, 0.05), F("scale", "Scale", 0.1, 6, 0.05), F("speed", "Evolution speed", 0, 4, 0.01)], defaults: { intensity: 2, scale: 2, speed: 0.8 } },
  magnetic: { label: "Magnetic (v × B)", hint: "Bends velocity around an axis like a charged particle in a field.", fields: [I("Strength", -10, 10, 0.05)], dir: true, defaults: { intensity: 2, dir: [0, 1, 0] } },
  radial: { label: "Radial push / pull", hint: "Pushes away from (or, negative, toward) a centre.", fields: [I("Strength", -20, 20, 0.1), F("radius", "Radius", 0, 4, 0.05)], center: true, falloff: true, defaults: { intensity: 2, radius: 0, falloff: "none" } },
  directional: { label: "Wind", hint: "Constant push along a direction.", fields: [I("Strength", 0, 20, 0.05)], dir: true, defaults: { intensity: 1, dir: [1, 0, 0] } },
  wave: { label: "Travelling wave", hint: "A sine wave of force moving through space.", fields: [I("Strength", 0, 20, 0.05), F("scale", "Wavelength⁻¹", 0.1, 6, 0.05), F("speed", "Wave speed", 0, 6, 0.05)], dir: true, defaults: { intensity: 2, scale: 1.5, speed: 2, dir: [0, 1, 0] } },
  drag: { label: "Drag", hint: "Slows particles down (air / liquid resistance).", fields: [I("Drag", 0, 8, 0.05)], defaults: { intensity: 1.2 } },
  cohesion: { label: "Cohesion (neighbours)", hint: "Pulls particles toward their local neighbours (liquid-like).", fields: [I("Strength", 0, 6, 0.05), F("radius", "Neighbour radius", 0.03, 0.5, 0.005)], defaults: { intensity: 0.6, radius: 0.12 } },
  separation: { label: "Separation (collision)", hint: "Soft particle-particle repulsion.", fields: [I("Strength", 0, 6, 0.05), F("radius", "Neighbour radius", 0.01, 0.3, 0.005)], defaults: { intensity: 0.8, radius: 0.05 } },
  alignment: { label: "Alignment (viscosity)", hint: "Matches velocity with neighbours.", fields: [I("Strength", 0, 8, 0.05), F("radius", "Neighbour radius", 0.03, 0.5, 0.005)], defaults: { intensity: 1, radius: 0.15 } },
  collider: { label: "Collider", hint: "Floor plane or sphere that particles bounce off.", fields: [F("radius", "Sphere radius (0 = floor)", 0, 2, 0.01), F("aux", "Bounce", 0, 1, 0.01)], center: true, defaults: { radius: 0, aux: 0.5, center: [0, -1, 0], intensity: 1 } },
  custom: { label: "Custom formula", hint: "ax, ay, az as expressions of x y z t vx vy vz r (e.g. sin(y*3+t)).", fields: [I("Strength", 0, 20, 0.05)], expr: true, defaults: { intensity: 1, expr: ["0", "0", "0"] } },
};
export const BEHAVIOR_TYPES = Object.keys(BEHAVIOR_DEFS) as BehaviorType[];

let uid = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(uid++).toString(36)}`;
export function makeBehavior(seed: BehaviorSeed): Behavior {
  const d = BEHAVIOR_DEFS[seed.type].defaults;
  return {
    id: newId("b"), enabled: true, intensity: 1, scale: 1, speed: 1, radius: 0, falloff: "smooth", blend: "add", anim: "none", animRate: 1, animDepth: 0.5, aux: 0, aux2: 0,
    ...d, ...seed, dir: [...((seed.dir ?? d.dir ?? [0, 1, 0]) as number[])] as [number, number, number], center: [...((seed.center ?? d.center ?? [0, 0, 0]) as number[])] as [number, number, number],
  };
}

export interface DeformerDef { label: string; hint: string; amount: [string, number, number, number]; scale?: [string, number, number, number]; speed?: [string, number, number, number]; axis?: boolean; defaults: Partial<Deformer> }
export const DEFORMER_DEFS: Record<DeformerType, DeformerDef> = {
  breathe: { label: "Breathe", hint: "Organic radial pulsing with per-particle phase.", amount: ["Amount", 0, 0.3, 0.002], speed: ["Speed", 0, 4, 0.01], defaults: { amount: 0.03, speed: 1 } },
  twist: { label: "Twist", hint: "Rotates slices around an axis, more with distance along it.", amount: ["Angle per unit", -6, 6, 0.01], scale: ["Falloff length", 0.2, 4, 0.01], speed: ["Animation", 0, 3, 0.01], axis: true, defaults: { amount: 0.8, scale: 1, speed: 0, axis: "y" } },
  bend: { label: "Bend", hint: "Curves the shape sideways along an axis.", amount: ["Bend", -2, 2, 0.01], scale: ["Length", 0.3, 4, 0.01], speed: ["Animation", 0, 3, 0.01], axis: true, defaults: { amount: 0.4, scale: 1.2, speed: 0, axis: "y" } },
  wave: { label: "Surface wave", hint: "Travelling ripples pushing particles along their surface normal.", amount: ["Height", 0, 0.5, 0.002], scale: ["Wave frequency", 0.2, 8, 0.05], speed: ["Speed", 0, 6, 0.05], axis: true, defaults: { amount: 0.08, scale: 1.5, speed: 1.5, axis: "y" } },
  noise: { label: "Noise displacement", hint: "Flowing noise pushes particles along their normal.", amount: ["Amount", 0, 0.5, 0.002], scale: ["Noise scale", 0.2, 5, 0.05], speed: ["Evolution", 0, 3, 0.01], defaults: { amount: 0.06, scale: 1.2, speed: 0.4 } },
  rotate: { label: "Rotate (spin)", hint: "Spins the whole formation; Differential makes inner parts spin faster like a galaxy.", amount: ["Angular speed (rad/s)", -4, 4, 0.01], scale: ["Differential", 0, 1.2, 0.01], axis: true, defaults: { amount: 0.4, scale: 0, axis: "y" } },
  stretch: { label: "Stretch", hint: "Squash and stretch along an axis.", amount: ["Amount", 0, 1, 0.01], speed: ["Speed", 0, 4, 0.01], axis: true, defaults: { amount: 0.2, speed: 1, axis: "y" } },
};
export const DEFORMER_TYPES = Object.keys(DEFORMER_DEFS) as DeformerType[];
export function makeDeformer(seed: DeformerSeed): Deformer {
  return { id: newId("d"), enabled: true, amount: 0.1, scale: 1, speed: 1, axis: "y", ...DEFORMER_DEFS[seed.type].defaults, ...seed };
}
