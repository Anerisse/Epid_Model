// ============================================================
// lib/db.ts — локальная база данных (SQLite через better-sqlite3).
//
// Заменяет legacy Postgres+NestJS (этап 0): единственная сущность
// models (name, raw_text, structure JSON). База — файл server/data/epid.db,
// путь можно переопределить переменной окружения DB_PATH.
// ============================================================
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export interface ModelRecord {
  id: number;
  name: string;
  raw_text: string;
  structure: unknown | null;
  created_at: string;
  updated_at: string;
}

// Строка из БД до преобразования (structure — ещё JSON-строка)
interface RawModelRow {
  id: number;
  name: string;
  raw_text: string;
  structure: string | null;
  created_at: string;
  updated_at: string;
}

// Преобразует строку БД (structure — JSON-строка) в объект с snake_case
function toRecord(row: RawModelRow): ModelRecord {
  let structure: unknown | null = null;
  if (row.structure) {
    try {
      structure = JSON.parse(row.structure);
    } catch {
      structure = null;
    }
  }
  return {
    id: row.id,
    name: row.name,
    raw_text: row.raw_text,
    structure,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --- CRUD -----------------------------------------------------

// Список моделей (для выпадающего списка на клиенте)
export function listModels(): ModelRecord[] {
  const rows = db
    .prepare("SELECT id, name, raw_text, structure, created_at, updated_at FROM models ORDER BY id DESC")
    .all() as RawModelRow[];
  return rows.map(toRecord);
}

// Модель по id
export function getModel(id: number): ModelRecord | undefined {
  const row = db
    .prepare("SELECT id, name, raw_text, structure, created_at, updated_at FROM models WHERE id = ?")
    .get(id) as RawModelRow | undefined;
  return row ? toRecord(row) : undefined;
}

// Создание модели (structure — любой JSON-сериализуемый объект или null)
export function createModel(name: string, rawText: string, structure: unknown | null): ModelRecord {
  const info = db
    .prepare("INSERT INTO models (name, raw_text, structure) VALUES (?, ?, ?)")
    .run(name, rawText, structure === null ? null : JSON.stringify(structure));
  return getModel(Number(info.lastInsertRowid))!;
}

// Частичное обновление (name / raw_text / structure)
export function updateModel(
  id: number,
  patch: { name?: string; raw_text?: string; structure?: unknown | null },
): ModelRecord | undefined {
  const current = getModel(id);
  if (!current) return undefined;
  const name = patch.name !== undefined ? patch.name : current.name;
  const rawText = patch.raw_text !== undefined ? patch.raw_text : current.raw_text;
  const structure = Object.prototype.hasOwnProperty.call(patch, "structure")
    ? patch.structure
    : current.structure;
  db.prepare(
    "UPDATE models SET name = ?, raw_text = ?, structure = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(name, rawText, structure === null ? null : JSON.stringify(structure));
  return getModel(id)!;
}

// Удаление модели
export function deleteModel(id: number): boolean {
  const info = db.prepare("DELETE FROM models WHERE id = ?").run(id);
  return info.changes > 0;
}