import type { GeneratorDef } from "../types";
import type { ParamSurface } from "../sampling";
import { vnoise } from "../math";
import { defineShape, norm3, cross3, type Scene, type V3 } from "./sculpt";
import { TAU, triSurf, centroid, scale3, dist3, torus, tubeSurf, isoU, isoV, curveLine, quad, lerp3, clamp01 } from "./objkit";

export const GEO = "Geometric solids";
const PHI = (1 + Math.sqrt(5)) / 2;

/* ───────── polyhedron toolkit ───────── */
export interface Poly { V: V3[]; F: number[][] }
export function icoVerts(): V3[] {
  const raw: V3[] = []; for (const a of [-1, 1]) for (const b of [-PHI, PHI]) raw.push([0, a, b], [a, b, 0], [b, 0, a]);
  return raw.map((p) => norm3(p));
}
export function icosahedron(): Poly {
  const V = icoVerts(), e = dist3(V[0], nearest(V, 0)), F: number[][] = [];
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) for (let k = j + 1; k < V.length; k++) if (Math.abs(dist3(V[i], V[j]) - e) < 1e-3 && Math.abs(dist3(V[j], V[k]) - e) < 1e-3 && Math.abs(dist3(V[i], V[k]) - e) < 1e-3) F.push([i, j, k]);
  return { V, F };
}
function nearest(V: V3[], i: number): V3 { let b = 1e9, bi = 0; V.forEach((p, j) => { if (j !== i) { const d = dist3(p, V[i]); if (d < b) { b = d; bi = j; } } }); return V[bi]; }
export function dual(P: Poly): Poly {
  const cen = P.F.map((f) => norm3(centroid(f.map((i) => P.V[i])))), F: number[][] = [];
  P.V.forEach((v, i) => {
    const inc = P.F.map((f, fi) => (f.includes(i) ? fi : -1)).filter((x) => x >= 0), n = norm3(v);
    const e1 = norm3(cross3(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = cross3(n, e1);
    inc.sort((a, b) => Math.atan2(cen[a][0] * e2[0] + cen[a][1] * e2[1] + cen[a][2] * e2[2], cen[a][0] * e1[0] + cen[a][1] * e1[1] + cen[a][2] * e1[2]) - Math.atan2(cen[b][0] * e2[0] + cen[b][1] * e2[1] + cen[b][2] * e2[2], cen[b][0] * e1[0] + cen[b][1] * e1[1] + cen[b][2] * e1[2]));
    F.push(inc);
  });
  return { V: cen, F };
}
export const edgesOf = (P: Poly): Array<[number, number]> => { const s = new Set<string>(), out: Array<[number, number]> = []; for (const f of P.F) for (let k = 0; k < f.length; k++) { const a = f[k], b = f[(k + 1) % f.length], key = a < b ? `${a}-${b}` : `${b}-${a}`; if (!s.has(key)) { s.add(key); out.push([a, b]); } } return out; };
interface DrawOpts { c: (x: number, y: number, z: number) => number; dens: number; edge: number; edgeDens: number; edgeR?: number; node: number; nodeR: number; al?: number }
function drawPoly(sc: Scene, P: Poly, k: number, o: DrawOpts) {
  const V = P.V.map((p) => scale3(p, k));
  for (const f of P.F) { const cen = centroid(f.map((i) => V[i])); for (let j = 0; j < f.length; j++) sc.sheet(triSurf(cen, V[f[j]], V[f[(j + 1) % f.length]]), { dens: o.dens, thick: 0.004, c: (_u, _v, x, y, z) => o.c(x, y, z), al: o.al }); }
  sc.strands(edgesOf(P).map(([a, b]) => [V[a], V[b]]), { r: o.edgeR ?? 0.012, dens: o.edgeDens, c0: o.edge, c1: o.edge, al: o.al });
  const nd = sc.solid(0.01); V.forEach((p) => nd.sph(p, o.nodeR, { c: o.node, k: 0.01, sz: 1.1 }));
}
function platonic(id: "geo-icosahedron" | "geo-dodecahedron" | "geo-octahedron" | "geo-tetrahedron", name: string, description: string, palette: Array<[number, string]>, outer: () => { P: Poly; inner: Poly; k: number; ki: number }): GeneratorDef {
  return defineShape({
    id, name, tag: GEO, description, palette, count: 90000, size: 0.0058, fit: 1.45, heavy: false, camera: { distance: 4.6, yaw: 0.6, pitch: 0.3, autoRotate: 0.14 },
    build(sc) {
      const { P, inner, k, ki } = outer();
      drawPoly(sc, P, k, { c: (x, y, z) => 0.22 + 0.34 * clamp01((y / k + 1) / 2) + 0.18 * (0.5 + 0.5 * Math.sin(x * 3.2 + z * 2.1)) * 0.6, dens: 1.2, edge: 0.92, edgeDens: 2.2, node: 1.0, nodeR: 0.055 * k, al: 0.95 });
      drawPoly(sc, inner, ki, { c: (_x, y) => 0.45 + 0.25 * y, dens: 0.45, edge: 0.66, edgeDens: 1.2, edgeR: 0.008, node: 0.8, nodeR: 0.03 * k, al: 0.8 });
    },
  });
}
const octa = (): Poly => { const V: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], F: number[][] = []; for (const x of [0, 1]) for (const y of [2, 3]) for (const z of [4, 5]) F.push([x, y, z]); return { V, F }; };
const tetra = (): Poly => ({ V: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((p) => norm3(p as V3)), F: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]] });

export const icosahedron20 = platonic("geo-icosahedron", "Icosahedron", "A regular icosahedron: twenty equilateral faces and twelve vertices, with its dual dodecahedron nested inside as a glowing cage.",
  [[0, "#031018"], [0.2, "#0b4a6e"], [0.4, "#14a6b8"], [0.6, "#6ee7d0"], [0.8, "#d6fff0"], [1, "#ffffff"]], () => { const P = icosahedron(); return { P, inner: dual(P), k: 1.5, ki: 0.95 }; });
export const dodeca12 = platonic("geo-dodecahedron", "Dodecahedron", "A regular dodecahedron: twelve pentagonal faces and twenty vertices, with its dual icosahedron inscribed within.",
  [[0, "#14031a"], [0.2, "#4a0e6e"], [0.4, "#a02ab8"], [0.6, "#ff6ec7"], [0.8, "#ffd0ee"], [1, "#ffffff"]], () => { const I = icosahedron(), P = dual(I); return { P, inner: I, k: 1.5, ki: 1.05 }; });
export const octa8 = platonic("geo-octahedron", "Octahedron", "A regular octahedron: eight triangular faces meeting at six vertices, with its dual cube inscribed inside.",
  [[0, "#1a0c02"], [0.2, "#6e3a0b"], [0.4, "#c8801c"], [0.6, "#ffc04a"], [0.8, "#fff0b0"], [1, "#ffffff"]], () => { const P = octa(), cube: Poly = { V: [], F: [] }; const cv: V3[] = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) cv.push(norm3([x, y, z])); cube.V = cv; const idx = (x: number, y: number, z: number) => (x > 0 ? 4 : 0) + (y > 0 ? 2 : 0) + (z > 0 ? 1 : 0); cube.F = [[idx(-1, -1, -1), idx(-1, -1, 1), idx(-1, 1, 1), idx(-1, 1, -1)], [idx(1, -1, -1), idx(1, 1, -1), idx(1, 1, 1), idx(1, -1, 1)], [idx(-1, -1, -1), idx(1, -1, -1), idx(1, -1, 1), idx(-1, -1, 1)], [idx(-1, 1, -1), idx(-1, 1, 1), idx(1, 1, 1), idx(1, 1, -1)], [idx(-1, -1, -1), idx(-1, 1, -1), idx(1, 1, -1), idx(1, -1, -1)], [idx(-1, -1, 1), idx(1, -1, 1), idx(1, 1, 1), idx(-1, 1, 1)]]; return { P, inner: cube, k: 1.6, ki: 0.92 }; });
export const tetra4 = platonic("geo-tetrahedron", "Tetrahedron", "A regular tetrahedron: four equilateral faces and four vertices, with an inverted dual tetrahedron forming a stella octangula.",
  [[0, "#021208"], [0.2, "#0a5a2a"], [0.4, "#16b45a"], [0.6, "#6aff9a"], [0.8, "#d8ffe4"], [1, "#ffffff"]], () => { const P = tetra(); return { P, inner: { V: P.V.map((p) => scale3(p, -1)), F: P.F }, k: 1.5, ki: 1.5 }; });

/* ───────────── Geodesic sphere ───────────── */
export const geoSphere = defineShape({
  id: "geo-sphere", name: "Geodesic Sphere", tag: GEO,
  description: "A frequency-2 geodesic sphere: a smooth glowing shell crossed by the 320 triangular struts of a subdivided icosahedron, with a node at every one of its 162 vertices.",
  palette: [[0, "#050818"], [0.2, "#0f3a8a"], [0.4, "#20b4e8"], [0.6, "#7af0d0"], [0.8, "#ffe9a0"], [1, "#ffffff"]],
  count: 100000, size: 0.0056, fit: 1.4, heavy: false, camera: { distance: 4.4, yaw: 0.5, pitch: 0.25, autoRotate: 0.14 },
  build(sc) {
    let V = icoVerts(), F = icosahedron().F; const key = (p: V3) => p.map((x) => x.toFixed(4)).join(",");
    for (let it = 0; it < 2; it++) {
      const mid = new Map<string, number>(), NV = V.slice(), NF: number[][] = [];
      const m = (a: number, b: number) => { const k = a < b ? `${a}-${b}` : `${b}-${a}`; let i = mid.get(k); if (i === undefined) { NV.push(norm3([(V[a][0] + V[b][0]) / 2, (V[a][1] + V[b][1]) / 2, (V[a][2] + V[b][2]) / 2])); i = NV.length - 1; mid.set(k, i); } return i; };
      for (const [a, b, c] of F) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); NF.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
      V = NV; F = NF;
    }
    void key;
    const R = 1.5, edges = edgesOf({ V, F }), seg = (a: V3, b: V3): V3[] => { const l: V3[] = []; for (let i = 0; i <= 5; i++) l.push(scale3(norm3(lerp3(a, b, i / 5)), R)); return l; };
    sc.sheet({ u0: 0, u1: TAU, v0: 0, v1: Math.PI, eval(u, v, o) { o[0] = R * 0.985 * Math.sin(v) * Math.cos(u); o[1] = R * 0.985 * Math.cos(v); o[2] = R * 0.985 * Math.sin(v) * Math.sin(u); } }, { dens: 0.55, thick: 0.004, c: (_u, _v, x, y, z) => 0.18 + 0.3 * (0.5 + 0.5 * y / R) + 0.1 * vnoise(x * 2, y * 2, z * 2), al: 0.85 });
    sc.strands(edges.map(([a, b]) => seg(V[a], V[b])), { r: 0.0075, dens: 2.0, c0: 0.78, c1: 0.78 });
    const nd = sc.solid(0.01); V.forEach((p) => nd.sph(scale3(p, R), 0.03, { c: 1.0, k: 0.01, sz: 1.1 }));
  },
});

/* ───────────── Cube with inscribed sphere ───────────── */
export const geoCube = defineShape({
  id: "geo-cube", name: "Cube", tag: GEO,
  description: "A cube with softly bevelled edges: six panelled faces with inset frames, an inscribed circle on every face touching the edge midpoints, glowing corner nodes and the inscribed sphere floating at the centre.",
  palette: [[0, "#120818"], [0.25, "#5a1a9a"], [0.5, "#e0408a"], [0.75, "#ff9a40"], [1, "#fff0c8"]],
  count: 100000, size: 0.0058, fit: 1.4, heavy: false, camera: { distance: 4.6, yaw: 0.65, pitch: 0.35, autoRotate: 0.14 },
  build(sc) {
    const h = 1.0, C = [-1, 1], faces: Array<{ n: V3; u: V3; v: V3 }> = [{ n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] }, { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }, { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] }];
    const lines: V3[][] = [], rings: V3[][] = [], frames: V3[][] = [];
    faces.forEach((f, fi) => {
      const P = (a: number, b: number): V3 => [f.n[0] * h + f.u[0] * a + f.v[0] * b, f.n[1] * h + f.u[1] * a + f.v[1] * b, f.n[2] * h + f.u[2] * a + f.v[2] * b];
      sc.sheet(quad(P(-h, -h), P(h, -h), P(h, h), P(-h, h)), { dens: 0.8, thick: 0.004, c: (_u, _v, x, y, z) => 0.18 + 0.12 * fi / 5 + 0.25 * (0.5 + 0.5 * (x + y + z) / 3) });
      const ring: V3[] = []; for (let i = 0; i <= 80; i++) { const a = (i / 80) * TAU; ring.push(P(h * 0.92 * Math.cos(a), h * 0.92 * Math.sin(a))); } rings.push(ring);
      frames.push([P(-0.7 * h, -0.7 * h), P(0.7 * h, -0.7 * h), P(0.7 * h, 0.7 * h), P(-0.7 * h, 0.7 * h), P(-0.7 * h, -0.7 * h)]);
      for (let k = -2; k <= 2; k++) { lines.push([P(k * 0.35 * h, -0.7 * h), P(k * 0.35 * h, 0.7 * h)]); lines.push([P(-0.7 * h, k * 0.35 * h), P(0.7 * h, k * 0.35 * h)]); }
    });
    for (const a of C) for (const b of C) { lines.push([[-h, a * h, b * h], [h, a * h, b * h]], [[a * h, -h, b * h], [a * h, h, b * h]], [[a * h, b * h, -h], [a * h, b * h, h]]); }
    sc.strands(lines.slice(-12), { r: 0.014, dens: 2.2, c0: 0.92, c1: 0.92 });
    sc.strands(lines.slice(0, -12), { r: 0.005, dens: 0.55, c0: 0.5, c1: 0.5, al: 0.8 });
    sc.strands(rings, { r: 0.008, dens: 1.1, c0: 0.78, c1: 0.78 }); sc.strands(frames, { r: 0.007, dens: 1.1, c0: 0.62, c1: 0.62 });
    const nd = sc.solid(0.01); for (const x of C) for (const y of C) for (const z of C) nd.sph([x * h, y * h, z * h], 0.07, { c: 1.0, k: 0.01, sz: 1.1 });
    sc.sheet({ u0: 0, u1: TAU, v0: 0, v1: Math.PI, eval(u, v, o) { o[0] = 0.92 * Math.sin(v) * Math.cos(u); o[1] = 0.92 * Math.cos(v); o[2] = 0.92 * Math.sin(v) * Math.sin(u); } }, { dens: 0.55, thick: 0.004, c: (_u, _v, x, y, z) => 0.55 + 0.3 * (0.5 + 0.5 * (x + y * 0.5 - z * 0.7)), al: 0.7 });
  },
});

/* ───────────── Torus ───────────── */
export const geoTorus = defineShape({
  id: "geo-torus", name: "Torus", tag: GEO,
  description: "A perfect torus with a spectral gradient around its ring, a surface mesh of meridian and parallel circles, and a bright core circle running through the tube.",
  palette: [[0, "#ff3a6e"], [0.2, "#ff9a3a"], [0.4, "#f6e84a"], [0.6, "#3ad68a"], [0.8, "#3a8aff"], [1, "#b04aff"]],
  count: 100000, size: 0.0056, fit: 1.4, heavy: false, camera: { distance: 4.6, yaw: 0.4, pitch: 0.55, autoRotate: 0.14 },
  build(sc) {
    const R = 1.3, r = 0.5, T = torus([0, 0, 0], R, r, "y");
    sc.sheet(T, { dens: 0.9, thick: 0.004, c: (u, v) => (u / TAU + 0.04 * Math.sin(v * 3)) % 1 });
    const mer: V3[][] = [], par: V3[][] = [];
    for (let k = 0; k < 48; k++) mer.push(isoU(T, k / 48, 40));
    for (let k = 0; k < 16; k++) par.push(isoV(T, k / 16, 120));
    sc.strands(mer, { r: 0.0048, dens: 0.9, c0: 0.5, c1: 0.5 }); sc.strands(par, { r: 0.0048, dens: 0.9, c0: 0.5, c1: 0.5 });
    const core: V3[] = []; for (let i = 0; i <= 160; i++) { const a = (i / 160) * TAU; core.push([R * Math.cos(a), 0, R * Math.sin(a)]); }
    sc.strands([core], { r: 0.008, dens: 1.2, c0: 0.5, c1: 0.5 });
    void vnoise;
  },
});

/* ───────────── Torus knot ───────────── */
export const geoTorusKnot = defineShape({
  id: "geo-torus-knot", name: "Torus Knot", tag: GEO,
  description: "A (3,5) torus knot: a single closed tube winding three times around the torus axis while looping five times through its hole, with ring bands and a bright core line.",
  palette: [[0, "#0a0f2a"], [0.3, "#1a56d6"], [0.55, "#18d6c4"], [0.8, "#f6f06a"], [1, "#ffffff"]],
  count: 110000, size: 0.0054, fit: 1.45, heavy: false, camera: { distance: 5.0, yaw: 0.5, pitch: 0.4, autoRotate: 0.14 },
  build(sc) {
    const p = 3, q = 5, knot = (t: number): V3 => { const rr = 1.15 + 0.55 * Math.cos(q * t); return [rr * Math.cos(p * t), 0.55 * Math.sin(q * t) * 1.2, rr * Math.sin(p * t)]; };
    const S = tubeSurf(knot, 0.17, 0, TAU);
    sc.sheet(S, { dens: 1.0, thick: 0.003, c: (u, v) => (u / TAU) * 0.85 + 0.1 + 0.06 * Math.sin(v * 2 + u * 20) });
    const rings: V3[][] = []; for (let k = 0; k < 90; k++) rings.push(isoV(S, 0, 1).length ? ((): V3[] => { const t = (k / 90) * TAU, ln: V3[] = [], o: V3 = [0, 0, 0]; for (let i = 0; i <= 20; i++) { S.eval(t, (i / 20) * TAU, o as unknown as Parameters<ParamSurface["eval"]>[2]); ln.push([o[0], o[1], o[2]]); } return ln; })() : []);
    sc.strands(rings, { r: 0.006, dens: 0.9, c0: 0.95, c1: 0.95, al: 0.8 });
    sc.strands([curveLine(knot, 0, TAU, 400)], { r: 0.012, dens: 1.2, c0: 0.95, c1: 0.95, al: 0.7 });
  },
});

/* ───────────── Great pyramid ───────────── */
export const geoPyramid = defineShape({
  id: "geo-pyramid", name: "Pyramid", tag: GEO,
  description: "The Great Pyramid on a windswept desert plateau: four casing faces built from 80 tapering stone courses, a gold-capped apex and two smaller companion pyramids on rippled dunes.",
  palette: [[0, "#2a1a0a"], [0.25, "#8a5a2a"], [0.5, "#d9a45e"], [0.7, "#f0cf8c"], [0.85, "#ffe9b4"], [0.95, "#ffd24a"], [1, "#ffffff"]],
  count: 110000, size: 0.0058, fit: 1.5, heavy: false, camera: { distance: 6.0, yaw: 0.6, pitch: 0.2, autoRotate: 0.1 },
  build(sc) {
    const pyr = (cx: number, cz: number, hw: number, hh: number, seed: number) => {
      const B: V3[] = [[cx - hw, 0, cz - hw], [cx + hw, 0, cz - hw], [cx + hw, 0, cz + hw], [cx - hw, 0, cz + hw]], A: V3 = [cx, hh, cz], lines: V3[][] = [];
      for (let k = 0; k < 4; k++) {
        sc.sheet(triSurf(A, B[k], B[(k + 1) % 4]), { dens: 1.5, thick: 0.004, c: (u, _v, x, y, z) => 0.42 + 0.1 * u + 0.04 * (vnoise(x * 18 + seed, y * 36, z * 18) - 0.5) * 2 + 0.05 * (Math.floor(u * 80) % 2) * 0 + 0.08 * (k % 2) });
        for (let c = 1; c < 80; c++) { const t = c / 80; lines.push([lerp3(A, B[k], t), lerp3(A, B[(k + 1) % 4], t)]); }
      }
      for (let k = 0; k < 4; k++) lines.push([B[k], A]);
      sc.strands(lines.slice(0, lines.length - 4), { r: 0.0032, dens: 0.55, c0: 0.3, c1: 0.3, al: 0.8 }); sc.strands(lines.slice(-4), { r: 0.01, dens: 1.2, c0: 0.8, c1: 0.8 });
      const cap = 0.1 * hh, C0 = lerp3(B[0], A, 1 - cap / hh), C1 = lerp3(B[1], A, 1 - cap / hh), C2 = lerp3(B[2], A, 1 - cap / hh), C3 = lerp3(B[3], A, 1 - cap / hh), CC = [C0, C1, C2, C3];
      for (let k = 0; k < 4; k++) sc.sheet(triSurf(A, CC[k], CC[(k + 1) % 4]), { dens: 3, thick: 0.004, c: 0.96 });
    };
    pyr(0, 0, 1.6, 2.0, 0); pyr(2.9, -1.2, 0.8, 1.0, 5); pyr(2.8, 1.5, 0.5, 0.62, 9);
    box0(sc);
    function box0(s: Scene) {
      const ground: ParamSurface = { u0: -1, u1: 1, v0: -1, v1: 1, eval(u, v, o) { const x = 3.4 * u + 0.6, z = 2.6 * v; o[0] = x; o[1] = -0.01 + 0.05 * Math.sin(x * 2.1 + 3 * Math.sin(z * 0.8)) + 0.03 * Math.sin(z * 3 + x); o[2] = z; } };
      s.sheet(ground, { dens: 0.5, thick: 0.01, c: (_u, _v, x, y, z) => 0.5 + 0.12 * (y + 0.05) * 6 + 0.04 * (vnoise(x * 6, 0, z * 6) - 0.5) });
    }
  },
});

/* ───────────── Helix ───────────── */
export const geoHelix = defineShape({
  id: "geo-helix", name: "Helix", tag: GEO,
  description: "A rising helix of six full turns: a spring-like tube with ring bands, graded through the spectrum from base to tip, wound around a faint cylindrical lattice with terminal beads.",
  palette: [[0, "#ff3a6e"], [0.2, "#ff9a3a"], [0.4, "#f6e84a"], [0.6, "#3ad68a"], [0.8, "#3a8aff"], [1, "#b04aff"]],
  count: 100000, size: 0.0056, fit: 1.5, heavy: false, camera: { distance: 6.2, yaw: 0.4, pitch: 0.12, autoRotate: 0.14 },
  build(sc) {
    const turns = 6, R = 0.9, pitch = 0.62, curve = (t: number): V3 => [R * Math.cos(t), (pitch * t) / TAU, R * Math.sin(t)];
    const S = tubeSurf(curve, 0.11, 0, turns * TAU);
    sc.sheet(S, { dens: 1.0, thick: 0.003, c: (u, v) => (u / (turns * TAU)) * 0.95 + 0.03 * Math.sin(v * 2) });
    const rings: V3[][] = [], o: V3 = [0, 0, 0];
    for (let k = 0; k < 150; k++) { const t = (k / 150) * turns * TAU, ln: V3[] = []; for (let i = 0; i <= 14; i++) { S.eval(t, (i / 14) * TAU, o as unknown as Parameters<ParamSurface["eval"]>[2]); ln.push([o[0], o[1], o[2]]); } rings.push(ln); }
    sc.strands(rings, { r: 0.005, dens: 0.8, c0: 0.5, c1: 0.5, al: 0.7 });
    const guide: V3[][] = []; for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; guide.push([[R * 1.28 * Math.cos(a), -0.1, R * 1.28 * Math.sin(a)], [R * 1.28 * Math.cos(a), turns * pitch + 0.1, R * 1.28 * Math.sin(a)]]); }
    sc.strands(guide, { r: 0.004, dens: 0.4, c0: 0.6, c1: 0.6, al: 0.5 }); sc.strands([[[0, -0.1, 0], [0, turns * pitch + 0.1, 0]]], { r: 0.01, dens: 0.7, c0: 0.6, c1: 0.6, al: 0.6 });
    const b = sc.solid(0.02); b.sph(curve(0), 0.2, { c: 0.02, k: 0.02 }); b.sph(curve(turns * TAU), 0.2, { c: 0.98, k: 0.02 });
    void cross3;
  },
});

export const GEO_SHAPES: GeneratorDef[] = [geoSphere, geoCube, geoTorus, geoTorusKnot, icosahedron20, dodeca12, octa8, tetra4, geoPyramid, geoHelix];
