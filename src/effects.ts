export const availableEffects = [
  { id: "Twinkle", description: "Particles gently flicker in brightness." },
  { id: "Pulse", description: "Particles breathe in and out in size." },
  { id: "Color Cycle", description: "Cycle through a smooth spectrum of colors." },
  { id: "Long Exposure", description: "Leave persistent light trails behind particles." },
  { id: "Connections", description: "Draw subtle links between nearby particles." },
  { id: "Magnetic Field", description: "Bend moving particles around your pointer." },
  { id: "Sparkles", description: "Add tiny glints that shimmer among particles." },
] as const;

export type ParticleEffect = (typeof availableEffects)[number]["id"];

export function isParticleEffect(value: unknown): value is ParticleEffect {
  return typeof value === "string" && availableEffects.some((effect) => effect.id === value);
}
