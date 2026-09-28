// ============================================================
// core/diagram.ts — раскладка авто-блок-схемы компартментов.
// Портирован из legacy/client/js/diagram.js (этап 2): топологическая
// сортировка, сетка блоков. Расчёт (тяжёлая часть) — на сервере,
// отрисовку SVG делает клиент по готовым координатам.
// ============================================================

import type { Flow, ModelStructure } from "./parser";

// Тематический цвет блока для известных компартментов
const COMPARTMENT_THEME: Record<string, string> = {
  S: "#10b981",
  E: "#f59e0b",
  I: "#f43f5e",
  R: "#0ea5e9",
  D: "#64748b",
};

// Подпись под символом для известных компартментов
export const COMPARTMENT_SUBLABEL: Record<string, string> = {
  S: "Susceptible",
  E: "Exposed",
  I: "Infected",
  R: "Recovered",
  D: "Deceased",
};

// Дополнительные цвета для произвольных компартментов
const COMPARTMENT_PALETTE = [
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#22c55e",
  "#eab308",
  "#06b6d4",
];

// Цвет блока для компартмента: тематический, если имя известно, иначе — из палитры
export function compartmentColor(name: string, index: number): string {
  if (COMPARTMENT_THEME[name]) return COMPARTMENT_THEME[name];
  return COMPARTMENT_PALETTE[index % COMPARTMENT_PALETTE.length];
}

// Ручные перенаправления потоков (fallback этапа 2; пусто по умолчанию)
export const FLOW_REDIRECTS: { from: string; label: string; to: string }[] = [];

// Применяет ручные перенаправления к списку потоков
export function redirectFlows(
  flows: Flow[],
  rules: { from: string; label: string; to: string }[] = FLOW_REDIRECTS,
): Flow[] {
  return flows.map((f) => {
    const rule = rules.find((r) => r.from === f.from && r.label === f.label);
    return rule ? { ...f, to: rule.to } : f;
  });
}

// ------------------------------------------------------------------
// Упорядочивает компартменты слева направо так, чтобы потоки вели
// в правильном направлении: топологическая сортировка (алгоритм Кана).
// ------------------------------------------------------------------
export function orderCompartments(names: string[], flows: Flow[]): string[] {
  const indeg = new Map(names.map((n) => [n, 0]));
  const adjacency = new Map(names.map((n) => [n, [] as string[]]));

  flows.forEach((f) => {
    if (!indeg.has(f.from) || !indeg.has(f.to!) || f.from === f.to) return;
    adjacency.get(f.from)!.push(f.to!);
    indeg.set(f.to!, indeg.get(f.to!)! + 1);
  });

  const queue = names.filter((n) => indeg.get(n) === 0);
  const result: string[] = [];
  const placed = new Set<string>();

  while (queue.length) {
    const node = queue.shift()!;
    if (placed.has(node)) continue;
    placed.add(node);
    result.push(node);

    adjacency.get(node)!.forEach((next) => {
      indeg.set(next, indeg.get(next)! - 1);
      if (indeg.get(next) === 0 && !placed.has(next)) queue.push(next);
    });
  }

  names.forEach((n) => {
    if (!placed.has(n)) result.push(n);
  });

  return result;
}

export interface Box {
  x: number;
  y: number;
  size: number;
}

// ------------------------------------------------------------------
// Считает центры блоков компартментов на холсте (одна строка для
// 1–6 блоков, сетка для большего числа).
// ------------------------------------------------------------------
export function layoutBoxes(order: string[], width: number, height: number): Record<string, Box> {
  const n = order.length;
  const perRow = n <= 6 ? n : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / perRow);

  const boxSize = Math.max(
    44,
    Math.min(84, Math.min((width - 40) / (perRow + 1), (height - 60) / (rows + 1)) * 0.8),
  );

  const boxes: Record<string, Box> = {};
  order.forEach((name, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const rowCount = row === rows - 1 ? n - row * perRow : perRow;
    boxes[name] = {
      x: ((col + 1) * width) / (rowCount + 1),
      y: ((row + 1) * height) / (rows + 1),
      size: boxSize,
    };
  });
  return boxes;
}

// ------------------------------------------------------------------
// Полная раскладка для клиента: порядок блоков, их координаты,
// потоки с учётом перенаправлений и цвета компартментов.
// Клиент рисует SVG по этим числам.
// ------------------------------------------------------------------
export interface DiagramLayout {
  order: string[];
  boxes: Record<string, Box>;
  flows: Flow[];
  colors: Record<string, string>;
}

export function computeDiagram(structure: ModelStructure, width: number, height: number): DiagramLayout {
  const flows = redirectFlows(structure.flows);
  const order = orderCompartments(
    structure.compartments.map((c) => c.name),
    flows,
  );
  const boxes = layoutBoxes(order, width, height);
  const colors: Record<string, string> = {};
  order.forEach((name, index) => {
    colors[name] = compartmentColor(name, index);
  });
  return { order, boxes, flows, colors };
}