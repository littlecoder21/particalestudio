import type { GeneratorDef, Vec3 } from "../types";
import { TAU, clamp, fbm, lerp, smoothstep, anyPerp } from "../math";
import { sampleSurfaces, sampleDensity, sampleMesh, Curve, type ParamSurface } from "../sampling";
import { num, str, range, select, samplingParams, surfaceOptions, put, writeBatch } from "./common";

/* ───────────── 11. Volumetric Smoke ───────────── */
export const smoke: GeneratorDef = {
  id: "smoke", name: "Volumetric Smoke", tag: "Rising plume", method: "Rejection sampling of a domain-warped noise density",
  description: "A turbulent, swirling plume sampled from a 3D density field; curl flow keeps it moving.",
  params: [range("height", "Height", 0.8, 1.6, 0.01, 1.2), range("width", "Base width", 0.08, 0.5, 0.01, 0.2), range("spread", "Spread with height", 0, 0.8, 0.01, 0.38), range("turbulence", "Turbulence scale", 0.5, 4, 0.05, 1.8), range("swirl", "Swirl", 0, 3, 0.05, 1.3), range("contrast", "Wispiness", 0, 1, 0.01, 0.7)],
  recipe: { count: 70000, look: { palette: [{ t: 0, color: "#ffb45e" }, { t: 0.35, color: "#ff6a5c" }, { t: 0.7, color: "#7a5cff" }, { t: 1, color: "#9fd7ff" }], size: 0.011, opacity: 0.5, glow: 0.6, blend: "additive", softness: 1 }, behaviors: [{ type: "home", intensity: 5, aux: 0.5 }, { type: "curl", intensity: 1.1, scale: 1.3, speed: 0.35 }, { type: "drag", intensity: 1.6 }], deformers: [{ type: "noise", amount: 0.06, scale: 1.2, speed: 0.3 }], camera: { pitch: 0.05, yaw: 0.2, distance: 3.9, autoRotate: 0.08 } },
  generate(ctx, f) {
    const { rng, params: p } = ctx, H = num(p, "height", 1.2), w0 = num(p, "width", 0.2), w1 = num(p, "spread", 0.38), ts = num(p, "turbulence", 1.8), sw = num(p, "swirl", 1.3), ct = num(p, "contrast", 0.7), off = ctx.seed * 0.011;
    const dens = (x: number, y: number, z: number) => {
      const h = (y + H / 2) / H; if (h < 0 || h > 1) return 0;
      const a = sw * h * 2.2, ca = Math.cos(a), sa = Math.sin(a), rx = x * ca - z * sa, rz = x * sa + z * ca;
      const wx = fbm(rx * ts + off, y * ts - 2, rz * ts) - 0.5, wz = fbm(rx * ts + 7, y * ts + off, rz * ts + 3) - 0.5, sig = w0 + w1 * Math.pow(h, 0.8);
      const qx = rx + wx * sig * 1.6, qz = rz + wz * sig * 1.6, r2 = (qx * qx + qz * qz) / (2 * sig * sig);
      const n = fbm(qx * ts * 1.4, y * ts * 1.4 - off, qz * ts * 1.4);
      return Math.exp(-r2) * smoothstep(0, 0.07, h) * (1 - smoothstep(0.78, 1, h)) * lerp(1, smoothstep(0.3, 0.75, n), ct);
    };
    const b = sampleDensity(dens, [-1.1, -H / 2, -1.1], [1.1, H / 2, 1.1], f.n, rng);
    for (let i = 0; i < f.n; i++) { const o = i * 3, h = clamp((b.pos[o + 1] + H / 2) / H, 0, 1); put(f, i, b.pos[o], b.pos[o + 1], b.pos[o + 2], h, 1 + 0.6 * rng.next(), 0.55 + 0.45 * rng.next(), 1); }
  },
};

/* ───────────── 12. Particle Fabric ───────────── */
export const fabric: GeneratorDef = {
  id: "fabric", name: "Particle Fabric", tag: "Flowing silk", method: "Ribbon surfaces on parallel-transport curve frames, fold displacement, density bias",
  description: "Layered silk ribbons that twist, fold and flow. The wave deformer keeps the cloth moving and some particles detach and return.",
  params: [
    range("layers", "Layers", 1, 5, 1, 3), range("width", "Width", 0.3, 1.5, 0.01, 0.85), range("twist", "Twist", 0, 4, 0.05, 1.3), range("folds", "Fold depth", 0, 0.5, 0.01, 0.17), range("foldFreq", "Fold frequency", 1, 10, 0.1, 3.4),
    range("edgeBias", "Edge density", 0, 3, 0.05, 0.9, "More particles along the ribbon edges."), range("layerGap", "Layer offset", 0, 0.6, 0.01, 0.22), range("thickness", "Cloth thickness", 0, 0.05, 0.001, 0.01), ...samplingParams(),
  ],
  recipe: { count: 90000, look: { palette: [{ t: 0, color: "#5b3bff" }, { t: 0.45, color: "#c04bff" }, { t: 0.75, color: "#ff7ab3" }, { t: 1, color: "#ffe6f2" }], size: 0.0064, opacity: 0.75, glow: 0.85, depthFade: 0.35, softness: 0.9 }, behaviors: [{ type: "release", intensity: 0.1, speed: 0.18, aux: 0.7 }, { type: "home", intensity: 40, aux: 0.7 }, { type: "curl", intensity: 1.6, scale: 1.1, speed: 0.4 }, { type: "drag", intensity: 1.4 }], deformers: [{ type: "wave", amount: 0.08, scale: 0.8, speed: 0.9, axis: "x" }, { type: "noise", amount: 0.04, scale: 0.9, speed: 0.25 }], camera: { pitch: 0.2, yaw: 0.35, distance: 3.8, autoRotate: 0.1 } },
  generate(ctx, f) {
    const p = ctx.params, L = Math.round(num(p, "layers", 3)), W = num(p, "width", 0.85), tw = num(p, "twist", 1.3), fd = num(p, "folds", 0.17), ff = num(p, "foldFreq", 3.4), eb = num(p, "edgeBias", 0.9), gap = num(p, "layerGap", 0.22);
    const surfs: ParamSurface[] = [], P: Vec3 = [0, 0, 0], T: Vec3 = [0, 0, 0], N: Vec3 = [0, 0, 0], B: Vec3 = [0, 0, 0];
    for (let l = 0; l < L; l++) {
      const ph = l * 0.8 + ctx.seed * 0.003;
      const curve = new Curve((s, o) => { o[0] = 1.0 * Math.sin(1.6 * Math.PI * s + 0.4 + ph * 0.9); o[1] = 0.55 * Math.sin(2.4 * Math.PI * s + 1.3 + ph) + (l - (L - 1) / 2) * gap * 0.6; o[2] = 0.7 * Math.sin(1.2 * Math.PI * s + 2.1 + ph * 0.6); }, false, 500);
      surfs.push({
        u0: 0, u1: 1, v0: -1, v1: 1,
        weight: (_s, v) => 1 + eb * Math.pow(Math.abs(v), 3),
        eval(s, v, o) {
          const sc = Math.min(0.9999, Math.max(0, s));
          curve.at(sc, P, T, N, B);
          const th = tw * Math.PI * s + 0.6 * Math.sin(2.2 * s * Math.PI + ph), c = Math.cos(th), si = Math.sin(th), hw = W * 0.5 * (0.35 + 0.65 * Math.pow(Math.sin(Math.PI * sc), 0.7));
          const wx = c * N[0] + si * B[0], wy = c * N[1] + si * B[1], wz = c * N[2] + si * B[2], nx = -si * N[0] + c * B[0], ny = -si * N[1] + c * B[1], nz = -si * N[2] + c * B[2];
          const fold = fd * Math.sin(ff * TAU * s + 2.6 * v + ph) * (1 - 0.35 * v * v) + 0.06 * v * v;
          o[0] = P[0] + wx * v * hw + nx * fold; o[1] = P[1] + wy * v * hw + ny * fold; o[2] = P[2] + wz * v * hw + nz * fold;
        },
      });
    }
    const b = sampleSurfaces(surfs, f.n, ctx.rng, { ...surfaceOptions(p), grid: 56 });
    writeBatch(f, b, 0, (i, s) => { const e = Math.abs(s.v[i] * 2 - 1); return [clamp(0.12 + 0.5 * (0.5 + 0.5 * Math.sin(s.u[i] * TAU * 1.5 + s.id[i])) + 0.28 * (s.id[i] / Math.max(1, L - 1)), 0, 1), 1, 0.9 - smoothstep(0.82, 1, e) * 0.55, 1]; }, num(p, "thickness", 0.01), ctx.rng);
  },
};

/* ───────────── 13. Wormhole ───────────── */
export const wormhole: GeneratorDef = {
  id: "wormhole", name: "Wormhole", tag: "Flared tunnel", method: "Surface of revolution (catenoid-like throat) + helical streak lines + throat ring",
  description: "A flared throat joining two mouths, with spiralling streaks pulled toward a glowing ring at its narrowest point.",
  params: [range("throat", "Throat radius", 0.06, 0.5, 0.01, 0.2), range("length", "Half length", 0.5, 1.8, 0.01, 1.15), range("flare", "Flare", 0.3, 3.5, 0.05, 1.5), range("twist", "Streak twist", 0, 4, 0.05, 1.6), range("streaks", "Streak share", 0, 0.7, 0.01, 0.3), range("ring", "Throat ring share", 0, 0.25, 0.005, 0.06), ...samplingParams()],
  recipe: { count: 80000, look: { palette: [{ t: 0, color: "#2a1a7a" }, { t: 0.4, color: "#3da5ff" }, { t: 0.8, color: "#b9f0ff" }, { t: 1, color: "#ffffff" }], size: 0.0068, glow: 0.95, depthFade: 0.3 }, behaviors: [{ type: "home", intensity: 45 }, { type: "drag", intensity: 1.2 }], deformers: [{ type: "twist", amount: 1.2, axis: "y", scale: 1.1, speed: 0.5 }], camera: { pitch: 0.25, yaw: 0.8, distance: 3.9 } },
  generate(ctx, f) {
    const { rng, params: p } = ctx, b0 = num(p, "throat", 0.2), L = num(p, "length", 1.15), k = num(p, "flare", 1.5), tw = num(p, "twist", 1.6);
    const nSt = Math.floor(f.n * num(p, "streaks", 0.3)), nRing = Math.floor(f.n * num(p, "ring", 0.06)), nSurf = f.n - nSt - nRing;
    const rad = (u: number) => Math.sqrt(b0 * b0 + k * k * u * u * 0.5);
    const surf: ParamSurface = { u0: -L, u1: L, v0: 0, v1: TAU, weight: (u) => rad(u) * (1 + 0.8 * Math.exp(-Math.abs(u) * 2)), eval(u, v, o) { const r = rad(u); o[0] = r * Math.cos(v); o[1] = u; o[2] = r * Math.sin(v); } };
    const b = sampleSurfaces([surf], nSurf, rng, surfaceOptions(p));
    writeBatch(f, b, 0, (i, s) => [clamp(1 - Math.abs(s.pos[i * 3 + 1]) / L * 0.9, 0, 1) * 0.8, 0.9, 0.55, 1]);
    for (let i = 0; i < nSt; i++) {
      const arm = rng.int(24), u = (rng.next() < 0.5 ? -1 : 1) * L * Math.pow(rng.next(), 1.5), a = (arm / 24) * TAU + tw * (u / L) * Math.PI, r = rad(u) * (1 + rng.gauss() * 0.012);
      put(f, nSurf + i, r * Math.cos(a), u, r * Math.sin(a), clamp(1 - Math.abs(u) / L, 0, 1) * 0.95, 1.1, 0.95, 1, Math.cos(a), 0, Math.sin(a));
    }
    for (let i = 0; i < nRing; i++) { const a = rng.next() * TAU, r = b0 + rng.gauss() * 0.012; put(f, nSurf + nSt + i, r * Math.cos(a), rng.gauss() * 0.012, r * Math.sin(a), 1, 1.25, 1, 1, Math.cos(a), 0, Math.sin(a)); }
  },
};

/* ───────────── 14. Energy Vortex ───────────── */
export const vortex: GeneratorDef = {
  id: "vortex", name: "Energy Vortex", tag: "Funnel spiral", method: "Analytic funnel profile with spiral arms, hot core jet and a base ring",
  description: "A tapering funnel with spiralling arms, a thin bright core jet and swirling debris at the base.",
  params: [range("height", "Height", 1, 2.6, 0.01, 1.9), range("top", "Top radius", 0.3, 1.4, 0.01, 0.95), range("core", "Core radius", 0.02, 0.3, 0.005, 0.09), range("arms", "Arms", 1, 9, 1, 4), range("twist", "Twist", 0.3, 7, 0.05, 2.8), range("spread", "Arm spread", 0.02, 0.5, 0.01, 0.13), range("profile", "Funnel curve", 0.5, 3.5, 0.05, 1.7), range("jet", "Core jet share", 0, 0.3, 0.005, 0.1), range("fill", "Hollow ↔ solid", 0, 1, 0.01, 0.35)],
  recipe: { count: 80000, look: { palette: [{ t: 0, color: "#fff3b0" }, { t: 0.35, color: "#ff9a3d" }, { t: 0.7, color: "#ff3d6e" }, { t: 1, color: "#5b2cff" }], size: 0.0068, glow: 0.9, velocityStretch: 0.25 }, behaviors: [{ type: "home", intensity: 40 }, { type: "vortex", intensity: 2.2, dir: [0, 1, 0], radius: 0, aux: 0.5 }, { type: "drag", intensity: 1.2 }], deformers: [{ type: "rotate", amount: 1.2, axis: "y", scale: 0.4 }], camera: { pitch: 0.18, yaw: 0.2, distance: 4.3, autoRotate: 0.06 } },
  generate(ctx, f) {
    const { rng, params: p } = ctx, H = num(p, "height", 1.9), R = num(p, "top", 0.95), r0 = num(p, "core", 0.09), arms = Math.round(num(p, "arms", 4)), tw = num(p, "twist", 2.8), sp = num(p, "spread", 0.13), pf = num(p, "profile", 1.7), fill = num(p, "fill", 0.35);
    const nJet = Math.floor(f.n * num(p, "jet", 0.1)), nBase = Math.floor(f.n * 0.04), nBody = f.n - nJet - nBase;
    for (let i = 0; i < nBody; i++) {
      const h = Math.pow(rng.next(), 0.85), r = (r0 + (R - r0) * Math.pow(h, pf)) * (1 - fill * 0.9 * (1 - Math.sqrt(rng.next())) * rng.next()) * (1 + rng.gauss() * 0.035), a = (rng.int(arms) * TAU) / arms + tw * TAU * h * 0.5 + rng.gauss() * sp;
      put(f, i, r * Math.cos(a), (h - 0.5) * H, r * Math.sin(a), clamp(h * 0.9 + 0.1 * rng.next(), 0, 1), 0.9 + 0.4 * rng.next(), 0.6 + 0.4 * rng.next(), 1, Math.cos(a), 0.2, Math.sin(a));
    }
    for (let i = 0; i < nJet; i++) { const h = rng.next(), a = rng.next() * TAU, r = Math.abs(rng.gauss()) * r0 * 0.45; put(f, nBody + i, r * Math.cos(a), (h - 0.5) * H, r * Math.sin(a), 0.02 + 0.2 * h, 1.2, 1, 1, 0, 1, 0); }
    for (let i = 0; i < nBase; i++) { const a = rng.next() * TAU, r = (r0 + 0.1 + rng.expo() * R * 0.4); put(f, nBody + nJet + i, r * Math.cos(a), -H / 2 + rng.gauss() * 0.03, r * Math.sin(a), 0.1 + 0.2 * rng.next(), 0.8, 0.5, 1, 0, 1, 0); }
  },
};

/* ───────────── 15. Crystal Formation ───────────── */
export const crystal: GeneratorDef = {
  id: "crystal", name: "Crystal Formation", tag: "Hex prisms", method: "Procedural triangle mesh (hexagonal prisms + pyramid tips), barycentric edge detection",
  description: "A cluster of faceted hexagonal crystals with glowing edges and a luminous core.",
  params: [
    range("count", "Crystals", 3, 40, 1, 12), range("length", "Length", 0.4, 1.6, 0.01, 1), range("thick", "Thickness", 0.05, 0.4, 0.005, 0.15), range("spread", "Spread angle", 0.1, 1.5, 0.01, 0.75), range("tip", "Tip sharpness", 0.3, 3, 0.05, 1.4),
    select("layout", "Layout", [["cluster", "Cluster from base"], ["radial", "Radial burst"]], "cluster"), range("edgeGlow", "Edge glow", 0, 1, 0.01, 0.8), range("core", "Core glow share", 0, 0.2, 0.005, 0.05),
  ],
  recipe: { count: 70000, look: { palette: [{ t: 0, color: "#4338ca" }, { t: 0.45, color: "#38bdf8" }, { t: 0.8, color: "#a5f3fc" }, { t: 1, color: "#ffffff" }], size: 0.0072, glow: 0.8, lighting: 0.35 }, behaviors: [{ type: "home", intensity: 70 }, { type: "drag", intensity: 1.4 }], deformers: [{ type: "rotate", amount: 0.3, axis: "y", scale: 0 }], camera: { pitch: 0.3, yaw: 0.5, distance: 3.8 } },
  generate(ctx, f) {
    const { rng, params: p } = ctx, C = Math.round(num(p, "count", 12)), len = num(p, "length", 1), th = num(p, "thick", 0.15), sp = num(p, "spread", 0.75), tip = num(p, "tip", 1.4), radial = str(p, "layout", "cluster") === "radial", glow = num(p, "edgeGlow", 0.8);
    const tris = new Float32Array(C * 18 * 9), u: Vec3 = [0, 0, 0], a: Vec3 = [0, 0, 0], v: Vec3 = [0, 0, 0], org: Vec3 = [0, 0, 0], hexB: number[][] = [], hexT: number[][] = [];
    let w = 0;
    const pushTri = (A: ArrayLike<number>, Bq: ArrayLike<number>, Cq: ArrayLike<number>) => { for (let c = 0; c < 3; c++) tris[w++] = A[c]; for (let c = 0; c < 3; c++) tris[w++] = Bq[c]; for (let c = 0; c < 3; c++) tris[w++] = Cq[c]; };
    for (let c = 0; c < C; c++) {
      const lc = len * (0.5 + 0.75 * rng.next()) * (c === 0 ? 1.25 : 1), rr = th * (0.65 + 0.7 * rng.next());
      if (radial) { rng.onSphere(a); org[0] = a[0] * 0.08; org[1] = a[1] * 0.08; org[2] = a[2] * 0.08; }
      else { const ang = c === 0 ? 0 : rng.next() * sp, az = rng.next() * TAU; a[0] = Math.sin(ang) * Math.cos(az); a[1] = Math.cos(ang); a[2] = Math.sin(ang) * Math.sin(az); const br = c === 0 ? 0 : 0.35 * Math.sqrt(rng.next()), ba = rng.next() * TAU; org[0] = br * Math.cos(ba); org[1] = -0.6; org[2] = br * Math.sin(ba); }
      anyPerp(a[0], a[1], a[2], u); v[0] = a[1] * u[2] - a[2] * u[1]; v[1] = a[2] * u[0] - a[0] * u[2]; v[2] = a[0] * u[1] - a[1] * u[0];
      hexB.length = 0; hexT.length = 0;
      for (let k = 0; k < 6; k++) {
        const ca = Math.cos((k * Math.PI) / 3) * rr, sa = Math.sin((k * Math.PI) / 3) * rr, b3 = [org[0] + ca * u[0] + sa * v[0], org[1] + ca * u[1] + sa * v[1], org[2] + ca * u[2] + sa * v[2]];
        hexB.push(b3); hexT.push([b3[0] + a[0] * lc, b3[1] + a[1] * lc, b3[2] + a[2] * lc]);
      }
      const apex = [org[0] + a[0] * (lc + rr * tip), org[1] + a[1] * (lc + rr * tip), org[2] + a[2] * (lc + rr * tip)];
      for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6; pushTri(hexB[k], hexB[k2], hexT[k]); pushTri(hexB[k2], hexT[k2], hexT[k]); pushTri(hexT[k], hexT[k2], apex); }
    }
    const nCore = Math.floor(f.n * num(p, "core", 0.05)), nMesh = f.n - nCore, b = sampleMesh(tris, nMesh, rng);
    for (let i = 0; i < nMesh; i++) {
      const o = i * 3, ba = b.u[i], bb = b.v[i], bc = 1 - ba - bb, edge = Math.min(ba, bb, bc) < 0.035, crystalIdx = Math.floor(b.id[i] / 18), hue = ((crystalIdx * 0.6180339) % 1) * 0.28;
      put(f, i, b.pos[o], b.pos[o + 1], b.pos[o + 2], clamp(0.18 + hue + (edge ? 0.45 * glow : 0), 0, 1), edge ? 1 + 0.5 * glow : 1, edge ? 1 : 0.7, 1, b.nrm[o], b.nrm[o + 1], b.nrm[o + 2]);
    }
    for (let i = 0; i < nCore; i++) { const r = Math.abs(rng.gauss()) * 0.2, aa = rng.next() * TAU; put(f, nMesh + i, r * Math.cos(aa), radial ? rng.gauss() * 0.2 : -0.6 + Math.abs(rng.gauss()) * 0.35, r * Math.sin(aa), 1, 1.3, 0.9, 1); }
  },
};

export const SHAPES3 = [smoke, fabric, wormhole, vortex, crystal];
