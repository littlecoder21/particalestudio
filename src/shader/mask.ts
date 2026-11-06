/**
 * Image → shader mask.
 *
 * Any silhouette (a built-in shape, an SVG or a PNG / JPG / WebP) is rasterised
 * into a 512 × 512 "field" (1 = shape, 0 = empty). The field is turned into one
 * small RGBA texture that the shader samples:
 *
 *   R  blurred coverage        – a wide aura for halos
 *   G  signed distance (±40px) – 0.5 on the edge, > 0.5 inside. Drives soft
 *                                edges, smoke, glow, outline, particles, echo rings
 *   B  interior depth          – 0 at the edge, 1 in the thickest part. Drives
 *                                bevel / pillow shading
 *   A  always 255              – keeps the PNG export free of premultiply loss
 *
 * Because the edge is a distance field, grow / soften / smoke are plain shader
 * maths: moving those sliders never re-processes the image.
 */
import { MAX_TEXT_LENGTH, MAX_TEXT_LINES, type MaskShapeId, type MaskSource, type ShaderMask, type TextMaskSource } from "./types";
import type { GeometryDocument } from "../geometry/model";

export const MASK_SIZE = 512;
export const SDF_RANGE_PX = 40;
/** Full width of the encoded distance range, in units of the mask square's side. */
export const SDF_SPAN = (2 * SDF_RANGE_PX) / MASK_SIZE;
const PAD = 0.07;

export interface MaskField {
  /** MASK_SIZE² values, 1 = inside the shape */
  data: Float32Array;
}

export interface MaskPixels {
  size: number;
  /** RGBA, rows already flipped so row 0 is the bottom of the shape */
  data: Uint8Array;
}

/* ───────────────────────── built-in shapes ───────────────────────── */

type Ctx = CanvasRenderingContext2D;

const circlePath = (cx: number, cy: number, r: number): Path2D => {
  const path = new Path2D();
  path.arc(cx, cy, r, 0, Math.PI * 2);
  return path;
};

function polygon(ctx: Ctx, points: Array<[number, number]>): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

interface ShapeDef {
  label: string;
  draw: (ctx: Ctx) => void;
}

export const SHAPES: Record<MaskShapeId, ShapeDef> = {
  circle: { label: "Circle", draw: (ctx) => ctx.fill(circlePath(50, 50, 46)) },
  ring: {
    label: "Ring",
    draw: (ctx) => {
      const path = new Path2D();
      path.arc(50, 50, 46, 0, Math.PI * 2);
      path.moveTo(76, 50);
      path.arc(50, 50, 27, 0, Math.PI * 2, true);
      ctx.fill(path, "evenodd");
    },
  },
  heart: {
    label: "Heart",
    draw: (ctx) => ctx.fill(new Path2D("M50 92 C12 64 2 40 9 25 C16 10 40 6 50 27 C60 6 84 10 91 25 C98 40 88 64 50 92 Z")),
  },
  star: {
    label: "Star",
    draw: (ctx) => {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 47 : 19.5;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push([50 + r * Math.cos(a), 53 + r * Math.sin(a)]);
      }
      polygon(ctx, pts);
    },
  },
  flower: {
    label: "Flower",
    draw: (ctx) => {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 360; i++) {
        const a = (i / 360) * Math.PI * 2;
        const r = 17 + 29 * Math.pow(0.5 + 0.5 * Math.cos(8 * a), 1.5);
        pts.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]);
      }
      polygon(ctx, pts);
    },
  },
  butterfly: {
    label: "Butterfly",
    draw: (ctx) => {
      const parts = [
        "M52 46 C58 20 84 5 95 15 C101 33 88 52 54 56 Z",
        "M54 55 C82 56 96 72 84 88 C72 98 58 82 52 62 Z",
        "M48 46 C42 20 16 5 5 15 C-1 33 12 52 46 56 Z",
        "M46 55 C18 56 4 72 16 88 C28 98 42 82 48 62 Z",
        "M50 30 C53 30 54 36 54 48 L54 78 C54 84 46 84 46 78 L46 48 C46 36 47 30 50 30 Z",
        "M48 32 C44 22 38 16 32 12 L33 9.5 C40 12.5 47 20 50 31 Z",
        "M52 32 C56 22 62 16 68 12 L67 9.5 C60 12.5 53 20 50 31 Z",
      ];
      parts.forEach((d) => ctx.fill(new Path2D(d)));
    },
  },
  moon: {
    label: "Moon",
    draw: (ctx) => {
      ctx.fill(circlePath(50, 50, 45));
      ctx.globalCompositeOperation = "destination-out";
      ctx.fill(circlePath(68, 42, 37));
      ctx.globalCompositeOperation = "source-over";
    },
  },
  drop: {
    label: "Drop",
    draw: (ctx) => ctx.fill(new Path2D("M50 5 C50 5 17 44 17 65 C17 83 31 95 50 95 C69 95 83 83 83 65 C83 44 50 5 50 5 Z")),
  },
  bolt: {
    label: "Bolt",
    draw: (ctx) => polygon(ctx, [[60, 3], [20, 55], [45, 55], [37, 97], [82, 39], [55, 39]]),
  },
  hexagon: {
    label: "Hexagon",
    draw: (ctx) => {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        pts.push([50 + 46 * Math.cos(a), 50 + 46 * Math.sin(a)]);
      }
      polygon(ctx, pts);
    },
  },
  spiral: {
    label: "Spiral",
    draw: (ctx) => {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 7.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const end = Math.PI * 2 * 2.15;
      for (let a = 0; a <= end; a += 0.05) {
        const r = 4 + (a / end) * 38;
        const x = 50 + r * Math.cos(a);
        const y = 50 + r * Math.sin(a);
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    },
  },
  infinity: {
    label: "Infinity",
    draw: (ctx) => {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const a = (i / 200) * Math.PI * 2;
        const s = Math.sin(a);
        const d = 1 + s * s;
        const x = 50 + (41 * Math.cos(a)) / d;
        const y = 50 + (41 * s * Math.cos(a)) / d;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    },
  },
  skull: {
    label: "Skull",
    draw: (ctx) => {
      ctx.beginPath();
      ctx.ellipse(50, 42, 35, 33, 0, 0, Math.PI * 2);
      ctx.fill();
      roundRect(ctx, 29, 62, 42, 30, 8);
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(36, 46, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(64, 46, 9.5, 0, Math.PI * 2);
      ctx.fill();
      polygon(ctx, [[50, 53], [43.5, 67], [56.5, 67]]);
      [40.5, 50, 59.5].forEach((x) => ctx.fillRect(x - 1, 79, 2, 13));
      ctx.globalCompositeOperation = "source-over";
    },
  },
};

export const SHAPE_LABELS = (Object.keys(SHAPES) as MaskShapeId[]).map((id) => ({ id, label: SHAPES[id].label }));

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D isn't available in this browser.");
  return { canvas, ctx };
}

function drawShape(ctx: Ctx, id: MaskShapeId, size: number): void {
  const k = (size * (1 - 2 * PAD)) / 100;
  const off = size * PAD;
  ctx.save();
  ctx.setTransform(k, 0, 0, k, off, off);
  ctx.fillStyle = "#fff";
  SHAPES[id].draw(ctx);
  ctx.restore();
}

/* ───────────────────────── fields ───────────────────────── */

const fieldCache = new Map<string, MaskField>();
const FIELD_CACHE_MAX = 8;

function remember(key: string, field: MaskField): MaskField {
  if (fieldCache.size >= FIELD_CACHE_MAX) {
    const oldest = fieldCache.keys().next().value;
    if (oldest !== undefined) fieldCache.delete(oldest);
  }
  fieldCache.set(key, field);
  return field;
}

function fieldFromAlpha(ctx: Ctx, size: number): MaskField {
  const px = ctx.getImageData(0, 0, size, size).data;
  const data = new Float32Array(size * size);
  for (let i = 0; i < data.length; i++) data[i] = (px[i * 4 + 3] ?? 0) / 255;
  return { data };
}

/** Built-in shapes rasterise synchronously. */
export function shapeField(id: MaskShapeId): MaskField {
  const key = `shape:${id}`;
  const cached = fieldCache.get(key);
  if (cached) return cached;
  const { ctx } = makeCanvas(MASK_SIZE);
  drawShape(ctx, id, MASK_SIZE);
  return remember(key, fieldFromAlpha(ctx, MASK_SIZE));
}

function designerField(document: GeometryDocument): MaskField {
  const key = `designer:${JSON.stringify(document)}`;
  const cached = fieldCache.get(key);
  if (cached) return cached;
  const { ctx } = makeCanvas(MASK_SIZE);
  const scale = (MASK_SIZE * (1 - 2 * PAD)) / Math.max(document.width, document.height);
  const offsetX = (MASK_SIZE - document.width * scale) / 2;
  const offsetY = (MASK_SIZE - document.height * scale) / 2;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  ctx.fillStyle = "#fff";
  for (const shape of document.shapes) {
    if (!shape.visible) continue;
    ctx.beginPath();
    for (const contour of shape.contours) {
      if (!contour.closed || contour.points.length < 3) continue;
      const [first, ...rest] = contour.points;
      if (!first) continue;
      ctx.moveTo(first.x, first.y);
      for (const point of rest) ctx.lineTo(point.x, point.y);
      ctx.closePath();
    }
    ctx.fill("evenodd");
  }
  ctx.restore();
  return remember(key, fieldFromAlpha(ctx, MASK_SIZE));
}

function textField(source: TextMaskSource): MaskField {
  const key = `text:${JSON.stringify(source)}`;
  const cached = fieldCache.get(key);
  if (cached) return cached;

  const { ctx } = makeCanvas(MASK_SIZE);
  const paragraphs = source.text.slice(0, MAX_TEXT_LENGTH).split("\n").slice(0, MAX_TEXT_LINES);
  const maxWidth = MASK_SIZE * (1 - 2 * PAD);
  const maxHeight = MASK_SIZE * (1 - 2 * PAD);
  let fontSize = 160;
  ctx.textAlign = source.align;
  ctx.textBaseline = "middle";
  ctx.letterSpacing = `${source.tracking}px`;

  const layoutLines = (size: number): string[] => {
    ctx.font = `${source.italic ? "italic " : ""}${source.fontWeight} ${size}px ${source.fontFamily}`;
    const lines: string[] = [];
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        lines.push("");
        continue;
      }
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth || !line) {
          line = candidate;
        } else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  let lines = layoutLines(fontSize);
  while (fontSize > 20 && lines.length * fontSize * source.lineSpacing > maxHeight) {
    fontSize -= 2;
    lines = layoutLines(fontSize);
  }

  ctx.font = `${source.italic ? "italic " : ""}${source.fontWeight} ${fontSize}px ${source.fontFamily}`;
  const lineHeight = fontSize * source.lineSpacing;
  const startY = MASK_SIZE / 2 - ((lines.length - 1) * lineHeight) / 2;
  const x = source.align === "left" ? MASK_SIZE * PAD : source.align === "right" ? MASK_SIZE * (1 - PAD) : MASK_SIZE / 2;
  ctx.fillStyle = "#fff";
  lines.forEach((line, index) => ctx.fillText(line, x, startY + index * lineHeight, maxWidth));
  return remember(key, fieldFromAlpha(ctx, MASK_SIZE));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.src = url;
  });
}

/** Stored images are opaque greyscale (white = shape), so luminance recovers the field exactly. */
async function fieldFromDataUrl(url: string): Promise<MaskField> {
  const cached = fieldCache.get(url);
  if (cached) return cached;
  const img = await loadImage(url);
  const { ctx } = makeCanvas(MASK_SIZE);
  ctx.drawImage(img, 0, 0, MASK_SIZE, MASK_SIZE);
  const px = ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
  const data = new Float32Array(MASK_SIZE * MASK_SIZE);
  for (let i = 0; i < data.length; i++) data[i] = (px[i * 4] ?? 0) / 255;
  return remember(url, { data });
}

export async function sourceField(source: MaskSource): Promise<MaskField> {
  if (source.kind === "shape") return shapeField(source.id);
  if (source.kind === "text") return textField(source);
  if (source.kind === "designer") return designerField(source.document);
  return fieldFromDataUrl(source.data);
}

function fieldToDataUrl(field: MaskField): string {
  const { canvas, ctx } = makeCanvas(MASK_SIZE);
  const image = ctx.createImageData(MASK_SIZE, MASK_SIZE);
  for (let i = 0; i < field.data.length; i++) {
    const v = Math.round(Math.min(1, Math.max(0, field.data[i] ?? 0)) * 255);
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

/* ───────────────────────── import ───────────────────────── */

/** Gives an SVG an explicit size so the browser rasterises it crisply, whatever its markup says. */
function prepareSvg(text: string): string {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Couldn't read that SVG.");
  }
  let vw = 0;
  let vh = 0;
  const vb = (root.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every((n) => Number.isFinite(n)) && (vb[2] ?? 0) > 0 && (vb[3] ?? 0) > 0) {
    vw = vb[2] ?? 0;
    vh = vb[3] ?? 0;
  } else {
    vw = parseFloat(root.getAttribute("width") ?? "") || 512;
    vh = parseFloat(root.getAttribute("height") ?? "") || 512;
    root.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
  }
  const k = 1024 / Math.max(vw, vh);
  root.setAttribute("width", String(Math.round(vw * k)));
  root.setAttribute("height", String(Math.round(vh * k)));
  if (!root.getAttribute("xmlns")) root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(root);
}

/**
 * Turns an uploaded PNG / JPG / WebP / SVG into a normalised greyscale field.
 * Transparent images use their alpha channel; opaque ones use brightness, and a
 * light background is detected automatically so dark logos on white just work.
 */
export async function importMaskFile(file: File): Promise<{ name: string; data: string }> {
  if (file.size > 12 * 1024 * 1024) throw new Error("That file is too large (12 MB max).");
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  const blob: Blob = isSvg ? new Blob([prepareSvg(await file.text())], { type: "image/svg+xml;charset=utf-8" }) : file;
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) throw new Error("That image has no size.");

    const box = MASK_SIZE * (1 - 2 * PAD);
    const k = box / Math.max(iw, ih);
    const dw = Math.max(1, Math.round(iw * k));
    const dh = Math.max(1, Math.round(ih * k));
    const dx = Math.round((MASK_SIZE - dw) / 2);
    const dy = Math.round((MASK_SIZE - dh) / 2);

    /* does the image carry real transparency? */
    const probe = makeCanvas(1);
    probe.canvas.width = dw;
    probe.canvas.height = dh;
    probe.ctx.drawImage(img, 0, 0, dw, dh);
    const probePx = probe.ctx.getImageData(0, 0, dw, dh).data;
    let clear = 0;
    for (let i = 3; i < probePx.length; i += 4) if ((probePx[i] ?? 255) < 250) clear++;
    const hasAlpha = clear > Math.max(8, dw * dh * 0.0005);

    const { ctx } = makeCanvas(MASK_SIZE);
    const field = new Float32Array(MASK_SIZE * MASK_SIZE);

    if (hasAlpha) {
      ctx.clearRect(0, 0, MASK_SIZE, MASK_SIZE);
      ctx.drawImage(img, dx, dy, dw, dh);
      const px = ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
      for (let i = 0; i < field.length; i++) field[i] = (px[i * 4 + 3] ?? 0) / 255;
    } else {
      /* average brightness of the image border decides what counts as background */
      let sum = 0;
      let count = 0;
      const lum = (i: number) => ((probePx[i] ?? 0) * 0.299 + (probePx[i + 1] ?? 0) * 0.587 + (probePx[i + 2] ?? 0) * 0.114) / 255;
      for (let x = 0; x < dw; x++) {
        sum += lum(x * 4) + lum(((dh - 1) * dw + x) * 4);
        count += 2;
      }
      for (let y = 0; y < dh; y++) {
        sum += lum(y * dw * 4) + lum((y * dw + dw - 1) * 4);
        count += 2;
      }
      const bg = count > 0 ? sum / count : 0;
      const flip = bg > 0.5;
      const grey = Math.round(bg * 255);
      ctx.fillStyle = `rgb(${grey},${grey},${grey})`;
      ctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
      ctx.drawImage(img, dx, dy, dw, dh);
      const px = ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
      for (let i = 0; i < field.length; i++) {
        const l = ((px[i * 4] ?? 0) * 0.299 + (px[i * 4 + 1] ?? 0) * 0.587 + (px[i * 4 + 2] ?? 0) * 0.114) / 255;
        field[i] = flip ? 1 - l : l;
      }
    }

    const normalised: MaskField = { data: field };
    const data = fieldToDataUrl(normalised);
    remember(data, normalised);
    const name = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Image";
    return { name, data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ───────────────────────── distance field ───────────────────────── */

const INF = 1e6;

/** Two-pass chamfer distance: for every pixel, the distance to the nearest pixel equal to `target`. */
function chamfer(mask: Uint8Array, n: number, target: number): Float32Array {
  const d = new Float32Array(n * n);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] === target ? 0 : INF;
  const D = Math.SQRT2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      let v = d[i] ?? INF;
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, (d[i - 1] ?? INF) + 1);
      if (y > 0) {
        v = Math.min(v, (d[i - n] ?? INF) + 1);
        if (x > 0) v = Math.min(v, (d[i - n - 1] ?? INF) + D);
        if (x < n - 1) v = Math.min(v, (d[i - n + 1] ?? INF) + D);
      }
      d[i] = v;
    }
  }
  for (let y = n - 1; y >= 0; y--) {
    for (let x = n - 1; x >= 0; x--) {
      const i = y * n + x;
      let v = d[i] ?? INF;
      if (v === 0) continue;
      if (x < n - 1) v = Math.min(v, (d[i + 1] ?? INF) + 1);
      if (y < n - 1) {
        v = Math.min(v, (d[i + n] ?? INF) + 1);
        if (x < n - 1) v = Math.min(v, (d[i + n + 1] ?? INF) + D);
        if (x > 0) v = Math.min(v, (d[i + n - 1] ?? INF) + D);
      }
      d[i] = v;
    }
  }
  return d;
}

function blurLine(data: Float32Array, offset: number, stride: number, n: number, r: number, tmp: Float32Array): void {
  const at = (k: number) => data[offset + Math.min(n - 1, Math.max(0, k)) * stride] ?? 0;
  let acc = 0;
  for (let k = -r; k <= r; k++) acc += at(k);
  const inv = 1 / (2 * r + 1);
  for (let i = 0; i < n; i++) {
    tmp[i] = acc * inv;
    acc += at(i + r + 1) - at(i - r);
  }
  for (let i = 0; i < n; i++) data[offset + i * stride] = tmp[i] ?? 0;
}

/** Separable box blur; three passes approximate a Gaussian. */
function boxBlur(data: Float32Array, n: number, r: number, passes: number): void {
  const tmp = new Float32Array(n);
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < n; y++) blurLine(data, y * n, 1, n, r, tmp);
    for (let x = 0; x < n; x++) blurLine(data, x, n, n, r, tmp);
  }
}

const to8 = (v: number): number => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));

export function buildMaskPixels(field: MaskField, threshold: number, invert: boolean): MaskPixels {
  const n = MASK_SIZE;
  const total = n * n;
  const inside = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const raw = field.data[i] ?? 0;
    inside[i] = (invert ? 1 - raw : raw) >= threshold ? 1 : 0;
  }

  const toInside = chamfer(inside, n, 1);
  const toOutside = chamfer(inside, n, 0);

  const sd = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    sd[i] = inside[i] ? (toOutside[i] ?? 0) - 0.5 : -((toInside[i] ?? 0) - 0.5);
  }
  boxBlur(sd, n, 2, 2); // hides the one-pixel staircase of the binary edge

  const aura = new Float32Array(total);
  for (let i = 0; i < total; i++) aura[i] = inside[i] ?? 0;
  boxBlur(aura, n, 14, 3);

  let maxDepth = 1;
  for (let i = 0; i < total; i++) if (inside[i] && (toOutside[i] ?? 0) > maxDepth && (toOutside[i] ?? 0) < INF / 2) maxDepth = toOutside[i] ?? 1;
  const depth = new Float32Array(total);
  for (let i = 0; i < total; i++) depth[i] = inside[i] ? Math.min(1, (toOutside[i] ?? 0) / maxDepth) : 0;
  boxBlur(depth, n, 5, 2);

  const out = new Uint8Array(total * 4);
  for (let y = 0; y < n; y++) {
    const row = (n - 1 - y) * n;
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const o = (row + x) * 4;
      out[o] = to8((aura[i] ?? 0) * 255);
      out[o + 1] = to8(((sd[i] ?? 0) / (2 * SDF_RANGE_PX) + 0.5) * 255);
      out[o + 2] = to8((depth[i] ?? 0) * 255);
      out[o + 3] = 255;
    }
  }
  return { size: n, data: out };
}

/* ───────────────────────── caches & helpers ───────────────────────── */

const pixelCache = new Map<string, MaskPixels>();

function sourceKey(source: MaskSource): string {
  if (source.kind === "shape") return `shape:${source.id}`;
  if (source.kind === "text") return `text:${JSON.stringify(source)}`;
  if (source.kind === "designer") return `designer:${JSON.stringify(source.document)}`;
  return source.data;
}

/** Cached pixel build — the threshold slider calls this many times a second. */
export function maskPixelsFor(field: MaskField, source: MaskSource, threshold: number, invert: boolean): MaskPixels {
  const key = `${sourceKey(source)}|${threshold.toFixed(2)}|${invert ? 1 : 0}`;
  const cached = pixelCache.get(key);
  if (cached) return cached;
  const pixels = buildMaskPixels(field, threshold, invert);
  if (pixelCache.size >= 6) {
    const oldest = pixelCache.keys().next().value;
    if (oldest !== undefined) pixelCache.delete(oldest);
  }
  pixelCache.set(key, pixels);
  return pixels;
}

/** Synchronous variant for thumbnails: only built-in shapes (or images already decoded) can be resolved. */
export function maskPixelsSync(mask: ShaderMask): MaskPixels | null {
  if (!mask.enabled) return null;
  if (mask.source.kind === "shape") return maskPixelsFor(shapeField(mask.source.id), mask.source, mask.threshold, mask.invert);
  if (mask.source.kind === "text") return maskPixelsFor(textField(mask.source), mask.source, mask.threshold, mask.invert);
  if (mask.source.kind === "designer") return maskPixelsFor(designerField(mask.source.document), mask.source, mask.threshold, mask.invert);
  const field = fieldCache.get(mask.source.data);
  return field ? maskPixelsFor(field, mask.source, mask.threshold, mask.invert) : null;
}

const dataUrlCache = new WeakMap<MaskPixels, string>();

/** The packed texture as a PNG data URL — this is what the exported shader embeds. */
export function maskPixelsToDataUrl(pixels: MaskPixels): string {
  const cached = dataUrlCache.get(pixels);
  if (cached) return cached;
  const { canvas, ctx } = makeCanvas(pixels.size);
  const image = ctx.createImageData(pixels.size, pixels.size);
  image.data.set(pixels.data);
  ctx.putImageData(image, 0, 0);
  const url = canvas.toDataURL("image/png");
  dataUrlCache.set(pixels, url);
  return url;
}

const thumbCache = new Map<MaskShapeId, string>();

/** A 64px white-on-transparent preview of a built-in shape. */
export function shapeThumbUrl(id: MaskShapeId): string {
  const cached = thumbCache.get(id);
  if (cached) return cached;
  const { canvas, ctx } = makeCanvas(64);
  drawShape(ctx, id, 64);
  const url = canvas.toDataURL("image/png");
  thumbCache.set(id, url);
  return url;
}
