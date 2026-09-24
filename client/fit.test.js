// ============================================================
// fit.test.js — тесты параметризации (этап 5)
// Запуск: node --test client/fit.test.js (без npm-зависимостей)
// Проверяем ядро МНК: разбор данных, начальные условия, интеграцию
// модели по дням, сходимость Нелдера–Мида и восстановление
// «истинных» параметров из синтетических данных.
// ============================================================
const test = require("node:test");
const assert = require("node:assert");
const { parseOdeSystem } = require("./js/parser.js");
const {
  MIN_DATA_POINTS,
  parseFitData,
  fitInitialCondition,
  simulateAtDays,
  nelderMead,
  fitParameters,
} = require("./js/fit.js");

// Модель SIR без смертности — классика для проверки подгонки
function makeSIR() {
  return parseOdeSystem(
    "dS/dt = -β*S*I/N\ndI/dt = β*S*I/N - γ*I\ndR/dt = γ*I",
  );
}

test("parseFitData: «день число» по строкам, время нормируется к нулю", () => {
  const r = parseFitData("5 10\n7 18\n9 42");
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.data, [
    { t: 0, value: 10 },
    { t: 2, value: 18 },
    { t: 4, value: 42 },
  ]);
});

test("parseFitData: одиночные числа = дни по порядку; пара «день,значение» тоже работает", () => {
  const single = parseFitData("5\n8\n21");
  assert.strictEqual(single.ok, true);
  assert.deepStrictEqual(single.data, [
    { t: 0, value: 5 },
    { t: 1, value: 8 },
    { t: 2, value: 21 },
  ]);

  const pair = parseFitData("0 5\n2, 8\n4 21");
  assert.strictEqual(pair.ok, true);
  assert.deepStrictEqual(pair.data, [
    { t: 0, value: 5 },
    { t: 2, value: 8 },
    { t: 4, value: 21 },
  ]);
});

test("parseFitData: отбрасывает мусор и слишком мало точек", () => {
  assert.strictEqual(parseFitData("abc 12").ok, false);
  assert.strictEqual(parseFitData("0 5\n-3 7").ok, false);
  assert.strictEqual(parseFitData("0 1\n2 2").ok, false); // меньше MIN_DATA_POINTS
});

test("fitInitialCondition: I₀ из первого наблюдения, S₀ = N − I₀", () => {
  const parsed = makeSIR();
  const names = parsed.compartments.map((c) => c.name);
  const init = fitInitialCondition(names, [{ t: 0, value: 40 }], 10000);
  assert.strictEqual(init[0], 9960); // S
  assert.strictEqual(init[1], 40); // I
  assert.strictEqual(init[2], 0); // R
});

test("simulateAtDays: значения в заданные дни, начинаются с I₀ = первое наблюдение", () => {
  const parsed = makeSIR();
  const names = parsed.compartments.map((c) => c.name);
  const init = fitInitialCondition(names, [{ t: 0, value: 100 }], 10000);
  const vals = simulateAtDays(parsed, { β: 0.5, γ: 0.2, N: 10000 }, init, "I", [0, 5, 10], 0.05);
  assert.strictEqual(vals.length, 3);
  assert.ok(Math.abs(vals[0] - 100) < 1, `I(0) должно быть ≈ 100, получено ${vals[0]}`);
  // При R₀ = 2.5 кривая I растёт: на 5-й день заражённых больше, чем в нуле
  assert.ok(vals[1] > 100, `I(5) должно расти: ${vals[1]}`);
  assert.ok(vals[2] > vals[1], `I(10) должно расти: ${vals[1]} → ${vals[2]}`);
});

test("nelderMead: находит минимум простой параболы (x-3)² + (y+1)²", () => {
  const f = (x) => (x[0] - 3) ** 2 + (x[1] + 1) ** 2;
  const res = nelderMead(f, [0, 0], [[-10, 10], [-10, 10]], { maxIter: 300 });
  assert.ok(Math.abs(res.x[0] - 3) < 1e-3, `x = ${res.x[0]}`);
  assert.ok(Math.abs(res.x[1] + 1) < 1e-3, `y = ${res.x[1]}`);
  assert.ok(Math.abs(res.fx) < 1e-6, `fx = ${res.fx}`);
});

test("fitParameters восстанавливает β и γ из «чистых» синтетических данных", () => {
  const parsed = makeSIR();
  const names = parsed.compartments.map((c) => c.name);
  const N = 10000;
  const trueParams = { β: 0.45, γ: 0.18, N };
  const days = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18];

  // Данные «как в природе»: моделируем с истинными параметрами
  const init = fitInitialCondition(names, [{ t: 0, value: 100 }], N);
  const vals = simulateAtDays(parsed, trueParams, init, "I", days, 0.05);
  const data = days.map((d, i) => ({ t: d, value: vals[i] }));

  const res = fitParameters(parsed, { N }, ["β", "γ"], data, { N });
  assert.strictEqual(res.ok, true, res.error);
  // Истинные параметры должны восстановиться с хорошей точностью
  assert.ok(Math.abs(res.params["β"] - 0.45) < 0.02, `β = ${res.params["β"]}`);
  assert.ok(Math.abs(res.params["γ"] - 0.18) < 0.02, `γ = ${res.params["γ"]}`);
  // RMSE мал (данные чисто модельные), R² ≈ 1
  assert.ok(res.rmse < 1, `RMSE = ${res.rmse}`);
  assert.ok(res.r2 > 0.999, `R² = ${res.r2}`);
});

test("fitParameters: N подставляется автоматически, даже если его нет в fixed", () => {
  const parsed = makeSIR();
  const names = parsed.compartments.map((c) => c.name);
  const N = 10000;
  const trueParams = { β: 0.45, γ: 0.18, N };
  const days = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18];

  const init = fitInitialCondition(names, [{ t: 0, value: 100 }], N);
  const vals = simulateAtDays(parsed, trueParams, init, "I", days, 0.05);
  const data = days.map((d, i) => ({ t: d, value: vals[i] }));

  // fixed пустой, N только в opts — как читается со слайдера в UI
  const res = fitParameters(parsed, {}, ["β", "γ"], data, { N });
  assert.strictEqual(res.ok, true, res.error);
  assert.ok(Math.abs(res.params["β"] - 0.45) < 0.02, `β = ${res.params["β"]}`);
  assert.ok(Math.abs(res.params["γ"] - 0.18) < 0.02, `γ = ${res.params["γ"]}`);
});

test("fitParameters: отдаёт понятные ошибки без данных и без параметров", () => {
  const parsed = makeSIR();
  assert.strictEqual(fitParameters(parsed, { N: 10000 }, ["β"], null, {}).ok, false);
  assert.strictEqual(
    fitParameters(parsed, { N: 10000 }, ["β"], [{ t: 0, value: 1 }, { t: 1, value: 2 }], {}).ok,
    false,
  );
  assert.ok(fitParameters(parsed, { N: 10000 }, [], [{ t: 0, value: 1 }, { t: 1, value: 2 }, { t: 2, value: 3 }], {}).ok === false);
});