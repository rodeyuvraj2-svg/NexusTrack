import { cn } from "@/lib/utils";

/**
 * Skeletons matching the shapes they stand in for:
 * - SkeletonGrid → MediaGrid poster cards
 * - SkeletonRow  → list rows (activity, notifications, friends)
 * - SkeletonLine → inline text placeholder
 */

/** Poster-card skeleton in the same grid layout as MediaGrid. */
export function SkeletonGrid({ count = 12, className }: { count?: number; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[2/3] rounded-xl bg-muted/40" />
          <div className="mt-2 h-3 w-3/4 rounded bg-muted/30" />
          <div className="mt-1.5 h-6 w-28 rounded-lg bg-muted/20" />
        </div>
      ))}
    </div>
  );
}

/** List-row skeleton (activity feed, notifications, friend rows). */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div
      className={cn("glass w-full rounded-xl p-4 flex items-start gap-3 animate-pulse", className)}
    >
      <div className="mt-0.5 h-9 w-9 shrink-0 rounded-lg bg-muted/40" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="h-3 w-1/2 rounded bg-muted/40" />
        <div className="h-3 w-3/4 rounded bg-muted/30" />
        <div className="h-2.5 w-28 rounded bg-muted/20" />
      </div>
      <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-muted/30" />
    </div>
  );
}

/** Bare line skeleton for ad-hoc placeholders. */
export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn("h-3 rounded bg-muted/40 animate-pulse", className)} />;
}
