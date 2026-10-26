// ============================================================
// lib/model-context.tsx — общее состояние модели на клиенте.
// Текст ОДУ, название и результат разбора (структура, пресеты
// ползунков, раскладка блок-схемы) живут здесь: разделы
// «Модель», «Симуляция» и «Параметризация» работают с одной
// моделью, как было в legacy-интерфейсе.
// Разбор (POST /api/parse) выполняется на сервере с дебаунсом.
// ============================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, type DiagramLayout, type FitResponse, type LabelsMap, type ModelRecord, type ModelStructure, type ParamPreset } from "./api";

// Текст SIR по умолчанию, если в базе ещё нет ни одной модели
const DEFAULT_MODEL_TEXT = [
  "dS/dt = -β*S*I/N",
  "dE/dt = β*S*I/N - σ*E",
  "dI/dt = σ*E - γ*I",
  "dR/dt = γ*I",
].join("\n");

interface ModelContextValue {
  text: string;
  name: string;
  structure: ModelStructure | null;
  presets: Record<string, ParamPreset> | null;
  diagram: DiagramLayout | null;
  parseError: string | null;
  models: ModelRecord[];
  /** Результат последней оценки параметров — для статуса модели в шапке */
  fitResult: FitResponse | null;
  /** Пользовательские названия терминов: символ → { ru, en } */
  labels: LabelsMap;
  /** id модели в БД, если текущая модель уже сохранена (иначе null) */
  currentId: number | null;
  setText: (t: string) => void;
  setName: (n: string) => void;
  setLabels: (l: LabelsMap) => void;
  setFitResult: (r: FitResponse | null) => void;
  refresh: () => void;
  /** Создаёт модель в БД; без аргументов берутся текущие текст, название и названия */
  save: (opts?: { name?: string; raw_text?: string; labels?: LabelsMap }) => Promise<string | null>;
  /** Обновляет сохранённую модель (название, уравнение, названия терминов) */
  updateModel: (
    id: number,
    patch: { name?: string; raw_text?: string; labels?: LabelsMap },
  ) => Promise<string | null>;
  remove: (id: number) => Promise<void>;
  load: (m: ModelRecord) => void;
  loading: boolean;
}

const ModelContext = createContext<ModelContextValue | null>(null);

export function useModel(): ModelContextValue {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error("useModel должен использоваться внутри ModelProvider");
  return ctx;
}

export function ModelProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [structure, setStructure] = useState<ModelStructure | null>(null);
  const [presets, setPresets] = useState<Record<string, ParamPreset> | null>(null);
  const [diagram, setDiagram] = useState<DiagramLayout | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [fitResult, setFitResult] = useState<FitResponse | null>(null);
  const [labels, setLabels] = useState<LabelsMap>({});
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Загрузка списка моделей при старте; если модели есть — открываем
  // последнюю сохранённую, как в legacy-интерфейсе
  useEffect(() => {
    let alive = true;
    api.models
      .list()
      .then((list) => {
        if (!alive) return;
        setModels(list);
        setText((prev) => {
          if (prev) return prev;
          return list.length ? list[0].raw_text : DEFAULT_MODEL_TEXT;
        });
        setName((prev) => {
          if (prev) return prev;
          return list.length ? list[0].name : "";
        });
      })
      .catch(() => setModels([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Разбор текста на сервере с дебаунсом (300 мс)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    // Модель изменилась — прежняя оценка параметров к ней не относится
    setFitResult(null);
    if (!text.trim()) {
      setStructure(null);
      setDiagram(null);
      setParseError(null);
      return;
    }
    timer.current = setTimeout(() => {
      api
        .parse(text)
        .then((res) => {
          if (res.ok && res.structure && res.diagram && res.presets) {
            setStructure(res.structure);
            setDiagram(res.diagram);
            setPresets(res.presets);
            setParseError(null);
          } else {
            setStructure(null);
            setDiagram(null);
            setParseError(res.error || "Не удалось разобрать модель");
          }
        })
        .catch((err) => {
          setStructure(null);
          setDiagram(null);
          setParseError(err instanceof Error ? err.message : String(err));
        });
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text]);

  const refresh = useCallback(() => {
    api.models
      .list()
      .then(setModels)
      .catch(() => setModels([]));
  }, []);

  const save = useCallback(
    async (opts?: { name?: string; raw_text?: string; labels?: LabelsMap }): Promise<string | null> => {
      const finalName = (opts?.name ?? name).trim();
      const finalText = opts?.raw_text ?? text;
      let finalLabels = opts?.labels ?? labels;
      // При сохранении добираем названия из словаря для известных символов
      const dictC: Record<string, { ru: string; en: string }> = {
        S: { ru: "Восприимчивые", en: "Susceptible" },
        E: { ru: "Латентно инфицированные", en: "Exposed" },
        I: { ru: "Инфицированные", en: "Infectious" },
        R: { ru: "Выздоровевшие", en: "Recovered" },
        D: { ru: "Умершие", en: "Deceased" },
        A: { ru: "Асимптоматические", en: "Asymptomatic" },
        H: { ru: "Госпитализированные", en: "Hospitalized" },
        Q: { ru: "Карантин", en: "Quarantined" },
        V: { ru: "Вакцинированные", en: "Vaccinated" },
        C: { ru: "Карциномные/контакты", en: "Carriers" },
        M: { ru: "Материнский иммунитет", en: "Maternal immunity" },
        J: { ru: "Изолированные", en: "Isolated" },
      };
      const dictP: Record<string, { ru: string; en: string }> = {
        beta: { ru: "Коэффициент заражения", en: "Transmission rate" },
        "\u03B2": { ru: "Коэффициент заражения", en: "Transmission rate" },
        gamma: { ru: "Коэффициент выздоровления", en: "Recovery rate" },
        "\u03B3": { ru: "Коэффициент выздоровления", en: "Recovery rate" },
        sigma: { ru: "Коэффициент инкубации", en: "Incubation rate" },
        "\u03C3": { ru: "Коэффициент инкубации", en: "Incubation rate" },
        mu: { ru: "Естественная смертность/рождаемость", en: "Natural mortality/birth" },
        "\u03BC": { ru: "Естественная смертность/рождаемость", en: "Natural mortality/birth" },
        nu: { ru: "Коэффициент потери иммунитета", en: "Loss of immunity" },
        "\u03BD": { ru: "Коэффициент потери иммунитета", en: "Loss of immunity" },
        alpha: { ru: "Коэффициент смертности", en: "Disease-induced mortality" },
        "\u03B1": { ru: "Коэффициент смертности", en: "Disease-induced mortality" },
        delta: { ru: "Коэффициент карантина/изоляции", en: "Quarantine/isolation" },
        "\u03B4": { ru: "Коэффициент карантина/изоляции", en: "Quarantine/isolation" },
        epsilon: { ru: "Коэффициент госпитализации", en: "Hospitalization" },
        "\u03B5": { ru: "Коэффициент госпитализации", en: "Hospitalization" },
        lambda: { ru: "Коэффициент вакцинации", en: "Vaccination rate" },
        "\u03BB": { ru: "Коэффициент вакцинации", en: "Vaccination rate" },
        rho: { ru: "Коэффициент контактов", en: "Contact rate" },
        "\u03C1": { ru: "Коэффициент контактов", en: "Contact rate" },
      };
      const merged: LabelsMap = { ...finalLabels };
      const compRe = /d([A-Za-z])\/dt|([A-Za-z])\s*'=|∂([A-Za-z])\/∂t/gi;
      for (const m of finalText.matchAll(compRe)) {
        const n = m[1] || m[2] || m[3];
        if (!n || n === "N" || n === "n") continue;
        if (dictC[n] && !merged[n]?.ru && !merged[n]?.en) merged[n] = dictC[n];
      }
      const tokens = finalText.match(/[A-Za-zΑ-Ωα-ω]+/g) || [];
      const seen = new Set<string>();
      for (const t of tokens) {
        if (seen.has(t)) continue;
        seen.add(t);
        if (t === "N" || t === "n") continue;
        if (dictP[t] && !merged[t]?.ru && !merged[t]?.en) merged[t] = dictP[t];
      }
      finalLabels = merged;
      if (!finalName || !finalText.trim()) return "Введите название и текст системы ОДУ";
      try {
        const created = await api.models.create(finalName, finalText, finalLabels);
        setModels((prev) => [created, ...prev]);
        setCurrentId(created.id);
        // При сохранении из редактора — принимаем правки как текущую модель
        if (opts) {
          setName(created.name);
          setText(created.raw_text);
          setLabels(created.labels ?? {});
        } else {
          setName("");
        }
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
    [name, text, labels],
  );

  // Обновление сохранённой модели: название, уравнение, названия терминов
  const updateModel = useCallback(
    async (
      id: number,
      patch: { name?: string; raw_text?: string; labels?: LabelsMap },
    ): Promise<string | null> => {
      try {
        let patchToSend = patch;
        if (patch.labels || patch.raw_text !== undefined) {
          const srcText = patch.raw_text !== undefined ? patch.raw_text : text;
          const base = patch.labels ?? labels;
          const dictC: Record<string, { ru: string; en: string }> = {
            S: { ru: "Восприимчивые", en: "Susceptible" },
            E: { ru: "Латентно инфицированные", en: "Exposed" },
            I: { ru: "Инфицированные", en: "Infectious" },
            R: { ru: "Выздоровевшие", en: "Recovered" },
            D: { ru: "Умершие", en: "Deceased" },
            A: { ru: "Асимптоматические", en: "Asymptomatic" },
            H: { ru: "Госпитализированные", en: "Hospitalized" },
            Q: { ru: "Карантин", en: "Quarantined" },
            V: { ru: "Вакцинированные", en: "Vaccinated" },
            C: { ru: "Карциномные/контакты", en: "Carriers" },
            M: { ru: "Материнский иммунитет", en: "Maternal immunity" },
            J: { ru: "Изолированные", en: "Isolated" },
          };
          const dictP: Record<string, { ru: string; en: string }> = {
            beta: { ru: "Коэффициент заражения", en: "Transmission rate" },
            "\u03B2": { ru: "Коэффициент заражения", en: "Transmission rate" },
            gamma: { ru: "Коэффициент выздоровления", en: "Recovery rate" },
            "\u03B3": { ru: "Коэффициент выздоровления", en: "Recovery rate" },
            sigma: { ru: "Коэффициент инкубации", en: "Incubation rate" },
            "\u03C3": { ru: "Коэффициент инкубации", en: "Incubation rate" },
            mu: { ru: "Естественная смертность/рождаемость", en: "Natural mortality/birth" },
            "\u03BC": { ru: "Естественная смертность/рождаемость", en: "Natural mortality/birth" },
            nu: { ru: "Коэффициент потери иммунитета", en: "Loss of immunity" },
            "\u03BD": { ru: "Коэффициент потери иммунитета", en: "Loss of immunity" },
            alpha: { ru: "Коэффициент смертности", en: "Disease-induced mortality" },
            "\u03B1": { ru: "Коэффициент смертности", en: "Disease-induced mortality" },
            delta: { ru: "Коэффициент карантина/изоляции", en: "Quarantine/isolation" },
            "\u03B4": { ru: "Коэффициент карантина/изоляции", en: "Quarantine/isolation" },
            epsilon: { ru: "Коэффициент госпитализации", en: "Hospitalization" },
            "\u03B5": { ru: "Коэффициент госпитализации", en: "Hospitalization" },
            lambda: { ru: "Коэффициент вакцинации", en: "Vaccination rate" },
            "\u03BB": { ru: "Коэффициент вакцинации", en: "Vaccination rate" },
            rho: { ru: "Коэффициент контактов", en: "Contact rate" },
            "\u03C1": { ru: "Коэффициент контактов", en: "Contact rate" },
          };
          const merged: LabelsMap = { ...base };
          const compRe = /d([A-Za-z])\/dt|([A-Za-z])\s*'=|∂([A-Za-z])\/∂t/gi;
          for (const m of srcText.matchAll(compRe)) {
            const n = m[1] || m[2] || m[3];
            if (!n || n === "N" || n === "n") continue;
            if (dictC[n] && !merged[n]?.ru && !merged[n]?.en) merged[n] = dictC[n];
          }
          const tokens = srcText.match(/[A-Za-zΑ-Ωα-ω]+/g) || [];
          const seen = new Set<string>();
          for (const t of tokens) {
            if (seen.has(t)) continue;
            seen.add(t);
            if (t === "N" || t === "n") continue;
            if (dictP[t] && !merged[t]?.ru && !merged[t]?.en) merged[t] = dictP[t];
          }
          patchToSend = { ...patch, labels: merged };
        }
        const updated = await api.models.update(id, patchToSend);
        setModels((prev) => prev.map((m) => (m.id === id ? updated : m)));
        if (id === currentId) {
          if (patch.name !== undefined) setName(updated.name);
          if (patch.raw_text !== undefined) setText(updated.raw_text);
          if (patchToSend.labels !== undefined) setLabels(updated.labels ?? patchToSend.labels);
        }
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
    [currentId],
  );

  const remove = useCallback(
    async (id: number) => {
      try {
        await api.models.remove(id);
        setModels((prev) => prev.filter((m) => m.id !== id));
      } catch {
        // ошибка удаления — просто обновляем список
        refresh();
      }
    },
    [refresh],
  );

  const load = useCallback((m: ModelRecord) => {
    setName(m.name);
    setText(m.raw_text);
    setLabels(m.labels ?? {});
    setCurrentId(m.id);
  }, []);

  return (
    <ModelContext.Provider
      value={{
        text,
        name,
        structure,
        presets,
        diagram,
        parseError,
        models,
        fitResult,
        labels,
        currentId,
        setText,
        setName,
        setLabels,
        setFitResult,
        refresh,
        save,
        updateModel,
        remove,
        load,
        loading,
      }}
    >
      {children}
    </ModelContext.Provider>
  );
}