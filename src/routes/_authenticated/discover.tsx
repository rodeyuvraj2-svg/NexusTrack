import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { discover, trending, getGenres } from "@/lib/tmdb.functions";
import { topAnime, seasonalAnime, topManga } from "@/lib/jikan.functions";
import type { Genre } from "@/lib/tmdb.functions";
import { MediaGrid } from "@/components/MediaCard";
import { SafeImage } from "@/components/SafeImage";
import { cn } from "@/lib/utils";
import { AlertCircle, Compass, Film, Tv, Sparkles, Loader2, X, Star, BookmarkIcon } from "lucide-react";

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
  { id: "manga-top", label: "Top Manga", icon: BookmarkIcon },
  { id: "manga-popular", label: "Popular Manga", icon: BookmarkIcon },
] as const;
type TabId = (typeof TABS)[number]["id"];

const ANIME_GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
  "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Thriller",
];

// Jikan genre IDs for anime/manga (must match the API)
const GENRE_ID_MAP: Record<string, number> = {
  Action: 1,
  Adventure: 2,
  Cars: 3,
  Comedy: 4,
  Dementia: 5,
  Demons: 6,
  Mystery: 7,
  Drama: 8,
  Ecchi: 9,
  Fantasy: 10,
  Game: 11,
  Hentai: 12,
  Historical: 13,
  Horror: 14,
  Kids: 15,
  Magic: 16,
  MartialArts: 17,
  Mecha: 18,
  Music: 19,
  Parody: 23,
  Samurai: 24,
  Romance: 25,
  School: 26,
  SciFi: 27,
  Shoujo: 28,
  ShoujoAi: 29,
  Shounen: 30,
  ShounenAi: 31,
  Space: 32,
  Sports: 33,
  SuperPower: 34,
  Supernatural: 35,
  Thriller: 36,
  Vampire: 37,
  Yaoi: 38,
  Yuri: 39,
};

// Precompute inverse map for Jikan genre ID -> name
const JIKAN_ID_TO_NAME: Record<string, string> = Object.entries(GENRE_ID_MAP).reduce(
  (acc, [name, id]) => ({
    ...acc,
    [String(id)]: name,
  }),
  {}
);

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({ meta: [{ title: "Discover — NexusTrack" }, { name: "description", content: "Discover trending, popular, top-rated, and upcoming across movies, TV, and anime." }] }),
  component: Discover,
});

function Discover() {
  const [tab, setTab] = useState<TabId>("trending");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]); // stores genre IDs as strings
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const trendingFn = useServerFn(trending);
  const discoverFn = useServerFn(discover);
  const topAnimeFn = useServerFn(topAnime);
  const seasonalFn = useServerFn(seasonalAnime);
  const topMangaFn = useServerFn(topManga);
  const genresFn = useServerFn(getGenres);

  // Reset genres when tab changes
  useEffect(() => { setSelectedGenres([]); }, [tab]);

  const showAnimeGenres = tab === "anime-top" || tab === "anime-seasonal" || tab === "manga-top" || tab === "manga-popular";
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

  // Build map from genre ID to name for the current tab
  const genreIdToName = useMemo(() => {
    if (showTrending) {
      return {};
    }
    if (tab.startsWith("movies") || tab.startsWith("tv")) {
      // TMDB genres
      const map: Record<string, string> = {};
      for (const genre of tmdbGenres) {
        map[String(genre.id)] = genre.name;
      }
      return map;
    }
    // Anime/manga tabs: use precomputed JIKAN_ID_TO_NAME
    return JIKAN_ID_TO_NAME;
  }, [showTrending, tmdbGenres, showAnimeGenres]);

  // Build genre chip list: { name, id (string) }
  const genreChips = useMemo(() => {
    if (showTrending) {
      return [];
    }
    if (tab.startsWith("movies") || tab.startsWith("tv")) {
      // TMDB genres
      return tmdbGenres.map(g => ({
        name: g.name,
        id: String(g.id),
      }));
    }
    // Anime/manga tabs
    return ANIME_GENRES
      .filter(name => GENRE_ID_MAP[name] !== undefined)
      .map(name => ({
        name,
        id: String(GENRE_ID_MAP[name]),
      }));
  }, [showTrending, tmdbGenres, ANIME_GENRES, GENRE_ID_MAP]);

  // Selected genre names for display (using the map)
  const selectedNames = selectedGenres.map(id => genreIdToName[id] ?? id);

  // Build genreParam for API calls
  const genreParam = selectedGenres.length > 0 ? selectedGenres.join(",") : undefined;

  // Infinite query
  const q = useInfiniteQuery({
    queryKey: ["discover", tab, ...selectedGenres],
    queryFn: ({ pageParam }) => {
      const page = pageParam as number;
      console.log(`[Discover] fetch page ${page}, tab ${tab}, genreParam: ${genreParam}`);
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
        case "manga-top":
          return topMangaFn({ data: { page, genre: genreParam, type: "top" } });
        case "manga-popular":
          return topMangaFn({ data: { page, genre: genreParam, type: "popular" } });
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage || lastPage.length < 20) return undefined;
      return (lastPageParam as number) + 1;
    },
    staleTime: 0,
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

  const items = q.data?.pages.flatMap((p) => p).filter(Boolean) ?? [];

  return (
    <div className="overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-3xl md:text-4xl font-bold animate-fade-in">Discover</h1>
      </div>

      {/* Tab navigation — horizontal scroll on mobile, wrap on desktop */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory md:flex-wrap md:snap-none">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors btn-press shrink-0 snap-start whitespace-nowrap",
              tab === t.id ? "bg-gradient-accent text-white shadow-md" : "glass hover:bg-muted/40",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Genre filter chips — horizontal scroll, never wrap */}
      {!showTrending && genreChips.length > 0 && (
        <div className="mb-6">
          <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory">
            <button
              onClick={() => setSelectedGenres([])}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors btn-press shrink-0 snap-start whitespace-nowrap",
                selectedGenres.length === 0 ? "bg-primary/20 text-primary border border-primary/30" : "glass hover:bg-muted/40",
              )}
            >
              All
            </button>
            {genreChips.map((chip) => (
              <button
                key={chip.id}
                onClick={() => setSelectedGenres(prev => prev.includes(chip.id) ? prev.filter(id => id !== chip.id) : [...prev, chip.id])}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors btn-press shrink-0 snap-start whitespace-nowrap",
                  selectedGenres.includes(chip.id) ? "bg-accent/20 text-accent border border-accent/30" : "glass hover:bg-muted/40",
                )}
              >
                {chip.name}
              </button>
            ))}
          </div>

          {/* Active filter indicator */}
          {selectedGenres.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {selectedGenres.map(id => {
                const name = genreIdToName[id] ?? id;
                return (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                    {name}
                    <button onClick={() => setSelectedGenres(prev => prev.filter(i => i !== id))} className="hover:text-accent/70">
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
          {/* Mobile: single-column horizontal cards */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {items.map((item, idx) => (
              <Link
                key={`${item.source}-${item.media_type}-${item.external_id}-${idx}`}
                to="/media/$type/$source/$id"
                params={{ type: item.media_type, source: item.source, id: item.external_id }}
                className="glass rounded-xl overflow-hidden flex gap-4 p-3 active:scale-[0.99] transition-transform"
              >
                {/* Poster */}
                <div className="h-28 w-[5.5rem] shrink-0 rounded-lg overflow-hidden bg-muted">
                  <SafeImage
                    src={item.poster_url}
                    alt={item.title}
                    className="h-full w-full object-cover"
                    wrapperClassName="h-full w-full"
                  />
                </div>

                {/* Info */}
                <div className="flex flex-col justify-center min-w-0 flex-1 gap-1">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="text-accent font-semibold shrink-0">{item.media_type}</span>
                    {item.release_year ? (
                      <span className="shrink-0">· {item.release_year}</span>
                    ) : null}
                    {item.vote_average != null ? (
                      <span className="ml-auto flex items-center gap-0.5 text-warning shrink-0">
                        <Star className="h-3 w-3 fill-current" /> {item.vote_average.toFixed(1)}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="text-sm font-semibold line-clamp-2 leading-tight">{item.title}</h3>

                  {item.genres && item.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.genres.slice(0, 3).map((g) => (
                        <span key={g} className="text-[10px] text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop (md+): MediaGrid */}
          <div className="hidden md:block">
            <MediaGrid items={items} />
          </div>

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

function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-3 md:hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass rounded-xl overflow-hidden flex gap-4 p-3 animate-pulse" style={{ animationDelay: i * 50 + "ms" }}>
          <div className="h-28 w-[5.5rem] shrink-0 rounded-lg bg-muted" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-3 w-16 bg-muted rounded" />
            <div className="h-4 w-3/4 bg-muted rounded" />
            <div className="h-3 w-1/2 bg-muted rounded" />
          </div>
        </div>
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