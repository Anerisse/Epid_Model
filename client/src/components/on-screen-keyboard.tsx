// ============================================================
// components/on-screen-keyboard.tsx — виртуальная клавиатура
// для ввода уравнений ОДУ (порт legacy/client/js/keyboard.js).
// Плавающая панель у НИЖНЕГО края экрана по центру горизонтали
// (fixed bottom, как было до переезда): единая панель без вкладок —
// «Ввод» (шаблоны d□/dt, ∂□/∂t + цифры/операторы), латинские
// заглавные (компартменты), греческие (параметры), символы.
// Вставка — в позицию курсора textarea (или конец выделения).
// ============================================================
import type { RefObject } from "react";
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
  // Открыта ли клавиатура (плавающая панель у нижнего края)
  open: boolean;
  // Закрыть клавиатуру (кнопка в шапке панели или переключатель)
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

  // Вставка шаблона производной: выделенную переменную подставляем
  // в dX/dt или ∂X/∂t, иначе — символ-заглушку X (как legacy d□)
  const insertTemplate = (template: (variable: string) => string) => {
    const el = targetRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value ?? "";
    const selection = value.slice(start, end).trim();
    const variable = /^[A-Za-zΑ-Ωα-ω\d]+$/.test(selection) ? selection : "X";
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

  // Кнопка дроби dX/dt (вид «вертикальной дроби», как в legacy)
  const FractionButton = ({ top, bottom, onClick, title }: { top: string; bottom: string; onClick: () => void; title: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-14 shrink-0 items-center justify-center rounded-xl border border-slate-600/50 bg-slate-700/50 px-5 transition hover:border-emerald-500/40 hover:bg-emerald-500/15 active:scale-95"
    >
      <span className="inline-flex flex-col items-center text-slate-200">
        <span className="text-sm">{top}</span>
        <span className="my-0.5 w-full border-t border-slate-400" />
        <span className="text-sm">{bottom}</span>
      </span>
    </button>
  );

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
    // Плавающая панель: прижата к низу экрана по центру, max-height 50vh
    <div
      className="fixed bottom-4 left-1/2 z-40 w-[min(1240px,calc(100vw-1.5rem))] -translate-x-1/2 select-none overflow-y-auto rounded-2xl border border-slate-600/50 bg-ink-800/95 shadow-2xl backdrop-blur-md"
      style={{ maxHeight: "50vh" }}
      role="dialog"
      aria-label="Виртуальная клавиатура"
    >
      <div className="space-y-3 p-4">
        {/* Шапка панели */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-200">Виртуальная клавиатура</span>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/20 px-3 py-1.5 text-sm text-rose-300 transition hover:bg-rose-500/30"
          >
            <X className="size-3.5" /> Закрыть
          </button>
        </div>

        {/* Ввод: слева шаблоны производных, справа цифры и операторы */}
        <SectionLabel>Ввод</SectionLabel>
        <div className="flex flex-wrap items-center gap-4">
          <div className="shrink-0 space-y-1">
            <div className="flex gap-2">
              <FractionButton
                top="dX"
                bottom="dt"
                onClick={insertDerivative}
                title="Вставить dX/dt (выделите переменную заранее)"
              />
              <FractionButton
                top="∂X"
                bottom="∂t"
                onClick={insertPartial}
                title="Вставить ∂X/∂t (выделите переменную заранее)"
              />
            </div>
            <div className="px-1 text-[10px] text-slate-500">Выделите переменную перед вставкой</div>
          </div>
          <div className="min-w-[280px] flex-1">{symbolGrid([...NUMBERS, ...OPERATORS])}</div>
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
    </div>
  );
}