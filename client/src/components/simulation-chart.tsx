// ============================================================
// components/simulation-chart.tsx — график эпидемических кривых.
// Данные приходят с сервера (POST /api/simulate): время + ряды
// по компартментам + цвета. recharts с прореживанием до ~900
// точек на ряд (симуляция РК4 даёт до 6000 шагов).
// ============================================================
import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface SimulationChartProps {
  time: number[];
  series: number[][];
  names: string[];
  colors: string[];
}

// Компактный формат чисел на оси Y (12000 → «12 тыс.»)
function formatAxisValue(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} млн`;
  if (v >= 10_000) return `${Math.round(v / 1000)} тыс.`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)} тыс.`;
  return String(Math.round(v));
}

// Прореживание и склейка рядов в строки для recharts
function buildRows(
  time: number[],
  series: number[][],
  names: string[],
): Record<string, number>[] {
  const maxPoints = 900;
  const stride = Math.max(1, Math.ceil(time.length / maxPoints));
  const rows: Record<string, number>[] = [];
  for (let i = 0; i < time.length; i += stride) {
    const row: Record<string, number> = { t: Math.round(time[i] * 100) / 100 };
    names.forEach((name, c) => {
      row[name] = Math.round(series[c][i] * 100) / 100;
    });
    rows.push(row);
  }
  return rows;
}

export function SimulationChart({ time, series, names, colors }: SimulationChartProps) {
  const data = useMemo(
    () => buildRows(time, series, names),
    [time, series, names],
  );

  return (
    <div className="h-full min-h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            stroke="#64748b"
            fontSize={11}
            tickLine={false}
            label={{ value: "дни", position: "insideBottomRight", offset: -2, fill: "#64748b", fontSize: 11 }}
          />
          <YAxis
            stroke="#64748b"
            fontSize={11}
            width={62}
            tickFormatter={formatAxisValue}
            tickLine={false}
            label={{ value: "людей", angle: -90, position: "insideLeft", offset: 18, fill: "#64748b", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 10,
              fontSize: 12,
            }}
            labelFormatter={(v) => `t = ${v} дн.`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {names.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={colors[i]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}