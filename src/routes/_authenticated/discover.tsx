import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { discover, trending, getGenres } from "@/lib/tmdb.functions";
import { topAnime, topManga } from "@/lib/anilist.functions";
import { MediaGrid } from "@/components/MediaCard";
import { cn } from "@/lib/utils";
import type { MediaSummary } from "@/lib/media-types";
import type { Genre } from "@/lib/tmdb.functions";
import { AlertCircle, Film, Tv, Sparkles, Loader2, X, TrendingUp, BookmarkIcon } from "lucide-react";

type MediaType = "movie" | "tv" | "anime" | "manga";
type SortMode = "all" | "trending" | "popular";

const TABS: { id: MediaType; label: string; icon: typeof Film }[] = [
  { id: "movie", label: "Movies", icon: Film },
  { id: "tv", label: "TV", icon: Tv },
  { id: "anime", label: "Anime", icon: Sparkles },
  { id: "manga", label: "Manga", icon: BookmarkIcon },
];

const SORTS: { id: SortMode; label: string }[] = [
  { id: "all", label: "All" },
  { id: "trending", label: "Trending" },
  { id: "popular", label: "Popular" },
];

const ANIME_GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
  "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Thriller",
];

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({ meta: [{ title: "Discover — NexusTrack" }, { name: "description", content: "Discover trending and popular across movies, TV, anime, and manga." }] }),
  component: Discover,
});

function Discover() {
  const [tab, setTab] = useState<MediaType>("movie");
  const [sort, setSort] = useState<SortMode>("all");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const trendingFn = useServerFn(trending);
  const discoverFn = useServerFn(discover);
  const topAnimeFn = useServerFn(topAnime);
  const topMangaFn = useServerFn(topManga);
  const genresFn = useServerFn(getGenres);

  const isAnimeManga = tab === "anime" || tab === "manga";
  const genreParam = selectedGenres.length > 0 ? selectedGenres.join(",") : undefined;

  // Reset sort/genre when tab changes
  const onTabChange = (t: MediaType) => {
    setTab(t);
    setSort("trending");
    setSelectedGenres([]);
  };

  // Fetch TMDB genres for movie/tv tabs
  const genresQ = useQuery({
    queryKey: ["genres", tab],
    queryFn: () => {
      if (tab === "movie") return genresFn({ data: { type: "movie" } });
      if (tab === "tv") return genresFn({ data: { type: "tv" } });
      return Promise.resolve([] as Genre[]);
    },
    placeholderData: (prev) => prev,
    staleTime: Infinity,
    enabled: !isAnimeManga,
  });

  const tmdbGenres: Genre[] = genresQ.data ?? [];

  // Genre chips
  const genreChips = isAnimeManga
    ? ANIME_GENRES.map((name) => ({ name, id: name }))
    : tmdbGenres.map((g) => ({ name: g.name, id: String(g.id) }));

  const genreIdToName: Record<string, string> = {};
  for (const g of genreChips) genreIdToName[g.id] = g.name;

  const q = useInfiniteQuery({
    queryKey: ["discover", tab, sort, ...selectedGenres],
    queryFn: async ({ pageParam }) => {
      const page = pageParam as number;
      if (tab === "anime") {
        const animeSort = sort === "trending" ? "trending" : "popular";
        return topAnimeFn({ data: { page, genre: genreParam, sort: animeSort } });
      }
      if (tab === "manga") {
        if (sort === "trending") return topMangaFn({ data: { page, genre: genreParam, type: "top" } });
        return topMangaFn({ data: { page, genre: genreParam, type: "popular" } });
      }
      // Movie / TV
      if (sort === "trending") return trendingFn({ data: { type: tab, page, genre: genreParam } });
      return discoverFn({ data: { type: tab, category: "popular", page, genre: genreParam } });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage || lastPage.length < 20) return undefined;
      return (lastPageParam as number) + 1;
    },
    staleTime: 120_000,
    retry: 2,
  });

  // Infinite scroll
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = (el: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();
    if (!el) return;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
      },
      { rootMargin: "300px" },
    );
    observerRef.current.observe(el);
  };

  const items: MediaSummary[] = q.data?.pages.flatMap((p) => p ?? []).filter(Boolean) ?? [];

  return (
    <div className="overflow-x-hidden">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-3xl md:text-4xl font-bold animate-fade-in">Discover</h1>
      </div>

      {/* Media type tabs */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => onTabChange(t.id)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors btn-press shrink-0",
              tab === t.id ? "bg-gradient-accent text-white shadow-md" : "glass hover:bg-muted/40",
            )}>
            <t.icon className="h-4 w-4 inline mr-1.5 -mt-0.5" />{t.label}
          </button>
        ))}
      </div>

      {/* Sort: Trending / Popular */}
      <div className="mb-4 flex gap-1.5">
        {SORTS.map((s) => (
          <button key={s.id} onClick={() => setSort(s.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              sort === s.id ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground",
            )}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Genre filter chips */}
      {genreChips.length > 0 && (
        <div className="mb-6">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button onClick={() => setSelectedGenres([])}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors shrink-0",
                selectedGenres.length === 0 ? "bg-primary/20 text-primary border border-primary/30" : "glass hover:bg-muted/40 text-muted-foreground",
              )}>
              All
            </button>
            {genreChips.map((chip) => (
              <button key={chip.id} onClick={() =>
                setSelectedGenres((prev) => prev.includes(chip.id) ? prev.filter((id) => id !== chip.id) : [...prev, chip.id])
              }
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors shrink-0",
                  selectedGenres.includes(chip.id) ? "bg-accent/20 text-accent border border-accent/30" : "glass hover:bg-muted/40 text-muted-foreground",
                )}>
                {chip.name}
              </button>
            ))}
          </div>
          {selectedGenres.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {selectedGenres.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                  {genreIdToName[id] ?? id}
                  <button onClick={() => setSelectedGenres((prev) => prev.filter((i) => i !== id))} className="hover:text-accent/70">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button onClick={() => setSelectedGenres([])} className="text-[11px] text-destructive hover:underline ml-1">Clear all</button>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {q.isLoading ? (
        <SkeletonGrid />
      ) : q.isError ? (
        <div className="glass rounded-2xl p-12 text-center animate-fade-in">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">Failed to load content. Try again.</p>
          <button onClick={() => q.refetch()} className="mt-5 rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white shadow-lg btn-press">
            Try again
          </button>
        </div>
      ) : items.length === 0 && !q.isFetchingNextPage ? (
        <div className="glass rounded-2xl p-12 text-center animate-fade-in">
          <Film className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {selectedGenres.length > 0 ? "No content matches those genres." : "No content available right now."}
          </p>
        </div>
      ) : (
        <>
          <MediaGrid items={items} />
          <div ref={sentinelRef} className="flex justify-center py-8">
            {q.isFetchingNextPage ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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

function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-[2/3] rounded-xl glass animate-pulse" style={{ animationDelay: i * 50 + "ms" }} />
      ))}
    </div>
  );
}
