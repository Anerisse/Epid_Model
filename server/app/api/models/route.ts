// ============================================================
// app/api/models/route.ts — CRUD моделей: список и создание.
// Контракт сохранён с legacy-стека: POST { name, raw_text, structure? },
// ответ — объект модели (snake_case).
// ============================================================
import { NextResponse } from "next/server";
import { parseOdeSystemSafe, lightStructure } from "@/core/parser";
import { createModel, listModels } from "@/lib/db";

export const dynamic = "force-dynamic";

// Список сохранённых моделей
export async function GET() {
  return NextResponse.json(listModels());
}

// Создание модели: структура парсером вычисляется на сервере
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const rawText = String(body?.raw_text ?? "").trim();
  if (!name || !rawText) {
    return NextResponse.json({ error: "Введите название и текст системы ОДУ" }, { status: 400 });
  }
  const parsed = parseOdeSystemSafe(rawText);
  const structure = parsed.ok ? lightStructure(parsed.structure) : null;
  const model = createModel(name, rawText, structure);
  return NextResponse.json(model, { status: 201 });
}