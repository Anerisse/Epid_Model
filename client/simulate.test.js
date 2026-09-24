// ============================================================
// simulate.test.js — тесты численного ядра симуляции (этап 4)
// Запуск: node --test client/simulate.test.js (без npm-зависимостей)
// ============================================================
const test = require("node:test");
const assert = require("node:assert");
const { parseOdeSystem, evaluateExpression } = require("./js/parser.js");
const { niceMax, makeDerivative, rk4Integrate } = require("./js/simulate.js");

// Вспомогательная: собирает производные системы из текста ОДУ
function buildDerivative(text, params) {
  const s = parseOdeSystem(text);
  const names = s.compartments.map((c) => c.name);
  const rhsAsts = s.compartments.map((c) => c.rhs);
  return { names, deriv: makeDerivative(names, rhsAsts, params, evaluateExpression) };
}

test("niceMax округляет к «красивым» значениям шкалы", () => {
  assert.strictEqual(niceMax(732), 1000);
  assert.strictEqual(niceMax(120), 200);
  assert.strictEqual(niceMax(5), 5);
  assert.strictEqual(niceMax(0.45), 0.5);
  assert.strictEqual(niceMax(0.03), 0.05);
  assert.strictEqual(niceMax(0), 1);
  assert.strictEqual(niceMax(-7), 1);
});

test("РК4 корректно решает dy/dt = -y (сравнение с экспонентой)", () => {
  const res = rk4Integrate((y) => [-y[0]], [1], 1.0, 0.01);
  const last = res.series[0][res.series[0].length - 1];
  // Точное решение: y(1) = e^-1 ≈ 0.3679
  assert.ok(Math.abs(last - Math.exp(-1)) < 1e-3, `получено ${last}`);
  // Сеть времени: от 0 до 1 с шагом 0.01 → 101 точка
  assert.strictEqual(res.time.length, 101);
  assert.strictEqual(res.time[0], 0);
  assert.ok(Math.abs(res.time[100] - 1.0) < 1e-9);
});

test("SIR: сумма S+I+R постоянна, кривая I с пиком внутри интервала", () => {
  const { names, deriv } = buildDerivative(
    "dS/dt = -β*S*I/N\ndI/dt = β*S*I/N - γ*I\ndR/dt = γ*I",
    { β: 0.5, γ: 0.2, N: 1000 },
  );
  assert.deepStrictEqual(names, ["S", "I", "R"]);

  const res = rk4Integrate(deriv, [990, 10, 0], 100, 0.05);

  // Популяция сохраняется (в модели нет смертности)
  for (let i = 0; i < res.series[0].length; i++) {
    const sum = res.series[0][i] + res.series[1][i] + res.series[2][i];
    assert.ok(Math.abs(sum - 1000) < 0.1, `шаг ${i}: сумма ${sum}`);
  }

  // Пик эпидемии — внутри интервала, а не на краях
  let peak = 0;
  let peakIdx = 0;
  res.series[1].forEach((v, i) => {
    if (v > peak) {
      peak = v;
      peakIdx = i;
    }
  });
  assert.ok(peakIdx > 0 && peakIdx < res.series[1].length - 1, `пик на краю: idx=${peakIdx}`);
  assert.ok(peak > 100, `слишком низкий пик: ${peak}`);

  // К концу эпидемии почти все переболели
  const finalR = res.series[2][res.series[2].length - 1];
  assert.ok(finalR > 800, `мало переболевших: ${finalR}`);
});

test("SEIR с μ: популяция убывает из-за смертности", () => {
  const { names, deriv } = buildDerivative(
    "dS/dt = -β*S*I/N - μ*S\ndE/dt = β*S*I/N - σ*E - μ*E\ndI/dt = σ*E - γ*I - μ*I\ndR/dt = γ*I - μ*R",
    { β: 0.6, σ: 0.3, γ: 0.2, μ: 0.03, N: 1000 },
  );
  assert.deepStrictEqual(names, ["S", "E", "I", "R"]);

  const res = rk4Integrate(deriv, [990, 0, 10, 0], 150, 0.05);
  const sumAt = (i) => res.series[0][i] + res.series[1][i] + res.series[2][i] + res.series[3][i];

  // Смертность μ «съедает» часть популяции
  const sum0 = sumAt(0);
  const sumLast = sumAt(res.series[0].length - 1);
  assert.ok(sumLast < sum0 - 1, `сумма не убывает: ${sum0} → ${sumLast}`);
  assert.ok(sumLast > 0, `популяция «исчезла»: ${sumLast}`);

  // Ни одна кривая не должна уходить в «минус» сверх допустимой погрешности
  for (let c = 0; c < names.length; c++) {
    for (let i = 0; i < res.series[c].length; i++) {
      assert.ok(res.series[c][i] > -1e-8, `${names[c]}[${i}] = ${res.series[c][i]}`);
    }
  }
});

test("расходящееся решение прерывается ошибкой, а не «тихим NaN»", () => {
  assert.throws(
    () => {
      const { deriv } = buildDerivative("dX/dt = X*X*X", {});
      rk4Integrate(deriv, [1], 5, 0.1);
    },
    /расходится|нечислов/i,
  );
});