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
    return { evaluateExpression, parseExpression, nodeToText };
  }
  const par = require("./parser.js");
  return {
    evaluateExpression: par.evaluateExpression,
    parseExpression: par.parseExpression,
    nodeToText: par.nodeToText,
  };
}

// Короткий вывод AST в текст (нужен символьному выводу формулы R₀).
function nt(node) {
  return analysisCore().nodeToText(node);
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
// ——— Символьная математика: вывод «уравнения R₀» из AST ———
//
// Показывается не только число R₀, но и его формула (β/γ, βσ/((σ+µ)(γ+µ))
// и т.п.): берётся символьная производная правых частей по заражённым
// компартментам (производная суммы = сумма производных), в DFE
// подставляются S→N, заражённые→0, выражение упрощается. Это мини-КАС:
// достаточно для маленьких выражений флаговых моделей.
// ------------------------------------------------------------------

function num(v) {
  return { type: "number", value: v };
}
function bin(op, l, r) {
  return { type: "bin", op, left: l, right: r };
}
function un(x) {
  return { type: "unary", op: "-", operand: x };
}
function ident(name) {
  return { type: "ident", name };
}

function isZero(n) {
  return !!n && n.type === "number" && n.value === 0;
}
function isOne(n) {
  return !!n && n.type === "number" && n.value === 1;
}
function textEq(a, b) {
  return a && b ? nt(a) === nt(b) : false;
}

// Итоговый знак слагаемого, свёрнутый внутрь узла: при чётном числе
// минусов узел возвращается как есть, при нечётном — оборачивается
// унарным минусом. Так знак не теряется ни в производной, ни в тексте.
function signedNode(t) {
  const s = termSign(t) < 0;
  const inner = countUnaryMinus(t.node) % 2 === 1;
  return s ^ inner ? un(t.node) : t.node;
}

// Плоский список множителей произведения: числа (в т.ч. свернутые
// унарные минусы) попадают как числа, остальное — как узлы.
function flatFactors(node, out) {
  if (node && node.type === "bin" && node.op === "*") {
    flatFactors(node.left, out);
    flatFactors(node.right, out);
  } else if (node && node.type === "unary" && node.op === "-") {
    out.push(-1);
    flatFactors(node.operand, out);
  } else {
    out.push(node);
  }
  return out;
}

// Разбиение узла на числовой коэффициент и список остальных множителей.
// Узлы-числа и свёрнутые унарные минусы уходят в коэффициент; целая
// степень (N²) раскладывается в повторные множители — так N²/N·N
// сокращается, как и положено.
function factorParts(node) {
  const list = flatFactors(node, []);
  let coef = 1;
  const rest = [];
  list.forEach((f) => {
    if (typeof f === "number") coef *= f;
    else if (f && f.type === "number") coef *= f.value;
    else if (
      f && f.type === "bin" && f.op === "^" &&
      f.right.type === "number" && f.right.value >= 2 && f.right.value <= 8
    ) {
      for (let m = 0; m < f.right.value; m++) rest.push(f.left);
    } else {
      rest.push(f);
    }
  });
  return { coef, rest };
}

// Сборка произведения обратно из множителей и коэффициента.
function productNode(rest, coef) {
  if (!rest.length) return num(coef);
  let res = rest[0];
  for (let i = 1; i < rest.length; i++) res = bin("*", res, rest[i]);
  if (coef === 0) return num(0);
  if (coef === 1) return res;
  if (coef === -1) return un(res);
  return bin("*", num(coef), res);
}

// Символьная производная узла AST по переменной name.
function derive(node, name) {
  if (!node) return num(0);
  switch (node.type) {
    case "number":
      return num(0);
    case "ident":
      return num(node.name === name ? 1 : 0);
    case "unary":
      return node.op === "-" ? un(derive(node.operand, name)) : derive(node.operand, name);
    case "bin": {
      const dL = derive(node.left, name);
      const dR = derive(node.right, name);
      if (node.op === "+") return bin("+", dL, dR);
      if (node.op === "-") return bin("-", dL, dR);
      if (node.op === "*") {
        return bin("+", bin("*", dL, node.right), bin("*", node.left, dR));
      }
      if (node.op === "/") {
        return bin(
          "/",
          bin("-", bin("*", dL, node.right), bin("*", node.left, dR)),
          bin("*", node.right, node.right),
        );
      }
      if (node.op === "^") {
        // c·x^(c−1)·x' — для константного показателя (в моделях эпидемий так)
        if (node.right.type === "number") {
          const c = node.right.value;
          return bin("*", bin("*", num(c), bin("^", node.left, num(c - 1))), dL);
        }
        return num(0);
      }
      return num(0);
    }
    case "call": {
      const u = node.args[0];
      const du = derive(u, name);
      const f = node.name;
      if (f === "exp") return bin("*", { type: "call", name: "exp", args: [u] }, du);
      if (f === "log") return bin("/", du, u);
      if (f === "sqrt") return bin("/", du, bin("*", num(2), { type: "call", name: "sqrt", args: [u] }));
      if (f === "sin") return bin("*", { type: "call", name: "cos", args: [u] }, du);
      if (f === "cos") return bin("*", un({ type: "call", name: "sin", args: [u] }), du);
      return num(0);
    }
    default:
      return num(0);
  }
}

// Подстановка идентификаторов в узел (для DFE: S→N, заражённые→0).
function subst(node, map) {
  switch (node.type) {
    case "ident":
      return map.hasOwnProperty(node.name) ? subst(map[node.name], map) : node;
    case "unary":
      return un(subst(node.operand, map));
    case "bin":
      return bin(node.op, subst(node.left, map), subst(node.right, map));
    case "call":
      return { type: "call", name: node.name, args: node.args.map((a) => subst(a, map)) };
    default:
      return node;
  }
}

// Разворачивает сумму в (знак, узел) с учётом вложенных унарных минусов.
function signedItems(node, sign) {
  const items = [];
  (function flat(n, s) {
    if (n && n.type === "bin" && (n.op === "+" || n.op === "-")) {
      flat(n.left, s);
      flat(n.right, n.op === "-" ? -s : s);
    } else if (n && n.type === "unary" && n.op === "-") {
      flat(n.operand, -s);
    } else if (n) {
      items.push({ sign: s, node: n });
    }
  })(node, sign);
  return items;
}

// Собирает сумму из (знак, узел), приводя подобные слагаемые.
function rebuildSum(items) {
  const groups = new Map();
  items.forEach((it) => {
    const key = nt(it.node);
    const had = groups.get(key);
    groups.set(key, { node: it.node, coef: (had ? had.coef : 0) + it.sign });
  });
  let res = null;
  groups.forEach((g) => {
    if (!g.coef) return;
    let t;
    if (g.node.type === "number") t = num(g.coef * g.node.value);
    else if (g.coef === 1) t = g.node;
    else if (g.coef === -1) t = un(g.node);
    else t = bin("*", num(g.coef), g.node);
    res = res ? bin("+", res, t) : t;
  });
  return res || num(0);
}

function combineSums(a, b) {
  return rebuildSum(signedItems(a, 1).concat(signedItems(b, 1)));
}

// Упрощение выражений: свёртка констант, нейтральные элементы,
// сокращение общих множителей в дробях, sqrt(x²)→x и т.п.
function simplify(node) {
  if (!node) return node;
  switch (node.type) {
    case "number":
    case "ident":
      return node;
    case "unary": {
      const x = simplify(node.operand);
      if (x.type === "number") return num(-x.value);
      if (x.type === "unary") return x.operand;
      if (x.type === "bin" && (x.op === "+" || x.op === "-")) {
        return simplify(rebuildSum(signedItems(x, -1)));
      }
      if (x.type === "bin" && x.op === "*") {
        const p = factorParts(x);
        return productNode(p.rest, -p.coef);
      }
      return un(x);
    }
    case "bin": {
      const l = simplify(node.left);
      const r = simplify(node.right);
      const op = node.op;
      // Свёртка констант
      if (l.type === "number" && r.type === "number") {
        if (op === "+") return num(l.value + r.value);
        if (op === "-") return num(l.value - r.value);
        if (op === "*") return num(l.value * r.value);
        if (op === "/" && r.value !== 0) return num(l.value / r.value);
        if (op === "^") return num(Math.pow(l.value, r.value));
      }
      if (op === "^") {
        if (isZero(r)) return num(1);
        if (isOne(r)) return l;
        if (isZero(l)) return num(0);
        return bin("^", l, r);
      }
      if (op === "+") {
        if (isZero(l)) return r;
        if (isZero(r)) return l;
        return combineSums(l, r);
      }
      if (op === "-") {
        if (isZero(r)) return l;
        if (isZero(l)) return un(r);
        return bin("-", l, r);
      }
      if (op === "*") {
        if (isZero(l) || isZero(r)) return num(0);
        const lp = factorParts(l);
        const rp = factorParts(r);
        const fact = lp.rest.concat(rp.rest);
        const coef = lp.coef * rp.coef;
        // x·x → x²
        if (fact.length === 2 && textEq(fact[0], fact[1])) {
          const p = bin("^", fact[0], num(2));
          return coef === 1 ? p : coef === -1 ? un(p) : bin("*", num(coef), p);
        }
        return productNode(fact, coef);
      }
      if (op === "/") {
        if (isZero(l)) return num(0);
        if (isOne(r)) return l;
        // Числовой знаменатель: делит только коэффициент числителя
        const rp0 = factorParts(r);
        if (rp0.rest.length === 0 && rp0.coef !== 0) {
          const np0 = factorParts(l);
          const coef = np0.coef / rp0.coef;
          if (!np0.rest.length) return num(coef);
          return simplify(productNode(np0.rest, coef));
        }
        const np = factorParts(l);
        const dp = factorParts(r);
        // Нормализация и сокращение общих множителей числителя/знаменателя
        if (np.rest.length || dp.rest.length) {
          const numRest = np.rest.slice();
          const denRest = [];
          let canceled = false;
          dp.rest.forEach((f) => {
            const i = numRest.findIndex((n) => textEq(n, f));
            if (i >= 0) {
              numRest.splice(i, 1);
              canceled = true;
            } else denRest.push(f);
          });
          const numNode = productNode(numRest, np.coef);
          if (!denRest.length) return simplify(numNode);
          const denNode = productNode(denRest, dp.coef);
          // Без повторной рекурсии в обоих случаях — она была бы бесконечной;
          // нормализованные numNode/denNode уже очищены (нет двойных минусов)
          if (!canceled) return bin("/", numNode, denNode);
          return simplify(bin("/", numNode, denNode));
        }
        return bin("/", l, r);
      }
      return bin(op, l, r);
    }
    case "call": {
      const args = node.args.map(simplify);
      if (node.name === "sqrt" && args[0]) {
        if (args[0].type === "number") return num(Math.sqrt(args[0].value));
        // sqrt(u²) → u (для положительного собственного значения R₀)
        if (
          args[0].type === "bin" &&
          args[0].op === "^" &&
          args[0].right.type === "number" &&
          args[0].right.value === 2
        ) {
          return args[0].left;
        }
      }
      return { type: "call", name: node.name, args };
    }
    default:
      return node;
  }
}

// Читаемый текст узла для формулы Р₀. В отличие от nodeToText (который для
// «/» и «*» равных приоритетов пропускает скобки), здесь скобки ставятся
// по правилам приоритета операций: β*σ/((σ+µ)*(γ+µ)) читается однозначно.
const R0FORMULA_PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };
function formulaText(node) {
  if (!node) return "";
  switch (node.type) {
    case "number":
      return String(node.value);
    case "ident":
      return node.name;
    case "unary": {
      const t = formulaText(node.operand);
      // Минус суммы требует скобок: -(σ+µ); минус произведения — нет: -γ*I
      const need =
        node.operand && node.operand.type === "bin" && (node.operand.op === "+" || node.operand.op === "-");
      return "-" + (need ? `(${t})` : t);
    }
    case "call":
      return `${node.name}(${node.args.map(formulaText).join(", ")})`;
    case "bin": {
      const l = formulaText(node.left);
      const r = formulaText(node.right);
      const my = R0FORMULA_PREC[node.op] || 0;
      const wrap = (child, text) => {
        if (!child || child.type !== "bin") return text;
        const cp = R0FORMULA_PREC[child.op] || 0;
        if (cp < my) return `(${text})`;
        return text;
      };
      // Правая часть «-» и «/» при равном приоритете требует скобок
      let lw = wrap(node.left, l);
      let rw = wrap(node.right, r);
      if (
        node.right.type === "bin" &&
        (R0FORMULA_PREC[node.right.op] || 0) === my &&
        (node.op === "-" || node.op === "/")
      ) {
        rw = `(${rw})`;
      }
      return `${lw}${node.op}${rw}`;
    }
    default:
      return "";
  }
}

// Текст суммы слагаемых {sign, node}: «β*S*I/N − γ*I».
function termsToText(parts) {
  let out = "";
  parts.forEach((t) => {
    const tx = formulaText(signedNode(t));
    if (!out) out = tx;
    else if (tx.startsWith("-")) out += " − " + tx.slice(1);
    else out += " + " + tx;
  });
  return out;
}

// Безопасное вычисление узла (для сверки формулы с численным R₀).
function safeEval(node, vars) {
  try {
    return analysisCore().evaluateExpression(node, vars);
  } catch (e) {
    return NaN;
  }
}

// ------------------------------------------------------------------
// Символьное «уравнение R₀» для показа пользователю. Выводит формулу
// из правых частей ОДУ: k=1 → F/V; k=2 → ρ(F·V⁻¹)=(tr+√(tr²−4det))/2;
// иначе — только матрицы F и V текстом. Формула принимается, только
// если её численное значение совпадает с численным R₀ (NGM) — защита
// от ошибок символьных преобразований.
// ------------------------------------------------------------------
function deriveR0Equation(structure, params, pop, r0num) {
  const { susceptible, infected } = classifyCompartments(structure);
  if (!infected.length || !susceptible.length) return null;
  const names = structure.compartments.map((c) => c.name);
  const rhsByIdx = structure.compartments.map((c) => c.rhs);
  const k = infected.length;
  const hasN = Object.prototype.hasOwnProperty.call(params || {}, "N");

  // В DFE восприимчивые заменяем на символ N (если N — параметр модели,
  // то N/N сократится и формула будет «β/γ»), иначе — на конкретное
  // население. Остальные компартменты — в ноль.
  const subMap = {};
  names.forEach((n) => {
    subMap[n] = susceptible.includes(n) ? (hasN ? ident("N") : num(pop)) : num(0);
  });
  const vars = {};
  for (const key in params) vars[key] = params[key];
  if (!hasN) vars["N"] = pop; // для проверки: S заменён на население

  // Разбиение на «новые заражения»/«переходы» по заражённым (как в NGM)
  const infTerms = [];
  infected.forEach((name) => {
    const idx = names.indexOf(name);
    const terms = splitTerms(rhsByIdx[idx]);
    const inf = [];
    const rest = [];
    terms.forEach((t) => {
      const hasSus = susceptible.some((s) => containsIdent(t.node, s));
      const hasInf = infected.some((v) => containsIdent(t.node, v));
      if (hasSus && hasInf) inf.push(t);
      else rest.push(t);
    });
    infTerms.push({ inf, rest });
  });

  const sumOf = (parts) => {
    if (!parts.length) return num(0);
    return parts.map(signedNode).reduce((a, b) => bin("+", a, b));
  };

  // Символьные матрицы F и V: производные по заражённым в DFE.
  const Fs = [];
  const Vs = [];
  for (let i = 0; i < k; i++) {
    Fs.push([]);
    Vs.push([]);
    for (let j = 0; j < k; j++) {
      Fs[i].push(simplify(subst(derive(sumOf(infTerms[i].inf), infected[j]), subMap)));
      // dX/dt = F − V, значит V = −(переходы)
      Vs[i].push(simplify(subst(un(derive(sumOf(infTerms[i].rest), infected[j])), subMap)));
    }
  }

  // Формула R₀
  let r0expr = null;
  if (k === 1) {
    r0expr = simplify(bin("/", Fs[0][0], Vs[0][0]));
  } else if (k === 2) {
    const detV = simplify(bin("-", bin("*", Vs[0][0], Vs[1][1]), bin("*", Vs[0][1], Vs[1][0])));
    const detNum = safeEval(detV, vars);
    if (Number.isFinite(detNum) && Math.abs(detNum) > 1e-12) {
      const K00 = simplify(bin("/", bin("-", bin("*", Fs[0][0], Vs[1][1]), bin("*", Fs[0][1], Vs[1][0])), detV));
      const K01 = simplify(bin("/", bin("-", bin("*", Fs[0][1], Vs[0][0]), bin("*", Fs[0][0], Vs[0][1])), detV));
      const K10 = simplify(bin("/", bin("-", bin("*", Fs[1][0], Vs[1][1]), bin("*", Fs[1][1], Vs[1][0])), detV));
      const K11 = simplify(bin("/", bin("-", bin("*", Fs[1][1], Vs[0][0]), bin("*", Fs[1][0], Vs[0][1])), detV));
      const tr = simplify(bin("+", K00, K11));
      const detK = simplify(bin("-", bin("*", K00, K11), bin("*", K01, K10)));
      const disc = simplify(bin("-", bin("^", tr, num(2)), bin("*", num(4), detK)));
      r0expr = simplify(bin("/", bin("+", tr, { type: "call", name: "sqrt", args: [disc] }), num(2)));
    }
  }

  // Формула сверяется с численным R₀ из NGM
  let formula = null;
  if (r0expr) {
    const val = safeEval(r0expr, vars);
    if (Number.isFinite(val) && Math.abs(val - r0num) <= 1e-6 * (1 + Math.abs(r0num))) {
      formula = formulaText(r0expr);
    }
  }

  return {
    formula,
    Fm: Fs.map((row) => row.map((x) => formulaText(x))),
    Vm: Vs.map((row) => row.map((x) => formulaText(x))),
    infText: infected.map((nm, i) => termsToText(infTerms[i].inf)),
    restText: infected.map((nm, i) => termsToText(infTerms[i].rest)),
  };
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

  // Символьное «уравнение R₀» для показа (иначе null — покажем матрицы F/V)
  const eq = deriveR0Equation(structure, params, N, r0);

  return { ok: true, r0, infected, susceptible, F, V, eq };
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
    deriveR0Equation,
    derive,
    simplify,
    subst,
    termsToText,
  };
}