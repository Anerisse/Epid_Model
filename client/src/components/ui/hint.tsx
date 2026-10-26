// ============================================================
// component/ui/hint.tsx — иконка «?» с подсказкой при наведении.
// Подсказка рисуется порталом поверх страницы: её не обрезают
// прокручиваемые колонки, и она не влияет на высоту компактных
// списков (в отличие от постоянно видимого текста).
// ============================================================
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";
import { cn } from "../../lib/utils";

interface HintProps {
  /** Текст подсказки (переносы строк сохраняются) */
  text: string;
  className?: string;
}

export function Hint({ text, className }: HintProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, above: false });

  // Показываем рядом с иконкой; у правого края прижимаем к экрану,
  // а если снизу мало места — раскрываем вверх.
  const show = () => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 288; // w-72
    const left = Math.min(
      Math.max(8, rect.right - width),
      Math.max(8, window.innerWidth - width - 8),
    );
    const above = window.innerHeight - rect.bottom < 170;
    setPos({ top: above ? rect.top - 8 : rect.bottom + 8, left, above });
    setOpen(true);
  };

  // Прокрутка/изменение размера делает координаты неверными — прячем;
  // Escape закрывает подсказку с клавиатуры.
  useEffect(() => {
    if (!open) return;
    const hide = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={text}
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:text-emerald-300 focus-visible:text-emerald-300 focus-visible:outline-none",
          className,
        )}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
      >
        <CircleHelp className="size-3.5" />
      </button>
      {open &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[60] w-72 max-w-[calc(100vw-16px)] whitespace-pre-line rounded-lg border border-slate-700 bg-ink-900/95 px-3 py-2 text-[11px] leading-snug text-slate-200 shadow-xl backdrop-blur"
            style={{
              top: pos.top,
              left: pos.left,
              transform: pos.above ? "translateY(-100%)" : undefined,
            }}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}
