import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { discover, trending } from "@/lib/tmdb.functions";
import { topAnime, seasonalAnime } from "@/lib/jikan.functions";
import { MediaGrid } from "@/components/MediaCard";

const TABS = [
  { id: "trending", label: "Trending" },
  { id: "movies-popular", label: "Popular Movies" },
  { id: "movies-top", label: "Top Rated Movies" },
  { id: "movies-upcoming", label: "Upcoming" },
  { id: "tv-popular", label: "Popular TV" },
  { id: "tv-top", label: "Top TV" },
  { id: "tv-airing", label: "Airing Now" },
  { id: "anime-top", label: "Top Anime" },
  { id: "anime-seasonal", label: "Seasonal Anime" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({ meta: [{ title: "Discover — NexusTrack" }, { name: "description", content: "Discover trending, popular, top-rated, and upcoming across movies, TV, and anime." }] }),
  component: Discover,
});

function Discover() {
  const [tab, setTab] = useState<TabId>("trending");
  const trendingFn = useServerFn(trending);
  const discoverFn = useServerFn(discover);
  const topAnimeFn = useServerFn(topAnime);
  const seasonalFn = useServerFn(seasonalAnime);

  const q = useQuery({
    queryKey: ["discover", tab],
    queryFn: () => {
      switch (tab) {
        case "trending": return trendingFn({ data: { type: "all" } });
        case "movies-popular": return discoverFn({ data: { type: "movie", category: "popular" } });
        case "movies-top": return discoverFn({ data: { type: "movie", category: "top_rated" } });
        case "movies-upcoming": return discoverFn({ data: { type: "movie", category: "upcoming" } });
        case "tv-popular": return discoverFn({ data: { type: "tv", category: "popular" } });
        case "tv-top": return discoverFn({ data: { type: "tv", category: "top_rated" } });
        case "tv-airing": return discoverFn({ data: { type: "tv", category: "on_the_air" } });
        case "anime-top": return topAnimeFn();
        case "anime-seasonal": return seasonalFn();
      }
    },
  });

  return (
    <div>
      <h1 className="text-3xl md:text-4xl font-bold mb-6">Discover</h1>
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${tab === t.id ? "bg-gradient-accent text-white" : "glass hover:bg-muted/40"}`}
          >{t.label}</button>
        ))}
      </div>
      {q.isLoading ? <p className="text-muted-foreground">Loading…</p> : <MediaGrid items={q.data ?? []} />}
    </div>
  );
}
