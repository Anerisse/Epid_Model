// component/ui/label.tsx — подпись поля формы.
import * as React from "react";
import { cn } from "../../lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("block text-xs font-medium tracking-wide text-slate-400 uppercase", className)}
      {...props}
    />
  );
}