import { useState } from "react";
import { ChoiceGroup, RangeControl, SoftTip, SubTabs, ToggleRow, formatValue } from "./controls";
import {
  EFFECTS,
  EFFECT_LIST,
  FALLOFF_FN,
  MODE_CATEGORIES,
  MODE_DEFS,
  MODE_MAP,
  TOUCH_TEMPLATES,
  TRIGGER_HINT,
  defaultModeParams,
  makeRule,
  modeRulesOf,
  type ModeCategory,
  type TouchParam,
} from "./touch";
import {
  FALLOFFS,
  MAX_RULES,
  RANGES,
  TOUCH_SOURCES,
  TRIGGERS,
  type Falloff,
  type InteractionMode,
  type ShaderProject,
  type TouchRule,
  type TouchSettings,
  type Trigger,
} from "./types";

interface TouchPanelProps {
  project: ShaderProject;
  onPatch: (patch: Partial<ShaderProject>) => void;
}

type View = "modes" | "custom";

const withUnit = (value: number, p: TouchParam): string => `${formatValue(value, p.step)}${p.unit ?? ""}`;

/* ───────────────────────── falloff curve ───────────────────────── */

function FalloffChart({ falloff }: { falloff: Falloff }) {
  const fn = FALLOFF_FN[falloff];
  const points: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const q = (i / 48) * 1.6;
    points.push(`${((q / 1.6) * 100).toFixed(2)},${(36 - fn(q) * 32).toFixed(2)}`);
  }
  return (
    <svg className="falloff-chart" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`${falloff} falloff curve`}>
      <line x1="62.5" y1="2" x2="62.5" y2="38" className="fc-radius" />
      <polyline points={points.join(" ")} className="fc-curve" />
    </svg>
  );
}

/* ───────────────────────── rule card ───────────────────────── */

interface RuleCardProps {
  rule: TouchRule;
  index: number;
  count: number;
  onChange: (rule: TouchRule) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function RuleCard({ rule, index, count, onChange, onMove, onDuplicate, onDelete }: RuleCardProps) {
  const def = EFFECTS[rule.effect];
  return (
    <article className={`rule-card ${rule.enabled ? "" : "off"}`}>
      <header className="rule-head">
        <span className="rule-index">{index + 1}</span>
        <select
          className="rule-effect"
          aria-label={`Rule ${index + 1} effect`}
          value={rule.effect}
          onChange={(event) => {
            const effect = EFFECT_LIST.find((e) => e.id === event.target.value)?.id ?? rule.effect;
            const next = EFFECTS[effect];
            onChange({ ...rule, effect, p1: next.p1?.value ?? 0, p2: next.p2?.value ?? 0 });
          }}
        >
          {EFFECT_LIST.map((e) => (
            <option key={e.id} value={e.id}>
              {e.icon} {e.label}
            </option>
          ))}
        </select>
        <div className="rule-actions">
          <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
          <button type="button" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
          <button type="button" aria-label="Duplicate rule" disabled={count >= MAX_RULES} onClick={onDuplicate}>⧉</button>
          <button type="button" aria-label={rule.enabled ? "Disable rule" : "Enable rule"} aria-pressed={rule.enabled} onClick={() => onChange({ ...rule, enabled: !rule.enabled })}>
            {rule.enabled ? "◉" : "○"}
          </button>
          <button type="button" aria-label="Delete rule" className="danger" onClick={onDelete}>✕</button>
        </div>
      </header>
      <p className="rule-desc">{def.description}</p>

      <RangeControl label="Amount" value={rule.amount} min={RANGES.ruleAmount.min} max={RANGES.ruleAmount.max} step={RANGES.ruleAmount.step} reset={1} onChange={(v) => onChange({ ...rule, amount: v })} />
      <RangeControl label="Radius ×" value={rule.radius} min={RANGES.ruleRadius.min} max={RANGES.ruleRadius.max} step={RANGES.ruleRadius.step} reset={1} onChange={(v) => onChange({ ...rule, radius: v })} />
      {def.p1 && (
        <RangeControl label={def.p1.label} value={rule.p1} min={def.p1.min} max={def.p1.max} step={def.p1.step} display={withUnit(rule.p1, def.p1)} onChange={(v) => onChange({ ...rule, p1: v })} />
      )}
      {def.p2 && (
        <RangeControl label={def.p2.label} value={rule.p2} min={def.p2.min} max={def.p2.max} step={def.p2.step} display={withUnit(rule.p2, def.p2)} onChange={(v) => onChange({ ...rule, p2: v })} />
      )}

      <div className="rule-falloff">
        <ChoiceGroup label="Falloff" value={rule.falloff} options={FALLOFFS} onChange={(falloff) => onChange({ ...rule, falloff })} />
        <FalloffChart falloff={rule.falloff} />
      </div>
      <ChoiceGroup label="Trigger" value={rule.trigger} options={TRIGGERS} onChange={(trigger) => onChange({ ...rule, trigger })} />
      <p className="rule-hint">{TRIGGER_HINT[rule.trigger]}</p>
      {def.kind !== "prism" && (
        <ChoiceGroup label="Follows" value={rule.source} options={TOUCH_SOURCES} onChange={(source) => onChange({ ...rule, source })} />
      )}
    </article>
  );
}

/* ───────────────────────── modes ───────────────────────── */

function ModesView({ project, onPatch, openCustom }: TouchPanelProps & { openCustom: () => void }) {
  const [category, setCategory] = useState<ModeCategory | "All">("All");
  const touch = project.touch;
  const def = MODE_MAP[project.interaction];
  const custom = touch.source === "custom";
  const list = MODE_DEFS.filter((d) => category === "All" || d.category === category);

  const patchTouch = (patch: Partial<TouchSettings>) => onPatch({ touch: { ...touch, ...patch } });

  const selectMode = (mode: InteractionMode) =>
    onPatch({ interaction: mode, touch: { ...touch, source: "mode", params: defaultModeParams(mode) } });

  const setParam = (index: 0 | 1, value: number) => {
    const params: [number, number] = index === 0 ? [value, touch.params[1]] : [touch.params[0], value];
    patchTouch({ params });
  };

  return (
    <>
      {custom && (
        <div className="touch-banner">
          <span>The custom builder is driving the pointer.</span>
          <button type="button" className="text-action" onClick={openCustom}>Open builder</button>
        </div>
      )}

      <ChoiceGroup label="Category" value={category} options={["All", ...MODE_CATEGORIES] as Array<ModeCategory | "All">} onChange={setCategory} />

      <div className="mode-grid" role="listbox" aria-label="Pointer modes">
        {list.map((d) => {
          const selected = !custom && d.id === project.interaction;
          return (
            <button
              key={d.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={`mode-tile ${selected ? "selected" : ""}`}
              onClick={() => selectMode(d.id)}
            >
              <span className="mode-icon" aria-hidden="true">{d.icon}</span>
              <b>{d.id}</b>
            </button>
          );
        })}
      </div>

      <div className="interaction-card">
        <b>
          {def.icon} {def.id}
        </b>
        <p>
          <em>{def.tag}.</em> {def.description}
        </p>
      </div>

      {def.id !== "Off" && (
        <>
          <RangeControl label="Radius" value={project.interactionRadius} min={RANGES.interactionRadius.min} max={RANGES.interactionRadius.max} step={RANGES.interactionRadius.step} onChange={(v) => onPatch({ interactionRadius: v })} />
          <RangeControl label="Strength" value={project.interactionStrength} min={RANGES.interactionStrength.min} max={RANGES.interactionStrength.max} step={RANGES.interactionStrength.step} onChange={(v) => onPatch({ interactionStrength: v })} />
          {def.params.map((param, i) => {
            const index = (i === 0 ? 0 : 1) as 0 | 1;
            const value = touch.params[index];
            return (
              <RangeControl
                key={`${def.id}-${param.label}`}
                label={param.label}
                value={value}
                min={param.min}
                max={param.max}
                step={param.step}
                display={withUnit(value, param)}
                reset={param.value}
                onChange={(v) => setParam(index, v)}
              />
            );
          })}
          <ChoiceGroup label="Falloff" value={touch.falloff} options={["Auto", ...FALLOFFS] as Array<Falloff | "Auto">} onChange={(falloff) => patchTouch({ falloff })} />
          <ChoiceGroup label="Trigger" value={touch.trigger} options={["Auto", ...TRIGGERS] as Array<Trigger | "Auto">} onChange={(trigger) => patchTouch({ trigger })} />
          <RangeControl label="Response" value={touch.response} min={RANGES.touchResponse.min} max={RANGES.touchResponse.max} step={RANGES.touchResponse.step} display={touch.response < 5 ? "Silky" : touch.response > 11 ? "Snappy" : "Balanced"} reset={7} onChange={(v) => patchTouch({ response: v })} />
          {def.trail && (
            <RangeControl label="Trail length" value={touch.trail} min={RANGES.touchTrail.min} max={RANGES.touchTrail.max} step={RANGES.touchTrail.step} display={`${touch.trail.toFixed(1)} s`} reset={1.2} onChange={(v) => patchTouch({ trail: v })} />
          )}
        </>
      )}

      <ToggleRow title="Click ripples" description="Taps send rings across the surface" enabled={project.ripples} onChange={(v) => onPatch({ ripples: v })} />
      <ToggleRow title="Idle drift" description="The pointer wanders on its own when nobody touches" enabled={project.idleDrift} onChange={(v) => onPatch({ idleDrift: v })} />

      {def.id !== "Off" && (
        <button type="button" className="svg-upload-button" onClick={openCustom}>
          Edit “{def.id}” in the custom builder →
        </button>
      )}
      <SoftTip>Move or drag over the preview to try a mode. Every mode is built from the same rules you can edit in the Custom builder.</SoftTip>
    </>
  );
}

/* ───────────────────────── custom builder ───────────────────────── */

function CustomView({ project, onPatch }: TouchPanelProps) {
  const [adding, setAdding] = useState(false);
  const touch = project.touch;
  const rules = touch.custom;
  const active = touch.source === "custom";

  /* editing a rule means you want to hear it, so the builder switches itself on */
  const setRules = (next: TouchRule[], source: TouchSettings["source"] = "custom") =>
    onPatch({ touch: { ...touch, custom: next.slice(0, MAX_RULES), source } });

  const update = (index: number, rule: TouchRule) => setRules(rules.map((r, i) => (i === index ? rule : r)));
  const remove = (index: number) => setRules(rules.filter((_, i) => i !== index), rules.length <= 1 ? "mode" : "custom");
  const duplicate = (index: number) => {
    const rule = rules[index];
    if (!rule || rules.length >= MAX_RULES) return;
    setRules([...rules.slice(0, index + 1), { ...rule }, ...rules.slice(index + 1)]);
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    setRules(next);
  };

  return (
    <>
      <ToggleRow
        title="Use custom touch"
        description={active ? "Your rules drive the pointer" : "Off — the selected predefined mode is running"}
        enabled={active}
        onChange={(v) => onPatch({ touch: { ...touch, source: v && rules.length > 0 ? "custom" : "mode" } })}
      />

      <div className="template-block">
        <span className="control-label">Start from</span>
        <div className="template-list">
          <button type="button" className="template-chip" disabled={project.interaction === "Off"} onClick={() => setRules(modeRulesOf(project))}>
            <b>Copy “{project.interaction}”</b>
            <small>the current mode</small>
          </button>
          {TOUCH_TEMPLATES.map((t) => (
            <button key={t.name} type="button" className="template-chip" onClick={() => setRules(t.rules())}>
              <b>{t.name}</b>
              <small>{t.tag}</small>
            </button>
          ))}
        </div>
      </div>

      <RangeControl label="Radius" value={project.interactionRadius} min={RANGES.interactionRadius.min} max={RANGES.interactionRadius.max} step={RANGES.interactionRadius.step} onChange={(v) => onPatch({ interactionRadius: v })} />
      <RangeControl label="Strength" value={project.interactionStrength} min={RANGES.interactionStrength.min} max={RANGES.interactionStrength.max} step={RANGES.interactionStrength.step} onChange={(v) => onPatch({ interactionStrength: v })} />
      <RangeControl label="Response" value={touch.response} min={RANGES.touchResponse.min} max={RANGES.touchResponse.max} step={RANGES.touchResponse.step} display={touch.response < 5 ? "Silky" : touch.response > 11 ? "Snappy" : "Balanced"} reset={7} onChange={(v) => onPatch({ touch: { ...touch, response: v } })} />
      <RangeControl label="Trail length" value={touch.trail} min={RANGES.touchTrail.min} max={RANGES.touchTrail.max} step={RANGES.touchTrail.step} display={`${touch.trail.toFixed(1)} s`} reset={1.2} onChange={(v) => onPatch({ touch: { ...touch, trail: v } })} />

      <div className="rule-list-head">
        <span className="control-label">Rules · {rules.length} / {MAX_RULES}</span>
        <button type="button" className="text-action" disabled={rules.length >= MAX_RULES} onClick={() => setAdding((v) => !v)}>
          {adding ? "Close" : "+ Add rule"}
        </button>
      </div>

      {adding && rules.length < MAX_RULES && (
        <div className="effect-grid" role="listbox" aria-label="Add an effect">
          {EFFECT_LIST.map((e) => (
            <button
              key={e.id}
              type="button"
              role="option"
              aria-selected={false}
              className="effect-chip"
              title={e.description}
              onClick={() => {
                setRules([...rules, makeRule(e.id)]);
                setAdding(false);
              }}
            >
              <span aria-hidden="true">{e.icon}</span>
              <b>{e.label}</b>
              <small>{e.kind === "warp" ? "Bends space" : e.kind === "prism" ? "Splits colour" : "Changes colour"}</small>
            </button>
          ))}
        </div>
      )}

      {rules.length === 0 && !adding && (
        <SoftTip>No rules yet. Pick a template above or add your first rule — each rule is one effect with its own falloff, trigger and source.</SoftTip>
      )}

      {rules.map((rule, i) => (
        <RuleCard
          key={i}
          rule={rule}
          index={i}
          count={rules.length}
          onChange={(next) => update(i, next)}
          onMove={(d) => move(i, d)}
          onDuplicate={() => duplicate(i)}
          onDelete={() => remove(i)}
        />
      ))}

      <ToggleRow title="Click ripples" description="Taps send rings across the surface" enabled={project.ripples} onChange={(v) => onPatch({ ripples: v })} />
      <ToggleRow title="Idle drift" description="The pointer wanders on its own when nobody touches" enabled={project.idleDrift} onChange={(v) => onPatch({ idleDrift: v })} />
    </>
  );
}

/* ───────────────────────── panel ───────────────────────── */

export default function TouchPanel({ project, onPatch }: TouchPanelProps) {
  const [view, setView] = useState<View>(project.touch.source === "custom" ? "custom" : "modes");
  return (
    <>
      <SubTabs
        label="Touch panels"
        value={view}
        onChange={setView}
        tabs={[
          { id: "modes", label: "Modes", hint: `${MODE_DEFS.length} ready` },
          { id: "custom", label: "Custom builder", hint: project.touch.custom.length > 0 ? `${project.touch.custom.length} rules` : "build your own" },
        ]}
      />
      {view === "modes" ? (
        <ModesView project={project} onPatch={onPatch} openCustom={() => setView("custom")} />
      ) : (
        <CustomView project={project} onPatch={onPatch} />
      )}
    </>
  );
}
