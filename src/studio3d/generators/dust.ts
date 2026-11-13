import type { GeneratorDef, GeneratorId, Vec3 } from "../types";
import { TAU, clamp, lerp } from "../math";
import { num, put, range } from "./common";

type DustId = Extract<GeneratorId, "dust-cloud" | "dust-veil" | "dust-motes">;

const definitions: Array<{ id: DustId; name: string; description: string; preset: "cloud" | "veil" | "motes"; spread: number; depth: number; clumping: number }> = [
  { id: "dust-cloud", name: "Dust Cloud", description: "Layered clusters of fine dust drifting through a deep volume.", preset: "cloud", spread: 0.85, depth: 0.7, clumping: 0.72 },
  { id: "dust-veil", name: "Dust Veil", description: "A broad, rippling veil of dust with soft gaps and layered depth.", preset: "veil", spread: 1.15, depth: 0.22, clumping: 0.38 },
  { id: "dust-motes", name: "Floating Motes", description: "Sparse near-field motes mixed with a wide, quiet dust field.", preset: "motes", spread: 1.25, depth: 1, clumping: 0.18 },
];

export const DUST_GENERATORS: GeneratorDef[] = definitions.map((definition) => ({
  id: definition.id,
  name: definition.name,
  tag: "Dust & light",
  method: "Seeded multi-scale particle volume",
  description: definition.description,
  params: [
    range("spread", "Spread", 0.2, 1.8, 0.01, definition.spread),
    range("depth", "Depth", 0.08, 1.5, 0.01, definition.depth),
    range("clumping", "Cloud clumping", 0, 1, 0.01, definition.clumping),
    range("wisps", "Wisp detail", 0, 1, 0.01, 0.55),
    range("largeMotes", "Large motes", 0, 0.3, 0.01, definition.preset === "motes" ? 0.12 : 0.035),
  ],
  recipe: {
    count: 70000,
    look: { palette: [{ t: 0, color: "#56637d" }, { t: 0.5, color: "#a9b8d5" }, { t: 1, color: "#fff2d6" }], size: 0.0065, sizeVariation: 0.8, opacity: 0.78, emission: 1.1, glow: 0.8, glowRadius: 0.75, softness: 1, blend: "additive", background: "#02040a" },
    behaviors: [{ type: "home", intensity: 22, aux: 0.72 }, { type: "curl", intensity: 0.75, scale: 1.35, speed: 0.28 }, { type: "drag", intensity: 1.5 }],
    deformers: [{ type: "noise", amount: 0.025, scale: 1.4, speed: 0.22 }],
    camera: { pitch: 0.05, yaw: 0.18, distance: 4.1, autoRotate: 0.035 },
  },
  generate(ctx, formation) {
    const { rng, params } = ctx;
    const spread = num(params, "spread", definition.spread);
    const depth = num(params, "depth", definition.depth);
    const clumping = num(params, "clumping", definition.clumping);
    const wisps = num(params, "wisps", 0.55);
    const largeMotes = num(params, "largeMotes", 0.04);
    const clusterCount = 5;

    for (let i = 0; i < formation.n; i++) {
      let x = 0, y = 0, z = 0, t = rng.next(), size = 0.65 + rng.next() * 0.7, alpha = 0.35 + rng.next() * 0.5;
      if (definition.preset === "cloud") {
        const cluster = rng.int(clusterCount);
        const angle = cluster * TAU / clusterCount + 0.17;
        const orbit = cluster === 0 ? 0 : 0.55 * spread;
        const cx = Math.cos(angle) * orbit, cy = Math.sin(angle) * orbit * 0.72, cz = Math.sin(angle * 1.7) * depth * 0.22;
        const local = spread * (0.12 + (1 - clumping) * 0.28);
        x = cx + rng.gauss() * local;
        y = cy + rng.gauss() * local * 0.72;
        z = cz + rng.gauss() * depth * 0.28;
        t = clamp(0.18 + cluster / (clusterCount - 1) * 0.55 + rng.next() * 0.22, 0, 1);
        alpha *= 0.55 + 0.45 * clumping;
      } else if (definition.preset === "veil") {
        const u = rng.next() * 2 - 1, v = rng.next() * 2 - 1;
        const wave = Math.sin(u * 5 + ctx.seed * 0.01) * 0.13 + Math.sin(u * 11 + v * 3) * wisps * 0.07;
        const gaps = 0.32 + 0.68 * Math.pow(0.5 + 0.5 * Math.sin(u * 8 + Math.sin(v * 4) * 2), 0.5 + clumping);
        x = u * spread;
        y = v * spread * 0.52 + wave;
        z = rng.gauss() * depth * 0.3;
        t = clamp(0.15 + (u + 1) * 0.28 + 0.12 * Math.sin(v * 6), 0, 1);
        alpha *= gaps;
      } else {
        const direction: Vec3 = [0, 0, 0];
        rng.onSphere(direction);
        const radial = spread * (0.22 + 0.78 * Math.sqrt(rng.next()));
        x = direction[0] * radial;
        y = direction[1] * radial * 0.72;
        z = direction[2] * depth;
        t = clamp(0.22 + 0.58 * (direction[2] * 0.5 + 0.5) + rng.next() * 0.18, 0, 1);
        alpha *= 0.42 + 0.58 * rng.next();
      }

      const isLarge = rng.next() < largeMotes;
      if (isLarge) { size *= 2.4 + rng.next() * 2.2; alpha *= 0.55; }
      const wispyOffset = (rng.next() - 0.5) * wisps * 0.08;
      put(formation, i, x + wispyOffset, y, z, clamp(lerp(t, rng.next(), wisps * 0.22), 0, 1), size, clamp(alpha, 0.08, 1), 0.8 + rng.next() * 0.2);
    }
  },
}));
