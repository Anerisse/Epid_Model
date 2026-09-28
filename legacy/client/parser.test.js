// ============================================================
// parser.test.js — тесты парсера систем ОДУ (этап 1).
// Запуск из корня репозитория:  node --test client/parser.test.js
// Без npm-зависимостей: только встроенные node:test и node:assert.
// ============================================================
const { test } = require("node:test");
const assert = require("node:assert");

const {
  tokenize,
  parseExpression,
  parseEquationLine,
  parseOdeSystem,
  parseOdeSystemSafe,
  evaluateExpression,
  nodeToText,
  ParseError,
} = require("./js/parser.js");

// ------------------------------------------------------------------
// Токенизация
// ------------------------------------------------------------------
test("токенизация чисел, переменных и операторов", () => {
  const tokens = tokenize("β*S*I/N + 2.5");
  assert.deepEqual(
    tokens.map((t) => (t.type === "number" ? t.value : t.type === "ident" ? t.name : t.value)),
    ["β", "*", "S", "*", "I", "/", "N", "+", 2.5]
  );
});

test("токенизация неизвестного символа бросает ParseError", () => {
  assert.throws(() => tokenize("S + ?"), ParseError);
});

// ------------------------------------------------------------------
// Разбор выражений: приоритеты и скобки
// ------------------------------------------------------------------
test("приоритет операторов: 2+3*4 = 14", () => {
  const ast = parseExpression("2+3*4");
  assert.strictEqual(evaluateExpression(ast, {}), 14);
});

test("скобки меняют приоритет: (2+3)*4 = 20", () => {
  const ast = parseExpression("(2+3)*4");
  assert.strictEqual(evaluateExpression(ast, {}), 20);
});

test("степень правой ассоциативности: 2^3^2 = 512", () => {
  const ast = parseExpression("2^3^2");
  assert.strictEqual(evaluateExpression(ast, {}), 512);
});

test("унарный минус слабее степени: -2^2 = -4", () => {
  const ast = parseExpression("-2^2");
  assert.strictEqual(evaluateExpression(ast, {}), -4);
});

test("неявное умножение: 2S = 2*S", () => {
  const ast = parseExpression("2S");
  assert.strictEqual(evaluateExpression(ast, { S: 5 }), 10);
});

test("вызов функции sqrt(9) = 3", () => {
  const ast = parseExpression("sqrt(9)");
  assert.strictEqual(evaluateExpression(ast, {}), 3);
});

test("вызов функции с двумя аргументами min(3, 7) = 3", () => {
  const ast = parseExpression("min(3,7)");
  assert.strictEqual(evaluateExpression(ast, {}), 3);
});

test("S(I) понимается как умножение S*I", () => {
  const ast = parseExpression("S(I)");
  assert.strictEqual(evaluateExpression(ast, { S: 2, I: 3 }), 6);
});

test("незакрытая скобка бросает ParseError", () => {
  assert.throws(() => parseExpression("(2+3"), ParseError);
});

test("вычисление с неизвестной переменной бросает ParseError", () => {
  assert.throws(() => evaluateExpression(parseExpression("x+1"), {}), ParseError);
});

test("деление на ноль бросает ParseError", () => {
  assert.throws(() => evaluateExpression(parseExpression("1/0"), {}), ParseError);
});

test("обратная печать AST: 2*(3+4)", () => {
  assert.strictEqual(nodeToText(parseExpression("2*(3+4)")), "2*(3+4)");
});

// ------------------------------------------------------------------
// Разбор строк уравнений
// ------------------------------------------------------------------
test("разбор строки dS/dt = -β*S*I/N", () => {
  const eq = parseEquationLine("dS/dt = -β*S*I/N");
  assert.strictEqual(eq.name, "S");
  assert.strictEqual(eq.derivType, "d");
  assert.strictEqual(eq.denominator, "t");
  assert.strictEqual(eq.rhs_text, "-β*S*I/N");
  // проверка вычисления: β=0.3, S=100, I=10, N=1000
  assert.strictEqual(
    Math.round(evaluateExpression(eq.rhs, { β: 0.3, S: 100, I: 10, N: 1000 }) * 1000) / 1000,
    -0.3
  );
});

test("разбор строки с частной производной ∂I/∂t", () => {
  const eq = parseEquationLine("∂I/∂t = β*S*I/N - γ*I");
  assert.strictEqual(eq.name, "I");
  assert.strictEqual(eq.derivType, "∂");
  assert.strictEqual(eq.denominator, "t");
});

test("разбор строки со штрихом S' = ...", () => {
  const eq = parseEquationLine("S' = -β*S*I/N");
  assert.strictEqual(eq.name, "S");
  assert.strictEqual(eq.derivType, "prime");
});

test("пробелы вокруг знаков не мешают разбору", () => {
  const eq = parseEquationLine("dS / dt = - β * S * I / N");
  assert.strictEqual(eq.name, "S");
  assert.strictEqual(eq.rhs_text, "- β * S * I / N");
});

test("латинские алиасы вместо греческих букв", () => {
  const eq = parseEquationLine("dS/dt = -beta*S*I/N");
  assert.strictEqual(eq.rhs_text, "-β*S*I/N");
});

test("некорректная левая часть бросает ParseError", () => {
  assert.throws(() => parseEquationLine("S = -β*S*I"), ParseError);
});

test("пустая правая часть бросает ParseError", () => {
  assert.throws(() => parseEquationLine("dS/dt ="), ParseError);
});

// ------------------------------------------------------------------
// Разбор целой системы ОДУ (SIR)
// ------------------------------------------------------------------
const SIR_TEXT = [
  "dS/dt = -β*S*I/N",
  "# это комментарий",
  "dI/dt = β*S*I/N - γ*I",
  "",
  "dR/dt = γ*I",
  "// и это тоже комментарий",
].join("\n");

test("полный разбор SIR: компартменты", () => {
  const s = parseOdeSystem(SIR_TEXT);
  assert.deepEqual(
    s.compartments.map((c) => c.name),
    ["S", "I", "R"]
  );
});

test("полный разбор SIR: параметры в порядке появления", () => {
  const s = parseOdeSystem(SIR_TEXT);
  // Порядок = первый раз, когда параметр встречается в тексте:
  // β из первого уравнения, N там же (β*S*I/N), γ только во втором
  assert.deepEqual(s.parameters, ["β", "N", "γ"]);
});

test("полный разбор SIR: переменные времени", () => {
  const s = parseOdeSystem(SIR_TEXT);
  assert.deepEqual(s.time_vars, ["t"]);
});

test("полный разбор SIR: потоки S→I и I→R с подписями «на единицу источника»", () => {
  const s = parseOdeSystem(SIR_TEXT);
  assert.deepEqual(s.flows, [
    { from: "S", to: "I", label: "β*I/N", drivers: [] }, // β*S*I/N без множителя S
    { from: "I", to: "R", label: "γ", drivers: [] },     // γ*I без множителя I
  ]);
});

test("полный разбор SIR: в термине β*S*I/N нет «движителей»", () => {
  const s = parseOdeSystem(SIR_TEXT);
  // В SIR источник S и цель I — оба компартмента слагаемого, I уже цель,
  // поэтому дополнительных «движителей» нет
  assert.deepEqual(s.flows[0].drivers, []);
});

test("SEIR: потоки и потери (to: null) с подписями «на единицу источника»", () => {
  const s = parseOdeSystem(
    [
      "dS/dt = -β*S*I/N - μ*S",
      "dE/dt = β*S*I/N - σ*E - μ*E",
      "dI/dt = σ*E - γ*I - μ*I",
      "dR/dt = γ*I - μ*R",
    ].join("\n")
  );

  const sortFlows = (arr) =>
    arr.slice().sort((a, b) => (a.from + "|" + a.to).localeCompare(b.from + "|" + b.to));

  assert.deepEqual(sortFlows(s.flows), sortFlows([
    { from: "S", to: "E", label: "β*I/N", drivers: ["I"] }, // люди S → E, скорость задаёт I
    { from: "E", to: "I", label: "σ", drivers: [] },         // инкубация E → I
    { from: "I", to: "R", label: "γ", drivers: [] },         // выздоровление I → R
    { from: "S", to: null, label: "μ", drivers: [] },        // смертность — «в никуда»
    { from: "E", to: null, label: "μ", drivers: [] },
    { from: "I", to: null, label: "μ", drivers: [] },
    { from: "R", to: null, label: "μ", drivers: [] },
  ]));
});

test("SEIR: поток S→E имеет «движителем» I (сила заражения)", () => {
  const s = parseOdeSystem(
    [
      "dS/dt = -β*S*I/N - μ*S",
      "dE/dt = β*S*I/N - σ*E - μ*E",
      "dI/dt = σ*E - γ*I - μ*I",
      "dR/dt = γ*I - μ*R",
    ].join("\n")
  );
  const bean = s.flows.find((f) => f.from === "S" && f.to === "E");
  assert.deepEqual(bean.drivers, ["I"]);
});

test("дубликат компартмента — ошибка", () => {
  assert.throws(
    () => parseOdeSystem("dS/dt = -a*S\ndS/dt = -b*S"),
    /несколько раз/
  );
});

test("пустой ввод — ошибка с подсказкой", () => {
  assert.throws(() => parseOdeSystem("   \n# только комментарий\n"), /Не найдено ни одного уравнения/);
});

test("переменная времени t не попадает в параметры", () => {
  const s = parseOdeSystem("dS/dt = -r*S");
  assert.deepEqual(s.parameters, ["r"]);
  assert.deepEqual(s.time_vars, ["t"]);
});

// ------------------------------------------------------------------
// Безопасная версия и ошибки
// ------------------------------------------------------------------
test("parseOdeSystemSafe возвращает структуру при успехе", () => {
  const r = parseOdeSystemSafe("dS/dt = -β*S");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.structure.compartments[0].name, "S");
});

test("parseOdeSystemSafe возвращает сообщение об ошибке", () => {
  const r = parseOdeSystemSafe("ошибка тут");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(typeof r.error, "string");
});