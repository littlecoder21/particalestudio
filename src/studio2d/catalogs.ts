export const MOTION_STYLES = [
  "Float",
  "Orbit",
  "Flow",
  "Burst",
  "Pulse",
  "Spiral",
  "Helix",
  "Vortex",
  "Wave",
  "Drift",
  "Bounce",
  "Pendulum",
  "Rosette",
  "Figure Eight",
  "Swarm",
  "Stream",
  "Whirlpool",
  "Spark",
  "Orbit Cascade",
  "Galaxy",
] as const;

export const MOTION_OPTIONS = ["Off", ...MOTION_STYLES] as const;
export type MotionStyle = (typeof MOTION_STYLES)[number];

export const TOUCH_BEHAVIORS = [
  "Repel", "Attract", "Swirl", "Vortex", "Spiral Pull", "Spiral Push", "Pulse", "Ripple", "Shock", "Orbit",
  "Reverse Orbit", "Oscillate", "Wind", "Gust", "Sweep", "Clockwise", "Counterclockwise", "Pinch", "Expand", "Twist",
  "Curl", "Helix", "Bloom", "Scatter", "Gather", "Bounce", "Elastic", "Magnetic", "Soft Push", "Hard Push",
  "Slow Pull", "Fast Pull", "Wave Push", "Wave Pull", "Heartbeat", "Tremor", "Jitter", "Drift", "Flow", "Whirl",
  "Split", "Merge", "Orbiting Repel", "Orbiting Attract", "Tidal", "Spring", "Flick", "Flicker", "Comet", "Swarm",
] as const;
export type TouchBehavior = (typeof TOUCH_BEHAVIORS)[number] | "Off";

const LOCK_FAMILIES = [
  "Cloud Drift",
  "Organic Sway",
  "Radial Breath",
  "Surface Ripple",
  "Energy Pulse",
  "Orbiting Halo",
  "Spiral Weave",
  "Tidal Wave",
  "Elastic Flutter",
  "Starlight Tremor",
  "Calm Hover",
] as const;

const LOCK_VARIATIONS = ["Soft", "Balanced", "Lively", "Intense"] as const;

export const LOCK_STYLE_FAMILIES = LOCK_FAMILIES;
export const LOCK_STYLE_VARIATIONS = LOCK_VARIATIONS;

export const LOCK_STYLE_NAMES = [
  "Gentle Float",
  "Organic Wiggle",
  "Shape Breathing",
  "Surface Ripple",
  "Energy Pulse",
  "Almost Still",
  ...LOCK_FAMILIES.flatMap((family) => LOCK_VARIATIONS.map((variation) => `${family} · ${variation}`)),
] as const;

export type LockStyle = (typeof LOCK_STYLE_NAMES)[number];

export function motionAcceleration(
  style: string,
  styles: readonly string[],
  x: number,
  y: number,
  time: number,
  phase: number,
  seed: number,
  speed: number,
  width: number,
  height: number,
): { x: number; y: number; force: number } {
  const index = styles.indexOf(style);
  const variant = index - 3;
  const dx = x - width * 0.5;
  const dy = y - height * 0.5;
  const distance = Math.max(Math.hypot(dx, dy), 1);
  const nx = dx / distance;
  const ny = dy / distance;
  const t = phase + time * 0.001 * speed * (0.6 + variant * 0.025);
  let ax = Math.sin(phase + time * 0.001) * 0.5;
  let ay = Math.cos(phase + time * 0.0008) * 0.5;
  switch (style) {
    case "Pulse":
      ax = nx * Math.sin(t * 2);
      ay = ny * Math.sin(t * 2);
      break;
    case "Spiral":
      ax = -ny * 0.8 + nx * 0.35;
      ay = nx * 0.8 + ny * 0.35;
      break;
    case "Helix":
      ax = -ny;
      ay = nx + Math.sin(t * 1.7 + seed) * 0.35;
      break;
    case "Vortex":
      ax = -ny + nx * 0.2;
      ay = nx + ny * 0.2;
      break;
    case "Wave":
      ax = Math.sin(y * 0.018 + t);
      ay = Math.cos(x * 0.016 - t);
      break;
    case "Drift":
      ax = Math.sin(t + y * 0.01) * 0.7;
      ay = Math.cos(t * 0.83 + x * 0.01) * 0.7;
      break;
    case "Bounce":
      ax = nx * Math.sin(t * 1.4);
      ay = ny * Math.cos(t * 1.4);
      break;
    case "Pendulum":
      ax = Math.sin(t) * 0.45;
      ay = Math.cos(t * 0.5) * 0.9;
      break;
    case "Rosette":
      ax = Math.sin(t + phase * 3);
      ay = Math.cos(t - phase * 3);
      break;
    case "Figure Eight":
      ax = Math.sin(t + phase);
      ay = Math.sin(t * 2 + phase * 0.5) * 0.7;
      break;
    case "Swarm":
      ax = -nx * 0.3 + Math.sin(t + seed * 8) * 0.8;
      ay = -ny * 0.3 + Math.cos(t + seed * 8) * 0.8;
      break;
    case "Stream":
      ax = 0.65 + Math.sin(y * 0.012 + t) * 0.35;
      ay = Math.cos(x * 0.012 + t) * 0.45;
      break;
    case "Whirlpool":
      ax = -ny - nx * 0.45;
      ay = nx - ny * 0.45;
      break;
    case "Spark":
      ax = Math.sin(t * 3) * Math.sin(t * 0.37) * 1.2;
      ay = Math.cos(t * 2.7) * Math.sin(t * 0.41) * 1.2;
      break;
    case "Orbit Cascade":
      ax = -ny * (0.6 + seed * 0.8);
      ay = nx * (0.6 + seed * 0.8);
      break;
    case "Galaxy":
      ax = -ny + nx * Math.sin(t + seed * 6) * 0.35;
      ay = nx + ny * Math.sin(t + seed * 6) * 0.35;
      break;
  }
  return { x: ax, y: ay, force: speed * (0.012 + Math.max(1, variant) * 0.00045) };
}

export function touchForce(
  behavior: string,
  behaviors: readonly string[],
  dx: number,
  dy: number,
  distance: number,
  time: number,
  phase: number,
  seed: number,
): { x: number; y: number; scale: number } {
  const index = behaviors.indexOf(behavior);
  const nx = dx / distance;
  const ny = dy / distance;
  if (index === 0) return { x: -nx, y: -ny, scale: 1 };
  if (index === 1) return { x: nx, y: ny, scale: 1 };
  if (index === 2) return { x: -ny, y: nx, scale: 1 };

  const profile = index - 3;
  const mode = profile % 10;
  const variation = Math.floor(profile / 10);
  const t = time * 0.002 * (0.45 + variation * 0.22) + phase + seed * 7;
  let x = -ny;
  let y = nx;
  switch (mode) {
    case 0:
      x = -ny + nx * 0.3;
      y = nx + ny * 0.3;
      break;
    case 1:
      x = nx * Math.sin(t);
      y = ny * Math.sin(t);
      break;
    case 2:
      x = -ny * Math.cos(t) - nx * 0.25;
      y = nx * Math.cos(t) - ny * 0.25;
      break;
    case 3:
      x = Math.cos(t);
      y = Math.sin(t);
      break;
    case 4:
      x = nx * (0.45 + Math.sin(t * 2) * 0.55);
      y = ny * (0.45 + Math.sin(t * 2) * 0.55);
      break;
    case 5:
      x = -ny + nx * Math.sin(t) * 0.6;
      y = nx + ny * Math.sin(t) * 0.6;
      break;
    case 6:
      x = -ny * (0.5 + seed);
      y = nx * (0.5 + seed);
      break;
    case 7:
      x = Math.sin(t + dy * 0.02);
      y = Math.cos(t + dx * 0.02);
      break;
    case 8:
      x = Math.sin(t + dy * 0.018);
      y = Math.cos(t + dx * 0.018);
      break;
    case 9:
      x = Math.sin(t * 3 + seed * 12);
      y = Math.cos(t * 2.7 + seed * 9);
      break;
  }
  return { x, y, scale: 0.7 + variation * 0.16 };
}
