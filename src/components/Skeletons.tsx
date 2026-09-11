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
    <div className={cn("glass rounded-lg px-3 py-2.5 flex items-center gap-2.5", className)}>
      <div className="h-7 w-7 shrink-0 rounded-full bg-muted/40 animate-pulse" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-1/2 rounded bg-muted/40 animate-pulse" />
        <div className="h-3 w-3/4 rounded bg-muted/30 animate-pulse" />
      </div>
      <div className="h-3 w-10 shrink-0 rounded bg-muted/20 animate-pulse" />
    </div>
  );
}

/** Bare line skeleton for ad-hoc placeholders. */
export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn("h-3 rounded bg-muted/40 animate-pulse", className)} />;
}
