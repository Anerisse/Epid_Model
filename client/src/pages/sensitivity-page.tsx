// ============================================================
// pages/sensitivity-page.tsx — раздел «Анализ чувствительности».
//
// Эскиз интерфейса по требованиям из Docs/SA Scenario: настройка
// целевой переменной, диапазонов и распределений параметров, выбор
// метода (OAT / Моррис / Соболь) или «Авто», бюджет прогонов,
// прогресс и отмена, торнадо-диаграмма, таблица индексов, сравнение
// методов, проверка устойчивости, сохранение и передача результатов
// в сценарный анализ.
//
// Серверная часть появится позже (POST /api/sensitivity): клиент
// только настраивает прогон и показывает результат.
// ============================================================
import {
  Check,
  CirclePlay,
  FlaskConical,
  Gauge,
  GitCompareArrows,
  Radar,
  Save,
  SlidersHorizontal,
  Table2,
  Target,
  Tornado,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Hint } from "../components/ui/hint";
import { BlockStub, MockTable, PlanChip } from "../components/plan-ui";
import { useModel } from "../lib/model-context";

// Компактный формат границы диапазона
function fmt(v: number): string {
  return String(Number(v.toFixed(3)));
}

// Параметры для эскиза: реальные из текущей модели, иначе пример SIR
const FALLBACK_PARAMS = ["β", "σ", "γ", "μ"];

// Веса полос торнадо-диаграммы (эскиз, без численного расчёта)
const TORNADO_WEIGHTS = [92, 66, 42, 24];

export function SensitivityPage() {
  const { name, structure, presets, labels } = useModel();
  const modelParams = (structure?.parameters ?? []).filter((p) => p !== "N" && p !== "n");
  const params = (modelParams.length ? modelParams : FALLBACK_PARAMS).slice(0, 4);

  return (
    // Ниже xl блоки идут друг за другом, выше — две колонки во всю высоту окна
    <div className="grid h-full min-h-0 auto-rows-min content-start grid-cols-1 gap-4 overflow-y-auto p-5 xl:auto-rows-auto xl:content-normal xl:grid-cols-[minmax(320px,400px)_1fr] xl:overflow-hidden">
      {/* Левая колонка — контекст модели и настройка анализа */}
      <div className="min-h-0 space-y-4 pr-1 xl:overflow-y-auto">
        {/* Статус раздела */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Gauge className="size-4 text-emerald-300" />
                Анализ чувствительности
              </CardTitle>
              <Badge variant="amber">эскиз</Badge>
            </div>
            <CardDescription>
              Какие параметры определяют исход эпидемии и насколько устойчив этот вывод.
              Серверный модуль — POST /api/sensitivity (в разработке).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-800 bg-ink-800/40 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-slate-200">
                  {name || "Текущая модель"}
                </p>
                <Badge variant="emerald">откалибрована</Badge>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                версия 1 · данные привязаны · RMSE, R² — из параметризации
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 1. Целевая переменная */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Target className="size-4 text-slate-400" />
              Целевая переменная
            </CardTitle>
            <CardDescription>Выход модели, чувствительность которого исследуется.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <PlanChip tone="emerald">Заболеваемость</PlanChip>
              <PlanChip>Смертность</PlanChip>
              <PlanChip>Доля устойчивого штамма</PlanChip>
              <PlanChip>Интегральный J</PlanChip>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Список строится по выходам модели; для каждого показателя — свой прогон.
            </p>
          </CardContent>
        </Card>

        {/* 2. Параметры и диапазоны */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-slate-400" />
              Параметры и диапазоны
              <Hint text="Для каждого параметра задаются границы и тип распределения: равномерное, нормальное или логнормальное. Снятая галочка фиксирует параметр — он не участвует в анализе." />
            </CardTitle>
            <CardDescription>Границы, распределение и участие в анализе.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {params.map((p) => {
              const preset = presets?.[p];
              return (
                <div
                  key={p}
                  className="flex items-center gap-2 rounded-lg border border-slate-800 bg-ink-800/40 px-2.5 py-1.5"
                >
                  <span className="grid size-4 shrink-0 place-items-center rounded border border-emerald-500/60 bg-emerald-500/20 text-emerald-300">
                    <Check className="size-3" />
                  </span>
                  <span className="font-mono text-xs text-slate-200">{p}</span>
                  <span className="min-w-0 truncate text-[11px] text-slate-500">
                    {labels[p]?.ru ?? "название не задано"}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-400">
                    {preset ? `${fmt(preset.min)}…${fmt(preset.max)}` : "—"}
                  </span>
                  <span className="shrink-0 rounded-full border border-slate-700 bg-ink-800 px-2 py-0.5 text-[10px] text-slate-400">
                    равномерное
                  </span>
                </div>
              );
            })}
            <p className="text-[11px] text-slate-500">
              + добавить параметр · снять галочку — зафиксировать значение
            </p>
          </CardContent>
        </Card>

        {/* 3. Метод и бюджет */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="size-4 text-slate-400" />
              Метод и бюджет
              <Hint text="«Авто» предложит метод по числу параметров, бюджету времени и требуемой точности и объяснит выбор. Бюджет ограничивает число прогонов модели и/или время расчёта." />
            </CardTitle>
            <CardDescription>Три метода, автоматический выбор и ограничения расчёта.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <PlanChip tone="emerald">Авто — рекомендуется</PlanChip>
              <PlanChip>OAT + торнадо</PlanChip>
              <PlanChip>Моррис</PlanChip>
              <PlanChip>Соболь</PlanChip>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "прогонов", value: "≈ 2 400" },
                { label: "время", value: "≈ 40 с" },
                { label: "точность", value: "0.01" },
              ].map((m) => (
                <div key={m.label} className="rounded-lg border border-dashed border-slate-800 p-2 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{m.label}</p>
                  <p className="font-mono text-[11px] text-slate-300">{m.value}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Набор настроек можно сохранить как шаблон для повторных прогонов.
            </p>
          </CardContent>
        </Card>

        {/* 4. Запуск и контроль */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <CirclePlay className="size-4 text-slate-400" />
              Запуск и контроль
            </CardTitle>
            <CardDescription>Прогресс, отмена без потери промежуточных результатов.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full w-0 rounded-full bg-emerald-500/70" />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>0 из ≈ 2 400 прогонов</span>
              <span>осталось —</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <PlanChip>Отменить расчёт</PlanChip>
              <PlanChip>Уведомить о завершении</PlanChip>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Правая колонка — результаты анализа */}
      <div className="min-h-0 space-y-4 pr-1 xl:overflow-y-auto">
        {/* 5. Торнадо-диаграмма (OAT) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Tornado className="size-4 text-slate-400" />
              Торнадо-диаграмма (OAT)
              <Hint text="Параметры меняются по одному при фиксированных остальных. Чем длиннее полоса, тем сильнее параметр сдвигает целевую переменную вниз (слева) или вверх (справа)." />
            </CardTitle>
            <CardDescription>Влияние одиночного изменения каждого параметра.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1.5">
              {params.map((p, i) => {
                const w = TORNADO_WEIGHTS[i] ?? 20;
                return (
                  <div key={p} className="grid grid-cols-[76px_1fr] items-center gap-2">
                    <span className="truncate text-right font-mono text-[11px] text-slate-300">{p}</span>
                    <div className="relative h-4">
                      <span className="absolute left-1/2 top-0 h-full w-px bg-slate-700" />
                      <span
                        className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm bg-rose-500/30"
                        style={{ right: "50%", width: `${w / 2}%` }}
                      />
                      <span
                        className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm bg-emerald-500/30"
                        style={{ left: "50%", width: `${(w * 0.72) / 2}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between px-1 text-[10px] text-slate-600">
              <span>← снижение отклика</span>
              <span>рост отклика →</span>
            </div>
          </CardContent>
        </Card>

        {/* 6. Результаты по методам */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Table2 className="size-4 text-slate-400" />
              Результаты по методам
            </CardTitle>
            <CardDescription>
              Ранжирование параметров с индексами влияния, доверительными интервалами и пояснением,
              как читать показатели.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <PlanChip>OAT</PlanChip>
              <PlanChip>Моррис (μ*, σ)</PlanChip>
              <PlanChip tone="emerald">Соболь (Sᵢ, Sₜᵢ)</PlanChip>
            </div>
            <MockTable
              columns={["Параметр", "μ*", "σ", "Sᵢ", "Sₜᵢ", "ДИ", "Ранг"]}
              rowLabels={params}
            />
            <p className="text-[11px] text-slate-500">
              Сортировка и фильтрация по силе влияния; при наведении — значение параметра и его вклад.
            </p>
          </CardContent>
        </Card>

        {/* 7. Сравнение методов */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <GitCompareArrows className="size-4 text-slate-400" />
              Сравнение методов
            </CardTitle>
            <CardDescription>
              Три метода рядом: ранги параметров, совпадение топ-3 и стоимость в прогонах — без ручного
              сведения таблиц.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {[
                { name: "OAT", runs: "2n прогонов" },
                { name: "Моррис", runs: "r·(n+1)" },
                { name: "Соболь", runs: "N·(2n+2)" },
              ].map((m) => (
                <div key={m.name} className="rounded-lg border border-dashed border-slate-800 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{m.name}</p>
                  <p className="font-mono text-[11px] text-slate-400">{m.runs}</p>
                  <ol className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                    <li>1. —</li>
                    <li>2. —</li>
                    <li>3. —</li>
                  </ol>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <PlanChip>Совпадение топ-3: —</PlanChip>
              <PlanChip tone="amber">Расхождения: —</PlanChip>
            </div>
          </CardContent>
        </Card>

        {/* 8. Устойчивость результата */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Radar className="size-4 text-slate-400" />
              Устойчивость результата
              <Hint text="Индексы чувствительности пересчитываются при разном размере выборки и разных диапазонах. Если при увеличении N ранжирование не меняется, вывод можно считать стабильным." />
            </CardTitle>
            <CardDescription>Стабилизация индексов при росте выборки и смене диапазонов.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <PlanChip>N = 100</PlanChip>
              <PlanChip>N = 500</PlanChip>
              <PlanChip tone="emerald">N = 1000</PlanChip>
              <PlanChip>N = 5000</PlanChip>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-800 p-2">
              <Badge variant="amber">не рассчитано</Badge>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Здесь появится индикатор «стабилизировалось / ещё нет» и график сходимости индексов.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 9. Сохранение и передача */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Save className="size-4 text-slate-400" />
              Сохранение и передача
            </CardTitle>
            <CardDescription>
              Конфигурация прогона, комментарий к результату, экспорт и пометка «готово для сценариев».
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="rounded-lg border border-slate-800 bg-ink-800/40 px-2.5 py-2 text-[11px] italic text-slate-500">
              Комментарий исследователя: «β доминирует, но взаимодействие с σ значимо…»
            </div>
            <div className="flex flex-wrap gap-1.5">
              <PlanChip>Сохранить конфигурацию</PlanChip>
              <PlanChip>CSV / JSON</PlanChip>
              <PlanChip>Ссылка коллеге</PlanChip>
              <PlanChip tone="emerald">Пометить «готово для сценариев»</PlanChip>
            </div>
            <p className="text-[11px] text-slate-500">
              Пометка передаёт ранжирование параметров в модуль сценарного анализа и привязывает его к
              версии модели.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
