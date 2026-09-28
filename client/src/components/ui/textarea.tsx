// component/ui/textarea.tsx — многострочное поле для системы ОДУ и данных.
import * as React from "react";
import { cn } from "../../lib/utils";

// ComponentProps<"textarea"> в React 19 включает ref — экранная клавиатура
// полагается на позицию курсора в textarea.
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-slate-700 bg-ink-800 px-3 py-2 text-sm font-mono leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40",
        className,
      )}
      spellCheck={false}
      {...props}
    />
  );
}