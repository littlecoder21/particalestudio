export type StudioMode = "particles" | "shaders";

interface ModeSwitchProps {
  mode: StudioMode;
  onChange: (mode: StudioMode) => void;
}

/** Segmented control that flips between the Particle studio and the Shader studio. */
export default function ModeSwitch({ mode, onChange }: ModeSwitchProps) {
  return (
    <div className="mode-switch" role="tablist" aria-label="Studio mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "particles"}
        className={mode === "particles" ? "active" : ""}
        onClick={() => onChange("particles")}
      >
        <span aria-hidden="true">✦</span>
        <b>Particles</b>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "shaders"}
        className={mode === "shaders" ? "active" : ""}
        onClick={() => onChange("shaders")}
      >
        <span aria-hidden="true">◐</span>
        <b>Shaders</b>
      </button>
    </div>
  );
}
