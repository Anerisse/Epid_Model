// ============================================================
// fit.js — этап 5: параметризация (оценка параметров по данным)
// ============================================================
// Базовый алгоритм — метод наименьших квадратов: подбираем параметры
// (β, γ, …) так, чтобы кривая модели — решение РК4 из simulate.js —
// проходила как можно ближе к наблюдаемым точкам I(t). Минимизация —
// метод Нелдера–Мида (деформируемый многогранник): прост, не требует
// производных и хорошо работает для 1–4 параметров. Синтетические
// данные для примеров генерирует встроенный симулятор (те же РК4 +
// шум): подгонка должна восстановить истинные параметры — так
// проверяется корректность алгоритма («синтетический эксперимент»).
//
// Модуль рассчитан на расширение: следующий алгоритм (нейросеть на
// TensorFlow.js для инверсного моделирования) подключается как ещё
// одна функция-решатель, не затрагивая остальную систему.

// Минимальное число наблюдений, без которого подгонка бессмысленна
const MIN_DATA_POINTS = 3;

// Локальные константы-запасные: в браузере совпадают с глобальными
// константами simulate.js, а автономно (node --test) модуль не зависит
// от чужих глобальных переменных.
const FIT_DT = 0.05; // шаг интегрирования РК4 (дни)
const FIT_DEFAULT_POPULATION = 10000;

// Пресеты параметров «на всякий случай» — когда модуль запущен без
// simulate.js (в браузере берутся глобальные PARAM_PRESETS).
const FIT_PRESETS = {
  "β": { value: 0.5, min: 0, max: 2, step: 0.01 },
  "γ": { value: 0.2, min: 0, max: 1, step: 0.01 },
  "σ": { value: 0.3, min: 0, max: 1, step: 0.01 },
  "μ": { value: 0.02, min: 0, max: 0.5, step: 0.001 },
  "α": { value: 0.1, min: 0, max: 1, step: 0.01 },
  "δ": { value: 0.1, min: 0, max: 1, step: 0.01 },
  "ε": { value: 0.1, min: 0, max: 1, step: 0.01 },
  "λ": { value: 0.1, min: 0, max: 1, step: 0.01 },
  "N": { value: 10000, min: 1000, max: 100000, step: 500 },
  "n": { value: 10000, min: 1000, max: 100000, step: 500 },
};

// Пресет параметра: из глобального PARAM_PRESETS, если он доступен
// (браузер — единый источник), иначе из локального FIT_PRESETS.
function fitPreset(name) {
  if (typeof PARAM_PRESETS !== "undefined" && PARAM_PRESETS[name]) {
    return PARAM_PRESETS[name];
  }
  return FIT_PRESETS[name] || { value: 0.1, min: 0, max: 1, step: 0.01 };
}

// Нормализует вход: подходит и структура парсера напрямую, и
// результат parseOdeSystemSafe — { ok, structure }.
function structOf(parsed) {
  return parsed && parsed.structure ? parsed.structure : parsed;
}

// ------------------------------------------------------------------
// Зависимости численного ядра (РК4, производные, вычисление выражений):
// в браузере это глобальные функции simulate.js / parser.js, а при
// запуске под Node (node --test) их нужно подтянуть явно из соседних
// модулей — там «глобальных» имён нет.
// ------------------------------------------------------------------
function simCore() {
  if (typeof makeDerivative !== "undefined") {
    return { makeDerivative, rk4Integrate, evaluateExpression };
  }
  const sim = require("./simulate.js");
  const par = require("./parser.js");
  return {
    makeDerivative: sim.makeDerivative,
    rk4Integrate: sim.rk4Integrate,
    evaluateExpression: par.evaluateExpression,
  };
}

// ------------------------------------------------------------------
// Разбирает пользовательский ввод данных в массив наблюдений
// [{ t, value }]. Допускает «день число» и «день,число» в строке,
// а также одиночные числа — тогда дни подразумеваются 0, 1, 2, ...
// Смещает время так, чтобы первое наблюдение было в момент t = 0
// (данные «от начала эпидемии» — так удобнее подгонять).
// Возвращает { ok: true, data } или { ok: false, error }.
// ------------------------------------------------------------------
function parseFitData(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const data = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(/[\s,;]+/).map(Number);
    if (!parts.length || parts.some((x) => Number.isNaN(x))) {
      return { ok: false, error: `Строка ${i + 1}: не числа — «${lines[i]}»` };
    }
    // Одно число в строке — дни по порядку (0, 1, 2, ...)
    if (parts.length === 1) data.push({ t: i, value: parts[0] });
    else data.push({ t: parts[0], value: parts[1] });
  }

  if (data.length < MIN_DATA_POINTS) {
    return { ok: false, error: `Нужно минимум ${MIN_DATA_POINTS} наблюдения` };
  }
  if (data.some((p) => !Number.isFinite(p.t) || p.t < 0 || p.value <= 0)) {
    return { ok: false, error: "Дни и числа заражённых должны быть неотрицательными" };
  }

  // Сортируем по времени и начинаем отсчёт с t = 0
  data.sort((a, b) => a.t - b.t);
  const t0 = data[0].t;
  data.forEach((p) => {
    p.t -= t0;
  });
  return { ok: true, data };
}

// ------------------------------------------------------------------
// Начальные условия модели по первым данным: I₀ — первое наблюдение,
// S₀ = N − I₀ (остальные в начале «не болеют»), прочие компартменты
// обнуляются. Возвращает вектор в порядке компартментов структуры.
// ------------------------------------------------------------------
function fitInitialCondition(names, data, N) {
  const init = {};
  names.forEach((name) => {
    init[name] = 0;
  });
  const i0 = data[0].value;
  init["I"] = i0;
  if (names.includes("S")) init["S"] = Math.max(0, N - i0);
  return names.map((name) => init[name] || 0);
}

// ------------------------------------------------------------------
// Интегрирует модель (РК4 из simulate.js) с данными параметрами и
// возвращает значения целевого компартмента в заданные дни (берём
// ближайший шаг интегрирования). При расходимости бросает ошибку.
// ------------------------------------------------------------------
function simulateAtDays(parsed, params, initial, target, days, dt) {
  const step = dt || FIT_DT;
  const s = structOf(parsed);
  const { makeDerivative, rk4Integrate, evaluateExpression } = simCore();
  const names = s.compartments.map((c) => c.name);
  const rhsAsts = s.compartments.map((c) => c.rhs);
  const deriv = makeDerivative(names, rhsAsts, params, evaluateExpression);
  const tMax = days.length ? Math.max(0, ...days) : 0;
  const res = rk4Integrate(deriv, initial, tMax, step);

  const ti = names.indexOf(target);
  if (ti < 0) throw new Error(`Компартмент ${target} не найден в модели`);

  return days.map((d) => {
    const idx = Math.min(res.series[ti].length - 1, Math.max(0, Math.round(d / step)));
    return Math.max(0, res.series[ti][idx]);
  });
}

// ------------------------------------------------------------------
// Стоимость подгонки: сумма квадратов отклонений модели от данных
// (SSE = sum (модель − данные)²). При расходимости решения — очень
// большая величина, чтобы оптимизатор уходил «прочь» от таких точек.
// ------------------------------------------------------------------
function fitCost(parsed, fixedParams, freeNames, freeValues, data, N, target, dt) {
  const params = Object.assign({}, fixedParams);
  freeNames.forEach((name, i) => {
    params[name] = freeValues[i];
  });

  const s = structOf(parsed);
  const names = s.compartments.map((c) => c.name);
  const initial = fitInitialCondition(names, data, N);

  try {
    const model = simulateAtDays(parsed, params, initial, target, data.map((d) => d.t), dt);
    return model.reduce((sum, v, i) => sum + (v - data[i].value) ** 2, 0);
  } catch {
    return 1e30;
  }
}

// ------------------------------------------------------------------
// Минимизация функции многих переменных методом Нелдера–Мида.
// f — функция (x: number[]) → число; x0 — стартовая точка; bounds —
// [[lo, hi], ...] ограничения области поиска (кандидаты зажимаются).
// Возвращает { x, fx, iterations } — минимум и значение в нём.
// ------------------------------------------------------------------
function nelderMead(f, x0, bounds, opts) {
  const o = opts || {};
  const maxIter = o.maxIter || 400;
  const tol = o.tol !== undefined ? o.tol : 1e-9;
  const n = x0.length;

  const clamp = (p) =>
    p.map((v, i) => {
      const lo = bounds[i] ? bounds[i][0] : -Infinity;
      const hi = bounds[i] ? bounds[i][1] : Infinity;
      return Math.min(hi, Math.max(lo, v));
    });

  // Начальный симплекс: старт + смещения вдоль каждой координаты
  const simplex = [clamp(x0.slice())];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] = p[i] ? p[i] * 1.05 : 0.001;
    if (p[i] === x0[i]) p[i] += 0.001; // от нулевой координаты уходим явно
    simplex.push(clamp(p));
  }
  const fx = simplex.map(f);

  let iterations = 0;
  for (; iterations < maxIter; iterations++) {
    const idx = simplex.map((_, i) => i).sort((a, b) => fx[a] - fx[b]);
    const best = idx[0];
    const worst = idx[n];

    // Центр тяжести всех вершин, кроме худшей
    const centroid = simplex[best].map((_, ci) => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += simplex[idx[i]][ci];
      return sum / n;
    });

    // 1) Отражение худшей вершины через центр
    const reflected = clamp(centroid.map((v, ci) => 2 * v - simplex[worst][ci]));
    const fr = f(reflected);

    if (fr < fx[best]) {
      // Удачное направление — пробуем растяжение
      const expanded = clamp(centroid.map((v, ci) => 3 * v - 2 * simplex[worst][ci]));
      const fe = f(expanded);
      simplex[worst] = fe < fr ? expanded : reflected;
      fx[worst] = Math.min(fe, fr);
    } else if (fr < fx[worst]) {
      simplex[worst] = reflected;
      fx[worst] = fr;
    } else {
      // 2) Контракция к центру тяжести
      const contracted = clamp(centroid.map((v, ci) => 0.5 * (simplex[worst][ci] + centroid[ci])));
      const fc = f(contracted);
      if (fc < fx[worst]) {
        simplex[worst] = contracted;
        fx[worst] = fc;
      } else {
        // 3) Сжатие всего симплекса к лучшей вершине (штрафной ход)
        for (let i = 1; i <= n; i++) {
          simplex[i] = clamp(simplex[i].map((v, ci) => 0.5 * (simplex[best][ci] + v)));
          fx[i] = f(simplex[i]);
        }
      }
    }

    // Сходимость: разброс значений в симплексе мал и итераций уже сделано
    // достаточно, чтобы не ошибиться на «счастливых» стартовых точках
    if (iterations > 4 && Math.max(...fx) - Math.min(...fx) < tol) break;
  }

  const idx = simplex.map((_, i) => i).sort((a, b) => fx[a] - fx[b]);
  return { x: clamp(simplex[idx[0]]), fx: fx[idx[0]], iterations: iterations + 1 };
}

// ------------------------------------------------------------------
// Главная функция МНК: подбирает свободные параметры (freeNames) так,
// чтобы модель максимально совпала с наблюдаемыми данными.
// fixedParams — зафиксированные параметры (например, { N: 10000 });
// opts.target — компартмент, который сравниваем с данными (по
// умолчанию I); opts.N — размер популяции для начальных условий.
// Возвращает { ok, params, rmse, r2, iterations } или { ok:false,
// error } при ошибках.
// ------------------------------------------------------------------
function fitParameters(parsed, fixedParams, freeNames, data, opts) {
  const o = opts || {};
  const target = o.target || "I";
  const N = o.N || FIT_DEFAULT_POPULATION;
  const dt = o.dt || FIT_DT;

  const s = structOf(parsed);
  if (!s || !s.compartments) return { ok: false, error: "Модель не разобрана" };
  if (!data || data.length < MIN_DATA_POINTS) {
    return { ok: false, error: `Нужно минимум ${MIN_DATA_POINTS} наблюдения` };
  }
  if (!freeNames || !freeNames.length) {
    return { ok: false, error: "Отметьте хотя бы один оцениваемый параметр" };
  }

  // Стартовые приближения и границы поиска — из пресетов
  const x0 = freeNames.map((name) => fitPreset(name).value);
  const bounds = freeNames.map((name) => {
    const p = fitPreset(name);
    return [0, Math.max(p.max * 2, 1e-6)];
  });

  // Население: подставляем в параметры, если модель его использует,
  // а оно не зафиксировано слайдером и не входит в оцениваемые
  const fixed = Object.assign({}, fixedParams);
  s.parameters.forEach((name) => {
    if (/^[Nn]$/.test(name) && fixed[name] === undefined && !freeNames.includes(name)) {
      fixed[name] = N;
    }
  });

  const f = (values) => fitCost(parsed, fixed, freeNames, values, data, N, target, dt);
  const res = nelderMead(f, x0, bounds, { maxIter: 400 });

  const params = Object.assign({}, fixed);
  freeNames.forEach((name, i) => {
    params[name] = Math.max(0, res.x[i]);
  });

  try {
    const names = s.compartments.map((c) => c.name);
    const initial = fitInitialCondition(names, data, N);
    const model = simulateAtDays(parsed, params, initial, target, data.map((d) => d.t), dt);

    const mean = data.reduce((s, d) => s + d.value, 0) / data.length;
    const sse = model.reduce((s, v, i) => s + (v - data[i].value) ** 2, 0);
    const tss = data.reduce((s, d) => s + (d.value - mean) ** 2, 0);
    return {
      ok: true,
      params,
      rmse: Math.sqrt(sse / data.length),
      r2: tss > 0 ? 1 - sse / tss : 1,
      iterations: res.iterations,
    };
  } catch (err) {
    return { ok: false, error: "Расчёт итоговой кривой не удался: " + err.message };
  }
}

// ------------------------------------------------------------------
// Синтетические данные для примера/самопроверки: интегрирует текущую
// модель с заданными («истинными») параметрами, берёт кривую I(t) в
// заданные дни и добавляет случайный шум (доля от величины). Подгонка
// должна восстановить истинные параметры — так проверяется алгоритм.
// Возвращает текст в формате parseFitData («день число» в строке).
// ------------------------------------------------------------------
function generateSyntheticData(parsed, params, N, days, noise) {
  const s = structOf(parsed);
  const names = s.compartments.map((c) => c.name);
  const initial = fitInitialCondition(names, [{ t: 0, value: Math.max(1, Math.round(N * 0.01)) }], N);
  const model = simulateAtDays(parsed, params, initial, "I", days, FIT_DT);
  const amp = Math.max(0.02, noise || 0.05);
  return days
    .map((d, i) => {
      const eps = 1 + (Math.random() * 2 - 1) * amp;
      return `${d} ${Math.max(1, Math.round(model[i] * eps))}`;
    })
    .join("\n");
}

// --------------------------------- ДОМЕННОЙ СЛОЙ -------------------------------
// Ниже — привязка к интерфейсу (раздел «Параметризация»). Математическое
// ядро выше не зависит от DOM и покрыто тестами (client/fit.test.js).

// Состояние раздела: ключ модели (для перестроения панели) и результаты
const fitState = {
  modelKey: "",
  trueParams: null, // «истинные» параметры последнего синтетического примера
};

// Контейнеры интерфейса, чтобы не искать их в каждом обработчике
function fitEls() {
  return {
    canvas: document.getElementById("fit-canvas"),
    data: document.getElementById("fit-data"),
    dataHint: document.getElementById("fit-data-hint"),
    freeBox: document.getElementById("fit-free"),
    fixedBox: document.getElementById("fit-fixed"),
    result: document.getElementById("fit-result"),
    legend: document.getElementById("fit-legend"),
  };
}

// ------------------------------------------------------------------
// Показывает сообщение-подсказку на холсте параметризации (тот же
// стиль, что у симуляции: тёмный фон, перенос по словам).
// ------------------------------------------------------------------
function drawFitMessage(text, color) {
  const els = fitEls();
  if (!els.canvas) return;
  const { width, height } = prepareSimulationCanvas(els.canvas);
  drawSimulationMessage(els.canvas, text, color || "#cbd5e1", width, height);
}

// ------------------------------------------------------------------
// Перестраивает панель настроек под структуру модели: по строке на
// параметр (чекбокс «оценивать» + слайдер фиксированного значения),
// плюс слайдер населения N для начальных условий. Вызывается при
// открытии вкладки, если модель изменилась.
// ------------------------------------------------------------------
function buildFitPanel(parsed) {
  const els = fitEls();
  if (!els.freeBox || !els.fixedBox) return;
  els.freeBox.innerHTML = "";
  els.fixedBox.innerHTML = "";

  const s = parsed.structure;

  // Слайдер населения N — всегда фиксированный (оценка не по нему),
  // но начальные условия и масштаб модели зависят от N.
  addFitNRow(els.fixedBox, fitPreset("N"));

  // По строке на каждый параметр модели (кроме N — у него отдельный
  // слайдер населения ниже: размер популяции не оптимизируется)
  s.parameters.forEach((name) => {
    if (/^[Nn]$/.test(name)) return;
    addFitParamRow(els.freeBox, name, false);
  });
}

// Добавляет строку параметра: чекбокс «оценивается» + слайдер значения
function addFitParamRow(container, name, fixedByDefault) {
  const preset = fitPreset(name);

  const wrap = document.createElement("div");
  wrap.className = "sim-slider";

  const head = document.createElement("div");
  head.className = "flex items-center justify-between gap-2 mb-1";

  const left = document.createElement("div");
  left.className = "flex items-center gap-2";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "accent-emerald-400 w-3.5 h-3.5";
  cb.dataset.fitFree = name;
  cb.checked = !fixedByDefault; // N и n — фиксированы по умолчанию

  const title = document.createElement("span");
  title.className = "text-xs font-semibold text-slate-300";
  title.textContent = name;

  left.appendChild(cb);
  left.appendChild(title);
  head.appendChild(left);

  // Подпись «оценивается» рядом со слайдером
  const tag = document.createElement("span");
  tag.className = "fit-tag text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-400";
  tag.textContent = cb.checked ? "МНК" : "фикс.";

  const valBox = document.createElement("span");
  valBox.className = "text-xs text-emerald-300 tabular-nums";

  head.appendChild(tag);
  head.appendChild(valBox);
  wrap.appendChild(head);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "sim-range";
  slider.min = preset.min;
  slider.max = preset.max;
  slider.step = preset.step;
  slider.value = preset.value;
  slider.dataset.fitValue = name;

  const show = () => {
    valBox.textContent = fmtValue(+slider.value);
  };
  show();
  slider.addEventListener("input", show);

  wrap.appendChild(slider);
  container.appendChild(wrap);

  // Чекбокс: выключили — параметр фиксируется (слайдер активен);
  // включили — оцениваем (слайдер глушим — его значение не участвует)
  const sync = () => {
    const isFree = cb.checked;
    slider.disabled = isFree;
    slider.classList.toggle("opacity-40", isFree);
    tag.textContent = isFree ? "МНК" : "фикс.";
  };
  cb.addEventListener("change", sync);
  sync();
}

// Строка населения N в панели фиксированных параметров (всегда слайдером)
function addFitNRow(container, preset) {
  const wrap = document.createElement("div");
  wrap.className = "sim-slider";

  const head = document.createElement("div");
  head.className = "flex items-center justify-between gap-2 mb-1";

  const title = document.createElement("span");
  title.className = "text-xs font-semibold text-slate-300";
  title.textContent = "N (население)";

  const val = document.createElement("span");
  val.className = "text-xs text-emerald-300 tabular-nums";

  head.appendChild(title);
  head.appendChild(val);
  wrap.appendChild(head);

  const input = document.createElement("input");
  input.type = "range";
  input.className = "sim-range";
  input.min = preset.min;
  input.max = preset.max;
  input.step = preset.step;
  input.value = preset.value;
  input.dataset.fitN = "1";

  const show = () => {
    val.textContent = fmtValue(+input.value);
  };
  show();
  input.addEventListener("input", show);

  wrap.appendChild(input);
  container.appendChild(wrap);
}

// ------------------------------------------------------------------
// Собирает настройки с панели: какие параметры оцениваем и значения
// фиксированных. Возвращает { free: [...], fixed: {название: значение},
// N }.
// ------------------------------------------------------------------
function readFitSettings() {
  const free = [];
  const fixed = {};
  let N = FIT_DEFAULT_POPULATION;

  document.querySelectorAll("[data-fit-free]").forEach((cb) => {
    if (cb.checked && cb.dataset.fitFree !== "N" && cb.dataset.fitFree !== "n") {
      free.push(cb.dataset.fitFree);
    }
  });
  document.querySelectorAll("[data-fit-value]").forEach((slider) => {
    if (slider.disabled) return; // оцениваемый параметр — значение не фиксируем
    fixed[slider.dataset.fitValue] = +slider.value;
  });
  const nInput = document.querySelector("[data-fit-n]");
  if (nInput) N = +nInput.value;

  return { free, fixed, N };
}

// ------------------------------------------------------------------
// Главный обработчик кнопки «Оценить параметры»: читает данные и
// настройки, запускает МНК и рисует модель поверх точек.
// ------------------------------------------------------------------
function runParameterFit() {
  const els = fitEls();
  if (!els.canvas) return;

  const text = serializeEquation();
  const parsed = parseOdeSystemSafe(text);
  if (!parsed.ok) {
    drawFitMessage(text ? "Не разобрано: " + parsed.error : "Сначала введите модель в разделе «Модель»", "#f43f5e");
    return;
  }

  const input = parseFitData(els.data.value);
  if (!input.ok) {
    drawFitMessage(input.error, "#f43f5e");
    if (els.dataHint) els.dataHint.textContent = input.error;
    return;
  }
  if (els.dataHint) els.dataHint.textContent = `Наблюдений: ${input.data.length}`;

  const settings = readFitSettings();
  const free = settings.free;

  const names = parsed.structure.compartments.map((c) => c.name);
  const target = names.includes("I") ? "I" : names[0];

  const res = fitParameters(parsed, settings.fixed, free, input.data, { N: settings.N, target });
  if (!res.ok) {
    drawFitMessage("Подгонка не удалась: " + res.error, "#f43f5e");
    if (els.result) els.result.textContent = "Ошибка: " + res.error;
    return;
  }

  // Рисуем: полное решение модели с подобранными параметрами + точки данных
  const step = SIM_DT;
  const maxDay = Math.max(...input.data.map((d) => d.t));
  const initial = fitInitialCondition(names, input.data, settings.N);
  const { makeDerivative, rk4Integrate, evaluateExpression } = simCore();
  const deriv = makeDerivative(
    names,
    parsed.structure.compartments.map((c) => c.rhs),
    res.params,
    evaluateExpression,
  );
  let solved;
  try {
    solved = rk4Integrate(deriv, initial, maxDay, step);
  } catch (err) {
    drawFitMessage("Расчёт кривой не удался: " + err.message, "#f43f5e");
    return;
  }

  const { width, height } = prepareSimulationCanvas(els.canvas);
  drawSimulationChart(els.canvas, solved.time, solved.series, names, width, height, {
    points: input.data,
    pointColor: "#fbbf24",
  });

  // Строка результатов: подобранные параметры и метрики
  const bits = Object.keys(res.params)
    .filter((k) => k !== "N" && k !== "n")
    .map((k) => `${k}̂ = ${fmtValue(res.params[k])}`);
  bits.push(`RMSE = ${fmtValue(res.rmse)}`);
  bits.push(`R² = ${res.r2.toFixed(3)}`);
  bits.push(`итераций: ${res.iterations}`);
  if (els.result) els.result.textContent = bits.join(" · ");

  // Подсказка под данными: отмечаем, что числа сгенерированы кнопкой
  // «Пример» (синтетика), а не введены вручную
  if (els.dataHint) {
    const syn = fitState.trueParams ? " · пример: синтетические данные (β, γ взяты из пресетов)" : "";
    els.dataHint.textContent = `Наблюдений: ${input.data.length}${syn}`;
  }

  if (els.legend) {
    els.legend.innerHTML =
      '<span class="inline-flex items-center gap-1.5 text-[11px] text-slate-300">' +
      '<span class="inline-block w-3 h-3 rounded-full bg-amber-400 border border-ink-950"></span>' +
      "данные I(t)</span>";
  }
}

// ------------------------------------------------------------------
// Кнопка «Пример»: генерирует синтетические данные встроенным
// симулятором (истинные параметры — из пресетов) с шумом и сразу
// запускает подгонку — наглядно видно, что МНК их восстанавливает.
// ------------------------------------------------------------------
function fillFitExample() {
  const els = fitEls();
  const text = serializeEquation();
  const parsed = parseOdeSystemSafe(text);
  if (!parsed.ok) {
    showToast("Сначала введите модель в разделе «Модель»", "error");
    return;
  }

  // «Истинные» параметры — дефолтные значения пресетов модели
  const trueParams = {};
  const N = fitPreset("N").value || FIT_DEFAULT_POPULATION;
  parsed.structure.parameters.forEach((name) => {
    const p = fitPreset(name);
    if (/^[Nn]$/.test(name)) trueParams[name] = N;
    else trueParams[name] = p.value;
  });

  // Дни наблюдений: через 2 дня до 40-го — хватает на пик SIR/SEIR
  const days = [];
  for (let d = 0; d <= 40; d += 2) days.push(d);

  const sample = generateSyntheticData(parsed, trueParams, N, days, 0.05);
  els.data.value = sample;
  fitState.trueParams = trueParams;
  runParameterFit();
}

// ------------------------------------------------------------------
// Открытие вкладки: перестраиваем панель, если модель изменилась,
// и показываем подсказку, если данных ещё нет.
// ------------------------------------------------------------------
function refreshParameterization() {
  const canvas = document.getElementById("fit-canvas");
  if (!canvas) return;

  const text = serializeEquation();
  const parsed = parseOdeSystemSafe(text);

  if (!parsed.ok) {
    drawFitMessage(
      text ? "Не разобрано: " + parsed.error : "Введите модель в разделе «Модель» — сюда можно подгонять её параметры по данным",
      "#cbd5e1",
    );
    return;
  }

  const s = parsed.structure;
  const key = s.parameters.join(",") + "|" + s.compartments.map((c) => c.name).join(",");
  if (key !== fitState.modelKey) {
    fitState.modelKey = key;
    buildFitPanel(parsed);
  }

  const els = fitEls();
  if (!els.data.value.trim()) {
    drawFitMessage(
      "Введите наблюдения I(t) слева (день и число заражённых) — или нажмите «Пример», чтобы сгенерировать синтетические данные",
      "#cbd5e1",
    );
  } else {
    runParameterFit();
  }
}

// ------------------------------------------------------------------
// Инициализация модуля: первая прорисовка и перерисовка при изменении
// размеров окна (когда вкладка открыта), как в симуляции.
// ------------------------------------------------------------------
function initParameterization() {
  refreshParameterization();
  window.addEventListener("resize", () => {
    const section = document.getElementById("section-parameterization");
    if (section && !section.classList.contains("hidden")) refreshParameterization();
  });

  // Ручное редактирование данных снимает пометку «синтетический пример»:
  // дальнейший расчёт идёт по числам, которые ввёл сам пользователь
  const dataEl = document.getElementById("fit-data");
  if (dataEl) {
    dataEl.addEventListener("input", () => {
      fitState.trueParams = null;
    });
  }
}

// Защитный выход для запуска под Node (node --test)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MIN_DATA_POINTS,
    parseFitData,
    fitInitialCondition,
    simulateAtDays,
    fitCost,
    nelderMead,
    fitParameters,
    generateSyntheticData,
    // DOM-функции не экспортируются — они живут только в браузере
  };
}