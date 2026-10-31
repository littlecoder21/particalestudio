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
}

export interface SvgSamplePoint {
  x: number;
  y: number;
  color: string;
}

const maximumSvgBytes = 1_000_000;
const maximumGeometryCount = 256;
const rasterSize = 512;
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
  "stroke-opacity", "clip-path",   "mask", "href", "xlink:href", "offset", "stop-color", "stop-opacity",
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

interface RasterizedSvg {
  pixels: ImageData;
  width: number;
  height: number;
}

interface OutlineSegment {
  shape: SVGGeometryElement;
  length: number;
  geometryLength: number;
  weight: number;
  matrix: DOMMatrix;
  localDistances: number[];
  transformedDistances: number[];
}

function rasterDimensions(source: SvgSource): { width: number; height: number } {
  const scale = rasterSize / Math.max(source.viewBox.width, source.viewBox.height);
  return {
    width: Math.max(1, Math.round(source.viewBox.width * scale)),
    height: Math.max(1, Math.round(source.viewBox.height * scale)),
  };
}

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
  if (new Blob([markup]).size > maximumSvgBytes) throw new Error("SVG files must be smaller than 1 MB.");

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
  };
}

function svgWithOnlySelectedShape(source: SvgSource): SVGSVGElement {
  const root = parseMarkup(source.markup);
  if (source.selectedPath === "all") return root;
  const shapes = visibleGeometries(root);
  const selected = shapes.find((shape) => shape.id === source.selectedPath);
  if (!selected) throw new Error("The selected SVG shape is no longer available.");
  for (const shape of shapes) {
    if (shape !== selected) shape.style.setProperty("display", "none", "important");
  }
  return root;
}

function makeHiddenSvg(source: SvgSource): { host: HTMLDivElement; root: SVGSVGElement; shapes: SVGGeometryElement[] } {
  const dimensions = rasterDimensions(source);
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${dimensions.width}px`,
    height: `${dimensions.height}px`,
    overflow: "hidden",
    opacity: "0",
    pointerEvents: "none",
  });
  const root = svgWithOnlySelectedShape(source);
  root.setAttribute("width", String(dimensions.width));
  root.setAttribute("height", String(dimensions.height));
  root.setAttribute("viewBox", `${source.viewBox.x} ${source.viewBox.y} ${source.viewBox.width} ${source.viewBox.height}`);
  host.appendChild(document.importNode(root, true));
  document.body.appendChild(host);
  const attachedRoot = host.querySelector("svg");
  if (!attachedRoot) {
    host.remove();
    throw new Error("Could not prepare this SVG for sampling.");
  }
  return { host, root: attachedRoot as unknown as SVGSVGElement, shapes: visibleGeometries(attachedRoot as unknown as SVGSVGElement) };
}

async function rasterizeSvg(source: SvgSource): Promise<RasterizedSvg> {
  const dimensions = rasterDimensions(source);
  const root = svgWithOnlySelectedShape(source);
  root.setAttribute("width", String(dimensions.width));
  root.setAttribute("height", String(dimensions.height));
  root.setAttribute("viewBox", `${source.viewBox.x} ${source.viewBox.y} ${source.viewBox.width} ${source.viewBox.height}`);
  const markup = new XMLSerializer().serializeToString(root);
  const blobUrl = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The SVG could not be rendered for sampling."));
      image.src = blobUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser cannot sample SVG pixels.");
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
    return {
      pixels: context.getImageData(0, 0, dimensions.width, dimensions.height),
      ...dimensions,
    };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function pointColor(raster: RasterizedSvg, x: number, y: number): string {
  const px = Math.max(0, Math.min(raster.width - 1, Math.floor(x)));
  const py = Math.max(0, Math.min(raster.height - 1, Math.floor(y)));
  const index = (py * raster.width + px) * 4;
  const { data } = raster.pixels;
  if (data[index + 3] < 8) return "#ffffff";
  return `#${[data[index], data[index + 1], data[index + 2]].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function normalizedPoint(source: SvgSource, x: number, y: number, color: string): SvgSamplePoint {
  const diameter = Math.max(source.viewBox.width, source.viewBox.height);
  return {
    x: (x - source.viewBox.x - source.viewBox.width / 2) / diameter,
    y: (y - source.viewBox.y - source.viewBox.height / 2) / diameter,
    color,
  };
}

function sampleOutline(
  source: SvgSource,
  count: number,
  raster: RasterizedSvg,
): SvgSamplePoint[] {
  const { host, root, shapes } = makeHiddenSvg(source);
  try {
    const rootMatrix = root.getScreenCTM();
    if (!rootMatrix) throw new Error("The browser could not measure this SVG.");
    const rootInverse = rootMatrix.inverse();
    const segments = shapes.map((shape): OutlineSegment | null => {
      const localLength = shape.getTotalLength();
      const matrix = shape.getScreenCTM();
      if (localLength <= 0 || !matrix) return null;
      const transform = rootInverse.multiply(matrix);
      const localDistances = [0];
      const transformedDistances = [0];
      const firstPoint = shape.getPointAtLength(0);
      let previousPoint = new DOMPoint(firstPoint.x, firstPoint.y).matrixTransform(transform);
      const subdivisions = 96;
      for (let index = 1; index <= subdivisions; index += 1) {
        const distance = (localLength * index) / subdivisions;
        const point = shape.getPointAtLength(distance);
        const transformedPoint = new DOMPoint(point.x, point.y).matrixTransform(transform);
        const previousDistance = transformedDistances[transformedDistances.length - 1];
        transformedDistances.push(previousDistance + Math.hypot(
          transformedPoint.x - previousPoint.x,
          transformedPoint.y - previousPoint.y,
        ));
        localDistances.push(distance);
        previousPoint = transformedPoint;
      }
      const length = transformedDistances[transformedDistances.length - 1];
      const style = getComputedStyle(shape);
      const weight = length * Math.max(Number.parseFloat(style.strokeWidth) || 1, 0.1) *
        Math.max(Number.parseFloat(style.opacity) || 1, 0.1);
      return {
        shape,
        length,
        geometryLength: localLength,
        weight,
        matrix: transform,
        localDistances,
        transformedDistances,
      };
    }).filter((segment): segment is OutlineSegment => segment !== null && segment.length > 0);

    if (segments.length === 0) return [];

    const totalLength = segments.reduce((total, segment) => total + segment.length, 0);
    const weightedLength = segments.reduce((total, segment) => total + segment.weight, 0);
    const amount = source.distribution === "Density"
      ? Math.min(count, Math.max(1, Math.ceil(totalLength / source.spacing)))
      : count;
    const result: SvgSamplePoint[] = [];
    for (let index = 0; index < amount; index += 1) {
      const useWeighted = source.distribution === "Weighted";
      const sampleLength = source.distribution === "Random"
        ? Math.random() * totalLength
        : (index + (source.distribution === "Density" ? 0.5 : 0)) /
          Math.max(amount, 1) * (useWeighted ? weightedLength : totalLength);
      let accumulated = 0;
      let selected = segments[segments.length - 1];
      let selectedWeight = useWeighted ? selected.weight : selected.length;
      for (const segment of segments) {
        const computed = useWeighted ? segment.weight : segment.length;
        if (sampleLength < accumulated + computed) {
          selected = segment;
          selectedWeight = computed;
          break;
        }
        accumulated += computed;
      }
      const segmentDistance = source.distribution === "Random"
        ? Math.random() * selected.length
        : ((sampleLength - accumulated) / selectedWeight) * selected.length;
      let lower = 0;
      let upper = selected.transformedDistances.length - 1;
      while (lower + 1 < upper) {
        const middle = Math.floor((lower + upper) / 2);
        if (selected.transformedDistances[middle] < segmentDistance) lower = middle;
        else upper = middle;
      }
      const distanceStart = selected.transformedDistances[lower];
      const distanceEnd = selected.transformedDistances[upper];
      const interpolation = distanceEnd > distanceStart
        ? (segmentDistance - distanceStart) / (distanceEnd - distanceStart)
        : 0;
      const localLength = selected.localDistances[lower] +
        (selected.localDistances[upper] - selected.localDistances[lower]) * interpolation;
      const sample = selected.shape.getPointAtLength(Math.max(0, Math.min(localLength, selected.geometryLength)));
      const transformed = new DOMPoint(sample.x, sample.y).matrixTransform(selected.matrix!);
      const x = transformed.x;
      const y = transformed.y;
      const pixelX = ((x - source.viewBox.x) / source.viewBox.width) * raster.width;
      const pixelY = ((y - source.viewBox.y) / source.viewBox.height) * raster.height;
      result.push(normalizedPoint(source, x, y, pointColor(raster, pixelX, pixelY)));
    }
    return result;
  } finally {
    host.remove();
  }
}

interface PixelCandidate {
  x: number;
  y: number;
  index: number;
  weight: number;
}

function sampleFill(source: SvgSource, count: number, raster: RasterizedSvg): SvgSamplePoint[] {
  const candidates: PixelCandidate[] = [];
  const { data } = raster.pixels;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const index = (y * raster.width + x) * 4;
      const alpha = data[index + 3];
      if (alpha >= 32) candidates.push({ x: x + 0.5, y: y + 0.5, index, weight: alpha });
    }
  }
  if (candidates.length === 0) throw new Error("This SVG has no visible filled area to sample.");

  const amount = source.distribution === "Density"
    ? Math.min(count, Math.max(1, Math.ceil(candidates.length / (source.spacing * source.spacing))))
    : count;
  const result: SvgSamplePoint[] = [];
  const columns = Math.max(1, Math.ceil(Math.sqrt(amount * raster.width / raster.height)));
  const rows = Math.max(1, Math.ceil(amount / columns));
  const buckets = source.distribution === "Uniform" ? Array.from({ length: columns * rows }, () => [] as PixelCandidate[]) : [];

  if (buckets.length > 0) {
    for (const candidate of candidates) {
      const column = Math.min(columns - 1, Math.floor(candidate.x / raster.width * columns));
      const row = Math.min(rows - 1, Math.floor(candidate.y / raster.height * rows));
      buckets[row * columns + column].push(candidate);
    }
  }

  const chooseWeighted = (items: PixelCandidate[]): PixelCandidate => {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let value = Math.random() * total;
    for (const item of items) {
      value -= item.weight;
      if (value <= 0) return item;
    }
    return items[items.length - 1];
  };

  for (let index = 0; index < amount; index += 1) {
    let candidate: PixelCandidate;
    if (source.distribution === "Uniform") {
      const bucketIndex = Math.min(buckets.length - 1, Math.floor((index + 0.5) * buckets.length / amount));
      const bucket = buckets[bucketIndex];
      candidate = bucket.length > 0 ? bucket[Math.floor(Math.random() * bucket.length)] : candidates[Math.floor(Math.random() * candidates.length)];
    } else if (source.distribution === "Weighted") {
      candidate = chooseWeighted(candidates);
    } else {
      candidate = candidates[Math.floor(Math.random() * candidates.length)];
    }
    const x = (candidate.x / raster.width) * source.viewBox.width + source.viewBox.x;
    const y = (candidate.y / raster.height) * source.viewBox.height + source.viewBox.y;
    const pixel = candidate.index;
    const color = `#${[data[pixel], data[pixel + 1], data[pixel + 2]].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    result.push(normalizedPoint(source, x, y, color));
  }
  return result;
}

export async function sampleSvgSource(source: SvgSource, count: number): Promise<SvgSamplePoint[]> {
  if (!Number.isFinite(count) || count < 1) throw new Error("Particle count must be greater than zero.");
  const raster = await rasterizeSvg(source);
  const points: SvgSamplePoint[] = [];
  if (source.mode === "Outline" || source.mode === "Combined") {
    const outlineCount = source.mode === "Combined" ? Math.ceil(count / 2) : count;
    points.push(...sampleOutline(source, outlineCount, raster));
  }
  if (source.mode === "Fill" || source.mode === "Combined") {
    const fillCount = source.mode === "Combined" ? Math.floor(count / 2) : count;
    if (fillCount > 0) points.push(...sampleFill(source, fillCount, raster));
  }
  if (points.length === 0) throw new Error("No particles could be sampled from this SVG.");
  return points;
}
