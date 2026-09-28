// ============================================================
// core/presets.ts — пресеты слайдеров типовых параметров.
// Общий источник правды для сервера: /api/parse отдаёт клиенту
// диапазон/шаг/начальные значения каждого параметра модели.
// ============================================================

export interface ParamPreset {
  value: number;
  min: number;
  max: number;
  step: number;
}

// Предустановки для типовых параметров эпидемиологических моделей
export const PARAM_PRESETS: Record<string, ParamPreset> = {
  "β": { value: 0.5, min: 0, max: 2, step: 0.01 },
  "γ": { value: 0.2, min: 0, max: 1, step: 0.01 },
  "σ": { value: 0.3, min: 0, max: 1, step: 0.01 },
  "μ": { value: 0.02, min: 0, max: 0.5, step: 0.001 },
  "α": { value: 0.1, min: 0, max: 1, step: 0.01 },
  "δ": { value: 0.1, min: 0, max: 1, step: 0.01 },
  "ε": { value: 0.1, min: 0, max: 1, step: 0.01 },
  "λ": { value: 0.1, min: 0, max: 1, step: 0.01 },
  "N": { value: 10000, min: 1000, max: 100000, step: 500 },
  "n": { value: 10000, min: 1000, max: 100000, step: 500 },
};

// Общий пресет для неизвестных параметров
export const GENERIC_PARAM_PRESET: ParamPreset = { value: 0.1, min: 0, max: 1, step: 0.01 };

// Начальная «популяция», если в модели нет параметра N
export const DEFAULT_POPULATION = 10000;

// Пресет параметра по имени (всегда возвращает валидный объект)
export function paramPreset(name: string): ParamPreset {
  return PARAM_PRESETS[name] || GENERIC_PARAM_PRESET;
}

// Карта пресетов для списка параметров модели
export function paramPresetsFor(names: string[]): Record<string, ParamPreset> {
  const out: Record<string, ParamPreset> = {};
  names.forEach((name) => {
    out[name] = paramPreset(name);
  });
  return out;
}