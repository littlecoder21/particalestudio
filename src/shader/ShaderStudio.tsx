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
import {
  ChoiceGroup,
  ColorField,
  RangeControl,
  SectionHeading,
  SoftTip,
  ToggleRow,
} from "./controls";
import ExportSheet from "./ExportSheet";
import { GENERATORS, GENERATOR_MAP, defaultKnobs } from "./generators";
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
import { PALETTE_LIBRARY, SHADER_PRESETS } from "./presets";
import { DEFAULT_PROJECT, cloneProject, normalizeProject, randomPalette, randomProject } from "./project";
import { ShaderRenderer, type RendererStats } from "./renderer";
import { thumbStore } from "./thumbs";
import {
  BLEND_MODES,
  GENERATOR_CATEGORIES,
  INTERACTION_MODES,
  MAX_PALETTE,
  MIN_PALETTE,
  RANGES,
  type GeneratorCategory,
  type GeneratorId,
  type Knobs,
  type RangeKey,
  type ShaderOverlay,
  type ShaderPreset,
  type ShaderProject,
} from "./types";

/* ───────────────────────── constants ───────────────────────── */

type SectionId = "presets" | "field" | "layers" | "motion" | "color" | "surface" | "effects" | "touch";

const SECTIONS: Array<{ id: SectionId; icon: string; label: string; hint: string; title: string; description: string }> = [
  { id: "presets", icon: "✦", label: "Presets", hint: `${SHADER_PRESETS.length} looks`, title: "Ready-made looks", description: "Start from a finished shader, then make it yours." },
  { id: "field", icon: "◎", label: "Field", hint: "Generator", title: "Base generator", description: "Pick the procedural field and shape it with four knobs." },
  { id: "layers", icon: "◧", label: "Layers", hint: "Overlay", title: "Stack a second layer", description: "Blend another generator on top for depth." },
  { id: "motion", icon: "↻", label: "Motion", hint: "Time & warp", title: "Time & warp", description: "Speed, rotation, symmetry and domain distortion." },
  { id: "color", icon: "◐", label: "Color", hint: "Palette", title: "Palette & grade", description: "Build the gradient and grade the final image." },
  { id: "surface", icon: "◈", label: "Surface", hint: "Light", title: "Light & relief", description: "Turn the field into a lit, glossy surface." },
  { id: "effects", icon: "✧", label: "Effects", hint: "Post FX", title: "Post effects", description: "Lens, film and retro finishing touches." },
  { id: "touch", icon: "⌖", label: "Touch", hint: "Pointer", title: "Pointer & ripples", description: "How the shader reacts to your cursor." },
];

const CATEGORY_ICON: Record<GeneratorCategory, string> = { Fluid: "≈", Cosmic: "✺", Light: "☀", Pattern: "▦" };

const STORAGE_KEY = "particle-studio-shader-project";

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
  const thumb = useSyncExternalStore(thumbStore.subscribe, () => thumbStore.get(preset.name));
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

function KnobSliders({ id, knobs, onChange }: { id: GeneratorId; knobs: Knobs; onChange: (index: 0 | 1 | 2 | 3, value: number) => void }) {
  return (
    <>
      {GENERATOR_MAP[id].knobs.map((def, i) => (
        <RangeControl
          key={def.label}
          label={def.label}
          min={def.min}
          max={def.max}
          step={def.step}
          value={knobs[i] ?? def.value}
          onChange={(value) => onChange(i as 0 | 1 | 2 | 3, value)}
        />
      ))}
    </>
  );
}

/* ───────────────────────── studio ───────────────────────── */

interface ShaderStudioProps {
  active: boolean;
  modeSwitch: ReactNode;
}

export default function ShaderStudio({ active, modeSwitch }: ShaderStudioProps) {
  const saved = useMemo(() => loadSaved(), []);
  const mobile = useMobile();
  const [project, setProject] = useState<ShaderProject>(
    () => saved?.project ?? cloneProject(SHADER_PRESETS[0]?.project ?? DEFAULT_PROJECT),
  );
  const [activePreset, setActivePreset] = useState<string>(saved ? saved.preset : (SHADER_PRESETS[0]?.name ?? ""));
  const [section, setSection] = useState<SectionId>("presets");
  const [collapsed, setCollapsed] = useState(false);
  const [dockFrac, setDockFrac] = useState<number>(loadDock);
  const [settle, setSettle] = useState(0);
  const [isSaved, setIsSaved] = useState<boolean>(saved !== null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [stats, setStats] = useState<RendererStats>({ fps: 60, quality: 1 });
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [recording, setRecording] = useState(false);

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

  /* renderer lifecycle */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new ShaderRenderer(canvas, { interactive: true, autoSize: true, onStats: setStats, onError: setError });
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

  const updateOverlay = useCallback((patch: Partial<ShaderOverlay>) => {
    setProject((current) => ({ ...current, overlay: { ...current.overlay, ...patch } }));
    setIsSaved(false);
  }, []);

  const applyProject = useCallback((next: ShaderProject, presetName: string) => {
    setProject(cloneProject(next));
    setActivePreset(presetName);
    setIsSaved(false);
  }, []);

  const range = (key: RangeKey) => RANGES[key];
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
        onChange={(next) => update(key, next as ShaderProject[typeof key])}
      />
    );
  };

  const setKnob = (index: 0 | 1 | 2 | 3, value: number) => {
    const knobs: Knobs = [...project.knobs];
    knobs[index] = value;
    update("knobs", knobs);
  };

  const setOverlayKnob = (index: 0 | 1 | 2 | 3, value: number) => {
    const knobs: Knobs = [...project.overlay.knobs];
    knobs[index] = value;
    updateOverlay({ knobs });
  };

  /* palette */
  const setPalette = (palette: string[]) => update("palette", palette);
  const setPaletteColor = (index: number, color: string) =>
    setPalette(project.palette.map((c, i) => (i === index ? color : c)));
  const addPaletteColor = () => {
    if (project.palette.length >= MAX_PALETTE) return;
    const last = project.palette[project.palette.length - 1] ?? "#ffffff";
    const prev = project.palette[project.palette.length - 2] ?? last;
    const mix = (a: string, b: string, at: number) =>
      Math.round((parseInt(a.slice(at, at + 2), 16) + parseInt(b.slice(at, at + 2), 16)) / 2).toString(16).padStart(2, "0");
    setPalette([...project.palette, `#${mix(last, prev, 1)}${mix(last, prev, 3)}${mix(last, prev, 5)}`]);
  };
  const removePaletteColor = (index: number) => {
    if (project.palette.length <= MIN_PALETTE) return;
    setPalette(project.palette.filter((_, i) => i !== index));
  };

  /* ───────── actions ───────── */

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, preset: activePreset }));
      setIsSaved(true);
      showToast("Shader saved on this device");
    } catch {
      showToast("Couldn't save — storage is unavailable");
    }
  };

  const reset = () => {
    const preset = SHADER_PRESETS.find((p) => p.name === activePreset) ?? SHADER_PRESETS[0];
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
  const filteredPresets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? SHADER_PRESETS.filter((p) => `${p.name} ${p.tag} ${p.project.generator}`.toLowerCase().includes(q)) : SHADER_PRESETS;
  }, [query]);

  const sectionMeta = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const gradient = `linear-gradient(90deg, ${project.palette.join(", ")})`;
  const canvasW = canvasRef.current?.width ?? 0;
  const canvasH = canvasRef.current?.height ?? 0;
  const generatorLabel = `${generator.name}${project.overlay.enabled ? ` + ${GENERATOR_MAP[project.overlay.generator].name}` : ""}`;

  /* ───────── panels ───────── */

  const renderSection = (): ReactNode => {
    switch (section) {
      case "presets":
        return (
          <>
            <div className="preset-search">
              <input
                type="search"
                placeholder="Search presets or generators…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search presets"
              />
              <small>{filteredPresets.length}</small>
            </div>
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
            {filteredPresets.length === 0 && <p className="field-help">No preset matches “{query}”.</p>}
            <button type="button" className="svg-upload-button" onClick={surprise}>
              <span>⚄</span> Surprise me
            </button>
            <SoftTip>
              Every preset is just a <b>project</b>: a generator, a palette and a few settings. Change anything and export the result.
            </SoftTip>
          </>
        );

      case "field":
        return (
          <>
            <GeneratorPicker
              value={project.generator}
              onPick={(id) => {
                update("generator", id);
                update("knobs", defaultKnobs(id));
              }}
            />
            <div className="control-divider" />
            <KnobSliders id={project.generator} knobs={project.knobs} onChange={setKnob} />
            <button type="button" className="text-action" onClick={() => update("knobs", defaultKnobs(project.generator))}>
              Reset knobs
            </button>
          </>
        );

      case "layers":
        return (
          <>
            <ToggleRow
              title="Overlay layer"
              description="Blend a second generator over the base field"
              enabled={project.overlay.enabled}
              onChange={(enabled) => updateOverlay({ enabled })}
            />
            {project.overlay.enabled && (
              <>
                <GeneratorPicker
                  value={project.overlay.generator}
                  onPick={(id) => updateOverlay({ generator: id, knobs: defaultKnobs(id) })}
                />
                <div className="control-divider" />
                <ChoiceGroup label="Blend mode" value={project.overlay.blend} options={BLEND_MODES} onChange={(blend) => updateOverlay({ blend })} />
                <RangeControl label="Opacity" {...range("overlayOpacity")} value={project.overlay.opacity} onChange={(opacity) => updateOverlay({ opacity })} />
                <RangeControl label="Zoom" {...range("overlayScale")} value={project.overlay.scale} onChange={(scale) => updateOverlay({ scale })} />
                <RangeControl label="Speed" {...range("overlaySpeed")} value={project.overlay.speed} onChange={(speed) => updateOverlay({ speed })} />
                <RangeControl label="Palette offset" {...range("overlayShift")} value={project.overlay.shift} onChange={(shift) => updateOverlay({ shift })} />
                <div className="control-divider" />
                <KnobSliders id={project.overlay.generator} knobs={project.overlay.knobs} onChange={setOverlayKnob} />
              </>
            )}
            <SoftTip>
              The overlay uses the same palette. Try <b>Starfield + Add</b> over aurora, or <b>Bokeh + Screen</b> over rays.
            </SoftTip>
          </>
        );

      case "motion":
        return (
          <>
            <ToggleRow
              title={project.playing ? "Playing" : "Paused"}
              description="Freeze or run the animation clock"
              enabled={project.playing}
              onChange={(playing) => update("playing", playing)}
            />
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
            <div className="gradient-bar" style={{ background: gradient }} />
            <div className="palette-list">
              {project.palette.map((color, index) => (
                <div className="palette-color" key={index}>
                  <span className="color-control">Stop {index + 1}</span>
                  <span className="color-input-wrap">
                    <input type="color" value={color} aria-label={`Palette stop ${index + 1}`} onChange={(event) => setPaletteColor(index, event.target.value)} />
                    <code>{color.toUpperCase()}</code>
                    {project.palette.length > MIN_PALETTE && (
                      <button type="button" className="palette-remove" aria-label={`Remove stop ${index + 1}`} onClick={() => removePaletteColor(index)}>
                        ×
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="export-actions separate-files">
              <button type="button" className="text-action palette-add" disabled={project.palette.length >= MAX_PALETTE} onClick={addPaletteColor}>
                + Add stop
              </button>
              <button type="button" className="text-action" onClick={() => setPalette([...project.palette].reverse())}>
                ⇄ Reverse
              </button>
              <button
                type="button"
                className="text-action"
                onClick={() => {
                  const next = randomPalette();
                  update("palette", next.palette);
                  update("accent", next.accent);
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
                  onClick={() => {
                    update("palette", [...p.colors]);
                    update("accent", p.accent);
                  }}
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
        return (
          <>
            <ChoiceGroup label="Pointer mode" value={project.interaction} options={INTERACTION_MODES} onChange={(mode) => update("interaction", mode)} />
            {slider("interactionRadius", "Radius")}
            {slider("interactionStrength", "Strength")}
            <ToggleRow title="Click ripples" description="Press anywhere to send out a shockwave" enabled={project.ripples} onChange={(value) => update("ripples", value)} />
            <ToggleRow title="Idle drift" description="The pointer wanders by itself when you stop moving" enabled={project.idleDrift} onChange={(value) => update("idleDrift", value)} />
            <div className="interaction-card">
              <span className="interaction-icon">⌖</span>
              <div>
                <b>{project.interaction === "Off" ? "Pointer ignored" : `${project.interaction} mode`}</b>
                <p>
                  {project.interaction === "Stir" && "The field swirls around your cursor."}
                  {project.interaction === "Attract" && "The field bulges toward your cursor like a lens."}
                  {project.interaction === "Repel" && "The field is pushed away from your cursor."}
                  {project.interaction === "Light" && "Your cursor becomes a light source — it brightens the surface and moves the highlight."}
                  {project.interaction === "Off" && "Only ripples (if enabled) react to input."}
                  {" "}Hold the button down for a stronger pull. Black holes feed on it.
                </p>
              </div>
            </div>
          </>
        );
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
          <span className="tab-hint">{s.hint}</span>
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
