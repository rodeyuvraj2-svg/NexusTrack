import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { getDetails, cacheMedia } from "@/lib/tmdb.functions";
import { getLibraryItem, upsertLibraryItem, removeLibraryItem, listSeasonsWithProgress, setSeasonStatus } from "@/lib/library.functions";
import { STATUS_LABELS, type WatchStatus } from "@/lib/media-types";
import { Star, Heart, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/media/$type/$source/$id")({
  head: () => ({ meta: [{ title: "Details — NexusTrack" }, { name: "description", content: "Track this title in your library, mark seasons, and see friends' progress." }] }),
  component: MediaDetail,
});

const STATUS_OPTIONS: WatchStatus[] = ["planned", "watching", "completed", "paused", "dropped", "rewatching"];

function MediaDetail() {
  const { type, source, id } = useParams({ from: "/_authenticated/media/$type/$source/$id" });
  const qc = useQueryClient();

  const cacheFn = useServerFn(cacheMedia);
  const detailsFn = useServerFn(getDetails);
  const libFn = useServerFn(getLibraryItem);
  const upsertFn = useServerFn(upsertLibraryItem);
  const removeFn = useServerFn(removeLibraryItem);
  const seasonsFn = useServerFn(listSeasonsWithProgress);
  const setSeasonFn = useServerFn(setSeasonStatus);

  // 1) cache media -> internal id
  const cached = useQuery({
    queryKey: ["cache", type, source, id],
    queryFn: () => cacheFn({ data: { type: type as "movie" | "tv" | "anime", source: source as "tmdb" | "jikan", external_id: id } }),
  });

  // 2) fetch remote details for hero (parallel with cache)
  const details = useQuery({
    queryKey: ["details", type, id],
    queryFn: () => detailsFn({ data: { type: type as "movie" | "tv", id } }),
    enabled: source === "tmdb",
  });

  const mediaId = cached.data?.id;

  const libraryEntry = useQuery({
    queryKey: ["library-entry", mediaId],
    queryFn: () => libFn({ data: { media_id: mediaId! } }),
    enabled: !!mediaId,
  });

  const seasons = useQuery({
    queryKey: ["seasons", mediaId],
    queryFn: () => seasonsFn({ data: { media_id: mediaId! } }),
    enabled: !!mediaId && type === "tv",
  });

  type UpsertPayload = { media_id: string; status?: WatchStatus; rating?: number | null; favorite?: boolean; hidden?: boolean; notes?: string | null };
  const mUpsert = useMutation({
    mutationFn: (payload: UpsertPayload) => upsertFn({ data: payload }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["library-entry", mediaId] }); qc.invalidateQueries({ queryKey: ["library"] }); qc.invalidateQueries({ queryKey: ["stats"] }); },
  });
  const mRemove = useMutation({
    mutationFn: () => removeFn({ data: { media_id: mediaId! } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["library-entry", mediaId] }); qc.invalidateQueries({ queryKey: ["library"] }); toast.success("Removed from library"); },
  });
  const mSetSeason = useMutation({
    mutationFn: (payload: { season_id: string; status: WatchStatus }) =>
      setSeasonFn({ data: { media_id: mediaId!, season_id: payload.season_id, status: payload.status } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["seasons", mediaId] }); qc.invalidateQueries({ queryKey: ["library-entry", mediaId] }); },
  });

  const [notes, setNotes] = useState("");
  useEffect(() => { if (libraryEntry.data?.notes) setNotes(libraryEntry.data.notes); }, [libraryEntry.data]);

  if (cached.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (cached.error) return <p className="text-destructive">Failed to load.</p>;

  const s = details.data?.summary;
  const entry = libraryEntry.data;

  return (
    <div>
      {/* Hero */}
      <div className="relative -mx-4 md:-mx-8 -mt-6 md:-mt-10 mb-8 h-64 md:h-80 overflow-hidden">
        {s?.backdrop_url ? (
          <img src={s.backdrop_url} alt="" className="h-full w-full object-cover opacity-30" />
        ) : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent/20" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
      </div>

      <div className="grid gap-8 md:grid-cols-[220px_1fr]">
        <div className="glass rounded-xl overflow-hidden aspect-[2/3] -mt-32 md:-mt-40 shadow-2xl">
          {s?.poster_url ? <img src={s.poster_url} alt={s.title} className="h-full w-full object-cover" /> : null}
        </div>

        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            <span className="text-gradient font-semibold">{type}</span>
            {s?.release_year ? ` · ${s.release_year}` : ""}
            {s?.runtime ? ` · ${s.runtime}m` : ""}
          </div>
          <h1 className="mt-2 text-3xl md:text-5xl font-black">{s?.title ?? "Loading…"}</h1>
          {s?.vote_average ? (
            <div className="mt-2 flex items-center gap-1 text-warning">
              <Star className="h-4 w-4 fill-current" /> <span className="font-semibold">{s.vote_average.toFixed(1)}</span>
              <span className="text-muted-foreground text-sm ml-1">/ 10</span>
            </div>
          ) : null}
          {s?.genres?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {s.genres.map((g) => <span key={g} className="rounded-full glass px-3 py-0.5 text-xs">{g}</span>)}
            </div>
          ) : null}
          <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">{s?.overview}</p>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => {
              const active = entry?.status === opt;
              return (
                <button
                  key={opt}
                  disabled={mUpsert.isPending}
                  onClick={() => mUpsert.mutate({ media_id: mediaId!, status: opt })}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${active ? "bg-gradient-accent text-white" : "glass hover:bg-muted/40"}`}
                >
                  {active ? <Check className="inline h-4 w-4 mr-1" /> : null}
                  {STATUS_LABELS[opt]}
                </button>
              );
            })}
            <button
              disabled={mUpsert.isPending}
              onClick={() => mUpsert.mutate({ media_id: mediaId!, favorite: !entry?.favorite })}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${entry?.favorite ? "bg-accent/25 text-accent" : "glass hover:bg-muted/40"}`}
            >
              <Heart className={`inline h-4 w-4 mr-1 ${entry?.favorite ? "fill-current" : ""}`} /> {entry?.favorite ? "Favorited" : "Favorite"}
            </button>
            {entry ? (
              <button onClick={() => mRemove.mutate()} disabled={mRemove.isPending} className="rounded-lg px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10">
                <Trash2 className="inline h-4 w-4 mr-1" /> Remove
              </button>
            ) : null}
          </div>

          {/* Rating */}
          {entry ? (
            <div className="mt-6">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Your rating</label>
              <div className="mt-1 flex gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n}
                    onClick={() => mUpsert.mutate({ media_id: mediaId!, rating: entry.rating === n ? null : n })}
                    className={`h-8 w-8 rounded-md text-xs font-semibold transition-colors ${entry.rating && entry.rating >= n ? "bg-warning text-background" : "glass hover:bg-muted/40"}`}
                  >{n}</button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Notes */}
          {entry ? (
            <div className="mt-6 max-w-xl">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Private notes</label>
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notes !== (entry.notes ?? "") && mUpsert.mutate({ media_id: mediaId!, notes: notes || null })}
                rows={3} maxLength={1000}
                className="mt-1 w-full rounded-lg border border-input bg-background/40 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Thoughts, favorite scenes, watch date…"
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Seasons */}
      {type === "tv" && seasons.data && seasons.data.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-2xl font-bold mb-4">Seasons</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {seasons.data.map((s) => (
              <div key={s.id} className="glass rounded-xl p-4 flex gap-4">
                {s.poster_url ? <img src={s.poster_url} alt="" className="h-24 w-16 rounded-lg object-cover" /> : <div className="h-24 w-16 rounded-lg bg-muted" />}
                <div className="flex-1">
                  <h3 className="font-semibold">{s.name || `Season ${s.season_number}`}</h3>
                  <p className="text-xs text-muted-foreground">{s.episode_count} eps{s.air_date ? ` · ${s.air_date.slice(0, 4)}` : ""}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(["planned", "watching", "completed", "skipped", "dropped"] as WatchStatus[]).map((st) => (
                      <button key={st}
                        onClick={() => mSetSeason.mutate({ season_id: s.id, status: st })}
                        className={`rounded-md px-2.5 py-1 text-xs transition-colors ${s.status === st ? "bg-gradient-accent text-white" : "bg-muted/40 hover:bg-muted/60"}`}
                      >{STATUS_LABELS[st]}</button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
