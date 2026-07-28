import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { MediaSummary, MediaType, WatchStatus } from "@/lib/media-types";
import { STATUS_LABELS, STATUS_COLORS, getStatusLabel } from "@/lib/media-types";
import {
  BookmarkIcon,
  BookmarkCheck,
  Eye,
  CheckCircle2,
  Heart,
  Loader2,
  Star,
  Trash2,
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const cacheQ = useQuery({
    queryKey: ["media-cache", item.source, item.media_type, item.external_id],
    queryFn: () =>
      cacheFn({
        data: {
          type: item.media_type,
          external_id: item.external_id,
          source: item.source,
        },
      }),
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
      if (!mediaId) {
        throw new Error(cacheFailed && cacheErrorMsg ? cacheErrorMsg : "Media not yet ready");
      }
      return upsertFn({ data: { media_id: mediaId, ...data } });
    },
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ["library-entry", mediaId] });
      const previousEntry = qc.getQueryData<LibraryEntry | null>(["library-entry", mediaId]);
      qc.setQueryData(["library-entry", mediaId], (old: LibraryEntry | null | undefined) => {
        const base = old ?? { id: "", status: "planned" as WatchStatus, favorite: false, rating: null, notes: null };
        return {
          ...base,
          favorite: data.favorite !== undefined ? data.favorite : base.favorite,
          status: data.status !== undefined ? data.status : base.status,
        };
      });
      return { previousEntry };
    },
    onError: (err, _vars, context) => {
      qc.setQueryData(["library-entry", mediaId], context?.previousEntry ?? null);
      const msg = typeof err === "string" ? err : (err as { message?: string })?.message || "Failed to update";
      toast.error(msg);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["library-entry", mediaId] });
      qc.invalidateQueries({ queryKey: ["library"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!mediaId) {
        throw new Error(cacheFailed && cacheErrorMsg ? cacheErrorMsg : "Media not ready yet");
      }
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
      entry: entryQ.data,
      isLoading: cacheQ.isLoading || entryQ.isLoading,
      isPending,
      upsert,
      remove,
    }),
    [mediaId, entryQ.data, cacheQ.isLoading, entryQ.isLoading, isPending, upsert, remove],
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

function MediaEntryProvider({
  item,
  children,
}: {
  item: MediaSummary;
  children: React.ReactNode;
}) {
  const value = useMediaLibraryEntry(item);
  return (
    <MediaEntryContext.Provider value={value}>{children}</MediaEntryContext.Provider>
  );
}

// ─── Action Panel ──────────────────────────────────────────────────────────────

/**
 * Polished, modern media action panel.
 * Actions: Watchlist · Watching · Completed · Favorite
 * Before the item is in the library, only the Watchlist button is shown.
 * Each has hover animation, active state, loading spinner, and optimistic updates.
 */
function MediaActionPanel() {
  const { entry, isLoading, isPending, upsert, remove } = useMediaEntryContext();
  const { requireAuth } = useGuest();

  const status = entry?.status ?? null;
  const isFavorite = entry?.favorite ?? false;
  const isInLibrary = !!entry && !!entry.id;
  const disabled = isPending || isLoading;

  async function toggleFavorite() {
    if (!requireAuth("addFavorite")) return;
    try {
      await upsert({ favorite: !isFavorite });
      toast.success(isFavorite ? "Removed from Favorites" : "Added to Favorites");
    } catch { /* error handled by mutation's onError */ }
  }

  async function toggleWatchlist() {
    if (!requireAuth("addToWatchlist")) return;
    try {
      if (status === "planned") {
        await remove();
        toast.success("Removed from Watchlist");
      } else {
        await upsert({ status: "planned" });
        toast.success("Added to Watchlist");
      }
    } catch { /* error handled by mutation's onError */ }
  }

  async function toggleWatching() {
    if (!requireAuth("markWatching")) return;
    try {
      await upsert({ status: status === "watching" ? "planned" : "watching" });
      toast.success(status === "watching" ? "Moved to Watchlist" : "Marked as Watching");
    } catch { /* error handled by mutation's onError */ }
  }

  async function toggleCompleted() {
    if (!requireAuth("markCompleted")) return;
    try {
      await upsert({ status: status === "completed" ? "planned" : "completed" });
      toast.success(status === "completed" ? "Moved to Watchlist" : "Marked as Completed");
    } catch { /* error handled by mutation's onError */ }
  }

  async function toggleRemove() {
    if (!confirm("Remove this title from your library?")) return;
    try {
      await remove();
      toast.success("Removed from library");
    } catch { /* error handled by mutation's onError */ }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <ActionButton
        onClick={toggleWatchlist}
        disabled={disabled}
        active={status === "planned"}
        activeClass="bg-warning/20 text-warning border-warning/30 hover:bg-warning/25"
        inactiveClass="bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        label={isInLibrary ? "Watchlist" : "Add to Watchlist"}
        title={status === "planned" ? "Remove from Watchlist" : "Add to Watchlist"}
        icon={status === "planned" ? <BookmarkCheck className="h-4 w-4" /> : <BookmarkIcon className="h-4 w-4" />}
      />

      {isInLibrary && (
        <>
          <ActionButton
            onClick={toggleWatching}
            disabled={disabled}
            active={status === "watching"}
            activeClass="bg-primary/20 text-primary border-primary/30 hover:bg-primary/25"
            inactiveClass="bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            label="Watching"
            title={status === "watching" ? "Stop Watching" : "Start Watching"}
            icon={<Eye className="h-4 w-4" />}
          />

          <ActionButton
            onClick={toggleCompleted}
            disabled={disabled}
            active={status === "completed"}
            activeClass="bg-success/20 text-success border-success/30 hover:bg-success/25"
            inactiveClass="bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            label="Completed"
            title={status === "completed" ? "Mark as Not Completed" : "Mark as Completed"}
            icon={<CheckCircle2 className="h-4 w-4" />}
          />

          <ActionButton
            onClick={toggleFavorite}
            disabled={disabled}
            active={isFavorite}
            activeClass="bg-accent/20 text-accent border-accent/30 hover:bg-accent/25"
            inactiveClass="bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            label="Favorite"
            title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            icon={<Heart className={cn("h-4 w-4", isFavorite && "fill-current")} />}
          />

          <button
            onClick={toggleRemove}
            disabled={disabled}
            title="Remove from library"
            className="rounded-lg border border-transparent p-1.5 text-muted-foreground/50 hover:text-destructive hover:border-destructive/30 hover:bg-destructive/10 transition-colors"
          >
            {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Action Button ─────────────────────────────────────────────────────────────

interface ActionButtonProps {
  onClick: () => void;
  disabled: boolean;
  active: boolean;
  activeClass: string;
  inactiveClass: string;
  label: string;
  title: string;
  icon: React.ReactNode;
}

function ActionButton({
  onClick,
  disabled,
  active,
  activeClass,
  inactiveClass,
  label,
  title,
  icon,
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "group relative flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200",
        "hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        active ? activeClass : inactiveClass,
        disabled && "opacity-50 cursor-not-allowed hover:scale-100",
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center h-4 w-4 transition-transform duration-200",
          active && "scale-110",
        )}
      >
        {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ─── MediaCard ────────────────────────────────────────────────────────────────

const CARD_LINK = "/media/$type/$source/$id" as const;

function StatusBadge({ status, mediaType }: { status: WatchStatus; mediaType?: MediaType }) {
  return (
    <span
      className={cn(
        "absolute top-2 left-2 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm",
        STATUS_COLORS[status],
      )}
    >
      {getStatusLabel(status, mediaType)}
    </span>
  );
}

function FavoriteBadge() {
  return (
    <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent/90 shadow-sm backdrop-blur-sm">
      <Heart className="h-3.5 w-3.5 fill-white text-white" />
    </span>
  );
}

const MediaCardInner = memo(function MediaCardInner({ item }: { item: MediaSummary }) {
  const { entry, isLoading } = useMediaEntryContext();
  const status = entry?.status ?? null;
  const isFavorite = entry?.favorite ?? false;

  return (
    <div className="group relative block overflow-hidden rounded-xl glass hover:ring-accent transition-all duration-300 hover:-translate-y-1">
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
          {status && !isLoading && <StatusBadge status={status} mediaType={item.media_type} />}
          {isFavorite && <FavoriteBadge />}
        </div>
      </Link>

      <div className="p-3">
        <Link
          to={CARD_LINK}
          params={{ type: item.media_type, source: item.source, id: item.external_id }}
          className="block"
        >
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="text-accent font-semibold">{item.media_type}</span>
            {item.release_year ? <span>· {item.release_year}</span> : null}
            {item.vote_average != null ? (
              <span className="ml-auto flex items-center gap-1 text-warning">
                <Star className="h-3 w-3 fill-current" /> {item.vote_average.toFixed(1)}
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-tight">
            {item.title}
          </h3>
        </Link>

        <div className="mt-3">
          <MediaActionPanel />
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
      <p className="py-12 text-center text-sm text-muted-foreground">Nothing here yet.</p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((it, idx) => (
        <MediaCard key={`${it.source}-${it.media_type}-${it.external_id}-${idx}`} item={it} />
      ))}
    </div>
  );
}

// Re-export context for use in media detail page
export { MediaEntryProvider, useMediaEntryContext };