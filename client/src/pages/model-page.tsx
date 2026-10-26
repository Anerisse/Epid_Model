// ============================================================
// pages/model-page.tsx — раздел «Модель»: редактор системы ОДУ,
// экранная клавиатура (греческие буквы), допущения модели,
// авто-блок-схема, сохранение/загрузка/удаление моделей.
// Страница в один экран: слева редактор и список сохранённых
// моделей, справа структура, допущения и схема.
// ============================================================
import { useRef, useState } from "react";
import { Keyboard as KeyboardIcon, Save, Trash2, FolderOpen, AlertTriangle, Pencil } from "lucide-react";
import { useModel } from "../lib/model-context";
import { BlockDiagram } from "../components/block-diagram";
import { ModelAssumptions } from "../components/model-assumptions";
import { ModelEditorDialog, type EditTarget } from "../components/model-editor-dialog";
import { OnScreenKeyboard } from "../components/on-screen-keyboard";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Hint } from "../components/ui/hint";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { cn } from "../lib/utils";

export function ModelPage() {
  const {
    text,
    name,
    setName,
    setText,
    structure,
    presets,
    diagram,
    parseError,
    models,
    labels,
    assumptionChecks,
    assumptions,
    setAssumptions,
    save,
    remove,
    load,
    loading,
    currentId,
  } = useModel();

  const [notice, setNotice] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Сохранение: показывает результат (ошибку или подтверждение)
  const handleSave = async () => {
    const error = await save();
    setNotice(error ?? "Модель сохранена");
    if (!error) setTimeout(() => setNotice(null), 2500);
  };

  // Редактор модели: открыт по клику на модель из списка
  const openEditor = (m: (typeof models)[number]) =>
    setEditTarget({
      id: m.id,
      name: m.name,
      raw_text: m.raw_text,
      labels: m.labels ?? {},
      assumptions: m.assumptions ?? null,
    });

  return (
    // Ниже xl блоки идут друг за другом: строки грида по высоте контента
    // (auto-rows-min + content-start), иначе они растягиваются на всю
    // высоту окна и содержимое наезжает друг на друга.
    <div className="grid h-full min-h-0 auto-rows-min content-start grid-cols-1 gap-4 overflow-y-auto p-4 xl:auto-rows-auto xl:content-normal xl:grid-cols-[minmax(380px,440px)_1fr] xl:overflow-hidden">
      {/* Левая колонка: редактор ОДУ (закреплён сверху) + список сохранённых
      моделей (скроллится внутри карточки). На широком экране колонка
      занимает всю высоту, на узком — прокручивается вместе со страницей. */}
      <div className="flex min-h-0 flex-col gap-4 pr-1 xl:overflow-y-auto">
        <Card className="shrink-0">
          <CardHeader className="pb-2">
            <CardTitle>Система ОДУ</CardTitle>
            <CardDescription>
              dX/dt = … или X' = …; греческие буквы и алиасы (beta → β) распознаются автоматически.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="model-name" className="sr-only">
                  Название модели
                </Label>
                <Input
                  id="model-name"
                  placeholder="Название модели (напр., SEIR)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <Button onClick={handleSave}>
                <Save className="size-4" /> Сохранить
              </Button>
            </div>
            <Textarea
              ref={textareaRef}
              rows={7}
              placeholder={"dS/dt = -β*S*I/N\ndE/dt = β*S*I/N - σ*E\ndI/dt = σ*E - γ*I\ndR/dt = γ*I"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {/* Кнопка виртуальной клавиатуры (как в legacy) */}
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="secondary"
                size="sm"
                aria-label={keyboardOpen ? "Скрыть виртуальную клавиатуру" : "Показать виртуальную клавиатуру"}
                onClick={() => setKeyboardOpen((v) => !v)}
                className={cn(keyboardOpen && "border-emerald-500/40 bg-emerald-500/10 text-emerald-300")}
              >
                <KeyboardIcon className="size-4" /> Виртуальная клавиатура
              </Button>
              <span className="hidden text-[10px] text-slate-500 sm:block">
                греческие буквы, компартменты, dX/dt
              </span>
            </div>
            {notice && (
              <p className="text-xs text-emerald-300">
                <AlertTriangle className="mr-1 inline size-3.5" />
                {notice}
              </p>
            )}
            {parseError && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {parseError}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col xl:min-h-[140px] xl:flex-1 xl:overflow-hidden">
          <CardHeader className="shrink-0 pb-2">
            <CardTitle>Сохранённые модели</CardTitle>
            <CardDescription>
              Нажмите на название — загрузить модель в редактор (открытая выделена). Карандаш — редактировать названия и уравнение.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            {loading ? (
              <p className="py-2 text-xs text-slate-500">Загрузка списка…</p>
            ) : models.length === 0 ? (
              <p className="py-2 text-xs text-slate-500">Моделей пока нет — сохраните первую.</p>
            ) : (
              models.map((m) => {
                // Выбранная (загруженная в редактор) модель выделяется рамкой
                // и цветом, чтобы было видно, какая запись сейчас открыта
                const selected = currentId === m.id;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors",
                      selected
                        ? "border-emerald-500/50 bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/25"
                        : "border-slate-800 bg-slate-800/40",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      title={selected ? "Модель открыта в редакторе" : "Загрузить модель в редактор"}
                      aria-current={selected ? "true" : undefined}
                      onClick={() => load(m)}
                    >
                      <p
                        className={cn(
                          "flex items-center gap-1.5 truncate text-sm font-semibold",
                          selected ? "text-emerald-300" : "text-slate-200",
                        )}
                      >
                        {selected && (
                          <span
                            aria-hidden
                            className="size-1.5 shrink-0 rounded-full bg-emerald-400"
                          />
                        )}
                        <span className="truncate">{m.name}</span>
                      </p>
                      <p className="truncate text-[11px] text-slate-500">id {m.id} · {m.updated_at.slice(0, 16)}</p>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Редактировать модель ${m.name}: названия и уравнение`}
                      title="Редактировать названия и уравнение"
                      onClick={() => openEditor(m)}
                    >
                      <Pencil className="size-4 text-slate-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Удалить модель ${m.name}`}
                      onClick={() => remove(m.id)}
                    >
                      <Trash2 className="size-4 text-rose-400" />
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Правая колонка: структура и допущения — рядом на широком окне
      (≥1390 px), на более узком допущения уходят под структуру; ниже
      блок-схема занимает оставшуюся высоту. Колонка прокручивается,
      чтобы схема не сжималась до нечитаемой. Ширина допущений растёт
      с окном, но структуре всегда остаётся ~500 px; обе карточки
      растягиваются на высоту строки (у допущений `h-full`), поэтому
      их нижние края совпадают при любой длине структуры */}
      <div className="grid min-h-0 auto-rows-min content-start grid-cols-1 gap-3 pr-1 xl:overflow-y-auto min-[1390px]:auto-rows-auto min-[1390px]:content-normal min-[1390px]:grid-cols-[minmax(0,1fr)_clamp(300px,max(21vw,calc(100%_-_512px)),580px)] min-[1390px]:grid-rows-[auto_minmax(0,1fr)]">
        {/* Структура модели — компактная справка: компартменты, параметры
        и потоки; на широкой карточке подпись группы встаёт отдельной
        строкой над значениями (см. `@min-[460px]:w-full` ниже) */}
        <Card className="@container min-w-0 shrink-0 min-[1390px]:col-start-1 min-[1390px]:row-start-1">
          <CardHeader className="shrink-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              Структура модели
              <Hint text="Компартменты, параметры и потоки, распознанные сервером в системе ОДУ." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {structure ? (
              // Группы идут друг под другом (каждая с новой строки), без
              // разделительных черт: так компактнее читается на узкой карточке.
              <div className="flex flex-col gap-2">
                {/* Компартменты — с цветовой меткой, как в схеме */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 @min-[460px]:w-full">
                    Компартменты
                  </span>
                  {structure.compartments.map((c) => (
                    <span
                      key={c.name}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-ink-800 px-2 py-0.5 text-[11px] font-mono font-semibold text-slate-100"
                      title={labels[c.name]?.en || undefined}
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: diagram?.colors[c.name] ?? "#94a3b8" }}
                      />
                      {c.name}
                      {labels[c.name]?.ru && (
                        <span className="font-sans text-[10px] font-normal text-slate-400">
                          {labels[c.name]!.ru}
                        </span>
                      )}
                    </span>
                  ))}
                </div>

                {/* Параметры модели — отдельной строкой */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 @min-[460px]:w-full">
                    Параметры
                  </span>
                  {structure.parameters.map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-mono text-slate-300"
                      title={labels[p]?.ru || labels[p]?.en || undefined}
                    >
                      {p}
                      {labels[p]?.ru && (
                        <span className="font-sans text-[10px] text-slate-400">{labels[p]!.ru}</span>
                      )}
                      {presets?.[p]?.unit && (
                        <span className="font-sans text-[9px] text-slate-500">{presets[p]!.unit}</span>
                      )}
                    </span>
                  ))}
                </div>

                {/* Потоки — отдельной строкой, компактно, чтобы блок
                оставался справкой */}
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 @min-[460px]:w-full">
                    Потоки
                  </span>
                  <span className="font-mono text-[11px] leading-relaxed text-slate-400">
                    {structure.flows.length === 0
                      ? "не найдены"
                      : structure.flows
                          .map((f) =>
                            f.to
                              ? `${f.from}→${f.to} (${f.label})`
                              : `${f.from} — потеря (${f.label})`,
                          )
                          .join("  ·  ")}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Введите корректную систему ОДУ слева — здесь появятся компартменты и потоки.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Допущения модели — справа от структуры на широком окне,
        под ней на узком: подсказки по тексту модели, предупреждения
        о расхождениях и заметки для отчёта */}
        <div className="min-w-0 min-[1390px]:col-start-2 min-[1390px]:row-start-1">
          <ModelAssumptions
            checks={assumptionChecks}
            value={assumptions}
            onChange={setAssumptions}
          />
        </div>

        {/* Авто-блок-схема — карточка, в которой схема занимает всю
        оставшуюся высоту (легенды нет: те же компартменты и потоки
        перечислены в «Структуре модели»). На узком экране схема
        получает фиксированную минимальную высоту */}
        <Card className="flex flex-col xl:min-h-[340px] min-[1390px]:col-span-2 min-[1390px]:row-start-2 min-[1390px]:min-h-0">
          <CardHeader className="shrink-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              Авто-блок-схема
              <Hint text={"Схема строится автоматически по распознанным потокам модели: пунктирные дуги — силы заражения, стрелки вниз — потери «в никуда»."} />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col xl:min-h-0 xl:flex-1">
            {diagram ? (
              <div className="relative min-h-[300px] flex-1 overflow-hidden rounded-lg bg-ink-900 xl:min-h-0">
                <BlockDiagram layout={diagram} labels={labels} />
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">
                Блок-схема появится после разбора системы ОДУ.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Окно редактирования модели: название, уравнение и названия терминов */}
      <ModelEditorDialog target={editTarget} onClose={() => setEditTarget(null)} />

      {/* Виртуальная клавиатура — плавающая панель у нижнего края экрана */}
      <OnScreenKeyboard
        open={keyboardOpen}
        onClose={() => setKeyboardOpen(false)}
        targetRef={textareaRef}
        onChange={setText}
      />
    </div>
  );
}
