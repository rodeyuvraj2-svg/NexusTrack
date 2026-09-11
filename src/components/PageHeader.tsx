import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Consistent page-level header: title, optional description, optional actions.
 * Matches the original page headers (h1 + muted description, actions right).
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 animate-fade-in", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">{title}</h1>
          {description ? <p className="text-muted-foreground mt-1">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2 sm:shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}

/**
 * Consistent section header within a page: title, optional action (usually a
 * "View all →" link) on the right. Same shape as the dashboard's sections.
 */
export function SectionHeader({
  title,
  count,
  action,
  className,
}: {
  title: ReactNode;
  count?: number | null;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-baseline justify-between", className)}>
      <h2 className="text-xl md:text-2xl font-bold tracking-tight">
        {title}
        {typeof count === "number" ? (
          <span className="ml-2 text-sm font-medium text-muted-foreground">{count}</span>
        ) : null}
      </h2>
      {action}
    </div>
  );
}
