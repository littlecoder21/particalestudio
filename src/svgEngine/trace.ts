/**
 * Sub-pixel contour tracing of a rendered SVG mask (marching squares on the anti-aliased alpha
 * channel), plus smoothing, curvature and "is this the outer silhouette?" classification.
 * Pure typed-array code: no DOM access.
 */

/** 0: outermost silhouette border · 1: inner edge (hole / island) · 2: stroke centre line. */
export type ContourKind = 0 | 1 | 2;
export const KIND_BORDER: ContourKind = 0;
export const KIND_EDGE: ContourKind = 1;
export const KIND_STROKE: ContourKind = 2;

export interface Contour {
  /** Interleaved x,y in raster pixels (image space, pixel i covers [i, i+1]). */
  pts: Float32Array;
  /** Per-vertex corner strength, 0 (straight) .. 255 (turns 90° or more). */
  curv: Uint8Array;
  closed: boolean;
  /** Perimeter in raster pixels. */
  length: number;
  kind: ContourKind;
}

class IntList {
  a = new Int32Array(1 << 15);
  n = 0;
  push(v: number): void {
    if (this.n === this.a.length) {
      const b = new Int32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[this.n++] = v;
  }
}

/** Corner strength per vertex: turning angle over ±2 vertices, spread over the neighbourhood. */
export function computeCurvature(pts: Float32Array, closed: boolean): Uint8Array {
  const n = pts.length >> 1;
  const out = new Uint8Array(n);
  if (n < 5) return out;
  const raw = new Uint8Array(n);
  const k = 2;
  for (let i = 0; i < n; i += 1) {
    let a = i - k;
    let b = i + k;
    if (closed) {
      a = (a + n) % n;
      b %= n;
    } else if (a < 0 || b >= n) continue;
    const ax = pts[2 * i] - pts[2 * a], ay = pts[2 * i + 1] - pts[2 * a + 1];
    const bx = pts[2 * b] - pts[2 * i], by = pts[2 * b + 1] - pts[2 * i + 1];
    const la = Math.sqrt(ax * ax + ay * ay), lb = Math.sqrt(bx * bx + by * by);
    if (la * lb < 1e-12) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
    raw[i] = Math.min(255, Math.round((angle / (Math.PI / 2)) * 255));
  }
  for (let i = 0; i < n; i += 1) {
    let best = 0;
    for (let o = -2; o <= 2; o += 1) {
      let j = i + o;
      if (closed) j = (j + n) % n;
      else if (j < 0 || j >= n) continue;
      if (raw[j] > best) best = raw[j];
    }
    out[i] = best;
  }
  return out;
}

/** Taubin (shrink-free) smoothing of a closed contour; `anchor` vertices (corners) never move. */
function smoothClosed(pts: Float32Array, anchor: Uint8Array, rounds: number): void {
  const n = pts.length >> 1;
  if (n < 8) return;
  const tmp = new Float32Array(pts.length);
  const pass = (lambda: number) => {
    for (let i = 0; i < n; i += 1) {
      if (anchor[i]) {
        tmp[2 * i] = pts[2 * i];
        tmp[2 * i + 1] = pts[2 * i + 1];
        continue;
      }
      const a = i === 0 ? n - 1 : i - 1;
      const b = i === n - 1 ? 0 : i + 1;
      tmp[2 * i] = pts[2 * i] + lambda * ((pts[2 * a] + pts[2 * b]) / 2 - pts[2 * i]);
      tmp[2 * i + 1] = pts[2 * i + 1] + lambda * ((pts[2 * a + 1] + pts[2 * b + 1]) / 2 - pts[2 * i + 1]);
    }
    pts.set(tmp);
  };
  for (let r = 0; r < rounds; r += 1) {
    pass(0.5);
    pass(-0.53);
  }
}

/** Marks vertices where the contour turns sharply at a ±3 vertex scale (kept fixed by smoothing). */
function findAnchors(pts: Float32Array): Uint8Array {
  const n = pts.length >> 1;
  const anchor = new Uint8Array(n);
  if (n < 10) return anchor;
  const k = 3;
  for (let i = 0; i < n; i += 1) {
    const a = (i - k + n) % n;
    const b = (i + k) % n;
    const ax = pts[2 * i] - pts[2 * a], ay = pts[2 * i + 1] - pts[2 * a + 1];
    const bx = pts[2 * b] - pts[2 * i], by = pts[2 * b + 1] - pts[2 * i + 1];
    const la = Math.sqrt(ax * ax + ay * ay), lb = Math.sqrt(bx * bx + by * by);
    if (la * lb < 1e-12) continue;
    if ((ax * bx + ay * by) / (la * lb) < 0.62) anchor[i] = 1; // turns by more than ~52°
  }
  return anchor;
}

/**
 * Coarse "how far is this spot from the outside of the artwork?" field. The painted cells are
 * dilated first so thin gaps in an outline (very common in hand-drawn art) are sealed, then the
 * outside is flood filled and a chessboard distance to it is computed. Contour vertices close to
 * the outside belong to the outer border; deeper ones are inner detail.
 */
function hullField(p: Uint8Array, pw: number, width: number, height: number, iso: number) {
  const cell = Math.max(4, Math.round(Math.max(width, height) / 256));
  const gw = Math.ceil(width / cell) + 2;
  const gh = Math.ceil(height / cell) + 2;
  const occ = new Uint8Array(gw * gh);
  for (let y = 0; y < height; y += 1) {
    const row = (((y / cell) | 0) + 1) * gw + 1;
    let s = (y + 1) * pw + 1;
    for (let x = 0; x < width; x += 1, s += 1) if (p[s] >= iso) occ[row + ((x / cell) | 0)] = 1;
  }
  // Dilate by 2 cells (separable max filter).
  const tmp = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      let v = 0;
      for (let o = -2; o <= 2 && !v; o += 1) if (x + o >= 0 && x + o < gw && occ[y * gw + x + o]) v = 1;
      tmp[y * gw + x] = v;
    }
  }
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      let v = 0;
      for (let o = -2; o <= 2 && !v; o += 1) if (y + o >= 0 && y + o < gh && tmp[(y + o) * gw + x]) v = 1;
      occ[y * gw + x] = v;
    }
  }
  // Outside = empty cells connected to the padded border.
  const dist = new Uint8Array(gw * gh).fill(255);
  const queue: number[] = [0];
  dist[0] = 0;
  while (queue.length > 0) {
    const c = queue.pop() as number;
    const cx = c % gw;
    const cy = (c / gw) | 0;
    for (const n of [cx > 0 ? c - 1 : -1, cx < gw - 1 ? c + 1 : -1, cy > 0 ? c - gw : -1, cy < gh - 1 ? c + gw : -1]) {
      if (n >= 0 && !occ[n] && dist[n] !== 0) {
        dist[n] = 0;
        queue.push(n);
      }
    }
  }
  // Chessboard distance to the outside, two chamfer passes.
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      const i = y * gw + x;
      let d = dist[i];
      if (x > 0) d = Math.min(d, dist[i - 1] + 1);
      if (y > 0) {
        d = Math.min(d, dist[i - gw] + 1);
        if (x > 0) d = Math.min(d, dist[i - gw - 1] + 1);
        if (x < gw - 1) d = Math.min(d, dist[i - gw + 1] + 1);
      }
      dist[i] = Math.min(d, 255);
    }
  }
  for (let y = gh - 1; y >= 0; y -= 1) {
    for (let x = gw - 1; x >= 0; x -= 1) {
      const i = y * gw + x;
      let d = dist[i];
      if (x < gw - 1) d = Math.min(d, dist[i + 1] + 1);
      if (y < gh - 1) {
        d = Math.min(d, dist[i + gw] + 1);
        if (x < gw - 1) d = Math.min(d, dist[i + gw + 1] + 1);
        if (x > 0) d = Math.min(d, dist[i + gw - 1] + 1);
      }
      dist[i] = Math.min(d, 255);
    }
  }
  return (x: number, y: number): boolean => {
    const cx = Math.min(gw - 1, Math.max(0, Math.floor(x / cell) + 1));
    const cy = Math.min(gh - 1, Math.max(0, Math.floor(y / cell) + 1));
    return dist[cy * gw + cx] <= 3;
  };
}

interface Run { from: number; to: number; border: boolean }

/** Splits a closed loop into runs that are near the outside (border) or deeper inside (edge). */
function splitLoop(pts: Float32Array, near: (x: number, y: number) => boolean): Run[] | "border" | "edge" {
  const n = pts.length >> 1;
  const flags = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) flags[i] = near(pts[2 * i], pts[2 * i + 1]) ? 1 : 0;
  // Majority filter over +-4 vertices removes flicker.
  const filtered = new Uint8Array(n);
  let nearCount = 0;
  for (let i = 0; i < n; i += 1) {
    let votes = 0;
    for (let o = -4; o <= 4; o += 1) votes += flags[(i + o + n * 4) % n];
    filtered[i] = votes >= 5 ? 1 : 0;
    nearCount += filtered[i];
  }
  if (nearCount === n) return "border";
  if (nearCount === 0) return "edge";
  let start = 0;
  while (filtered[start] === filtered[(start + n - 1) % n]) start += 1;
  let runs: Run[] = [];
  let runStart = 0;
  for (let k = 1; k <= n; k += 1) {
    if (k === n || filtered[(start + k) % n] !== filtered[(start + k - 1) % n]) {
      runs.push({ from: start + runStart, to: start + k - 1, border: filtered[(start + runStart) % n] === 1 });
      runStart = k;
    }
  }
  // Tiny runs take the class of their neighbour, then equal neighbours merge.
  for (let pass = 0; pass < 3 && runs.length > 1; pass += 1) {
    for (let r = 0; r < runs.length; r += 1) {
      if (runs[r].to - runs[r].from + 1 < 6) runs[r].border = runs[(r + runs.length - 1) % runs.length].border;
    }
    const merged: Run[] = [];
    for (const run of runs) {
      const last = merged[merged.length - 1];
      if (last && last.border === run.border) last.to = run.to;
      else merged.push({ ...run });
    }
    runs = merged;
  }
  if (runs.length === 1) return runs[0].border ? "border" : "edge";
  return runs;
}

export interface TraceOptions {
  /** Contours shorter than this (raster px) are dropped as noise. */
  minLength: number;
  /** Corner-preserving smoothing rounds (0 = raw marching squares output). */
  smoothing: number;
}

/**
 * Extracts every boundary between painted (alpha >= iso) and empty pixels as closed contours.
 * Vertices sit at the interpolated iso crossing, so accuracy is a small fraction of a pixel.
 * Parts of a loop that run along the artwork's outer rim get kind 0; deeper detail gets kind 1.
 */
export function traceMask(
  rgba: Uint8ClampedArray, width: number, height: number, iso: number, options: TraceOptions,
): Contour[] {
  const pw = width + 2;
  const ph = height + 2;
  const total = pw * ph;
  const p = new Uint8Array(total);
  for (let y = 0; y < height; y += 1) {
    let s = y * width * 4 + 3;
    let d = (y + 1) * pw + 1;
    for (let x = 0; x < width; x += 1, s += 4, d += 1) p[d] = rgba[s];
  }

  // 1. Directed segments with "painted" always on the left-hand side (y down).
  const from = new IntList();
  const to = new IntList();
  const link = (a: number, b: number) => {
    from.push(a);
    to.push(b);
  };
  for (let cy = 0; cy < ph - 1; cy += 1) {
    const r0 = cy * pw;
    const r1 = r0 + pw;
    let tl = p[r0] >= iso ? 1 : 0;
    let bl = p[r1] >= iso ? 1 : 0;
    for (let cx = 0; cx < pw - 1; cx += 1) {
      const tr = p[r0 + cx + 1] >= iso ? 1 : 0;
      const br = p[r1 + cx + 1] >= iso ? 1 : 0;
      const idx = tl | (tr << 1) | (br << 2) | (bl << 3);
      if (idx !== 0 && idx !== 15) {
        const T = r0 + cx, B = r1 + cx, L = total + r0 + cx, R = L + 1;
        switch (idx) {
          case 1: link(L, T); break;
          case 2: link(T, R); break;
          case 3: link(L, R); break;
          case 4: link(R, B); break;
          case 5:
            if ((p[r0 + cx] + p[r0 + cx + 1] + p[r1 + cx] + p[r1 + cx + 1]) / 4 >= iso) {
              link(R, T); link(L, B);
            } else {
              link(L, T); link(R, B);
            }
            break;
          case 6: link(T, B); break;
          case 7: link(L, B); break;
          case 8: link(B, L); break;
          case 9: link(B, T); break;
          case 10:
            if ((p[r0 + cx] + p[r0 + cx + 1] + p[r1 + cx] + p[r1 + cx + 1]) / 4 >= iso) {
              link(T, L); link(B, R);
            } else {
              link(T, R); link(B, L);
            }
            break;
          case 11: link(B, R); break;
          case 12: link(R, L); break;
          case 13: link(R, T); break;
          case 14: link(T, L); break;
        }
      }
      tl = tr;
      bl = br;
    }
  }
  const segments = from.n;
  if (segments === 0) return [];

  // 2. Chain segments into closed loops through an open-addressing hash (start edge -> segment).
  let bits = 4;
  while (1 << bits < segments * 2) bits += 1;
  const slots = 1 << bits;
  const keys = new Int32Array(slots).fill(-1);
  const vals = new Int32Array(slots);
  const slotOf = (id: number) => Math.imul(id, 0x9e3779b1) >>> (32 - bits);
  for (let s = 0; s < segments; s += 1) {
    let h = slotOf(from.a[s]);
    while (keys[h] !== -1) h = (h + 1) & (slots - 1);
    keys[h] = from.a[s];
    vals[h] = s;
  }
  const find = (id: number) => {
    let h = slotOf(id);
    while (keys[h] !== -1) {
      if (keys[h] === id) return vals[h];
      h = (h + 1) & (slots - 1);
    }
    return -1;
  };
  const edgeX = (id: number): number => {
    if (id < total) return (id % pw) + (iso - p[id]) / (p[id + 1] - p[id]) - 0.5;
    return ((id - total) % pw) - 0.5;
  };
  const edgeY = (id: number): number => {
    if (id < total) return ((id / pw) | 0) - 0.5;
    const e = id - total;
    return ((e / pw) | 0) + (iso - p[e]) / (p[e + pw] - p[e]) - 0.5;
  };

  const visited = new Uint8Array(segments);
  interface Loop { pts: Float32Array; area: number; length: number }
  const loops: Loop[] = [];
  const scratch: number[] = [];
  for (let s0 = 0; s0 < segments; s0 += 1) {
    if (visited[s0]) continue;
    scratch.length = 0;
    let s = s0;
    while (s !== -1 && !visited[s]) {
      visited[s] = 1;
      const id = from.a[s];
      scratch.push(edgeX(id), edgeY(id));
      s = find(to.a[s]);
    }
    const n = scratch.length >> 1;
    if (n < 4) continue;
    let length = 0;
    let area = 0;
    for (let i = 0; i < n; i += 1) {
      const j = i + 1 === n ? 0 : i + 1;
      const x0 = scratch[2 * i], y0 = scratch[2 * i + 1], x1 = scratch[2 * j], y1 = scratch[2 * j + 1];
      length += Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
      area += x0 * y1 - x1 * y0;
    }
    if (length < options.minLength) continue;
    loops.push({ pts: Float32Array.from(scratch), area: area / 2, length });
  }
  if (loops.length === 0) return [];

  // 3. Outer border vs inner detail: split every loop where it leaves the artwork's outer rim.
  const near = hullField(p, pw, width, height, iso);
  const contours: Contour[] = [];
  const addContour = (pts: Float32Array, closed: boolean, kind: ContourKind) => {
    const n = pts.length >> 1;
    let length = 0;
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i += 1) {
      const j = i + 1 === n ? 0 : i + 1;
      const dx = pts[2 * j] - pts[2 * i], dy = pts[2 * j + 1] - pts[2 * i + 1];
      length += Math.sqrt(dx * dx + dy * dy);
    }
    if (length < options.minLength) return;
    contours.push({ pts, curv: computeCurvature(pts, closed), closed, length, kind });
  };
  for (const loop of loops) {
    const pts = loop.pts;
    if (options.smoothing > 0) smoothClosed(pts, findAnchors(pts), options.smoothing);
    const n = pts.length >> 1;
    const split = splitLoop(pts, near);
    if (split === "border") addContour(pts, true, KIND_BORDER);
    else if (split === "edge") addContour(pts, true, KIND_EDGE);
    else {
      for (const run of split) {
        const count = run.to - run.from + 2; // one vertex of overlap keeps the arc continuous
        const part = new Float32Array(count * 2);
        for (let k = 0; k < count; k += 1) {
          const v = (run.from + k) % n;
          part[2 * k] = pts[2 * v];
          part[2 * k + 1] = pts[2 * v + 1];
        }
        addContour(part, false, run.border ? KIND_BORDER : KIND_EDGE);
      }
    }
  }
  return contours;
}
