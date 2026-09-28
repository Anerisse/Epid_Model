// core/fit.test.ts — тесты МНК-параметризации (порт legacy fit.test.js).
import { describe, expect, it } from "vitest";
import { parseOdeSystem } from "./parser";
import {
  fitInitialCondition,
  fitParameters,
  generateSyntheticData,
  nelderMead,
  parseFitData,
  simulateAtDays,
} from "./fit";

// Модель SIR без смертности — классика для проверки подгонки
function makeSIR() {
  return parseOdeSystem("dS/dt = -β*S*I/N\ndI/dt = β*S*I/N - γ*I\ndR/dt = γ*I");
}

describe("разбор данных наблюдений", () => {
  it("«день число» по строкам, время нормируется к нулю", () => {
    const r = parseFitData("5 10\n7 18\n9 42");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual([
        { t: 0, value: 10 },
        { t: 2, value: 18 },
        { t: 4, value: 42 },
      ]);
    }
  });

  it("одиночные числа = дни по порядку; пара «день,значение» тоже работает", () => {
    const single = parseFitData("5\n8\n21");
    expect(single.ok).toBe(true);
    if (single.ok) {
      expect(single.data).toEqual([
        { t: 0, value: 5 },
        { t: 1, value: 8 },
        { t: 2, value: 21 },
      ]);
    }
    const pair = parseFitData("0 5\n2, 8\n4 21");
    expect(pair.ok).toBe(true);
    if (pair.ok) {
      expect(pair.data).toEqual([
        { t: 0, value: 5 },
        { t: 2, value: 8 },
        { t: 4, value: 21 },
      ]);
    }
  });

  it("отбрасывает мусор и слишком мало точек", () => {
    expect(parseFitData("abc 12").ok).toBe(false);
    expect(parseFitData("0 5\n-3 7").ok).toBe(false);
    expect(parseFitData("0 1\n2 2").ok).toBe(false);
  });
});

describe("начальные условия и интеграция по дням", () => {
  it("fitInitialCondition: I₀ из первого наблюдения, S₀ = N − I₀", () => {
    const parsed = makeSIR();
    const init = fitInitialCondition(
      parsed.compartments.map((c) => c.name),
      [{ t: 0, value: 40 }],
      10000,
    );
    expect(init).toEqual([9960, 40, 0]);
  });

  it("simulateAtDays: значения в заданные дни начинаются с I₀", () => {
    const parsed = makeSIR();
    const init = fitInitialCondition(
      parsed.compartments.map((c) => c.name),
      [{ t: 0, value: 100 }],
      10000,
    );
    const vals = simulateAtDays(parsed, { β: 0.5, γ: 0.2, N: 10000 }, init, "I", [0, 5, 10], 0.05);
    expect(vals.length).toBe(3);
    expect(Math.abs(vals[0] - 100)).toBeLessThan(1);
    expect(vals[1]).toBeGreaterThan(100);
    expect(vals[2]).toBeGreaterThan(vals[1]);
  });
});

describe("Нелдер–Мид", () => {
  it("находит минимум параболы (x-3)² + (y+1)²", () => {
    const f = (x: number[]) => (x[0] - 3) ** 2 + (x[1] + 1) ** 2;
    const res = nelderMead(f, [0, 0], [[-10, 10], [-10, 10]], { maxIter: 400 });
    expect(Math.abs(res.x[0] - 3)).toBeLessThan(1e-3);
    expect(Math.abs(res.x[1] + 1)).toBeLessThan(1e-3);
    expect(Math.abs(res.fx)).toBeLessThan(1e-6);
  });
});

describe("восстановление параметров", () => {
  it("fitParameters восстанавливает β и γ из «чистых» синтетических данных", () => {
    const parsed = makeSIR();
    const names = parsed.compartments.map((c) => c.name);
    const N = 10000;
    const trueParams = { β: 0.45, γ: 0.18, N };
    const days = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18];

    const init = fitInitialCondition(names, [{ t: 0, value: 100 }], N);
    const vals = simulateAtDays(parsed, trueParams, init, "I", days, 0.05);
    const data = days.map((d, i) => ({ t: d, value: vals[i] }));

    const res = fitParameters(parsed, { N }, ["β", "γ"], data, { N });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(Math.abs(res.params["β"] - 0.45)).toBeLessThan(0.02);
      expect(Math.abs(res.params["γ"] - 0.18)).toBeLessThan(0.02);
      expect(res.rmse).toBeLessThan(1);
      expect(res.r2).toBeGreaterThan(0.999);
    }
  });

  it("N подставляется автоматически, даже если его нет в fixed", () => {
    const parsed = makeSIR();
    const names = parsed.compartments.map((c) => c.name);
    const N = 10000;
    const trueParams = { β: 0.45, γ: 0.18, N };
    const days = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18];

    const init = fitInitialCondition(names, [{ t: 0, value: 100 }], N);
    const vals = simulateAtDays(parsed, trueParams, init, "I", days, 0.05);
    const data = days.map((d, i) => ({ t: d, value: vals[i] }));

    const res = fitParameters(parsed, {}, ["β", "γ"], data, { N });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(Math.abs(res.params["β"] - 0.45)).toBeLessThan(0.02);
      expect(Math.abs(res.params["γ"] - 0.18)).toBeLessThan(0.02);
    }
  });

  it("отдаёт понятные ошибки без данных и без параметров", () => {
    const parsed = makeSIR();
    expect(fitParameters(parsed, { N: 10000 }, ["β"], null as never, {}).ok).toBe(false);
    expect(
      fitParameters(parsed, { N: 10000 }, ["β"], [{ t: 0, value: 1 }, { t: 1, value: 2 }], {}).ok,
    ).toBe(false);
    expect(
      fitParameters(
        parsed,
        { N: 10000 },
        [],
        [{ t: 0, value: 1 }, { t: 1, value: 2 }, { t: 2, value: 3 }],
        {},
      ).ok,
    ).toBe(false);
  });
});

describe("синтетические данные для примера", () => {
  it("возвращает строку с числом точек равным числу дней, парсится обратно", () => {
    const parsed = makeSIR();
    const text = generateSyntheticData(parsed, { β: 0.5, γ: 0.2, N: 10000 }, 10000, [0, 1, 2, 3, 4], 0.05);
    const d = parseFitData(text);
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.data.length).toBe(5);
  });
});