/**
 * Prepares an SVG for sampling. This is the only heavy step, so its result is cached per
 * (artwork, selected shape, quality) and reused while the particle count / sliders change.
 *
 *   1. the SVG is rendered once by the browser at high resolution (gradients, clips, strokes ...)
 *   2. the anti-aliased alpha channel is traced into sub-pixel contours (marching squares)
 *   3. stroke-only paths are flattened exactly from their path data (their centre line is used)
 */
import { flattenPath, multiply, parseTransform, primitiveToPath, type Matrix } from "./pathData";
import { KIND_BORDER, KIND_EDGE, KIND_STROKE, computeCurvature, traceMask, type Contour } from "./trace";

export type SvgQuality = "Fast" | "High" | "Ultra";

/** Longest side of the analysis raster in pixels. */
export const QUALITY_PIXELS: Record<SvgQuality, number> = { Fast: 1024, High: 2048, Ultra: 3072 };

export interface FillBox { x0: number; y0: number; x1: number; y1: number }

export interface SvgAnalysis {
  width: number;
  height: number;
  /** Straight (non-premultiplied) RGBA of the rendered artwork. */
  rgba: Uint8ClampedArray;
  /** Highest alpha value in the rendering. */
  peak: number;
  /** Alpha level of the traced border (half of full coverage for crisp artwork). */
  iso: number;
  /** Alpha level from which a pixel counts as painted area for fill sampling. */
  fillThreshold: number;
  borders: Contour[];
  edges: Contour[];
  /** Painted pixels / bounding box (fill sampling). */
  fillArea: number;
  fillBox: FillBox;
  vertexCount: number;
  strokeCount: number;
  buildMs: number;
}

export interface BuildInput {
  rgba: Uint8ClampedArray;
  /** Rendering with stroke-only shapes hidden (used for tracing); null = same as `rgba`. */
  maskRgba?: Uint8ClampedArray | null;
  width: number;
  height: number;
  strokes: Contour[];
}

function peakAlpha(rgba: Uint8ClampedArray): number {
  let peak = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > peak) peak = rgba[i];
  return peak;
}

/** Pure part of the analysis: contours, painted area and layer pools from rendered pixels. */
export function buildAnalysis(input: BuildInput): SvgAnalysis {
  const started = performance.now();
  const { rgba, width, height, strokes } = input;
  const peak = peakAlpha(rgba);
  if (peak < 16 && strokes.length === 0) throw new Error("This SVG has no visible filled area to sample.");

  const mask = input.maskRgba ?? rgba;
  const maskPeak = mask === rgba ? peak : peakAlpha(mask);
  const iso = maskPeak >= 224 ? 128 : Math.max(8, Math.round(maskPeak * 0.5));
  const fillThreshold = Math.min(32, Math.max(8, Math.round(peak * 0.125)));

  const traced = maskPeak >= 16
    ? traceMask(mask, width, height, iso, {
      minLength: Math.max(2.5, 0.0012 * Math.max(width, height)),
      smoothing: 2,
    })
    : [];
  const borders = traced.filter((c) => c.kind === KIND_BORDER);
  const edges = traced.filter((c) => c.kind === KIND_EDGE);
  // Pure line art has no silhouette: its stroke lines are the border. Mixed art keeps them as edges.
  if (borders.length === 0) borders.push(...strokes);
  else edges.push(...strokes);

  let fillArea = 0;
  const box: FillBox = { x0: width, y0: height, x1: -1, y1: -1 };
  for (let y = 0; y < height; y += 1) {
    let k = y * width * 4 + 3;
    for (let x = 0; x < width; x += 1, k += 4) {
      if (rgba[k] >= fillThreshold) {
        fillArea += 1;
        if (x < box.x0) box.x0 = x;
        if (x > box.x1) box.x1 = x;
        if (y < box.y0) box.y0 = y;
        if (y > box.y1) box.y1 = y;
      }
    }
  }
  if (fillArea === 0 && borders.length === 0 && edges.length === 0) {
    throw new Error("This SVG has no visible filled area to sample.");
  }

  let vertexCount = 0;
  for (const c of borders) vertexCount += c.curv.length;
  for (const c of edges) vertexCount += c.curv.length;
  return {
    width, height, rgba, peak, iso, fillThreshold, borders, edges, fillArea, fillBox: box,
    vertexCount, strokeCount: strokes.length, buildMs: performance.now() - started,
  };
}

// ---------------------------------------------------------------------------------------------
// Browser side: scene walk for stroke-only paths and SVG rendering.
// ---------------------------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";
const GEOMETRY = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
const NON_RENDERED = new Set(["defs", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "title", "desc"]);

interface Paint {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  fillOpacity: number;
  strokeOpacity: number;
}

function num(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const v = Number.parseFloat(value);
  return Number.isFinite(v) ? v : fallback;
}

function inheritPaint(parent: Paint, el: Element): Paint {
  return {
    fill: el.getAttribute("fill")?.trim() ?? parent.fill,
    stroke: el.getAttribute("stroke")?.trim() ?? parent.stroke,
    strokeWidth: num(el.getAttribute("stroke-width"), parent.strokeWidth),
    opacity: parent.opacity * num(el.getAttribute("opacity"), 1),
    fillOpacity: num(el.getAttribute("fill-opacity"), parent.fillOpacity),
    strokeOpacity: num(el.getAttribute("stroke-opacity"), parent.strokeOpacity),
  };
}

function isGeometryHidden(el: Element): boolean {
  return el.getAttribute("display") === "none";
}

function geometryElements(root: Element): Element[] {
  const found: Element[] = [];
  const visit = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (NON_RENDERED.has(child.localName)) continue;
      if (GEOMETRY.has(child.localName)) found.push(child);
      else visit(child);
    }
  };
  visit(root);
  return found;
}

interface Scene {
  strokes: Contour[];
  /** Stroke-only shapes (hidden for the tracing render). */
  elements: Element[];
}

function collectScene(root: Element, base: Matrix): Scene {
  const scene: Scene = { strokes: [], elements: [] };
  const rootPaint: Paint = {
    fill: "#000", stroke: "none", strokeWidth: 1, opacity: 1, fillOpacity: 1, strokeOpacity: 1,
  };
  const walk = (node: Element, matrix: Matrix, paint: Paint) => {
    for (const child of Array.from(node.children)) {
      const name = child.localName;
      if (NON_RENDERED.has(name) || isGeometryHidden(child)) continue;
      const m = multiply(matrix, parseTransform(child.getAttribute("transform")));
      const p = inheritPaint(paint, child);
      if (!GEOMETRY.has(name)) {
        walk(child, m, p);
        continue;
      }
      const fillVisible = name !== "line" && p.fill !== "none" && p.fill !== "transparent" && p.fillOpacity > 0;
      const strokeVisible = p.stroke !== "none" && p.stroke !== "transparent" && p.strokeWidth > 0 && p.strokeOpacity > 0;
      if (p.opacity <= 0 || fillVisible || !strokeVisible) continue;
      const d = primitiveToPath(name, (attr) => child.getAttribute(attr));
      if (!d) continue;
      let added = false;
      for (const poly of flattenPath(d, m, 0.04)) {
        const n = poly.pts.length >> 1;
        if (n < 2) continue;
        const pts = Float32Array.from(poly.pts);
        let length = 0;
        const segs = poly.closed ? n : n - 1;
        for (let i = 0; i < segs; i += 1) {
          const j = i + 1 === n ? 0 : i + 1;
          const dx = pts[2 * j] - pts[2 * i], dy = pts[2 * j + 1] - pts[2 * i + 1];
          length += Math.sqrt(dx * dx + dy * dy);
        }
        if (length < 1) continue;
        scene.strokes.push({ pts, curv: computeCurvature(pts, poly.closed), closed: poly.closed, length, kind: KIND_STROKE });
        added = true;
      }
      if (added) scene.elements.push(child);
    }
  };
  walk(root, base, rootPaint);
  return scene;
}

async function rasterize(markup: string, width: number, height: number): Promise<Uint8ClampedArray> {
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The SVG could not be rendered for sampling."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser cannot sample SVG pixels.");
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export interface AnalyzeInput {
  markup: string;
  viewBox: { x: number; y: number; width: number; height: number };
  /** "all" or the id of a single shape. */
  selectedPath: string;
  quality: SvgQuality;
}

export function rasterSize(viewBox: AnalyzeInput["viewBox"], quality: SvgQuality): { width: number; height: number } {
  const scale = QUALITY_PIXELS[quality] / Math.max(viewBox.width, viewBox.height);
  return {
    width: Math.max(1, Math.round(viewBox.width * scale)),
    height: Math.max(1, Math.round(viewBox.height * scale)),
  };
}

async function analyze(input: AnalyzeInput): Promise<SvgAnalysis> {
  const { viewBox } = input;
  const { width, height } = rasterSize(viewBox, input.quality);
  const parsed = new DOMParser().parseFromString(input.markup, "image/svg+xml");
  const root = parsed.documentElement;
  if (parsed.querySelector("parsererror") || root.namespaceURI !== SVG_NS) {
    throw new Error("This file is not a valid SVG document.");
  }
  if (input.selectedPath !== "all") {
    const shapes = geometryElements(root);
    if (!shapes.some((shape) => shape.id === input.selectedPath)) {
      throw new Error("The selected SVG shape is no longer available.");
    }
    for (const shape of shapes) if (shape.id !== input.selectedPath) shape.setAttribute("display", "none");
  }
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);

  // viewBox units -> raster pixels
  const sx = width / viewBox.width;
  const sy = height / viewBox.height;
  const base = multiply([sx, 0, 0, sy, 0, 0], [1, 0, 0, 1, -viewBox.x, -viewBox.y]);
  const scene = collectScene(root, base);

  const serializer = new XMLSerializer();
  const full = await rasterize(serializer.serializeToString(root), width, height);
  let mask: Uint8ClampedArray | null = null;
  if (scene.elements.length > 0) {
    for (const el of scene.elements) el.setAttribute("display", "none");
    mask = await rasterize(serializer.serializeToString(root), width, height);
  }
  await nextTask();
  return buildAnalysis({ rgba: full, maskRgba: mask, width, height, strokes: scene.strokes });
}

function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const cache = new Map<string, Promise<SvgAnalysis>>();
const CACHE_SIZE = 4;

/** Cached analysis: sliding the particle count or the detail sliders never repeats the heavy work. */
export function analyzeSvg(input: AnalyzeInput): { promise: Promise<SvgAnalysis>; cached: boolean } {
  const key = `${fnv(input.markup)}:${input.markup.length}:${input.selectedPath}:${input.quality}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return { promise: hit, cached: true };
  }
  const promise = analyze(input);
  cache.set(key, promise);
  promise.catch(() => {
    if (cache.get(key) === promise) cache.delete(key);
  });
  while (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return { promise, cached: false };
}
