/**
 * CPU particle simulation: structure-of-arrays state, fixed timestep, stackable behaviours,
 * formation deformers, identity-preserving morphs and pointer interaction. No DOM, no React.
 */
import type { Behavior, BehaviorBlend, Deformer, EasingName, Falloff, Formation, InteractionTool, QualityProfile, SimSettings } from "./types";
import { EASINGS, TAU } from "./math";
import { getNoiseVolume, sampleNoise } from "./noiseField";
import { SpatialHash } from "./spatialHash";
import { compileExpression, type ExprFn } from "./expression";

export const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;

export interface PointerForce { active: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; dx: number; dy: number; dz: number; radius: number; strength: number; tool: InteractionTool }
export const newPointer = (): PointerForce => ({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, dx: 0, dy: 0, dz: -1, radius: 0.35, strength: 1, tool: "none" });
export interface MorphOptions { duration: number; easing: EasingName }

function falloff(d2: number, R: number, mode: Falloff): number {
  if (R <= 0) return 1;
  const d = Math.sqrt(d2);
  if (d >= R) return 0;
  const q = 1 - d / R;
  return mode === "none" ? 1 : mode === "linear" ? q : mode === "smooth" ? q * q * (3 - 2 * q) : q / (1 + 8 * (d / R) * (d / R));
}
function blendInto(acc: Float32Array, o: number, ax: number, ay: number, az: number, mode: BehaviorBlend, w: number) {
  if (mode === "add") { acc[o] += ax; acc[o + 1] += ay; acc[o + 2] += az; }
  else if (mode === "replace") { const k = w > 1 ? 1 : w; acc[o] = acc[o] * (1 - k) + ax * k; acc[o + 1] = acc[o + 1] * (1 - k) + ay * k; acc[o + 2] = acc[o + 2] * (1 - k) + az * k; }
  else if (ax * ax + ay * ay + az * az > acc[o] * acc[o] + acc[o + 1] * acc[o + 1] + acc[o + 2] * acc[o + 2]) { acc[o] = ax; acc[o + 1] = ay; acc[o + 2] = az; }
}
const norm3 = (v: ArrayLike<number>): [number, number, number] => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export class Simulation {
  cap = 0; n = 0; active = 0; time = 0; tick = 0; attrVersion = 0; stepMs = 0; paused = false;
  pos = new Float32Array(0); vel = new Float32Array(0); acc = new Float32Array(0); home = new Float32Array(0); homeBase = new Float32Array(0);
  nrm = new Float32Array(0); t = new Float32Array(0); size = new Float32Array(0); alpha = new Float32Array(0); phase = new Float32Array(0); weight = new Float32Array(0);
  layer = new Uint8Array(0); radius = 1;
  private invMass = new Float32Array(0); private springScale = new Float32Array(0);
  private srcPos = new Float32Array(0); private dstPos = new Float32Array(0); private srcNrm = new Float32Array(0); private dstNrm = new Float32Array(0);
  private srcT = new Float32Array(0); private dstT = new Float32Array(0); private srcSize = new Float32Array(0); private dstSize = new Float32Array(0); private srcAlpha = new Float32Array(0); private dstAlpha = new Float32Array(0);
  morphing = false; private morphT = 0; private morphDur = 1; private morphEase: EasingName = "easeInOut"; morphProgress = 0;
  settings: SimSettings = { substeps: 1, damping: 1, maxSpeed: 40, massVariation: 0, massInfluence: 0 };
  behaviors: Behavior[] = []; deformers: Deformer[] = []; quality: QualityProfile = { maxCount: 80000, dpr: 1, bloom: 1, maxSubsteps: 2, neighborStride: 8 };
  pointers: PointerForce[] = [newPointer(), newPointer(), newPointer(), newPointer()];
  private acc_t = 0; private massKey = ""; private hash = new SpatialHash(16); private nbr = new Int32Array(24);
  private exprCache = new Map<string, ExprFn | null>(); private noise = new Float32Array(3);

  private ensure(n: number) {
    if (n <= this.cap) return;
    const c = Math.max(n, Math.ceil(this.cap * 1.25)), grow = (a: Float32Array, k: number) => { const b = new Float32Array(c * k); b.set(a); return b; };
    this.pos = grow(this.pos, 3); this.vel = grow(this.vel, 3); this.acc = grow(this.acc, 3); this.home = grow(this.home, 3); this.homeBase = grow(this.homeBase, 3); this.nrm = grow(this.nrm, 3);
    this.t = grow(this.t, 1); this.size = grow(this.size, 1); this.alpha = grow(this.alpha, 1); this.phase = grow(this.phase, 1); this.weight = grow(this.weight, 1); this.invMass = grow(this.invMass, 1); this.springScale = grow(this.springScale, 1).fill(1);
    const l = new Uint8Array(c); l.set(this.layer); this.layer = l;
    this.srcPos = grow(this.srcPos, 3); this.dstPos = grow(this.dstPos, 3); this.srcNrm = grow(this.srcNrm, 3); this.dstNrm = grow(this.dstNrm, 3);
    this.srcT = grow(this.srcT, 1); this.dstT = grow(this.dstT, 1); this.srcSize = grow(this.srcSize, 1); this.dstSize = grow(this.dstSize, 1); this.srcAlpha = grow(this.srcAlpha, 1); this.dstAlpha = grow(this.dstAlpha, 1);
    this.cap = c;
  }
  /** Immediately replaces the formation (no morph). */
  load(f: Formation) {
    this.ensure(f.n); this.n = f.n; this.active = f.n; this.morphing = false; this.radius = f.radius;
    const n = f.n;
    this.pos.set(f.pos.subarray(0, n * 3)); this.home.set(f.pos.subarray(0, n * 3)); this.homeBase.set(f.pos.subarray(0, n * 3)); this.vel.fill(0, 0, n * 3); this.nrm.set(f.nrm.subarray(0, n * 3));
    this.t.set(f.t); this.size.set(f.size); this.alpha.set(f.alpha); this.phase.set(f.phase); this.weight.set(f.weight); this.layer.set(f.layer);
    this.massKey = ""; this.refreshMass(); this.attrVersion++;
  }
  /** Morphs the current formation into f, preserving particle identity (Morton-order matching). */
  morphTo(f: Formation, opts: MorphOptions) {
    if (this.n === 0 || opts.duration <= 0) { this.load(f); return; }
    const oldN = this.n, n = f.n;
    this.ensure(n);
    if (n > oldN) for (let i = oldN; i < n; i++) { const j = i % oldN, a = i * 3, b = j * 3; for (let c = 0; c < 3; c++) { this.pos[a + c] = this.pos[b + c]; this.vel[a + c] = this.vel[b + c]; this.homeBase[a + c] = this.homeBase[b + c]; this.home[a + c] = this.home[b + c]; this.nrm[a + c] = this.nrm[b + c]; } this.t[i] = this.t[j]; this.size[i] = this.size[j]; this.alpha[i] = this.alpha[j]; }
    this.n = n; this.active = Math.min(this.active, n) || n;
    this.srcPos.set(this.homeBase.subarray(0, n * 3)); this.srcNrm.set(this.nrm.subarray(0, n * 3)); this.srcT.set(this.t.subarray(0, n)); this.srcSize.set(this.size.subarray(0, n)); this.srcAlpha.set(this.alpha.subarray(0, n));
    const perm = matchMorton(this.srcPos, f.pos, n);
    for (let i = 0; i < n; i++) {
      const j = perm[i], a = i * 3, b = j * 3;
      this.dstPos[a] = f.pos[b]; this.dstPos[a + 1] = f.pos[b + 1]; this.dstPos[a + 2] = f.pos[b + 2]; this.dstNrm[a] = f.nrm[b]; this.dstNrm[a + 1] = f.nrm[b + 1]; this.dstNrm[a + 2] = f.nrm[b + 2];
      this.dstT[i] = f.t[j]; this.dstSize[i] = f.size[j]; this.dstAlpha[i] = f.alpha[j]; this.phase[i] = f.phase[j]; this.weight[i] = f.weight[j]; this.layer[i] = f.layer[j];
    }
    this.morphing = true; this.morphT = 0; this.morphDur = opts.duration; this.morphEase = opts.easing; this.radius = f.radius; this.massKey = ""; this.refreshMass();
  }
  configure(sim: SimSettings, behaviors: Behavior[], deformers: Deformer[], quality: QualityProfile) {
    this.settings = sim; this.behaviors = behaviors; this.deformers = deformers; this.quality = quality;
    for (const b of behaviors) if (b.type === "custom" && b.expr) for (const e of b.expr) if (!this.exprCache.has(e)) this.exprCache.set(e, compileExpression(e));
    this.refreshMass();
  }
  private refreshMass() {
    const key = `${this.n}|${this.settings.massVariation}|${this.settings.massInfluence}`;
    if (key === this.massKey) return;
    this.massKey = key;
    for (let i = 0; i < this.n; i++) { const m = 1 + this.settings.massVariation * (this.phase[i] * 2 - 1) * 0.8; this.invMass[i] = Math.pow(Math.max(0.2, m), -this.settings.massInfluence); }
  }
  setActiveFraction(x: number) { this.active = Math.max(1, Math.min(this.n, Math.floor(this.n * Math.min(1, Math.max(0.05, x))))); }
  /** Snaps every particle back to its home position and stops it. */
  reset() { this.pos.set(this.home.subarray(0, this.n * 3)); this.vel.fill(0, 0, this.n * 3); }

  /** Instant radial velocity impulse (click burst). radius <= 0 affects everything. */
  burst(cx: number, cy: number, cz: number, radius: number, strength: number) {
    const { pos, vel, phase } = this;
    for (let i = 0; i < this.n; i++) {
      const o = i * 3, dx = pos[o] - cx, dy = pos[o + 1] - cy, dz = pos[o + 2] - cz, d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) + 1e-6;
      const w = falloff(d2, radius, "smooth"); if (w <= 0) continue;
      const k = (strength * w * (0.35 + 0.65 * phase[i])) / d; vel[o] += dx * k; vel[o + 1] += dy * k; vel[o + 2] += dz * k;
    }
  }

  /** Advances by real time using a fixed timestep accumulator. Returns the number of fixed steps taken. */
  update(realDt: number): number {
    if (this.n === 0 || this.paused) return 0;
    this.acc_t += Math.min(realDt, 0.1);
    this.beginFrame(realDt);
    let steps = 0;
    const sub = Math.max(1, Math.min(this.quality.maxSubsteps, Math.round(this.settings.substeps)));
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    while (this.acc_t >= FIXED_DT && steps < MAX_STEPS) {
      for (let s = 0; s < sub; s++) this.step(FIXED_DT / sub);
      this.acc_t -= FIXED_DT; steps++;
    }
    if (steps === MAX_STEPS) this.acc_t = 0;
    if (typeof performance !== "undefined") { const ms = performance.now() - t0; this.stepMs = this.stepMs * 0.9 + ms * 0.1; }
    return steps;
  }

  private beginFrame(dt: number) {
    const n = this.n;
    if (this.morphing) {
      this.morphT += Math.min(dt, 0.1) / this.morphDur;
      const k = Math.min(1, this.morphT), e = EASINGS[this.morphEase](k), arc = Math.sin(Math.PI * e) * 0.28, hb = this.homeBase, sp = this.srcPos, dp = this.dstPos;
      for (let i = 0; i < n; i++) {
        const o = i * 3, p = this.phase[i], hx = Math.sin(p * 37.1), hy = Math.cos(p * 91.7), hz = Math.sin(p * 53.3);
        const dx = dp[o] - sp[o], dy = dp[o + 1] - sp[o + 1], dz = dp[o + 2] - sp[o + 2];
        hb[o] = sp[o] + dx * e + (dy * hz - dz * hy) * arc; hb[o + 1] = sp[o + 1] + dy * e + (dz * hx - dx * hz) * arc; hb[o + 2] = sp[o + 2] + dz * e + (dx * hy - dy * hx) * arc;
        const o3 = i * 3;
        this.nrm[o3] = this.srcNrm[o3] + (this.dstNrm[o3] - this.srcNrm[o3]) * e; this.nrm[o3 + 1] = this.srcNrm[o3 + 1] + (this.dstNrm[o3 + 1] - this.srcNrm[o3 + 1]) * e; this.nrm[o3 + 2] = this.srcNrm[o3 + 2] + (this.dstNrm[o3 + 2] - this.srcNrm[o3 + 2]) * e;
        this.t[i] = this.srcT[i] + (this.dstT[i] - this.srcT[i]) * e; this.size[i] = this.srcSize[i] + (this.dstSize[i] - this.srcSize[i]) * e; this.alpha[i] = this.srcAlpha[i] + (this.dstAlpha[i] - this.srcAlpha[i]) * e;
      }
      this.morphProgress = k; this.attrVersion++;
      if (k >= 1) this.morphing = false;
    }
    this.applyDeformers();
  }

  private applyDeformers() {
    const n = this.n, hb = this.homeBase, h = this.home, t = this.time, list = this.deformers.filter((d) => d.enabled && d.amount !== 0);
    if (!list.length) { h.set(hb.subarray(0, n * 3)); return; }
    const vol = getNoiseVolume(), nz = this.noise;
    for (let i = 0; i < n; i++) {
      const o = i * 3, w = this.weight[i];
      let x = hb[o], y = hb[o + 1], z = hb[o + 2];
      for (let k = 0; k < list.length; k++) {
        const d = list[k], ax = d.axis === "x" ? 0 : d.axis === "y" ? 1 : 2, amt = d.amount * w;
        switch (d.type) {
          case "breathe": {
            const p = this.phase[i], s = 1 + amt * (0.6 * Math.sin(d.speed * t * 0.9 + p * 18.85 + 2.1 * (x + z)) + 0.4 * Math.sin(d.speed * t * 1.4 + p * 43.98 + 1.7 * y));
            x *= s; y *= s; z *= s; break;
          }
          case "twist": {
            const c = ax === 0 ? x : ax === 1 ? y : z, a = amt * c + (d.speed > 0 ? 0.5 * amt * Math.sin(d.speed * t) : 0), cs = Math.cos(a), sn = Math.sin(a);
            if (ax === 0) { const yy = y * cs - z * sn; z = y * sn + z * cs; y = yy; } else if (ax === 1) { const xx = x * cs - z * sn; z = x * sn + z * cs; x = xx; } else { const xx = x * cs - y * sn; y = x * sn + y * cs; x = xx; }
            break;
          }
          case "bend": {
            const c = ax === 0 ? x : ax === 1 ? y : z, off = (amt * c * c) / Math.max(0.2, d.scale) * (1 + (d.speed > 0 ? 0.35 * Math.sin(d.speed * t) : 0));
            if (ax === 0) y += off; else if (ax === 1) x += off; else x += off;
            break;
          }
          case "wave": {
            const c = ax === 0 ? x : ax === 1 ? y : z, other = ax === 0 ? z : ax === 1 ? x : y, s = amt * Math.sin(d.scale * TAU * c * 0.5 - d.speed * t + other * 1.3) * (0.7 + 0.3 * Math.sin(1.7 * other + t * 0.4));
            const nx = this.nrm[o], ny = this.nrm[o + 1], nzz = this.nrm[o + 2];
            if (nx * nx + ny * ny + nzz * nzz > 0.01) { x += nx * s; y += ny * s; z += nzz * s; } else if (ax === 0) x += s; else if (ax === 1) y += s; else z += s;
            break;
          }
          case "noise": {
            sampleNoise(vol, x * d.scale + t * d.speed * 0.37, y * d.scale + t * d.speed * 0.21, z * d.scale - t * d.speed * 0.29, nz);
            const nx = this.nrm[o], ny = this.nrm[o + 1], nzz = this.nrm[o + 2];
            if (nx * nx + ny * ny + nzz * nzz > 0.01) { const s = nz[0] * amt * 2; x += nx * s; y += ny * s; z += nzz * s; } else { x += nz[0] * amt; y += nz[1] * amt; z += nz[2] * amt; }
            break;
          }
          case "rotate": {
            const c1 = ax === 0 ? y : ax === 1 ? x : x, c2 = ax === 0 ? z : ax === 1 ? z : y, r = Math.sqrt(c1 * c1 + c2 * c2), a = d.amount * t * (d.scale > 0 ? Math.pow(Math.max(r, 0.08), -d.scale) : 1), cs = Math.cos(a), sn = Math.sin(a);
            const n1 = c1 * cs - c2 * sn, n2 = c1 * sn + c2 * cs;
            if (ax === 0) { y = n1; z = n2; } else if (ax === 1) { x = n1; z = n2; } else { x = n1; y = n2; }
            break;
          }
          case "stretch": {
            const f = 1 + amt * Math.sin(d.speed * t), g = 1 / Math.sqrt(f);
            if (ax === 0) { x *= f; y *= g; z *= g; } else if (ax === 1) { y *= f; x *= g; z *= g; } else { z *= f; x *= g; y *= g; }
            break;
          }
        }
      }
      h[o] = x; h[o + 1] = y; h[o + 2] = z;
    }
  }

  /** One fixed integration step of length dt. */
  step(dt: number) {
    const na = this.active, acc = this.acc;
    acc.fill(0, 0, na * 3);
    let dragK = 0, needHash = false, hashR = 0, hasRelease = false;
    for (const b of this.behaviors) if (b.enabled) { if (b.type === "release") hasRelease = true; if (b.type === "cohesion" || b.type === "separation" || b.type === "alignment") { needHash = true; hashR = Math.max(hashR, b.radius); } }
    if (hasRelease) this.springScale.fill(1, 0, na);
    if (needHash) this.hash.build(this.pos, na, Math.max(0.01, hashR), 2, this.tick & 1);
    for (const b of this.behaviors) {
      if (!b.enabled) continue;
      let I = b.intensity;
      if (b.anim !== "none") {
        const ph = this.time * b.animRate * TAU;
        I *= 1 + b.animDepth * (b.anim === "sine" ? Math.sin(ph) : b.anim === "pulse" ? Math.pow(Math.max(0, Math.sin(ph)), 4) * 2 - 0.5 : Math.sin(ph * 0.7) * Math.sin(ph * 1.3 + 1));
      }
      if (b.type === "drag") { dragK += I; continue; }
      this.applyBehavior(b, I, dt);
    }
    for (let k = 0; k < this.pointers.length; k++) if (this.pointers[k].active && this.pointers[k].tool !== "none") this.applyPointer(this.pointers[k], dt);
    // integrate
    const { pos, vel, invMass } = this, maxV = this.settings.maxSpeed, damp = Math.exp(-(dragK + this.settings.damping * 0) * dt), mv2 = maxV * maxV, bound = Math.max(8, this.radius * 12), b2 = bound * bound;
    for (let i = 0; i < na; i++) {
      const o = i * 3, im = invMass[i];
      let vx = (vel[o] + acc[o] * im * dt) * damp, vy = (vel[o + 1] + acc[o + 1] * im * dt) * damp, vz = (vel[o + 2] + acc[o + 2] * im * dt) * damp;
      const v2 = vx * vx + vy * vy + vz * vz;
      if (v2 > mv2) { const k = maxV / Math.sqrt(v2); vx *= k; vy *= k; vz *= k; }
      let x = pos[o] + vx * dt, y = pos[o + 1] + vy * dt, z = pos[o + 2] + vz * dt;
      if (!(x * x + y * y + z * z < b2)) { x = this.home[o]; y = this.home[o + 1]; z = this.home[o + 2]; vx = vy = vz = 0; } // also catches NaN
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; vel[o] = vx; vel[o + 1] = vy; vel[o + 2] = vz;
    }
    for (const b of this.behaviors) if (b.enabled && b.type === "collider") this.collide(b);
    this.time += dt; this.tick++;
  }

  private applyBehavior(b: Behavior, I: number, dt: number) {
    const na = this.active, { pos, vel, acc, home } = this, mode = b.blend, c = b.center, R = b.radius, fm = b.falloff;
    switch (b.type) {
      case "home": {
        const k = I, zeta = b.aux, cd = 2 * zeta * Math.sqrt(Math.max(0, k)), ss = this.springScale;
        for (let i = 0; i < na; i++) { const o = i * 3, s = ss[i]; acc[o] += (home[o] - pos[o]) * k * s - vel[o] * cd * s; acc[o + 1] += (home[o + 1] - pos[o + 1]) * k * s - vel[o + 1] * cd * s; acc[o + 2] += (home[o + 2] - pos[o + 2]) * k * s - vel[o + 2] * cd * s; }
        break;
      }
      case "release": {
        const share = Math.min(1, Math.max(0, I)), rate = b.speed, loose = b.aux, ss = this.springScale, t = this.time;
        for (let i = 0; i < na; i++) { const p = this.phase[i]; if (p >= share) continue; const cyc = (t * rate + p * 7.31) % 1, m = Math.sin(Math.PI * cyc); ss[i] = 1 - loose * m * m; }
        break;
      }
      case "gravity": case "directional": { const d = norm3(b.dir); for (let i = 0; i < na; i++) blendInto(acc, i * 3, d[0] * I, d[1] * I, d[2] * I, mode, 1); break; }
      case "attractor": case "repeller": {
        const sg = b.type === "attractor" ? 1 : -1;
        for (let i = 0; i < na; i++) { const o = i * 3, dx = c[0] - pos[o], dy = c[1] - pos[o + 1], dz = c[2] - pos[o + 2], d2 = dx * dx + dy * dy + dz * dz, w = falloff(d2, R, fm); if (w <= 0) continue; const k = (sg * I * w) / (Math.sqrt(d2) + 0.05); blendInto(acc, o, dx * k, dy * k, dz * k, mode, w); }
        break;
      }
      case "radial": {
        for (let i = 0; i < na; i++) { const o = i * 3, dx = pos[o] - c[0], dy = pos[o + 1] - c[1], dz = pos[o + 2] - c[2], d2 = dx * dx + dy * dy + dz * dz, w = falloff(d2, R, fm); if (w <= 0) continue; const k = (I * w) / (Math.sqrt(d2) + 0.05); blendInto(acc, o, dx * k, dy * k, dz * k, mode, w); }
        break;
      }
      case "vortex": {
        const a = norm3(b.dir), lift = b.aux;
        for (let i = 0; i < na; i++) {
          const o = i * 3, dx = pos[o] - c[0], dy = pos[o + 1] - c[1], dz = pos[o + 2] - c[2], d2 = dx * dx + dy * dy + dz * dz, w = falloff(d2, R, fm); if (w <= 0) continue;
          let tx = a[1] * dz - a[2] * dy, ty = a[2] * dx - a[0] * dz, tz = a[0] * dy - a[1] * dx; const tl = Math.hypot(tx, ty, tz) + 1e-4, k = (I * w) / tl;
          tx *= k; ty *= k; tz *= k; blendInto(acc, o, tx + a[0] * lift * w, ty + a[1] * lift * w, tz + a[2] * lift * w, mode, w);
        }
        break;
      }
      case "curl": case "turbulence": {
        const vol = getNoiseVolume(), nz = this.noise, s = b.scale, tt = this.time * b.speed, off = b.type === "curl" ? 0 : 11.7;
        for (let i = 0; i < na; i++) { const o = i * 3; sampleNoise(vol, pos[o] * s + tt * 0.31 + off, pos[o + 1] * s + tt * 0.17, pos[o + 2] * s - tt * 0.23 + off * 0.5, nz); blendInto(acc, o, nz[0] * I, nz[1] * I, nz[2] * I, mode, 1); }
        break;
      }
      case "magnetic": { const a = norm3(b.dir); for (let i = 0; i < na; i++) { const o = i * 3, vx = vel[o], vy = vel[o + 1], vz = vel[o + 2]; blendInto(acc, o, (vy * a[2] - vz * a[1]) * I, (vz * a[0] - vx * a[2]) * I, (vx * a[1] - vy * a[0]) * I, mode, 1); } break; }
      case "wave": {
        const d = norm3(b.dir), k = b.scale * TAU, ph = this.time * b.speed;
        for (let i = 0; i < na; i++) { const o = i * 3, s = Math.sin(k * (pos[o] * d[0] + pos[o + 1] * d[1] + pos[o + 2] * d[2]) - ph) * I; blendInto(acc, o, d[0] * s, d[1] * s, d[2] * s, mode, 1); }
        break;
      }
      case "cohesion": case "separation": case "alignment": {
        const stride = Math.max(1, this.quality.neighborStride), off = this.tick % stride, nb = this.nbr, gain = I * stride;
        for (let i = off; i < na; i += stride) {
          const o = i * 3, cnt = this.hash.query(pos, pos[o], pos[o + 1], pos[o + 2], R, nb, i); if (!cnt) continue;
          let sx = 0, sy = 0, sz = 0;
          if (b.type === "cohesion") { for (let q = 0; q < cnt; q++) { const j = nb[q] * 3; sx += pos[j]; sy += pos[j + 1]; sz += pos[j + 2]; } blendInto(acc, o, (sx / cnt - pos[o]) * gain, (sy / cnt - pos[o + 1]) * gain, (sz / cnt - pos[o + 2]) * gain, mode, 1); }
          else if (b.type === "alignment") { for (let q = 0; q < cnt; q++) { const j = nb[q] * 3; sx += vel[j]; sy += vel[j + 1]; sz += vel[j + 2]; } blendInto(acc, o, (sx / cnt - vel[o]) * gain, (sy / cnt - vel[o + 1]) * gain, (sz / cnt - vel[o + 2]) * gain, mode, 1); }
          else { for (let q = 0; q < cnt; q++) { const j = nb[q] * 3, dx = pos[o] - pos[j], dy = pos[o + 1] - pos[j + 1], dz = pos[o + 2] - pos[j + 2], d2 = dx * dx + dy * dy + dz * dz + 1e-6, k = (1 - Math.sqrt(d2) / R) / Math.sqrt(d2); sx += dx * k; sy += dy * k; sz += dz * k; } blendInto(acc, o, sx * gain * 0.2, sy * gain * 0.2, sz * gain * 0.2, mode, 1); }
        }
        break;
      }
      case "custom": {
        const ex = b.expr ?? ["0", "0", "0"], fx = this.exprCache.get(ex[0]) ?? null, fy = this.exprCache.get(ex[1]) ?? null, fz = this.exprCache.get(ex[2]) ?? null, t = this.time;
        if (!fx && !fy && !fz) break;
        for (let i = 0; i < na; i++) { const o = i * 3, x = pos[o], y = pos[o + 1], z = pos[o + 2], vx = vel[o], vy = vel[o + 1], vz = vel[o + 2], r = Math.sqrt(x * x + y * y + z * z); blendInto(acc, o, fx ? fx(x, y, z, t, vx, vy, vz, r) * I : 0, fy ? fy(x, y, z, t, vx, vy, vz, r) * I : 0, fz ? fz(x, y, z, t, vx, vy, vz, r) * I : 0, mode, 1); }
        break;
      }
      default: void dt;
    }
  }

  private applyPointer(p: PointerForce, dt: number) {
    const na = this.active, { pos, vel, acc } = this, R = p.radius, S = p.strength * 40;
    for (let i = 0; i < na; i++) {
      const o = i * 3, dx = pos[o] - p.x, dy = pos[o + 1] - p.y, dz = pos[o + 2] - p.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= R * R) continue;
      const w = falloff(d2, R, "smooth"), d = Math.sqrt(d2) + 1e-4;
      switch (p.tool) {
        case "attract": acc[o] -= (dx / d) * S * w; acc[o + 1] -= (dy / d) * S * w; acc[o + 2] -= (dz / d) * S * w; break;
        case "repel": acc[o] += (dx / d) * S * w; acc[o + 1] += (dy / d) * S * w; acc[o + 2] += (dz / d) * S * w; break;
        case "swirl": case "vortex": {
          const tx = p.dy * dz - p.dz * dy, ty = p.dz * dx - p.dx * dz, tz = p.dx * dy - p.dy * dx, tl = Math.hypot(tx, ty, tz) + 1e-4, k = (S * w) / tl;
          acc[o] += tx * k; acc[o + 1] += ty * k; acc[o + 2] += tz * k;
          if (p.tool === "vortex") { acc[o] -= (dx / d) * S * w * 0.5; acc[o + 1] -= (dy / d) * S * w * 0.5; acc[o + 2] -= (dz / d) * S * w * 0.5; }
          break;
        }
        case "push": acc[o] += p.dx * S * w; acc[o + 1] += p.dy * S * w; acc[o + 2] += p.dz * S * w; break;
        case "pull": acc[o] -= p.dx * S * w; acc[o + 1] -= p.dy * S * w; acc[o + 2] -= p.dz * S * w; break;
        case "stir": { const k = Math.min(1, w * 8 * dt * 60 * 0.1); vel[o] += (p.vx - vel[o]) * k; vel[o + 1] += (p.vy - vel[o + 1]) * k; vel[o + 2] += (p.vz - vel[o + 2]) * k; break; }
        case "scatter": { const h = Math.sin((i + 1) * 12.9898 + this.tick * 78.233) * 43758.5453, a = (h - Math.floor(h)) * TAU, h2 = Math.sin((i + 1) * 4.1414 + this.tick * 3.7) * 9631.1, e = (h2 - Math.floor(h2)) * 2 - 1, r = Math.sqrt(1 - e * e); acc[o] += r * Math.cos(a) * S * w; acc[o + 1] += e * S * w; acc[o + 2] += r * Math.sin(a) * S * w; break; }
        case "gather": acc[o] -= (dx / d) * S * w * 0.8 + vel[o] * 6 * w; acc[o + 1] -= (dy / d) * S * w * 0.8 + vel[o + 1] * 6 * w; acc[o + 2] -= (dz / d) * S * w * 0.8 + vel[o + 2] * 6 * w; break;
        case "distort": acc[o] += (dx / d) * S * w * 0.6; acc[o + 1] += (dy / d) * S * w * 0.6; acc[o + 2] += (dz / d) * S * w * 0.6; this.springScale[i] *= 1 - 0.7 * w; break;
        default: break;
      }
    }
  }

  private collide(b: Behavior) {
    const na = this.active, { pos, vel } = this, c = b.center, e = b.aux;
    if (b.radius <= 0) {
      const fy = c[1];
      for (let i = 0; i < na; i++) { const o = i * 3 + 1; if (pos[o] < fy) { pos[o] = fy; if (vel[o] < 0) vel[o] = -vel[o] * e; } }
    } else {
      const R = b.radius;
      for (let i = 0; i < na; i++) {
        const o = i * 3, dx = pos[o] - c[0], dy = pos[o + 1] - c[1], dz = pos[o + 2] - c[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < R && d > 1e-6) { const nx = dx / d, ny = dy / d, nz = dz / d; pos[o] = c[0] + nx * R; pos[o + 1] = c[1] + ny * R; pos[o + 2] = c[2] + nz * R; const vn = vel[o] * nx + vel[o + 1] * ny + vel[o + 2] * nz; if (vn < 0) { vel[o] -= (1 + e) * vn * nx; vel[o + 1] -= (1 + e) * vn * ny; vel[o + 2] -= (1 + e) * vn * nz; } }
      }
    }
  }
}

/** Pairs each source particle with a destination particle by 3-D Morton order, so neighbours stay neighbours. Returns perm[srcIndex] = dstIndex. */
export function matchMorton(src: Float32Array, dst: Float32Array, n: number): Uint32Array {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const a = src[i * 3 + c], b = dst[i * 3 + c]; if (a < lo[c]) lo[c] = a; if (b < lo[c]) lo[c] = b; if (a > hi[c]) hi[c] = a; if (b > hi[c]) hi[c] = b; }
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1e-6), SH = 524288;
  const spread = (v: number) => { v &= 0x3ff; v = (v | (v << 16)) & 0x030000ff; v = (v | (v << 8)) & 0x0300f00f; v = (v | (v << 4)) & 0x030c30c3; v = (v | (v << 2)) & 0x09249249; return v; };
  const keys = (arr: Float32Array) => {
    const k = new Float64Array(n);
    for (let i = 0; i < n; i++) { const x = ((arr[i * 3] - lo[0]) / span) * 1023, y = ((arr[i * 3 + 1] - lo[1]) / span) * 1023, z = ((arr[i * 3 + 2] - lo[2]) / span) * 1023; k[i] = (spread(x | 0) | (spread(y | 0) << 1) | (spread(z | 0) << 2)) * SH + i; }
    return k.sort();
  };
  const ks = keys(src), kd = keys(dst), perm = new Uint32Array(n);
  for (let r = 0; r < n; r++) perm[ks[r] % SH] = kd[r] % SH;
  return perm;
}
