import { useRef, useState, type DragEvent } from "react";
import { ChoiceGroup, ColorField, RangeControl, SoftTip, SubTabs, ToggleRow } from "./controls";
import { GENERATORS } from "./generators";
import { MASK_LOOKS } from "./looks";
import { SHAPE_LABELS, shapeThumbUrl } from "./mask";
import { lookThumbKey } from "./thumbs";
import { useThumb } from "./useThumb";
import {
  GENERATOR_CATEGORIES,
  MASK_PATTERNS,
  MAX_LAYERS,
  RANGES,
  type GeneratorCategory,
  type GeneratorId,
  type MaskPattern,
  type Region,
  type ShaderMask,
  type ShaderPreset,
  type ShaderProject,
} from "./types";

interface MaskPanelProps {
  project: ShaderProject;
  /** true while an uploaded image is still being turned into a mask */
  busy: boolean;
  onMask: (patch: Partial<ShaderMask>) => void;
  onAddField: (region: Exclude<Region, "All">, generator: GeneratorId) => void;
  onImport: (file: File) => void;
  onApplyLook: (look: ShaderPreset) => void;
}

type View = "shape" | "edge" | "fill" | "looks";

function LookCard({ look, onPick }: { look: ShaderPreset; onPick: () => void }) {
  const thumb = useThumb(lookThumbKey(look.name));
  const colors = look.project.palette;
  return (
    <button type="button" className="preset-card" onClick={onPick} title={look.tag}>
      <span className="preset-swatch" style={thumb ? undefined : { background: `linear-gradient(135deg, ${colors.join(", ")})` }}>
        {thumb ? <img src={thumb} alt="" draggable={false} /> : null}
      </span>
      <span className="preset-name">{look.name}</span>
      <span className="preset-tag">{look.tag}</span>
    </button>
  );
}

function RegionFieldControl({
  region,
  value,
  disabled,
  onChange,
  onAdd,
}: {
  region: Exclude<Region, "All">;
  value: GeneratorId;
  disabled: boolean;
  onChange: (generator: GeneratorId) => void;
  onAdd: () => void;
}) {
  return (
    <div className="mask-region-field">
      <label className="svg-select-control">
        Field generator
        <select value={value} onChange={(event) => onChange(event.target.value as GeneratorId)}>
          {GENERATOR_CATEGORIES.map((category: GeneratorCategory) => (
            <optgroup key={category} label={category}>
              {GENERATORS.filter((generator) => generator.category === category).map((generator) => (
                <option key={generator.id} value={generator.id}>
                  {generator.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <button type="button" className="svg-upload-button" disabled={disabled} onClick={onAdd}>
        Add {region.toLowerCase()} field layer
      </button>
      {disabled && <p className="field-help">The layer stack is full ({MAX_LAYERS} layers). Delete a layer in Stack to add another.</p>}
    </div>
  );
}

export default function MaskPanel({ project, busy, onMask, onAddField, onImport, onApplyLook }: MaskPanelProps) {
  const [view, setView] = useState<View>("shape");
  const [dragOver, setDragOver] = useState(false);
  const [insideGenerator, setInsideGenerator] = useState<GeneratorId>("mesh");
  const [outsideGenerator, setOutsideGenerator] = useState<GeneratorId>("aurora");
  const fileRef = useRef<HTMLInputElement>(null);
  const m = project.mask;
  const stackFull = project.layers.length >= MAX_LAYERS;

  const slider = (key: keyof ShaderMask, rangeKey: keyof typeof RANGES, label: string, display?: string, reset?: number) => {
    const r = RANGES[rangeKey];
    const value = m[key];
    return (
      <RangeControl
        label={label}
        value={typeof value === "number" ? value : 0}
        min={r.min}
        max={r.max}
        step={r.step}
        display={display}
        reset={reset}
        onChange={(next) => onMask({ [key]: next } as Partial<ShaderMask>)}
      />
    );
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) onImport(file);
  };

  const tabs = [
    { id: "shape" as const, label: "Shape" },
    { id: "edge" as const, label: "Edge" },
    { id: "fill" as const, label: "Fill" },
    { id: "looks" as const, label: "Looks", hint: `${MASK_LOOKS.length}` },
  ];

  return (
    <>
      <ToggleRow
        title="Image mask"
        description={m.enabled ? "The shader only fills the silhouette" : "Turn any shape, logo or image into a shader window"}
        enabled={m.enabled}
        onChange={(enabled) => onMask({ enabled })}
      />
      <SubTabs label="Shape builder" value={view} tabs={tabs} onChange={setView} />

      {view === "shape" && (
        <>
          <span className="control-label">Built-in shapes</span>
          <div className="shape-grid">
            {SHAPE_LABELS.map(({ id, label }) => {
              const selected = m.source.kind === "shape" && m.source.id === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`shape-tile ${selected ? "selected" : ""}`}
                  aria-pressed={selected}
                  title={label}
                  onClick={() => onMask({ enabled: true, source: { kind: "shape", id } })}
                >
                  <img src={shapeThumbUrl(id)} alt="" draggable={false} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <span className="control-label">{m.source.kind === "text" ? "Replace the text source" : "Your own image"}</span>
          {m.source.kind === "text" && <p className="field-help">The active mask is text. Edit it in the <b>Text</b> tab, or import an image to replace it.</p>}
          <label
            className={`mask-drop ${dragOver ? "over" : ""} ${m.source.kind === "image" ? "has-image" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            {m.source.kind === "image" ? (
              <img src={m.source.data} alt="" draggable={false} className="mask-drop-preview" />
            ) : (
              <span className="mask-drop-icon" aria-hidden="true">⬆</span>
            )}
            <span className="mask-drop-text">
              <b>{busy ? "Reading image…" : m.source.kind === "image" ? m.source.name : "Import PNG or SVG"}</b>
              <small>PNG · SVG · JPG · WebP — drop a file or tap to choose</small>
            </span>
            <input
              ref={fileRef}
              className="visually-hidden"
              type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp,.svg"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport(file);
                event.target.value = "";
              }}
            />
          </label>
          <p className="field-help">
            Transparent images use their alpha channel. Opaque ones use brightness — a dark logo on white is detected automatically.
          </p>

          {slider("threshold", "maskThreshold", "Threshold", undefined, 0.5)}
          <ToggleRow title="Invert shape" description="Swap inside and outside" enabled={m.invert} onChange={(invert) => onMask({ invert })} />
          <div className="control-divider" />
          {slider("scale", "maskScale", "Size", undefined, 0.95)}
          {slider("x", "maskX", "Position X", undefined, 0)}
          {slider("y", "maskY", "Position Y", undefined, 0)}
          {slider("rotation", "maskRotation", "Rotation", `${Math.round(m.rotation)}°`, 0)}
          {slider("follow", "maskFollow", "Follow pointer", m.follow === 0 ? "Off" : undefined, 0)}
          {slider("breathe", "maskBreathe", "Breathing", m.breathe === 0 ? "Off" : undefined, 0)}
          {!m.enabled && <SoftTip>Pick a shape or import an image to switch the mask on.</SoftTip>}
        </>
      )}

      {view === "edge" && (
        <>
          {slider("grow", "maskGrow", "Grow / shrink", undefined, 0)}
          {slider("edge", "maskEdge", "Edge softness", undefined, 0.1)}
          {slider("smoke", "maskSmoke", "Smoke dissolve", m.smoke === 0 ? "Off" : undefined, 0)}
          {m.smoke > 0 && slider("smokeScale", "maskSmokeScale", "Smoke detail", undefined, 1.2)}
          <div className="control-divider" />
          {slider("glow", "maskGlow", "Rim glow", m.glow === 0 ? "Off" : undefined, 0)}
          {slider("halo", "maskHalo", "Outer halo", m.halo === 0 ? "Off" : undefined, 0.6)}
          {slider("outline", "maskOutline", "Outline", m.outline === 0 ? "Off" : undefined, 0)}
          {slider("bevel", "maskBevel", "Pillow bevel", m.bevel === 0 ? "Off" : undefined, 0)}
          <div className="control-divider" />
          {slider("distort", "maskDistort", "Edge push", m.distort === 0 ? "Off" : undefined, 0)}
          {slider("flow", "maskFlow", "Edge flow", m.flow === 0 ? "Off" : undefined, 0)}
          <SoftTip>
            <b>Pillow bevel</b> adds depth that the light catches — try it with Surface → Relief. <b>Edge flow</b> makes the field slide along the outline.
          </SoftTip>
        </>
      )}

      {view === "fill" && (
        <>
          <span className="control-label">Outside the shape</span>
          <ColorField label="Background" value={m.background} onChange={(background) => onMask({ background })} />
          {slider("ghost", "maskGhost", "Show shader outside", m.ghost === 0 ? "Hidden" : undefined, 0)}
          <RegionFieldControl
            region="Outside"
            value={outsideGenerator}
            disabled={stackFull}
            onChange={setOutsideGenerator}
            onAdd={() => {
              if (m.ghost === 0) onMask({ ghost: 1 });
              onAddField("Outside", outsideGenerator);
            }}
          />
          <div className="control-divider" />
          <span className="control-label">Inside the shape</span>
          {slider("innerBoost", "maskInnerBoost", "Exposure", undefined, 0)}
          {slider("innerHue", "maskInnerHue", "Hue shift", `${Math.round(m.innerHue)}°`, 0)}
          <RegionFieldControl
            region="Inside"
            value={insideGenerator}
            disabled={stackFull}
            onChange={setInsideGenerator}
            onAdd={() => onAddField("Inside", insideGenerator)}
          />
          <div className="control-divider" />
          <span className="control-label">Particles</span>
          {slider("particles", "maskParticles", "Particle fill", m.particles === 0 ? "Off" : undefined, 0)}
          {m.particles > 0 && (
            <>
              {slider("particleSize", "maskParticleSize", "Particle size", undefined, 1)}
              {slider("particleSpeed", "maskParticleSpeed", "Drift speed", undefined, 1)}
            </>
          )}
          <div className="control-divider" />
          <span className="control-label">Pattern layer</span>
          <ChoiceGroup label="Pattern" value={m.pattern} options={MASK_PATTERNS} onChange={(pattern: MaskPattern) => onMask({ pattern })} />
          {m.pattern !== "None" && (
            <>
              {slider("patternAmount", "maskPatternAmount", "Strength", undefined, 0.6)}
              {slider("patternScale", "maskPatternScale", "Scale", undefined, 1)}
              {slider("patternAngle", "maskPatternAngle", "Angle", `${Math.round(m.patternAngle)}°`, 0)}
              {slider("patternSpeed", "maskPatternSpeed", "Motion", undefined, 0.3)}
            </>
          )}
          <SoftTip>Inside and outside field layers have independent generators, palettes, blend modes, opacity and motion. Fine-tune a new field in Stack after adding it.</SoftTip>
        </>
      )}

      {view === "looks" && (
        <>
          <p className="field-help">One tap restyles the whole shader and keeps your silhouette, size and position.</p>
          <div className="preset-grid">
            {MASK_LOOKS.map((look) => (
              <LookCard key={look.name} look={look} onPick={() => onApplyLook(look)} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
