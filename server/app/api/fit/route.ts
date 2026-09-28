// ============================================================
// app/api/fit/route.ts — параметризация (МНК) на сервере:
// принимает наблюдения I(t), подбирает отмеченные параметры
// методом Нелдера–Мида и возвращает метрики + полную кривую
// модели (для общего графика с точками данных).
// ============================================================
import { NextResponse } from "next/server";
import { parseOdeSystemSafe } from "@/core/parser";
import { fitInitialCondition, fitParameters, parseFitData, simulateAtDays } from "@/core/fit";
import { SIM_DT } from "@/core/simulate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text = String(body?.text ?? "");

  const parsed = parseOdeSystemSafe(text);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error });
  }

  const dataParsed = parseFitData(body?.dataText ?? "");
  if (!dataParsed.ok) {
    return NextResponse.json({ ok: false, error: dataParsed.error });
  }

  const N = Number(body?.N) || 10000;
  const free = Array.isArray(body?.free) ? body.free.map(String) : [];
  const fixedRaw: Record<string, unknown> = body?.fixed ?? {};
  const fixed: Record<string, number> = {};
  for (const key of Object.keys(fixedRaw)) {
    if (typeof fixedRaw[key] === "number") fixed[key] = fixedRaw[key] as number;
  }

  const res = fitParameters(parsed.structure, fixed, free, dataParsed.data, { N, target: "I" });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error });
  }

  // Полная кривая модели по подобранным параметрам — для графика
  const names = parsed.structure.compartments.map((c) => c.name);
  const initial = fitInitialCondition(names, dataParsed.data, N);
  const tMax = Math.min(300, Math.max(1, Math.ceil(Math.max(...dataParsed.data.map((d) => d.t)) * 1.2)));
  const days: number[] = [];
  for (let d = 0; d <= tMax; d++) days.push(d);
  const model = simulateAtDays(parsed.structure, res.params, initial, "I", days, SIM_DT);

  return NextResponse.json({
    ok: true,
    params: res.params,
    rmse: res.rmse,
    r2: res.r2,
    iterations: res.iterations,
    time: days,
    model,
    points: dataParsed.data,
  });
}