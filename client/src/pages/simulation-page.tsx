// ============================================================
// pages/simulation-page.tsx — раздел «Симуляция».
// Ползунки параметров/начальных условий/горизонта → РК4 на сервере
// (POST /api/simulate, дебаунс 120 мс) → графики + блок
// «Качественный анализ» (R₀, порог, переболевшие, ручная формула).
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { api, type SimulateResponse } from "../lib/api";
import { useModel } from "../lib/model-context";
import { SimulationChart } from "../components/simulation-chart";
import { AnalysisPanel } from "../components/analysis-panel";
import { SliderRow } from "../components/ui/slider-row";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Separator } from "../components/ui/separator";

const DEFAULT_POPULATION = 10000;

// N/n — население: это не настраиваемый коэффициент, а сумма
// начальных значений всех компартментов.
function isPopulationParam(name: string): boolean {
  return name === "N" || name === "n";
}

// Начальное значение компартмента по умолчанию (S≈99%, I≈1%, остальные 0)
function defaultInitialValue(name: string, N: number): number {
  if (name === "S") return Math.round(0.99 * N);
  if (name === "I") return Math.round(0.01 * N);
  return 0;
}

// Формат значения ползунка: компактный, «как есть»
function fmt(v: number): string {
  return v >= 1000 ? `${Math.round(v).toLocaleString("ru-RU")}` : String(Number(v.toFixed(4)));
}

export function SimulationPage() {
  const { text, structure, presets, labels } = useModel();

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
    const N = presets["N"]?.value ?? presets["n"]?.value ?? DEFAULT_POPULATION;
    const pv: Record<string, number> = {};
    structure.parameters.forEach((p) => {
      // Население не хранится среди настраиваемых параметров — оно
      // пересчитывается из начальных условий ниже.
      if (isPopulationParam(p)) return;
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

  // Население N = сумма начальных значений всех компартментов.
  // Это согласуется со смыслом N в ОДУ (β·S·I/N): отдельного ползунка
  // для N нет, чтобы не получать «население», не равное сумме групп.
  const population = useMemo(
    () =>
      Math.round(
        Object.values(initial).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0),
      ),
    [initial],
  );

  // Запуск симуляции с дебаунсом при любом изменении управления
  useEffect(() => {
    if (!text.trim() || !structure || Object.keys(initial).length === 0) return;
    // N = 0 сделает правые части с делением на N неопределёнными
    if (population <= 0) {
      setResult(null);
      setError("Население N = 0: задайте хотя бы одну ненулевую группу.");
      setPending(false);
      return;
    }
    setPending(true);
    const timer = setTimeout(() => {
      // Население передаём в ОДУ как обычный параметр, но берём его
      // не из ползунка, а из суммы начальных условий.
      const params: Record<string, number> = { ...paramValues };
      structure.parameters.forEach((p) => {
        if (isPopulationParam(p)) params[p] = population;
      });
      api
        .simulate({ text, params, initial, horizon, manualFormula })
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
  }, [text, structure, paramValues, initial, population, horizon, manualFormula]);

  // Изменение настраиваемого параметра: N больше не масштабирует
  // начальные условия — население задаётся ими напрямую.
  const handleParamChange = (name: string, value: number) => {
    setParamValues((prev) => ({ ...prev, [name]: value }));
  };

  const canSimulate = Boolean(structure && presets);

  return (
    // Ниже xl блоки идут друг за другом (строки — по высоте контента),
    // выше — две колонки во всю высоту окна
    <div className="grid h-full min-h-0 auto-rows-min content-start grid-cols-1 gap-4 overflow-y-auto p-5 xl:auto-rows-auto xl:content-normal xl:grid-cols-[minmax(360px,430px)_1fr] xl:overflow-hidden">
      {/* Левая колонка: качественный анализ сверху, параметры ниже */}
      <div className="min-h-0 space-y-4 pr-1 xl:overflow-y-auto">
        {/* Качественный анализ — вверху, над параметрами */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle>Качественный анализ</CardTitle>
            <CardDescription>
              R₀ методом следующего поколения (NGM) или ручной формулой.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AnalysisPanel
              analysis={result?.analysis ?? null}
              manualFormula={manualFormula}
              onManualFormula={setManualFormula}
            />
          </CardContent>
        </Card>

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
                  if (!preset || isPopulationParam(p)) return null;
                  return (
                    <SliderRow
                      key={p}
                      label={p}
                      hint={labels[p]?.ru}
                      value={paramValues[p] ?? preset.value}
                      min={preset.min}
                      max={preset.max}
                      step={preset.step}
                      format={fmt}
                      unit={preset.unit}
                      onChange={(v) => handleParamChange(p, v)}
                    />
                  );
                })}

                {structure!.parameters.some(isPopulationParam) && (
                  <p className="text-[11px] leading-snug text-slate-500">
                    N — население: не настраивается ползунком, а складывается из начальных
                    значений групп (ниже).
                  </p>
                )}

                <Separator />

                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Начальные условия
                  </p>

                  {/* N — read-only: население всегда равно сумме групп */}
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="font-mono text-xs font-semibold text-slate-200"
                        title="Население — сумма начальных значений всех компартментов"
                      >
                        N
                      </span>
                      <span className="text-[10px] text-slate-500">сумма всех групп</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={fmt(population)}
                        aria-label="Население N — сумма начальных значений компартментов"
                        className="h-8 flex-1 bg-ink-800/60 font-mono text-xs text-slate-300"
                      />
                      <span className="shrink-0 text-[11px] text-slate-500">чел.</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {structure!.compartments.map((c) => (
                      <SliderRow
                        key={c.name}
                        label={`${c.name}(0)`}
                        hint={labels[c.name]?.ru}
                        value={initial[c.name] ?? 0}
                        min={0}
                        max={Math.max(100000, Math.ceil(population * 2))}
                        step={1}
                        format={fmt}
                        unit="чел."
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

      {/* Правая колонка — графики и анализ. График заполняет свободное
          место (flex-1), внизу статичная строка «Статистика + Анализ» */}
      <div className="flex min-h-0 flex-col gap-4 pr-1 xl:overflow-hidden">
        <Card className="flex min-h-[300px] flex-1 flex-col">
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2">
              Кривые эпидемии
              {pending && <Loader2 className="size-4 animate-spin text-emerald-300" />}
            </CardTitle>
            <CardDescription>
              {result ? `${result.stats.steps} шагов РК4` : "Симуляция ещё не выполнена."}
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
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
              <div className="grid h-full min-h-[260px] place-items-center rounded-lg border border-dashed border-slate-800 text-sm text-slate-500">
                Настройте параметры — здесь появится график
              </div>
            )}
          </CardContent>
        </Card>

        {result && (
          <Card className="shrink-0">
            {/* Статистика — плоская полоса: три показателя в ряд */}
            <CardContent className="flex items-stretch divide-x divide-slate-800 text-center">
              <div className="flex-1 px-2 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Пик I</p>
                <p className="font-mono text-sm text-slate-100">
                  {result.stats.peakValue !== null ? `${fmt(result.stats.peakValue)} чел.` : "—"}
                </p>
              </div>
              <div className="flex-1 px-2 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">День пика</p>
                <p className="font-mono text-sm text-slate-100">
                  {result.stats.peakDay !== null ? `${fmt(result.stats.peakDay)} дн.` : "—"}
                </p>
              </div>
              <div className="flex-1 px-2 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Выздоровели</p>
                <p className="font-mono text-sm text-slate-100">
                  {result.stats.recovered !== null ? `${fmt(result.stats.recovered)} чел.` : "—"}
                </p>
              </div>
            </CardContent>
          </Card>
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