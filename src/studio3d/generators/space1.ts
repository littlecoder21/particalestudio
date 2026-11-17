import { defineShape, type V3 } from "./sculpt";
import { TAU, disc, circle, rotZ, tubeSurf } from "./objkit";
import { xf } from "./objkit";
import { SPACE, put, unitRand, clamp, smooth, ridge, fbm, vnoise, latlon, angTo, makeCraters, craterField, type Crater } from "./spacekit";

/* ───────────── Saturn ───────────── */
export const saturn = defineShape({
  id: "space-saturn", name: "Saturn with Rings", tag: SPACE,
  description: "Saturn as photographed by Cassini: an oblate, pale-gold banded globe tilted 26.7° inside the C, B and A rings with the dark Cassini Division and Encke gap, and the thin F ring outside.",
  palette: [[0, "#0b0906"], [0.12, "#4a3a2a"], [0.28, "#8a7355"], [0.45, "#c9a46a"], [0.6, "#e8cf98"], [0.75, "#f6e6bf"], [0.9, "#d8b982"], [1, "#fffaf0"]],
  count: 120000, size: 0.0046, fit: 1.5, camera: { distance: 6.4, yaw: 0.3, pitch: 0.2, autoRotate: 0.08 },
  build(sc) {
    const tilt = 0.466, ct = Math.cos(tilt), st = Math.sin(tilt);
    const planet = sc.solid(0.02);
    planet.ell([0, 0, 0], [1, 0.902, 1], {
      c: 0.55, dens: 1.5, rot: [0, 0, tilt],
      cg: (x, y, z) => {
        const px = x * ct + y * st, py = -x * st + y * ct, lat = py / 0.902;
        const turb = fbm(px * 2.2 + 3, lat * 5, z * 2.2);
        let t = 0.56 + 0.1 * Math.sin(lat * 17 + 2.4 * turb) + 0.05 * Math.sin(lat * 43 + 5 * turb) + 0.08 * (turb - 0.5);
        t -= 0.22 * smooth(0.62, 0.95, Math.abs(lat)); // greyer, bluer polar caps
        return clamp(t, 0.3, 0.8);
      },
    });
    const tilted = (s: ReturnType<typeof disc>) => xf(s, (p) => rotZ(p, tilt));
    const ring = (r0: number, r1: number, dens: number, tf: (r: number, u: number) => number, al: (r: number) => number = () => 1) => {
      const s = disc([0, 0, 0], r1, r0, "y");
      sc.sheet(tilted(s), { dens, thick: 0.004, c: (u, v) => tf(r0 + (r1 - r0) * v, u), alpha: (_u, v) => al(r0 + (r1 - r0) * v), rand: 0.8 });
    };
    const lets = (r: number, k: number) => vnoise(r * k, 3.1, 0.7);
    ring(1.24, 1.53, 0.55, (r) => 0.3 + 0.14 * lets(r, 60), (r) => 0.55 + 0.35 * smooth(1.24, 1.5, r)); // C ring (crêpe)
    ring(1.53, 1.95, 1.9, (r) => 0.62 + 0.2 * (lets(r, 50) - 0.5) + 0.1 * Math.sin(r * 70)); // B ring: densest, brightest
    ring(2.03, 2.21, 1.2, (r) => 0.52 + 0.16 * (lets(r, 40) - 0.5)); // A ring inner
    ring(2.23, 2.27, 1.2, (r) => 0.58 + 0.1 * lets(r, 80)); // A ring outer edge (beyond the Encke gap)
    ring(1.95, 2.03, 0.1, () => 0.25, () => 0.5); // Cassini Division is dim, not empty
    sc.strands([circle([0, 0, 0], 2.325, 160, "y").map((p) => rotZ(p, tilt))], { r: 0.006, dens: 0.7, c0: 0.68, c1: 0.68, al: 0.8 }); // F ring
    sc.strands([circle([0, 0, 0], 2.215, 160, "y").map((p) => rotZ(p, tilt))], { r: 0.004, dens: 0.3, c0: 0.4, c1: 0.4, al: 0.5 }); // Encke-gap ringlet
    // The planet's shadow and the ring's shadow on the globe are left to lighting; add a faint ring-plane dust halo.
    sc.points(0.8, (r, o) => { const a = r.next() * TAU, rr = 1.2 + 1.05 * Math.pow(r.next(), 1.4), p = rotZ([rr * Math.cos(a), r.gauss() * 0.01, rr * Math.sin(a)], tilt); put(o, p, [0, 1, 0], 0.4 + 0.2 * r.next(), 0.7, 0.35); });
  },
});

/* ───────────── Moon ───────────── */
const MARIA: Array<[number, number, number]> = [[35, -17, 0.34], [28, 18, 0.2], [8, 31, 0.22], [17, 59, 0.12], [-4, 52, 0.17], [-21, -15, 0.2], [15, -52, 0.46], [-3, 4, 0.1], [47, 6, 0.14]];
const FAMOUS: Array<[number, number, number]> = [[-43.3, -11.4, 0.07], [9.7, -20, 0.06], [8, -38, 0.035], [23.7, -47.4, 0.03], [51.6, -9.3, 0.05], [-58.8, -14, 0.09], [-8.9, 61, 0.05], [-25, 61, 0.05], [-5.5, -68, 0.06], [3, -5, 0.04], [-20, 2, 0.045], [-10, 8, 0.04]];
export const moon = defineShape({
  id: "space-moon", name: "The Moon", tag: SPACE,
  description: "The near side of the Moon: pale highlands peppered with hundreds of craters, the dark basalt maria (Imbrium, Serenitatis, Tranquillitatis, Crisium, Oceanus Procellarum), and Tycho's bright ray system.",
  palette: [[0, "#050506"], [0.2, "#34343a"], [0.4, "#6d6d72"], [0.6, "#a6a49e"], [0.8, "#d8d5cc"], [1, "#ffffff"]],
  count: 120000, size: 0.0052, fit: 1.4, camera: { distance: 4.6, yaw: 0, pitch: 0.1, autoRotate: 0.06 },
  build(sc) {
    const rng = sc.rng, maria = MARIA.map(([la, lo, r]) => ({ c: latlon(la, lo), r })), tycho = latlon(-43.3, -11.4), cope = latlon(9.7, -20);
    const mare = (p: V3) => { let m = 0; for (const k of maria) m = Math.max(m, 1 - smooth(0.72, 1.0, angTo(p, k.c) / k.r * 1.0)); return m; };
    const anchors: V3[] = []; for (let i = 0; i < 500; i++) anchors.push(unitRand(rng));
    const craters: Crater[] = FAMOUS.map(([la, lo, r]) => ({ c: latlon(la, lo), r, d: r * 0.24 }));
    for (const k of makeCraters(rng, anchors, 130, 0.016, 0.16, 1.9)) if (mare(k.c) < 0.5 || k.r < 0.03) craters.push(k);
    const tmp: V3 = [0, 0, 0], f2: V3 = [0, 0, 0];
    const ex = (c: V3): [V3, V3] => { const u = Math.abs(c[1]) < 0.9 ? [c[2], 0, -c[0]] : [1, 0, 0], l = Math.hypot(u[0], u[1], u[2]) || 1, uu: V3 = [u[0] / l, u[1] / l, u[2] / l]; return [uu, [c[1] * uu[2] - c[2] * uu[1], c[2] * uu[0] - c[0] * uu[2], c[0] * uu[1] - c[1] * uu[0]]]; };
    const [tu, tv] = ex(tycho), [cu, cv] = ex(cope);
    const rays = (p: V3, c: V3, u: V3, v: V3, reach: number, k: number) => {
      const d = angTo(p, c); if (d < 0.06 || d > reach) return 0;
      const a = Math.atan2(p[0] * v[0] + p[1] * v[1] + p[2] * v[2], p[0] * u[0] + p[1] * u[1] + p[2] * u[2]);
      const ray = Math.pow(Math.max(0, Math.sin(a * 11 + 6 * vnoise(a * 3, d * 4, 1))), 6);
      return ray * Math.exp(-d * k) * smooth(0.06, 0.16, d);
    };
    const moonS = sc.solid(0.02);
    moonS.sph([0, 0, 0], 1, { c: 0.6, dens: 1.7 });
    moonS.disp = (x, y, z) => {
      const l = Math.hypot(x, y, z) || 1; tmp[0] = x / l; tmp[1] = y / l; tmp[2] = z / l;
      const cf = craterField(tmp, craters, f2);
      return cf[0] + 0.01 * (fbm(tmp[0] * 3, tmp[1] * 3, tmp[2] * 3) - 0.5) + 0.004 * (vnoise(tmp[0] * 18, tmp[1] * 18, tmp[2] * 18) - 0.5) - 0.006 * mare(tmp);
    };
    moonS.shade = (x, y, z) => {
      const l = Math.hypot(x, y, z) || 1, p: V3 = [x / l, y / l, z / l], cf = craterField(p, craters, f2), m = mare(p);
      const hi = 0.64 + 0.2 * (fbm(p[0] * 7, p[1] * 7, p[2] * 7) - 0.5) + 0.08 * (vnoise(p[0] * 30, p[1] * 30, p[2] * 30) - 0.5);
      const lo = 0.27 + 0.1 * (fbm(p[0] * 5 + 9, p[1] * 5, p[2] * 5) - 0.5);
      let t = hi + (lo - hi) * m;
      t -= 0.07 * cf[1] * (1 - m); t += 0.16 * cf[2] * (1 - 0.6 * m);
      t += 0.34 * rays(p, tycho, tu, tv, 1.35, 1.6) + 0.18 * rays(p, cope, cu, cv, 0.5, 3);
      return clamp(t, 0.12, 1);
    };
  },
});

/* ───────────── Sun ───────────── */
export const sun = defineShape({
  id: "space-sun", name: "The Sun", tag: SPACE,
  description: "A solar-physics view of the Sun: boiling photospheric granulation, dark sunspot groups with bright plages, arching red prominence loops following magnetic field lines, and the white corona with equatorial streamers and polar plumes.",
  palette: [[0, "#2a0500"], [0.2, "#c2200a"], [0.4, "#ff6a10"], [0.6, "#ffa820"], [0.8, "#ffd860"], [1, "#fffbe8"]],
  count: 130000, size: 0.0046, fit: 1.5, camera: { distance: 6.2, yaw: 0.2, pitch: 0.12, autoRotate: 0.07 },
  deformers: [{ type: "noise", amount: 0.012, scale: 3, speed: 0.6 }],
  build(sc) {
    const rng = sc.rng, spots: Array<{ c: V3; r: number }> = [];
    for (let i = 0; i < 7; i++) { const side = i % 2 ? 1 : -1, lat = side * (8 + rng.next() * 22), lon = rng.next() * 360; spots.push({ c: latlon(lat, lon), r: 0.05 + 0.06 * rng.next() }); }
    const star = sc.solid(0.02);
    star.sph([0, 0, 0], 1, { c: 0.75, dens: 1.6 });
    star.disp = (x, y, z) => { const l = Math.hypot(x, y, z) || 1, a = x / l, b = y / l, c = z / l; return 0.016 * (fbm(a * 15, b * 15, c * 15) - 0.5) + 0.006 * (vnoise(a * 40, b * 40, c * 40) - 0.5); };
    star.shade = (x, y, z) => {
      const l = Math.hypot(x, y, z) || 1, p: V3 = [x / l, y / l, z / l];
      const gran = fbm(p[0] * 15, p[1] * 15, p[2] * 15), lane = ridge(p[0] * 26, p[1] * 26, p[2] * 26);
      let t = 0.7 + 0.3 * (gran - 0.5) * 1.4 - 0.1 * smooth(0.82, 0.96, lane);
      t += 0.12 * (fbm(p[0] * 4 + 7, p[1] * 4, p[2] * 4) - 0.5);
      for (const s of spots) {
        const d = angTo(p, s.c) / s.r;
        if (d < 1) t = Math.min(t, 0.06 + 0.12 * d * d + 0.05 * vnoise(p[0] * 60, p[1] * 60, p[2] * 60)); // umbra
        else if (d < 2) t = Math.min(t, 0.3 + 0.3 * (d - 1) * (0.7 + 0.5 * ridge(p[0] * 40, p[1] * 40, p[2] * 40))); // filamentary penumbra
        else if (d < 3.4) t = Math.max(t, 0.88 + 0.1 * (1 - (d - 2) / 1.4) * vnoise(p[0] * 30, p[1] * 30, p[2] * 30)); // bright plage
      }
      return clamp(t, 0.02, 1);
    };
    // prominence loops: arcs between two surface points, flung out along the field
    const slerp = (a: V3, b: V3, t: number): V3 => { const w = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)) || 1e-3, s = Math.sin(w), k0 = Math.sin((1 - t) * w) / s, k1 = Math.sin(t * w) / s; return [a[0] * k0 + b[0] * k1, a[1] * k0 + b[1] * k1, a[2] * k0 + b[2] * k1]; };
    for (let i = 0; i < 9; i++) {
      const a = i < spots.length ? spots[i].c : unitRand(rng), b0 = unitRand(rng), sep = 0.28 + 0.35 * rng.next();
      const dir: V3 = [b0[0] - a[0] * (a[0] * b0[0] + a[1] * b0[1] + a[2] * b0[2]), b0[1] - a[1] * (a[0] * b0[0] + a[1] * b0[1] + a[2] * b0[2]), b0[2] - a[2] * (a[0] * b0[0] + a[1] * b0[1] + a[2] * b0[2])];
      const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1, bb: V3 = [a[0] * Math.cos(sep) + dir[0] / dl * Math.sin(sep), a[1] * Math.cos(sep) + dir[1] / dl * Math.sin(sep), a[2] * Math.cos(sep) + dir[2] / dl * Math.sin(sep)];
      const H = 0.18 + 0.5 * sep + 0.15 * rng.next();
      const curve = (t: number): V3 => { const q = slerp(a, bb, t), h = 1 - 0.02 + H * Math.sin(Math.PI * t) ** 0.8; return [q[0] * h, q[1] * h, q[2] * h]; };
      sc.sheet(tubeSurf(curve, (t) => 0.012 + 0.016 * Math.sin(Math.PI * t), 0.02, 0.98), { dens: 4.5, thick: 0.004, c: (u) => 0.22 + 0.16 * Math.sin(u * 6) * Math.sin(u * 6) + 0.08 * u, al: 0.9 });
      const lines: V3[][] = []; for (let k = 0; k < 4; k++) { const off = 0.012 * (k - 1.5), cc = (t: number): V3 => { const q = curve(t); return [q[0] + off, q[1] + off * 0.5, q[2] - off]; }; const ln: V3[] = []; for (let s = 0; s <= 24; s++) ln.push(cc(0.02 + 0.96 * s / 24)); lines.push(ln); }
      sc.strands(lines, { r: 0.004, dens: 0.8, c0: 0.3, c1: 0.5, al: 0.8 });
    }
    // corona: haze concentrated toward the equator, bright streamers, polar plumes
    sc.points(10, (r, o) => {
      const d = unitRand(r), eq = 0.3 + 0.7 * (1 - Math.pow(Math.abs(d[1]), 1.6)); if (r.next() > eq) { const e = unitRand(r); d[0] = e[0]; d[1] = e[1] * 0.4; d[2] = e[2]; }
      const rad = 1.03 + -Math.log(1 - r.next() * 0.985) * 0.3, n = fbm(d[0] * 3 + rad, d[1] * 3, d[2] * 3);
      put(o, [d[0] * rad, d[1] * rad, d[2] * rad], d, 0.82 + 0.18 * (1 - smooth(1, 2.2, rad)), 0.8, (0.18 + 0.4 * n) * (1 - smooth(1.3, 2.9, rad)));
    });
    const streams: V3[][] = [];
    for (let i = 0; i < 18; i++) { const a = rng.next() * TAU, la = rng.gauss() * 0.28, d: V3 = [Math.cos(a) * Math.cos(la), Math.sin(la), Math.sin(a) * Math.cos(la)], L = 1.5 + 1.3 * rng.next(), ln: V3[] = []; for (let s = 0; s <= 12; s++) { const r = 1.02 + (L - 1.02) * s / 12, bend = 0.04 * s * s / 12; ln.push([d[0] * r, d[1] * r + bend * Math.sign(la), d[2] * r]); } streams.push(ln); }
    sc.strands(streams, { r: 0.012, dens: 0.18, c0: 0.92, c1: 0.85, sz: 0.8, al: 0.45, taper: true });
    const plumes: V3[][] = [];
    for (let i = 0; i < 20; i++) { const a = rng.next() * TAU, th = 0.1 + 0.35 * rng.next(), sg = i % 2 ? 1 : -1, ln: V3[] = []; for (let s = 0; s <= 8; s++) { const r = 1.02 + 0.7 * s / 8, k = th * (1 + 0.5 * s / 8); ln.push([Math.sin(k) * Math.cos(a) * r, sg * Math.cos(k) * r, Math.sin(k) * Math.sin(a) * r]); } plumes.push(ln); }
    sc.strands(plumes, { r: 0.005, dens: 0.15, c0: 0.95, c1: 0.9, sz: 0.7, al: 0.4 });
  },
});

/* ───────────── Spiral galaxy ───────────── */
export const galaxy = defineShape({
  id: "space-galaxy", name: "Spiral Galaxy", tag: SPACE,
  description: "A barred spiral galaxy like the Milky Way: a golden bulge and central bar, two grand logarithmic spiral arms and two minor ones threaded with blue young stars and pink star-forming regions, a thin exponential disc and a faint halo.",
  palette: [[0, "#080414"], [0.15, "#2a1a6a"], [0.3, "#3a6aff"], [0.45, "#8ab4ff"], [0.58, "#ff6ab0"], [0.7, "#ffd9a0"], [0.85, "#ffe9b8"], [1, "#ffffff"]],
  count: 140000, size: 0.0036, fit: 1.5, camera: { distance: 5.4, yaw: 0.4, pitch: 0.85, autoRotate: 0.05 },
  deformers: [{ type: "rotate", amount: 0.035, scale: 0.55, axis: "y" }],
  build(sc) {
    const A = 0.24, B = 0.2, TH = 9.2, barA = 0.55, cb = Math.cos(barA), sb = Math.sin(barA);
    const arm = (k: number, nArms: number, w: number, th0: number, th1: number, hii: number) => sc.points(w, (r, o) => {
      const th = th0 + (th1 - th0) * Math.pow(r.next(), 0.85), rad0 = A * Math.exp(B * th), sig = 0.03 + 0.05 * rad0, rad = Math.max(0.05, rad0 + r.gauss() * sig), ph = th + (k * TAU) / nArms + r.gauss() * 0.035 + barA;
      const x = rad * Math.cos(ph), z = rad * Math.sin(ph), h = (0.012 + 0.06 * Math.exp(-rad * rad / 0.1)) * r.gauss() + 0.05 * rad * rad * Math.sin(ph - 0.6);
      const knot = r.next() < hii, t = knot ? 0.58 : clamp(0.9 - 0.58 * smooth(0.12, 1.4, rad) + (r.next() - 0.5) * 0.12, 0.1, 1);
      put(o, [x, h, z], [0, 1, 0], t, knot ? 1.7 : 0.7 + 0.5 * r.next(), knot ? 0.95 : 0.5 + 0.4 * r.next());
    });
    arm(0, 2, 15, 0.2, TH, 0.05); arm(1, 2, 15, 0.2, TH, 0.05);
    arm(0.5, 2, 4.5, 3.2, 8.2, 0.04); arm(1.5, 2, 4.5, 3.2, 8.2, 0.04);
    sc.points(6, (r, o) => { const rad = Math.min(2.0, -0.55 * Math.log(1 - r.next() * 0.995)), a = r.next() * TAU; put(o, [rad * Math.cos(a), r.gauss() * 0.02, rad * Math.sin(a)], [0, 1, 0], clamp(0.62 - 0.22 * rad, 0.2, 0.7), 0.55, 0.28); }); // inter-arm disc
    sc.points(6, (r, o) => { const x = r.gauss() * 0.2, y = r.gauss() * 0.14, z = r.gauss() * 0.2; put(o, [x, y, z], unitRand(r), 0.9 + 0.1 * r.next(), 0.8 + 0.4 * r.next(), 0.8); }); // bulge
    sc.points(4.5, (r, o) => { const u = clamp(r.gauss() * 0.34, -0.62, 0.62), v = r.gauss() * 0.075; put(o, [u * cb - v * sb, r.gauss() * 0.04, u * sb + v * cb], [0, 1, 0], 0.84 + 0.1 * r.next(), 0.8, 0.8); }); // bar
    sc.points(1.2, (r, o) => { const d = unitRand(r), rad = 0.4 + 1.2 * Math.pow(r.next(), 1.6); put(o, [d[0] * rad, d[1] * rad * 0.3, d[2] * rad], d, 0.78 + 0.2 * r.next(), 0.9, 0.3); }); // halo
  },
});

/* ───────────── Black hole ───────────── */
export const blackHole = defineShape({
  id: "space-black-hole", name: "Black Hole", tag: SPACE,
  description: "A rotating black hole: a perfectly empty shadow ringed by the thin photon-sphere glow, a thick accretion disc spiralling in from the ISCO with relativistic Doppler beaming (one side brighter), and faint twin polar jets.",
  palette: [[0, "#12062a"], [0.2, "#5a1a7a"], [0.4, "#d2302a"], [0.6, "#ff8a24"], [0.8, "#ffd27a"], [1, "#ffffff"]],
  count: 130000, size: 0.0044, fit: 1.5, camera: { distance: 8, yaw: 0.3, pitch: 0.42, autoRotate: 0.07 },
  deformers: [{ type: "rotate", amount: 0.06, scale: 1.1, axis: "y" }],
  build(sc) {
    const RIN = 1.5, ROUT = 4.4, RPH = 0.78;
    sc.points(22, (r, o) => {
      let rad = 0, a = 0, ok = false;
      for (let i = 0; i < 12 && !ok; i++) {
        rad = RIN * Math.pow(ROUT / RIN, r.next()); a = r.next() * TAU;
        const psi = a + 2.6 * Math.log(rad), acc = (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(2 * psi), 1.4)) * (0.72 + 0.28 * Math.sin(rad * 34)) * (0.8 + 0.2 * fbm(rad * 3, a * 2, 1));
        ok = r.next() < acc;
      }
      const dop = Math.cos(a - 0.4), hot = 1 - Math.pow(smooth(RIN, ROUT, rad), 0.55), t = clamp(hot * 0.92 + 0.1 * dop + 0.05 * (r.next() - 0.5), 0.04, 1);
      put(o, [rad * Math.cos(a), r.gauss() * (0.008 + 0.018 * rad), rad * Math.sin(a)], [0, 1, 0], t, 0.7 + 0.8 * hot, clamp(0.5 + 0.42 * dop + 0.2 * hot, 0.15, 1));
    });
    sc.points(5, (r, o) => { const d = unitRand(r), rad = RPH + Math.abs(r.gauss()) * 0.035; put(o, [d[0] * rad, d[1] * rad, d[2] * rad], d, 0.9 + 0.1 * r.next(), 1.1, 0.85); }); // photon sphere
    sc.strands([circle([0, 0, 0], RPH + 0.01, 120, "y"), circle([0, 0, 0], RPH + 0.01, 120, "x"), circle([0, 0, 0], RPH + 0.01, 120, "z")], { r: 0.008, dens: 0.35, c0: 1, c1: 1, al: 0.9 });
    sc.points(3.2, (r, o) => { const h = 0.7 * Math.pow(3.2 / 0.7, r.next()), sg = r.next() < 0.5 ? 1 : -1, ph = h * 5.5 + r.next() * 0.4, rho = (0.04 + 0.055 * h) * (0.5 + 0.5 * Math.sqrt(r.next())); put(o, [rho * Math.cos(ph), sg * h, rho * Math.sin(ph)], [Math.cos(ph), 0, Math.sin(ph)], 0.14 + 0.1 * r.next(), 0.7, 0.45 * (1 - 0.5 * smooth(1, 3.2, h))); });
  },
});

/* ───────────── Wormhole ───────────── */
export const wormhole = defineShape({
  id: "space-wormhole", name: "Wormhole", tag: SPACE,
  description: "A traversable Morris–Thorne wormhole drawn as its embedding catenoid: two flared mouths narrowing to a glowing throat, a latitude-longitude grid twisting with the flow, and light streaming helically through the tunnel.",
  palette: [[0, "#050a28"], [0.25, "#2a2aff"], [0.45, "#1ad6ff"], [0.65, "#b44aff"], [0.85, "#ff7ad0"], [1, "#ffffff"]],
  count: 110000, size: 0.0044, fit: 1.5, camera: { distance: 7, yaw: 0.5, pitch: 0.28, autoRotate: 0.1 },
  deformers: [{ type: "twist", amount: 0.25, speed: 0.5, axis: "y" }],
  build(sc) {
    const b = 0.5, Y = 1.15, R = (y: number) => b * Math.cosh(y / b), tw = 0.6;
    const surf = { u0: 0, u1: TAU, v0: 0, v1: 1, eval(u: number, v: number, out: { [i: number]: number }) { const y = -Y + 2 * Y * v, r = R(y), a = u + tw * y; out[0] = r * Math.cos(a); out[1] = y; out[2] = r * Math.sin(a); } };
    sc.sheet(surf, { dens: 0.55, thick: 0.004, c: (_u, v) => 0.92 - 0.55 * smooth(0, 1, Math.abs(2 * v - 1)) ** 0.8, al: 0.55 });
    const lat: V3[][] = [], lon: V3[][] = [];
    for (let k = -5; k <= 5; k++) { const y = (k / 5) * Y; lat.push(Array.from({ length: 97 }, (_, i): V3 => { const a = (i / 96) * TAU + tw * y; return [R(y) * Math.cos(a), y, R(y) * Math.sin(a)]; })); }
    for (let k = 0; k < 24; k++) { const u = (k / 24) * TAU; lon.push(Array.from({ length: 41 }, (_, i): V3 => { const y = -Y + (2 * Y * i) / 40, a = u + tw * y; return [R(y) * Math.cos(a), y, R(y) * Math.sin(a)]; })); }
    sc.strands(lat, { r: 0.0055, dens: 0.9, c0: 0.55, c1: 0.55, al: 0.9 });
    sc.strands(lon, { r: 0.0045, dens: 0.55, c0: 0.4, c1: 0.4, al: 0.8 });
    sc.strands([Array.from({ length: 97 }, (_, i): V3 => { const a = (i / 96) * TAU; return [b * Math.cos(a), 0, b * Math.sin(a)]; })], { r: 0.012, dens: 3, c0: 1, c1: 1, al: 1 }); // throat
    const flow: V3[][] = [];
    for (let k = 0; k < 14; k++) { const u = (k / 14) * TAU, rr = 0.55 + 0.35 * ((k * 7) % 5) / 4; flow.push(Array.from({ length: 80 }, (_, i): V3 => { const y = -Y * 1.05 + (2.1 * Y * i) / 79, a = u + 2.4 * y + tw * y; return [R(y) * rr * Math.cos(a), y, R(y) * rr * Math.sin(a)]; })); }
    sc.strands(flow, { r: 0.0055, dens: 0.75, c0: 0.3, c1: 0.9, al: 0.9 });
    sc.points(3, (r, o) => { const y = (r.next() * 2 - 1) * Y, rr = R(y) * 0.92 * Math.sqrt(r.next()), a = r.next() * TAU; put(o, [rr * Math.cos(a), y, rr * Math.sin(a)], unitRand(r), 0.55 + 0.45 * (1 - Math.abs(y) / Y) * r.next(), 0.8, 0.6); });
  },
});

/* ───────────── Nebula (Pillars of Creation) ───────────── */
export const nebula = defineShape({
  id: "space-nebula", name: "Nebula Pillars", tag: SPACE,
  description: "The Pillars of Creation in the Eagle Nebula: three towers of cold gas and dust with glowing ionised edges and teal fringes at their evaporating tips, set against a ridged wispy emission cloud and a scatter of newborn stars.",
  palette: [[0, "#120806"], [0.15, "#5a2a14"], [0.3, "#b4501c"], [0.45, "#ff9a3a"], [0.6, "#ffd28a"], [0.72, "#6ad6c0"], [0.85, "#4a8aff"], [1, "#e6f2ff"]],
  count: 130000, size: 0.0046, fit: 1.5, camera: { distance: 7, yaw: 0.25, pitch: 0.1, autoRotate: 0.06 },
  build(sc) {
    const P = [{ x: -0.6, z: 0.0, h: 1.95, w: 0.26, s: 1 }, { x: 0.05, z: 0.12, h: 2.5, w: 0.33, s: 2 }, { x: 0.72, z: -0.08, h: 1.55, w: 0.23, s: 3 }];
    const width = (p: typeof P[number], s: number) => p.w * (0.5 + 1.5 * Math.pow(1 - s, 2.6)) * Math.sqrt(Math.max(0.001, 1 - Math.pow(s, 5)));
    const axis = (p: typeof P[number], s: number): [number, number] => [p.x + 0.12 * Math.sin(s * 4.2 + p.s) + 0.06 * (fbm(s * 3, p.s, 0.3) - 0.5), p.z + 0.07 * Math.sin(s * 3 + p.s * 2)];
    for (const p of P) {
      sc.points(7.5 * p.h / 2, (r, o) => {
        let s = 0; for (let i = 0; i < 14; i++) { s = Math.pow(r.next(), 0.8); const w = width(p, s) / (p.w * 2); if (r.next() < w * w * 1.4) break; }
        const a = r.next() * TAU, w = width(p, s), wob = 0.82 + 0.4 * fbm(Math.cos(a) * 2 + s * 5, Math.sin(a) * 2, p.s), rim = 0.55 + 0.45 * Math.sqrt(r.next()), rho = w * wob * rim, [cx, cz] = axis(p, s);
        const pos: V3 = [cx + rho * Math.cos(a), s * p.h, cz + rho * Math.sin(a)], lit = clamp(0.5 + 0.5 * Math.cos(a - 0.9), 0, 1), edge = rim * rim, tip = smooth(0.82, 1, s);
        let t = 0.1 + 0.2 * (1 - edge) + 0.32 * edge * (0.3 + 0.7 * lit) + 0.1 * s;
        if (r.next() < 0.05 + 0.5 * tip) t = 0.72 + 0.1 * r.next();
        put(o, pos, [Math.cos(a), 0, Math.sin(a)], clamp(t + 0.05 * (r.next() - 0.5), 0, 1), 0.8 + 0.6 * edge, 0.45 + 0.5 * edge);
      });
    }
    sc.points(14, (r, o) => { // wispy emission cloud: ridged-noise filaments behind the pillars
      let x = 0, y = 0, z = 0, ok = false;
      for (let i = 0; i < 20 && !ok; i++) { x = (r.next() * 2 - 1) * 2.1; y = r.next() * 3.3 - 0.2; z = -0.3 - r.next() * 1.6; ok = r.next() < Math.pow(ridge(x * 1.2, y * 1.2, z * 1.2), 3.5) * (0.4 + 0.6 * fbm(x * 0.8, y * 0.8, z * 0.8)); }
      const h = clamp(y / 3.2, 0, 1), t = 0.62 + 0.26 * h + 0.1 * (fbm(x * 2, y * 2, z * 2) - 0.5);
      put(o, [x, y, z], unitRand(r), clamp(t, 0.5, 0.95), 0.7, 0.22 + 0.28 * fbm(x * 3, y * 3, z * 3));
    });
    sc.points(1.2, (r, o) => { const x = (r.next() * 2 - 1) * 2.3, y = r.next() * 3.8 - 0.4, z = (r.next() * 2 - 1) * 1.8; put(o, [x, y, z], unitRand(r), 0.9 + 0.1 * r.next(), 1.4 + 1.6 * Math.pow(r.next(), 3), 1); }); // stars
  },
});

/* ───────────── Asteroid ───────────── */
export const asteroid = defineShape({
  id: "space-asteroid", name: "Asteroid", tag: SPACE,
  description: "A rubble-pile asteroid in the style of Itokawa and Eros: a peanut-shaped contact binary with a smooth neck, craters of all sizes with raised rims, scattered boulders and dark carbonaceous regolith.",
  palette: [[0, "#0a0806"], [0.3, "#3a3028"], [0.5, "#6b5d4d"], [0.7, "#9a8a73"], [1, "#e8dcc4"]],
  count: 120000, size: 0.0048, fit: 1.4, camera: { distance: 5.6, yaw: 0.4, pitch: 0.2, autoRotate: 0.09 },
  build(sc) {
    const rng = sc.rng, body = sc.solid(0.3);
    body.ell([-0.58, 0, 0], [1.08, 0.64, 0.6], { c: 0.5, dens: 1.5, rot: [0.2, 0.1, 0.05] });
    body.ell([0.72, 0.05, 0.02], [0.86, 0.54, 0.5], { c: 0.5, dens: 1.5, rot: [-0.1, 0.2, -0.05] });
    const surf = (d: V3): V3 => { let lo = 0, hi = 3; for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (body.sdf(d[0] * m, d[1] * m, d[2] * m) < 0) lo = m; else hi = m; } return [d[0] * lo, d[1] * lo, d[2] * lo]; };
    const anchors: V3[] = []; for (let i = 0; i < 160; i++) anchors.push(surf(unitRand(rng)));
    const craters: Crater[] = makeCraters(rng, anchors, 46, 0.07, 0.34, 1.6);
    const boulders = anchors.slice(0, 60).map((c) => ({ c, r: 0.035 + 0.07 * rng.next(), h: 0.04 + 0.06 * rng.next() }));
    const f2: V3 = [0, 0, 0], tmp: V3 = [0, 0, 0];
    body.disp = (x, y, z) => {
      tmp[0] = x; tmp[1] = y; tmp[2] = z; let h = craterField(tmp, craters, f2)[0] + 0.07 * (fbm(x * 2.2, y * 2.2, z * 2.2) - 0.5) + 0.012 * (vnoise(x * 14, y * 14, z * 14) - 0.5);
      for (const b of boulders) { const d2 = (x - b.c[0]) ** 2 + (y - b.c[1]) ** 2 + (z - b.c[2]) ** 2; if (d2 < b.r * b.r * 6) h += b.h * Math.exp(-d2 / (b.r * b.r) * 2.2); }
      return h;
    };
    body.shade = (x, y, z) => {
      tmp[0] = x; tmp[1] = y; tmp[2] = z; const cf = craterField(tmp, craters, f2); let t = 0.42 + 0.22 * (fbm(x * 3, y * 3, z * 3) - 0.5) + 0.1 * (vnoise(x * 20, y * 20, z * 20) - 0.5) + 0.2 * cf[2] - 0.08 * cf[1];
      for (const b of boulders) { const d2 = (x - b.c[0]) ** 2 + (y - b.c[1]) ** 2 + (z - b.c[2]) ** 2; if (d2 < b.r * b.r) t += 0.2 * (1 - d2 / (b.r * b.r)); }
      return clamp(t, 0.08, 1);
    };
  },
});

export const SPACE1_SHAPES = [saturn, moon, sun, galaxy, blackHole, wormhole, nebula, asteroid];
