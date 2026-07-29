import { createFileRoute, Link } from "@tanstack/react-router";
import { Film, Search, Heart, Users, Star, ArrowRight, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NexusTrack — Movies, TV & Anime Tracker" },
      { name: "description", content: "Track movies, TV, and anime in one place. Unified search, season-level progress, friends' libraries — free forever." },
      { property: "og:title", content: "NexusTrack — Track everything you watch" },
      { property: "og:description", content: "Movies, TV shows, anime — one library, every screen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { Icon: Search, title: "Unified search", body: "Movies, TV, and anime results side by side from TMDB and MyAnimeList." },
  { Icon: Heart, title: "Season-level tracking", body: "Mark seasons, not episodes. Rollups happen automatically." },
  { Icon: Star, title: "Favorites & ratings", body: "Star what you love, rate on a 10-point scale, add private notes." },
  { Icon: Users, title: "Friends' libraries", body: "See what friends are watching and copy any title with one click." },
];

function Landing() {
  return (
    <div className="relative">
      {/* ── NAV ── */}
      <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur-lg border-b border-border/30">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-accent shadow-lg">
            <span className="text-sm font-black text-white">N</span>
          </div>
          <span className="text-lg font-bold">Nexus<span className="text-primary">Track</span></span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/auth" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5">
            Sign in
          </Link>
          <Link
            to="/auth"
            className="rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-shadow btn-press"
          >
            Start tracking
          </Link>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-20 text-center overflow-hidden">
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[180px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-accent/6 blur-[160px]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto">
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/50 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Movies · TV · Anime — one library
          </div>

          {/* Heading */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black leading-[0.92] tracking-tighter">
            Track{" "}
            <span className="text-primary">Movies.</span>
            <br />
            <span className="text-primary">TV Shows.</span>{" "}
            <span className="text-accent">Anime.</span>
            <br />
            All in One Place.
          </h1>

          <p className="mt-6 mx-auto max-w-xl text-base sm:text-lg text-muted-foreground/90 leading-relaxed">
            Stop juggling five apps. Track what you watch, discover what's next, and copy titles straight from your friends. Free, forever.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/auth"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-accent px-8 py-4 text-base font-semibold text-white shadow-xl shadow-primary/30 hover:shadow-primary/50 transition-all btn-press"
            >
              Start tracking free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-card/30 px-8 py-4 text-sm font-medium text-foreground/80 backdrop-blur-sm hover:bg-card/60 transition-colors btn-press"
            >
              See features
              <ChevronDown className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Mock preview */}
        <div className="relative z-10 mt-20 w-full max-w-5xl mx-auto">
          <div className="glass-strong rounded-2xl p-3 md:p-4 shadow-2xl">
            <div className="flex items-center gap-2 mb-3 px-2">
              <div className="h-2.5 w-2.5 rounded-full bg-destructive/50" />
              <div className="h-2.5 w-2.5 rounded-full bg-warning/50" />
              <div className="h-2.5 w-2.5 rounded-full bg-success/50" />
              <div className="ml-3 flex-1 rounded-lg bg-background/50 px-3 py-1.5 text-xs text-muted-foreground/70 flex items-center gap-2">
                <Search className="h-3 w-3" /> Search movies, series, anime…
              </div>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
              {PREVIEW_ITEMS.map((item, i) => (
                <div key={item.title} className="group relative rounded-xl overflow-hidden bg-muted/40 aspect-[2/3]">
                  <img
                    src={item.img}
                    alt={item.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-2">
                    <p className="text-xs font-semibold text-white truncate drop-shadow-sm">{item.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] uppercase tracking-wider text-white/70">{item.type}</span>
                      <span className="ml-auto flex items-center gap-0.5 text-[10px] text-warning font-medium">
                        <Star className="h-2.5 w-2.5 fill-current" /> {item.rating}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="relative px-6 py-24 md:py-32">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight">
              Built the way you actually watch.
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              One unified library for everything you watch — no matter the screen, genre, or language.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="glass rounded-2xl p-6 card-hover">
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
                  <f.Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground/80 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative px-6 py-24 md:py-32 text-center">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl md:text-5xl font-black tracking-tight">
            Start your library in seconds.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg">
            Sign in with Google or email. Your first movie is one click away.
          </p>
          <Link
            to="/auth"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-accent px-8 py-4 text-base font-semibold text-white shadow-xl shadow-primary/30 hover:shadow-primary/50 transition-all btn-press"
          >
            Get started — it's free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-6 text-xs text-muted-foreground/60">
            No credit card. No ads. No limits. Ever.
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border/30 px-6 py-8">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="grid h-6 w-6 place-items-center rounded-md bg-gradient-accent">
              <span className="text-[10px] font-black text-white">N</span>
            </div>
            NexusTrack
          </div>
          <p className="text-xs text-muted-foreground/60">
            Free forever. Powered by TMDB & Jikan.
          </p>
        </div>
      </footer>
    </div>
  );
}

const PREVIEW_ITEMS = [
  { title: "Interstellar", type: "Movie", rating: "9.0", img: "https://image.tmdb.org/t/p/w342/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg" },
  { title: "Breaking Bad", type: "TV", rating: "9.5", img: "https://image.tmdb.org/t/p/w342/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg" },
  { title: "One Piece", type: "Anime", rating: "8.8", img: "https://image.tmdb.org/t/p/w342/blWCPEqDGLBuLB9u89CxP9ORQP4.jpg" },
  { title: "Stranger Things", type: "TV", rating: "8.7", img: "https://image.tmdb.org/t/p/w342/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg" },
  { title: "Your Name", type: "Anime", rating: "8.8", img: "https://image.tmdb.org/t/p/w342/q719jXXEzOoYaps6babgKnONONX.jpg" },
  { title: "The Batman", type: "Movie", rating: "8.3", img: "https://image.tmdb.org/t/p/w342/74xTEgt7R36Fpooo50r9T25onhq.jpg" },
];
