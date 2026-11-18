// lib/font.tsx — выбор шрифта интерфейса.
//
// Механизм: выбранный шрифт задаётся через CSS-переменные
// --font-sans и --font-display на <html>, которые переопределяют
// значения из @theme в index.css. Выбор сохраняется в localStorage;
// раннее применение — в index.html (до первой отрисовки).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Ключ в localStorage — должен совпадать со скриптом в index.html
export const FONT_STORAGE_KEY = "simula-font";

export interface FontOption {
  id: string;
  label: string;
  // CSS-стек для основного текста интерфейса (--font-sans)
  sans: string;
  // CSS-стек для акцентных заголовков (--font-display)
  display: string;
}

// Доступные шрифты интерфейса: текущий, Medeo Sans и несколько
// вариантов с хорошей поддержкой кириллицы и латиницы.
export const FONT_OPTIONS: FontOption[] = [
  {
    id: "manrope",
    label: "Текущий (Manrope)",
    sans: '"Manrope", ui-sans-serif, system-ui, sans-serif',
    display: '"Space Grotesk", ui-sans-serif, sans-serif',
  },
  {
    id: "medeo-sans",
    label: "Medeo Sans",
    sans: '"Medeo Sans", "Manrope", ui-sans-serif, system-ui, sans-serif',
    display: '"Medeo Sans", "Space Grotesk", ui-sans-serif, sans-serif',
  },
  {
    id: "inter",
    label: "Inter",
    sans: '"Inter", ui-sans-serif, system-ui, sans-serif',
    display: '"Inter", ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: "noto-sans",
    label: "Noto Sans",
    sans: '"Noto Sans", ui-sans-serif, system-ui, sans-serif',
    display: '"Noto Sans", ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: "ibm-plex-sans",
    label: "IBM Plex Sans",
    sans: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
    display: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: "onest",
    label: "Onest",
    sans: '"Onest", ui-sans-serif, system-ui, sans-serif',
    display: '"Onest", ui-sans-serif, system-ui, sans-serif',
  },
];

export const DEFAULT_FONT_ID = "manrope";

interface FontContextValue {
  fontId: string;
  setFontId: (id: string) => void;
}

const FontContext = createContext<FontContextValue | null>(null);

function resolveOption(id: string | null | undefined): FontOption {
  return FONT_OPTIONS.find((o) => o.id === id) ?? FONT_OPTIONS[0];
}

function initialFontId(): string {
  if (typeof window === "undefined") return DEFAULT_FONT_ID;
  const saved = window.localStorage.getItem(FONT_STORAGE_KEY);
  return resolveOption(saved).id;
}

// Применяет шрифт к документу через CSS-переменные темы
export function applyFont(option: FontOption) {
  const root = document.documentElement;
  root.style.setProperty("--font-sans", option.sans);
  root.style.setProperty("--font-display", option.display);
}

export function FontProvider({ children }: { children: ReactNode }) {
  const [fontId, setFontIdState] = useState<string>(initialFontId);

  useEffect(() => {
    const option = resolveOption(fontId);
    applyFont(option);
    window.localStorage.setItem(FONT_STORAGE_KEY, option.id);
  }, [fontId]);

  const setFontId = useCallback((id: string) => {
    setFontIdState(resolveOption(id).id);
  }, []);

  const value = useMemo(() => ({ fontId, setFontId }), [fontId, setFontId]);

  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}

// Хук выбора шрифта: использовать только внутри FontProvider
export function useFont(): FontContextValue {
  const ctx = useContext(FontContext);
  if (!ctx) throw new Error("useFont() используется вне FontProvider");
  return ctx;
}
