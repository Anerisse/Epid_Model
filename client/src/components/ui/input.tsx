// component/ui/input.tsx — текстовое поле (shadcn-стиль).
import * as React from "react";
import { cn } from "../../lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border border-slate-700 bg-ink-800 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40",
        className,
      )}
      {...props}
    />
  );
}