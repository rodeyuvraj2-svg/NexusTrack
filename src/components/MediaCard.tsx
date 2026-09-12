import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MediaSummary, MediaType, WatchStatus } from "@/lib/media-types";
import { STATUS_LABELS, getStatusLabel } from "@/lib/media-types";
import { BookmarkPlus, Eye, CheckCircle2, Heart, Film, Loader2, Star, Trash2 } from "lucide-react";
import {
  listLibrary,
  saveLibraryEntryByExternal,
  removeLibraryItem,
} from "@/lib/library.functions";
import {
  calculateProgressPercent,
  formatChapterProgress,
  formatEpisodeProgress,
  supportsProgress,
} from "@/lib/progress-utils";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useState, useCallback, useRef, createContext, useContext, useMemo, memo } from "react";
import { toast } from "sonner";
import { useGuest } from "@/lib/guest";
import type { RestrictedAction } from "@/lib/guest";
import { SafeImage } from "@/components/SafeImage";
import { EmptyState } from "@/components/EmptyState";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LibraryEntry {
  id: string;
  status: WatchStatus;
  favorite: boolean;
  rating: number | null;
  notes: string | null;
  current_season: number | null;
  current_episode: number | null;
  current_chapter: number | null;
  progress_updated_at: string | null;
}

interface MediaEntryContextValue {
  mediaId: string | null | undefined;
  entry: LibraryEntry | null | undefined;
  /** media.chapter_count from the library row, for the manga progress bar. */
  chapterCount: number | null;
  isLoading: boolean;
  isPending: boolean;
  upsert: (data: { status?: WatchStatus; favorite?: boolean }) => Promise<void>;
  remove: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const MediaEntryContext = createContext<MediaEntryContextValue | null>(null);

function useMediaEntryContext() {
  const ctx = useContext(MediaEntryContext);
  if (!ctx) throw new Error("useMediaEntryContext must be used within MediaEntryProvider");
  return ctx;
}

// ─── Library map ──────────────────────────────────────────────────────────────
// One app-wide query (["library", "all"]) holds the user's entire library —
// small by nature — and cards look up their entry locally. The map is warmed
// once at app start (AppShell) and shares its cache entry with the dashboard
// and library pages, so pills render in the same wave as posters instead of
// popping in a beat later.

export interface LibraryMapEntry {
  mediaId: string;
  /** media.chapter_count — the only per-title total needed for card bars. */
  chapterCount: number | null;
  entry: LibraryEntry;
}

interface LibraryMapState {
  status: "loading" | "ready" | "disabled";
  map: Map<string, LibraryMapEntry>;
}

const LibraryMapContext = createContext<LibraryMapState | null>(null);

function entryKey(source: string, external_id: string) {
  return `${source}:${external_id}`;
}

interface LibraryRowShape {
  id: string;
  status: WatchStatus;
  favorite: boolean;
  rating: number | null;
  notes: string | null;
  current_season: number | null;
  current_episode: number | null;
  current_chapter: number | null;
  progress_updated_at: string | null;
  hidden: boolean;
  created_at: string;
  updated_at: string;
  media: {
    id: string;
    media_type: string;
    source: string;
    external_id: string;
    title: string;
    poster_url: string | null;
    release_year: number | null;
    vote_average: number | null;
    season_count?: number | null;
    chapter_count?: number | null;
  } | null;
}

/** Fetch the whole library once and expose it as a lookup map. */
export function useLibraryMap() {
  const listFn = useServerFn(listLibrary);
  const { isGuest } = useGuest();
  const q = useQuery({
    queryKey: ["library", "all"],
    queryFn: () => listFn({ data: {} }),
    enabled: !isGuest,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const map = useMemo(() => {
    const m = new Map<string, LibraryMapEntry>();
    for (const row of (q.data ?? []) as LibraryRowShape[]) {
      const media = row.media;
      if (!media?.external_id) continue;
      m.set(entryKey(media.source, media.external_id), {
        mediaId: media.id,
        chapterCount: media.chapter_count ?? null,
        entry: {
          id: row.id,
          status: row.status,
          favorite: row.favorite,
          rating: row.rating,
          notes: row.notes,
          current_season: row.current_season ?? null,
          current_episode: row.current_episode ?? null,
          current_chapter: row.current_chapter ?? null,
          progress_updated_at: row.progress_updated_at ?? null,
        },
      });
    }
    return m;
  }, [q.data]);

  const status: LibraryMapState["status"] = isGuest
    ? "disabled"
    : q.isLoading && !q.data
      ? "loading"
      : "ready";
  return { status, map };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useMediaLibraryEntry(item: MediaSummary) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveLibraryEntryByExternal);
  const removeFn = useServerFn(removeLibraryItem);

  // Read from the shared library map — no per-card requests at all
  const ctx = useContext(LibraryMapContext);
  const mapEntry = ctx?.map.get(entryKey(item.source, item.external_id));
  const entry: LibraryEntry | null = mapEntry?.entry ?? null;
  const mediaId = mapEntry?.mediaId ?? null;
  const chapterCount = mapEntry?.chapterCount ?? null;
  const isLoading = ctx ? ctx.status === "loading" : false;

  // Optimistic update against the shared library list, so the pill (and every
  // other consumer of ["library", …]) reflects the change instantly.
  const applyOptimistic = useCallback(
    (change: { status?: WatchStatus; favorite?: boolean; remove?: boolean }) => {
      qc.setQueryData<LibraryRowShape[]>(["library", "all"], (old) => {
        if (!old) return old;
        const key = entryKey(item.source, item.external_id);
        const idx = old.findIndex(
          (r) => r.media && entryKey(r.media.source, r.media.external_id) === key,
        );

        if (change.remove) {
          return idx === -1 ? old : old.filter((_, i) => i !== idx);
        }
        if (idx >= 0) {
          const row = { ...old[idx] };
          if (change.status !== undefined) row.status = change.status;
          if (change.favorite !== undefined) row.favorite = change.favorite;
          return [...old.slice(0, idx), row, ...old.slice(idx + 1)];
        }
        // Not in the library yet — append a synthetic row so the pill flips instantly
        return [
          ...old,
          {
            id: "optimistic",
            status: change.status ?? "planned",
            rating: null,
            favorite: change.favorite ?? false,
            hidden: false,
            notes: null,
            current_season: null,
            current_episode: null,
            current_chapter: null,
            progress_updated_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            media: {
              id: "optimistic",
              media_type: item.media_type,
              source: item.source,
              external_id: item.external_id,
              title: item.title,
              poster_url: item.poster_url ?? null,
              release_year: item.release_year ?? null,
              vote_average: item.vote_average ?? null,
              season_count: item.season_count ?? null,
              chapter_count: item.chapter_count ?? null,
            } as LibraryRowShape["media"],
          },
        ];
      });
    },
    [qc, item],
  );

  const upsertMutation = useMutation({
    mutationFn: (data: { status?: WatchStatus; favorite?: boolean }) =>
      saveFn({
        data: {
          // Only the external identity — the server fetches authoritative
          // metadata and never trusts client-supplied fields.
          item: {
            source: item.source,
            media_type: item.media_type,
            external_id: item.external_id,
          },
          ...data,
        },
      }),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ["library", "all"] });
      const previous = qc.getQueryData(["library", "all"]);
      applyOptimistic(data);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) qc.setQueryData(["library", "all"], context.previous);
    },
    onSettled: (data) => {
      qc.invalidateQueries({ queryKey: ["library"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      // Status changes from the card pills move titles in/out of the
      // dashboard's continue feed (favorite-only changes don't).
      if (data?.status !== undefined) {
        qc.invalidateQueries({ queryKey: ["continue-watching"] });
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => {
      if (!mediaId) throw new Error("Not in your library yet");
      return removeFn({ data: { media_id: mediaId } });
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["library", "all"] });
      const previous = qc.getQueryData(["library", "all"]);
      applyOptimistic({ remove: true });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) qc.setQueryData(["library", "all"], context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["library"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      // Removing a title takes it out of the dashboard's continue feed.
      qc.invalidateQueries({ queryKey: ["continue-watching"] });
    },
  });

  const upsert = useCallback(
    async (data: { status?: WatchStatus; favorite?: boolean }) => {
      if (upsertMutation.isPending || removeMutation.isPending) return;
      await upsertMutation.mutateAsync(data);
    },
    [upsertMutation, removeMutation],
  );

  const remove = useCallback(async () => {
    if (upsertMutation.isPending || removeMutation.isPending) return;
    await removeMutation.mutateAsync();
  }, [upsertMutation, removeMutation]);

  const isPending = upsertMutation.isPending || removeMutation.isPending;

  return useMemo(
    () => ({
      mediaId,
      entry,
      chapterCount,
      isLoading,
      isPending,
      upsert,
      remove,
    }),
    [mediaId, entry, chapterCount, isLoading, isPending, upsert, remove],
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

function MediaEntryProvider({ item, children }: { item: MediaSummary; children: React.ReactNode }) {
  const value = useMediaLibraryEntry(item);
  return <MediaEntryContext.Provider value={value}>{children}</MediaEntryContext.Provider>;
}

// ─── Status Pills ──────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: WatchStatus; label: string; icon: typeof BookmarkPlus }[] = [
  { value: "planned", label: "Plan to Watch", icon: BookmarkPlus },
  { value: "watching", label: "Watching", icon: Eye },
  { value: "completed", label: "Completed", icon: CheckCircle2 },
];

function StatusPill({
  current,
  onChange,
  disabled,
  onRemove,
}: {
  current: WatchStatus | null;
  onChange: (status: WatchStatus) => Promise<void>;
  disabled: boolean;
  onRemove: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close when focus leaves the entire pill+dropdown group
  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (!ref.current?.contains(e.relatedTarget as Node)) {
      setTimeout(() => setOpen(false), 150);
    }
  }, []);

  // Escape closes the dropdown without moving focus away from the pill
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.stopPropagation();
        setOpen(false);
      }
    },
    [open],
  );

  const activeOption = STATUS_OPTIONS.find((o) => o.value === current);
  const Icon = activeOption?.icon ?? BookmarkPlus;

  return (
    <div
      ref={ref}
      className="relative"
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all",
          "hover:scale-[1.02] active:scale-[0.98]",
          current === "watching" && "border-primary/40 bg-primary/15 text-primary",
          current === "completed" && "border-success/40 bg-success/15 text-success",
          current === "planned" && "border-warning/40 bg-warning/15 text-warning",
          !current && "border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        {disabled ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Icon className="h-3.5 w-3.5" />
        )}
        <span>{current ? getStatusLabel(current as WatchStatus) : "Add to Watchlist"}</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 mb-1.5 z-30 min-w-[140px] rounded-xl border border-border/50 bg-card p-1 shadow-2xl shadow-black/40 animate-fade-in"
        >
          {STATUS_OPTIONS.map((opt) => {
            const isActive = current === opt.value;
            return (
              <button
                key={opt.value}
                role="option"
                aria-selected={isActive}
                onClick={async () => {
                  setOpen(false);
                  if (isActive) {
                    await onRemove();
                  } else {
                    await onChange(opt.value);
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                <opt.icon className="h-4 w-4" />
                {isActive ? `✓ ${opt.label}` : opt.label}
              </button>
            );
          })}
          {current && (
            <button
              onClick={async () => {
                setOpen(false);
                await onRemove();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" /> Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MediaCard ────────────────────────────────────────────────────────────────

const CARD_LINK = "/media/$type/$source/$id" as const;

const MediaCardInner = memo(function MediaCardInner({
  item,
  showProgress,
}: {
  item: MediaSummary;
  showProgress?: boolean;
}) {
  const { entry, chapterCount, isLoading, isPending, upsert, remove } = useMediaEntryContext();
  const { requireAuth } = useGuest();
  const status = entry?.status ?? null;
  const isFavorite = entry?.favorite ?? false;

  // Compact progress line — only for actively watched/read titles on grids
  // that opt in (the library page); other grids stay clean. Per-season
  // episode totals aren't in the library rows, so only manga gets a bar.
  const progressVisible =
    !!showProgress &&
    !!entry &&
    supportsProgress(item.media_type) &&
    (entry.status === "watching" || entry.status === "rewatching");
  const isManga = item.media_type === "manga";
  const progressLabel = !progressVisible
    ? null
    : isManga
      ? formatChapterProgress(entry!.current_chapter, chapterCount)
      : formatEpisodeProgress(entry!.current_season, entry!.current_episode);
  const progressPct =
    progressVisible && isManga
      ? calculateProgressPercent(entry!.current_chapter, chapterCount)
      : null;

  async function handleStatusChange(newStatus: WatchStatus) {
    if (!requireAuth("addToWatchlist")) return;
    upsert({ status: newStatus });
  }

  async function handleRemove() {
    if (!requireAuth("addToWatchlist")) return;
    remove();
  }

  async function toggleFavorite() {
    if (!requireAuth("addFavorite")) return;
    upsert({ favorite: !isFavorite });
  }

  return (
    <div className="group relative block overflow-hidden rounded-xl bg-card/60 border border-border/40 transition-all duration-300 hover:border-border/60 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-0.5">
      <Link
        to={CARD_LINK}
        params={{ type: item.media_type, source: item.source, id: item.external_id }}
        className="block"
      >
        <div className="aspect-[2/3] bg-muted overflow-hidden relative">
          <SafeImage
            src={item.poster_url}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            wrapperClassName="h-full w-full"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {/* Rating badge */}
          {item.vote_average != null && (
            <div className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/60 backdrop-blur-sm px-1.5 py-0.5">
              <Star className="h-3 w-3 fill-warning text-warning" />
              <span className="text-[11px] font-bold text-white">
                {item.vote_average.toFixed(1)}
              </span>
            </div>
          )}

          {/* Favorite button (not for fallback demo rows — they aren't saveable).
              Icon stays 28px visually but the hit area is padded to a 44px
              touch target (negative margin pulls the visual position back). */}
          {!item.is_fallback && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFavorite();
              }}
              aria-label={
                isFavorite
                  ? `Remove ${item.title} from favorites`
                  : `Add ${item.title} to favorites`
              }
              aria-pressed={isFavorite}
              className={cn(
                "absolute top-0 right-0 flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200",
                isFavorite
                  ? "text-accent scale-100 opacity-100"
                  : // Always visible on touch devices (no hover); hover-reveal on desktop
                    "text-white/70 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:scale-110",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200",
                  isFavorite ? "bg-accent/90 text-white" : "bg-black/40",
                )}
              >
                <Heart className={cn("h-3.5 w-3.5", isFavorite && "fill-current")} />
              </span>
            </button>
          )}
        </div>
      </Link>

      <div className="p-3">
        {/* Meta row */}
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
          <span className="font-semibold text-primary">{item.media_type}</span>
          {item.release_year ? (
            <>
              <span>·</span>
              <span>{item.release_year}</span>
            </>
          ) : null}
        </div>

        {/* Title */}
        <Link
          to={CARD_LINK}
          params={{ type: item.media_type, source: item.source, id: item.external_id }}
          className="block mt-0.5"
        >
          <h3 className="line-clamp-2 text-sm font-bold leading-tight group-hover:text-primary transition-colors">
            {item.title}
          </h3>
        </Link>

        {/* Compact progress (library grid only, actively watched/read titles) */}
        {progressVisible && progressLabel ? (
          <div className="mt-1.5">
            <p className="text-[11px] tabular-nums text-muted-foreground">{progressLabel}</p>
            {progressPct !== null ? (
              <Progress
                value={progressPct}
                className="mt-1 h-1"
                aria-label={`Chapter ${entry?.current_chapter ?? 0}${chapterCount ? ` of ${chapterCount}` : ""}`}
              />
            ) : null}
          </div>
        ) : null}

        {/* Status pill (fallback demo rows show a notice instead — not saveable) */}
        <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
          {item.is_fallback ? (
            <span
              className="inline-block rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground"
              title="Live data is unavailable right now"
            >
              Offline preview
            </span>
          ) : isLoading ? (
            <div className="h-7 w-28 rounded-lg bg-muted/40 animate-pulse" />
          ) : (
            <StatusPill
              current={status}
              onChange={handleStatusChange}
              disabled={isPending}
              onRemove={handleRemove}
            />
          )}
        </div>
      </div>
    </div>
  );
});

export function MediaCard({ item, showProgress }: { item: MediaSummary; showProgress?: boolean }) {
  return (
    <MediaEntryProvider item={item}>
      <MediaCardInner item={item} showProgress={showProgress} />
    </MediaEntryProvider>
  );
}

// ─── MediaGrid ────────────────────────────────────────────────────────────────

export function MediaGrid({
  items,
  showProgress,
}: {
  items: MediaSummary[];
  showProgress?: boolean;
}) {
  // The whole-library map is warmed by the AppShell and shared with the
  // dashboard/library pages — zero per-grid requests for pill state.
  const { status, map } = useLibraryMap();

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Film}
        title="Nothing here yet"
        description="Titles you add will show up here."
        variant="panel"
      />
    );
  }
  return (
    <LibraryMapContext.Provider value={{ status, map }}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((it, idx) => (
          <MediaCard
            key={`${it.source}-${it.media_type}-${it.external_id}-${idx}`}
            item={it}
            showProgress={showProgress}
          />
        ))}
      </div>
    </LibraryMapContext.Provider>
  );
}

export { MediaEntryProvider, useMediaEntryContext };
