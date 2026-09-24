// ============================================================
// simulate.js — этап 4: численное интегрирование (РК4) и графики
// ============================================================
// Симуляция работает прямо в браузере, без сервера. Правые части
// ОДУ берутся из структуры парсера (AST), значения вычисляются
// через evaluateExpression. Метод — Рунге–Кутты 4-го порядка
// с фиксированным шагом dt. Слайдеры параметров, начальных условий
// и горизонта пересчитывают график на каждый ввод (с дебаунсом),
// чтобы анимация при «перетаскивании» ползунка была плавной.

// Шаг интегрирования (в днях): мелкий шаг даёт гладкие кривые
const SIM_DT = 0.05;

// Начальная «популяция», если в модели нет параметра N
const DEFAULT_POPULATION = 10000;

// ------------------------------------------------------------------
// Предустановки ползунков для типовых параметров: диапазон и шаг.
// Для неизвестных берётся GENERIC_PARAM_PRESET.
// ------------------------------------------------------------------
const PARAM_PRESETS = {
  "β": { value: 0.5, min: 0, max: 2, step: 0.01 },
  "γ": { value: 0.2, min: 0, max: 1, step: 0.01 },
  "σ": { value: 0.3, min: 0, max: 1, step: 0.01 },
  "μ": { value: 0.02, min: 0, max: 0.5, step: 0.001 },
  "α": { value: 0.1, min: 0, max: 1, step: 0.01 },
  "δ": { value: 0.1, min: 0, max: 1, step: 0.01 },
  "ε": { value: 0.1, min: 0, max: 1, step: 0.01 },
  "λ": { value: 0.1, min: 0, max: 1, step: 0.01 },
  "N": { value: DEFAULT_POPULATION, min: 1000, max: 100000, step: 500 },
  "n": { value: DEFAULT_POPULATION, min: 1000, max: 100000, step: 500 },
};
const GENERIC_PARAM_PRESET = { value: 0.1, min: 0, max: 1, step: 0.01 };

// Текущее состояние панели симуляции
const simState = {
  modelKey: "",        // ключ модели (параметры+компартменты) — для перестройки панели
  values: {},          // сохранённые значения слайдеров по ключу «p:β», «i:S», «T»
};

// Таймер дебаунса перерисовки (чтобы не считать на каждый кадр мыши)
let simRenderTimer = null;

// ------------------------------------------------------------------
// Красивое форматирование числа для подписи слайдера: большие —
// с разделителями, малые — с нужным количеством знаков.
// ------------------------------------------------------------------
function fmtValue(v) {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1000) return Math.round(v).toLocaleString("ru-RU");
  if (abs >= 100) return String(Math.round(v));
  if (abs >= 1) return String(Math.round(v * 100) / 100);
  return String(Math.round(v * 1000) / 1000);
}

// ------------------------------------------------------------------
// «Красивый» максимум оси Y: округляет вверх к 1/2/5 × 10^k,
// чтобы шкала графика была читаемой (nice numbers).
// ------------------------------------------------------------------
function niceMax(v) {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

// ------------------------------------------------------------------
// Производная системы: функция (y, t) → массив правых частей.
// Правые части — AST из парсера, вычисляются через evaluateExpression
// (передаётся evalFn; в браузере берётся глобальная функция парсера).
// vars для вычисления: компартменты (y), параметры (params), время t.
// ------------------------------------------------------------------
function makeDerivative(names, rhsAsts, params, evalFn) {
  const run = evalFn || evaluateExpression;
  return (y, t) => {
    const vars = { t };
    names.forEach((name, i) => {
      vars[name] = y[i];
    });
    for (const key in params) vars[key] = params[key];
    return names.map((name, i) => run(rhsAsts[i], vars));
  };
}

// ------------------------------------------------------------------
// Численное интегрирование методом Рунге–Кутты 4-го порядка.
// deriv — функция (y, t) → массив производных; y0 — начальный вектор.
// Возвращает { time: [...моменты], series: [компартмент][шаг] }.
// При расходимости бросает ошибку с понятным сообщением.
// ------------------------------------------------------------------
function rk4Integrate(deriv, y0, tMax, dt) {
  const steps = Math.max(1, Math.round(tMax / dt));
  const time = [0];
  const rows = [y0.slice()];
  let y = y0.slice();

  for (let s = 0; s < steps; s++) {
    const t = s * dt;
    const k1 = deriv(y, t);
    const k2 = deriv(y.map((v, i) => v + 0.5 * dt * k1[i]), t + 0.5 * dt);
    const k3 = deriv(y.map((v, i) => v + 0.5 * dt * k2[i]), t + 0.5 * dt);
    const k4 = deriv(y.map((v, i) => v + dt * k3[i]), t + dt);
    y = y.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));

    // Защита от расходимости: нечисловые или гигантские значения
    if (!y.every(Number.isFinite) || y.some((v) => Math.abs(v) > 1e15)) {
      throw new Error("Решение расходится — уменьшите параметры или проверьте модель");
    }

    time.push((s + 1) * dt);
    rows.push(y.slice());
  }

  // Транспонируем: series[c][шаг] = значение компартмента c на шаге
  const series = y0.map((_, c) => rows.map((row) => row[c]));
  return { time, series };
}

// ------------------------------------------------------------------
// Начальное условие «по умолчанию» для типового компартмента:
// почти все в S, небольшая заражённая зачинка в I, остальные нули.
// ------------------------------------------------------------------
function defaultInitial(name, population) {
  switch (name) {
    case "S":
      return Math.round(population * 0.99);
    case "I":
      return Math.round(population * 0.01);
    default:
      return 0;
  }
}

// ------------------------------------------------------------------
// Создаёт строку слайдера и добавляет её в контейнер.
// При любом движении пересчитывает подпись, вызывает onInput
// (если задан) и планирует перерисовку графика (дебаунс).
// ------------------------------------------------------------------
function addSliderRow(container, opts) {
  const row = document.createElement("div");
  row.className = "sim-slider";

  const head = document.createElement("div");
  head.className = "flex items-center justify-between gap-2 mb-1";

  const title = document.createElement("span");
  title.className = "text-xs font-semibold text-slate-300";
  title.textContent = opts.label;

  const val = document.createElement("span");
  val.className = "sim-val text-xs text-emerald-300 tabular-nums";

  const input = document.createElement("input");
  input.type = "range";
  input.className = "sim-range";
  input.min = opts.min;
  input.max = opts.max;
  input.step = opts.step;
  input.value = Math.min(Math.max(opts.value, opts.min), opts.max);
  input.dataset.simKey = opts.key;

  const show = () => {
    val.textContent = fmtValue(+input.value);
  };
  show();

  input.addEventListener("input", () => {
    show();
    if (opts.onInput) opts.onInput(input);
    scheduleSimulationRender();
  });

  head.appendChild(title);
  head.appendChild(val);
  row.appendChild(head);
  row.appendChild(input);
  container.appendChild(row);
  return input;
}

// ------------------------------------------------------------------
// Перестраивает панель слайдеров по структуре модели: по одному
// ползунку на параметр, на компартмент (начальные условия) и один
// на горизонт времени. Старые значения сохраняются в simState.values
// и восстанавливаются — при правке модели они не «слетают».
// ------------------------------------------------------------------
function buildSimulationPanel(structure) {
  const paramsBox = document.getElementById("sim-params");
  const initialBox = document.getElementById("sim-initial");
  const horizonBox = document.getElementById("sim-horizon");
  if (!paramsBox || !initialBox || !horizonBox) return;

  paramsBox.innerHTML = "";
  initialBox.innerHTML = "";
  horizonBox.innerHTML = "";

  // Параметры модели: диапазон из пресета (или общий), значение — с прошлого раза
  structure.parameters.forEach((name) => {
    const preset = PARAM_PRESETS[name] || GENERIC_PARAM_PRESET;
    const prev = simState.values["p:" + name];
    const input = addSliderRow(paramsBox, {
      key: "p:" + name,
      label: name,
      min: preset.min,
      max: preset.max,
      step: preset.step,
      value: prev !== undefined ? prev : preset.value,
    });

    // «Население» N — главный ползунок: при его изменении начальные
    // условия масштабируются пропорционально, чтобы сумма не «уезжала»
    // от N (актуально для SIR/SEIR-моделей с параметром N).
    if (name === "N" || name === "n") {
      input.addEventListener("input", () => scaleInitialConditions(input));
    }
  });

  // Начальные условия: диапазон 0..N, по умолчанию S ≈ 99%, I ≈ 1%
  const pop =
    simState.values["p:N"] !== undefined
      ? simState.values["p:N"]
      : (PARAM_PRESETS["N"] && PARAM_PRESETS["N"].value) || DEFAULT_POPULATION;
  structure.compartments.forEach((comp) => {
    const prev = simState.values["i:" + comp.name];
    addSliderRow(initialBox, {
      key: "i:" + comp.name,
      label: comp.name + "₀",
      min: 0,
      max: pop,
      step: pop > 1000 ? 1 : 0.1,
      value: prev !== undefined ? prev : defaultInitial(comp.name, pop),
    });
  });

  // Горизонт моделирования (дни)
  const prevT = simState.values["T"];
  addSliderRow(horizonBox, {
    key: "T",
    label: "Время, дни",
    min: 1,
    max: 300,
    step: 1,
    value: prevT !== undefined ? prevT : 100,
  });
}

// ------------------------------------------------------------------
// Масштабирует начальные условия при изменении «населения» N.
// Доли компартментов сохраняются, сумма остаётся примерно равна N.
// ------------------------------------------------------------------
function scaleInitialConditions(nInput) {
  const newN = +nInput.value;
  const oldN = simState.values["p:N"] !== undefined ? simState.values["p:N"] : newN;
  if (oldN === newN || newN <= 0) return;

  document.querySelectorAll('#sim-initial input[data-sim-key^="i:"]').forEach((el) => {
    el.max = newN;
    el.value = Math.round((+el.value * newN) / oldN);
    const val = el.closest(".sim-slider") && el.closest(".sim-slider").querySelector(".sim-val");
    if (val) val.textContent = fmtValue(+el.value);
  });

  simState.values["p:N"] = newN;
}

// ------------------------------------------------------------------
// Читает текущие значения всех слайдеров в simState.values.
// ------------------------------------------------------------------
function readSimulationValues() {
  document.querySelectorAll("[data-sim-key]").forEach((input) => {
    simState.values[input.dataset.simKey] = +input.value;
  });
  return simState.values;
}

// ------------------------------------------------------------------
// Планирует перерисовку графика после паузы (дебаунс 80 мс).
// ------------------------------------------------------------------
function scheduleSimulationRender() {
  clearTimeout(simRenderTimer);
  simRenderTimer = setTimeout(() => renderSimulation(), 80);
}

// ------------------------------------------------------------------
// Готовит холст к отрисовке с учётом плотности пикселей экрана
// (devicePixelRatio): на масштабе 125–200% без этого текст на canvas
// выглядит «пиксельным и мыльным». Физический размер холста — в
// физических пикселях (offset * dpr), а вся отрисовка ведётся в
// CSS-пикселях как раньше — благодаря ctx.setTransform масштабируется.
// Возвращает CSS-размеры { width, height } для рисования.
// ------------------------------------------------------------------
function prepareSimulationCanvas(canvas) {
  const dpr = (window.devicePixelRatio || 1);
  const width = canvas.offsetWidth || 640;
  const height = canvas.offsetHeight || 420;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height };
}

// ------------------------------------------------------------------
// Главный вход: разбирает текущую модель, при необходимости
// перестраивает панель слайдеров и перерисовывает график.
// Вызывается при открытии вкладки «Симуляция» и после правки модели.
// ------------------------------------------------------------------
function refreshSimulation() {
  const canvas = document.getElementById("simulation-canvas");
  if (!canvas) return;

  // Размер холста (с учётом DPR) — нужен и для сообщений-подсказок
  const { width, height } = prepareSimulationCanvas(canvas);

  const text = serializeEquation();
  const parsed = parseOdeSystemSafe(text);

  if (!parsed.ok) {
    drawSimulationMessage(
      canvas,
      text
        ? "Не разобрано: " + parsed.error
        : "Введите систему уравнений в разделе «Модель» — здесь появятся графики",
      "#cbd5e1",
      width,
      height,
    );
    const stats = document.getElementById("sim-stats");
    if (stats) stats.textContent = "";
    const legend = document.getElementById("sim-legend");
    if (legend) legend.innerHTML = "";
    return;
  }

  const s = parsed.structure;
  // Ключ модели: параметры + компартменты. Изменился — перестраиваем ползунки.
  const key = s.parameters.join(",") + "|" + s.compartments.map((c) => c.name).join(",");
  if (key !== simState.modelKey) {
    simState.modelKey = key;
    buildSimulationPanel(s);
  }

  renderSimulation();
}

// ------------------------------------------------------------------
// Интегрирует текущую модель с текущими значениями слайдеров
// и рисует графики. Сердце модуля: вызывается на каждый ввод.
// ------------------------------------------------------------------
function renderSimulation() {
  const canvas = document.getElementById("simulation-canvas");
  if (!canvas) return;

  const values = readSimulationValues();
  const parsed = parseOdeSystemSafe(serializeEquation());
  if (!parsed.ok) {
    refreshSimulation();
    return;
  }

  const s = parsed.structure;
  const names = s.compartments.map((c) => c.name);
  const rhsAsts = s.compartments.map((c) => c.rhs);

  // Параметры: подтягиваем значения из слайдеров (пропущенные — из пресета)
  const params = {};
  s.parameters.forEach((name) => {
    const preset = PARAM_PRESETS[name] || GENERIC_PARAM_PRESET;
    params[name] = values["p:" + name] !== undefined ? values["p:" + name] : preset.value;
  });

  const initial = names.map((name) => values["i:" + name] || 0);
  const tMax = values["T"] || 100;

  // Физический размер холста под текущую панель с учётом DPR
  // (fallback — если секция скрыта). Вся отрисовка — в CSS-пикселях.
  const { width, height } = prepareSimulationCanvas(canvas);

  let result;
  try {
    const deriv = makeDerivative(names, rhsAsts, params);
    result = rk4Integrate(deriv, initial, tMax, SIM_DT);
  } catch (err) {
    drawSimulationMessage(canvas, "Расчёт прерван: " + err.message, "#f43f5e", width, height);
    return;
  }

  drawSimulationChart(canvas, result.time, result.series, names, width, height);
  updateSimulationStats(names, result.time, result.series, tMax);
}

// ------------------------------------------------------------------
// Подписи легенды и строка статистики под графиком: пик I, день
// пика, итог по выздоровевшим, параметры метода.
// ------------------------------------------------------------------
function updateSimulationStats(names, time, series, tMax) {
  const legend = document.getElementById("sim-legend");
  const stats = document.getElementById("sim-stats");
  if (!legend || !stats) return;

  legend.innerHTML = "";
  names.forEach((name, ci) => {
    const last = Math.max(0, series[ci][series[ci].length - 1]);
    const dot = document.createElement("span");
    dot.className = "inline-flex items-center gap-1.5 text-[11px] text-slate-300";
    dot.innerHTML =
      `<span class="inline-block w-2.5 h-2.5 rounded-full" style="background:${compartmentColor(name, ci)}"></span>` +
      `${name}: ${fmtValue(Math.round(last))}`;
    legend.appendChild(dot);
  });

  const bits = [];
  if (names.includes("I")) {
    const i = names.indexOf("I");
    let peak = 0;
    let day = time[0];
    series[i].forEach((v, idx) => {
      if (v > peak) {
        peak = v;
        day = time[idx];
      }
    });
    bits.push(`Пик I ≈ ${fmtValue(Math.round(Math.max(0, peak)))} на ${Math.round(day)}-й день`);
  }
  if (names.includes("R")) {
    const r = names.indexOf("R");
    bits.push(`Выздоровело ≈ ${fmtValue(Math.round(Math.max(0, series[r][series[r].length - 1])))}`);
  }
  bits.push(`РК4 · dt = ${SIM_DT} дня · шагов: ${series[0].length - 1} · горизонт ${Math.round(tMax)} дн.`);
  stats.textContent = bits.join(" · ");
}

// ------------------------------------------------------------------
// Рисует график динамики компартментов на холсте: сетка, оси,
// кривые по цветам тем блок-схемы (compartmentColor из diagram.js)
// с полупрозрачной заливкой под каждой кривой.
// ------------------------------------------------------------------
function drawSimulationChart(canvas, time, series, names, width, height) {
  const ctx = canvas.getContext("2d");
  const w = width || canvas.width || 640;
  const h = height || canvas.height || 420;

  // Тёмный градиентный фон в тон интерфейса
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#0e1730");
  bg.addColorStop(1, "#0a1122");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const padL = 64;
  const padR = 16;
  const padT = 16;
  const padB = 42;
  const plotW = Math.max(60, w - padL - padR);
  const plotH = Math.max(60, h - padT - padB);

  // Максимальное значение по всем кривым → красивая шкала Y
  let maxVal = 0;
  series.forEach((comp) =>
    comp.forEach((v) => {
      if (v > maxVal) maxVal = v;
    }),
  );
  const yMax = niceMax(Math.max(maxVal * 1.05, 1));
  const tMax = time[time.length - 1] || 1;

  // Сетка и подписи осей
  ctx.font = "10px Manrope, Arial";
  ctx.lineWidth = 1;
  const GRID = 5;
  // Горизонтальная сетка + деления оси Y (значения по оси — число людей)
  for (let g = 0; g <= GRID; g++) {
    const y = padT + plotH - (g / GRID) * plotH;
    ctx.strokeStyle = "rgba(148,163,184,0.14)";
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(fmtValue((yMax * g) / GRID), padL - 9, y);
  }
  // Вертикальная сетка + деления оси X (значения по оси — время в днях)
  for (let g = 0; g <= GRID; g++) {
    const x = padL + (g / GRID) * plotW;
    ctx.strokeStyle = "rgba(148,163,184,0.14)";
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fmtValue((tMax * g) / GRID), x, padT + plotH + 19);
  }

  // Рамка графика
  ctx.strokeStyle = "rgba(148,163,184,0.35)";
  ctx.strokeRect(padL, padT, plotW, plotH);

  // Подпись оси Y: «число людей», повёрнутая вертикально
  ctx.save();
  ctx.translate(16, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "13px Manrope, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("число людей", 0, 0);
  ctx.restore();

  // Подпись оси X: «время t, дни»
  ctx.fillStyle = "#94a3b8";
  ctx.font = "13px Manrope, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("время t, дни", padL + plotW / 2, h - 9);

  // Масштабирование координат (клиппируем отрицательные «хвосты»)
  const xFor = (t) => padL + (t / tMax) * plotW;
  const yFor = (v) => padT + plotH - (Math.max(0, Math.min(v, yMax)) / yMax) * plotH;

  names.forEach((name, ci) => {
    const color = compartmentColor(name, ci);
    const arr = series[ci];

    // Полупрозрачная заливка «под горкой»
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(xFor(time[0]), padT + plotH);
    arr.forEach((v, i) => ctx.lineTo(xFor(time[i]), yFor(v)));
    ctx.lineTo(xFor(time[arr.length - 1]), padT + plotH);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Кривая
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    arr.forEach((v, i) => {
      const x = xFor(time[i]);
      const y = yFor(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

// ------------------------------------------------------------------
// Сообщение на месте графика: заглушка или ошибка разбора/расчёта.
// Переносит текст по словам, чтобы он не вылезал за края холста.
// ------------------------------------------------------------------
function drawSimulationMessage(canvas, text, color = "#cbd5e1", width, height) {
  const ctx = canvas.getContext("2d");
  const w = width || canvas.width || 640;
  const h = height || canvas.height || 420;

  ctx.fillStyle = "#0b1324";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = color;
  ctx.font = "600 15px Manrope, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Перенос по словам до ширины холста
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const probe = current ? current + " " + word : word;
    if (ctx.measureText(probe).width > w - 60 && current) {
      lines.push(current);
      current = word;
    } else {
      current = probe;
    }
  });
  if (current) lines.push(current);

  const lineHeight = 24;
  const startY = h / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, w / 2, startY + i * lineHeight));
}

// ------------------------------------------------------------------
// Инициализация модуля после загрузки DOM: первый расчёт и реакция
// на изменение размера окна (при открытой вкладке — перерисовать).
// ------------------------------------------------------------------
function initSimulation() {
  refreshSimulation();
  window.addEventListener("resize", () => {
    const section = document.getElementById("section-simulation");
    if (section && !section.classList.contains("hidden")) refreshSimulation();
  });
}

// Защитный выход для запуска под Node (node --test)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    niceMax,
    makeDerivative,
    rk4Integrate,
    defaultInitial,
    // DOM-функции экспортируются для Node-стенда (в браузере это глобальные функции)
    refreshSimulation,
    renderSimulation,
    drawSimulationChart,
    initSimulation,
  };
}