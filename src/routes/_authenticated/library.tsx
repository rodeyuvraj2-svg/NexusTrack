import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listLibrary } from "@/lib/library.functions";
import type { WatchStatus } from "@/lib/media-types";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/media-types";
import { Star } from "lucide-react";

const STATUSES: (WatchStatus | "all" | "favorites")[] = ["all", "watching", "completed", "planned", "paused", "dropped", "favorites"];
const TYPES = ["all", "movie", "tv", "anime"] as const;

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({ meta: [{ title: "Library — NexusTrack" }, { name: "description", content: "Everything you're tracking, filterable by status, type, and favorites." }] }),
  component: Library,
});

function Library() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const fn = useServerFn(listLibrary);

  const q = useQuery({
    queryKey: ["library", status, type],
    queryFn: () => fn({
      data: {
        status: status !== "all" && status !== "favorites" ? (status as WatchStatus) : undefined,
        type: type !== "all" ? type : undefined,
        favorite: status === "favorites" ? true : undefined,
      },
    }),
  });

  return (
    <div>
      <h1 className="text-3xl md:text-4xl font-bold mb-6">Your library</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors capitalize ${status === s ? "bg-gradient-accent text-white" : "glass hover:bg-muted/40"}`}
          >{s}</button>
        ))}
      </div>
      <div className="mb-8 flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wider transition-colors ${type === t ? "border-primary/50 bg-primary/20 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"}`}
          >{t}</button>
        ))}
      </div>

      {q.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (q.data?.length ?? 0) === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <p className="text-muted-foreground">Nothing here yet.</p>
          <Link to="/search" className="mt-4 inline-block rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white">Find something to watch</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {q.data!.map((r) => {
            const m = r.media as unknown as { id: string; media_type: "movie" | "tv" | "anime"; source: string; external_id: string; title: string; poster_url: string | null; release_year: number | null };
            if (!m) return null;
            return (
              <Link
                key={r.id}
                to="/media/$type/$source/$id"
                params={{ type: m.media_type, source: m.source, id: m.external_id }}
                className="group relative block overflow-hidden rounded-xl glass hover:ring-accent transition-all"
              >
                <div className="aspect-[2/3] bg-muted overflow-hidden">
                  {m.poster_url ? <img src={m.poster_url} alt={m.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" /> : null}
                  {r.favorite ? <div className="absolute top-2 right-2 rounded-full bg-accent/90 p-1"><Star className="h-3 w-3 fill-white text-white" /></div> : null}
                </div>
                <div className="p-3">
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${STATUS_COLORS[r.status as WatchStatus]}`}>
                    {STATUS_LABELS[r.status as WatchStatus]}
                  </span>
                  <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold">{m.title}</h3>
                  {m.release_year ? <p className="text-xs text-muted-foreground">{m.release_year}</p> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
