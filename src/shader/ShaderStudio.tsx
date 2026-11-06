import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import "./panels.css";
import {
  ChoiceGroup,
  ColorField,
  RangeControl,
  SectionHeading,
  SoftTip,
} from "./controls";
import ExportSheet from "./ExportSheet";
import { GENERATORS, GENERATOR_MAP, defaultKnobs } from "./generators";
import GeneratorKnobs from "./GeneratorKnobs";
import GradientBar from "./GradientBar";
import {
  IconChevronDown,
  IconChevronUp,
  IconExport,
  IconFullscreen,
  IconPause,
  IconPlay,
  IconReset,
  IconSave,
} from "./icons";
import { libraryLayers, type LibraryItem } from "./library";
import LibraryPanel, { type InsertAt } from "./LibraryPanel";
import { applyLook } from "./looks";
import { importMaskFile, maskPixelsFor, sourceField, type MaskPixels } from "./mask";
import MaskPanel from "./MaskPanel";
import { PALETTE_LIBRARY, SHADER_PRESETS } from "./presets";
import { DEFAULT_PROJECT, cloneProject, normalizeProject, randomPalette, randomProject } from "./project";
import { ShaderRenderer, type RendererStats } from "./renderer";
import { newLayer } from "./stack";
import StackPanel from "./StackPanel";
import { evenPositions } from "./stops";
import TextPanel from "./TextPanel";
import { presetThumbKey, thumbStore } from "./thumbs";
import TouchPanel from "./TouchPanel";
import { useThumb } from "./useThumb";
import {
  GENERATOR_CATEGORIES,
  MAX_LAYERS,
  MAX_PALETTE,
  MIN_PALETTE,
  RANGES,
  type GeneratorCategory,
  type GeneratorId,
  type Knobs,
  type RangeKey,
  type ShaderLayer,
  type ShaderMask,
  type ShaderPreset,
  type ShaderProject,
} from "./types";
import type { GeometryDocument } from "../geometry/model";

/* ───────────────────────── constants ───────────────────────── */

type SectionId = "presets" | "field" | "stack" | "elements" | "text" | "mask" | "motion" | "color" | "surface" | "effects" | "touch";

const SECTIONS: Array<{ id: SectionId; icon: string; label: string; hint: string; title: string; description: string }> = [
  { id: "presets", icon: "✦", label: "Presets", hint: `${SHADER_PRESETS.length} looks`, title: "Ready-made looks", description: "Start from a finished shader, then make it yours." },
  { id: "field", icon: "◎", label: "Field", hint: "Generator", title: "Base generator", description: "Pick the procedural field and shape it with four knobs." },
  { id: "stack", icon: "▤", label: "Stack", hint: "Layers", title: "Layer stack", description: "Order, blend and mix as many layers as you like." },
  { id: "elements", icon: "❖", label: "Elements", hint: "Library", title: "Element library", description: "Backgrounds, gradients, patterns, light and texture — tap to add." },
  { id: "text", icon: "T", label: "Text", hint: "Typography", title: "Text shader", description: "Create interactive, animated typography for hero sections and website components." },
  { id: "mask", icon: "◩", label: "Shape", hint: "Image mask", title: "Image mask", description: "Turn a PNG, SVG or built-in silhouette into a living shader shape." },
  { id: "motion", icon: "↻", label: "Motion", hint: "Time & warp", title: "Time & warp", description: "Speed, rotation, symmetry and domain distortion." },
  { id: "color", icon: "◐", label: "Color", hint: "Gradient", title: "Palette & grade", description: "Place colour stops on the gradient bar and grade the final image." },
  { id: "surface", icon: "◈", label: "Surface", hint: "Light", title: "Light & relief", description: "Turn the field into a lit, glossy surface." },
  { id: "effects", icon: "✧", label: "Effects", hint: "Post FX", title: "Post effects", description: "Lens, film and retro finishing touches." },
  { id: "touch", icon: "⌖", label: "Touch", hint: "25 modes", title: "Pointer & touch", description: "Pick one of 25 pointer modes or build your own." },
];

const CATEGORY_ICON: Record<GeneratorCategory, string> = {
  Fluid: "≈", Cosmic: "✺", Light: "☀", Pattern: "▦", Gradient: "◈",
  Noise: "∿", Vector: "↯", Geometry: "△", Math: "∑", Organic: "❦",
};

const STORAGE_KEY = "particle-studio-shader-project";
const CUSTOM_PRESETS_KEY = "particle-studio-custom-shader-presets";

/* Mobile split view: the control dock takes a share of the workspace, the preview gets the rest. */
const DOCK_KEY = "particle-studio-shader-dock";
const DOCK_DEFAULT = 0.5;
const DOCK_MIN = 0.28;
const DOCK_MAX = 0.8;
/** Height of the dock's drag bar in px — keep in sync with --bar-h in shader.css. */
const BAR_H = 40;
/** Releasing the drag below this height (px) folds the dock away. */
const CLOSE_BELOW = 110;

const MOBILE_QUERY = "(max-width: 720px)";

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function loadDock(): number {
  try {
    const value = Number(localStorage.getItem(DOCK_KEY));
    return value >= DOCK_MIN && value <= DOCK_MAX ? value : DOCK_DEFAULT;
  } catch {
    return DOCK_DEFAULT;
  }
}

function subscribeMobile(notify: () => void): () => void {
  if (typeof matchMedia !== "function") return () => undefined;
  const query = matchMedia(MOBILE_QUERY);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

const getMobile = (): boolean => typeof matchMedia === "function" && matchMedia(MOBILE_QUERY).matches;

function useMobile(): boolean {
  return useSyncExternalStore(subscribeMobile, getMobile, () => false);
}

interface SavedShader {
  project: ShaderProject;
  preset: string;
}

function loadSaved(): SavedShader | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { project?: unknown; preset?: unknown };
    return { project: normalizeProject(parsed.project), preset: typeof parsed.preset === "string" ? parsed.preset : "" };
  } catch {
    return null;
  }
}

interface CustomPresetStore {
  presets: ShaderPreset[];
  error: string | null;
}

function loadCustomPresets(): CustomPresetStore {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return { presets: [], error: null };
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("The saved presets are not a list.");
    const presets = parsed.map((value): ShaderPreset => {
      if (!value || typeof value !== "object") throw new Error("A saved preset is invalid.");
      const preset = value as Record<string, unknown>;
      if (typeof preset.name !== "string" || !preset.name.trim()) throw new Error("A saved preset has no name.");
      const name = preset.name.trim().slice(0, 60);
      const project = normalizeProject(preset.project);
      return {
        name,
        tag: typeof preset.tag === "string" ? preset.tag.slice(0, 80) : "My shader",
        project: normalizeProject({ ...project, name }),
      };
    });
    return { presets, error: null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown storage error";
    return { presets: [], error: `Couldn't load your saved presets: ${detail}` };
  }
}

interface DockDrag {
  id: number;
  startY: number;
  /** dock top minus pointer Y at grab time, so the dock edge follows the finger exactly */
  offset: number;
  wsH: number;
  wsBottom: number;
  h: number;
  moved: boolean;
}

/* ───────────────────────── small components ───────────────────────── */

function PresetCard({ preset, active, onPick }: { preset: ShaderPreset; active: boolean; onPick: () => void }) {
  const thumb = useThumb(presetThumbKey(preset.name));
  const colors = preset.project.palette;
  const style = {
    "--preset-color": colors[Math.min(2, colors.length - 1)] ?? "#8a7bd6",
    "--preset-accent": colors[colors.length - 1] ?? "#ffffff",
    background: `linear-gradient(135deg, ${colors.join(", ")})`,
  } as CSSProperties;
  return (
    <button type="button" className={`preset-card ${active ? "active" : ""}`} onClick={onPick} title={preset.tag}>
      <span className="preset-swatch" style={thumb ? undefined : style}>
        {thumb ? <img src={thumb} alt="" draggable={false} /> : null}
      </span>
      <span className="preset-name">{preset.name}</span>
      <span className="preset-tag">{preset.tag}</span>
    </button>
  );
}

function CustomPresetCard({
  preset,
  active,
  onPick,
  onDelete,
}: {
  preset: ShaderPreset;
  active: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="custom-preset-card">
      <PresetCard preset={preset} active={active} onPick={onPick} />
      <button
        type="button"
        className="custom-preset-delete"
        aria-label={`Delete ${preset.name} preset`}
        title={`Delete ${preset.name}`}
        onClick={onDelete}
      >
        ×
      </button>
    </div>
  );
}

function GeneratorPicker({ value, onPick }: { value: GeneratorId; onPick: (id: GeneratorId) => void }) {
  const [category, setCategory] = useState<"All" | GeneratorCategory>("All");
  const list = GENERATORS.filter((g) => category === "All" || g.category === category);
  const def = GENERATOR_MAP[value];
  return (
    <>
      <ChoiceGroup label="Category" value={category} options={["All", ...GENERATOR_CATEGORIES] as const} onChange={setCategory} />
      <div className="generator-grid">
        {list.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`generator-card ${g.id === value ? "active" : ""}`}
            aria-pressed={g.id === value}
            onClick={() => onPick(g.id)}
          >
            <span className="generator-card-icon">{CATEGORY_ICON[g.category]}</span>
            {g.name}
          </button>
        ))}
      </div>
      <p className="field-help">
        <b>{def.name}</b> — {def.description}
      </p>
    </>
  );
}

/* ───────────────────────── studio ───────────────────────── */

interface ShaderStudioProps {
  active: boolean;
  modeSwitch: ReactNode;
  designerRequest: { id: number; document: GeometryDocument } | null;
}

export default function ShaderStudio({ active, modeSwitch, designerRequest }: ShaderStudioProps) {
  const saved = useMemo(() => loadSaved(), []);
  const customPresetStore = useMemo(() => loadCustomPresets(), []);
  const mobile = useMobile();
  const [project, setProject] = useState<ShaderProject>(
    () => saved?.project ?? cloneProject(SHADER_PRESETS[0]?.project ?? DEFAULT_PROJECT),
  );
  const [activePreset, setActivePreset] = useState<string>(saved ? saved.preset : (SHADER_PRESETS[0]?.name ?? ""));
  const [section, setSection] = useState<SectionId>("presets");
  const [selectedLayer, setSelectedLayer] = useState("base");
  const [collapsed, setCollapsed] = useState(false);
  const [dockFrac, setDockFrac] = useState<number>(loadDock);
  const [settle, setSettle] = useState(0);
  const [isSaved, setIsSaved] = useState<boolean>(saved !== null);
  const [customPresets, setCustomPresets] = useState<ShaderPreset[]>(customPresetStore.presets);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [stats, setStats] = useState<RendererStats>({ fps: 60, quality: 1 });
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [maskPixels, setMaskPixels] = useState<MaskPixels | null>(null);
  const [maskBusy, setMaskBusy] = useState(false);
  const appliedDesignerRequestRef = useRef<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DockDrag | null>(null);
  const rendererRef = useRef<ShaderRenderer | null>(null);
  const projectRef = useRef(project);
  const toastTimer = useRef(0);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    if (customPresetStore.error) showToast(customPresetStore.error);
  }, [customPresetStore.error, showToast]);

  /* renderer lifecycle */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new ShaderRenderer(canvas, {
      interactive: true,
      autoSize: true,
      // wait for the sliders / toggles to settle before recompiling a new GLSL variant
      compileDelay: 140,
      onStats: setStats,
      onError: setError,
    });
    rendererRef.current = renderer;
    setSupported(renderer.supported);
    renderer.setProject(projectRef.current);
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    projectRef.current = project;
    rendererRef.current?.setProject(project);
  }, [project]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (active) {
      renderer.start();
      renderer.resize();
    } else {
      renderer.stop();
    }
  }, [active]);

  /* the image mask: decode the source, build the distance texture, hand it to the GPU */
  const maskEnabled = project.mask.enabled;
  const maskSource = project.mask.source;
  const maskThreshold = project.mask.threshold;
  const maskInvert = project.mask.invert;
  useEffect(() => {
    if (!maskEnabled) {
      setMaskPixels(null);
      setMaskBusy(false);
      rendererRef.current?.setMask(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setMaskBusy(true);
      sourceField(maskSource)
        .then((field) => {
          if (cancelled) return;
          const pixels = maskPixelsFor(field, maskSource, maskThreshold, maskInvert);
          setMaskPixels(pixels);
          rendererRef.current?.setMask(pixels);
        })
        .catch(() => {
          if (!cancelled) showToast("Couldn't read the mask image");
        })
        .finally(() => {
          if (!cancelled) setMaskBusy(false);
        });
    }, 30);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [maskEnabled, maskSource, maskThreshold, maskInvert, showToast]);

  /* thumbnails are baked once, in the background, while the studio is visible */
  useEffect(() => {
    if (active) thumbStore.start();
  }, [active]);
  useEffect(() => {
    thumbStore.setPaused(recording || !active);
  }, [recording, active]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  /* ───────── dock: resizable split between preview and controls ───────── */

  useEffect(() => {
    try {
      localStorage.setItem(DOCK_KEY, String(dockFrac));
    } catch {
      /* storage can be unavailable in private windows */
    }
  }, [dockFrac]);

  /* a drag writes the height straight onto the element; hand control back to CSS once state has settled */
  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    dock.style.height = "";
    dock.style.transition = "";
    dock.classList.remove("dragging");
  }, [collapsed, dockFrac, settle]);

  const onBarPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const workspace = workspaceRef.current;
    const dock = dockRef.current;
    if (!workspace || !dock) return;
    const ws = workspace.getBoundingClientRect();
    const dr = dock.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: event.pointerId,
      startY: event.clientY,
      offset: dr.top - event.clientY,
      wsH: ws.height,
      wsBottom: ws.bottom,
      h: dr.height,
      moved: false,
    };
  };

  const onBarPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const dock = dockRef.current;
    if (!drag || !dock || drag.id !== event.pointerId) return;
    if (!drag.moved) {
      if (Math.abs(event.clientY - drag.startY) < 6) return;
      drag.moved = true;
      dock.classList.add("dragging");
      dock.style.transition = "none";
    }
    drag.h = clamp(drag.wsBottom - (event.clientY + drag.offset), BAR_H, drag.wsH * DOCK_MAX);
    dock.style.height = `${drag.h}px`;
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag.moved) {
      if (!cancelled) setCollapsed((value) => !value);
      return;
    }
    if (drag.h < CLOSE_BELOW) {
      setCollapsed(true);
    } else {
      setCollapsed(false);
      setDockFrac(clamp(drag.h / drag.wsH, DOCK_MIN, DOCK_MAX));
    }
    setSettle((value) => value + 1);
  };

  const onBarKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setCollapsed((value) => !value);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const step = event.key === "ArrowUp" ? 0.06 : -0.06;
      if (collapsed) {
        if (step > 0) setCollapsed(false);
        return;
      }
      setDockFrac((value) => clamp(value + step, DOCK_MIN, DOCK_MAX));
    }
  };

  /* ───────── project updates ───────── */

  const update = useCallback(<K extends keyof ShaderProject>(key: K, value: ShaderProject[K]) => {
    setProject((current) => ({ ...current, [key]: value }));
    setIsSaved(false);
  }, []);

  const patchProject = useCallback((patch: Partial<ShaderProject>) => {
    setProject((current) => ({ ...current, ...patch }));
    setIsSaved(false);
  }, []);

  const setLayers = useCallback((layers: ShaderLayer[]) => {
    setProject((current) => ({ ...current, layers }));
    setIsSaved(false);
  }, []);

  const updateMask = useCallback((patch: Partial<ShaderMask>) => {
    setProject((current) => ({
      ...current,
      geometryMode: patch.enabled === false ? false : current.geometryMode,
      mask: { ...current.mask, ...patch },
    }));
    setIsSaved(false);
  }, []);

  useEffect(() => {
    if (!active || !designerRequest || appliedDesignerRequestRef.current === designerRequest.id) return;
    appliedDesignerRequestRef.current = designerRequest.id;
    setProject(normalizeProject({
      ...cloneProject(DEFAULT_PROJECT),
      name: `${designerRequest.document.name} shader`,
      geometryMode: true,
      mask: {
        ...DEFAULT_PROJECT.mask,
        enabled: true,
        source: { kind: "designer", document: designerRequest.document },
      },
    }));
    setSelectedLayer("base");
    setSection("mask");
    setActivePreset("");
    setIsSaved(false);
    setToast("Created a fresh shader from your geometry");
  }, [active, designerRequest]);

  const addMaskField = useCallback(
    (region: "Inside" | "Outside", generator: GeneratorId) => {
      if (project.layers.length >= MAX_LAYERS) {
        showToast(`The stack holds ${MAX_LAYERS} layers — delete one first`);
        return;
      }
      const layer = newLayer("field", {
        name: `${region} · ${GENERATOR_MAP[generator].name}`,
        generator,
        knobs: defaultKnobs(generator),
        region,
      });
      setLayers([layer, ...project.layers]);
      setSelectedLayer(layer.id);
      if (region === "Outside" && project.mask.ghost === 0) updateMask({ ghost: 1 });
      setSection("stack");
      showToast(`Added ${region.toLowerCase()} ${GENERATOR_MAP[generator].name} field`);
    },
    [project.layers, project.mask.ghost, setLayers, showToast, updateMask],
  );

  const applyProject = useCallback((next: ShaderProject, presetName: string) => {
    setProject(cloneProject(next));
    setActivePreset(presetName);
    setSelectedLayer("base");
    setIsSaved(false);
  }, []);

  const importMask = useCallback(
    async (file: File) => {
      setMaskBusy(true);
      try {
        const { name, data } = await importMaskFile(file);
        updateMask({ enabled: true, source: { kind: "image", name, data } });
        showToast(`Mask made from ${name}`);
      } catch (err) {
        setMaskBusy(false);
        showToast(err instanceof Error ? err.message : "Couldn't read that image");
      }
    },
    [showToast, updateMask],
  );

  const addElement = useCallback(
    (item: LibraryItem, at: InsertAt) => {
      const fresh = libraryLayers(item);
      if (project.layers.length + fresh.length > MAX_LAYERS) {
        showToast(`The stack holds ${MAX_LAYERS} layers — delete one first`);
        return;
      }
      setLayers(at === "Top" ? [...fresh, ...project.layers] : [...project.layers, ...fresh]);
      const first = fresh[0];
      if (first) setSelectedLayer(first.id);
      showToast(at === "Top" ? `Added ${item.label} on top` : `Added ${item.label} below the field`);
    },
    [project.layers, setLayers, showToast],
  );

  const slider = (key: RangeKey & keyof ShaderProject, label: string, display?: string): ReactNode => {
    const r = RANGES[key];
    const value = project[key];
    return (
      <RangeControl
        label={label}
        value={typeof value === "number" ? value : 0}
        min={r.min}
        max={r.max}
        step={r.step}
        display={display}
        reset={typeof DEFAULT_PROJECT[key] === "number" ? (DEFAULT_PROJECT[key] as number) : undefined}
        onChange={(next) => update(key, next as ShaderProject[typeof key])}
      />
    );
  };

  const setKnob = (index: 0 | 1 | 2 | 3, value: number) => {
    const knobs: Knobs = [...project.knobs];
    knobs[index] = value;
    update("knobs", knobs);
  };

  /* ───────── actions ───────── */

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, preset: activePreset }));
      setIsSaved(true);
      showToast("Shader saved on this device");
    } catch {
      showToast("Couldn't save — storage is full or unavailable");
    }
  };

  const saveCustomPreset = () => {
    const name = project.name.trim().slice(0, 60);
    if (!name) {
      showToast("Give your shader a name before saving it as a preset");
      return;
    }
    if (SHADER_PRESETS.some((preset) => preset.name.toLowerCase() === name.toLowerCase())) {
      showToast("That name belongs to a built-in preset — choose another name");
      return;
    }
    const projectSnapshot = normalizeProject({ ...project, name });
    const preset: ShaderPreset = {
      name,
      tag: `${GENERATOR_MAP[project.generator].name} · ${project.layers.length} layers`,
      project: projectSnapshot,
    };
    const existing = customPresets.findIndex((item) => item.name.toLowerCase() === name.toLowerCase());
    const next = [...customPresets];
    if (existing < 0) next.unshift(preset);
    else next[existing] = preset;
    try {
      localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next));
      setCustomPresets(next);
      setProject(projectSnapshot);
      setActivePreset(name);
      setIsSaved(true);
      showToast(existing < 0 ? `Saved ${name} to My presets` : `Updated ${name}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown storage error";
      showToast(`Couldn't save this preset: ${detail}`);
    }
  };

  const deleteCustomPreset = (name: string) => {
    const next = customPresets.filter((preset) => preset.name !== name);
    try {
      localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next));
      setCustomPresets(next);
      if (activePreset === name) {
        setActivePreset("");
        setIsSaved(false);
      }
      showToast(`Deleted ${name}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown storage error";
      showToast(`Couldn't delete this preset: ${detail}`);
    }
  };

  const reset = () => {
    const preset = customPresets.find((p) => p.name === activePreset)
      ?? SHADER_PRESETS.find((p) => p.name === activePreset)
      ?? SHADER_PRESETS[0];
    if (preset) {
      applyProject(preset.project, preset.name);
      showToast(`Reset to ${preset.name}`);
    }
  };

  const surprise = () => {
    applyProject(randomProject(), "");
    showToast("Fresh random shader");
  };

  const goFullscreen = () => {
    void wrapRef.current?.requestFullscreen?.().catch(() => showToast("Fullscreen isn't available"));
  };

  /* ───────── derived ───────── */

  const generator = GENERATOR_MAP[project.generator];
  const matchesPreset = (preset: ShaderPreset) =>
    `${preset.name} ${preset.tag} ${preset.project.generator} ${GENERATOR_MAP[preset.project.generator].name}`.toLowerCase().includes(query.trim().toLowerCase());
  const filteredCustomPresets = useMemo(
    () => customPresets.filter(matchesPreset),
    [customPresets, query],
  );
  const filteredPresets = useMemo(() => {
    return SHADER_PRESETS.filter(matchesPreset);
  }, [query]);

  const sectionMeta =
    section === "mask" && project.geometryMode
      ? {
          title: "Geometry shader field",
          description: "Your designed shape is the shader’s base content. Add layers, colour, motion, lighting and effects around it.",
        }
      : section === "field" && project.geometryMode
        ? {
            title: "Geometry base field",
            description: "The procedural base generator is bypassed while your designed geometry drives the shader.",
          }
        : SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const canvasW = canvasRef.current?.width ?? 0;
  const canvasH = canvasRef.current?.height ?? 0;
  const layerCount = project.layers.length;
  const generatorLabel = `${project.geometryMode ? "Geometry field" : generator.name}${layerCount > 1 ? ` + ${layerCount - 1} layer${layerCount > 2 ? "s" : ""}` : ""}${project.mask.enabled ? (project.geometryMode ? " · source" : " · mask") : ""}`;

  const hintFor = (id: SectionId): string => {
    if (id === "stack") return `${layerCount} layer${layerCount === 1 ? "" : "s"}`;
    if (id === "mask") return project.geometryMode ? "Geometry field" : project.mask.enabled ? "On" : "Image mask";
    if (id === "field" && project.geometryMode) return "Geometry";
    if (id === "text") return project.mask.source.kind === "text" ? `${project.mask.source.text.length} chars` : "Typography";
    return SECTIONS.find((s) => s.id === id)?.hint ?? "";
  };

  /* ───────── panels ───────── */

  const renderSection = (): ReactNode => {
    switch (section) {
      case "presets":
        return (
          <>
            <div className="custom-preset-save">
              <p className="field-help">Combine a generator, shape, layers and effects, then save the result here to reuse it.</p>
              <label className="custom-preset-name">
                Preset name
                <input
                  type="text"
                  value={project.name}
                  maxLength={60}
                  aria-label="Preset name"
                  onChange={(event) => update("name", event.target.value)}
                />
              </label>
              <button type="button" className="svg-upload-button" onClick={saveCustomPreset}>
                Save to My presets
              </button>
            </div>
            <div className="preset-search">
              <input
                type="search"
                placeholder="Search presets or generators…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search presets"
              />
              <small>{filteredPresets.length + filteredCustomPresets.length}</small>
            </div>
            {filteredCustomPresets.length > 0 && (
              <>
                <h3 className="preset-shelf-heading">My presets</h3>
                <div className="preset-grid">
                  {filteredCustomPresets.map((preset) => (
                    <CustomPresetCard
                      key={preset.name}
                      preset={preset}
                      active={preset.name === activePreset}
                      onPick={() => applyProject(preset.project, preset.name)}
                      onDelete={() => deleteCustomPreset(preset.name)}
                    />
                  ))}
                </div>
              </>
            )}
            <h3 className="preset-shelf-heading">Built-in presets</h3>
            <div className="preset-grid">
              {filteredPresets.map((preset) => (
                <PresetCard
                  key={preset.name}
                  preset={preset}
                  active={preset.name === activePreset}
                  onPick={() => applyProject(preset.project, preset.name)}
                />
              ))}
            </div>
            {filteredPresets.length + filteredCustomPresets.length === 0 && <p className="field-help">No preset matches “{query}”.</p>}
            <button type="button" className="svg-upload-button" onClick={surprise}>
              <span>⚄</span> Surprise me
            </button>
            <SoftTip>
              Every preset is just a <b>project</b>: a layer stack, a palette and a few settings. Change anything and export the result.
            </SoftTip>
          </>
        );

      case "field":
        if (project.geometryMode) {
          return (
            <>
              <p className="field-help">Your designed shape is the base field; the procedural generator is intentionally not used. Add generators as layers to combine them with the shape, or switch off “Geometry as shader field” in Shape to return to a procedural base.</p>
              <button type="button" className="svg-upload-button" onClick={() => setSection("stack")}>
                Add generator or effect layers →
              </button>
              <button type="button" className="text-action" onClick={() => setSection("mask")}>
                Edit geometry source
              </button>
            </>
          );
        }
        return (
          <>
            <GeneratorPicker
              value={project.generator}
              onPick={(id) => {
                patchProject({ generator: id, knobs: defaultKnobs(id) });
              }}
            />
            <div className="control-divider" />
            <GeneratorKnobs id={project.generator} knobs={project.knobs} onChange={setKnob} />
            <button type="button" className="text-action" onClick={() => update("knobs", defaultKnobs(project.generator))}>
              Reset knobs
            </button>
            <SoftTip>
              Make a look with this field, then add more generators, gradients and effects in <b>Stack</b>. Use <b>Shape</b> to mask it, and save the finished project as a reusable preset.
            </SoftTip>
          </>
        );

      case "stack":
        return (
          <StackPanel
            project={project}
            selectedId={selectedLayer}
            onSelect={setSelectedLayer}
            onLayers={setLayers}
            onCanvas={(canvas) => update("canvas", canvas)}
            onOpenElements={() => setSection("elements")}
            onOpenField={() => setSection("field")}
            showToast={showToast}
          />
        );

      case "elements":
        return <LibraryPanel layerCount={layerCount} onAdd={addElement} onOpenStack={() => setSection("stack")} />;

      case "text":
        return <TextPanel mask={project.mask} onMask={updateMask} />;

      case "mask":
        return (
          <MaskPanel
            project={project}
            busy={maskBusy}
            onMask={updateMask}
            onAddField={addMaskField}
            onImport={(file) => void importMask(file)}
            onApplyLook={(look) => {
              setProject((current) => applyLook(current, look));
              setIsSaved(false);
              showToast(`${look.name} look applied`);
            }}
          />
        );

      case "motion":
        return (
          <>
            <button
              type="button"
              className={`toggle-row ${project.playing ? "enabled" : ""}`}
              aria-pressed={project.playing}
              onClick={() => update("playing", !project.playing)}
            >
              <span>
                <b>{project.playing ? "Playing" : "Paused"}</b>
                <small>Freeze or run the animation clock</small>
              </span>
              <span className="toggle-switch" />
            </button>
            {slider("speed", "Speed")}
            {slider("scale", "Zoom")}
            {slider("seed", "Seed")}
            <div className="control-divider" />
            {slider("rotation", "Rotation")}
            {slider("spin", "Spin")}
            {slider("swirl", "Swirl")}
            {slider("symmetry", "Mirror segments", project.symmetry < 2 ? "Off" : String(project.symmetry))}
            <div className="control-divider" />
            {slider("warp", "Domain warp", project.warp === 0 ? "Off" : undefined)}
            {slider("warpScale", "Warp scale")}
          </>
        );

      case "color":
        return (
          <>
            {generator.roles && (
              <p className="field-help">
                <b>{generator.name}</b> uses palette stops as colour roles: {generator.roles.map((role, i) => `${i + 1} ${role}`).join(" · ")}.
              </p>
            )}
            <GradientBar
              colors={project.palette}
              positions={project.palettePositions}
              min={MIN_PALETTE}
              max={MAX_PALETTE}
              soft={project.paletteSoft}
              onSoftChange={(value) => update("paletteSoft", value)}
              onChange={(palette, palettePositions) => patchProject({ palette, palettePositions })}
            />
            <div className="export-actions separate-files">
              <button
                type="button"
                className="text-action"
                onClick={() => {
                  const next = randomPalette();
                  patchProject({ palette: next.palette, palettePositions: evenPositions(next.palette.length), accent: next.accent, paletteSoft: 1 });
                }}
              >
                ⚄ Shuffle
              </button>
            </div>
            <div className="color-row single-color">
              <ColorField label="Accent (highlights & lines)" value={project.accent} onChange={(value) => update("accent", value)} />
            </div>
            <span className="control-label">Palette library</span>
            <div className="palette-library">
              {PALETTE_LIBRARY.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className="palette-chip"
                  style={{ background: `linear-gradient(90deg, ${p.colors.join(", ")})` }}
                  onClick={() =>
                    patchProject({
                      palette: [...p.colors],
                      palettePositions: p.positions ? [...p.positions] : evenPositions(p.colors.length),
                      paletteSoft: p.soft ?? 1,
                      accent: p.accent,
                    })
                  }
                >
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
            <div className="control-divider" />
            {slider("paletteShift", "Palette offset")}
            {slider("paletteSpeed", "Palette cycling", project.paletteSpeed === 0 ? "Off" : undefined)}
            {slider("paletteRepeat", "Palette repeat")}
            <div className="control-divider" />
            {slider("exposure", "Exposure")}
            {slider("contrast", "Contrast")}
            {slider("saturation", "Saturation")}
            {slider("hue", "Hue shift")}
            {slider("glow", "Highlight glow", project.glow === 0 ? "Off" : undefined)}
            {slider("tone", "Soft highlights", project.tone === 0 ? "Off" : undefined)}
          </>
        );

      case "surface":
        return (
          <>
            {slider("relief", "Relief", project.relief === 0 ? "Flat" : undefined)}
            {slider("lightAngle", "Light direction")}
            {slider("shine", "Specular shine")}
            <SoftTip>
              Relief lights the generator’s height map with a moving highlight. It makes <b>Silk</b>, <b>Waves</b>, <b>Lava</b> and <b>Contours</b> look like metal, gel or glass.
            </SoftTip>
          </>
        );

      case "effects":
        return (
          <>
            {slider("aberration", "Chromatic aberration", project.aberration === 0 ? "Off" : undefined)}
            {slider("vignette", "Vignette")}
            {slider("grain", "Film grain")}
            {slider("scanlines", "Scanlines", project.scanlines === 0 ? "Off" : undefined)}
            {slider("posterize", "Posterize", project.posterize < 2 ? "Off" : `${project.posterize} levels`)}
            {slider("pixelate", "Pixelate", project.pixelate < 8 ? "Off" : `${project.pixelate} cells`)}
            <button
              type="button"
              className="text-action"
              onClick={() =>
                setProject((c) => ({ ...c, aberration: 0, vignette: DEFAULT_PROJECT.vignette, grain: DEFAULT_PROJECT.grain, scanlines: 0, posterize: 0, pixelate: 0 }))
              }
            >
              Reset effects
            </button>
          </>
        );

      case "touch":
        return <TouchPanel project={project} onPatch={patchProject} />;
    }
  };

  /* ───────── layout pieces ───────── */

  const tabs = (
    <nav className="section-tabs" aria-label="Shader controls">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`section-tab ${s.id === section ? "active" : ""}`}
          aria-current={s.id === section ? "page" : undefined}
          onClick={() => setSection(s.id)}
        >
          <span className="tab-icon">{s.icon}</span>
          <span className="tab-label">{s.label}</span>
          <span className="tab-hint">{hintFor(s.id)}</span>
        </button>
      ))}
    </nav>
  );

  const scroller = (
    <div className="control-scroll" key={section}>
      {!mobile && (
        <SectionHeading
          number={String(SECTIONS.findIndex((s) => s.id === section) + 1).padStart(2, "0")}
          title={sectionMeta.title}
          description={sectionMeta.description}
        />
      )}
      {renderSection()}
    </div>
  );

  const nameInput = (
    <input
      className="shader-name-input"
      value={project.name}
      maxLength={60}
      aria-label="Shader name"
      onChange={(event) => update("name", event.target.value)}
    />
  );

  /* ───────── layout ───────── */

  return (
    <div className={`studio shader-studio ${mobile ? "is-mobile" : ""}`}>
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            particlestudio
            <small>SHADER LAB</small>
          </span>
        </span>
        {modeSwitch}
        {mobile ? (
          <div className="m-title">
            {nameInput}
            <span className="m-meta">
              <i className="live-dot" />
              {stats.fps} fps
              {stats.quality < 0.99 && <span className="m-res">· {Math.round(stats.quality * 100)}%</span>}
              <span className="saved-badge">{isSaved ? "Saved" : "Draft"}</span>
            </span>
          </div>
        ) : (
          <div className="project-title">
            <span className="live-dot" />
            {project.name}
            <span className="saved-badge">{isSaved ? "Saved" : "Draft"}</span>
          </div>
        )}
        <div className="top-actions">
          <button type="button" className="quiet-button" onClick={save} aria-label="Save shader" title="Save">
            <IconSave size={16} />
            <span className="desktop-label">Save</span>
          </button>
          <button type="button" className="export-button" onClick={() => setExportOpen(true)} aria-label="Export" title="Export">
            <IconExport size={16} />
            <span className="desktop-label">Export</span>
            {recording && <i className="rec-dot" aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main
        className="workspace"
        ref={workspaceRef}
        style={{ "--dock-frac": dockFrac } as CSSProperties}
      >
        <section className="preview-area">
          {!mobile && (
            <div className="preview-head">
              <div>
                <span className="eyebrow">LIVE SHADER</span>
                <span className="canvas-name">
                  {nameInput}
                  <span className="edit-pencil">✎</span>
                </span>
              </div>
              <div className="preview-tools">
                <span className="performance">
                  <i />
                  {stats.fps} fps
                  {stats.quality < 0.99 && <span> · {Math.round(stats.quality * 100)}% res</span>}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={project.playing ? "Pause animation" : "Play animation"}
                  onClick={() => update("playing", !project.playing)}
                >
                  {project.playing ? "Ⅱ" : "▶"}
                </button>
                <button type="button" className="icon-button" aria-label="Fullscreen preview" onClick={goFullscreen}>
                  ⛶
                </button>
              </div>
            </div>
          )}

          <div className="canvas-wrap" ref={wrapRef}>
            <canvas ref={canvasRef} aria-label={`${generator.name} shader preview`} />
            <div className="canvas-caption">
              <i className="pulse-dot" />
              {!mobile && (
                <>
                  LIVE SHADER <span className="caption-divider">|</span>{" "}
                </>
              )}
              {generator.name.toUpperCase()}
            </div>
            {mobile && (
              <div className="canvas-tools">
                <button
                  type="button"
                  className="canvas-tool"
                  aria-label={project.playing ? "Pause animation" : "Play animation"}
                  onClick={() => update("playing", !project.playing)}
                >
                  {project.playing ? <IconPause size={14} /> : <IconPlay size={14} />}
                </button>
                <button type="button" className="canvas-tool" aria-label="Fullscreen preview" onClick={goFullscreen}>
                  <IconFullscreen size={15} />
                </button>
              </div>
            )}
            {error && (
              <pre className="shader-error" role="alert">
                {error.slice(0, 700)}
              </pre>
            )}
            {!supported && (
              <div className="shader-unsupported">
                <b>WebGL2 isn’t available</b>
                <span>Shader Studio needs a browser with WebGL2 enabled. Try a current Chrome, Edge, Firefox or Safari.</span>
              </div>
            )}
          </div>

          {!mobile && (
            <div className="preview-footer">
              <span>
                <kbd>✦</kbd>
                Move over the canvas to play · press for ripples
              </span>
              <span className="preview-dimensions">
                {canvasW} × {canvasH}
                <i />
                WEBGL2
              </span>
            </div>
          )}
        </section>

        <aside className={`control-dock ${collapsed ? "collapsed" : ""}`} ref={dockRef}>
          {mobile ? (
            <>
              <div
                className="dock-bar"
                role="group"
                aria-label="Controls panel — drag to resize, tap to fold"
                tabIndex={0}
                onPointerDown={onBarPointerDown}
                onPointerMove={onBarPointerMove}
                onPointerUp={(event) => finishDrag(event, false)}
                onPointerCancel={(event) => finishDrag(event, true)}
                onKeyDown={onBarKeyDown}
              >
                <span className="dock-bar-label">
                  <span className="sparkle">✦</span>
                  {generatorLabel}
                </span>
                <span className="dock-grip" aria-hidden="true" />
                <span className="dock-bar-actions">
                  <button type="button" className="bar-icon" aria-label="Reset to preset" title="Reset" onClick={reset}>
                    <IconReset size={15} />
                  </button>
                  <button
                    type="button"
                    className="bar-icon"
                    aria-label={collapsed ? "Show controls" : "Hide controls"}
                    title={collapsed ? "Show" : "Hide"}
                    onClick={() => setCollapsed((value) => !value)}
                  >
                    {collapsed ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                  </button>
                </span>
              </div>
              <div className="dock-body" aria-hidden={collapsed}>
                {tabs}
                {scroller}
              </div>
            </>
          ) : (
            <>
              <div className="dock-topline">
                <div>
                  <span className="eyebrow">SHADER STUDIO</span>
                  <h1>
                    Make it <span>glow.</span>
                  </h1>
                </div>
                <button type="button" className="collapse-button" aria-label={collapsed ? "Expand controls" : "Collapse controls"} onClick={() => setCollapsed((value) => !value)}>
                  {collapsed ? "‹" : "›"}
                </button>
              </div>

              {collapsed ? (
                <button type="button" className="collapsed-summary" onClick={() => setCollapsed(false)}>
                  <span className="summary-sparkle">✦</span>
                  <span>
                    <b>{project.name}</b>
                    <small>{generator.name} · tap to customize</small>
                  </span>
                  <span className="summary-arrow">‹</span>
                </button>
              ) : (
                <>
                  {tabs}
                  {scroller}
                  <footer className="dock-footer">
                    <span>
                      <span className="sparkle">✦</span>
                      {generatorLabel}
                    </span>
                    <button type="button" onClick={reset}>
                      Reset <span>↺</span>
                    </button>
                  </footer>
                </>
              )}
            </>
          )}
        </aside>
      </main>

      <ExportSheet
        open={exportOpen}
        project={project}
        mask={maskPixels}
        canvasRef={canvasRef}
        rendererRef={rendererRef}
        onClose={() => setExportOpen(false)}
        onLoadProject={(next) => {
          applyProject(next, "");
          showToast(`Loaded ${next.name}`);
        }}
        onRecordingChange={setRecording}
        showToast={showToast}
      />

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
