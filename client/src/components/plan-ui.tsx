// ============================================================
// components/plan-ui.tsx — общие элементы эскизов разделов.
//
// Разделы «Анализ чувствительности» и «Сценарный анализ» пока
// существуют как наброски интерфейса: серверных расчётов ещё нет,
// но состав блоков и будущие элементы управления уже зафиксированы.
// Чтобы не дублировать разметку «заглушек» в двух страницах, здесь
// собраны мелкие компоненты: пунктирный блок, чип-настройка и
// пустая таблица с колонками будущего результата.
// ============================================================
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

// Пунктирный блок: место будущего графика, таблицы или результата
export function BlockStub({ text, className }: { text: string; className?: string }) {
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

// Чип будущей настройки: показывает, что появится в блоке.
// Тон выделяет рекомендованный вариант или предупреждение.
const CHIP_TONES = {
  default: "border-slate-700 bg-ink-800 text-slate-300",
  emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  sky: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  rose: "border-rose-500/40 bg-rose-500/10 text-rose-300",
} as const;

export function PlanChip({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: keyof typeof CHIP_TONES;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]",
        CHIP_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

// Пустая таблица результата: колонки известны заранее, значения
// появятся после расчёта. rowLabels — имена параметров/сценариев.
export function MockTable({
  columns,
  rowLabels,
  rows = 4,
  className,
}: {
  columns: string[];
  rowLabels?: string[];
  rows?: number;
  className?: string;
}) {
  const count = Math.max(rows, rowLabels?.length ?? 0);
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border border-dashed border-slate-800",
        className,
      )}
    >
      <table className="w-full text-left text-[11px]">
        <thead className="bg-ink-800/60 text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-2.5 py-1.5 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: count }).map((_, i) => (
            <tr key={i} className="border-t border-slate-800/70 text-slate-500">
              <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-slate-300">
                {rowLabels?.[i] ?? "—"}
              </td>
              {columns.slice(1).map((c) => (
                <td key={c} className="whitespace-nowrap px-2.5 py-1.5">
                  —
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
