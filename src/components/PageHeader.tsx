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
    <div className={cn("mb-8 animate-fade-in", className)}>
      <div className="relative overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,0.2),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_34%),linear-gradient(135deg,color-mix(in_oklab,var(--card)_88%,transparent),color-mix(in_oklab,var(--muted)_80%,transparent))] p-5 shadow-[0_18px_46px_rgba(15,23,42,0.24)] md:p-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_40%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <span className="inline-flex items-center rounded-full border border-border/80 bg-background/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Overview
            </span>
            <h1 className="text-3xl font-black tracking-[-0.04em] text-foreground md:text-4xl">
              {title}
            </h1>
            {description ? (
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2 sm:shrink-0">{actions}</div> : null}
        </div>
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
    <div
      className={cn(
        "mb-3 flex items-center justify-between border-b border-border/70 pb-2",
        className,
      )}
    >
      <h2 className="text-xl font-black tracking-[-0.03em] text-foreground md:text-2xl">
        {title}
        {typeof count === "number" ? (
          <span className="ml-2 text-sm font-medium text-muted-foreground">{count}</span>
        ) : null}
      </h2>
      {action}
    </div>
  );
}
