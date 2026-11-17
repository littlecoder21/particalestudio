import type { GeneratorDef } from "../types";
import type { ParamSurface } from "../sampling";
import { vnoise } from "../math";
import { defineShape, type V3 } from "./sculpt";
import { OBJ, TAU, quad, lathe, torus, circle, disc, box, isoV, isoU, clamp01, addv, lerp3 } from "./objkit";

/* ───────────── Eiffel Tower ───────────── */
export const eiffel = defineShape({
  id: "obj-eiffel-tower", name: "Eiffel Tower", tag: OBJ,
  description: "The wrought-iron tower of Paris: four curved lattice legs joined by the great arches, three platforms, an exponential taper of X-braced lattice and the slender spire with beacon.",
  palette: [[0, "#150d06"], [0.25, "#4e3320"], [0.5, "#8f6238"], [0.75, "#d6a05a"], [0.92, "#ffe0a0"], [1, "#ffffff"]],
  count: 140000, size: 0.0044, fit: 1.55, camera: { distance: 6.6, yaw: 0.65, pitch: 0.08, autoRotate: 0.09 },
  build(sc) {
    const H = 3.3, half = (y: number) => 0.64 * Math.exp(-0.9 * y) - 0.02 * (y / H), sub = (y: number) => 0.07 * Math.exp(-0.55 * y) + 0.008, cen = (y: number) => half(y) - sub(y);
    const buckets: V3[][][] = Array.from({ length: 7 }, () => []);
    const put = (y: number, ...l: V3[][]) => { buckets[Math.min(6, Math.max(0, Math.floor((y / H) * 7)))].push(...l); };
    const SG: Array<[number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const post = (sx: number, sz: number, ox: number, oz: number, y: number): V3 => [sx * cen(y) + ox * sub(y), y, sz * cen(y) + oz * sub(y)];
    const posts: V3[][] = [];
    for (const [sx, sz] of SG) for (const [ox, oz] of SG) { const ln: V3[] = []; for (let i = 0; i <= 64; i++) ln.push(post(sx, sz, ox, oz, (i / 64) * H)); posts.push(ln); }
    // leg lattice: rings and diagonals on each leg
    let y = 0.02;
    while (y < H - 0.08) {
      const d = 0.07 + 0.045 * y, y2 = Math.min(H, y + d);
      for (const [sx, sz] of SG) {
        const c0: V3[] = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([ox, oz]) => post(sx, sz, ox, oz, y)), c1: V3[] = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([ox, oz]) => post(sx, sz, ox, oz, y2));
        put(y, [...c0, c0[0]]);
        for (let k = 0; k < 4; k++) put(y, [c0[k], c1[(k + 1) % 4]], [c0[(k + 1) % 4], c1[k]]);
      }
      y = y2;
    }
    // face lattice between legs (above the first platform)
    const face = (px: number, pz: number, yy: number, s: number): V3 => (px === 0 ? [s * half(yy), yy, pz * half(yy)] : [px * half(yy), yy, s * half(yy)]);
    y = 0.57;
    while (y < 2.76) {
      const y2 = Math.min(2.76, y + Math.max(0.07, 0.5 * half(y)));
      for (const [px, pz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as Array<[number, number]>) {
        const a0 = face(px, pz, y, -1), b0 = face(px, pz, y, 1), a1 = face(px, pz, y2, -1), b1 = face(px, pz, y2, 1);
        put(y, [a0, b0], [a0, b1], [b0, a1]);
      }
      y = y2;
    }
    // arches
    const arch: V3[][] = [];
    for (const [px, pz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as Array<[number, number]>) {
      for (const [A, Bh, off] of [[0.47, 0.4, 0], [0.5, 0.45, 0.05]] as Array<[number, number, number]>) {
        const ln: V3[] = [];
        for (let i = 0; i <= 48; i++) { const t = (i / 48) * Math.PI, s = A * Math.cos(t), yy = Bh * Math.sin(t) + off * 0.2, pl = cen(yy) + off * 0.2; ln.push(px === 0 ? [s, yy, pz * pl] : [px * pl, yy, s]); }
        arch.push(ln);
      }
      for (let i = 1; i < 36; i++) { const t = (i / 36) * Math.PI; const f = (A: number, Bh: number, off: number): V3 => { const s = A * Math.cos(t), yy = Bh * Math.sin(t) + off * 0.2, pl = cen(yy) + off * 0.2; return px === 0 ? [s, yy, pz * pl] : [px * pl, yy, s]; }; arch.push([f(0.47, 0.4, 0), f(0.5, 0.45, 0.05)]); }
      for (let i = 0; i < 10; i++) { const x = -0.42 + i * 0.0933, yy = 0.46 + 0.02, yb = 0.57; arch.push(px === 0 ? [[x, yy, pz * cen(yy)], [x + 0.0467, yb, pz * cen(yb)]] : [[px * cen(yy), yy, x], [px * cen(yb), yb, x + 0.0467]]); }
    }
    // platforms and crown
    const rails: V3[][] = [];
    const platform = (yy: number, h: number, th: number, cc: number) => { box(sc, [0, yy, 0], [h, th, h], { dens: 1.2, thick: 0.003, c: cc }); const r = h + 0.01, ry = yy + th + 0.07; rails.push([[-r, ry, -r], [r, ry, -r], [r, ry, r], [-r, ry, r], [-r, ry, -r]], [[-r, yy + th, -r], [r, yy + th, -r], [r, yy + th, r], [-r, yy + th, r], [-r, yy + th, -r]]); for (let i = 0; i <= 24; i++) { const s = -r + (2 * r * i) / 24; for (const [x, z] of [[s, -r], [s, r], [-r, s], [r, s]] as Array<[number, number]>) rails.push([[x, yy + th, z], [x, ry, z]]); } };
    platform(0.57, 0.43, 0.024, 0.52); platform(1.15, 0.27, 0.018, 0.55); platform(2.76, 0.14, 0.015, 0.6);
    for (const [yy, hh] of [[0.54, 0.42], [1.12, 0.26]] as Array<[number, number]>) put(yy, [[-hh, yy, -hh], [hh, yy, -hh], [hh, yy, hh], [-hh, yy, hh], [-hh, yy, -hh]]);
    // observation cabin and spire
    const cab: V3[][] = [];
    for (const [sx, sz] of SG) cab.push([[sx * 0.1, 2.78, sz * 0.1], [sx * 0.08, 2.98, sz * 0.08]]);
    cab.push([[-0.1, 2.88, -0.1], [0.1, 2.88, -0.1], [0.1, 2.88, 0.1], [-0.1, 2.88, 0.1], [-0.1, 2.88, -0.1]], [[-0.08, 2.98, -0.08], [0.08, 2.98, -0.08], [0.08, 2.98, 0.08], [-0.08, 2.98, 0.08], [-0.08, 2.98, -0.08]]);
    const spire = sc.solid(0.02);
    spire.cone([0, 2.98, 0], [0, 3.48, 0], 0.045, 0.012, { c: 0.7, k: 0.02 }); spire.cone([0, 3.48, 0], [0, 3.72, 0], 0.012, 0.006, { c: 0.8, k: 0.01 }); spire.sph([0, 3.0, 0], 0.09, { c: 0.7, k: 0.04 });
    // ground plaza ring
    const plaza: V3[][] = [circle([0, 0, 0], 1.05, 100, "y"), circle([0, 0, 0], 0.88, 100, "y")];
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + Math.PI / 4; plaza.push([[0.7 * Math.cos(a), 0, 0.7 * Math.sin(a)], [1.05 * Math.cos(a), 0, 1.05 * Math.sin(a)]]); }
    sc.strands(posts, { r: 0.0062, dens: 1.4, c0: 0.3, c1: 0.78, taper: false });
    buckets.forEach((b, i) => { if (b.length) sc.strands(b, { r: 0.0036, dens: 1.1, c0: 0.3 + 0.08 * i, c1: 0.3 + 0.08 * i }); });
    sc.strands(arch, { r: 0.0045, dens: 1.1, c0: 0.4, c1: 0.4 });
    sc.strands(rails, { r: 0.0035, dens: 1, c0: 0.6, c1: 0.6 });
    sc.strands(cab, { r: 0.004, dens: 1, c0: 0.65, c1: 0.65 });
    sc.strands(plaza, { r: 0.008, dens: 0.8, c0: 0.3, c1: 0.3, al: 0.7 });
    sc.points(0.06, (r, o) => { const a = r.next() * TAU, b = Math.acos(2 * r.next() - 1), rr = 0.03 * Math.cbrt(r.next()); o[0] = rr * Math.sin(b) * Math.cos(a); o[1] = 3.74 + rr * Math.cos(b); o[2] = rr * Math.sin(b) * Math.sin(a); o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0.96; o[8] = 0.8; });
    void clamp01;
  },
});

/* ───────────── Pagoda ───────────── */
const rho = (u: number) => 1 / Math.max(Math.abs(Math.cos(u)), Math.abs(Math.sin(u)));
function roofSurf(ye: number, E: number, T: number, Hh: number, under = 0): ParamSurface {
  return { u0: 0, u1: TAU, v0: 0, v1: 1, eval(u, v, o) { const rh = rho(u), cn = (rh - 1) / (Math.SQRT2 - 1), e = E + (T - E) * v, out = 1 + 0.1 * cn * cn * (1 - v); o[0] = e * rh * out * Math.cos(u); o[2] = e * rh * out * Math.sin(u); o[1] = ye + Hh * (v - 0.14 * Math.sin(Math.PI * v)) + 0.22 * Math.pow(cn, 2.2) * Math.pow(1 - v, 1.2) - under * (1 - v * 0.6); } };
}
export const pagoda = defineShape({
  id: "obj-pagoda", name: "Pagoda", tag: OBJ,
  description: "A five-storey Japanese pagoda: stone terrace with steps, vermilion tiers with lattice doors and railings, sweeping slate roofs with upturned corners, bracketed eaves and a ringed golden finial.",
  palette: [[0, "#2a0d0d"], [0.2, "#7a1515"], [0.35, "#c43a2a"], [0.5, "#3a4a52"], [0.62, "#9aa7ad"], [0.78, "#e8c36a"], [0.9, "#f4ede0"], [1, "#ffffff"]],
  count: 140000, size: 0.005, fit: 1.5, camera: { distance: 6.8, yaw: 0.6, pitch: 0.12, autoRotate: 0.08 },
  build(sc) {
    box(sc, [0, 0.12, 0], [1.9, 0.12, 1.9], { dens: 1, thick: 0.004, c: 0.6 }); box(sc, [0, 0.33, 0], [1.7, 0.09, 1.7], { dens: 1, thick: 0.004, c: 0.63 });
    for (let k = 0; k < 3; k++) box(sc, [0, 0.03 + 0.1 * k, 1.95 + 0.25 - 0.2 * k * 0], [0.5 - 0.04 * k, 0.05, 0.12], { dens: 1.2, thick: 0.004, c: 0.6 });
    const gold: V3[][] = [], red: V3[][] = [], slate: V3[][] = [];
    let yf = 0.42;
    for (let i = 0; i < 5; i++) {
      const E = 1.45 - 0.2 * i, b = 0.72 - 0.1 * i, hb = 0.52 - 0.02 * i, Hh = 0.34 - 0.01 * i, yt = yf + hb, T = i < 4 ? 0.72 - 0.1 * (i + 1) + 0.06 : 0.12;
      box(sc, [0, yf + hb / 2, 0], [b, hb / 2, b], { dens: 1.1, thick: 0.004, c: 0.35, skip: ["+y", "-y"] });
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) red.push([[sx * b, yf, sz * b], [sx * b, yt, sz * b]]);
      for (const [px, pz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as Array<[number, number]>) {
        const P = (s: number, y: number): V3 => (px === 0 ? [s, y, pz * (b + 0.006)] : [px * (b + 0.006), y, s]);
        const dw = 0.3 * b / 0.72 + 0.05;
        sc.sheet(quad(P(-dw, yf + 0.04), P(dw, yf + 0.04), P(dw, yf + hb * 0.85), P(-dw, yf + hb * 0.85)), { dens: 1.6, thick: 0.002, c: 0.05 });
        gold.push([P(-dw, yf + 0.04), P(dw, yf + 0.04), P(dw, yf + hb * 0.85), P(-dw, yf + hb * 0.85), P(-dw, yf + 0.04)]);
        for (let k = 1; k < 4; k++) { const s = -dw + (2 * dw * k) / 4; gold.push([P(s, yf + 0.04), P(s, yf + hb * 0.85)]); const yy = yf + 0.04 + ((hb * 0.81) * k) / 4; gold.push([P(-dw, yy), P(dw, yy)]); }
        for (let k = -3; k <= 3; k++) { if (Math.abs(k) < 2) continue; const s = k * b / 3.6; gold.push([P(s, yf + 0.12), P(s, yf + hb * 0.7)]); }
        // eave brackets
        for (let k = -3; k <= 3; k++) { const s = (k / 3) * b, pe = (E - 0.08) / b; gold.push(px === 0 ? [[s, yt - 0.02, pz * b], [s * pe, yt - 0.06, pz * (E - 0.08)]] : [[px * b, yt - 0.02, s], [px * (E - 0.08), yt - 0.06, s * pe]]); }
      }
      // balcony
      const r = b + 0.15, ry = yf + 0.1;
      box(sc, [0, yf - 0.005, 0], [r + 0.02, 0.018, r + 0.02], { dens: 1.1, thick: 0.003, c: 0.2, skip: ["-y"] });
      red.push([[-r, ry, -r], [r, ry, -r], [r, ry, r], [-r, ry, r], [-r, ry, -r]], [[-r, ry - 0.06, -r], [r, ry - 0.06, -r], [r, ry - 0.06, r], [-r, ry - 0.06, r], [-r, ry - 0.06, -r]]);
      const np = Math.round(b * 14);
      for (let k = 0; k <= np; k++) { const s = -r + (2 * r * k) / np; for (const [x, z] of [[s, -r], [s, r], [-r, s], [r, s]] as Array<[number, number]>) red.push([[x, yf, z], [x, ry, z]]); }
      // roof
      const roof = roofSurf(yt - 0.02, E, T, Hh);
      sc.sheet(roof, { dens: 1.5, thick: 0.004, c: (u, v) => 0.5 + 0.05 * Math.sin(u * 24) * (1 - v) + 0.02 * v });
      sc.sheet(roofSurf(yt - 0.02, E, T, Hh, 0.07), { dens: 1, thick: 0.004, c: 0.2 });
      slate.push(isoV(roof, 0, 120), isoV(roof, 0.015, 120));
      for (let k = 0; k < 72; k++) if (k % 2 === 0) slate.push(isoU(roof, k / 72, 10));
      for (let k = 0; k < 4; k++) slate.push(isoU(roof, (k + 0.5) / 4 + 0.125, 12));
      yf = yt + Hh - 0.02;
    }
    sc.strands(gold, { r: 0.0042, dens: 1.1, c0: 0.78, c1: 0.78 });
    sc.strands(red, { r: 0.0055, dens: 1.1, c0: 0.3, c1: 0.3 });
    sc.strands(slate, { r: 0.0042, dens: 1, c0: 0.5, c1: 0.6 });
    // finial
    const top = yf, f = sc.solid(0.02);
    f.tube([[0, top, 0], [0, top + 1.2, 0]], [0.04, 0.03], { seg: 8, c: 0.78, k: 0.02 });
    f.ell([0, top + 0.1, 0], [0.2, 0.09, 0.2], { c: 0.78, k: 0.03 }); f.ell([0, top + 0.28, 0], [0.12, 0.05, 0.12], { c: 0.78, k: 0.03 });
    for (let k = 0; k < 9; k++) sc.sheet(torus([0, top + 0.38 + 0.075 * k, 0], 0.16 - 0.012 * k, 0.02, "y"), { dens: 2.2, thick: 0.002, c: 0.78 });
    f.ell([0, top + 1.1, 0], [0.07, 0.13, 0.07], { c: 0.85, k: 0.03 }); f.cone([0, top + 1.2, 0], [0, top + 1.4, 0], 0.02, 0.004, { c: 0.85, k: 0.01 });
    void lerp3; void addv; void disc; void lathe; void circle;
  },
});

/* ───────────── Windmill ───────────── */
export const windmill = defineShape({
  id: "obj-windmill", name: "Windmill", tag: OBJ,
  description: "A Dutch tower windmill: tapering octagonal brick body with gallery, door and windows, a thatched cap with tail pole, and four latticed sails turning on a hub, in a meadow with tulips.",
  palette: [[0, "#1a120c"], [0.2, "#5a2e1c"], [0.33, "#c8683a"], [0.45, "#a47440"], [0.58, "#efe8d6"], [0.7, "#4f9a3c"], [0.82, "#f7c948"], [0.92, "#e8453c"], [1, "#ffffff"]],
  count: 130000, size: 0.0052, fit: 1.5, camera: { distance: 6.6, yaw: 0.55, pitch: 0.08, autoRotate: 0.08 },
  build(sc) {
    const prof: Array<[number, number]> = [[0.98, 0.0], [0.9, 0.7], [0.8, 1.7], [0.68, 2.7], [0.6, 3.2]];
    const tower = lathe(prof, { sides: 8, rot: Math.PI / 8 });
    sc.sheet(tower, { dens: 1.6, thick: 0.004, c: (u, _v, _x, y) => (y < 0.18 ? 0.58 : 0.33 + 0.05 * (vnoise(Math.floor(u * 9), Math.floor(y * 15), 0) - 0.5) * 2 + 0.03 * (Math.floor(y * 15) % 2)) });
    const lines: V3[][] = [];
    for (let k = 0; k < 8; k++) lines.push(isoU(tower, k / 8 + 0.0001, 10));
    sc.strands(lines, { r: 0.008, dens: 0.9, c0: 0.58, c1: 0.58 });
    // gallery
    const gy = 1.15;
    sc.sheet(disc([0, gy, 0], 1.18, 0.74, "y"), { dens: 1.4, thick: 0.012, c: 0.45 });
    const rail: V3[][] = [circle([0, gy + 0.32, 0], 1.16, 8, "y"), circle([0, gy + 0.18, 0], 1.16, 8, "y")];
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; rail.push([[1.16 * Math.cos(a), gy, 1.16 * Math.sin(a)], [1.16 * Math.cos(a), gy + 0.32, 1.16 * Math.sin(a)]]); }
    sc.strands(rail, { r: 0.0055, dens: 1, c0: 0.45, c1: 0.45 });
    // door and windows
    const face = (r: number, y0: number, y1: number, w: number, c: number, ang = Math.PI / 2) => { const ca = Math.cos(ang), sa = Math.sin(ang), tn: V3 = [-sa, 0, ca]; const P = (dx: number, y: number): V3 => [r * ca + tn[0] * dx, y, r * sa + tn[2] * dx]; sc.sheet(quad(P(-w, y0), P(w, y0), P(w, y1), P(-w, y1)), { dens: 2, thick: 0.002, c }); return [P(-w, y0), P(-w, y1), P(w, y1), P(w, y0), P(-w, y0)] as V3[]; };
    const fr: V3[][] = [face(0.945, 0.18, 0.68, 0.16, 0.2), face(0.7, 1.9, 2.15, 0.1, 0.02), face(0.62, 2.5, 2.72, 0.08, 0.02), face(0.64, 2.45, 2.68, 0.08, 0.02, Math.PI / 2 + 1.0)];
    sc.strands(fr, { r: 0.006, dens: 1, c0: 0.58, c1: 0.58 });
    // cap
    const capP: Array<[number, number]> = [[0.64, 3.2], [0.74, 3.32], [0.7, 3.6], [0.52, 3.85], [0.25, 3.98], [0.0, 4.02]];
    const cap = lathe(capP);
    sc.sheet(cap, { dens: 1.5, thick: 0.005, c: (u, v) => 0.45 + 0.05 * Math.sin(u * 40 + v * 6) });
    const thatch: V3[][] = []; for (let k = 0; k < 40; k++) thatch.push(isoU(cap, k / 40, 10)); for (const v of [0.35, 0.55, 0.75]) thatch.push(isoV(cap, v, 80));
    sc.strands(thatch, { r: 0.0045, dens: 0.9, c0: 0.2, c1: 0.2 });
    // hub, shaft, tail pole
    const hub: V3 = [0, 3.62, 0.8], h = sc.solid(0.02);
    h.cone([0, 3.62, 0.45], [0, 3.62, 0.95], 0.1, 0.08, { c: 0.2, k: 0.02 }); h.sph([0, 3.62, 0.98], 0.1, { c: 0.45, k: 0.02 });
    h.tube([[0, 3.5, -0.5], [0, 2.3, -1.3], [0, 1.0, -2.1]], [0.04, 0.032, 0.028], { seg: 12, c: 0.45, k: 0.01 });
    const tp: V3[][] = []; for (let k = 0; k < 9; k++) { const t = k / 8; tp.push([[-0.07, 3.45 - 2.5 * t, -0.55 - 1.55 * t], [0.07, 3.45 - 2.5 * t, -0.55 - 1.55 * t]]); }
    sc.strands(tp, { r: 0.005, dens: 1, c0: 0.45, c1: 0.45 });
    // sails
    const frame: V3[][] = [], boards: V3[][] = [];
    for (let k = 0; k < 4; k++) {
      const a = 0.35 + (k * Math.PI) / 2, d: V3 = [Math.cos(a), Math.sin(a), 0], p: V3 = [-Math.sin(a), Math.cos(a), 0];
      const P = (l: number, w: number, z = 0.1): V3 => [hub[0] + d[0] * l + p[0] * w, hub[1] + d[1] * l + p[1] * w, hub[2] + z];
      h.tube([P(0.1, 0, 0.1), P(1.2, 0, 0.1), P(2.45, 0, 0.1)], [0.045, 0.036, 0.03], { seg: 14, c: 0.45, k: 0.01 });
      const l0 = 0.5, l1 = 2.4, w0 = 0.06, w1 = 0.64;
      frame.push([P(l0, w0, 0.13), P(l1, w0, 0.13), P(l1, w1, 0.13), P(l0, w1, 0.13), P(l0, w0, 0.13)]);
      const nr = 26;
      for (let r = 1; r < nr; r++) { const l = l0 + ((l1 - l0) * r) / nr; frame.push([P(l, w0, 0.13), P(l, w1, 0.13)]); frame.push([P(l - (l1 - l0) / nr, r % 2 ? w0 : w1, 0.13), P(l, r % 2 ? w1 : w0, 0.13)]); }
      frame.push([P(l0, 0.35, 0.13), P(l1, 0.35, 0.13)]);
      sc.sheet(quad(P(l0, w0, 0.135), P(l1, w0, 0.135), P(l1, 0.2, 0.135), P(l0, 0.2, 0.135)), { dens: 1.5, thick: 0.003, c: 0.58 });
      boards.push([P(l0, w0 + 0.01, 0.15), P(l1, w0 + 0.01, 0.15)]);
    }
    sc.strands(frame, { r: 0.0048, dens: 1.2, c0: 0.45, c1: 0.45 });
    sc.strands(boards, { r: 0.006, dens: 1, c0: 0.58, c1: 0.58 });
    // meadow
    sc.sheet(disc([0, -0.01, 0], 2.7, 1.0, "y"), { dens: 0.55, thick: 0.01, c: (_u, _v, x, _y, z) => 0.66 + 0.06 * (vnoise(x * 3, 0, z * 3) - 0.5) });
    const grass: V3[][] = [];
    for (let k = 0; k < 260; k++) { const a = sc.rng.next() * TAU, r = 1.0 + 1.7 * Math.sqrt(sc.rng.next()), x = r * Math.cos(a), z = r * Math.sin(a), hh = 0.08 + 0.12 * sc.rng.next(), bx = (sc.rng.next() - 0.5) * 0.1; grass.push([[x, 0, z], [x + bx * 0.5, hh * 0.6, z], [x + bx, hh, z]]); }
    sc.strands(grass, { r: 0.004, dens: 0.8, c0: 0.62, c1: 0.74 });
    sc.points(0.25, (r, o) => { const a = r.next() * TAU, rr = 1.5 + 1.1 * Math.sqrt(r.next()), cx = Math.round(rr * Math.cos(a) * 3) / 3, cz = Math.round(rr * Math.sin(a) * 3) / 3, q = r.next() * TAU, e = 0.025 * r.next(); o[0] = cx + e * Math.cos(q); o[1] = 0.17 + 0.03 * r.next(); o[2] = cz + e * Math.sin(q); o[3] = 0; o[4] = 1; o[5] = 0; o[6] = vnoise(cx * 4, 0, cz * 4) > 0.5 ? 0.82 : 0.92; o[7] = 1.4; });
    void clamp01;
  },
});

export const OBJECTS2_SHAPES: GeneratorDef[] = [eiffel, pagoda, windmill];
