import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { MediaSummary, MediaType, WatchStatus } from "@/lib/media-types";
import { STATUS_LABELS, getStatusLabel } from "@/lib/media-types";
import {
  BookmarkPlus,
  BookmarkCheck,
  Eye,
  CheckCircle2,
  Heart,
  Loader2,
  Star,
  Trash2,
  Plus,
} from "lucide-react";
import { cacheMedia } from "@/lib/tmdb.functions";
import { getLibraryItem, upsertLibraryItem, removeLibraryItem } from "@/lib/library.functions";
import { cn } from "@/lib/utils";
import { useState, useCallback, useRef, createContext, useContext, useMemo, memo } from "react";
import { toast } from "sonner";
import { useGuest } from "@/lib/guest";
import type { RestrictedAction } from "@/lib/guest";
import { SafeImage } from "@/components/SafeImage";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LibraryEntry {
  id: string;
  status: WatchStatus;
  favorite: boolean;
  rating: number | null;
  notes: string | null;
}

interface MediaEntryContextValue {
  mediaId: string | null | undefined;
  entry: LibraryEntry | null | undefined;
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useMediaLibraryEntry(item: MediaSummary) {
  const qc = useQueryClient();
  const cacheFn = useServerFn(cacheMedia);
  const getLibFn = useServerFn(getLibraryItem);
  const upsertFn = useServerFn(upsertLibraryItem);
  const removeFn = useServerFn(removeLibraryItem);

  const cacheQ = useQuery({
    queryKey: ["media-cache", item.source, item.media_type, item.external_id],
    queryFn: () => cacheFn({ data: { type: item.media_type, external_id: item.external_id, source: item.source } }),
    placeholderData: (prev) => prev,
    staleTime: Infinity,
  }) as UseQueryResult<{ id: string | null }, unknown>;

  const mediaId = cacheQ.data?.id;
  const cacheFailed = cacheQ.isError;
  const cacheErrorMsg = cacheQ.error
    ? typeof cacheQ.error === "string" ? cacheQ.error
    : (cacheQ.error as { message?: string })?.message || "Title couldn't be cached"
    : null;

  const entryQ = useQuery<LibraryEntry | null>({
    queryKey: ["library-entry", mediaId],
    queryFn: () => getLibFn({ data: { media_id: mediaId! } }),
    enabled: !!mediaId,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const upsertMutation = useMutation({
    mutationFn: async (data: { status?: WatchStatus; favorite?: boolean }) => {
      if (!mediaId) throw new Error(cacheFailed && cacheErrorMsg ? cacheErrorMsg : "Media not yet ready");
      return upsertFn({ data: { media_id: mediaId, ...data } });
    },
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ["library-entry", mediaId] });
      const previousEntry = qc.getQueryData<LibraryEntry | null>(["library-entry", mediaId]);
      qc.setQueryData(["library-entry", mediaId], (old: LibraryEntry | null | undefined) => {
        const base = old ?? { id: "", status: "planned" as WatchStatus, favorite: false, rating: null, notes: null };
        return { ...base, favorite: data.favorite !== undefined ? data.favorite : base.favorite, status: data.status !== undefined ? data.status : base.status };
      });
      return { previousEntry };
    },
    onError: (err, _vars, context) => {
      qc.setQueryData(["library-entry", mediaId], context?.previousEntry ?? null);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["library-entry", mediaId] });
      qc.invalidateQueries({ queryKey: ["library"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!mediaId) throw new Error(cacheFailed && cacheErrorMsg ? cacheErrorMsg : "Media not ready yet");
      return removeFn({ data: { media_id: mediaId } });
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["library-entry", mediaId] });
      const previousEntry = qc.getQueryData<LibraryEntry | null>(["library-entry", mediaId]);
      qc.setQueryData(["library-entry", mediaId], null);
      return { previousEntry };
    },
    onError: (_err, _vars, context) => {
      qc.setQueryData(["library-entry", mediaId], context?.previousEntry ?? null);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["library-entry", mediaId] });
      qc.invalidateQueries({ queryKey: ["library"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const upsert = useCallback(async (data: { status?: WatchStatus; favorite?: boolean }) => {
    if (upsertMutation.isPending || removeMutation.isPending) return;
    await upsertMutation.mutateAsync(data);
  }, [upsertMutation, removeMutation]);

  const remove = useCallback(async () => {
    if (upsertMutation.isPending || removeMutation.isPending) return;
    await removeMutation.mutateAsync();
  }, [upsertMutation, removeMutation]);

  const isPending = upsertMutation.isPending || removeMutation.isPending;

  return useMemo(() => ({
    mediaId,
    entry: entryQ.data,
    isLoading: cacheQ.isLoading || entryQ.isLoading,
    isPending,
    upsert,
    remove,
  }), [mediaId, entryQ.data, cacheQ.isLoading, entryQ.isLoading, isPending, upsert, remove]);
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

function StatusPill({ current, onChange, disabled, onRemove }: {
  current: WatchStatus | null;
  onChange: (status: WatchStatus) => Promise<void>;
  disabled: boolean;
  onRemove: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (!ref.current?.contains(e.relatedTarget as Node)) {
      setTimeout(() => setOpen(false), 150);
    }
  }, []);

  const activeOption = STATUS_OPTIONS.find((o) => o.value === current);
  const Icon = activeOption?.icon ?? BookmarkPlus;

  return (
    <div ref={ref} className="relative" onBlur={handleBlur} onFocus={() => setOpen(true)}>
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
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
        {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
        <span>{current ? getStatusLabel(current as WatchStatus) : "Add to Watchlist"}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 z-30 min-w-[140px] rounded-xl border border-border/40 bg-card p-1 shadow-2xl shadow-black/40 animate-fade-in">
          {STATUS_OPTIONS.map((opt) => {
            const isActive = current === opt.value;
            return (
              <button
                key={opt.value}
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
                  isActive ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                <opt.icon className="h-4 w-4" />
                {isActive ? `✓ ${opt.label}` : opt.label}
              </button>
            );
          })}
          {current && (
            <button
              onClick={async () => { setOpen(false); await onRemove(); }}
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

const MediaCardInner = memo(function MediaCardInner({ item }: { item: MediaSummary }) {
  const { entry, isLoading, isPending, upsert, remove } = useMediaEntryContext();
  const { requireAuth } = useGuest();
  const status = entry?.status ?? null;
  const isFavorite = entry?.favorite ?? false;

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
    <div className="group relative block overflow-hidden rounded-xl bg-card/60 border border-border/30 transition-all duration-300 hover:border-border/60 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-0.5">
      <Link to={CARD_LINK} params={{ type: item.media_type, source: item.source, id: item.external_id }} className="block">
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
              <span className="text-[11px] font-bold text-white">{item.vote_average.toFixed(1)}</span>
            </div>
          )}

          {/* Favorite button */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(); }}
            className={cn(
              "absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200",
              isFavorite
                ? "bg-accent/90 text-white scale-100 opacity-100"
                : "bg-black/40 text-white/70 opacity-0 group-hover:opacity-100 hover:scale-110",
            )}
          >
            <Heart className={cn("h-3.5 w-3.5", isFavorite && "fill-current")} />
          </button>
        </div>
      </Link>

      <div className="p-3">
        {/* Meta row */}
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
          <span className="font-semibold text-primary">{item.media_type}</span>
          {item.release_year ? <><span>·</span><span>{item.release_year}</span></> : null}
        </div>

        {/* Title */}
        <Link to={CARD_LINK} params={{ type: item.media_type, source: item.source, id: item.external_id }} className="block mt-0.5">
          <h3 className="line-clamp-2 text-sm font-bold leading-tight group-hover:text-primary transition-colors">
            {item.title}
          </h3>
        </Link>

        {/* Status pill */}
        <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
          {isLoading ? (
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

export function MediaCard({ item }: { item: MediaSummary }) {
  return (
    <MediaEntryProvider item={item}>
      <MediaCardInner item={item} />
    </MediaEntryProvider>
  );
}

// ─── MediaGrid ────────────────────────────────────────────────────────────────

export function MediaGrid({ items }: { items: MediaSummary[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((it, idx) => (
        <MediaCard key={`${it.source}-${it.media_type}-${it.external_id}-${idx}`} item={it} />
      ))}
    </div>
  );
}

export { MediaEntryProvider, useMediaEntryContext };
