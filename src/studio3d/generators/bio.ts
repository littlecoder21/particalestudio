import { defineShape, type V3 } from "./sculpt";
import { TAU, quad, triSurf, tubeSurf } from "./objkit";
import { unitRand, clamp, cyl, balls, frame, fbm, vnoise, type Ball } from "./spacekit";

const NAT = "Nature & organic objects", CPX = "Complex 3D particle formations";
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/* ───────────── B-DNA double helix (ribbon + rungs) ───────────── */
export const dna = defineShape({
  id: "nature-dna", name: "DNA Double Helix", tag: NAT,
  description: "A right-handed B-DNA double helix: two sugar-phosphate backbone ribbons with phosphate and sugar beads, offset by about 126° so the wide major and narrow minor grooves show, joined by base-pair rungs coloured by nucleotide (A–T, G–C), each split in the purine-longer proportion with hydrogen-bond dots between.",
  palette: [[0, "#0a1020"], [0.15, "#2a6aff"], [0.3, "#2ad88a"], [0.45, "#ffd23a"], [0.6, "#ff4a4a"], [0.8, "#cfd8e8"], [1, "#ffffff"]],
  count: 120000, size: 0.0042, fit: 1.5, camera: { distance: 7.5, yaw: 0.5, pitch: 0.05, autoRotate: 0.14 },
  build(sc) {
    const N = 34, R = 0.5, rise = 0.12, per = 10, off = 2.2, rng = sc.rng;
    const th = (i: number) => (i / per) * TAU;
    const pA = (i: number): V3 => [R * Math.cos(th(i)), i * rise, R * Math.sin(th(i))];
    const pB = (i: number): V3 => [R * Math.cos(th(i) + off), i * rise, R * Math.sin(th(i) + off)];
    for (const P of [pA, pB]) sc.sheet(tubeSurf(P, 0.06, 0, N - 1), { dens: 2.4, thick: 0.003, c: (u) => 0.78 + 0.05 * Math.sin(u * 20) });
    const beads: Ball[] = [];
    for (let i = 0; i < N; i++) for (const P of [pA, pB]) { beads.push({ c: P(i), r: 0.1, t: 0.97 }); beads.push({ c: P(i + 0.5), r: 0.07, t: 0.66 }); }
    balls(sc, beads, 2.2);
    const code = { A: 0.6, T: 0.15, G: 0.45, C: 0.3 }, dots: Ball[] = [];
    for (let i = 0; i < N; i++) {
      const q = rng.int(4), [a, b] = (["AT", "TA", "GC", "CG"][q].split("") as Array<keyof typeof code>), pur = (x: string) => x === "A" || x === "G";
      const A = pA(i), B = pB(i), f = pur(a) ? 0.58 : 0.42, S = mix(A, B, f);
      sc.sheet(cyl(A, S, pur(a) ? 0.058 : 0.044), { dens: 3, thick: 0.002, c: code[a] });
      sc.sheet(cyl(S, B, pur(b) ? 0.058 : 0.044), { dens: 3, thick: 0.002, c: code[b] });
      const bonds = a === "A" || a === "T" ? 2 : 3, d = norm(sub(B, A));
      for (let k = 0; k < bonds; k++) dots.push({ c: add(S, [0, 1, 0], (k - (bonds - 1) / 2) * 0.05 + 0 * d[0]), r: 0.014, t: 0.95 });
    }
    balls(sc, dots, 3.5);
  },
});

/* ───────────── Ball-and-stick DNA molecule ───────────── */
export const dnaMolecule = defineShape({
  id: "form-dna-molecule", name: "DNA Molecular Structure", tag: CPX,
  description: "An atomic ball-and-stick model of B-DNA: gold phosphorus with red oxygens along the two backbones, pentagonal deoxyribose rings, hexagonal pyrimidine and fused purine base rings with blue nitrogens and red carbonyl oxygens, and dotted hydrogen bonds bridging each pair.",
  palette: [[0, "#0a0f1a"], [0.15, "#9aa4b4"], [0.3, "#3a6aff"], [0.45, "#ff4a3a"], [0.6, "#ffc83a"], [0.8, "#e8f0ff"], [1, "#ffffff"]],
  count: 130000, size: 0.0042, fit: 1.5, camera: { distance: 7.6, yaw: 0.5, pitch: 0.08, autoRotate: 0.12 },
  build(sc) {
    const N = 22, R = 0.95, rise = 0.2, per = 10, off = 2.2, rng = sc.rng, C = 0.15, Nn = 0.3, O = 0.45, Pp = 0.6;
    const atoms: Ball[] = [], bonds: V3[][] = [], hb: Ball[] = [], ey: V3 = [0, 1, 0];
    const th = (i: number, s: number) => (i / per) * TAU + (s ? off : 0);
    const er = (a: number): V3 => [Math.cos(a), 0, Math.sin(a)], et = (a: number): V3 => [-Math.sin(a), 0, Math.cos(a)];
    const atom = (c: V3, r: number, t: number) => { atoms.push({ c, r, t }); return c; };
    const Ps: V3[][] = [[], []];
    for (let s = 0; s < 2; s++) for (let i = 0; i <= N; i++) {
      const a = th(i, s), e = er(a), t = et(a), P = add(add([0, 0, 0], e, R), ey, i * rise - 0.5 * rise);
      atom(P, 0.085, Pp); atom(add(add(P, e, 0.12), t, 0.08), 0.048, O); atom(add(add(P, e, 0.12), t, -0.08), 0.048, O);
      bonds.push([P, add(add(P, e, 0.12), t, 0.08)], [P, add(add(P, e, 0.12), t, -0.08)]); Ps[s].push(P);
    }
    const base: Array<Array<{ pur: boolean; ring: V3[] }>> = [[], []], types: string[] = [];
    for (let i = 0; i < N; i++) types.push(["AT", "TA", "GC", "CG"][rng.int(4)]);
    for (let s = 0; s < 2; s++) for (let i = 0; i < N; i++) {
      const a = th(i, s), e = er(a), t = et(a), Sc = add(add([0, 0, 0], e, R - 0.17), ey, i * rise), sug: V3[] = [];
      for (let k = 0; k < 5; k++) { const ph = (k * TAU) / 5 + 0.3; sug.push(atom(add(add(Sc, ey, 0.085 * Math.cos(ph)), t, 0.085 * Math.sin(ph)), 0.048, k === 0 ? O : C)); }
      bonds.push([...sug, sug[0]], [Ps[s][i], sug[3]], [sug[1], Ps[s][i + 1]]);
      const nt = types[i][s], pur = nt === "A" || nt === "G", other = th(i, 1 - s), A = add(add([0, 0, 0], e, R), ey, i * rise), B = add(add([0, 0, 0], er(other), R), ey, i * rise);
      const c = norm(sub(B, A)), p: V3 = [-c[2], 0, c[0]], cen = mix(A, B, 0.3), rho = 0.17, ring: V3[] = [];
      for (let k = 0; k < 6; k++) { const ph = (k * TAU) / 6; ring.push(add(add(cen, c, rho * Math.cos(ph)), p, rho * Math.sin(ph))); }
      ring.forEach((q, k) => atom(q, 0.05, k === 0 || k === 2 ? Nn : C));
      bonds.push([...ring, ring[0]], [sug[4], ring[3]]);
      const ex = add(ring[1], norm(sub(ring[1], cen)), 0.1); atom(ex, 0.044, nt === "A" ? Nn : O); bonds.push([ring[1], ex]);
      if (pur) { const M = mix(ring[4], ring[5], 0.5), u = norm(sub(M, cen)), e5 = norm(sub(ring[4], ring[5])), n1 = add(add(ring[4], u, 0.15), e5, 0.04), n2 = add(M, u, 0.24), n3 = add(add(ring[5], u, 0.15), e5, -0.04); atom(n1, 0.05, Nn); atom(n2, 0.05, C); atom(n3, 0.05, Nn); bonds.push([ring[4], n1, n2, n3, ring[5]]); }
      base[s].push({ pur, ring });
    }
    for (let i = 0; i < N; i++) {
      const a = base[0][i].ring, b = base[1][i].ring, pairs = types[i] === "AT" || types[i] === "TA" ? [[0, 0], [1, 5]] : [[0, 0], [1, 5], [5, 1]];
      for (const [x, y] of pairs) for (let k = 1; k <= 5; k++) hb.push({ c: mix(a[x], b[y], k / 6), r: 0.013, t: 0.85 });
    }
    balls(sc, atoms, 2.4);
    balls(sc, hb, 10);
    sc.strands(bonds, { r: 0.012, dens: 0.45, c0: 0.12, c1: 0.12, al: 0.9 });
  },
});

/* ───────────── Amethyst crystal cluster ───────────── */
export const crystalCluster = defineShape({
  id: "form-crystal-cluster", name: "Crystal Cluster", tag: CPX,
  description: "An amethyst quartz cluster: dozens of true hexagonal prisms with six-faced pyramidal terminations radiating from a rough matrix rock, taller at the centre, banded from deep violet at the base to pale glassy tips, with growth striations, bright edges and a druse of tiny points.",
  palette: [[0, "#14100e"], [0.15, "#3a2e28"], [0.3, "#4a1a7a"], [0.5, "#9a4ae0"], [0.7, "#d8a8ff"], [0.9, "#f4e6ff"], [1, "#ffffff"]],
  count: 130000, size: 0.0046, fit: 1.5, camera: { distance: 6.4, yaw: 0.5, pitch: 0.28, autoRotate: 0.1 },
  build(sc) {
    const rng = sc.rng, rx = 1.35, ry = 0.5, rz = 1.15, cy = -0.35;
    const matrix = sc.solid(0.12);
    matrix.ell([0, cy, 0], [rx, ry, rz], { c: 0.08, dens: 1.1 });
    matrix.ell([0.7, cy + 0.1, 0.4], [0.5, 0.32, 0.45], { c: 0.1, dens: 1.1 });
    matrix.ell([-0.6, cy + 0.05, -0.5], [0.55, 0.3, 0.45], { c: 0.1, dens: 1.1 });
    matrix.disp = (x, y, z) => 0.1 * (fbm(x * 2.5, y * 2.5, z * 2.5) - 0.5) + 0.02 * (vnoise(x * 14, y * 14, z * 14) - 0.5);
    matrix.shade = (x, y, z) => clamp(0.07 + 0.13 * fbm(x * 4, y * 4, z * 4) + 0.04 * (vnoise(x * 20, y * 20, z * 20) - 0.5), 0, 0.3);
    const crystal = (b: V3, ax: V3, h: number, r: number, ph: number, base: number, top: number) => {
      const [e1, e2] = frame(ax), V = (k: number, z: number): V3 => { const a = ph + (k * TAU) / 6; return add(add(add(b, ax, z), e1, r * Math.cos(a)), e2, r * Math.sin(a)); };
      const apex = add(add(b, ax, h + r * 1.15), e1, r * 0.12);
      for (let k = 0; k < 6; k++) {
        sc.sheet(quad(V(k, -0.05), V(k + 1, -0.05), V(k + 1, h), V(k, h)), { dens: 1.1, thick: 0.002, c: (_u, v) => clamp(base + (top - base) * Math.pow(v, 1.3) + 0.03 * Math.sin(v * h * 70 + k), 0, 1), al: 0.62 });
        sc.sheet(triSurf(apex, V(k, h), V(k + 1, h)), { dens: 1.6, thick: 0.002, c: (u) => clamp(top + 0.18 * (1 - u) + (k % 2 ? 0.04 : 0), 0, 1), al: 0.85 });
      }
      const edges: V3[][] = []; for (let k = 0; k < 6; k++) edges.push([V(k, 0), V(k, h), apex]);
      const ring = (z: number) => [0, 1, 2, 3, 4, 5, 6].map((k) => V(k, z));
      sc.strands(edges, { r: 0.0045, dens: 0.55, c0: base + 0.1, c1: 0.98, al: 0.9 });
      const rings: V3[][] = [ring(h)]; for (let j = 1; j < 8; j++) rings.push(ring((h * j) / 8));
      sc.strands(rings, { r: 0.003, dens: 0.1, c0: top - 0.05, c1: top - 0.05, al: 0.6 });
    };
    const list: Array<{ rho: number; az: number }> = [];
    for (let i = 0; i < 30; i++) list.push({ rho: Math.sqrt((i + 0.5) / 30) * 0.95, az: i * 2.399963 });
    for (let i = 0; i < 12; i++) list.push({ rho: 1.0 + 0.04 * rng.next(), az: i * 0.52 + 0.2 });
    list.forEach(({ rho, az }, idx) => {
      const x = rho * rx * Math.cos(az), z = rho * rz * Math.sin(az), s2 = 1 - (x / rx) ** 2 - (z / rz) ** 2, y = cy + ry * Math.sqrt(Math.max(0.02, s2));
      const n = norm([x / (rx * rx), (y - cy) / (ry * ry), z / (rz * rz)]), jit = unitRand(rng), ax = norm(add(add(add([0, 0, 0], n, 0.75), [0, 1, 0], 0.5), jit, 0.3));
      const outer = idx >= 30, hh = outer ? 0.2 + 0.2 * rng.next() : (0.35 + 1.45 * Math.pow(1 - rho / 0.95, 1.2)) * (0.7 + 0.6 * rng.next()), rr = outer ? 0.045 + 0.02 * rng.next() : 0.06 + 0.09 * clamp(hh / 1.7, 0, 1) * (0.7 + 0.5 * rng.next());
      crystal([x, y - 0.08, z], ax, hh, rr, rng.next() * TAU, 0.28 + 0.22 * rng.next(), 0.66 + 0.26 * rng.next());
    });
    const druse = sc.solid(0.008);
    for (let i = 0; i < 70; i++) {
      const az = rng.next() * TAU, rho = 0.45 + 0.85 * rng.next(), x = rho * rx * Math.cos(az), z = rho * rz * Math.sin(az), s2 = 1 - (x / rx) ** 2 - (z / rz) ** 2;
      if (s2 < 0.02) continue;
      const y = cy + ry * Math.sqrt(s2), n = norm([x / (rx * rx), (y - cy) / (ry * ry), z / (rz * rz)]), p0: V3 = [x, y - 0.02, z];
      druse.cone(p0, add(p0, n, 0.1 + 0.08 * rng.next()), 0.028, 0.003, { c: 0.5 + 0.3 * rng.next(), dens: 2.4 });
    }
  },
});

export const BIO_SHAPES = [dna, dnaMolecule, crystalCluster];
