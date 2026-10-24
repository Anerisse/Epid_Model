// ============================================================
// components/fit-chart.tsx — общий график параметризации:
// кривая модели по подобранным параметрам + точки наблюдений.
// Данные с сервера (POST /api/fit).
// ============================================================
import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FitPoint } from "../lib/api";
import { useTheme } from "../lib/theme";

interface FitChartProps {
  time: number[];
  model: number[];
  points: FitPoint[];
}

function formatAxisValue(v: number): string {
  if (v >= 10_000) return `${Math.round(v / 1000)} тыс.`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)} тыс.`;
  return String(Math.round(v));
}

export function FitChart({ time, model, points }: FitChartProps) {
  // Склейка кривой модели в строки для recharts (скартер — отдельным data)
  const rows = useMemo(() => {
    const stride = Math.max(1, Math.ceil(time.length / 400));
    const out: { t: number; I: number }[] = [];
    for (let i = 0; i < time.length; i += stride) {
      out.push({ t: Math.round(time[i] * 100) / 100, I: Math.round(model[i] * 100) / 100 });
    }
    return out;
  }, [time, model]);

  // Цвета осей, сетки и подсказки — под текущую тему
  const { theme } = useTheme();
  const palette =
    theme === "light"
      ? { grid: "#e2e8f0", axis: "#64748b", tipBg: "#ffffff", tipBorder: "#cbd5e1" }
      : { grid: "#1e293b", axis: "#64748b", tipBg: "#0f172a", tipBorder: "#334155" };

  return (
    <div className="h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            stroke={palette.axis}
            fontSize={11}
            tickLine={false}
            label={{ value: "дни", position: "insideBottomRight", offset: -2, fill: palette.axis, fontSize: 11 }}
          />
          <YAxis
            stroke={palette.axis}
            fontSize={11}
            width={62}
            tickFormatter={formatAxisValue}
            tickLine={false}
            label={{ value: "инфицированные", angle: -90, position: "insideLeft", offset: 20, fill: palette.axis, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: palette.tipBg,
              border: `1px solid ${palette.tipBorder}`,
              borderRadius: 10,
              fontSize: 12,
            }}
            labelFormatter={(v) => `t = ${v} дн.`}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: palette.axis }} />
          <Line type="monotone" dataKey="I" name="Модель" stroke="#f43f5e" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Scatter data={points} dataKey="value" name="Наблюдения" fill="#fbbf24" shape="circle" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}