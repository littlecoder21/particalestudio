import type { GeneratorDef } from "../types";
import type { ParamSurface } from "../sampling";
import { vnoise } from "../math";
import { defineShape, splinePoints, norm3, type V3 } from "./sculpt";
import { OBJ, TAU, quad, xf, lathe, torus, circle, disc, isoV, clamp01, addv } from "./objkit";

/* ───────────── Acoustic guitar ───────────── */
function outlineFn(pts: Array<[number, number]>): (u: number) => [number, number] {
  const right = splinePoints(pts.map((p): V3 => [p[0], p[1], 0]), 110), full: Array<[number, number]> = right.map((p) => [p[0], p[1]]);
  for (let i = right.length - 2; i >= 1; i--) full.push([-right[i][0], right[i][1]]);
  full.push(full[0]);
  const cum = [0]; for (let i = 1; i < full.length; i++) cum.push(cum[i - 1] + Math.hypot(full[i][0] - full[i - 1][0], full[i][1] - full[i - 1][1]));
  const tot = cum[cum.length - 1];
  return (u) => {
    const q = (((u % 1) + 1) % 1) * tot; let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cum[m] <= q) lo = m; else hi = m; }
    const f = (q - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
    return [full[lo][0] + (full[hi][0] - full[lo][0]) * f, full[lo][1] + (full[hi][1] - full[lo][1]) * f];
  };
}
export const guitar = defineShape({
  id: "obj-guitar", name: "Acoustic Guitar", tag: OBJ,
  description: "A steel-string acoustic guitar: sunburst spruce top with sound-hole rosette, figure-eight body with binding, bridge and pins, a fretted fingerboard with 19 frets, six strings and a headstock with tuners.",
  palette: [[0, "#120803"], [0.18, "#4a2a12"], [0.35, "#a8641e"], [0.5, "#e0a850"], [0.62, "#f6e2a8"], [0.74, "#b9c1c7"], [0.86, "#e6b650"], [1, "#ffffff"]],
  count: 130000, size: 0.0052, fit: 1.55, camera: { distance: 6.4, yaw: 0.5, pitch: 0.06, autoRotate: 0.08 },
  build(sc) {
    const out = outlineFn([[0, -0.78], [0.3, -0.76], [0.5, -0.62], [0.56, -0.4], [0.5, -0.18], [0.4, -0.02], [0.38, 0.1], [0.43, 0.26], [0.46, 0.44], [0.38, 0.62], [0.2, 0.72], [0, 0.74]]);
    const dF = (y: number) => 0.17 + 0.03 * clamp01((0.1 - y) / 0.8), C: [number, number] = [0, 0.15], HR = 0.15;
    const top: ParamSurface = { u0: 0, u1: 1, v0: 0, v1: 1, eval(u, v, o) { const P = out(u), dx = P[0] - C[0], dy = P[1] - C[1], l = Math.hypot(dx, dy) || 1, ix = C[0] + (HR * dx) / l, iy = C[1] + (HR * dy) / l, x = ix + (P[0] - ix) * v, y = iy + (P[1] - iy) * v; o[0] = x; o[1] = y; o[2] = dF(y) + 0.012 * Math.sin(Math.PI * Math.min(1, v * 1.25)); } };
    sc.sheet(top, { dens: 1.5, thick: 0.004, c: (_u, v, x) => 0.6 - 0.26 * Math.pow(v, 3) + 0.02 * Math.sin(x * 90) });
    const back: ParamSurface = { u0: 0, u1: 1, v0: 0, v1: 1, eval(u, v, o) { const P = out(u), x = C[0] + (P[0] - C[0]) * v, y = C[1] + (P[1] - C[1]) * v; o[0] = x; o[1] = y; o[2] = -(dF(y) + 0.012 * Math.sin(Math.PI * v)); } };
    sc.sheet(back, { dens: 0.8, thick: 0.004, c: (_u, v) => 0.3 - 0.06 * v });
    const sides: ParamSurface = { u0: 0, u1: 1, v0: 0, v1: 1, eval(u, v, o) { const P = out(u); o[0] = P[0]; o[1] = P[1]; o[2] = dF(P[1]) * (1 - 2 * v) + 0.01 * Math.sin(Math.PI * v) * 0; } };
    sc.sheet(sides, { dens: 1.3, thick: 0.004, c: (u, v) => 0.27 + 0.03 * Math.sin(u * 60) + 0.03 * v });
    const bind: V3[][] = [], lineAt = (z: number, off = 0): V3[] => { const ln: V3[] = []; for (let i = 0; i <= 220; i++) { const P = out(i / 220); ln.push([P[0], P[1], z === 0 ? 0 : (z > 0 ? dF(P[1]) + off : -dF(P[1]) - off)]); } return ln; };
    bind.push(lineAt(1, 0.003), lineAt(-1, 0.003));
    sc.strands(bind, { r: 0.0085, dens: 1.2, c0: 0.62, c1: 0.62 });
    // sound hole and rosette
    sc.sheet(disc([0, 0.15, 0.04], 0.147, 0, "z"), { dens: 1.4, thick: 0.002, c: 0.0, al: 0.95 });
    const ros: V3[][] = []; for (const [r, c] of [[0.155, 0.1], [0.17, 0.62], [0.185, 0.62], [0.2, 0.1]] as Array<[number, number]>) { const ln = circle([0, 0.15, 0.172], r, 100, "z"); ros.push(ln); void c; }
    sc.strands([ros[0], ros[3]], { r: 0.005, dens: 1.2, c0: 0.1, c1: 0.1 }); sc.strands([ros[1], ros[2]], { r: 0.0042, dens: 1.2, c0: 0.62, c1: 0.62 });
    // pickguard
    sc.sheet(xf(quad([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]), (_p, u, v) => { const x = 0.2 + 0.2 * u * (1 - 0.3 * v), y = 0.02 - 0.3 * v * (1 - 0.3 * u) - 0.1 * (1 - v) * u; return [x, y, dF(y) + 0.006 + 0.012 * 0.5]; }), { dens: 1.2, thick: 0.002, c: 0.02, al: 0.9 });
    // neck
    const nk = sc.solid(0.01);
    nk.tube([[0, 0.7, 0.12], [0, 1.4, 0.14], [0, 2.1, 0.15]], [0.093, 0.087, 0.078], { seg: 14, c: 0.26, k: 0.01 });
    const yn = 2.1, hw = (u: number) => 0.085 + 0.045 * u, zf = (u: number) => 0.215 - 0.015 * u;
    sc.sheet({ u0: 0, u1: 1, v0: -1, v1: 1, eval(u: number, v: number, o: V3) { o[0] = v * hw(u); o[1] = yn - 1.75 * u; o[2] = zf(u); } }, { dens: 1.5, thick: 0.003, c: 0.1 });
    const frets: V3[][] = [];
    for (let n = 1; n <= 19; n++) { const y = yn - 2.6 * (1 - Math.pow(2, -n / 12)), u = (yn - y) / 1.75, w = hw(u); frets.push([[-w, y, zf(u) + 0.004], [w, y, zf(u) + 0.004]]); }
    sc.strands(frets, { r: 0.0046, dens: 1.2, c0: 0.74, c1: 0.74 });
    const dots = sc.solid(0.004);
    for (const n of [3, 5, 7, 9, 15, 17]) { const y = yn - 2.6 * (1 - Math.pow(2, -(n - 0.5) / 12)), u = (yn - y) / 1.75; dots.sph([0, y, zf(u) + 0.005], 0.014, { c: 0.62, k: 0.004 }); }
    { const y = yn - 2.6 * (1 - Math.pow(2, -11.5 / 12)), u = (yn - y) / 1.75; dots.sph([-0.035, y, zf(u) + 0.005], 0.014, { c: 0.62, k: 0.004 }); dots.sph([0.035, y, zf(u) + 0.005], 0.014, { c: 0.62, k: 0.004 }); }
    // headstock
    const hs = (off: number) => xf(quad([-0.1, 0, 0], [0.1, 0, 0], [0.115, 1, 0], [-0.115, 1, 0]), (p, _u, v) => [p[0] * (1 + 0.2 * Math.sin(Math.PI * v)), 2.1 + 0.55 * v, 0.2 - 0.085 * v + off]);
    sc.sheet(hs(0.0), { dens: 1.4, thick: 0.003, c: 0.1 }); sc.sheet(hs(-0.03), { dens: 1.2, thick: 0.003, c: 0.26 });
    const tn = sc.solid(0.006);
    for (let k = 0; k < 3; k++) { const y = 2.2 + 0.14 * k; tn.ell([0.17, y, 0.1], [0.038, 0.03, 0.012], { c: 0.74, k: 0.004, sym: "x" }); tn.cone([0.1, y, 0.155], [0.17, y, 0.105], 0.012, 0.012, { c: 0.74, k: 0.004, sym: "x" }); }
    // bridge
    const br = sc.solid(0.006);
    br.ell([0, -0.55, 0.205], [0.24, 0.05, 0.018], { c: 0.1, k: 0.01 }); br.ell([0, -0.5, 0.228], [0.2, 0.008, 0.008], { c: 0.62, k: 0.004 });
    for (let k = 0; k < 6; k++) br.sph([(k - 2.5) * 0.04, -0.555, 0.226], 0.012, { c: 0.62, k: 0.004 });
    // strings
    const thin: V3[][] = [], wound: V3[][] = [];
    for (let k = 0; k < 6; k++) { const ln: V3[] = [[(k - 2.5) * 0.026, 2.1, 0.232], [(k - 2.5) * 0.04, -0.5, 0.236]]; (k < 3 ? wound : thin).push(ln); const side = k < 3 ? 1 : -1; const pk = k < 3 ? k : k - 3; const peg: V3 = [side * 0.12, 2.2 + 0.14 * (k < 3 ? 2 - pk : pk), 0.14]; (k < 3 ? wound : thin).push([[(k - 2.5) * 0.026, 2.1, 0.232], peg]); }
    sc.strands(thin, { r: 0.0035, dens: 0.08, c0: 0.74, c1: 0.74 }); sc.strands(wound, { r: 0.0045, dens: 0.08, c0: 0.74, c1: 0.74 });
    void norm3; void addv; void TAU; void torus; void isoV; void lathe; void vnoise;
  },
});

/* ───────────── Royal crown ───────────── */
export const crown = defineShape({
  id: "obj-crown", name: "Royal Crown", tag: OBJ,
  description: "A jewelled state crown: chased gold band with ruby, emerald and sapphire cabochons ringed in pearls, ermine trim, alternating crosses pattée and fleurs-de-lis, pearl-set arches over a crimson velvet cap and a cross-topped orb.",
  palette: [[0, "#1a0d02"], [0.14, "#6b3f08"], [0.3, "#c8901c"], [0.48, "#ffd34a"], [0.6, "#fff1b8"], [0.7, "#d4152b"], [0.8, "#1f9d55"], [0.9, "#2a5bd7"], [1, "#ffffff"]],
  count: 130000, size: 0.0052, fit: 1.45, camera: { distance: 6.0, yaw: 0.4, pitch: 0.18, autoRotate: 0.1 },
  build(sc) {
    const R = 0.95;
    sc.sheet(lathe([[0.9, 0.08], [0.93, 0.12], [0.95, 0.4], [0.97, 0.72], [0.96, 0.8]]), { dens: 1.5, thick: 0.005, c: (u, v) => 0.44 + 0.06 * Math.sin(u * 40) * Math.sin(v * 14) });
    const bandL: V3[][] = []; const bp = lathe([[0.9, 0.08], [0.93, 0.12], [0.95, 0.4], [0.97, 0.72], [0.96, 0.8]]);
    for (const v of [0.1, 0.18, 0.76, 0.9]) bandL.push(isoV(bp, v, 140));
    sc.strands(bandL, { r: 0.0075, dens: 1.1, c0: 0.6, c1: 0.6 });
    // ermine trim
    sc.sheet(lathe([[0.95, -0.18], [1.0, -0.12], [1.03, 0.02], [1.0, 0.12], [0.96, 0.17]]), { dens: 1.6, thick: 0.018, c: (u, v) => { const row = Math.floor(v * 3), lu = ((u / TAU) * 18 + (row % 2) * 0.5) % 1 - 0.5, lv = (v * 3) % 1 - 0.5; return Math.hypot(lu * 0.9, lv * 0.62) < 0.15 ? 0.02 : 1.0; } });
    // velvet cap
    sc.sheet(lathe([[0.88, 0.78], [0.86, 0.95], [0.7, 1.15], [0.45, 1.3], [0.2, 1.38], [0, 1.4]]), { dens: 1.1, thick: 0.006, c: (u, v) => 0.7 + 0.015 * Math.sin(u * 12) * (1 - v) });
    const jw = sc.solid(0.01), gold = sc.solid(0.025);
    // jewels on the band
    for (let k = 0; k < 8; k++) {
      const a = ((k + 0.5) / 8) * TAU, r: V3 = [Math.cos(a), 0, Math.sin(a)], t: V3 = [-Math.sin(a), 0, Math.cos(a)], c: V3 = [r[0] * 0.965, 0.46, r[2] * 0.965], gc = [0.7, 0.9, 0.8, 0.9][k % 4];
      jw.ell(c, [0.04, 0.1, 0.075], { dir: r, up: [0, 1, 0], c: gc, k: 0.01, sz: 1.1 });
      for (let q = 0; q < 10; q++) { const th = (q / 10) * TAU; jw.sph([c[0] + t[0] * 0.125 * Math.cos(th) + r[0] * 0.01, c[1] + 0.17 * Math.sin(th), c[2] + t[2] * 0.125 * Math.cos(th) + r[2] * 0.01], 0.017, { c: 1.0, k: 0.004, sz: 1.1 }); }
    }
    // crosses pattée and fleurs-de-lis
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU, r: V3 = [Math.cos(a), 0, Math.sin(a)], t: V3 = [-Math.sin(a), 0, Math.cos(a)];
      const P = (l: number, h: number, rr = 0): V3 => [R * 0.99 * r[0] + t[0] * l + r[0] * rr, 0.76 + h, R * 0.99 * r[2] + t[2] * l + r[2] * rr];
      const arm = (a1: V3, a2: V3) => gold.cone(a1, a2, 0.026, 0.06, { c: 0.48, k: 0.015 });
      gold.sph(P(0, 0.3), 0.05, { c: 0.48, k: 0.02 });
      arm(P(0, 0.3), P(0, 0.52)); arm(P(0, 0.3), P(-0.2, 0.3)); arm(P(0, 0.3), P(0.2, 0.3)); arm(P(0, 0.3), P(0, 0.08));
      jw.sph(P(0, 0.3, 0.035), 0.036, { c: 0.7, k: 0.01 });
      for (const [l, h] of [[0, 0.55], [-0.22, 0.3], [0.22, 0.3]] as Array<[number, number]>) jw.sph(P(l, h), 0.028, { c: 1.0, k: 0.01 });
      const b = a + Math.PI / 4, rb: V3 = [Math.cos(b), 0, Math.sin(b)], tb: V3 = [-Math.sin(b), 0, Math.cos(b)];
      const Q = (l: number, h: number): V3 => [R * 0.99 * rb[0] + tb[0] * l, 0.76 + h, R * 0.99 * rb[2] + tb[2] * l];
      gold.ell(Q(0, 0.3), [0.2, 0.05, 0.033], { dir: [0, 1, 0], up: tb, c: 0.48, k: 0.02 });
      for (const sg of [-1, 1]) { gold.ell(Q(sg * 0.1, 0.24), [0.14, 0.04, 0.03], { dir: norm3([sg * tb[0] * 0.55, 0.85, sg * tb[2] * 0.55]), up: tb, c: 0.48, k: 0.02 }); gold.ell(Q(sg * 0.17, 0.33), [0.07, 0.035, 0.028], { dir: norm3([sg * tb[0] * 0.9, 0.35, sg * tb[2] * 0.9]), up: tb, c: 0.5, k: 0.02 }); }
      gold.ell(Q(0, 0.06), [0.13, 0.035, 0.04], { dir: tb, up: [0, 1, 0], c: 0.46, k: 0.02 });
      jw.sph(Q(0, 0.12), 0.026, { c: 0.8, k: 0.01 });
    }
    // arches
    for (const a0 of [0, Math.PI / 2]) {
      const pts: V3[] = []; for (let i = 0; i <= 24; i++) { const s = -1 + (2 * i) / 24; pts.push([R * 0.97 * s * Math.cos(a0), 1.26 + 0.34 * (1 - Math.pow(Math.abs(s), 2.2)) ** 0.85 + 0.12 * (1 - s * s), R * 0.97 * s * Math.sin(a0)]); }
      pts[0][1] = 1.2 - 0.38; pts[24][1] = 1.2 - 0.38;
      const P = splinePoints(pts, 60);
      gold.tube(pts, pts.map(() => 0.048), { seg: 60, c: 0.46, k: 0.02 });
      for (let i = 1; i < 60; i += 2) { const p = P[i], q = P[i + 1], tg = norm3([q[0] - p[0], q[1] - p[1], q[2] - p[2]]), side: V3 = norm3([-tg[2], 0, tg[0]]); for (const sg of [-1, 1]) jw.sph([p[0] + side[0] * 0.05 * sg, p[1] + 0.012, p[2] + side[2] * 0.05 * sg], 0.016, { c: 1.0, k: 0.004 }); }
      for (const i of [10, 20, 30, 40, 50]) jw.sph([P[i][0], P[i][1] + 0.03, P[i][2]], 0.03, { c: i % 20 === 0 ? 0.8 : 0.7, k: 0.008 });
    }
    gold.sph([0, 1.58, 0], 0.17, { c: 0.46, k: 0.03 });
    sc.sheet(torus([0, 1.58, 0], 0.172, 0.02, "y"), { dens: 2, thick: 0.002, c: 0.6 }); sc.sheet(torus([0, 1.58, 0], 0.172, 0.02, "x"), { dens: 2, thick: 0.002, c: 0.6 });
    gold.tube([[0, 1.74, 0], [0, 2.1, 0]], [0.04, 0.042], { seg: 6, c: 0.48, k: 0.02 });
    gold.tube([[-0.19, 1.98, 0], [0.19, 1.98, 0]], [0.05, 0.05], { seg: 6, c: 0.48, k: 0.02 });
    gold.cone([0, 1.98, 0], [0, 2.18, 0], 0.04, 0.06, { c: 0.48, k: 0.02 }); gold.cone([0, 1.98, 0], [0, 1.76, 0], 0.04, 0.06, { c: 0.48, k: 0.02 });
    jw.sph([0, 1.98, 0.04], 0.04, { c: 0.9, k: 0.01 });
    for (const [x, y] of [[0, 2.2], [-0.21, 1.98], [0.21, 1.98]] as Array<[number, number]>) jw.sph([x, y, 0], 0.03, { c: 1.0, k: 0.01 });
  },
});

/* ───────────── Longsword ───────────── */
export const sword = defineShape({
  id: "obj-sword", name: "Longsword", tag: OBJ,
  description: "A knightly longsword: double-edged lenticular blade with a fuller and a pointed tip, curved crossguard with ball finials, wire-wrapped leather grip and a wheel pommel set with a ruby.",
  palette: [[0, "#0b0b10"], [0.15, "#3a2a1a"], [0.3, "#7a5a1e"], [0.45, "#e0b040"], [0.55, "#7d8794"], [0.7, "#c7d0da"], [0.82, "#f2f6fa"], [0.9, "#d4152b"], [1, "#ffffff"]],
  count: 100000, size: 0.0054, fit: 1.5, camera: { distance: 6.2, yaw: 0.8, pitch: 0.08, autoRotate: 0.1 },
  build(sc) {
    const Y0 = 0.36, Y1 = 2.75, hw = (u: number) => 0.115 * (1 - 0.2 * u) * Math.sqrt(Math.min(1, (1 - u) / 0.16));
    const blade = (side: number): ParamSurface => ({ u0: 0, u1: 1, v0: -1, v1: 1, eval(u, v, o) { const w = hw(u), ridge = 0.02 * (1 - Math.abs(v)) * (1 - 0.45 * u), fl = u < 0.8 ? 0.0125 * Math.max(0, 1 - Math.abs(v) / 0.3) * Math.min(1, (0.8 - u) * 8) * Math.min(1, u * 14) : 0; o[0] = v * w; o[1] = Y0 + (Y1 - Y0) * u; o[2] = side * (ridge - fl); } });
    for (const sd of [1, -1]) sc.sheet(blade(sd), { dens: 1.8, thick: 0.0025, c: (u, v) => 0.82 - 0.26 * Math.max(0, 1 - Math.abs(v) / 0.3) * (u < 0.8 ? 1 : 0) - 0.04 * u + 0.02 * Math.sin(u * 60) });
    const edge: V3[][] = [[], []]; for (let i = 0; i <= 120; i++) { const u = i / 120, w = hw(u); edge[0].push([-w, Y0 + (Y1 - Y0) * u, 0]); edge[1].push([w, Y0 + (Y1 - Y0) * u, 0]); }
    sc.strands(edge, { r: 0.004, dens: 1.5, c0: 0.82, c1: 0.82 });
    const rune: V3[][] = []; for (let k = 0; k < 7; k++) { const y = 0.8 + k * 0.22; rune.push([[-0.02, y, 0.0085], [0.02, y + 0.05, 0.0085]], [[0.02, y, 0.0085], [-0.02, y + 0.05, 0.0085]]); }
    sc.strands(rune, { r: 0.0032, dens: 1, c0: 0.45, c1: 0.45 });
    const g = sc.solid(0.02);
    g.tube([[-0.62, 0.16, 0], [-0.4, 0.31, 0], [0, 0.35, 0], [0.4, 0.31, 0], [0.62, 0.16, 0]], [0.03, 0.04, 0.045, 0.04, 0.03], { seg: 28, c: 0.45, k: 0.02 });
    g.sph([-0.64, 0.14, 0], 0.055, { c: 0.47, k: 0.02 }); g.sph([0.64, 0.14, 0], 0.055, { c: 0.47, k: 0.02 });
    g.ell([0, 0.33, 0], [0.1, 0.08, 0.07], { c: 0.45, k: 0.02 });
    g.tube([[0, 0.28, 0], [0, -0.55, 0]], [0.042, 0.04], { seg: 10, c: 0.15, k: 0.01 });
    for (let k = 0; k < 4; k++) g.ell([0, 0.2 - 0.3 * k, 0], [0.056, 0.012, 0.056], { c: 0.45, k: 0.01 });
    g.ell([0, -0.64, 0], [0.12, 0.09, 0.12], { c: 0.45, k: 0.02 }); g.sph([0, -0.72, 0], 0.05, { c: 0.45, k: 0.02 });
    g.sph([0.095, -0.64, 0], 0.045, { c: 0.9, k: 0.01, sym: "x" }); g.sph([0, -0.64, 0.095], 0.045, { c: 0.9, k: 0.01, sym: "z" });
    const wrap: V3[] = []; for (let i = 0; i <= 160; i++) { const t = i / 160, a = t * 15 * TAU; wrap.push([0.046 * Math.cos(a), 0.27 - 0.8 * t, 0.046 * Math.sin(a)]); }
    sc.strands([wrap], { r: 0.0065, dens: 1.5, c0: 0.45, c1: 0.45 });
    sc.points(0.05, (r, o) => { const a = r.next() * TAU, rr = 0.16 + 0.4 * r.next() * r.next(), y = -0.6 + 3.4 * r.next(); o[0] = rr * Math.cos(a); o[1] = y; o[2] = rr * Math.sin(a); o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0.7 + 0.12 * r.next(); o[7] = 1.1; o[8] = 0.5; });
  },
});

/* ───────────── Admiralty anchor ───────────── */
export const anchor = defineShape({
  id: "obj-anchor", name: "Ship's Anchor", tag: OBJ,
  description: "A traditional admiralty anchor: tall shank with shackle ring and cross stock, sweeping curved arms ending in broad flukes, hemp rope coiled around the shank, drifting seaweed and rising bubbles.",
  palette: [[0, "#0a0c10"], [0.2, "#3b4350"], [0.35, "#6a7585"], [0.5, "#9a4b22"], [0.62, "#c9a56b"], [0.75, "#3aa670"], [0.9, "#9fd6e8"], [1, "#ffffff"]],
  count: 100000, size: 0.0056, fit: 1.5, camera: { distance: 6.4, yaw: 0.55, pitch: 0.08, autoRotate: 0.09 },
  build(sc) {
    const s = sc.solid(0.05);
    s.shade = (x, y, z, _nx, _ny, _nz, t) => t + (vnoise(x * 6, y * 6, z * 6) > 0.67 ? 0.3 : 0) + 0.05 * (vnoise(x * 20, y * 20, z * 20) - 0.5);
    s.tube([[0, -1.55, 0], [0, 0.5, 0], [0, 2.6, 0]], [0.14, 0.098, 0.075], { seg: 22, c: 0.22, k: 0.04 });
    s.ell([0, -1.55, 0], [0.18, 0.13, 0.18], { c: 0.22 });
    for (const sg of [-1, 1]) {
      const pts: V3[] = []; const rad: number[] = [];
      for (let i = 0; i <= 14; i++) { const ph = (i / 14) * 1.25; pts.push([sg * 1.45 * Math.sin(ph), -0.1 - 1.45 * Math.cos(ph), 0]); rad.push(0.13 - 0.06 * (i / 14)); }
      s.tube(pts, rad, { seg: 40, c: 0.22, k: 0.04 });
    }
    s.tube([[0, 2.2, -1.15], [0, 2.2, 0], [0, 2.2, 1.15]], [0.045, 0.065, 0.045], { seg: 20, c: 0.25, k: 0.03 }); s.sph([0, 2.2, 1.18], 0.08, { c: 0.25, k: 0.03 }); s.sph([0, 2.2, -1.18], 0.08, { c: 0.25, k: 0.03 });
    s.ell([0, 2.2, 0], [0.13, 0.17, 0.13], { c: 0.25 });
    s.ell([0, 2.62, 0], [0.12, 0.1, 0.12], { c: 0.25 });
    sc.sheet(torus([0, 3.0, 0], 0.27, 0.048, "z"), { dens: 2.2, thick: 0.002, c: 0.28 });
    // flukes
    const phi = 1.25, tip: V3 = [1.45 * Math.sin(phi), -0.1 - 1.45 * Math.cos(phi), 0], tg: V3 = [Math.cos(phi), Math.sin(phi), 0], nn: V3 = [-Math.sin(phi), Math.cos(phi), 0];
    const rim: V3[][] = [];
    for (const sg of [-1, 1]) {
      for (const zs of [1, -1]) {
        const f: ParamSurface = { u0: 0, u1: 1, v0: -1, v1: 1, eval(u, v, o) { const w = 0.27 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.9) + 0.01, l = -0.1 + 0.62 * u, x = tip[0] + tg[0] * l + nn[0] * v * w, y = tip[1] + tg[1] * l + nn[1] * v * w; o[0] = sg * x; o[1] = y; o[2] = zs * (0.03 * (1 - v * v) * (1 - 0.5 * u) + 0.005); } };
        sc.sheet(f, { dens: 1.6, thick: 0.003, c: (_u, _v, x, y, z) => 0.25 + 0.3 * (vnoise(x * 6, y * 6, z * 6) > 0.6 ? 1 : 0) });
      }
      for (const vv of [-1, 1]) { const ln: V3[] = []; for (let i = 0; i <= 30; i++) { const u = i / 30, w = 0.27 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.9) + 0.01, l = -0.1 + 0.62 * u; ln.push([sg * (tip[0] + tg[0] * l + nn[0] * vv * w), tip[1] + tg[1] * l + nn[1] * vv * w, 0]); } rim.push(ln); }
    }
    sc.strands(rim, { r: 0.022, dens: 1.2, c0: 0.3, c1: 0.3 });
    // rope coil and hanging tail
    const coil: V3[] = []; for (let i = 0; i <= 72; i++) { const t = i / 72, a = t * 6 * TAU; coil.push([0.125 * Math.cos(a), 0.65 + 1.3 * t, 0.125 * Math.sin(a)]); }
    const ropeS = sc.solid(0.006); ropeS.tube(coil, coil.map(() => 0.034), { seg: 140, c: 0.62, k: 0.006 });
    ropeS.tube([coil[0], [0.3, 0.35, 0.1], [0.62, -0.1, 0.25], [0.7, -0.6, 0.12], [0.66, -0.95, 0.05]], [0.034, 0.034, 0.032, 0.03, 0.026], { seg: 30, c: 0.62, k: 0.006 });
    ropeS.tube([coil[72], [0.1, 2.35, 0.1], [0.2, 2.7, 0.05], [0.2, 2.95, 0]], [0.034, 0.03, 0.03, 0.03], { seg: 20, c: 0.62, k: 0.006 });
    const fray: V3[][] = []; for (let k = 0; k < 7; k++) fray.push([[0.66, -0.95, 0.05], [0.66 + (k - 3) * 0.02, -1.1, 0.05 + (k % 3 - 1) * 0.02], [0.66 + (k - 3) * 0.045, -1.2 - 0.03 * (k % 2), 0.05 + (k % 3 - 1) * 0.04]]);
    sc.strands(fray, { r: 0.006, dens: 1.2, c0: 0.62, c1: 0.62 });
    // seaweed
    const weed: V3[][] = [];
    for (let k = 0; k < 14; k++) { const sg = k % 2 ? 1 : -1, ph = 0.5 + 0.55 * sc.rng.next(), bx = sg * 1.45 * Math.sin(ph), by = -0.1 - 1.45 * Math.cos(ph), ln: V3[] = []; const L = 0.7 + 0.8 * sc.rng.next(), w = sc.rng.next() * TAU; for (let i = 0; i <= 14; i++) { const t = i / 14; ln.push([bx + 0.12 * Math.sin(t * 5 + w) * t + sg * 0.04 * t, by + 0.35 * t * L, 0.1 * Math.cos(t * 4 + w) * t + (k % 3 - 1) * 0.07]); } weed.push(ln); }
    sc.strands(weed, { r: 0.013, dens: 0.9, c0: 0.74, c1: 0.78, taper: true });
    sc.points(0.1, (r, o) => { const a = r.next() * TAU, rr = 0.6 * Math.sqrt(r.next()), y = -1.6 + 4.8 * Math.pow(r.next(), 0.8); o[0] = rr * Math.cos(a) + 0.6 * Math.sin(y * 2.0); o[1] = y; o[2] = rr * Math.sin(a); o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0.9; o[7] = 0.8 + 0.8 * r.next(); o[8] = 0.5; });
    void xf; void disc; void isoV; void addv;
  },
});

export const OBJECTS3_SHAPES: GeneratorDef[] = [guitar, crown, sword, anchor];
