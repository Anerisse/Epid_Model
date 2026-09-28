// components/app-shell.tsx — каркас приложения: верхняя панель
// «Моделирование эпидемий» на всю ширину, слева — вкладки разделов,
// справа — контент раздела. Контент занимает оставшуюся высоту
// (100dvh): страницы скроллятся внутри своих панелей, а не всей
// страницей (как в legacy).
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
    <div className="flex h-dvh flex-col overflow-hidden bg-ink-950 text-slate-200">
      {/* Верхняя панель на всю ширину */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-800/70 bg-ink-900/70 px-5 py-2.5 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          {/* Логотип: градиентный «пульс» */}
          <div className="relative grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-400 shadow-lg shadow-emerald-500/25">
            <svg viewBox="0 0 24 24" className="size-5 text-ink-950" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
              <polyline points="2 14 8 14 11 6 15 16 18 11 22 11" />
            </svg>
            <span className="absolute -right-1 -top-1 size-2.5 animate-ping rounded-full bg-emerald-400 opacity-60" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display truncate text-lg font-bold tracking-tight text-white">
              Моделирование эпидемий
            </h1>
            <p className="truncate text-[11px] text-slate-500">конструктор эпидемиологических моделей</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <span className="hidden items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 sm:inline-flex">
            <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
            API · онлайн
          </span>
        </div>
      </header>

      {/* Левая навигация (вкладки разделов) + контент */}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800/70 bg-ink-900/40">
          <div className="px-4 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Этапы работы с моделью
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                title={item.description}
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

        {/* Контент раздела: занимает оставшуюся высоту, страница сама
            раскладывается на панели и скроллится внутри них */}
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}