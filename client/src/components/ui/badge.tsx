// component/ui/badge.tsx — плашка-статус (цвет по «тону» отчёта анализа).
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-slate-800 text-slate-200",
        emerald: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
        amber: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
        rose: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
        sky: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}