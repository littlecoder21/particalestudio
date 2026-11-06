import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  DESIGNER_LIBRARY_KEY,
  generateGeometry,
  geometryToSvg,
  newGeometryDocument,
  readDesignerLibrary,
  repeatGeometry,
  sampleGeometry,
  validateGeometryDocument,
  type GeometryContour,
  type GeometryDocument,
  type GeometryGenerator,
  type GeometryPattern,
  type GeometryPoint,
  type GeometrySamplingMode,
  type GeometryShape,
} from "../geometry/model";
import { parseSvgSource } from "../svgSource";
import "./designer.css";

type Tool = "Select" | "Pan" | "Pen" | "Freehand" | "Rectangle" | "Ellipse" | "Polygon" | "Star" | "Line";
const TOOLS: Tool[] = ["Select", "Pan", "Pen", "Freehand", "Rectangle", "Ellipse", "Polygon", "Star", "Line"];
const GENERATORS: GeometryGenerator[] = [
  "Rose", "Lissajous", "Superformula", "Hypotrochoid", "Epitrochoid", "Spiral",
  "Fibonacci spiral", "Koch snowflake", "Sierpinski triangle", "Fractal tree",
];
const PATTERNS: GeometryPattern[] = ["Radial", "Linear", "Grid", "Spiral", "Mirror"];

interface Drawing {
  pointerId: number;
  start: GeometryPoint;
  points: GeometryPoint[];
  shapeId?: string;
  nodeIndex?: number;
  base: GeometryDocument;
  startClientX: number;
  startClientY: number;
  baseViewBox: { x: number; y: number; width: number; height: number };
}

const pointOnEllipse = (cx: number, cy: number, rx: number, ry: number, angle: number): GeometryPoint => ({
  x: cx + Math.cos(angle) * rx,
  y: cy + Math.sin(angle) * ry,
});

function randomId(): string {
  return `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function shapeFromDrag(tool: Tool, start: GeometryPoint, end: GeometryPoint, points: GeometryPoint[], color: string): GeometryShape | null {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  const width = Math.max(right - left, 1);
  const height = Math.max(bottom - top, 1);
  let contour: GeometryContour;
  if (tool === "Freehand" || tool === "Pen") {
    if (points.length < 2) return null;
    contour = { points, closed: tool === "Freehand" && points.length > 3 };
  } else if (tool === "Rectangle") {
    contour = { points: [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }], closed: true };
  } else if (tool === "Ellipse") {
    contour = {
      points: Array.from({ length: 64 }, (_, index) =>
        pointOnEllipse((left + right) / 2, (top + bottom) / 2, width / 2, height / 2, Math.PI * 2 * index / 64)),
      closed: true,
    };
  } else if (tool === "Polygon" || tool === "Star") {
    const count = tool === "Star" ? 10 : 6;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const pointsOut = Array.from({ length: count }, (_, index) => {
      const radius = tool === "Star" && index % 2 === 1 ? 0.42 : 1;
      return pointOnEllipse(cx, cy, width / 2 * radius, height / 2 * radius, -Math.PI / 2 + Math.PI * 2 * index / count);
    });
    contour = { points: pointsOut, closed: true };
  } else {
    contour = { points: [start, end], closed: false };
  }
  return { id: randomId(), name: tool, contours: [contour], color, visible: true };
}

function shapePath(contour: GeometryContour): string {
  const [first, ...rest] = contour.points;
  if (!first) return "";
  return `M${first.x},${first.y} ${rest.map((point) => `L${point.x},${point.y}`).join(" ")}${contour.closed ? " Z" : ""}`;
}

function contourPathGroup(contours: GeometryContour[]): string {
  return contours.map(shapePath).filter(Boolean).join(" ");
}

export default function ShapeDesigner({
  onBack,
  onUseInParticles,
  onUseInShaders,
}: {
  onBack: () => void;
  onUseInParticles: (document: GeometryDocument) => void;
  onUseInShaders: (document: GeometryDocument) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drawingRef = useRef<Drawing | null>(null);
  const [library, setLibrary] = useState(readDesignerLibrary);
  const [document, setDocument] = useState<GeometryDocument>(library.documents[library.activeIndex]);
  const [tool, setTool] = useState<Tool>("Select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(null);
  const [color, setColor] = useState("#a78bfa");
  const [generator, setGenerator] = useState<GeometryGenerator>("Rose");
  const [radius, setRadius] = useState(210);
  const [petals, setPetals] = useState(5);
  const [complexity, setComplexity] = useState(3);
  const [rotation, setRotation] = useState(0);
  const [seed, setSeed] = useState(17);
  const [pattern, setPattern] = useState<GeometryPattern>("Radial");
  const [patternCount, setPatternCount] = useState(8);
  const [spacing, setSpacing] = useState(100);
  const [patternScale, setPatternScale] = useState(0.7);
  const [history, setHistory] = useState<GeometryDocument[]>([]);
  const [future, setFuture] = useState<GeometryDocument[]>([]);
  const [message, setMessage] = useState("");
  const [draftShape, setDraftShape] = useState<GeometryShape | null>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: document.width, height: document.height });
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const selectedShape = document.shapes.find((shape) => shape.id === selectedId) ?? null;
  const visibleShapes = useMemo(() => document.shapes.filter((shape) => shape.visible), [document]);

  useEffect(() => {
    const savedLibrary = { ...library, documents: library.documents.map((item, index) => index === library.activeIndex ? document : item) };
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(DESIGNER_LIBRARY_KEY, JSON.stringify(savedLibrary));
        window.dispatchEvent(new CustomEvent("particle-studio-designer-saved", { detail: document }));
      } catch (error) {
        console.error("Could not save designer geometry.", error);
        setMessage("Could not save design. Check available browser storage.");
      }
    }, 180);
    setLibrary(savedLibrary);
    return () => window.clearTimeout(timer);
  }, [document]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedId) removeShape(selectedId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const remember = (before: GeometryDocument) => {
    setHistory((items) => [...items.slice(-49), before]);
    setFuture([]);
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setFuture([document, ...future].slice(0, 50));
    setDocument(previous);
    setHistory(history.slice(0, -1));
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory([...history.slice(-49), document]);
    setDocument(next);
    setFuture(future.slice(1));
  };

  const coordinate = (event: ReactPointerEvent<SVGSVGElement>): GeometryPoint => {
    const matrix = svgRef.current?.getScreenCTM();
    if (matrix) {
      const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      return snapToGrid ? { x: Math.round(local.x / 25) * 25, y: Math.round(local.y / 25) * 25 } : { x: local.x, y: local.y };
    }
    return { x: 0, y: 0 };
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = coordinate(event);
    const target = event.target as SVGElement;
    const shapeId = target.dataset.shapeId;
    const nodeIndex = target.dataset.nodeIndex;
    svgRef.current?.setPointerCapture(event.pointerId);
    if (tool === "Select") {
      if (shapeId) {
        setSelectedId(shapeId);
        setSelectedNodeIndex(nodeIndex === undefined ? null : Number(nodeIndex));
        drawingRef.current = {
          pointerId: event.pointerId,
          start: point,
          points: [],
          shapeId,
          nodeIndex: nodeIndex === undefined ? undefined : Number(nodeIndex),
          base: document,
          startClientX: event.clientX,
          startClientY: event.clientY,
          baseViewBox: viewBox,
        };
      } else {
        setSelectedId(null);
        setSelectedNodeIndex(null);
      }
      return;
    }
    drawingRef.current = {
      pointerId: event.pointerId,
      start: point,
      points: [point],
      base: document,
      startClientX: event.clientX,
      startClientY: event.clientY,
      baseViewBox: viewBox,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drawing = drawingRef.current;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    const point = coordinate(event);
    if (tool === "Pan") {
      const bounds = svgRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const dx = (event.clientX - drawing.startClientX) * drawing.baseViewBox.width / bounds.width;
      const dy = (event.clientY - drawing.startClientY) * drawing.baseViewBox.height / bounds.height;
      setViewBox({ ...drawing.baseViewBox, x: drawing.baseViewBox.x - dx, y: drawing.baseViewBox.y - dy });
    } else if (tool === "Select" && drawing.shapeId) {
      const dx = point.x - drawing.start.x;
      const dy = point.y - drawing.start.y;
      let nodeCursor = 0;
      setDocument({
        ...drawing.base,
        shapes: drawing.base.shapes.map((shape) => shape.id !== drawing.shapeId ? shape : {
          ...shape,
          contours: shape.contours.map((contour) => ({
            ...contour,
            points: contour.points.map((node) => {
              const index = nodeCursor++;
              return drawing.nodeIndex === undefined
                ? { x: node.x + dx, y: node.y + dy }
                : index === drawing.nodeIndex ? point : node;
            }),
          })),
        }),
      });
    } else if (tool === "Freehand") {
      if (drawing.points.length < 2500) drawing.points.push(point);
      setDraftShape(shapeFromDrag(tool, drawing.start, point, [...drawing.points], color));
    } else if (tool !== "Select") {
      drawing.points = [drawing.start, point];
      setDraftShape(shapeFromDrag(tool, drawing.start, point, drawing.points, color));
    }
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drawing = drawingRef.current;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    if (tool === "Select" && drawing.shapeId) {
      if (drawing.start.x !== coordinate(event).x || drawing.start.y !== coordinate(event).y) remember(drawing.base);
    } else if (tool !== "Pan") {
      const shape = shapeFromDrag(tool, drawing.start, coordinate(event), drawing.points, color);
      if (shape) {
        if (document.shapes.length >= 100 ||
            documentPointCount(document) + documentPointCount({ ...document, shapes: [shape] }) > 10000) {
          setMessage("A design can contain up to 100 shapes and 10,000 points.");
          drawingRef.current = null;
          setDraftShape(null);
          return;
        }
        remember(drawing.base);
        setDocument((current) => ({ ...current, shapes: [...current.shapes, shape] }));
        setSelectedId(shape.id);
      }
    }
    drawingRef.current = null;
    setDraftShape(null);
  };

  const removeShape = (id: string) => {
    remember(document);
    setDocument((current) => ({ ...current, shapes: current.shapes.filter((shape) => shape.id !== id) }));
    setSelectedId(null);
    setSelectedNodeIndex(null);
  };

  const updateSelectedAnchor = (key: keyof GeometryPoint, value: number) => {
    if (!selectedShape || selectedNodeIndex === null || !Number.isFinite(value)) return;
    remember(document);
    let nodeCursor = 0;
    setDocument((current) => ({
      ...current,
      shapes: current.shapes.map((shape) => shape.id !== selectedShape.id ? shape : {
        ...shape,
        contours: shape.contours.map((contour) => ({
          ...contour,
          points: contour.points.map((point) => {
            const index = nodeCursor++;
            return index === selectedNodeIndex ? { ...point, [key]: value } : point;
          }),
        })),
      }),
    }));
  };

  const addAnchor = () => {
    if (!selectedShape) return;
    let best: { contourIndex: number; segmentIndex: number; length: number; point: GeometryPoint } | null = null;
    for (let contourIndex = 0; contourIndex < selectedShape.contours.length; contourIndex += 1) {
      const contour = selectedShape.contours[contourIndex];
      const segmentCount = contour.closed ? contour.points.length : contour.points.length - 1;
      for (let index = 0; index < segmentCount; index += 1) {
        const start = contour.points[index];
        const end = contour.points[(index + 1) % contour.points.length];
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        if (!best || length > best.length) best = {
          contourIndex,
          segmentIndex: index,
          length,
          point: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
        };
      }
    }
    if (!best) return;
    if (documentPointCount(document) >= 10000) {
      setMessage("A design can contain up to 10,000 points.");
      return;
    }
    remember(document);
    let flatIndex = 0;
    for (let index = 0; index < best.contourIndex; index += 1) flatIndex += selectedShape.contours[index].points.length;
    flatIndex += best.segmentIndex + 1;
    setDocument((current) => ({
      ...current,
      shapes: current.shapes.map((shape) => shape.id !== selectedShape.id ? shape : {
        ...shape,
        contours: shape.contours.map((contour, index) => {
          if (index !== best?.contourIndex) return contour;
          const points = [...contour.points];
          points.splice((best?.segmentIndex ?? 0) + 1, 0, best?.point ?? { x: 0, y: 0 });
          return { ...contour, points };
        }),
      }),
    }));
    setSelectedNodeIndex(flatIndex);
  };

  const removeAnchor = () => {
    if (!selectedShape || selectedNodeIndex === null) return;
    const flattened = selectedShape.contours.flatMap((contour, contourIndex) =>
      contour.points.map((point, pointIndex) => ({ contourIndex, pointIndex, point })));
    const selected = flattened[selectedNodeIndex];
    if (!selected) return;
    const contour = selectedShape.contours[selected.contourIndex];
    if (contour.points.length <= (contour.closed ? 3 : 2)) {
      setMessage("A contour needs at least two open or three closed anchors.");
      return;
    }
    remember(document);
    setDocument((current) => ({
      ...current,
      shapes: current.shapes.map((shape) => shape.id !== selectedShape.id ? shape : {
        ...shape,
        contours: shape.contours.map((item, index) => index === selected.contourIndex
          ? { ...item, points: item.points.filter((_, pointIndex) => pointIndex !== selected.pointIndex) }
          : item),
      }),
    }));
    setSelectedNodeIndex(null);
  };

  const duplicateShape = () => {
    if (!selectedShape) return;
    if (document.shapes.length >= 100) {
      setMessage("A design can contain up to 100 shapes.");
      return;
    }
    const duplicate: GeometryShape = {
      ...selectedShape,
      id: randomId(),
      name: `${selectedShape.name} copy`,
      contours: selectedShape.contours.map((contour) => ({
        ...contour,
        points: contour.points.map((point) => ({ x: point.x + 24, y: point.y + 24 })),
      })),
    };
    if (documentPointCount(document) + duplicate.contours.reduce((total, contour) => total + contour.points.length, 0) > 10000) {
      setMessage("Duplicating this shape would exceed the 10,000-point design limit.");
      return;
    }
    remember(document);
    setDocument((current) => ({ ...current, shapes: [...current.shapes, duplicate] }));
    setSelectedId(duplicate.id);
    setSelectedNodeIndex(null);
  };

  const moveShapeOrder = (id: string, direction: -1 | 1) => {
    const index = document.shapes.findIndex((shape) => shape.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= document.shapes.length) return;
    remember(document);
    setDocument((current) => {
      const shapes = [...current.shapes];
      [shapes[index], shapes[target]] = [shapes[target], shapes[index]];
      return { ...current, shapes };
    });
  };

  const addGenerated = () => {
    if (document.shapes.length >= 100) {
      setMessage("A design can contain up to 100 shapes.");
      return;
    }
    const contours = generateGeometry(generator, { radius, petals, complexity, rotation, seed }, document.width, document.height);
    const newPointCount = contours.reduce((total, contour) => total + contour.points.length, 0);
    if (documentPointCount(document) + newPointCount > 10000) {
      setMessage("This generator exceeded the 10,000-point design limit.");
      return;
    }
    const shape = { id: randomId(), name: generator, contours, color, visible: true };
    remember(document);
    setDocument((current) => ({ ...current, shapes: [...current.shapes, shape] }));
    setSelectedId(shape.id);
  };

  const applyPattern = () => {
    if (!selectedShape) {
      setMessage("Select a shape before applying a pattern.");
      return;
    }
    const copies = repeatGeometry(selectedShape, pattern, patternCount, spacing, rotation, patternScale, document.width, document.height);
    const copyPoints = copies.reduce((total, shape) => total + shape.contours.reduce((sum, contour) => sum + contour.points.length, 0), 0);
    const currentPoints = documentPointCount(document);
    if (document.shapes.length + copies.length > 100 || currentPoints + copyPoints > 10000) {
      setMessage("The pattern would exceed the 100-shape or 10,000-point design limit.");
      return;
    }
    remember(document);
    setDocument((current) => ({ ...current, shapes: [...current.shapes, ...copies] }));
    setMessage(`Added ${copies.length} ${pattern.toLowerCase()} instances.`);
  };

  const addDocument = () => {
    if (library.documents.length >= 100) {
      setMessage("The design library can contain up to 100 documents.");
      return;
    }
    const next = newGeometryDocument(`Design ${library.documents.length + 1}`);
    const documents = [...library.documents, next];
    const nextLibrary = { documents, activeIndex: documents.length - 1 };
    setLibrary(nextLibrary);
    setDocument(next);
    setViewBox({ x: 0, y: 0, width: next.width, height: next.height });
    setSelectedId(null);
    setSelectedNodeIndex(null);
    setHistory([]);
    setFuture([]);
  };

  const selectDocument = (index: number) => {
    const next = { ...library, documents: library.documents.map((item, itemIndex) => itemIndex === library.activeIndex ? document : item), activeIndex: index };
    setLibrary(next);
    setDocument(next.documents[index]);
    setViewBox({ x: 0, y: 0, width: next.documents[index].width, height: next.documents[index].height });
    setSelectedId(null);
    setSelectedNodeIndex(null);
    setHistory([]);
    setFuture([]);
  };

  const download = (name: string, data: string, mime: string) => {
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportSvg = () => download(`${document.name.replace(/[^\w-]+/g, "-")}.svg`, geometryToSvg(document), "image/svg+xml");
  const exportJson = () => download(`${document.name.replace(/[^\w-]+/g, "-")}.json`, JSON.stringify(document, null, 2), "application/json");
  const exportPoints = () => download("designer-points.json", JSON.stringify(sampleGeometry(document, 600), null, 2), "application/json");

  const importJson = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object") throw new Error("The selected file is not a geometry project.");
      const incoming = validateGeometryDocument(parsed);
      const next = { ...incoming, name: file.name.replace(/\.[^.]+$/, "") };
      remember(document);
      setDocument(next);
      setViewBox({ x: 0, y: 0, width: next.width, height: next.height });
      setSelectedId(null);
      setSelectedNodeIndex(null);
      setMessage("Geometry project imported.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import geometry project.");
    }
  };

  const importSvg = async (file: File) => {
    let host: HTMLDivElement | null = null;
    try {
      const source = parseSvgSource(await file.text(), file.name);
      host = window.document.createElement("div");
      Object.assign(host.style, { position: "fixed", left: "-10000px", top: "0", visibility: "hidden" });
      const importedSvg = new DOMParser().parseFromString(source.markup, "image/svg+xml").documentElement;
      importedSvg.setAttribute("width", String(source.viewBox.width));
      importedSvg.setAttribute("height", String(source.viewBox.height));
      importedSvg.setAttribute("viewBox", `${source.viewBox.x} ${source.viewBox.y} ${source.viewBox.width} ${source.viewBox.height}`);
      host.appendChild(window.document.importNode(importedSvg, true));
      window.document.body.appendChild(host);
      const root = host.querySelector("svg");
      if (!root) throw new Error("Could not open the imported SVG for geometry sampling.");
      const rootMatrix = root.getScreenCTM();
      if (!rootMatrix) throw new Error("Could not measure the imported SVG.");
      const rootInverse = rootMatrix.inverse();
      const scale = Math.min(document.width / source.viewBox.width, document.height / source.viewBox.height);
      const offsetX = (document.width - source.viewBox.width * scale) / 2;
      const offsetY = (document.height - source.viewBox.height * scale) / 2;
      const elements = Array.from(root.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon"))
        .filter((element): element is SVGGeometryElement =>
          element instanceof SVGGeometryElement && source.paths.some((path) => path.id === element.id));
      const contours: GeometryContour[] = [];
      const colors: string[] = [];
      for (const element of elements) {
        const length = element.getTotalLength();
        const matrix = element.getScreenCTM();
        if (length <= 0 || !matrix) continue;
        const transform = rootInverse.multiply(matrix);
        const count = Math.max(24, Math.min(600, Math.ceil(length / 3)));
        const points = Array.from({ length: count }, (_, index) => {
          const point = element.getPointAtLength((length * index) / count);
          const mapped = new DOMPoint(point.x, point.y).matrixTransform(transform);
          return {
            x: offsetX + (mapped.x - source.viewBox.x) * scale,
            y: offsetY + (mapped.y - source.viewBox.y) * scale,
          };
        });
        const isClosed = element.localName !== "line" && element.localName !== "polyline" &&
          (element.localName !== "path" || /z\s*$/i.test(element.getAttribute("d") ?? ""));
        contours.push({ points, closed: isClosed });
        const style = getComputedStyle(element);
        const fill = style.fill !== "none" ? style.fill : style.stroke;
        colors.push(/^#[\da-f]{6}$/i.test(fill) ? fill : color);
      }
      if (contours.length === 0) throw new Error("The SVG contains no measurable vector geometry.");
      if (document.shapes.length + contours.length > 100 ||
          documentPointCount(document) + contours.reduce((total, contour) => total + contour.points.length, 0) > 10000) {
        throw new Error("The SVG exceeds the designer limit of 100 paths or 10,000 sample points.");
      }
      const shapes: GeometryShape[] = contours.map((contour, index) => ({
        id: randomId(),
        name: source.paths[index]?.label ?? `Imported path ${index + 1}`,
        contours: [contour],
        color: colors[index],
        visible: true,
      }));
      remember(document);
      setDocument((current) => ({ ...current, shapes: [...current.shapes, ...shapes] }));
      setSelectedId(shapes[0]?.id ?? null);
      setSelectedNodeIndex(null);
      setMessage(`Imported ${shapes.length} vector contours from SVG.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import SVG.");
    } finally {
      host?.remove();
    }
  };

  return (
    <main className="studio designer-studio">
      <header className="designer-topbar">
        <button type="button" className="designer-back" onClick={onBack}>← Studios</button>
        <div><strong>Shape Designer</strong><small>Vector · Math · Patterns</small></div>
        <label className="designer-name-field"><span>Project</span><input aria-label="Design name" value={document.name} maxLength={100} onChange={(event) => setDocument((current) => ({ ...current, name: event.target.value }))} /></label>
        <label className="designer-document-select">
          Design
          <select value={library.activeIndex} onChange={(event) => selectDocument(Number(event.target.value))}>
            {library.documents.map((item, index) => <option key={`${item.name}-${index}`} value={index}>{item.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={addDocument}>＋ New</button>
        <button type="button" disabled={!history.length} onClick={undo}>Undo</button>
        <button type="button" disabled={!future.length} onClick={redo}>Redo</button>
        <button type="button" className="designer-primary" onClick={() => onUseInParticles(document)}>Use in Particles</button>
        <button type="button" className="designer-primary" onClick={() => onUseInShaders(document)}>Make Shader Shape</button>
      </header>
      <div className="designer-layout">
        <aside className="designer-sidebar">
          <section>
            <h2>Tools</h2>
            <div className="designer-tool-grid">
              {TOOLS.map((entry) => <button key={entry} type="button" className={tool === entry ? "active" : ""} onClick={() => setTool(entry)}>{entry}</button>)}
            </div>
            <label className="designer-field">Stroke / fill <input type="color" value={color} onChange={(event) => {
              const nextColor = event.target.value;
              setColor(nextColor);
              if (selectedShape) {
                remember(document);
                setDocument((current) => ({ ...current, shapes: current.shapes.map((shape) => shape.id === selectedShape.id ? { ...shape, color: nextColor } : shape) }));
              }
            }} /></label>
            {selectedShape && <>
              <button type="button" onClick={duplicateShape}>Duplicate selected shape</button>
              <button type="button" className="designer-danger" onClick={() => removeShape(selectedShape.id)}>Delete selected shape</button>
              <button type="button" onClick={addAnchor}>Add anchor on longest segment</button>
              {selectedNodeIndex !== null && <button type="button" className="designer-danger" onClick={removeAnchor}>Delete selected anchor</button>}
            </>}
          </section>
          <section>
            <h2>Layers <span>{document.shapes.length}</span></h2>
            <div className="designer-layer-list">
              {document.shapes.map((shape) => (
                <div className={`designer-layer ${selectedId === shape.id ? "selected" : ""}`} key={shape.id}>
                  <button type="button" onClick={() => { setSelectedId(shape.id); setSelectedNodeIndex(null); }}><i style={{ background: shape.color }} />{shape.name}</button>
                  <button type="button" aria-label={`Move ${shape.name} up`} onClick={() => moveShapeOrder(shape.id, 1)}>↑</button>
                  <button type="button" aria-label={`Move ${shape.name} down`} onClick={() => moveShapeOrder(shape.id, -1)}>↓</button>
                  <button type="button" aria-label={`${shape.visible ? "Hide" : "Show"} ${shape.name}`} onClick={() => {
                    remember(document);
                    setDocument((current) => ({ ...current, shapes: current.shapes.map((item) => item.id === shape.id ? { ...item, visible: !item.visible } : item) }));
                  }}>{shape.visible ? "◉" : "○"}</button>
                </div>
              ))}
              {document.shapes.length === 0 && <p className="designer-hint">Draw or generate geometry to start.</p>}
            </div>
          </section>
          <section className="designer-exports">
            <h2>Import & export</h2>
            <label className="designer-file">Import SVG contour<input type="file" accept=".svg,image/svg+xml" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSvg(file); event.currentTarget.value = ""; }} /></label>
            <label className="designer-file">Import JSON project<input type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importJson(file); event.currentTarget.value = ""; }} /></label>
            <button type="button" onClick={exportSvg}>Export SVG</button>
            <button type="button" onClick={exportJson}>Export JSON</button>
            <button type="button" onClick={exportPoints}>Export particle points</button>
          </section>
        </aside>
        <section className="designer-canvas-column">
          <div className="designer-canvas-head">
            <span>Canvas · {document.width} × {document.height}</span>
            <div className="designer-canvas-actions">
              <button type="button" onClick={() => setViewBox((current) => ({ ...current, width: current.width * 1.2, height: current.height * 1.2, x: current.x - current.width * 0.1, y: current.y - current.height * 0.1 }))}>−</button>
              <button type="button" onClick={() => setViewBox((current) => ({ ...current, width: current.width * 0.8, height: current.height * 0.8, x: current.x + current.width * 0.1, y: current.y + current.height * 0.1 }))}>+</button>
              <button type="button" onClick={() => setViewBox({ x: 0, y: 0, width: document.width, height: document.height })}>Fit</button>
              <button type="button" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}>Grid</button>
              <button type="button" aria-pressed={snapToGrid} onClick={() => setSnapToGrid((value) => !value)}>Snap</button>
            </div>
          </div>
          <svg
            ref={svgRef}
            className="designer-canvas"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { drawingRef.current = null; setDraftShape(null); }}
          >
            <defs><pattern id="designer-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#262b3a" strokeWidth="1" /></pattern></defs>
            <rect width={document.width} height={document.height} fill="#0b0d14" />
            {showGrid && <rect width={document.width} height={document.height} fill="url(#designer-grid)" />}
            {visibleShapes.map((shape) => (
              <g key={shape.id} data-shape-id={shape.id}>
                {shape.contours.some((contour) => contour.closed) && <path data-shape-id={shape.id} d={contourPathGroup(shape.contours.filter((contour) => contour.closed))} fill={shape.color} fillOpacity="0.13" fillRule="evenodd" stroke={shape.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
                {shape.contours.some((contour) => !contour.closed) && <path data-shape-id={shape.id} d={contourPathGroup(shape.contours.filter((contour) => !contour.closed))} fill="none" stroke={shape.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
                {selectedId === shape.id && contourPointList(shape).map((point, index) => (
                  <circle key={index} data-shape-id={shape.id} data-node-index={index} cx={point.x} cy={point.y} r="5" className="designer-node" />
                ))}
              </g>
            ))}
            {draftShape?.contours.map((contour, index) => <path key={index} d={shapePath(contour)} fill={contour.closed ? color : "none"} fillOpacity={contour.closed ? 0.13 : 0} stroke={color} strokeWidth="2" strokeDasharray="5 4" />)}
          </svg>
          <div className="designer-canvas-foot">{message || "Changes autosave on this device. Drag nodes to reshape selected paths."}</div>
        </section>
        <aside className="designer-properties">
          <section>
            <h2>Mathematical geometry</h2>
            <label>Generator<select value={generator} onChange={(event) => setGenerator(event.target.value as GeometryGenerator)}>{GENERATORS.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
            <label>Radius <input type="range" min="40" max="320" value={radius} onChange={(event) => setRadius(Number(event.target.value))} /><span>{radius}</span></label>
            <label>Petals / frequency <input type="range" min="1" max="16" value={petals} onChange={(event) => setPetals(Number(event.target.value))} /><span>{petals}</span></label>
            <label>Complexity <input type="range" min="1" max="7" value={complexity} onChange={(event) => setComplexity(Number(event.target.value))} /><span>{complexity}</span></label>
            <label>Rotation <input type="range" min="-180" max="180" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} /><span>{rotation}°</span></label>
            {(generator === "Hypotrochoid" || generator === "Epitrochoid" || generator === "Fractal tree") &&
              <label>Seed <input type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label>}
            <button type="button" className="designer-action" onClick={addGenerated}>Generate {generator}</button>
          </section>
          <section>
            <h2>Pattern designer</h2>
            <label>Pattern<select value={pattern} onChange={(event) => setPattern(event.target.value as GeometryPattern)}>{PATTERNS.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
            <label>Instances<input type="range" min="1" max="48" value={patternCount} onChange={(event) => setPatternCount(Number(event.target.value))} /><span>{patternCount}</span></label>
            <label>Spacing<input type="range" min="20" max="240" value={spacing} onChange={(event) => setSpacing(Number(event.target.value))} /><span>{spacing}</span></label>
            <label>Scale<input type="range" min="0.2" max="1.5" step="0.05" value={patternScale} onChange={(event) => setPatternScale(Number(event.target.value))} /><span>{patternScale.toFixed(2)}</span></label>
            <button type="button" className="designer-action" disabled={!selectedShape} onClick={applyPattern}>Repeat selected shape</button>
            {!selectedShape && <p className="designer-hint">Select a shape before applying the pattern.</p>}
            {selectedShape && selectedNodeIndex !== null && (() => {
              const point = contourPointList(selectedShape)[selectedNodeIndex];
              return point ? <div className="designer-coordinates">
                <h3>Selected anchor</h3>
                <label>X <input type="number" value={Math.round(point.x * 100) / 100} onChange={(event) => updateSelectedAnchor("x", Number(event.target.value))} /></label>
                <label>Y <input type="number" value={Math.round(point.y * 100) / 100} onChange={(event) => updateSelectedAnchor("y", Number(event.target.value))} /></label>
              </div> : null;
            })()}
          </section>
          <section>
            <h2>Geometry sampling</h2>
            <label>Distribution<select value={document.samplingMode ?? "Fill"} onChange={(event) => {
              const mode = event.target.value as GeometrySamplingMode;
              remember(document);
              setDocument((current) => ({ ...current, samplingMode: mode }));
            }}>
              <option value="Outline">Outline · even spacing</option>
              <option value="Fill">Filled area · seeded random</option>
              <option value="Combined">Outline + fill</option>
            </select></label>
            <p className="designer-hint">Particle distribution supports filled areas, outlines, and combined sampling. Contours use even-odd fill so nested contours can represent holes.</p>
            <button type="button" onClick={() => setMessage(`${sampleGeometry(document, 600).length} sample points ready for particle use.`)}>Preview 600 samples</button>
          </section>
        </aside>
      </div>
    </main>
  );
}

function contourPointList(shape: GeometryShape): GeometryPoint[] {
  return shape.contours.flatMap((contour) => contour.points);
}

function documentPointCount(document: GeometryDocument): number {
  return document.shapes.reduce((total, shape) =>
    total + shape.contours.reduce((shapeTotal, contour) => shapeTotal + contour.points.length, 0), 0);
}
