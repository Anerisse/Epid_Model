// lib/theme.tsx — переключатель темы (тёмная/светлая).
//
// Механизм: тема задаётся классом .light на <html>; в index.css
// этот класс переопределяет CSS-переменные палитры, поэтому все
// утилиты Tailwind (bg-ink-900, text-slate-300, …) работают в обеих
// темах без дублирования разметки. Выбор сохраняется в localStorage.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "dark" | "light";

// Ключ в localStorage и имя класса на <html> должны совпадать
// с тем, что использует index.html (скрипт до первой отрисовки).
export const THEME_STORAGE_KEY = "simula-theme";
export const THEME_CLASS = "light";

interface ThemeContextValue {
  theme: Theme;
  /** Явно задать тему */
  setTheme: (theme: Theme) => void;
  /** Переключить тему (тёмная ↔ светлая) */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Начальная тема: сохранённая → системная → тёмная по умолчанию
function initialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

// Применяем тему к документу: класс + color-scheme (нативные
// контролы — выпадающие списки, скроллбары — подстраиваются под тему).
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle(THEME_CLASS, theme === "light");
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((current) => (current === "dark" ? "light" : "dark")),
    [],
  );

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Хук темы: использовать только внутри ThemeProvider
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() используется вне ThemeProvider");
  return ctx;
}
