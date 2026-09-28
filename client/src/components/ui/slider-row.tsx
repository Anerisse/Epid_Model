// component/ui/slider-row.tsx — строковый ползунок параметра:
// подпись + значение + <input type="range"> (стиль .sim-range).
import { cn } from "../../lib/utils";

export interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  accent?: string; // цвет текста подписи (для компартментов — цвет блока)
  disabled?: boolean;
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  accent,
  disabled,
}: SliderRowProps) {
  return (
    <div className={cn("space-y-1", disabled && "opacity-50")}>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="font-mono text-xs font-semibold"
          style={accent ? { color: accent } : undefined}
          title={label}
        >
          {label}
        </span>
        <span className="font-mono text-xs text-slate-300 tabular-nums">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        className="sim-range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}