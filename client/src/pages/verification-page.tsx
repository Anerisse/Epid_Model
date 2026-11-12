// ============================================================
// pages/verification-page.tsx — раздел «Верификация» (заглушка).
//
// Задача раздела — проверить, насколько полученная в разделе
// «Параметризация» модель адекватна данным и насколько устойчивы
// оценки параметров. Ниже зафиксирован состав блоков и то, что
// в них появится; вычисления будут выполняться на сервере
// (POST /api/verify), клиент показывает только эскиз интерфейса.
// ============================================================
import type { ReactNode } from "react";
import {
  Activity,
  ChartLine,
  ClipboardCheck,
  Database,
  Layers,
  ListChecks,
  Repeat,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { cn } from "../lib/utils";

// Заглушка содержимого блока: показывает, что здесь появится позже
function BlockStub({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        "grid h-[110px] place-items-center rounded-lg border border-dashed border-slate-800 px-4 text-center text-xs leading-relaxed text-slate-500",
        className,
      )}
    >
      {text}
    </div>
  );
}

// Чип будущего элемента управления: показывает состав настроек блока
function PlanChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-slate-700 bg-ink-800 px-2.5 py-1 text-[11px] text-slate-300">
      {children}
    </span>
  );
}

export function VerificationPage() {
  return (
    // Ниже xl блоки идут друг за другом (строки — по высоте контента),
    // выше — две колонки во всю высоту окна
    <div className="grid h-full min-h-0 auto-rows-min content-start grid-cols-1 gap-4 overflow-y-auto p-5 xl:auto-rows-auto xl:content-normal xl:grid-cols-[minmax(320px,380px)_1fr] xl:overflow-hidden">
      {/* Левая колонка — исходные данные и настройки проверки */}
      <div className="min-h-0 space-y-4 pr-1 xl:overflow-y-auto">
        {/* Статус раздела */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-300" />
              Верификация модели
            </CardTitle>
            <CardDescription>
              Проверка адекватности модели наблюдениям и устойчивости найденных параметров.
              Серверный модуль — POST /api/verify (в разработке).
            </CardDescription>
          </CardHeader>
        </Card>

        {/* 1. Данные для верификации */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4 text-slate-400" />
              Данные верификации
            </CardTitle>
            <CardDescription>
              Источник наблюдений и способ разделения на обучающую и контрольную части.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <PlanChip>наблюдения I(t)</PlanChip>
              <PlanChip>из раздела «Параметризация»</PlanChip>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <PlanChip>разбиение: по времени</PlanChip>
              <PlanChip>доля контрольной части</PlanChip>
              <PlanChip>k = 5 блоков</PlanChip>
            </div>
            <BlockStub text="Здесь появятся выбор источника данных, режим разбиения и число блоков кросс-валидации." />
          </CardContent>
        </Card>

        {/* 2. Проверяемая модель */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Layers className="size-4 text-slate-400" />
              Проверяемая модель
            </CardTitle>
            <CardDescription>
              Модель и оценённые параметры из раздела «Параметризация»; начальные условия — по первым
              наблюдениям.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <PlanChip>структура модели</PlanChip>
              <PlanChip>оценённые параметры</PlanChip>
              <PlanChip>I(0)</PlanChip>
              <PlanChip>горизонт прогноза</PlanChip>
            </div>
            <BlockStub text="Список параметров с их оценками и переключатель «проверять все компартменты или только I»." />
          </CardContent>
        </Card>

        {/* 3. Структурные проверки */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="size-4 text-slate-400" />
              Структурные проверки
            </CardTitle>
            <CardDescription>
              Инварианты, которые должны выполняться на всём горизонте модели.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <PlanChip>компартменты ≥ 0</PlanChip>
              <PlanChip>Σ компартментов = N</PlanChip>
              <PlanChip>параметры ≥ 0</PlanChip>
              <PlanChip>выздоровление монотонно</PlanChip>
            </div>
            <BlockStub text="Результат по каждому инварианту: выполнен / нарушен, с указанием момента нарушения." />
          </CardContent>
        </Card>
      </div>

      {/* Правая колонка — результаты верификации */}
      <div className="min-h-0 space-y-4 pr-1 xl:overflow-y-auto">
        {/* 4. Сверка модели с наблюдениями */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <ChartLine className="size-4 text-slate-400" />
              Сверка модели с наблюдениями
            </CardTitle>
            <CardDescription>
              Точки наблюдений и кривая модели на общих осях; отдельно выделена граница обучающей и
              контрольной частей.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BlockStub
              className="h-[240px]"
              text="График: жёлтые точки — наблюдения, красная линия — модель, вертикальная граница — момент разделения."
            />
          </CardContent>
        </Card>

        {/* 5. Метрики согласия */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Scale className="size-4 text-slate-400" />
              Метрики согласия
            </CardTitle>
            <CardDescription>
              Качество подгонки отдельно для обучающей и контрольной части — по разнице между ними судят
              об обобщающей способности модели.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {["RMSE", "R²", "MAPE", "Корреляция"].map((m) => (
                <div key={m} className="rounded-lg border border-dashed border-slate-800 p-2 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{m}</p>
                  <p className="font-mono text-sm text-slate-600">—</p>
                </div>
              ))}
            </div>
            <BlockStub text="Рядом с каждой метрикой — два значения: по обучающей и по контрольной части, плюс разрыв между ними." />
          </CardContent>
        </Card>

        {/* 6. Остатки модели */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4 text-slate-400" />
              Остатки модели
            </CardTitle>
            <CardDescription>
              Отклонения «наблюдение − модель» по точкам: случайный разброс означает адекватную модель,
              устойчивый тренд — систематическую ошибку.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <BlockStub
              className="h-[180px]"
              text="График остатков по времени с нулевой линией и их статистика: среднее, дисперсия, тренд, автокорреляция."
            />
          </CardContent>
        </Card>

        {/* 7. Кросс-валидация */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Repeat className="size-4 text-slate-400" />
              Кросс-валидация
            </CardTitle>
            <CardDescription>
              Оценка устойчивости параметров: обучение на k−1 блоках, проверка на оставшемся.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <BlockStub
              className="h-[160px]"
              text="Средний RMSE по блокам с разбросом и разброс оценок параметров между блоками."
            />
          </CardContent>
        </Card>

        {/* 8. Итоговый вердикт */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-4 text-emerald-300" />
              Итоговый вердикт
            </CardTitle>
            <CardDescription>
              Сводка по критериям: адекватность, обобщаемость, структурная корректность, сравнение с
              упрощённой базовой моделью (AIC/BIC).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BlockStub text="Итог: «модель адекватна / требует доработки» с перечнем причин и рекомендаций по следующим шагам." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
