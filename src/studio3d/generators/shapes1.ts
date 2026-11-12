import type { GeneratorDef, Vec3 } from "../types";
import { TAU, clamp, fbm, lerp, smoothstep } from "../math";
import { sampleSurfaces, sampleTube, Curve, sampleSegments, type ParamSurface } from "../sampling";
import { num, str, range, text, samplingParams, surfaceOptions, put, writeBatch } from "./common";

/* ───────────── 1. Particle Sphere (matches particle-sphere.html) ───────────── */
export const sphere: GeneratorDef = {
  id: "sphere", name: "Particle Sphere", tag: "Glowing orb", method: "Noise-clumped shell + halo + volume dust + extruded 3D text",
  description: "A glassy shell of clustered particles with voids, purple patches and white highlights, a soft halo, floating dust and optional 3D text suspended inside.",
  params: [
    range("radius", "Radius", 0.5, 1.5, 0.01, 1),
    range("halo", "Halo amount", 0, 0.5, 0.01, 0.26, "Soft fuzz just outside the shell."),
    range("dust", "Inner dust", 0, 0.3, 0.005, 0.095, "Volumetric particles inside the sphere."),
    range("strays", "Stray particles", 0, 0.12, 0.005, 0.045, "Far drifting particles."),
    range("clump", "Cloud clumping", 0, 1, 0.01, 0.7, "Voids and dense clouds across the shell."),
    range("purple", "Purple patches", 0, 1, 0.01, 0.55),
    range("white", "White highlights", 0, 1, 0.01, 0.5),
    text("text", "Inner text", "NOVA", "Extruded 3D text floating in the sphere. Leave empty for none."),
    range("textAmount", "Text particles", 0, 0.4, 0.01, 0.12),
    range("textScale", "Text size", 0.3, 1.5, 0.01, 0.9),
    range("textDepth", "Text depth", 0.02, 0.6, 0.01, 0.22),
  ],
  recipe: {
    count: 90000,
    look: { palette: [{ t: 0, color: "#1f6bff" }, { t: 0.4, color: "#3de2ff" }, { t: 0.68, color: "#9a60ff" }, { t: 1, color: "#e4fbff" }], size: 0.0075, opacity: 0.85, emission: 1.1, glow: 0.65, glowRadius: 0.6, edgeBrightness: 1.1, depthFade: 0.55, blend: "additive", shape: "soft", softness: 0.8 },
    behaviors: [{ type: "home", intensity: 70, aux: 0.9 }, { type: "drag", intensity: 1.2 }],
    deformers: [{ type: "breathe", amount: 0.03, speed: 1 }],
    camera: { distance: 3.4, yaw: 0.45, pitch: 0.22, autoRotate: 0.16 },
  },
  generate(ctx, f) {
    const { rng, params: p } = ctx, n = f.n, R = num(p, "radius", 1);
    const halo = num(p, "halo", 0.26), dust = num(p, "dust", 0.095), strays = num(p, "strays", 0.045);
    const clump = num(p, "clump", 0.7), purple = num(p, "purple", 0.55), white = num(p, "white", 0.5);
    const txt = str(p, "text", "").trim(), mask = txt && ctx.text ? ctx.text(txt) : null;
    const nText = mask ? Math.floor(n * num(p, "textAmount", 0.18)) : 0;
    const off = ctx.seed * 0.0137, d: Vec3 = [0, 0, 0];
    for (let i = 0; i < n - nText; i++) {
      const roll = rng.next();
      let x = 0, y = 0, z = 0, t = 0, size = 1, alpha = 1, r = 1;
      let tries = 0, c1 = 0;
      do { rng.onSphere(d); c1 = fbm(d[0] * 2.6 + off, d[1] * 2.6, d[2] * 2.6); tries++; }
      while (roll < 1 - halo - dust - strays && tries < 8 && rng.next() > lerp(1, 0.12 + 0.88 * smoothstep(0.3, 0.62, c1), clump));
      const c2 = fbm(d[0] * 5.5 + 9 + off, d[1] * 5.5, d[2] * 5.5), cn = fbm(d[0] * 1.8 + 21 + off, d[1] * 1.8, d[2] * 1.8), wh = fbm(d[0] * 9 + 3, d[1] * 9 + off, d[2] * 9);
      t = 0.12 + 0.3 * c2;
      t = lerp(t, 0.66 + 0.06 * rng.next(), smoothstep(0.45, 0.58, cn) * purple);
      t = lerp(t, 1, smoothstep(0.6, 0.74, wh) * white);
      const shellEnd = 1 - halo - dust - strays, haloEnd = shellEnd + halo, dustEnd = haloEnd + dust;
      if (roll < shellEnd) { r = 1 + rng.gauss() * (0.006 + 0.014 * rng.next()); alpha = (0.55 + 0.45 * rng.next() * rng.next()) * (0.7 + 0.5 * c1); size = 1 + 0.5 * rng.next(); }
      else if (roll < haloEnd) { r = 1 + rng.expo() * 0.07; alpha = 0.34; size = 0.8; t = lerp(t, 0.35, 0.4); }
      else if (roll < dustEnd) { r = 0.12 + 0.86 * Math.cbrt(rng.next()); alpha = 0.3; size = 0.7; t = lerp(t, 0.25, 0.5); }
      else { r = 1.15 + rng.next() * 0.9; alpha = 0.5; size = 1.2; t = lerp(t, 0.9, 0.4); }
      x = d[0] * r * R; y = d[1] * r * R; z = d[2] * r * R;
      put(f, i, x, y, z, t, size, alpha, 1, d[0], d[1], d[2]);
    }
    if (mask) {
      const k = (1.15 * num(p, "textScale", 0.9) * R) / Math.max(mask.w, 420), depth = num(p, "textDepth", 0.22) * R, cnt = mask.pts.length / 2;
      for (let j = 0; j < nText; j++) {
        const q = rng.int(cnt) * 2, px = mask.pts[q], py = mask.pts[q + 1];
        const face = rng.next(), zz = face < 0.62 ? (face < 0.31 ? -0.5 : 0.5) * depth : (rng.next() - 0.5) * depth;
        const nz = face < 0.62 ? (face < 0.31 ? -1 : 1) : 0;
        put(f, n - nText + j, (px - mask.w / 2) * k, -(py - mask.h / 2) * k, zz, 0.86 + 0.14 * rng.next(), 0.85, 0.6, 0.04, 0, 0, nz);
      }
    }
  },
};

/* ───────────── 2. Particle Torus ───────────── */
export const torus: GeneratorDef = {
  id: "torus", name: "Particle Torus", tag: "Rippled ring", method: "Parametric surface, area-weighted",
  description: "A donut whose tube can ripple and twist, sampled evenly by true surface area.",
  params: [
    range("major", "Ring radius", 0.3, 1.2, 0.01, 0.74), range("minor", "Tube radius", 0.08, 0.6, 0.01, 0.3),
    range("ripple", "Ripple depth", 0, 0.5, 0.01, 0.16), range("ripples", "Ripple count", 0, 16, 1, 7), range("twist", "Twist", 0, 4, 0.05, 1),
    range("thickness", "Shell thickness", 0, 0.08, 0.002, 0.012), ...samplingParams(),
  ],
  recipe: { count: 70000, look: { palette: [{ t: 0, color: "#ff4d7e" }, { t: 0.55, color: "#ffb347" }, { t: 1, color: "#fff4d6" }], size: 0.0085, glow: 0.6 }, behaviors: [{ type: "home", intensity: 60 }, { type: "drag", intensity: 1.2 }], deformers: [{ type: "rotate", amount: 0.35, axis: "y", scale: 0 }, { type: "breathe", amount: 0.02 }], camera: { pitch: 0.5, yaw: 0.3, distance: 3.6 } },
  generate(ctx, f) {
    const p = ctx.params, R = num(p, "major", 0.74), r0 = num(p, "minor", 0.3), rip = num(p, "ripple", 0.16), nr = num(p, "ripples", 7), tw = num(p, "twist", 1);
    const surf: ParamSurface = {
      u0: 0, u1: TAU, v0: 0, v1: TAU,
      eval(u, v, o) { const rr = r0 * (1 + rip * Math.sin(nr * u + tw * v)), ring = R + rr * Math.cos(v); o[0] = ring * Math.cos(u); o[1] = rr * Math.sin(v); o[2] = ring * Math.sin(u); },
    };
    const b = sampleSurfaces([surf], f.n, ctx.rng, surfaceOptions(p));
    writeBatch(f, b, 0, (i, s) => [0.5 + 0.5 * Math.cos(s.v[i] * TAU), 1, 1, 1], num(p, "thickness", 0.012), ctx.rng);
  },
};

/* ───────────── 3. DNA Helix ───────────── */
export const helix: GeneratorDef = {
  id: "helix", name: "DNA Helix", tag: "Double strand", method: "Tube sampling along curves + segment sampling for base pairs",
  description: "Two glowing backbone strands joined by colour-coded base-pair rungs.",
  params: [
    range("turns", "Turns", 1, 7, 0.1, 3.2), range("radius", "Helix radius", 0.15, 0.7, 0.01, 0.38), range("height", "Height", 1, 3.2, 0.05, 2.3),
    range("tube", "Strand thickness", 0.008, 0.08, 0.001, 0.034), range("rungs", "Base pairs", 4, 60, 1, 26), range("rungShare", "Rung particles", 0.05, 0.6, 0.01, 0.24),
  ],
  recipe: { count: 60000, look: { palette: [{ t: 0, color: "#18d6ff" }, { t: 0.45, color: "#7a5cff" }, { t: 0.75, color: "#ff5ea8" }, { t: 1, color: "#fff3c4" }], size: 0.0075, glow: 0.8 }, behaviors: [{ type: "home", intensity: 70 }, { type: "drag", intensity: 1.3 }], deformers: [{ type: "rotate", amount: 0.5, axis: "y", scale: 0 }], camera: { pitch: 0.12, yaw: 0, distance: 3.9 } },
  generate(ctx, f) {
    const { rng, params: p } = ctx, turns = num(p, "turns", 3.2), R = num(p, "radius", 0.38), H = num(p, "height", 2.3), tube = num(p, "tube", 0.034);
    const rungs = Math.round(num(p, "rungs", 26)), nRung = Math.floor(f.n * num(p, "rungShare", 0.24)), nStr = Math.floor((f.n - nRung) / 2);
    const strand = (phase: number) => new Curve((s, o) => { const a = turns * TAU * s + phase; o[0] = R * Math.cos(a); o[1] = (s - 0.5) * H; o[2] = R * Math.sin(a); }, false, 900);
    let at = 0;
    for (let k = 0; k < 2; k++) {
      const cnt = k === 0 ? nStr : f.n - nRung - nStr;
      const b = sampleTube(strand(k * Math.PI), cnt, rng, () => tube, 0.6);
      writeBatch(f, b, at, (i, s) => [0.12 + 0.28 * k + 0.08 * Math.sin(s.u[i] * 40), 1, 1, 0.9]);
      at += cnt;
    }
    const segs = new Float32Array(rungs * 6), mid: number[] = [];
    for (let j = 0; j < rungs; j++) {
      const s = (j + 0.5) / rungs, a = turns * TAU * s, y = (s - 0.5) * H;
      segs.set([R * Math.cos(a), y, R * Math.sin(a), R * Math.cos(a + Math.PI), y, R * Math.sin(a + Math.PI)], j * 6); mid.push(j % 2);
    }
    const b = sampleSegments(segs, nRung, rng);
    for (let i = 0; i < nRung; i++) {
      const o = i * 3, half = b.u[i] < 0.5, gc = mid[b.id[i]] === 1;
      put(f, at + i, b.pos[o] + rng.gauss() * 0.008, b.pos[o + 1] + rng.gauss() * 0.008, b.pos[o + 2] + rng.gauss() * 0.008, (gc ? 0.72 : 0.5) + (half ? 0.0 : 0.24) + rng.next() * 0.04, 0.85, 0.75, 0.9);
    }
  },
};

/* ───────────── 4. Particle Galaxy ───────────── */
export const galaxy: GeneratorDef = {
  id: "galaxy", name: "Spiral Galaxy", tag: "Logarithmic arms", method: "Analytic distribution: exponential disk, log-spiral arms, gaussian bulge",
  description: "Spiral arms with a bright bulge, scattered field stars and darker dust lanes.",
  params: [
    range("arms", "Arms", 2, 7, 1, 3), range("radius", "Radius", 0.6, 1.8, 0.01, 1.35), range("twist", "Arm winding", 0.5, 7, 0.05, 3.4),
    range("spread", "Arm spread", 0.04, 0.6, 0.01, 0.2), range("thickness", "Disk thickness", 0.01, 0.25, 0.005, 0.06), range("bulge", "Bulge share", 0, 0.45, 0.01, 0.16),
    range("field", "Field stars", 0, 0.4, 0.01, 0.1), range("dustLanes", "Dust lanes", 0, 1, 0.01, 0.55),
  ],
  recipe: { count: 100000, look: { palette: [{ t: 0, color: "#4f7cff" }, { t: 0.4, color: "#9b7bff" }, { t: 0.75, color: "#ffc27a" }, { t: 1, color: "#fff7e6" }], size: 0.0062, glow: 0.9, depthFade: 0.2 }, behaviors: [{ type: "home", intensity: 55 }, { type: "drag", intensity: 1.2 }], deformers: [{ type: "rotate", amount: 0.4, axis: "y", scale: 0.5 }], camera: { pitch: 0.95, yaw: 0.2, distance: 3.7, autoRotate: 0 } },
  generate(ctx, f) {
    const { rng, params: p } = ctx, arms = Math.round(num(p, "arms", 3)), R = num(p, "radius", 1.35), tw = num(p, "twist", 3.4), spread = num(p, "spread", 0.2), th = num(p, "thickness", 0.06) * R;
    const bulge = num(p, "bulge", 0.16), field = num(p, "field", 0.1), lanes = num(p, "dustLanes", 0.55);
    for (let i = 0; i < f.n; i++) {
      const roll = rng.next();
      if (roll < bulge) {
        const x = rng.gauss() * 0.13 * R, y = rng.gauss() * 0.085 * R, z = rng.gauss() * 0.13 * R;
        put(f, i, x, y, z, 0.88 + 0.12 * rng.next(), 1.15, 0.9, 1, x, y * 2, z);
      } else if (roll < bulge + field) {
        const r = R * 1.05 * Math.sqrt(rng.next()), a = rng.next() * TAU;
        put(f, i, r * Math.cos(a), rng.gauss() * th * 1.6, r * Math.sin(a), 0.12 + 0.2 * rng.next(), 0.8, 0.5, 1, 0, 1, 0);
      } else {
        const r = R * (0.05 + 0.95 * Math.pow(rng.next(), 0.72)), arm = rng.int(arms), g = rng.gauss();
        const ang = (arm * TAU) / arms + tw * Math.log(1 + r / (0.2 * R)) + g * spread * (0.45 + 0.9 * Math.exp(-r / R));
        const y = rng.gauss() * th * (1 - 0.55 * (r / R)), lane = g < -0.3 ? 1 - lanes * 0.75 : 1;
        put(f, i, r * Math.cos(ang), y, r * Math.sin(ang), clamp(0.8 - 0.7 * (r / R) + 0.1 * rng.next(), 0, 1), 0.9 + 0.3 * rng.next(), lane * (0.55 + 0.45 * rng.next()), 1, 0, 1, 0);
      }
    }
  },
};

/* ───────────── 5. Möbius Strip ───────────── */
export const mobius: GeneratorDef = {
  id: "mobius", name: "Möbius Strip", tag: "One-sided band", method: "Parametric surface with half-twists, edge emphasis",
  description: "A ribbon with a chosen number of half-twists; odd counts give a true one-sided Möbius band.",
  params: [
    range("radius", "Ring radius", 0.4, 1.2, 0.01, 0.78), range("width", "Band width", 0.1, 0.9, 0.01, 0.46), range("twists", "Half-twists", 1, 7, 1, 1),
    range("thickness", "Shell thickness", 0, 0.05, 0.001, 0.008), range("edge", "Edge glow", 0, 1, 0.01, 0.6), ...samplingParams(),
  ],
  recipe: { count: 70000, look: { palette: [{ t: 0, color: "#2dd4bf" }, { t: 0.5, color: "#60a5fa" }, { t: 1, color: "#f0abfc" }], size: 0.0078, glow: 0.7 }, behaviors: [{ type: "home", intensity: 60 }, { type: "drag", intensity: 1.2 }], deformers: [{ type: "rotate", amount: 0.3, axis: "y", scale: 0 }], camera: { pitch: 0.55, yaw: 0.4, distance: 3.5 } },
  generate(ctx, f) {
    const p = ctx.params, R = num(p, "radius", 0.78), W = num(p, "width", 0.46), k = Math.round(num(p, "twists", 1)), edge = num(p, "edge", 0.6);
    const surf: ParamSurface = { u0: 0, u1: TAU, v0: -W / 2, v1: W / 2, eval(u, v, o) { const h = R + v * Math.cos((k * u) / 2); o[0] = h * Math.cos(u); o[1] = v * Math.sin((k * u) / 2); o[2] = h * Math.sin(u); } };
    const b = sampleSurfaces([surf], f.n, ctx.rng, surfaceOptions(p));
    writeBatch(f, b, 0, (i, s) => { const e = Math.abs(s.v[i] * 2 - 1), eg = Math.pow(e, 8) * edge; return [clamp(0.15 + 0.5 * e + 0.15 * Math.sin(s.u[i] * TAU * k / 2) + eg * 0.3, 0, 1), 1 + eg * 0.7, 0.8 + eg * 0.5, 1]; }, num(p, "thickness", 0.008), ctx.rng);
  },
};

export const SHAPES1 = [sphere, torus, helix, galaxy, mobius];
