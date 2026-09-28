// components/app-shell.tsx — каркас приложения: сайдбар с разделами
// (заданные маршруты) + область контента. Тёмная тема, в один экран.
import { NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  BookOpenText,
  Gauge,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/utils";

interface NavItem {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

// Маршруты системы: каждый раздел — отдельный модуль (см. AGENTS.md)
const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Модель", description: "ОДУ · блок-схема · сохранение", icon: BookOpenText },
  { to: "/simulation", label: "Симуляция", description: "РК4 · графики · R₀", icon: Activity },
  { to: "/parametrization", label: "Параметризация", description: "Оценка β, γ по данным", icon: SlidersHorizontal },
  { to: "/verification", label: "Верификация", description: "Сравнение модели с данными", icon: ShieldCheck },
  { to: "/sensitivity", label: "Анализ чувствительности", description: "Влияние параметров", icon: Gauge },
  { to: "/scenario", label: "Сценарный анализ", description: "Сценарии вмешательств", icon: Workflow },
];

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-ink-950 text-slate-200">
      {/* Левая колонка — навигация */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-ink-900/60">
        <div className="px-4 pb-4 pt-5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
              <Activity className="size-5" />
            </span>
            <div>
              <p className="font-display text-sm font-bold leading-tight text-slate-100">
                Моделирование
              </p>
              <p className="font-display text-sm font-bold leading-tight text-slate-100">эпидемий</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-start gap-2.5 rounded-lg px-3 py-2.5 transition-colors",
                  isActive
                    ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/25"
                    : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200",
                )
              }
            >
              <item.icon className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">{item.label}</span>
                <span className="block truncate text-[11px] leading-tight text-slate-500">
                  {item.description}
                </span>
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 px-4 py-3">
          <p className="text-[11px] leading-relaxed text-slate-500">
            Все вычисления выполняются сервером (Next.js + SQLite). Клиент — React + Tailwind.
          </p>
        </div>
      </aside>

      {/* Основная область */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}