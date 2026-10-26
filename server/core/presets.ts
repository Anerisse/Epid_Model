// ============================================================
// core/presets.ts — пресеты слайдеров типовых параметров.
// Общий источник правды для сервера: /api/parse отдаёт клиенту
// диапазон/шаг/начальные значения и единицу измерения каждого
// параметра модели.
// ============================================================

export interface ParamPreset {
  value: number;
  min: number;
  max: number;
  step: number;
  /** Единица измерения параметра — для подписи на клиенте. */
  unit: string;
}

// Размерности: скоростные коэффициенты в эпидемиологических ОДУ
// измеряются в 1/день, население/численность групп — в человек.
const RATE_UNIT = "1/день";
const POPULATION_UNIT = "чел.";

// Предустановки для типовых параметров эпидемиологических моделей
export const PARAM_PRESETS: Record<string, ParamPreset> = {
  "β": { value: 0.5, min: 0, max: 2, step: 0.01, unit: RATE_UNIT },
  "γ": { value: 0.2, min: 0, max: 1, step: 0.01, unit: RATE_UNIT },
  "σ": { value: 0.3, min: 0, max: 1, step: 0.01, unit: RATE_UNIT },
  "μ": { value: 0.02, min: 0, max: 0.5, step: 0.001, unit: RATE_UNIT },
  "α": { value: 0.1, min: 0, max: 1, step: 0.01, unit: RATE_UNIT },
  "δ": { value: 0.1, min: 0, max: 1, step: 0.01, unit: RATE_UNIT },
  "ε": { value: 0.1, min: 0, max: 1, step: 0.01, unit: RATE_UNIT },
  "λ": { value: 0.1, min: 0, max: 1, step: 0.01, unit: RATE_UNIT },
  "N": { value: 10000, min: 1000, max: 100000, step: 500, unit: POPULATION_UNIT },
  "n": { value: 10000, min: 1000, max: 100000, step: 500, unit: POPULATION_UNIT },
};

// Общий пресет для неизвестных параметров: в моделях это, как правило,
// скоростной коэффициент, поэтому размерность тоже 1/день.
export const GENERIC_PARAM_PRESET: ParamPreset = {
  value: 0.1,
  min: 0,
  max: 1,
  step: 0.01,
  unit: RATE_UNIT,
};

// Начальная «популяция», если в модели нет параметра N
export const DEFAULT_POPULATION = 10000;

// N/n — население: там, где заданы начальные условия, оно вычисляется
// как сумма компартментов, а не подбирается отдельным ползунком.
export function isPopulationParam(name: string): boolean {
  return name === "N" || name === "n";
}

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
