// ============================================================
// components/block-diagram.tsx — SVG-блок-схема компартментов.
// Отрисовывает готовую раскладку с сервера (POST /api/parse →
// diagram): блоки по центрам (x, y), потоки-стрелки с подписями,
// обход промежуточных блоков дугой сверху, пунктирные янтарные
// дуги «силы заражения» (движители) и потери «в никуда» (µ*X).
// Точная копия рисования legacy/client/js/diagram.js (этап 2),
// перенесённая на SVG-элементы.
// ============================================================
import type { Box, DiagramLayout, Flow } from "../lib/api";

const GRID_W = 640;
const GRID_H = 420;

// Подписи под символами известных компартментов
const SUBLABEL: Record<string, string> = {
  S: "Susceptible",
  E: "Exposed",
  I: "Infected",
  R: "Recovered",
  D: "Deceased",
};

// Цвета рёбер, как в legacy
const EDGE = "#94a3b8";
const LABEL = "#cbd5e1";
const PILL = "#101a30";

interface BlockDiagramProps {
  layout: DiagramLayout;
}

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
  return <polygon points={`${x},${y} ${p1} ${p2}`} fill={fill} />;
}

// Поток-перенос людей между двумя блоками
function FlowEdge({ flow, boxes }: { flow: Flow; boxes: Record<string, Box> }) {
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

  return (
    <g>
      <path d={d} stroke={EDGE} strokeWidth={2} fill="none" />
      <ArrowHead x={endX} y={endY} angle={angle} />
      <text x={labelX} y={labelY} textAnchor="middle" fontSize={12} fill={LABEL}>
        {flow.label || "?"}
      </text>
    </g>
  );
}

// Потеря «в никуда» (µ*X): стрелка вниз от блока, подпись на «таблетке»
function ExitFlow({ flow, boxes, height }: { flow: Flow; boxes: Record<string, Box>; height: number }) {
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

  return (
    <g>
      <path d={`M ${x} ${yStart} L ${x} ${yEnd}`} stroke={EDGE} strokeWidth={2} strokeDasharray="4 3" fill="none" />
      <polygon points={`${x},${yEnd} ${x - 6},${yEnd - 10} ${x + 6},${yEnd - 10}`} fill={EDGE} />
      {/* «Таблетка» под крупной подписью — гасит линии, проходящие сквозь текст */}
      <rect x={x - text.length * 5 - 8} y={labelY - 14} width={text.length * 10 + 16} height={24} rx={7} fill={PILL} />
      <text x={x} y={labelY} textAnchor="middle" fontSize={17} fontWeight={700} fill="#f1f5f9">
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
function CompartmentBlock({ name, box, color }: { name: string; box: Box; color: string }) {
  const half = box.size / 2;
  const sublabel = SUBLABEL[name];
  return (
    <g>
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

// Основной компонент: подпись панели, стрелки, дуги влияния, блоки
export function BlockDiagram({ layout }: BlockDiagramProps) {
  const { order, boxes, flows, colors } = layout;

  const transfers = flows.filter((f) => f.to);
  const losses = flows.filter((f) => !f.to);
  const captionBits: string[] = [];
  if (transfers.length) {
    captionBits.push(transfers.map((f) => `${f.from} → ${f.to} (${f.label})`).join(" · "));
  }
  if (losses.length) {
    captionBits.push(`Потери: ${losses.map((f) => `${f.from} (${f.label})`).join(" · ")}`);
  }
  const drivers = [...new Set(transfers.flatMap((f) => f.drivers || []))];
  if (drivers.length) captionBits.push(`Влияет: ${drivers.join(" · ")}`);

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0e1730]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Компартменты: <span className="font-mono normal-case text-slate-200">{order.join(" · ")}</span>
        </span>
        {captionBits.length > 0 && (
          <span className="text-[11px] leading-relaxed text-slate-500">{captionBits.join("  ·  ")}</span>
        )}
      </div>
      <svg viewBox={`0 0 ${GRID_W} ${GRID_H}`} className="block h-auto w-full" role="img" aria-label="Блок-схема модели">
        <defs>
          <filter id="diagram-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        {/* Потоки-переносы */}
        {flows.map((f, i) => (
          <FlowEdge key={`flow-${i}`} flow={f} boxes={boxes} />
        ))}

        {/* Потери «в никуда» */}
        {flows.map((f, i) => (
          <ExitFlow key={`exit-${i}`} flow={f} boxes={boxes} height={GRID_H} />
        ))}

        {/* Движители: пунктир янтарным от движителя к источнику */}
        {flows.map((f, i) =>
          (f.drivers || []).map((d) => (
            <InfectionEdge key={`inf-${i}-${d}`} fromName={d} toName={f.from} boxes={boxes} />
          )),
        )}

        {/* Блоки сверху стрелок */}
        {order.map((name, index) => (
          <CompartmentBlock key={name} name={name} box={boxes[name]} color={colors[name] ?? colors[Object.keys(colors)[index]]} />
        ))}
      </svg>
    </div>
  );
}