import { svgDetailOptions, type SvgQuality, type SvgSampleStats, type SvgSource } from "../svgSource";

export type SvgDetailPatch = Partial<Pick<SvgSource, "quality" | "borderDetail" | "edgeDetail" | "cornerSharpness">>;

/** Artworks already checked for "too dark for the canvas" (so the palette switch happens once). */
export const darkNoticeSeen = new Set<string>();

/** True for colours that would be hard to see on a dark canvas (hex like "#090b12"). */
export function isDarkHex(hex: string): boolean {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(value)) return false;
  const r = (value >> 16) & 255, g = (value >> 8) & 255, b = value & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 90;
}

const QUALITIES: readonly SvgQuality[] = ["Fast", "High", "Ultra"];
const QUALITY_HELP: Record<SvgQuality, string> = {
  Fast: "1024 px trace: instant, good for simple shapes.",
  High: "2048 px trace: sub-pixel accurate borders for most artwork.",
  Ultra: "3072 px trace: for very fine line work (a little slower to prepare).",
};

function Slider({ label, value, suffix, onChange }: {
  label: string;
  value: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-control">
      <span className="range-title"><span>{label}</span><span className="range-value">{value}{suffix}</span></span>
      <input aria-label={label} type="range" min={0} max={100} step={1} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

/**
 * Controls for the SVG-to-particles generator: trace quality, how many particles hug the outer
 * border / inner edges, and corner sharpness. Shows what the last sampling produced.
 */
export function SvgDetailControls({ source, stats, onChange }: {
  source: SvgSource;
  stats: SvgSampleStats | null;
  onChange: (patch: SvgDetailPatch) => void;
}) {
  const detail = svgDetailOptions(source);
  const usesContours = source.mode !== "Fill";
  const fillShare = Math.max(0, 100 - detail.borderDetail - detail.edgeDetail);
  return (
    <>
      <div className="choice-control">
        <span className="control-label">Trace quality</span>
        <div className="choice-grid" role="group" aria-label="Trace quality">
          {QUALITIES.map((quality) => (
            <button
              type="button"
              key={quality}
              className={`choice-button ${detail.quality === quality ? "selected" : ""}`}
              aria-pressed={detail.quality === quality}
              onClick={() => onChange({ quality })}
            >
              {quality}
            </button>
          ))}
        </div>
      </div>
      <p className="field-help">{QUALITY_HELP[detail.quality]}</p>
      {usesContours && (
        <>
          <Slider label="Outer border detail" value={detail.borderDetail} suffix="%" onChange={(borderDetail) => onChange({ borderDetail })} />
          <Slider label="Inner edge detail" value={detail.edgeDetail} suffix="%" onChange={(edgeDetail) => onChange({ edgeDetail })} />
          <Slider label="Corner sharpness" value={detail.cornerSharpness} suffix="%" onChange={(cornerSharpness) => onChange({ cornerSharpness })} />
          <p className="field-help">
            {source.mode === "Combined"
              ? `${detail.borderDetail}% of the particles trace the outer border, ${detail.edgeDetail}% the inner edges and ${fillShare}% fill the inside.`
              : "Particles are split between the outer border and the inner edges."}
            {" "}Corner sharpness adds extra particles where the outline turns sharply.
          </p>
        </>
      )}
      {stats && (
        <p className="svg-source-status success" role="status">
          {stats.total} particles{usesContours ? ` · border ${stats.border} · edges ${stats.edges}` : ""}{source.mode !== "Outline" ? ` · fill ${stats.fill}` : ""}
          {" "}· {stats.resolution} · {stats.ms} ms{stats.cached ? " (cached trace)" : ""}
        </p>
      )}
    </>
  );
}
