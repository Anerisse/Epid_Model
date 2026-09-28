// ============================================================
// core/analysis.ts — качественный анализ модели: R₀ и «уравнение R₀».
//
// Портирован из legacy/client/js/analysis.js на TypeScript.
// Универсальный расчёт базового репродуктивного числа R₀ методом
// матрицы следующего поколения (NGM, van den Driessche & Watmough)
// прямо по правым частям ОДУ, плюс мини-КАС для символьного вывода
// формулы (β/γ, β·σ/((σ+µ)·(γ+µ)) и т.п.). Если автоматика не
// справляется — пользователь задаёт формулу R₀ вручную.
// ============================================================

import {
  type AstNode,
  type ModelStructure,
  parseExpression,
  evaluateExpression,
  nodeToText,
  countUnaryMinus,
} from "./parser";

// Короткий вывод AST в текст
function nt(node: AstNode | null | undefined): string {
  return nodeToText(node);
}

// ------------------------------------------------------------------
// Разбивает правую часть на слагаемые со знаком
// (локальная копия splitSignedTerms из parser.ts — модуль самодостаточен).
// ------------------------------------------------------------------
export interface SignedTerm {
  sign: number;
  node: AstNode;
}

export function splitTerms(node: AstNode): SignedTerm[] {
  const parts: SignedTerm[] = [];
  (function collect(n: AstNode, sign: number): void {
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

// Содержит ли узел идентификатор с заданным именем
export function containsIdent(node: AstNode | null | undefined, name: string): boolean {
  if (!node) return false;
  if (node.type === "ident") return node.name === name;
  if (node.type === "unary") return containsIdent(node.operand, name);
  if (node.type === "bin") return containsIdent(node.left, name) || containsIdent(node.right, name);
  if (node.type === "call") return node.args.some((a) => containsIdent(a, name));
  return false;
}

// Значение суммы слагаемых в точке vars
function evalTerms(terms: SignedTerm[], vars: Record<string, number>): number {
  let sum = 0;
  terms.forEach((t) => {
    sum += t.sign * evaluateExpression(t.node, vars);
  });
  return sum;
}

// Центральная разность функции f по j-й переменной в точке x
function centralDiff(f: (x: number[]) => number, x: number[], j: number, h: number): number {
  const hi = x.slice();
  hi[j] += h;
  const lo = x.slice();
  lo[j] -= h;
  return (f(hi) - f(lo)) / (2 * h);
}

// Умножение матрицы на вектор
function matVec(a: number[][], x: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) {
    let s = 0;
    for (let k = 0; k < x.length; k++) s += a[i][k] * x[k];
    out.push(s);
  }
  return out;
}

export function matMul(a: number[][], b: number[][]): number[][] {
  const n = a.length;
  const m = b[0] ? b[0].length : 0;
  const out: number[][] = [];
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

export function matInv(m: number[][]): number[][] {
  const n = m.length;
  const a = m.map((row) => row.slice());
  const inv: number[][] = [];
  for (let i = 0; i < n; i++) {
    inv.push([]);
    for (let j = 0; j < n; j++) inv[i].push(i === j ? 1 : 0);
  }
  for (let col = 0; col < n; col++) {
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

// Спектральный радиус матрицы (степенная итерация)
export function spectralRadius(a: number[][]): number {
  const n = a.length;
  if (n === 1) return Math.abs(a[0][0]);
  let x: number[] = [];
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
    const dn = xn.map((v, i) => Math.abs(v - x[i])).reduce((s, v) => Math.max(s, v), 0);
    x = xn;
    if (dn < 1e-10) break;
  }
  return Math.abs(lambda);
}

// Итоговый знак слагаемого: знак из суммы ± унарные минусы
function termSign(term: SignedTerm): number {
  let sign = term.sign < 0 ? -1 : 1;
  if (countUnaryMinus(term.node) % 2 === 1) sign = -sign;
  return sign;
}

// ——— Символьная математика: вывод «уравнения R₀» из AST ———

function num(v: number): AstNode {
  return { type: "number", value: v };
}
function bin(op: string, l: AstNode, r: AstNode): AstNode {
  return { type: "bin", op, left: l, right: r };
}
function un(x: AstNode): AstNode {
  return { type: "unary", op: "-", operand: x };
}
function ident(name: string): AstNode {
  return { type: "ident", name };
}

function isZero(n: AstNode | null | undefined): boolean {
  return !!n && n.type === "number" && n.value === 0;
}
function isOne(n: AstNode | null | undefined): boolean {
  return !!n && n.type === "number" && n.value === 1;
}
function textEq(a: AstNode | null | undefined, b: AstNode | null | undefined): boolean {
  return a && b ? nt(a) === nt(b) : false;
}

// Узел с «свёрнутым» знаком внутрь
function signedNode(t: SignedTerm): AstNode {
  const s = termSign(t) < 0;
  const inner = countUnaryMinus(t.node) % 2 === 1;
  return s !== inner ? un(t.node!) : t.node;
}

// Плоский список множителей произведения
function flatFactors(node: AstNode | null | undefined, out: (AstNode | number)[]): (AstNode | number)[] {
  if (node && node.type === "bin" && node.op === "*") {
    flatFactors(node.left, out);
    flatFactors(node.right, out);
  } else if (node && node.type === "unary" && node.op === "-") {
    out.push(-1);
    flatFactors(node.operand, out);
  } else {
    out.push(node!);
  }
  return out;
}

// Разбиение узла на числовой коэффициент и список остальных множителей
function factorParts(node: AstNode): { coef: number; rest: AstNode[] } {
  const list = flatFactors(node, []);
  let coef = 1;
  const rest: AstNode[] = [];
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

// Сборка произведения обратно из множителей и коэффициента
function productNode(rest: AstNode[], coef: number): AstNode {
  if (!rest.length) return num(coef);
  let res: AstNode = rest[0];
  for (let i = 1; i < rest.length; i++) res = bin("*", res, rest[i]);
  if (coef === 0) return num(0);
  if (coef === 1) return res;
  if (coef === -1) return un(res);
  return bin("*", num(coef), res);
}

// Символьная производная узла AST по переменной name
export function derive(node: AstNode | null | undefined, name: string): AstNode {
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

// Подстановка идентификаторов в узел (для DFE: S→N, заражённые→0)
export function subst(node: AstNode, map: Record<string, AstNode>): AstNode {
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

// Разворачивает сумму в (знак, узел)
function signedItems(node: AstNode, sign: number): SignedTerm[] {
  const items: SignedTerm[] = [];
  (function flat(n: AstNode, s: number): void {
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

// Собирает сумму из (знак, узел), приводя подобные слагаемые
function rebuildSum(items: SignedTerm[]): AstNode {
  const groups = new Map<string, { node: AstNode; coef: number }>();
  items.forEach((it) => {
    const key = nt(it.node);
    const had = groups.get(key);
    groups.set(key, { node: it.node, coef: (had ? had.coef : 0) + it.sign });
  });
  let res: AstNode | null = null;
  groups.forEach((g) => {
    if (!g.coef) return;
    let t: AstNode;
    if (g.node.type === "number") t = num(g.coef * g.node.value);
    else if (g.coef === 1) t = g.node;
    else if (g.coef === -1) t = un(g.node);
    else t = bin("*", num(g.coef), g.node);
    res = res ? bin("+", res, t) : t;
  });
  return res || num(0);
}

function combineSums(a: AstNode, b: AstNode): AstNode {
  return rebuildSum(signedItems(a, 1).concat(signedItems(b, 1)));
}

// Упрощение выражений: свёртка констант, нейтральные элементы,
// сокращение общих множителей в дробях, sqrt(x²)→x и т.п.
export function simplify(node: AstNode | null | undefined): AstNode {
  if (!node) return num(0);
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
        if (fact.length === 2 && textEq(fact[0], fact[1])) {
          const p = bin("^", fact[0], num(2));
          return coef === 1 ? p : coef === -1 ? un(p) : bin("*", num(coef), p);
        }
        return productNode(fact, coef);
      }
      if (op === "/") {
        if (isZero(l)) return num(0);
        if (isOne(r)) return l;
        const rp0 = factorParts(r);
        if (rp0.rest.length === 0 && rp0.coef !== 0) {
          const np0 = factorParts(l);
          const coef = np0.coef / rp0.coef;
          if (!np0.rest.length) return num(coef);
          return simplify(productNode(np0.rest, coef));
        }
        const np = factorParts(l);
        const dp = factorParts(r);
        if (np.rest.length || dp.rest.length) {
          const numRest = np.rest.slice();
          const denRest: AstNode[] = [];
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

// Читаемый текст узла формулы R₀ (скобки по приоритетам операций)
const R0FORMULA_PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };

export function formulaText(node: AstNode | null | undefined): string {
  if (!node) return "";
  switch (node.type) {
    case "number":
      return String(node.value);
    case "ident":
      return node.name;
    case "unary": {
      const t = formulaText(node.operand);
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
      const wrap = (child: AstNode, text: string): string => {
        if (!child || child.type !== "bin") return text;
        const cp = R0FORMULA_PREC[child.op] || 0;
        if (cp < my) return `(${text})`;
        return text;
      };
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

// Текст суммы слагаемых {sign, node}
export function termsToText(parts: SignedTerm[]): string {
  let out = "";
  parts.forEach((t) => {
    const tx = formulaText(signedNode(t));
    if (!out) out = tx;
    else if (tx.startsWith("-")) out += " − " + tx.slice(1);
    else out += " + " + tx;
  });
  return out;
}

// Читаемая формула: «*» → «·»
export function prettyFormula(s: string | null | undefined): string {
  return String(s || "").replace(/\*/g, "·");
}

// Безопасное вычисление узла (для сверки формулы с численным R₀)
function safeEval(node: AstNode, vars: Record<string, number>): number {
  try {
    return evaluateExpression(node, vars);
  } catch {
    return NaN;
  }
}

// ------------------------------------------------------------------
// Символьное «уравнение R₀»: k=1 → F/V; k=2 → ρ(F·V⁻¹) через
// tr/√(tr²−4det); иначе — только матрицы F/V. Формула принимается,
// только если совпадает с численным R₀ (NGM).
// ------------------------------------------------------------------
export interface R0Equation {
  formula: string | null;
  Fm: string[][];
  Vm: string[][];
  infText: string[];
  restText: string[];
}

export function deriveR0Equation(
  structure: ModelStructure,
  params: Record<string, number>,
  pop: number,
  r0num: number,
): R0Equation | null {
  const { susceptible, infected } = classifyCompartments(structure);
  if (!infected.length || !susceptible.length) return null;
  const names = structure.compartments.map((c) => c.name);
  const k = infected.length;
  const hasN = Object.prototype.hasOwnProperty.call(params || {}, "N");

  const subMap: Record<string, AstNode> = {};
  names.forEach((n) => {
    subMap[n] = susceptible.includes(n) ? (hasN ? ident("N") : num(pop)) : num(0);
  });
  const vars: Record<string, number> = {};
  for (const key in params) vars[key] = params[key];
  if (!hasN) vars["N"] = pop;

  const infTerms: { inf: SignedTerm[]; rest: SignedTerm[] }[] = [];
  infected.forEach((name) => {
    const idx = names.indexOf(name);
    const terms = splitTerms(structure.compartments[idx].rhsAST);
    const inf: SignedTerm[] = [];
    const rest: SignedTerm[] = [];
    terms.forEach((t) => {
      const hasSus = susceptible.some((s) => containsIdent(t.node, s));
      const hasInf = infected.some((v) => containsIdent(t.node, v));
      if (hasSus && hasInf) inf.push(t);
      else rest.push(t);
    });
    infTerms.push({ inf, rest });
  });

  const sumOf = (parts: SignedTerm[]): AstNode => {
    if (!parts.length) return num(0);
    return parts.map(signedNode).reduce((a, b) => bin("+", a, b));
  };

  const Fs: AstNode[][] = [];
  const Vs: AstNode[][] = [];
  for (let i = 0; i < k; i++) {
    Fs.push([]);
    Vs.push([]);
    for (let j = 0; j < k; j++) {
      Fs[i].push(simplify(subst(derive(sumOf(infTerms[i].inf), infected[j]), subMap)));
      Vs[i].push(simplify(subst(un(derive(sumOf(infTerms[i].rest), infected[j])), subMap)));
    }
  }

  let r0expr: AstNode | null = null;
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

  let formula: string | null = null;
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
    infText: infected.map((_nm, i) => termsToText(infTerms[i].inf)),
    restText: infected.map((_nm, i) => termsToText(infTerms[i].rest)),
  };
}

// ------------------------------------------------------------------
// Автоматическое выделение «восприимчивых» и «заражённых» компартментов
// по правым частям ОДУ (передающие слагаемые с ≥2 компартментами +
// замыкание цепочек прогрессии).
// ------------------------------------------------------------------
export function classifyCompartments(structure: ModelStructure): {
  susceptible: string[];
  infected: string[];
} {
  const comps = structure.compartments;
  const names = comps.map((c) => c.name);
  const flows = structure.flows || [];
  const susceptible = new Set<string>();
  const infected = new Set<string>();

  comps.forEach((c) => {
    splitTerms(c.rhsAST).forEach((t) => {
      const inTerm = names.filter((n) => containsIdent(t.node, n));
      if (inTerm.length < 2) return;
      const sign = termSign(t);
      if (sign < 0 && inTerm.includes(c.name)) susceptible.add(c.name);
      inTerm.forEach((n) => {
        if (n !== c.name) infected.add(n);
      });
      if (sign > 0) infected.add(c.name);
    });
  });

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

  susceptible.forEach((s) => infected.delete(s));

  return {
    susceptible: names.filter((n) => susceptible.has(n)),
    infected: names.filter((n) => infected.has(n)),
  };
}

// ------------------------------------------------------------------
// R₀ методом матрицы следующего поколения.
// structure — структура из парсера; params — значения параметров;
// N — население в безболезненном равновесии (S* = N).
// ------------------------------------------------------------------
export type R0Result =
  | { ok: true; r0: number; infected: string[]; susceptible: string[]; F: number[][]; V: number[][]; eq: R0Equation | null }
  | { ok: false; error: string; infected?: string[]; susceptible?: string[] };

export function computeR0NGM(structure: ModelStructure, params: Record<string, number>, N: number): R0Result {
  const { susceptible, infected } = classifyCompartments(structure);
  if (!infected.length) {
    return { ok: false, error: "не удалось выделить заражённые компартменты" };
  }
  if (!susceptible.length) {
    return { ok: false, error: "не найден восприимчивый компартмент (источник заражения)" };
  }

  const names = structure.compartments.map((c) => c.name);
  const k = infected.length;
  const susSet = new Set(susceptible);

  const vars0: Record<string, number> = { t: 0 };
  names.forEach((n) => {
    vars0[n] = susSet.has(n) ? N : 0;
  });
  for (const key in params) {
    if (!(key in vars0)) vars0[key] = params[key];
  }

  const infTerms: { inf: SignedTerm[]; rest: SignedTerm[] }[] = [];
  infected.forEach((name) => {
    const idx = names.indexOf(name);
    const terms = splitTerms(structure.compartments[idx].rhsAST);
    const inf: SignedTerm[] = [];
    const rest: SignedTerm[] = [];
    terms.forEach((t) => {
      const hasSus = susceptible.some((s) => containsIdent(t.node, s));
      const hasInf = infected.some((v) => containsIdent(t.node, v));
      if (hasSus && hasInf) inf.push(t);
      else rest.push(t);
    });
    infTerms.push({ inf, rest });
  });

  const h = 1e-6;
  const makeVarFn = (i: number, which: "inf" | "rest") => (xv: number[]): number => {
    const vars = Object.assign({}, vars0);
    infected.forEach((nm, idx) => {
      vars[nm] = xv[idx];
    });
    return evalTerms(infTerms[i][which], vars);
  };

  const F: number[][] = [];
  const V: number[][] = [];
  for (let i = 0; i < k; i++) {
    F.push([]);
    V.push([]);
    const x0 = new Array(k).fill(0);
    for (let j = 0; j < k; j++) {
      F[i].push(centralDiff(makeVarFn(i, "inf"), x0, j, h));
      V[i].push(-centralDiff(makeVarFn(i, "rest"), x0, j, h));
    }
  }

  let r0: number;
  try {
    const Vinv = matInv(V);
    const K = matMul(F, Vinv);
    r0 = spectralRadius(K);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      infected,
      susceptible,
    };
  }

  if (!Number.isFinite(r0) || r0 < 0) {
    return { ok: false, error: "R₀ не удалось вычислить численно", infected, susceptible };
  }

  const eq = deriveR0Equation(structure, params, N, r0);

  return { ok: true, r0, infected, susceptible, F, V, eq };
}

// ------------------------------------------------------------------
// Итоговый размер эпидемии: корень 1 − x = e^(−R₀·x) бисекцией.
// Возвращает долю переболевших x ∈ [0, 1).
// ------------------------------------------------------------------
export function finalSizeFromR0(r0: number): number {
  if (!(r0 > 1)) return 0;
  const f = (x: number): number => 1 - x - Math.exp(-r0 * x);
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
// R₀ по пользовательской формуле (строка вида «β/γ»).
// ------------------------------------------------------------------
export function computeR0Manual(
  formula: string,
  params: Record<string, number>,
): { ok: true; r0: number } | { ok: false; error: string } {
  if (!String(formula || "").trim()) return { ok: false, error: "пустая формула" };
  try {
    const ast = parseExpression(String(formula).trim());
    const vars: Record<string, number> = {};
    for (const key in params) vars[key] = params[key];
    const r0 = evaluateExpression(ast, vars);
    if (!Number.isFinite(r0) || r0 < 0) {
      return { ok: false, error: "R₀ по формуле получился нечисловым или отрицательным" };
    }
    return { ok: true, r0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}