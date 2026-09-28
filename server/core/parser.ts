// ============================================================
// core/parser.ts — парсер систем ОДУ эпидемиологических моделей.
//
// Портирован 1-в-1 из legacy/client/js/parser.js (этап 1) на
// TypeScript. Чистый модуль без DOM и внешних зависимостей —
// работает и на сервере (Next.js), и под vitest.
//
// Что умеет:
//   • разбирать строки вида  dS/dt = -β*S*I/N  или  S' = ...
//   • понимать греческие буквы (β, γ) и латинские алиасы (beta, gamma);
//   • строить дерево выражений (AST) для симуляции;
//   • находить компартменты, параметры и потоки между ними (для
//     авто-блок-схемы).
// ============================================================

// --- Узлы AST -------------------------------------------------
export type AstNode =
  | { type: "number"; value: number }
  | { type: "ident"; name: string }
  | { type: "unary"; op: string; operand: AstNode }
  | { type: "call"; name: string; args: AstNode[] }
  | { type: "bin"; op: string; left: AstNode; right: AstNode };

// Одна разобранная строка уравнения
export interface ParsedEquation {
  name: string;
  derivType: string;
  denominator: string | null;
  rhs_text: string;
  rhs: AstNode;
}

// Поток между компартментами (to === null — «потеря» в никуда)
export interface Flow {
  from: string;
  to: string | null;
  label: string;
  drivers: string[];
}

// Компартмент в структуре. rhsAST — дерево разбора правой части,
// нужно симуляции (РК4) и качественному анализу (NGM). При передаче
// структуры клиенту/в БД AST отбрасывается (lightStructure).
export interface CompartmentInfo {
  name: string;
  derivType: string;
  denominator: string | null;
  rhs_text: string;
  rhsAST: AstNode;
}

// «Лёгкая» структура без AST — для ответа API и хранения в SQLite.
// Дерево разбора примешивается только на время вычислений на сервере.
export interface ModelStructureLight {
  compartments: { name: string; derivType: string; denominator: string | null; rhs_text: string }[];
  parameters: string[];
  time_vars: string[];
  functions: string[];
  flows: Flow[];
}

export function lightStructure(s: ModelStructure): ModelStructureLight {
  return {
    compartments: s.compartments.map((c) => ({
      name: c.name,
      derivType: c.derivType,
      denominator: c.denominator,
      rhs_text: c.rhs_text,
    })),
    parameters: s.parameters,
    time_vars: s.time_vars,
    functions: s.functions,
    flows: s.flows,
  };
}

// Полная структура модели (сохраняется в models.structure)
export interface ModelStructure {
  compartments: CompartmentInfo[];
  parameters: string[];
  time_vars: string[];
  functions: string[];
  flows: Flow[];
}

// Результат безопасного разбора
export type SafeParse =
  | { ok: true; structure: ModelStructure }
  | { ok: false; error: string };

// ------------------------------------------------------------------
// Соответствие латинских имён параметров греческим буквам: «beta» и
// «β» разбираются одинаково.
// ------------------------------------------------------------------
export const PARAMETER_ALIASES: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε",
  zeta: "ζ", eta: "η", theta: "θ", lambda: "λ", mu: "μ", nu: "ν",
  xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ",
  chi: "χ", psi: "ψ", omega: "ω",
};

// Ошибка разбора с понятным русским сообщением
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

// Допустимые функции в выражениях
export const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
};

// Приоритеты бинарных операторов (чем больше, тем «сильнее» связывает)
const PRECEDENCE: Record<string, number> = { "+": 10, "-": 10, "*": 20, "/": 20, "^": 30 };
// Операторы с правой ассоциативностью: 2^3^2 = 2^(3^2)
const RIGHT_ASSOC = new Set(["^"]);

// ------------------------------------------------------------------
// Заменяет латинские имена параметров на греческие буквы.
// ------------------------------------------------------------------
export function replaceAliases(text: string): string {
  let result = text;
  for (const [name, symbol] of Object.entries(PARAMETER_ALIASES)) {
    result = result.replace(new RegExp(`\\b${name}\\b`, "gi"), symbol);
  }
  return result;
}

export interface Token {
  type: "number" | "ident" | "op";
  value?: number | string;
  name?: string;
  pos: number;
}

// ------------------------------------------------------------------
// Токенизация: строка выражения → список токенов.
// ------------------------------------------------------------------
export function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < expr.length) {
    const ch = expr[pos];

    // Пропускаем пробелы
    if (/\s/.test(ch)) {
      pos++;
      continue;
    }

    // Число: 12, 3.14, .5, 2e3
    const numMatch = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(expr.slice(pos));
    if (numMatch) {
      tokens.push({ type: "number", value: parseFloat(numMatch[0]), pos });
      pos += numMatch[0].length;
      continue;
    }

    // Идентификатор: буквы (в т.ч. греческие) + цифры + подчёркивание
    const idMatch = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(expr.slice(pos));
    if (idMatch) {
      tokens.push({ type: "ident", name: idMatch[0], pos });
      pos += idMatch[0].length;
      continue;
    }

    // Односимвольные операторы
    if ("+-*/^(),".includes(ch)) {
      tokens.push({ type: "op", value: ch, pos });
      pos++;
      continue;
    }

    throw new ParseError(`Неизвестный символ «${ch}» на позиции ${pos + 1}`);
  }

  return tokens;
}

// ------------------------------------------------------------------
// Парсер выражений по алгоритму Пратта (precedence climbing).
// ------------------------------------------------------------------
class ExpressionParser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  parse(): AstNode {
    const node = this.parseExpression(0);
    const rest = this.peek();
    if (rest) {
      throw new ParseError(
        `Лишний токен «${rest.type === "op" ? rest.value : rest.name}» на позиции ${rest.pos + 1}`,
      );
    }
    return node;
  }

  parseExpression(minPrec: number): AstNode {
    const prefix = this.parsePrefix();
    if (!prefix) {
      const t = this.peek();
      throw new ParseError(
        t
          ? `Ожидалось число или переменная, а найдено «${t.type === "op" ? t.value : t.name}»`
          : "Неожиданный конец выражения",
      );
    }
    let node: AstNode = prefix;

    for (;;) {
      const t = this.peek();
      if (!t) break;

      // Неявное умножение: 2S, β S, S(I) понимаются как 2*S
      if (
        t.type === "ident" ||
        t.type === "number" ||
        (t.type === "op" && t.value === "(")
      ) {
        node = {
          type: "bin",
          op: "*",
          left: node,
          right: this.parseExpression(PRECEDENCE["*"] + 1),
        };
        continue;
      }

      if (t.type !== "op" || typeof t.value !== "string" || !(t.value in PRECEDENCE)) break;
      const prec = PRECEDENCE[t.value];
      if (prec < minPrec) break;

      this.next();
      const rightMin = RIGHT_ASSOC.has(t.value) ? prec : prec + 1;
      const right = this.parseExpression(rightMin);
      node = { type: "bin", op: t.value, left: node, right };
    }

    return node;
  }

  parsePrefix(): AstNode | null {
    const t = this.peek();
    if (!t) return null;

    // Унарный плюс/минус связывают слабее степени: -x^2 = -(x^2)
    if (t.type === "op" && (t.value === "+" || t.value === "-")) {
      this.next();
      const operand = this.parseExpression(PRECEDENCE["^"]);
      return { type: "unary", op: t.value!, operand };
    }

    return this.parseAtom();
  }

  parseAtom(): AstNode {
    const t = this.next();
    if (!t) throw new ParseError("Неожиданный конец выражения");

    if (t.type === "number") {
      return { type: "number", value: t.value as number };
    }

    if (t.type === "ident") {
      const name = t.name!;
      // Вызов функции — только если имя есть в FUNCTIONS
      const next = this.peek();
      if (next && next.type === "op" && next.value === "(" && FUNCTIONS[name]) {
        this.next(); // открывающая скобка
        const args: AstNode[] = [];
        const afterBracket = this.peek();
        if (afterBracket && afterBracket.type === "op" && afterBracket.value === ")") {
          this.next(); // пустой список аргументов
        } else {
          for (;;) {
            args.push(this.parseExpression(0));
            const sep = this.next();
            if (!sep || (sep.type === "op" && sep.value === ")")) break;
            if (!sep || sep.type !== "op" || sep.value !== ",") {
              throw new ParseError(`Ожидалась запятая или «)» в вызове ${name}`);
            }
          }
        }
        return { type: "call", name, args };
      }
      return { type: "ident", name };
    }

    if (t.type === "op" && t.value === "(") {
      const inner = this.parseExpression(0);
      const close = this.next();
      if (!close || close.type !== "op" || close.value !== ")") {
        throw new ParseError("Не хватает закрывающей скобки )");
      }
      return inner;
    }

    throw new ParseError(`Неожиданный символ «${t.value}»`);
  }
}

// Удобная обёртка: разобрать строку выражения в AST
export function parseExpression(text: string): AstNode {
  return new ExpressionParser(tokenize(text)).parse();
}

// ------------------------------------------------------------------
// Печать AST в читаемый текст (скобки — только где без них меняется смысл).
// ------------------------------------------------------------------
export function nodeToText(node: AstNode | null | undefined): string {
  if (!node) return "";
  switch (node.type) {
    case "number":
      return String(node.value);
    case "ident":
      return node.name;
    case "unary":
      return node.op === "-" ? `-${nodeToText(node.operand)}` : nodeToText(node.operand);
    case "call":
      return `${node.name}(${node.args.map(nodeToText).join(", ")})`;
    case "bin": {
      const left = nodeToText(node.left);
      const right = nodeToText(node.right);
      const sameOrLower = (child: AstNode, side: "left" | "right"): boolean => {
        if (child.type !== "bin") return false;
        const childPrec = PRECEDENCE[child.op] || 0;
        const myPrec = PRECEDENCE[node.op] || 0;
        if (childPrec < myPrec) return true;
        if (childPrec === myPrec && RIGHT_ASSOC.has(node.op) && side === "right") return true;
        return false;
      };
      return `${sameOrLower(node.left, "left") ? `(${left})` : left}${node.op}${
        sameOrLower(node.right, "right") ? `(${right})` : right
      }`;
    }
    default:
      return "";
  }
}

// ------------------------------------------------------------------
// Каноническое представление поддерева для сравнения выражений:
// множители произведения сортируются, поэтому β*S*I и I*S*β равны.
// ------------------------------------------------------------------
export function canonicalNode(node: AstNode): string {
  switch (node.type) {
    case "number":
      return `n(${node.value})`;
    case "ident":
      return `v(${node.name})`;
    case "unary":
      return `u(${canonicalNode(node.operand)})`;
    case "call":
      return `c(${node.name},${node.args.map(canonicalNode).join(",")})`;
    case "bin": {
      if (node.op === "*") {
        const factors: string[] = [];
        collectFactors(node.left, factors);
        collectFactors(node.right, factors);
        factors.sort();
        return `m(${factors.join("|")})`;
      }
      if (node.op === "+") {
        const terms: string[] = [];
        collectTerms(node.left, terms, 1);
        collectTerms(node.right, terms, 1);
        terms.sort();
        return `s(${terms.join("|")})`;
      }
      return `b(${node.op},${canonicalNode(node.left)},${canonicalNode(node.right)})`;
    }
    default:
      return "";
  }
}

// Собирает множители произведения в плоский список
function collectFactors(node: AstNode, out: string[]): void {
  if (node.type === "bin" && node.op === "*") {
    collectFactors(node.left, out);
    collectFactors(node.right, out);
  } else {
    out.push(canonicalNode(node));
  }
}

// Собирает слагаемые суммы в плоский список со знаками
function collectTerms(node: AstNode, out: string[], sign: number): void {
  if (node.type === "bin" && (node.op === "+" || node.op === "-")) {
    collectTerms(node.left, out, sign);
    collectTerms(node.right, out, node.op === "-" ? -sign : sign);
  } else {
    out.push((sign < 0 ? "-" : "") + canonicalNode(node));
  }
}

// ------------------------------------------------------------------
// Собирает все идентификаторы (переменные) из дерева.
// ------------------------------------------------------------------
export function collectIdents(node: AstNode, out: Set<string> = new Set()): Set<string> {
  switch (node.type) {
    case "ident":
      out.add(node.name);
      break;
    case "unary":
      collectIdents(node.operand, out);
      break;
    case "call":
      node.args.forEach((a) => collectIdents(a, out));
      break;
    case "bin":
      collectIdents(node.left, out);
      collectIdents(node.right, out);
      break;
    default:
      break;
  }
  return out;
}

// Порядок появления идентификатора в выражении
export function orderedIdents(node: AstNode, list: string[] = []): string[] {
  collectIdents(node).forEach((name) => {
    if (!list.includes(name)) list.push(name);
  });
  return list;
}

// ------------------------------------------------------------------
// Разбор одной строки уравнения:  dS/dt = ...  |  ∂S/∂t = ...  |  S' = ...
// ------------------------------------------------------------------
export function parseEquationLine(line: string): ParsedEquation | null {
  const trimmed = String(line).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#") || trimmed.startsWith("//")) return null;

  const text = replaceAliases(trimmed);

  const deriv =
    /^(?:([d∂])\s*([\p{L}_][\p{L}\p{N}_]*)\s*\/\s*([d∂])\s*([\p{L}_][\p{L}\p{N}_]*))\s*=\s*([\s\S]*)$/u.exec(
      text,
    );
  const prime = /^([\p{L}_][\p{L}\p{N}_]*)\s*'\s*=\s*([\s\S]*)$/u.exec(text);

  let name: string;
  let derivType: string;
  let denominator: string | null;
  let rhsText: string;
  if (deriv) {
    name = deriv[2];
    derivType = deriv[1];
    denominator = deriv[4];
    rhsText = deriv[5];
  } else if (prime) {
    name = prime[1];
    derivType = "prime";
    denominator = null;
    rhsText = prime[2];
  } else {
    throw new ParseError(
      `Не удалось распознать левую часть «${trimmed.slice(0, 40)}…». ` +
        "Ожидается вид dS/dt = ... или S' = ...",
    );
  }

  const rhsClean = rhsText.trim();
  if (!rhsClean) {
    throw new ParseError(`У уравнения ${name} пустая правая часть`);
  }

  return {
    name,
    derivType,
    denominator,
    rhs_text: rhsClean,
    rhs: parseExpression(rhsClean),
  };
}

// ------------------------------------------------------------------
// Разбивает правую часть на слагаемые с их знаком.
// ------------------------------------------------------------------
export interface SignedTerm {
  sign: number;
  node: AstNode;
}

export function splitSignedTerms(node: AstNode): SignedTerm[] {
  const parts: SignedTerm[] = [];
  function collect(n: AstNode, sign: number): void {
    if (n.type === "bin" && (n.op === "+" || n.op === "-")) {
      collect(n.left, sign);
      collect(n.right, n.op === "-" ? -sign : sign);
    } else if (n.type === "unary" && n.op === "-") {
      collect(n.operand, -sign);
    } else {
      parts.push({ sign, node: n });
    }
  }
  collect(node, 1);
  return parts;
}

// Сколько унарных минусов «спрятано» внутри слагаемого
export function countUnaryMinus(node: AstNode | null | undefined): number {
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

// Копия дерева без унарных минусов
function removeNegatives(node: AstNode): AstNode {
  switch (node.type) {
    case "unary":
      return removeNegatives(node.operand);
    case "bin":
      return { ...node, left: removeNegatives(node.left), right: removeNegatives(node.right) };
    case "call":
      return { ...node, args: node.args.map(removeNegatives) };
    default:
      return node;
  }
}

// Текст слагаемого «на единицу источника»: убираем один множитель-компартмент
function labelWithoutFactor(node: AstNode, name: string): string {
  const numerator: AstNode[] = [];
  const denominator: AstNode[] = [];

  const collectProduct = (n: AstNode, into: AstNode[]): void => {
    if (n.type === "bin" && n.op === "*") {
      collectProduct(n.left, into);
      collectProduct(n.right, into);
    } else if (n.type === "bin" && n.op === "/") {
      collectProduct(n.left, into);
      collectProduct(n.right, denominator);
    } else {
      into.push(n);
    }
  };
  collectProduct(node, numerator);

  let removed = false;
  const rest = numerator.filter((f) => {
    if (!removed && f.type === "ident" && f.name === name) {
      removed = true;
      return false;
    }
    return true;
  });

  const top = rest.map(nodeToText).join("*") || (removed ? "1" : nodeToText(node));
  const bottom = denominator.map(nodeToText).join("*");
  return bottom ? `${top}/${bottom}` : top;
}

// ------------------------------------------------------------------
// Вывод потоков между компартментами по слагаемым правых частей
// (положительные — переходы, отрицательные «одиночные» — потери
// «в никуда», drivers — компартменты-«движители» вида I в β*S*I/N).
// ------------------------------------------------------------------
export function inferFlows(equations: ParsedEquation[]): Flow[] {
  const flows: Flow[] = [];
  const compSet = new Set(equations.map((e) => e.name));

  const termSign = (term: SignedTerm): number => {
    let sign = term.sign < 0 ? -1 : 1;
    if (countUnaryMinus(term.node) % 2 === 1) sign = -sign;
    return sign;
  };

  const byCanon = new Map<string, { eq: ParsedEquation; sign: number }[]>();
  equations.forEach((eq) => {
    splitSignedTerms(eq.rhs).forEach((term) => {
      const canon = canonicalNode(removeNegatives(term.node));
      if (!byCanon.has(canon)) byCanon.set(canon, []);
      byCanon.get(canon)!.push({ eq, sign: termSign(term) });
    });
  });

  const hasNegativeTwin = (canon: string, name: string): boolean => {
    const list = byCanon.get(canon) || [];
    return list.some((x) => x.sign < 0 && x.eq.name === name);
  };

  const hasPositiveTwin = (canon: string): boolean => {
    const list = byCanon.get(canon) || [];
    return list.some((x) => x.sign > 0);
  };

  equations.forEach((eq) => {
    splitSignedTerms(eq.rhs).forEach((term) => {
      const sign = termSign(term);
      const norm = removeNegatives(term.node);
      const canon = canonicalNode(norm);

      if (sign > 0) {
        const vars = orderedIdents(norm).filter((v) => compSet.has(v) && v !== eq.name);
        if (vars.length === 0) return;

        let from = vars[0];
        const twin = vars.find((v) => hasNegativeTwin(canon, v));
        if (twin !== undefined) from = twin;

        const label = labelWithoutFactor(norm, from);
        const drivers = orderedIdents(norm).filter(
          (v) => compSet.has(v) && v !== from && v !== eq.name,
        );
        if (!flows.some((f) => f.from === from && f.to === eq.name)) {
          flows.push({ from, to: eq.name, label, drivers });
        }
      } else {
        const ownCompartments = orderedIdents(norm).filter((v) => compSet.has(v));
        if (ownCompartments.length !== 1 || ownCompartments[0] !== eq.name) return;
        if (hasPositiveTwin(canon)) return;

        const label = labelWithoutFactor(norm, eq.name);
        if (!flows.some((f) => f.from === eq.name && f.to === null)) {
          flows.push({ from: eq.name, to: null, label, drivers: [] });
        }
      }
    });
  });

  return flows;
}

// ------------------------------------------------------------------
// Главная функция: разбирает текст системы ОДУ в структуру модели.
// Бросает ParseError с понятным русским сообщением.
// ------------------------------------------------------------------
export function parseOdeSystem(text: string): ModelStructure {
  const lines = String(text).split(/\r?\n/);
  const equations: ParsedEquation[] = [];

  lines.forEach((line) => {
    const eq = parseEquationLine(line);
    if (eq) equations.push(eq);
  });

  if (equations.length === 0) {
    throw new ParseError("Не найдено ни одного уравнения. Введите систему вида dS/dt = ...");
  }

  const seen = new Set<string>();
  equations.forEach((eq) => {
    if (seen.has(eq.name)) {
      throw new ParseError(`Переменная «${eq.name}» встречается в левых частях несколько раз`);
    }
    seen.add(eq.name);
  });

  const parameters: string[] = [];
  const paramSet = new Set<string>();
  const timeVars = new Set<string>();
  equations.forEach((eq) => {
    if (eq.denominator) timeVars.add(eq.denominator);
    orderedIdents(eq.rhs).forEach((name) => {
      if (seen.has(name) || timeVars.has(name)) return;
      if (!paramSet.has(name)) {
        paramSet.add(name);
        parameters.push(name);
      }
    });
  });

  const funcs: string[] = [];
  const walkCalls = (node: AstNode | null | undefined): void => {
    if (!node) return;
    if (node.type === "call") {
      if (!funcs.includes(node.name)) funcs.push(node.name);
      node.args.forEach(walkCalls);
    } else if (node.type === "bin") {
      walkCalls(node.left);
      walkCalls(node.right);
    } else if (node.type === "unary") {
      walkCalls(node.operand);
    }
  };
  equations.forEach((eq) => walkCalls(eq.rhs));

  return {
    compartments: equations.map((eq) => ({
      name: eq.name,
      derivType: eq.derivType,
      denominator: eq.denominator,
      rhs_text: eq.rhs_text,
      rhsAST: eq.rhs,
    })),
    parameters,
    time_vars: [...timeVars],
    functions: funcs,
    flows: inferFlows(equations),
  };
}

// «Безопасная» версия: не бросает исключение
export function parseOdeSystemSafe(text: string): SafeParse {
  try {
    return { ok: true, structure: parseOdeSystem(text) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ParseError ? error.message : String(error),
    };
  }
}

// ------------------------------------------------------------------
// Вычисление значения выражения по переменным.
// ------------------------------------------------------------------
export function evaluateExpression(node: AstNode, vars: Record<string, number>): number {
  switch (node.type) {
    case "number":
      return node.value;
    case "ident": {
      if (!(node.name in vars)) {
        throw new ParseError(`Неизвестная переменная «${node.name}» при вычислении`);
      }
      return vars[node.name];
    }
    case "unary":
      return node.op === "-" ? -evaluateExpression(node.operand, vars) : evaluateExpression(node.operand, vars);
    case "bin": {
      const left = evaluateExpression(node.left, vars);
      const right = evaluateExpression(node.right, vars);
      switch (node.op) {
        case "+": return left + right;
        case "-": return left - right;
        case "*": return left * right;
        case "/":
          if (right === 0) throw new ParseError("Деление на ноль в выражении");
          return left / right;
        case "^": return Math.pow(left, right);
        default:
          throw new ParseError(`Неизвестный оператор «${node.op}»`);
      }
    }
    case "call": {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new ParseError(`Неизвестная функция «${node.name}»`);
      const args = node.args.map((a) => evaluateExpression(a, vars));
      return fn(...args);
    }
    default:
      throw new ParseError("Некорректное выражение");
  }
}