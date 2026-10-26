// core/assumptions.test.ts — тесты блока «Допущения модели»:
// автоматические подсказки по уравнениям и очистка ручных пометок.
import { describe, expect, it } from "vitest";
import { parseOdeSystem } from "./parser";
import { detectAssumptions, sanitizeAssumptions, type AssumptionId } from "./assumptions";

// Удобный доступ к подсказке по id
function check(text: string, id: AssumptionId) {
  const list = detectAssumptions(parseOdeSystem(text));
  const found = list.find((c) => c.id === id);
  if (!found) throw new Error(`Нет допущения ${id}`);
  return found;
}

describe("автоматическое определение допущений", () => {
  const SIR = "dS/dt = -β*S*I/N\ndI/dt = β*S*I/N - γ*I\ndR/dt = γ*I";

  it("SIR: замкнутая популяция, без латентного периода, постоянная передача, однородное перемешивание", () => {
    expect(check(SIR, "closedPopulation")).toMatchObject({ suggested: true, auto: true });
    expect(check(SIR, "noLatentPeriod")).toMatchObject({ suggested: true, auto: true });
    expect(check(SIR, "constantTransmission")).toMatchObject({ suggested: true, auto: true });
    expect(check(SIR, "homogeneousMixing")).toMatchObject({ suggested: true, auto: true });
  });

  it("SEIR: латентный период есть (S → E → I)", () => {
    const SEIR =
      "dS/dt = -β*S*I/N\ndE/dt = β*S*I/N - σ*E\ndI/dt = σ*E - γ*I\ndR/dt = γ*I";
    const latent = check(SEIR, "noLatentPeriod");
    expect(latent.suggested).toBe(false);
    expect(latent.auto).toBe(true);
    expect(latent.evidence).toContain("промежуточный");
  });

  it("μ в уравнениях снимает «замкнутую популяцию»", () => {
    const vital =
      "dS/dt = Λ - μ*S - β*S*I/N\ndI/dt = β*S*I/N - (μ + γ)*I\ndR/dt = γ*I - μ*R";
    const closed = check(vital, "closedPopulation");
    expect(closed.suggested).toBe(false);
    expect(closed.auto).toBe(true);
    expect(closed.evidence).toContain("μ");
  });

  it("зависимость β от t снимает «постоянную скорость передачи»", () => {
    const seasonal =
      "dS/dt = -β*(1 + 0.3*cos(2*π*t))*S*I/N\n" +
      "dI/dt = β*(1 + 0.3*cos(2*π*t))*S*I/N - γ*I\n" +
      "dR/dt = γ*I";
    const constant = check(seasonal, "constantTransmission");
    expect(constant.suggested).toBe(false);
    expect(constant.evidence).toContain("времени");
  });

  it("параметр A воспринимается как возрастная структура", () => {
    const aged = "dS/dt = -β*S*I/N\ndI/dt = β*S*I/N - (γ + α*A)*I\ndR/dt = γ*I";
    expect(check(aged, "homogeneousMixing")).toMatchObject({ suggested: false, auto: true });
  });

  it("без S и I автоматика не берётся судить о латентности", () => {
    const latent = check("dX/dt = -γ*X", "noLatentPeriod");
    expect(latent.auto).toBe(false);
  });

  it("каждое допущение содержит тексты предупреждений для обоих выборов", () => {
    const list = detectAssumptions(parseOdeSystem(SIR));
    expect(list).toHaveLength(4);
    for (const item of list) {
      expect(item.warnings.checked.length).toBeGreaterThan(10);
      expect(item.warnings.unchecked.length).toBeGreaterThan(10);
    }
  });
});

describe("очистка допущений из API/БД", () => {
  it("оставляет только известные id и boolean-значения", () => {
    const clean = sanitizeAssumptions({
      items: { closedPopulation: true, noLatentPeriod: "да", unknown: true },
      notes: "  проверка  ",
    });
    expect(clean).toEqual({
      items: { closedPopulation: true },
      notes: "проверка",
    });
  });

  it("принимает плоский объект без items", () => {
    expect(sanitizeAssumptions({ constantTransmission: false })?.items).toEqual({
      constantTransmission: false,
    });
  });

  it("ограничивает длину заметок и отбрасывает мусор", () => {
    const clean = sanitizeAssumptions({ notes: "x".repeat(6000) });
    expect(clean?.notes).toHaveLength(5000);
    expect(sanitizeAssumptions(null)).toBeNull();
    expect(sanitizeAssumptions([])).toBeNull();
    expect(sanitizeAssumptions("text")).toBeNull();
  });
});
