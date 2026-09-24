// ============================================================
// diagram.js — авто-блок-схема компартментной модели (этап 2)
// ============================================================
// Блок-схема строится по структуре, которую даёт парсер ОДУ
// (client/js/parser.js): компартменты — из левых частей
// уравнений, потоки между ними — из положительных слагаемых
// правых частей (inferFlows). Схема универсальна: SIR, SEIR
// и любые другие компартментные модели.
// Перерисовка на каждый ввод (дебаунс в main.js) + кнопка
// «Построить».

// Тематический цвет блока для известных компартментов
// (для остальных берётся цвет из палитры COMPARTMENT_PALETTE)
const COMPARTMENT_THEME = {
  S: "#10b981", // восприимчивые — зелёный
  E: "#f59e0b", // инкубационный период — янтарный
  I: "#f43f5e", // инфицированные — розовый
  R: "#0ea5e9", // выздоровевшие — голубой
  D: "#64748b", // умершие — серый
};

// Подпись под символом для известных компартментов
const COMPARTMENT_SUBLABEL = {
  S: "Susceptible",
  E: "Exposed",
  I: "Infected",
  R: "Recovered",
  D: "Deceased",
};

// Дополнительные цвета для произвольных компартментов
const COMPARTMENT_PALETTE = [
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#22c55e",
  "#eab308",
  "#06b6d4",
];

// ------------------------------------------------------------------
// Цвет блока для компартмента: тематический, если имя известно,
// иначе — по порядковому номеру из палитры.
// ------------------------------------------------------------------
function compartmentColor(name, index) {
  if (COMPARTMENT_THEME[name]) return COMPARTMENT_THEME[name];
  return COMPARTMENT_PALETTE[index % COMPARTMENT_PALETTE.length];
}

// ------------------------------------------------------------------
// Перенаправления потоков, заданные вручную (fallback этапа 2 —
// упрощённый вариант, до полноценной редактируемой таблицы потоков).
// Правило применяется к потоку, если совпали и источник, и подпись,
// — тогда целевой компартмент заменяется на указанный.
// По умолчанию список пуст: потоки рисуются так, как выведены из
// уравнений. (Раньше здесь была правка S → I для SEIR — она
// неверна: β*S*I/N входит в dE/dt, т.е. люди переходят S → E,
// а роль I — скорость заражения. Она показывается пунктирной
// дугой влияния от I к стрелке, см. drawInfectionEdges.)
// ------------------------------------------------------------------
const FLOW_REDIRECTS = [];

// Применяет пользовательские перенаправления к списку потоков.
// Потоки без подходящего правила возвращаются без изменений.
// rules можно передать для тестов; по умолчанию — FLOW_REDIRECTS.
function redirectFlows(flows, rules = FLOW_REDIRECTS) {
  return flows.map((f) => {
    const rule = rules.find((r) => r.from === f.from && r.label === f.label);
    return rule ? { ...f, to: rule.to } : f;
  });
}

// ------------------------------------------------------------------
// Упорядочивает компартменты для размещения слева направо так,
// чтобы потоки вели в правильном направлении: топологическая
// сортировка (алгоритм Кана) по графу потоков from → to.
// Узлы без потоков и узлы из циклов добавляются в конец в исходном
// порядке ввода — схема не «ломается» на любой системе.
// ------------------------------------------------------------------
function orderCompartments(names, flows) {
  const indeg = new Map(names.map((n) => [n, 0]));
  const adjacency = new Map(names.map((n) => [n, []]));

  flows.forEach((f) => {
    if (!indeg.has(f.from) || !indeg.has(f.to) || f.from === f.to) return;
    adjacency.get(f.from).push(f.to);
    indeg.set(f.to, indeg.get(f.to) + 1);
  });

  // Очередь Кана: узлы без входящих потоков
  const queue = names.filter((n) => indeg.get(n) === 0);
  const result = [];
  const placed = new Set();

  while (queue.length) {
    const node = queue.shift();
    if (placed.has(node)) continue;
    placed.add(node);
    result.push(node);

    adjacency.get(node).forEach((next) => {
      indeg.set(next, indeg.get(next) - 1);
      if (indeg.get(next) === 0 && !placed.has(next)) queue.push(next);
    });
  }

  // Неразмещённые (циклы, изолированные) — в конец в порядке ввода
  names.forEach((n) => {
    if (!placed.has(n)) result.push(n);
  });

  return result;
}

// ------------------------------------------------------------------
// Считает центры блоков компартментов на холсте.
// order — уже упорядоченный список имён; для 1–6 компартментов —
// одна строка, для большего числа — сетка (квадрат корня из n).
// Возвращает объект { имя: { x, y, size } }.
// ------------------------------------------------------------------
function layoutBoxes(order, width, height) {
  const n = order.length;
  const perRow = n <= 6 ? n : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / perRow);

  // Сторона блока: подстраивается под шаг сетки, но не меньше 44
  const boxSize = Math.max(
    44,
    Math.min(84, Math.min((width - 40) / (perRow + 1), (height - 60) / (rows + 1)) * 0.8),
  );

  const boxes = {};
  order.forEach((name, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    // Последняя строка может быть короче — центрируем её отдельно
    const rowCount = row === rows - 1 ? n - row * perRow : perRow;
    boxes[name] = {
      x: ((col + 1) * width) / (rowCount + 1),
      y: ((row + 1) * height) / (rows + 1),
      size: boxSize,
    };
  });
  return boxes;
}

// ------------------------------------------------------------------
// Обновляет блок-схему на canvas по результату разбора парсера.
// Дополнительно обновляет подпись панели (список компартментов)
// и строку с потоками под холстом.
// ------------------------------------------------------------------
function updateDiagram() {
  // Текст системы сериализуем, чтобы дроби dS/dt не «разбивались»
  const equationText = serializeEquation();
  const canvas = document.getElementById("diagram-canvas");

  // Безопасный размер: если холст ещё не размещён (offsetWidth = 0),
  // берём запасные размеры, чтобы ничего не «схлопнулось».
  const width = canvas.offsetWidth || 600;
  const height = canvas.offsetHeight || 400;
  // Учитываем плотность пикселей экрана (devicePixelRatio): без этого
  // на масштабе 125–200% текст и линии выглядят размытыми. Физический
  // размер — в физических px, отрисовка — в CSS-px через setTransform.
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Фон холста — тёмный градиент в тон интерфейса
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0e1730");
  bg.addColorStop(1, "#0a1122");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  updateDiagramCaptions(null, null);

  if (!equationText) {
    // Заглушка: подсказка, когда уравнений ещё нет
    drawMessage(ctx, width, height, "Введите систему уравнений — здесь появится блок-схема");
    return;
  }

  const parsed = parseOdeSystemSafe(equationText);
  if (!parsed.ok) {
    // Система не разобрана — показываем текст ошибки (как в ленте разбора)
    drawMessage(ctx, width, height, parsed.error, "#f43f5e");
    return;
  }

  const s = parsed.structure;
  if (s.compartments.length === 0) {
    drawMessage(ctx, width, height, "Компартменты не найдены");
    return;
  }

  // Подпись панели и строка потоков — по потокам с учётом
  // ручных перенаправлений (чтобы подпись совпадала с рисунком)
  const flows = redirectFlows(s.flows);
  updateDiagramCaptions(s.compartments.map((c) => c.name), flows);

  // Порядок блоков слева направо по потокам
  const order = orderCompartments(
    s.compartments.map((c) => c.name),
    flows,
  );
  const boxes = layoutBoxes(order, width, height);

  // Сначала стрелки (под блоками — чтобы не перекрывали края),
  // затем сами блоки
  flows.forEach((f) => {
    if (boxes[f.from]) {
      if (boxes[f.to]) {
        drawFlow(ctx, boxes[f.from], boxes[f.to], f.label, boxes);
      } else {
        // Потеря «в никуда» (µ*S и т.п.) — стрелка вниз от блока.
        // Ограничиваем длину ближайшим блоком снизу, чтобы стрелка
        // не наезжала на следующий ряд схемы
        const src = boxes[f.from];
        let maxEndY = height - 26;
        for (const name in boxes) {
          const b = boxes[name];
          if (b !== src && b.y > src.y) {
            maxEndY = Math.min(maxEndY, b.y - b.size / 2 - 4);
          }
        }
        drawExitFlow(ctx, src, f.label, maxEndY, width, height);
      }
    }
  });

  // Пунктирные дуги «силы заражения»: от компартментов-«движителей»
  // (например, I в β*S*I/N) к стрелке потока. Люди переходят S → E,
  // а I лишь задаёт скорость перехода — показываем это отдельно.
  drawInfectionEdges(ctx, flows, boxes);

  order.forEach((name, index) => {
    drawBlock(ctx, boxes[name].x, boxes[name].y, name, compartmentColor(name, index), boxes[name].size);
  });

  // Строка параметров внизу слева
  if (s.parameters.length) {
    ctx.fillStyle = "#64748b";
    ctx.font = "11px Manrope, Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Параметры: " + s.parameters.join(", "), 14, height - 12);
  }
}

// ------------------------------------------------------------------
// Обновляет подпись панели (компартменты) и строку с потоками.
// names/flows — null, если разбора не было (сбрасываем в «—»).
// ------------------------------------------------------------------
function updateDiagramCaptions(names, flows) {
  const caption = document.getElementById("diagram-compartments");
  if (caption) {
    caption.textContent = names ? names.join(" · ") : "—";
  }
  const flowsLine = document.getElementById("diagram-flows");
  if (flowsLine) {
    if (!names) {
      flowsLine.textContent = "";
    } else if (!flows || flows.length === 0) {
      flowsLine.textContent = "Потоки между компартментами не найдены";
    } else {
      // Внутренние переходы и потери («в никуда») показываем отдельно
      const transfers = flows.filter((f) => f.to);
      const losses = flows.filter((f) => !f.to);
      const bits = [];
      if (transfers.length)
        bits.push(transfers.map((f) => `${f.from} → ${f.to} (${f.label})`).join(" · "));
      if (losses.length)
        bits.push(`Потери: ${losses.map((f) => `${f.from} (${f.label})`).join(" · ")}`);
      // «Движители» потоков (I в β*S*I/N) — их роль показывает пунктир
      const drivers = transfers.flatMap((f) => f.drivers || []);
      if (drivers.length)
        bits.push(`Влияет: ${[...new Set(drivers)].join(" · ")}`);
      flowsLine.textContent = "Потоки: " + bits.join(" · ");
    }
  }
}

// ------------------------------------------------------------------
// Центрированное сообщение на холсте (заглушка или ошибка разбора).
// ------------------------------------------------------------------
function drawMessage(ctx, width, height, text, color = "#64748b") {
  ctx.fillStyle = color;
  ctx.font = "14px Manrope, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const maxWidth = width - 40;

  // Переносим длинное сообщение по словам, чтобы оно не выходило за край
  const lines = [];
  let current = "";
  String(text)
    .split(/\s+/)
    .forEach((word) => {
      const candidate = current ? current + " " + word : word;
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    });
  if (current) lines.push(current);

  const startY = height / 2 - ((lines.length - 1) * 18) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, startY + i * 18);
  });
}

// ------------------------------------------------------------------
// Рисует один блок-компартмент: закруглённый квадрат с символом
// и подписью. x/y — центр блока, size — сторона.
// ------------------------------------------------------------------
function drawBlock(ctx, x, y, symbol, color, size) {
  const radius = 14;
  const half = size / 2;

  // Тень под блоком для объёма
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - half, y - half, size, size, radius);
  ctx.fill();
  ctx.restore();

  // Сам блок
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - half, y - half, size, size, radius);
  ctx.fill();

  // Символ компартмента
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(size * 0.32)}px Manrope, Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(symbol, x, y - size * 0.06);

  // Подпись под символом (для известных компартментов)
  const sublabel = COMPARTMENT_SUBLABEL[symbol];
  if (sublabel) {
    ctx.font = `${Math.max(9, Math.round(size * 0.13))}px Manrope, Arial`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(sublabel, x, y + size * 0.32);
  }
}

// ------------------------------------------------------------------
// Рисует поток-стрелку между двумя блоками с подписью формулы.
// Линия идёт от края блока-источника до края целевого блока.
// Если на пути (между ними по горизонтали, в том же ряду) есть
// другой блок — стрелка огибает его дугой СВЕРХУ (например,
// перенаправленный поток S → I, когда между ними стоит E).
// boxes — карта всех блоков { имя: {x, y, size} }, нужна для
// обнаружения препятствий.
// ------------------------------------------------------------------
function drawFlow(ctx, fromBox, toBox, label, boxes = null) {
  // Есть ли чужой блок по пути: центр между источниками, тот же ряд
  let bypass = false;
  if (boxes) {
    Object.values(boxes).forEach((b) => {
      if (b === fromBox || b === toBox) return;
      const between = (b.x - fromBox.x) * (b.x - toBox.x) < 0;
      const sameRow =
        Math.abs(b.y - fromBox.y) < fromBox.size * 0.75 &&
        Math.abs(b.y - toBox.y) < toBox.size * 0.75;
      if (between && sameRow) bypass = true;
    });
  }

  let startX, startY, endX, endY, ctrlX, ctrlY; // ctrl (NaN) — «прямая»
  if (bypass) {
    // Дуга над рядом: от верхнего края источника к верхнему краю цели
    startX = fromBox.x;
    startY = fromBox.y - fromBox.size / 2;
    endX = toBox.x;
    endY = toBox.y - toBox.size / 2;
    ctrlX = (startX + endX) / 2;
    ctrlY = Math.min(startY, endY) - Math.max(fromBox.size, toBox.size) * 0.75;
  } else {
    const dx = toBox.x - fromBox.x;
    const dy = toBox.y - fromBox.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return; // самопетлю не рисуем (парсер их не выдаёт)

    startX = fromBox.x + (dx / dist) * (fromBox.size / 2);
    startY = fromBox.y + (dy / dist) * (fromBox.size / 2);
    endX = toBox.x - (dx / dist) * (toBox.size / 2);
    endY = toBox.y - (dy / dist) * (toBox.size / 2);

    if (dy === 0 && dx > 0) {
      // Соседние блоки на одной строке — прямая линия
      ctrlX = NaN;
    } else {
      // Иначе — чуть приподнимаем дугу, чтобы не сливались встречные
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      ctrlX = midX;
      ctrlY = midY - Math.min(40, dist * 0.22);
    }
  }

  // Линия (прямая или квадратичная дуга)
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  if (Number.isNaN(ctrlX)) {
    ctx.lineTo(endX, endY);
  } else {
    ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
  }
  ctx.stroke();

  // Наконечник стрелки — по касательной в конечной точке дуги
  const angle = Number.isNaN(ctrlX)
    ? Math.atan2(endY - startY, endX - startX)
    : Math.atan2(endY - ctrlY, endX - ctrlX);
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - 12 * Math.cos(angle - Math.PI / 6), endY - 12 * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(endX - 12 * Math.cos(angle + Math.PI / 6), endY - 12 * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fillStyle = "#94a3b8";
  ctx.fill();

  // Подпись формулы потока над серединой линии
  let labelX, labelY;
  if (Number.isNaN(ctrlX)) {
    labelX = (startX + endX) / 2;
    labelY = (startY + endY) / 2 - 14;
  } else {
    // Середина квадратичной Безье: (P0 + 2*P1 + P2) / 4
    labelX = (startX + 2 * ctrlX + endX) / 4;
    labelY = (startY + 2 * ctrlY + endY) / 4 - 12;
  }
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "12px Manrope, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label || "?", labelX, labelY);
}

// ------------------------------------------------------------------
// «Сила заражения»: пунктирная дуга от компартмента-«движителя»
// к источнику потока. В SEIR слагаемое β*S*I/N означает: люди
// переходят S → E (сплошная стрелка), а скорость перехода
// пропорциональна I. Поэтому от блока I над рядом рисуется
// пунктирная дуга к стрелке — «инфицированные ускоряют заражение».
// Наконечник не ставится: это влияние, а не перенос людей.
// ------------------------------------------------------------------
function drawInfectionEdges(ctx, flows, boxes) {
  flows.forEach((f) => {
    const drivers = f.drivers || [];
    if (!drivers.length || !f.to) return;
    const fb = boxes[f.from];
    if (!fb) return;

    drivers.forEach((name) => {
      const db = boxes[name];
      if (!db) return;
      // Дуга над рядом: от верхнего края «движителя» к верхнему
      // краю источника потока
      const startX = db.x;
      const startY = db.y - db.size / 2;
      const endX = fb.x;
      const endY = fb.y - fb.size / 2;
      const ctrlX = (startX + endX) / 2;
      const ctrlY = Math.min(startY, endY) - Math.max(db.size, fb.size) * 0.7;

      // Янтарный пунктир — «влияние», визуально отличное от потоков
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Точка у источника — конец дуги без стрелки
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(endX, endY, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

// ------------------------------------------------------------------
// Рисует поток-потерю «в никуда» (например, смертность µ*S):
// стрелка вниз от нижнего края блока, без целевого компартмента.
// Подпись (µ) — крупная, светлая, на непрозрачной подложке в точный
// цвет холста в этой точке: «таблетка» невидима на фоне, но гасит
// проходящие сквозь неё линии. maxEndY — верхняя граница, до которой
// можно тянуть стрелку (ближайший блок ниже), чтобы она не наезжала
// на следующий ряд схемы. width/height — CSS-размеры холста (для
// расчёта цвета позиции фона).
// ------------------------------------------------------------------
function drawExitFlow(ctx, box, label, maxEndY, width, height) {
  const x = box.x;
  const yStart = box.y + box.size / 2;
  // Чуть более длинная стрелка (0.7 стороны блока), но не дальше
  // ближайшего блока под строкой и не короче самой стрелки с наконечником
  const yEnd = Math.max(
    yStart + 32,
    Math.min(yStart + box.size * 0.7, maxEndY !== undefined ? maxEndY : Infinity),
  );

  // Штриховая линия вниз от блока
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x, yStart);
  ctx.lineTo(x, yEnd);
  ctx.stroke();
  ctx.setLineDash([]);

  // Наконечник стрелки вниз
  ctx.fillStyle = "#94a3b8";
  ctx.beginPath();
  ctx.moveTo(x, yEnd);
  ctx.lineTo(x - 6, yEnd - 10);
  ctx.lineTo(x + 6, yEnd - 10);
  ctx.closePath();
  ctx.fill();

  // Подпись над стрелкой: жирный греческий символ на «слепой» подложке
  const text = label || "µ";
  ctx.font = "bold 17px Manrope, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const textWidth = ctx.measureText(text).width;
  const labelY = yStart + 24;

  // Непрозрачная «таблетка» в цвет холста. Фон — диагональный градиент
  // (0,0)→(width,height) от #0e1730 до #0a1122; повторяем его формулу,
  // чтобы заливка идеально совпала с канвой позади подписи.
  const denom = width * width + height * height;
  const t = Math.max(0, Math.min(1, (x * width + labelY * height) / (denom || 1)));
  const from = [14, 23, 48]; // #0e1730 — верхний угол градиента
  const to = [10, 17, 34]; // #0a1122 — нижний угол градиента
  const rgb = from.map((v, i) => Math.round(v + (to[i] - v) * t));
  const pillW = textWidth + 16;
  const pillH = 24;
  ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  ctx.beginPath();
  ctx.roundRect(x - pillW / 2, labelY - 14, pillW, pillH, 7);
  ctx.fill();

  ctx.fillStyle = "#f1f5f9";
  ctx.fillText(text, x, labelY);
}

// Экспорт для тестов (node --test) — в браузере module не определён
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    orderCompartments,
    layoutBoxes,
    compartmentColor,
    redirectFlows,
  };
}