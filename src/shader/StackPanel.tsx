import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ChoiceGroup, ColorField, Fold, RangeControl, SoftTip, ToggleRow } from "./controls";
import { GENERATORS, GENERATOR_MAP, defaultKnobs } from "./generators";
import GradientBar from "./GradientBar";
import { BLEND_GROUPS, KIND_DEFS, defaultLayerKnobs, layerKnobDefs, layerSummary, newLayer } from "./stack";
import { cssGradient, evenPositions, toStops } from "./stops";
import {
  GENERATOR_CATEGORIES,
  LAYER_SPACES,
  MAX_LAYERS,
  MAX_LAYER_COLORS,
  MIN_LAYER_COLORS,
  PATTERN_IDS,
  RANGES,
  REGIONS,
  type BlendMode,
  type GeneratorId,
  type LayerKind,
  type PatternId,
  type Region,
  type ShaderLayer,
  type ShaderProject,
} from "./types";

interface StackPanelProps {
  project: ShaderProject;
  selectedId: string;
  onSelect: (id: string) => void;
  onLayers: (layers: ShaderLayer[]) => void;
  onCanvas: (color: string) => void;
  onOpenElements: () => void;
  onOpenField: () => void;
  showToast: (message: string) => void;
}

const QUICK_ADD: LayerKind[] = ["solid", "linear", "radial", "glow", "noise", "grain", "vignette", "pattern", "field"];

function swatchStyle(layer: ShaderLayer): CSSProperties {
  if (layer.kind === "base") return { background: "linear-gradient(135deg, #3a4fd6, #0b1020)" };
  if (layer.kind === "field" && !layer.ownColors) return { background: "linear-gradient(135deg, #6a5acd, #12b57c)" };
  if (layer.kind === "solid" || layer.kind === "vignette") return { background: layer.colors[0] ?? "#000" };
  return { background: cssGradient(toStops(layer.colors, layer.positions), 1, 135) };
}

/* ───────────────────────── one layer row ───────────────────────── */

interface RowProps {
  layer: ShaderLayer;
  selected: boolean;
  dropBefore: boolean;
  dragging: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onGrip: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

function LayerRow({ layer, selected, dropBefore, dragging, onSelect, onToggle, onDelete, onGrip }: RowProps) {
  const def = KIND_DEFS[layer.kind];
  return (
    <li
      className={`layer-row ${selected ? "selected" : ""} ${layer.visible ? "" : "hidden-layer"} ${dragging ? "dragging" : ""} ${dropBefore ? "drop-before" : ""}`}
      data-layer-id={layer.id}
    >
      <button type="button" className="layer-grip" aria-label={`Drag to reorder ${layer.name}`} onPointerDown={onGrip}>
        ⠿
      </button>
      <button type="button" className="layer-main" onClick={onSelect} aria-pressed={selected}>
        <span className="layer-swatch" style={swatchStyle(layer)}>
          <span aria-hidden="true">{def.icon}</span>
        </span>
        <span className="layer-text">
          <b>{layer.name}</b>
          <small>{layer.kind === "base" ? `Main field · ${layerSummary(layer)}` : layerSummary(layer)}</small>
        </span>
      </button>
      <button
        type="button"
        className={`layer-eye ${layer.visible ? "on" : ""}`}
        aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
        aria-pressed={layer.visible}
        onClick={onToggle}
      >
        {layer.visible ? "◉" : "○"}
      </button>
      <button
        type="button"
        className="layer-delete"
        aria-label={`Delete ${layer.name}`}
        title={layer.kind === "base" ? "The base field cannot be removed" : `Delete ${layer.name}`}
        disabled={layer.kind === "base"}
        onClick={onDelete}
      >
        ×
      </button>
    </li>
  );
}

/* ───────────────────────── editor ───────────────────────── */

interface EditorProps {
  layer: ShaderLayer;
  maskOn: boolean;
  index: number;
  count: number;
  onPatch: (patch: Partial<ShaderLayer>) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpenField: () => void;
}

function LayerEditor({ layer, maskOn, index, count, onPatch, onMove, onDuplicate, onDelete, onOpenField }: EditorProps) {
  const def = KIND_DEFS[layer.kind];
  const isBase = layer.kind === "base";
  const knobDefs = layerKnobDefs(layer);
  const usesPalette = def.colors > 0 && (!def.sharesPalette || layer.ownColors);
  const [genCategory, setGenCategory] = useState<(typeof GENERATOR_CATEGORIES)[number] | "All">("All");

  const setKnob = (i: number, value: number) => {
    const knobs = [...layer.knobs] as ShaderLayer["knobs"];
    knobs[i] = value;
    onPatch({ knobs });
  };

  const slider = (label: string, key: "opacity" | "scale" | "speed" | "rotation" | "x" | "y" | "shift" | "fade", range: keyof typeof RANGES, display?: string, reset?: number) => {
    const r = RANGES[range];
    return (
      <RangeControl
        label={label}
        value={layer[key]}
        min={r.min}
        max={r.max}
        step={r.step}
        display={display}
        reset={reset}
        onChange={(v) => onPatch({ [key]: v } as Partial<ShaderLayer>)}
      />
    );
  };

  const pickGenerator = (id: GeneratorId) =>
    onPatch({ generator: id, knobs: defaultKnobs(id), name: layer.name === GENERATOR_MAP[layer.generator].name ? GENERATOR_MAP[id].name : layer.name });

  const generatorsShown = GENERATORS.filter((g) => genCategory === "All" || g.category === genCategory);

  return (
    <section className="layer-editor" aria-label={`${layer.name} settings`}>
      <header className="layer-editor-head">
        <input
          className="layer-name"
          value={layer.name}
          maxLength={40}
          aria-label="Layer name"
          disabled={isBase}
          onChange={(event) => onPatch({ name: event.target.value })}
        />
        <div className="rule-actions">
          <button type="button" aria-label="Move layer up" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
          <button type="button" aria-label="Move layer down" disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
          <button type="button" aria-label="Duplicate layer" disabled={isBase || count >= MAX_LAYERS} onClick={onDuplicate}>⧉</button>
          <button type="button" aria-label="Delete layer" className="danger" disabled={isBase} onClick={onDelete}>✕</button>
        </div>
      </header>
      <p className="rule-desc">{def.description}</p>

      <label className="svg-select-control">
        Blend mode
        <select value={layer.blend} onChange={(event) => onPatch({ blend: event.target.value as BlendMode })}>
          {BLEND_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.modes.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {slider("Opacity", "opacity", "layerOpacity", `${Math.round(layer.opacity * 100)}%`, 1)}
      <ChoiceGroup
        label="Show"
        value={layer.region}
        options={REGIONS}
        onChange={(region: Region) => onPatch({ region })}
      />
      {layer.region !== "All" && !maskOn && <p className="field-help">Turn on the image mask in the Shape tab — this layer only follows it while the mask is on.</p>}
      {!isBase && <ChoiceGroup label="Moves with" value={layer.space} options={LAYER_SPACES} onChange={(space) => onPatch({ space })} />}

      {isBase ? (
        <>
          <p className="field-help">This is the project's main field. Its generator, colours, motion and surface settings live in the Field, Motion, Color and Surface tabs.</p>
          <button type="button" className="svg-upload-button" onClick={onOpenField}>Edit the main field →</button>
        </>
      ) : (
        <>
          <Fold title="Content" hint={layer.kind === "field" ? GENERATOR_MAP[layer.generator].name : def.label} defaultOpen>
            {layer.kind === "field" && (
              <>
                <ChoiceGroup label="Category" value={genCategory} options={["All", ...GENERATOR_CATEGORIES] as Array<(typeof GENERATOR_CATEGORIES)[number] | "All">} onChange={setGenCategory} />
                <div className="generator-grid">
                  {generatorsShown.map((g) => (
                    <button key={g.id} type="button" className={`generator-card ${g.id === layer.generator ? "active" : ""}`} aria-pressed={g.id === layer.generator} onClick={() => pickGenerator(g.id)}>
                      {g.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            {layer.kind === "pattern" && (
              <ChoiceGroup label="Pattern" value={layer.pattern} options={PATTERN_IDS} onChange={(pattern: PatternId) => onPatch({ pattern })} />
            )}
            {knobDefs.map((k, i) => (
              <RangeControl
                key={`${layer.kind}-${layer.generator}-${k.label}`}
                label={k.label}
                value={layer.knobs[i] ?? k.value}
                min={k.min}
                max={k.max}
                step={k.step}
                display={k.deg ? `${Math.round(layer.knobs[i] ?? k.value)}°` : undefined}
                reset={k.value}
                onChange={(v) => setKnob(i, v)}
              />
            ))}
            {layer.kind === "pattern" && (
              <ToggleRow title="Fill gaps" description={layer.fill ? "Two-tone background" : "Lines only, transparent between"} enabled={layer.fill} onChange={(fill) => onPatch({ fill })} />
            )}
            {def.keyable && (
              <ToggleRow title="Alpha from brightness" description="Bright areas show, dark areas turn transparent" enabled={layer.keyed} onChange={(keyed) => onPatch({ keyed })} />
            )}
            <button type="button" className="text-action" onClick={() => onPatch({ knobs: defaultLayerKnobs(layer) })}>Reset settings</button>
          </Fold>

          {def.colors > 0 && (
            <Fold title="Colour" hint={usesPalette ? `${layer.colors.length} stops` : "project palette"} defaultOpen>
              {def.sharesPalette && (
                <ToggleRow title="Own colours" description={layer.ownColors ? "This layer has its own gradient" : "Uses the project palette"} enabled={layer.ownColors} onChange={(ownColors) => onPatch({ ownColors })} />
              )}
              {usesPalette && def.colors === 1 && (
                <ColorField label="Colour" value={layer.colors[0] ?? "#000000"} onChange={(c) => onPatch({ colors: [c, c], positions: evenPositions(2) })} />
              )}
              {usesPalette && def.colors === 2 && (
                <GradientBar
                  colors={layer.colors}
                  positions={layer.positions}
                  min={MIN_LAYER_COLORS}
                  max={MAX_LAYER_COLORS}
                  onChange={(colors, positions) => onPatch({ colors, positions })}
                />
              )}
              {(def.gradient || layer.kind === "glow" || layer.kind === "pattern" || def.sharesPalette) && (
                <ToggleRow title="Reverse colours" description="Flip the ramp" enabled={layer.reverse} onChange={(reverse) => onPatch({ reverse })} />
              )}
              {def.gradient && slider("Fade to transparent", "fade", "layerFade", layer.fade === 0 ? "Off" : undefined, 0)}
              {slider("Colour offset", "shift", "layerShift", undefined, 0)}
            </Fold>
          )}

          <Fold title="Transform" hint={layer.scale !== 1 || layer.rotation !== 0 || layer.x !== 0 || layer.y !== 0 ? "edited" : undefined}>
            {slider("Zoom", "scale", "layerScale", undefined, 1)}
            {slider("Rotation", "rotation", "layerRotation", `${Math.round(layer.rotation)}°`, 0)}
            {slider("Offset X", "x", "layerOffset", undefined, 0)}
            {slider("Offset Y", "y", "layerOffset", undefined, 0)}
            {def.animated && slider("Speed", "speed", "layerSpeed", layer.speed === 0 ? "Frozen" : undefined, 1)}
          </Fold>
        </>
      )}
    </section>
  );
}

/* ───────────────────────── panel ───────────────────────── */

export default function StackPanel({ project, selectedId, onSelect, onLayers, onCanvas, onOpenElements, onOpenField, showToast }: StackPanelProps) {
  const layers = project.layers;
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<{ id: string; target: number } | null>(null);
  const dragRef = useRef<{ id: string; pointer: number; target: number } | null>(null);

  const selectedIndex = Math.max(0, layers.findIndex((l) => l.id === selectedId));
  const selected = layers[selectedIndex] as ShaderLayer;

  const patchLayer = (id: string, patch: Partial<ShaderLayer>) => onLayers(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const add = (kind: LayerKind) => {
    if (layers.length >= MAX_LAYERS) {
      showToast(`The stack is full (${MAX_LAYERS} layers)`);
      return;
    }
    const layer = newLayer(kind, kind === "field" ? { generator: "stars", knobs: defaultKnobs("stars"), blend: "Screen", ownColors: false } : {});
    onLayers([layer, ...layers]);
    onSelect(layer.id);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= layers.length) return;
    const next = [...layers];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    onLayers(next);
  };

  const duplicate = (index: number) => {
    const layer = layers[index];
    if (!layer || layer.kind === "base" || layers.length >= MAX_LAYERS) return;
    const copy: ShaderLayer = { ...layer, id: newLayer("solid").id, name: `${layer.name} copy`, knobs: [...layer.knobs], colors: [...layer.colors], positions: [...layer.positions] };
    onLayers([...layers.slice(0, index), copy, ...layers.slice(index)]);
    onSelect(copy.id);
  };

  const remove = (id: string) => {
    const index = layers.findIndex((layer) => layer.id === id);
    const layer = layers[index];
    if (!layer || layer.kind === "base") return;
    const next = layers.filter((_, i) => i !== index);
    onLayers(next);
    if (selectedId === layer.id) onSelect((next[Math.min(index, next.length - 1)] as ShaderLayer).id);
  };

  /* drag to reorder — only the grip starts a drag, so scrolling the list never moves a layer */
  const targetFor = (clientY: number): number => {
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-layer-id]") ?? []);
    for (let i = 0; i < rows.length; i++) {
      const rect = (rows[i] as HTMLElement).getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length;
  };

  const gripDown = (event: ReactPointerEvent<HTMLButtonElement>, layer: ShaderLayer) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const from = layers.findIndex((l) => l.id === layer.id);
    dragRef.current = { id: layer.id, pointer: event.pointerId, target: from };
    setDrag({ id: layer.id, target: from });
    onSelect(layer.id);
  };

  const gripMove = (event: ReactPointerEvent<HTMLUListElement>) => {
    const d = dragRef.current;
    if (!d || d.pointer !== event.pointerId) return;
    const target = targetFor(event.clientY);
    if (target !== d.target) {
      d.target = target;
      setDrag({ id: d.id, target });
    }
  };

  const gripEnd = (event: ReactPointerEvent<HTMLUListElement>, cancelled: boolean) => {
    const d = dragRef.current;
    if (!d || d.pointer !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (cancelled) return;
    const from = layers.findIndex((l) => l.id === d.id);
    if (from < 0) return;
    let to = d.target;
    if (to > from) to -= 1;
    if (to === from) return;
    const next = [...layers];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    onLayers(next);
  };

  return (
    <>
      <ColorField label="Canvas colour (shows where layers are transparent)" value={project.canvas} onChange={onCanvas} />

      <div className="layer-list-head">
        <span className="control-label">
          Layers · {layers.length} / {MAX_LAYERS}
        </span>
        <button type="button" className="text-action" onClick={onOpenElements}>
          Browse Elements →
        </button>
      </div>

      <div className="quick-add" aria-label="Add a layer">
        {QUICK_ADD.map((kind) => (
          <button key={kind} type="button" className="quick-chip" disabled={layers.length >= MAX_LAYERS} onClick={() => add(kind)}>
            <span aria-hidden="true">{KIND_DEFS[kind].icon}</span>
            {kind === "field" ? "Stars" : KIND_DEFS[kind].label}
          </button>
        ))}
      </div>

      <ul
        className="layer-list"
        ref={listRef}
        onPointerMove={gripMove}
        onPointerUp={(event) => gripEnd(event, false)}
        onPointerCancel={(event) => gripEnd(event, true)}
      >
        {layers.map((layer, i) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            selected={layer.id === selected.id}
            dragging={drag?.id === layer.id}
            dropBefore={drag !== null && drag.target === i && drag.id !== layer.id}
            onSelect={() => onSelect(layer.id)}
            onToggle={() => patchLayer(layer.id, { visible: !layer.visible })}
            onDelete={() => remove(layer.id)}
            onGrip={(event) => gripDown(event, layer)}
          />
        ))}
        {drag !== null && drag.target === layers.length && <li className="layer-drop-end" aria-hidden="true" />}
      </ul>
      <p className="layer-order-hint">Top of the list = top of the stack. Drag ⠿ to reorder.</p>

      <LayerEditor
        key={selected.id}
        layer={selected}
        maskOn={project.mask.enabled}
        index={selectedIndex}
        count={layers.length}
        onPatch={(patch) => patchLayer(selected.id, patch)}
        onMove={(direction) => move(selectedIndex, direction)}
        onDuplicate={() => duplicate(selectedIndex)}
        onDelete={() => remove(selected.id)}
        onOpenField={onOpenField}
      />

      <SoftTip>
        Layers blend bottom → top. Put a <b>Gradient</b> or <b>Solid</b> under the main field and set the field's blend to <b>Screen</b> or <b>Multiply</b> to use it as a background.
      </SoftTip>
    </>
  );
}
