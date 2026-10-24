// ============================================================
// core/labels.ts — пользовательские названия компартментов и
// параметров модели (русский и английский варианты).
//
// Хранятся вместе с моделью в БД (колонка labels, JSON-строка)
// в виде:
//   { "S": { "ru": "Восприимчивые", "en": "Susceptible" },
//     "β": { "ru": "коэффициент заражения", "en": "transmission rate" } }
// Названия задаёт пользователь в редакторе модели; ключ — символ
// компартмента или параметра из разбора системы ОДУ.
// ============================================================

// Название одного термина (компартмента или параметра)
export interface TermLabel {
  ru: string;
  en: string;
}

// Карта названий: символ → название
export type LabelsMap = Record<string, TermLabel>;

// Предельная длина названия (символов)
const MAX_LEN = 120;

// Приводит произвольное значение из запроса к чистой карте названий:
// не-строки и пустые названия отбрасываются, лишние ключи не хранятся
export function sanitizeLabels(raw: unknown): LabelsMap {
  const out: LabelsMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const symbol = key.trim();
    if (!symbol) continue;
    const ru = readText((value as Record<string, unknown> | null)?.ru);
    const en = readText((value as Record<string, unknown> | null)?.en);
    if (!ru && !en) continue;
    out[symbol] = { ru, en };
  }
  return out;
}

// Читает строковое поле: обрезает пробелы и ограничивает длину
function readText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_LEN);
}
