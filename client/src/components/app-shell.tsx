// components/app-shell.tsx — каркас приложения: верхняя панель
// «Simula» на всю ширину, слева — вкладки разделов (сворачиваются
// до иконок; кнопка сворачивания внутри панели, справа от заголовка),
// справа — контент раздела. Статус модели живёт в шапке: название,
// число пройденных этапов и статус. Контент занимает оставшуюся
// высоту (100dvh): страницы скроллятся внутри своих панелей.
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Gauge,
  LogIn,
  Moon,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  UserPlus,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useTheme } from "../lib/theme";
import { ModelStatus } from "./model-status";
import { Button } from "./ui/button";

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
  const { theme, toggleTheme } = useTheme();
  // Заглушка авторизации: кнопка входа/регистрации без реального аккаунта
  const [authNotice, setAuthNotice] = useState(false);
  // Левая панель разделов: сворачивается до иконок кнопкой внутри панели
  const [navOpen, setNavOpen] = useState(true);

  useEffect(() => {
    if (!authNotice) return;
    const timer = window.setTimeout(() => setAuthNotice(false), 2600);
    return () => window.clearTimeout(timer);
  }, [authNotice]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink-950 text-slate-200">
      {/* Верхняя панель на всю ширину */}
      <header className="app-header relative z-30 flex shrink-0 items-center gap-3 border-b border-slate-800/70 bg-ink-900/70 px-5 py-2.5 backdrop-blur-md">
        <div className="flex shrink-0 items-center gap-3">
          {/* Логотип: градиентный «пульс» */}
          <div className="relative grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-400 shadow-lg shadow-emerald-500/25">
            <svg viewBox="0 0 24 24" className="size-5 text-emerald-950" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
              <polyline points="2 14 8 14 11 6 15 16 18 11 22 11" />
            </svg>
            <span className="absolute -right-1 -top-1 size-2.5 animate-ping rounded-full bg-emerald-400 opacity-60" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display truncate bg-gradient-to-r from-emerald-300 to-cyan-300 text-lg font-bold tracking-tight bg-clip-text text-transparent">
              Simula
            </h1>
            <p className="truncate text-[11px] text-slate-500">моделирование эпидемий</p>
          </div>
        </div>

        {/* Статус модели по центру шапки: «Модель» + название + этапы + статус */}
        <div className="flex min-w-0 flex-1 justify-center px-1">
          <ModelStatus />
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          {/* Переключатель темы */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
            aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>

          {/* Вход / регистрация — заглушка */}
          <Button variant="outline" size="sm" onClick={() => setAuthNotice(true)}>
            <LogIn className="size-3.5" />
            Войти
          </Button>
          <Button variant="default" size="sm" onClick={() => setAuthNotice(true)} className="hidden sm:inline-flex">
            <UserPlus className="size-3.5" />
            Регистрация
          </Button>
        </div>
      </header>

      {/* Подсказка-заглушка авторизации */}
      {authNotice && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 rounded-xl border border-slate-700 bg-ink-800 px-4 py-3 text-sm text-slate-200 surface-float">
          <span className="font-semibold text-slate-100">Вход и регистрация</span>
          <span className="ml-2 text-slate-400">— раздел в разработке (заглушка)</span>
        </div>
      )}

      {/* Левая навигация (вкладки разделов) + контент */}
      <div className="flex min-h-0 flex-1">
        <aside
          id="app-sidebar"
          className={cn(
            "app-sidebar shrink-0 overflow-hidden border-r border-slate-800/70 bg-ink-900/40 transition-[width] duration-200",
            navOpen ? "w-64" : "w-14",
          )}
        >
          <div className="flex h-full w-full flex-col">
            <div
              className={cn(
                "flex items-center pb-2 pt-3",
                navOpen ? "justify-between gap-2 pl-4 pr-2" : "justify-center px-1",
              )}
            >
              {navOpen && (
                <div className="min-w-0 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  Этапы работы с моделью
                </div>
              )}
              <button
                type="button"
                onClick={() => setNavOpen((v) => !v)}
                title={navOpen ? "Скрыть панель разделов" : "Показать панель разделов"}
                aria-label={navOpen ? "Скрыть панель разделов" : "Показать панель разделов"}
                aria-expanded={navOpen}
                aria-controls="app-sidebar"
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-100"
              >
                {navOpen ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-2 pb-3">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  title={navOpen ? item.description : `${item.label} — ${item.description}`}
                  className={({ isActive }) =>
                    cn(
                      "flex rounded-lg py-2.5 transition-colors",
                      navOpen ? "items-start gap-2.5 px-3" : "items-center justify-center px-0",
                      isActive
                        ? "nav-item-active"
                        : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200",
                    )
                  }
                >
                  <item.icon className={cn("size-4 shrink-0", navOpen && "mt-0.5")} />
                  {navOpen && (
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-tight">{item.label}</span>
                      <span className="block truncate text-[11px] leading-tight text-slate-500">
                        {item.description}
                      </span>
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>

            {navOpen && (
              <div className="border-t border-slate-800 px-4 py-3">
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Все вычисления выполняются сервером (Next.js + SQLite). Клиент — React + Tailwind.
                </p>
              </div>
            )}
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
