import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { trending, discover, getRecommendations } from "@/lib/tmdb.functions";
import { seasonalAnime } from "@/lib/jikan.functions";
import { listActivity } from "@/lib/activity.functions";
import { getStats, listLibrary } from "@/lib/library.functions";
import { MediaGrid } from "@/components/MediaCard";
import { Link } from "@tanstack/react-router";

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
  const trendingFn = useServerFn(trending);
  const discoverFn = useServerFn(discover);
  const seasonalFn = useServerFn(seasonalAnime);
  const statsFn = useServerFn(getStats);
  const libraryFn = useServerFn(listLibrary);
  const actFn = useServerFn(listActivity);
  const recsFn = useServerFn(getRecommendations);

  const trendingQ = useQuery({ queryKey: ["trending"], queryFn: () => trendingFn({ data: { type: "all" } }) });
  const popularQ = useQuery({ queryKey: ["popular-movies"], queryFn: () => discoverFn({ data: { type: "movie", category: "popular" } }) });
  const seasonalQ = useQuery({ queryKey: ["seasonal-anime"], queryFn: () => seasonalFn() });
  const statsQ = useQuery({ queryKey: ["stats"], queryFn: () => statsFn() });
  const watchingQ = useQuery({ queryKey: ["library-watching"], queryFn: () => libraryFn({ data: { status: "watching" } }) });
  const actQ = useQuery({ queryKey: ["activity"], queryFn: () => actFn() });

  // Get recommendations based on first completed item in library
  const completedItem = watchingQ.data?.find((r) => r.status === "completed");
  const firstMedia = completedItem?.media as unknown as { id: string; media_type: string; source: string; external_id: string } | undefined;
  const recsQ = useQuery({
    queryKey: ["recommendations", firstMedia?.media_type, firstMedia?.external_id],
    queryFn: () => recsFn({ data: { type: firstMedia!.media_type as "movie" | "tv", id: firstMedia!.external_id } }),
    enabled: !!firstMedia && firstMedia.source === "tmdb" && (firstMedia.media_type === "movie" || firstMedia.media_type === "tv"),
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold">Welcome back.</h1>
        <p className="text-muted-foreground mt-1">Pick up where you left off, or find something new.</p>
      </div>

      {/* Stats */}
      <div className="mb-10 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "In library", value: statsQ.data?.total ?? "—" },
          { label: "Completed", value: statsQ.data?.completed ?? "—" },
          { label: "Watching", value: statsQ.data?.watching ?? "—" },
          { label: "Anime", value: statsQ.data?.anime ?? "—" },
        ].map((s) => (
          <div key={s.label} className="glass rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-3xl font-bold text-gradient">{s.value}</div>
          </div>
        ))}
      </div>

      {watchingQ.data && watchingQ.data.length > 0 ? (
        <Section title="Continue watching" action={<Link to="/library" className="text-sm text-muted-foreground hover:text-foreground">View all →</Link>}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {watchingQ.data.slice(0, 6).map((r) => {
              const m = r.media as unknown as { id: string; media_type: string; title: string; poster_url: string | null };
              if (!m) return null;
              return (
                <div key={r.id} className="glass rounded-xl overflow-hidden">
                  <div className="aspect-[2/3] bg-muted">
                    {m.poster_url ? <img src={m.poster_url} alt={m.title} className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="p-2 text-xs font-medium line-clamp-1">{m.title}</div>
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      <Section title="Trending this week">
        {trendingQ.isLoading ? <SkeletonGrid /> : <MediaGrid items={(trendingQ.data ?? []).slice(0, 12)} />}
      </Section>

      <Section title="Popular movies">
        {popularQ.isLoading ? <SkeletonGrid /> : <MediaGrid items={(popularQ.data ?? []).slice(0, 12)} />}
      </Section>

      {recsQ.data && recsQ.data.length > 0 ? (
        <Section title="Because you watched">
          <MediaGrid items={recsQ.data.slice(0, 6)} />
        </Section>
      ) : null}

      <Section title="Airing this season">
        {seasonalQ.isLoading ? <SkeletonGrid /> : <MediaGrid items={(seasonalQ.data ?? []).slice(0, 12)} />}
      </Section>

      {actQ.data && actQ.data.length > 0 ? (
        <Section title="Friend activity">
          <div className="space-y-2">
            {actQ.data.slice(0, 8).map((a) => {
              const p = a.profile as unknown as { username: string; display_name: string } | undefined;
              const m = a.media as unknown as { title: string } | undefined;
              return (
                <div key={a.id} className="glass rounded-lg px-4 py-2.5 text-sm flex items-center gap-3">
                  <span className="font-medium">{p?.display_name || p?.username || "Someone"}</span>
                  <span className="text-muted-foreground">{a.kind}</span>
                  <span className="text-gradient font-medium">{m?.title}</span>
                </div>
              );
            })}
          </div>
        </Section>
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
