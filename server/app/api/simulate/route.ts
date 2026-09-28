// ============================================================
// app/api/simulate/route.ts — численное интегрирование (РК4),
// статистика (пик, переболевшие) и блок «Качественный анализ»
// (R₀ методом NGM, символьное уравнение, порог 1/R₀, переболевшие).
// Все тяжёлые вычисления — здесь, клиент только рисует графики.
// ============================================================
import { NextResponse } from "next/server";
import { parseOdeSystemSafe } from "@/core/parser";
import { compartmentColor } from "@/core/diagram";
import { defaultInitial, runSimulation } from "@/core/simulate";
import { DEFAULT_POPULATION, paramPreset } from "@/core/presets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text = String(body?.text ?? "");

  const parsed = parseOdeSystemSafe(text);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error });
  }
  const structure = parsed.structure;
  const names = structure.compartments.map((c) => c.name);

  // Параметры: значения из запроса, иначе — пресет по умолчанию
  const params: Record<string, number> = {};
  structure.parameters.forEach((p) => {
    const preset = paramPreset(p);
    params[p] = typeof body?.params?.[p] === "number" ? body.params[p] : preset.value;
  });

  // Начальные условия: из запроса, иначе S≈99%, I≈1% (как в legacy)
  const N =
    typeof body?.params?.N === "number"
      ? body.params.N
      : params["N"] || params["n"] || DEFAULT_POPULATION;
  const initial = names.map((name) => {
    const v = body?.initial?.[name];
    return typeof v === "number" ? v : defaultInitial(name, N);
  });

  const horizon = Math.min(300, Math.max(1, Number(body?.horizon) || 100));
  const manualFormula = String(body?.manualFormula ?? "");

  try {
    const report = runSimulation(structure, params, initial, horizon, manualFormula);
    return NextResponse.json({
      ok: true,
      time: report.time,
      series: report.series,
      names,
      colors: names.map((n, i) => compartmentColor(n, i)),
      rhsText: report.rhsText,
      stats: report.stats,
      analysis: report.analysis,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}