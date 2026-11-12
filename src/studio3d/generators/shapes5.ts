import type { GeneratorDef, GeneratorId } from "../types";
import { TAU, clamp } from "../math";
import { put, range } from "./common";

const PRESETS: Array<{ id: GeneratorId; name: string; group: string; description: string }> = [
  { id: "geo-sphere", name: "Sphere", group: "Geometric 3D objects", description: "A clean spherical particle shell." },
  { id: "geo-cube", name: "Cube", group: "Geometric 3D objects", description: "Particles distributed evenly over six cube faces." },
  { id: "geo-torus", name: "Torus", group: "Geometric 3D objects", description: "A smooth parametric torus." },
  { id: "geo-torus-knot", name: "Torus Knot", group: "Geometric 3D objects", description: "A tubular three-dimensional torus knot." },
  { id: "geo-icosahedron", name: "Icosahedron", group: "Geometric 3D objects", description: "A faceted icosahedral shell." },
  { id: "geo-dodecahedron", name: "Dodecahedron", group: "Geometric 3D objects", description: "A softly faceted dodecahedral shell." },
  { id: "geo-octahedron", name: "Octahedron", group: "Geometric 3D objects", description: "A diamond-shaped octahedral shell." },
  { id: "geo-tetrahedron", name: "Tetrahedron", group: "Geometric 3D objects", description: "A triangular tetrahedral shell." },
  { id: "geo-pyramid", name: "Pyramid", group: "Geometric 3D objects", description: "A square pyramid with a broad base." },
  { id: "geo-helix", name: "Helix", group: "Geometric 3D objects", description: "A rising single helical strand." },
  { id: "space-saturn", name: "Saturn with Rings", group: "Space & cosmic objects", description: "A planet with a wide, finely banded ring system." },
  { id: "space-galaxy", name: "Spiral Galaxy", group: "Space & cosmic objects", description: "A rotating multi-arm galaxy with a bright core." },
  { id: "space-black-hole", name: "Black Hole", group: "Space & cosmic objects", description: "A dark central void surrounded by a luminous accretion disk." },
  { id: "space-wormhole", name: "Wormhole", group: "Space & cosmic objects", description: "A flared, twisted tunnel through space." },
  { id: "space-nebula", name: "Nebula Cloud", group: "Space & cosmic objects", description: "Layered turbulent clouds and sparkling stars." },
  { id: "space-asteroid", name: "Asteroid", group: "Space & cosmic objects", description: "An irregular rocky body with a cratered surface." },
  { id: "space-comet", name: "Comet", group: "Space & cosmic objects", description: "A glowing nucleus with a sweeping particle tail." },
  { id: "space-supernova", name: "Supernova", group: "Space & cosmic objects", description: "An expanding shell of energetic filaments." },
  { id: "space-star-cluster", name: "Cosmic Star Cluster", group: "Space & cosmic objects", description: "A dense central cluster fading into distant stars." },
  { id: "space-planetary-system", name: "Planetary System", group: "Space & cosmic objects", description: "A central star with planets on orbital paths." },
  { id: "nature-butterfly", name: "Butterfly", group: "Nature & organic objects", description: "Symmetric patterned wings and a slender body." },
  { id: "nature-brain", name: "Human Brain", group: "Nature & organic objects", description: "Two folded hemispheres with soft organic ridges." },
  { id: "nature-skull", name: "Human Skull", group: "Nature & organic objects", description: "A stylized skull with eye sockets and a tapered jaw." },
  { id: "nature-dna", name: "DNA Double Helix", group: "Nature & organic objects", description: "Two intertwined strands connected by base pairs." },
  { id: "nature-tree", name: "Tree", group: "Nature & organic objects", description: "A branching trunk crowned with a particle canopy." },
  { id: "nature-flower", name: "Flower", group: "Nature & organic objects", description: "Layered petals surrounding a bright center." },
  { id: "nature-rose", name: "Rose", group: "Nature & organic objects", description: "A curled spiral of rose petals above a stem." },
  { id: "nature-jellyfish", name: "Jellyfish", group: "Nature & organic objects", description: "A domed bell with flowing trailing tentacles." },
  { id: "nature-seahorse", name: "Seahorse", group: "Nature & organic objects", description: "A curled tail, arched body and long snout." },
  { id: "nature-dragon", name: "Dragon", group: "Nature & organic objects", description: "A serpentine body with horns, tail and broad wings." },
  { id: "math-klein-bottle", name: "Klein Bottle", group: "Advanced mathematical objects", description: "A sampled self-intersecting Klein bottle surface." },
  { id: "math-mobius-strip", name: "Möbius Strip", group: "Advanced mathematical objects", description: "A one-sided half-twist ribbon." },
  { id: "math-trefoil-knot", name: "Trefoil Knot", group: "Advanced mathematical objects", description: "A three-crossing trefoil curve with a particle tube." },
  { id: "math-mobius-torus", name: "Möbius Torus", group: "Advanced mathematical objects", description: "A toroidal ribbon twisted around its centerline." },
  { id: "math-gyroid", name: "Gyroid", group: "Advanced mathematical objects", description: "A triply periodic minimal-surface approximation." },
  { id: "math-mandelbulb", name: "Mandelbulb", group: "Advanced mathematical objects", description: "A spiky spherical fractal surface approximation." },
  { id: "math-lorenz-attractor", name: "Lorenz Attractor", group: "Advanced mathematical objects", description: "A particle-sampled Lorenz butterfly attractor." },
  { id: "math-clifford-attractor", name: "Clifford Attractor", group: "Advanced mathematical objects", description: "A folded three-dimensional Clifford attractor." },
  { id: "math-fibonacci-spiral", name: "Fibonacci Spiral", group: "Advanced mathematical objects", description: "A golden-angle spiral expanding through 3D space." },
  { id: "math-spherical-harmonics", name: "Spherical Harmonics", group: "Advanced mathematical objects", description: "A lobed spherical-harmonic particle surface." },
  { id: "form-human-face", name: "Human Face", group: "Complex 3D particle formations", description: "A stylized face with brow, eyes, nose, cheeks and chin." },
  { id: "form-human-body", name: "Human Body", group: "Complex 3D particle formations", description: "A standing body assembled from connected particle volumes." },
  { id: "form-human-hand", name: "Human Hand", group: "Complex 3D particle formations", description: "A palm with separated fingers and a curved thumb." },
  { id: "form-eagle", name: "Eagle", group: "Complex 3D particle formations", description: "A soaring eagle with outstretched wings and a hooked beak." },
  { id: "form-wolf", name: "Wolf", group: "Complex 3D particle formations", description: "A wolf-like head, pointed ears, muzzle and tail." },
  { id: "form-lion", name: "Lion", group: "Complex 3D particle formations", description: "A proud lion form with a radiating mane." },
  { id: "form-phoenix", name: "Phoenix", group: "Complex 3D particle formations", description: "A rising bird with layered flame-like wings and tail." },
  { id: "form-dna-molecule", name: "DNA Molecular Structure", group: "Complex 3D particle formations", description: "A molecular double helix with beads and connecting bonds." },
  { id: "form-crystal-cluster", name: "Crystal Cluster", group: "Complex 3D particle formations", description: "A cluster of tapered crystal prisms." },
  { id: "form-infinity", name: "Infinity Symbol (3D)", group: "Complex 3D particle formations", description: "A tubular three-dimensional infinity loop." },
];

type Point = [number, number, number];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const unit = (v: Point): Point => { const m = Math.hypot(...v) || 1; return [v[0] / m, v[1] / m, v[2] / m]; };
const segment = (a: Point, b: Point, t: number): Point => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function createPoint(id: GeneratorId, i: number, n: number, rng: Parameters<GeneratorDef["generate"]>[0]["rng"], detail: number): { p: Point; color: number; size: number; alpha: number } {
  const u = (i + rng.next()) / n, v = rng.next(), a = u * TAU, b = Math.acos(2 * v - 1), cs = Math.cos(b), sn = Math.sin(b);
  const sphere: Point = [sn * Math.cos(a), cs, sn * Math.sin(a)];
  const noise = () => rng.gauss();
  let p: Point = [sphere[0], sphere[1], sphere[2]], color = u, size = 1, alpha = 1;
  const torus = (major: number, minor: number, twist = 0) => {
    const ang = u * TAU, tube = v * TAU + twist * ang, r = major + minor * Math.cos(tube);
    return [r * Math.cos(ang), minor * Math.sin(tube), r * Math.sin(ang)] as Point;
  };
  const line = (points: Point[]) => segment(points[Math.min(points.length - 2, Math.floor(u * (points.length - 1)))], points[Math.min(points.length - 1, Math.floor(u * (points.length - 1)) + 1)], (u * (points.length - 1)) % 1);
  const bodyParts = (parts: Array<[Point, Point, number]>) => {
    const part = parts[Math.floor(v * parts.length) % parts.length], q = segment(part[0], part[1], u);
    const radial: Point = [0, 0, 0]; rng.onSphere(radial);
    const r = part[2] * Math.cbrt(rng.next());
    return [q[0] + radial[0] * r, q[1] + radial[1] * r, q[2] + radial[2] * r] as Point;
  };
  const capsule = (start: Point, end: Point, r: number): Point => {
    const d: Point = [0, 0, 0]; rng.onSphere(d);
    const q = segment(start, end, rng.next()), radius = r * Math.cbrt(rng.next());
    return [q[0] + d[0] * radius, q[1] + d[1] * radius, q[2] + d[2] * radius];
  };

  if (id === "geo-cube") {
    const q = rng.next() * 2 - 1, r = rng.next() * 2 - 1, f = rng.int(6);
    p = f < 2 ? [f ? 1 : -1, q, r] : f < 4 ? [q, f === 2 ? 1 : -1, r] : [q, r, f === 4 ? 1 : -1];
  } else if (id === "space-black-hole") {
    const part = u;
    if (part < 0.73) {
      const r = 0.34 + 1.12 * Math.sqrt(v), angle = rng.next() * TAU + Math.log(r / 0.34) * 0.7;
      p = [Math.cos(angle) * r, noise() * 0.018 * (0.5 + r), Math.sin(angle) * r];
      color = clamp(0.08 + 0.82 * ((r - 0.34) / 1.12) + noise() * 0.04, 0, 1);
      size = 0.85 + 0.65 * (1 - (r - 0.34) / 1.12);
    } else if (part < 0.86) {
      const angle = rng.next() * TAU, r = 0.285 + noise() * 0.018;
      p = [Math.cos(angle) * r, noise() * 0.012, Math.sin(angle) * r];
      color = 0.96; size = 1.5; alpha = 0.92;
    } else {
      const angle = rng.next() * TAU, r = 1.02 + 0.34 * v;
      p = [Math.cos(angle) * r, noise() * 0.045, Math.sin(angle) * r];
      color = 0.18 + 0.5 * (1 - v); size = 0.72; alpha = 0.32;
    }
  } else if (id === "geo-torus" || id === "space-saturn") {
    p = torus(id === "space-saturn" ? 0.95 : 0.65, 0.23);
    if (id === "space-saturn" && i % 5 === 0) p = [sphere[0] * 0.57, sphere[1] * 0.57, sphere[2] * 0.57];
    if (id === "space-saturn") { color = u < 0.25 ? 0.15 : 0.55 + 0.35 * v; }
  } else if (id === "geo-torus-knot" || id === "math-trefoil-knot" || id === "form-infinity") {
    if (id === "form-infinity") {
      const t = u * TAU, d = 1 + Math.cos(t) * Math.cos(t);
      p = [1.15 * Math.sin(t) / d, 0.95 * Math.sin(t) * Math.cos(t) / d, 0.12 * Math.sin(2 * t) + (v - 0.5) * 0.12];
    } else {
      const t = u * TAU, tube = (v - 0.5) * 0.22, ring = 0.72 + 0.24 * Math.cos(3 * t);
      p = [(ring + tube * Math.cos(2 * t)) * Math.cos(2 * t), (ring + tube * Math.cos(2 * t)) * Math.sin(2 * t), ring * Math.sin(3 * t) + tube * Math.sin(2 * t)];
    }
  } else if (id === "geo-helix" || id === "nature-dna" || id === "form-dna-molecule") {
    const t = u * TAU * 4, side = rng.int(id === "geo-helix" ? 1 : 2), phase = side * Math.PI;
    p = [0.48 * Math.cos(t + phase), (u - 0.5) * 2.4, 0.48 * Math.sin(t + phase)];
    if (id !== "geo-helix" && i % 8 === 0) { const mate = [0.48 * Math.cos(t + phase + Math.PI), (u - 0.5) * 2.4, 0.48 * Math.sin(t + phase + Math.PI)] as Point; p = segment(p, mate, v); }
  } else if (id === "geo-pyramid") {
    p = v < 0.7 ? [rng.next() * 2 - 1, -0.8 + (rng.next() * 2 - 1) * 0.025, rng.next() * 2 - 1] : [mix((rng.next() * 2 - 1) * 0.8, 0, u), mix(-0.8, 1, u), mix((rng.next() * 2 - 1) * 0.8, 0, u)];
  } else if (id === "geo-octahedron" || id === "geo-tetrahedron" || id === "geo-icosahedron" || id === "geo-dodecahedron") {
    const d = unit(sphere);
    if (id === "geo-octahedron") { const m = Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]); p = d.map((x) => x / m) as Point; }
    else if (id === "geo-tetrahedron") { p = unit([d[0] + d[1] + d[2], -d[0] + d[1] - d[2], -d[0] - d[1] + d[2]]); }
    else { const k = id === "geo-icosahedron" ? 0.18 : 0.1; const r = 1 + k * Math.sin(3 * a) * Math.sin(2 * b); p = d.map((x) => x * r) as Point; }
  } else if (id === "space-galaxy" || id === "space-nebula" || id === "space-star-cluster" || id === "space-planetary-system" || id === "space-wormhole" || id === "space-comet" || id === "space-supernova") {
    if (id === "space-galaxy") { const arm = rng.int(4), r = Math.pow(v, 0.72) * 1.35, t = arm * TAU / 4 + r * 2.9 + noise() * 0.16; p = [r * Math.cos(t), noise() * 0.09 * (1 - r / 1.5), r * Math.sin(t)]; color = arm / 4 + u * 0.2; }
    else if (id === "space-star-cluster") { const r = Math.pow(v, 2.5) * 1.35; p = sphere.map((x) => x * r) as Point; size = v < 0.08 ? 2 : 0.7 + rng.next(); }
    else if (id === "space-planetary-system") { const ring = 0.34 + rng.int(5) * 0.22; p = [ring * Math.cos(a), noise() * 0.015, ring * Math.sin(a)]; if (i % 12 === 0) p = sphere.map((x) => x * (0.12 + (rng.int(5) + 1) * 0.2)) as Point; }
    else if (id === "space-wormhole") { const r = 0.24 + 0.7 * Math.abs(cs); p = [r * Math.cos(a * 3), cs * 1.4, r * Math.sin(a * 3)]; }
    else if (id === "space-comet") { const tail = rng.next(); p = tail < 0.2 ? sphere.map((x) => x * 0.18) as Point : [-(tail * 2.1), noise() * tail * 0.24, noise() * tail * 0.24]; color = 1 - tail * 0.7; }
    else if (id === "space-supernova") { const r = 0.35 + v * 1.1 + (rng.next() < 0.18 ? rng.next() * 0.7 : 0); p = sphere.map((x) => x * r) as Point; }
    else { const c = rng.int(4), centers: Point[] = [[-0.4, 0.2, 0], [0.35, 0.3, 0.2], [0, -0.35, 0.3], [0.2, -0.1, -0.4]], s = centers[c]; p = [s[0] + noise() * 0.33, s[1] + noise() * 0.26, s[2] + noise() * 0.3]; color = c / 4 + 0.2 * v; alpha = 0.45 + v * 0.5; }
  } else if (id === "space-asteroid") {
    const r = 0.85 + 0.2 * Math.sin(5 * a + 2 * b) + 0.1 * Math.sin(9 * b + a); p = sphere.map((x) => x * r) as Point;
  } else if (id === "nature-butterfly" || id === "form-eagle" || id === "form-phoenix") {
    const side = rng.int(2) ? 1 : -1, wing = rng.next(), spread = id === "nature-butterfly" ? 0.55 + 0.55 * Math.sin(wing * Math.PI) : 0.4 + wing;
    p = [side * (0.12 + spread), (wing - 0.5) * 1.4 + Math.sin(spread * 8) * 0.12, (v - 0.5) * 0.13];
    if (id !== "nature-butterfly" && i % 6 === 0) p = bodyParts([[[-0.08, 0, 0], [0.08, 0, 0], 0.12], [[0, 0, 0], [0, -0.6, 0], 0.08]]);
    if (id === "form-phoenix") { p[1] += Math.sin(u * TAU * 3) * 0.28; color = u; }
  } else if (id === "nature-flower" || id === "nature-rose") {
    const petals = id === "nature-rose" ? 8 : 10, q = u * TAU * petals, r = 0.3 + Math.sin(q) * 0.22 + v * 0.35;
    p = [r * Math.cos(q), (v - 0.4) * 0.45 + (id === "nature-rose" ? u * 0.25 : 0), r * Math.sin(q)];
    if (i % 9 === 0) p = [0, -0.2 + u * 1.3, 0];
  } else if (id === "nature-jellyfish") {
    if (v < 0.45) p = [0.65 * sphere[0], 0.55 + 0.52 * Math.abs(sphere[1]), 0.65 * sphere[2]];
    else { const t = u * TAU * 7, h = v; p = [0.48 * Math.cos(t) * (1 - h), 0.45 - h * 1.7, 0.48 * Math.sin(t) * (1 - h)]; }
  } else if (id === "nature-seahorse" || id === "nature-dragon") {
    p = line(id === "nature-seahorse" ? [[0, -0.8, 0], [0.28, -0.45, 0], [0.2, 0.15, 0], [-0.1, 0.55, 0], [-0.55, 0.72, 0]] : [[-0.8, -0.2, 0], [-0.35, 0.2, 0.1], [0.1, -0.15, 0], [0.45, 0.35, 0], [0.8, 0.5, 0]]);
    if (id === "nature-dragon" && i % 4 === 0) p = bodyParts([[[-0.1, 0, 0], [-0.75, 0.65, 0], 0.08], [[0.1, 0, 0], [0.75, 0.65, 0], 0.08]]);
    p = [p[0] + noise() * 0.08, p[1] + noise() * 0.08, p[2] + noise() * 0.08];
  } else if (id === "math-mobius-strip" || id === "math-mobius-torus") {
    const t = u * TAU, w = (v - 0.5) * (id === "math-mobius-strip" ? 0.85 : 0.42), r = id === "math-mobius-strip" ? 0.8 : 0.75;
    p = [(r + w * Math.cos(t / 2)) * Math.cos(t), w * Math.sin(t / 2) + (id === "math-mobius-torus" ? 0.22 * Math.sin(3 * t) : 0), (r + w * Math.cos(t / 2)) * Math.sin(t)];
  } else if (id === "math-gyroid") {
    const k = 1.7 + detail * 2.2, x = sphere[0] * 1.45, y = sphere[1] * 1.45, z = sphere[2] * 1.45;
    const val = Math.sin(k * x) * Math.cos(k * y) + Math.sin(k * y) * Math.cos(k * z) + Math.sin(k * z) * Math.cos(k * x);
    p = [x, y, z + val * 0.15];
  } else if (id === "math-lorenz-attractor" || id === "math-clifford-attractor") {
    let x = 0.1, y = 0, z = 0;
    const steps = 80 + Math.floor(u * 120);
    for (let j = 0; j < steps; j++) {
      if (id === "math-lorenz-attractor") { const dx = 10 * (y - x) * 0.008, dy = (x * (28 - z) - y) * 0.008, dz = (x * y - 2.667 * z) * 0.008; x += dx; y += dy; z += dz; }
      else { const nx = Math.sin(1.7 * y) + 0.25 * Math.cos(1.7 * x), ny = Math.sin(1.7 * x) - 0.25 * Math.cos(1.7 * y); x = nx; y = ny; z = Math.sin(x * 1.3 + y * 1.1); }
    }
    p = [x * 0.055, id === "math-lorenz-attractor" ? (z - 25) * 0.055 : y * 0.65, id === "math-lorenz-attractor" ? z * 0.055 : z * 0.65];
  } else if (id === "math-fibonacci-spiral") {
    const t = u * 18 * Math.PI, r = 0.08 + 0.075 * t; p = [r * Math.cos(t), (v - 0.5) * 0.18, r * Math.sin(t)];
  } else if (id === "math-spherical-harmonics" || id === "math-mandelbulb") {
    const wave = Math.sin(4 * a) * Math.sin(3 * b);
    const r = id === "math-mandelbulb" ? 0.82 + 0.24 * Math.sin(5 * a + 3 * b) * Math.sin(4 * b) : 0.9 + 0.46 * wave;
    p = sphere.map((x) => x * r) as Point;
  } else if (id === "math-klein-bottle") {
    const t = u * TAU, q = v * TAU, r = 2.1 * (1 - Math.cos(t) / 2);
    p = [0.18 * (1 + Math.sin(t)) * Math.cos(q), 0.18 * (Math.cos(t) + 1) * Math.sin(q) + 0.22 * Math.cos(t) - 0.35, 0.18 * r * Math.sin(q)];
  } else if (id === "form-human-face") {
    if (u < 0.68) {
      const taper = sphere[1] < -0.15 ? 0.78 + (sphere[1] + 1) * 0.38 : 1;
      p = [sphere[0] * 0.63 * taper, sphere[1] * 0.76 + 0.05, sphere[2] * 0.43];
      if (p[2] > 0 && Math.abs(p[0]) > 0.15 && Math.abs(p[0]) < 0.43 && p[1] > 0.12 && p[1] < 0.31) p[2] *= 0.7;
      color = 0.2 + 0.18 * (p[1] + 0.7);
    } else if (u < 0.77) {
      p = capsule([0, 0.27, 0.34], [0, -0.28, 0.48], 0.065);
      p[0] *= 0.72; color = 0.58;
    } else if (u < 0.87) {
      const side = i % 2 ? -1 : 1;
      const eye: Point = [side * 0.205, 0.17, 0.31];
      p = [eye[0] + sphere[0] * 0.095, eye[1] + sphere[1] * 0.052, eye[2] + Math.max(0, sphere[2]) * 0.075];
      color = 0.9; size = 1.1;
    } else if (u < 0.92) {
      const side = i % 2 ? -1 : 1;
      p = capsule([side * 0.1, 0.27, 0.32], [side * 0.31, 0.25, 0.28], 0.035);
      color = 0.45;
    } else if (u < 0.97) {
      const x = (v - 0.5) * 0.34;
      p = [x, -0.25 - 0.035 * (1 - Math.abs(x) / 0.17), 0.355 + (1 - Math.abs(x) / 0.17) * 0.055 + noise() * 0.012];
      color = 0.75;
    } else {
      const side = i % 2 ? -1 : 1;
      p = [side * (0.55 + Math.abs(sphere[0]) * 0.06), sphere[1] * 0.16 + 0.02, sphere[2] * 0.11];
      color = 0.28;
    }
  } else if (id === "nature-skull" || id === "form-wolf" || id === "form-lion") {
    p = [sphere[0] * (id === "form-lion" ? 0.92 : 0.68), sphere[1] * 0.86, sphere[2] * 0.48];
    if (id === "nature-skull") p[1] -= Math.max(0, -p[1]) * 0.38;
    if (id === "form-lion" && v < 0.34) { const t = a; p = [Math.cos(t) * (0.85 + 0.1 * v), Math.sin(t) * 0.9, noise() * 0.12]; }
    if (id === "nature-skull" && p[2] > 0.2 && Math.abs(p[0]) > 0.2 && Math.abs(p[0]) < 0.47 && p[1] > 0.05 && p[1] < 0.36) p[2] *= 0.45;
    if (id === "form-wolf" && i % 5 === 0) p = [Math.sign(p[0]) * (0.38 + v * 0.12), 0.7 + v * 0.38, p[2] * 0.4];
  } else if (id === "form-human-body" || id === "form-human-hand") {
    if (id === "form-human-hand") {
      const part = Math.floor(v * 6), x = [-0.28, -0.1, 0.08, 0.26, -0.48, 0][part], y = [0.72, 0.82, 0.78, 0.65, 0.38, 0.15][part];
      const start: Point = part === 0 ? [-0.22, 0.12, 0] : part === 1 ? [-0.08, 0.16, 0] : part === 2 ? [0.08, 0.15, 0] : part === 3 ? [0.21, 0.12, 0] : part === 4 ? [-0.19, -0.02, 0] : [-0.24, -0.08, 0];
      p = capsule(start, [x, y, 0], part === 5 ? 0.16 : 0.055);
    } else if (u < 0.23) {
      p = [sphere[0] * 0.19, 0.88 + sphere[1] * 0.23, sphere[2] * 0.18];
    } else if (u < 0.52) {
      const y = mix(0.64, -0.26, v), width = y < 0.02 ? 0.21 : 0.31;
      const angle = rng.next() * TAU, r = Math.sqrt(rng.next());
      p = [Math.cos(angle) * width * r, y, Math.sin(angle) * (y < 0.02 ? 0.18 : 0.21) * r];
    } else if (u < 0.66) {
      const side = v < 0.5 ? -1 : 1;
      p = capsule([side * 0.27, 0.47, 0], [side * 0.49, -0.12, 0], 0.105);
    } else if (u < 0.78) {
      const side = v < 0.5 ? -1 : 1;
      p = capsule([side * 0.49, -0.12, 0], [side * 0.46, -0.67, 0.01], 0.075);
    } else if (u < 0.9) {
      const side = v < 0.5 ? -1 : 1;
      p = capsule([side * 0.14, -0.26, 0], [side * 0.17, -0.75, 0], 0.13);
    } else {
      const side = v < 0.5 ? -1 : 1;
      p = capsule([side * 0.17, -0.72, 0], [side * 0.18, -1.2, 0], 0.085);
      if (u > 0.96) p[1] = -1.24 + noise() * 0.025;
    }
    color = clamp(0.25 + (p[1] + 1.2) * 0.25, 0.1, 0.75);
  } else if (id === "form-crystal-cluster") {
    const c = rng.int(7), centers: Point[] = [[0, 0, 0], [0.48, 0, 0.1], [-0.42, 0.08, 0], [0.15, 0.1, 0.44], [-0.15, -0.06, -0.44], [0.08, 0.22, -0.1], [-0.08, -0.18, 0.2]], h = 0.45 + rng.next() * 0.7, q = Math.abs(cs);
    p = [centers[c][0] + sphere[0] * (0.12 + (1 - q) * 0.18), centers[c][1] + (v < 0.7 ? (u - 0.5) * h : Math.sign(cs) * h * 0.5), centers[c][2] + sphere[2] * (0.12 + (1 - q) * 0.18)];
  } else if (id === "nature-brain") {
    p = [Math.sign(sphere[0]) * (0.12 + Math.abs(sphere[0]) * 0.8), sphere[1] * 0.62 + 0.08 * Math.sin(a * 9), sphere[2] * 0.48 + 0.04 * Math.sin(b * 11)];
  } else if (id === "nature-tree") {
    if (v < 0.32) p = line([[0, -1.1, 0], [0.05, -0.35, 0], [0, 0.2, 0], [-0.35, 0.65, 0], [-0.6, 1, 0], [0.35, 0.65, 0], [0.6, 1, 0]]);
    else p = [sphere[0] * (0.75 + v * 0.4), 0.55 + Math.abs(sphere[1]) * 0.7, sphere[2] * (0.75 + v * 0.4)];
  } else {
    p = [sphere[0], sphere[1], sphere[2]];
  }
  if (id === "nature-butterfly") { p[2] += noise() * 0.03; }
  if (id === "math-fibonacci-spiral") color = u;
  if (id.startsWith("form-") || id.startsWith("nature-")) { p = [p[0] + noise() * 0.018, p[1] + noise() * 0.018, p[2] + noise() * 0.018]; }
  p = p.map((x) => clamp(x, -2.5, 2.5)) as Point;
  return { p, color, size, alpha };
}

const SHAPE_PRESETS: GeneratorDef[] = PRESETS.map((preset) => ({
  id: preset.id,
  name: preset.name,
  tag: preset.group,
  method: "Seeded analytic 3D particle formation",
  description: preset.description,
  params: [range("detail", "Detail", 0, 1, 0.01, 0.55, "Controls the density and fine variation of this formation.")],
  recipe: {
    count: preset.id === "form-human-body" ? 64000 : preset.id === "form-human-face" ? 52000 : 60000,
    look: {
      size: preset.id === "form-human-face" ? 0.007 : 0.008,
      glow: preset.id === "space-black-hole" ? 0.95 : 0.55,
      edgeBrightness: 0.7,
      ...(preset.id === "space-black-hole" ? { background: "#010208", palette: [{ t: 0, color: "#40205d" }, { t: 0.3, color: "#ff3b18" }, { t: 0.63, color: "#ff9c32" }, { t: 0.84, color: "#fff2bc" }, { t: 1, color: "#68dfff" }] } : {}),
      ...(preset.id === "form-human-face" || preset.id === "form-human-body" ? { palette: [{ t: 0, color: "#56344f" }, { t: 0.45, color: "#e5a078" }, { t: 0.75, color: "#ffd1a6" }, { t: 1, color: "#fff0d6" }] } : {}),
    },
    behaviors: [{ type: "home", intensity: 62 }, { type: "drag", intensity: 1.1 }],
    camera: { distance: preset.id === "form-human-body" ? 4.8 : preset.id === "form-human-face" ? 3.5 : 4, yaw: preset.id === "form-human-face" || preset.id === "form-human-body" ? 0 : 0.45, pitch: preset.id === "form-human-face" ? 0.04 : 0.22, autoRotate: 0.1 },
  },
  generate(ctx, f) {
    const detail = typeof ctx.params.detail === "number" ? ctx.params.detail : 0.55;
    for (let i = 0; i < f.n; i++) {
      const { p, color, size, alpha } = createPoint(preset.id, i, f.n, ctx.rng, detail);
      const normal = unit(p);
      put(f, i, p[0], p[1], p[2], color, size, alpha, 1, normal[0], normal[1], normal[2]);
    }
  },
}));

export const TEXT_SHAPE: GeneratorDef = {
  id: "text3d",
  name: "3D Text",
  tag: "Text",
  method: "Rasterized text mask + volumetric extrusion",
  description: "A volumetric, editable 3D text formation. Change its text in the Text panel.",
  params: [
    { key: "text", label: "Text", type: "text", def: "PARTICLE", hint: "Up to 48 characters." },
    range("textScale", "Text size", 0.3, 1.5, 0.01, 0.9),
    range("depth", "Extrusion depth", 0, 0.5, 0.01, 0.12),
  ],
  recipe: { count: 24000, look: { size: 0.009, glow: 0.5 }, behaviors: [{ type: "home", intensity: 70 }, { type: "drag", intensity: 1 }] },
  generate(ctx, f) {
    const text = typeof ctx.params.text === "string" ? ctx.params.text.trim().slice(0, 48) : "";
    const mask = text && ctx.text ? ctx.text(text) : null;
    if (!mask || !mask.pts.length) {
      for (let i = 0; i < f.n; i++) put(f, i, 0, 0, 0, i / Math.max(1, f.n - 1), 1, 0, 0);
      return;
    }
    const k = (1.45 * (typeof ctx.params.textScale === "number" ? ctx.params.textScale : 0.9)) / Math.max(mask.w, 420);
    const depth = typeof ctx.params.depth === "number" ? ctx.params.depth : 0.12;
    const count = mask.pts.length / 2;
    for (let i = 0; i < f.n; i++) {
      const q = ctx.rng.int(count) * 2, x = (mask.pts[q] - mask.w / 2) * k, y = -(mask.pts[q + 1] - mask.h / 2) * k;
      const z = (ctx.rng.next() - 0.5) * depth;
      put(f, i, x, y, z, i / Math.max(1, f.n - 1), 0.9, 0.92, 0.08, 0, 0, ctx.rng.next() < 0.5 ? -1 : 1);
    }
  },
};

export const SHAPES5: GeneratorDef[] = [...SHAPE_PRESETS, TEXT_SHAPE];
