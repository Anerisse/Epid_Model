// component/ui/checkbox.tsx — чекбокс (оценивать ли параметр в МНК).
import * as React from "react";
import { cn } from "../../lib/utils";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

// Нативный чекбокс со стилем accent (как чекбоксы legacy-интерфейса)
export function Checkbox({ className, checked, onCheckedChange, onChange, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={cn("size-4 cursor-pointer accent-emerald-500", className)}
      checked={checked}
      onChange={(e) => {
        onChange?.(e);
        onCheckedChange?.(e.target.checked);
      }}
      {...props}
    />
  );
}