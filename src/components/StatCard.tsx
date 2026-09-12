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
    <div className={cn("glass rounded-xl p-3 text-center card-hover", className)}>
      <Icon className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
      <div className="text-xl font-black text-accent tabular-nums">
        {loading ? "…" : (value ?? "—")}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
