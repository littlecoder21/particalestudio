import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { shapeLibrary, shapeThumbnail } from "./shapes";
import {
  BACKDROP_KINDS,
  COLOR_MODES,
  LOCK_STYLES,
  MAX_BEAMS,
  DEFAULT_BEAMS,
  defaultStudio2D,
  type BackdropKind,
  type ColorMode,
  type LightBeam,
  type LockStyle,
  type Studio2DPatch,
  type Studio2DSettings,
} from "./types";

/* ------------------------------------------------------------ small controls */

function Range({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  format?: (value: number) => string; onChange: (value: number) => void;
}) {
  return (
    <label className="range-control">
      <span className="range-title"><span>{label}</span><span className="range-value">{format ? format(value) : value}</span></span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Choice<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly T[]; value: T; onChange: (value: T) => void;
}) {
  return (
    <div className="choice-control">
      <span className="control-label">{label}</span>
      <div className="choice-grid" role="group" aria-label={label}>
        {options.map((option) => (
          <button type="button" key={option} className={`choice-button ${value === option ? "selected" : ""}`} aria-pressed={value === option} onClick={() => onChange(option)}>{option}</button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" className={`toggle-row ${on ? "enabled" : ""}`} aria-pressed={on} onClick={() => onChange(!on)}>
      <span><b>{label}</b><small>{hint}</small></span><i className="toggle-switch" />
    </button>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="color-control">
      <span>{label}</span>
      <span className="color-input-wrap"><input type="color" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} /><code>{value.toUpperCase()}</code></span>
    </label>
  );
}

function Heading({ title, text, num }: { title: string; text: string; num: string }) {
  return (
    <div className="control-heading"><div><h2>{title}</h2><p>{text}</p></div><span className="section-number">{num}</span></div>
  );
}

function Tip({ icon = "✦", children }: { icon?: string; children: ReactNode }) {
  return <div className="soft-tip"><span>{icon}</span><p>{children}</p></div>;
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

interface PanelProps {
  studio: Studio2DSettings;
  onPatch: (patch: Studio2DPatch) => void;
}

/* -------------------------------------------------------- Shape-Locked Motion */

const STYLE_TEXT: Partial<Record<LockStyle, string>> = {
  "Gentle Float": "Particles drift softly around their places, like dust in still air.",
  "Organic Wiggle": "Lively, individual wobble. Every particle moves a little differently.",
  "Shape Breathing": "The whole formation slowly expands and contracts.",
  "Surface Ripple": "Soft waves travel across the surface of the shape.",
  "Energy Pulse": "A glowing pulse sweeps outward from the centre.",
  "Almost Still": "Barely-there movement that keeps the shape alive but calm.",
};

export function ShapeLockPanel({ studio, onPatch, motion }: PanelProps & { motion: string }) {
  const lock = studio.shapeLock;
  const set = (patch: Partial<typeof lock>) => onPatch({ shapeLock: patch });
  return (
    <div className="section-content">
      <Heading title="Shape-locked motion" text="Keep the shape recognisable while every particle stays alive." num="06" />
      <Toggle label="Shape preservation" hint="Each particle belongs to a place in the shape and springs back to it" on={lock.enabled} onChange={(enabled) => set({ enabled })} />
      {!lock.enabled && (
        <Tip icon="◈">Turn it on to stop particles drifting away. Motion styles, physics and the pointer still work, but they can only push particles a little before they return home. Turning it off brings back the original free motion.</Tip>
      )}
      {lock.enabled && (
        <>
          <label className="svg-select-control">
            <span>Movement style · {LOCK_STYLES.length} styles</span>
            <select aria-label="Movement style" value={lock.style} onChange={(event) => set({ style: event.currentTarget.value as LockStyle })}>
              {LOCK_STYLES.map((style) => <option key={style} value={style}>{style}</option>)}
            </select>
          </label>
          <p className="field-help">{STYLE_TEXT[lock.style] ?? "A distinct blend of drift, pulse, breathing and surface motion, bounded by the shape lock."}</p>
          <Range label="Preservation strength" value={lock.strength} min={0} max={1} step={0.01} format={pct} onChange={(strength) => set({ strength })} />
          <Range label="Movement amount" value={lock.amount} min={0} max={1} step={0.01} format={pct} onChange={(amount) => set({ amount })} />
          <Range label="Movement speed" value={lock.speed} min={0.1} max={3} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(speed) => set({ speed })} />
          <Range label="Maximum displacement" value={lock.maxDisplacement} min={1} max={80} step={1} format={(v) => `${v} px`} onChange={(maxDisplacement) => set({ maxDisplacement })} />
          <Range label="Organic variation" value={lock.variation} min={0} max={1} step={0.01} format={pct} onChange={(variation) => set({ variation })} />
          <Range label="Particle independence" value={lock.independence} min={0} max={1} step={0.01} format={pct} onChange={(independence) => set({ independence })} />
          <div className="control-divider" />
          <Range label="Return strength" value={lock.returnStrength} min={0.2} max={3} step={0.05} onChange={(returnStrength) => set({ returnStrength })} />
          <Range label="Damping" value={lock.damping} min={0} max={1} step={0.01} format={pct} onChange={(damping) => set({ damping })} />
          <Range label="Breathing amount" value={lock.breathing} min={0} max={1} step={0.01} format={pct} onChange={(breathing) => set({ breathing })} />
          <Range label="Ripple strength" value={lock.ripple} min={0} max={1} step={0.01} format={pct} onChange={(ripple) => set({ ripple })} />
          <div className="control-divider" />
          <Range label="Pointer reach" value={lock.pointerReach} min={0} max={4} step={0.1} format={(v) => `${v.toFixed(1)}×`} onChange={(pointerReach) => set({ pointerReach })} />
          <Range label="Interaction recovery" value={lock.recovery} min={0} max={1} step={0.01} format={pct} onChange={(recovery) => set({ recovery })} />
          <p className="field-help">Movement is always limited to the maximum displacement (it scales with the canvas size), and the pointer can push particles at most {lock.pointerReach.toFixed(1)}× further. Lower damping gives a springier return.</p>
          {motion === "Off" && <Tip icon="◈">Motion is set to <b>Off</b>. That is fine: shape-locked motion animates the particles on its own.</Tip>}
          <button type="button" className="text-action" onClick={() => set({ ...defaultStudio2D().shapeLock, enabled: true })}>Reset lock settings</button>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- Light */

export function LightPanel({ studio, onPatch, selectedBeam, onSelectBeam }: PanelProps & { selectedBeam: number; onSelectBeam: (index: number) => void }) {
  const light = studio.light;
  const set = (patch: Partial<typeof light>) => onPatch({ light: patch });
  const index = Math.min(selectedBeam, Math.max(0, light.beams.length - 1));
  const beam = light.beams[index];
  const setBeam = (patch: Partial<LightBeam>) => {
    const beams = light.beams.map((item, i) => (i === index ? { ...item, ...patch } : item));
    set({ beams });
  };
  return (
    <div className="section-content">
      <Heading title="Light on particles" text="Beams you can't see that light up only the particles they touch." num="08" />
      <Toggle label="Scene lighting" hint="Particles are dim until light falls on them" on={light.enabled} onChange={(enabled) => set({ enabled })} />
      {!light.enabled && (
        <Tip icon="☀">Like dust floating through a sunbeam: the beam itself is never drawn, only the particles inside it catch the light and flash. Works on your shape, on free dust (FX tab) and with a pointer torch.</Tip>
      )}
      {light.enabled && (
        <>
          <div className="s2-subhead"><b>Beams</b><small>{light.beams.length} of {MAX_BEAMS}</small></div>
          <div className="s2-beam-tabs" role="tablist" aria-label="Light beams">
            {light.beams.map((_, i) => (
              <button type="button" role="tab" aria-selected={i === index} key={i} className={`choice-button ${i === index ? "selected" : ""}`} onClick={() => onSelectBeam(i)}>Beam {i + 1}</button>
            ))}
            <button type="button" className="text-action" disabled={light.beams.length >= MAX_BEAMS} onClick={() => {
              const template = DEFAULT_BEAMS[light.beams.length % DEFAULT_BEAMS.length];
              set({ beams: [...light.beams, { ...template, fromX: template.fromX + 0.12, toX: template.toX + 0.1 }] });
              onSelectBeam(light.beams.length);
            }}>＋ Add</button>
            <button type="button" className="text-action" disabled={light.beams.length === 0} onClick={() => {
              set({ beams: light.beams.filter((_, i) => i !== index) });
              onSelectBeam(Math.max(0, index - 1));
            }}>Remove</button>
          </div>
          {beam ? (
            <>
              <Range label="Origin X" value={beam.fromX} min={-0.5} max={1.5} step={0.01} format={pct} onChange={(fromX) => setBeam({ fromX })} />
              <Range label="Origin Y" value={beam.fromY} min={-0.5} max={1.5} step={0.01} format={pct} onChange={(fromY) => setBeam({ fromY })} />
              <Range label="Target X" value={beam.toX} min={-0.5} max={1.5} step={0.01} format={pct} onChange={(toX) => setBeam({ toX })} />
              <Range label="Target Y" value={beam.toY} min={-0.5} max={1.5} step={0.01} format={pct} onChange={(toY) => setBeam({ toY })} />
              <Range label="Beam width" value={beam.width} min={0.005} max={0.25} step={0.005} format={(v) => v.toFixed(3)} onChange={(width) => setBeam({ width })} />
              <Range label="Beam spread" value={beam.spread} min={0} max={3} step={0.05} onChange={(spread) => setBeam({ spread })} />
              <Range label="Fade in" value={beam.fadeIn} min={0} max={0.7} step={0.01} format={pct} onChange={(fadeIn) => setBeam({ fadeIn })} />
              <Range label="Fade out" value={beam.fadeOut} min={0} max={0.95} step={0.01} format={pct} onChange={(fadeOut) => setBeam({ fadeOut })} />
              <Range label="Beam strength" value={beam.strength} min={0} max={1.6} step={0.02} onChange={(strength) => setBeam({ strength })} />
              <ColorField label="Beam colour" value={beam.color} onChange={(color) => setBeam({ color })} />
            </>
          ) : <p className="field-help">No beams. Add one, or use the pointer torch below.</p>}
          <Toggle label="Show beam guides" hint="Dashed guides plus draggable handles on the canvas" on={light.showGuide} onChange={(showGuide) => set({ showGuide })} />
          <div className="control-divider" />
          <Range label="Dark level (outside light)" value={light.ambient} min={0} max={0.8} step={0.01} format={pct} onChange={(ambient) => set({ ambient })} />
          <Range label="Light intensity" value={light.intensity} min={0} max={2.5} step={0.05} onChange={(intensity) => set({ intensity })} />
          <Range label="Reflectivity variation" value={light.reflectivity} min={0} max={1} step={0.01} format={pct} onChange={(reflectivity) => set({ reflectivity })} />
          <Range label="Glint flares" value={light.glint} min={0} max={1} step={0.01} format={pct} onChange={(glint) => set({ glint })} />
          <Range label="Beam sway" value={light.sway} min={0} max={1} step={0.01} format={pct} onChange={(sway) => set({ sway })} />
          <Range label="Sway speed" value={light.swaySpeed} min={0.1} max={3} step={0.05} onChange={(swaySpeed) => set({ swaySpeed })} />
          <Range label="Visible haze" value={light.haze} min={0} max={1} step={0.01} format={pct} onChange={(haze) => set({ haze })} />
          <Toggle label="Light free dust too" hint="Dust from the FX tab also catches the beams" on={light.lightDust} onChange={(lightDust) => set({ lightDust })} />
          <div className="control-divider" />
          <Toggle label="Pointer torch" hint="A soft light that follows your finger or mouse" on={light.torch} onChange={(torch) => set({ torch })} />
          {light.torch && (
            <>
              <Range label="Torch radius" value={light.torchRadius} min={40} max={500} step={5} format={(v) => `${v} px`} onChange={(torchRadius) => set({ torchRadius })} />
              <Range label="Torch strength" value={light.torchStrength} min={0} max={2} step={0.05} onChange={(torchStrength) => set({ torchStrength })} />
              <ColorField label="Torch colour" value={light.torchColor} onChange={(torchColor) => set({ torchColor })} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- FX */

export function FxPanel({ studio, onPatch, trails }: PanelProps & { trails: boolean }) {
  const fx = studio.fx;
  const set = (patch: Studio2DPatch["fx"]) => onPatch({ fx: patch });
  return (
    <div className="section-content">
      <Heading title="Advanced FX" text="Color mapping, orbit rings, dust, bloom and more." num="09" />
      <Choice<ColorMode> label="Color mapping" options={COLOR_MODES} value={fx.colorMode} onChange={(colorMode) => set({ colorMode })} />
      <p className="field-help">{fx.colorMode === "Palette" ? "Particles use your palette (or imported SVG colors) as usual." : "Your palette is spread across the shape as a smooth gradient and overrides imported SVG colors."}</p>
      {fx.colorMode === "Linear" && <Range label="Gradient angle" value={fx.gradientAngle} min={0} max={360} step={1} format={(v) => `${v}°`} onChange={(gradientAngle) => set({ gradientAngle })} />}
      {fx.colorMode !== "Palette" && <Range label="Gradient flow" value={fx.gradientFlow} min={0} max={1} step={0.01} format={pct} onChange={(gradientFlow) => set({ gradientFlow })} />}
      <div className="control-divider" />
      <Toggle label="Orbit rings" hint="Tilted rings of particles circling the shape" on={fx.rings.enabled} onChange={(enabled) => set({ rings: { enabled } })} />
      {fx.rings.enabled && (
        <>
          <Range label="Rings" value={fx.rings.count} min={1} max={6} step={1} onChange={(count) => set({ rings: { count } })} />
          <Range label="Particles per ring" value={fx.rings.perRing} min={20} max={260} step={5} onChange={(perRing) => set({ rings: { perRing } })} />
          <Range label="Ring size" value={fx.rings.radius} min={0.4} max={1.8} step={0.01} format={(v) => `${v.toFixed(2)}×`} onChange={(radius) => set({ rings: { radius } })} />
          <Range label="Ring tilt" value={fx.rings.tilt} min={0} max={85} step={1} format={(v) => `${v}°`} onChange={(tilt) => set({ rings: { tilt } })} />
          <Range label="Orbit speed" value={fx.rings.speed} min={0.1} max={3} step={0.05} onChange={(speed) => set({ rings: { speed } })} />
          <Range label="Ring trail line" value={fx.rings.trail} min={0} max={1} step={0.01} format={pct} onChange={(trail) => set({ rings: { trail } })} />
          <Range label="Ring particle size" value={fx.rings.size} min={0.4} max={3} step={0.05} onChange={(size) => set({ rings: { size } })} />
        </>
      )}
      <div className="control-divider" />
      <Toggle label="Free dust" hint="Floating motes around the scene (lit by beams when Light is on)" on={fx.dust.enabled} onChange={(enabled) => set({ dust: { enabled } })} />
      {fx.dust.enabled && (
        <>
          <Range label="Dust amount" value={fx.dust.amount} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 1400)}`} onChange={(amount) => set({ dust: { amount } })} />
          <Range label="Dust drift" value={fx.dust.drift} min={0} max={1} step={0.01} format={pct} onChange={(drift) => set({ dust: { drift } })} />
        </>
      )}
      <div className="control-divider" />
      <Range label="Glints" value={fx.glints} min={0} max={1} step={0.01} format={pct} onChange={(glints) => set({ glints })} />
      <Range label="Soft bokeh motes" value={fx.bokeh} min={0} max={0.6} step={0.01} format={pct} onChange={(bokeh) => set({ bokeh })} />
      <Range label="Bloom glow" value={fx.bloom} min={0} max={1} step={0.01} format={pct} onChange={(bloom) => set({ bloom })} />
      {trails && fx.bloom > 0 && <p className="field-help">Bloom, vignette and grain are paused while motion trails are on.</p>}
      <div className="control-divider" />
      <Toggle label="Tap shockwave" hint="Tapping or clicking sends a ring that pushes particles" on={fx.shockwave} onChange={(shockwave) => set({ shockwave })} />
      {fx.shockwave && <Range label="Shockwave strength" value={fx.shockStrength} min={0} max={2.5} step={0.05} onChange={(shockStrength) => set({ shockStrength })} />}
    </div>
  );
}

/* --------------------------------------------------------------- Backdrop */

const BACKDROP_TEXT: Record<BackdropKind, string> = {
  None: "Use the plain background above.",
  Nebula: "Slow drifting clouds of color with distant stars.",
  Aurora: "Soft curtains of light waving across the top.",
  Starfield: "Twinkling stars with pointer parallax.",
  "Floor Glow": "A glowing floor ring, perfect for figures and objects.",
  "Grid Floor": "A retro perspective grid scrolling to the horizon.",
  "Mesh Gradient": "A smooth, slowly morphing gradient of three colors.",
  Haze: "Drifting fog veils for atmosphere and sunbeams.",
};

export function BackdropControls({ studio, onPatch, trails }: PanelProps & { trails: boolean }) {
  const b = studio.backdrop;
  const set = (patch: Partial<typeof b>) => onPatch({ backdrop: patch });
  return (
    <>
      <div className="s2-subhead"><b>Advanced backdrop</b><small>Drawn behind the particles</small></div>
      <Choice<BackdropKind> label="Backdrop" options={BACKDROP_KINDS} value={b.kind} onChange={(kind) => set({ kind })} />
      <p className="field-help">{BACKDROP_TEXT[b.kind]}</p>
      {b.kind !== "None" && (
        <>
          <div className="color-row">
            <ColorField label="Color A" value={b.colorA} onChange={(colorA) => set({ colorA })} />
            <ColorField label="Color B" value={b.colorB} onChange={(colorB) => set({ colorB })} />
          </div>
          <div className="color-row single-color"><ColorField label="Color C" value={b.colorC} onChange={(colorC) => set({ colorC })} /></div>
          <Range label="Intensity" value={b.intensity} min={0} max={1.5} step={0.01} format={pct} onChange={(intensity) => set({ intensity })} />
          <Range label="Speed" value={b.speed} min={0} max={3} step={0.05} onChange={(speed) => set({ speed })} />
          <Range label="Scale" value={b.scale} min={0.4} max={2.5} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(scale) => set({ scale })} />
          {b.kind !== "Mesh Gradient" && b.kind !== "Haze" && <Range label="Stars" value={b.stars} min={0} max={1} step={0.01} format={pct} onChange={(stars) => set({ stars })} />}
          <Range label="Pointer parallax" value={b.parallax} min={0} max={1} step={0.01} format={pct} onChange={(parallax) => set({ parallax })} />
        </>
      )}
      <Range label="Vignette" value={b.vignette} min={0} max={1} step={0.01} format={pct} onChange={(vignette) => set({ vignette })} />
      <Range label="Film grain" value={b.grain} min={0} max={1} step={0.01} format={pct} onChange={(grain) => set({ grain })} />
      {trails && (b.vignette > 0 || b.grain > 0) && <p className="field-help">Vignette and grain are paused while motion trails are on.</p>}
    </>
  );
}

/* ---------------------------------------------------------------- Library */

export function LibraryPanel({ activeName, count, onUse, onImport }: {
  activeName: string; count: number; onUse: (id: string) => void; onImport: () => void;
}) {
  return (
    <div className="section-content">
      <Heading title="SVG shape library" text="Detailed vector shapes that turn into particle art." num="03" />
      <div className="s2-lib-grid">
        {shapeLibrary.map((shape) => (
          <button type="button" key={shape.id} className={`s2-lib-card ${activeName === shape.name ? "active" : ""}`} onClick={() => onUse(shape.id)} aria-label={`Use ${shape.name} as particle source`}
            style={{ "--s2-glow": shape.swatch[1] ?? shape.swatch[0] } as CSSProperties}>
            <span className="s2-lib-thumb"><img src={shapeThumbnail(shape.markup)} alt="" loading="lazy" draggable={false} /></span>
            <span className="s2-lib-name">{shape.name}</span>
            <span className="s2-lib-tag">{shape.tag} · {shape.count.toLocaleString()}+</span>
          </button>
        ))}
      </div>
      <Tip>Choosing a shape loads it as a normal SVG source (raising the particle count to {Math.max(count, 0) < 1400 ? "its best detail level" : "at least what it needs"} if needed). Gradients in the SVG become per-particle colors; combine with <b>Lock</b>, <b>Light</b> and <b>FX</b> for glowing, living particle art.</Tip>
      <button type="button" className="svg-upload-button secondary" onClick={onImport}>＋ Import your own SVG</button>
    </div>
  );
}

/* ----------------------------------------------------------- Beam handles */

export function BeamHandles({ active, studio, onPatch, selectedBeam, onSelectBeam }: PanelProps & {
  active: boolean; selectedBeam: number; onSelectBeam: (index: number) => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<{ beam: number; end: "from" | "to" } | null>(null);
  if (!active) return null;
  const beams = studio.light.beams;

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    const element = layer.current;
    if (!state || !element) return;
    const rect = element.getBoundingClientRect();
    const x = Math.min(1.5, Math.max(-0.5, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1.5, Math.max(-0.5, (event.clientY - rect.top) / rect.height));
    onPatch({
      light: {
        beams: beams.map((beam, i) => (i !== state.beam ? beam : state.end === "from" ? { ...beam, fromX: x, fromY: y } : { ...beam, toX: x, toY: y })),
      },
    });
  };

  return (
    <div className="s2-handles" ref={layer}>
      {beams.map((beam, i) => (["from", "to"] as const).map((end) => {
        const x = end === "from" ? beam.fromX : beam.toX;
        const y = end === "from" ? beam.fromY : beam.toY;
        if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) {
          // Handles outside the canvas stay reachable at the edge.
        }
        const left = Math.min(1, Math.max(0, x)) * 100;
        const top = Math.min(1, Math.max(0, y)) * 100;
        return (
          <button
            type="button"
            key={`${i}-${end}`}
            className={`s2-handle ${end} ${i === selectedBeam ? "selected" : ""}`}
            style={{ left: `${left}%`, top: `${top}%` }}
            aria-label={`Beam ${i + 1} ${end === "from" ? "origin" : "target"} handle`}
            onPointerDown={(event) => {
              drag.current = { beam: i, end };
              onSelectBeam(i);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={move}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
          >{end === "from" ? "◉" : "◎"}</button>
        );
      }))}
    </div>
  );
}
