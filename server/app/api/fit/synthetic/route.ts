// ============================================================
// app/api/fit/synthetic/route.ts — синтетический пример для
// параметризации: встроенный симулятор (РК4) с «истинными»
// параметрами из пресетов + шум. Подгонка по таким данным
// должна восстановить истинные параметры.
// ============================================================
import { NextResponse } from "next/server";
import { parseOdeSystemSafe } from "@/core/parser";
import { paramPreset } from "@/core/presets";
import { generateSyntheticData } from "@/core/fit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text = String(body?.text ?? "");
  const parsed = parseOdeSystemSafe(text);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error });
  }

  // «Истинные» параметры — пресеты по умолчанию
  const params: Record<string, number> = {};
  parsed.structure.parameters.forEach((p) => {
    params[p] = paramPreset(p).value;
  });
  const N = params["N"] || params["n"] || 10000;
  params["N"] = N;

  const days: number[] = [];
  for (let d = 0; d <= 40; d += 2) days.push(d);

  const out = generateSyntheticData(parsed.structure, params, N, days, 0.05);
  return NextResponse.json({ ok: true, text: out, params: { ...params } });
}