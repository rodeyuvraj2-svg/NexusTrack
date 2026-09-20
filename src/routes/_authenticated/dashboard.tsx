import { createFileRoute, Link, redirect, useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { trending, discover } from "@/lib/tmdb.functions";
import { topAnime, topManga } from "@/lib/anilist.functions";
import { mixedFeed } from "@/lib/feed.functions";
import { listActivity } from "@/lib/activity.functions";
import { getStats, getContinueWatching } from "@/lib/library.functions";
import type { ContinueWatchingRow } from "@/lib/progress-utils";
import type { MediaSummary } from "@/lib/media-types";
import { MediaGrid } from "@/components/MediaCard";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { PageHeader, SectionHeader } from "@/components/PageHeader";
import { Chip } from "@/components/FilterTabs";
import { StatCard } from "@/components/StatCard";
import { SkeletonGrid, SkeletonRow } from "@/components/Skeletons";
import { ErrorPanel } from "@/components/ErrorPanel";
import { EmptyState } from "@/components/EmptyState";
import { ContinueProgressCard, ContinueCardSkeleton } from "@/components/ContinueWatching";
import { loadGuestState } from "@/lib/guest";
import {
  AlertCircle,
  Film,
  Tv,
  TrendingUp,
  CheckCircle2,
  BookmarkIcon,
  Compass,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: () => {
    if (loadGuestState()) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({
    meta: [
      { title: "Dashboard — NexusTrack" },
      { name: "description", content: "Your personalized entertainment dashboard." },
    ],
  }),
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
  started: "started watching",
  completed: "completed",
  added: "added to watchlist",
  favorited: "favorited",
  rated: "rated",
  friend_joined: "joined NexusTrack",
};

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
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
      supabase
        .from("profiles")
        .select("display_name, username")
        .eq("id", userId)
        .single()
        .then(({ data: profile }) => {
          if (profile?.display_name) setUserName(profile.display_name);
          else if (profile?.username) setUserName(profile.username);
        });
    });
  }, []);

  const trendingFn = useServerFn(trending);
  const discoverFn = useServerFn(discover);
  const topAnimeFn = useServerFn(topAnime);
  const topMangaFn = useServerFn(topManga);
  const mixedFeedFn = useServerFn(mixedFeed);
  const statsFn = useServerFn(getStats);
  const continueFn = useServerFn(getContinueWatching);
  const actFn = useServerFn(listActivity);

  // Stats
  const statsQ = useQuery({
    queryKey: ["stats"],
    queryFn: () => statsFn(),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: 1,
  });

  // Continue watching / reading — progress-aware rows (server-side filtered
  // to visible watching/rewatching non-movie titles, newest progress first).
  // staleTime 0: this feed changes with every progress/status save, so it
  // refetches on every dashboard mount instead of showing a stale list.
  const continueQ = useQuery({
    queryKey: ["continue-watching"],
    queryFn: () => continueFn(),
    placeholderData: (prev) => prev,
    staleTime: 0,
    retry: 1,
  });

  // Trending (type-filtered). "All" is a real balanced mix of trending
  // movies, TV, anime, and manga — not movies wearing an "All" label.
  // For the mixed feed we keep the whole result so `missing` (providers
  // that returned nothing) can drive a partial-results note.
  const trendingQ = useQuery({
    queryKey: ["dashboard-trending", trendingType],
    queryFn: async (): Promise<{ items: MediaSummary[]; missing: string[] }> => {
      if (trendingType === "all") {
        const feed = await mixedFeedFn({ data: { mode: "trending" } });
        return { ...feed, items: feed.items.slice(0, 12) };
      }
      if (trendingType === "anime")
        return {
          items: (await topAnimeFn({ data: { page: 1, sort: "trending" } })).slice(0, 12),
          missing: [],
        };
      if (trendingType === "manga")
        return {
          items: (await topMangaFn({ data: { page: 1, type: "trending" } })).slice(0, 12),
          missing: [],
        };
      return {
        items: (
          (await trendingFn({
            data: { type: trendingType as "movie" | "tv" },
          })) ?? []
        ).slice(0, 12),
        missing: [],
      };
    },
    placeholderData: (prev) => prev,
    staleTime: 300_000,
    retry: 2,
  });

  // Popular (type-filtered). Same rule: "All" is a balanced mix from all
  // four sources; individual types hit their real long-term-popularity
  // rankings (TMDB popular / AniList POPULARITY_DESC).
  const popularQ = useQuery({
    queryKey: ["dashboard-popular", popularType],
    queryFn: async (): Promise<{ items: MediaSummary[]; missing: string[] }> => {
      if (popularType === "all") {
        const feed = await mixedFeedFn({ data: { mode: "popular" } });
        return { ...feed, items: feed.items.slice(0, 12) };
      }
      if (popularType === "anime")
        return {
          items: (await topAnimeFn({ data: { page: 1, sort: "popular" } })).slice(0, 12),
          missing: [],
        };
      if (popularType === "manga")
        return {
          items: (await topMangaFn({ data: { page: 1, type: "popular" } })).slice(0, 12),
          missing: [],
        };
      return {
        items: (
          (await discoverFn({
            data: { type: popularType as "movie" | "tv", category: "popular" },
          })) ?? []
        ).slice(0, 12),
        missing: [],
      };
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

  const continueItems = (continueQ.data ?? []) as ContinueWatchingRow[];

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back${userName ? `, ${userName}` : ""}.`}
        description="Pick up where you left off, or find something new."
        actions={
          <Link
            to="/discover"
            className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-50 transition-colors hover:bg-violet-500/15"
          >
            <Compass className="h-4 w-4" />
            Discover
          </Link>
        }
      />

      <div className="rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,0.16),_transparent_26%),linear-gradient(135deg,color-mix(in_oklab,var(--card)_86%,transparent),color-mix(in_oklab,var(--muted)_72%,transparent))] p-4 shadow-[0_18px_42px_rgba(15,23,42,0.18)] md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Your library
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-foreground">
              Keep your stories moving.
            </h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1.5">
              {statsQ.data?.watching ?? 0} watching
            </span>
            <span className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1.5">
              {statsQ.data?.completed ?? 0} completed
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4 animate-fade-in">
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

      {/* Continue watching / reading */}
      <Section
        title="Continue watching & reading"
        action={
          continueItems.length > 0 ? (
            <Link
              to="/library"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              View library →
            </Link>
          ) : undefined
        }
      >
        {continueQ.isLoading ? (
          // Skeletons shaped like the final cards
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <ContinueCardSkeleton key={i} />
            ))}
          </div>
        ) : continueQ.isError ? (
          <ErrorPanel
            icon={AlertCircle}
            title="Couldn't load your in-progress titles"
            detail="Your progress is safe — this is just a loading problem."
            action={
              <button
                onClick={() => continueQ.refetch()}
                className="rounded-lg bg-gradient-accent px-4 py-2 text-sm font-semibold text-white"
              >
                Try again
              </button>
            }
          />
        ) : continueItems.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="Nothing in progress"
            description="Start a show, anime, or manga and it will appear here."
            variant="panel"
            action={
              <Link
                to="/discover"
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
              >
                <Compass className="h-4 w-4" /> Discover something new
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {continueItems.slice(0, 6).map((row) => (
              <ContinueProgressCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </Section>

      {/* Trending */}
      <Section
        title="Trending"
        action={
          <Link
            to="/discover"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Discover all →
          </Link>
        }
      >
        <p className="mb-3 text-xs text-muted-foreground">
          {trendingType === "all"
            ? "What's moving right now — a mix of movies, TV, anime, and manga."
            : trendingType === "anime" || trendingType === "manga"
              ? "Trending now on AniList."
              : "Trending this week on TMDB."}
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map(({ key, label }) => (
            <Chip key={key} active={trendingType === key} onClick={() => setTrendingType(key)}>
              {label}
            </Chip>
          ))}
        </div>
        {trendingQ.data && trendingQ.data.missing.length > 0 ? (
          <p className="mb-3 text-xs text-muted-foreground/80">
            Some sources are unavailable right now — showing the rest.
          </p>
        ) : null}
        {trendingQ.isError ? (
          <ErrorPanel icon={TrendingUp} title="Trending content temporarily unavailable" />
        ) : trendingQ.isLoading ? (
          <SkeletonGrid count={12} />
        ) : (trendingQ.data?.items ?? []).length === 0 ? (
          <ErrorPanel icon={TrendingUp} title="No content available" />
        ) : (
          <MediaGrid items={trendingQ.data?.items ?? []} limit={12} />
        )}
      </Section>

      {/* Popular */}
      <Section
        title="Popular"
        action={
          <Link
            to="/discover"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Discover all →
          </Link>
        }
      >
        <p className="mb-3 text-xs text-muted-foreground">
          {popularType === "all"
            ? "All-time favorites — a mix of movies, TV, anime, and manga."
            : popularType === "anime" || popularType === "manga"
              ? "Most-popular on AniList."
              : "Most-watched on TMDB."}
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map(({ key, label }) => (
            <Chip key={key} active={popularType === key} onClick={() => setPopularType(key)}>
              {label}
            </Chip>
          ))}
        </div>
        {popularQ.data && popularQ.data.missing.length > 0 ? (
          <p className="mb-3 text-xs text-muted-foreground/80">
            Some sources are unavailable right now — showing the rest.
          </p>
        ) : null}
        {popularQ.isError ? (
          <ErrorPanel icon={Film} title="Popular content temporarily unavailable" />
        ) : popularQ.isLoading ? (
          <SkeletonGrid count={12} />
        ) : (popularQ.data?.items ?? []).length === 0 ? (
          <ErrorPanel icon={Film} title="No content available" />
        ) : (
          <MediaGrid items={popularQ.data?.items ?? []} limit={12} />
        )}
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
            {(
              (actQ.data ?? []) as Array<{
                id: string;
                kind: string;
                user_id: string;
                created_at: string;
                profile?: { username: string; display_name: string; avatar_url: string | null };
                media: {
                  id: string;
                  title: string;
                  media_type: string;
                  source: string;
                  external_id: string;
                } | null;
              }>
            )
              .slice(0, 10)
              .map((a) => {
                const p = a.profile;
                const m = a.media;
                const name = p?.display_name || p?.username || "Someone";
                const isMe = a.user_id === user?.id;
                const action = KIND_TEXT[a.kind] || a.kind;
                const canLinkMedia = !!m?.title && !!m.media_type && !!m.source && !!m.external_id;
                return (
                  <div
                    key={a.id}
                    className="glass rounded-lg px-3 py-2.5 text-sm flex items-center gap-2.5 min-w-0"
                  >
                    {/* Avatar */}
                    {p?.avatar_url ? (
                      <img
                        src={p.avatar_url}
                        alt=""
                        loading="lazy"
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
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
                          <Link
                            to="/user/$username"
                            params={{ username: p?.username ?? "" }}
                            className="font-medium transition-colors hover:text-primary"
                          >
                            {name}
                          </Link>
                        )}{" "}
                        <span className="text-muted-foreground">{action}</span>
                      </p>
                      {m?.title ? (
                        canLinkMedia ? (
                          <Link
                            to="/media/$type/$source/$id"
                            params={{ type: m.media_type, source: m.source, id: m.external_id }}
                            className="block truncate text-accent font-medium transition-colors hover:underline"
                          >
                            {m.title}
                          </Link>
                        ) : (
                          <span className="block truncate text-accent font-medium">{m.title}</span>
                        )
                      ) : null}
                    </div>
                    {/* Relative time */}
                    <time
                      className="shrink-0 text-[10px] text-muted-foreground/70"
                      title={new Date(a.created_at).toLocaleString()}
                    >
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
