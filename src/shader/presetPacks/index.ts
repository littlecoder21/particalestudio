import type { ShaderPreset } from "../types";
import { COSMIC_PRESETS } from "./cosmic";
import { FLOW_PRESETS } from "./flow";
import { FLUID_PRESETS } from "./fluid";
import { GRADIENT_PRESETS } from "./gradients";
import { LAYERED_PRESETS } from "./layered";
import { LIGHT_PRESETS } from "./light";
import { MATH_PRESETS } from "./math";
import { NATURE_PRESETS } from "./nature";
import { PATTERN_PRESETS } from "./pattern";
import { SHAPE_PRESETS } from "./shapes";

/** All collection packs, one file per collection. Add a new pack here. */
export const PACK_PRESETS: ShaderPreset[] = [
  ...FLUID_PRESETS,
  ...COSMIC_PRESETS,
  ...LIGHT_PRESETS,
  ...PATTERN_PRESETS,
  ...NATURE_PRESETS,
  ...FLOW_PRESETS,
  ...MATH_PRESETS,
  ...GRADIENT_PRESETS,
  ...SHAPE_PRESETS,
  ...LAYERED_PRESETS,
];
