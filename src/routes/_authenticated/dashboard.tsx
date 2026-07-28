import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { trending, discover } from "@/lib/tmdb.functions";
import { seasonalAnime } from "@/lib/anilist.functions";
import { listActivity } from "@/lib/activity.functions";
import { getStats, listLibrary } from "@/lib/library.functions";
import { MediaGrid } from "@/components/MediaCard";
import type { MediaSummary } from "@/lib/media-types";
import { AlertCircle, Film, Tv, Sparkles, TrendingUp, Clock, CheckCircle2, BookmarkIcon, Heart, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — NexusTrack" }, { name: "description", content: "Your personalized entertainment dashboard." }] }),
  component: Dashboard,
});

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Dashboard() {
  const [userName, setUserName] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId) return;
      supabase.from("profiles").select("display_name, username").eq("id", userId).single().then(({ data: profile }) => {
        if (profile?.display_name) setUserName(profile.display_name);
        else if (profile?.username) setUserName(profile.username);
      });
    });
  }, []);

  const trendingFn = useServerFn(trending);
  const discoverFn = useServerFn(discover);
  const seasonalFn = useServerFn(seasonalAnime);
  const statsFn = useServerFn(getStats);
  const libraryFn = useServerFn(listLibrary);
  const actFn = useServerFn(listActivity);

  // Trending — all types
  const trendingQ = useQuery({
    queryKey: ["trending"],
    queryFn: () => trendingFn({ data: { type: "all" } }),
    placeholderData: (prev) => prev,
    staleTime: 300_000,
    retry: 2,
  });

  // Popular movies
  const popularQ = useQuery({
    queryKey: ["popular-movies"],
    queryFn: () => discoverFn({ data: { type: "movie", category: "popular" } }),
    placeholderData: (prev) => prev,
    staleTime: 300_000,
    retry: 2,
  });

  // Seasonal anime
  const seasonalQ = useQuery({
    queryKey: ["seasonal-anime"],
    queryFn: () => seasonalFn(),
    placeholderData: (prev) => prev,
    staleTime: 300_000,
    retry: 2,
  });

  // Stats (for the stat cards)
  const statsQ = useQuery({
    queryKey: ["stats"],
    queryFn: () => statsFn(),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: 1,
  });

  // Continue watching (items marked as "watching" or "rewatching") — filter client-side
  const watchingQ = useQuery({
    queryKey: ["library", "all"],
    queryFn: () => libraryFn(),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    retry: 1,
  });

  // Friend activity
  const actQ = useQuery({
    queryKey: ["activity"],
    queryFn: () => actFn(),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: 1,
  });

  // Compute stats display values
  const stats = [
    { label: "In library", value: statsQ.data?.total, icon: Film },
    { label: "Completed", value: statsQ.data?.completed, icon: CheckCircle2 },
    { label: "Watching", value: statsQ.data?.watching, icon: Tv },
    { label: "Hours", value: statsQ.data?.hoursWatched, icon: Clock, suffix: "h" },
  ];

  const watchingItems: MediaSummary[] = (watchingQ.data ?? [])
    .filter((r) => r.status === "watching" || r.status === "rewatching")
    .slice(0, 6)
    .map((r) => {
      const m = r.media as unknown as { media_type: string; source: string; external_id: string; title: string; poster_url: string | null; release_year: number | null } | null;
      return {
        external_id: m?.external_id ?? "",
        source: (m?.source ?? "tmdb") as "tmdb" | "anilist" | "jikan",
        media_type: (m?.media_type ?? "movie") as "movie" | "tv" | "anime" | "manga",
        title: m?.title ?? "",
        overview: null,
        poster_url: m?.poster_url ?? null,
        backdrop_url: null,
        release_year: m?.release_year ?? null,
        vote_average: null,
        genres: [],
        runtime: null,
        season_count: null,
        status: null,
      };
    });
  const trendingItems = (trendingQ.data ?? []).slice(0, 12);
  const popularItems = (popularQ.data ?? []).slice(0, 12);
  const seasonalItems = (seasonalQ.data ?? []).slice(0, 12);

  return (
    <div>
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl md:text-4xl font-bold">Welcome back{userName ? `, ${userName}` : ""}.</h1>
        <p className="text-muted-foreground mt-1">Pick up where you left off, or find something new.</p>
      </div>

      {/* Stats row */}
      <div className="mb-10 grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in">
        {statsQ.isError ? (
          <div className="col-span-full text-center text-sm text-muted-foreground flex items-center justify-center gap-1">
            <AlertCircle className="h-4 w-4" /> Stats temporarily unavailable — run the SQL grant to fix
          </div>
        ) : (
          stats.map((s) => (
            <div key={s.label} className="glass rounded-xl p-3 text-center card-hover">
              <s.icon className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
              <div className="text-xl font-black text-accent">{statsQ.isLoading ? "…" : s.value ?? "—"}{s.suffix ?? ""}</div>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
            </div>
          ))
        )}
      </div>

      {/* Continue watching */}
      {watchingItems.length > 0 ? (
        <Section title="Continue watching" action={<Link to="/library" className="text-sm text-muted-foreground hover:text-foreground transition-colors">View all →</Link>}>
          <MediaGrid items={watchingItems} />
        </Section>
      ) : watchingQ.isLoading ? (
        <Section title="Continue watching">
          <SkeletonGrid count={3} />
        </Section>
      ) : (
        <Section title="Your library">
          <Link to="/search" className="glass rounded-xl p-8 text-center block hover:bg-muted/20 transition-colors">
            <p className="text-lg font-semibold mb-1">Nothing in your library yet</p>
            <p className="text-sm text-muted-foreground">Find something to watch and add it to your watchlist →</p>
          </Link>
        </Section>
      )}

      {/* Trending this week */}
      <Section title="Trending this week" action={<Link to="/discover" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Discover all →</Link>}>
        {trendingQ.isError ? (
          <div className="glass rounded-2xl p-12 text-center">
            <TrendingUp className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Trending content temporarily unavailable</p>
          </div>
        ) : trendingQ.isLoading ? (
          <SkeletonGrid />
        ) : (
          <MediaGrid items={trendingItems} />
        )}
      </Section>

      {/* Popular movies */}
      <Section title="Popular movies" action={<Link to="/discover" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Discover all →</Link>}>
        {popularQ.isError ? (
          <div className="glass rounded-2xl p-12 text-center">
            <Film className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Popular movies temporarily unavailable</p>
          </div>
        ) : popularQ.isLoading ? (
          <SkeletonGrid />
        ) : (
          <MediaGrid items={popularItems} />
        )}
      </Section>

      {/* Seasonal anime */}
      <Section title="Airing this season" action={<Link to="/discover" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Discover all →</Link>}>
        {seasonalQ.isError ? (
          <div className="glass rounded-2xl p-12 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Seasonal anime temporarily unavailable</p>
          </div>
        ) : seasonalQ.isLoading ? (
          <SkeletonGrid />
        ) : (
          <MediaGrid items={seasonalItems} />
        )}
      </Section>

      {/* Friend activity */}
      {actQ.isError ? null : actQ.isLoading ? (
        <Section title="Friend activity">
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass rounded-lg px-4 py-2.5 h-10 animate-pulse" />
            ))}
          </div>
        </Section>
      ) : actQ.data && actQ.data.length > 0 ? (
        <Section title="Friend activity">
          <div className="space-y-2">
            {actQ.data.slice(0, 10).map((a) => {
              const p = a.profile as unknown as { username: string; display_name: string } | undefined;
              const m = a.media as unknown as { title: string } | undefined;
              const name = p?.display_name || p?.username || "Someone";
              const kindText: Record<string, string> = {
                started: "started watching",
                completed: "completed",
                added: "added to watchlist",
                favorited: "favorited",
                rated: "rated",
                friend_joined: "joined NexusTrack",
              };
              const action = kindText[a.kind] || a.kind;
              return (
                <div key={a.id} className="glass rounded-lg px-4 py-2.5 text-sm flex items-center gap-2">
                  <span className="font-medium">{name}</span>
                  <span className="text-muted-foreground">{action}</span>
                  {m?.title ? <span className="text-accent font-medium">{m.title}</span> : null}
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-[2/3] rounded-xl glass animate-pulse" style={{ animationDelay: i * 100 + "ms" }} />
      ))}
    </div>
  );
}
