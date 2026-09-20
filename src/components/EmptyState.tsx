import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  /** panel = wrapped in the glass card used by full-page empty states */
  variant?: "bare" | "panel";
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "bare",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === "panel"
          ? "glass-strong rounded-2xl border border-border/60 p-10 md:p-12"
          : "py-16",
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-primary/20 bg-primary/8 text-primary">
          <Icon className="h-7 w-7" />
        </div>
      )}
      <h3 className="text-lg font-bold tracking-[-0.02em] text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
