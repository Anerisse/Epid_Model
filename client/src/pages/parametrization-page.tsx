// ============================================================
// pages/parametrization-page.tsx — раздел «Параметризация».
// Ввод наблюдений I(t), выбор оцениваемых параметров (МНК,
// Нелдер–Мид на сервере), кнопка «Пример» — синтетические данные
// встроенного симулятора. Кривая модели и точки — на общем графике.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Loader2, SlidersHorizontal } from "lucide-react";
import { api, type FitResponse } from "../lib/api";
import { useModel } from "../lib/model-context";
import { FitChart } from "../components/fit-chart";
import { SliderRow } from "../components/ui/slider-row";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";

const DEFAULT_POPULATION = 10000;
const FREE_DEFAULT = ["β", "γ"];

// Доступные методы оценки параметров. Базовый — МНК (Нелдер–Мид):
// он реализован на сервере. Остальные — план развития раздела,
// меню показывает расширяемость (по одному алгоритму на этап -> больше).
interface FitMethod {
  id: string;
  name: string;
  desc: string;
  base: boolean;
}
const FIT_METHODS: FitMethod[] = [
  {
    id: "least-squares",
    name: "МНК · Нелдер–Мид",
    desc: "Базовый: минимум суммы квадратов отклонений модели от данных.",
    base: true,
  },
  {
    id: "lbfgs",
    name: "Градиентный спуск (L-BFGS)",
    desc: "Та же функция потерь, оптимизация через градиент.",
    base: false,
  },
  {
    id: "mcmc",
    name: "Байесовская оценка (MCMC)",
    desc: "Апостериорное распределение параметров и доверительные интервалы.",
    base: false,
  },
  {
    id: "neural",
    name: "Нейросеть · инверсное моделирование",
    desc: "TensorFlow.js в браузере: обучается на синтетике симулятора.",
    base: false,
  },
];

function fmt(v: number | undefined | null): string {
  if (v === undefined || v === null || !isFinite(v)) return "—";
  return String(Number(v.toFixed(4)));
}

export function ParametrizationPage() {
  const { text, structure, presets } = useModel();

  // Параметры модели без популяции — кандидаты на оценку
  const evaluable = useMemo(() => {
    if (!structure) return [];
    return structure.parameters.filter((p) => p !== "N" && p !== "n");
  }, [structure]);

  const [dataText, setDataText] = useState("");
  const [method, setMethod] = useState<string>(FIT_METHODS[0].id);
  const [free, setFree] = useState<string[]>(FREE_DEFAULT);
  const [fixed, setFixed] = useState<Record<string, number>>({});
  const [N, setN] = useState(DEFAULT_POPULATION);
  const [result, setResult] = useState<FitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trueParams, setTrueParams] = useState<Record<string, number> | null>(null);

  // Пересборка управлений при смене модели
  useEffect(() => {
    if (!structure || !presets) {
      setResult(null);
      return;
    }
    const pv: Record<string, number> = {};
    structure.parameters.forEach((p) => {
      if (p === "N" || p === "n") return;
      pv[p] = presets[p]?.value ?? 0.1;
    });
    setFixed(pv);
    setN(presets["N"]?.value ?? presets["n"]?.value ?? DEFAULT_POPULATION);
    setFree((prev) => prev.filter((p) => evaluable.includes(p)));
    if (evaluable.length > 0) setFree((prev) => (prev.length ? prev : [evaluable[0]]));
  }, [text, structure, presets, evaluable]);

  const toggleFree = (name: string) => {
    setFree((prev) => (prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]));
  };

  // Главный запуск МНК на сервере
  const runFit = async () => {
    if (!text.trim() || !structure) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.fit({ text, dataText, free, fixed, N });
      setResult(res.ok ? res : null);
      if (!res.ok) setError(res.error ?? "Оценка не выполнена");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  // Синтетические данные: симулятор сервера со «случайными» наблюдениями
  const handleExample = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.synthetic(text);
      if (res.ok) {
        setDataText(res.text);
        setTrueParams(res.params ?? null);
        // после генерации сразу считаем подгонку
        const fit = await api.fit({
          text,
          dataText: res.text,
          free,
          fixed,
          N: res.params?.N ?? N,
        });
        setResult(fit.ok ? fit : null);
        if (!fit.ok) setError(fit.error ?? "Оценка не выполнена");
      } else {
        setError(res.error ?? "Синтетические данные не созданы");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canRun = Boolean(structure) && dataText.trim().length > 0;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(340px,420px)_1fr] xl:overflow-hidden">
      {/* Левая колонка — метод, данные, параметры */}
      <div className="min-h-0 space-y-4 pr-1 xl:overflow-y-auto">
        {/* Метод оценивания: базовый МНК + план других методов */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Метод оценивания</CardTitle>
            <CardDescription>
              База — МНК (Нелдер–Мид). Список показывает, какие методы планируется добавить в раздел.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="fit-method" className="shrink-0 text-xs font-semibold text-slate-300">
                Метод
              </Label>
              <Select
                id="fit-method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                aria-label="Метод оценки параметров"
              >
                {FIT_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.base ? "МНК · Нелдер–Мид (базовый)" : `${m.name} (план)`}
                  </option>
                ))}
              </Select>
            </div>
            <p className="text-[11px] leading-snug text-slate-500">
              {FIT_METHODS.find((m) => m.id === method)?.desc}
            </p>
            {method !== "least-squares" && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
                «{FIT_METHODS.find((m) => m.id === method)?.name ?? ""}» в плане разработки — оценка
                выполняется базовым методом МНК.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Наблюдения I(t)</CardTitle>
            <CardDescription>
              По строкам «день число» (первые наблюдения задают I₀). Пробел или запятая — разделители.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={10}
              placeholder={"0 100\n2 150\n4 260\n6 420\n8 610"}
              value={dataText}
              onChange={(e) => setDataText(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={runFit} disabled={!canRun || busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <SlidersHorizontal className="size-4" />}
                Оценить параметры
              </Button>
              <Button variant="amber" onClick={handleExample} disabled={!text.trim() || busy}>
                <FlaskConical className="size-4" /> Пример (синтетика)
              </Button>
            </div>
            {trueParams && (
              <p className="text-[11px] leading-relaxed text-slate-500">
                Истинные параметры примера: {Object.entries(trueParams).map(([k, v]) => `${k} = ${fmt(v)}`).join(" · ")}
              </p>
            )}
            {error && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {error}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Параметры</CardTitle>
            <CardDescription>
              Отметьте оцениваемые (МНК подберёт их по данным); фиксированные задаются
              ползунками. Население N — всегда фиксировано.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {structure && evaluable.length > 0 ? (
              <>
                <div className="space-y-2">
                  <Label>Оценивать</Label>
                  {evaluable.map((p) => (
                    <label
                      key={p}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800 bg-ink-800/40 px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={free.includes(p)}
                        onCheckedChange={() => toggleFree(p)}
                        aria-label={`Оценивать параметр ${p}`}
                      />
                      <span className="font-mono font-semibold text-slate-200">{p}</span>
                      <span className="ml-auto text-[11px] text-slate-500">
                        {free.includes(p) ? "подбирается" : "фиксирован"}
                      </span>
                    </label>
                  ))}
                </div>

                <div className="space-y-4">
                  <Label>Фиксированные значения</Label>
                  {evaluable
                    .filter((p) => !free.includes(p))
                    .map((p) => {
                      const preset = presets![p];
                      return (
                        <SliderRow
                          key={p}
                          label={p}
                          value={fixed[p] ?? preset.value}
                          min={preset.min}
                          max={preset.max}
                          step={preset.step}
                          format={fmt}
                          onChange={(v) => setFixed((prev) => ({ ...prev, [p]: v }))}
                        />
                      );
                    })}
                  <SliderRow
                    label="N (население)"
                    value={N}
                    min={1000}
                    max={100000}
                    step={500}
                    format={(v) => fmt(v)}
                    onChange={setN}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                Разберите модель на вкладке «Модель» — здесь появятся параметры.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Правая колонка — результат */}
      <div className="min-h-0 space-y-4 pr-1 xl:overflow-y-auto">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Результат подгонки</CardTitle>
            <CardDescription>
              Жёлтые точки — наблюдения, красная кривая — модель с подобранными параметрами.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {result ? (
              <>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-slate-800 bg-ink-800/40 p-2 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">RMSE</p>
                    <p className="font-mono text-sm text-slate-100">{fmt(result.rmse)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-ink-800/40 p-2 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">R²</p>
                    <p className="font-mono text-sm text-emerald-300">{fmt(result.r2)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-ink-800/40 p-2 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Итерации</p>
                    <p className="font-mono text-sm text-slate-100">{result.iterations}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-ink-800/40 p-2 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Подобрано</p>
                    <p className="font-mono text-sm text-slate-100">
                      {Object.entries(result.params)
                        .map(([k, v]) => `${k} = ${fmt(v)}`)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Метод оценивания:{" "}
                  {FIT_METHODS.find((m) => m.id === method)?.name ?? "МНК · Нелдер–Мид"}
                </p>
                <FitChart time={result.time} model={result.model} points={result.points} />
              </>
            ) : (
              <div className="grid h-[340px] place-items-center rounded-lg border border-dashed border-slate-800 text-sm text-slate-500">
                Введите наблюдения и нажмите «Оценить параметры»
              </div>
            )}
          </CardContent>
        </Card>

        {!structure && (
          <div className="grid h-56 place-items-center rounded-xl border border-dashed border-slate-800 griddots">
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-400">Раздел «Параметризация»</p>
              <p className="mt-1 text-xs text-slate-500">
                Сначала задайте модель — методом наименьших квадратов (Нелдер–Мид) восстановим β, γ по
                данным.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}