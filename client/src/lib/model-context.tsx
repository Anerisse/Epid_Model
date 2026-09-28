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
import { api, type DiagramLayout, type ModelRecord, type ModelStructure, type ParamPreset } from "./api";

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
  setText: (t: string) => void;
  setName: (n: string) => void;
  refresh: () => void;
  save: () => Promise<string | null>;
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

  const save = useCallback(async (): Promise<string | null> => {
    const trimmedName = name.trim();
    if (!trimmedName || !text.trim()) return "Введите название и текст системы ОДУ";
    try {
      const created = await api.models.create(trimmedName, text);
      setModels((prev) => [created, ...prev]);
      setName("");
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, [name, text]);

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
        setText,
        setName,
        refresh,
        save,
        remove,
        load,
        loading,
      }}
    >
      {children}
    </ModelContext.Provider>
  );
}