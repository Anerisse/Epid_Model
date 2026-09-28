// ============================================================
// core/fit.ts — параметризация: МНК методом Нелдера–Мида.
//
// Портировано из legacy/client/js/fit.js (этап 5) на TypeScript.
// Подбираем параметры (β, γ, …) так, чтобы кривая модели (РК4)
// проходила как можно ближе к наблюдаемым точкам I(t). Работает
// на сервере: POST /api/fit принимает данные и возвращает
// подобранные параметры + полное решение модели для графика.
// ============================================================

import {
  type Flow,
  type ModelStructure,
  evaluateExpression,
} from "./parser";
import { paramPreset } from "./presets";
import { makeDerivative, rk4Integrate, SIM_DT } from "./simulate";

// Минимальное число наблюдений, без которого подгонка бессмысленна
export const MIN_DATA_POINTS = 3;
const FIT_DEFAULT_POPULATION = 10000;

export interface FitDatum {
  t: number;
  value: number;
}

// ------------------------------------------------------------------
// Разбирает пользовательский ввод данных в массив наблюдений
// [{ t, value }]: «день число», «день,число» или одиночные числа
// (тогда дни — 0, 1, 2, …). Сдвигает время к t = 0.
// ------------------------------------------------------------------
export function parseFitData(
  text: string,
): { ok: true; data: FitDatum[] } | { ok: false; error: string } {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const data: FitDatum[] = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(/[\s,;]+/).map(Number);
    if (!parts.length || parts.some((x) => Number.isNaN(x))) {
      return { ok: false, error: `Строка ${i + 1}: не числа — «${lines[i]}»` };
    }
    if (parts.length === 1) data.push({ t: i, value: parts[0] });
    else data.push({ t: parts[0], value: parts[1] });
  }

  if (data.length < MIN_DATA_POINTS) {
    return { ok: false, error: `Нужно минимум ${MIN_DATA_POINTS} наблюдения` };
  }
  if (data.some((p) => !Number.isFinite(p.t) || p.t < 0 || p.value <= 0)) {
    return { ok: false, error: "Дни и числа заражённых должны быть неотрицательными" };
  }

  data.sort((a, b) => a.t - b.t);
  const t0 = data[0].t;
  data.forEach((p) => {
    p.t -= t0;
  });
  return { ok: true, data };
}

// ------------------------------------------------------------------
// Начальные условия по первым данным: I₀ — первое наблюдение,
// S₀ = N − I₀, остальные — 0. Возвращает вектор в порядке компартментов.
// ------------------------------------------------------------------
export function fitInitialCondition(names: string[], data: FitDatum[], N: number): number[] {
  const init: Record<string, number> = {};
  names.forEach((name) => {
    init[name] = 0;
  });
  const i0 = data[0].value;
  init["I"] = i0;
  if (names.includes("S")) init["S"] = Math.max(0, N - i0);
  return names.map((name) => init[name] || 0);
}

// ------------------------------------------------------------------
// Интегрирует модель и возвращает значения целевого компартмента
// в заданные дни (берём ближайший шаг интегрирования).
// ------------------------------------------------------------------
export function simulateAtDays(
  structure: ModelStructure,
  params: Record<string, number>,
  initial: number[],
  target: string,
  days: number[],
  dt: number = SIM_DT,
): number[] {
  const names = structure.compartments.map((c) => c.name);
  const rhsAsts = structure.compartments.map((c) => c.rhsAST);
  const deriv = makeDerivative(names, rhsAsts, params, evaluateExpression);
  const tMax = days.length ? Math.max(0, ...days) : 0;
  const res = rk4Integrate(deriv, initial, tMax, dt);

  const ti = names.indexOf(target);
  if (ti < 0) throw new Error(`Компартмент ${target} не найден в модели`);

  return days.map((d) => {
    const idx = Math.min(res.series[ti].length - 1, Math.max(0, Math.round(d / dt)));
    return Math.max(0, res.series[ti][idx]);
  });
}

// ------------------------------------------------------------------
// Стоимость подгонки: SSE = Σ (модель − данные)². При расходимости
// решения — большая величина, чтобы оптимизатор уходил «прочь».
// ------------------------------------------------------------------
export function fitCost(
  structure: ModelStructure,
  fixedParams: Record<string, number>,
  freeNames: string[],
  freeValues: number[],
  data: FitDatum[],
  N: number,
  target: string,
  dt: number,
): number {
  const params = Object.assign({}, fixedParams);
  freeNames.forEach((name, i) => {
    params[name] = freeValues[i];
  });

  const names = structure.compartments.map((c) => c.name);
  const initial = fitInitialCondition(names, data, N);

  try {
    const model = simulateAtDays(structure, params, initial, target, data.map((d) => d.t), dt);
    return model.reduce((sum, v, i) => sum + (v - data[i].value) ** 2, 0);
  } catch {
    return 1e30;
  }
}

// ------------------------------------------------------------------
// Минимизация методом Нелдера–Мида (без производных, с границами).
// ------------------------------------------------------------------
export interface NelderMeadResult {
  x: number[];
  fx: number;
  iterations: number;
}

export function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  bounds: [number, number][],
  opts?: { maxIter?: number; tol?: number },
): NelderMeadResult {
  const o = opts || {};
  const maxIter = o.maxIter || 400;
  const tol = o.tol !== undefined ? o.tol : 1e-9;
  const n = x0.length;

  const clamp = (p: number[]): number[] =>
    p.map((v, i) => {
      const lo = bounds[i] ? bounds[i][0] : -Infinity;
      const hi = bounds[i] ? bounds[i][1] : Infinity;
      return Math.min(hi, Math.max(lo, v));
    });

  const simplex: number[][] = [clamp(x0.slice())];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] = p[i] ? p[i] * 1.05 : 0.001;
    if (p[i] === x0[i]) p[i] += 0.001;
    simplex.push(clamp(p));
  }
  const fx = simplex.map(f);

  let iterations = 0;
  for (; iterations < maxIter; iterations++) {
    const idx = simplex.map((_, i) => i).sort((a, b) => fx[a] - fx[b]);
    const best = idx[0];
    const worst = idx[n];

    const centroid = simplex[best].map((_, ci) => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += simplex[idx[i]][ci];
      return sum / n;
    });

    const reflected = clamp(centroid.map((v, ci) => 2 * v - simplex[worst][ci]));
    const fr = f(reflected);

    if (fr < fx[best]) {
      const expanded = clamp(centroid.map((v, ci) => 3 * v - 2 * simplex[worst][ci]));
      const fe = f(expanded);
      simplex[worst] = fe < fr ? expanded : reflected;
      fx[worst] = Math.min(fe, fr);
    } else if (fr < fx[worst]) {
      simplex[worst] = reflected;
      fx[worst] = fr;
    } else {
      const contracted = clamp(centroid.map((v, ci) => 0.5 * (simplex[worst][ci] + centroid[ci])));
      const fc = f(contracted);
      if (fc < fx[worst]) {
        simplex[worst] = contracted;
        fx[worst] = fc;
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = clamp(simplex[i].map((v, ci) => 0.5 * (simplex[best][ci] + v)));
          fx[i] = f(simplex[i]);
        }
      }
    }

    if (iterations > 4 && Math.max(...fx) - Math.min(...fx) < tol) break;
  }

  const idx = simplex.map((_, i) => i).sort((a, b) => fx[a] - fx[b]);
  return { x: clamp(simplex[idx[0]]), fx: fx[idx[0]], iterations: iterations + 1 };
}

// ------------------------------------------------------------------
// Главная функция МНК: подбирает свободные параметры (freeNames).
// ------------------------------------------------------------------
export type FitResult =
  | {
      ok: true;
      params: Record<string, number>;
      rmse: number;
      r2: number;
      iterations: number;
    }
  | { ok: false; error: string };

export function fitParameters(
  structure: ModelStructure,
  fixedParams: Record<string, number>,
  freeNames: string[],
  data: FitDatum[],
  opts?: { target?: string; N?: number; dt?: number },
): FitResult {
  const o = opts || {};
  const target = o.target || "I";
  const N = o.N || FIT_DEFAULT_POPULATION;
  const dt = o.dt || SIM_DT;

  if (!structure || !structure.compartments) return { ok: false, error: "Модель не разобрана" };
  if (!data || data.length < MIN_DATA_POINTS) {
    return { ok: false, error: `Нужно минимум ${MIN_DATA_POINTS} наблюдения` };
  }
  if (!freeNames || !freeNames.length) {
    return { ok: false, error: "Отметьте хотя бы один оцениваемый параметр" };
  }

  const x0 = freeNames.map((name) => paramPreset(name).value);
  const bounds: [number, number][] = freeNames.map((name) => {
    const p = paramPreset(name);
    return [0, Math.max(p.max * 2, 1e-6)];
  });

  const fixed = Object.assign({}, fixedParams);
  structure.parameters.forEach((name) => {
    if (/^[Nn]$/.test(name) && fixed[name] === undefined && !freeNames.includes(name)) {
      fixed[name] = N;
    }
  });

  const f = (values: number[]): number => fitCost(structure, fixed, freeNames, values, data, N, target, dt);
  const res = nelderMead(f, x0, bounds, { maxIter: 400 });

  const params = Object.assign({}, fixed);
  freeNames.forEach((name, i) => {
    params[name] = Math.max(0, res.x[i]);
  });

  try {
    const names = structure.compartments.map((c) => c.name);
    const initial = fitInitialCondition(names, data, N);
    const model = simulateAtDays(structure, params, initial, target, data.map((d) => d.t), dt);

    const mean = data.reduce((s, d) => s + d.value, 0) / data.length;
    const sse = model.reduce((s, v, i) => s + (v - data[i].value) ** 2, 0);
    const tss = data.reduce((s, d) => s + (d.value - mean) ** 2, 0);
    return {
      ok: true,
      params,
      rmse: Math.sqrt(sse / data.length),
      r2: tss > 0 ? 1 - sse / tss : 1,
      iterations: res.iterations,
    };
  } catch (err) {
    return { ok: false, error: "Расчёт итоговой кривой не удался: " + (err instanceof Error ? err.message : String(err)) };
  }
}

// ------------------------------------------------------------------
// Синтетические данные для примера: РК4 с «истинными» параметрами
// из пресетов + случайный шум (доля от величины). Подгонка должна
// восстановить истинные параметры — так проверяется алгоритм.
// ------------------------------------------------------------------
export function generateSyntheticData(
  structure: ModelStructure,
  params: Record<string, number>,
  N: number,
  days: number[],
  noise?: number,
): string {
  const names = structure.compartments.map((c) => c.name);
  const initial = fitInitialCondition(names, [{ t: 0, value: Math.max(1, Math.round(N * 0.01)) }], N);
  const model = simulateAtDays(structure, params, initial, "I", days, SIM_DT);
  const amp = Math.max(0.02, noise || 0.05);
  return days
    .map((d, i) => {
      const eps = 1 + (Math.random() * 2 - 1) * amp;
      return `${d} ${Math.max(1, Math.round(model[i] * eps))}`;
    })
    .join("\n");
}

// Неиспользуемый импорт типа — оставлен для интерфейсных подписей
export type { Flow };