// ============================================================
// parser.js — парсер систем ОДУ эпидемиологических моделей.
// Чистый JS БЕЗ DOM: работает и в браузере (подключается через
// <script>, объявляет глобальные функции), и в Node для тестов
// (в конце есть защитный module.exports). Внешних зависимостей нет.
//
// Что умеет:
//   • разбирать строки вида  dS/dt = -β*S*I/N  или  S' = ...
//   • понимать греческие буквы (β, γ) и латинские алиасы (beta, gamma);
//   • строить дерево выражений (AST) для будущей симуляции;
//   • находить компартменты, параметры и потоки между ними (для
//     авто-блок-схемы, этап 2).
// ============================================================

// ------------------------------------------------------------------
// Соответствие латинских имён параметров греческим буквам.
// В редакторе (main.js) алиасы уже заменяются на символы, но парсер
// подстраховывается: «beta * S * I / N» и «β * S * I / N» разбираются
// одинаково. Имя отличается от того, что в main.js (GREEK_ALIASES),
// чтобы не было конфликта глобальных const при загрузке в браузере.
// ------------------------------------------------------------------
const PARAMETER_ALIASES = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε",
  zeta: "ζ", eta: "η", theta: "θ", lambda: "λ", mu: "μ", nu: "ν",
  xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ",
  chi: "χ", psi: "ψ", omega: "ω",
};

// ------------------------------------------------------------------
// Ошибка разбора. Сообщения пишем по-русски и понятно пользователю,
// чтобы их можно было показывать прямо в интерфейсе без перевода.
// ------------------------------------------------------------------
class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "ParseError";
  }
}

// Допустимые функции в выражениях: простые, для будущей симуляции.
const FUNCTIONS = {
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
const PRECEDENCE = { "+": 10, "-": 10, "*": 20, "/": 20, "^": 30 };
// Операторы с правой ассоциативностью: 2^3^2 = 2^(3^2)
const RIGHT_ASSOC = new Set(["^"]);

// ------------------------------------------------------------------
// Заменяет латинские имена параметров на греческие буквы.
// Используется перед разбором всей строки уравнения.
// ------------------------------------------------------------------
function replaceAliases(text) {
  let result = text;
  for (const [name, symbol] of Object.entries(PARAMETER_ALIASES)) {
    result = result.replace(new RegExp(`\\b${name}\\b`, "gi"), symbol);
  }
  return result;
}

// ------------------------------------------------------------------
// Токенизация: превращает строку выражения в список токенов.
// Типы: number (число), ident (переменная или функция), op (знак).
// Любой посторонний символ — ошибка ParseError с указанием позиции.
// ------------------------------------------------------------------
function tokenize(expr) {
  const tokens = [];
  let pos = 0;

  while (pos < expr.length) {
    const ch = expr[pos];

    // Пропускаем пробелы — на разбор не влияют
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

    throw new ParseError(
      `Неизвестный символ «${ch}» на позиции ${pos + 1}`
    );
  }

  return tokens;
}

// ------------------------------------------------------------------
// Класс-парсер выражений по алгоритму Пратта (precedence climbing).
// Строит дерево разбора (AST) из списка токенов.
// ------------------------------------------------------------------
class ExpressionParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  // Текущий токен без продвижения
  peek() {
    return this.tokens[this.pos];
  }

  // Берём следующий токен
  next() {
    return this.tokens[this.pos++];
  }

  // Разбор полного выражения; лишние токены — ошибка
  parse() {
    const node = this.parseExpression(0);
    const rest = this.peek();
    if (rest) {
      throw new ParseError(
        `Лишний токен «${rest.type === "op" ? rest.value : rest.name}» на позиции ${rest.pos + 1}`
      );
    }
    return node;
  }

  // Разбор выражения с заданным минимальным приоритетом
  parseExpression(minPrec) {
    let node = this.parsePrefix();
    if (!node) {
      const t = this.peek();
      throw new ParseError(
        t
          ? `Ожидалось число или переменная, а найдено «${t.type === "op" ? t.value : t.name}»`
          : "Неожиданный конец выражения"
      );
    }

    for (;;) {
      const t = this.peek();
      if (!t) break;

      // Неявное умножение: 2S, β S, S(I) понимаются как 2*S и т.п.
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

      if (t.type !== "op" || !(t.value in PRECEDENCE)) break;
      const prec = PRECEDENCE[t.value];
      if (prec < minPrec) break;

      this.next();
      const rightMin = RIGHT_ASSOC.has(t.value) ? prec : prec + 1;
      const right = this.parseExpression(rightMin);
      node = { type: "bin", op: t.value, left: node, right };
    }

    return node;
  }

  // Разбор префиксного выражения: унарный знак или «атом»
  parsePrefix() {
    const t = this.peek();
    if (!t) return null;

    // Унарный плюс/минус связывают слабее степени: -x^2 = -(x^2)
    if (t.type === "op" && (t.value === "+" || t.value === "-")) {
      this.next();
      const operand = this.parseExpression(PRECEDENCE["^"]); // 30
      return { type: "unary", op: t.value, operand };
    }

    return this.parseAtom();
  }

  // «Атом»: число, переменная, вызов функции или скобки
  parseAtom() {
    const t = this.next();

    if (t.type === "number") {
      return { type: "number", value: t.value };
    }

    if (t.type === "ident") {
      // Вызов функции, только если имя есть в списке FUNCTIONS;
      // иначе это обычная переменная (например, S(I) — это S * (I))
      if (this.peek() && this.peek().type === "op" && this.peek().value === "(" && FUNCTIONS[t.name]) {
        this.next(); // открывающая скобка
        const args = [];
        if (this.peek() && this.peek().type === "op" && this.peek().value === ")") {
          this.next(); // пустой список аргументов
        } else {
          for (;;) {
            args.push(this.parseExpression(0));
            const sep = this.next();
            if (!sep || (sep.type === "op" && sep.value === ")")) break;
            if (!sep || sep.type !== "op" || sep.value !== ",") {
              throw new ParseError(`Ожидалась запятая или «)» в вызове ${t.name}`);
            }
          }
        }
        return { type: "call", name: t.name, args };
      }
      return { type: "ident", name: t.name };
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

// ------------------------------------------------------------------
// Удобная обёртка: разобрать строку выражения в AST.
// ------------------------------------------------------------------
function parseExpression(text) {
  return new ExpressionParser(tokenize(text)).parse();
}

// ------------------------------------------------------------------
// Печать AST обратно в читаемый текст (например, «β*S*I/N»).
// Скобки добавляются только там, где без них меняется смысл.
// ------------------------------------------------------------------
function nodeToText(node) {
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
      const sameOrLower = (child, side) => {
        if (child.type !== "bin") return false;
        const childPrec = PRECEDENCE[child.op] || 0;
        const myPrec = PRECEDENCE[node.op] || 0;
        if (childPrec < myPrec) return true;
        // Для правой ассоциативности степень («2^3^2») справа требует скобок
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
// Каноническое представление поддерева для сравнения выражений.
// Множители в произведении сортируются, поэтому β*S*I и I*S*β
// считаются одним и тем же выражением (нужно для поиска потоков).
// ------------------------------------------------------------------
function canonicalNode(node) {
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
        const factors = [];
        collectFactors(node.left, factors);
        collectFactors(node.right, factors);
        factors.sort();
        return `m(${factors.join("|")})`;
      }
      if (node.op === "+") {
        const terms = [];
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
function collectFactors(node, out) {
  if (node.type === "bin" && node.op === "*") {
    collectFactors(node.left, out);
    collectFactors(node.right, out);
  } else {
    out.push(canonicalNode(node));
  }
}

// Собирает слагаемые суммы в плоский список
function collectTerms(node, out, sign) {
  if (node.type === "bin" && (node.op === "+" || node.op === "-")) {
    collectTerms(node.left, out, sign);
    collectTerms(node.right, out, node.op === "-" ? -sign : sign);
  } else {
    out.push((sign < 0 ? "-" : "") + canonicalNode(node));
  }
}

// ------------------------------------------------------------------
// Собирает все идентификаторы (переменные) из дерева выражения.
// ------------------------------------------------------------------
function collectIdents(node, out = new Set()) {
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

// Порядок появления идентификатора в выражении (для читаемого вывода)
function orderedIdents(node, list = []) {
  collectIdents(node).forEach((name) => {
    if (!list.includes(name)) list.push(name);
  });
  return list;
}

// ------------------------------------------------------------------
// Разбор одной строки уравнения:  dS/dt = ...  |  ∂S/∂t = ...  |  S' = ...
// Возвращает объект { имя, производная, знаменатель, текст, AST }.
// Строки-комментарии (#, //) и пустые строки дают null.
// ------------------------------------------------------------------
function parseEquationLine(line) {
  const trimmed = String(line).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#") || trimmed.startsWith("//")) return null;

  const text = replaceAliases(trimmed);

  // Шаблон производной: (d|∂) Переменная / (d|∂) Переменная  =  ...
  const deriv =
    /^(?:([d∂])\s*([\p{L}_][\p{L}\p{N}_]*)\s*\/\s*([d∂])\s*([\p{L}_][\p{L}\p{N}_]*))\s*=\s*([\s\S]*)$/u.exec(
      text
    );
  // Шаблон «со штрихом»: S' = ...
  const prime = /^([\p{L}_][\p{L}\p{N}_]*)\s*'\s*=\s*([\s\S]*)$/u.exec(text);

  let name, derivType, denominator, rhsText;
  if (deriv) {
    name = deriv[2];
    derivType = deriv[1]; // 'd' или '∂'
    denominator = deriv[4]; // обычно 't'
    rhsText = deriv[5];
  } else if (prime) {
    name = prime[1];
    derivType = "prime";
    denominator = null;
    rhsText = prime[2];
  } else {
    throw new ParseError(
      `Не удалось распознать левую часть «${trimmed.slice(0, 40)}…». ` +
        "Ожидается вид dS/dt = ... или S' = ..."
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
// dI/dt = β*S*I/N - γ*I  →  [{sign:+1, node:β*S*I/N}, {sign:-1, node:γ*I}]
// ------------------------------------------------------------------
function splitSignedTerms(node) {
  const parts = [];
  function collect(n, sign) {
    if (n.type === "bin" && (n.op === "+" || n.op === "-")) {
      collect(n.left, sign);
      collect(n.right, n.op === "-" ? -sign : sign);
    } else if (n.type === "unary" && n.op === "-") {
      // Снимаем унарный минус: -X — это то же слагаемое со знаком «минус»
      collect(n.operand, -sign);
    } else {
      parts.push({ sign, node: n });
    }
  }
  collect(node, 1);
  return parts;
}

// ------------------------------------------------------------------
// Сколько унарных минусов «спрятано» внутри слагаемого.
// Если их нечётное количество — всё слагаемое отрицательное.
// Нужно для случаев вида -β*S*I/N, где минус стоит у множителя β.
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
// Копия дерева без унарных минусов: -β*S*I/N превращается в
// β*S*I/N. Знак при этом учитывается отдельно, а «обезминусовая»
// форма нужна для поиска одинаковых слагаемых-двойников и подписей
// потоков (V*I/N выглядит одинаково в уравнениях S и I).
// ------------------------------------------------------------------
function removeNegatives(node) {
  if (!node) return node;
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

// ------------------------------------------------------------------
// Текст слагаемого «на единицу источника»: убираем из произведения
// один множитель-компартмент. β*S*I/N для источника S → «β*I/N»,
// µ*S → «µ», γ*I → «γ». Так подписи стрелок соответствуют классическим
// схемам компартментных моделей (переход S → I подписывается β*I/N —
// силой заражения на одного восприимчивого).
// ------------------------------------------------------------------
function labelWithoutFactor(node, name) {
  const numerator = [];
  const denominator = [];

  const collectProduct = (n, into) => {
    if (n.type === "bin" && n.op === "*") {
      collectProduct(n.left, into);
      collectProduct(n.right, into);
    } else if (n.type === "bin" && n.op === "/") {
      // Деление: множители числителя идут в числитель, знаменателя —
      // в знаменатель (β*S*I/N → числитель β·S·I, знаменатель N)
      collectProduct(n.left, into);
      collectProduct(n.right, denominator);
    } else {
      into.push(n);
    }
  };
  collectProduct(node, numerator);

  // Убираем один множитель-источник из числителя
  let removed = false;
  const rest = numerator.filter((f) => {
    if (!removed && f.type === "ident" && f.name === name) {
      removed = true;
      return false;
    }
    return true;
  });

  // Если источник не нашёлся среди множителей — возвращаем текст как есть
  const top = rest.map(nodeToText).join("*") || (removed ? "1" : nodeToText(node));
  const bottom = denominator.map(nodeToText).join("*");
  return bottom ? `${top}/${bottom}` : top;
}

// ------------------------------------------------------------------
// Вывод потоков между компартментами по слагаемым правых частей.
// Правила:
//   • положительное слагаемое γ*I в уравнении dR/dt → поток I → R,
//     подпись «на единицу источника» (γ вместо γ*I);
//   • положительное слагаемое β*S*I/N в dE/dt содержит S и I;
//     источник — компартмент, у которого есть такое же слагаемое
//     с минусом (в dS/dt), иначе просто другая переменная;
//   • «движители» (drivers) — компартменты слагаемого, кроме
//     источника и цели: для β*S*I/N это I. Люди переходят S → E,
//     а I лишь задаёт скорость перехода («сила заражения») — на схеме
//     от I к стрелке рисуется пунктирная дуга влияния;
//   • отрицательное слагаемое вида -µ*X, где X — сам компартмент
//     и у слагаемого нет положительного «двойника» (иными словами,
//     это потеря, а не переход), даёт поток «в никуда»:
//     { from: X, to: null, label: «µ» } — стрелка уходит из блока
//     без целевого компартмента (drivers пусты).
// ------------------------------------------------------------------
function inferFlows(equations) {
  const flows = [];
  const compSet = new Set(equations.map((e) => e.name));

  // Итоговый знак слагаемого: знак из суммы ± знак унарных минусов
  const termSign = (term) => {
    let sign = term.sign < 0 ? -1 : 1;
    if (countUnaryMinus(term.node) % 2 === 1) sign = -sign;
    return sign;
  };

  // Индекс «обезминусованных» слагаемых: канонический текст -> [(уравнение, знак)]
  const byCanon = new Map();
  equations.forEach((eq) => {
    splitSignedTerms(eq.rhs).forEach((term) => {
      const canon = canonicalNode(removeNegatives(term.node));
      if (!byCanon.has(canon)) byCanon.set(canon, []);
      byCanon.get(canon).push({ eq, sign: termSign(term) });
    });
  });

  const hasNegativeTwin = (canon, name) => {
    const list = byCanon.get(canon) || [];
    return list.some((x) => x.sign < 0 && x.eq.name === name);
  };

  const hasPositiveTwin = (canon) => {
    const list = byCanon.get(canon) || [];
    return list.some((x) => x.sign > 0);
  };

  equations.forEach((eq) => {
    splitSignedTerms(eq.rhs).forEach((term) => {
      const sign = termSign(term);
      const norm = removeNegatives(term.node);
      const canon = canonicalNode(norm);

      if (sign > 0) {
        // Внутренний переход: положительное слагаемое с компартментом
        const vars = orderedIdents(norm).filter((v) => compSet.has(v) && v !== eq.name);
        if (vars.length === 0) return;

        let from = vars[0];
        // Если в слагаемом несколько компартментов — источник тот,
        // у которого есть отрицательный «двойник» этого слагаемого
        const twin = vars.find((v) => hasNegativeTwin(canon, v));
        if (twin !== undefined) from = twin;

        const label = labelWithoutFactor(norm, from);
        // «Движители»: компартменты в слагаемом, кроме источника и цели
        const drivers = orderedIdents(norm).filter(
          (v) => compSet.has(v) && v !== from && v !== eq.name,
        );
        if (!flows.some((f) => f.from === from && f.to === eq.name)) {
          flows.push({ from, to: eq.name, label, drivers });
        }
      } else {
        // Потеря «в никуда»: отрицательное слагаемое, единственный
        // компартмент которого — сам компартмент, и у которого нет
        // положительного «двойника» (иначе это внутренний переход,
        // уже найденный выше по положительному слагаемому)
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
//
// Структура (сохраняется в models.structure, JSONB):
//   {
//     compartments: [{ name, derivType, denominator, rhs_text, rhs }],
//     parameters:   [ «β», «γ», «N» ],           // в порядке появления
//     time_vars:    [ «t» ],                     // переменные времени
//     functions:    [ ...используемые функции ],
//     flows:        [ { from, to, label, drivers } ]  // to === null — «потеря» в никуда; drivers — компартменты-«движители» (для β*S*I/N это I)
//   }
// Бросает ParseError с понятным русским сообщением.
// ------------------------------------------------------------------
function parseOdeSystem(text) {
  const lines = String(text).split(/\r?\n/);
  const equations = [];

  lines.forEach((line) => {
    const eq = parseEquationLine(line);
    if (eq) equations.push(eq);
  });

  if (equations.length === 0) {
    throw new ParseError(
      "Не найдено ни одного уравнения. Введите систему вида dS/dt = ..."
    );
  }

  // Дубликаты компартментов — ошибка
  const seen = new Set();
  equations.forEach((eq) => {
    if (seen.has(eq.name)) {
      throw new ParseError(
        `Переменная «${eq.name}» встречается в левых частях несколько раз`
      );
    }
    seen.add(eq.name);
  });

  // Параметры: все идентификаторы из правых частей, кроме
  // компартментов и переменных времени (знаменателей производных)
  const parameters = [];
  const paramSet = new Set();
  const timeVars = new Set();
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

  // Используемые функции (собираем из всех правых частей)
  const funcs = [];
  const walkCalls = (node) => {
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
      rhs: eq.rhs,
    })),
    parameters,
    time_vars: [...timeVars],
    functions: funcs,
    flows: inferFlows(equations),
  };
}

// ------------------------------------------------------------------
// «Безопасная» версия: не бросает исключение, а возвращает
// { ok: true, structure } или { ok: false, error: сообщение }.
// Удобна для интерфейса (тосты, подсветка ошибок).
// ------------------------------------------------------------------
function parseOdeSystemSafe(text) {
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
// Используется в тестах и пригодится для симуляции (этап 4).
// Неизвестная переменная или деление на ноль — ParseError.
// ------------------------------------------------------------------
function evaluateExpression(node, vars) {
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

// ------------------------------------------------------------------
// Защитный выход для запуска под Node (node --test): в браузере
// window.module отсутствует, и этот блок молча пропускается.
// ------------------------------------------------------------------
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ParseError,
    PARAMETER_ALIASES,
    tokenize,
    parseExpression,
    parseEquationLine,
    parseOdeSystem,
    parseOdeSystemSafe,
    evaluateExpression,
    nodeToText,
    canonicalNode,
    inferFlows,
  };
}