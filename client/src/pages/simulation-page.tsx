// ============================================================
// pages/simulation-page.tsx — раздел «Симуляция».
// Ползунки параметров/начальных условий/горизонта → РК4 на сервере
// (POST /api/simulate, дебаунс 120 мс) → графики + блок
// «Качественный анализ» (R₀, порог, переболевшие, ручная формула).
// ============================================================
import { useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { api, type SimulateResponse } from "../lib/api";
import { useModel } from "../lib/model-context";
import { SimulationChart } from "../components/simulation-chart";
import { AnalysisPanel } from "../components/analysis-panel";
import { SliderRow } from "../components/ui/slider-row";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Separator } from "../components/ui/separator";

const DEFAULT_POPULATION = 10000;

// Начальное значение компартмента по умолчанию (S≈99%, I≈1%, остальные 0)
function defaultInitialValue(name: string, N: number): number {
  if (name === "S") return Math.round(0.99 * N);
  if (name === "I") return Math.round(0.01 * N);
  return 0;
}

// Масштабирует начальные условия пропорционально при изменении N:
// сумма компартментов снова ≈ N (как в legacy-интерфейсе)
function rescaleInitials(
  initial: Record<string, number>,
  oldN: number,
  newN: number,
): Record<string, number> {
  const factor = oldN > 0 ? newN / oldN : 1;
  const scaled: Record<string, number> = {};
  for (const key of Object.keys(initial)) {
    scaled[key] = initial[key] * factor;
  }
  const largest = Object.keys(scaled).sort((a, b) => scaled[b] - scaled[a])[0];
  if (largest) {
    const sumOthers = Object.keys(scaled)
      .filter((k) => k !== largest)
      .reduce((s, k) => s + scaled[k], 0);
    scaled[largest] = Math.max(0, newN - sumOthers);
  }
  return scaled;
}

// Формат значения ползунка: компактный, «как есть»
function fmt(v: number): string {
  return v >= 1000 ? `${Math.round(v).toLocaleString("ru-RU")}` : String(Number(v.toFixed(4)));
}

export function SimulationPage() {
  const { text, structure, presets } = useModel();

  const [paramValues, setParamValues] = useState<Record<string, number>>({});
  const [initial, setInitial] = useState<Record<string, number>>({});
  const [horizon, setHorizon] = useState(100);
  const [manualFormula, setManualFormula] = useState("");
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Инициализация ползунков при смене текста/структуры модели
  useEffect(() => {
    if (!structure || !presets) {
      setResult(null);
      setError(null);
      setParamValues({});
      setInitial({});
      return;
    }
    const N = presets["N"]?.value ?? DEFAULT_POPULATION;
    const pv: Record<string, number> = {};
    structure.parameters.forEach((p) => {
      pv[p] = presets[p]?.value ?? 1;
    });
    setParamValues(pv);
    const iv: Record<string, number> = {};
    structure.compartments.forEach((c) => {
      iv[c.name] = defaultInitialValue(c.name, N);
    });
    setInitial(iv);
    setHorizon(100);
  }, [text, structure, presets]);

  // Запуск симуляции с дебаунсом при любом изменении управления
  useEffect(() => {
    if (!text.trim() || !structure || Object.keys(paramValues).length === 0) return;
    setPending(true);
    const timer = setTimeout(() => {
      api
        .simulate({ text, params: paramValues, initial, horizon, manualFormula })
        .then((res) => {
          setResult(res.ok ? res : null);
          setError(res.ok ? null : res.error ?? "Симуляция не выполнена");
        })
        .catch((err) => {
          setResult(null);
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setPending(false));
    }, 120);
    return () => clearTimeout(timer);
  }, [text, structure, paramValues, initial, horizon, manualFormula]);

  const N = paramValues["N"] ?? paramValues["n"] ?? DEFAULT_POPULATION;

  // Изменение параметра: N масштабирует начальные условия
  const handleParamChange = (name: string, value: number) => {
    setParamValues((prev) => {
      const next = { ...prev, [name]: value };
      if ((name === "N" || name === "n") && prev[name] > 0) {
        setInitial((iv) => rescaleInitials(iv, prev[name], value));
      }
      return next;
    });
  };

  const canSimulate = Boolean(structure) && Object.keys(paramValues).length > 0;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(320px,400px)_1fr] xl:overflow-hidden">
      {/* Левая колонка — управление */}
      <div className="min-h-0 space-y-4 pr-1 xl:overflow-y-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4 text-emerald-300" /> Параметры
            </CardTitle>
            <CardDescription>
              Численное интегрирование РК4 (шаг 0.05 дн). Любое движение ползунка мгновенно
              пересчитывает графики на сервере.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canSimulate ? (
              <>
                {structure!.parameters.map((p) => {
                  const preset = presets![p];
                  if (!preset) return null;
                  const accent = p === "N" || p === "n" ? "#e2e8f0" : undefined;
                  return (
                    <SliderRow
                      key={p}
                      label={p}
                      value={paramValues[p] ?? preset.value}
                      min={preset.min}
                      max={preset.max}
                      step={preset.step}
                      format={fmt}
                      accent={accent}
                      onChange={(v) => handleParamChange(p, v)}
                    />
                  );
                })}

                <Separator />

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Начальные условия (сумма ≈ {fmt(N)})
                  </p>
                  <div className="space-y-4">
                    {structure!.compartments.map((c) => (
                      <SliderRow
                        key={c.name}
                        label={`${c.name}₀`}
                        value={initial[c.name] ?? 0}
                        min={0}
                        max={Math.round(N)}
                        step={1}
                        format={fmt}
                        onChange={(v) =>
                          setInitial((prev) => ({ ...prev, [c.name]: Math.max(0, v) }))
                        }
                      />
                    ))}
                  </div>
                </div>

                <Separator />

                <SliderRow
                  label="Горизонт, дней"
                  value={horizon}
                  min={1}
                  max={300}
                  step={1}
                  format={(v) => `${v} дн.`}
                  onChange={setHorizon}
                />
              </>
            ) : (
              <p className="text-xs text-slate-500">
                Разберите модель на вкладке «Модель» — здесь появятся ползунки.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Правая колонка — графики и анализ */}
      <div className="min-h-0 space-y-4 pr-1 xl:overflow-y-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Кривые эпидемии
              {pending && <Loader2 className="size-4 animate-spin text-emerald-300" />}
            </CardTitle>
            <CardDescription>
              {result ? `${result.stats.steps} шагов РК4` : "Симуляция ещё не выполнена."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {error}
              </p>
            ) : result ? (
              <SimulationChart
                time={result.time}
                series={result.series}
                names={result.names}
                colors={result.colors}
              />
            ) : (
              <div className="grid h-[360px] place-items-center rounded-lg border border-dashed border-slate-800 text-sm text-slate-500">
                Настройте параметры — здесь появится график
              </div>
            )}
          </CardContent>
        </Card>

        {result && (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Статистика: пик и выздоровевшие */}
            <Card>
              <CardHeader>
                <CardTitle>Статистика</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-slate-800 bg-ink-800/40 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Пик I</p>
                  <p className="font-mono text-sm text-slate-100">
                    {result.stats.peakValue !== null ? fmt(result.stats.peakValue) : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-ink-800/40 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">День пика</p>
                  <p className="font-mono text-sm text-slate-100">
                    {result.stats.peakDay !== null ? `${fmt(result.stats.peakDay)} дн.` : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-ink-800/40 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Выздоровели</p>
                  <p className="font-mono text-sm text-slate-100">
                    {result.stats.recovered !== null ? fmt(result.stats.recovered) : "—"}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Качественный анализ */}
            <Card>
              <CardHeader>
                <CardTitle>Качественный анализ</CardTitle>
                <CardDescription>
                  R₀ методом следующего поколения (NGM) или ручной формулой.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AnalysisPanel
                  analysis={result.analysis}
                  manualFormula={manualFormula}
                  onManualFormula={setManualFormula}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {!structure && (
          <div className="grid h-56 place-items-center rounded-xl border border-dashed border-slate-800 griddots">
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-400">Раздел «Симуляция»</p>
              <p className="mt-1 text-xs text-slate-500">
                Сначала задайте модель (вкладка «Модель») — здесь будут графики S/I/R и R₀.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}