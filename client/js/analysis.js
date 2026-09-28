// ============================================================
// analysis.js — качественный анализ модели (этап «Симуляция»).
//
// Главное: универсальный расчёт базового репродуктивного числа
// R₀ методом «матрицы следующего поколения» (NGM, van den Driessche
// & Watmough). Метод не привязан к конкретной модели: R₀ выводится
// прямо из правых частей ОДУ, поэтому для SIR автоматически получится
// β/γ, для SEIR со смертностью — β·σ/((σ+µ)·(γ+µ)) и т.п. Если
// автоматика не справляется (нестандартная структура заражения) —
// пользователь задаёт формулу R₀ вручную через параметры.
//
// Здесь только чистые функции без DOM (тестируются под node --test);
// в браузере полагаются на глобальные evaluateExpression/parseExpression
// из parser.js, под Node — подтягиваются лениво, как в fit.js.
// ============================================================

// ------------------------------------------------------------------
// Зависимости парсера (работают и в браузере, и под Node).
// ------------------------------------------------------------------
function analysisCore() {
  if (typeof evaluateExpression !== "undefined") {
    return { evaluateExpression, parseExpression };
  }
  const par = require("./parser.js");
  return {
    evaluateExpression: par.evaluateExpression,
    parseExpression: par.parseExpression,
  };
}

// ------------------------------------------------------------------
// Разбивает правую часть на слагаемые со знаком (локальная копия
// splitSignedTerms из parser.js — чтобы модуль был самодостаточным).
// dI/dt = β*S*I/N - γ*I → [{sign:+1, node:β*S*I/N}, {sign:-1, node:γ*I}]
// ------------------------------------------------------------------
function splitTerms(node) {
  const parts = [];
  (function collect(n, sign) {
    if (n.type === "bin" && (n.op === "+" || n.op === "-")) {
      collect(n.left, sign);
      collect(n.right, n.op === "-" ? -sign : sign);
    } else if (n.type === "unary" && n.op === "-") {
      collect(n.operand, -sign);
    } else {
      parts.push({ sign, node: n });
    }
  })(node, 1);
  return parts;
}

// ------------------------------------------------------------------
// Содержит ли узел AST идентификатор с заданным именем (рекурсивно).
// Нужно, чтобы отличать «силу заражения» (β*S*I/N — есть S) от
// переходов (σ*E, γ*I) и вакцинации (α*S — нет заражённых).
// ------------------------------------------------------------------
function containsIdent(node, name) {
  if (!node) return false;
  if (node.type === "ident") return node.name === name;
  if (node.type === "unary") return containsIdent(node.operand, name);
  if (node.type === "bin") return containsIdent(node.left, name) || containsIdent(node.right, name);
  if (node.type === "call") return node.args.some((a) => containsIdent(a, name));
  return false;
}

// ------------------------------------------------------------------
// Вычисляет значение суммы слагаемых [{sign, node}] в точке vars.
// ------------------------------------------------------------------
function evalTerms(terms, vars, evaluateExpression) {
  let sum = 0;
  terms.forEach((t) => {
    sum += t.sign * evaluateExpression(t.node, vars);
  });
  return sum;
}

// ------------------------------------------------------------------
// Центральная разность функции f по j-й переменной в точке x (h — мал).
// ------------------------------------------------------------------
function centralDiff(f, x, j, h) {
  const hi = x.slice();
  hi[j] += h;
  const lo = x.slice();
  lo[j] -= h;
  return (f(hi) - f(lo)) / (2 * h);
}

// ------------------------------------------------------------------
// Умножение матрицы на вектор (для спектрального радиуса).
// ------------------------------------------------------------------
function matVec(a, x) {
  const n = a.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < x.length; k++) s += a[i][k] * x[k];
    out.push(s);
  }
  return out;
}

// ------------------------------------------------------------------
// Умножение матриц (используется для F·V⁻¹ — матрицы небольшие).
// ------------------------------------------------------------------
function matMul(a, b) {
  const n = a.length;
  const m = b[0] ? b[0].length : 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push([]);
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (let k = 0; k < b.length; k++) s += a[i][k] * b[k][j];
      out[i].push(s);
    }
  }
  return out;
}

// ------------------------------------------------------------------
// Обратная матрица методом Гаусса–Жордана с частичным выбором
// главного элемента. Если матрица вырождена — бросает ошибку.
// ------------------------------------------------------------------
function matInv(m) {
  const n = m.length;
  const a = m.map((row) => row.slice());
  const inv = [];
  for (let i = 0; i < n; i++) {
    inv.push([]);
    for (let j = 0; j < n; j++) inv[i].push(i === j ? 1 : 0);
  }
  for (let col = 0; col < n; col++) {
    // Выбор строки с максимальным по модулю элементом
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    if (Math.abs(a[pivot][col]) < 1e-14) {
      throw new Error("Матрица V вырождена — в модели нет оттока из заражённых (R₀ → ∞)");
    }
    if (pivot !== col) {
      [a[pivot], a[col]] = [a[col], a[pivot]];
      [inv[pivot], inv[col]] = [inv[col], inv[pivot]];
    }
    const d = a[col][col];
    for (let j = 0; j < n; j++) {
      a[col][j] /= d;
      inv[col][j] /= d;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      for (let j = 0; j < n; j++) {
        a[r][j] -= f * a[col][j];
        inv[r][j] -= f * inv[col][j];
      }
    }
  }
  return inv;
}

// ------------------------------------------------------------------
// Спектральный радиус матрицы (максимум |λ|): степенная итерация.
// Для матриц следующего поколения доминантное собственное значение
// вещественно и положительно, поэтому сходится к R₀.
// ------------------------------------------------------------------
function spectralRadius(a) {
  const n = a.length;
  if (n === 1) return Math.abs(a[0][0]);
  let x = [];
  for (let i = 0; i < n; i++) x.push(1 + 0.01 * i);
  let lambda = 0;
  for (let it = 0; it < 200; it++) {
    const y = matVec(a, x);
    const nx = x.map((_, i) => y[i] * x[i]).reduce((s, v) => s + v, 0);
    const d = x.map((v) => v * v).reduce((s, v) => s + v, 0);
    if (d < 1e-300) break;
    lambda = nx / d;
    const norm = Math.sqrt(y.map((v) => v * v).reduce((s, v) => s + v, 0));
    if (norm < 1e-300) break;
    const xn = y.map((v) => v / norm);
    // Критерий сходимости: изменение нормированного вектора мало
    const dn = xn.map((v, i) => Math.abs(v - x[i])).reduce((s, v) => Math.max(s, v), 0);
    x = xn;
    if (dn < 1e-10) break;
  }
  return Math.abs(lambda);
}

// ------------------------------------------------------------------
// Сколько унарных минусов внутри слагаемого (по образцу parser.js).
// Нужно для корректного знака: −β*S*I/N парсер хранит как (−β)*S*I/N,
// поэтому итоговый знак = знак из суммы ± чётность унарных минусов.
// ------------------------------------------------------------------
function countUnaryMinus(node) {
  if (!node) return 0;
  switch (node.type) {
    case "unary":
      return 1 + countUnaryMinus(node.operand);
    case "bin":
      return countUnaryMinus(node.left) + countUnaryMinus(node.right);
    case "call":
      return node.args.reduce((sum, arg) => sum + countUnaryMinus(arg), 0);
    default:
      return 0;
  }
}

// ------------------------------------------------------------------
// Итоговый знак слагаемого {sign, node}: знак из суммы ± унарные
// минусы (чётное число минусов → «+»).
// ------------------------------------------------------------------
function termSign(term) {
  let sign = term.sign < 0 ? -1 : 1;
  if (countUnaryMinus(term.node) % 2 === 1) sign = -sign;
  return sign;
}

// ------------------------------------------------------------------
// Автоматическое выделение «восприимчивых» и «заражённых»
// компартментов прямо по правым частям ОДУ (без опоры на flows):
//   • «передающее» слагаемое — содержит ≥2 компартмента (β*S*I/N);
//   • источник такого слагаемого со знаком «минус» в своём уравнении
//     теряет популяцию из-за заражения → восприимчивый (S);
//   • прочие компартменты передающего слагаемого и его положительная
//     цель → заражённые (I в SIR, E и I в SEIR);
//   • замыкание: цель потока из заражённого добавляется, если из неё
//     есть дальнейшая прогрессия (I→Q→R: Q попадёт, R — нет).
// Стандартное семейство SIR/SEIR/SEIS/SEIRS/SIRD/SIS закрывается
// автоматически; экзотические структуры — ручной формулой R₀.
// ------------------------------------------------------------------
function classifyCompartments(structure) {
  const comps = structure.compartments;
  const names = comps.map((c) => c.name);
  const flows = structure.flows || [];
  const susceptible = new Set();
  const infected = new Set();

  // Первый проход: передающие слагаемые правых частей
  comps.forEach((c) => {
    splitTerms(c.rhs).forEach((t) => {
      const inTerm = names.filter((n) => containsIdent(t.node, n));
      if (inTerm.length < 2) return; // не передача (σ*E, γ*I, µ*S…)
      const sign = termSign(t); // итоговый знак с учётом (−β)*S*I/N
      // Отрицательное слагаемое в своём же уравнении → источник теряет
      // популяцию из-за заражения → восприимчивый (S в β*S*I/N)
      if (sign < 0 && inTerm.includes(c.name)) susceptible.add(c.name);
      // Остальные компартменты передающего слагаемого — движители инфекции
      inTerm.forEach((n) => {
        if (n !== c.name) infected.add(n);
      });
      // Положительное передающее слагаемое → цель заражения (E в S→E)
      if (sign > 0) infected.add(c.name);
    });
  });

  // Замыкание цепочек прогрессии: I→Q→R — Q заражённый, R нет.
  // Добавляем цель потока из заражённого, только если из этой цели
  // исходит поток в компартмент, не являющийся восприимчивым.
  let changed = true;
  while (changed) {
    changed = false;
    flows.forEach((f) => {
      if (!f.to || !f.from) return;
      if (f.to === f.from) return;
      if (susceptible.has(f.to) || infected.has(f.to)) return;
      if (!infected.has(f.from)) return;
      const hasProgression = flows.some(
        (g) => g.from === f.to && g.to && !susceptible.has(g.to),
      );
      if (hasProgression) {
        infected.add(f.to);
        changed = true;
      }
    });
  }

  // Восприимчивые источники заражёнными не считаем
  susceptible.forEach((s) => infected.delete(s));

  return {
    susceptible: names.filter((n) => susceptible.has(n)),
    infected: names.filter((n) => infected.has(n)),
  };
}

// ------------------------------------------------------------------
// Главная функция: R₀ методом матрицы следующего поколения.
//     structure — структура из парсера (compartments + flows);
//     params    — значения параметров (включая N, если есть);
//     N         — население в безболезненном равновесии (S* = N).
// Возвращает { ok, r0, infected, susceptible, F, V } или { ok:false, error }.
// ------------------------------------------------------------------
function computeR0NGM(structure, params, N) {
  const { evaluateExpression } = analysisCore();
  const { susceptible, infected } = classifyCompartments(structure);
  if (!infected.length) {
    return { ok: false, error: "не удалось выделить заражённые компартменты" };
  }
  if (!susceptible.length) {
    return { ok: false, error: "не найден восприимчивый компартмент (источник заражения)" };
  }

  const names = structure.compartments.map((c) => c.name);
  const rhsByIdx = structure.compartments.map((c) => c.rhs);
  const k = infected.length;
  const susSet = new Set(susceptible);

  // Безболезненное равновесие: восприимчивые — всё население,
  // остальные компартменты — ноль, параметры — текущие значения.
  const vars0 = { t: 0 };
  names.forEach((n) => {
    vars0[n] = susSet.has(n) ? N : 0;
  });
  for (const key in params) {
    if (!(key in vars0)) vars0[key] = params[key];
  }

  // Разбиваем правые части заражённых на слагаемые и сортируем:
  //   newInf_i   — «новые заражения»: содержат восприимчивого И заражённого;
  //   transfer_i — остальные переходы (σ*E, γ*I, µ*I, вакцинация без S-инфекции).
  const infTerms = []; // [i][].new / .rest с {sign, node}
  infected.forEach((name) => {
    const idx = names.indexOf(name);
    const terms = splitTerms(rhsByIdx[idx]);
    const inf = [];
    const rest = [];
    terms.forEach((t) => {
      const hasSus = susceptible.some((s) => containsIdent(t.node, s));
      const hasInf = infected.some((v) => containsIdent(t.node, v));
      // Сила заражения — слагаемое с восприимчивым и заражённым компартментами;
      // вакцинация α*S (нет заражённого) уходит в переходы.
      if (hasSus && hasInf) inf.push(t);
      else rest.push(t);
    });
    infTerms.push({ inf, rest });
  });

  // Численные матрицы F и V в DFE (k×k). Функция f_i берёт текущие
  // значения заражённых компартментов (массив длины k), остальные
  // переменные фиксированы на уровне DFE.
  const h = 1e-6;
  const makeVarFn = (i, which) => (xv) => {
    const vars = Object.assign({}, vars0);
    infected.forEach((nm, idx) => {
      vars[nm] = xv[idx];
    });
    return evalTerms(infTerms[i][which], vars, evaluateExpression);
  };

  const F = [];
  const V = [];
  for (let i = 0; i < k; i++) {
    F.push([]);
    V.push([]);
    const x0 = new Array(k).fill(0);
    for (let j = 0; j < k; j++) {
      F[i].push(centralDiff(makeVarFn(i, "inf"), x0, j, h));
      // dX/dt = F − V, значит V = −(переходы)
      V[i].push(-centralDiff(makeVarFn(i, "rest"), x0, j, h));
    }
  }

  let r0;
  try {
    const Vinv = matInv(V);
    const K = matMul(F, Vinv);
    r0 = spectralRadius(K);
  } catch (err) {
    return {
      ok: false,
      error: err.message || String(err),
      infected,
      susceptible,
    };
  }

  if (!Number.isFinite(r0) || r0 < 0) {
    return { ok: false, error: "R₀ не удалось вычислить численно", infected, susceptible };
  }

  return { ok: true, r0, infected, susceptible, F, V };
}

// ------------------------------------------------------------------
// Итоговый размер эпидемии из трансцендентного уравнения
// 1 − x = e^(−R₀·x) (справедливо для «закрытых» моделей без смертности
// и без возобновления восприимчивых). Корень на (0, 1) ищется
// бисекцией — метод Ньютона тут уходит за границы интервала.
// Возвращает долю переболевших x ∈ [0, 1).
// ------------------------------------------------------------------
function finalSizeFromR0(r0) {
  if (!(r0 > 1)) return 0;
  const f = (x) => 1 - x - Math.exp(-r0 * x);
  // f(0⁺) > 0 (при R₀ > 1), f(1⁻) < 0 — корень в (0, 1) единственный
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  return (lo + hi) / 2;
}

// ------------------------------------------------------------------
// Вычисление R₀ по пользовательской формуле (строка вида «β/γ» или
// «β*σ/((σ+µ)*(γ+µ))»). Парсится парсером выражений и вычисляется
// с текущими параметрами. Возвращает { ok, r0 } или { ok:false, error }.
// ------------------------------------------------------------------
function computeR0Manual(formula, params) {
  const { parseExpression, evaluateExpression } = analysisCore();
  if (!String(formula || "").trim()) return { ok: false, error: "пустая формула" };
  try {
    const ast = parseExpression(String(formula).trim());
    const vars = {};
    for (const key in params) vars[key] = params[key];
    const r0 = evaluateExpression(ast, vars);
    if (!Number.isFinite(r0) || r0 < 0) {
      return { ok: false, error: "R₀ по формуле получился нечисловым или отрицательным" };
    }
    return { ok: true, r0 };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

// Защитный выход для запуска под Node (node --test)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    splitTerms,
    containsIdent,
    matMul,
    matInv,
    spectralRadius,
    classifyCompartments,
    computeR0NGM,
    finalSizeFromR0,
    computeR0Manual,
  };
}