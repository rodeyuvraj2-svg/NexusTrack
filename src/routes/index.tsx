import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  Compass,
  Film,
  Library,
  PlayCircle,
  Sparkles,
  TrendingUp,
  Tv,
  Users,
} from "lucide-react";
import { FloatingNav } from "@/components/FloatingNav";
import { MediaRail } from "@/components/MediaCard";
import { mixedFeed } from "@/lib/feed.functions";
import { useGuest } from "@/lib/guest";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "NexusTrack — Track Every Story" },
      {
        name: "description",
        content:
          "Track movies, TV shows, anime, and manga in one place. Discover something new, keep your progress organized, and build your personal entertainment library.",
      },
      { property: "og:title", content: "NexusTrack — Track Every Story" },
      {
        property: "og:description",
        content: "Movies & TV, anime, and manga — one library, every screen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

type MediaType = "movie" | "tv" | "anime" | "manga";

const CATEGORIES: { type: MediaType; label: string; desc: string; Icon: typeof Film }[] = [
  { type: "movie", label: "Movies", desc: "Blockbusters to hidden gems", Icon: Film },
  { type: "tv", label: "TV Shows", desc: "Series worth your evenings", Icon: Tv },
  { type: "anime", label: "Anime", desc: "This season and all-time", Icon: Sparkles },
  { type: "manga", label: "Manga", desc: "Chapters to binge", Icon: BookOpen },
];

const PILLARS: { title: string; body: string; Icon: typeof Film }[] = [
  {
    title: "Track your progress",
    body: "Pick up exactly where you left off with season- and episode-level tracking.",
    Icon: PlayCircle,
  },
  {
    title: "Organize your library",
    body: "Watching, completed, planned, dropped — one tidy home for everything.",
    Icon: Library,
  },
  {
    title: "Discover what's next",
    body: "Trending and popular titles across movies, TV, anime, and manga.",
    Icon: Compass,
  },
  {
    title: "Connect with friends",
    body: "See what friends are into and copy any title straight to your list.",
    Icon: Users,
  },
];

function Landing() {
  const navigate = useNavigate();
  const { isGuest, enableGuest } = useGuest();

  // Shared with FloatingNav's ["session-present"] cache — no duplicate request.
  const { data: sessionPresent } = useQuery({
    queryKey: ["session-present"],
    queryFn: async () => !!(await supabase.auth.getSession()).data.session,
    staleTime: 30_000,
  });
  const authed = !!sessionPresent;

  // Real trending data — the same server feed the dashboard uses.
  const trendingFn = useServerFn(mixedFeed);
  const trendingQ = useQuery({
    queryKey: ["landing-trending"],
    queryFn: () => trendingFn({ data: { mode: "trending", page: 1 } }),
    staleTime: 5 * 60_000,
  });
  const trending = trendingQ.data?.items ?? [];

  // Discover is public browsing — a fresh visitor becomes a guest first so the
  // protected-route guard admits them.
  function goDiscover(type?: MediaType) {
    if (!authed && !isGuest) enableGuest();
    navigate({ to: "/discover", search: type ? { type } : {} });
  }

  return (
    <div className="min-h-screen bg-background">
      <FloatingNav mode="landing" />

      <main className="pt-[calc(var(--topbar-h)+1rem)] lg:pt-24">
        {/* ── HERO ── */}
        <section className="px-4">
          <div className="hero-gradient relative mx-auto flex min-h-[78vh] max-h-[760px] max-w-6xl flex-col items-center justify-center overflow-hidden rounded-3xl border border-[var(--hero-border)] px-5 py-16 text-center sm:px-8 sm:py-20 lg:min-h-[min(78vh,700px)] lg:px-10 lg:py-24">
            <span
              className="animate-hero-fade-in inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--hero-border)] px-3.5 py-1.5 text-center text-[11px] font-semibold uppercase leading-5 tracking-[0.12em] text-[var(--hero-muted)] sm:px-4 sm:text-xs sm:tracking-[0.18em]"
              style={{ animationDelay: "0s" }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.8)]"
                aria-hidden="true"
              />
              Movies, TV Shows, Anime — All in one place
            </span>

            <h1
              className="animate-hero-fade-in mt-7 text-5xl font-black leading-[0.98] tracking-tight text-[var(--hero-fg)] sm:text-6xl md:text-7xl lg:text-7xl xl:text-8xl"
              style={{ animationDelay: "0.08s" }}
            >
              <span className="block">Track Every</span>
              <span className="block text-[var(--hero-accent)]">Story.</span>
            </h1>

            <p
              className="animate-hero-fade-in mx-auto mt-6 max-w-xl px-1 text-base leading-relaxed text-[var(--hero-muted)] sm:text-lg"
              style={{ animationDelay: "0.16s" }}
            >
              Track movies, TV shows, anime, and manga. Discover something new, keep your progress
              organized, and build your personal entertainment library.
            </p>

            <p
              className="animate-hero-fade-in mt-5 text-xs font-medium uppercase tracking-[0.16em] text-[var(--hero-muted)] sm:text-sm sm:tracking-[0.2em]"
              style={{ animationDelay: "0.22s" }}
            >
              Movies &amp; TV • Anime • Manga
            </p>

            <div
              className="animate-hero-fade-in mt-10 flex w-full flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: "0.3s" }}
            >
              <button
                onClick={() => goDiscover()}
                className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-slate-900 shadow-lg transition-all hover:bg-white/90 btn-press sm:w-auto sm:px-8 sm:py-4"
              >
                Start Exploring
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              {authed ? (
                <Link
                  to="/dashboard"
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[var(--hero-border)] px-7 py-3.5 text-base font-medium text-[var(--hero-fg)] transition-colors hover:bg-white/10 btn-press sm:w-auto sm:px-8 sm:py-4"
                >
                  Open your dashboard
                </Link>
              ) : (
                <Link
                  to="/auth"
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[var(--hero-border)] px-7 py-3.5 text-base font-medium text-[var(--hero-fg)] transition-colors hover:bg-white/10 btn-press sm:w-auto sm:px-8 sm:py-4"
                >
                  Sign in to track your library
                </Link>
              )}
            </div>

            <div
              className="animate-hero-fade-in mt-14 flex flex-col items-center gap-1 text-[var(--hero-muted)]"
              style={{ animationDelay: "0.4s" }}
            >
              <span className="text-xs uppercase tracking-widest">Scroll to explore</span>
              <ChevronDown className="animate-scroll-cue h-4 w-4" />
            </div>
          </div>
        </section>

        {/* ── TRENDING NOW (real data) ── */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <SectionHeading
            eyebrow="Trending now"
            EyebrowIcon={TrendingUp}
            title="What everyone's watching"
            subtitle="Live picks across every category — tap any title to see the details."
          />
          {trendingQ.isLoading ? (
            <RailSkeleton />
          ) : trending.length > 0 ? (
            <MediaRail items={trending} />
          ) : null}
        </section>

        {/* ── DISCOVER CATEGORIES ── */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <SectionHeading
            eyebrow="Browse by category"
            EyebrowIcon={Compass}
            title="Start where your taste lives"
            subtitle="Jump straight into a curated feed for each kind of story."
          />
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {CATEGORIES.map(({ type, label, desc, Icon }) => (
              <button
                key={type}
                onClick={() => goDiscover(type)}
                className="surface group flex flex-col items-start gap-3 rounded-2xl p-5 text-left transition-all hover:-translate-y-1 hover:border-primary/30"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-foreground">{label}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
                </div>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  Explore
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ── TRACK YOUR WORLD ── */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <SectionHeading
            eyebrow="Track your world"
            EyebrowIcon={Sparkles}
            title="Everything in one organized place"
            subtitle="The essentials of a great tracker, designed to stay out of your way."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map(({ title, body, Icon }) => (
              <div key={title} className="surface rounded-2xl p-6">
                <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-base font-bold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-4 md:pb-28">
          <div className="surface-lg relative overflow-hidden rounded-3xl px-6 py-16 text-center md:py-20">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-accent/8" />
            <div className="relative">
              <h2 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
                {authed ? "Your library is waiting." : "Build your library today."}
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
                {authed
                  ? "Jump back into your dashboard and pick up where you left off."
                  : "Create a free account to save progress, follow friends, and keep everything in sync."}
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                {authed ? (
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-accent px-8 py-4 text-base font-semibold text-white shadow-md transition-shadow hover:shadow-lg btn-press"
                  >
                    Open your dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/auth"
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-accent px-8 py-4 text-base font-semibold text-white shadow-md transition-shadow hover:shadow-lg btn-press"
                    >
                      Create your library
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                      to="/auth"
                      className="inline-flex items-center gap-2 rounded-full border border-border px-8 py-4 text-base font-medium text-foreground transition-colors hover:bg-muted btn-press"
                    >
                      Sign in
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

// ─── Section heading (eyebrow + title + subtitle) ──────────────────────────────

function SectionHeading({
  eyebrow,
  EyebrowIcon,
  title,
  subtitle,
}: {
  eyebrow: string;
  EyebrowIcon: typeof Film;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="max-w-2xl">
      <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary">
        <EyebrowIcon className="h-3.5 w-3.5" />
        {eyebrow}
      </span>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground md:text-3xl">
        {title}
      </h2>
      {subtitle ? <p className="mt-2 text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

// ─── Rail skeleton (matches MediaRail poster sizing) ───────────────────────────

function RailSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden pb-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="w-[132px] shrink-0 sm:w-[150px] md:w-[160px]" aria-hidden="true">
          <div className="aspect-[2/3] animate-pulse rounded-2xl bg-muted" />
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
