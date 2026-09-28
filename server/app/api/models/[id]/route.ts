// ============================================================
// app/api/models/[id]/route.ts — CRUD моделей: чтение, обновление,
// удаление одной модели по id.
// ============================================================
import { NextResponse } from "next/server";
import { parseOdeSystemSafe, lightStructure } from "@/core/parser";
import { deleteModel, getModel, updateModel } from "@/lib/db";

export const dynamic = "force-dynamic";

// Одна модель по id
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const num = Number(id);
  if (!Number.isInteger(num)) {
    return NextResponse.json({ error: "Некорректный id модели" }, { status: 400 });
  }
  const model = getModel(num);
  if (!model) {
    return NextResponse.json({ error: "Модель не найдена" }, { status: 404 });
  }
  return NextResponse.json(model);
}

// Частичное обновление name / raw_text (структура пересчитывается)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const num = Number(id);
  if (!Number.isInteger(num)) {
    return NextResponse.json({ error: "Некорректный id модели" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);

  const patch: { name?: string; raw_text?: string; structure?: unknown | null } = {};
  if (body?.name !== undefined) patch.name = String(body.name);
  if (body?.raw_text !== undefined) {
    patch.raw_text = String(body.raw_text);
    const parsed = parseOdeSystemSafe(patch.raw_text);
    patch.structure = parsed.ok ? lightStructure(parsed.structure) : null;
  }

  const model = updateModel(num, patch);
  if (!model) {
    return NextResponse.json({ error: "Модель не найдена" }, { status: 404 });
  }
  return NextResponse.json(model);
}

// Удаление модели
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const num = Number(id);
  if (!Number.isInteger(num)) {
    return NextResponse.json({ error: "Некорректный id модели" }, { status: 400 });
  }
  const ok = deleteModel(num);
  if (!ok) {
    return NextResponse.json({ error: "Модель не найдена" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}