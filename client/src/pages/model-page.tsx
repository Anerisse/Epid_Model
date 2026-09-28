// ============================================================
// pages/model-page.tsx — раздел «Модель»: редактор системы ОДУ,
// экранная клавиатура (греческие буквы), авто-блок-схема,
// сохранение/загрузка/удаление моделей. Страница в один экран:
// колонки скроллятся внутри, а не всей страницей.
// ============================================================
import { useRef, useState } from "react";
import { Keyboard as KeyboardIcon, Save, Trash2, FolderOpen, AlertTriangle } from "lucide-react";
import { useModel } from "../lib/model-context";
import { BlockDiagram } from "../components/block-diagram";
import { OnScreenKeyboard } from "../components/on-screen-keyboard";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Separator } from "../components/ui/separator";
import { cn } from "../lib/utils";

export function ModelPage() {
  const {
    text,
    name,
    setName,
    setText,
    structure,
    diagram,
    parseError,
    models,
    save,
    remove,
    load,
    loading,
  } = useModel();

  const [notice, setNotice] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Сохранение: показывает результат (ошибку или подтверждение)
  const handleSave = async () => {
    const error = await save();
    setNotice(error ?? "Модель сохранена");
    if (!error) setTimeout(() => setNotice(null), 2500);
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(380px,440px)_1fr] xl:overflow-hidden">
      {/* Левая колонка: редактор + список сохранённых */}
      <div className="min-h-0 space-y-4 pr-1 xl:overflow-y-auto">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>Система ОДУ</CardTitle>
                <CardDescription>
                  dX/dt = … или X' = …; греческие буквы и алиасы (beta → β) распознаются автоматически.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={keyboardOpen ? "Скрыть клавиатуру" : "Показать клавиатуру"}
                title="Экранная клавиатура"
                onClick={() => setKeyboardOpen((v) => !v)}
                className={cn(keyboardOpen && "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/25")}
              >
                <KeyboardIcon className="size-4.5" />
              </Button>
            </div>
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
            {keyboardOpen && (
              <OnScreenKeyboard targetRef={textareaRef} onChange={setText} />
            )}
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Сохранённые модели</CardTitle>
            <CardDescription>
              Выберите модель — она загрузится в редактор, симуляцию и параметризацию.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {loading ? (
              <p className="py-2 text-xs text-slate-500">Загрузка списка…</p>
            ) : models.length === 0 ? (
              <p className="py-2 text-xs text-slate-500">Моделей пока нет — сохраните первую.</p>
            ) : (
              models.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-ink-800/40 px-3 py-2"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    title={m.raw_text}
                    onClick={() => load(m)}
                  >
                    <p className="truncate text-sm font-semibold text-slate-200">{m.name}</p>
                    <p className="truncate text-[11px] text-slate-500">id {m.id} · {m.updated_at.slice(0, 16)}</p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Открыть модель ${m.name}`}
                    onClick={() => load(m)}
                  >
                    <FolderOpen className="size-4 text-slate-400" />
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
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Правая колонка: структура + блок-схема */}
      <div className="min-h-0 space-y-4 pr-1 xl:overflow-y-auto">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Структура модели</CardTitle>
            <CardDescription>
              Компартменты, параметры и потоки, выделенные парсером на сервере.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {structure ? (
              <>
                <div>
                  <Label>Компартменты</Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {structure.compartments.map((c) => (
                      <span
                        key={c.name}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-ink-800 px-2.5 py-1 text-xs font-mono font-semibold text-slate-100"
                      >
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: diagram?.colors[c.name] ?? "#94a3b8" }}
                        />
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Параметры</Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {structure.parameters.map((p) => (
                      <span
                        key={p}
                        className="inline-flex items-center rounded-full bg-slate-800 px-2.5 py-1 text-xs font-mono text-slate-300"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Потоки</Label>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    {structure.flows.length === 0
                      ? "Потоки между компартментами не найдены."
                      : structure.flows
                          .map((f) => (f.to ? `${f.from} → ${f.to} (${f.label})` : `потеря ${f.from} (${f.label})`))
                          .join("  ·  ")}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                Введите корректную систему ОДУ слева — здесь появятся компартменты и потоки.
              </p>
            )}
          </CardContent>
        </Card>

        <Separator />

        {diagram ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-300">Авто-блок-схема</p>
            <BlockDiagram layout={diagram} />
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-500">
              Блок-схема появится после разбора системы ОДУ.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}