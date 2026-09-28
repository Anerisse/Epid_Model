// ============================================================
// diagram.test.js — тесты раскладки авто-блок-схемы (этап 2).
// Запуск из корня репозитория:
//   node --test client/parser.test.js client/diagram.test.js
// Без npm-зависимостей: только встроенные node:test и node:assert.
// ============================================================
const { test } = require("node:test");
const assert = require("node:assert");

const { orderCompartments, layoutBoxes, compartmentColor, redirectFlows } = require("./js/diagram.js");

// ------------------------------------------------------------------
// Порядок компартментов по потокам (топологическая сортировка)
// ------------------------------------------------------------------
test("SIR: потоки S→I→R дают порядок S, I, R", () => {
  const order = orderCompartments(["S", "I", "R"], [
    { from: "S", to: "I" },
    { from: "I", to: "R" },
  ]);
  assert.deepEqual(order, ["S", "I", "R"]);
});

test("SEIR: потоки S→E, E→I, I→R дают порядок S, E, I, R", () => {
  const order = orderCompartments(["S", "E", "I", "R"], [
    { from: "S", to: "E" },
    { from: "E", to: "I" },
    { from: "I", to: "R" },
  ]);
  assert.deepEqual(order, ["S", "E", "I", "R"]);
});

test("компартмент без потоков не ломает порядок цепочки", () => {
  // «A» и «B» не участвуют в потоках — добавляются в конец как есть,
  // а относительный порядок S → I → R сохраняется
  const order = orderCompartments(["A", "S", "I", "R", "B"], [
    { from: "S", to: "I" },
    { from: "I", to: "R" },
  ]);
  assert.ok(order.indexOf("S") < order.indexOf("I"));
  assert.ok(order.indexOf("I") < order.indexOf("R"));
  assert.ok(order.includes("A") && order.includes("B"));
});

test("вырожденный граф без потоков — порядок ввода сохраняется", () => {
  const order = orderCompartments(["X", "Y", "Z"], []);
  assert.deepEqual(order, ["X", "Y", "Z"]);
});

test("цикл потоков не зацикливает сортировку", () => {
  // A⇄B — цикл: ни один узел не попадает в «очередь Кана» (все с входами),
  // сортировка обязана спокойно вернуть исходный порядок
  const order = orderCompartments(["A", "B"], [
    { from: "A", to: "B" },
    { from: "B", to: "A" },
  ]);
  assert.deepEqual(order, ["A", "B"]);
});

// ------------------------------------------------------------------
// Позиции блоков на холсте
// ------------------------------------------------------------------
test("4 компартмента — одна строка, центры внутри холста, y одинаков", () => {
  const boxes = layoutBoxes(["S", "E", "I", "R"], 800, 300);
  const values = Object.values(boxes);
  values.forEach((b) => {
    assert.ok(b.x > 0 && b.x < 800, `x=${b.x} вне холста`);
    assert.ok(b.y > 0 && b.y < 300, `y=${b.y} вне холста`);
  });
  assert.ok(values.every((b) => b.y === values[0].y), "все блоки в одной строке");
  // Порядок слева направо совпадает с порядком списка
  const xs = ["S", "E", "I", "R"].map((n) => boxes[n].x);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b), "центры расставлены слева направо");
});

test("9 компартментов — корневая сетка (по 3 в ряд), все внутри холста", () => {
  const names = ["A", "B", "C", "D", "E", "F", "G", "H", "K"];
  const boxes = layoutBoxes(names, 800, 500);
  names.forEach((n) => {
    const b = boxes[n];
    assert.ok(b.x > 0 && b.x < 800, `x=${b.x} вне холста`);
    assert.ok(b.y > 0 && b.y < 500, `y=${b.y} вне холста`);
  });
  // Блоки одной строки (индексы 0-2, 3-5, 6-8) — на одной высоте,
  // строки идут сверху вниз
  assert.strictEqual(boxes["A"].y, boxes["B"].y);
  assert.strictEqual(boxes["B"].y, boxes["C"].y);
  assert.strictEqual(boxes["D"].y, boxes["E"].y);
  assert.strictEqual(boxes["G"].y, boxes["H"].y);
  assert.ok(boxes["A"].y < boxes["D"].y);
  assert.ok(boxes["D"].y < boxes["G"].y);
});

test("одиночный компартмент — блок в центре холста", () => {
  const boxes = layoutBoxes(["S"], 600, 400);
  assert.strictEqual(boxes["S"].x, 300);
  assert.strictEqual(boxes["S"].y, 200);
});

// ------------------------------------------------------------------
// Цвета блоков
// ------------------------------------------------------------------
test("известные компартменты имеют тематический цвет", () => {
  assert.strictEqual(compartmentColor("S", 0), "#10b981");
  assert.strictEqual(compartmentColor("I", 1), "#f43f5e");
  assert.strictEqual(compartmentColor("R", 2), "#0ea5e9");
});

test("неизвестный компартмент получает цвет из палитры по индексу", () => {
  const c1 = compartmentColor("М", 0);
  const c2 = compartmentColor("М", 1);
  assert.notStrictEqual(c1, c2, "разные индексы — разные цвета палитры");
});

// ------------------------------------------------------------------
// Ручное перенаправление потоков (fallback этапа 2)
// ------------------------------------------------------------------
test("redirectFlows по умолчанию не меняет потоки (правил нет)", () => {
  const flows = [
    { from: "S", to: "E", label: "β*I/N", drivers: ["I"] },
    { from: "E", to: "I", label: "σ", drivers: [] },
    { from: "S", to: null, label: "μ", drivers: [] },
  ];
  // FLOW_REDIRECTS пуст: схема рисует потоки так, как вывел парсер
  assert.deepEqual(redirectFlows(flows), flows);
});

test("redirectFlows применяет переданное правило по совпадению источника и подписи", () => {
  const flows = [
    { from: "S", to: "E", label: "β*I/N", drivers: ["I"] },
    { from: "E", to: "I", label: "σ", drivers: [] },
  ];
  const out = redirectFlows(flows, [{ from: "S", label: "β*I/N", to: "I" }]);
  // Правило перенаправляет только совпавший поток
  assert.strictEqual(out[0].to, "I");
  assert.strictEqual(out[1].to, "I"); // без совпадения — без изменений
});

test("redirectFlows не трогает потоки, не совпавшие с правилами", () => {
  const flows = [{ from: "X", to: "Y", label: "k" }];
  assert.deepEqual(redirectFlows(flows), flows);
});