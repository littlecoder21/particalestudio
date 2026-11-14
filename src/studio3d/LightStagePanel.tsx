import { Range, Section, Toggle } from "./controls3d";
import { BEAM_DEFAULTS, BEAM_LIMITS } from "./lightBeams";
import { FX_LIMITS, STAGE_LIMITS, STAGE_PRESETS, type LightStage, type ParticleFx } from "./lightStage";
import type { LightBeam } from "./types";

/** <input type="color"> only accepts #rrggbb. */
const colorInput = (hex: string) => {
  if (/^#[0-9a-fA-F]{6}/.test(hex)) return hex.slice(0, 7);
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) return "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  return "#eef0f6";
};
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Global light behaviour: how beams reveal, tint and make particles glint. Shown at the top of "Dust & beams". */
export function LightStagePanel({ stage, beamCount, onChange, onReset, onPreset }: {
  stage: LightStage; beamCount: number; onChange: (patch: Partial<LightStage>) => void; onReset: () => void; onPreset: (id: string) => void;
}) {
  const L = STAGE_LIMITS;
  return (
    <>
      <Section title="Light looks">
        <p className="s3-hint">One tap sets the dust formation, beams, light response, particle effects and colours together. Everything stays editable below.</p>
        <div className="s3-actions">
          {STAGE_PRESETS.map((preset) => <button key={preset.id} type="button" className="s3-btn" title={preset.hint} onClick={() => onPreset(preset.id)}>{preset.label}</button>)}
        </div>
      </Section>
      <Section title="Light response" right={<button type="button" className="s3-btn" onClick={onReset}>Reset</button>}>
        <p className="s3-hint">{beamCount ? "Controls how every beam lights the particles it touches." : "Add a beam below first; these controls need at least one beam."}</p>
        <Range label="Reveal by light" value={stage.reveal} min={L.reveal[0]} max={L.reveal[1]} step={0.01} fmt={pct} onChange={(v) => onChange({ reveal: v })} hint="0% = beams only tint particles. 100% = particles outside the light fade into the dark and only lit ones show." />
        <Range label="Visibility outside light" value={stage.ambient} min={L.ambient[0]} max={L.ambient[1]} step={0.01} fmt={pct} onChange={(v) => onChange({ ambient: v })} hint="How visible unlit particles stay when Reveal is above 0." />
        <Range label="Far particles dimmer" value={stage.ambientDepth} min={L.ambientDepth[0]} max={L.ambientDepth[1]} step={0.01} fmt={pct} onChange={(v) => onChange({ ambientDepth: v })} hint="Unlit particles far from the focus plane get extra dark." />
        <Range label="Beam gain" value={stage.gain} min={L.gain[0]} max={L.gain[1]} step={0.01} onChange={(v) => onChange({ gain: v })} hint="Overall brightness of every beam. 0 switches the beams off." />
        <Range label="Lit threshold" value={stage.litKnee} min={L.litKnee[0]} max={L.litKnee[1]} step={0.01} onChange={(v) => onChange({ litKnee: v })} hint="Lower = particles count as lit sooner, so the beam edge looks wider." />
      </Section>
      <Section title="Glints & reflectivity">
        <Range label="Glint amount" value={stage.glintDepth} min={L.glintDepth[0]} max={L.glintDepth[1]} step={0.01} fmt={pct} onChange={(v) => onChange({ glintDepth: v })} hint="How much of a lit particle's brightness flickers as it tumbles." />
        <Range label="Glint sharpness" value={stage.glintSharpness} min={L.glintSharpness[0]} max={L.glintSharpness[1]} step={0.5} onChange={(v) => onChange({ glintSharpness: v })} hint="Higher = rarer, sharper sparkles." />
        <Range label="Glint speed" value={stage.glintRate} min={L.glintRate[0]} max={L.glintRate[1]} step={0.01} onChange={(v) => onChange({ glintRate: v })} />
        <Range label="Flash boost" value={stage.glintBoost} min={L.glintBoost[0]} max={L.glintBoost[1]} step={0.01} onChange={(v) => onChange({ glintBoost: v })} hint="Extra brightness at the peak of each glint." />
        <Range label="Lit particle growth" value={stage.litSize} min={L.litSize[0]} max={L.litSize[1]} step={0.01} onChange={(v) => onChange({ litSize: v })} hint="Lit particles swell, most at the peak of a glint. 0 keeps every size fixed." />
        <Range label="Few very reflective" value={stage.reflectivityBias} min={L.reflectivityBias[0]} max={L.reflectivityBias[1]} step={0.01} onChange={(v) => onChange({ reflectivityBias: v })} hint="Above 1 only a few particles reflect strongly; below 1 reflectivity is more even." />
        <Range label="Surface-normal response" value={stage.normalResponse} min={L.normalResponse[0]} max={L.normalResponse[1]} step={0.01} fmt={pct} onChange={(v) => onChange({ normalResponse: v })} hint="Shapes with normals: how much faces toward the beam matter compared with random reflectivity." />
      </Section>
      <Section title="Light colour">
        <Range label="Colour mix" value={stage.lightColorMix} min={L.lightColorMix[0]} max={L.lightColorMix[1]} step={0.01} fmt={pct} onChange={(v) => onChange({ lightColorMix: v })} hint="0% = beams use the Look palette (see each beam's palette position). 100% = beams use this colour." />
        <label className="s3-text"><span>Light colour</span><input type="color" value={colorInput(stage.lightColor)} onChange={(e) => onChange({ lightColor: e.target.value })} /></label>
        <Toggle label="Show beam guides (preview only)" value={stage.guides} onChange={(v) => onChange({ guides: v })} hint="Draws each beam's axis and cross-section so you can position it. Never included in PNG exports." />
      </Section>
    </>
  );
}

/** Per-beam shaping, rendered inside each beam's <details>. */
export function BeamAdvanced({ beam, onChange }: { beam: LightBeam; onChange: (patch: Partial<LightBeam>) => void }) {
  const L = BEAM_LIMITS;
  return (
    <>
      <p className="s3-hint">Advanced shape</p>
      <Range label="Core sharpness" value={beam.coreSharp ?? BEAM_DEFAULTS.coreSharp} min={L.coreSharp[0]} max={L.coreSharp[1]} step={0.01} onChange={(v) => onChange({ coreSharp: v })} hint="Higher = a thinner, harder bright core." />
      <Range label="Halo strength" value={beam.halo ?? BEAM_DEFAULTS.halo} min={L.halo[0]} max={L.halo[1]} step={0.01} onChange={(v) => onChange({ halo: v })} hint="The soft glow around the core." />
      <Range label="Halo size" value={beam.haloSize ?? BEAM_DEFAULTS.haloSize} min={L.haloSize[0]} max={L.haloSize[1]} step={0.05} onChange={(v) => onChange({ haloSize: v })} hint="How far the halo reaches, in beam widths." />
      <Range label="Shimmer" value={beam.shimmer ?? BEAM_DEFAULTS.shimmer} min={L.shimmer[0]} max={L.shimmer[1]} step={0.01} onChange={(v) => onChange({ shimmer: v })} hint="Uneven ripple of light along the beam. 0 = perfectly even." />
      <Range label="Own colour mix" value={beam.lightMix ?? BEAM_DEFAULTS.lightMix} min={L.lightMix[0]} max={L.lightMix[1]} step={0.01} fmt={pct} onChange={(v) => onChange({ lightMix: v })} hint="Blend this beam's own colour over the palette / light-stage colour." />
      <label className="s3-text"><span>Beam colour</span><input type="color" value={colorInput(beam.lightColor ?? BEAM_DEFAULTS.lightColor)} onChange={(e) => onChange({ lightColor: e.target.value })} /></label>
    </>
  );
}

/** Per-particle appearance and visual air motion. */
export function ParticlePanel({ fx, onChange, onReset }: { fx: ParticleFx; onChange: (patch: Partial<ParticleFx>) => void; onReset: () => void }) {
  const L = FX_LIMITS;
  return (
    <>
      <Section title="Time & size" right={<button type="button" className="s3-btn" onClick={onReset}>Reset</button>}>
        <p className="s3-hint">Applies to the preview, PNG and video. The lightweight code export does not include these effects.</p>
        <Range label="Simulation speed" value={fx.timeScale} min={L.timeScale[0]} max={L.timeScale[1]} step={0.01} fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => onChange({ timeScale: v })} hint="Slow-motion or fast-forward for physics, beams and glints. 0 freezes them." />
        <Range label="Size distribution" value={fx.sizeCurve} min={L.sizeCurve[0]} max={L.sizeCurve[1]} step={0.01} onChange={(v) => onChange({ sizeCurve: v })} hint="Above 1: many tiny particles and a few large ones. Below 1: mostly large." />
        <Range label="Smallest size (px)" value={fx.minPx} min={L.minPx[0]} max={L.minPx[1]} step={0.1} onChange={(v) => onChange({ minPx: v })} hint="Particles never draw smaller than this on screen." />
        <Range label="Largest size (px)" value={fx.maxPx} min={L.maxPx[0]} max={L.maxPx[1]} step={1} onChange={(v) => onChange({ maxPx: v })} hint="Particles never draw larger than this. Your GPU may limit it further." />
      </Section>
      <Section title="Soft motes">
        <Range label="Share of particles" value={fx.moteShare} min={L.moteShare[0]} max={L.moteShare[1]} step={0.001} fmt={(v) => `${(v * 100).toFixed(1)}%`} onChange={(v) => onChange({ moteShare: v })} hint="A few particles become big, soft, out-of-focus specks." />
        <Range label="Mote size" value={fx.moteScale} min={L.moteScale[0]} max={L.moteScale[1]} step={0.1} fmt={(v) => `${v.toFixed(1)}×`} onChange={(v) => onChange({ moteScale: v })} />
        <Range label="Mote brightness" value={fx.moteAlpha} min={L.moteAlpha[0]} max={L.moteAlpha[1]} step={0.01} fmt={pct} onChange={(v) => onChange({ moteAlpha: v })} />
      </Section>
      <Section title="Brightness & colour">
        <Range label="Opacity variation" value={fx.opacityJitter} min={L.opacityJitter[0]} max={L.opacityJitter[1]} step={0.01} fmt={pct} onChange={(v) => onChange({ opacityJitter: v })} hint="Each particle gets its own random brightness." />
        <Range label="Colour variation" value={fx.colorJitter} min={L.colorJitter[0]} max={L.colorJitter[1]} step={0.01} fmt={pct} onChange={(v) => onChange({ colorJitter: v })} hint="Each particle picks a slightly different spot on the palette." />
        <Range label="Twinkle" value={fx.twinkle} min={L.twinkle[0]} max={L.twinkle[1]} step={0.01} fmt={pct} onChange={(v) => onChange({ twinkle: v })} hint="Every particle shimmers on its own, independent of the beams." />
        <Range label="Twinkle speed" value={fx.twinkleRate} min={L.twinkleRate[0]} max={L.twinkleRate[1]} step={0.05} onChange={(v) => onChange({ twinkleRate: v })} />
        <Range label="Twinkle sharpness" value={fx.twinkleSharp} min={L.twinkleSharp[0]} max={L.twinkleSharp[1]} step={0.5} onChange={(v) => onChange({ twinkleSharp: v })} hint="Higher = brief flashes instead of a gentle pulse." />
      </Section>
      <Section title="Depth of field">
        <Range label="Blur amount" value={fx.dof} min={L.dof[0]} max={L.dof[1]} step={0.01} onChange={(v) => onChange({ dof: v })} hint="Particles in front of or behind the focus plane swell into soft discs." />
        <Range label="Dim the blur" value={fx.dofDim} min={L.dofDim[0]} max={L.dofDim[1]} step={0.01} fmt={pct} onChange={(v) => onChange({ dofDim: v })} hint="Keeps blurred particles from getting brighter as they grow." />
      </Section>
      <Section title="Air motion (visual)">
        <p className="s3-hint">Drifts the picture without changing the simulation, so shapes keep their form.</p>
        <Range label="Wobble" value={fx.wander} min={L.wander[0]} max={L.wander[1]} step={0.001} onChange={(v) => onChange({ wander: v })} hint="Each particle jitters on its own." />
        <Range label="Wobble speed" value={fx.wanderSpeed} min={L.wanderSpeed[0]} max={L.wanderSpeed[1]} step={0.01} onChange={(v) => onChange({ wanderSpeed: v })} />
        <Range label="Air current" value={fx.flow} min={L.flow[0]} max={L.flow[1]} step={0.001} onChange={(v) => onChange({ flow: v })} hint="A shared flow field: neighbouring particles move together, like real air." />
        <Range label="Current scale" value={fx.flowScale} min={L.flowScale[0]} max={L.flowScale[1]} step={0.05} onChange={(v) => onChange({ flowScale: v })} hint="Smaller = broad slow swirls, larger = fine eddies." />
        <Range label="Current speed" value={fx.flowSpeed} min={L.flowSpeed[0]} max={L.flowSpeed[1]} step={0.01} onChange={(v) => onChange({ flowSpeed: v })} />
      </Section>
    </>
  );
}
