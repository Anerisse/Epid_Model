// ============================================================
// app/api/parse/route.ts — разбор системы ОДУ на сервере.
// Возвращает «лёгкую» структуру (без AST), пресеты параметров
// для ползунков и готовую раскладку блок-схемы для SVG.
// ============================================================
import { NextResponse } from "next/server";
import { parseOdeSystemSafe, lightStructure } from "@/core/parser";
import { paramPresetsFor } from "@/core/presets";
import { computeDiagram } from "@/core/diagram";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text = String(body?.text ?? "");
  const parsed = parseOdeSystemSafe(text);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error });
  }
  return NextResponse.json({
    ok: true,
    structure: lightStructure(parsed.structure),
    presets: paramPresetsFor(parsed.structure.parameters),
    diagram: computeDiagram(parsed.structure, 640, 420),
  });
}