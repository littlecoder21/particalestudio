import { ColorField, RangeControl, ToggleRow } from "./controls";
import type { ShaderMask, TextFontFamily, TextFontWeight, TextMaskSource } from "./types";
import { MAX_TEXT_LENGTH, MAX_TEXT_LINES, TEXT_FONT_FAMILIES, TEXT_FONT_WEIGHTS } from "./types";

interface TextPanelProps {
  mask: ShaderMask;
  onMask: (patch: Partial<ShaderMask>) => void;
}

const DEFAULT_TEXT: TextMaskSource = {
  kind: "text",
  text: "MAKE\nIT MOVE",
  fontFamily: "system-ui, sans-serif",
  fontWeight: "800",
  italic: false,
  tracking: 0,
  lineSpacing: 1.15,
  align: "center",
};

const FONT_LABELS: Record<TextFontFamily, string> = {
  "system-ui, sans-serif": "System Sans",
  "Arial, sans-serif": "Arial",
  "Georgia, serif": "Georgia",
  "Impact, sans-serif": "Impact",
  "Courier New, monospace": "Courier",
  monospace: "Monospace",
};

export default function TextPanel({ mask, onMask }: TextPanelProps) {
  const source = mask.source.kind === "text" ? mask.source : DEFAULT_TEXT;

  const updateText = (patch: Partial<TextMaskSource>) => {
    onMask({ source: { ...source, ...patch } });
  };

  return (
    <>
      <label className="control-label text-input-label" htmlFor="shader-text-content">Text to bring to life</label>
      <textarea
        id="shader-text-content"
        className="shader-text-input"
        value={source.text}
        maxLength={MAX_TEXT_LENGTH}
        rows={4}
        placeholder="Type a headline"
        onChange={(event) => updateText({ text: event.target.value.split("\n").slice(0, MAX_TEXT_LINES).join("\n") })}
      />
      <small className="text-count">{source.text.length} / {MAX_TEXT_LENGTH} characters · Up to {MAX_TEXT_LINES} lines</small>

      <label className="svg-select-control">
        Typeface
        <select value={source.fontFamily} onChange={(event) => updateText({ fontFamily: event.target.value as TextFontFamily })}>
          {TEXT_FONT_FAMILIES.map((family) => <option key={family} value={family}>{FONT_LABELS[family]}</option>)}
        </select>
      </label>
      <label className="svg-select-control">
        Weight
        <select value={source.fontWeight} onChange={(event) => updateText({ fontWeight: event.target.value as TextFontWeight })}>
          {TEXT_FONT_WEIGHTS.map((weight) => <option key={weight} value={weight}>{weight}</option>)}
        </select>
      </label>
      <ToggleRow title="Italic" description="Slant the type for extra motion" enabled={source.italic} onChange={(italic) => updateText({ italic })} />

      <RangeControl
        label="Letter spacing"
        value={source.tracking}
        min={-4}
        max={20}
        step={0.25}
        display={`${source.tracking.toFixed(2)} px`}
        reset={0}
        onChange={(tracking) => updateText({ tracking })}
      />
      <RangeControl
        label="Line spacing"
        value={source.lineSpacing}
        min={0.8}
        max={1.8}
        step={0.05}
        display={`${source.lineSpacing.toFixed(2)}×`}
        reset={1.15}
        onChange={(lineSpacing) => updateText({ lineSpacing })}
      />
      <div className="sub-tabs" role="group" aria-label="Text alignment">
        {(["left", "center", "right"] as const).map((align) => (
          <button key={align} type="button" className={source.align === align ? "active" : ""} aria-pressed={source.align === align} onClick={() => updateText({ align })}>
            {align[0]?.toUpperCase()}{align.slice(1)}
          </button>
        ))}
      </div>

      <ToggleRow
        title="Text shader effect"
        description={mask.enabled && mask.source.kind === "text" ? "The shader and interactions are applied to this type" : "Use the text as the shader shape"}
        enabled={mask.enabled && mask.source.kind === "text"}
        onChange={(enabled) => onMask({ enabled, source })}
      />

      <ColorField label="Text background" value={mask.background} onChange={(background) => onMask({ background })} />
      <p className="field-help">Your text is a live shader mask. Use Field, Color, Stack, Edge, Fill, Motion, Surface, Effects, and Touch to build the look. Text masks and shader interactions are embedded in website code exports.</p>
    </>
  );
}
