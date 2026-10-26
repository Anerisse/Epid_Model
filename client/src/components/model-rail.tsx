// ============================================================
// components/model-rail.tsx — вкладка «Модель» у правого края
// рабочей области (под шапкой). Не во всю высоту: узкая кнопка-
// вкладка с вертикальной подписью и индикатором пройденных этапов
// дорожной карты (введена → названия компартментов →
// отпараметризована → верифицирована). По нажатию раскрывается
// подробный статус, а внутри — карандаш редактора модели.
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Circle, Pencil } from "lucide-react";
import { useModel } from "../lib/model-context";
import { ModelEditorDialog, type EditTarget } from "./model-editor-dialog";
import { cn } from "../lib/utils";

// Этап дорожной карты работы с моделью
interface Step {
  id: string;
  title: string;
  done: boolean;
  detail: string;
}

export function ModelRail() {
  const { text, name, structure, fitResult, models, labels, assumptions, currentId } = useModel();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const railRef = useRef<HTMLElement | null>(null);

  // Закрываем раскрытую панель по клику вне и по Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (railRef.current && !railRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const compartments = useMemo(() => structure?.compartments.map((c) => c.name) ?? [], [structure]);
  const paramCount = structure?.parameters.length ?? 0;

  // Дорожная карта: состояние этапов выводится из общей модели
  const steps: Step[] = [
    {
      id: "entered",
      title: "Введена",
      done: text.trim().length > 0,
      detail: text.trim() ? "Текст системы ОДУ задан" : "Введите систему ОДУ в разделе «Модель»",
    },
    {
      id: "compartments",
      title: "Заданы названия компартментов",
      done: compartments.length > 0,
      detail: compartments.length
        ? `${compartments.join(" · ")} · параметров: ${paramCount}`
        : "Компартменты не распознаны",
    },
    {
      id: "fit",
      title: "Отпараметризована",
      done: Boolean(fitResult),
      detail: fitResult
        ? Object.entries(fitResult.params)
            .map(([k, v]) => `${k} = ${Number(v.toFixed(4))}`)
            .join(" · ")
        : "Оцените параметры в разделе «Параметризация»",
    },
    {
      id: "verify",
      title: "Верифицирована",
      done: false,
      detail: "Раздел «Верификация» в разработке",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const title = name.trim() || compartments.join(" · ") || "Модель не названа";

  // Что правим в редакторе: запись из базы (если текущая модель сохранена)
  // либо текущий черновик
  const saved = currentId ? models.find((m) => m.id === currentId) : undefined;
  const editTarget: EditTarget | null = !editorOpen
    ? null
    : saved
      ? {
          id: saved.id,
          name: saved.name,
          raw_text: saved.raw_text,
          labels: saved.labels ?? {},
          assumptions: saved.assumptions ?? null,
        }
      : { id: null, name, raw_text: text, labels, assumptions };

  return (
    <aside
      ref={railRef}
      className="app-rail relative flex w-11 shrink-0 self-start flex-col items-center rounded-bl-xl border-b border-l border-slate-800/70 bg-ink-900/40"
    >
      {/* Вкладка-кнопка «Модель»: вертикальная подпись и индикатор
          этапов. Нажатие раскрывает подробный статус работы */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`${title} — статус ${doneCount} из ${steps.length} этапов`}
        className="flex w-full flex-col items-center gap-2.5 px-1 py-3 transition-colors hover:bg-slate-800/50"
      >
        {/* Вертикальная подпись «Модель». Каждая буква — отдельной
            строкой с плотным интерлиньяжем: при writing-mode шаг между
            буквами берётся из вертикальных метрик шрифта и получается
            слишком большим */}
        <span className="flex flex-col items-center text-[13px] font-bold text-slate-300">
          {"Модель".split("").map((ch, i) => (
            <span key={i} className="leading-[0.95]">
              {ch}
            </span>
          ))}
        </span>

        {/* Индикатор этапов: закрашенная точка — этап пройден */}
        <span className="flex flex-col items-center gap-1.5">
          {steps.map((s) => (
            <span
              key={s.id}
              title={s.title}
              className={cn("size-2 rounded-full", s.done ? "bg-emerald-400" : "bg-slate-700")}
            />
          ))}
        </span>
      </button>

      {/* Раскрытая панель: подробный статус по этапам (влево от полосы) */}
      {open && (
        <div className="surface-float absolute right-full top-0 z-50 mr-2 w-[340px] rounded-xl border border-slate-700 bg-ink-900 p-3">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Текущая модель
              </p>
              <p className="truncate text-sm font-semibold text-slate-100">{title}</p>
            </div>
            <span className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 font-mono text-[11px] text-slate-400">
              {doneCount}/{steps.length} этапов
            </span>
          </div>

          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Дорожная карта
          </p>
          <ol className="space-y-2.5">
            {steps.map((s) => (
              <li key={s.id} className="flex gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                    s.done
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                      : "border-slate-700 text-slate-600",
                  )}
                >
                  {s.done ? <Check className="size-3" /> : <Circle className="size-2.5" />}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-xs font-semibold",
                      s.done ? "text-slate-100" : "text-slate-500",
                    )}
                  >
                    {s.title}
                  </span>
                  <span className="block text-[11px] leading-relaxed text-slate-500">{s.detail}</span>
                </span>
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setEditorOpen(true);
            }}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:border-emerald-500/70 hover:bg-emerald-500/20"
          >
            <Pencil className="size-3.5" />
            Назвать термины и изменить уравнение
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/");
            }}
            className="mt-2 w-full rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100"
          >
            Открыть раздел «Модель»
          </button>
        </div>
      )}

      {/* Окно редактора модели: уравнение и названия терминов (рус./англ.) */}
      <ModelEditorDialog target={editTarget} onClose={() => setEditorOpen(false)} />
    </aside>
  );
}
