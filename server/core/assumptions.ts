// ============================================================
// core/assumptions.ts — блок «Допущения модели».
// По разобранным уравнениям предлагает готовые допущения
// (замкнутая популяция, отсутствие латентного периода и т. д.),
// хранит ручные пометки исследователя и тексты предупреждений,
// если выбор расходится с уравнением.
// ============================================================
import { collectIdents, type ModelStructure } from "./parser";

// Идентификаторы допущений (стабильные ключи для БД и API)
export const ASSUMPTION_IDS = [
  "closedPopulation",
  "noLatentPeriod",
  "constantTransmission",
  "homogeneousMixing",
] as const;

export type AssumptionId = (typeof ASSUMPTION_IDS)[number];

// Одна автоматическая подсказка-допущение
export interface AssumptionCheck {
  id: AssumptionId;
  title: string;
  description: string;
  /** Что предлагает автоматический анализ уравнений */
  suggested: boolean;
  /** false — автоматика не уверена, решение остаётся за пользователем */
  auto: boolean;
  /** Короткое объяснение, почему поставлена галочка */
  evidence: string;
  /** Предупреждения при выборе, расходящемся с уравнением */
  warnings: { checked: string; unchecked: string };
}

// Пометки исследователя: подтверждённые/снятые галочки + свободный текст
export interface AssumptionsState {
  items: Partial<Record<AssumptionId, boolean>>;
  notes: string;
}

// Пустое состояние — для новой модели
export function emptyAssumptions(): AssumptionsState {
  return { items: {}, notes: "" };
}

// --- Автоматический анализ уравнений ----------------------------

// Используется ли в правых частях время (t и другие знаменатели dX/dt)
function usesTime(structure: ModelStructure): boolean {
  const timeNames = new Set(["t", ...structure.time_vars]);
  return structure.compartments.some((comp) => {
    for (const name of collectIdents(comp.rhsAST)) {
      if (timeNames.has(name)) return true;
    }
    return false;
  });
}

// Есть ли в параметрах смертность μ или рождаемость Λ
function hasBirthOrDeath(structure: ModelStructure): boolean {
  return structure.parameters.some(
    (p) => p === "μ" || p === "mu" || p === "Λ" || p === "Lambda",
  );
}

// Есть ли возрастная структура: параметр A/a/age (компартмент A —
// это чаще асимптоматические, поэтому его не учитываем)
function hasAgeStructure(structure: ModelStructure): boolean {
  const ageNames = new Set(["A", "a", "age", "Age"]);
  return structure.parameters.some((p) => ageNames.has(p));
}

// Предлагает ли модель «умные» галочки и что писать в предупреждениях
export function detectAssumptions(structure: ModelStructure): AssumptionCheck[] {
  const names = new Set(structure.compartments.map((c) => c.name));
  const flows = structure.flows;

  const birthOrDeath = hasBirthOrDeath(structure);
  const timeDependent = usesTime(structure);
  const ageStructure = hasAgeStructure(structure);

  // Прямой переход S → I или путь через промежуточный компартмент
  const directSI = flows.some((f) => f.from === "S" && f.to === "I");
  const latentPath = flows.some(
    (first) =>
      first.from === "S" &&
      first.to !== null &&
      first.to !== "I" &&
      flows.some((second) => second.from === first.to && second.to === "I"),
  );
  const latentCompartment = structure.compartments.some((c) =>
    ["E", "L", "Exposed", "Latent"].includes(c.name),
  );
  const hasSI = names.has("S") && names.has("I");

  let noLatentSuggested = true;
  let noLatentAuto = false;
  let noLatentEvidence = "не удалось определить по именам компартментов — проверьте вручную";

  if (directSI) {
    noLatentSuggested = true;
    noLatentAuto = true;
    noLatentEvidence = "найден прямой переход S → I";
  } else if (hasSI && (latentPath || latentCompartment)) {
    noLatentSuggested = false;
    noLatentAuto = true;
    noLatentEvidence = "переход S → I идёт через промежуточный компартмент";
  } else if (hasSI) {
    noLatentSuggested = false;
    noLatentAuto = true;
    noLatentEvidence = "прямой переход S → I не найден";
  }

  return [
    {
      id: "closedPopulation",
      title: "Замкнутая популяция",
      description: "Нет рождений и смертей: численность меняется только за счёт переходов между группами.",
      suggested: !birthOrDeath,
      auto: true,
      evidence: birthOrDeath
        ? "в уравнениях есть μ (смертность) или Λ (рождаемость)"
        : "μ и Λ в уравнениях не найдены",
      warnings: {
        checked:
          "Вы подтвердили замкнутую популяцию, но в уравнениях есть μ или Λ (смертность/рождаемость). Проверьте допущение.",
        unchecked:
          "Вы указали, что популяция не замкнута, но в уравнениях нет μ или Λ. Добавьте рождения/смерти или отметьте допущение.",
      },
    },
    {
      id: "noLatentPeriod",
      title: "Отсутствие латентного периода",
      description: "Заражённые сразу становятся заразными: переход S → I идёт напрямую.",
      suggested: noLatentSuggested,
      auto: noLatentAuto,
      evidence: noLatentEvidence,
      warnings: {
        checked:
          "Вы указали отсутствие латентного периода, но в уравнениях S → I идёт через промежуточный компартмент. Добавьте E/латентность или отметьте допущение.",
        unchecked:
          "Вы указали наличие латентного периода, но в уравнениях есть прямой переход S → I. Убедитесь, что это так.",
      },
    },
    {
      id: "constantTransmission",
      title: "Постоянная скорость передачи",
      description: "Коэффициенты не зависят от времени: нет сезонности и поведенческих реакций.",
      suggested: !timeDependent,
      auto: true,
      evidence: timeDependent
        ? "в правых частях уравнений есть зависимость от времени t"
        : "зависимости от времени t в уравнениях нет",
      warnings: {
        checked:
          "Вы указали постоянную скорость передачи, но в уравнениях есть зависимость от времени t. Убедитесь, что это так.",
        unchecked:
          "Вы указали сезонность или поведенческие реакции, но β и правые части не зависят от t. Добавьте зависимость от времени или отметьте допущение.",
      },
    },
    {
      id: "homogeneousMixing",
      title: "Однородное перемешивание",
      description: "Каждый контактирует с каждым: нет возрастной и социальной структуры контактов.",
      suggested: !ageStructure,
      auto: true,
      evidence: ageStructure
        ? "в параметрах есть A/age (возрастная структура)"
        : "возрастной структуры (A/age) в уравнениях нет",
      warnings: {
        checked:
          "Вы указали однородное перемешивание, но в уравнениях есть A/age. Проверьте допущение.",
        unchecked:
          "Вы указали неоднородное перемешивание, но в уравнениях нет возрастной структуры A/age. Добавьте её или отметьте допущение.",
      },
    },
  ];
}

// --- Очистка и хранение пометок --------------------------------

// Приводит вход из API/БД к безопасному состоянию: только известные
// идентификаторы, только boolean, ограниченная длина текста.
export function sanitizeAssumptions(input: unknown): AssumptionsState | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const rawItems =
    raw.items && typeof raw.items === "object" && !Array.isArray(raw.items)
      ? (raw.items as Record<string, unknown>)
      : raw;

  const items: Partial<Record<AssumptionId, boolean>> = {};
  for (const id of ASSUMPTION_IDS) {
    if (typeof rawItems[id] === "boolean") items[id] = rawItems[id] as boolean;
  }

  const notes = typeof raw.notes === "string" ? raw.notes.trim().slice(0, 5000) : "";
  return { items, notes };
}
