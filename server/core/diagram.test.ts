// core/diagram.test.ts — тесты раскладки блок-схемы (порт legacy diagram.test.js).
import { describe, expect, it } from "vitest";
import type { Flow } from "./parser";
import { compartmentColor, layoutBoxes, orderCompartments, redirectFlows } from "./diagram";

describe("порядок компартментов (топологическая сортировка)", () => {
  it("SIR: потоки S→I→R дают порядок S, I, R", () => {
    const order = orderCompartments(["S", "I", "R"], [
      { from: "S", to: "I", label: "", drivers: [] },
      { from: "I", to: "R", label: "", drivers: [] },
    ]);
    expect(order).toEqual(["S", "I", "R"]);
  });

  it("SEIR: потоки S→E, E→I, I→R дают порядок S, E, I, R", () => {
    const order = orderCompartments(["S", "E", "I", "R"], [
      { from: "S", to: "E", label: "", drivers: [] },
      { from: "E", to: "I", label: "", drivers: [] },
      { from: "I", to: "R", label: "", drivers: [] },
    ]);
    expect(order).toEqual(["S", "E", "I", "R"]);
  });

  it("компартменты без потоков не ломают порядок цепочки", () => {
    const order = orderCompartments(["A", "S", "I", "R", "B"], [
      { from: "S", to: "I", label: "", drivers: [] },
      { from: "I", to: "R", label: "", drivers: [] },
    ]);
    expect(order.indexOf("S")).toBeLessThan(order.indexOf("I"));
    expect(order.indexOf("I")).toBeLessThan(order.indexOf("R"));
    expect(order).toContain("A");
    expect(order).toContain("B");
  });

  it("вырожденный граф без потоков — порядок ввода сохраняется", () => {
    expect(orderCompartments(["X", "Y", "Z"], [])).toEqual(["X", "Y", "Z"]);
  });

  it("цикл потоков не зацикливает сортировку", () => {
    const flows: Flow[] = [
      { from: "A", to: "B", label: "x", drivers: [] },
      { from: "B", to: "A", label: "y", drivers: [] },
    ];
    expect(orderCompartments(["A", "B"], flows)).toEqual(["A", "B"]);
  });
});

describe("позиции блоков на холсте", () => {
  it("4 компартмента — одна строка, y одинаков, x растёт слева направо", () => {
    const boxes = layoutBoxes(["S", "E", "I", "R"], 800, 300);
    const values = Object.values(boxes);
    values.forEach((b) => {
      expect(b.x).toBeGreaterThan(0);
      expect(b.x).toBeLessThan(800);
      expect(b.y).toBeGreaterThan(0);
      expect(b.y).toBeLessThan(300);
    });
    expect(new Set(values.map((b) => b.y)).size).toBe(1);
    const xs = ["S", "E", "I", "R"].map((n) => boxes[n].x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it("9 компартментов — сетка по 3 в ряд, строки сверху вниз", () => {
    const names = ["A", "B", "C", "D", "E", "F", "G", "H", "K"];
    const boxes = layoutBoxes(names, 800, 500);
    names.forEach((n) => {
      expect(boxes[n].x).toBeGreaterThan(0);
      expect(boxes[n].x).toBeLessThan(800);
      expect(boxes[n].y).toBeGreaterThan(0);
      expect(boxes[n].y).toBeLessThan(500);
    });
    expect(boxes["A"].y).toBe(boxes["B"].y);
    expect(boxes["B"].y).toBe(boxes["C"].y);
    expect(boxes["D"].y).toBe(boxes["E"].y);
    expect(boxes["G"].y).toBe(boxes["H"].y);
    expect(boxes["A"].y).toBeLessThan(boxes["D"].y);
    expect(boxes["D"].y).toBeLessThan(boxes["G"].y);
  });

  it("одиночный компартмент — блок в центре холста", () => {
    const boxes = layoutBoxes(["S"], 600, 400);
    expect(boxes["S"].x).toBe(300);
    expect(boxes["S"].y).toBe(200);
  });
});

describe("цвета блоков", () => {
  it("известные компартменты имеют тематический цвет", () => {
    expect(compartmentColor("S", 0)).toBe("#10b981");
    expect(compartmentColor("I", 1)).toBe("#f43f5e");
    expect(compartmentColor("R", 2)).toBe("#0ea5e9");
    expect(compartmentColor("E", 1)).toBe("#f59e0b");
  });

  it("неизвестный компартмент получает цвет из палитры по индексу", () => {
    expect(compartmentColor("М", 0)).not.toBe(compartmentColor("М", 1));
  });
});

describe("ручное перенаправление потоков", () => {
  it("по умолчанию (правил нет) потоки не меняются", () => {
    const flows: Flow[] = [
      { from: "S", to: "E", label: "β*I/N", drivers: ["I"] },
      { from: "E", to: "I", label: "σ", drivers: [] },
    ];
    expect(redirectFlows(flows)).toEqual(flows);
  });

  it("применяет правило по совпадению источника и подписи", () => {
    const flows: Flow[] = [
      { from: "S", to: "E", label: "β*I/N", drivers: ["I"] },
      { from: "E", to: "I", label: "σ", drivers: [] },
    ];
    const out = redirectFlows(flows, [{ from: "S", label: "β*I/N", to: "I" }]);
    expect(out[0].to).toBe("I");
    expect(out[1].to).toBe("I");
  });
});