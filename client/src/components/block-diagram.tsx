// ============================================================
// components/block-diagram.tsx — SVG-блок-схема компартментов.
// Отрисовывает готовую раскладку с сервера (POST /api/parse →
// diagram): блоки по центрам (x, y), потоки-стрелки с подписями,
// обход промежуточных блоков дугой сверху, пунктирные янтарные
// дуги «силы заражения» (движители) и потери «в никуда» (µ*X).
// Точная копия рисования legacy/client/js/diagram.js (этап 2),
// перенесённая на SVG-элементы.
// ============================================================
import type { Box, DiagramLayout, Flow, LabelsMap } from "../lib/api";

const GRID_W = 640;
const GRID_H = 420;

// Подписи под символами известных компартментов (используются,
// если пользователь не задал свои названия)
const SUBLABEL: Record<string, string> = {
  S: "Susceptible",
  E: "Exposed",
  I: "Infected",
  R: "Recovered",
  D: "Deceased",
};

// Цвета рёбер, подписей и «таблеток» — через CSS-переменные темы,
// поэтому схема одинаково читается в тёмной и светлой темах
const EDGE = "var(--color-slate-400)";
const LABEL = "var(--color-slate-300)";
const PILL = "var(--color-ink-800)";
const PILL_TEXT = "var(--color-slate-100)";

interface BlockDiagramProps {
  layout: DiagramLayout;
  /** Пользовательские названия компартментов (подпись в блоке схемы) */
  labels?: LabelsMap;
}

// Легенда отдельно не нужна: компартменты, потоки и потери перечислены
// в блоке «Структура модели» рядом, поэтому схема занимает всю высоту
// карточки.

// detected obstacles: есть ли чужой блок на пути (между по горизонтали, тот же ряд)
function hasBypass(fromBox: Box, toBox: Box, boxes: Record<string, Box>): boolean {
  for (const key of Object.keys(boxes)) {
    const b = boxes[key];
    if (b === fromBox || b === toBox) continue;
    const between = (b.x - fromBox.x) * (b.x - toBox.x) < 0;
    const sameRow =
      Math.abs(b.y - fromBox.y) < fromBox.size * 0.75 &&
      Math.abs(b.y - toBox.y) < toBox.size * 0.75;
    if (between && sameRow) return true;
  }
  return false;
}

// Геометрия потока: старт/конец/контрольная точка дуги. ctrl = null — прямая
function flowGeometry(fromBox: Box, toBox: Box, boxes: Record<string, Box>) {
  if (hasBypass(fromBox, toBox, boxes)) {
    const startX = fromBox.x;
    const startY = fromBox.y - fromBox.size / 2;
    const endX = toBox.x;
    const endY = toBox.y - toBox.size / 2;
    const ctrl = {
      x: (startX + endX) / 2,
      y: Math.min(startY, endY) - Math.max(fromBox.size, toBox.size) * 0.75,
    };
    return { startX, startY, endX, endY, ctrl };
  }

  const dx = toBox.x - fromBox.x;
  const dy = toBox.y - fromBox.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return null; // самопетлю не рисуем

  const startX = fromBox.x + (dx / dist) * (fromBox.size / 2);
  const startY = fromBox.y + (dy / dist) * (fromBox.size / 2);
  const endX = toBox.x - (dx / dist) * (toBox.size / 2);
  const endY = toBox.y - (dy / dist) * (toBox.size / 2);

  let ctrl: { x: number; y: number } | null = null;
  if (dy === 0 && dx > 0) {
    ctrl = null; // соседние блоки на одной строке — прямая
  } else {
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    ctrl = { x: midX, y: midY - Math.min(40, dist * 0.22) };
  }
  return { startX, startY, endX, endY, ctrl };
}

// Наконечник стрелки в конечной точке (угол по касательной)
function ArrowHead({ x, y, angle, fill = EDGE }: { x: number; y: number; angle: number; fill?: string }) {
  const p1 = `${x - 12 * Math.cos(angle - Math.PI / 6)},${y - 12 * Math.sin(angle - Math.PI / 6)}`;
  const p2 = `${x - 12 * Math.cos(angle + Math.PI / 6)},${y - 12 * Math.sin(angle + Math.PI / 6)}`;
  return <polygon points={`${x},${y} ${p1} ${p2}`} style={{ fill }} />;
}

// Построить всплывающую подсказку для компартмента: русское название при наведении
function compartmentTitle(name: string, labels?: LabelsMap): string | undefined {
  if (!labels) return undefined;
  const l = labels[name];
  if (!l) return undefined;
  const ru = (l.ru || "").trim();
  const en = (l.en || "").trim();
  if (ru && en && ru !== en) return `RU: ${ru} · EN: ${en}`;
  if (ru) return `RU: ${ru}`;
  if (en) return `EN: ${en}`;
  return undefined;
}

// Построить всплывающую подсказку для потока по параметрам (коэффициентам)
function flowTitle(flow: Flow, labels?: LabelsMap): string | undefined {
  if (!labels) return undefined;
  const symbols = new Set<string>();
  if (flow.label) {
    const matches = flow.label.match(/[A-Za-zΑ-Ωα-ω][A-Za-z0-9Α-Ωα-ω]*/g) || [];
    for (const m of matches) symbols.add(m);
  }
  if (flow.drivers) {
    for (const d of flow.drivers) symbols.add(d);
  }
  if (symbols.size === 0) return undefined;
  const parts: string[] = [];
  for (const sym of Array.from(symbols)) {
    if (sym === "N" || sym === "n") continue;
    const l = labels[sym];
    if (!l) continue;
    const ru = (l.ru || "").trim();
    const en = (l.en || "").trim();
    if (ru && en && ru !== en) parts.push(`${sym} — ${ru} · ${en}`);
    else if (ru) parts.push(`${sym} — ${ru}`);
    else if (en) parts.push(`${sym} — ${en}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

// Поток-перенос людей между двумя блоками
function FlowEdge({ flow, boxes, labels }: { flow: Flow; boxes: Record<string, Box>; labels?: LabelsMap }) {
  const fromBox = boxes[flow.from];
  const toBox = flow.to ? boxes[flow.to] : undefined;
  if (!fromBox || !toBox) return null;

  const g = flowGeometry(fromBox, toBox, boxes);
  if (!g) return null;
  const { startX, startY, endX, endY, ctrl } = g;

  const d = ctrl ? `M ${startX} ${startY} Q ${ctrl.x} ${ctrl.y} ${endX} ${endY}` : `M ${startX} ${startY} L ${endX} ${endY}`;
  const angle = ctrl
    ? Math.atan2(endY - ctrl.y, endX - ctrl.x)
    : Math.atan2(endY - startY, endX - startX);

  // Позиция подписи: середина линии или середина Безье (P0 + 2*P1 + P2)/4
  const labelX = ctrl ? (startX + 2 * ctrl.x + endX) / 4 : (startX + endX) / 2;
  const labelY = ctrl ? (startY + 2 * ctrl.y + endY) / 4 - 12 : (startY + endY) / 2 - 14;
  const title = flowTitle(flow, labels);

  return (
    <g>
      {title ? <title>{title}</title> : null}
      <path d={d} strokeWidth={2} fill="none" style={{ stroke: EDGE }} />
      <ArrowHead x={endX} y={endY} angle={angle} />
      <text x={labelX} y={labelY} textAnchor="middle" fontSize={12} style={{ fill: LABEL }}>
        {flow.label || "?"}
      </text>
    </g>
  );
}

// Потеря «в никуда» (µ*X): стрелка вниз от блока, подпись на «таблетке»
function ExitFlow({ flow, boxes, height, labels }: { flow: Flow; boxes: Record<string, Box>; height: number; labels?: LabelsMap }) {
  const box = boxes[flow.from];
  if (!box || flow.to) return null;

  const x = box.x;
  const yStart = box.y + box.size / 2;
  let maxEndY = height - 26;
  for (const key of Object.keys(boxes)) {
    const b = boxes[key];
    if (b !== box && b.y > box.y) {
      maxEndY = Math.min(maxEndY, b.y - b.size / 2 - 4);
    }
  }
  const yEnd = Math.max(yStart + 32, Math.min(yStart + box.size * 0.7, maxEndY));

  const text = flow.label || "µ";
  const labelY = yStart + 24;
  const title = flowTitle(flow, labels);

  return (
    <g>
      {title ? <title>{title}</title> : null}
      <path d={`M ${x} ${yStart} L ${x} ${yEnd}`} strokeWidth={2} strokeDasharray="4 3" fill="none" style={{ stroke: EDGE }} />
      <polygon points={`${x},${yEnd} ${x - 6},${yEnd - 10} ${x + 6},${yEnd - 10}`} style={{ fill: EDGE }} />
      {/* «Таблетка» под крупной подписью — гасит линии, проходящие сквозь текст */}
      <rect x={x - text.length * 5 - 8} y={labelY - 14} width={text.length * 10 + 16} height={24} rx={7} style={{ fill: PILL }} />
      <text x={x} y={labelY} textAnchor="middle" fontSize={17} fontWeight={700} style={{ fill: PILL_TEXT }}>
        {text}
      </text>
    </g>
  );
}

// Пунктирная янтарная дуга «силы заражения» от движителя к источнику потока
function InfectionEdge({ fromName, toName, boxes }: { fromName: string; toName: string; boxes: Record<string, Box> }) {
  const db = boxes[fromName];
  const fb = boxes[toName];
  if (!db || !fb) return null;

  const startX = db.x;
  const startY = db.y - db.size / 2;
  const endX = fb.x;
  const endY = fb.y - fb.size / 2;
  const ctrlY = Math.min(startY, endY) - Math.max(db.size, fb.size) * 0.7;

  return (
    <g>
      <path
        d={`M ${startX} ${startY} Q ${(startX + endX) / 2} ${ctrlY} ${endX} ${endY}`}
        stroke="#fbbf24"
        strokeWidth={1.6}
        strokeDasharray="6 5"
        fill="none"
      />
      <circle cx={endX} cy={endY} r={3} fill="#fbbf24" />
    </g>
  );
}

// Блок-компартмент: закруглённый квадрат с символом и подписью
function CompartmentBlock({
  name,
  box,
  color,
  sublabel,
  title,
}: {
  name: string;
  box: Box;
  color: string;
  sublabel?: string;
  title?: string;
}) {
  const half = box.size / 2;
  return (
    <g>
      {title ? <title>{title}</title> : null}
      {/* Свечение по цвету блока */}
      <rect
        x={box.x - half}
        y={box.y - half}
        width={box.size}
        height={box.size}
        rx={14}
        fill={color}
        opacity={0.35}
        filter="url(#diagram-glow)"
      />
      {/* Сам блок */}
      <rect x={box.x - half} y={box.y - half} width={box.size} height={box.size} rx={14} fill={color} />
      {/* Символ компартмента */}
      <text
        x={box.x}
        y={box.y - box.size * 0.06}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={Math.round(box.size * 0.32)}
        fontWeight={700}
        fill="#ffffff"
      >
        {name}
      </text>
      {sublabel ? (
        <text
          x={box.x}
          y={box.y + box.size * 0.32}
          textAnchor="middle"
          dominantBaseline="alphabetic"
          fontSize={Math.max(9, Math.round(box.size * 0.13))}
          fill="#ffffff"
        >
          {sublabel}
        </text>
      ) : null}
    </g>
  );
}

// Схема: только сама графика — рамку, фон и заголовок задаёт карточка,
// поэтому блок выглядит так же, как остальные разделы системы.
export function BlockDiagram({ layout, labels }: BlockDiagramProps) {
  const { order, boxes, flows, colors } = layout;

  return (
    <svg viewBox={`0 0 ${GRID_W} ${GRID_H}`} className="absolute inset-0 block h-full w-full" role="img" aria-label="Блок-схема модели">
        <defs>
          <filter id="diagram-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        {/* Потоки-переносы */}
        {flows.map((f, i) => (
          <FlowEdge key={`flow-${i}`} flow={f} boxes={boxes} labels={labels} />
        ))}

        {/* Потери «в никуда» */}
        {flows.map((f, i) => (
          <ExitFlow key={`exit-${i}`} flow={f} boxes={boxes} height={GRID_H} labels={labels} />
        ))}

        {/* Движители: пунктир янтарным от движителя к источнику */}
        {flows.map((f, i) =>
          (f.drivers || []).map((d) => (
            <InfectionEdge key={`inf-${i}-${d}`} fromName={d} toName={f.from} boxes={boxes} />
          )),
        )}

        {/* Блоки сверху стрелок */}
        {order.map((name, index) => (
          <CompartmentBlock
            key={name}
            name={name}
            box={boxes[name]}
            color={colors[name] ?? colors[Object.keys(colors)[index]]}
            sublabel={labels?.[name]?.en?.trim() ? labels[name]!.en!.trim() : undefined}
            title={compartmentTitle(name, labels)}
          />
        ))}
    </svg>
  );
}