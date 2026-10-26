// ============================================================
// components/model-editor-dialog.tsx — окно редактирования модели:
// название, текст системы ОДУ, пользовательские названия
// компартментов и параметров (русский и английский варианты)
// и допущения модели (галочки + заметки).
//
// Открывается по клику на модель в списке сохранённых и по
// карандашику в блоке «Структура модели». Компартменты, параметры
// и подсказки по допущениям подбираются разбором текущего текста
// ОДУ (сервер, /api/parse); допущения правятся локально и попадают
// в БД только по кнопке «Сохранить в базу».
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pencil, Save, Upload, X } from "lucide-react";
import {
  api,
  type AssumptionCheck,
  type AssumptionsState,
  type LabelsMap,
  type ModelStructure,
} from "../lib/api";
import { useModel } from "../lib/model-context";
import { ModelAssumptions } from "./model-assumptions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

// Что редактируем: запись БД (id) либо черновик текущей модели (id = null)
export interface EditTarget {
  id: number | null;
  name: string;
  raw_text: string;
  labels: LabelsMap;
  /** Допущения сохранённой модели — переносятся обратно в рабочую модель */
  assumptions: AssumptionsState | null;
}

interface ModelEditorDialogProps {
  target: EditTarget | null;
  onClose: () => void;
}

export function ModelEditorDialog({ target, onClose }: ModelEditorDialogProps) {
  const {
    save,
    updateModel,
    load,
    setName: applyName,
    setText: applyText,
    setLabels: applyLabels,
    setAssumptions: applyAssumptions,
  } = useModel();
  const [name, setNameLocal] = useState("");
  const [rawText, setRawText] = useState("");
  const [labels, setLabelsLocal] = useState<LabelsMap>({});
  const [structure, setStructure] = useState<ModelStructure | null>(null);
  // Допущения редактируются локально: в БД (или в рабочую модель) они
  // попадают по кнопкам «Сохранить в базу» / «В редактор модели»
  const [assumptions, setAssumptionsLocal] = useState<AssumptionsState>({ items: {}, notes: "" });
  const [assumptionChecks, setAssumptionChecks] = useState<AssumptionCheck[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // При открытии окна подставляем данные редактируемой модели
  useEffect(() => {
    if (!target) return;
    setNameLocal(target.name);
    setRawText(target.raw_text);
    setLabelsLocal(target.labels ?? {});
    setAssumptionsLocal(target.assumptions ?? { items: {}, notes: "" });
    setError(null);
    setParseError(null);
  }, [target]);

  // Разбор текста ОДУ с дебаунсом — чтобы показать компартменты,
  // параметры и подсказки по допущениям
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!rawText.trim()) {
      setStructure(null);
      setAssumptionChecks([]);
      setParseError(null);
      return;
    }
    timer.current = setTimeout(() => {
      api
        .parse(rawText)
        .then((res) => {
          if (res.ok && res.structure) {
            setStructure(res.structure);
            setAssumptionChecks(res.assumptions ?? []);
            setParseError(null);
          } else {
            setStructure(null);
            setAssumptionChecks([]);
            setParseError(res.error ?? "Не удалось разобрать систему ОДУ");
          }
        })
        .catch((err) => {
          setStructure(null);
          setAssumptionChecks([]);
          setParseError(err instanceof Error ? err.message : String(err));
        });
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [rawText]);

  // Закрытие по Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Списки терминов по группам: сначала компартменты, затем коэффициенты
  const compartments = useMemo(() => {
    if (!structure) return [] as string[];
    return structure.compartments.map((c) => c.name);
  }, [structure]);

  const parameters = useMemo(() => {
    if (!structure) return [] as string[];
    const compSet = new Set(compartments);
    // N — численность популяции, обычно название не требуется
    return structure.parameters.filter((p) => !compSet.has(p) && p !== "N" && p !== "n");
  }, [structure, compartments]);

  const hasTerms = compartments.length > 0 || parameters.length > 0;

  if (!target) return null;

  // Изменение названия одного термина (пустая строка — названия нет)
  const setLabel = (symbol: string, key: "ru" | "en", value: string) => {
    setLabelsLocal((prev) => {
      const next: LabelsMap = { ...prev };
      const current = next[symbol] ?? { ru: "", en: "" };
      const updated = { ...current, [key]: value };
      if (!updated.ru && !updated.en) delete next[symbol];
      else next[symbol] = updated;
      return next;
    });
  };

  // Сохранение: новая модель — создаётся, существующая — обновляется
  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const message = target.id
        ? await updateModel(target.id, { name, raw_text: rawText, labels, assumptions })
        : await save({ name, raw_text: rawText, labels, assumptions });
      if (message) {
        setError(message);
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  // Перенос содержимого окна в рабочую модель (без записи в БД)
  const handleLoad = () => {
    if (target.id) {
      load({
        id: target.id,
        name,
        raw_text: rawText,
        structure: null,
        labels,
        assumptions,
        created_at: "",
        updated_at: "",
      });
    } else {
      // Черновик: модель ещё не в БД — обновляем только рабочее состояние
      applyName(name);
      applyText(rawText);
      applyLabels(labels);
      applyAssumptions(assumptions);
    }
    onClose();
  };

  return (
    // Затемнение и окно по центру экрана
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="surface-float flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-ink-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Шапка окна */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Pencil className="size-4 text-emerald-300" />
              Редактор модели
            </h2>
            <p className="truncate text-[11px] text-slate-500">
              {target.id ? `Модель #${target.id} в базе` : "Новая модель — будет сохранена в базу"} · названия
              терминов видны в схеме и в отчётах
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть редактор">
            <X className="size-4" />
          </Button>
        </div>

        {/* Содержимое */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Название модели</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setNameLocal(e.target.value)}
              placeholder="Например: SEIR с естественной смертностью"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-ode">Текст системы ОДУ</Label>
            <Textarea
              id="edit-ode"
              rows={7}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="font-mono text-xs"
              placeholder={"dS/dt = -β*S*I/N\ndE/dt = β*S*I/N - σ*E\ndI/dt = σ*E - γ*I\ndR/dt = γ*I"}
            />
            {parseError && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-300">
                {parseError}
              </p>
            )}
          </div>

          {/* Названия терминов: компартменты и параметры (коэффициенты) */}
          <div className="space-y-4">
            <div className="flex items-baseline justify-between gap-2">
              <Label>Названия терминов</Label>
              <span className="text-[11px] text-slate-500">русский · английский</span>
            </div>
            {!hasTerms ? (
              <p className="rounded-lg border border-dashed border-slate-700 px-3 py-3 text-xs text-slate-500">
                {parseError
                  ? "Исправьте систему ОДУ — список терминов появится автоматически."
                  : "Введите систему ОДУ — компартменты и параметры будут распознаны."}
              </p>
            ) : (
              <>
                {/* Компартменты */}
                {compartments.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Компартменты
                    </p>
                    <div className="overflow-hidden rounded-lg border border-slate-800">
                      <div className="grid grid-cols-[56px_1fr_1fr] gap-2 bg-slate-800/40 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        <span>Символ</span>
                        <span>Русский</span>
                        <span>Английский</span>
                      </div>
                      {compartments.map((symbol) => (
                        <div
                          key={symbol}
                          className="grid grid-cols-[56px_1fr_1fr] items-center gap-2 border-t border-slate-800 px-2 py-1.5"
                        >
                          <span className="inline-flex w-fit items-center rounded-md border border-slate-700 bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-100">
                            {symbol}
                          </span>
                          <Input
                            value={labels[symbol]?.ru ?? ""}
                            onChange={(e) => setLabel(symbol, "ru", e.target.value)}
                            placeholder="Восприимчивые"
                            className="h-8 text-xs"
                          />
                          <Input
                            value={labels[symbol]?.en ?? ""}
                            onChange={(e) => setLabel(symbol, "en", e.target.value)}
                            placeholder="Susceptible"
                            className="h-8 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Коэффициенты (параметры) */}
                {parameters.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Коэффициенты
                    </p>
                    <div className="overflow-hidden rounded-lg border border-slate-800">
                      <div className="grid grid-cols-[56px_1fr_1fr] gap-2 bg-slate-800/40 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        <span>Символ</span>
                        <span>Русский</span>
                        <span>Английский</span>
                      </div>
                      {parameters.map((symbol) => (
                        <div
                          key={symbol}
                          className="grid grid-cols-[56px_1fr_1fr] items-center gap-2 border-t border-slate-800 px-2 py-1.5"
                        >
                          <span className="inline-flex w-fit items-center rounded-md border border-slate-700 bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-100">
                            {symbol}
                          </span>
                          <Input
                            value={labels[symbol]?.ru ?? ""}
                            onChange={(e) => setLabel(symbol, "ru", e.target.value)}
                            placeholder="Коэффициент заражения"
                            className="h-8 text-xs"
                          />
                          <Input
                            value={labels[symbol]?.en ?? ""}
                            onChange={(e) => setLabel(symbol, "en", e.target.value)}
                            placeholder="transmission rate"
                            className="h-8 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Численность популяции N — общая величина, её название обычно не задают.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Допущения модели — те же галочки и заметки, что на странице,
          но правятся локально и сохраняются вместе с этой записью
          (или переносятся в рабочую модель кнопкой «В редактор модели») */}
          <ModelAssumptions
            checks={assumptionChecks}
            value={assumptions}
            onChange={setAssumptionsLocal}
            idPrefix="edit-assumption"
            className="h-auto bg-ink-900/40"
          />

          {error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          )}
        </div>

        {/* Подвал с действиями */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-800 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="secondary" size="sm" onClick={handleLoad}>
            <Upload className="size-3.5" /> В редактор модели
          </Button>
          <Button size="sm" onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Сохранить в базу
          </Button>
        </div>
      </div>
    </div>
  );
}
