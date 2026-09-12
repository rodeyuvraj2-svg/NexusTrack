import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { searchAll } from "@/lib/tmdb.functions";
import { searchAnime, searchManga } from "@/lib/anilist.functions";
import { MediaGrid } from "@/components/MediaCard";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { PageHeader, SectionHeader } from "@/components/PageHeader";
import { FilterTabs } from "@/components/FilterTabs";
import { SkeletonGrid } from "@/components/Skeletons";
import { ErrorPanel } from "@/components/ErrorPanel";
import { EmptyState } from "@/components/EmptyState";
import {
  Search as SearchIcon,
  Loader2,
  AlertCircle,
  Film,
  Tv,
  Sparkles,
  BookmarkIcon,
  Layers,
} from "lucide-react";
import { z } from "zod";

// ── URL search params schema ──────────────────────────────────────────────────
// Storing `q` and `type` in the URL preserves query and active category filter on Back navigation.
const searchParamsSchema = z.object({
  q: z.string().optional().default(""),
  type: z.enum(["all", "movie", "tv", "anime", "manga"]).optional().default("all"),
});

const CATEGORY_TABS: {
  id: "all" | "movie" | "tv" | "anime" | "manga";
  label: string;
  Icon: typeof Layers;
}[] = [
  { id: "all", label: "All Types", Icon: Layers },
  { id: "movie", label: "Movies", Icon: Film },
  { id: "tv", label: "Series / TV", Icon: Tv },
  { id: "anime", label: "Anime", Icon: Sparkles },
  { id: "manga", label: "Manga", Icon: BookmarkIcon },
];

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({
    meta: [
      { title: "Search — NexusTrack" },
      { name: "description", content: "Search movies, TV, and anime from one place." },
    ],
  }),
  validateSearch: searchParamsSchema,
  errorComponent: RouteErrorBoundary,
  component: SearchPage,
});

function SearchPage() {
  const navigate = useNavigate({ from: "/search" });
  const { q, type: activeType } = Route.useSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const tmdbFn = useServerFn(searchAll);
  const anilistFn = useServerFn(searchAnime);
  const mangaFn = useServerFn(searchManga);

  // Debounce URL update so we don't push a history entry on every keystroke
  function handleChange(value: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      navigate({
        search: (prev) => ({ ...prev, q: value }),
        replace: true,
      });
    }, 250);
  }

  function handleTypeChange(newType: "all" | "movie" | "tv" | "anime" | "manga") {
    navigate({
      search: (prev) => ({ ...prev, type: newType }),
      replace: true,
    });
  }

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const debounced = q.trim();
  const isIdle = debounced.length < 2;

  const query = useQuery({
    // Keyed by type so each filter has its own cache — switching back and
    // forth doesn't refetch, and we only hit the APIs the filter needs.
    queryKey: ["search", debounced, activeType],
    queryFn: async () => {
      const wants = (t: "movie" | "tv" | "anime" | "manga") =>
        activeType === "all" || activeType === t;
      const wantsTmdb = wants("movie") || wants("tv");
      const emptyTmdb = { movies: [], tv: [] };
      const [tmdb, anime, manga] = await Promise.allSettled([
        wantsTmdb ? tmdbFn({ data: { q: debounced } }) : Promise.resolve(emptyTmdb),
        wants("anime") ? anilistFn({ data: { q: debounced } }) : Promise.resolve([]),
        wants("manga") ? mangaFn({ data: { q: debounced } }) : Promise.resolve([]),
      ]);
      const tmdbData = tmdb.status === "fulfilled" ? tmdb.value : emptyTmdb;
      const animeData = anime.status === "fulfilled" ? anime.value : [];
      const mangaData = manga.status === "fulfilled" ? manga.value : [];
      let errorMsg = null;
      if (wantsTmdb && tmdb.status === "rejected") {
        errorMsg = tmdb.reason instanceof Error ? tmdb.reason.message : String(tmdb.reason);
      }
      return { ...tmdbData, anime: animeData, manga: mangaData, errorMsg };
    },
    enabled: debounced.length > 1,
    retry: 1,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

  const isLoading = query.isLoading;
  const isFetching = query.isFetching && !query.isLoading;
  const hasError = query.isError;
  const data = query.data;

  const showMovies =
    (activeType === "all" || activeType === "movie") && (data?.movies.length ?? 0) > 0;
  const showTv = (activeType === "all" || activeType === "tv") && (data?.tv.length ?? 0) > 0;
  const showAnime =
    (activeType === "all" || activeType === "anime") && (data?.anime.length ?? 0) > 0;
  const showManga =
    (activeType === "all" || activeType === "manga") && (data?.manga.length ?? 0) > 0;
  const hasResults = showMovies || showTv || showAnime || showManga;

  return (
    <div>
      <PageHeader title="Search" />

      {/* Search bar */}
      <div className="glass-strong rounded-2xl p-2 flex items-center gap-2 mb-4 animate-fade-in">
        <SearchIcon className="ml-3 h-5 w-5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="search"
          defaultValue={q}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="The Bear, Frieren, Inception…"
          aria-label="Search movies, TV, anime, and manga"
          className="flex-1 bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground"
        />
        {isLoading || isFetching ? (
          <Loader2
            className="mr-3 h-5 w-5 animate-spin text-muted-foreground shrink-0"
            aria-label="Searching"
          />
        ) : q.length > 0 ? (
          <button
            onClick={() => {
              navigate({ search: (prev) => ({ ...prev, q: "" }), replace: true });
              if (inputRef.current) inputRef.current.value = "";
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="mr-2 h-11 px-2 text-muted-foreground hover:text-foreground text-xs btn-press"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/* Category filter tabs */}
      <FilterTabs
        className="mb-8"
        options={CATEGORY_TABS.map(({ id, label, Icon }) => ({ value: id, label, icon: Icon }))}
        value={activeType}
        onChange={handleTypeChange}
      />

      {/* API Key Warning Banner */}
      {data?.errorMsg && (
        <div className="mb-6 rounded-xl border border-warning/30 bg-warning/10 p-4 text-warning flex items-start gap-3 animate-fade-in">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm">TV/Movie results are currently unavailable</h4>
            <p className="text-xs text-warning/80 mt-1">
              This is because your TMDB API Key is not configured. Please add{" "}
              <code className="bg-black/20 rounded px-1.5 py-0.5">TMDB_API_KEY="your_key"</code> to
              your <code className="bg-black/20 rounded px-1.5 py-0.5">.env</code> file, then
              restart your dev server.
            </p>
          </div>
        </div>
      )}

      {/* Prompt when idle */}
      {isIdle ? (
        <EmptyState
          variant="panel"
          icon={SearchIcon}
          title="Type at least 2 characters to search."
          description="Movies, TV shows, anime, and manga — filterable in one place."
        />
      ) : null}

      {/* Loading skeletons (initial load) */}
      {isLoading ? (
        <div className="space-y-10">
          {["Movies", "TV Shows", "Anime"].map((section) => (
            <section key={section}>
              <SectionHeader title={section} className="animate-fade-in" />
              <SkeletonGrid count={6} />
            </section>
          ))}
        </div>
      ) : null}

      {/* Error state */}
      {hasError && !isLoading ? (
        <ErrorPanel
          icon={AlertCircle}
          tone="destructive"
          title="Search failed. Please try again."
          detail={query.error?.message}
          action={
            <button
              onClick={() => query.refetch()}
              className="rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white btn-press"
            >
              Try again
            </button>
          }
        />
      ) : null}

      {/* Results */}
      {!isLoading && !isIdle && data && !hasError ? (
        hasResults ? (
          <div className="space-y-10">
            {showMovies ? (
              <section>
                <SectionHeader title="Movies" count={data.movies.length} />
                <MediaGrid items={data.movies} />
              </section>
            ) : null}
            {showTv ? (
              <section>
                <SectionHeader title="TV Shows" count={data.tv.length} />
                <MediaGrid items={data.tv} />
              </section>
            ) : null}
            {showAnime ? (
              <section>
                <SectionHeader title="Anime" count={data.anime.length} />
                <MediaGrid items={data.anime} />
              </section>
            ) : null}
            {showManga ? (
              <section>
                <SectionHeader title="Manga" count={data.manga.length} />
                <MediaGrid items={data.manga} />
              </section>
            ) : null}
          </div>
        ) : (
          <EmptyState
            variant="panel"
            icon={SearchIcon}
            title={`No results for "${debounced}"${activeType !== "all" ? ` in ${activeType}` : ""}`}
            description='Try selecting "All Types" or a different search term.'
          />
        )
      ) : null}
    </div>
  );
}
