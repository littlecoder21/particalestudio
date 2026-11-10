export const generatorLibrary = [
  {
    category: "Geometric",
    generators: [
      "Spiral", "Vortex", "Radial Burst", "Concentric Rings", "Wave Field", "Grid", "Tunnel",
      "Sphere", "Helix", "Fibonacci Distribution", "Fractal Formation",
      "Particle Sphere", "Particle Torus", "DNA Helix", "Particle Galaxy", "Möbius Structure",
      "Particle Cube", "Klein Bottle", "Mandelbulb", "Wave Surface", "Particle Flower",
      "Particle Knot", "Particle Explosion", "Fluid Sculpture",
    ],
  },
  {
    category: "Organic",
    generators: [
      "Dust Cloud", "Smoke", "Mist", "Fluid Flow", "Ink Diffusion", "Fireflies", "Turbulence",
      "Cellular", "Organic Blobs", "Drifting Particles", "Volumetric Smoke", "Particle Fabric",
      "Wormhole", "Crystal Formation", "Atomic Structure",
    ],
  },
  {
    category: "Network",
    generators: [
      "Connected Nodes", "Neural Network", "Constellation", "Branching Structures", "Dynamic Web",
      "Proximity Web", "Energy Vortex",
    ],
  },
  {
    category: "Energy",
    generators: [
      "Light Streams", "Electric Arcs", "Energy Field", "Magnetic Formation", "Particle Beam",
      "Shockwave", "Explosion", "Particle Explosion",
    ],
  },
  {
    category: "Pattern",
    generators: [
      "Halftone", "Voronoi", "Noise Pattern", "Stippling", "Pixel Grid", "Dot Matrix",
      "Cellular Pattern", "Woven Pattern",
    ],
  },
  {
    category: "Spatial",
    generators: [
      "Sphere 3D", "Cube 3D", "Torus 3D", "Helix 3D", "Galaxy 3D", "Orbital Systems",
      "Volumetric Cloud", "Particle Sphere", "Particle Torus", "DNA Helix", "Particle Galaxy",
      "Particle Cube", "Klein Bottle", "Mandelbulb", "Wave Surface", "Particle Fabric",
      "Wormhole", "Crystal Formation", "Atomic Structure", "Fluid Sculpture",
    ],
  },
] as const;

export type GeneratorCategory = (typeof generatorLibrary)[number]["category"];
export type GeneratorType = "Source Shape" |
  (typeof generatorLibrary)[number]["generators"][number];

export interface GeneratorPoint {
  x: number;
  y: number;
  depth: number;
}

export function getGeneratorPoint(
  generator: GeneratorType,
  index: number,
  count: number,
  width: number,
  height: number,
  spread: number,
): GeneratorPoint {
  const total = Math.max(count, 1);
  const item = Math.max(0, Math.min(index, total - 1));
  const progress = (item + 0.5) / total;
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const scale = Math.max(0, Math.min(spread / 100, 1));
  const radiusX = width * 0.46 * scale;
  const radiusY = height * 0.46 * scale;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const seeded = (seed: number) => {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  };
  const gaussian = (seed: number) => {
    const first = Math.max(seeded(seed), 0.0001);
    const second = seeded(seed + 1);
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(second * Math.PI * 2);
  };
  const point = (x: number, y: number, depth = 1): GeneratorPoint => ({
    x: centerX + x * radiusX,
    y: centerY + y * radiusY,
    depth: Math.max(0.35, Math.min(1.25, depth)),
  });
  const spiral = (turns: number, radialProgress = progress): GeneratorPoint => {
    const angle = item * goldenAngle + radialProgress * Math.PI * 2 * turns;
    const radiusProgress = Math.sqrt(radialProgress);
    return point(Math.cos(angle) * radiusProgress, Math.sin(angle) * radiusProgress);
  };

  switch (generator) {
    case "Spiral": {
      const angle = progress * Math.PI * 12;
      const radialProgress = Math.sqrt(progress);
      return point(Math.cos(angle) * radialProgress, Math.sin(angle) * radialProgress);
    }
    case "Vortex": {
      const angle = progress * Math.PI * 18;
      const radialProgress = 0.08 + 0.92 * progress;
      return point(Math.cos(angle) * radialProgress, Math.sin(angle) * radialProgress);
    }
    case "Radial Burst": {
      const rays = Math.max(8, Math.round(Math.sqrt(total)));
      const ray = item % rays;
      const length = Math.floor(item / rays) / Math.max(Math.ceil(total / rays) - 1, 1);
      const angle = ray / rays * Math.PI * 2 + (seeded(ray) - 0.5) * 0.12;
      const distance = Math.sqrt(Math.min(length, 1));
      return point(Math.cos(angle) * distance, Math.sin(angle) * distance);
    }
    case "Concentric Rings": {
      const ringCount = Math.max(3, Math.round(Math.sqrt(total) / 2));
      const ring = item % ringCount;
      const spoke = Math.floor(item / ringCount);
      const angle = spoke * goldenAngle + ring * 0.17;
      const distance = (ring + 1) / ringCount;
      return point(Math.cos(angle) * distance, Math.sin(angle) * distance);
    }
    case "Wave Field": {
      const columns = Math.max(12, Math.ceil(Math.sqrt(total * width / height)));
      const rows = Math.ceil(total / columns);
      const column = item % columns;
      const row = Math.floor(item / columns);
      const x = (column / Math.max(columns - 1, 1) - 0.5) * 2;
      const y = (row / Math.max(rows - 1, 1) - 0.5) * 1.25 + Math.sin(x * Math.PI * 3) * 0.22;
      return point(x, y);
    }
    case "Grid":
    case "Pixel Grid":
    case "Dot Matrix":
    case "Halftone":
    case "Noise Pattern": {
      const columns = Math.max(2, Math.ceil(Math.sqrt(total * width / height)));
      const rows = Math.ceil(total / columns);
      const column = item % columns;
      const row = Math.floor(item / columns);
      const jitter = generator === "Noise Pattern" ? 0.38 : 0;
      const x = (column + (seeded(item * 2) - 0.5) * jitter) / Math.max(columns - 1, 1) * 2 - 1;
      const y = (row + (seeded(item * 2 + 1) - 0.5) * jitter) / Math.max(rows - 1, 1) * 2 - 1;
      if (generator === "Halftone") {
        const depth = 0.35 + 0.65 * (1 - Math.hypot(x, y) / Math.SQRT2);
        return point(x, y, depth);
      }
      if (generator === "Dot Matrix") return point(x + (row % 2) * 0.035, y);
      return point(x, y);
    }
    case "Tunnel": {
      const segment = item % 24;
      const depth = Math.floor(item / 24) / Math.max(Math.ceil(total / 24) - 1, 1);
      const angle = segment / 24 * Math.PI * 2 + depth * 1.1;
      const distance = 0.12 + depth * 0.88;
      return point(Math.cos(angle) * distance, Math.sin(angle) * distance, 1.2 - depth * 0.7);
    }
    case "Sphere":
    case "Sphere 3D":
    case "Particle Sphere": {
      const z = 1 - 2 * progress;
      const ringRadius = Math.sqrt(Math.max(0, 1 - z * z));
      const angle = item * goldenAngle;
      return point(Math.cos(angle) * ringRadius, z, 0.55 + (z + 1) * 0.225);
    }
    case "Helix":
    case "Helix 3D":
    case "DNA Helix": {
      const angle = progress * Math.PI * 12;
      const depth = 0.55 + 0.45 * (Math.sin(angle) + 1) * 0.5;
      return point(Math.cos(angle) * 0.58, progress * 2 - 1, depth);
    }
    case "Fibonacci Distribution":
      return spiral(1, progress);
    case "Fractal Formation": {
      const vertices: ReadonlyArray<readonly [number, number]> = [[0, -0.92], [-0.8, 0.64], [0.8, 0.64]];
      let x = 0;
      let y = 0;
      for (let step = 0; step < 12; step += 1) {
        const vertex = vertices[Math.floor(seeded(item * 17 + step) * vertices.length)];
        x = (x + vertex[0]) * 0.5;
        y = (y + vertex[1]) * 0.5;
      }
      return point(x, y);
    }
    case "Dust Cloud":
    case "Mist":
    case "Volumetric Cloud":
    case "Stippling": {
      const x = generator === "Stippling" ? (seeded(item * 2) * 2 - 1) : gaussian(item * 2) * 0.34;
      const y = generator === "Stippling" ? (seeded(item * 2 + 1) * 2 - 1) : gaussian(item * 2 + 1) * 0.34;
      const depth = generator === "Volumetric Cloud" ? 0.5 + seeded(item * 3) * 0.7 : 1;
      return point(x, y, depth);
    }
    case "Smoke": {
      const y = (seeded(item * 2 + 1) * 2 - 1) * 0.95;
      const x = gaussian(item * 2) * (0.18 + (1 - progress) * 0.2);
      return point(x, y, 0.6 + (y + 1) * 0.2);
    }
    case "Fluid Flow":
    case "Turbulence": {
      const columns = Math.max(10, Math.ceil(Math.sqrt(total * width / height)));
      const rows = Math.ceil(total / columns);
      const x = (item % columns) / Math.max(columns - 1, 1) * 2 - 1;
      const y = Math.floor(item / columns) / Math.max(rows - 1, 1) * 2 - 1;
      const strength = generator === "Fluid Flow" ? 0.2 : 0.42;
      return point(x + Math.sin(y * 4 + x * 2) * strength, y + Math.cos(x * 4 - y * 2) * strength);
    }
    case "Ink Diffusion": {
      const angle = item * goldenAngle;
      const distance = Math.pow(seeded(item), 0.72);
      return point(Math.cos(angle) * distance, Math.sin(angle) * distance, 0.65 + distance * 0.35);
    }
    case "Fireflies":
    case "Organic Blobs": {
      const clusters = generator === "Fireflies" ? 7 : 5;
      const cluster = item % clusters;
      const clusterX = (seeded(cluster * 7) * 2 - 1) * 0.62;
      const clusterY = (seeded(cluster * 7 + 1) * 2 - 1) * 0.62;
      const spread = generator === "Fireflies" ? 0.09 : 0.22;
      return point(clusterX + gaussian(item * 2) * spread, clusterY + gaussian(item * 2 + 1) * spread, 0.65 + seeded(item) * 0.5);
    }
    case "Cellular": {
      const columns = Math.max(5, Math.round(Math.sqrt(total * width / height) / 2));
      const rows = Math.ceil(total / columns);
      const column = item % columns;
      const row = Math.floor(item / columns);
      return point((column / Math.max(columns - 1, 1) - 0.5) * 2 + (seeded(item * 2) - 0.5) * 0.17,
        (row / Math.max(rows - 1, 1) - 0.5) * 2 + (seeded(item * 2 + 1) - 0.5) * 0.17);
    }
    case "Drifting Particles":
      return point(gaussian(item * 2) * 0.5, (progress - 0.5) * 2, 0.55 + seeded(item) * 0.45);
    case "Connected Nodes":
    case "Neural Network":
    case "Constellation":
    case "Branching Structures":
    case "Dynamic Web":
    case "Proximity Web": {
      if (generator === "Branching Structures") {
        const level = Math.floor(Math.log2(item + 1));
        const firstAtLevel = 2 ** level - 1;
        const branch = item - firstAtLevel;
        const branches = 2 ** level;
        return point((branch / Math.max(branches - 1, 1) - 0.5) * (1 - level / 12),
          -0.9 + level / Math.max(Math.ceil(Math.log2(total + 1)), 1) * 1.8);
      }
      if (generator === "Neural Network") {
        const layers = Math.max(3, Math.ceil(Math.sqrt(total) / 2));
        const perLayer = Math.ceil(total / layers);
        const layer = Math.floor(item / perLayer);
        const within = item % perLayer;
        return point((layer / Math.max(layers - 1, 1) - 0.5) * 2,
          (within / Math.max(perLayer - 1, 1) - 0.5) * 1.8);
      }
      if (generator === "Constellation") {
        const angle = item * goldenAngle;
        const distance = 0.2 + 0.75 * Math.sqrt(progress);
        return point(Math.cos(angle) * distance, Math.sin(angle) * distance, 0.6 + seeded(item) * 0.4);
      }
      if (generator === "Dynamic Web") {
        const angle = item * goldenAngle;
        const distance = 0.2 + 0.75 * Math.sqrt(progress);
        return point(Math.cos(angle) * distance, Math.sin(angle) * distance + Math.sin(angle * 3) * 0.08);
      }
      const columns = Math.max(4, Math.ceil(Math.sqrt(total * width / height)));
      const rows = Math.ceil(total / columns);
      const column = item % columns;
      const row = Math.floor(item / columns);
      const jitter = generator === "Proximity Web" ? 0.14 : 0;
      return point((column / Math.max(columns - 1, 1) - 0.5) * 2 + (seeded(item * 2) - 0.5) * jitter,
        (row / Math.max(rows - 1, 1) - 0.5) * 2 + (seeded(item * 2 + 1) - 0.5) * jitter);
    }
    case "Light Streams":
    case "Electric Arcs": {
      const stream = item % 5;
      const along = Math.floor(item / 5) / Math.max(Math.ceil(total / 5) - 1, 1);
      const x = along * 2 - 1;
      const wave = Math.sin(along * Math.PI * (generator === "Light Streams" ? 2 : 5) + stream) * (generator === "Light Streams" ? 0.18 : 0.32);
      const jitter = generator === "Electric Arcs" ? (seeded(item) - 0.5) * 0.15 : 0;
      return point(x, (stream / 2 - 1) * 0.58 + wave + jitter);
    }
    case "Energy Field":
    case "Magnetic Formation": {
      const angle = item * goldenAngle;
      const distance = Math.sqrt(progress);
      const field = generator === "Magnetic Formation" ? Math.sin(angle * 3) * 0.2 : Math.sin(distance * 12) * 0.05;
      return point(Math.cos(angle) * distance, Math.sin(angle) * distance + field, 0.55 + (1 - distance) * 0.45);
    }
    case "Particle Beam":
      return point(progress * 2 - 1, (seeded(item) - 0.5) * 0.22, 0.7 + seeded(item + 1) * 0.3);
    case "Shockwave": {
      const rings = Math.max(2, Math.min(8, Math.round(Math.sqrt(total) / 5)));
      const ring = item % rings;
      const angle = Math.floor(item / rings) * goldenAngle;
      const distance = 0.22 + ring / rings * 0.78;
      return point(Math.cos(angle) * distance, Math.sin(angle) * distance);
    }
    case "Explosion":
    case "Particle Explosion": {
      const rays = Math.max(8, Math.round(Math.sqrt(total)));
      const angle = item % rays / rays * Math.PI * 2;
      const distance = Math.sqrt(Math.floor(item / rays) / Math.max(Math.ceil(total / rays) - 1, 1));
      return point(Math.cos(angle) * distance, Math.sin(angle) * distance);
    }
    case "Voronoi": {
      const cells = Math.max(2, Math.ceil(Math.sqrt(total / 3)));
      const column = item % cells;
      const row = Math.floor(item / cells) % cells;
      return point((column / Math.max(cells - 1, 1) - 0.5) * 2 + (seeded(item * 2) - 0.5) * 0.12,
        (row / Math.max(cells - 1, 1) - 0.5) * 2 + (seeded(item * 2 + 1) - 0.5) * 0.12);
    }
    case "Cellular Pattern": {
      const columns = Math.max(4, Math.ceil(Math.sqrt(total * width / height)));
      const rows = Math.ceil(total / columns);
      const column = item % columns;
      const row = Math.floor(item / columns);
      return point((column + (row % 2) * 0.5) / columns * 2 - 1,
        (row / Math.max(rows - 1, 1) - 0.5) * 2);
    }
    case "Woven Pattern": {
      const columns = Math.max(8, Math.ceil(Math.sqrt(total * width / height)));
      const rows = Math.ceil(total / columns);
      const column = item % columns;
      const row = Math.floor(item / columns);
      const x = column / Math.max(columns - 1, 1) * 2 - 1;
      const y = row / Math.max(rows - 1, 1) * 2 - 1;
      return point(x, y + Math.sin(x * Math.PI * 4 + row % 2 * Math.PI) * 0.035);
    }
    case "Particle Torus":
    case "Torus 3D": {
      const u = progress * Math.PI * 2 * Math.max(3, Math.sqrt(total) / 3);
      const v = item * goldenAngle;
      const ring = 0.58 + 0.30 * Math.cos(v);
      return point(Math.cos(u) * ring, Math.sin(u) * ring + Math.sin(v) * 0.28,
        0.6 + (Math.cos(v) + 1) * 0.2);
    }
    case "Particle Galaxy":
    case "Galaxy 3D":
    case "Orbital Systems": {
      const arms = generator === "Particle Galaxy" ? 5 : generator === "Orbital Systems" ? 7 : 4;
      const arm = item % arms;
      const distance = Math.sqrt(Math.floor(item / arms) / Math.max(Math.ceil(total / arms) - 1, 1));
      const angle = distance * Math.PI * (generator === "Particle Galaxy" ? 7 : 2) + arm * (Math.PI * 2 / arms);
      return point(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.68,
        0.5 + (1 - distance) * 0.7);
    }
    case "Möbius Structure": {
      const v = progress * Math.PI * 2;
      const u = (item / Math.max(total - 1, 1) - 0.5) * 2.4;
      const radius = 0.9 + 0.28 * Math.cos(v * 0.5);
      const x = (radius + u * Math.cos(v / 2)) * Math.cos(v);
      const y = (radius + u * Math.cos(v / 2)) * Math.sin(v);
      const z = u * Math.sin(v / 2);
      return point(x, y, 0.55 + (z + 1.2) * 0.24);
    }
    case "Particle Cube":
    case "Cube 3D": {
      const face = item % 6;
      const u = seeded(item * 2) * 2 - 1;
      const v = seeded(item * 2 + 1) * 2 - 1;
      const depth = 0.6 + seeded(item * 3) * 0.4;
      if (face === 0) return point(1, u, depth);
      if (face === 1) return point(-1, u, depth);
      if (face === 2) return point(u, 1, depth);
      if (face === 3) return point(u, -1, depth);
      if (face === 4) return point(u, v, depth);
      return point(-u, v, depth);
    }
    case "Klein Bottle": {
      const t = progress * Math.PI * 2;
      const s = (item / Math.max(total - 1, 1)) * Math.PI * 2;
      const x = (2 + Math.cos(s)) * Math.cos(t) * 0.8;
      const y = (2 + Math.cos(s)) * Math.sin(t) * 0.8;
      const z = Math.sin(s) * Math.cos(t / 2) * 0.8;
      return point(x, y, 0.6 + (z + 1) * 0.22);
    }
    case "Mandelbulb": {
      const u = (seeded(item + 4) - 0.5) * 2;
      const v = (seeded(item + 9) - 0.5) * 2;
      const w = (seeded(item + 12) - 0.5) * 2;
      const radius = Math.sqrt(u * u + v * v + w * w);
      const fractal = 0.28 + Math.sin(radius * 14 + item) * 0.12;
      return point(u * fractal, v * fractal, w * fractal * 1.15);
    }
    case "Wave Surface": {
      const u = (item / Math.max(total - 1, 1) - 0.5) * 2.4;
      const v = ((item % Math.max(6, Math.round(Math.sqrt(total)))) / Math.max(5, Math.round(Math.sqrt(total)))) * 2.4 - 1.2;
      const z = Math.sin(u * 4.5) * 0.65 + Math.cos(v * 5.5) * 0.5;
      return point(u, v, 0.5 + (z + 1.2) * 0.28);
    }
    case "Particle Flower": {
      const theta = progress * Math.PI * 2 * 8;
      const petal = Math.sin(theta) * 0.8;
      const radius = 0.25 + Math.abs(Math.cos(theta * 3)) * 0.7;
      return point(Math.cos(theta) * radius, Math.sin(theta) * radius * 0.65 + petal * 0.15, 0.62 + petal * 0.25);
    }
    case "Volumetric Smoke":
    case "Particle Fabric": {
      const x = gaussian(item * 2) * 0.46;
      const y = gaussian(item * 2 + 1) * 0.46;
      const z = Math.sin((item / Math.max(total - 1, 1)) * Math.PI * 14) * 0.5;
      return point(x + Math.sin(y * 6) * 0.14, y + Math.cos(x * 7) * 0.12, 0.55 + (z + 0.8) * 0.24);
    }
    case "Wormhole": {
      const angle = progress * Math.PI * 2 * 16;
      const distance = 0.12 + progress * 0.85;
      const tunnel = 1 - progress;
      return point(Math.cos(angle) * distance, Math.sin(angle) * distance, 0.45 + tunnel * 0.7);
    }
    case "Energy Vortex": {
      const angle = progress * Math.PI * 2 * 14;
      const radius = Math.sqrt(progress);
      const swirl = 1 - progress;
      return point(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.5 + swirl * 0.75);
    }
    case "Crystal Formation": {
      const theta = item * goldenAngle;
      const radius = 0.2 + (item / Math.max(total - 1, 1)) * 0.8;
      const x = Math.cos(theta) * radius;
      const y = Math.sin(theta) * radius * 0.8;
      const z = Math.sin(theta * 5) * 0.8;
      return point(x, y, 0.6 + (z + 1) * 0.22);
    }
    case "Atomic Structure": {
      const orbit = item % 8;
      const orbitCount = Math.max(6, Math.ceil(Math.sqrt(total)));
      const step = Math.floor(item / orbitCount);
      const angle = (orbit / orbitCount + step / Math.max(Math.ceil(total / orbitCount), 1)) * Math.PI * 2;
      const radius = 0.18 + ((step % 5) / 5) * 0.58;
      return point(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.5 + Math.cos(angle * 3) * 0.15);
    }
    case "Particle Knot": {
      const t = progress * Math.PI * 2 * 3.6;
      const x = Math.sin(t) + 2 * Math.sin(2 * t);
      const y = Math.cos(t) - 2 * Math.cos(2 * t);
      const z = -Math.sin(3 * t) * 0.7;
      return point(x * 0.22, y * 0.22, 0.55 + (z + 0.9) * 0.22);
    }
    case "Fluid Sculpture": {
      const u = (item / Math.max(total - 1, 1) - 0.5) * 2.4;
      const v = (seeded(item + 6) - 0.5) * 2.5;
      const z = Math.sin(u * 5.3) + Math.cos(v * 4.8) + Math.sin((u + v) * 3.7);
      return point(u + Math.sin(v * 3) * 0.12, v * 0.6, 0.5 + (z + 1.5) * 0.2);
    }
    default:
      return point((seeded(item * 2) - 0.5) * 2, (seeded(item * 2 + 1) - 0.5) * 2);
  }
}
