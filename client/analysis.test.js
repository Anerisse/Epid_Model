// ============================================================
// analysis.test.js — тесты качественного анализа (R₀ через NGM).
// Запуск: node --test client/analysis.test.js (без npm-зависимостей)
// ============================================================
const test = require("node:test");
const assert = require("node:assert");
const { parseOdeSystem } = require("./js/parser.js");
const {
  classifyCompartments,
  computeR0NGM,
  finalSizeFromR0,
  computeR0Manual,
  matInv,
  spectralRadius,
} = require("./js/analysis.js");

// Вспомогательная: собирает структуру модели из текста ОДУ
function structure(text) {
  return parseOdeSystem(text);
}

test("classifyCompartments: SIR — восприимчивые {S}, заражённые {I}", () => {
  const s = structure("dS/dt = -β*S*I/N\ndI/dt = β*S*I/N - γ*I\ndR/dt = γ*I");
  const c = classifyCompartments(s);
  assert.deepStrictEqual(c.susceptible, ["S"]);
  assert.deepStrictEqual(c.infected, ["I"]);
});

test("classifyCompartments: SEIR — заражённые {E, I}", () => {
  const s = structure(
    "dS/dt = -β*S*I/N\ndE/dt = β*S*I/N - σ*E\ndI/dt = σ*E - γ*I\ndR/dt = γ*I",
  );
  const c = classifyCompartments(s);
  assert.deepStrictEqual(c.susceptible, ["S"]);
  assert.deepStrictEqual(c.infected, ["E", "I"]);
});

test("classifyCompartments: SEIRS (возврат иммунитета) — {E, I}, R не заражён", () => {
  const s = structure(
    "dS/dt = -β*S*I/N + δ*R\ndE/dt = β*S*I/N - σ*E\ndI/dt = σ*E - γ*I\ndR/dt = γ*I - δ*R",
  );
  const c = classifyCompartments(s);
  assert.deepStrictEqual(c.infected, ["E", "I"]);
});

test("R₀ для SIR = β/γ", () => {
  const s = structure("dS/dt = -β*S*I/N\ndI/dt = β*S*I/N - γ*I\ndR/dt = γ*I");
  const r = computeR0NGM(s, { β: 0.5, γ: 0.2, N: 1000 }, 1000);
  assert.strictEqual(r.ok, true);
  assert.ok(Math.abs(r.r0 - 0.5 / 0.2) < 1e-6, `R₀ = ${r.r0}, ожидалось 2.5`);
});

test("R₀ для SEIR (без смертности) = β/γ", () => {
  const s = structure(
    "dS/dt = -β*S*I/N\ndE/dt = β*S*I/N - σ*E\ndI/dt = σ*E - γ*I\ndR/dt = γ*I",
  );
  const r = computeR0NGM(s, { β: 0.5, σ: 0.3, γ: 0.2, N: 1000 }, 1000);
  assert.strictEqual(r.ok, true);
  assert.ok(Math.abs(r.r0 - 0.5 / 0.2) < 1e-6, `R₀ = ${r.r0}`);
});

test("R₀ для SEIR со смертностью µ = βσ/((σ+µ)(γ+µ))", () => {
  const s = structure(
    "dS/dt = -β*S*I/N\ndE/dt = β*S*I/N - σ*E - µ*E\ndI/dt = σ*E - γ*I - µ*I\ndR/dt = γ*I",
  );
  const β = 0.5, σ = 0.3, γ = 0.2, µ = 0.02;
  const r = computeR0NGM(s, { β, σ, γ, µ, N: 1000 }, 1000);
  assert.strictEqual(r.ok, true);
  const expect = (β * σ) / ((σ + µ) * (γ + µ));
  assert.ok(Math.abs(r.r0 - expect) / expect < 1e-6, `R₀ = ${r.r0}, ожидалось ${expect}`);
});

test("R₀ для SIRD (смерть из I) = β/(γ+µ)", () => {
  const s = structure(
    "dS/dt = -β*S*I/N\ndI/dt = β*S*I/N - γ*I - µ*I\ndR/dt = γ*I\ndD/dt = µ*I",
  );
  const r = computeR0NGM(s, { β: 0.5, γ: 0.2, µ: 0.1, N: 1000 }, 1000);
  assert.strictEqual(r.ok, true);
  assert.ok(Math.abs(r.r0 - 0.5 / 0.3) < 1e-6, `R₀ = ${r.r0}`);
});

test("R₀ для SIS = β/γ", () => {
  const s = structure("dS/dt = -β*S*I/N + γ*I\ndI/dt = β*S*I/N - γ*I");
  const r = computeR0NGM(s, { β: 0.6, γ: 0.3, N: 100 }, 100);
  assert.strictEqual(r.ok, true);
  assert.ok(Math.abs(r.r0 - 2.0) < 1e-6, `R₀ = ${r.r0}`);
});

test("R₀ при отсутствии оттока из заражённых → ошибка (SI-модель)", () => {
  const s = structure("dS/dt = -β*S*I/N\ndI/dt = β*S*I/N");
  const r = computeR0NGM(s, { β: 0.5, N: 1000 }, 1000);
  assert.strictEqual(r.ok, false);
  assert.ok(/вырождена|R₀/.test(r.error));
});

test("R₀ вручную: формула β/γ с текущими параметрами", () => {
  const m = computeR0Manual("β/γ", { β: 0.5, γ: 0.2 });
  assert.strictEqual(m.ok, true);
  assert.ok(Math.abs(m.r0 - 2.5) < 1e-12);
  const bad = computeR0Manual("β/неизвестная", { β: 0.5 });
  assert.strictEqual(bad.ok, false);
});

test("finalSizeFromR0: решение 1−x = e^(−R₀·x)", () => {
  // R₀ = 2.5 → x ≈ 0.893 (классическое значение для SIR)
  const x25 = finalSizeFromR0(2.5);
  assert.ok(Math.abs(x25 - 0.8931) < 1e-3, `x = ${x25}`);
  // R₀ ≤ 1 → эпидемия не разрастается, итог = 0
  assert.strictEqual(finalSizeFromR0(1), 0);
  assert.strictEqual(finalSizeFromR0(0.5), 0);
  // Монотонность: чем больше R₀, тем больше итог
  assert.ok(finalSizeFromR0(5) > finalSizeFromR0(2));
});

test("matInv и spectralRadius — корректность матричных операций", () => {
  const inv = matInv([[2, 0], [0, 4]]);
  assert.ok(Math.abs(inv[0][0] - 0.5) < 1e-12);
  assert.ok(Math.abs(inv[1][1] - 0.25) < 1e-12);
  assert.ok(Math.abs(spectralRadius([[3, 1], [0, 2]]) - 3) < 1e-6);
  assert.strictEqual(spectralRadius([[7]]), 7);
});

test("NGM даёт одинаковый R₀ для разных N (инвариантность масштаба)", () => {
  const s = structure("dS/dt = -β*S*I/N\ndI/dt = β*S*I/N - γ*I\ndR/dt = γ*I");
  const r1 = computeR0NGM(s, { β: 0.5, γ: 0.2, N: 1000 }, 1000);
  const r2 = computeR0NGM(s, { β: 0.5, γ: 0.2, N: 100000 }, 100000);
  assert.ok(Math.abs(r1.r0 - r2.r0) < 1e-9);
});