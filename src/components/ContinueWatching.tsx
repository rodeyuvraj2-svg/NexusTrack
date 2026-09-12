import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { SafeImage } from "@/components/SafeImage";
import { Progress } from "@/components/ui/progress";
import {
  calculateProgressPercent,
  formatChapterProgress,
  formatEpisodeProgress,
  type ContinueWatchingRow,
} from "@/lib/progress-utils";

const CARD_LINK = "/media/$type/$source/$id" as const;

/**
 * Compact poster-first card for the dashboard's continue watching / reading
 * rail: title, progress label, thin bar when a total is known, and when the
 * position was last updated. Deliberately quieter than a full MediaCard —
 * no status pills or hover actions here.
 */
export function ContinueProgressCard({ row }: { row: ContinueWatchingRow }) {
  const m = row.media;
  if (!m) return null;
  const isManga = m.media_type === "manga";

  // Manga totals come from media.chapter_count. Per-season episode counts
  // aren't part of this row, so tv/anime show no bar (known limitation —
  // the detail page has full season metadata).
  const progressLabel = isManga
    ? formatChapterProgress(row.current_chapter, m.chapter_count)
    : formatEpisodeProgress(row.current_season, row.current_episode);
  const pct = isManga ? calculateProgressPercent(row.current_chapter, m.chapter_count) : null;

  return (
    <Link
      to={CARD_LINK}
      params={{ type: m.media_type, source: m.source, id: m.external_id }}
      className="group block overflow-hidden rounded-xl border border-border/40 bg-card/60 transition-all duration-300 hover:border-border/60 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-muted">
        <SafeImage
          src={m.poster_url}
          alt={m.title}
          wrapperClassName="h-full w-full"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>
      <div className="p-2.5">
        <h3 className="truncate text-sm font-bold leading-tight group-hover:text-primary transition-colors">
          {m.title}
        </h3>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {progressLabel ?? "Not started"}
        </p>
        {pct !== null ? (
          <Progress
            value={pct}
            className="mt-1.5 h-1"
            aria-label={`Chapter ${row.current_chapter ?? 0} of ${m.chapter_count}`}
          />
        ) : null}
        {row.progress_updated_at ? (
          <time
            className="mt-1 block text-[10px] text-muted-foreground/70"
            title={new Date(row.progress_updated_at).toLocaleString()}
          >
            {formatDistanceToNow(new Date(row.progress_updated_at), { addSuffix: true })}
          </time>
        ) : null}
      </div>
    </Link>
  );
}

/** Skeleton shaped like a ContinueProgressCard. */
export function ContinueCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[2/3] rounded-xl bg-muted/40" />
      <div className="mt-2 h-3 w-3/4 rounded bg-muted/30" />
      <div className="mt-1.5 h-2.5 w-1/2 rounded bg-muted/20" />
      <div className="mt-1.5 h-1 w-full rounded bg-muted/20" />
    </div>
  );
}
