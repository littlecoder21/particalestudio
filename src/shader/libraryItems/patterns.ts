import { familyMaker, type BlendMode, type Knob4, type LibraryItem } from "../libraryCore";
import type { PatternId } from "../types";

const make = familyMaker("Patterns", "pat");

/** Ten colourways: [background, ink]. Each pattern walks through them at a different offset so no two shelves look alike. */
const DUOS: Array<[string, string]> = [
  ["#0b0f1a", "#ffffff"], ["#111827", "#fbbf24"], ["#1e1b4b", "#a5b4fc"], ["#fdf2f8", "#be185d"], ["#03045e", "#90e0ef"],
  ["#14281d", "#95d5b2"], ["#2a0a0a", "#ff8a65"], ["#f1ebdd", "#2b2b3a"], ["#240046", "#ff9e00"], ["#0d1b2a", "#e0fbfc"],
];

interface Style {
  name: string;
  /** multiplies the pattern's natural scale */
  scale: number;
  thickness: number;
  softness: number;
  angle: number;
  /** a backdrop covers the frame with the pattern's own two colours; an overlay only draws the lines */
  overlay: null | { blend: BlendMode; opacity: number; ink: [string, string] };
}

const STYLES: Style[] = [
  { name: "Fine", scale: 2, thickness: 0.35, softness: 0.05, angle: 0, overlay: null },
  { name: "Bold", scale: 0.6, thickness: 0.5, softness: 0.04, angle: 0, overlay: null },
  { name: "Soft", scale: 1, thickness: 0.45, softness: 0.6, angle: 20, overlay: null },
  { name: "Tilted", scale: 1, thickness: 0.5, softness: 0.08, angle: 45, overlay: null },
  { name: "Dense", scale: 3, thickness: 0.4, softness: 0.1, angle: 0, overlay: null },
  { name: "Chunky", scale: 0.4, thickness: 0.6, softness: 0.15, angle: 30, overlay: null },
  { name: "Light Overlay", scale: 1.4, thickness: 0.25, softness: 0.05, angle: 0, overlay: { blend: "Screen", opacity: 0.7, ink: ["#000000", "#ffffff"] } },
  { name: "Shadow Overlay", scale: 1.4, thickness: 0.25, softness: 0.06, angle: 90, overlay: { blend: "Multiply", opacity: 0.6, ink: ["#ffffff", "#000000"] } },
  { name: "Tint Overlay", scale: 2, thickness: 0.3, softness: 0.08, angle: 60, overlay: { blend: "Overlay", opacity: 0.85, ink: ["#000000", "#9ab8ff"] } },
  { name: "Whisper", scale: 3, thickness: 0.2, softness: 0.1, angle: 15, overlay: { blend: "Soft Light", opacity: 0.6, ink: ["#000000", "#ffffff"] } },
];

/** Every pattern with a natural scale (how many repeats look right at "Fine"-ish density = 1×). */
const PATTERNS: Array<{ id: PatternId; label: string; scale: number; tags: string }> = [
  { id: "stripes", label: "Stripes", scale: 4, tags: "stripes lines bands" },
  { id: "checker", label: "Checker", scale: 2, tags: "checker checkerboard squares" },
  { id: "dots", label: "Dots", scale: 3, tags: "dots polka halftone circles" },
  { id: "grid", label: "Grid", scale: 3, tags: "grid graph lines mesh" },
  { id: "zigzag", label: "Zigzag", scale: 3, tags: "zigzag chevron" },
  { id: "rings", label: "Rings", scale: 2, tags: "rings circles concentric" },
  { id: "waves", label: "Waves", scale: 3, tags: "waves ripples sine" },
  { id: "hatch", label: "Hatch", scale: 4, tags: "hatch crosshatch weave" },
  { id: "triangles", label: "Triangles", scale: 3, tags: "triangles geometric" },
  { id: "plus", label: "Plus", scale: 4, tags: "plus crosses signs" },
];

const round = (n: number): number => Math.round(n * 100) / 100;

export const PATTERN_ITEMS: LibraryItem[] = PATTERNS.flatMap((p, pi) => {
  const group = make(p.label);
  return STYLES.map((style, si) => {
    const label = `${style.name} ${p.label}`;
    const duo = DUOS[(si + pi) % DUOS.length] as [string, string];
    const knobs: Knob4 = [round(p.scale * style.scale), style.thickness, style.softness, style.angle];
    return group(label, `pattern ${p.tags} ${style.overlay ? "overlay texture" : "backdrop"}`, {
      kind: "pattern",
      name: label,
      pattern: p.id,
      knobs,
      colors: style.overlay ? [...style.overlay.ink] : [...duo],
      fill: !style.overlay,
      ...(style.overlay ? { blend: style.overlay.blend, opacity: style.overlay.opacity } : {}),
    });
  });
});
