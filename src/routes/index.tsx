import { createFileRoute, Link } from "@tanstack/react-router";
import { Film, Compass, Users, Search, Sparkles, Heart } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NexusTrack — One list, every screen" },
      { name: "description", content: "Track movies, TV, and anime together. Season-level progress, unified search, friends' libraries, streaming discovery. Free forever." },
      { property: "og:title", content: "NexusTrack — One list, every screen" },
      { property: "og:description", content: "Track movies, TV, and anime together. Season-level progress, unified search, friends. Free forever." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div>
      {/* NAV */}
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-accent shadow-lg">
            <span className="text-base font-black text-white">N</span>
          </div>
          <span className="text-lg font-bold">Nexus<span className="text-gradient">Track</span></span>
        </Link>
        <Link to="/auth" className="rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white shadow-lg hover:opacity-90">
          Start Tracking Free
        </Link>
      </header>

      {/* HERO */}
      <section className="mx-auto max-w-7xl px-6 pt-12 md:pt-24 pb-16 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-accent" /> Movies · TV · Anime — one library
        </div>
        <h1 className="mt-6 text-5xl md:text-7xl font-black leading-[0.95] tracking-tight">
          One list, <br />
          <span className="text-gradient">every screen.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          Stop juggling five apps. Track what you watch, discover what's next, and copy titles straight from your friends. Free, forever.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/auth" className="rounded-xl bg-gradient-accent px-6 py-3 text-sm font-semibold text-white shadow-xl hover:-translate-y-0.5 transition-transform">
            Create your library
          </Link>
          <a href="#features" className="rounded-xl glass px-6 py-3 text-sm font-medium hover:bg-muted/40">
            See what's inside
          </a>
        </div>

        {/* Mock preview */}
        <div className="relative mt-16 mx-auto max-w-4xl">
          <div className="glass-strong rounded-3xl p-4 md:p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-3 w-3 rounded-full bg-destructive/60" />
              <div className="h-3 w-3 rounded-full bg-warning/60" />
              <div className="h-3 w-3 rounded-full bg-success/60" />
              <div className="ml-4 flex items-center gap-2 flex-1 rounded-lg bg-background/60 px-3 py-1.5 text-xs text-muted-foreground">
                <Search className="h-3.5 w-3.5" /> Search movies, series, anime…
              </div>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {[300, 340, 320, 360, 310, 350].map((h, i) => (
                <div key={i} className="rounded-xl glass overflow-hidden animate-float" style={{ height: `${h / 2}px`, animationDelay: `${i * 0.5}s` }}>
                  <div className="h-full w-full bg-gradient-to-br from-primary/30 via-primary/10 to-accent/20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-20">
        <h2 className="text-3xl md:text-5xl font-bold text-center">Built the way you actually watch.</h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { Icon: Film, title: "Season-level tracking", body: "Mark seasons, not episodes. Rollups happen automatically." },
            { Icon: Compass, title: "Unified discovery", body: "Trending, popular, seasonal anime — from TMDB and MyAnimeList, together." },
            { Icon: Users, title: "Friends' libraries", body: "See what friends love and copy any title with one click." },
            { Icon: Search, title: "One search bar", body: "Movies, TV, and anime results side by side, instantly." },
            { Icon: Heart, title: "Favorites & notes", body: "Star what you love. Jot private notes. Rate on a 10-point scale." },
            { Icon: Sparkles, title: "Free forever", body: "No premium tier, no ads, no limits — just the tool." },
          ].map((f) => (
            <div key={f.title} className="glass rounded-2xl p-6">
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-primary/20 text-primary">
                <f.Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="mb-10 text-center text-3xl md:text-4xl font-bold">Frequently asked questions</h2>
        <Accordion type="single" collapsible className="space-y-3">
          <AccordionItem value="q1" className="glass rounded-xl px-5 border-border/40">
            <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">Is NexusTrack really free?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
              Yes. Every feature is completely free — no subscriptions, no premium tiers, no ads, no limits. Ever.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q2" className="glass rounded-xl px-5 border-border/40">
            <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">What can I track?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
              Movies, TV shows, and anime — all from one unified library. Search across all three at once and add anything with a single click.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q3" className="glass rounded-xl px-5 border-border/40">
            <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">Do I have to mark every episode?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
              No. You track progress at the season level, not episode-by-episode. Mark a season as watching, completed, or skipped — the show's overall status updates automatically.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q4" className="glass rounded-xl px-5 border-border/40">
            <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">Can I see what my friends are watching?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
              Yes. Add friends, browse their libraries, and copy any title to your own list with one click. You can also see friend activity on your dashboard.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q5" className="glass rounded-xl px-5 border-border/40">
            <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">Can I export my data?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
              Absolutely. Export your entire library as JSON or CSV from Settings at any time. You can also import from a previously exported file.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q6" className="glass rounded-xl px-5 border-border/40">
            <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">Where does the data come from?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
              Movie and TV metadata comes from TMDB (The Movie Database). Anime metadata comes from the Jikan API (MyAnimeList). All data is cached for fast loading.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="text-3xl md:text-5xl font-bold">Start your library in seconds.</h2>
        <p className="mt-4 text-muted-foreground">Sign in with Google or email. Your first movie is one click away.</p>
        <Link to="/auth" className="mt-8 inline-block rounded-xl bg-gradient-accent px-8 py-3.5 text-sm font-semibold text-white shadow-xl">
          Get started — it's free
        </Link>
      </section>

    </div>
  );
}
