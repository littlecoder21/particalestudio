import { analyzeSvg, QUALITY_PIXELS, rasterSize, type SvgQuality } from "./svgEngine/analyze";
import { generateSamples } from "./svgEngine/sampler";

export type { SvgQuality } from "./svgEngine/analyze";
export type SvgSamplingMode = "Outline" | "Fill" | "Combined";
export type SvgDistribution = "Uniform" | "Random" | "Weighted" | "Density";

export interface SvgViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SvgPathInfo {
  id: string;
  label: string;
}

export interface SvgSource {
  name: string;
  markup: string;
  viewBox: SvgViewBox;
  paths: SvgPathInfo[];
  selectedPath: string;
  mode: SvgSamplingMode;
  distribution: SvgDistribution;
  spacing: number;
  /** Analysis resolution: Fast 1024 px, High 2048 px, Ultra 3072 px (default High). */
  quality?: SvgQuality;
  /** Share (0-100) of the particles placed on the outer border (default 35). */
  borderDetail?: number;
  /** Share (0-100) of the particles placed on inner edges (default 25). */
  edgeDetail?: number;
  /** Extra particle density at sharp corners, 0-100 (default 60). */
  cornerSharpness?: number;
}

export interface SvgSamplePoint {
  x: number;
  y: number;
  color: string;
}

export const SVG_DETAIL_DEFAULTS = {
  quality: "High" as SvgQuality,
  borderDetail: 35,
  edgeDetail: 25,
  cornerSharpness: 60,
};

export interface SvgSampleStats {
  total: number;
  border: number;
  edges: number;
  fill: number;
  /** Traced silhouette + inner contours available for placement. */
  contours: number;
  /** Analysis raster, e.g. "2048 × 1536". */
  resolution: string;
  /** Total time for this call in milliseconds. */
  ms: number;
  /** True when the heavy analysis was reused from the cache. */
  cached: boolean;
  /** Nearly every sampled colour is very dark (invisible on a dark canvas). */
  dark: boolean;
}

const maximumSvgBytes = 5_000_000;
const maximumGeometryCount = 1500;
const geometrySelector = "path,rect,circle,ellipse,line,polyline,polygon";
const allowedElements = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "title", "desc",
]);
const allowedAttributes = new Set([
  "xmlns", "width", "height", "viewBox", "preserveAspectRatio", "id",
  "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "points",
  "transform", "fill", "fill-rule", "clip-rule", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "opacity", "fill-opacity",
  "stroke-opacity", "clip-path", "mask", "href", "xlink:href", "offset", "stop-color", "stop-opacity",
  "gradientUnits", "gradientTransform", "spreadMethod", "fx", "fy", "fr", "clipPathUnits",
  "maskUnits",
]);
const inlineStyleProperties = [
  "fill", "fill-rule", "clip-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-dashoffset", "opacity", "fill-opacity", "stroke-opacity",
  "stop-color", "stop-opacity", "color",
];
const safeSelectorToken = "(?:(?:[a-z][\\w-]*)?(?:[.#][\\w-]+)+|[a-z][\\w-]*)";
const safeSelector = new RegExp(`^${safeSelectorToken}(?:\\s*(?:>\\s*|\\s+)${safeSelectorToken})*$`, "i");
const excludedGeometryParents = new Set(["defs", "clipPath", "mask"]);

function isGeometry(element: Element): element is SVGGeometryElement {
  return element.namespaceURI === "http://www.w3.org/2000/svg" &&
    ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"].includes(element.localName);
}

function visibleGeometries(root: SVGSVGElement): SVGGeometryElement[] {
  return Array.from(root.querySelectorAll(geometrySelector))
    .filter(isGeometry)
    .filter((element) => {
      let parent: Element | null = element.parentNode instanceof Element ? element.parentNode : null;
      while (parent && parent !== root) {
        if (excludedGeometryParents.has(parent.localName)) return false;
        parent = parent.parentNode instanceof Element ? parent.parentNode : null;
      }
      return true;
    });
}

function parseViewBox(root: SVGSVGElement): SvgViewBox {
  const rawViewBox = root.getAttribute("viewBox");
  let values = rawViewBox?.trim().split(/[\s,]+/).map(Number);
  if (!values || values.length !== 4 || values.some((value) => !Number.isFinite(value)) ||
      values[2] <= 0 || values[3] <= 0) {
    const parseLength = (value: string | null) => {
      if (!value || !/^\s*\d+(?:\.\d+)?(?:px)?\s*$/.test(value)) return Number.NaN;
      return Number.parseFloat(value);
    };
    const width = parseLength(root.getAttribute("width"));
    const height = parseLength(root.getAttribute("height"));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error("SVG needs a valid viewBox or positive width and height.");
    }
    values = [0, 0, width, height];
  }
  return { x: values[0], y: values[1], width: values[2], height: values[3] };
}

function safeSvgMarkup(root: SVGSVGElement): string {
  const applyStyleDeclarations = (element: SVGElement, declarationText: string) => {
    const scratch = document.createElement("span");
    scratch.style.cssText = declarationText;
    for (const property of inlineStyleProperties) {
      const value = scratch.style.getPropertyValue(property).trim();
      if (!value) continue;
      if (
        /expression\s*\(|javascript:/i.test(value) ||
        (/url\s*\(/i.test(value) && !/^url\(\s*['"]?#[-\w:.]+['"]?\s*\)$/i.test(value))
      ) {
        continue;
      }
      element.setAttribute(property, value);
    }
  };

  for (const styleElement of Array.from(root.querySelectorAll("style"))) {
    const stylesheet = (styleElement.textContent ?? "").replace(/@import\b[^;]*;?/gi, "");
    const rules = stylesheet.matchAll(/([^{}]+)\{([^{}]*)\}/g);
    if (rules) {
      for (const rule of rules) {
        const selectors = rule[1].trim().split(",");
        for (const selector of selectors) {
          const trimmedSelector = selector.trim();
          if (!safeSelector.test(trimmedSelector)) continue;
          const targets: SVGElement[] = Array.from(root.querySelectorAll(trimmedSelector)) as SVGElement[];
          if (root.matches(trimmedSelector)) targets.unshift(root);
          for (const target of targets) applyStyleDeclarations(target, rule[2]);
        }
      }
    }
    styleElement.remove();
  }

  const preserveSafeInlineStyles = (element: SVGElement) => {
    applyStyleDeclarations(element, element.getAttribute("style") ?? "");
    element.removeAttribute("style");
  };

  const nodes = Array.from(root.querySelectorAll("*"));
  for (const element of nodes) {
    if (!allowedElements.has(element.localName)) {
      element.remove();
      continue;
    }
    preserveSafeInlineStyles(element as unknown as SVGElement);
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name;
      const value = attribute.value.trim();
      if (
        name.toLowerCase().startsWith("on") ||
        !allowedAttributes.has(name) ||
        ((name === "href" || name === "xlink:href") && !value.startsWith("#")) ||
        (/url\s*\(/i.test(value) && !/url\(\s*['"]?#[-\w:.]+['"]?\s*\)/i.test(value))
      ) {
        element.removeAttribute(name);
      }
    }
  }
  preserveSafeInlineStyles(root);
  for (const attribute of Array.from(root.attributes)) {
    const name = attribute.name;
    const value = attribute.value.trim();
    if (
      name.toLowerCase().startsWith("on") ||
      !allowedAttributes.has(name) ||
      (/url\s*\(/i.test(value) && !/url\(\s*['"]?#[-\w:.]+['"]?\s*\)/i.test(value))
    ) {
      root.removeAttribute(name);
    }
  }
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(root);
}

function parseMarkup(markup: string): SVGSVGElement {
  const document = new DOMParser().parseFromString(markup, "image/svg+xml");
  if (document.querySelector("parsererror") || document.documentElement.localName !== "svg") {
    throw new Error("This file is not a valid SVG document.");
  }
  return document.documentElement as unknown as SVGSVGElement;
}

export function parseSvgSource(markup: string, name: string): SvgSource {
  if (!markup.trim()) throw new Error("The SVG file is empty.");
  if (new Blob([markup]).size > maximumSvgBytes) {
    throw new Error(`SVG files must be smaller than ${maximumSvgBytes / 1_000_000} MB.`);
  }

  const root = parseMarkup(markup);
  const viewBox = parseViewBox(root);
  const safeMarkup = safeSvgMarkup(root);
  const sanitizedRoot = parseMarkup(safeMarkup);
  const geometries = visibleGeometries(sanitizedRoot);
  if (geometries.length === 0) throw new Error("No drawable SVG paths or shapes were found.");
  if (geometries.length > maximumGeometryCount) {
    throw new Error(`This SVG has more than ${maximumGeometryCount} drawable paths. Simplify it and try again.`);
  }

  const reservedIds = new Set(Array.from(sanitizedRoot.querySelectorAll("[id]"), (element) => element.id));
  const usedIds = new Set<string>();
  const paths = geometries.map((geometry, index) => {
    const originalId = geometry.id;
    let id = originalId;
    if (!id || usedIds.has(id)) {
      id = `particle-shape-${index + 1}`;
      while (reservedIds.has(id) || usedIds.has(id)) id += "-";
    }
    usedIds.add(id);
    geometry.id = id;
    return {
      id,
      label: originalId || `Shape ${index + 1}`,
    };
  });

  return {
    name,
    markup: safeSvgMarkup(sanitizedRoot),
    viewBox,
    paths,
    selectedPath: "all",
    mode: "Combined",
    distribution: "Uniform",
    spacing: 12,
    ...SVG_DETAIL_DEFAULTS,
  };
}

/** Detail settings with defaults filled in (older saved projects have none of them). */
export function svgDetailOptions(source: SvgSource) {
  const clamp = (value: number | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback;
  return {
    quality: source.quality && source.quality in QUALITY_PIXELS ? source.quality : SVG_DETAIL_DEFAULTS.quality,
    borderDetail: clamp(source.borderDetail, SVG_DETAIL_DEFAULTS.borderDetail),
    edgeDetail: clamp(source.edgeDetail, SVG_DETAIL_DEFAULTS.edgeDetail),
    cornerSharpness: clamp(source.cornerSharpness, SVG_DETAIL_DEFAULTS.cornerSharpness),
  };
}

/** Copies validated detail settings from saved project data onto a freshly parsed source. */
export function restoreSvgDetail(source: SvgSource, saved: Record<string, unknown>): void {
  if (saved.quality === "Fast" || saved.quality === "High" || saved.quality === "Ultra") source.quality = saved.quality;
  for (const key of ["borderDetail", "edgeDetail", "cornerSharpness"] as const) {
    const value = saved[key];
    if (typeof value === "number" && value >= 0 && value <= 100) source[key] = value;
  }
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

/**
 * Samples particle positions (with source colours) from the SVG. The heavy analysis is cached, so
 * calling this again with another particle count or detail setting is fast.
 */
export async function sampleSvgSourceDetailed(
  source: SvgSource, count: number,
): Promise<{ points: SvgSamplePoint[]; stats: SvgSampleStats }> {
  if (!Number.isFinite(count) || count < 1) throw new Error("Particle count must be greater than zero.");
  const started = performance.now();
  const detail = svgDetailOptions(source);
  const { promise, cached } = analyzeSvg({
    markup: source.markup,
    viewBox: source.viewBox,
    selectedPath: source.selectedPath,
    quality: detail.quality,
  });
  const analysis = await promise;
  const set = generateSamples(analysis, {
    mode: source.mode,
    distribution: source.distribution,
    spacing: source.spacing,
    borderDetail: detail.borderDetail,
    edgeDetail: detail.edgeDetail,
    cornerSharpness: detail.cornerSharpness,
  }, Math.floor(count));
  if (set.stats.total === 0) throw new Error("No particles could be sampled from this SVG.");

  const { viewBox } = source;
  const diameter = Math.max(viewBox.width, viewBox.height);
  const ax = viewBox.width / diameter;
  const ay = viewBox.height / diameter;
  const points: SvgSamplePoint[] = new Array(set.stats.total);
  let dark = 0;
  for (let i = 0; i < points.length; i += 1) {
    const rgb = set.rgb[i];
    const r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
    if (0.2126 * r + 0.7152 * g + 0.0722 * b < 51) dark += 1;
    points[i] = {
      x: (set.x[i] / analysis.width - 0.5) * ax,
      y: (set.y[i] / analysis.height - 0.5) * ay,
      color: `#${HEX[r]}${HEX[g]}${HEX[b]}`,
    };
  }
  const size = rasterSize(viewBox, detail.quality);
  return {
    points,
    stats: {
      total: set.stats.total,
      border: set.stats.border,
      edges: set.stats.edges,
      fill: set.stats.fill,
      contours: analysis.borders.length + analysis.edges.length,
      resolution: `${size.width} × ${size.height}`,
      ms: Math.round(performance.now() - started),
      cached,
      dark: dark / points.length >= 0.95,
    },
  };
}

export async function sampleSvgSource(source: SvgSource, count: number): Promise<SvgSamplePoint[]> {
  return (await sampleSvgSourceDetailed(source, count)).points;
}
