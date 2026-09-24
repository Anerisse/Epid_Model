// ============================================================
// main.js — инициализация приложения и общие UI-утилиты
// ============================================================

// ------------------------------------------------------------------
// Разрешённые для ввода символы = ровно те, что есть на виртуальной
// клавиатуре: заглавные латинские, цифры, операторы, символы и
// греческие буквы. Всё остальное (строчные латинские, кириллица и
// произвольные знаки) с физической клавиатуры ввести нельзя.
// ------------------------------------------------------------------
const ALLOWED_INPUT_CHARS = new Set([
  ...englishLetters,
  ...numbers,
  ...operators,
  ...basicSymbols,
  ...greekLetters,
  // Буквы 'd' и 't' — часть обозначения производной d□/dt,
  // они есть на виртуальной клавиатуре; нужны и для вставки текста вида dS/dt
  "d",
  "t",
  // Пробел — для читаемости формул (пользователь его запросил)
  " ",
]);

// Соответствие между латинскими именами параметров и греческими буквами.
// Используется при вставке из буфера: текст "beta * S * I" автоматически
// превращается в "β * S * I", чтобы формулы выглядели как в книгах.
const GREEK_ALIASES = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  phi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
};

// ------------------------------------------------------------------
// Показывает всплывающее уведомление (тост) вместо alert().
// Сообщения об успехе — зелёные, об ошибках — красные. Тосты
// автоматически исчезают через 3 секунды, чтобы не мешать работе.
// ------------------------------------------------------------------
function showToast(message, type = "success") {
  const area = document.getElementById("toast-area");
  const toast = document.createElement("div");
  toast.className =
    "toast px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg border backdrop-blur-md " +
    (type === "error"
      ? "bg-rose-500/15 text-rose-200 border-rose-500/30"
      : "bg-emerald-500/15 text-emerald-200 border-emerald-500/30");
  toast.textContent = message;
  area.appendChild(toast);

  // Убираем тост через 3 секунды с плавным исчезновением
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-1");
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

// ------------------------------------------------------------------
// Переключает активный раздел интерфейса.
// Разделы соответствуют модулям системы (Модель, Симуляция,
// Параметризация, ...). name — значение атрибута data-section кнопки.
// ------------------------------------------------------------------
function switchSection(name) {
  // Скрываем все секции-страницы и показываем только выбранную
  document.querySelectorAll("[data-section-page]").forEach((section) => {
    section.classList.toggle("hidden", section.id !== "section-" + name);
  });

  // Подсвечиваем активный пункт в сайдбаре
  document.querySelectorAll("[data-section]").forEach((button) => {
    button.classList.toggle("active", button.dataset.section === name);
  });
}

// Инициализация приложения после загрузки DOM
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initResizablePanels();
  initDebouncedDiagram();
  initRestrictedInput();
  loadSavedEquations();
  updateDiagram();
  updateParseInfo();
});

// ------------------------------------------------------------------
// Навешивает обработчики кликов на пункты навигации сайдбара.
// Каждый пункт переключает свою секцию в области контента.
// ------------------------------------------------------------------
function initNavigation() {
  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => switchSection(button.dataset.section));
  });
}

// ------------------------------------------------------------------
// Автообновление диаграммы при вводе текста уравнения.
// Используем «дебаунс» (задержку): перерисовываем не на каждый
// введённый символ, а через 400 мс после остановки набора — так
// интерфейс не тормозит и диаграмма всегда актуальна.
// ------------------------------------------------------------------
function initDebouncedDiagram() {
  const input = document.getElementById("equation-input");
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      updateDiagram();
      updateParseInfo();
    }, 400);
  });
}

// ------------------------------------------------------------------
// Ограничение физического ввода символами виртуальной клавиатуры.
// Три уровня защиты:
//   1. keydown — блокируем сам набор недопустимого символа;
//   2. paste   — вставку из буфера очищаем и конвертируем алиасы
//                параметров (beta → β);
//   3. input   — страховка: убираем недопустимые символы из любых
//                изменений (IME, drag-and-drop и т.п.).
// ------------------------------------------------------------------
function initRestrictedInput() {
  const editor = document.getElementById("equation-input");

  // Уровень 1: блокировка нажатий клавиш
  editor.addEventListener("keydown", (e) => {
    // Сочетания с Ctrl/Cmd/Alt (копировать, вставить, выделить всё) — разрешаем
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Управляющие клавиши (Backspace, Enter, стрелки...) имеют длинный e.key
    if (e.key.length !== 1) return;
    // Обычный печатный символ: пропускаем только разрешённые
    if (!ALLOWED_INPUT_CHARS.has(e.key)) {
      e.preventDefault();
    }
  });

  // Уровень 2: вставка из буфера обмена
  editor.addEventListener("paste", (e) => {
    e.preventDefault();
    const data = e.clipboardData || window.clipboardData;
    const raw = (data && data.getData("text/plain")) || "";
    const cleaned = filterText(raw);
    if (!cleaned) return;

    // Вставляем построчно, чтобы переносы строк сохранялись
    const lines = cleaned.split("\n");
    lines.forEach((line, index) => {
      if (index > 0) document.execCommand("insertText", false, "\n");
      document.execCommand("insertText", false, line);
    });
    updateDiagram();
  });

  // Уровень 3: страховочная очистка после любых изменений
  editor.addEventListener("input", () => cleanTextNodes());
}

// ------------------------------------------------------------------
// Приводит текст к «человекочитаемому» виду:
//   1) заменяет латинские имена параметров на греческие (beta → β);
//   2) удаляет все символы, которых нет на виртуальной клавиатуре.
// Переводы строк сохраняются, чтобы можно было вставить целую систему.
// ------------------------------------------------------------------
function filterText(text) {
  let result = text;
  for (const [name, symbol] of Object.entries(GREEK_ALIASES)) {
    result = result.replace(new RegExp(`\\b${name}\\b`, "gi"), symbol);
  }
  return Array.from(result)
    .map((ch) => (ch === "\n" || ALLOWED_INPUT_CHARS.has(ch) ? ch : ""))
    .join("");
}

// ------------------------------------------------------------------
// Страховочная очистка уже введённого текста: обходим все текстовые
// узлы редактора и очищаем их. Дроби (элементы contenteditable=false)
// пропускаем — их содержимое создаёт сама клавиатура.
// ------------------------------------------------------------------
function cleanTextNodes() {
  const editor = document.getElementById("equation-input");
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Пропускаем текст внутри дробей виртуальной клавиатуры
      let parent = node.parentElement;
      while (parent && parent !== editor) {
        if (parent.getAttribute && parent.getAttribute("contenteditable") === "false") {
          return NodeFilter.FILTER_REJECT;
        }
        parent = parent.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    const cleaned = filterText(node.data);
    if (cleaned !== node.data) node.data = cleaned;
  });
}

// ------------------------------------------------------------------
// Текстовое представление одного узла редактора.
// Дроби (d□/dt, ∂□/∂t) превращаются в строку вида "dS/dt", чтобы
// при сохранении они не «разваливались» на две строки (innerText
// дал бы "dS↵dt").
// ------------------------------------------------------------------
function serializeNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.data;

  if (node.nodeType === Node.ELEMENT_NODE) {
    // Дробь, вставленная виртуальной клавиатурой
    if (node.getAttribute && node.getAttribute("contenteditable") === "false") {
      const spans = node.querySelectorAll("span");
      const numerator = spans[0] ? spans[0].textContent : "";
      const denominator = spans[2] ? spans[2].textContent : "";
      return `${numerator}/${denominator}`;
    }
    // Обычный элемент: разворачиваем содержимое рекурсивно
    return Array.from(node.childNodes)
      .map(serializeNode)
      .join("");
  }
  return "";
}

// ------------------------------------------------------------------
// Полный «сырой» текст системы ОДУ из редактора.
// Каждая строка уравнения становится отдельной строкой текста,
// дроби — компактным видом dS/dt. Этот текст сохраняется на сервер
// и будет разбираться парсером (этап 1).
// ------------------------------------------------------------------
function serializeEquation() {
  const editor = document.getElementById("equation-input");
  const lines = [];
  let current = "";

  // Завершаем текущую строку и помещаем её в результат
  const flush = () => {
    lines.push(current);
    current = "";
  };

  // Добавляем текст в текущую строку. Перенос строки \n внутри
  // текстового узла (мусор от отступов шаблона вставки дроби или
  // случайная вставка) трактуем как перевод строки — чтобы дробь
  // dS/dt не «склеивалась» с остальным текстом первой строки.
  const appendText = (text) => {
    const parts = text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) flush();
      current += part;
    });
  };

  editor.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node.tagName || "").toLowerCase();

      if (tag === "div" || tag === "p") {
        // Блочный элемент — это отдельная строка системы (после Enter).
        // Завершаем текущую строку и начинаем новую содержимым блока.
        flush();
        current = serializeNode(node);
      } else if (tag === "br") {
        // Явный перенос строки
        flush();
      } else {
        // Инлайн-содержимое (текст и дроби dS/dt) — одна строка,
        // переносы между узлами НЕ добавляем
        appendText(serializeNode(node));
      }
    } else {
      appendText(serializeNode(node));
    }
  });

  flush();

  // Убираем пустые строки в начале и в конце (внутри — сохраняем)
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();

  return mergeBrokenDerivativeLines(lines).join("\n");
}

// ------------------------------------------------------------------
// Склейка строк, разорванных дробью производной.
// Иногда браузер размещает вставленную дробь dS/dt НЕ внутри блока
// строки, а рядом с ним (может даже через пустую строку): тогда
// дробь оказывается отдельной строкой без «=», а продолжение
// уравнения («= ...») — следующей строкой ниже.
// Правило: если строка — «голая» левая часть вида dS/dt, ∂X/∂t или
// S' (без «=»), а ближайшая непустая строка ниже начинается с «=»,
// объединяем их в одно уравнение (пустые строки между ними — это
// «мусор» от удаления текста, их пропускаем).
// ------------------------------------------------------------------
function mergeBrokenDerivativeLines(lines) {
  // Шаблон «голой» левой части без «=»: dS/dt, ∂X/∂t, S'
  // (пробелы вокруг допускаются — в текстовых узлах могут остаться пробелы)
  const LHS_ONLY =
    /^\s*(?:[\p{L}_][\p{L}\p{N}_]*'|[d∂]\s*[\p{L}_][\p{L}\p{N}_]*\s*\/\s*[d∂]\s*[\p{L}_][\p{L}\p{N}_]*)\s*$/u;

  const merged = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.indexOf("=") === -1 && LHS_ONLY.test(line)) {
      // Ищем ближайший непустой фрагмент ниже
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      const continuation = lines[j];
      if (continuation !== undefined && continuation.trim().startsWith("=")) {
        merged.push(line + continuation.trim());
        i = j; // продолжение уже «склеено», пропускаем его
        continue;
      }
    }

    merged.push(line);
  }
  return merged;
}

// ------------------------------------------------------------------
// Показывает результат разбора системы парсером (этап 1) под полем
// ввода: компартменты, параметры и потоки. При ошибке — красным
// цветом само сообщение разбора, чтобы пользователь сразу видел,
// что стоит поправить.
// ------------------------------------------------------------------
function updateParseInfo() {
  const info = document.getElementById("parse-info");
  if (!info) return;

  const text = serializeEquation();
  const baseClass = "text-[11px] mb-3 min-h-[16px]";

  if (!text) {
    info.textContent = "Парсер разберёт систему, как только вы введёте уравнения";
    info.className = `${baseClass} text-slate-500`;
    return;
  }

  const parsed = parseOdeSystemSafe(text);
  if (!parsed.ok) {
    // Если в тексте остался плейсхолдер □ — подсказываем, как исправить
    const hint = text.includes("□")
      ? "Выделите переменную (S, I, R) и нажмите кнопку производной ещё раз. "
      : "";
    info.textContent = hint + "Не разобрано: " + parsed.error;
    info.className = `${baseClass} text-rose-400`;
    return;
  }

  const s = parsed.structure;
  const parts = [`Компартменты: ${s.compartments.map((c) => c.name).join(", ")}`];
  if (s.parameters.length) parts.push(`Параметры: ${s.parameters.join(", ")}`);
  const transfers = s.flows.filter((f) => f.to);
  const losses = s.flows.filter((f) => !f.to);
  if (transfers.length)
    parts.push(`Потоки: ${transfers.map((f) => `${f.from} → ${f.to} (${f.label})`).join(", ")}`);
  if (losses.length)
    parts.push(`Потери: ${losses.map((f) => `${f.from} (${f.label})`).join(", ")}`);
  // «Движители» потоков (например, I в β*S*I/N): они задают скорость
  // перехода, но люди переходят из источника в цель
  const drivers = transfers.flatMap((f) => f.drivers || []);
  if (drivers.length)
    parts.push(`Влияет: ${[...new Set(drivers)].join(", ")}`);

  info.textContent = parts.join(" · ");
  info.className = `${baseClass} text-emerald-400`;
}

// Изменяемые панели (редактор ↔ диаграмма)
function initResizablePanels() {
  const divider = document.getElementById("divider");
  const leftPanel = document.getElementById("left-panel");
  const rightPanel = document.getElementById("right-panel");

  let isResizing = false;

  // Начало перетаскивания разделителя
  divider.addEventListener("mousedown", (e) => {
    isResizing = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  // Во время движения мыши пересчитываем ширину левой панели
  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;

    const containerWidth = document.querySelector("main").offsetWidth;
    const leftWidth = e.clientX - leftPanel.getBoundingClientRect().left;
    const rightWidth = containerWidth - leftWidth - 16;

    // Защита от схлопывания панелей в ноль
    if (leftWidth > 260 && rightWidth > 320) {
      leftPanel.style.width = leftWidth + "px";
      updateDiagram(); // перерисовываем холст под новый размер
    }
  });

  // Окончание перетаскивания
  document.addEventListener("mouseup", () => {
    isResizing = false;
    document.body.style.cursor = "default";
    document.body.style.userSelect = "";
  });

  // При изменении размера окна диаграмма должна перерисоваться
  window.addEventListener("resize", () => updateDiagram());
}