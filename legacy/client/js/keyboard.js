// ============================================================
// keyboard.js — виртуальная клавиатура для ввода формул
// ============================================================

// Греческие буквы (параметры моделей: β, γ, δ, ...)
const greekLetters = [
  "α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "λ", "μ",
  "ν", "ξ", "π", "ρ", "σ", "τ", "φ", "χ", "ψ", "ω",
];

// Заглавные латинские буквы (компартменты: S, I, R, N, ...)
const englishLetters = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
  "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T",
  "U", "V", "W", "X", "Y", "Z",
];

// Цифры
const numbers = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

// Операторы и знаки равенства (ASCII — их понимает будущий парсер)
const operators = ["+", "-", "*", "/", "=", "^"];

// Прочие символы: скобки, разделители и математические знаки
const basicSymbols = [
  "(", ")", "[", "]", "{", "}", ".", ",", ";", ":",
  "_", "≈", "≠", "≤", "≥", "±", "∫", "∑", "√", "∞", "∂",
];

// ------------------------------------------------------------------
// Показать клавиатуру: убираем класс hidden и отрисовываем панель.
// Клавиатура — единая панель без вкладок: все нужные символы
// видны сразу, поэтому не приходится «прыгать» между наборами
// во время набора уравнения.
// ------------------------------------------------------------------
function showKeyboard() {
  const keyboard = document.getElementById("virtual-keyboard");
  keyboard.classList.remove("hidden");
  renderKeyboard();
}

// Скрыть клавиатуру
function hideKeyboard() {
  document.getElementById("virtual-keyboard").classList.add("hidden");
}

// Переключить клавиатуру (показать/скрыть)
function toggleKeyboard() {
  const keyboard = document.getElementById("virtual-keyboard");
  if (keyboard.classList.contains("hidden")) {
    showKeyboard();
  } else {
    hideKeyboard();
  }
}

// ------------------------------------------------------------------
// Отрисовать всю панель клавиатуры. Структура — это фиксированный
// набор секций (никаких вкладок), поэтому панель одинакова по
// размеру при любом использовании.
// ------------------------------------------------------------------
function renderKeyboard() {
  const keyboard = document.getElementById("virtual-keyboard");

  keyboard.innerHTML = `
    <div class="p-4 space-y-3 select-none">
      <!-- Шапка панели -->
      <div class="flex justify-between items-center">
        <span class="text-sm font-bold text-slate-200">Виртуальная клавиатура</span>
        <button onclick="hideKeyboard()"
                class="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 text-sm">
          ✕ Закрыть
        </button>
      </div>

      <!-- Ввод: слева формулы, справа цифры и операторы -->
      ${sectionLabel("Ввод")}
      <div class="flex flex-wrap gap-4 items-center">
        <!-- Левая часть: шаблоны производных -->
        <div class="shrink-0 space-y-1">
          <div class="flex gap-2">
            <button onclick="insertDerivative()"
                    class="px-5 min-h-14 rounded-xl bg-slate-700/50 border border-slate-600/50 hover:bg-emerald-500/15 hover:border-emerald-500/40 active:scale-95 transition">
              <span class="inline-flex flex-col items-center text-slate-200">
                <span class="text-sm">d□</span>
                <span class="w-full border-t border-slate-400 my-0.5"></span>
                <span class="text-sm">dt</span>
              </span>
            </button>
            <button onclick="insertPartialDerivative()"
                    class="px-5 min-h-14 rounded-xl bg-slate-700/50 border border-slate-600/50 hover:bg-emerald-500/15 hover:border-emerald-500/40 active:scale-95 transition">
              <span class="inline-flex flex-col items-center text-slate-200">
                <span class="text-sm">∂□</span>
                <span class="w-full border-t border-slate-400 my-0.5"></span>
                <span class="text-sm">∂t</span>
              </span>
            </button>
          </div>
          <div class="text-[10px] text-slate-500 px-1">Выделите переменную перед вставкой</div>
        </div>

        <!-- Правая часть: цифры и операторы -->
        <div class="flex-1 min-w-[280px]">
          ${renderSymbolGrid([...numbers, ...operators])}
        </div>
      </div>

      <!-- Латинские (заглавные) — компартменты -->
      ${sectionLabel("Латинские · компартменты")}
      ${renderSymbolGrid(englishLetters)}

      <!-- Греческие — параметры -->
      ${sectionLabel("Греческие · параметры")}
      ${renderSymbolGrid(greekLetters)}

      <!-- Символы -->
      ${sectionLabel("Символы")}
      ${renderSymbolGrid(basicSymbols)}
    </div>
  `;
}

// ------------------------------------------------------------------
// Маленький заголовок-подпись секции клавиатуры.
// ------------------------------------------------------------------
function sectionLabel(text) {
  return `
    <div class="text-[10px] uppercase tracking-widest text-slate-600 font-semibold">${text}</div>
  `;
}

// ------------------------------------------------------------------
// Плиточная сетка кнопок для набора символов. Кнопки крупные,
// с мягким фоном и подсветкой при наведении — их легко читать
// на тёмном фоне.
// ------------------------------------------------------------------
function renderSymbolGrid(keys) {
  return `
    <div class="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5">
      ${keys
        .map(
          (key) => `
        <button onclick="insertSymbol('${key}')"
                class="h-9 rounded-lg bg-slate-700/40 border border-slate-600/40 text-slate-200
                       hover:bg-emerald-500/15 hover:text-emerald-300 hover:border-emerald-500/40
                       active:scale-95 transition text-base">
          ${key}
        </button>`,
        )
        .join("")}
    </div>
  `;
}

// ------------------------------------------------------------------
// Вставить символ в уравнение в позицию курсора.
// После вставки диаграмма обновляется, чтобы изменения были видны.
// ------------------------------------------------------------------
function insertSymbol(symbol) {
  const equationInput = document.getElementById("equation-input");
  equationInput.focus();

  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(symbol));
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    equationInput.innerHTML += symbol;
  }

  updateDiagram();
}

// Вставить обычную производную (вертикальная дробь dX/dt)
function insertDerivative(variable = null) {
  const equationInput = document.getElementById("equation-input");
  equationInput.focus();

  // Если переменная не указана явно, берём выделенный текст
  if (!variable) {
    const selection = window.getSelection();
    variable = selection.toString() || "□";
  }

  // ВАЖНО: шаблон должен быть без отступов и переносов — иначе
  // innerHTML создаст лишние текстовые узлы (пробел «прилипнет»
  // к дроби и сломает разбор уравнения).
  const derivativeHTML =
    '<span class="inline-flex flex-col items-center align-middle mx-1" contenteditable="false">' +
    "<span>d" + variable + "</span>" +
    '<span class="w-full border-t border-slate-400 my-0.5"></span>' +
    "<span>dt</span>" +
    "</span>";

  insertHTML(derivativeHTML);
  updateDiagram();
}

// Вставить частную производную (∂X/∂t)
function insertPartialDerivative(variable = null) {
  const equationInput = document.getElementById("equation-input");
  equationInput.focus();

  if (!variable) {
    const selection = window.getSelection();
    variable = selection.toString() || "□";
  }

  const partialHTML =
    '<span class="inline-flex flex-col items-center align-middle mx-1" contenteditable="false">' +
    "<span>∂" + variable + "</span>" +
    '<span class="w-full border-t border-slate-400 my-0.5"></span>' +
    "<span>∂t</span>" +
    "</span>";

  insertHTML(partialHTML);
  updateDiagram();
}

// ------------------------------------------------------------------
// Вставка HTML-фрагмента в contenteditable-область уравнения.
// Работает через Selection API: заменяет выделение или добавляет
// в конец, если курсор в области не установлен.
// Пустые текст-узлы из пробелов/переносов отбрасываем — они
// появляются из отступов HTML-разметки и «разрывают» строку.
// ------------------------------------------------------------------
function insertHTML(html) {
  const equationInput = document.getElementById("equation-input");

  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.deleteContents();

    // Создаём элемент из HTML и копируем его узлы
    const temp = document.createElement("div");
    temp.innerHTML = html;
    // Отбрасываем чисто пробельные текст-узлы (отступы шаблона)
    const nodes = Array.from(temp.childNodes).filter(
      (node) => node.nodeType !== 3 || node.data.trim() !== "",
    );

    nodes.forEach((node) => {
      range.insertNode(node.cloneNode(true));
      range.collapse(false);
    });

    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    equationInput.innerHTML += html;
  }
}