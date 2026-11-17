import type { GeneratorDef } from "../types";
import { vnoise } from "../math";
import { defineShape, crScalar, type V3 } from "./sculpt";
import { OBJ, TAU, quad, xf, lathe, torus, circle, disc, isoV, isoU, radiusAt, clamp01, addv, lerp3 } from "./objkit";

/* ───────────── Rocket ───────────── */
export const rocket = defineShape({
  id: "obj-rocket", name: "Rocket", tag: OBJ,
  description: "A classic launch rocket: ogive nose cone, banded fuselage with a porthole, four swept fins, a flared engine bell and a roaring exhaust plume.",
  palette: [[0, "#0a1030"], [0.12, "#1f3a8a"], [0.22, "#d62a2a"], [0.3, "#8c93a3"], [0.5, "#fafbfd"], [0.6, "#ff6a10"], [0.8, "#ffd23a"], [1, "#fffbe0"]],
  count: 100000, size: 0.0056, fit: 1.45, camera: { distance: 6.0, yaw: 0.45, pitch: 0.1, autoRotate: 0.09 },
  build(sc) {
    const prof: Array<[number, number]> = [[0.0, 3.95], [0.09, 3.85], [0.24, 3.55], [0.37, 3.15], [0.45, 2.75], [0.49, 2.42], [0.5, 2.1], [0.5, 1.5], [0.5, 0.9], [0.5, 0.55], [0.46, 0.27], [0.41, 0.17]];
    const body = lathe(prof);
    const col = (_u: number, _v: number, x: number, y: number, z: number) => {
      if (y > 2.46) return 0.22 + 0.01 * Math.sin(y * 20);
      if (y > 2.38) return 0.12;
      if (y > 1.22 && y < 1.38) return 0.22;
      if (y > 0.6 && y < 0.74) return 0.12;
      if (y < 0.5) return 0.3 + 0.02 * Math.sin(y * 30);
      return 0.5 - 0.03 * Math.abs(Math.sin(Math.atan2(z, x) * 3));
    };
    sc.sheet(body, { dens: 1.5, thick: 0.004, c: col });
    const bandY = [2.42, 1.38, 1.22, 0.74, 0.6, 0.5];
    const bands: V3[][] = bandY.map((y) => circle([0, y, 0], radiusAt(prof, y) + 0.004, 90, "y"));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; bands.push([[0.5 * Math.cos(a), 0.52, 0.5 * Math.sin(a)], [0.504 * Math.cos(a), 1.5, 0.504 * Math.sin(a)], [0.504 * Math.cos(a), 2.4, 0.504 * Math.sin(a)]]); }
    sc.strands(bands, { r: 0.0045, dens: 0.8, c0: 0.3, c1: 0.3 });
    // portholes
    for (const [sz, y] of [[1, 1.9], [-1, 1.9]] as Array<[number, number]>) {
      const cx = 0, rr = 0.18;
      const ringOnBody = xf(torus([0, 0, 0], rr, 0.032, "z"), (p) => [p[0] + cx, p[1] + y, sz * (Math.sqrt(Math.max(0.02, 0.25 - p[0] * p[0])) + 0.004 + Math.abs(p[2]) * 0.0)]);
      sc.sheet(ringOnBody, { dens: 3, thick: 0.002, c: 0.3 });
      const glass = xf(disc([0, 0, 0], rr, 0, "z"), (p) => [p[0], p[1] + y, sz * (Math.sqrt(Math.max(0.02, 0.25 - p[0] * p[0])) + 0.002)]);
      sc.sheet(glass, { dens: 2.4, thick: 0.002, c: (_u, _v, x, yy) => (x * 0.7 - (yy - y) * 0.7 < -0.08 ? 0.5 : 0.12 + 0.05 * (yy - y)) });
    }
    // fins
    const fins: V3[][] = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a), tn: V3 = [-sa, 0, ca];
      const P = (r: number, y: number): V3 => [ca * r, y, sa * r];
      const A = P(0.48, 0.3), B = P(1.3, -0.18), C = P(1.3, 0.28), D = P(0.48, 1.25);
      for (const off of [-0.014, 0.014]) sc.sheet(quad(addv(A, tn, off), addv(B, tn, off), addv(C, tn, off), addv(D, tn, off)), { dens: 1.1, thick: 0.002, c: (u) => 0.22 - 0.03 * u });
      fins.push([A, B, C, D, A]);
    }
    sc.strands(fins, { r: 0.012, dens: 1, c0: 0.12, c1: 0.12 });
    // engine bell
    const nozzle: Array<[number, number]> = [[0.22, 0.22], [0.17, 0.06], [0.2, -0.12], [0.3, -0.3], [0.4, -0.46]];
    sc.sheet(lathe(nozzle), { dens: 1.8, thick: 0.004, c: (_u, _v, _x, y) => 0.3 + 0.05 * Math.sin(y * 18) });
    sc.sheet(lathe(nozzle.map(([r, y]): [number, number] => [r - 0.035, y])), { dens: 1.2, thick: 0.004, c: 0.1 });
    sc.strands([circle([0, -0.46, 0], 0.4, 60, "y"), circle([0, 0.15, 0], 0.43, 60, "y")], { r: 0.008, dens: 1, c0: 0.3, c1: 0.3 });
    // exhaust plume
    sc.points(3.4, (r, o) => {
      const s = Math.pow(r.next(), 1.25), y = -0.45 - s * 2.2, rad = 0.46 * Math.pow(1 - s, 0.8) * (0.55 + 0.45 * Math.min(1, s * 5)), a = r.next() * TAU, q = Math.sqrt(r.next()), rr = rad * q, wob = 0.03 * Math.sin(y * 11 + a * 2);
      o[0] = (rr + wob) * Math.cos(a); o[1] = y; o[2] = (rr + wob) * Math.sin(a); o[3] = Math.cos(a); o[4] = 0; o[5] = Math.sin(a);
      o[6] = clamp01(0.62 + 0.38 * Math.pow(1 - q, 0.6) * (1 - 0.35 * s)); o[7] = 1.0 + 0.5 * (1 - s); o[8] = 0.6 + 0.4 * (1 - s);
    });
  },
});

/* ───────────── Flying saucer ───────────── */
export const ufo = defineShape({
  id: "obj-ufo", name: "Flying Saucer", tag: OBJ,
  description: "A classic UFO: paneled metal saucer hull ringed with running lights, a glass dome housing a little green pilot, a glowing underbelly and a tractor beam.",
  palette: [[0, "#070b18"], [0.2, "#37465c"], [0.4, "#8d9bb0"], [0.55, "#d5dde8"], [0.68, "#6ff0ff"], [0.8, "#6dff6a"], [0.92, "#fff17a"], [1, "#ffffff"]],
  count: 110000, size: 0.0056, fit: 1.5, camera: { distance: 6.2, yaw: 0.3, pitch: 0.2, autoRotate: 0.09 },
  deformers: [{ type: "wave", amount: 0.02, scale: 0.9, speed: 0.9, axis: "y" }],
  build(sc) {
    const hullP: Array<[number, number]> = [[0.0, 0.46], [0.35, 0.44], [0.7, 0.36], [1.15, 0.18], [1.55, 0.05], [1.74, -0.02], [1.72, -0.1], [1.5, -0.2], [1.1, -0.32], [0.6, -0.42], [0.28, -0.47], [0.0, -0.48]];
    const hull = lathe(hullP);
    sc.sheet(hull, { dens: 1.6, thick: 0.005, c: (u, v, _x, y) => (v > 0.38 && v < 0.5 ? 0.22 : 0.34 + 0.2 * clamp01(0.5 + y) - 0.06 * (Math.floor((u / TAU) * 16) % 2) + 0.03 * Math.sin(v * 40)) });
    const lines: V3[][] = [];
    for (const v of [0.18, 0.3, 0.58, 0.66, 0.76, 0.84, 0.92]) lines.push(isoV(hull, v, 96));
    for (let k = 0; k < 16; k++) lines.push(isoU(hull, k / 16, 30).slice(0, 8));
    sc.strands(lines, { r: 0.005, dens: 0.8, c0: 0.3, c1: 0.3 });
    // dome
    const domeP: Array<[number, number]> = [[0.62, 0.36], [0.6, 0.5], [0.5, 0.74], [0.3, 0.94], [0.0, 1.02]];
    const dome = lathe(domeP);
    sc.sheet(dome, { dens: 1.3, thick: 0.004, c: (_u, v) => 0.66 + 0.05 * v, al: 0.3 });
    const frame: V3[][] = []; for (let k = 0; k < 10; k++) frame.push(isoU(dome, k / 10, 18)); for (const v of [0.25, 0.5, 0.75]) frame.push(isoV(dome, v, 60));
    sc.strands(frame, { r: 0.007, dens: 1, c0: 0.45, c1: 0.45 });
    const al = sc.solid(0.03);
    al.ell([0, 0.52, 0], [0.11, 0.1, 0.1], { c: 0.8 });
    al.ell([0, 0.7, 0], [0.13, 0.17, 0.13], { c: 0.82 });
    al.ell([0.115, 0.72, 0.075], [0.04, 0.07, 0.03], { c: 0.0, sym: "z", rot: [0, 0, 0.4] });
    al.cone([0, 0.84, 0.05], [0.02, 0.97, 0.13], 0.01, 0.018, { c: 0.82, sym: "z" });
    // running lights
    const ls = sc.solid(0.01);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; ls.sph([1.7 * Math.cos(a), -0.01, 1.7 * Math.sin(a)], 0.07, { c: i % 2 ? 0.92 : 0.8, sz: 1.2 }); }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.2; ls.sph([0.95 * Math.cos(a), -0.32, 0.95 * Math.sin(a)], 0.055, { c: 0.92, sz: 1.2 }); }
    sc.sheet(disc([0, -0.488, 0], 0.3, 0, "y"), { dens: 1.6, thick: 0.004, c: (_u, v) => 0.68 + 0.3 * (1 - v) });
    // tractor beam
    sc.points(2.4, (r, o) => {
      const s = Math.pow(r.next(), 0.85), y = -0.5 - 2.8 * s, R = 0.32 + 1.2 * s, a = r.next() * TAU, rr = R * (1 - 0.55 * Math.pow(r.next(), 3));
      o[0] = rr * Math.cos(a); o[1] = y; o[2] = rr * Math.sin(a); o[3] = Math.cos(a); o[4] = 0; o[5] = Math.sin(a);
      o[6] = 0.66 + 0.1 * (1 - s); o[7] = 0.9; o[8] = 0.12 + 0.4 * (1 - s) + 0.25 * (rr / R);
    });
    const beam: V3[][] = [];
    for (let k = 0; k < 36; k++) { const a = (k / 36) * TAU; beam.push([[0.32 * Math.cos(a), -0.5, 0.32 * Math.sin(a)], [1.52 * Math.cos(a), -3.3, 1.52 * Math.sin(a)]]); }
    for (let k = 0; k < 7; k++) { const s = (k + 0.5) / 7; beam.push(circle([0, -0.5 - 2.8 * s, 0], 0.32 + 1.2 * s, 80, "y")); }
    sc.strands(beam, { r: 0.004, dens: 0.8, c0: 0.7, c1: 0.7, al: 0.4 });
    sc.sheet(disc([0, -3.3, 0], 1.55, 1.2, "y"), { dens: 0.7, thick: 0.004, c: 0.72, al: 0.5 });
  },
});

/* ───────────── Sailboat ───────────── */
export const sailboat = defineShape({
  id: "obj-sailboat", name: "Sailboat", tag: OBJ,
  description: "A sloop sailing over a rolling sea: sleek striped hull with a raked bow, deck cabin, tall mast with billowing mainsail and jib, rigging, keel, rudder and pennant.",
  palette: [[0, "#06182e"], [0.18, "#0f4c81"], [0.34, "#3aa7c9"], [0.46, "#8b5a2b"], [0.58, "#d8b27a"], [0.66, "#f5f2ea"], [0.78, "#f5f2ea"], [0.88, "#e04a3a"], [1, "#ffffff"]],
  count: 120000, size: 0.0054, fit: 1.55, camera: { distance: 6.4, yaw: 0.5, pitch: 0.12, autoRotate: 0.09 },
  deformers: [{ type: "wave", amount: 0.018, scale: 0.9, speed: 0.8, axis: "y" }],
  build(sc) {
    const st = (arr: number[], u: number) => crScalar(arr, u * (arr.length - 1));
    const Bm = [0.38, 0.5, 0.55, 0.5, 0.32, 0.0], Ys = [0.5, 0.44, 0.4, 0.44, 0.56, 0.8], Yk = [0.1, -0.04, -0.1, -0.05, 0.1, 0.38];
    const X = (u: number) => -1.6 + 3.7 * u, hp = (u: number, th: number): V3 => { const B = Math.max(0, st(Bm, u)), ys = st(Ys, u), yk = st(Yk, u); return [X(u), ys - (ys - yk) * Math.pow(Math.cos(th), 0.9), B * Math.sin(th)]; };
    const hull = { u0: 0, u1: 1, v0: -1, v1: 1, eval(u: number, v: number, o: V3) { const p = hp(u, v * Math.PI / 2); o[0] = p[0]; o[1] = p[1]; o[2] = p[2]; } };
    sc.sheet(hull, { dens: 1.3, thick: 0.004, c: (_u, v) => { const f = Math.pow(Math.cos((v * Math.PI) / 2), 0.9); return f > 0.6 ? 0.2 : f > 0.53 ? 0.88 : f < 0.04 ? 0.5 : 0.72; } });
    sc.sheet({ u0: -Math.PI / 2, u1: Math.PI / 2, v0: 0, v1: 1, eval(th: number, v: number, o: V3) { const p = hp(0, th); o[0] = p[0]; o[1] = p[1] + (st(Ys, 0) - p[1]) * v; o[2] = p[2]; } }, { dens: 1, thick: 0.004, c: 0.58 });
    sc.sheet({ u0: 0, u1: 1, v0: -1, v1: 1, eval(u: number, v: number, o: V3) { o[0] = X(u); o[1] = st(Ys, u) + 0.025 * (1 - v * v); o[2] = Math.max(0, st(Bm, u)) * v * 0.97; } }, { dens: 1.1, thick: 0.004, c: (_u, v) => 0.56 + 0.06 * Math.sin(v * 22) });
    const deck: V3[][] = [];
    for (const zz of [-0.9, -0.55, -0.2, 0.2, 0.55, 0.9]) { const ln: V3[] = []; for (let i = 0; i <= 40; i++) { const u = i / 40, B = Math.max(0, st(Bm, u)) * 0.97; ln.push([X(u), st(Ys, u) + 0.03 * (1 - zz * zz), B * zz]); } deck.push(ln); }
    const rail: V3[] = [], rail2: V3[] = []; for (let i = 0; i <= 50; i++) { const u = i / 50, B = Math.max(0, st(Bm, u)); rail.push([X(u), st(Ys, u) + 0.015, B]); rail2.push([X(u), st(Ys, u) + 0.015, -B]); }
    sc.strands([...deck, rail, rail2], { r: 0.006, dens: 1.1, c0: 0.5, c1: 0.5 });
    // cabin
    const cab = sc.solid(0.04);
    cab.ell([-0.45, 0.58, 0], [0.55, 0.15, 0.3], { c: 0.72 });
    for (let k = 0; k < 3; k++) cab.ell([-0.75 + 0.3 * k, 0.61, 0.275], [0.07, 0.05, 0.03], { c: 0.05, sym: "z", k: 0.005 });
    // keel + rudder
    sc.sheet(quad([0.0, -0.02, 0.01], [0.7, -0.02, 0.01], [0.55, -0.7, 0.01], [0.3, -0.7, 0.01]), { dens: 0.9, thick: 0.01, c: 0.16 });
    sc.sheet(quad([-1.5, 0.2, 0.01], [-1.3, 0.2, 0.01], [-1.34, -0.3, 0.01], [-1.5, -0.25, 0.01]), { dens: 0.9, thick: 0.01, c: 0.5 });
    // mast, boom
    const rig = sc.solid(0.01);
    rig.tube([[0.35, 0.4, 0], [0.35, 2.2, 0], [0.35, 4.0, 0]], [0.045, 0.035, 0.018], { seg: 16, c: 0.58, k: 0.01 });
    rig.tube([[0.35, 0.98, 0], [-0.5, 1.0, 0], [-1.35, 1.03, 0]], [0.03, 0.025, 0.02], { seg: 12, c: 0.58, k: 0.01 });
    rig.sph([0.35, 4.03, 0], 0.03, { c: 0.84, k: 0.01 });
    // main sail
    const main = { u0: 0, u1: 1, v0: 0, v1: 1, eval(u: number, v: number, o: V3) { const w = 1.7 * (1 - v) * (1 + 0.14 * Math.sin(Math.PI * v)); o[0] = 0.33 - w * u; o[1] = 1.02 + 2.9 * v + 0.06 * u * (1 - v); o[2] = 0.32 * Math.sin(Math.PI * u) * (1 - 0.45 * v) * (1 - v * 0.2) + 0.04; } };
    sc.sheet(main, { dens: 1.4, thick: 0.004, c: (u, v) => 0.72 + 0.03 * Math.sin(v * 38) - 0.02 * u, al: 0.95 });
    const seams: V3[][] = []; for (let k = 1; k < 9; k++) { const v = k / 9, ln: V3[] = []; for (let i = 0; i <= 24; i++) { const o: V3 = [0, 0, 0]; main.eval(i / 24, v, o); ln.push(o); } seams.push(ln); }
    sc.strands(seams, { r: 0.0035, dens: 0.8, c0: 0.55, c1: 0.55 });
    // jib
    const jib = { u0: 0, u1: 1, v0: 0, v1: 1, eval(u: number, v: number, o: V3) { const tack: V3 = [2.0, 0.78, 0], head: V3 = [0.4, 3.55, 0], clew: V3 = [0.6, 1.0, 0]; const q = lerp3(tack, head, v), q2 = lerp3(clew, head, v), p = lerp3(q, q2, u); o[0] = p[0]; o[1] = p[1]; o[2] = 0.26 * Math.sin(Math.PI * u) * (1 - 0.5 * v) * 1.1 + 0.03; } };
    sc.sheet(jib, { dens: 1.3, thick: 0.004, c: (u, v) => 0.73 - 0.03 * u + 0.02 * Math.sin(v * 30), al: 0.95 });
    // rigging
    const wires: V3[][] = [[[0.4, 3.9, 0], [2.0, 0.75, 0]], [[0.33, 3.95, 0], [-1.48, 0.55, 0]], [[0.35, 2.7, 0], [0.2, 0.42, 0.52]], [[0.35, 2.7, 0], [0.2, 0.42, -0.52]], [[0.35, 1.8, 0], [0.55, 0.42, 0.5]], [[0.35, 1.8, 0], [0.55, 0.42, -0.5]]];
    sc.strands(wires, { r: 0.0035, dens: 1.2, c0: 0.3, c1: 0.3 });
    // pennant
    sc.sheet(xf(quad([0, 0, 0], [0.34, 0.04, 0], [0.34, 0.08, 0], [0, 0.1, 0]), (p, u) => [0.38 + p[0], 3.9 + p[1] - 0.04 * u, 0.05 * Math.sin(u * 5)]), { dens: 2, thick: 0.002, c: 0.84 });
    // sea
    const wave = (x: number, z: number) => 0.045 * Math.sin(2.6 * x + 1.5 * z) + 0.03 * Math.sin(4.1 * x - 2.2 * z + 1.3) + 0.02 * Math.sin(7 * x + 5 * z);
    sc.sheet({ u0: -1, u1: 1, v0: -1, v1: 1, eval(u: number, v: number, o: V3) { const x = 2.6 * u, z = 1.7 * v; o[0] = x - 0.1; o[1] = 0.2 + wave(x, z) - 0.04 * Math.exp(-(z * z) * 6) * Math.max(0, 1 - Math.abs(x) * 0.3); o[2] = z; } }, { dens: 0.5, thick: 0.006, c: (_u, _v, _x, y) => 0.14 + 0.2 * clamp01((y - 0.14) / 0.1), al: 0.75 });
    const foam: V3[][] = [];
    for (const sg of [-1, 1]) { const ln: V3[] = [], ln2: V3[] = []; for (let i = 0; i <= 30; i++) { const t = i / 30; ln.push([2.1 - 3.6 * t, 0.21 + 0.02 * Math.sin(t * 30), sg * (0.05 + 0.6 * t + 0.05 * Math.sin(t * 14))]); ln2.push([2.1 - 3.6 * t, 0.2 + 0.02 * Math.sin(t * 24 + 1), sg * (0.1 + 0.85 * t)]); } foam.push(ln, ln2); }
    sc.strands(foam, { r: 0.012, dens: 1.2, c0: 0.95, c1: 0.88, al: 0.8 });
  },
});

/* ───────────── Lighthouse ───────────── */
export const lighthouse = defineShape({
  id: "obj-lighthouse", name: "Lighthouse", tag: OBJ,
  description: "A striped coastal lighthouse on a rocky outcrop: tapered tower with windows and door, railed gallery, glazed lantern room with a blazing lamp, red cap, beams of light and the keeper's cottage.",
  palette: [[0, "#0b1220"], [0.15, "#3b3f4a"], [0.3, "#d83c33"], [0.45, "#2a7fbf"], [0.58, "#eef0f2"], [0.7, "#eef0f2"], [0.78, "#c9a24a"], [0.9, "#ffe27a"], [1, "#fffbe8"]],
  count: 130000, size: 0.0054, fit: 1.5, camera: { distance: 6.6, yaw: 0.45, pitch: 0.1, autoRotate: 0.08 },
  build(sc) {
    const rock = sc.solid(0.12);
    rock.ell([0, 0.1, 0], [1.9, 0.5, 1.6], { c: 0.14 }); rock.ell([-1.2, 0.1, 0.7], [0.9, 0.4, 0.8], { c: 0.12 }); rock.ell([1.25, 0.0, -0.5], [0.8, 0.35, 0.7], { c: 0.16 }); rock.ell([0.4, 0.0, 1.3], [0.7, 0.3, 0.5], { c: 0.14 });
    rock.disp = (x, y, z) => 0.1 * (vnoise(x * 2.6, y * 2.6, z * 2.6) - 0.5) + 0.04 * (vnoise(x * 9, y * 9, z * 9) - 0.5);
    rock.shade = (x, y, z, _nx, _ny, _nz, t) => t + 0.08 * (vnoise(x * 5, y * 5, z * 5) - 0.5) + 0.04 * y;
    const prof: Array<[number, number]> = [[0.7, 0.45], [0.64, 1.2], [0.55, 2.2], [0.47, 3.0], [0.43, 3.35]];
    const tower = lathe(prof);
    sc.sheet(tower, { dens: 1.6, thick: 0.004, c: (_u, _v, x, y) => (Math.floor((y - 0.45) / 0.62) % 2 === 0 ? 0.3 : 0.65) + 0.02 * vnoise(x * 8, y * 8, 0) });
    const wins: V3[][] = [];
    const win = (a: number, y: number, w: number, h: number) => {
      const r = radiusAt(prof, y) + 0.006, c = Math.cos(a), s = Math.sin(a), tn: V3 = [-s, 0, c], base: V3 = [r * c, y, r * s];
      const P = (dx: number, dy: number): V3 => [base[0] + tn[0] * dx, y + dy, base[2] + tn[2] * dx];
      sc.sheet(quad(P(-w, -h), P(w, -h), P(w, h), P(-w, h)), { dens: 2, thick: 0.002, c: 0.03 });
      wins.push([P(-w, -h), P(w, -h), P(w, h), P(-w, h), P(-w, -h)]);
    };
    [1.1, 1.75, 2.4, 3.0].forEach((y, k) => win(1.2 + k * 1.15, y, 0.05, 0.09));
    // door
    { const a = Math.PI / 2, y0 = 0.5, r = radiusAt(prof, 0.7) + 0.008; const P = (dx: number, dy: number): V3 => [r * Math.cos(a) - dx, y0 + dy, r * Math.sin(a)]; sc.sheet(quad(P(-0.12, 0), P(0.12, 0), P(0.12, 0.3), P(-0.12, 0.3)), { dens: 2, thick: 0.002, c: 0.46 }); wins.push([P(-0.12, 0), P(-0.12, 0.3), P(0.12, 0.3), P(0.12, 0), P(-0.12, 0)]); }
    // gallery
    sc.sheet(disc([0, 3.35, 0], 0.66, 0.4, "y"), { dens: 1.4, thick: 0.01, c: 0.78 }); sc.sheet(torus([0, 3.34, 0], 0.6, 0.03, "y"), { dens: 2, thick: 0.002, c: 0.78 });
    const rail: V3[][] = [circle([0, 3.6, 0], 0.64, 96, "y"), circle([0, 3.5, 0], 0.64, 96, "y")];
    for (let k = 0; k < 32; k++) { const a = (k / 32) * TAU; rail.push([[0.64 * Math.cos(a), 3.35, 0.64 * Math.sin(a)], [0.64 * Math.cos(a), 3.6, 0.64 * Math.sin(a)]]); }
    sc.strands([...rail, ...wins], { r: 0.005, dens: 1, c0: 0.78, c1: 0.78 });
    // lantern room
    const lant = lathe([[0.3, 3.38], [0.3, 3.65], [0.3, 3.95]]);
    sc.sheet(lant, { dens: 0.9, thick: 0.003, c: 0.64, al: 0.35 });
    const mull: V3[][] = []; for (let k = 0; k < 10; k++) mull.push(isoU(lant, k / 10, 4)); mull.push(circle([0, 3.38, 0], 0.3, 40, "y"), circle([0, 3.66, 0], 0.3, 40, "y"), circle([0, 3.95, 0], 0.31, 40, "y"));
    sc.strands(mull, { r: 0.007, dens: 1.2, c0: 0.78, c1: 0.78 });
    const lamp = sc.solid(0.03); lamp.ell([0, 3.67, 0], [0.12, 0.17, 0.12], { c: 1.0 }); lamp.ell([0, 3.67, 0], [0.19, 0.04, 0.19], { c: 0.9 });
    sc.points(0.55, (r, o) => { const a = r.next() * TAU, b = Math.acos(2 * r.next() - 1), rr = 0.24 * Math.cbrt(r.next()); o[0] = rr * Math.sin(b) * Math.cos(a); o[1] = 3.67 + rr * Math.cos(b) * 1.2; o[2] = rr * Math.sin(b) * Math.sin(a); o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0.95 + 0.05 * r.next(); o[8] = 0.5; });
    // roof
    const roofP: Array<[number, number]> = [[0.37, 3.95], [0.34, 4.03], [0.22, 4.2], [0.08, 4.33], [0.0, 4.4]];
    sc.sheet(lathe(roofP), { dens: 1.3, thick: 0.004, c: 0.3 });
    const cap = sc.solid(0.02); cap.sph([0, 4.43, 0], 0.05, { c: 0.78, k: 0.02 }); cap.tube([[0, 4.45, 0], [0, 4.75, 0]], [0.012, 0.006], { c: 0.78, seg: 6, k: 0.01 });
    // beams
    for (const sg of [-1, 1]) sc.points(0.35, (r, o) => { const s = Math.pow(r.next(), 0.8), len = 2.2, x = sg * (0.3 + len * s), spread = 0.04 + 0.3 * s, y = 3.67 + (r.next() - 0.5) * (0.03 + 0.07 * s), z = (r.next() - 0.5) * 2 * spread; o[0] = x; o[1] = y; o[2] = z; o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0.9 + 0.08 * r.next(); o[7] = 0.8; o[8] = 0.08 + 0.3 * (1 - s); });
    // keeper's cottage
    const hx = -1.15, hz = 0.45;
    sc.sheet(quad([hx - 0.45, 0.35, hz + 0.3], [hx + 0.45, 0.35, hz + 0.3], [hx + 0.45, 0.85, hz + 0.3], [hx - 0.45, 0.85, hz + 0.3]), { dens: 1.5, thick: 0.004, c: 0.6 });
    sc.sheet(quad([hx - 0.45, 0.35, hz - 0.3], [hx - 0.45, 0.35, hz + 0.3], [hx - 0.45, 0.85, hz + 0.3], [hx - 0.45, 0.85, hz - 0.3]), { dens: 1.5, thick: 0.004, c: 0.58 });
    sc.sheet(quad([hx + 0.45, 0.35, hz - 0.3], [hx + 0.45, 0.35, hz + 0.3], [hx + 0.45, 0.85, hz + 0.3], [hx + 0.45, 0.85, hz - 0.3]), { dens: 1.5, thick: 0.004, c: 0.58 });
    sc.sheet(quad([hx - 0.52, 0.82, hz + 0.36], [hx + 0.52, 0.82, hz + 0.36], [hx + 0.52, 1.12, hz], [hx - 0.52, 1.12, hz]), { dens: 1.6, thick: 0.006, c: 0.3 });
    sc.sheet(quad([hx - 0.52, 0.82, hz - 0.36], [hx + 0.52, 0.82, hz - 0.36], [hx + 0.52, 1.12, hz], [hx - 0.52, 1.12, hz]), { dens: 1.6, thick: 0.006, c: 0.3 });
    sc.sheet(quad([hx - 0.1, 0.35, hz + 0.305], [hx + 0.1, 0.35, hz + 0.305], [hx + 0.1, 0.62, hz + 0.305], [hx - 0.1, 0.62, hz + 0.305]), { dens: 2, thick: 0.002, c: 0.46 });
    sc.sheet(quad([hx + 0.22, 0.5, hz + 0.305], [hx + 0.38, 0.5, hz + 0.305], [hx + 0.38, 0.7, hz + 0.305], [hx + 0.22, 0.7, hz + 0.305]), { dens: 2, thick: 0.002, c: 0.03 });
    // sea swells
    const swell: V3[][] = [];
    for (let k = 0; k < 5; k++) { const R = 2.0 + k * 0.24, ln: V3[] = []; for (let i = 0; i <= 120; i++) { const a = (i / 120) * TAU; ln.push([R * Math.cos(a) * 1.05, 0.0 + 0.04 * Math.sin(a * 9 + k * 1.7) - 0.02 * k, R * Math.sin(a)]); } swell.push(ln); }
    sc.strands(swell, { r: 0.012, dens: 0.8, c0: 0.45, c1: 0.5, al: 0.8 });
  },
});

export const OBJECTS1_SHAPES: GeneratorDef[] = [rocket, ufo, sailboat, lighthouse];
