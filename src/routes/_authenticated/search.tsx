import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { searchAll } from "@/lib/tmdb.functions";
import { searchAnime } from "@/lib/jikan.functions";
import { MediaGrid } from "@/components/MediaCard";
import { Search as SearchIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "Search — NexusTrack" }, { name: "description", content: "Search movies, TV, and anime from one place." }] }),
  component: SearchPage,
});

function SearchPage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const tmdbFn = useServerFn(searchAll);
  const jikanFn = useServerFn(searchAnime);

  const query = useQuery({
    queryKey: ["search", debounced],
    queryFn: async () => {
      const [tmdb, anime] = await Promise.all([tmdbFn({ data: { q: debounced } }), jikanFn({ data: { q: debounced } })]);
      return { ...tmdb, anime };
    },
    enabled: debounced.length > 1,
  });

  return (
    <div>
      <h1 className="text-3xl md:text-4xl font-bold mb-6">Search</h1>
      <form
        onSubmit={(e) => { e.preventDefault(); setDebounced(q.trim()); }}
        className="glass-strong rounded-2xl p-2 flex items-center gap-2 mb-8"
      >
        <SearchIcon className="ml-3 h-5 w-5 text-muted-foreground" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)} autoFocus
          placeholder="The Bear, Frieren, Inception…"
          className="flex-1 bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground"
        />
        <button className="rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white">Search</button>
      </form>

      {debounced.length < 2 ? (
        <p className="text-sm text-muted-foreground">Type at least 2 characters.</p>
      ) : query.isLoading ? (
        <p className="text-sm text-muted-foreground">Searching…</p>
      ) : query.data ? (
        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-bold mb-3">Movies</h2>
            <MediaGrid items={query.data.movies} />
          </section>
          <section>
            <h2 className="text-xl font-bold mb-3">TV Shows</h2>
            <MediaGrid items={query.data.tv} />
          </section>
          <section>
            <h2 className="text-xl font-bold mb-3">Anime</h2>
            <MediaGrid items={query.data.anime} />
          </section>
        </div>
      ) : null}
    </div>
  );
}
