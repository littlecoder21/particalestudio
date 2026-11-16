/**
 * Turns an analysed SVG (traced contours + rendered pixels) into an ordered set of particle
 * positions. Three layers share the particle budget:
 *   border - the outermost silhouette, placed at an even spacing with extra density at corners
 *   edges  - inner contours (holes, islands, stroke lines), longest features first
 *   fill   - blue-noise (Poisson-disc) points inside the painted area, kept clear of the edges
 * Pure typed-array code, deterministic for a given input (seeded random numbers).
 */
import type { SvgAnalysis } from "./analyze";
import type { Contour } from "./trace";

export type SamplingMode = "Outline" | "Fill" | "Combined";
export type Distribution = "Uniform" | "Random" | "Weighted" | "Density";

export interface SamplerOptions {
  mode: SamplingMode;
  distribution: Distribution;
  /** Point spacing for the Density distribution, in px of a 512 px frame. */
  spacing: number;
  /** Share (0-100) of the particles that sit on the outer border. */
  borderDetail: number;
  /** Share (0-100) of the particles that sit on inner edges. */
  edgeDetail: number;
  /** Extra point density at sharp corners (0-100). */
  cornerSharpness: number;
}

export interface SampleStats {
  border: number;
  edges: number;
  fill: number;
  total: number;
}

export interface SampleSet {
  /** Raster-pixel coordinates (see SvgAnalysis.width / height). */
  x: Float32Array;
  y: Float32Array;
  /** 0xRRGGBB per point. */
  rgb: Uint32Array;
  /** 0 border · 1 edge · 2 fill */
  layer: Uint8Array;
  stats: SampleStats;
}

type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hilbert-curve index on a 4096 x 4096 grid: neighbours in the order are neighbours in space. */
function hilbert(xIn: number, yIn: number): number {
  let x = xIn;
  let y = yIn;
  let d = 0;
  const n = 4096;
  for (let s = n / 2; s > 0; s = Math.floor(s / 2)) {
    const rx = (x & s) > 0 ? 1 : 0;
    const ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) {
        x = n - 1 - x;
        y = n - 1 - y;
      }
      const t = x;
      x = y;
      y = t;
    }
  }
  return d;
}

interface Buf { x: number[]; y: number[]; nx: number[]; ny: number[] }

interface LayerContext {
  gain: number;
  random: boolean;
  density: boolean;
  spacingPx: number;
  floorPx: number;
  rng: Rng;
}

function weightedLength(c: Contour, gain: number): number {
  const p = c.pts;
  const cv = c.curv;
  const n = cv.length;
  const segs = c.closed ? n : n - 1;
  let total = 0;
  for (let i = 0; i < segs; i += 1) {
    const j = i + 1 === n ? 0 : i + 1;
    const dx = p[2 * j] - p[2 * i], dy = p[2 * j + 1] - p[2 * i + 1];
    total += Math.sqrt(dx * dx + dy * dy) * (1 + (gain * (cv[i] + cv[j])) / 510);
  }
  return total;
}

function placeOnContour(c: Contour, k: number, ctx: LayerContext, buf: Buf): void {
  const p = c.pts;
  const cv = c.curv;
  const n = cv.length;
  const segs = c.closed ? n : n - 1;
  if (segs < 1) return;
  const cum = new Float64Array(segs + 1);
  for (let i = 0; i < segs; i += 1) {
    const j = i + 1 === n ? 0 : i + 1;
    const dx = p[2 * j] - p[2 * i], dy = p[2 * j + 1] - p[2 * i + 1];
    cum[i + 1] = cum[i] + Math.sqrt(dx * dx + dy * dy) * (1 + (ctx.gain * (cv[i] + cv[j])) / 510);
  }
  const total = cum[segs];
  if (total <= 0) return;
  for (let t = 0; t < k; t += 1) {
    let s: number;
    if (ctx.random) s = ctx.rng() * total;
    else if (c.closed) s = ((t + 0.5) * total) / k;
    else s = k === 1 ? total / 2 : (t * total) / (k - 1);
    let lo = 0;
    let hi = segs;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const j = lo + 1 === n ? 0 : lo + 1;
    const span = cum[lo + 1] - cum[lo];
    const f = span > 0 ? Math.min(1, Math.max(0, (s - cum[lo]) / span)) : 0;
    const dx = p[2 * j] - p[2 * lo], dy = p[2 * j + 1] - p[2 * lo + 1];
    const dl = Math.sqrt(dx * dx + dy * dy) || 1;
    buf.x.push(p[2 * lo] + dx * f);
    buf.y.push(p[2 * lo + 1] + dy * f);
    // Painted area is on the left of the travel direction (strokes have no "inside").
    buf.nx.push(c.kind === 2 ? 0 : dy / dl);
    buf.ny.push(c.kind === 2 ? 0 : -dx / dl);
  }
}

/**
 * Places up to `n` points on a set of contours at (nearly) constant spacing. When the budget is
 * too small to describe every contour at the target spacing, the longest contours win, so the
 * main features stay continuous instead of turning into scattered dust.
 */
function placeLayer(
  list: readonly Contour[], n: number, ctx: LayerContext, targetPx: number | null, buf: Buf,
  balance: { width: number; height: number } | null = null,
): { placed: number; unused: Contour[] } {
  if (n <= 0 || list.length === 0) return { placed: 0, unused: list.slice() };
  const lens = list.map((c) => weightedLength(c, ctx.gain));
  const order = list.map((_, i) => i).sort((a, b) => lens[b] - lens[a]);
  let total = 0;
  for (const l of lens) total += l;
  if (total <= 0) return { placed: 0, unused: list.slice() };

  let s = total / n;
  if (ctx.density) {
    s = ctx.spacingPx;
    if (total / s > n) s = total / n;
  } else if (targetPx !== null && s > targetPx) {
    s = targetPx;
  }
  s = Math.max(s, ctx.floorPx);

  const chosen: number[] = [];
  const unused: Contour[] = [];
  if (balance && total > n * s) {
    // Budget-poor: share the room between 6 x 6 map regions in proportion to their edge length,
    // longest contours first inside each region, so detail is not concentrated in one corner.
    const bins = 6;
    const binOf = list.map((c) => {
      let mx = 0;
      let my = 0;
      const m = c.pts.length >> 1;
      for (let i = 0; i < m; i += 1) {
        mx += c.pts[2 * i];
        my += c.pts[2 * i + 1];
      }
      const bx = Math.min(bins - 1, Math.floor((mx / m / balance.width) * bins));
      const by = Math.min(bins - 1, Math.floor((my / m / balance.height) * bins));
      return by * bins + bx;
    });
    const binLength = new Float64Array(bins * bins);
    binOf.forEach((b, i) => {
      binLength[b] += lens[i];
    });
    const spent = new Float64Array(bins * bins);
    for (const i of order) {
      const b = binOf[i];
      const room = (n * s * 1.02 * binLength[b]) / total;
      if (spent[b] + lens[i] <= room || (spent[b] === 0 && lens[i] <= room * 2.5)) {
        chosen.push(i);
        spent[b] += lens[i];
      } else unused.push(list[i]);
    }
  } else {
    let used = 0;
    for (const i of order) {
      if (used + lens[i] <= n * s * 1.02) {
        chosen.push(i);
        used += lens[i];
      } else unused.push(list[i]);
    }
  }
  if (chosen.length === 0) {
    // Even the longest contour is longer than the budget allows at the target spacing.
    chosen.push(order[0]);
    s = Math.max(lens[order[0]] / n, ctx.floorPx);
    unused.splice(unused.indexOf(list[order[0]]), 1);
  }

  let acc = 0;
  let placed = 0;
  for (const i of chosen) {
    const before = Math.floor(acc + 1e-9);
    acc += lens[i] / s;
    const k = Math.min(Math.floor(acc + 1e-9) - before, n - placed);
    if (k <= 0) continue;
    placeOnContour(list[i], k, ctx, buf);
    placed += k;
  }
  return { placed, unused };
}

interface FillContext {
  a: SvgAnalysis;
  rng: Rng;
  obstacles: { x: number[]; y: number[] };
}

/** One maximal Poisson-disc pass over the painted area (random-order dart throwing on a grid). */
function poissonPass(f: FillContext, r: number, rObs: number, cap: number): { x: number[]; y: number[] } {
  const { a, rng, obstacles } = f;
  const { width: W, height: H, rgba, fillThreshold: thr, fillBox: box } = a;
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  let step = Math.max(0.5, r / 3);
  if ((bw / step) * (bh / step) > 3_000_000) step = Math.sqrt((bw * bh) / 3_000_000);
  const cols = Math.ceil(bw / step);
  const rows = Math.ceil(bh / step);
  let cand = new Float32Array(cols * rows * 2);
  let k = 0;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = box.x0 + (i + rng()) * step;
      const y = box.y0 + (j + rng()) * step;
      const xi = x | 0;
      const yi = y | 0;
      if (xi >= W || yi >= H) continue;
      if (rgba[(yi * W + xi) * 4 + 3] >= thr) {
        cand[2 * k] = x;
        cand[2 * k + 1] = y;
        k += 1;
      }
    }
  }
  cand = cand.subarray(0, 2 * k);
  const order = new Uint32Array(k);
  for (let i = 0; i < k; i += 1) order[i] = i;
  for (let i = k - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }

  const gw = Math.ceil(W / r) + 2;
  const gh = Math.ceil(H / r) + 2;
  const head = new Int32Array(gw * gh).fill(-1);
  const qx: number[] = [];
  const qy: number[] = [];
  const qn: number[] = [];
  const qo: number[] = [];
  const insert = (x: number, y: number, obstacle: number) => {
    const cell = ((y / r) | 0) * gw + ((x / r) | 0);
    qx.push(x);
    qy.push(y);
    qo.push(obstacle);
    qn.push(head[cell]);
    head[cell] = qx.length - 1;
  };
  for (let i = 0; i < obstacles.x.length; i += 1) insert(obstacles.x[i], obstacles.y[i], 1);
  const r2 = r * r;
  const o2 = rObs * rObs;
  const outX: number[] = [];
  const outY: number[] = [];
  for (let t = 0; t < k && outX.length < cap; t += 1) {
    const x = cand[2 * order[t]];
    const y = cand[2 * order[t] + 1];
    const gx = (x / r) | 0;
    const gy = (y / r) | 0;
    let ok = true;
    for (let oy = -1; oy <= 1 && ok; oy += 1) {
      const yy = gy + oy;
      if (yy < 0 || yy >= gh) continue;
      for (let ox = -1; ox <= 1; ox += 1) {
        const xx = gx + ox;
        if (xx < 0 || xx >= gw) continue;
        let q = head[yy * gw + xx];
        while (q !== -1) {
          const dx = qx[q] - x, dy = qy[q] - y;
          if (dx * dx + dy * dy < (qo[q] ? o2 : r2)) {
            ok = false;
            break;
          }
          q = qn[q];
        }
        if (!ok) break;
      }
    }
    if (ok) {
      insert(x, y, 0);
      outX.push(x);
      outY.push(y);
    }
  }
  return { x: outX, y: outY };
}

/** Drops the most crowded points until `keep` remain (nearest-neighbour distance, ascending). */
function prune(x: number[], y: number[], keep: number, r: number): { x: number[]; y: number[] } {
  const m = x.length;
  if (m <= keep) return { x, y };
  const gw = Math.ceil(Math.max(...x, 1) / r) + 2;
  const cells = new Map<number, number[]>();
  for (let i = 0; i < m; i += 1) {
    const key = ((y[i] / r) | 0) * gw + ((x[i] / r) | 0);
    const bucket = cells.get(key);
    if (bucket) bucket.push(i);
    else cells.set(key, [i]);
  }
  const nn = new Float64Array(m).fill(4 * r * r);
  for (let i = 0; i < m; i += 1) {
    const gx = (x[i] / r) | 0;
    const gy = (y[i] / r) | 0;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const bucket = cells.get((gy + oy) * gw + gx + ox);
        if (!bucket) continue;
        for (const j of bucket) {
          if (j === i) continue;
          const dx = x[j] - x[i], dy = y[j] - y[i];
          const d = dx * dx + dy * dy;
          if (d < nn[i]) nn[i] = d;
        }
      }
    }
  }
  const idx = Array.from({ length: m }, (_, i) => i).sort((p, q) => nn[q] - nn[p]).slice(0, keep);
  idx.sort((p, q) => p - q);
  return { x: idx.map((i) => x[i]), y: idx.map((i) => y[i]) };
}

function placeFill(
  a: SvgAnalysis, n: number, o: SamplerOptions, floorPx: number, obstacles: { x: number[]; y: number[] },
  rng: Rng,
): { x: number[]; y: number[] } {
  if (n <= 0 || a.fillArea <= 0) return { x: [], y: [] };
  const { width: W, height: H, rgba, fillThreshold: thr, fillBox: box } = a;
  const px = Math.max(W, H);

  if (o.distribution === "Random") {
    const x: number[] = [];
    const y: number[] = [];
    const bw = box.x1 - box.x0 + 1;
    const bh = box.y1 - box.y0 + 1;
    for (let tries = 0; tries < n * 80 && x.length < n; tries += 1) {
      const cx = box.x0 + rng() * bw;
      const cy = box.y0 + rng() * bh;
      const xi = cx | 0;
      const yi = cy | 0;
      if (xi < W && yi < H && rgba[(yi * W + xi) * 4 + 3] >= thr) {
        x.push(cx);
        y.push(cy);
      }
    }
    return { x, y };
  }

  const ctx: FillContext = { a, rng, obstacles };
  const base = 0.82 * Math.sqrt(a.fillArea / n);

  if (o.distribution === "Density") {
    const r = Math.max((o.spacing / 512) * px, floorPx, 1.2);
    const res = poissonPass(ctx, r, r * 0.62, n);
    return prune(res.x, res.y, n, r);
  }

  if (o.distribution === "Weighted") {
    // Over-generate, then keep points with a bias towards the contours (more detail on the edges).
    const r = Math.max(base * 0.6, 1.2);
    const pool = poissonPass(ctx, r, r * 0.5, Math.ceil(n * 3.5));
    const cs = r * 5;
    const gw = Math.ceil(W / cs) + 2;
    const sites = new Map<number, number[]>();
    for (const c of a.borders.concat(a.edges)) {
      const stride = Math.max(1, Math.floor((c.pts.length >> 1) / Math.max(8, c.length / (r * 0.8))));
      for (let i = 0; i < c.pts.length >> 1; i += stride) {
        const key = ((c.pts[2 * i + 1] / cs) | 0) * gw + ((c.pts[2 * i] / cs) | 0);
        const bucket = sites.get(key);
        if (bucket) bucket.push(c.pts[2 * i], c.pts[2 * i + 1]);
        else sites.set(key, [c.pts[2 * i], c.pts[2 * i + 1]]);
      }
    }
    const keys = new Float64Array(pool.x.length);
    for (let i = 0; i < pool.x.length; i += 1) {
      const gx = (pool.x[i] / cs) | 0;
      const gy = (pool.y[i] / cs) | 0;
      let best = cs * 3;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const bucket = sites.get((gy + oy) * gw + gx + ox);
          if (!bucket) continue;
          for (let b = 0; b < bucket.length; b += 2) {
            const d = Math.hypot(bucket[b] - pool.x[i], bucket[b + 1] - pool.y[i]);
            if (d < best) best = d;
          }
        }
      }
      const w = 0.35 + 3 * Math.exp(-best / (2.5 * r));
      keys[i] = Math.log(Math.max(rng(), 1e-12)) / w; // A-Res weighted sampling key
    }
    const pick = Array.from({ length: pool.x.length }, (_, i) => i).sort((p, q) => keys[q] - keys[p]).slice(0, n);
    return { x: pick.map((i) => pool.x[i]), y: pick.map((i) => pool.y[i]) };
  }

  // Uniform: converge on the radius that yields about n points, then trim the crowded extras.
  let r = Math.max(base, 1.2);
  let best: { x: number[]; y: number[]; r: number } | null = null;
  for (let iter = 0; iter < 5; iter += 1) {
    const res = poissonPass(ctx, r, r * 0.62, Math.ceil(n * 1.35));
    const m = res.x.length;
    const better = best === null || (m >= n ? best.x.length < n || m < best.x.length : best.x.length < n && m > best.x.length);
    if (better) best = { x: res.x, y: res.y, r };
    if (m >= n && m <= n * 1.05) break;
    r = Math.max(1.2, r * Math.pow(m / n, 0.5) * (m >= n ? 1.005 : 0.995));
  }
  if (!best) return { x: [], y: [] };
  return prune(best.x, best.y, n, best.r);
}

/** Colour of the artwork just inside the point (avoids the half-transparent edge pixels). */
function pickColor(a: SvgAnalysis, x: number, y: number, nx: number, ny: number): number {
  const { width: W, height: H, rgba } = a;
  let best = -1;
  let bestAlpha = 0;
  const targetAlpha = a.peak * 0.8;
  for (const reach of [1.2, 0]) {
    const cx = Math.floor(x + nx * reach);
    const cy = Math.floor(y + ny * reach);
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const xi = cx + ox, yi = cy + oy;
        if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
        const k = (yi * W + xi) * 4;
        if (rgba[k + 3] > bestAlpha) {
          bestAlpha = rgba[k + 3];
          best = k;
        }
      }
    }
    if (bestAlpha >= targetAlpha) break;
  }
  if (best < 0) return 0xffffff;
  return (rgba[best] << 16) | (rgba[best + 1] << 8) | rgba[best + 2];
}

function splitBudget(
  count: number, o: SamplerOptions, has: readonly [boolean, boolean, boolean],
): [number, number, number] {
  let want: [number, number, number];
  const b = Math.min(Math.max(o.borderDetail / 100, 0), 1);
  const e = Math.min(Math.max(o.edgeDetail / 100, 0), 1);
  if (o.mode === "Fill") want = [0, 0, count];
  else if (o.mode === "Outline") {
    const t = b + e;
    want = t > 0 ? [(count * b) / t, (count * e) / t, 0] : [count, 0, 0];
  } else {
    const t = b + e;
    const k = t > 0.95 ? 0.95 / t : 1;
    want = [count * b * k, count * e * k, count * (1 - (b + e) * k)];
  }
  let lost = 0;
  let pool = 0;
  for (let i = 0; i < 3; i += 1) {
    if (!has[i]) {
      lost += want[i];
      want[i] = 0;
    } else pool += want[i];
  }
  const available = has.filter(Boolean).length;
  if (available === 0) return [0, 0, 0];
  if (lost > 0) {
    for (let i = 0; i < 3; i += 1) {
      if (has[i]) want[i] += pool > 0 ? (lost * want[i]) / pool : lost / available;
    }
  }
  const n0 = Math.round(want[0]);
  const n1 = Math.round(want[1]);
  return [n0, n1, Math.max(0, count - n0 - n1)];
}

export function generateSamples(a: SvgAnalysis, o: SamplerOptions, count: number): SampleSet {
  const rng = mulberry32(0x9e3779b9 ^ Math.imul(count, 0x85ebca6b));
  const px = Math.max(a.width, a.height);
  const floorPx = px * 0.0011;
  const [n0, n1] = splitBudget(count, o, [a.borders.length > 0, a.edges.length > 0, a.fillArea > 0]);
  const ctx: LayerContext = {
    gain: (o.cornerSharpness / 100) * 2.5 * (o.distribution === "Weighted" ? 1.8 : 1),
    random: o.distribution === "Random",
    density: o.distribution === "Density",
    spacingPx: Math.max((o.spacing / 512) * px, floorPx),
    floorPx,
    rng,
  };

  const border: Buf = { x: [], y: [], nx: [], ny: [] };
  const edge: Buf = { x: [], y: [], nx: [], ny: [] };
  const fill: Buf = { x: [], y: [], nx: [], ny: [] };
  const first = placeLayer(a.borders, n0, ctx, null, border);
  const balance = { width: a.width, height: a.height };
  // Outline only: what the border cannot take (spacing floor) goes to the inner edges instead.
  const n1Effective = o.mode === "Outline" ? n1 + Math.max(0, n0 - first.placed) : n1;
  const second = placeLayer(a.edges, n1Effective, ctx, px * 0.0058, edge, balance);

  const wantFill = count - first.placed - second.placed;
  const obstacles = { x: border.x.concat(edge.x), y: border.y.concat(edge.y) };
  const filled = o.mode === "Outline" ? { x: [], y: [] } : placeFill(a, wantFill, o, floorPx, obstacles, rng);
  fill.x = filled.x;
  fill.y = filled.y;

  // Painted area too thin to hold fill points: spend the leftover on the next-longest edges.
  const shortfall = wantFill - filled.x.length;
  if (o.mode !== "Outline" && shortfall > 2 && second.unused.length > 0) {
    placeLayer(second.unused, shortfall, ctx, px * 0.0058, edge, balance);
  }

  // Order: border by angle (clean morphs), edges and fill along a Hilbert curve (coherent neighbours).
  const total = border.x.length + edge.x.length + fill.x.length;
  const x = new Float32Array(total);
  const y = new Float32Array(total);
  const rgb = new Uint32Array(total);
  const layer = new Uint8Array(total);
  let w = 0;
  const emit = (buf: Buf, kind: number, order: number[]) => {
    for (const i of order) {
      x[w] = buf.x[i];
      y[w] = buf.y[i];
      rgb[w] = pickColor(a, buf.x[i], buf.y[i], buf.nx.length > 0 ? buf.nx[i] : 0, buf.ny.length > 0 ? buf.ny[i] : 0);
      layer[w] = kind;
      w += 1;
    }
  };
  const indices = (n: number) => Array.from({ length: n }, (_, i) => i);
  let mx = 0;
  let my = 0;
  for (let i = 0; i < border.x.length; i += 1) {
    mx += border.x[i];
    my += border.y[i];
  }
  if (border.x.length > 0) {
    mx /= border.x.length;
    my /= border.x.length;
  } else {
    mx = a.width / 2;
    my = a.height / 2;
  }
  const angle = border.x.map((bx, i) => Math.atan2(border.y[i] - my, bx - mx));
  emit(border, 0, indices(border.x.length).sort((p, q) => angle[p] - angle[q]));
  const byHilbert = (buf: Buf) => {
    const key = buf.x.map((bx, i) => hilbert(
      Math.min(4095, Math.max(0, Math.floor((bx / a.width) * 4096))),
      Math.min(4095, Math.max(0, Math.floor((buf.y[i] / a.height) * 4096))),
    ));
    return indices(buf.x.length).sort((p, q) => key[p] - key[q]);
  };
  emit(edge, 1, byHilbert(edge));
  emit(fill, 2, byHilbert(fill));

  return { x, y, rgb, layer, stats: { border: border.x.length, edges: edge.x.length, fill: fill.x.length, total } };
}
