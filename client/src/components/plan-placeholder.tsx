// ============================================================
// components/plan-placeholder.tsx — заглушка запланированных
// разделов (Верификация, Анализ чувствительности, Сценарный
// анализ). Показывает план работ и входные данные модуля.
// ============================================================
import type { LucideIcon } from "lucide-react";
import { Clock } from "lucide-react";

interface PlanPlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  points: string[];
  inputs: string[];
  server: string;
}

export function PlanPlaceholder({ title, description, icon: Icon, points, inputs, server }: PlanPlaceholderProps) {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-ink-900/70 p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-300 ring-1 ring-slate-700">
            <Icon className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-100">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">{description}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-ink-900/70 p-5">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
            <Clock className="size-3.5" /> План реализации
          </p>
          <ul className="space-y-1.5">
            {points.map((p) => (
              <li key={p} className="flex gap-2 text-sm text-slate-300">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-400/70" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-ink-900/70 p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Входные данные модуля
          </p>
          <div className="flex flex-wrap gap-1.5">
            {inputs.map((i) => (
              <span
                key={i}
                className="rounded-full border border-slate-700 bg-ink-800 px-2.5 py-1 text-xs font-mono text-slate-300"
              >
                {i}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-ink-900/70 p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Сервер</p>
          <p className="font-mono text-sm text-emerald-300">{server}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Модуль создаётся по образцу «Симуляции»: тяжёлые вычисления будут выполняться на сервере
            (Next.js), клиент только отображает результат.
          </p>
        </div>
      </div>
    </div>
  );
}