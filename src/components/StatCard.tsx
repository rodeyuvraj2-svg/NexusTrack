import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Stat tile matching the original dashboard/profile glass cards:
 * icon, tabular value, uppercase label. Values align in columns and
 * don't jitter while loading.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string | null | undefined;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-card/75 p-3 text-center shadow-[0_18px_40px_rgba(15,23,42,0.18)] card-hover",
        className,
      )}
    >
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-xl font-black tracking-[-0.04em] text-foreground tabular-nums">
        {loading ? "…" : (value ?? "—")}
      </div>
      <div className="mt-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
