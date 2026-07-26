import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listLibrary } from "@/lib/library.functions";
import { MediaGrid } from "@/components/MediaCard";
import type { WatchStatus, MediaSummary } from "@/lib/media-types";

const STATUSES = ["all", "watching", "completed", "planned", "favorites"] as const;
const TYPES = ["all", "movie", "tv", "anime"] as const;
type FilterStatus = (typeof STATUSES)[number];
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
  const [status, setStatus] = useState<FilterStatus>("all");
  const [type, setType] = useState<MediaFilterType>("all");
  const fn = useServerFn(listLibrary);

  const q = useQuery({
    queryKey: ["library", status, type],
    queryFn: () =>
      fn({
        data: {
          status: status !== "all" && status !== "favorites" ? (status as WatchStatus) : undefined,
          type: type !== "all" ? type : undefined,
          favorite: status === "favorites" ? true : undefined,
        },
      }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const rows = q.data ?? [];
  const items: MediaSummary[] = rows.map((r) => {
    const m = r.media as unknown as {
      media_type: string;
      source: string;
      external_id: string;
      title: string;
      poster_url: string | null;
      release_year: number | null;
      vote_average: number | null;
    } | null;
    const rawSource = m?.source ?? "";
    const rawType = m?.media_type ?? "";
    return {
      external_id: m?.external_id ?? "",
      source: (rawSource === "tmdb" || rawSource === "anilist" || rawSource === "jikan" ? rawSource : "tmdb") as "tmdb" | "anilist" | "jikan",
      media_type: (rawType === "movie" || rawType === "tv" || rawType === "anime" ? rawType : "movie") as "movie" | "tv" | "anime",
      title: m?.title ?? "Unknown",
      overview: null,
      poster_url: m?.poster_url ?? null,
      backdrop_url: null,
      release_year: m?.release_year ?? null,
      vote_average: m?.vote_average ?? null,
      genres: [],
      runtime: null,
      season_count: null,
      status: null,
    };
  }).filter((i) => i.external_id);

  return (
    <div>
      <h1 className="text-3xl md:text-4xl font-bold mb-6">Your library</h1>

      {/* Status filter pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 capitalize ${
              status === s ? "bg-gradient-accent text-white shadow-md" : "glass hover:bg-muted/40"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Type filter pills */}
      <div className="mb-8 flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wider transition-colors capitalize ${
              type === t
                ? "border-primary/50 bg-primary/20 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/40"
            }`}
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
              <div className="aspect-[2/3] rounded-xl glass" />
              <div className="mt-2 h-3 w-3/4 rounded bg-muted" />
              <div className="mt-1 h-3 w-1/2 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <p className="text-muted-foreground">Nothing here yet.</p>
          <Link
            to="/search"
            className="mt-4 inline-block rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white"
          >
            Find something to watch
          </Link>
        </div>
      ) : (
        <MediaGrid items={items} />
      )}
    </div>
  );
}