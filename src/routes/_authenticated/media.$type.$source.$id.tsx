import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import { getDetails, cacheMedia, getWatchProviders, getRecommendations, getCast } from "@/lib/tmdb.functions";
import { getLibraryItem, upsertLibraryItem, removeLibraryItem, listSeasonsWithProgress, setSeasonStatus } from "@/lib/library.functions";
import { listReviews, upsertReview, deleteReview, toggleReviewLike } from "@/lib/reviews.functions";
import { STATUS_LABELS, type WatchStatus } from "@/lib/media-types";
import { MediaGrid } from "@/components/MediaCard";
import { Star, Heart, Trash2, Check, ThumbsUp, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/media/$type/$source/$id")({
  head: () => ({ meta: [{ title: "Details — NexusTrack" }, { name: "description", content: "Track this title in your library, mark seasons, and see friends' progress." }] }),
  component: MediaDetail,
});

const STATUS_OPTIONS: WatchStatus[] = ["planned", "watching", "completed", "paused", "dropped", "rewatching"];

interface ReviewData {
  id: string;
  body: string;
  likes: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  profile: unknown;
  liked_by_me: boolean;
}

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
  const providersFn = useServerFn(getWatchProviders);
  const recsFn = useServerFn(getRecommendations);
  const castFn = useServerFn(getCast);
  const reviewsFn = useServerFn(listReviews);
  const upsertReviewFn = useServerFn(upsertReview);
  const deleteReviewFn = useServerFn(deleteReview);
  const likeReviewFn = useServerFn(toggleReviewLike);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null)); }, []);

  const cached = useQuery({
    queryKey: ["cache", type, source, id],
    queryFn: () => cacheFn({ data: { type: type as "movie" | "tv" | "anime", source: source as "tmdb" | "jikan", external_id: id } }),
  });

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

  const providers = useQuery({
    queryKey: ["providers", type, id],
    queryFn: () => providersFn({ data: { type: type as "movie" | "tv", id } }),
    enabled: source === "tmdb" && (type === "movie" || type === "tv"),
  });

  const recs = useQuery({
    queryKey: ["recommendations", type, id],
    queryFn: () => recsFn({ data: { type: type as "movie" | "tv", id } }),
    enabled: source === "tmdb" && (type === "movie" || type === "tv"),
  });

  const cast = useQuery({
    queryKey: ["cast", type, id],
    queryFn: () => castFn({ data: { type: type as "movie" | "tv", id } }),
    enabled: source === "tmdb" && (type === "movie" || type === "tv"),
  });

  const reviews = useQuery({
    queryKey: ["reviews", mediaId],
    queryFn: () => reviewsFn({ data: { media_id: mediaId! } }),
    enabled: !!mediaId,
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
          {cast.data?.director ? <p className="mt-1 text-sm text-muted-foreground">Directed by {cast.data.director}</p> : null}
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
                  className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-colors", active ? "bg-gradient-accent text-white" : "glass hover:bg-muted/40")}
                >
                  {active ? <Check className="inline h-4 w-4 mr-1" /> : null}
                  {STATUS_LABELS[opt]}
                </button>
              );
            })}
            <button
              disabled={mUpsert.isPending}
              onClick={() => mUpsert.mutate({ media_id: mediaId!, favorite: !entry?.favorite })}
              className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-colors", entry?.favorite ? "bg-accent/25 text-accent" : "glass hover:bg-muted/40")}
            >
              <Heart className={cn("inline h-4 w-4 mr-1", entry?.favorite && "fill-current")} /> {entry?.favorite ? "Favorited" : "Favorite"}
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
                    className={cn("h-8 w-8 rounded-md text-xs font-semibold transition-colors", entry.rating && entry.rating >= n ? "bg-warning text-background" : "glass hover:bg-muted/40")}
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

      {/* Streaming availability */}
      {providers.data ? (
        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-bold">Where to watch</h2>
          {providers.data.flatrate.length > 0 || providers.data.rent.length > 0 || providers.data.buy.length > 0 || providers.data.ads.length > 0 ? (
            <div className="space-y-4">
              {providers.data.flatrate.length > 0 ? <ProviderGroup label="Stream" providers={providers.data.flatrate} link={providers.data.link} /> : null}
              {providers.data.rent.length > 0 ? <ProviderGroup label="Rent" providers={providers.data.rent} link={providers.data.link} /> : null}
              {providers.data.buy.length > 0 ? <ProviderGroup label="Buy" providers={providers.data.buy} link={providers.data.link} /> : null}
              {providers.data.ads.length > 0 ? <ProviderGroup label="Free (ads)" providers={providers.data.ads} link={providers.data.link} /> : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Unavailable in your region.</p>
          )}
        </section>
      ) : null}

      {/* Cast */}
      {cast.data && cast.data.cast.length > 0 ? (
        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-bold">Cast</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {cast.data.cast.map((c) => (
              <div key={c.id} className="w-20 shrink-0 text-center">
                <div className="mx-auto h-20 w-20 overflow-hidden rounded-full bg-muted">
                  {c.profile_path ? <img src={c.profile_path} alt={c.name} loading="lazy" className="h-full w-full object-cover" /> : null}
                </div>
                <p className="mt-1.5 text-xs font-medium line-clamp-1">{c.name}</p>
                <p className="text-[10px] text-muted-foreground line-clamp-1">{c.character}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Seasons */}
      {type === "tv" && seasons.data && seasons.data.length > 0 ? (
        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-bold">Seasons</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {seasons.data.map((sn) => (
              <div key={sn.id} className="glass rounded-xl p-4 flex gap-4">
                {sn.poster_url ? <img src={sn.poster_url} alt="" className="h-24 w-16 rounded-lg object-cover" /> : <div className="h-24 w-16 rounded-lg bg-muted" />}
                <div className="flex-1">
                  <h3 className="font-semibold">{sn.name || `Season ${sn.season_number}`}</h3>
                  <p className="text-xs text-muted-foreground">{sn.episode_count} eps{sn.air_date ? ` · ${sn.air_date.slice(0, 4)}` : ""}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(["planned", "watching", "completed", "skipped", "dropped"] as WatchStatus[]).map((st) => (
                      <button key={st}
                        onClick={() => mSetSeason.mutate({ season_id: sn.id, status: st })}
                        className={cn("rounded-md px-2.5 py-1 text-xs transition-colors", sn.status === st ? "bg-gradient-accent text-white" : "bg-muted/40 hover:bg-muted/60")}
                      >{STATUS_LABELS[st]}</button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Recommendations */}
      {recs.data && recs.data.length > 0 ? (
        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-bold">More like this</h2>
          <MediaGrid items={recs.data.slice(0, 6)} />
        </section>
      ) : null}

      {/* Reviews */}
      {mediaId ? (
        <ReviewsSection
          mediaId={mediaId}
          reviews={reviews}
          upsertFn={upsertReviewFn}
          deleteFn={deleteReviewFn}
          likeFn={likeReviewFn}
          qc={qc}
          currentUserId={currentUserId}
        />
      ) : null}
    </div>
  );
}

function ProviderGroup({ label, providers, link }: { label: string; providers: Array<{ provider_name: string; logo_path: string | null }>; link: string | null }) {
  return (
    <div>
      <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{label}</h3>
      <div className="flex flex-wrap gap-3">
        {providers.map((p) => (
          <a key={p.provider_name} href={link ?? "#"} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2 rounded-lg glass p-2 hover:bg-muted/40 transition-colors">
            {p.logo_path ? <img src={p.logo_path} alt={p.provider_name} className="h-8 w-8 rounded-md" /> : null}
            <span className="text-sm">{p.provider_name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function ReviewsSection({ mediaId, reviews, upsertFn, deleteFn, likeFn, qc, currentUserId }: {
  mediaId: string;
  reviews: UseQueryResult<ReviewData[]>;
  upsertFn: ReturnType<typeof useServerFn<typeof upsertReview>>;
  deleteFn: ReturnType<typeof useServerFn<typeof deleteReview>>;
  likeFn: ReturnType<typeof useServerFn<typeof toggleReviewLike>>;
  qc: ReturnType<typeof useQueryClient>;
  currentUserId: string | null;
}) {
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState("");

  const myReview = reviews.data?.find((r) => r.user_id === currentUserId);

  const mSave = useMutation({
    mutationFn: () => upsertFn({ data: { media_id: mediaId, body } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reviews", mediaId] }); setWriting(false); setBody(""); toast.success("Review posted"); },
  });
  const mDelete = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reviews", mediaId] }); toast.success("Review deleted"); },
  });
  const mLike = useMutation({
    mutationFn: (review_id: string) => likeFn({ data: { review_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews", mediaId] }),
  });

  return (
    <section className="mt-12">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Reviews</h2>
        {!writing && !myReview ? (
          <button onClick={() => setWriting(true)} className="flex items-center gap-1.5 rounded-lg glass px-3 py-1.5 text-sm hover:bg-muted/40">
            <MessageSquare className="h-4 w-4" /> Write a review
          </button>
        ) : null}
      </div>

      {writing ? (
        <div className="glass-strong mb-6 rounded-2xl p-4">
          <textarea
            value={body} onChange={(e) => setBody(e.target.value)} autoFocus rows={4} maxLength={1000}
            className="w-full rounded-lg border border-input bg-background/40 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="Share your thoughts (max 1000 characters)…"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{body.length}/1000</span>
            <div className="flex gap-2">
              <button onClick={() => { setWriting(false); setBody(""); }} className="rounded-lg glass px-3 py-1.5 text-sm">Cancel</button>
              <button onClick={() => mSave.mutate()} disabled={!body.trim() || mSave.isPending} className="rounded-lg bg-gradient-accent px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
                {mSave.isPending ? "Posting…" : "Post review"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reviews.isLoading ? (
        <p className="text-muted-foreground">Loading reviews…</p>
      ) : (reviews.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews yet. Be the first to share your thoughts.</p>
      ) : (
        <div className="space-y-3">
          {reviews.data!.map((r) => {
            const p = r.profile as unknown as { username: string; display_name: string; avatar_url: string | null } | undefined;
            const isMine = r.user_id === currentUserId;
            return (
              <div key={r.id} className="glass rounded-xl p-4">
                <div className="mb-2 flex items-center gap-2">
                  {p?.avatar_url ? <img src={p.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="h-8 w-8 rounded-full bg-gradient-accent grid place-items-center text-white text-xs font-bold">{(p?.display_name || p?.username || "?").charAt(0).toUpperCase()}</div>}
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{p?.display_name || p?.username || "Someone"}</div>
                    <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</div>
                  </div>
                  {isMine ? (
                    <button onClick={() => mDelete.mutate(r.id)} className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <p className="text-sm leading-relaxed">{r.body}</p>
                <button
                  onClick={() => mLike.mutate(r.id)}
                  className={cn("mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors", r.liked_by_me ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                >
                  <ThumbsUp className={cn("h-3.5 w-3.5", r.liked_by_me && "fill-current")} /> {r.likes}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
