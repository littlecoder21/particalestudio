import type { ParticleSettings } from "./particleEngine";

export interface ParticlePreset {
  name: string;
  tag: string;
  color: string;
  accent: string;
  settings: Partial<ParticleSettings>;
}

const themes = [
  { names: ["Polar Veil", "Aurora Drift", "Boreal Waves", "Arctic Bloom", "Midnight Aurora"], tag: "Aurora", color: "#70f1d0", accent: "#8778ff" },
  { names: ["Deep Current", "Blue Lagoon", "Tidal Glass", "Seafoam", "Abyssal Glow"], tag: "Ocean", color: "#43c9f5", accent: "#66f0c1" },
  { names: ["Solar Flare", "Emberfall", "Molten Core", "Cinderstorm", "Phoenix Rise"], tag: "Fire", color: "#ffb14a", accent: "#ff4f79" },
  { names: ["Rose Nebula", "Velvet Orbit", "Orchid Haze", "Lilac Bloom", "Violet Hour"], tag: "Cosmic", color: "#f47bd8", accent: "#8d7aff" },
  { names: ["Citrus Pop", "Golden Hour", "Mango Motion", "Lemon Light", "Peach Fizz"], tag: "Bright", color: "#ffe45e", accent: "#ff8c62" },
  { names: ["Jade Garden", "Mossy Stardust", "Fern Spiral", "Emerald Rain", "Wildflower"], tag: "Nature", color: "#9bea6c", accent: "#35c8a4" },
  { names: ["Glacier Dust", "Frost Circuit", "Crystal Rain", "Winter Bloom", "Blue Ice"], tag: "Frost", color: "#a9eaff", accent: "#8c9aff" },
  { names: ["Neon Circuit", "Laser Grid", "Cyber Pulse", "Electric Dream", "Pixel Rush"], tag: "Neon", color: "#45f3ef", accent: "#ff4ddb" },
  { names: ["Dusty Rose", "Blush Orbit", "Coral Mist", "Soft Petals", "Dreaming Pink"], tag: "Dream", color: "#ff9bb5", accent: "#c5a0ff" },
  { names: ["Silver Lining", "Quiet Cosmos", "Moonlit Drift", "Smoke Rings", "Eclipse"], tag: "Monochrome", color: "#d7e1ff", accent: "#8b93b8" },
] as const;

const variations = [
  { tag: "Drift", emitter: "Circle", motion: "Flow", generator: "Source Shape", count: 360, spread: 78, speed: 1.1, size: 2, glow: 14, gravity: 0 },
  { tag: "Orbit", emitter: "Ring", motion: "Orbit", generator: "Spiral", count: 520, spread: 70, speed: 1.6, size: 1.8, glow: 18, gravity: 0 },
  { tag: "Bloom", emitter: "Point", motion: "Float", generator: "Dust Cloud", count: 280, spread: 92, speed: 0.7, size: 2.8, glow: 22, gravity: -0.015 },
  { tag: "Pulse", emitter: "Circle", motion: "Burst", generator: "Connected Nodes", count: 460, spread: 84, speed: 1.9, size: 1.7, glow: 10, gravity: 0.008 },
  { tag: "Cascade", emitter: "Line", motion: "Flow", generator: "Electric Arcs", count: 320, spread: 90, speed: 1.3, size: 2.2, glow: 16, gravity: 0.025 },
] as const;

export const additionalPresets: ParticlePreset[] = themes.flatMap((theme, themeIndex) =>
  theme.names.map((name, variationIndex) => {
    const variation = variations[variationIndex];
    const alternate = themeIndex % 2 === 1;
    return {
      name,
      tag: `${theme.tag} · ${variation.tag}`,
      color: theme.color,
      accent: theme.accent,
      settings: {
        count: variation.count + (themeIndex % 3) * 40,
        emitter: variation.emitter,
        motion: variation.motion,
        generator: variation.generator,
        spread: variation.spread,
        speed: variation.speed,
        size: variation.size + (themeIndex % 3) * 0.2,
        glow: variation.glow + (themeIndex % 4) * 2,
        gravity: variation.gravity,
        turbulence: alternate ? 0.7 : 0.3,
        vortex: variationIndex === 1 ? 0.8 : 0.25,
        palette: [theme.color, theme.accent, themes[(themeIndex + 3) % themes.length].color],
      },
    };
  }),
);
