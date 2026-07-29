import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listLibrary } from "@/lib/library.functions";
import { MediaGrid } from "@/components/MediaCard";
import { EmptyState } from "@/components/EmptyState";
import { useGuest } from "@/lib/guest";
import type { WatchStatus, MediaSummary } from "@/lib/media-types";
import { Film, Eye, BookmarkPlus, CheckCircle2, Heart, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Library — NexusTrack" },
      { name: "description", content: "Everything you're tracking, filterable by status, type, and favorites." },
    ],
  }),
  component: Library,
});

function Library() {
  const { isGuest } = useGuest();
  const [status, setStatus] = useState<FilterStatus>("all");
  const [type, setType] = useState<MediaFilterType>("all");
  const fn = useServerFn(listLibrary);

  if (isGuest) {
    return (
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-6">Your library</h1>
        <EmptyState
          icon={Film}
          title="Sign in to build your library"
          description="Track what you watch, mark favorites, and never lose a title you loved."
          action={
            <Link to="/auth" className="inline-block rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white">
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  const q = useQuery({
    queryKey: ["library", status, type],
    queryFn: () => fn({
      data: {
        status: status !== "all" && status !== "favorites" ? (status as WatchStatus) : undefined,
        type: type !== "all" ? type : undefined,
        favorite: status === "favorites" ? true : undefined,
      },
    }),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const rows = q.data ?? [];
  const items: MediaSummary[] = rows.map((r) => {
    const m = r.media as unknown as {
      media_type: string; source: string; external_id: string; title: string;
      poster_url: string | null; release_year: number | null; vote_average: number | null;
    } | null;
    const rawSource = m?.source ?? "";
    const rawType = m?.media_type ?? "";
    return {
      external_id: m?.external_id ?? "",
      source: (rawSource === "tmdb" || rawSource === "anilist" ? rawSource : "tmdb") as "tmdb" | "anilist",
      media_type: (rawType === "movie" || rawType === "tv" || rawType === "anime" || rawType === "manga" ? rawType : "movie") as "movie" | "tv" | "anime" | "manga",
      title: m?.title ?? "Unknown",
      overview: null, poster_url: m?.poster_url ?? null, backdrop_url: null,
      release_year: m?.release_year ?? null, vote_average: m?.vote_average ?? null,
      genres: [], runtime: null, season_count: null, status: null,
    };
  }).filter((i) => i.external_id);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Your library</h1>
        <Link to="/search"
          className="inline-flex items-center gap-2 rounded-lg border border-border/30 bg-card/30 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors self-start">
          <Search className="h-4 w-4" /> Find something to watch
        </Link>
      </div>

      {/* Status filter pills */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {STATUSES.map((s) => {
          const active = status === s.key;
          return (
            <button key={s.key} onClick={() => setStatus(s.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all whitespace-nowrap",
                active
                  ? "bg-gradient-accent text-white shadow-md"
                  : "glass hover:bg-muted/40 text-muted-foreground",
              )}
            >
              <s.icon className="h-3.5 w-3.5" /> {s.label}
            </button>
          );
        })}
      </div>

      {/* Type filter pills */}
      <div className="mb-8 flex flex-wrap gap-1.5">
        {TYPES.map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] uppercase tracking-wider transition-colors",
              type === t
                ? "border-primary/40 bg-primary/10 text-primary font-medium"
                : "border-border/40 text-muted-foreground hover:bg-muted/30",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {q.isLoading && rows.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[2/3] rounded-xl bg-muted/40" />
              <div className="mt-2 h-3 w-3/4 rounded bg-muted/30" />
              <div className="mt-1 h-3 w-1/2 rounded bg-muted/20" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="glass rounded-2xl p-16 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-muted/40">
            <Film className="h-7 w-7 text-muted-foreground/60" />
          </div>
          <p className="text-base font-medium text-foreground/80">Your library is empty</p>
          <p className="mt-1 text-sm text-muted-foreground/70">Start by adding movies, shows, or anime you love.</p>
          <Link to="/search" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-gradient-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
            <Search className="h-4 w-4" /> Discover titles
          </Link>
        </div>
      ) : (
        <MediaGrid items={items} />
      )}
    </div>
  );
}
