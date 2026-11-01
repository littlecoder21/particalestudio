import type { ReactNode } from "react";

export function formatValue(value: number, step: number): string {
  if (step >= 1) return String(Math.round(value));
  const decimals = Math.min(3, Math.max(1, Math.ceil(-Math.log10(step) - 1e-9)));
  return value.toFixed(decimals);
}

interface RangeControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Optional custom read-out (for example "Off" at zero). */
  display?: string;
}

export function RangeControl({ label, value, min, max, step, onChange, display }: RangeControlProps) {
  return (
    <label className="range-control">
      <span className="range-title">
        <span>{label}</span>
        <span className="range-value">{display ?? formatValue(value, step)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

interface ChoiceGroupProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}

export function ChoiceGroup<T extends string>({ label, value, options, onChange }: ChoiceGroupProps<T>) {
  return (
    <div className="choice-control">
      <span className="control-label">{label}</span>
      <div className="choice-grid">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`choice-button ${option === value ? "selected" : ""}`}
            aria-pressed={option === value}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ToggleRowProps {
  title: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function ToggleRow({ title, description, enabled, onChange }: ToggleRowProps) {
  return (
    <button
      type="button"
      className={`toggle-row ${enabled ? "enabled" : ""}`}
      aria-pressed={enabled}
      onClick={() => onChange(!enabled)}
    >
      <span>
        <b>{title}</b>
        <small>{description}</small>
      </span>
      <span className="toggle-switch" />
    </button>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <label className="color-control">
      {label}
      <span className="color-input-wrap">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  );
}

interface SectionHeadingProps {
  number: string;
  title: string;
  description: string;
}

export function SectionHeading({ number, title, description }: SectionHeadingProps) {
  return (
    <div className="control-heading">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <span className="section-number">{number}</span>
    </div>
  );
}

export function SoftTip({ children }: { children: ReactNode }) {
  return (
    <div className="soft-tip">
      <span>✦</span>
      <p>{children}</p>
    </div>
  );
}
