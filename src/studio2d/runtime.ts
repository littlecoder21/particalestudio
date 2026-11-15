import type { Studio2DSettings } from "./types";

/** Per-particle state added by the 2D studio upgrade. All values are stable (never re-randomised per frame). */
export interface LockFields {
  /** Home position the particle is locked to. */
  targetX: number;
  targetY: number;
  /** Stable random numbers derived from the particle index. */
  seed: number;
  r1: number;
  r2: number;
  /** Individual movement strength / speed (derived from Organic Variation). */
  amplitude: number;
  frequency: number;
  /** Animation phase (mix of a spatial and a random phase, see Particle Independence). */
  lphase: number;
  /** Phase from the home position, so neighbours move together. */
  spatial: number;
  /** Current bounded wobble displacement of the spring target. */
  offsetX: number;
  offsetY: number;
  /** 0-1 distance from the formation centre and the matching unit vector. */
  radial: number;
  ux: number;
  uy: number;
  /** Smoothed light level and reflectivity (light FX). */
  lit: number;
  refl: number;
  /** 0-1 pulse brightness (Energy Pulse). */
  energy: number;
}

export interface FxParticle extends LockFields {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

export interface Studio2DRuntime {
  blank(): LockFields;
  /** Call once per frame. Returns true when settings or canvas size changed. */
  begin(studio: Studio2DSettings, width: number, height: number, dt: number, playing: boolean, palette: readonly string[]): boolean;
  time(): number;
  setPointer(x: number, y: number, active: boolean): void;
  addShock(x: number, y: number): void;
  shockActive(): boolean;
  applyShocks(p: FxParticle): void;
  lockEnabled(): boolean;
  /** Fraction of other forces that still act while Shape Preservation is on. */
  externalScale(): number;
  initParticle(p: LockFields, index: number): void;
  finalizeHomes(ps: readonly FxParticle[]): void;
  refresh(ps: readonly FxParticle[]): void;
  lockStep(p: FxParticle, dt: number): void;
  gradientActive(): boolean;
  gradientColor(x: number, y: number): string;
  lightActive(): boolean;
  lightFactor(p: FxParticle): number;
  lightAt(x: number, y: number): number;
  glint(x: number, y: number, lit: number, size: number, seed: number): void;
  bokeh(): number;
  drawBackdrop(ctx: CanvasRenderingContext2D, trails: boolean): void;
  drawHaze(ctx: CanvasRenderingContext2D): void;
  drawDust(ctx: CanvasRenderingContext2D): void;
  drawRings(ctx: CanvasRenderingContext2D, front: boolean): void;
  drawGlints(ctx: CanvasRenderingContext2D): void;
  drawShocks(ctx: CanvasRenderingContext2D): void;
  drawGuides(ctx: CanvasRenderingContext2D): void;
  post(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, trails: boolean): void;
  formation(): { x: number; y: number; r: number };
}

/**
 * Everything the 2D studio adds on top of the base particle engine.
 *
 * IMPORTANT: this factory must stay fully self-contained (no references to module-level
 * values). The code export embeds it with `createStudio2DRuntime.toString()`, so the
 * live preview and the exported file run exactly the same code.
 */
export function createStudio2DRuntime(): Studio2DRuntime {
  const TAU = Math.PI * 2;
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const hash = (i: number, salt: number) => {
    let h = (Math.imul(i + 1, 374761393) + Math.imul(salt + 1, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const hexRgbCache = new Map<string, [number, number, number]>();
  const hexRgb = (hex: string): [number, number, number] => {
    let v = hexRgbCache.get(hex);
    if (!v) {
      const n = Number.parseInt(hex.slice(1), 16);
      v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      hexRgbCache.set(hex, v);
    }
    return v;
  };
  const rgba = (hex: string, a: number) => {
    const c = hexRgb(hex);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3) + ")";
  };
  const makeCanvas = (w: number, h: number) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };

  /* ------------------------------------------------------------------ state */
  let S: Studio2DSettings | null = null;
  let W = 1;
  let H = 1;
  let ref = 1;
  let simT = 0;
  let dtFrame = 0.016;
  let frameNo = 0;
  let paletteRef: readonly string[] | null = null;
  let lut: string[] = [];
  let ptrX = -9999;
  let ptrY = -9999;
  let ptrOn = false;

  /* shape lock (derived constants) */
  let lockOn = false;
  let lMD = 10;
  let lLimit = 30;
  let lK = 100;
  let lC = 20;
  let lRecovery = 0.6;
  let lReach = 2.2;
  let lExt = 0.1;
  let lVarA = 0.4;
  let lVarF = 0.3;
  let lInd = 0.5;
  let wF = 1;
  let wW = 0;
  let wB = 0;
  let wR = 0;
  let wP = 0;
  let lTime = 0;
  let lBase = 5;
  let lBreathAmt = 0;
  let lRippleAmt = 0;
  let pulseFront = 0;
  let pulseFade = 1;
  let breathBase = 0;
  let rippleBase = 0;
  let fcx = 0;
  let fcy = 0;
  let fR = 1;
  let haveHomes = false;

  /* gradient colour mapping */
  let gMode = 0;
  let gCos = 1;
  let gSin = 0;
  let gFlow = 0;

  /* light */
  interface Beam { ox: number; oy: number; dx: number; dy: number; nx: number; ny: number; len: number; sigma: number; spread: number; fadeIn: number; fadeOut: number; strength: number; r: number; g: number; b: number; idx: number }
  const beams: Beam[] = [];
  let lightOn = false;
  let torchOn = false;
  let tSig = 100;
  let tStr = 1;
  let tR = 200;
  let tG = 220;
  let tB = 255;
  let cR = 238;
  let cG = 240;
  let cB = 246;
  let lAmb = 0.14;
  let lGain = 1;
  let lRefl = 0.6;
  let lEase = 0.2;

  /* glints */
  const MAX_GLINTS = 2600;
  const glX = new Float32Array(MAX_GLINTS);
  const glY = new Float32Array(MAX_GLINTS);
  const glA = new Float32Array(MAX_GLINTS);
  const glS = new Float32Array(MAX_GLINTS);
  const glC = new Int32Array(MAX_GLINTS);
  const glF = new Uint8Array(MAX_GLINTS);
  let glCount = 0;

  /* sprites */
  const glowCache = new Map<number, HTMLCanvasElement>();
  const tintCache = new Map<string, HTMLCanvasElement>();
  let flareSprite: HTMLCanvasElement | null = null;
  const glowSprite = (rgb: number) => {
    let c = glowCache.get(rgb);
    if (!c) {
      if (glowCache.size > 48) glowCache.clear();
      c = makeCanvas(48, 48);
      const g = c.getContext("2d");
      if (g) {
        const r = (rgb >> 16) & 255, gg = (rgb >> 8) & 255, b = rgb & 255;
        const grad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
        grad.addColorStop(0, "rgba(" + r + "," + gg + "," + b + ",1)");
        grad.addColorStop(0.12, "rgba(" + r + "," + gg + "," + b + ",0.85)");
        grad.addColorStop(0.3, "rgba(" + r + "," + gg + "," + b + ",0.22)");
        grad.addColorStop(0.62, "rgba(" + r + "," + gg + "," + b + ",0.04)");
        grad.addColorStop(1, "rgba(" + r + "," + gg + "," + b + ",0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, 48, 48);
      }
      glowCache.set(rgb, c);
    }
    return c;
  };
  const tintSprite = (color: string) => {
    let c = tintCache.get(color);
    if (!c) {
      if (tintCache.size > 160) tintCache.clear();
      c = makeCanvas(32, 32);
      const g = c.getContext("2d");
      if (g) {
        const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, color);
        grad.addColorStop(0.35, color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, 32, 32);
      }
      tintCache.set(color, c);
    }
    return c;
  };
  const getFlare = () => {
    if (flareSprite) return flareSprite;
    const c = makeCanvas(96, 96);
    const g = c.getContext("2d");
    if (g) {
      g.translate(48, 48);
      for (let k = 0; k < 2; k += 1) {
        g.save();
        g.rotate(k * Math.PI / 2);
        const gr = g.createLinearGradient(-48, 0, 48, 0);
        gr.addColorStop(0, "rgba(255,255,255,0)");
        gr.addColorStop(0.5, "rgba(255,255,255,0.95)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(-48, -0.8, 96, 1.6);
        g.restore();
      }
    }
    flareSprite = c;
    return c;
  };

  /* ------------------------------------------------------- palette / gradient */
  const buildLut = (palette: readonly string[]) => {
    const colors = palette.length > 0 ? palette : ["#78d8ff", "#bd8cff"];
    lut = [];
    for (let i = 0; i < 64; i += 1) {
      const pos = (i / 63) * (colors.length - 1);
      const a = Math.floor(pos);
      const b = Math.min(colors.length - 1, a + 1);
      const m = pos - a;
      const ca = hexRgb(colors[a]);
      const cb = hexRgb(colors[b]);
      const q = (v: number) => Math.min(255, Math.round(v / 16) * 16);
      lut.push("rgb(" + q(ca[0] + (cb[0] - ca[0]) * m) + ", " + q(ca[1] + (cb[1] - ca[1]) * m) + ", " + q(ca[2] + (cb[2] - ca[2]) * m) + ")");
    }
  };

  /* ------------------------------------------------------------------ begin */
  const STYLE: Record<string, number[]> = {
    // float, wiggle, breathe, ripple, pulse, time scale
    "Gentle Float": [1, 0, 0.25, 0, 0, 0.8],
    "Organic Wiggle": [0.35, 1, 0, 0, 0, 1],
    "Shape Breathing": [0.3, 0, 1, 0, 0, 0.8],
    "Surface Ripple": [0.25, 0, 0, 1, 0, 1],
    "Energy Pulse": [0.2, 0, 0.2, 0.35, 1, 1],
    "Almost Still": [0.12, 0, 0.1, 0, 0, 0.5],
  };
  const LOCK_FAMILY_NAMES = [
    "Cloud Drift", "Organic Sway", "Radial Breath", "Surface Ripple", "Energy Pulse",
    "Orbiting Halo", "Spiral Weave", "Tidal Wave", "Elastic Flutter", "Starlight Tremor", "Calm Hover",
  ];
  const LOCK_VARIATION_NAMES = ["Soft", "Balanced", "Lively", "Intense"];
  const LOCK_FAMILY_PROFILES = [
    [0.8, 0.15, 0.1, 0.05, 0, 0.7],
    [0.2, 0.8, 0.15, 0.1, 0, 1.1],
    [0.15, 0.05, 1, 0.2, 0, 0.65],
    [0.1, 0.05, 0.1, 1, 0.05, 1],
    [0.1, 0.05, 0.15, 0.4, 1, 1.1],
    [0.35, 0.2, 0.1, 0.35, 0.2, 0.8],
    [0.4, 0.7, 0.1, 0.55, 0.15, 1.3],
    [0.45, 0.15, 0.65, 0.8, 0.25, 0.7],
    [0.2, 0.7, 0.25, 0.2, 0, 1.5],
    [0.1, 1, 0.1, 0.4, 0.35, 1.8],
    [0.8, 0.05, 0.15, 0.05, 0, 0.45],
  ];

  const configure = (s: Studio2DSettings) => {
    const L = s.shapeLock;
    lockOn = L.enabled;
    ref = Math.min(2.5, Math.max(0.5, Math.min(W, H) / 600));
    lMD = L.maxDisplacement * ref;
    lReach = L.pointerReach;
    lLimit = lMD * (1 + L.pointerReach);
    const omega = (2 + 5 * L.returnStrength) * (0.75 + 0.5 * L.strength);
    const zeta = 0.45 + 0.9 * L.damping;
    lK = omega * omega;
    lC = 2 * zeta * omega;
    lRecovery = L.recovery;
    lExt = (1 - L.strength) * (1 - L.strength) * 0.9 + 0.04;
    lVarA = L.variation * 0.75;
    lVarF = L.variation * 0.6;
    lInd = L.independence;
    let w = STYLE[L.style] || STYLE["Gentle Float"];
    const [familyName, variationName] = L.style.split(" · ");
    const familyIndex = LOCK_FAMILY_NAMES.indexOf(familyName);
    const variationIndex = LOCK_VARIATION_NAMES.indexOf(variationName);
    if (familyIndex >= 0 && variationIndex >= 0) {
      const source = LOCK_FAMILY_PROFILES[familyIndex];
      const amplitude = 0.68 + variationIndex * 0.19;
      w = [source[0] * amplitude, source[1] * amplitude, source[2] * amplitude, source[3] * amplitude, source[4] * amplitude, source[5] * (0.78 + variationIndex * 0.16)];
    }
    wF = w[0];
    wW = w[1];
    wB = w[2];
    wR = w[3];
    wP = w[4];
    lTime = w[5] * L.speed;
    lBase = lMD * L.amount;
    lBreathAmt = L.breathing;
    lRippleAmt = L.ripple;

    const F = s.fx;
    gMode = F.colorMode === "Linear" ? 1 : F.colorMode === "Radial" ? 2 : F.colorMode === "Angular" ? 3 : F.colorMode === "Vertical" ? 4 : 0;
    gCos = Math.cos((F.gradientAngle * Math.PI) / 180);
    gSin = Math.sin((F.gradientAngle * Math.PI) / 180);
    gFlow = F.gradientFlow;

    const T = s.light;
    lightOn = T.enabled;
    torchOn = T.enabled && T.torch;
    tSig = T.torchRadius * Math.max(0.6, ref * 0.7) * 0.5;
    tStr = T.torchStrength;
    const tc = hexRgb(T.torchColor);
    tR = tc[0];
    tG = tc[1];
    tB = tc[2];
    lAmb = T.ambient;
    lGain = T.intensity;
    lRefl = T.reflectivity;
  };

  const beamTime = () => {
    if (!S || !lightOn) {
      beams.length = 0;
      return;
    }
    const T = S.light;
    const vmin = Math.min(W, H);
    beams.length = 0;
    for (let k = 0; k < T.beams.length; k += 1) {
      const b = T.beams[k];
      const ox = b.fromX * W;
      const oy = b.fromY * H;
      let ex = b.toX * W - ox;
      let ey = b.toY * H - oy;
      const a = T.sway * 0.3 * Math.sin(simT * T.swaySpeed * 0.45 + k * 1.7);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const rx = ex * ca - ey * sa;
      const ry = ex * sa + ey * ca;
      ex = rx;
      ey = ry;
      const len = Math.max(1, Math.hypot(ex, ey));
      const dx = ex / len;
      const dy = ey / len;
      const c = hexRgb(b.color);
      beams.push({
        ox, oy, dx, dy, nx: -dy, ny: dx, len,
        sigma: b.width * vmin, spread: b.spread, fadeIn: b.fadeIn, fadeOut: b.fadeOut,
        strength: b.strength * (1 + 0.04 * Math.sin(simT * 1.3 + k * 2.1)),
        r: c[0], g: c[1], b: c[2], idx: k,
      });
    }
  };

  const begin = (studio: Studio2DSettings, width: number, height: number, dt: number, playing: boolean, palette: readonly string[]): boolean => {
    const changed = studio !== S || width !== W || height !== H;
    if (changed) {
      S = studio;
      W = Math.max(1, width);
      H = Math.max(1, height);
      configure(studio);
    }
    if (palette !== paletteRef) {
      paletteRef = palette;
      buildLut(palette);
    }
    dtFrame = playing ? Math.min(dt, 0.05) : 0;
    simT += dtFrame;
    frameNo += 1;
    lEase = 1 - Math.exp(-Math.max(dt, 0.001) * 8);
    if (!haveHomes || !lockOn) {
      fcx = W * 0.5;
      fcy = H * 0.5;
      fR = Math.min(W, H) * 0.36;
    }
    if (lockOn) {
      const tt = simT * lTime;
      pulseFront = (((tt * 0.3) % 1) + 1) % 1 * 1.5 - 0.15;
      pulseFade = 1 - 0.45 * clamp01(pulseFront / 1.35);
      breathBase = tt * 0.8;
      rippleBase = tt * 2.2;
    }
    beamTime();
    return changed;
  };

  /* ------------------------------------------------------------ shape lock */
  const blank = (): LockFields => ({
    targetX: 0, targetY: 0, seed: 0, r1: 0, r2: 0, amplitude: 1, frequency: 1, lphase: 0, spatial: 0,
    offsetX: 0, offsetY: 0, radial: 0, ux: 0, uy: 0, lit: 0.15, refl: 0.5, energy: 0,
  });

  const initParticle = (p: LockFields, index: number) => {
    p.seed = hash(index, 1);
    p.r1 = hash(index, 2);
    p.r2 = hash(index, 3);
    p.refl = hash(index, 4) * hash(index, 5);
    p.amplitude = 1;
    p.frequency = 1;
  };

  const finalizeHomes = (ps: readonly FxParticle[]) => {
    const n = ps.length;
    if (n === 0) return;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i += 1) {
      sx += ps[i].targetX;
      sy += ps[i].targetY;
    }
    fcx = sx / n;
    fcy = sy / n;
    let maxD = 1;
    for (let i = 0; i < n; i += 1) {
      const d = Math.hypot(ps[i].targetX - fcx, ps[i].targetY - fcy);
      if (d > maxD) maxD = d;
    }
    fR = maxD;
    for (let i = 0; i < n; i += 1) {
      const p = ps[i];
      const dx = p.targetX - fcx;
      const dy = p.targetY - fcy;
      const d = Math.hypot(dx, dy);
      p.radial = Math.min(1, d / fR);
      p.ux = d > 0.001 ? dx / d : 0;
      p.uy = d > 0.001 ? dy / d : 0;
      p.spatial = (dx / fR) * 2.3 + (dy / fR) * 1.7;
    }
    haveHomes = true;
    refresh(ps);
  };

  const refresh = (ps: readonly FxParticle[]) => {
    for (let i = 0; i < ps.length; i += 1) {
      const p = ps[i];
      // Low independence: amplitude, speed and phase follow a smooth field over the shape,
      // so neighbours move together. High independence: each particle uses its own random values.
      const coherentA = 0.5 + 0.5 * Math.sin(p.spatial * 0.9 + 1.1);
      const coherentF = 0.5 + 0.5 * Math.sin(p.spatial * 0.7 + 2.3);
      p.amplitude = 1 + ((1 - lInd) * coherentA + lInd * p.r1) * 2 * lVarA - lVarA;
      p.frequency = 1 + ((1 - lInd) * coherentF + lInd * p.r2) * 2 * lVarF - lVarF;
      p.lphase = lInd * p.seed * TAU + (1 - lInd) * p.spatial;
    }
  };

  const lockStep = (p: FxParticle, dt: number) => {
    if (dt <= 0) return;
    const tt = simT * lTime;
    const f = p.frequency;
    const ph = p.lphase;
    const A = p.amplitude;
    let ox = 0;
    let oy = 0;
    if (wF > 0) {
      const a = lBase * 0.3 * wF * A;
      ox += a * (Math.sin(tt * 0.55 * f + ph) + 0.5 * Math.sin(tt * 0.93 * f + ph * 1.7 + 1.3));
      oy += a * (Math.cos(tt * 0.47 * f + ph * 1.3) + 0.5 * Math.cos(tt * 0.81 * f + ph + 2.1));
    }
    if (wW > 0) {
      const a = lBase * 0.32 * wW * A;
      ox += a * (Math.sin(tt * 2.3 * f + ph * 2.1) + 0.45 * Math.sin(tt * 4.1 * f + ph * 0.7));
      oy += a * (Math.cos(tt * 2 * f + ph * 1.4) + 0.45 * Math.cos(tt * 3.7 * f + ph * 2.9));
    }
    if (wB > 0) {
      const b = Math.sin(breathBase - p.radial * 0.9) * lMD * 0.85 * lBreathAmt * wB * p.radial;
      ox += p.ux * b;
      oy += p.uy * b;
    }
    if (wR > 0) {
      const wave = Math.sin(p.radial * 6.5 - rippleBase + (p.seed - 0.5) * 0.35 * lVarA);
      const side = Math.cos(p.radial * 6.5 - rippleBase) * 0.3;
      const a = lMD * 0.55 * lRippleAmt * wR * (0.35 + 0.65 * p.radial);
      ox += a * (p.ux * wave - p.uy * side);
      oy += a * (p.uy * wave + p.ux * side);
    }
    let energy = 0;
    if (wP > 0) {
      const d = p.radial - pulseFront;
      energy = Math.exp(-d * d * 38) * pulseFade;
      const a = lMD * 0.6 * lRippleAmt * energy;
      ox += p.ux * a;
      oy += p.uy * a;
    }
    p.energy = energy;
    const lim = lMD * 0.98;
    const m2 = ox * ox + oy * oy;
    if (m2 > lim * lim) {
      const s = lim / Math.sqrt(m2);
      ox *= s;
      oy *= s;
    }
    p.offsetX = ox;
    p.offsetY = oy;

    // Damped spring (implicit Euler, unconditionally stable) towards home + wobble.
    let vx = p.vx * 60;
    let vy = p.vy * 60;
    const hx = p.x - p.targetX;
    const hy = p.y - p.targetY;
    const dh2 = hx * hx + hy * hy;
    let boost = 1;
    if (dh2 > lMD * lMD) {
      boost = 1 + lRecovery * 3 * Math.min(1, (Math.sqrt(dh2) - lMD) / (lMD * lReach + 1));
    }
    const k = lK * boost;
    const c = lC * Math.sqrt(boost);
    const den = 1 + c * dt + k * dt * dt;
    vx = (vx - k * dt * (hx - ox)) / den;
    vy = (vy - k * dt * (hy - oy)) / den;
    const sp2 = vx * vx + vy * vy;
    if (sp2 > 5760000) {
      const s = 2400 / Math.sqrt(sp2);
      vx *= s;
      vy *= s;
    }
    let nx = hx + vx * dt;
    let ny = hy + vy * dt;
    const n2 = nx * nx + ny * ny;
    if (n2 > lLimit * lLimit) {
      const d = Math.sqrt(n2);
      const ux = nx / d;
      const uy = ny / d;
      nx = ux * lLimit;
      ny = uy * lLimit;
      const out = vx * ux + vy * uy;
      if (out > 0) {
        vx -= out * ux;
        vy -= out * uy;
      }
    }
    p.x = p.targetX + nx;
    p.y = p.targetY + ny;
    p.vx = vx / 60;
    p.vy = vy / 60;
  };

  /* -------------------------------------------------------------- shockwaves */
  const shocks: Array<{ x: number; y: number; t0: number }> = [];
  const SHOCK_SPEED = 560;
  const SHOCK_LIFE = 1.4;
  const addShock = (x: number, y: number) => {
    if (!S || !S.fx.shockwave) return;
    if (shocks.length >= 4) shocks.shift();
    shocks.push({ x, y, t0: simT });
  };
  const applyShocks = (p: FxParticle) => {
    if (!S) return;
    for (let i = 0; i < shocks.length; i += 1) {
      const sw = shocks[i];
      const age = simT - sw.t0;
      if (age > SHOCK_LIFE) continue;
      const dx = p.x - sw.x;
      const dy = p.y - sw.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const band = 70 * ref;
      const off = Math.abs(d - age * SHOCK_SPEED * ref);
      if (off < band) {
        const f = (1 - off / band) * (1 - age / SHOCK_LIFE) * S.fx.shockStrength * dtFrame * 60 * 0.9;
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f;
      }
    }
  };

  /* ------------------------------------------------------------------ light */
  const lightAt = (x: number, y: number): number => {
    let total = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let k = 0; k < beams.length; k += 1) {
      const bm = beams[k];
      const rx = x - bm.ox;
      const ry = y - bm.oy;
      const u = (rx * bm.dx + ry * bm.dy) / bm.len;
      if (u < 0 || u > 1) continue;
      const s = rx * bm.nx + ry * bm.ny;
      const sig = bm.sigma * (1 + bm.spread * u);
      const q = s / sig;
      if (q * q > 53) continue;
      const q2 = q / 2.8;
      const profile = 0.8 * Math.exp(-q * q) + 0.28 * Math.exp(-q2 * q2);
      const along = (bm.fadeIn > 0 ? smooth(u / bm.fadeIn) : 1) *
        (1 - (bm.fadeOut > 0 ? smooth((u - (1 - bm.fadeOut)) / bm.fadeOut) : 0));
      const shimmer = 0.86 + 0.14 * Math.sin(u * 9 + bm.idx * 1.9) + 0.07 * Math.sin(u * 23 + q * 0.6);
      const v = profile * along * shimmer * bm.strength;
      total += v;
      r += v * bm.r;
      g += v * bm.g;
      b += v * bm.b;
    }
    if (torchOn && ptrOn) {
      const dx = x - ptrX;
      const dy = y - ptrY;
      const d2 = dx * dx + dy * dy;
      if (d2 < tSig * tSig * 12) {
        const v = Math.exp(-d2 / (2 * tSig * tSig)) * tStr;
        total += v;
        r += v * tR;
        g += v * tG;
        b += v * tB;
      }
    }
    if (total > 0.0001) {
      cR = r / total;
      cG = g / total;
      cB = b / total;
    }
    const out = total * lGain;
    return out > 1.4 ? 1.4 : out;
  };

  const lightFactor = (p: FxParticle): number => {
    const bi = lightAt(p.x, p.y);
    let target = lAmb;
    if (bi > 0.004) {
      const g = 0.5 + 0.5 * Math.sin(p.phase * 3 + simT * (0.7 + p.r2 * 2.5));
      const glint = g * g * g * g * g * g;
      const refl = 0.35 + (p.refl - 0.35) * lRefl;
      target += bi * (0.34 + 0.9 * (refl < 0 ? 0 : refl) * (0.2 + 0.8 * glint));
    }
    if (target > 1) target = 1;
    const cur = p.lit + (target - p.lit) * lEase;
    p.lit = cur;
    return cur > 1 ? 1 : cur;
  };

  const glint = (x: number, y: number, lit: number, size: number, seed: number) => {
    if (glCount >= MAX_GLINTS) return;
    glX[glCount] = x;
    glY[glCount] = y;
    glA[glCount] = lit;
    glS[glCount] = size;
    glC[glCount] = ((cR | 0) << 16) | ((cG | 0) << 8) | (cB | 0);
    glF[glCount] = seed > 0.55 ? 1 : 0;
    glCount += 1;
  };

  const drawGlints = (ctx: CanvasRenderingContext2D) => {
    if (glCount === 0 || !S) return;
    const fxGlint = S.light.glint;
    const flareOn = Math.max(fxGlint, S.fx.glints) > 0.02;
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < glCount; i += 1) {
      const lit = glA[i];
      const D = 2.6 + glS[i] * 1.6 + 5 * Math.max(0, lit - 0.5);
      ctx.globalAlpha = Math.min(1, lit);
      ctx.drawImage(glowSprite(glC[i]), glX[i] - D, glY[i] - D, D * 2, D * 2);
      if (flareOn && glF[i] === 1 && lit > 0.78) {
        const fl = (8 + 22 * Math.max(fxGlint, S.fx.glints)) * (0.6 + 0.4 * Math.sin(simT * 3 + glX[i]));
        ctx.globalAlpha = Math.min(0.9, (lit - 0.6) * 1.2);
        ctx.drawImage(getFlare(), glX[i] - fl, glY[i] - fl, fl * 2, fl * 2);
      }
    }
    glCount = 0;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  let hazeCanvas: HTMLCanvasElement | null = null;
  const drawHaze = (ctx: CanvasRenderingContext2D) => {
    if (!S || !lightOn || S.light.haze <= 0.01 || beams.length === 0) return;
    // Painted at quarter resolution and scaled up, so the layers blend into a soft volumetric glow.
    const q = 0.25;
    const hw = Math.max(2, Math.round(W * q));
    const hh = Math.max(2, Math.round(H * q));
    if (!hazeCanvas || hazeCanvas.width !== hw || hazeCanvas.height !== hh) hazeCanvas = makeCanvas(hw, hh);
    const g = hazeCanvas.getContext("2d");
    if (!g) return;
    const hz = S.light.haze;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, hw, hh);
    g.globalCompositeOperation = "lighter";
    for (let k = 0; k < beams.length; k += 1) {
      const b = beams[k];
      const color = "rgba(" + (b.r | 0) + "," + (b.g | 0) + "," + (b.b | 0) + ",";
      for (let layer = 0; layer < 7; layer += 1) {
        const w0 = b.sigma * q * (0.3 + layer * 0.42);
        const w1 = w0 * (1 + b.spread);
        g.save();
        g.translate(b.ox * q, b.oy * q);
        g.rotate(Math.atan2(b.dy, b.dx));
        const len = b.len * q;
        const a = 0.03 * hz * b.strength * (layer < 2 ? 1.5 : 1);
        const gr = g.createLinearGradient(0, 0, len, 0);
        gr.addColorStop(0, color + "0)");
        gr.addColorStop(Math.max(0.01, b.fadeIn), color + a.toFixed(3) + ")");
        gr.addColorStop(Math.min(0.99, 1 - b.fadeOut * 0.7), color + (a * 0.6).toFixed(3) + ")");
        gr.addColorStop(1, color + "0)");
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(0, -w0);
        g.lineTo(len, -w1);
        g.lineTo(len, w1);
        g.lineTo(0, w0);
        g.closePath();
        g.fill();
        g.restore();
      }
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(hazeCanvas, 0, 0, W, H);
    ctx.restore();
  };

  const drawGuides = (ctx: CanvasRenderingContext2D) => {
    if (!S || !S.light.showGuide) return;
    ctx.save();
    ctx.lineCap = "round";
    for (let k = 0; k < beams.length; k += 1) {
      const b = beams[k];
      const ex = b.ox + b.dx * b.len;
      const ey = b.oy + b.dy * b.len;
      ctx.strokeStyle = "rgba(255,190,60,0.12)";
      ctx.lineWidth = b.sigma * 2.2;
      ctx.beginPath();
      ctx.moveTo(b.ox, b.oy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,190,60,0.7)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(b.ox, b.oy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  };

  /* --------------------------------------------------------------- gradient */
  const gradientColor = (x: number, y: number): string => {
    const dx = x - fcx;
    const dy = y - fcy;
    let t: number;
    if (gMode === 1) t = 0.5 + (dx * gCos + dy * gSin) / (2 * fR);
    else if (gMode === 2) t = Math.sqrt(dx * dx + dy * dy) / fR;
    else if (gMode === 3) t = Math.atan2(dy, dx) / TAU + 0.5;
    else t = 0.5 + dy / (2 * fR);
    if (gFlow > 0) {
      t += simT * gFlow * 0.1;
      t -= Math.floor(t);
      t = 1 - Math.abs(2 * t - 1);
    }
    t = clamp01(t);
    return lut[(t * 63 + 0.5) | 0];
  };

  /* ------------------------------------------------------------- free dust */
  let dustN = 0;
  let dX = new Float32Array(0);
  let dY = new Float32Array(0);
  let dZ = new Float32Array(0);
  let dP = new Float32Array(0);
  let dL = new Float32Array(0);
  let dR = new Float32Array(0);
  const ensureDust = (n: number) => {
    if (n === dustN) return;
    dustN = n;
    dX = new Float32Array(n);
    dY = new Float32Array(n);
    dZ = new Float32Array(n);
    dP = new Float32Array(n);
    dL = new Float32Array(n);
    dR = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      dX[i] = hash(i, 11);
      dY[i] = hash(i, 12);
      dZ[i] = Math.pow(hash(i, 13), 1.7);
      dP[i] = hash(i, 14) * TAU;
      dR[i] = hash(i, 15) * hash(i, 16);
      dL[i] = 0.2;
    }
  };

  const drawDust = (ctx: CanvasRenderingContext2D) => {
    if (!S || !S.fx.dust.enabled) return;
    const n = Math.round(S.fx.dust.amount * 1400);
    if (n < 1) return;
    ensureDust(n);
    const drift = S.fx.dust.drift;
    const lit = lightOn && S.light.lightDust;
    const par = S.backdrop.parallax * 26 * ref;
    const ox = ptrOn ? (ptrX / W - 0.5) * par : 0;
    const oy = ptrOn ? (ptrY / H - 0.5) * par : 0;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#e8edf8";
    for (let i = 0; i < n; i += 1) {
      const z = dZ[i];
      if (dtFrame > 0) {
        const sp = drift * 0.02 * (0.4 + z) * dtFrame;
        let nx = dX[i] + (Math.sin(dY[i] * 9 + simT * 0.21 + dP[i] * 0.3) * 0.5 - 0.12) * sp;
        let ny = dY[i] + (Math.cos(dX[i] * 8 - simT * 0.17) * 0.5 - 0.22) * sp;
        if (nx < 0) nx += 1; else if (nx > 1) nx -= 1;
        if (ny < 0) ny += 1; else if (ny > 1) ny -= 1;
        dX[i] = nx;
        dY[i] = ny;
      }
      const x = dX[i] * W + ox * (0.3 + z);
      const y = dY[i] * H + oy * (0.3 + z);
      let target = 0.1 + 0.38 * z;
      if (lit) {
        const bi = lightAt(x, y);
        target = lAmb * (0.4 + z * 0.8);
        if (bi > 0.004) {
          const g = 0.5 + 0.5 * Math.sin(dP[i] + simT * (0.7 + dR[i] * 3));
          target += bi * (0.34 + 0.9 * dR[i] * (0.2 + 0.8 * g * g * g * g * g * g));
        }
        if (target > 1) target = 1;
      }
      const cur = dL[i] + (target - dL[i]) * lEase;
      dL[i] = cur;
      if (cur < 0.012) continue;
      const s = 0.8 + 1.7 * z;
      if (lit && cur > 0.55 && z > 0.2) {
        glint(x, y, cur, s, dR[i] + 0.3);
      } else {
        ctx.globalAlpha = cur;
        ctx.fillRect(x - s * 0.5, y - s * 0.5, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  /* ------------------------------------------------------------ orbit rings */
  const drawRings = (ctx: CanvasRenderingContext2D, front: boolean) => {
    if (!S || !S.fx.rings.enabled) return;
    const R = S.fx.rings;
    const per = Math.min(R.perRing, Math.floor(1300 / R.count));
    const tilt = (R.tilt * Math.PI) / 180;
    const squash = Math.max(0.08, Math.cos(tilt));
    ctx.globalCompositeOperation = "lighter";
    const base = fR * R.radius;
    for (let r = 0; r < R.count; r += 1) {
      const a = base * (0.82 + 0.16 * r);
      const b = a * squash * (0.9 + 0.1 * Math.sin(r * 2.1));
      const rot = r * (Math.PI / R.count) + 0.35 + simT * R.speed * 0.04 * (r % 2 === 0 ? 1 : -1);
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      if (!front && R.trail > 0.01) {
        ctx.globalAlpha = R.trail * 0.22;
        ctx.strokeStyle = lut[Math.round(((r + 0.5) / R.count) * 63)] || "#9bd";
        ctx.lineWidth = 0.7 * R.size;
        ctx.beginPath();
        ctx.ellipse(fcx, fcy, a, b, rot, 0, TAU);
        ctx.stroke();
      }
      const dir = r % 2 === 0 ? 1 : -1;
      for (let i = 0; i < per; i += 1) {
        const jit = hash(r * 977 + i, 21);
        const th = (i / per) * TAU + simT * R.speed * 0.5 * dir * (0.85 + 0.3 * jit);
        const sy = Math.sin(th);
        const isFront = sy >= 0;
        if (isFront !== front) continue;
        const ex = a * Math.cos(th);
        const ey = b * sy + (jit - 0.5) * 3 * ref;
        const x = fcx + ex * cr - ey * sr;
        const y = fcy + ex * sr + ey * cr;
        const depth = 0.55 + 0.45 * (sy * 0.5 + 0.5);
        const bright = hash(r * 977 + i, 22) > 0.93;
        const s = (1.4 + 2.2 * jit) * R.size * depth * (bright ? 1.9 : 1) * ref;
        const col = lut[Math.round(clamp01((th / TAU + r / R.count) % 1) * 63)] || "#bcd";
        ctx.globalAlpha = (bright ? 0.95 : 0.55) * (0.55 + 0.45 * depth);
        ctx.drawImage(tintSprite(col), x - s * 1.8, y - s * 1.8, s * 3.6, s * 3.6);
        if (bright && front && S.fx.glints > 0.02) {
          const fl = 10 + 20 * S.fx.glints;
          ctx.globalAlpha = 0.55;
          ctx.drawImage(getFlare(), x - fl, y - fl, fl * 2, fl * 2);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  /* ------------------------------------------------------------- shock rings */
  const drawShocks = (ctx: CanvasRenderingContext2D) => {
    if (shocks.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = shocks.length - 1; i >= 0; i -= 1) {
      const sw = shocks[i];
      const age = simT - sw.t0;
      if (age > SHOCK_LIFE) {
        shocks.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = 0.3 * (1 - age / SHOCK_LIFE);
      ctx.strokeStyle = lut[40] || "#9cf";
      ctx.lineWidth = 1.2 + 2 * (1 - age / SHOCK_LIFE);
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, age * SHOCK_SPEED * ref, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* --------------------------------------------------------------- backdrops */
  let bd: HTMLCanvasElement | null = null;
  let bdCtx: CanvasRenderingContext2D | null = null;
  let bdKey = "";
  let bdFrame = -9;
  const STAR_N = 900;
  const starsReady = { v: false };
  let sX = new Float32Array(0);
  let sY = new Float32Array(0);
  let sZ = new Float32Array(0);
  let sP = new Float32Array(0);
  const ensureStars = () => {
    if (starsReady.v) return;
    starsReady.v = true;
    sX = new Float32Array(STAR_N);
    sY = new Float32Array(STAR_N);
    sZ = new Float32Array(STAR_N);
    sP = new Float32Array(STAR_N);
    for (let i = 0; i < STAR_N; i += 1) {
      sX[i] = hash(i, 31);
      sY[i] = hash(i, 32);
      sZ[i] = Math.pow(hash(i, 33), 2.2);
      sP[i] = hash(i, 34) * TAU;
    }
  };

  const drawStars = (g: CanvasRenderingContext2D, w: number, h: number, density: number, scale: number) => {
    ensureStars();
    const n = Math.floor(STAR_N * clamp01(density));
    const par = S ? S.backdrop.parallax * 22 * ref : 0;
    const ox = ptrOn ? (ptrX / W - 0.5) * par : 0;
    const oy = ptrOn ? (ptrY / H - 0.5) * par : 0;
    g.fillStyle = "#dfe8ff";
    for (let i = 0; i < n; i += 1) {
      const z = sZ[i];
      const tw = 0.55 + 0.45 * Math.sin(simT * (0.6 + z * 2.2) + sP[i]);
      const x = ((sX[i] * w + ox * (0.2 + z) * scale) % w + w) % w;
      const y = ((sY[i] * h + oy * (0.2 + z) * scale) % h + h) % h;
      const s = (0.5 + 1.5 * z) * scale;
      g.globalAlpha = (0.18 + 0.75 * z) * tw;
      if (s > 1.7 * scale) {
        g.drawImage(tintSprite(i % 5 === 0 ? "#ffd8a8" : i % 3 === 0 ? "#a8d0ff" : "#ffffff"), x - s * 2.2, y - s * 2.2, s * 4.4, s * 4.4);
      } else {
        g.fillRect(x - s * 0.5, y - s * 0.5, s, s);
      }
    }
    g.globalAlpha = 1;
  };

  const blob = (g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(color, a));
    gr.addColorStop(0.5, rgba(color, a * 0.32));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };

  const paintBackdrop = (g: CanvasRenderingContext2D, w: number, h: number, bs: number) => {
    if (!S) return;
    const B = S.backdrop;
    const t = simT * B.speed;
    const I = B.intensity;
    const cols = [B.colorA, B.colorB, B.colorC];
    const big = Math.max(w, h);
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    if (B.kind === "Nebula") {
      for (let i = 0; i < 5; i += 1) {
        const ang = t * (0.07 + 0.03 * i) + i * 1.3;
        const x = w * (0.5 + 0.4 * Math.sin(ang * 1.1 + i));
        const y = h * (0.5 + 0.36 * Math.cos(ang * 0.9 + i * 2.1));
        blob(g, x, y, big * (0.34 + 0.1 * Math.sin(i * 3 + t * 0.1)) * B.scale, cols[i % 3], 0.5 * I);
      }
      blob(g, w * 0.5, h * 0.5, big * 0.5 * B.scale, cols[1], 0.12 * I);
      drawStars(g, w, h, B.stars * 0.5, bs);
    } else if (B.kind === "Aurora") {
      const bands = 4;
      for (let i = 0; i < bands; i += 1) {
        const col = cols[i % 3];
        const baseY = h * (0.22 + 0.13 * i) + Math.sin(t * 0.17 + i) * h * 0.03;
        const amp = h * 0.09 * B.scale;
        const hgt = h * 0.5;
        const gr = g.createLinearGradient(0, baseY - amp, 0, baseY + hgt);
        gr.addColorStop(0, rgba(col, 0));
        gr.addColorStop(0.18, rgba(col, 0.5 * I));
        gr.addColorStop(0.55, rgba(col, 0.16 * I));
        gr.addColorStop(1, rgba(col, 0));
        g.fillStyle = gr;
        g.beginPath();
        const step = Math.max(4, w / 60);
        g.moveTo(0, baseY + hgt);
        for (let x = 0; x <= w + step; x += step) {
          const y = baseY + Math.sin(x * (0.006 / bs) + t * 0.5 + i * 1.7) * amp + Math.sin(x * (0.0145 / bs) - t * 0.8 + i) * amp * 0.45;
          g.lineTo(x, y);
        }
        g.lineTo(w, baseY + hgt);
        g.closePath();
        g.fill();
      }
      drawStars(g, w, h, B.stars * 0.4, bs);
    } else if (B.kind === "Starfield") {
      blob(g, w * 0.5, h * 0.55, big * 0.6, B.colorA, 0.1 * I);
      drawStars(g, w, h, B.stars, 1);
    } else if (B.kind === "Floor Glow") {
      const cy = h * 0.86;
      const rx = w * 0.62 * B.scale;
      const ry = h * 0.13 * B.scale;
      g.save();
      g.translate(w * 0.5, cy);
      g.scale(1, ry / rx);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, rgba(B.colorA, 0.85 * I));
      gr.addColorStop(0.35, rgba(B.colorB, 0.35 * I));
      gr.addColorStop(1, rgba(B.colorC, 0));
      g.fillStyle = gr;
      g.fillRect(-rx, -rx, rx * 2, rx * 2);
      g.lineWidth = 1.2 * bs;
      for (let k = 0; k < 4; k += 1) {
        const f = ((t * 0.06 + k * 0.25) % 1);
        g.strokeStyle = rgba(cols[k % 3], 0.5 * I * (1 - f));
        g.beginPath();
        g.arc(0, 0, rx * (0.18 + 0.75 * f), 0, TAU);
        g.stroke();
      }
      g.restore();
      blob(g, w * 0.5, h * 0.45, big * 0.5, B.colorC, 0.07 * I);
      drawStars(g, w, h, B.stars * 0.35, bs);
    } else if (B.kind === "Grid Floor") {
      const hy = h * 0.56;
      const vx = w * 0.5 + (ptrOn ? (ptrX / W - 0.5) * B.parallax * 60 * bs : 0);
      const hg = g.createLinearGradient(0, hy - h * 0.18, 0, hy + h * 0.05);
      hg.addColorStop(0, rgba(B.colorC, 0));
      hg.addColorStop(0.85, rgba(B.colorB, 0.45 * I));
      hg.addColorStop(1, rgba(B.colorA, 0.2 * I));
      g.fillStyle = hg;
      g.fillRect(0, hy - h * 0.18, w, h * 0.23);
      g.lineWidth = Math.max(1, 1.1 * bs);
      const rows = 16;
      for (let i = 0; i < rows; i += 1) {
        const z = (i + ((t * 0.3) % 1)) / rows;
        const y = hy + (h - hy) * z * z;
        g.strokeStyle = rgba(B.colorA, (0.12 + 0.7 * z) * I);
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      for (let j = -16; j <= 16; j += 1) {
        const xb = vx + j * w * 0.11 * B.scale;
        g.strokeStyle = rgba(B.colorA, 0.5 * I * (1 - Math.abs(j) / 18));
        g.beginPath();
        g.moveTo(vx + j * w * 0.004, hy);
        g.lineTo(xb, h);
        g.stroke();
      }
      drawStars(g, w, hy, B.stars * 0.6, bs);
    } else if (B.kind === "Mesh Gradient") {
      g.globalCompositeOperation = "source-over";
      g.fillStyle = rgba(B.colorC, 0.28 * I);
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i += 1) {
        const ang = t * (0.09 + 0.04 * i) + i * 1.9;
        blob(g, w * (0.5 + 0.45 * Math.sin(ang)), h * (0.5 + 0.42 * Math.cos(ang * 1.2 + i)), big * 0.55 * B.scale, cols[i % 3], 0.75 * I);
      }
    } else if (B.kind === "Haze") {
      for (let i = 0; i < 7; i += 1) {
        const ang = t * (0.05 + 0.02 * i) + i * 0.9;
        const x = w * (0.5 + 0.55 * Math.sin(ang + i));
        const y = h * (0.5 + 0.3 * Math.cos(ang * 0.8 + i * 1.7));
        g.save();
        g.translate(x, y);
        g.scale(1.9, 0.7);
        blob(g, 0, 0, big * 0.28 * B.scale, i % 2 === 0 ? B.colorA : "#ffffff", (i % 2 === 0 ? 0.28 : 0.1) * I);
        g.restore();
      }
      drawStars(g, w, h, B.stars * 0.3, bs);
    }
    g.globalCompositeOperation = "source-over";
  };

  const drawBackdrop = (ctx: CanvasRenderingContext2D, trails: boolean) => {
    if (!S || S.backdrop.kind === "None") return;
    const crisp = S.backdrop.kind === "Starfield" || S.backdrop.kind === "Grid Floor";
    const bs = crisp ? 1 : 0.5;
    const bw = Math.max(2, Math.round(W * bs));
    const bh = Math.max(2, Math.round(H * bs));
    const key = bw + "x" + bh + S.backdrop.kind;
    if (!bd || key !== bdKey) {
      bd = makeCanvas(bw, bh);
      bdCtx = bd.getContext("2d");
      bdKey = key;
      bdFrame = -9;
    }
    if (!bdCtx) return;
    if (crisp || frameNo - bdFrame >= 2) {
      paintBackdrop(bdCtx, bw, bh, bs);
      bdFrame = frameNo;
    }
    ctx.globalCompositeOperation = trails ? "source-over" : "screen";
    ctx.globalAlpha = trails ? 0.35 : 1;
    ctx.drawImage(bd, 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  /* -------------------------------------------------------------- post FX */
  let bloomA: HTMLCanvasElement | null = null;
  let bloomB: HTMLCanvasElement | null = null;
  let noise: HTMLCanvasElement | null = null;
  const post = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, trails: boolean) => {
    if (!S || trails) return;
    const bloom = S.fx.bloom;
    if (bloom > 0.01) {
      const aw = Math.max(2, Math.round(W / 4));
      const ah = Math.max(2, Math.round(H / 4));
      if (!bloomA || bloomA.width !== aw || bloomA.height !== ah) {
        bloomA = makeCanvas(aw, ah);
        bloomB = makeCanvas(Math.max(2, Math.round(aw / 2)), Math.max(2, Math.round(ah / 2)));
      }
      const ga = bloomA.getContext("2d");
      const gb = bloomB ? bloomB.getContext("2d") : null;
      if (ga && gb && bloomB) {
        ga.globalCompositeOperation = "copy";
        ga.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, aw, ah);
        gb.globalCompositeOperation = "copy";
        gb.drawImage(bloomA, 0, 0, aw, ah, 0, 0, bloomB.width, bloomB.height);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = Math.min(1, bloom * 0.85);
        ctx.drawImage(bloomB, 0, 0, W, H);
        ctx.globalAlpha = Math.min(1, bloom * 0.55);
        ctx.drawImage(bloomA, 0, 0, W, H);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }
    const B = S.backdrop;
    if (B.vignette > 0.01) {
      const r0 = Math.min(W, H) * 0.28;
      const r1 = Math.max(W, H) * 0.78;
      const gr = ctx.createRadialGradient(W / 2, H / 2, r0, W / 2, H / 2, r1);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, "rgba(0,0,0," + (0.82 * B.vignette).toFixed(3) + ")");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
    if (B.grain > 0.01) {
      if (!noise) {
        noise = makeCanvas(128, 128);
        const ng = noise.getContext("2d");
        if (ng) {
          const img = ng.createImageData(128, 128);
          for (let i = 0; i < img.data.length; i += 4) {
            const v = (hash(i, 77) * 255) | 0;
            img.data[i] = v;
            img.data[i + 1] = v;
            img.data[i + 2] = v;
            img.data[i + 3] = 255;
          }
          ng.putImageData(img, 0, 0);
        }
      }
      const pat = ctx.createPattern(noise, "repeat");
      if (pat) {
        ctx.save();
        ctx.translate(((frameNo * 37) % 128) - 128, ((frameNo * 91) % 128) - 128);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.09 * B.grain;
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, W + 256, H + 256);
        ctx.restore();
      }
    }
  };

  return {
    blank,
    begin,
    time: () => simT,
    setPointer: (x, y, active) => {
      ptrX = x;
      ptrY = y;
      ptrOn = active;
    },
    addShock,
    shockActive: () => shocks.length > 0,
    applyShocks,
    lockEnabled: () => lockOn,
    externalScale: () => lExt,
    initParticle,
    finalizeHomes,
    refresh,
    lockStep,
    gradientActive: () => gMode !== 0,
    gradientColor,
    lightActive: () => lightOn,
    lightFactor,
    lightAt,
    glint,
    bokeh: () => (S ? S.fx.bokeh : 0),
    drawBackdrop,
    drawHaze,
    drawDust,
    drawRings,
    drawGlints,
    drawShocks,
    drawGuides,
    post,
    formation: () => ({ x: fcx, y: fcy, r: fR }),
  };
}
