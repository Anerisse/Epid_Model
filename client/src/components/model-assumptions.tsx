// ============================================================
// components/model-assumptions.tsx — блок «Допущения модели».
// Часть А: автоматические подсказки по уравнениям (пользователь
// может подтвердить или снять галочку). Часть Б: предупреждения,
// если выбор расходится с уравнением. Часть В: свободные заметки
// исследователя, которые затем попадут в итоговый отчёт.
// Блок компактный: пояснения — в подсказках «?» при наведении,
// поле заметок раскрывается по «+» (и свёрнуто, если пусто).
// ============================================================
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronUp, Pencil, Plus, Sparkles, Undo2 } from "lucide-react";
import type { AssumptionCheck, AssumptionId, AssumptionsState } from "../lib/api";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { Hint } from "./ui/hint";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

// Общее пояснение к блоку — в подсказке рядом с заголовком
const BLOCK_HINT =
  "Что уравнения уже подразумевают, а что осталось за их рамками. Подтвердите подсказки или снимите галочку — и допишите то, чего в модели нет.";

interface ModelAssumptionsProps {
  /** Подсказки автоматики по текущему тексту ОДУ (пусто — система не разобрана) */
  checks: AssumptionCheck[];
  /** Текущее состояние: ручные пометки и заметки */
  value: AssumptionsState;
  /** Изменение состояния (в редакторе модели — черновик до сохранения) */
  onChange: (next: AssumptionsState) => void;
  /** Префикс id полей: две карточки на странице (страница + окно) не должны конфликтовать */
  idPrefix?: string;
  /** Дополнительные классы карточки (в окне редактора — без растягивания) */
  className?: string;
}

// Блок управляемый: состояние приходит пропсами, поэтому один и тот же
// компонент работает и на странице «Модель», и в окне редактора модели.
export function ModelAssumptions({
  checks,
  value,
  onChange,
  idPrefix = "assumption",
  className,
}: ModelAssumptionsProps) {
  const [notesOpen, setNotesOpen] = useState(() => value.notes.trim().length > 0);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const hasNotes = value.notes.trim().length > 0;

  // Если загрузили модель с заметками — сразу показываем поле
  useEffect(() => {
    if (hasNotes) setNotesOpen(true);
  }, [hasNotes]);

  // Переключение галочки: выбор пользователя важнее автоматической подсказки
  const toggle = (id: AssumptionId, checked: boolean) =>
    onChange({ ...value, items: { ...value.items, [id]: checked } });

  // Вернуть автоматическую подсказку: убираем ручную пометку
  const reset = (id: AssumptionId) => {
    const items = { ...value.items };
    delete items[id];
    onChange({ ...value, items });
  };

  // Раскрываем поле заметок и ставим в него курсор
  const openNotes = () => {
    setNotesOpen(true);
    setTimeout(() => notesRef.current?.focus(), 0);
  };

  return (
    <Card className={cn("h-full shrink-0", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-emerald-400" />
          Допущения модели
          <Hint text={BLOCK_HINT} className="-ml-0.5" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Галочки — одним столбцом (без разбиения на колонки): так блок
        читается как список и по высоте ближе к «Структуре модели» */}
        {checks.length === 0 ? (
          <p className="text-xs text-slate-500">
            Введите корректную систему ОДУ — здесь появятся автоматические подсказки.
          </p>
        ) : (
          <div className="grid items-start gap-1.5">
            {checks.map((check) => {
              // Значение галочки: ручной выбор, иначе подсказка автоматики
              const checked = value.items[check.id] ?? check.suggested;
              const manual = value.items[check.id] !== undefined;
              const overridden = manual && value.items[check.id] !== check.suggested;
              // Красный флаг — только когда автоматика уверена в своём выводе
              const warning = overridden && check.auto
                ? checked
                  ? check.warnings.checked
                  : check.warnings.unchecked
                : null;
              // Пояснение к пункту — в подсказке, а не постоянным текстом
              const hint = `${check.description}\n\n${check.auto ? "Авто" : "Не определено"}: ${check.evidence}`;

              return (
                <div
                  key={check.id}
                  className="rounded-lg border border-slate-800 bg-slate-800/30 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`${idPrefix}-${check.id}`}
                      className="shrink-0"
                      checked={checked}
                      onCheckedChange={(next) => toggle(check.id, next)}
                    />
                    <Label
                      htmlFor={`${idPrefix}-${check.id}`}
                      className="min-w-0 flex-1 cursor-pointer text-xs font-semibold normal-case leading-tight tracking-normal text-slate-200"
                    >
                      {check.title}
                    </Label>
                    {!check.auto && (
                      <Badge
                        variant="amber"
                        className="shrink-0 px-1.5 py-0 text-[9px]"
                        title="Автоматика не уверена — проверьте вручную"
                      >
                        вручную
                      </Badge>
                    )}
                    {overridden && (
                      <Badge
                        variant="sky"
                        className="shrink-0 px-1.5 py-0 text-[9px]"
                        title="Отличается от автоматической подсказки"
                      >
                        изменено
                      </Badge>
                    )}
                    {manual && (
                      <button
                        type="button"
                        onClick={() => reset(check.id)}
                        aria-label={`Вернуть автоматическую подсказку для «${check.title}»`}
                        title="Вернуть автоматическую подсказку"
                        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:text-emerald-300 focus-visible:text-emerald-300 focus-visible:outline-none"
                      >
                        <Undo2 className="size-3.5" />
                      </button>
                    )}
                    <Hint text={hint} />
                  </div>
                  {warning && (
                    <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] leading-snug text-amber-200">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                      <span>{warning}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Часть В: свободные допущения исследователя (идут в отчёт).
        По умолчанию свёрнуто, чтобы блок не занимал лишнюю высоту. */}
        {notesOpen ? (
          <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-800/30 p-2.5">
            <div className="flex items-center gap-1.5">
              <Label
                htmlFor={`${idPrefix}-notes`}
                className="min-w-0 flex-1 cursor-pointer text-xs font-semibold normal-case tracking-normal text-slate-300"
              >
                Дополнительные допущения
              </Label>
              <Hint text="Что ещё не учтено в модели? Этот текст попадёт в итоговый отчёт." />
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                aria-label="Свернуть поле дополнительных допущений"
                title="Свернуть"
                className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:text-emerald-300 focus-visible:text-emerald-300 focus-visible:outline-none"
              >
                <ChevronUp className="size-3.5" />
              </button>
            </div>
            <Textarea
              ref={notesRef}
              id={`${idPrefix}-notes`}
              rows={3}
              maxLength={5000}
              spellCheck
              className="font-sans text-xs"
              placeholder="Например: вакцинированные не передают вирус; модель не учитывает миграцию и сезонность…"
              value={value.notes}
              onChange={(e) => onChange({ ...value, notes: e.target.value })}
            />
            <p className="text-right text-[10px] text-slate-500">
              {value.notes.length}/5000 · попадёт в итоговый отчёт
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={openNotes}
            className="flex w-full items-start gap-2 rounded-lg border border-dashed border-slate-700 px-2.5 py-1.5 text-left text-[11px] text-slate-400 transition-colors hover:border-emerald-500/40 hover:text-emerald-300 focus-visible:border-emerald-500/40 focus-visible:text-emerald-300 focus-visible:outline-none"
          >
            {hasNotes ? (
              <Pencil className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <Plus className="mt-0.5 size-3.5 shrink-0" />
            )}
            <span className={cn("min-w-0 flex-1", hasNotes && "line-clamp-2")}>
              {hasNotes
                ? value.notes
                : "Дополнительные допущения — что ещё не учтено в модели?"}
            </span>
          </button>
        )}
      </CardContent>
    </Card>
  );
}
