// core/analysis.test.ts — тесты качественного анализа (порт legacy analysis.test.js).
import { describe, expect, it } from "vitest";
import { parseOdeSystem } from "./parser";
import {
  classifyCompartments,
  computeR0Manual,
  computeR0NGM,
  finalSizeFromR0,
  formulaText,
  simplify,
} from "./analysis";

function structure(text: string) {
  return parseOdeSystem(text);
}

describe("качественный анализ (R₀)", () => {
  it("SIR: R₀ = β/γ и символьное уравнение β/γ", () => {
    const s = structure("dS/dt = -β*S*I/N\ndI/dt = β*S*I/N - γ*I\ndR/dt = γ*I");
    const r = computeR0NGM(s, { β: 0.5, γ: 0.2, N: 10000 }, 10000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.r0).toBeCloseTo(2.5, 6);
      expect(r.eq?.formula).toBe("β/γ");
      expect(r.infected).toEqual(["I"]);
      expect(r.susceptible).toEqual(["S"]);
    }
  });

  it("SEIR со смертностью: R₀ = βσ/((σ+µ)(γ+µ))", () => {
    const s = structure(
      "dS/dt = -β*S*I/N\ndE/dt = β*S*I/N - σ*E - µ*E\ndI/dt = σ*E - γ*I - µ*I\ndR/dt = γ*I",
    );
    const p = { β: 0.5, σ: 0.3, γ: 0.2, µ: 0.02, N: 10000 };
    const r = computeR0NGM(s, p, 10000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const expected = (0.5 * 0.3) / (0.32 * 0.22);
      expect(r.r0).toBeCloseTo(expected, 6);
      expect(r.eq?.formula).toBe("β*σ/((σ+µ)*(γ+µ))");
    }
  });

  it("SEIR без смертности: формула приводится к β/γ", () => {
    const s = structure(
      "dS/dt = -β*S*I/N\ndE/dt = β*S*I/N - σ*E\ndI/dt = σ*E - γ*I\ndR/dt = γ*I",
    );
    const r = computeR0NGM(s, { β: 0.5, σ: 0.3, γ: 0.2, N: 10000 }, 10000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.r0).toBeCloseTo(2.5, 6);
      expect(r.eq?.formula).toBe("β/γ");
    }
  });

  it("SEIRS: R₀ = β/γ", () => {
    const s = structure(
      "dS/dt = -β*S*I/N + λ*R\ndE/dt = β*S*I/N - σ*E\ndI/dt = σ*E - γ*I\ndR/dt = γ*I - λ*R",
    );
    const r = computeR0NGM(s, { β: 0.5, σ: 0.3, γ: 0.2, λ: 0.1, N: 10000 }, 10000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.r0).toBeCloseTo(2.5, 6);
  });

  it("SIRD: R₀ = β/(γ+µ)", () => {
    const s = structure(
      "dS/dt = -β*S*I/N\ndI/dt = β*S*I/N - γ*I - µ*I\ndR/dt = γ*I\ndD/dt = µ*I",
    );
    const p = { β: 0.5, γ: 0.2, µ: 0.02, N: 10000 };
    const r = computeR0NGM(s, p, 10000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.r0).toBeCloseTo(0.5 / 0.22, 6);
      expect(r.eq?.formula).toBe("β/(γ+µ)");
    }
  });

  it("SIS: R₀ = β/γ", () => {
    const s = structure("dS/dt = -β*S*I/N + γ*I\ndI/dt = β*S*I/N - γ*I");
    const r = computeR0NGM(s, { β: 0.5, γ: 0.2, N: 10000 }, 10000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.r0).toBeCloseTo(2.5, 6);
  });

  it("SEIQR (k=3): численное значение есть, формула — только F/V", () => {
    const s = structure(
      "dS/dt = -β*S*I/N\ndE/dt = β*S*I/N - σ*E\ndI/dt = σ*E - γ*I - δ*I\ndQ/dt = δ*I - ρ*Q\ndR/dt = γ*I + ρ*Q",
    );
    const r = computeR0NGM(s, { β: 0.5, σ: 0.3, γ: 0.2, δ: 0.1, ρ: 0.2, N: 10000 }, 10000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.r0).toBeGreaterThan(0);
      expect(r.eq?.formula).toBeNull();
      expect(r.eq?.Fm.length).toBe(3);
    }
  });

  it("итог переболевших из 1 − x = e^(−R₀x)", () => {
    expect(finalSizeFromR0(1.0)).toBe(0);
    const x = finalSizeFromR0(2.5);
    expect(x).toBeCloseTo(0.893, 2);
    expect(x).toBeGreaterThan(0.85);
    expect(x).toBeLessThan(0.95);
  });

  it("ручная формула R₀", () => {
    const m = computeR0Manual("β/γ", { β: 0.5, γ: 0.2 });
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.r0).toBeCloseTo(2.5, 10);
    expect(computeR0Manual("", { β: 0.5 }).ok).toBe(false);
  });

  it("классификация компартментов SEIR", () => {
    const s = structure(
      "dS/dt = -β*S*I/N\ndE/dt = β*S*I/N - σ*E\ndI/dt = σ*E - γ*I\ndR/dt = γ*I",
    );
    const cls = classifyCompartments(s);
    expect(cls.susceptible).toEqual(["S"]);
    expect(cls.infected.sort()).toEqual(["E", "I"]);
  });
});