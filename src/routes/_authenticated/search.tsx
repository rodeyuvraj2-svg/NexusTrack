import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { searchAll } from "@/lib/tmdb.functions";
import { searchAnime } from "@/lib/anilist.functions";
import { MediaGrid } from "@/components/MediaCard";
import { Search as SearchIcon, Loader2, AlertCircle, Film, Tv, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "Search — NexusTrack" }, { name: "description", content: "Search movies, TV, and anime from one place." }] }),
  component: SearchPage,
});

function SearchPage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const tmdbFn = useServerFn(searchAll);
  const anilistFn = useServerFn(searchAnime);

  // Debounce input: wait 400ms after the user stops typing
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setDebounced("");
      return;
    }
    timerRef.current = setTimeout(() => setDebounced(trimmed), 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [q]);

  const query = useQuery({
    queryKey: ["search", debounced],
    queryFn: async () => {
      // Run searches in parallel — each handles its own errors internally
      const [tmdb, anime] = await Promise.allSettled([
        tmdbFn({ data: { q: debounced } }),
        anilistFn({ data: { q: debounced } }),
      ]);
      const tmdbData = tmdb.status === "fulfilled" ? tmdb.value : { movies: [], tv: [] };
      const animeData = anime.status === "fulfilled" ? anime.value : [];
      
      let errorMsg = null;
      if (tmdb.status === "rejected") {
        errorMsg = tmdb.reason instanceof Error ? tmdb.reason.message : String(tmdb.reason);
      }
      return { ...tmdbData, anime: animeData, errorMsg };
    },
    enabled: debounced.length > 1,
    retry: 1,
    staleTime: 60_000,
  });

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  const isIdle = debounced.length < 2;
  const isLoading = query.isLoading;
  const isFetching = query.isFetching && !query.isLoading;
  const hasError = query.isError;
  const data = query.data;
  const hasResults = data && (data.movies.length > 0 || data.tv.length > 0 || data.anime.length > 0);

  return (
    <div>
      <h1 className="text-3xl md:text-4xl font-bold mb-6">Search</h1>

      {/* Search bar */}
      <div className="glass-strong rounded-2xl p-2 flex items-center gap-2 mb-8">
        <SearchIcon className="ml-3 h-5 w-5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="The Bear, Frieren, Inception…"
          className="flex-1 bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground"
        />
        {(isLoading || isFetching) ? (
          <Loader2 className="mr-3 h-5 w-5 animate-spin text-muted-foreground shrink-0" />
        ) : q.length > 0 ? (
          <button onClick={() => { setQ(""); setDebounced(""); inputRef.current?.focus(); }}
            className="mr-2 text-muted-foreground hover:text-foreground text-xs">
            Clear
          </button>
        ) : null}
      </div>

      {/* API Key Warning Banner */}
      {data?.errorMsg && (
        <div className="mb-6 rounded-xl border border-warning/30 bg-warning/10 p-4 text-warning flex items-start gap-3 animate-fade-in">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm">TV/Movie results are currently unavailable</h4>
            <p className="text-xs text-warning/80 mt-1">
              This is because your TMDB API Key is not configured. Please add <code className="bg-black/20 rounded px-1.5 py-0.5">TMDB_API_KEY="your_key"</code> to your <code className="bg-black/20 rounded px-1.5 py-0.5">.env</code> file, then restart your dev server.
            </p>
          </div>
        </div>
      )}

      {/* Prompt when idle */}
      {isIdle ? (
        <div className="glass rounded-2xl p-12 text-center">
          <SearchIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Type at least 2 characters to search.</p>
          <p className="mt-1 text-xs text-muted-foreground">Movies, TV shows, and anime — all at once.</p>
        </div>
      ) : null}

      {/* Loading skeletons (initial load) */}
      {isLoading ? (
        <div className="space-y-10">
          {["Movies", "TV Shows", "Anime"].map((section) => (
            <section key={section}>
              <h2 className="text-xl font-bold mb-3">{section}</h2>
              <SkeletonGrid />
            </section>
          ))}
        </div>
      ) : null}

      {/* Error state */}
      {hasError && !isLoading ? (
        <div className="glass rounded-2xl p-12 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <p className="text-muted-foreground">Search failed. Please try again.</p>
          <p className="mt-1 text-xs text-muted-foreground">{query.error?.message}</p>
          <button onClick={() => query.refetch()} className="mt-4 rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white">
            Try again
          </button>
        </div>
      ) : null}

      {/* Results */}
      {!isLoading && !isIdle && data && !hasError ? (
        hasResults ? (
          <div className="space-y-10">
            {data.movies.length > 0 ? (
              <section>
                <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                  <Film className="h-5 w-5 text-primary" /> Movies ({data.movies.length})
                </h2>
                <MediaGrid items={data.movies} />
              </section>
            ) : null}
            {data.tv.length > 0 ? (
              <section>
                <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                  <Tv className="h-5 w-5 text-accent" /> TV Shows ({data.tv.length})
                </h2>
                <MediaGrid items={data.tv} />
              </section>
            ) : null}
            {data.anime.length > 0 ? (
              <section>
                <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-warning" /> Anime ({data.anime.length})
                </h2>
                <MediaGrid items={data.anime} />
              </section>
            ) : null}
          </div>
        ) : (
          <div className="glass rounded-2xl p-12 text-center">
            <SearchIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">No results for "{debounced}"</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a different search term or check your spelling.</p>
          </div>
        )
      ) : null}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="aspect-[2/3] rounded-xl glass animate-pulse" />
      ))}
    </div>
  );
}
