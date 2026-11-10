import { defaultKnobs } from "./generators";
import { DEFAULT_MASK, DEFAULT_PROJECT, normalizeProject } from "./project";
import { newBaseLayer, newLayer } from "./stack";
import { DEFAULT_TOUCH } from "./touch";
import type {
  BlendMode,
  GeneratorId,
  LayerKind,
  ShaderLayer,
  ShaderMask,
  ShaderPreset,
  ShaderProject,
  TouchSettings,
} from "./types";

export type StackLayer = Partial<ShaderLayer> & { kind: LayerKind };

export type PresetExtra = Partial<Omit<ShaderProject, "generator" | "knobs" | "palette" | "accent" | "name" | "layers" | "mask" | "touch">> & {
  /** shorthand for one generator layer on top of the stack */
  overlay?: { enabled?: boolean; generator?: GeneratorId; blend?: BlendMode; opacity?: number };
  /** extra layers above the main field, top layer first */
  layers?: StackLayer[];
  mask?: Partial<ShaderMask>;
  touch?: Partial<TouchSettings>;
};

export function mk(
  name: string,
  tag: string,
  generator: GeneratorId,
  knobs: number[],
  palette: string[],
  accent: string,
  extra: PresetExtra = {},
): ShaderPreset {
  const { overlay, layers, mask, touch, ...rest } = extra;
  const stack: ShaderLayer[] = [];
  if (overlay?.enabled) {
    const g = overlay.generator ?? "stars";
    stack.push(newLayer("field", {
      name: "Overlay",
      generator: g,
      knobs: defaultKnobs(g),
      blend: overlay.blend ?? "Add",
      opacity: overlay.opacity ?? 0.7,
      ownColors: false,
    }));
  }
  for (const layer of layers ?? []) stack.push(newLayer(layer.kind, layer));
  stack.push(newBaseLayer());

  const project = normalizeProject({
    ...DEFAULT_PROJECT,
    ...rest,
    name,
    generator,
    knobs,
    palette,
    palettePositions: undefined,
    accent,
    layers: stack,
    mask: { ...DEFAULT_MASK, ...mask },
    touch: { ...DEFAULT_TOUCH, ...touch },
  });
  return { name, tag, project };
}

/** Builds a preset that belongs to a named collection. */
export const inGroup = (group: string) =>
  (...args: Parameters<typeof mk>): ShaderPreset => ({ ...mk(...args), group });
