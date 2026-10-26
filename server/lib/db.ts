// ============================================================
// lib/db.ts — локальная база данных (SQLite через better-sqlite3).
//
// Заменяет legacy Postgres+NestJS (этап 0): единственная сущность
// models (name, raw_text, structure JSON, labels JSON). База — файл
// server/data/epid.db, путь можно переопределить переменной окружения
// DB_PATH.
// ============================================================
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { sanitizeLabels, type LabelsMap } from "@/core/labels";
import { sanitizeAssumptions, type AssumptionsState } from "@/core/assumptions";

// Каталог БД: рядом с сервером (server/data), при необходимости — через DB_DIR
const dataDir = process.env.DB_DIR || path.join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });
const dbPath = process.env.DB_PATH || path.join(dataDir, "epid.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// Таблица models — поля api в snake_case (конвенция legacy-стека)
db.exec(`
  CREATE TABLE IF NOT EXISTS models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    structure TEXT,
    labels TEXT,
    assumptions TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Миграции: в старых базах может не быть новых колонок
const columns = db.prepare("PRAGMA table_info(models)").all() as { name: string }[];
if (!columns.some((c) => c.name === "labels")) {
  db.exec("ALTER TABLE models ADD COLUMN labels TEXT");
}
if (!columns.some((c) => c.name === "assumptions")) {
  db.exec("ALTER TABLE models ADD COLUMN assumptions TEXT");
}

export interface ModelRecord {
  id: number;
  name: string;
  raw_text: string;
  structure: unknown | null;
  labels: LabelsMap | null;
  assumptions: AssumptionsState | null;
  created_at: string;
  updated_at: string;
}

// Строка из БД до преобразования (structure/labels/assumptions — JSON-строки)
interface RawModelRow {
  id: number;
  name: string;
  raw_text: string;
  structure: string | null;
  labels: string | null;
  assumptions: string | null;
  created_at: string;
  updated_at: string;
}

// Разбирает JSON-строку в объект; при ошибке — null
function parseJson(raw: string | null): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Преобразует строку БД (structure/labels — JSON-строки) в объект с snake_case
function toRecord(row: RawModelRow): ModelRecord {
  const labelsRaw = parseJson(row.labels) as unknown;
  const assumptionsRaw = parseJson(row.assumptions) as unknown;
  return {
    id: row.id,
    name: row.name,
    raw_text: row.raw_text,
    structure: parseJson(row.structure),
    labels: labelsRaw ? sanitizeLabels(labelsRaw) : null,
    assumptions: assumptionsRaw ? sanitizeAssumptions(assumptionsRaw) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --- CRUD -----------------------------------------------------

// Список моделей (для выпадающего списка на клиенте)
export function listModels(): ModelRecord[] {
  const rows = db
    .prepare(
      "SELECT id, name, raw_text, structure, labels, assumptions, created_at, updated_at FROM models ORDER BY id DESC",
    )
    .all() as RawModelRow[];
  return rows.map(toRecord);
}

// Модель по id
export function getModel(id: number): ModelRecord | undefined {
  const row = db
    .prepare(
      "SELECT id, name, raw_text, structure, labels, assumptions, created_at, updated_at FROM models WHERE id = ?",
    )
    .get(id) as RawModelRow | undefined;
  return row ? toRecord(row) : undefined;
}

// Создание модели (structure — любой JSON-сериализуемый объект или null,
// labels — пользовательские названия терминов, assumptions — допущения)
export function createModel(
  name: string,
  rawText: string,
  structure: unknown | null,
  labels?: LabelsMap | null,
  assumptions?: AssumptionsState | null,
): ModelRecord {
  const info = db
    .prepare(
      "INSERT INTO models (name, raw_text, structure, labels, assumptions) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      name,
      rawText,
      structure === null ? null : JSON.stringify(structure),
      labels ? JSON.stringify(sanitizeLabels(labels)) : null,
      assumptions ? JSON.stringify(sanitizeAssumptions(assumptions)) : null,
    );
  return getModel(Number(info.lastInsertRowid))!;
}

// Частичное обновление (name / raw_text / structure / labels / assumptions)
export function updateModel(
  id: number,
  patch: {
    name?: string;
    raw_text?: string;
    structure?: unknown | null;
    labels?: LabelsMap | null;
    assumptions?: AssumptionsState | null;
  },
): ModelRecord | undefined {
  const current = getModel(id);
  if (!current) return undefined;
  const name = patch.name !== undefined ? patch.name : current.name;
  const rawText = patch.raw_text !== undefined ? patch.raw_text : current.raw_text;
  const structure = Object.prototype.hasOwnProperty.call(patch, "structure")
    ? patch.structure
    : current.structure;
  const labels = Object.prototype.hasOwnProperty.call(patch, "labels")
    ? patch.labels === null
      ? null
      : sanitizeLabels(patch.labels)
    : current.labels;
  const assumptions = Object.prototype.hasOwnProperty.call(patch, "assumptions")
    ? patch.assumptions === null
      ? null
      : sanitizeAssumptions(patch.assumptions)
    : current.assumptions;
  db.prepare(
    "UPDATE models SET name = ?, raw_text = ?, structure = ?, labels = ?, assumptions = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(
    name,
    rawText,
    structure === null ? null : JSON.stringify(structure),
    labels === null ? null : JSON.stringify(labels),
    assumptions === null ? null : JSON.stringify(assumptions),
    id,
  );
  return getModel(id)!;
}


// Удаление модели
export function deleteModel(id: number): boolean {
  const info = db.prepare("DELETE FROM models WHERE id = ?").run(id);
  return info.changes > 0;
}