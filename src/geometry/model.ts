export interface GeometryPoint {
  x: number;
  y: number;
}

export interface GeometryContour {
  points: GeometryPoint[];
  closed: boolean;
  hole?: boolean;
}

export interface GeometryShape {
  id: string;
  name: string;
  contours: GeometryContour[];
  color: string;
  visible: boolean;
}

export interface GeometryDocument {
  version: 1;
  name: string;
  width: number;
  height: number;
  shapes: GeometryShape[];
  samplingMode?: GeometrySamplingMode;
}

export type GeometrySamplingMode = "Outline" | "Fill" | "Combined";
export interface DesignerLibrary {
  documents: GeometryDocument[];
  activeIndex: number;
}

export type GeometryGenerator =
  | "Rose"
  | "Lissajous"
  | "Superformula"
  | "Hypotrochoid"
  | "Epitrochoid"
  | "Spiral"
  | "Fibonacci spiral"
  | "Koch snowflake"
  | "Sierpinski triangle"
  | "Fractal tree";

export type GeometryPattern = "Radial" | "Linear" | "Grid" | "Spiral" | "Mirror";

export const DESIGNER_LIBRARY_KEY = "particle-studio-designer-library";

const TAU = Math.PI * 2;
const MAX_SHAPES = 100;
const MAX_CONTOURS = 100;
const MAX_POINTS = 10000;

export function newGeometryDocument(name = "Untitled design"): GeometryDocument {
  return { version: 1, name, width: 1000, height: 700, shapes: [], samplingMode: "Fill" };
}

export function readDesignerLibrary(): DesignerLibrary {
  try {
    const raw = localStorage.getItem(DESIGNER_LIBRARY_KEY);
    if (!raw) return { documents: [newGeometryDocument()], activeIndex: 0 };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") throw new Error("Saved designer data is invalid.");
    const candidate = value as Record<string, unknown>;
    if (!Array.isArray(candidate.documents) || candidate.documents.length > 100) {
      throw new Error("Saved designer documents are missing or exceed the library limit.");
    }
    const documents = candidate.documents.map(validateGeometryDocument);
    if (documents.length === 0) documents.push(newGeometryDocument());
    const activeIndex = typeof candidate.activeIndex === "number" &&
      Number.isInteger(candidate.activeIndex) && candidate.activeIndex >= 0 && candidate.activeIndex < documents.length
      ? candidate.activeIndex
      : 0;
    return { documents, activeIndex };
  } catch (error) {
    console.error("Could not load saved designer geometry.", error);
    return { documents: [newGeometryDocument()], activeIndex: 0 };
  }
}

export function validateGeometryDocument(value: unknown): GeometryDocument {
  if (!value || typeof value !== "object") throw new Error("Geometry document is invalid.");
  const document = value as Record<string, unknown>;
  if (document.version !== 1 || typeof document.name !== "string" ||
      typeof document.width !== "number" || !Number.isFinite(document.width) || document.width <= 0 ||
      typeof document.height !== "number" || !Number.isFinite(document.height) || document.height <= 0 ||
      !Array.isArray(document.shapes) || document.shapes.length > MAX_SHAPES) {
    throw new Error("Geometry document has an unsupported or invalid format.");
  }
  let pointCount = 0;
  const shapes = document.shapes.map((rawShape): GeometryShape => {
    if (!rawShape || typeof rawShape !== "object") throw new Error("A geometry shape is invalid.");
    const shape = rawShape as Record<string, unknown>;
    if (typeof shape.id !== "string" || typeof shape.name !== "string" ||
        typeof shape.color !== "string" || !/^#[\da-f]{6}$/i.test(shape.color) ||
        typeof shape.visible !== "boolean" || !Array.isArray(shape.contours) ||
        shape.contours.length > MAX_CONTOURS) {
      throw new Error("A geometry shape is incomplete.");
    }
    const contours = shape.contours.map((rawContour): GeometryContour => {
      if (!rawContour || typeof rawContour !== "object") throw new Error("A geometry contour is invalid.");
      const contour = rawContour as Record<string, unknown>;
      if (typeof contour.closed !== "boolean" || !Array.isArray(contour.points)) {
        throw new Error("A geometry contour is incomplete.");
      }
      const points = contour.points.map((rawPoint): GeometryPoint => {
        if (!rawPoint || typeof rawPoint !== "object") throw new Error("A geometry point is invalid.");
        const point = rawPoint as Record<string, unknown>;
        if (typeof point.x !== "number" || !Number.isFinite(point.x) ||
            typeof point.y !== "number" || !Number.isFinite(point.y)) {
          throw new Error("Geometry coordinates must be finite numbers.");
        }
        pointCount += 1;
        if (pointCount > MAX_POINTS) throw new Error("This design contains too many geometry points.");
        return { x: point.x, y: point.y };
      });
      return { points, closed: contour.closed, hole: contour.hole === true };
    });
    return {
      id: shape.id,
      name: shape.name,
      color: shape.color,
      visible: shape.visible,
      contours,
    };
  });
  return {
    version: 1,
    name: document.name.slice(0, 100),
    width: Math.min(document.width, 10000),
    height: Math.min(document.height, 10000),
    shapes,
    samplingMode: document.samplingMode === "Outline" || document.samplingMode === "Combined"
      ? document.samplingMode
      : "Fill",
  };
}

function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function centered(point: GeometryPoint, width: number, height: number): GeometryPoint {
  return { x: width / 2 + point.x, y: height / 2 + point.y };
}

export function generateGeometry(
  generator: GeometryGenerator,
  options: { radius: number; petals: number; complexity: number; rotation: number; seed: number },
  width = 1000,
  height = 700,
): GeometryContour[] {
  const radius = Math.max(4, options.radius);
  const complexity = Math.max(1, Math.min(7, Math.floor(options.complexity)));
  const rotation = options.rotation * Math.PI / 180;
  const points: GeometryPoint[] = [];
  const addPolar = (angle: number, r: number) => points.push(centered({
    x: Math.cos(angle + rotation) * r,
    y: Math.sin(angle + rotation) * r,
  }, width, height));
  const samples = Math.max(120, Math.min(2400, complexity * 240));

  if (generator === "Rose") {
    const petals = Math.max(1, Math.min(24, Math.round(options.petals)));
    for (let i = 0; i <= samples; i += 1) {
      const angle = TAU * i / samples;
      addPolar(angle, radius * Math.cos(petals * angle));
    }
  } else if (generator === "Lissajous") {
    const petals = Math.max(1, Math.min(12, Math.round(options.petals)));
    for (let i = 0; i <= samples; i += 1) {
      const angle = TAU * i / samples;
      points.push(centered({
        x: radius * Math.sin(petals * angle + rotation),
        y: radius * Math.sin((petals + 1) * angle),
      }, width, height));
    }
  } else if (generator === "Superformula") {
    const petals = Math.max(1, Math.min(24, Math.round(options.petals)));
    const m = petals;
    for (let i = 0; i <= samples; i += 1) {
      const angle = TAU * i / samples;
      const a = 1;
      const b = 1;
      const n1 = 0.3 + complexity * 0.35;
      const n2 = n1;
      const n3 = n1;
      const radiusAtAngle = radius * Math.pow(
        Math.pow(Math.abs(Math.cos(m * angle / 4) / a), n2) +
        Math.pow(Math.abs(Math.sin(m * angle / 4) / b), n3),
        -1 / n1,
      );
      addPolar(angle, Number.isFinite(radiusAtAngle) ? radiusAtAngle : 0);
    }
  } else if (generator === "Hypotrochoid" || generator === "Epitrochoid") {
    const rand = seededRandom(options.seed);
    const r = radius * (generator === "Hypotrochoid" ? 0.62 : 0.38);
    const d = radius * (0.25 + rand() * 0.5);
    const R = radius - r;
    const end = TAU * complexity * 4;
    for (let i = 0; i <= samples; i += 1) {
      const t = end * i / samples + rotation;
      const ratio = R / r;
      const sign = generator === "Hypotrochoid" ? -1 : 1;
      points.push(centered({
        x: (R + sign * r) * Math.cos(t) + d * Math.cos(ratio * t),
        y: (R + sign * r) * Math.sin(t) - d * Math.sin(ratio * t),
      }, width, height));
    }
  } else if (generator === "Spiral" || generator === "Fibonacci spiral") {
    const turns = complexity + 1;
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      const angle = TAU * turns * t + rotation;
      const r = generator === "Spiral"
        ? Math.max(1, radius * t)
        : Math.max(1, radius * Math.pow(1.618, 2 * t - 2));
      points.push(centered({ x: Math.cos(angle) * r, y: Math.sin(angle) * r }, width, height));
    }
  } else if (generator === "Koch snowflake") {
    let vertices: GeometryPoint[] = [
      { x: width / 2 - radius, y: height / 2 + radius * 0.58 },
      { x: width / 2 + radius, y: height / 2 + radius * 0.58 },
      { x: width / 2, y: height / 2 - radius * 1.15 },
    ];
    for (let depth = 0; depth < Math.min(complexity, 5); depth += 1) {
      const next: GeometryPoint[] = [];
      for (let i = 0; i < vertices.length; i += 1) {
        const a = vertices[i];
        const b = vertices[(i + 1) % vertices.length];
        const dx = (b.x - a.x) / 3;
        const dy = (b.y - a.y) / 3;
        const p = { x: a.x + dx, y: a.y + dy };
        const q = { x: a.x + dx * 2, y: a.y + dy * 2 };
        next.push(a, p, {
          x: p.x + (dx - Math.sqrt(3) * dy) / 2,
          y: p.y + (dy + Math.sqrt(3) * dx) / 2,
        }, q);
      }
      vertices = next;
    }
    return [{ points: vertices, closed: true }];
  } else if (generator === "Sierpinski triangle") {
    const vertices = [
      { x: width / 2, y: height / 2 - radius },
      { x: width / 2 - radius * 0.87, y: height / 2 + radius * 0.5 },
      { x: width / 2 + radius * 0.87, y: height / 2 + radius * 0.5 },
    ];
    const triangles: GeometryPoint[][] = [vertices];
    for (let depth = 0; depth < complexity; depth += 1) {
      const next: GeometryPoint[][] = [];
      for (const triangle of triangles) {
        const [a, b, c] = triangle;
        const midpoint = (p: GeometryPoint, q: GeometryPoint) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
        const ab = midpoint(a, b);
        const bc = midpoint(b, c);
        const ca = midpoint(c, a);
        next.push([a, ab, ca], [ab, b, bc], [ca, bc, c]);
      }
      triangles.splice(0, triangles.length, ...next.slice(0, 600));
    }
    return triangles.map((triangle) => ({ points: triangle, closed: true }));
  } else {
    const rand = seededRandom(options.seed);
    const branches: GeometryContour[] = [];
    const branch = (x: number, y: number, angle: number, length: number, depth: number) => {
      if (depth <= 0 || branches.length > 2000) return;
      const next = { x: x + Math.cos(angle) * length, y: y + Math.sin(angle) * length };
      branches.push({ points: [{ x, y }, next], closed: false });
      const spread = 0.28 + rand() * 0.24;
      branch(next.x, next.y, angle - spread, length * 0.72, depth - 1);
      branch(next.x, next.y, angle + spread, length * 0.72, depth - 1);
    };
    branch(width / 2, height * 0.88, -Math.PI / 2 + rotation, radius * 0.52, complexity + 1);
    return branches;
  }
  return [{ points, closed: generator !== "Spiral" && generator !== "Fibonacci spiral" }];
}

export function repeatGeometry(
  shape: GeometryShape,
  pattern: GeometryPattern,
  count: number,
  spacing: number,
  rotation: number,
  scale: number,
  width = 1000,
  height = 700,
): GeometryShape[] {
  const copies = Math.max(1, Math.min(100, Math.floor(count)));
  const distance = Math.max(1, spacing);
  const output: GeometryShape[] = [];
  for (let index = 0; index < copies; index += 1) {
    let dx = 0;
    let dy = 0;
    let angle = rotation * Math.PI / 180;
    if (pattern === "Radial") {
      angle += TAU * index / copies;
      dx = Math.cos(TAU * index / copies) * distance;
      dy = Math.sin(TAU * index / copies) * distance;
    } else if (pattern === "Linear") {
      dx = (index - (copies - 1) / 2) * distance;
    } else if (pattern === "Grid") {
      const columns = Math.max(1, Math.ceil(Math.sqrt(copies)));
      dx = (index % columns - (columns - 1) / 2) * distance;
      dy = (Math.floor(index / columns) - (Math.ceil(copies / columns) - 1) / 2) * distance;
    } else if (pattern === "Spiral") {
      angle += index * 0.42;
      const r = distance * Math.sqrt(index);
      dx = Math.cos(angle) * r;
      dy = Math.sin(angle) * r;
    } else if (pattern === "Mirror") {
      angle += TAU * Math.floor(index / 2) / Math.max(1, Math.ceil(copies / 2));
    }
    const center = { x: width / 2, y: height / 2 };
    const factor = scale * Math.pow(0.94, index);
    const contours = shape.contours.map((contour) => ({
      ...contour,
      points: contour.points.map((point) => {
        const reflection = pattern === "Mirror" && index % 2 === 1 ? -1 : 1;
        const x = (point.x - center.x) * factor * reflection;
        const y = (point.y - center.y) * factor;
        return {
          x: center.x + dx + x * Math.cos(angle) - y * Math.sin(angle),
          y: center.y + dy + x * Math.sin(angle) + y * Math.cos(angle),
        };
      }),
    }));
    output.push({
      ...shape,
      id: `${shape.id}-repeat-${index}`,
      name: `${shape.name} ${index + 1}`,
      contours,
    });
  }
  return output;
}

export function geometryToSvg(document: GeometryDocument): string {
  const contents = document.shapes.filter((shape) => shape.visible).map((shape) => {
    const closed = shape.contours.filter((contour) => contour.closed && contour.points.length > 2)
      .map(contourPath).join(" ");
    const open = shape.contours.filter((contour) => !contour.closed && contour.points.length > 1)
      .map(contourPath).join(" ");
    return [
      closed ? `<path d="${closed}" fill="${shape.color}" fill-rule="evenodd" stroke="${shape.color}" stroke-width="2"/>` : "",
      open ? `<path d="${open}" fill="none" stroke="${shape.color}" stroke-width="2"/>` : "",
    ].join("");
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${document.width} ${document.height}">${contents}</svg>`;
}

function contourPath(contour: GeometryContour): string {
  const [first, ...rest] = contour.points;
  if (!first) return "";
  const commands = [`M${first.x} ${first.y}`, ...rest.map((point) => `L${point.x} ${point.y}`)];
  if (contour.closed) commands.push("Z");
  return commands.join(" ");
}

function pointInContour(point: GeometryPoint, contour: GeometryContour): boolean {
  if (!contour.closed || contour.points.length < 3) return false;
  let inside = false;
  const { points } = contour;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function sampleGeometry(
  document: GeometryDocument,
  count: number,
  mode: GeometrySamplingMode = document.samplingMode ?? "Fill",
  seed = 17,
): Array<{ x: number; y: number; color: string }> {
  const random = seededRandom(seed);
  const amount = Math.max(1, Math.min(1800, Math.floor(count)));
  const shapes = document.shapes.filter((shape) => shape.visible && shape.contours.some((contour) => contour.points.length > 1));
  const contours = shapes.flatMap((shape) => shape.contours
    .filter((contour) => contour.points.length > 1)
    .map((contour) => ({ shape, contour })));
  if (contours.length === 0) return [];
  const size = Math.max(document.width, document.height);
  const normalize = (point: GeometryPoint, color: string) => ({
    x: (point.x - document.width / 2) / size,
    y: (point.y - document.height / 2) / size,
    color,
  });
  const output: Array<{ x: number; y: number; color: string }> = [];
  if (mode === "Outline" || mode === "Combined") {
    const target = mode === "Combined" ? Math.ceil(amount / 2) : amount;
    const segments = contours.flatMap(({ shape, contour }) => contour.points.slice(1).map((point, index) => {
      const start = contour.points[index];
      return { start, end: point, shape, length: Math.hypot(point.x - start.x, point.y - start.y) };
    }).concat(contour.closed ? [{
      start: contour.points[contour.points.length - 1],
      end: contour.points[0],
      shape,
      length: Math.hypot(contour.points[0].x - contour.points[contour.points.length - 1].x, contour.points[0].y - contour.points[contour.points.length - 1].y),
    }] : []));
    const total = segments.reduce((sum, segment) => sum + segment.length, 0);
    for (let index = 0; index < target; index += 1) {
      let distance = (index + 0.5) * total / target;
      let segment = segments[segments.length - 1];
      for (const candidate of segments) {
        if (distance <= candidate.length) {
          segment = candidate;
          break;
        }
        distance -= candidate.length;
      }
      if (!segment || segment.length === 0) continue;
      const t = distance / segment.length;
      output.push(normalize({
        x: segment.start.x + (segment.end.x - segment.start.x) * t,
        y: segment.start.y + (segment.end.y - segment.start.y) * t,
      }, segment.shape.color));
    }
  }
  if (mode === "Fill" || mode === "Combined") {
    const closed = contours.filter(({ contour }) => contour.closed);
    if (closed.length > 0) {
      const minX = Math.min(...closed.flatMap(({ contour }) => contour.points.map((point) => point.x)));
      const maxX = Math.max(...closed.flatMap(({ contour }) => contour.points.map((point) => point.x)));
      const minY = Math.min(...closed.flatMap(({ contour }) => contour.points.map((point) => point.y)));
      const maxY = Math.max(...closed.flatMap(({ contour }) => contour.points.map((point) => point.y)));
      const limit = mode === "Combined" ? amount - output.length : amount;
      const maxAttempts = limit * 80;
      for (let attempt = 0; attempt < maxAttempts && output.length < amount; attempt += 1) {
        const point = { x: minX + random() * (maxX - minX), y: minY + random() * (maxY - minY) };
        const owner = shapes.find((shape) => {
          const ownContours = closed.filter((entry) => entry.shape.id === shape.id);
          return ownContours.filter(({ contour }) => pointInContour(point, contour)).length % 2 === 1;
        });
        if (owner) output.push(normalize(point, owner.color));
      }
    }
  }
  if (output.length === 0) {
    for (let index = 0; index < amount; index += 1) {
      const { shape, contour } = contours[index % contours.length];
      const point = contour.points[Math.floor(random() * contour.points.length)];
      output.push(normalize(point, shape.color));
    }
  }
  while (output.length < amount) output.push(output[output.length % Math.max(1, output.length)]);
  return output.slice(0, amount);
}
