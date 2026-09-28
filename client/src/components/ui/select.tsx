// component/ui/select.tsx — нативный выпадающий список (без Radix,
// как и остальные элементы формы). Тёмная тема приложения:
// тёмный трек, светлый текст, стрелка по color-scheme: dark.
import * as React from "react";
import { cn } from "../../lib/utils";

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "w-full cursor-pointer rounded-lg border border-slate-700 bg-ink-800 px-3 py-2 pr-9 text-sm text-slate-100 [color-scheme:dark]",
        "focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40",
        className,
      )}
      {...props}
    />
  );
}