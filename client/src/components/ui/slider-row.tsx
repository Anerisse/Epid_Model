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
  hint?: string; // пользовательское название параметра (рус.)
  unit?: string; // единица измерения (1/день, чел. и т. п.)
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
  hint,
  unit,
  disabled,
}: SliderRowProps) {
  return (
    <div className={cn("space-y-1", disabled && "opacity-50")}>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="font-mono text-xs font-semibold"
          style={accent ? { color: accent } : undefined}
          title={hint ? `${label} — ${hint}` : label}
        >
          {label}
          {hint && (
            <span className="ml-1.5 font-sans text-[10px] font-normal text-slate-500">{hint}</span>
          )}
        </span>
        <span className="flex items-baseline gap-1 font-mono text-xs text-slate-300 tabular-nums">
          <span>{format ? format(value) : value}</span>
          {unit && <span className="text-[10px] text-slate-500">{unit}</span>}
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