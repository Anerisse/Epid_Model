// ============================================================
// components/on-screen-keyboard.tsx — виртуальная клавиатура
// для ввода уравнений ОДУ (порт legacy/client/js/keyboard.js).
// Открывается ПО ЦЕНТРУ ЭКРАНА модальным окном поверх контента:
// греческие буквы (параметры), латинские заглавные (компартменты),
// цифры, операторы, шаблоны dX/dt и ∂X/∂t. Вставка — в позицию
// курсора textarea (или в конец выделенного фрагмента).
// ============================================================
import { useEffect, type RefObject } from "react";
import { X } from "lucide-react";

// Греческие буквы (параметры моделей: β, γ, δ, …)
const GREEK_LETTERS = [
  "α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "λ", "μ",
  "ν", "ξ", "π", "ρ", "σ", "τ", "φ", "χ", "ψ", "ω",
];

// Заглавные латинские буквы (компартменты: S, I, R, N, …)
const ENGLISH_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
  "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T",
  "U", "V", "W", "X", "Y", "Z",
];

// Цифры
const NUMBERS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

// Операторы и знак равенства
const OPERATORS = ["+", "-", "*", "/", "=", "^"];

// Прочие символы: скобки, разделители и математические знаки
const BASIC_SYMBOLS = [
  "(", ")", "[", "]", "{", "}", ".", ",", ";", ":",
  "_", "≈", "≤", "≥", "±", "∫", "∑", "√", "∞", "∂",
];

interface OnScreenKeyboardProps {
  // Открыта ли клавиатура (модальное окно по центру экрана)
  open: boolean;
  // Закрыть клавиатуру (Escape, кнопка или клик по фону)
  onClose: () => void;
  // Ссылка на textarea, в которую вставляются символы
  targetRef: RefObject<HTMLTextAreaElement | null>;
  // Обновление текста модели (из state родителя)
  onChange: (next: string) => void;
}

// Маленькая подпись секции клавиатуры
function SectionLabel({ children }: { children: string }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">
      {children}
    </div>
  );
}

// Стиль кнопки-символа: крупная, с мягким фоном и подсветкой
const KEY_CLASS =
  "h-9 rounded-lg border border-slate-600/40 bg-slate-700/40 text-base text-slate-200 transition " +
  "hover:border-emerald-500/40 hover:bg-emerald-500/15 hover:text-emerald-300 active:scale-95";

export function OnScreenKeyboard({ open, onClose, targetRef, onChange }: OnScreenKeyboardProps) {
  // Закрытие по Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Вставить символ в позицию курсора textarea и вернуть курсор
  const insertSymbol = (symbol: string) => {
    const el = targetRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value ?? "";
    const next = value.slice(0, start) + symbol + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + symbol.length;
      el.setSelectionRange(pos, pos);
    });
  };

  // Вставка шаблона производной: выделенную переменную подставляет
  // в dX/dt или ∂X/∂t, иначе — символ-заглушку S
  const insertTemplate = (template: (variable: string) => string) => {
    const el = targetRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value ?? "";
    const selection = value.slice(start, end).trim();
    const variable = /^[A-Za-zΑ-Ωα-ω\d]+$/.test(selection) ? selection : "S";
    const term = template(variable);
    const next = value.slice(0, start) + term + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + term.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const insertDerivative = () => insertTemplate((v) => `d${v}/dt`);
  const insertPartial = () => insertTemplate((v) => `∂${v}/∂t`);

  // Плиточная сетка кнопок символов
  const symbolGrid = (keys: string[]) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(2.4rem,1fr))] gap-1.5">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          className={KEY_CLASS}
          onClick={() => insertSymbol(key)}
          aria-label={`Вставить ${key}`}
        >
          {key}
        </button>
      ))}
    </div>
  );

  // Затемнённый фон по центру экрана; клик по фону закрывает окно
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Виртуальная клавиатура"
    >
      <div
        className="w-full max-w-2xl select-none rounded-2xl border border-slate-700 bg-ink-900 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <span className="text-sm font-bold text-slate-100">Виртуальная клавиатура</span>
            <span className="ml-2 text-[10px] text-slate-500">вставка в позицию курсора</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/20 px-3 py-1.5 text-sm text-rose-300 transition hover:bg-rose-500/30"
          >
            <X className="size-3.5" /> Закрыть
          </button>
        </div>

        <div className="max-h-[75dvh] space-y-2.5 overflow-y-auto p-4">
          {/* Ввод: шаблоны производных + цифры и операторы */}
          <SectionLabel>Ввод</SectionLabel>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={insertDerivative}
                className="flex h-10 items-center gap-1 rounded-lg border border-slate-600/50 bg-slate-700/50 px-3 text-sm text-slate-200 transition hover:border-emerald-500/40 hover:bg-emerald-500/15 active:scale-95"
                title="Вставить dX/dt (выделите переменную заранее)"
              >
                d<span className="italic">X</span>/dt
              </button>
              <button
                type="button"
                onClick={insertPartial}
                className="flex h-10 items-center gap-1 rounded-lg border border-slate-600/50 bg-slate-700/50 px-3 text-sm text-slate-200 transition hover:border-emerald-500/40 hover:bg-emerald-500/15 active:scale-95"
                title="Вставить ∂X/∂t (выделите переменную заранее)"
              >
                ∂<span className="italic">X</span>/∂t
              </button>
            </div>
            <div className="min-w-[260px] flex-1">{symbolGrid([...NUMBERS, ...OPERATORS])}</div>
          </div>

          {/* Латинские заглавные — компартменты */}
          <SectionLabel>Латинские · компартменты</SectionLabel>
          {symbolGrid(ENGLISH_LETTERS)}

          {/* Греческие — параметры */}
          <SectionLabel>Греческие · параметры</SectionLabel>
          {symbolGrid(GREEK_LETTERS)}

          {/* Символы */}
          <SectionLabel>Символы</SectionLabel>
          {symbolGrid(BASIC_SYMBOLS)}
        </div>

        <div className="border-t border-slate-800 px-4 py-2 text-[10px] text-slate-500">
          Шаблоны dX/dt и ∂X/∂t подставляют выделенную переменную (по умолчанию — S). Escape — закрыть.
        </div>
      </div>
    </div>
  );
}