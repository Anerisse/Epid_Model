// ============================================================
// components/analysis-panel.tsx — блок «Качественный анализ».
// Рисует отчёт сервера (R₀ в составе ответа /api/simulate):
// число R₀ с цветным вердиктом, символьное «уравнение R₀»,
// порог 1/R₀, итог переболевших, проверку сохранения популяции
// и раскрывающиеся матрицы F/V (NGM).
// ============================================================
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AnalysisReport } from "../lib/api";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";

interface AnalysisPanelProps {
  analysis: AnalysisReport | null;
  manualFormula: string;
  onManualFormula: (formula: string) => void;
}

// Число R₀ красиво: до двух знаков, запятая как разделитель
function formatR0(value: number | null): string {
  if (value === null || !isFinite(value)) return "—";
  if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
  return value.toFixed(2).replace(".", ",");
}

export function AnalysisPanel({ analysis, manualFormula, onManualFormula }: AnalysisPanelProps) {
  const [openDetails, setOpenDetails] = useState(false);
  const [showManual, setShowManual] = useState(false);

  if (!analysis) {
    return (
      <p className="text-xs text-slate-500">
        Качественный анализ появится после запуска симуляции.
      </p>
    );
  }

  const toneVariant = analysis.tone === "emerald" || analysis.tone === "amber" ? analysis.tone : "default";

  return (
    <div className="space-y-3 text-sm">
      {/* Строка R₀: число, вердикт, источник (авто/вручную) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[92px]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">R₀</p>
          <p
            className={`font-display text-3xl font-bold leading-none ${
              analysis.tone === "emerald"
                ? "text-emerald-300"
                : analysis.tone === "amber"
                  ? "text-amber-300"
                  : "text-slate-300"
            }`}
          >
            {formatR0(analysis.r0)}
          </p>
        </div>
        <div className="space-y-1">
          <Badge variant={toneVariant as "default" | "emerald" | "amber"}>{analysis.verdict}</Badge>
          <p className="text-[11px] text-slate-500">источник: {analysis.head}</p>
        </div>
      </div>

      {/* Символьное уравнение R₀ */}
      {analysis.formula && (
        <div className="rounded-lg border border-slate-800 bg-ink-800/60 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Уравнение R₀
          </p>
          <p className="font-serif text-lg text-slate-100">
            R₀&nbsp;=&nbsp;<span className="font-mono">{analysis.formula}</span>
          </p>
        </div>
      )}

      {/* Порог и итог переболевших */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-slate-800 bg-ink-800/40 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Порог</p>
          <p className="font-mono text-base text-slate-200">
            {analysis.threshold !== null ? `1/R₀ = ${formatR0(analysis.threshold)}` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-ink-800/40 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Итог переболевших
          </p>
          <p className="font-mono text-base text-slate-200">
            {analysis.finalSize !== null ? `${analysis.finalSize} чел.` : "—"}
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-500">{analysis.conservation}</p>

      {/* Заражённые компартменты (для отчёта NGM) */}
      {analysis.infected.length > 0 && (
        <p className="text-xs text-slate-400">
          Заражённые: <span className="font-mono text-slate-200">{analysis.infected.join(", ")}</span>
        </p>
      )}

      {/* Матрицы F/V (NGM) */}
      {analysis.details && (
        <div className="rounded-lg border border-slate-800 bg-ink-800/40">
          <button
            type="button"
            onClick={() => setOpenDetails((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-300 hover:text-slate-100"
          >
            <span>Вывод R₀: матрицы F (новые заражения) и V (переходы)</span>
            <ChevronDown className={`size-4 transition-transform ${openDetails ? "rotate-180" : ""}`} />
          </button>
          {openDetails && (
            <div className="border-t border-slate-800 px-3 py-2">
              {analysis.details.kind === "terms" ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="pb-1 pr-2 font-semibold">Компартмент</th>
                      <th className="pb-1 pr-2 font-semibold">F (заражение)</th>
                      <th className="pb-1 font-semibold">V (переходы)</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-slate-300">
                    {analysis.details.rows.map((row) => (
                      <tr key={row.name} className="align-top">
                        <td className="py-0.5 pr-2 text-slate-200">{row.name}</td>
                        <td className="py-0.5 pr-2">{row.F}</td>
                        <td className="py-0.5">{row.V}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="grid grid-cols-2 gap-2 font-mono text-xs text-slate-300">
                  <div>
                    <p className="mb-1 text-slate-500">F</p>
                    <pre className="whitespace-pre-wrap rounded bg-ink-900 p-2">{analysis.details.F}</pre>
                  </div>
                  <div>
                    <p className="mb-1 text-slate-500">V</p>
                    <pre className="whitespace-pre-wrap rounded bg-ink-900 p-2">{analysis.details.V}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ручная формула R₀ (fallback) */}
      <div className="space-y-1.5">
        {showManual ? (
          <>
            <Label htmlFor="manual-r0">Ручная формула R₀ (через параметры, напр. β/γ)</Label>
            <div className="flex gap-2">
              <Input
                id="manual-r0"
                className="font-mono"
                value={manualFormula}
                placeholder="β/γ"
                onChange={(e) => onManualFormula(e.target.value)}
              />
              <Button variant="secondary" size="sm" onClick={() => setShowManual(false)}>
                Готово
              </Button>
            </div>
          </>
        ) : (
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowManual(true)}>
            Задать формулу R₀ вручную
          </Button>
        )}
      </div>
    </div>
  );
}