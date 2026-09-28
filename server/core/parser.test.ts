// core/parser.test.ts — тесты парсера ОДУ (порт legacy parser.test.js).
import { describe, expect, it } from "vitest";
import {
  ParseError,
  canonicalNode,
  evaluateExpression,
  nodeToText,
  parseExpression,
  parseOdeSystem,
  parseOdeSystemSafe,
} from "./parser";

describe("парсер ОДУ", () => {
  it("разбирает SIR: компартменты и параметры", () => {
    const s = parseOdeSystem("dS/dt = -β*S*I/N\ndI/dt = β*S*I/N - γ*I\ndR/dt = γ*I");
    expect(s.compartments.map((c) => c.name)).toEqual(["S", "I", "R"]);
    expect(s.parameters).toEqual(["β", "N", "γ"]);
  });

  it("алиасы beta/gamma дают β/γ", () => {
    const s = parseOdeSystem("dS/dt = -beta*S*I/N\ndI/dt = beta*S*I/N - gamma*I\ndR/dt = gamma*I");
    expect(s.parameters).toEqual(["β", "N", "γ"]);
  });

  it("принимает форму со штрихом и с ∂", () => {
    expect(parseOdeSystem("S' = -β*S*I/N\nI' = β*S*I/N - γ*I").compartments.map((c) => c.name)).toEqual(["S", "I"]);
    expect(parseOdeSystem("∂S/∂t = -β*S*I/N").compartments[0].name).toBe("S");
  });

  it("понимает неявное умножение 2S", () => {
    expect(nodeToText(parseExpression("2S"))).toBe("2*S");
    expect(nodeToText(parseExpression("2 S"))).toBe("2*S");
  });

  it("печатает AST обратно с нужными скобками", () => {
    expect(nodeToText(parseExpression("β*S*I/N"))).toBe("β*S*I/N");
    expect(nodeToText(parseExpression("β/(γ+µ)"))).toBe("β/(γ+µ)");
  });

  it("каноническое представление коммутативно", () => {
    expect(canonicalNode(parseExpression("β*S*I/N"))).toBe(canonicalNode(parseExpression("I*S*β/N")));
  });

  it("выводит потоки SIR", () => {
    const s = parseOdeSystem("dS/dt = -β*S*I/N\ndI/dt = β*S*I/N - γ*I\ndR/dt = γ*I");
    expect(s.flows).toEqual([
      { from: "S", to: "I", label: "β*I/N", drivers: [] },
      { from: "I", to: "R", label: "γ", drivers: [] },
    ]);
  });

  it("выводит потоки SEIR: S→E, движение I — «сила заражения»", () => {
    const s = parseOdeSystem(
      "dS/dt = -β*S*I/N\ndE/dt = β*S*I/N - σ*E\ndI/dt = σ*E - γ*I\ndR/dt = γ*I",
    );
    expect(s.flows).toEqual([
      { from: "S", to: "E", label: "β*I/N", drivers: ["I"] },
      { from: "E", to: "I", label: "σ", drivers: [] },
      { from: "I", to: "R", label: "γ", drivers: [] },
    ]);
  });

  it("потеря µ*S — поток «в никуда»", () => {
    const s = parseOdeSystem("dS/dt = -µ*S");
    expect(s.flows).toEqual([{ from: "S", to: null, label: "µ", drivers: [] }]);
  });

  it("бросает ParseError на некорректный ввод", () => {
    expect(() => parseOdeSystem("S = β")).toThrow(ParseError);
    expect(() => parseOdeSystem("dS/dt = -β*S*I/N\ndS/dt = -γ*S")).toThrow(/несколько раз/);
    expect(parseOdeSystemSafe("").ok).toBe(false);
  });

  it("evaluateExpression вычисляет и бросает на неизвестной переменной", () => {
    const expr = parseExpression("β*S*I/N");
    expect(evaluateExpression(expr, { β: 0.5, S: 990, I: 10, N: 1000 })).toBeCloseTo(4.95, 10);
    expect(() => evaluateExpression(expr, { β: 0.5 })).toThrow(ParseError);
  });
});