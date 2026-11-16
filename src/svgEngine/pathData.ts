/**
 * SVG geometry helpers (no DOM needed): transforms, path-data parsing and adaptive flattening.
 * Everything here is pure so it can run in the browser, a worker or a Node test.
 */

/** Affine matrix in SVG order: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Returns m · n (n is applied first). */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

const TRANSFORM_PART = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;

export function parseTransform(value: string | null | undefined): Matrix {
  if (!value) return IDENTITY;
  let result: Matrix = IDENTITY;
  for (const part of value.matchAll(TRANSFORM_PART)) {
    const a = part[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (a.some((v) => !Number.isFinite(v))) continue;
    let next: Matrix | null = null;
    switch (part[1]) {
      case "matrix":
        if (a.length === 6) next = [a[0], a[1], a[2], a[3], a[4], a[5]];
        break;
      case "translate":
        if (a.length >= 1) next = [1, 0, 0, 1, a[0], a[1] ?? 0];
        break;
      case "scale":
        if (a.length >= 1) next = [a[0], 0, 0, a[1] ?? a[0], 0, 0];
        break;
      case "rotate":
        if (a.length >= 1) {
          const r = (a[0] * Math.PI) / 180;
          const cos = Math.cos(r);
          const sin = Math.sin(r);
          const rot: Matrix = [cos, sin, -sin, cos, 0, 0];
          const cx = a[1] ?? 0;
          const cy = a[2] ?? 0;
          next = multiply(multiply([1, 0, 0, 1, cx, cy], rot), [1, 0, 0, 1, -cx, -cy]);
        }
        break;
      case "skewX":
        if (a.length >= 1) next = [1, 0, Math.tan((a[0] * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewY":
        if (a.length >= 1) next = [1, Math.tan((a[0] * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    if (next) result = multiply(result, next);
  }
  return result;
}

export interface Polyline {
  /** Interleaved x,y in output space. A closed polyline does not repeat its first point. */
  pts: number[];
  closed: boolean;
}

const NUMBER = /[\s,]*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;
const FLAG = /[\s,]*([01])/y;
const NUMBER_AHEAD = /[\s,]*[+-.\d]/y;

class Reader {
  i = 0;
  constructor(readonly s: string) {}
  /** True when the next token starts a number (used for implicit command repetition). */
  more(): boolean {
    NUMBER_AHEAD.lastIndex = this.i;
    return NUMBER_AHEAD.test(this.s);
  }
  num(): number {
    NUMBER.lastIndex = this.i;
    const m = NUMBER.exec(this.s);
    if (!m) return Number.NaN;
    this.i = NUMBER.lastIndex;
    return Number.parseFloat(m[1]);
  }
  flag(): number {
    FLAG.lastIndex = this.i;
    const m = FLAG.exec(this.s);
    if (!m) return Number.NaN;
    this.i = FLAG.lastIndex;
    return m[1] === "1" ? 1 : 0;
  }
}

const ARG_COUNT: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** SVG endpoint arc -> cubic Béziers [c1x, c1y, c2x, c2y, x, y] (spec F.6.5). */
function arcToCubics(
  x1: number, y1: number, rxIn: number, ryIn: number, phiDeg: number,
  fa: number, fs: number, x2: number, y2: number,
): number[][] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const den = rx2 * y1p * y1p + ry2 * x1p * x1p;
  const coef = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, (rx2 * ry2 - den) / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= Math.PI * 2;
  else if (fs && dt < 0) dt += Math.PI * 2;
  const segments = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const delta = dt / segments;
  const k = (4 / 3) * Math.tan(delta / 4);
  const point = (t: number) => [
    cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  ];
  const deriv = (t: number) => [
    -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  ];
  const out: number[][] = [];
  for (let i = 0; i < segments; i += 1) {
    const ta = t1 + i * delta;
    const tb = ta + delta;
    const pa = point(ta);
    const pb = point(tb);
    const da = deriv(ta);
    const db = deriv(tb);
    out.push([pa[0] + k * da[0], pa[1] + k * da[1], pb[0] - k * db[0], pb[1] - k * db[1], pb[0], pb[1]]);
  }
  return out;
}

/**
 * Parses SVG path data and flattens every curve to a polyline whose deviation from the true
 * curve is at most `tolerance` (in output units). The matrix is applied before flattening so the
 * tolerance holds in the space the points end up in.
 */
export function flattenPath(d: string, matrix: Matrix, tolerance: number): Polyline[] {
  const out: Polyline[] = [];
  const tx = (x: number, y: number) => matrix[0] * x + matrix[2] * y + matrix[4];
  const ty = (x: number, y: number) => matrix[1] * x + matrix[3] * y + matrix[5];
  const reader = new Reader(d);
  let cur: Polyline | null = null;
  let cx = 0, cy = 0, sx = 0, sy = 0; // current point / subpath start (source space)
  let lx = 0, ly = 0; // last control point for S and T
  let previous = "";
  const tol = Math.max(tolerance, 1e-4);

  const open = () => {
    if (!cur) {
      cur = { pts: [tx(cx, cy), ty(cx, cy)], closed: false };
      out.push(cur);
    }
    return cur;
  };
  const lineTo = (x: number, y: number) => {
    open().pts.push(tx(x, y), ty(x, y));
    cx = x;
    cy = y;
  };
  const cubicTo = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    const poly = open();
    const p = poly.pts;
    const ax = p[p.length - 2], ay = p[p.length - 1];
    const bx = tx(x1, y1), by = ty(x1, y1);
    const ex = tx(x2, y2), ey = ty(x2, y2);
    const fx = tx(x, y), fy = ty(x, y);
    const m1 = Math.hypot(ax - 2 * bx + ex, ay - 2 * by + ey);
    const m2 = Math.hypot(bx - 2 * ex + fx, by - 2 * ey + fy);
    const n = Math.max(1, Math.min(256, Math.ceil(Math.sqrt((0.75 * Math.max(m1, m2)) / tol))));
    for (let i = 1; i <= n; i += 1) {
      const t = i / n;
      const u = 1 - t;
      const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
      p.push(w0 * ax + w1 * bx + w2 * ex + w3 * fx, w0 * ay + w1 * by + w2 * ey + w3 * fy);
    }
    lx = x2;
    ly = y2;
    cx = x;
    cy = y;
  };
  const quadTo = (x1: number, y1: number, x: number, y: number) => {
    // Degree-elevate to a cubic so one flattening routine covers both.
    cubicTo(
      cx + ((x1 - cx) * 2) / 3, cy + ((y1 - cy) * 2) / 3,
      x + ((x1 - x) * 2) / 3, y + ((y1 - y) * 2) / 3, x, y,
    );
    lx = x1;
    ly = y1;
  };

  let command = "";
  while (true) {
    // Next command letter, or an implicit repeat of the previous one.
    while (reader.i < d.length && /[\s,]/.test(d[reader.i])) reader.i += 1;
    if (reader.i >= d.length) break;
    const ch = d[reader.i];
    if (/[a-zA-Z]/.test(ch)) {
      command = ch;
      reader.i += 1;
    } else if (!command || !reader.more()) {
      break;
    } else if (command === "M") command = "L";
    else if (command === "m") command = "l";

    const upper = command.toUpperCase();
    const rel = command !== upper;
    const argCount = ARG_COUNT[upper];
    if (argCount === undefined) break;
    const args: number[] = [];
    for (let i = 0; i < argCount; i += 1) {
      const isFlag = upper === "A" && (i === 3 || i === 4);
      const value = isFlag ? reader.flag() : reader.num();
      if (Number.isNaN(value)) return out;
      args.push(value);
    }
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (upper) {
      case "M":
        cx = args[0] + ox;
        cy = args[1] + oy;
        sx = cx;
        sy = cy;
        cur = null;
        break;
      case "L":
        lineTo(args[0] + ox, args[1] + oy);
        break;
      case "H":
        lineTo(args[0] + ox, cy);
        break;
      case "V":
        lineTo(cx, args[0] + oy);
        break;
      case "C":
        cubicTo(args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy, args[4] + ox, args[5] + oy);
        break;
      case "S": {
        const smooth = previous === "C" || previous === "S";
        cubicTo(
          smooth ? 2 * cx - lx : cx, smooth ? 2 * cy - ly : cy,
          args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy,
        );
        break;
      }
      case "Q":
        quadTo(args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy);
        break;
      case "T": {
        const smooth = previous === "Q" || previous === "T";
        quadTo(smooth ? 2 * cx - lx : cx, smooth ? 2 * cy - ly : cy, args[0] + ox, args[1] + oy);
        break;
      }
      case "A": {
        const x = args[5] + ox;
        const y = args[6] + oy;
        for (const c of arcToCubics(cx, cy, args[0], args[1], args[2], args[3], args[4], x, y)) {
          cubicTo(c[0], c[1], c[2], c[3], c[4], c[5]);
        }
        break;
      }
      case "Z":
        if (cur) (cur as Polyline).closed = true;
        cx = sx;
        cy = sy;
        cur = null;
        break;
    }
    previous = upper;
  }
  return out;
}

/** Converts a basic shape element to path data (null if it draws nothing). */
export function primitiveToPath(tag: string, attr: (name: string) => string | null): string | null {
  const n = (name: string, fallback = 0) => {
    const v = Number.parseFloat(attr(name) ?? "");
    return Number.isFinite(v) ? v : fallback;
  };
  switch (tag) {
    case "path":
      return attr("d");
    case "line":
      return `M${n("x1")} ${n("y1")}L${n("x2")} ${n("y2")}`;
    case "polyline":
    case "polygon": {
      const nums = (attr("points") ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
      if (nums.length < 4 || nums.some((v) => !Number.isFinite(v))) return null;
      let d = `M${nums[0]} ${nums[1]}`;
      for (let i = 2; i + 1 < nums.length; i += 2) d += `L${nums[i]} ${nums[i + 1]}`;
      return tag === "polygon" ? `${d}Z` : d;
    }
    case "circle": {
      const r = n("r");
      if (r <= 0) return null;
      const cx = n("cx"), cy = n("cy");
      return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
    }
    case "ellipse": {
      const rx = n("rx"), ry = n("ry");
      if (rx <= 0 || ry <= 0) return null;
      const cx = n("cx"), cy = n("cy");
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case "rect": {
      const w = n("width"), h = n("height");
      if (w <= 0 || h <= 0) return null;
      const x = n("x"), y = n("y");
      let rx = n("rx", Number.NaN), ry = n("ry", Number.NaN);
      if (Number.isNaN(rx) && Number.isNaN(ry)) rx = ry = 0;
      else if (Number.isNaN(rx)) rx = ry;
      else if (Number.isNaN(ry)) ry = rx;
      rx = Math.min(Math.max(rx, 0), w / 2);
      ry = Math.min(Math.max(ry, 0), h / 2);
      if (rx === 0 || ry === 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}` +
        `A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
        `V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
    default:
      return null;
  }
}
