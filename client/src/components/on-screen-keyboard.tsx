// ============================================================
// components/on-screen-keyboard.tsx — виртуальная клавиатура
// для ввода уравнений ОДУ (порт legacy/client/js/keyboard.js).
// Единая панель без вкладок: греческие буквы (параметры),
// латинские заглавные (компартменты), цифры, операторы,
// производные-шаблоны dX/dt и ∂X/∂t. Вставка — в позицию
// курсора textarea (или в конец выделенного фрагмента).
// ============================================================
import type { RefObject } from "react";

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

export function OnScreenKeyboard({ targetRef, onChange }: OnScreenKeyboardProps) {
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

  // Позиция, из которой начинается вставка (для шаблонов производных)
  const insertTemplate = (template: (variable: string) => string) => {
    const el = targetRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value ?? "";
    const selection = value.slice(start, end).trim();
    // Если выделена переменная (S, I, R, …) — подставляем её в шаблон,
    // иначе вставляем шаблон с символом-заглушкой S
    const variable = /^[A-Za-zΑ-Ωα-ω\d]+$/.test(selection) ? selection : "S";
    const next = value.slice(0, start) + template(variable) + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + template(variable).length;
      el.setSelectionRange(pos, pos);
    });
  };

  const insertDerivative = () =>
    insertTemplate((v) => `d${v}/dt`);
  const insertPartial = () =>
    insertTemplate((v) => `∂${v}/∂t`);

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

  return (
    <div className="select-none space-y-2.5 rounded-xl border border-slate-800 bg-ink-800/50 p-3">
      {/* Шапка панели */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-200">Виртуальная клавиатура</span>
        <span className="text-[10px] text-slate-500">вставка в позицию курсора</span>
      </div>

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
  );
}