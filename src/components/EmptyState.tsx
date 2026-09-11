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

export function EmptyState({ icon: Icon, title, description, action, variant = "bare", className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", variant === "panel" ? "glass rounded-2xl p-12" : "py-16", className)}>
      {Icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-muted/50">
          <Icon className="h-7 w-7 text-muted-foreground/60" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
