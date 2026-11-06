import { RangeControl } from "./controls";
import { GENERATOR_MAP } from "./generators";
import type { GeneratorId, Knobs } from "./types";

const SHAPE_OPTIONS = [
  "Circle",
  "Rounded box",
  "Polygon",
  "Star",
  "Ring",
  "Capsule",
] as const;

interface GeneratorKnobsProps {
  id: GeneratorId;
  knobs: Knobs;
  onChange: (index: 0 | 1 | 2 | 3, value: number) => void;
}

export default function GeneratorKnobs({ id, knobs, onChange }: GeneratorKnobsProps) {
  const defs = GENERATOR_MAP[id].knobs;

  return (
    <>
      {id === "sdfShapes" && (
        <label className="svg-select-control">
          Primitive
          <select
            value={Math.round(knobs[0])}
            onChange={(event) => onChange(0, Number(event.target.value))}
          >
            {SHAPE_OPTIONS.map((shape, index) => (
              <option key={shape} value={index}>{shape}</option>
            ))}
          </select>
        </label>
      )}
      {defs.map((def, index) => {
        if (id === "sdfShapes" && index === 0) return null;
        const knobIndex = index as 0 | 1 | 2 | 3;
        return (
          <RangeControl
            key={def.label}
            label={def.label}
            min={def.min}
            max={def.max}
            step={def.step}
            value={knobs[index] ?? def.value}
            reset={def.value}
            onChange={(value) => onChange(knobIndex, value)}
          />
        );
      })}
    </>
  );
}
