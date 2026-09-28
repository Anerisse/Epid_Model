// ============================================================
// core/simulate.ts — численное интегрирование (РК4) и блок
// «Качественный анализ» (R₀, порог 1/R₀, переболевшие).
//
// Портировано из legacy/client/js/simulate.js на TypeScript и
// переделано «под сервер»: все вычисления выполняются в API-роутах
// Next.js, клиент получает готовые ряды и отчёт анализа.
// ============================================================

import {
  type AstNode,
  type ModelStructure,
  evaluateExpression,
} from "./parser";
import { DEFAULT_POPULATION, PARAM_PRESETS, paramPreset } from "./presets";
import {
  classifyCompartments,
  computeR0Manual,
  computeR0NGM,
  finalSizeFromR0,
  prettyFormula,
  type R0Equation,
} from "./analysis";

// Шаг интегрирования (в днях): мелкий шаг даёт гладкие кривые
export const SIM_DT = 0.05;

// ------------------------------------------------------------------
// Производная системы: функция (y, t) → массив правых частей.
// ------------------------------------------------------------------
export function makeDerivative(
  names: string[],
  rhsAsts: AstNode[],
  params: Record<string, number>,
  evalFn: (node: AstNode, vars: Record<string, number>) => number = evaluateExpression,
): (y: number[], t: number) => number[] {
  return (y, t) => {
    const vars: Record<string, number> = { t };
    names.forEach((name, i) => {
      vars[name] = y[i];
    });
    for (const key in params) vars[key] = params[key];
    return names.map((_name, i) => evalFn(rhsAsts[i], vars));
  };
}

// ------------------------------------------------------------------
// Численное интегрирование методом Рунге–Кутты 4-го порядка.
// Возвращает { time, series } — series[компартмент][шаг].
// При расходимости бросает Error с понятным сообщением.
// ------------------------------------------------------------------
export interface Rk4Result {
  time: number[];
  series: number[][];
}

export function rk4Integrate(
  deriv: (y: number[], t: number) => number[],
  y0: number[],
  tMax: number,
  dt: number,
): Rk4Result {
  const steps = Math.max(1, Math.round(tMax / dt));
  const time = [0];
  const rows: number[][] = [y0.slice()];
  let y = y0.slice();

  for (let s = 0; s < steps; s++) {
    const t = s * dt;
    const k1 = deriv(y, t);
    const k2 = deriv(y.map((v, i) => v + 0.5 * dt * k1[i]), t + 0.5 * dt);
    const k3 = deriv(y.map((v, i) => v + 0.5 * dt * k2[i]), t + 0.5 * dt);
    const k4 = deriv(y.map((v, i) => v + dt * k3[i]), t + dt);
    y = y.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));

    if (!y.every(Number.isFinite) || y.some((v) => Math.abs(v) > 1e15)) {
      throw new Error("Решение расходится — уменьшите параметры или проверьте модель");
    }

    time.push((s + 1) * dt);
    rows.push(y.slice());
  }

  const series = y0.map((_, c) => rows.map((row) => row[c]));
  return { time, series };
}

// Начальное условие «по умолчанию» для типового компартмента
export function defaultInitial(name: string, population: number): number {
  switch (name) {
    case "S":
      return Math.round(population * 0.99);
    case "I":
      return Math.round(population * 0.01);
    default:
      return 0;
  }
}

// ------------------------------------------------------------------
// Статистика решения: пик I, день пика, выздоровевшие, число шагов.
// ------------------------------------------------------------------
export interface SimStats {
  peakValue: number | null;
  peakDay: number | null;
  recovered: number | null;
  steps: number;
}

export function computeStats(names: string[], time: number[], series: number[][], tMax: number): SimStats {
  let peakValue: number | null = null;
  let peakDay: number | null = null;
  if (names.includes("I")) {
    const i = names.indexOf("I");
    let peak = 0;
    let day = time[0];
    series[i].forEach((v, idx) => {
      if (v > peak) {
        peak = v;
        day = time[idx];
      }
    });
    peakValue = Math.max(0, peak);
    peakDay = day;
  }
  let recovered: number | null = null;
  if (names.includes("R")) {
    const r = names.indexOf("R");
    recovered = Math.max(0, series[r][series[r].length - 1]);
  }
  return { peakValue, peakDay, recovered, steps: (series[0] ? series[0].length : 0) - 1 };
}

// ------------------------------------------------------------------
// Отчёт «Качественный анализ»: R₀ (авто NGM или ручная формула),
// вердикт, порог 1/R₀, итог переболевших, сохранение популяции,
// «Вывод R₀» (F/V по компартментам или матрицы) + символьная формула.
// ------------------------------------------------------------------
export interface AnalysisRow {
  name: string;
  F: string;
  V: string;
}

export interface AnalysisReport {
  r0: number | null;
  verdict: string;
  tone: string;
  head: string;
  formula: string | null;
  infected: string[];
  threshold: number | null;
  finalSize: number | null;
  conservation: string;
  details: { kind: "terms"; rows: AnalysisRow[] } | { kind: "matrices"; F: string; V: string } | null;
}

export function buildAnalysisReport(
  structure: ModelStructure,
  params: Record<string, number>,
  initial: number[],
  manualFormula: string,
  result: Rk4Result | null,
): AnalysisReport {
  const N = params["N"] || initial.reduce((s, v) => s + v, 0) || DEFAULT_POPULATION;
  const manual = String(manualFormula || "").trim();
  const cls = classifyCompartments(structure);

  let head: string;
  let r0: number | null = null;
  let formula: string | null = null;
  let eq: R0Equation | null = null;
  let manualUsed = false;

  if (manual) {
    const m = computeR0Manual(manual, params);
    if (m.ok) {
      r0 = m.r0;
      head = "вручную";
      formula = manual;
      manualUsed = true;
    } else {
      head = `Ошибка формулы: ${m.error}`;
    }
  } else {
    const a = computeR0NGM(structure, params, N);
    if (a.ok) {
      r0 = a.r0;
      eq = a.eq || null;
      formula = eq && eq.formula ? eq.formula : null;
      head = "авто";
    } else {
      head = a.error;
    }
  }

  const hasR0 = typeof r0 === "number" && Number.isFinite(r0);
  let verdict = "—";
  let tone = "slate";
  if (hasR0) {
    if (r0! < 1) {
      verdict = "затухает";
      tone = "emerald";
    } else if (r0! > 1) {
      verdict = "вспышка возможна";
      tone = "amber";
    } else {
      verdict = "на границе";
      tone = "slate";
    }
  }

  let conservation = "—";
  if (result && result.series) {
    const s0 = initial.reduce((a, b) => a + b, 0);
    const sEnd = result.series.reduce((a, ser) => a + ser[ser.length - 1], 0);
    const dev = s0 > 0 ? Math.abs(sEnd - s0) / s0 : 0;
    conservation = dev < 0.01 ? "сохраняется (≈ N)" : "убывает (есть смертность/уход)";
  }

  const threshold = hasR0 && r0! > 0 ? 1 / r0! : null;
  const finalSize = hasR0 ? (r0! > 1 ? Math.round(finalSizeFromR0(r0!) * N) : 0) : null;

  let details: AnalysisReport["details"] = null;
  if (eq) {
    if (eq.infText) {
      details = {
        kind: "terms",
        rows: cls.infected.map((nm, i) => ({
          name: nm,
          F: prettyFormula(eq.infText[i]) || "—",
          V: prettyFormula(eq.restText[i]) || "—",
        })),
      };
    } else if (eq.Fm) {
      const mat = (m: string[][]): string =>
        "[" + m.map((row) => "[" + row.map((x) => prettyFormula(x)).join(", ") + "]").join(", ") + "]";
      details = { kind: "matrices", F: mat(eq.Fm), V: mat(eq.Vm) };
    }
  }

  return {
    r0: hasR0 ? r0! : null,
    verdict,
    tone,
    head,
    formula,
    infected: cls.infected,
    threshold,
    finalSize,
    conservation,
    details,
  };
}

// ------------------------------------------------------------------
// Полный расчёт «Симуляции» по структуре: интеграция + статистика +
// отчёт анализа (то, что отдаёт POST /api/simulate).
// ------------------------------------------------------------------
export interface SimulateReport {
  time: number[];
  series: number[][];
  names: string[];
  rhsText: string[];
  stats: SimStats;
  analysis: AnalysisReport;
}

export function runSimulation(
  structure: ModelStructure,
  params: Record<string, number>,
  initial: number[],
  horizon: number,
  manualFormula: string,
): SimulateReport {
  const names = structure.compartments.map((c) => c.name);
  const rhsAsts = structure.compartments.map((c) => c.rhsAST);
  const deriv = makeDerivative(names, rhsAsts, params);
  const result = rk4Integrate(deriv, initial, horizon, SIM_DT);
  const stats = computeStats(names, result.time, result.series, horizon);
  const analysis = buildAnalysisReport(structure, params, initial, manualFormula, result);
  return {
    time: result.time,
    series: result.series,
    names,
    rhsText: structure.compartments.map((c) => c.rhs_text),
    stats,
    analysis,
  };
}

// Пресеты параметров для клиента (ползунки) — обёртка над presets.ts
export { PARAM_PRESETS, paramPreset, DEFAULT_POPULATION };