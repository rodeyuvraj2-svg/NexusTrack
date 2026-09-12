import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { listLibrary } from "@/lib/library.functions";
import { MediaGrid } from "@/components/MediaCard";
import { EmptyState } from "@/components/EmptyState";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { PageHeader } from "@/components/PageHeader";
import { FilterTabs, Chip } from "@/components/FilterTabs";
import { SkeletonGrid, SkeletonRow } from "@/components/Skeletons";
import { SafeImage } from "@/components/SafeImage";
import { useGuest } from "@/lib/guest";
import {
  STATUS_COLORS,
  getStatusLabel,
  type MediaSummary,
  type MediaType,
  type WatchStatus,
} from "@/lib/media-types";
import {
  calculateProgressPercent,
  formatChapterProgress,
  formatEpisodeProgress,
  supportsProgress,
} from "@/lib/progress-utils";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow } from "date-fns";
import {
  Film,
  Eye,
  BookmarkPlus,
  CheckCircle2,
  Heart,
  Search,
  ArrowUpDown,
  X,
  LayoutGrid,
  List,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES = [
  { key: "all", label: "All", icon: Film },
  { key: "planned", label: "Plan to Watch", icon: BookmarkPlus },
  { key: "watching", label: "Watching", icon: Eye },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
  { key: "favorites", label: "Favorites", icon: Heart },
] as const;

const TYPES = ["all", "movie", "tv", "anime", "manga"] as const;
type FilterStatus = (typeof STATUSES)[number]["key"];
type MediaFilterType = (typeof TYPES)[number];
// "recent" = updated_at (Recently updated); "added" = created_at (Recently
// added); "progress" = watching/rewatching titles with progress first, most
// recent progress_updated_at on top.
type SortOption = "recent" | "added" | "title" | "rating" | "year" | "progress";
type SortDirection = "asc" | "desc";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Library — NexusTrack" },
      {
        name: "description",
        content: "Everything you're tracking, filterable by status, type, and favorites.",
      },
    ],
  }),
  errorComponent: RouteErrorBoundary,
  component: Library,
});

function Library() {
  const { isGuest } = useGuest();
  const [status, setStatus] = useState<FilterStatus>("all");
  const [type, setType] = useState<MediaFilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [view, setView] = useState<"grid" | "list">("grid");
  const fn = useServerFn(listLibrary);

  // Fetch the whole library once and filter client-side — the dataset is one
  // user's entries, so pill clicks are instant instead of costing a server
  // round trip per filter. Same cache key as the dashboard's library query.
  const q = useQuery({
    queryKey: ["library", "all"],
    queryFn: () => fn({ data: {} }),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  // Row shape returned by listLibrary (user_media joined with media).
  interface LibraryRow {
    id: string;
    status: WatchStatus;
    favorite: boolean;
    hidden: boolean;
    rating: number | null;
    updated_at: string;
    created_at?: string;
    current_season: number | null;
    current_episode: number | null;
    current_chapter: number | null;
    progress_updated_at: string | null;
    media: {
      media_type: string;
      source: string;
      external_id: string;
      title: string;
      poster_url: string | null;
      release_year: number | null;
      vote_average: number | null;
      season_count: number | null;
      chapter_count: number | null;
    } | null;
  }
  const rows = (q.data ?? []) as LibraryRow[];

  // Client-side status/type filtering, search, and sorting — on rows, not
  // mapped MediaSummary items, so the list view keeps rating/status/updated.
  const filteredRows = useMemo(() => {
    // Hidden items stay out of the library view entirely
    let filtered = rows.filter((r) => !r.hidden);
    if (status === "favorites") filtered = filtered.filter((r) => r.favorite);
    else if (status !== "all") filtered = filtered.filter((r) => r.status === status);
    if (type !== "all") {
      filtered = filtered.filter((r) => r.media?.media_type === type);
    }

    if (searchQuery.trim()) {
      const qLower = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((r) => (r.media?.title ?? "").toLowerCase().includes(qLower));
    }

    if (sortBy === "progress") {
      // Watching/rewatching titles that have saved progress come first, most
      // recently updated progress on top; everything else keeps the server's
      // updated_at ordering as a deterministic fallback. (This is a recency
      // sort, not a completion-percentage sort.)
      const ts = (r: LibraryRow) => {
        const active =
          (r.status === "watching" || r.status === "rewatching") && r.progress_updated_at;
        return active ? new Date(r.progress_updated_at!).getTime() : -1;
      };
      filtered = [...filtered].sort((a, b) => ts(b) - ts(a));
    } else if (sortBy === "added") {
      filtered = [...filtered].sort(
        (a, b) =>
          new Date(b.created_at ?? b.updated_at).getTime() -
          new Date(a.created_at ?? a.updated_at).getTime(),
      );
    } else if (sortBy !== "recent") {
      // "recent" = updated_at desc — already the server's ordering, leave as-is
      filtered = [...filtered].sort((a, b) => {
        let comparison = 0;
        if (sortBy === "title") {
          comparison = (a.media?.title ?? "").localeCompare(b.media?.title ?? "");
        } else if (sortBy === "rating") {
          // User's own rating first, falls back to the public vote average
          comparison =
            (a.rating ?? a.media?.vote_average ?? 0) - (b.rating ?? b.media?.vote_average ?? 0);
        } else if (sortBy === "year") {
          comparison = (a.media?.release_year ?? 0) - (b.media?.release_year ?? 0);
        }

        return sortDir === "asc" ? comparison : -comparison;
      });
    }
    return filtered;
  }, [rows, status, type, searchQuery, sortBy, sortDir]);

  // Grid view consumes the mapped MediaSummary shape.
  const items: MediaSummary[] = useMemo(
    () =>
      filteredRows
        .map((r) => {
          const m = r.media;
          const rawSource = m?.source ?? "";
          const rawType = m?.media_type ?? "";
          return {
            external_id: m?.external_id ?? "",
            source: (rawSource === "tmdb" ||
            rawSource === "anilist" ||
            rawSource === "jikan" ||
            rawSource === "kitsu"
              ? rawSource
              : "tmdb") as "tmdb" | "anilist" | "jikan" | "kitsu",
            media_type: (rawType === "movie" ||
            rawType === "tv" ||
            rawType === "anime" ||
            rawType === "manga"
              ? rawType
              : "movie") as MediaType,
            title: m?.title ?? "Unknown",
            overview: null,
            poster_url: m?.poster_url ?? null,
            backdrop_url: null,
            release_year: m?.release_year ?? null,
            vote_average: m?.vote_average ?? null,
            genres: [],
            runtime: null,
            status: null,
            season_count: m?.season_count ?? null,
            chapter_count: m?.chapter_count ?? null,
          };
        })
        .filter((i) => i.external_id),
    [filteredRows],
  );

  if (isGuest) {
    return (
      <div>
        <PageHeader title="Your library" />
        <EmptyState
          icon={Film}
          title="Sign in to build your library"
          description="Track what you watch, mark favorites, and never lose a title you loved."
          variant="panel"
          action={
            <Link
              to="/auth"
              className="inline-block rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white"
            >
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Your library"
        actions={
          <Link
            to="/search"
            className="inline-flex items-center gap-2 rounded-lg border border-border/40 bg-card/30 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors self-start"
          >
            <Search className="h-4 w-4" /> Find something to watch
          </Link>
        }
      />

      {/* Status filter pills */}
      <FilterTabs
        className="mb-4"
        options={STATUSES.map((s) => ({ value: s.key, label: s.label, icon: s.icon }))}
        value={status}
        onChange={setStatus}
      />

      {/* Search & Sort bar */}
      <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved titles..."
            aria-label="Search saved titles"
            className="w-full rounded-xl border border-border/40 bg-card/40 pl-9 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* View toggle */}
        <div
          className="flex items-center gap-1 rounded-xl border border-border/40 bg-card/40 p-1 shrink-0"
          role="group"
          aria-label="View"
        >
          {(
            [
              ["grid", LayoutGrid, "Grid view"],
              ["list", List, "List view"],
            ] as const
          ).map(([mode, Icon, label]) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              aria-pressed={view === mode}
              aria-label={label}
              title={label}
              className={cn(
                "rounded-lg p-1.5 transition-colors",
                view === mode
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
            aria-label={`Sort ${sortDir === "asc" ? "ascending" : "descending"}`}
            className="p-2 rounded-lg glass cursor-pointer hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
            title={`Sort ${sortDir === "asc" ? "Ascending" : "Descending"}`}
          >
            <ArrowUpDown
              className={cn("h-4 w-4 transition-transform", sortDir === "desc" && "-rotate-180")}
            />
          </button>
          <Select value={sortBy} onValueChange={(val) => setSortBy(val as SortOption)}>
            <SelectTrigger
              aria-label="Sort by"
              className="w-full max-w-[180px] rounded-xl border border-border/40 bg-card/40 px-3 py-2 text-sm font-medium text-foreground focus:border-primary/50 focus:outline-none cursor-pointer"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl bg-card/90 backdrop-blur-xl border-border/40">
              <SelectItem value="recent">Recently Updated</SelectItem>
              <SelectItem value="added">Recently Added</SelectItem>
              <SelectItem value="progress">Progress (Recently Watched)</SelectItem>
              <SelectItem value="title">Title A–Z</SelectItem>
              <SelectItem value="rating">Rating</SelectItem>
              <SelectItem value="year">Release Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Type filter pills */}
      <div className="mb-8 flex flex-wrap gap-1.5">
        {TYPES.map((t) => (
          <Chip key={t} active={type === t} onClick={() => setType(t)}>
            {t}
          </Chip>
        ))}
      </div>

      {/* Content */}
      {q.isLoading && rows.length === 0 ? (
        view === "grid" ? (
          <SkeletonGrid count={12} />
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <EmptyState
          icon={Film}
          title="Your library is empty"
          description="Start by adding movies, shows, or anime you love."
          variant="panel"
          action={
            <Link
              to="/search"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-gradient-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
            >
              <Search className="h-4 w-4" /> Discover titles
            </Link>
          }
        />
      ) : view === "grid" ? (
        <MediaGrid items={items} showProgress />
      ) : (
        <LibraryList rows={filteredRows} />
      )}
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────
// Dense table for power users — the same rows as the grid, with the fields
// the grid can't show (status, personal rating, last updated). One glass
// surface wraps the whole table; rows separate with hairline borders.

const LIST_LINK = "/media/$type/$source/$id" as const;

interface LibraryListRow {
  id: string;
  status: WatchStatus;
  favorite: boolean;
  rating: number | null;
  updated_at: string;
  current_season: number | null;
  current_episode: number | null;
  current_chapter: number | null;
  media: {
    media_type: string;
    source: string;
    external_id: string;
    title: string;
    poster_url: string | null;
    release_year: number | null;
    vote_average: number | null;
    chapter_count: number | null;
  } | null;
}

function LibraryList({ rows }: { rows: LibraryListRow[] }) {
  return (
    <div className="glass overflow-hidden rounded-xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground/60">
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Title
            </th>
            <th scope="col" className="hidden px-3 py-2.5 font-semibold md:table-cell">
              Type
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              Status
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              Progress
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              Rating
            </th>
            <th scope="col" className="hidden px-3 py-2.5 font-semibold lg:table-cell">
              Updated
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const m = r.media;
            if (!m?.external_id) return null;
            const mediaType = (
              ["movie", "tv", "anime", "manga"].includes(m.media_type) ? m.media_type : "movie"
            ) as MediaType;
            const statusLabel = getStatusLabel(r.status, mediaType);
            const isManga = m.media_type === "manga";
            // Compact list-cell progress: labels for tv/anime/manga, "—" for
            // movies or nothing saved. Bar only for manga (only known total).
            const progressLabel = isManga
              ? formatChapterProgress(r.current_chapter, m.chapter_count)
              : formatEpisodeProgress(r.current_season, r.current_episode);
            const progressPct = isManga
              ? calculateProgressPercent(r.current_chapter, m.chapter_count)
              : null;
            return (
              <tr
                key={r.id}
                className="border-b border-border/20 transition-colors last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-2.5">
                  <Link
                    to={LIST_LINK}
                    params={{ type: m.media_type, source: m.source, id: m.external_id }}
                    className="flex items-center gap-3 min-w-0 group/row"
                  >
                    <SafeImage
                      src={m.poster_url}
                      alt=""
                      wrapperClassName="h-[52px] w-[35px] shrink-0 rounded overflow-hidden"
                      className="h-full w-full object-cover"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-medium leading-tight group-hover/row:text-primary transition-colors">
                        <span className="truncate">{m.title}</span>
                        {r.favorite ? (
                          <Heart
                            className="h-3 w-3 shrink-0 fill-current text-accent"
                            aria-label="Favorite"
                          />
                        ) : null}
                      </span>
                      {m.release_year ? (
                        <span className="text-xs text-muted-foreground">{m.release_year}</span>
                      ) : null}
                    </span>
                  </Link>
                </td>
                <td className="hidden px-3 py-2.5 capitalize text-muted-foreground md:table-cell">
                  {mediaType}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      STATUS_COLORS[r.status],
                    )}
                  >
                    {statusLabel}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {progressLabel ? (
                    <span className="block">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {progressLabel}
                      </span>
                      {progressPct !== null ? (
                        <Progress
                          value={progressPct}
                          className="mt-1 h-1 w-16 max-w-full"
                          aria-label={`Chapter ${r.current_chapter ?? 0}${m.chapter_count ? ` of ${m.chapter_count}` : ""}`}
                        />
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50" aria-label="No progress">
                      —
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 tabular-nums">
                  {r.rating != null ? (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <Star className="h-3 w-3 fill-current" />
                      <span className="text-xs font-semibold">{r.rating}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td
                  className="hidden px-3 py-2.5 text-xs text-muted-foreground lg:table-cell"
                  title={new Date(r.updated_at).toLocaleString()}
                >
                  <time>{formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}</time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
