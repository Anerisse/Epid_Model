// core/simulate.test.ts — тесты численного ядра (порт legacy simulate.test.js).
import { describe, expect, it } from "vitest";
import { parseOdeSystem } from "./parser";
import { defaultInitial, makeDerivative, rk4Integrate, runSimulation, SIM_DT } from "./simulate";

function sirStructure() {
  return parseOdeSystem("dS/dt = -β*S*I/N\ndI/dt = β*S*I/N - γ*I\ndR/dt = γ*I");
}

describe("симуляция (РК4)", () => {
  it("SIR: пик и затухание, популяция сохраняется", () => {
    const s = sirStructure();
    const names = ["S", "I", "R"];
    const report = runSimulation(s, { β: 0.5, γ: 0.2, N: 1000 }, [990, 10, 0], 100, "");
    const { time, series, stats } = report;

    expect(stats.peakValue).not.toBeNull();
    const peak = stats.peakValue!;
    const peakDay = stats.peakDay!;
    expect(peak).toBeGreaterThan(50); // эпидемия заметно вспыхивает
    expect(peak).toBeLessThan(990);
    expect(peakDay).toBeGreaterThan(0);
    expect(peakDay).toBeLessThan(100);

    // Популяция сохраняется на всём горизонте
    const total = series[0].map((_, i) => series[0][i] + series[1][i] + series[2][i]);
    total.forEach((v) => expect(Math.abs(v - 1000)).toBeLessThan(1e-6));

    // Финальное состояние: почти все переболели
    expect(series[2][series[2].length - 1]).toBeGreaterThan(800);
    expect(series[1][series[1].length - 1]).toBeLessThan(peak);
    expect(time.length).toBe(series[0].length);
  });

  it("SEIR со смертностью: популяция убывает", () => {
    const s = parseOdeSystem(
      "dS/dt = -β*S*I/N\ndE/dt = β*S*I/N - σ*E - µ*E\ndI/dt = σ*E - γ*I - µ*I\ndR/dt = γ*I",
    );
    const names = ["S", "E", "I", "R"];
    const initial = [990, 0, 10, 0];
    const report = runSimulation(s, { β: 0.6, σ: 0.3, γ: 0.2, µ: 0.05, N: 1000 }, initial, 120, "");
    const sEnd = report.series.reduce((sum, ser) => sum + ser[ser.length - 1], 0);
    expect(sEnd).toBeLessThan(initial.reduce((a, b) => a + b, 0));
    expect(report.stats.recovered).toBeGreaterThan(0);
  });

  it("расходимость прерывается с понятным сообщением", () => {
    const s = parseOdeSystem("dS/dt = 0\ndI/dt = 3*I");
    const names = ["S", "I"];
    const deriv = makeDerivative(names, s.compartments.map((c) => c.rhsAST), {});
    expect(() => rk4Integrate(deriv, [0, 1], 60, SIM_DT)).toThrow(/расходится/);
  });

  it("defaultInitial: S ≈ 99%, I ≈ 1%", () => {
    expect(defaultInitial("S", 10000)).toBe(9900);
    expect(defaultInitial("I", 10000)).toBe(100);
    expect(defaultInitial("R", 10000)).toBe(0);
  });
});