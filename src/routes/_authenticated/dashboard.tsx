import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { trending, discover } from "@/lib/tmdb.functions";
import { topAnime, topManga } from "@/lib/anilist.functions";
import { listActivity } from "@/lib/activity.functions";
import { getStats, listLibrary } from "@/lib/library.functions";
import { MediaGrid } from "@/components/MediaCard";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { PageHeader, SectionHeader } from "@/components/PageHeader";
import { Chip } from "@/components/FilterTabs";
import { StatCard } from "@/components/StatCard";
import { SkeletonGrid, SkeletonRow } from "@/components/Skeletons";
import { ErrorPanel } from "@/components/ErrorPanel";
import type { MediaSummary } from "@/lib/media-types";
import { AlertCircle, Film, Tv, TrendingUp, CheckCircle2, BookmarkIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — NexusTrack" }, { name: "description", content: "Your personalized entertainment dashboard." }] }),
  errorComponent: RouteErrorBoundary,
  component: Dashboard,
});

type MediaType = "all" | "movie" | "tv" | "anime" | "manga";
const TYPE_FILTERS: { key: MediaType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "movie", label: "Movies" },
  { key: "tv", label: "TV" },
  { key: "anime", label: "Anime" },
  { key: "manga", label: "Manga" },
];

const KIND_TEXT: Record<string, string> = {
  started: "started watching", completed: "completed", added: "added to watchlist",
  favorited: "favorited", rated: "rated", friend_joined: "joined NexusTrack",
};

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <SectionHeader title={title} action={action} />
      {children}
    </section>
  );
}

function Dashboard() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const [userName, setUserName] = useState<string | null>(null);
  const [trendingType, setTrendingType] = useState<MediaType>("all");
  const [popularType, setPopularType] = useState<MediaType>("all");

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
  const topAnimeFn = useServerFn(topAnime);
  const topMangaFn = useServerFn(topManga);
  const statsFn = useServerFn(getStats);
  const libraryFn = useServerFn(listLibrary);
  const actFn = useServerFn(listActivity);

  // Stats
  const statsQ = useQuery({
    queryKey: ["stats"],
    queryFn: () => statsFn(),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: 1,
  });

  // Watching
  const watchingQ = useQuery({
    queryKey: ["library", "all"],
    queryFn: () => libraryFn(),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    retry: 1,
  });

  // Trending (type-filtered)
  const trendingQ = useQuery({
    queryKey: ["dashboard-trending", trendingType],
    queryFn: async () => {
      if (trendingType === "anime") return (await topAnimeFn({ data: { page: 1 } })).slice(0, 12);
      if (trendingType === "manga") return (await topMangaFn({ data: { page: 1, type: "top" } })).slice(0, 12);
      return ((await trendingFn({ data: { type: trendingType === "all" ? "all" : trendingType as "movie" | "tv" } })) ?? []).slice(0, 12);
    },
    placeholderData: (prev) => prev,
    staleTime: 300_000,
    retry: 2,
  });

  // Popular (type-filtered)
  const popularQ = useQuery({
    queryKey: ["dashboard-popular", popularType],
    queryFn: async () => {
      if (popularType === "anime") return (await topAnimeFn({ data: { page: 1 } })).slice(0, 12);
      if (popularType === "manga") return (await topMangaFn({ data: { page: 1, type: "popular" } })).slice(0, 12);
      return ((await discoverFn({ data: { type: popularType === "all" ? "movie" : popularType as "movie" | "tv", category: "popular" } })) ?? []).slice(0, 12);
    },
    placeholderData: (prev) => prev,
    staleTime: 300_000,
    retry: 2,
  });

  // Activity
  const actQ = useQuery({
    queryKey: ["activity"],
    queryFn: () => actFn(),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: 1,
  });

  const stats = [
    { label: "In library", value: statsQ.data?.total, icon: Film },
    { label: "Planned", value: statsQ.data?.planned, icon: BookmarkIcon },
    { label: "Watching", value: statsQ.data?.watching, icon: Tv },
    { label: "Completed", value: statsQ.data?.completed, icon: CheckCircle2 },
  ];

  // Row shape returned by the watching query (user_media joined with media).
  interface WatchingRow {
    status: string;
    hidden: boolean;
    media: { media_type: string; source: string; external_id: string; title: string; poster_url: string | null; release_year: number | null } | null;
  }
  const watchingItems: MediaSummary[] = ((watchingQ.data ?? []) as WatchingRow[])
    .filter((r) => (r.status === "watching" || r.status === "rewatching") && !r.hidden)
    .slice(0, 6)
    .map((r) => {
      const m = r.media;
      return {
        external_id: m?.external_id ?? "",
        source: (m?.source ?? "tmdb") as "tmdb" | "anilist" | "jikan" | "kitsu",
        media_type: (m?.media_type ?? "movie") as "movie" | "tv" | "anime" | "manga",
        title: m?.title ?? "",
        overview: null, poster_url: m?.poster_url ?? null, backdrop_url: null,
        release_year: m?.release_year ?? null, vote_average: null, genres: [], runtime: null, season_count: null, status: null,
      };
    });

  return (
    <div>
      <PageHeader
        title={`Welcome back${userName ? `, ${userName}` : ""}.`}
        description="Pick up where you left off, or find something new."
      />

      {/* Stats */}
      <div className="mb-10 grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in">
        {statsQ.isError ? (
          <ErrorPanel
            icon={AlertCircle}
            title="Stats temporarily unavailable"
            className="col-span-full !p-6"
          />
        ) : (
          stats.map((s) => (
            <StatCard
              key={s.label}
              icon={s.icon}
              label={s.label}
              value={s.value}
              loading={statsQ.isLoading}
            />
          ))
        )}
      </div>

      {/* Continue watching */}
      {watchingItems.length > 0 ? (
        <Section title="Continue watching" action={<Link to="/library" className="text-sm text-muted-foreground hover:text-foreground transition-colors">View all →</Link>}>
          <MediaGrid items={watchingItems} />
        </Section>
      ) : watchingQ.isLoading ? (
        <Section title="Continue watching"><SkeletonGrid count={3} /></Section>
      ) : (
        <Section title="Your library">
          <Link to="/search" className="glass rounded-xl p-8 text-center block hover:bg-muted/20 transition-colors">
            <p className="text-lg font-semibold mb-1">Nothing in your library yet</p>
            <p className="text-sm text-muted-foreground">Find something to watch and add it to your watchlist →</p>
          </Link>
        </Section>
      )}

      {/* Trending */}
      <Section title="Trending" action={<Link to="/discover" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Discover all →</Link>}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map(({ key, label }) => (
            <Chip key={key} active={trendingType === key} onClick={() => setTrendingType(key)}>
              {label}
            </Chip>
          ))}
        </div>
        {trendingQ.isError ? (
          <ErrorPanel icon={TrendingUp} title="Trending content temporarily unavailable" />
        ) : trendingQ.isLoading ? <SkeletonGrid count={12} />
        : (trendingQ.data ?? []).length === 0 ? (
          <ErrorPanel icon={TrendingUp} title="No content available" />
        ) : <MediaGrid items={trendingQ.data ?? []} />}
      </Section>

      {/* Popular */}
      <Section title="Popular" action={<Link to="/discover" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Discover all →</Link>}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map(({ key, label }) => (
            <Chip key={key} active={popularType === key} onClick={() => setPopularType(key)}>
              {label}
            </Chip>
          ))}
        </div>
        {popularQ.isError ? (
          <ErrorPanel icon={Film} title="Popular content temporarily unavailable" />
        ) : popularQ.isLoading ? <SkeletonGrid count={12} />
        : (popularQ.data ?? []).length === 0 ? (
          <ErrorPanel icon={Film} title="No content available" />
        ) : <MediaGrid items={popularQ.data ?? []} />}
      </Section>

      {/* Activity */}
      {actQ.isError ? null : actQ.isLoading ? (
        <Section title="Friend activity">
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        </Section>
      ) : actQ.data && actQ.data.length > 0 ? (
        <Section title="Friend activity">
          <div className="space-y-2">
            {((actQ.data ?? []) as Array<{
              id: string;
              kind: string;
              user_id: string;
              created_at: string;
              profile?: { username: string; display_name: string; avatar_url: string | null };
              media: { id: string; title: string; media_type: string; source: string; external_id: string } | null;
            }>).slice(0, 10).map((a) => {
              const p = a.profile;
              const m = a.media;
              const name = p?.display_name || p?.username || "Someone";
              const isMe = a.user_id === user?.id;
              const action = KIND_TEXT[a.kind] || a.kind;
              const canLinkMedia = !!m?.title && !!m.media_type && !!m.source && !!m.external_id;
              return (
                <div key={a.id} className="glass rounded-lg px-3 py-2.5 text-sm flex items-center gap-2.5 min-w-0">
                  {/* Avatar */}
                  {p?.avatar_url ? (
                    <img src={p.avatar_url} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-accent text-[10px] font-bold text-white">
                      {(isMe ? "Y" : name).charAt(0).toUpperCase()}
                    </div>
                  )}
                  {/* Name + action + title */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {isMe ? (
                        <span className="font-medium">You</span>
                      ) : (
                        <Link to="/user/$username" params={{ username: p?.username ?? "" }} className="font-medium transition-colors hover:text-primary">
                          {name}
                        </Link>
                      )}{" "}
                      <span className="text-muted-foreground">{action}</span>
                    </p>
                    {m?.title ? (
                      canLinkMedia ? (
                        <Link to="/media/$type/$source/$id" params={{ type: m.media_type, source: m.source, id: m.external_id }} className="block truncate text-accent font-medium transition-colors hover:underline">
                          {m.title}
                        </Link>
                      ) : (
                        <span className="block truncate text-accent font-medium">{m.title}</span>
                      )
                    ) : null}
                  </div>
                  {/* Relative time */}
                  <time className="shrink-0 text-[10px] text-muted-foreground/70" title={new Date(a.created_at).toLocaleString()}>
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </time>
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

