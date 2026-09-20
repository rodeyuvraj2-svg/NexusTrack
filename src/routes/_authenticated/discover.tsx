import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { discover, trending, getGenres } from "@/lib/tmdb.functions";
import { topAnime, topManga } from "@/lib/anilist.functions";
import { mediaAllFeed } from "@/lib/feed.functions";
import { MediaGrid } from "@/components/MediaCard";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { PageHeader } from "@/components/PageHeader";
import { FilterTabs, Chip } from "@/components/FilterTabs";
import { SkeletonGrid } from "@/components/Skeletons";
import { ErrorPanel } from "@/components/ErrorPanel";
import { EmptyState } from "@/components/EmptyState";
import type { MediaSummary } from "@/lib/media-types";
import type { Genre } from "@/lib/tmdb.functions";
import { AlertCircle, Film, Tv, Sparkles, Loader2, X, BookmarkIcon } from "lucide-react";

type MediaType = "movie" | "tv" | "anime" | "manga";
type SortMode = "all" | "trending" | "popular";

const TABS: { id: MediaType; label: string; icon: typeof Film }[] = [
  { id: "movie", label: "Movies", icon: Film },
  { id: "tv", label: "TV", icon: Tv },
  { id: "anime", label: "Anime", icon: Sparkles },
  { id: "manga", label: "Manga", icon: BookmarkIcon },
];

// Every type tab offers the same three sub-filters, so the selected sort
// survives tab switches. "All" is broad discovery WITHIN the selected type
// (several same-type rankings interleaved) — it never mixes media types and
// is never a synonym for Popular.
const SORTS: { id: SortMode; label: string }[] = [
  { id: "all", label: "All" },
  { id: "trending", label: "Trending" },
  { id: "popular", label: "Popular" },
];

const ANIME_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Thriller",
];

export const Route = createFileRoute("/_authenticated/discover")({
  // Optional ?type= deep-link (used by the landing category tiles). Anything
  // else is ignored so bare /discover links keep their default "movie" tab.
  validateSearch: (search: Record<string, unknown>): { type?: MediaType } => {
    const t = search.type;
    return t === "movie" || t === "tv" || t === "anime" || t === "manga" ? { type: t } : {};
  },
  head: () => ({
    meta: [
      { title: "Discover — NexusTrack" },
      {
        name: "description",
        content: "Discover trending and popular across movies, TV, anime, and manga.",
      },
    ],
  }),
  errorComponent: RouteErrorBoundary,
  component: Discover,
});

function Discover() {
  const { type } = Route.useSearch();
  const [tab, setTab] = useState<MediaType>(type ?? "movie");
  const [sort, setSort] = useState<SortMode>("all");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const trendingFn = useServerFn(trending);
  const discoverFn = useServerFn(discover);
  const topAnimeFn = useServerFn(topAnime);
  const topMangaFn = useServerFn(topManga);
  const allFeedFn = useServerFn(mediaAllFeed);
  const genresFn = useServerFn(getGenres);

  const isAnimeManga = tab === "anime" || tab === "manga";
  const genreParam = selectedGenres.length > 0 ? selectedGenres.join(",") : undefined;

  // Tab change: the three sorts are valid on every tab, so the selection is
  // preserved. Genre ids are per-type value spaces (TMDB movie ids ≠ TMDB tv
  // ids ≠ AniList genre names), so they always reset on a tab switch.
  const onTabChange = (t: MediaType) => {
    setTab(t);
    if (t !== tab) setSelectedGenres([]);
  };

  // Sort and genre changes are independent: every ranking supports genre
  // filtering (movie/tv Trending filters the real trending list by genre
  // server-side, so the sub-filter never needs to switch on its own).
  const onSortChange = (s: SortMode) => {
    setSort(s);
  };

  const onGenreToggle = (id: string) => {
    setSelectedGenres((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };

  // Fetch TMDB genres for movie/tv tabs. Finite staleTime (not Infinity):
  // getGenres returns [] when TMDB is unreachable, and an empty list cached
  // forever would leave the genre filter row permanently hidden for the
  // session — a finite staleness lets it recover on the next mount.
  const genresQ = useQuery({
    queryKey: ["genres", tab],
    queryFn: () => {
      if (tab === "movie") return genresFn({ data: { type: "movie" } });
      if (tab === "tv") return genresFn({ data: { type: "tv" } });
      return Promise.resolve([] as Genre[]);
    },
    placeholderData: (prev) => prev,
    staleTime: 10 * 60_000,
    enabled: !isAnimeManga,
  });

  const tmdbGenres: Genre[] = genresQ.data ?? [];

  // Genre chips (genre ids are per-type — TMDB ids for movie/tv, AniList
  // genre names for anime/manga). Every mode filters server-side, including
  // movie/tv Trending (filtered against the trending list's genre_ids).
  const genreChips = isAnimeManga
    ? ANIME_GENRES.map((name) => ({ name, id: name }))
    : tmdbGenres.map((g) => ({ name: g.name, id: String(g.id) }));

  const genreIdToName: Record<string, string> = {};
  for (const g of genreChips) genreIdToName[g.id] = g.name;

  const q = useInfiniteQuery({
    // Sorted genres so different click orders share one cache entry; any
    // filter change swaps the key, which restarts the infinite query at
    // page 1 with no leftover results from the previous combination.
    queryKey: ["discover", tab, sort, ...[...selectedGenres].sort()],
    queryFn: async ({ pageParam }) => {
      const page = pageParam as number;
      if (tab === "movie" || tab === "tv") {
        // All = several same-type TMDB rankings interleaved — /discover
        // rankings when genres are selected (category endpoints can't
        // filter), otherwise the real category lists. Trending = the actual
        // /trending endpoint, genre-filtered server-side via genre_ids.
        // Popular = /{type}/popular (+ genres via /discover).
        if (sort === "all") return allFeedFn({ data: { type: tab, page, genre: genreParam } });
        if (sort === "trending")
          return trendingFn({ data: { type: tab, page, genre: genreParam } });
        return discoverFn({ data: { type: tab, category: "popular", page, genre: genreParam } });
      }
      if (tab === "anime") {
        // All = TRENDING_DESC + POPULARITY_DESC interleaved (genres apply);
        // Trending/Popular = the single real AniList ranking.
        if (sort === "all") return allFeedFn({ data: { type: "anime", page, genre: genreParam } });
        return topAnimeFn({
          data: { page, genre: genreParam, sort: sort === "trending" ? "trending" : "popular" },
        });
      }
      if (sort === "all") return allFeedFn({ data: { type: "manga", page, genre: genreParam } });
      return topMangaFn({
        data: { page, genre: genreParam, type: sort === "trending" ? "trending" : "popular" },
      });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const page = lastPageParam as number;
      if (!lastPage || lastPage.length === 0 || page >= 500) return undefined;
      return page + 1;
    },
    staleTime: 120_000,
    retry: 2,
  });

  const fetchNextPage = q.fetchNextPage;
  const hasNextPage = q.hasNextPage;
  const isFetchingNextPage = q.isFetchingNextPage;

  // Infinite scroll observer
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const rawItems: MediaSummary[] = q.data?.pages.flatMap((p) => p ?? []).filter(Boolean) ?? [];
  const seen = new Set<string>();
  const items = rawItems.filter((item) => {
    const key = `${item.source}-${item.media_type}-${item.external_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="overflow-x-hidden">
      <PageHeader title="Discover" />

      {/* Media type tabs */}
      <FilterTabs
        className="mb-4"
        options={TABS.map((t) => ({ value: t.id, label: t.label, icon: t.icon }))}
        value={tab}
        onChange={onTabChange}
      />

      {/* Sort options — same three on every type tab */}
      <div className="mb-4 flex gap-1.5">
        {SORTS.map((s) => (
          <Chip
            key={s.id}
            active={sort === s.id}
            onClick={() => onSortChange(s.id)}
            className="px-4 py-1.5 text-xs normal-case tracking-normal"
          >
            {s.label}
          </Chip>
        ))}
      </div>

      {/* Genre filter chips — per-type ids, available in every mode */}
      {genreChips.length > 0 && (
        <div className="mb-6">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <Chip
              active={selectedGenres.length === 0}
              onClick={() => setSelectedGenres([])}
              className="px-3 py-1.5 text-xs normal-case tracking-normal"
            >
              All
            </Chip>
            {genreChips.map((chip) => (
              <Chip
                key={chip.id}
                tone="accent"
                active={selectedGenres.includes(chip.id)}
                onClick={() => onGenreToggle(chip.id)}
                className="px-3 py-1.5 text-xs normal-case tracking-normal"
              >
                {chip.name}
              </Chip>
            ))}
          </div>
          {selectedGenres.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {selectedGenres.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium text-accent"
                >
                  {genreIdToName[id] ?? id}
                  <button
                    onClick={() => setSelectedGenres((prev) => prev.filter((i) => i !== id))}
                    aria-label={`Remove ${genreIdToName[id] ?? id} filter`}
                    className="grid h-6 w-6 place-items-center rounded-full hover:bg-accent/20 hover:text-accent/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button
                onClick={() => setSelectedGenres([])}
                className="text-[11px] text-destructive hover:underline ml-1"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {q.isLoading ? (
        <SkeletonGrid count={12} />
      ) : q.isError ? (
        <ErrorPanel
          icon={AlertCircle}
          tone="destructive"
          title="Failed to load content. Try again."
          action={
            <button
              onClick={() => q.refetch()}
              className="rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white shadow-lg btn-press"
            >
              Try again
            </button>
          }
        />
      ) : items.length === 0 && !q.isFetchingNextPage ? (
        <EmptyState
          variant="panel"
          icon={Film}
          title={
            selectedGenres.length > 0
              ? "No content matches those genres."
              : "No content available right now."
          }
          description=""
        />
      ) : (
        <>
          <MediaGrid items={items} />
          <div ref={sentinelRef} className="flex justify-center py-8">
            {q.isFetchingNextPage ? (
              <Loader2
                className="h-6 w-6 animate-spin text-muted-foreground"
                aria-label="Loading more"
              />
            ) : q.hasNextPage ? (
              <span className="text-xs text-muted-foreground">Scroll for more</span>
            ) : items.length > 0 ? (
              <span className="text-xs text-muted-foreground">You've reached the end</span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
