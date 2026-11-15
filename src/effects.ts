const CORE_EFFECTS = [
  { id: "Twinkle", description: "Particles gently flicker in brightness.", style: -1 },
  { id: "Pulse", description: "Particles breathe in and out in size.", style: -1 },
  { id: "Color Cycle", description: "Cycle through a smooth spectrum of colors.", style: -1 },
  { id: "Long Exposure", description: "Leave persistent light trails behind particles.", style: -1 },
  { id: "Connections", description: "Draw subtle links between nearby particles.", style: -1 },
  { id: "Magnetic Field", description: "Bend moving particles around your pointer.", style: -1 },
  { id: "Sparkles", description: "Add tiny glints that shimmer among particles.", style: -1 },
] as const;

const EXTRA_EFFECTS = [
  ["Halo", "A soft circular aura around each particle.", 0],
  ["Orbiting Sparks", "Small sparks orbit around selected particles.", 1],
  ["Chromatic Echo", "Offset color echoes create a prism-like edge.", 2],
  ["Starburst", "Brief four-point flashes brighten particle clusters.", 3],
  ["Aura", "A wide, soft glow follows every particle.", 4],
  ["Radiant Rings", "Thin light rings pulse around particles.", 5],
  ["Comet Tails", "Short streaks trail particles in their direction of travel.", 6],
  ["Particle Ribbons", "Light strokes extend behind moving particles.", 6],
  ["Glimmer", "A fine highlight travels across particle surfaces.", 7],
  ["Firefly Glow", "Particles brighten and dim like fireflies.", 4],
  ["Lens Flare", "Bright particles emit a compact lens flare.", 3],
  ["Shimmer", "A narrow highlight oscillates across each particle.", 7],
  ["Ripple Rings", "Concentric rings expand from selected particles.", 5],
  ["Neon Edge", "A bright edge makes particles appear neon-lit.", 0],
  ["Prism Split", "A subtle color split adds a refractive edge.", 2],
  ["Light Leak", "Warm light leaks flicker around the particle field.", 4],
  ["Spark Trails", "Tiny sparks follow moving particles.", 6],
  ["Glitter Dust", "Fine glitter points sparkle near particles.", 7],
  ["Pulsar", "A rhythmic beam pulses from particles.", 3],
  ["Aurora", "Soft color bands shift around the formation.", 4],
  ["Orbital Sparks", "A second orbiting sparkle pattern circles particles.", 1],
  ["Echo Trails", "Faint particle echoes show recent movement.", 2],
  ["Soft Shadow", "An offset ellipse adds depth behind each particle.", 9],
  ["Depth Glow", "Particles glow according to their simulated depth.", 4],
  ["Fresnel Rim", "Bright rim light adds a rounded, 3D-like edge.", 0],
  ["Focus Bloom", "Bright points bloom softly out of focus.", 4],
  ["Bubbles", "Translucent bubble highlights float over particles.", 0],
  ["Shards", "Small angular glints flicker around particles.", 2],
  ["Snowfall", "Fine cool-toned motes drift among particles.", 7],
  ["Ember", "Warm sparks glow and fade around particles.", 3],
  ["Pulse Ring", "A single bright ring expands and fades.", 5],
  ["Laser Streaks", "Thin directional streaks flash across the field.", 6],
  ["Twinkling Crosses", "Cross-shaped stars twinkle among particles.", 7],
  ["Orbital Halo", "A tilted halo rotates around particles.", 1],
  ["Parallax Echo", "Depth-offset echoes make the field feel dimensional.", 2],
  ["Velvet Glow", "A low-contrast, soft-edged glow surrounds particles.", 4],
  ["Caustics", "Wavering light patterns shimmer across the scene.", 8],
  ["Nebula Veil", "Soft colored haze drifts behind the particle field.", 4],
  ["Plasma Arc", "Short branching arcs flicker around bright points.", 3],
  ["Supernova", "Occasional compact bursts radiate from particles.", 3],
  ["Moonlight", "Cool silver highlights sweep across particle faces.", 4],
  ["Strobe", "A restrained rhythmic flash pulses through particles.", 3],
  ["Holographic Dust", "Iridescent motes shimmer around the formation.", 7],
] as const;

type ExtraEffect = typeof EXTRA_EFFECTS[number] extends readonly [infer Id extends string, infer Description extends string, infer Style extends number]
  ? { id: Id; description: Description; style: Style }
  : never;

export const availableEffects = [
  ...CORE_EFFECTS,
  ...EXTRA_EFFECTS.map(([id, description, style]) => ({ id, description, style } as const satisfies ExtraEffect)),
] as const;

export type ParticleEffect = (typeof availableEffects)[number]["id"];

export function isParticleEffect(value: unknown): value is ParticleEffect {
  return typeof value === "string" && availableEffects.some((effect) => effect.id === value);
}
