import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { discover, trending, getGenres } from "@/lib/tmdb.functions";
import { topAnime, seasonalAnime } from "@/lib/anilist.functions";
import type { Genre } from "@/lib/tmdb.functions";
import { MediaGrid } from "@/components/MediaCard";
import { AlertCircle, Compass, Film, Tv, Sparkles, Loader2, X } from "lucide-react";

const TABS = [
  { id: "trending", label: "Trending", icon: Compass },
  { id: "movies-popular", label: "Popular Movies", icon: Film },
  { id: "movies-top", label: "Top Rated Movies", icon: StarIcon },
  { id: "movies-upcoming", label: "Upcoming", icon: ClockIcon },
  { id: "tv-popular", label: "Popular TV", icon: Tv },
  { id: "tv-top", label: "Top TV", icon: StarIcon },
  { id: "tv-airing", label: "Airing Now", icon: Tv },
  { id: "anime-top", label: "Top Anime", icon: Sparkles },
  { id: "anime-seasonal", label: "Seasonal Anime", icon: Sparkles },
] as const;
type TabId = (typeof TABS)[number]["id"];

const ANIME_GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
  "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Thriller",
];

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({ meta: [{ title: "Discover — NexusTrack" }, { name: "description", content: "Discover trending, popular, top-rated, and upcoming across movies, TV, and anime." }] }),
  component: Discover,
});

function Discover() {
  const [tab, setTab] = useState<TabId>("trending");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const trendingFn = useServerFn(trending);
  const discoverFn = useServerFn(discover);
  const topAnimeFn = useServerFn(topAnime);
  const seasonalFn = useServerFn(seasonalAnime);
  const genresFn = useServerFn(getGenres);

  // Reset genres when tab changes
  useEffect(() => { setSelectedGenres([]); }, [tab]);

  const showAnimeGenres = tab === "anime-top" || tab === "anime-seasonal";
  const showTrending = tab === "trending";

  // Fetch TMDB genres for movie/TV tabs
  const genresQ = useQuery({
    queryKey: ["genres", tab],
    queryFn: () => {
      if (tab.startsWith("movies")) return genresFn({ data: { type: "movie" } });
      if (tab.startsWith("tv")) return genresFn({ data: { type: "tv" } });
      return Promise.resolve([] as Genre[]);
    },
    placeholderData: (prev) => prev,
    staleTime: Infinity,
    enabled: !showAnimeGenres,
  });
  const tmdbGenres: Genre[] = genresQ.data ?? [];

  // Build a map of genre name → genre id for quick lookup
  const genreNameToId = useMemo(() => new Map(tmdbGenres.map((g) => [g.name, String(g.id)])), [tmdbGenres]);

  // Toggle a genre: add if not selected, remove if already selected
  function toggleGenre(chipId: string) {
    setSelectedGenres((prev) =>
      prev.includes(chipId) ? prev.filter((g) => g !== chipId) : [...prev, chipId],
    );
  }

  // Comma-separated genre IDs for TMDB
  const genreParam = selectedGenres.length > 0 ? selectedGenres.join(",") : undefined;

  // Infinite query
  const q = useInfiniteQuery({
    queryKey: ["discover", tab, ...selectedGenres],
    queryFn: ({ pageParam }) => {
      const page = pageParam as number;
      switch (tab) {
        case "trending":
          return trendingFn({ data: { type: "all", page } });
        case "movies-popular":
          return discoverFn({ data: { type: "movie", category: "popular", page, genre: genreParam } });
        case "movies-top":
          return discoverFn({ data: { type: "movie", category: "top_rated", page, genre: genreParam } });
        case "movies-upcoming":
          return discoverFn({ data: { type: "movie", category: "upcoming", page, genre: genreParam } });
        case "tv-popular":
          return discoverFn({ data: { type: "tv", category: "popular", page, genre: genreParam } });
        case "tv-top":
          return discoverFn({ data: { type: "tv", category: "top_rated", page, genre: genreParam } });
        case "tv-airing":
          return discoverFn({ data: { type: "tv", category: "on_the_air", page, genre: genreParam } });
        case "anime-top":
          return topAnimeFn({ data: { page, genre: genreParam } });
        case "anime-seasonal":
          return seasonalFn({ data: { page, genre: genreParam } });
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage || lastPage.length < 20) return undefined;
      return (lastPageParam as number) + 1;
    },
    placeholderData: (prev) => prev,
    staleTime: 300_000,
    retry: 1,
  });

  // Intersection observer for infinite scroll
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && q.hasNextPage && !q.isFetchingNextPage) {
          q.fetchNextPage();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage]);

  const items = q.data?.pages.flatMap((p) => p) ?? [];

  // Build genre chip list: name + id
  const genreChips = useMemo(() => {
    if (showAnimeGenres) return ANIME_GENRES.map((name) => ({ name, id: name }));
    if (showTrending) return [];
    return tmdbGenres.map((g) => ({ name: g.name, id: String(g.id) }));
  }, [showAnimeGenres, showTrending, tmdbGenres]);

  // Selected genre names for display
  const selectedNames = selectedGenres.map((id) =>
    showAnimeGenres ? id : tmdbGenres.find((g) => String(g.id) === id)?.name ?? id,
  );

  return (
    <div>
      <h1 className="text-3xl md:text-4xl font-bold mb-6 animate-fade-in">Discover</h1>

      {/* Tab navigation */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2 scrollbar-none md:flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors btn-press ${
              tab === t.id ? "bg-gradient-accent text-white shadow-md" : "glass hover:bg-muted/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Genre filter chips */}
      {!showTrending && genreChips.length > 0 && (
        <div className="mb-6">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedGenres([])}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors btn-press ${
                selectedGenres.length === 0 ? "bg-primary/20 text-primary border border-primary/30" : "glass hover:bg-muted/40"
              }`}
            >
              All
            </button>
            {genreChips.map((chip) => (
              <button
                key={chip.id}
                onClick={() => toggleGenre(chip.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors btn-press ${
                  selectedGenres.includes(chip.id) ? "bg-accent/20 text-accent border border-accent/30" : "glass hover:bg-muted/40"
                }`}
              >
                {chip.name}
              </button>
            ))}
          </div>

          {/* Active filter indicator */}
          {selectedGenres.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {selectedGenres.map((id) => {
                const name = showAnimeGenres ? id : tmdbGenres.find((g) => String(g.id) === id)?.name ?? id;
                return (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                    {name}
                    <button onClick={() => toggleGenre(id)} className="hover:text-accent/70">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
              <button onClick={() => setSelectedGenres([])} className="text-[11px] text-destructive hover:underline ml-1">
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {q.isLoading ? (
        <SkeletonGrid />
      ) : q.isError ? (
        <div className="glass rounded-2xl p-12 text-center animate-fade-in">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <p className="text-muted-foreground">Failed to load content. Please try again.</p>
          <button onClick={() => q.refetch()} className="mt-4 rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white btn-press">
            Try again
          </button>
        </div>
      ) : items.length === 0 && !q.isFetchingNextPage ? (
        <div className="glass rounded-2xl p-12 text-center animate-fade-in">
          <Compass className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {selectedGenres.length > 0
              ? "No content matches those genres. Try selecting different ones."
              : "No content available for this category right now."}
          </p>
        </div>
      ) : (
        <>
          <MediaGrid items={items} />

          {/* Load more sentinel */}
          <div ref={loadMoreRef} className="flex justify-center py-8">
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

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
