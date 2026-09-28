// component/ui/button.tsx — кнопка в стиле shadcn (variants через cva).
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default: "bg-emerald-500 text-emerald-950 hover:bg-emerald-400 shadow-sm shadow-emerald-500/20",
        secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700",
        outline: "border border-slate-700 text-slate-200 hover:bg-slate-800 hover:border-slate-600",
        ghost: "text-slate-300 hover:bg-slate-800 hover:text-slate-100",
        destructive: "bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20",
        amber: "bg-amber-500 text-amber-950 hover:bg-amber-400 shadow-sm shadow-amber-500/20",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}