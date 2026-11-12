// ============================================================
// pages/scenario-page.tsx — раздел «Сценарный анализ».
//
// Эскиз интерфейса по требованиям из Docs/SA Scenario: выбор модели,
// помеченной «готово для сценариев», управляющие параметры с
// индексами чувствительности, горизонт и веса, бюджет, три режима
// (ручной / сравнение / оптимальный), прогресс и отмена, графики
// заболеваемости и смертности, сравнительная таблица, диаграмма
// «затраты-выгода», траектории u(t), проверка устойчивости и отчёт.
//
// Серверная часть появится позже (POST /api/scenario): клиент только
// настраивает прогон и показывает результат.
// ============================================================
import {
  BadgeCheck,
  CalendarRange,
  ChartLine,
  ChartSpline,
  CirclePlay,
  Coins,
  FileText,
  FlaskConical,
  Radar,
  SlidersHorizontal,
  Table2,
  Workflow,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Hint } from "../components/ui/hint";
import { BlockStub, MockTable, PlanChip } from "../components/plan-ui";
import { useModel } from "../lib/model-context";

// Параметры для эскиза: реальные из модели, иначе пример SIR
const FALLBACK_PARAMS = ["β", "σ", "γ"];

// Эскизные индексы чувствительности рядом с управляющими параметрами
const INFLUENCE = [0.42, 0.18, 0.11];

// Сценарии, которые появятся в сравнительной таблице
const SCENARIOS = ["Базовый", "Карантин", "Вакцинация"];

export function ScenarioPage() {
  const { name, structure, labels } = useModel();
  const modelParams = (structure?.parameters ?? []).filter((p) => p !== "N" && p !== "n");
  const params = (modelParams.length ? modelParams : FALLBACK_PARAMS).slice(0, 3);

  return (
    // Ниже xl блоки идут друг за другом, выше — две колонки во всю высоту окна
    <div className="grid h-full min-h-0 auto-rows-min content-start grid-cols-1 gap-4 overflow-y-auto p-5 xl:auto-rows-auto xl:content-normal xl:grid-cols-[minmax(320px,410px)_1fr] xl:overflow-hidden">
      {/* Левая колонка — выбор модели и настройка сценариев */}
      <div className="min-h-0 space-y-4 pr-1 xl:overflow-y-auto">
        {/* Статус раздела */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Workflow className="size-4 text-emerald-300" />
                Сценарный анализ
              </CardTitle>
              <Badge variant="amber">эскиз</Badge>
            </div>
            <CardDescription>
              Сравнение вариантов вмешательств и поиск оптимального управления при заданных
              ограничениях. Серверный модуль — POST /api/scenario (в разработке).
            </CardDescription>
          </CardHeader>
        </Card>

        {/* 1. Модель для сценариев */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="size-4 text-slate-400" />
              Модель для сценариев
            </CardTitle>
            <CardDescription>
              Доступны только модели с пометкой «готово для сценариев» из анализа чувствительности.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="rounded-lg border border-slate-800 bg-ink-800/40 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-slate-200">
                  {name || "Название модели"}
                </p>
                <Badge variant="emerald">готова</Badge>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                версия 1 · автор — · дата пометки — · RMSE, R² из параметризации
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <PlanChip tone="emerald">Комментарий исследователя</PlanChip>
              <PlanChip>Ранжирование из SA</PlanChip>
              <PlanChip>Статус: актуально</PlanChip>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Результаты анализа чувствительности показаны рядом с параметрами; при изменении модели
              они помечаются устаревшими.
            </p>
          </CardContent>
        </Card>

        {/* 2. Управляющие параметры */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-slate-400" />
              Управляющие параметры
              <Hint text="Список предлагается по результатам анализа чувствительности: чем выше индекс, тем сильнее параметр влияет на исход. Параметр можно добавить вручную, но система предупредит, что он слабо влияет." />
            </CardTitle>
            <CardDescription>
              Отбор параметров, которые будут меняться в сценарии, с показателем влияния.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {params.map((p, i) => (
              <div
                key={p}
                className="flex items-center gap-2 rounded-lg border border-slate-800 bg-ink-800/40 px-2.5 py-1.5"
              >
                <span className="grid size-4 shrink-0 place-items-center rounded border border-emerald-500/60 bg-emerald-500/20">
                  <span className="size-1.5 rounded-full bg-emerald-300" />
                </span>
                <span className="font-mono text-xs text-slate-200">{p}</span>
                <span className="min-w-0 truncate text-[11px] text-slate-500">
                  {labels[p]?.ru ?? "название не задано"}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[11px] text-emerald-300">
                  Sᵢ {(INFLUENCE[i] ?? 0.05).toFixed(2)}
                </span>
                <span className="shrink-0 rounded-full border border-slate-700 bg-ink-800 px-2 py-0.5 text-[10px] text-slate-400">
                  влияет
                </span>
              </div>
            ))}
            <p className="text-[11px] text-slate-500">
              + добавить параметр вручную — появится предупреждение, если влияние слабое
            </p>
          </CardContent>
        </Card>

        {/* 3. Настройка сценариев */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <CalendarRange className="size-4 text-slate-400" />
              Настройка сценариев
              <Hint text="Горизонт — период прогноза (обычно 3–5 лет). Веса w₁ и w₂ задают важность снижения заболеваемости и смертности: чем больше вес, тем сильнее этот показатель влияет на итоговую оценку сценария." />
            </CardTitle>
            <CardDescription>Горизонт, веса целевых показателей и бюджет.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {/* Режим работы */}
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Режим</p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { title: "Ручной", note: "свои значения" },
                  { title: "Сравнение", note: "2–5 вариантов" },
                  { title: "Оптимальный", note: "SLSQP" },
                ].map((m) => {
                  const active = m.title === "Сравнение";
                  return (
                    <div
                      key={m.title}
                      className={
                        active
                          ? "rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2"
                          : "rounded-lg border border-slate-800 bg-ink-800/40 p-2"
                      }
                    >
                      <p
                        className={
                          active
                            ? "text-[11px] font-semibold text-emerald-300"
                            : "text-[11px] font-semibold text-slate-300"
                        }
                      >
                        {m.title}
                      </p>
                      <p className="text-[10px] text-slate-500">{m.note}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Горизонт */}
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Горизонт</p>
              <div className="flex flex-wrap gap-1.5">
                <PlanChip>3 года</PlanChip>
                <PlanChip tone="emerald">5 лет</PlanChip>
                <PlanChip>свой период</PlanChip>
              </div>
            </div>

            {/* Веса и бюджет */}
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-lg border border-dashed border-slate-800 p-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Веса</p>
                <p className="font-mono text-[11px] text-slate-300">w₁ = 0.6 · заболеваемость</p>
                <p className="font-mono text-[11px] text-slate-300">w₂ = 0.4 · смертность</p>
              </div>
              <div className="rounded-lg border border-dashed border-slate-800 p-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Бюджет</p>
                <p className="font-mono text-[11px] text-slate-300">1 000 000 ед.</p>
                <p className="text-[10px] text-slate-500">ограничение SLSQP</p>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              Конфигурацию сценария можно сохранить как шаблон.
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
            <CardDescription>Оценка времени, прогресс и отмена с сохранением результатов.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full w-0 rounded-full bg-emerald-500/70" />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>0 из 5 сценариев</span>
              <span>≈ 8 с · ≈ 750 прогонов</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <PlanChip>Отменить расчёт</PlanChip>
              <PlanChip>Уведомить о завершении</PlanChip>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Правая колонка — результаты сценариев */}
      <div className="min-h-0 space-y-4 pr-1 xl:overflow-y-auto">
        {/* 5. Динамика по сценариям */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <ChartLine className="size-4 text-slate-400" />
              Динамика по сценариям
              <Hint text="Кривые заболеваемости и смертности для каждого сценария на одном графике. «Коридор» показывает разброс исходов с учётом неопределённости наиболее влиятельных параметров." />
            </CardTitle>
            <CardDescription>
              Заболеваемость и смертность по сценариям на одном экране.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {SCENARIOS.map((s, i) => (
                <PlanChip key={s} tone={i === 0 ? "default" : i === 1 ? "sky" : "emerald"}>
                  {s}
                </PlanChip>
              ))}
              <PlanChip>коридор неопределённости</PlanChip>
            </div>
            <BlockStub
              className="h-[240px]"
              text="Графики I(t) и D(t) по сценариям с заливкой коридора; наведение показывает значения и разницу с базовым вариантом."
            />
            <p className="text-[11px] text-slate-500">
              Пояснения к показателям — простым языком, без математических обозначений.
            </p>
          </CardContent>
        </Card>

        {/* 6. Сравнительная таблица */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Table2 className="size-4 text-slate-400" />
              Сравнительная таблица
            </CardTitle>
            <CardDescription>
              Ключевые показатели 2–5 сценариев; лучший вариант выделяется по выбранному критерию.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <MockTable
              columns={["Сценарий", "Пик I", "Итог", "Смертность", "Затраты", "Выгода", "Ранг"]}
              rowLabels={SCENARIOS}
            />
            <div className="flex flex-wrap gap-1.5">
              <PlanChip tone="emerald">Критерий: минимум заболеваемости</PlanChip>
              <PlanChip>Сменить критерий</PlanChip>
              <PlanChip>Сохранить сравнение</PlanChip>
            </div>
          </CardContent>
        </Card>

        {/* 7. Затраты — выгода */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Coins className="size-4 text-slate-400" />
              Затраты — выгода
              <Hint text="По горизонтали — затраты сценария, по вертикали — достигнутый эффект. Лучшие варианты расположены выше и левее: больше пользы при меньших затратах." />
            </CardTitle>
            <CardDescription>Какой сценарий даёт лучший результат при заданном бюджете.</CardDescription>
          </CardHeader>
          <CardContent>
            <svg
              viewBox="0 0 300 170"
              className="h-[180px] w-full"
              role="img"
              aria-label="Эскиз диаграммы затраты-выгода"
            >
              {/* Оси */}
              <line x1="34" y1="146" x2="292" y2="146" className="stroke-slate-700" strokeWidth="1" />
              <line x1="34" y1="146" x2="34" y2="10" className="stroke-slate-700" strokeWidth="1" />
              {/* Базовая линия бюджета */}
              <line
                x1="34"
                y1="118"
                x2="292"
                y2="118"
                className="stroke-slate-700"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text x="40" y="114" className="fill-slate-500" fontSize="8">
                уровень бюджета
              </text>
              <text x="160" y="164" className="fill-slate-500" fontSize="9">
                затраты →
              </text>
              <text x="6" y="20" className="fill-slate-500" fontSize="9">
                выгода ↑
              </text>
              <text x="38" y="22" className="fill-emerald-300" fontSize="8">
                лучше
              </text>
              {/* Точки сценариев */}
              <circle cx="110" cy="46" r="4" className="fill-emerald-400/70" />
              <text x="118" y="46" className="fill-slate-300" fontSize="8">
                Вакцинация
              </text>
              <circle cx="170" cy="84" r="4" className="fill-sky-400/70" />
              <text x="178" y="84" className="fill-slate-300" fontSize="8">
                Карантин
              </text>
              <circle cx="96" cy="128" r="4" className="fill-slate-400/70" />
              <text x="104" y="128" className="fill-slate-300" fontSize="8">
                Базовый
              </text>
            </svg>
          </CardContent>
        </Card>

        {/* 8. Оптимальные траектории u(t) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <ChartSpline className="size-4 text-slate-400" />
              Оптимальные траектории u(t)
            </CardTitle>
            <CardDescription>
              Для оптимального режима — что и когда менять: рекомендуемые значения управляющих
              параметров во времени.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <BlockStub
              className="h-[160px]"
              text="Ступенчатые траектории u(t) по каждому управляющему параметру с отмеченными моментами переключения."
            />
            <div className="flex flex-wrap gap-1.5">
              <PlanChip>Ручной режим — траектории не строятся</PlanChip>
              <PlanChip tone="emerald">Оптимальный режим · SLSQP</PlanChip>
            </div>
          </CardContent>
        </Card>

        {/* 9. Проверка устойчивости */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Radar className="size-4 text-slate-400" />
              Проверка устойчивости
              <Hint text="Быстрый прогон упрощённого анализа чувствительности (метод Морриса) прямо из окна результатов: показывает, зависит ли вывод о лучшем сценарии от неопределённости параметров." />
            </CardTitle>
            <CardDescription>Быстрый Моррис: не случаен ли вывод о лучшем сценарии.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-800 p-2">
              <FlaskConical className="size-4 shrink-0 text-slate-500" />
              <p className="text-[11px] leading-relaxed text-slate-500">
                Результат: «вывод устойчив» / «зависит от неопределённости» с перечнем параметров,
                которые меняют ранжирование сценариев.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <PlanChip>Запустить быстрый Моррис</PlanChip>
              <PlanChip>Другие настройки проверки</PlanChip>
            </div>
          </CardContent>
        </Card>

        {/* 10. Сохранение и отчётность */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4 text-emerald-300" />
              Сохранение и отчётность
            </CardTitle>
            <CardDescription>
              Прогон целиком, клонирование с изменением параметра, PDF-отчёт и дополнение к нему.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="rounded-lg border border-slate-800 bg-ink-800/40 px-2.5 py-2 text-[11px] italic text-slate-500">
              Примечание аналитика: «вариант с вакцинацией снижает пик на …% при том же бюджете…»
            </div>
            <div className="flex flex-wrap gap-1.5">
              <PlanChip>Сохранить прогон</PlanChip>
              <PlanChip>Клонировать и изменить</PlanChip>
              <PlanChip>Сравнить с исходным</PlanChip>
              <PlanChip tone="emerald">PDF по шаблону</PlanChip>
              <PlanChip>Дополнение к отчёту</PlanChip>
            </div>
            <p className="text-[11px] text-slate-500">
              В отчёт входят резюме, постановка задачи, модель, сценарии, сравнение и рекомендация.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
