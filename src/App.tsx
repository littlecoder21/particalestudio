import { useEffect, useMemo, useRef, useState } from "react";
import {
  startParticleEngine,
  type Emitter,
  type Interaction,
  type Motion,
  type ParticleSettings,
  type ParticleShape,
  type BoundsMode,
  type PopulationMode,
  type SvgMorphEasing,
  type SvgMorphType,
} from "./particleEngine";
import { additionalPresets } from "./additionalPresets";
import { generatorLibrary, type GeneratorCategory } from "./generators";
import { availableEffects, isParticleEffect, type ParticleEffect } from "./effects";
import { generateCodeExport } from "./codeExport";
import {
  parseSvgSource,
  sampleSvgSource,
  type SvgDistribution,
  type SvgSamplePoint,
  type SvgSamplingMode,
  type SvgSource,
} from "./svgSource";

type SectionId = "presets" | "create" | "generator" | "effects" | "motion" | "physics" | "look" | "background" | "touch" | "export";

const initialSettings: ParticleSettings = {
  count: 420,
  emitter: "Circle",
  generator: "Source Shape",
  effects: [],
  motion: "Flow",
  shape: "Circle",
  interaction: "Repel",
  color: "#78d8ff",
  accent: "#bd8cff",
  palette: ["#78d8ff", "#bd8cff"],
  size: 2.3,
  speed: 1.4,
  spread: 78,
  gravity: 0,
  physicsEnabled: true,
  drag: 0.986,
  turbulence: 0.35,
  vortex: 0.18,
  bounce: 0.45,
  boundsMode: "Bounce",
  populationMode: "Steady",
  populationRate: 36,
  svgMorphEnabled: false,
  svgMorphType: "Direct",
  svgMorphDuration: 3,
  svgMorphInitialDelay: 1.5,
  svgMorphHoldDuration: 1,
  svgMorphEasing: "Ease In Out",
  svgMorphTurbulence: 0,
  svgMorphLoop: true,
  svgMorphPingPong: false,
  preserveSvgColors: true,
  interactionRadius: 150,
  interactionStrength: 0.38,
  opacity: 0.9,
  glow: 12,
  customShapePath: "M50 0 L61 36 L100 50 L61 64 L50 100 L39 64 L0 50 L39 36 Z",
  backgroundMode: "Solid",
  backgroundColor: "#090b12",
  backgroundAccent: "#1d1635",
  ambientLight: 20,
  lightColor: "#8871ff",
  showGrid: false,
  trails: false,
  interactive: true,
  playing: true,
};

const presets: Array<{ name: string; tag: string; color: string; accent: string; settings: Partial<ParticleSettings> }> = [
  {
    name: "Stardust",
    tag: "Soft & dreamy",
    color: "#78d8ff",
    accent: "#bd8cff",
    settings: { count: 420, emitter: "Circle", motion: "Flow", spread: 78, speed: 1.4, size: 2.3, glow: 12, gravity: 0 },
  },
  {
    name: "Fireflies",
    tag: "Slow & magical",
    color: "#f5f28a",
    accent: "#8cecb8",
    settings: { count: 140, emitter: "Point", motion: "Float", spread: 92, speed: 0.65, size: 2.6, glow: 20, gravity: -0.02 },
  },
  {
    name: "Vortex",
    tag: "Spinning energy",
    color: "#f28cff",
    accent: "#6d9cff",
    settings: { count: 600, emitter: "Ring", motion: "Orbit", spread: 74, speed: 1.6, size: 1.8, glow: 15, gravity: 0 },
  },
  {
    name: "Cosmic burst",
    tag: "Bright & bold",
    color: "#ffbd75",
    accent: "#ff6d9e",
    settings: { count: 500, emitter: "Point", motion: "Burst", spread: 85, speed: 2.2, size: 2.1, glow: 18, gravity: 0.01 },
  },
  {
    name: "Summer rain",
    tag: "Calm & flowing",
    color: "#82aaff",
    accent: "#91e4f2",
    settings: { count: 220, emitter: "Line", motion: "Flow", spread: 86, speed: 0.8, size: 1.6, glow: 5, gravity: 0.035 },
  },
];
const allPresets = [...presets, ...additionalPresets];

function isValidCustomShapePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000 || !value.trim()) return false;
  try {
    new Path2D(value);
    return true;
  } catch {
    return false;
  }
}

function isParticleSettings(value: unknown): value is ParticleSettings {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const inRange = (key: string, min: number, max: number) =>
    typeof candidate[key] === "number" && candidate[key] >= min && candidate[key] <= max;
  const isOneOf = (key: string, options: readonly string[]) =>
    typeof candidate[key] === "string" && options.includes(candidate[key]);

  return (
    inRange("count", 80, 1200) &&
    isOneOf("emitter", ["Point", "Circle", "Ring", "Line", "Fountain", "SVG"]) &&
    isOneOf("generator", ["Source Shape", ...generatorLibrary.flatMap((group) => group.generators)]) &&
    Array.isArray(candidate.effects) && candidate.effects.every(isParticleEffect) &&
    isOneOf("motion", ["Off", "Float", "Orbit", "Flow", "Burst"]) &&
    isOneOf("shape", ["Circle", "Square", "Diamond", "Star", "Triangle", "Pentagon", "Hexagon", "Polygon", "Heart", "Sparkle", "Ring", "Cross", "Custom"]) &&
    isOneOf("interaction", ["Repel", "Attract", "Swirl", "Off"]) &&
    typeof candidate.color === "string" && /^#[\da-f]{6}$/i.test(candidate.color) &&
    typeof candidate.accent === "string" && /^#[\da-f]{6}$/i.test(candidate.accent) &&
    Array.isArray(candidate.palette) && candidate.palette.length >= 2 && candidate.palette.length <= 8 &&
    candidate.palette.every((color) => typeof color === "string" && /^#[\da-f]{6}$/i.test(color)) &&
    inRange("size", 0.7, 7) &&
    inRange("speed", 0.2, 4) &&
    inRange("spread", 10, 100) &&
    inRange("gravity", -0.1, 0.12) &&
    inRange("drag", 0.9, 1) &&
    inRange("turbulence", 0, 2) &&
    inRange("vortex", 0, 2) &&
    inRange("bounce", 0, 1) &&
    isOneOf("boundsMode", ["Bounce", "Wrap", "Contain", "Escape"]) &&
    isOneOf("populationMode", ["Steady", "Grow", "Shrink"]) &&
    inRange("populationRate", 1, 300) &&
    typeof candidate.svgMorphEnabled === "boolean" &&
    isOneOf("svgMorphType", ["Direct", "Dissolve", "Scatter"]) &&
    inRange("svgMorphDuration", 0.25, 30) &&
    inRange("svgMorphInitialDelay", 0, 60) &&
    inRange("svgMorphHoldDuration", 0, 60) &&
    isOneOf("svgMorphEasing", ["Linear", "Ease In Out", "Ease Out"]) &&
    inRange("svgMorphTurbulence", 0, 100) &&
    typeof candidate.svgMorphLoop === "boolean" &&
    typeof candidate.svgMorphPingPong === "boolean" &&
    typeof candidate.preserveSvgColors === "boolean" &&
    inRange("interactionRadius", 40, 400) &&
    inRange("interactionStrength", 0.05, 1.5) &&
    inRange("opacity", 0.15, 1) &&
    inRange("glow", 0, 32) &&
    typeof candidate.customShapePath === "string" && candidate.customShapePath.length <= 2000 &&
    (candidate.shape !== "Custom" || isValidCustomShapePath(candidate.customShapePath)) &&
    isOneOf("backgroundMode", ["Solid", "Gradient", "Transparent"]) &&
    typeof candidate.backgroundColor === "string" && /^#[\da-f]{6}$/i.test(candidate.backgroundColor) &&
    typeof candidate.backgroundAccent === "string" && /^#[\da-f]{6}$/i.test(candidate.backgroundAccent) &&
    inRange("ambientLight", 0, 100) &&
    typeof candidate.lightColor === "string" && /^#[\da-f]{6}$/i.test(candidate.lightColor) &&
    typeof candidate.showGrid === "boolean" &&
    typeof candidate.physicsEnabled === "boolean" &&
    typeof candidate.trails === "boolean" &&
    typeof candidate.interactive === "boolean" &&
    typeof candidate.playing === "boolean"
  );
}

function restoreSvgSource(value: unknown): SvgSource | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") throw new Error("Saved SVG source data is invalid.");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.markup !== "string" || typeof candidate.name !== "string") {
    throw new Error("Saved SVG source data is incomplete.");
  }
  const source = parseSvgSource(candidate.markup, candidate.name);
  if (candidate.mode === "Outline" || candidate.mode === "Fill" || candidate.mode === "Combined") {
    source.mode = candidate.mode;
  }
  if (
    candidate.distribution === "Uniform" ||
    candidate.distribution === "Random" ||
    candidate.distribution === "Weighted" ||
    candidate.distribution === "Density"
  ) {
    source.distribution = candidate.distribution;
  }
  if (typeof candidate.selectedPath === "string" &&
      (candidate.selectedPath === "all" || source.paths.some((path) => path.id === candidate.selectedPath))) {
    source.selectedPath = candidate.selectedPath;
  }
  if (typeof candidate.spacing === "number" && candidate.spacing >= 2 && candidate.spacing <= 32) {
    source.spacing = candidate.spacing;
  }
  return source;
}

function restoreSvgSources(value: unknown): SvgSource[] {
  if (!Array.isArray(value)) return [];
  return value.map(restoreSvgSource).filter((source): source is SvgSource => source !== null);
}

function resolveSvgSelection(selection: string, sources: SvgSource[]): SvgSource | null {
  try {
    const parsed: unknown = JSON.parse(selection);
    if (!Array.isArray(parsed) || typeof parsed[0] !== "number" || typeof parsed[1] !== "string") return null;
    const source = sources[parsed[0]];
    if (!source || (parsed[1] !== "all" && !source.paths.some((path) => path.id === parsed[1]))) return null;
    return { ...source, selectedPath: parsed[1] };
  } catch {
    return null;
  }
}

function readSavedProject(): {
  preset: string;
  settings: ParticleSettings;
  svgSources: SvgSource[];
  activeSvgIndex: number;
  morphSequence: string[];
} | null {
  try {
    const saved = localStorage.getItem("particle-studio-project");
    if (!saved) return null;
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") throw new Error("Saved project data is invalid.");
    const project = parsed as Record<string, unknown>;
    if (!project.settings || typeof project.settings !== "object") throw new Error("Saved particle settings are invalid.");
    const settings = { ...initialSettings, ...(project.settings as Partial<ParticleSettings>) };
    if (!Array.isArray(settings.palette)) settings.palette = [settings.color, settings.accent];
    if (!isParticleSettings(settings)) throw new Error("Saved particle settings are invalid.");
    const svgSources = restoreSvgSources(project.svgSources);
    if (svgSources.length === 0) {
      const legacySource = restoreSvgSource(project.svgSource);
      if (legacySource) svgSources.push(legacySource);
    }
    const activeSvgIndex = typeof project.activeSvgIndex === "number" &&
      project.activeSvgIndex >= 0 && project.activeSvgIndex < svgSources.length
      ? project.activeSvgIndex
      : 0;
    return {
      preset: typeof project.preset === "string" ? project.preset : "Stardust",
      settings,
      svgSources,
      activeSvgIndex,
      morphSequence: Array.isArray(project.morphSequence)
        ? project.morphSequence.filter((selection): selection is string =>
          typeof selection === "string" && resolveSvgSelection(selection, svgSources) !== null).slice(0, 15)
        : typeof project.morphSvgSelection === "string" &&
          resolveSvgSelection(project.morphSvgSelection, svgSources)
          ? [project.morphSvgSelection]
          : [],
    };
  } catch (error) {
    console.error("Could not load the saved particle project.", error);
    return null;
  }
}

const sections: Array<{ id: SectionId; label: string; icon: string; hint: string }> = [
  { id: "presets", label: "Presets", icon: "✦", hint: "Ready-made looks" },
  { id: "create", label: "Create", icon: "✳", hint: "Source & amount" },
  { id: "generator", label: "Generate", icon: "✺", hint: "Formation library" },
  { id: "effects", label: "Effects", icon: "✧", hint: "Add visual effects" },
  { id: "motion", label: "Motion", icon: "↗", hint: "Movement styles" },
  { id: "physics", label: "Physics", icon: "◌", hint: "Forces & bounce" },
  { id: "look", label: "Look", icon: "◉", hint: "Color & style" },
  { id: "background", label: "Scene", icon: "▧", hint: "Light & backdrop" },
  { id: "touch", label: "Touch", icon: "☝", hint: "Interactive controls" },
  { id: "export", label: "Export", icon: "⇧", hint: "Code & video" },
];

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-control">
      <span className="range-title">
        <span>{label}</span>
        <span className="range-value">{value}{suffix}</span>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="choice-control">
      <span className="control-label">{label}</span>
      <div className="choice-grid" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            type="button"
            className={`choice-button ${value === option ? "selected" : ""}`}
            aria-pressed={value === option}
            key={option}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgInputRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef(initialSettings);
  const svgPointsRef = useRef<SvgSamplePoint[]>([]);
  const svgSequencePointsRef = useRef<readonly (readonly SvgSamplePoint[])[]>([]);
  const [savedProject] = useState(readSavedProject);
  const [settings, setSettings] = useState(savedProject?.settings ?? initialSettings);
  const [svgSources, setSvgSources] = useState<SvgSource[]>(savedProject?.svgSources ?? []);
  const [activeSvgIndex, setActiveSvgIndex] = useState(savedProject?.activeSvgIndex ?? 0);
  const [morphSequence, setMorphSequence] = useState(savedProject?.morphSequence ?? []);
  const [nextMorphSelection, setNextMorphSelection] = useState("");
  const svgSource = svgSources[activeSvgIndex] ?? null;
  const morphTargets = useMemo(
    () => morphSequence.map((selection) => resolveSvgSelection(selection, svgSources)),
    [morphSequence, svgSources],
  );
  const [svgPoints, setSvgPoints] = useState<SvgSamplePoint[]>([]);
  const [svgSequencePoints, setSvgSequencePoints] = useState<readonly (readonly SvgSamplePoint[])[]>([]);
  const [isSamplingSvg, setIsSamplingSvg] = useState(false);
  const [isSamplingSvgSequence, setIsSamplingSvgSequence] = useState(false);
  const [svgError, setSvgError] = useState("");
  const [activeSection, setActiveSection] = useState<SectionId>("presets");
  const [generatorCategory, setGeneratorCategory] = useState<GeneratorCategory>("Geometric");
  const [menuOpen, setMenuOpen] = useState(true);
  const [activePreset, setActivePreset] = useState(savedProject?.preset ?? "Stardust");
  const [presetQuery, setPresetQuery] = useState("");
  const [morphSequenceError, setMorphSequenceError] = useState("");
  const [fps, setFps] = useState(60);
  const [particleCount, setParticleCount] = useState(
    savedProject?.settings.populationMode === "Grow" ? 0 : savedProject?.settings.count ?? initialSettings.count,
  );
  const [notice, setNotice] = useState("");
  const [isSaved, setIsSaved] = useState(savedProject !== null);
  const [codeFormat, setCodeFormat] = useState<"standaloneHtml" | "html" | "css" | "javascript">("standaloneHtml");
  const [recording, setRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(5);
  const [recordFps, setRecordFps] = useState(30);
  const [recordProgress, setRecordProgress] = useState(0);
  const [customPathError, setCustomPathError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordTimeoutRef = useRef<number | null>(null);
  const recordIntervalRef = useRef<number | null>(null);
  const recordStartedAtRef = useRef(0);
  const generatedCode = useMemo(
    () => generateCodeExport(settings, svgPoints, svgSequencePoints),
    [settings, svgPoints, svgSequencePoints],
  );

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    svgPointsRef.current = svgPoints;
  }, [svgPoints]);

  useEffect(() => {
    svgSequencePointsRef.current = svgSequencePoints;
  }, [svgSequencePoints]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startParticleEngine(
      canvas,
      () => settingsRef.current,
      (nextFps, nextParticleCount) => {
        setFps(nextFps);
        setParticleCount(nextParticleCount);
      },
      () => svgPointsRef.current,
        () => svgSequencePointsRef.current,
    );
  }, []);

  useEffect(() => {
    if (!svgSource) {
      setSvgPoints([]);
      setIsSamplingSvg(false);
      return;
    }

    let cancelled = false;
    setIsSamplingSvg(true);
    setSvgError("");
    sampleSvgSource(svgSource, settings.count)
      .then((points) => {
        if (!cancelled) setSvgPoints(points);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSvgPoints([]);
          setSvgError(error instanceof Error ? error.message : "Could not sample this SVG.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsSamplingSvg(false);
      });

    return () => {
      cancelled = true;
    };
  }, [svgSource, settings.count]);

  useEffect(() => {
    if (morphTargets.length === 0 || morphTargets.some((source) => source === null)) {
      setSvgSequencePoints([]);
      setIsSamplingSvgSequence(false);
      return;
    }
    let cancelled = false;
    setIsSamplingSvgSequence(true);
    Promise.all(morphTargets.map((source) => sampleSvgSource(source!, settings.count)))
      .then((points) => {
        if (!cancelled) setSvgSequencePoints(points);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSvgSequencePoints([]);
          setMorphSequenceError(error instanceof Error ? error.message : "Could not sample the morph sequence.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsSamplingSvgSequence(false);
      });
    return () => {
      cancelled = true;
    };
  }, [morphTargets, settings.count]);

  useEffect(() => {
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => () => {
    if (recordTimeoutRef.current !== null) window.clearTimeout(recordTimeoutRef.current);
    if (recordIntervalRef.current !== null) window.clearInterval(recordIntervalRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const update = <K extends keyof ParticleSettings>(key: K, value: ParticleSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setIsSaved(false);
  };

  const updateSvgSource = <K extends "selectedPath" | "mode" | "distribution" | "spacing">(
    key: K,
    value: SvgSource[K],
  ) => {
    setSvgSources((current) => current.map((source, index) =>
      index === activeSvgIndex ? { ...source, [key]: value } : source,
    ));
    setIsSaved(false);
  };

  const importSvgFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const imported: SvgSource[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      try {
        imported.push(parseSvgSource(await file.text(), file.name));
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : "Could not import this SVG."}`);
      }
    }
    if (imported.length > 0) {
      const firstAddedIndex = svgSources.length;
      setSvgSources((current) => [...current, ...imported]);
      if (svgSources.length === 0) setActiveSvgIndex(firstAddedIndex);
      const targetIndices = svgSources.length > 0
        ? imported.map((_, index) => firstAddedIndex + index)
        : imported.slice(1).map((_, index) => firstAddedIndex + index + 1);
      if (targetIndices.length > 0 && morphSequence.length < 15) {
        const availableSteps = Math.max(0, 15 - morphSequence.length);
        const addedSteps = targetIndices.slice(0, availableSteps).map((index) => JSON.stringify([index, "all"]));
        setMorphSequence((current) => [...current, ...addedSteps]);
        update("svgMorphEnabled", true);
        if (targetIndices.length > availableSteps) setMorphSequenceError("Only the first available targets were added; a sequence can contain 15 target shapes.");
      }
      setSvgError(errors.join("\n"));
      setActivePreset("");
      setActiveSection("create");
      setSettings((current) => ({ ...current, emitter: "SVG", generator: "Source Shape" }));
      setIsSaved(false);
      setNotice(`Imported ${imported.length} SVG ${imported.length === 1 ? "file" : "files"}`);
    } else {
      setSvgError(errors.join("\n") || "No SVG files were imported.");
    }
  };

  const removeSvgSource = () => {
    const remaining = svgSources.filter((_, index) => index !== activeSvgIndex);
    const remapSelection = (selection: string) => {
      try {
        const parsed = JSON.parse(selection) as unknown;
        if (!Array.isArray(parsed) || typeof parsed[0] !== "number" || typeof parsed[1] !== "string") return null;
        if (parsed[0] === activeSvgIndex) return null;
        return JSON.stringify([parsed[0] > activeSvgIndex ? parsed[0] - 1 : parsed[0], parsed[1]]);
      } catch {
        return null;
      }
    };
    const remainingSequence = morphSequence.map(remapSelection).filter((entry): entry is string => entry !== null).slice(0, 15);
    setSvgSources(remaining);
    setMorphSequence(remainingSequence);
    setActiveSvgIndex(Math.max(0, Math.min(activeSvgIndex, remaining.length - 1)));
    if (remainingSequence.length === 0) update("svgMorphEnabled", false);
    setSvgError("");
    setSettings((current) => ({ ...current, emitter: current.emitter === "SVG" ? "Circle" : current.emitter }));
    setIsSaved(false);
  };

  const applyPreset = (name: string) => {
    const preset = allPresets.find((item) => item.name === name);
    if (!preset) return;
    setActivePreset(name);
    setSettings((current) => ({
      ...current,
      ...preset.settings,
      color: preset.color,
      accent: preset.accent,
      palette: preset.settings.palette ?? [preset.color, preset.accent],
      generator: preset.settings.generator ?? "Source Shape",
    }));
    setIsSaved(false);
  };

  const updatePaletteColor = (index: number, color: string) => {
    setSettings((current) => {
      const palette = current.palette.map((entry, paletteIndex) => paletteIndex === index ? color : entry);
      return {
        ...current,
        palette,
        color: index === 0 ? color : current.color,
        accent: index === 1 ? color : current.accent,
      };
    });
    setIsSaved(false);
  };

  const addMorphStep = () => {
    if (!resolveSvgSelection(nextMorphSelection, svgSources)) {
      setMorphSequenceError("Choose a valid SVG path before adding a morph step.");
      return;
    }
    if (morphSequence.length >= 15) {
      setMorphSequenceError("A morph sequence can contain up to 15 target shapes.");
      return;
    }
    setMorphSequence((current) => [...current, nextMorphSelection]);
    setNextMorphSelection("");
    setMorphSequenceError("");
    update("svgMorphEnabled", true);
  };

  const moveMorphStep = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= morphSequence.length) return;
    setMorphSequence((current) => {
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
    setMorphSequenceError("");
    setIsSaved(false);
  };

  const removeMorphStep = (index: number) => {
    if (morphSequence.length === 1) update("svgMorphEnabled", false);
    setMorphSequence((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setMorphSequenceError("");
    setIsSaved(false);
  };

  const downloadConfig = () => {
    const blob = new Blob([JSON.stringify({ version: 6, preset: activePreset, settings, svgSources, activeSvgIndex, morphSequence }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "particle-studio-project.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Project settings exported");
  };

  const saveProject = () => {
    try {
      localStorage.setItem("particle-studio-project", JSON.stringify({
        preset: activePreset,
        settings,
        svgSources,
        activeSvgIndex,
        morphSequence,
      }));
      setIsSaved(true);
      setNotice("Project saved on this device");
    } catch (error) {
      console.error("Could not save this particle project.", error);
      setNotice("Could not save project");
    }
  };

  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        setNotice("Could not export image");
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "particle-studio.png";
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice("Preview exported as PNG");
    });
  };

  const downloadFile = (name: string, contents: string | Blob, type: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportCodeFile = () => {
    const exports: Record<typeof codeFormat, { name: string; contents: string; type: string }> = {
      standaloneHtml: { name: "particles.html", contents: generatedCode.standaloneHtml, type: "text/html" },
      html: { name: "index.html", contents: generatedCode.html, type: "text/html" },
      css: { name: "style.css", contents: generatedCode.css, type: "text/css" },
      javascript: { name: "particles.js", contents: generatedCode.javascript, type: "text/javascript" },
    };
    const file = exports[codeFormat];
    downloadFile(file.name, file.contents, `${file.type};charset=utf-8`);
    setNotice(`${file.name} downloaded`);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode[codeFormat]);
      setNotice("Code copied to clipboard");
    } catch (error) {
      console.error("Could not copy generated code.", error);
      setNotice("Clipboard access is unavailable in this browser");
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  };

  const startRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      setNotice("Video recording is not supported by this browser");
      return;
    }
    try {
      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        setNotice("This browser does not support WebM video recording");
        return;
      }
      const stream = canvas.captureStream(recordFps);
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = (event) => {
        console.error("Canvas video recording failed.", event);
        setNotice("Video recording failed");
      };
      recorder.onstop = () => {
        if (recordTimeoutRef.current !== null) window.clearTimeout(recordTimeoutRef.current);
        if (recordIntervalRef.current !== null) window.clearInterval(recordIntervalRef.current);
        recordTimeoutRef.current = null;
        recordIntervalRef.current = null;
        for (const track of stream.getTracks()) track.stop();
        recorderRef.current = null;
        setRecording(false);
        setRecordProgress(100);
        if (chunks.length === 0) {
          setNotice("No video data was captured");
          return;
        }
        downloadFile("particle-studio.webm", new Blob(chunks, { type: recorder.mimeType }), recorder.mimeType);
        setNotice("WebM video exported");
      };
      recorder.start(250);
      recordStartedAtRef.current = Date.now();
      setRecording(true);
      setRecordProgress(0);
      recordIntervalRef.current = window.setInterval(() => {
        const progress = Math.min((Date.now() - recordStartedAtRef.current) / (recordDuration * 1000), 1);
        setRecordProgress(Math.round(progress * 100));
      }, 100);
      recordTimeoutRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, recordDuration * 1000);
    } catch (error) {
      console.error("Could not start canvas video recording.", error);
      setNotice(error instanceof Error ? error.message : "Could not start video recording");
    }
  };

  const filteredPresets = allPresets.filter((preset) =>
    `${preset.name} ${preset.tag}`.toLowerCase().includes(presetQuery.trim().toLowerCase()),
  );

  const renderControls = () => {
    switch (activeSection) {
      case "presets":
        return (
          <div className="section-content">
            <div className="control-heading">
              <div><h2>Start with a little magic</h2><p>Choose from {allPresets.length} starting looks, then make them yours.</p></div>
              <span className="section-number">01</span>
            </div>
            <label className="preset-search">
              <span className="visually-hidden">Search presets</span>
              <input aria-label="Search presets" type="search" placeholder={`Search ${allPresets.length} presets…`} value={presetQuery} onChange={(event) => setPresetQuery(event.currentTarget.value)} />
              <small>{filteredPresets.length} shown</small>
            </label>
            <div className="preset-grid">
              {filteredPresets.map((preset) => (
                <button
                  type="button"
                  className={`preset-card ${activePreset === preset.name ? "active" : ""}`}
                  key={preset.name}
                  onClick={() => applyPreset(preset.name)}
                >
                  <span className="preset-swatch" style={{ "--preset-color": preset.color, "--preset-accent": preset.accent } as React.CSSProperties}>
                    <i /><i /><i /><i />
                  </span>
                  <span className="preset-name">{preset.name}</span>
                  <span className="preset-tag">{preset.tag}</span>
                </button>
              ))}
              {filteredPresets.length === 0 && <p className="field-help">No presets match that search.</p>}
            </div>
          </div>
        );
      case "create":
        return (
          <div className="section-content">
            <div className="control-heading">
              <div><h2>Set up your source</h2><p>Import a shape and choose how particles begin.</p></div>
              <span className="section-number">02</span>
            </div>
            <section className="svg-source-panel" aria-label="SVG particle source">
              <div className="svg-source-title">
                <span className="svg-source-mark">⌁</span>
                <span><b>Import and morph SVG shapes</b><small>Load multiple SVG files, choose paths, and precisely animate particles between shapes.</small></span>
              </div>
              <input
                ref={svgInputRef}
                className="visually-hidden"
                type="file"
                accept=".svg,image/svg+xml"
                multiple
                aria-label="Choose SVG files"
                onChange={(event) => {
                  void importSvgFiles(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
              {svgSource ? (
                <>
                  <label className="svg-select-control">
                    <span>Active SVG source ({svgSources.length} loaded)</span>
                    <select aria-label="Active SVG source" value={activeSvgIndex} onChange={(event) => setActiveSvgIndex(Number(event.currentTarget.value))}>
                      {svgSources.map((source, index) => <option key={`${source.name}-${index}`} value={index}>{source.name}</option>)}
                    </select>
                  </label>
                  <div className="svg-source-file">
                    <span className="svg-file-icon">SVG</span>
                    <span className="svg-file-name"><b>{svgSource.name}</b><small>{svgSource.paths.length} drawable shapes · {svgPoints.length} sampled particles</small></span>
                    <button type="button" className="svg-remove-button" onClick={removeSvgSource} aria-label="Remove SVG source">×</button>
                  </div>
                  <button type="button" className="svg-upload-button secondary" onClick={() => svgInputRef.current?.click()}>＋ Add SVG files</button>
                  <label className="svg-select-control">
                    <span>Shape to sample</span>
                    <select aria-label="Shape to sample" value={svgSource.selectedPath} onChange={(event) => updateSvgSource("selectedPath", event.currentTarget.value)}>
                      <option value="all">All shapes</option>
                      {svgSource.paths.map((path) => <option key={path.id} value={path.id}>{path.label}</option>)}
                    </select>
                  </label>
                  <ChoiceGroup<SvgSamplingMode>
                    label="Sampling area"
                    options={["Outline", "Fill", "Combined"]}
                    value={svgSource.mode}
                    onChange={(value) => updateSvgSource("mode", value)}
                  />
                  <ChoiceGroup<SvgDistribution>
                    label="Distribution"
                    options={["Uniform", "Random", "Weighted", "Density"]}
                    value={svgSource.distribution}
                    onChange={(value) => updateSvgSource("distribution", value)}
                  />
                  {svgSource.distribution === "Density" && (
                    <RangeControl label="Point spacing" value={svgSource.spacing} min={2} max={32} step={1} suffix=" px" onChange={(value) => updateSvgSource("spacing", value)} />
                  )}
                  {isSamplingSvg && <p className="svg-source-status" role="status">Sampling SVG shape…</p>}
                  {!isSamplingSvg && !svgError && svgPoints.length > 0 && <p className="svg-source-status success" role="status">{settings.preserveSvgColors ? "Source colors preserved" : "Studio palette applied"} · ready to animate</p>}
                  <div className="control-divider" />
                  <div className="morph-sequence-heading">
                    <span><b>Morph sequence</b><small>Initial form → {morphSequence.length} of 15 next forms</small></span>
                    <button type="button" className="text-action" disabled={morphSequence.length === 0} onClick={() => {
                      setMorphSequence([]);
                      update("svgMorphEnabled", false);
                    }}>Clear</button>
                  </div>
                  {morphSequence.length > 0 && (
                    <ol className="morph-sequence">
                      {morphSequence.map((selection, index) => {
                        const target = resolveSvgSelection(selection, svgSources);
                        const label = target
                          ? `${target.name} · ${target.selectedPath === "all" ? "All shapes" : target.paths.find((path) => path.id === target.selectedPath)?.label ?? "Shape"}`
                          : "Missing SVG target";
                        return (
                          <li className="morph-sequence-step" key={`${index}-${selection}`}>
                            <span className="morph-step-number">{String(index + 1).padStart(2, "0")}</span>
                            <span className="morph-step-copy"><b>{label}</b><small>Morph {index === 0 ? "from initial form" : `after step ${index}`}</small></span>
                            <div className="morph-step-actions">
                              <button type="button" aria-label={`Move morph step ${index + 1} up`} disabled={index === 0} onClick={() => moveMorphStep(index, -1)}>↑</button>
                              <button type="button" aria-label={`Move morph step ${index + 1} down`} disabled={index === morphSequence.length - 1} onClick={() => moveMorphStep(index, 1)}>↓</button>
                              <button type="button" aria-label={`Remove morph step ${index + 1}`} onClick={() => removeMorphStep(index)}>×</button>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  {svgSources.length > 0 && morphSequence.length < 15 && (
                    <div className="morph-add-row">
                      <label className="svg-select-control">
                        <span>Choose next form</span>
                        <select aria-label="Choose next morph form" value={nextMorphSelection} onChange={(event) => setNextMorphSelection(event.currentTarget.value)}>
                          <option value="">Select an SVG shape…</option>
                          {svgSources.map((source, sourceIndex) => (
                            <optgroup key={`${source.name}-${sourceIndex}`} label={source.name}>
                              <option value={JSON.stringify([sourceIndex, "all"])}>All shapes</option>
                              {source.paths.map((path) => (
                                <option key={path.id} value={JSON.stringify([sourceIndex, path.id])}>{path.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      <button type="button" className="svg-upload-button secondary" disabled={!nextMorphSelection} onClick={addMorphStep}>＋ Add step {morphSequence.length + 1}</button>
                    </div>
                  )}
                  {morphSequence.length === 15 && <p className="svg-source-status">Maximum sequence length reached (15 target shapes).</p>}
                  {morphSequence.length > 0 && (
                    <>
                      <button
                        type="button"
                        className={`toggle-row ${settings.svgMorphEnabled ? "enabled" : ""}`}
                        aria-pressed={settings.svgMorphEnabled}
                        onClick={() => update("svgMorphEnabled", !settings.svgMorphEnabled)}
                      >
                        <span><b>Play morph sequence</b><small>Follow the ordered target forms above</small></span><i className="toggle-switch" />
                      </button>
                      <ChoiceGroup<SvgMorphType>
                        label="Morph transition system"
                        options={["Direct", "Dissolve", "Scatter"]}
                        value={settings.svgMorphType}
                        onChange={(value) => update("svgMorphType", value)}
                      />
                      <p className="field-help">
                        {settings.svgMorphType === "Direct" ? "Particles travel directly between matched sample positions."
                          : settings.svgMorphType === "Dissolve" ? "Particles fade out at the midpoint, then reform into the next shape."
                            : "Particles burst outward and reassemble into the next shape."}
                      </p>
                      <RangeControl label="Morph duration" value={settings.svgMorphDuration} min={0.25} max={30} step={0.25} suffix=" s" onChange={(value) => update("svgMorphDuration", value)} />
                      <RangeControl label="Initial shape hold" value={settings.svgMorphInitialDelay} min={0} max={60} step={0.25} suffix=" s" onChange={(value) => update("svgMorphInitialDelay", value)} />
                      <RangeControl label="Hold after each shape" value={settings.svgMorphHoldDuration} min={0} max={60} step={0.25} suffix=" s" onChange={(value) => update("svgMorphHoldDuration", value)} />
                      <p className="field-help">Particles correspond by normalized sample order; unmatched points map evenly to the next shape. Delays pause on the fully formed shape between transitions.</p>
                      <ChoiceGroup<SvgMorphEasing>
                        label="Morph easing"
                        options={["Linear", "Ease In Out", "Ease Out"]}
                        value={settings.svgMorphEasing}
                        onChange={(value) => update("svgMorphEasing", value)}
                      />
                      <RangeControl label="Morph turbulence" value={settings.svgMorphTurbulence} min={0} max={100} step={1} suffix="%" onChange={(value) => update("svgMorphTurbulence", value)} />
                      <p className="field-help">Turbulence adds up to 24 px of displacement during the transition.</p>
                      <button type="button" className={`toggle-row ${settings.svgMorphLoop ? "enabled" : ""}`} onClick={() => update("svgMorphLoop", !settings.svgMorphLoop)} aria-pressed={settings.svgMorphLoop}>
                        <span><b>Loop morph</b><small>Repeat the transition continuously</small></span><i className="toggle-switch" />
                      </button>
                      {settings.svgMorphLoop && (
                        <button type="button" className={`toggle-row ${settings.svgMorphPingPong ? "enabled" : ""}`} onClick={() => update("svgMorphPingPong", !settings.svgMorphPingPong)} aria-pressed={settings.svgMorphPingPong}>
                          <span><b>Reverse on alternate loops</b><small>Morph back to the original source</small></span><i className="toggle-switch" />
                        </button>
                      )}
                      {isSamplingSvgSequence && <p className="svg-source-status" role="status">Sampling {morphSequence.length} morph targets…</p>}
                      {!isSamplingSvgSequence && settings.svgMorphEnabled && svgSequencePoints.length === morphSequence.length && <p className="svg-source-status success" role="status">Sequence ready · {svgSequencePoints.length} sampled target forms</p>}
                      {morphSequenceError && <p className="svg-source-error" role="alert">{morphSequenceError}</p>}
                    </>
                  )}
                </>
              ) : (
                <button type="button" className="svg-upload-button" onClick={() => svgInputRef.current?.click()}>
                  <span>＋</span> Import SVG files
                </button>
              )}
              {svgError && <p className="svg-source-error" role="alert">{svgError}</p>}
            </section>
            <div className="control-divider" />
            <ChoiceGroup<Emitter>
              label="Source shape (Source Shape generator)"
              options={["Point", "Circle", "Ring", "Line", "Fountain", "SVG"]}
              value={settings.emitter}
              onChange={(value) => {
                if (value === "SVG" && !svgSource) {
                  setSvgError("Import an SVG file before choosing the SVG source.");
                  return;
                }
                update("emitter", value);
              }}
            />
            <p className="field-help">Choose <b>Use source shape</b> in the Generator section for this source to control the formation.</p>
            <RangeControl label="Particle count" value={settings.count} min={80} max={1200} step={20} onChange={(value) => update("count", value)} />
            <RangeControl label="Spread" value={settings.spread} min={10} max={100} step={1} suffix="%" onChange={(value) => update("spread", value)} />
          </div>
        );
      case "generator":
        return (
          <div className="section-content">
            <div className="control-heading">
              <div><h2>Choose a formation engine</h2><p>Build a starting layout from geometry, patterns, nature or 3D space.</p></div>
              <span className="section-number">03</span>
            </div>
            <button
              type="button"
              className={`generator-source-card ${settings.generator === "Source Shape" ? "active" : ""}`}
              aria-pressed={settings.generator === "Source Shape"}
              onClick={() => {
                update("generator", "Source Shape");
                setActivePreset("");
              }}
            >
              <span className="generator-source-icon">⌁</span>
              <span><b>Use source shape</b><small>Use the selected source: circle, line, fountain or imported SVG.</small></span>
            </button>
            <ChoiceGroup<GeneratorCategory>
              label="Generator collection"
              options={generatorLibrary.map((group) => group.category)}
              value={generatorCategory}
              onChange={setGeneratorCategory}
            />
            <div className="generator-grid" aria-label={`${generatorCategory} generators`}>
              {generatorLibrary.find((group) => group.category === generatorCategory)?.generators.map((generator) => (
                <button
                  type="button"
                  className={`generator-card ${settings.generator === generator ? "active" : ""}`}
                  aria-pressed={settings.generator === generator}
                  key={generator}
                  onClick={() => {
                    update("generator", generator);
                    setActivePreset("");
                  }}
                >
                  <span className="generator-card-icon">✳</span>
                  <span>{generator}</span>
                </button>
              ))}
            </div>
            <div className="soft-tip"><span>✦</span><p>Generators create a starting formation. Choose a motion style to animate it, or set <b>Motion Off</b> to inspect and export the undisturbed layout.</p></div>
          </div>
        );
      case "effects":
        return (
          <div className="section-content">
            <div className="control-heading">
              <div><h2>Compose your effects</h2><p>Add or remove effects independently. Stack several for a custom finish.</p></div>
              <span className="section-number">04</span>
            </div>
            <div className="effects-toolbar">
              <span>{settings.effects.length} of {availableEffects.length} active</span>
              {settings.effects.length > 0 && (
                <button type="button" className="text-action" onClick={() => update("effects", [])}>Clear all</button>
              )}
            </div>
            <div className="effects-list">
              {availableEffects.map((effect) => {
                const added = settings.effects.includes(effect.id);
                return (
                  <article className={`effect-card ${added ? "active" : ""}`} key={effect.id}>
                    <span className="effect-icon">✧</span>
                    <span className="effect-copy"><b>{effect.id}</b><small>{effect.description}</small></span>
                    <button
                      type="button"
                      className={`effect-action ${added ? "added" : ""}`}
                      aria-label={`${added ? "Remove" : "Add"} ${effect.id} effect`}
                      aria-pressed={added}
                      onClick={() => update(
                        "effects",
                        added
                          ? settings.effects.filter((item: ParticleEffect) => item !== effect.id)
                          : [...settings.effects, effect.id],
                      )}
                    >
                      {added ? "Added" : "＋ Add"}
                    </button>
                  </article>
                );
              })}
            </div>
            <div className="soft-tip"><span>✦</span><p>Effects stack on top of your generator and motion. For large particle counts, combine fewer effects to keep animation smooth on mobile.</p></div>
          </div>
        );
      case "motion":
        return (
          <div className="section-content">
            <div className="control-heading">
              <div><h2>Give it some movement</h2><p>Shape how your particles travel.</p></div>
              <span className="section-number">05</span>
            </div>
            <ChoiceGroup<Motion>
              label="Motion style"
              options={["Off", "Float", "Orbit", "Flow", "Burst"]}
              value={settings.motion}
              onChange={(value) => update("motion", value)}
            />
            <RangeControl label="Speed" value={settings.speed} min={0.2} max={4} step={0.1} onChange={(value) => update("speed", value)} />
            <div className="soft-tip"><span>✦</span><p><b>Motion Off</b> restores the source layout and keeps every particle in place. Use the preview pause button to freeze the current animation instead.</p></div>
          </div>
        );
      case "physics":
        return (
          <div className="section-content">
            <div className="control-heading">
              <div><h2>Shape the physics</h2><p>Control forces, canvas edges and particle population.</p></div>
              <span className="section-number">06</span>
            </div>
            <ChoiceGroup<BoundsMode>
              label="Canvas edge behavior"
              options={["Bounce", "Wrap", "Contain", "Escape"]}
              value={settings.boundsMode}
              onChange={(value) => update("boundsMode", value)}
            />
            <p className="field-help">Bounce reflects particles, Wrap moves them to the opposite edge, Contain keeps them inside, and Escape lets them leave the canvas.</p>
            <ChoiceGroup<PopulationMode>
              label="Particle population over time"
              options={["Steady", "Grow", "Shrink"]}
              value={settings.populationMode}
              onChange={(value) => update("populationMode", value)}
            />
            {settings.populationMode === "Steady"
              ? <p className="field-help">Keep the selected particle count constant.</p>
              : (
                <>
                  <RangeControl label="Population change rate" value={settings.populationRate} min={1} max={300} step={1} suffix=" particles/s" onChange={(value) => update("populationRate", value)} />
                  <p className="field-help">{settings.populationMode === "Grow"
                    ? `Start empty and add particles until the selected limit of ${settings.count}.`
                    : `Remove particles from the current population over time (a fresh project starts at ${settings.count}).`}</p>
                </>
              )}
            <button type="button" className={`toggle-row ${settings.physicsEnabled ? "enabled" : ""}`} onClick={() => update("physicsEnabled", !settings.physicsEnabled)} aria-pressed={settings.physicsEnabled}>
              <span><b>Physics simulation</b><small>Toggle drag, gravity, turbulence, vortex and bounce</small></span><i className="toggle-switch" />
            </button>
            <RangeControl label="Gravity" value={settings.gravity} min={-0.1} max={0.12} step={0.005} onChange={(value) => update("gravity", value)} />
            <RangeControl label="Air drag" value={settings.drag} min={0.9} max={1} step={0.001} onChange={(value) => update("drag", value)} />
            <RangeControl label="Turbulence" value={settings.turbulence} min={0} max={2} step={0.05} onChange={(value) => update("turbulence", value)} />
            <RangeControl label="Vortex force" value={settings.vortex} min={0} max={2} step={0.05} onChange={(value) => update("vortex", value)} />
            <RangeControl label="Edge bounce" value={settings.bounce} min={0} max={1} step={0.05} onChange={(value) => update("bounce", value)} />
          </div>
        );
      case "look":
        return (
          <div className="section-content">
            <div className="control-heading">
              <div><h2>Make it yours</h2><p>Build a multi-color particle palette and shape details.</p></div>
              <span className="section-number">07</span>
            </div>
            <div className="palette-list">
              {settings.palette.map((color, index) => (
                <label className="color-control palette-color" key={`${index}-${color}`}>
                  <span>Palette color {index + 1}{index === 0 ? " · Start" : index === 1 ? " · Accent" : ""}</span>
                  <span className="color-input-wrap">
                    <input type="color" aria-label={`Palette color ${index + 1}`} value={color} onChange={(event) => updatePaletteColor(index, event.currentTarget.value)} />
                    <code>{color.toUpperCase()}</code>
                    {settings.palette.length > 2 && (
                      <button type="button" className="palette-remove" aria-label={`Remove palette color ${index + 1}`} onClick={() => {
                        const palette = settings.palette.filter((_, paletteIndex) => paletteIndex !== index);
                        setSettings((current) => ({ ...current, palette, color: palette[0], accent: palette[1] }));
                        setIsSaved(false);
                      }}>×</button>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <button type="button" className="text-action palette-add" disabled={settings.palette.length >= 8} onClick={() => {
              const nextColor = ["#ff8c62", "#9bea6c", "#a9eaff", "#f47bd8", "#ffe45e", "#45f3ef"][settings.palette.length - 2];
              update("palette", [...settings.palette, nextColor]);
            }}>＋ Add palette color {settings.palette.length >= 8 ? "(8 max)" : ""}</button>
            <p className="field-help">Particles cycle smoothly through this palette; individual particles start at different colors.</p>
            <button type="button" className={`toggle-row ${settings.preserveSvgColors ? "enabled" : ""}`} onClick={() => update("preserveSvgColors", !settings.preserveSvgColors)} aria-pressed={settings.preserveSvgColors}>
              <span><b>Preserve imported SVG colors</b><small>Turn off to recolor imported shapes with your palette</small></span><i className="toggle-switch" />
            </button>
            <ChoiceGroup<ParticleShape>
              label="Particle shape"
              options={["Circle", "Square", "Diamond", "Triangle", "Pentagon", "Hexagon", "Star", "Sparkle", "Heart", "Ring", "Cross", "Polygon", "Custom"]}
              value={settings.shape}
              onChange={(value) => {
                setCustomPathError("");
                update("shape", value);
              }}
            />
            {settings.shape === "Custom" && (
              <label className="path-editor">
                <span className="control-label">Custom SVG path data <small>Use a 0–100 viewBox</small></span>
                <textarea
                  aria-label="Custom SVG path data"
                  rows={3}
                  maxLength={2000}
                  value={settings.customShapePath}
                  onChange={(event) => {
                    const path = event.currentTarget.value;
                    if (path.length > 2000) return;
                    try {
                      if (!isValidCustomShapePath(path)) throw new Error("Enter valid SVG path data.");
                      setCustomPathError("");
                      update("customShapePath", path);
                    } catch {
                      setCustomPathError("Enter valid SVG path commands (maximum 2,000 characters).");
                    }
                  }}
                />
                {customPathError && <small className="field-error" role="alert">{customPathError}</small>}
                <small className="field-help">Example: M50 0 L100 100 L0 100 Z</small>
              </label>
            )}
            <RangeControl label="Size" value={settings.size} min={0.7} max={7} step={0.1} onChange={(value) => update("size", value)} />
            <RangeControl label="Glow" value={settings.glow} min={0} max={32} step={1} onChange={(value) => update("glow", value)} />
            <RangeControl label="Opacity" value={settings.opacity} min={0.15} max={1} step={0.05} onChange={(value) => update("opacity", value)} />
            <button type="button" className={`toggle-row ${settings.trails ? "enabled" : ""}`} onClick={() => update("trails", !settings.trails)} aria-pressed={settings.trails}>
              <span><b>Motion trails</b><small>Leave a soft trail behind each particle</small></span><i className="toggle-switch" />
            </button>
          </div>
        );
      case "background":
        return (
          <div className="section-content">
            <div className="control-heading">
              <div><h2>Set the scene</h2><p>Build a backdrop with color, light and grid.</p></div>
              <span className="section-number">08</span>
            </div>
            <ChoiceGroup<ParticleSettings["backgroundMode"]>
              label="Background mode"
              options={["Solid", "Gradient", "Transparent"]}
              value={settings.backgroundMode}
              onChange={(value) => update("backgroundMode", value)}
            />
            <div className="color-row">
              <label className="color-control"><span>Background</span><span className="color-input-wrap"><input type="color" value={settings.backgroundColor} onChange={(event) => update("backgroundColor", event.target.value)} /><code>{settings.backgroundColor.toUpperCase()}</code></span></label>
              <label className="color-control"><span>Gradient end</span><span className="color-input-wrap"><input type="color" value={settings.backgroundAccent} onChange={(event) => update("backgroundAccent", event.target.value)} /><code>{settings.backgroundAccent.toUpperCase()}</code></span></label>
            </div>
            <div className="color-row single-color">
              <label className="color-control"><span>Ambient light color</span><span className="color-input-wrap"><input type="color" value={settings.lightColor} onChange={(event) => update("lightColor", event.target.value)} /><code>{settings.lightColor.toUpperCase()}</code></span></label>
            </div>
            <RangeControl label="Ambient light" value={settings.ambientLight} min={0} max={100} step={1} suffix="%" onChange={(value) => update("ambientLight", value)} />
            <button type="button" className={`toggle-row ${settings.showGrid ? "enabled" : ""}`} onClick={() => update("showGrid", !settings.showGrid)} aria-pressed={settings.showGrid}>
              <span><b>Overlay grid</b><small>Show a subtle alignment grid on the canvas</small></span><i className="toggle-switch" />
            </button>
          </div>
        );
      case "touch":
        return (
          <div className="section-content">
            <div className="control-heading">
              <div><h2>Play with your particles</h2><p>Move your finger or pointer over the canvas.</p></div>
              <span className="section-number">09</span>
            </div>
            <button type="button" className={`toggle-row ${settings.interactive ? "enabled" : ""}`} onClick={() => update("interactive", !settings.interactive)} aria-pressed={settings.interactive}>
              <span><b>Touch interaction</b><small>Let particles respond to your touch</small></span><i className="toggle-switch" />
            </button>
            <ChoiceGroup<Interaction>
              label="Touch behavior"
              options={["Repel", "Attract", "Swirl", "Off"]}
              value={settings.interaction}
              onChange={(value) => update("interaction", value)}
            />
            <RangeControl label="Touch radius" value={settings.interactionRadius} min={40} max={400} step={5} suffix=" px" onChange={(value) => update("interactionRadius", value)} />
            <RangeControl label="Touch strength" value={settings.interactionStrength} min={0.05} max={1.5} step={0.05} onChange={(value) => update("interactionStrength", value)} />
            <div className="interaction-card">
              <span className="interaction-icon">✳</span>
              <div><b>Go ahead, try it</b><p>Touch and drag across the preview to shape the motion in real time.</p></div>
            </div>
          </div>
        );
      case "export":
        return (
          <div className="section-content">
            <div className="control-heading">
              <div><h2>Take it with you</h2><p>Export runnable code or record a video.</p></div>
              <span className="section-number">10</span>
            </div>
            <div className="export-card">
              <div className="export-card-heading"><b>Particle code</b><small>Self-contained HTML or separate project files.</small></div>
              <label className="svg-select-control code-format-select">
                <span>Code file</span>
                <select aria-label="Code file to export" value={codeFormat} onChange={(event) => setCodeFormat(event.currentTarget.value as typeof codeFormat)}>
                  <option value="standaloneHtml">Standalone HTML</option>
                  <option value="html">HTML document</option>
                  <option value="css">CSS stylesheet</option>
                  <option value="javascript">JavaScript runtime</option>
                </select>
              </label>
              <textarea className="code-preview" aria-label="Generated particle code" readOnly spellCheck={false} value={generatedCode[codeFormat]} />
              <div className="export-actions">
                <button type="button" className="svg-upload-button" onClick={exportCodeFile}>Download file</button>
                <button type="button" className="svg-upload-button secondary" onClick={() => { void copyCode(); }}>Copy code</button>
              </div>
              <div className="export-actions separate-files">
                <button type="button" className="text-action" onClick={() => downloadFile("index.html", generatedCode.html, "text/html;charset=utf-8")}>HTML</button>
                <button type="button" className="text-action" onClick={() => downloadFile("style.css", generatedCode.css, "text/css;charset=utf-8")}>CSS</button>
                <button type="button" className="text-action" onClick={() => downloadFile("particles.js", generatedCode.javascript, "text/javascript;charset=utf-8")}>JS</button>
                <button type="button" className="text-action" onClick={downloadConfig}>Project JSON</button>
              </div>
            </div>
            <div className="export-card video-card">
              <div className="export-card-heading"><b>Canvas video</b><small>Record the live preview to a WebM video.</small></div>
              <div className="video-options">
                <label className="svg-select-control"><span>Duration</span><select aria-label="Video duration" value={recordDuration} disabled={recording} onChange={(event) => setRecordDuration(Number(event.currentTarget.value))}><option value={3}>3 seconds</option><option value={5}>5 seconds</option><option value={10}>10 seconds</option></select></label>
                <label className="svg-select-control"><span>Frame rate</span><select aria-label="Video frame rate" value={recordFps} disabled={recording} onChange={(event) => setRecordFps(Number(event.currentTarget.value))}><option value={24}>24 FPS</option><option value={30}>30 FPS</option><option value={60}>60 FPS</option></select></label>
              </div>
              <div className="record-progress" role="progressbar" aria-label="Video recording progress" aria-valuenow={recordProgress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${recordProgress}%` }} /></div>
              <button type="button" className={`svg-upload-button ${recording ? "recording-button" : ""}`} onClick={recording ? stopRecording : startRecording}>{recording ? `Stop recording · ${recordProgress}%` : "● Record WebM"}</button>
              <p className="field-help">Records the canvas at its current preview resolution. Background transparency may be rendered opaque by some video players.</p>
            </div>
          </div>
        );
    }
  };

  return (
    <main className="studio">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Particle Studio home">
          <span className="brand-mark"><i /><i /><i /><i /></span>
          <span>particle<span className="brand-light">studio</span><small>CREATIVE PLAYGROUND</small></span>
        </a>
        <div className="project-title"><span className="live-dot" />Untitled creation <span className="saved-badge">● {isSaved ? "Saved" : "Draft"}</span></div>
        <div className="top-actions">
          <button type="button" className="quiet-button" aria-label="Save project" onClick={saveProject}><span>▣</span><span className="desktop-label">Save</span></button>
          <button type="button" className="export-button" onClick={downloadConfig}><span>↥</span><span>Export</span></button>
        </div>
      </header>

      <div className="workspace">
        <section className="preview-area" aria-label="Particle preview">
          <div className="preview-head">
            <div><span className="eyebrow">YOUR CANVAS</span><span className="canvas-name">Untitled creation</span></div>
            <div className="preview-tools">
              <span className="performance"><i />{fps} <span>FPS</span></span>
              <button type="button" className="icon-button" aria-label={settings.playing ? "Pause animation" : "Play animation"} onClick={() => update("playing", !settings.playing)}>{settings.playing ? "Ⅱ" : "▶"}</button>
              <button type="button" className="icon-button export-image" aria-label="Export preview as PNG" onClick={exportImage}>↗</button>
            </div>
          </div>
          <div className={`canvas-wrap ${settings.backgroundMode === "Transparent" ? "transparent-background" : ""}`}>
            <canvas ref={canvasRef} aria-label="Interactive particle animation" />
            <div className="canvas-glow" />
            <div className="canvas-caption"><span className="pulse-dot" />LIVE PREVIEW <span className="caption-divider">·</span> DRAG TO PLAY</div>
            <button type="button" className={`collapse-floating ${menuOpen ? "menu-open" : ""}`} onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>
              <span>{menuOpen ? "↓" : "↑"}</span>{menuOpen ? "Hide controls" : "Make something"}
            </button>
          </div>
          <div className="preview-footer"><span><kbd>✦</kbd> A little universe, all yours.</span><span className="preview-dimensions">LIVE CANVAS <i /> {particleCount} PARTICLES</span></div>
        </section>

        <aside className={`control-dock ${menuOpen ? "open" : "collapsed"}`} aria-label="Particle controls">
          <div className="dock-handle" onClick={() => setMenuOpen((open) => !open)} role="button" tabIndex={0} aria-label={menuOpen ? "Collapse controls" : "Expand controls"} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setMenuOpen((open) => !open); }}>
            <span />
          </div>
          <div className="dock-topline">
            <div><span className="eyebrow">THE FUN PART</span><h1>Make it move<span>.</span></h1></div>
            <button type="button" className="collapse-button" aria-label={menuOpen ? "Collapse controls" : "Expand controls"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "⌄" : "⌃"}</button>
          </div>
          {menuOpen && (
            <>
              <nav className="section-tabs" aria-label="Control sections">
                {sections.map((section) => (
                  <button
                    type="button"
                    key={section.id}
                    className={`section-tab ${activeSection === section.id ? "active" : ""}`}
                    onClick={() => setActiveSection(section.id)}
                    aria-current={activeSection === section.id ? "page" : undefined}
                  >
                    <span className="tab-icon">{section.icon}</span>
                    <span className="tab-label">{section.label}</span>
                    <span className="tab-hint">{section.hint}</span>
                  </button>
                ))}
              </nav>
              <div className="control-scroll" key={activeSection}>{renderControls()}</div>
              <div className="dock-footer">
                <span><span className="sparkle">✦</span> Made to play with</span>
                <button type="button" onClick={() => applyPreset("Stardust")}>Reset to start <span>↺</span></button>
              </div>
            </>
          )}
          {!menuOpen && (
            <button type="button" className="collapsed-summary" onClick={() => setMenuOpen(true)}>
              <span className="summary-sparkle">✦</span><span><b>{allPresets.find((preset) => preset.name === activePreset)?.name ?? "Custom effect"}</b><small>{sections.find((section) => section.id === activeSection)?.label} controls · {particleCount} particles</small></span><span className="summary-arrow">↑</span>
            </button>
          )}
        </aside>
      </div>
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}

export default App;
