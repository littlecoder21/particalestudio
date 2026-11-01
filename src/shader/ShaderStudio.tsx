import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
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
import {
  EXPORT_FORMATS,
  buildProjectZip,
  extractProject,
  generateShaderCode,
  slugify,
  type ExportFormatId,
} from "./exporter";
import { GENERATORS, GENERATOR_MAP, defaultKnobs } from "./generators";
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

type SectionId = "presets" | "field" | "layers" | "motion" | "color" | "surface" | "effects" | "touch" | "export";

const SECTIONS: Array<{ id: SectionId; icon: string; label: string; hint: string; title: string; description: string }> = [
  { id: "presets", icon: "✦", label: "Presets", hint: `${SHADER_PRESETS.length} looks`, title: "Ready-made looks", description: "Start from a finished shader, then make it yours." },
  { id: "field", icon: "◎", label: "Field", hint: "Generator", title: "Base generator", description: "Pick the procedural field and shape it with four knobs." },
  { id: "layers", icon: "◧", label: "Layers", hint: "Overlay", title: "Stack a second layer", description: "Blend another generator on top for depth." },
  { id: "motion", icon: "↻", label: "Motion", hint: "Time & warp", title: "Time & warp", description: "Speed, rotation, symmetry and domain distortion." },
  { id: "color", icon: "◐", label: "Color", hint: "Palette", title: "Palette & grade", description: "Build the gradient and grade the final image." },
  { id: "surface", icon: "◈", label: "Surface", hint: "Light", title: "Light & relief", description: "Turn the field into a lit, glossy surface." },
  { id: "effects", icon: "✧", label: "Effects", hint: "Post FX", title: "Post effects", description: "Lens, film and retro finishing touches." },
  { id: "touch", icon: "⌖", label: "Touch", hint: "Pointer", title: "Pointer & ripples", description: "How the shader reacts to your cursor." },
  { id: "export", icon: "⇪", label: "Export", hint: "Code & media", title: "Export", description: "Code, project files, images and video." },
];

const CATEGORY_ICON: Record<GeneratorCategory, string> = { Fluid: "≈", Cosmic: "✺", Light: "☀", Pattern: "▦" };

const IMAGE_SIZES = [
  { id: "preview", label: "Preview size", w: 0, h: 0 },
  { id: "720", label: "1280 × 720", w: 1280, h: 720 },
  { id: "1080", label: "1920 × 1080", w: 1920, h: 1080 },
  { id: "1440", label: "2560 × 1440", w: 2560, h: 1440 },
  { id: "4k", label: "3840 × 2160", w: 3840, h: 2160 },
] as const;
type ImageSizeId = (typeof IMAGE_SIZES)[number]["id"];

const STORAGE_KEY = "particle-studio-shader-project";

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

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const downloadText = (text: string, filename: string, mime: string): void =>
  downloadBlob(new Blob([text], { type: mime }), filename);

const isMobile = (): boolean => typeof matchMedia === "function" && matchMedia("(max-width: 720px)").matches;

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
  const [project, setProject] = useState<ShaderProject>(
    () => saved?.project ?? cloneProject(SHADER_PRESETS[0]?.project ?? DEFAULT_PROJECT),
  );
  const [activePreset, setActivePreset] = useState<string>(saved ? saved.preset : (SHADER_PRESETS[0]?.name ?? ""));
  const [section, setSection] = useState<SectionId>("presets");
  const [collapsed, setCollapsed] = useState<boolean>(isMobile);
  const [isSaved, setIsSaved] = useState<boolean>(saved !== null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [stats, setStats] = useState<RendererStats>({ fps: 60, quality: 1 });
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [codeFormat, setCodeFormat] = useState<ExportFormatId>("standaloneHtml");
  const [imageSize, setImageSize] = useState<ImageSizeId>("1080");
  const [videoSeconds, setVideoSeconds] = useState(6);
  const [videoFps, setVideoFps] = useState(60);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ShaderRenderer | null>(null);
  const projectRef = useRef(project);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const toastTimer = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(
    () => () => {
      window.clearTimeout(toastTimer.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    },
    [],
  );

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

  const copyCode = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard");
    } catch {
      showToast("Copy failed — select the code and copy manually");
    }
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = normalizeProject(extractProject(await file.text()));
      applyProject(next, "");
      showToast(`Loaded ${next.name}`);
    } catch {
      showToast("That file isn't a Shader Studio project");
    }
  };

  const exportImage = async () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const size = IMAGE_SIZES.find((s) => s.id === imageSize) ?? IMAGE_SIZES[0];
    const w = size.w || renderer.canvas.width;
    const h = size.h || renderer.canvas.height;
    const blob = await renderer.snapshot(w, h);
    if (!blob) {
      showToast("Couldn't render the image");
      return;
    }
    downloadBlob(blob, `${slugify(project.name)}-${w}x${h}.png`);
    showToast(`PNG saved · ${w} × ${h}`);
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  };

  const startRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas || typeof MediaRecorder === "undefined" || typeof canvas.captureStream !== "function") {
      showToast("Video recording isn't supported in this browser");
      return;
    }
    const stream = canvas.captureStream(videoFps);
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 12_000_000 } : undefined);
    const chunks: Blob[] = [];
    const started = performance.now();
    const timer = window.setInterval(() => {
      const ratio = (performance.now() - started) / (videoSeconds * 1000);
      setProgress(Math.min(1, ratio));
      if (ratio >= 1 && recorder.state !== "inactive") recorder.stop();
    }, 100);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      window.clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      setRecording(false);
      setProgress(0);
      if (chunks.length > 0) {
        downloadBlob(new Blob(chunks, { type: "video/webm" }), `${slugify(project.name)}.webm`);
        showToast("WebM video saved");
      }
    };
    recorder.start(250);
    recorderRef.current = recorder;
    setRecording(true);
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

  const code = useMemo(
    () => (active && section === "export" ? generateShaderCode(project) : null),
    [active, section, project],
  );
  const currentFormat = EXPORT_FORMATS.find((f) => f.id === codeFormat) ?? EXPORT_FORMATS[0];
  const currentCode = code ? code[codeFormat] : "";
  const sectionMeta = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const gradient = `linear-gradient(90deg, ${project.palette.join(", ")})`;
  const canvasW = canvasRef.current?.width ?? 0;
  const canvasH = canvasRef.current?.height ?? 0;

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

      case "export":
        return (
          <>
            <div className="export-card">
              <div className="export-card-heading">
                <b>Code</b>
                <small>Runs anywhere WebGL2 does. The shader and every setting are embedded.</small>
              </div>
              <label className="svg-select-control code-format-select">
                Format
                <select value={codeFormat} onChange={(event) => setCodeFormat(event.target.value as ExportFormatId)}>
                  {EXPORT_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <textarea className="code-preview" readOnly spellCheck={false} value={currentCode} aria-label="Generated code" />
              <div className="export-actions">
                <button type="button" className="svg-upload-button" onClick={() => void copyCode(currentCode)}>
                  Copy
                </button>
                <button
                  type="button"
                  className="svg-upload-button"
                  onClick={() => {
                    downloadText(currentCode, currentFormat.file, currentFormat.mime);
                    showToast(`${currentFormat.file} downloaded`);
                  }}
                >
                  Download
                </button>
              </div>
              <button
                type="button"
                className="svg-upload-button"
                onClick={() => {
                  downloadBlob(buildProjectZip(project), `${slugify(project.name)}.zip`);
                  showToast("ZIP downloaded");
                }}
              >
                <span>⇪</span> Download ZIP (HTML · CSS · JS · GLSL · React)
              </button>
              <div className="export-actions separate-files">
                {EXPORT_FORMATS.filter((f) => f.id !== "standaloneHtml").map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="text-action"
                    onClick={() => {
                      if (!code) return;
                      downloadText(code[f.id], f.file, f.mime);
                      showToast(`${f.file} downloaded`);
                    }}
                  >
                    {f.file}
                  </button>
                ))}
              </div>
            </div>

            <div className="export-card">
              <div className="export-card-heading">
                <b>Project file</b>
                <small>Save the full project as JSON and load it back any time.</small>
              </div>
              <div className="export-actions">
                <button
                  type="button"
                  className="svg-upload-button"
                  onClick={() => {
                    downloadText(generateShaderCode(project).json, `${slugify(project.name)}.json`, "application/json");
                    showToast("Project JSON downloaded");
                  }}
                >
                  Save JSON
                </button>
                <button type="button" className="svg-upload-button" onClick={() => fileInputRef.current?.click()}>
                  Load JSON
                </button>
              </div>
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  void loadFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>

            <div className="export-card">
              <div className="export-card-heading">
                <b>Image</b>
                <small>Renders the current frame at full resolution, independent of your screen.</small>
              </div>
              <label className="svg-select-control code-format-select">
                Size
                <select value={imageSize} onChange={(event) => setImageSize(event.target.value as ImageSizeId)}>
                  {IMAGE_SIZES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="svg-upload-button" onClick={() => void exportImage()}>
                Download PNG
              </button>
            </div>

            <div className="export-card">
              <div className="export-card-heading">
                <b>Video</b>
                <small>Records the live canvas to a WebM file.</small>
              </div>
              <div className="video-options">
                <label className="svg-select-control">
                  Length
                  <select value={videoSeconds} onChange={(event) => setVideoSeconds(Number(event.target.value))} disabled={recording}>
                    {[3, 6, 10, 15].map((s) => (
                      <option key={s} value={s}>
                        {s} seconds
                      </option>
                    ))}
                  </select>
                </label>
                <label className="svg-select-control">
                  Frame rate
                  <select value={videoFps} onChange={(event) => setVideoFps(Number(event.target.value))} disabled={recording}>
                    <option value={30}>30 fps</option>
                    <option value={60}>60 fps</option>
                  </select>
                </label>
              </div>
              {recording && (
                <div className="record-progress">
                  <i style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              )}
              <button type="button" className={`svg-upload-button ${recording ? "recording-button" : ""}`} onClick={recording ? stopRecording : startRecording}>
                {recording ? "■ Stop & save" : "● Record WebM"}
              </button>
            </div>
          </>
        );
    }
  };

  /* ───────── layout ───────── */

  return (
    <div className="studio shader-studio">
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
        <div className="project-title">
          <span className="live-dot" />
          {project.name}
          <span className="saved-badge">{isSaved ? "Saved" : "Draft"}</span>
        </div>
        <div className="top-actions">
          <button type="button" className="quiet-button" onClick={save} aria-label="Save shader">
            <span>▣</span>
            <span className="desktop-label">Save</span>
          </button>
          <button
            type="button"
            className="export-button"
            onClick={() => {
              setSection("export");
              setCollapsed(false);
            }}
          >
            <span>↥</span> Export
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="preview-area">
          <div className="preview-head">
            <div>
              <span className="eyebrow">LIVE SHADER</span>
              <span className="canvas-name">
                <input
                  className="shader-name-input"
                  value={project.name}
                  maxLength={60}
                  aria-label="Shader name"
                  onChange={(event) => update("name", event.target.value)}
                />
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

          <div className="canvas-wrap" ref={wrapRef}>
            <canvas ref={canvasRef} aria-label={`${generator.name} shader preview`} />
            <div className="canvas-caption">
              <i className="pulse-dot" />
              LIVE SHADER <span className="caption-divider">|</span> {generator.name.toUpperCase()}
            </div>
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
        </section>

        <button
          type="button"
          className={`collapse-floating ${collapsed ? "" : "menu-open"}`}
          onClick={() => setCollapsed((value) => !value)}
        >
          <span>{collapsed ? "✦" : "⌄"}</span>
          {collapsed ? "Customize" : "Hide"}
        </button>

        <aside className={`control-dock ${collapsed ? "collapsed" : ""}`}>
          <div className="dock-handle" role="button" tabIndex={0} aria-label="Toggle controls" onClick={() => setCollapsed((value) => !value)}>
            <span />
          </div>
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
              <div className="control-scroll" key={section}>
                <SectionHeading
                  number={String(SECTIONS.findIndex((s) => s.id === section) + 1).padStart(2, "0")}
                  title={sectionMeta.title}
                  description={sectionMeta.description}
                />
                {renderSection()}
              </div>
              <footer className="dock-footer">
                <span>
                  <span className="sparkle">✦</span>
                  {generator.name}
                  {project.overlay.enabled ? ` + ${GENERATOR_MAP[project.overlay.generator].name}` : ""}
                </span>
                <button type="button" onClick={reset}>
                  Reset <span>↺</span>
                </button>
              </footer>
            </>
          )}
        </aside>
      </main>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
