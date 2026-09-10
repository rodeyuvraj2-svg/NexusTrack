import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeStreaks, computeHoursWatched, computeFavoriteGenres, type StatRow } from "./stats-utils";

const StatusEnum = z.enum(["watching", "completed", "planned", "paused", "dropped", "skipped", "rewatching"]);
type WatchStatusValue = z.infer<typeof StatusEnum>;

export const listLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        status: StatusEnum.optional(),
        type: z.enum(["movie", "tv", "anime", "manga"]).optional(),
        favorite: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("user_media")
      // !inner: a filter on the embedded media row must be an inner join,
      // otherwise PostgREST returns rows whose embedded media is null.
      .select("id, status, rating, favorite, hidden, notes, progress, created_at, updated_at, media:media_id!inner(id, media_type, source, external_id, title, poster_url, release_year, vote_average, genres)")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    if (data.favorite !== undefined) q = q.eq("favorite", data.favorite);
    if (data.type) q = q.eq("media.media_type", data.type as any);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows;
  });

/**
 * Read an existing `media` cache row by external identity — without
 * provisioning. Unlike cacheMedia this never calls the source API, so it
 * still works when the external API (AniList/Jikan/TMDB) is unreachable;
 * the detail page uses it to render items the user already has cached.
 */
export const getMediaRowByExternal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        source: z.enum(["tmdb", "anilist", "jikan", "kitsu"]),
        media_type: z.enum(["movie", "tv", "anime", "manga"]),
        external_id: z.string().min(1).max(64),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("media")
      .select("id, media_type, source, external_id, title, overview, poster_url, backdrop_url, release_year, vote_average, genres, runtime, season_count, chapter_count, volume_count, status")
      .eq("source", data.source)
      .eq("media_type", data.media_type as any)
      .eq("external_id", data.external_id)
      .maybeSingle();
    if (error) throw error;
    return row ?? null;
  });

// Shared upsert used by both upsertLibraryItem (by media id) and
// saveLibraryEntryByExternal (by source + external id).
async function applyLibraryUpsert(
  supabase: SupabaseClient,
  userId: string,
  mediaId: string,
  data: {
    status?: WatchStatusValue;
    rating?: number | null;
    favorite?: boolean;
    hidden?: boolean;
    notes?: string | null;
  },
) {
  // Read the existing row first to detect transitions for activity logging
  // and to preserve unspecified fields on partial updates. The write itself
  // is a DB-enforced upsert on (user_id, media_id), so concurrent saves
  // can't create duplicates.
  const { data: existing } = await supabase
    .from("user_media")
    .select("id, status, rating, favorite, hidden, notes")
    .eq("user_id", userId)
    .eq("media_id", mediaId)
    .maybeSingle();

  const insert: {
    user_id: string;
    media_id: string;
    status: WatchStatusValue;
    rating: number | null;
    favorite: boolean;
    hidden: boolean;
    notes: string | null;
  } = {
    user_id: userId,
    media_id: mediaId,
    // Fall back to the existing row's values so a partial update (e.g. only
    // `rating`) doesn't clobber unspecified fields with their defaults.
    // `!== undefined` (not ??) so an explicit null still clears the field.
    status: data.status !== undefined ? data.status : (existing?.status ?? "planned"),
    rating: data.rating !== undefined ? data.rating : (existing?.rating ?? null),
    favorite: data.favorite !== undefined ? data.favorite : (existing?.favorite ?? false),
    hidden: data.hidden !== undefined ? data.hidden : (existing?.hidden ?? false),
    notes: data.notes !== undefined ? data.notes : (existing?.notes ?? null),
  };

  const { data: row, error } = await supabase
    .from("user_media")
    .upsert(insert, { onConflict: "user_id,media_id" })
    .select("*")
    .single();
  if (error) throw error;

  // Log activity (non-critical — wrapped in try/catch).
  // A first save logs exactly ONE row reflecting the initial action —
  // previously saving directly as "completed"/"watching" also logged an
  // "added" row, so the feed showed "added to watchlist" AND
  // "completed"/"started watching" as separate entries.
  const isWatchKind = data.status === "watching" || data.status === "rewatching";
  try {
    if (!existing) {
      const kind = data.status === "completed" ? "completed"
        : isWatchKind ? "started"
        : data.favorite ? "favorited"
        : "added";
      await supabase.from("activity").insert({
        user_id: userId, kind, media_id: mediaId,
      }).maybeSingle();
    } else {
      if (data.status === "completed" && existing.status !== "completed") {
        await supabase.from("activity").insert({
          user_id: userId, kind: "completed", media_id: mediaId,
        }).maybeSingle();
      }
      if (isWatchKind && existing.status !== "watching" && existing.status !== "rewatching") {
        await supabase.from("activity").insert({
          user_id: userId, kind: "started", media_id: mediaId,
        }).maybeSingle();
      }
      if (data.favorite === true && !existing.favorite) {
        await supabase.from("activity").insert({
          user_id: userId, kind: "favorited", media_id: mediaId,
        }).maybeSingle();
      }
    }
  } catch { /* activity logging is non-critical */ }

  return row;
}

export const upsertLibraryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        media_id: z.string().uuid(),
        status: StatusEnum.optional(),
        rating: z.number().int().min(0).max(10).nullable().optional(),
        favorite: z.boolean().optional(),
        hidden: z.boolean().optional(),
        notes: z.string().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    applyLibraryUpsert(context.supabase, context.userId, data.media_id, data),
  );

// The client only supplies a title's external identity — never its metadata.
// The global `media` table is world-readable, so seeding it from client
// strings would let anyone poison shared rows; the handler provisions the
// row from the source API (TMDB / AniList) instead.
const MediaRefSchema = z.object({
  source: z.enum(["tmdb", "anilist", "jikan", "kitsu"]),
  media_type: z.enum(["movie", "tv", "anime", "manga"]),
  external_id: z.string().min(1).max(64),
});

/**
 * Save a library change addressed by the media's external identity
 * (source + external id) instead of the internal media id. The media row
 * is created on demand from authoritative API data — only when the user
 * actually saves something, never for items they merely browse.
 */
export const saveLibraryEntryByExternal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        item: MediaRefSchema,
        status: StatusEnum.optional(),
        rating: z.number().int().min(0).max(10).nullable().optional(),
        favorite: z.boolean().optional(),
        notes: z.string().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // 1. Ensure the media row exists, fetched from the source API (trusted).
    const { provisionMedia } = await import("@/lib/media-provision");
    const mediaId = await provisionMedia(data.item.media_type, data.item.source, data.item.external_id);

    // 2. Apply the library change (same path as upsertLibraryItem)
    return applyLibraryUpsert(context.supabase, context.userId, mediaId, data);
  });

export const removeLibraryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ media_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: item } = await context.supabase
      .from("user_media")
      .select("id")
      .eq("user_id", context.userId)
      .eq("media_id", data.media_id)
      .maybeSingle();
    if (item) {
      // Delete season progress first (non-critical)
      try {
        await context.supabase
          .from("user_seasons")
          .delete()
          .eq("user_media_id", item.id);
      } catch { /* season cleanup is non-critical */ }
    }
    const { error } = await context.supabase
      .from("user_media")
      .delete()
      .eq("user_id", context.userId)
      .eq("media_id", data.media_id);
    if (error) throw error;
    return { ok: true };
  });

export const getLibraryItem = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ media_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("user_media")
      .select("*")
      .eq("user_id", context.userId)
      .eq("media_id", data.media_id)
      .maybeSingle();
    return row;
  });

// Seasons ------------------------------------------------------------

export const listSeasonsWithProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ media_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: seasons, error: e1 } = await context.supabase
      .from("seasons")
      .select("id, season_number, name, episode_count, air_date, poster_url, overview")
      .eq("media_id", data.media_id)
      .order("season_number");
    if (e1) throw e1;
    interface SeasonRow {
      id: string;
      season_number: number;
      name: string | null;
      episode_count: number | null;
      air_date: string | null;
      poster_url: string | null;
      overview: string | null;
    }
    const typedSeasons = (seasons ?? []) as SeasonRow[];
    // Only fetch this user's progress for THIS media's seasons — not their
    // entire season history across every show.
    const seasonIds = typedSeasons.map((s) => s.id);
    let progress: Array<{ season_id: string; status: string }> = [];
    if (seasonIds.length > 0) {
      const { data: p, error: e2 } = await context.supabase
        .from("user_seasons")
        .select("season_id, status")
        .eq("user_id", context.userId)
        .in("season_id", seasonIds);
      if (e2) throw e2;
      progress = (p ?? []) as Array<{ season_id: string; status: string }>;
    }
    const map = new Map(progress.map((p) => [p.season_id, p.status]));
    return typedSeasons.map((s) => ({ ...s, status: map.get(s.id) ?? null }));
  });

export const setSeasonStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        media_id: z.string().uuid(),
        season_id: z.string().uuid(),
        status: StatusEnum,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // ensure user_media exists
    const um = await context.supabase
      .from("user_media")
      .select("id, status")
      .eq("user_id", context.userId)
      .eq("media_id", data.media_id)
      .maybeSingle();
    let umId = um.data?.id;
    let overallChanged = false;

    if (!umId) {
      const ins = await context.supabase
        .from("user_media")
        .insert({ user_id: context.userId, media_id: data.media_id, status: "watching" })
        .select("id")
        .single();
      if (ins.error) throw ins.error;
      umId = ins.data.id;
      overallChanged = true;
    }

    // Upsert the season status
    const { error } = await context.supabase.from("user_seasons").upsert(
      {
        user_id: context.userId,
        user_media_id: umId,
        season_id: data.season_id,
        status: data.status,
      },
      { onConflict: "user_id,season_id" },
    );
    if (error) throw error;

    // Series-level status (completed when every season is completed/skipped/
    // dropped, etc.) is maintained by the rollup_user_media_status DB
    // trigger — no JS rollup here anymore, so the two can't disagree.
    // Read the post-trigger status back so the client knows whether the
    // series-level status actually changed (drives its toast).
    const { data: after } = await context.supabase
      .from("user_media")
      .select("status")
      .eq("id", umId)
      .single();
    const seriesStatusChanged = (after?.status ?? null) !== (um.data?.status ?? null);

    // Log activity for status changes (non-critical). Only completed and
    // watching-type actions are activity-worthy — previously ANY non-
    // completed season action (planned/paused/skipped) logged
    // "started watching", which surfaced wrong entries in the feed.
    const seasonKind = data.status === "completed" ? "completed"
      : data.status === "watching" || data.status === "rewatching" ? "started"
      : null;
    if (seasonKind && (overallChanged || seriesStatusChanged || (data.status === "completed" && um.data?.status !== "completed"))) {
      try {
        await context.supabase.from("activity").insert({
          user_id: context.userId,
          kind: seasonKind,
          media_id: data.media_id,
        }).maybeSingle();
      } catch { /* activity logging is non-critical */ }
    }

    return { ok: true, overallChanged: overallChanged || seriesStatusChanged };
  });

// Stats ---------------------------------------------------------------

export interface ProfileStats {
  total: number;
  completed: number;
  watching: number;
  planned: number;
  favorites: number;
  movies: number;
  tv: number;
  anime: number;
  manga: number;
  completedMovies: number;
  completedTv: number;
  completedAnime: number;
  completedManga: number;
  completionPct: number;
  hoursWatched: number;
  favoriteGenres: Array<{ genre: string; count: number }>;
  topRatings: Array<{ title: string; rating: number; poster_url: string | null; media_id: string; media_type: string; source: string; external_id: string }>;
  currentStreak: number;
  longestStreak: number;
}

// Fallback for when the get_profile_stats RPC isn't deployed yet (the
// migration exists but supabase db push hasn't run). Same numbers as the
// SQL version, computed in JS from the raw rows.
async function computeStatsInJs(
  supabase: SupabaseClient,
  userId: string,
): Promise<Omit<ProfileStats, "currentStreak" | "longestStreak">> {
  const { data: rows, error } = await supabase
    .from("user_media")
    .select("status, rating, favorite, media:media_id(id, media_type, runtime, title, poster_url, source, external_id, genres, season_count)")
    .eq("user_id", userId);
  if (error) throw error;
  // Embedded `media:media_id(...)` is a to-one join, but the untyped client
  // models it as an array — double-cast to the real runtime shape.
  const list = (rows ?? []) as unknown as StatRow[];

  const total = list.length;
  const completed = list.filter((r) => r.status === "completed").length;
  return {
    total,
    completed,
    watching: list.filter((r) => r.status === "watching" || r.status === "rewatching").length,
    planned: list.filter((r) => r.status === "planned").length,
    favorites: list.filter((r) => r.favorite).length,
    movies: list.filter((r) => r.media?.media_type === "movie").length,
    tv: list.filter((r) => r.media?.media_type === "tv").length,
    anime: list.filter((r) => r.media?.media_type === "anime").length,
    manga: list.filter((r) => r.media?.media_type === "manga").length,
    completedMovies: list.filter((r) => r.status === "completed" && r.media?.media_type === "movie").length,
    completedTv: list.filter((r) => r.status === "completed" && r.media?.media_type === "tv").length,
    completedAnime: list.filter((r) => r.status === "completed" && r.media?.media_type === "anime").length,
    completedManga: list.filter((r) => r.status === "completed" && r.media?.media_type === "manga").length,
    completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
    hoursWatched: computeHoursWatched(list),
    favoriteGenres: computeFavoriteGenres(list),
    topRatings: list
      .filter((r) => r.rating != null && r.rating > 0)
      .map((r) => {
        const m = r.media;
        return {
          title: m?.title ?? "", rating: r.rating!, poster_url: m?.poster_url ?? null,
          media_id: m?.id ?? "", media_type: m?.media_type ?? "", source: m?.source ?? "",
          external_id: m?.external_id ?? "",
        };
      })
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 6),
  };
}

export const getStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Fast path: the get_profile_stats SQL function (single indexed scan).
    // Requires the 20260906130000 migration — if it isn't deployed yet the
    // RPC 404s, so fall back to in-JS aggregation instead of failing the
    // whole stats page.
    const [statsRes, activityRes] = await Promise.all([
      context.supabase.rpc("get_profile_stats", { p_user_id: context.userId }),
      context.supabase
        .from("activity")
        .select("created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    // PGRST202 = schemaCacheMiss (function not found) — migration not applied.
    const rpcMissing =
      statsRes.error &&
      (statsRes.error.code === "PGRST202" ||
        /get_profile_stats|schema cache|does not exist/i.test(statsRes.error.message ?? ""));
    if (statsRes.error && !rpcMissing) throw statsRes.error;

    const stats = rpcMissing || !statsRes.data
      ? await computeStatsInJs(context.supabase, context.userId)
      : (statsRes.data as Omit<ProfileStats, "currentStreak" | "longestStreak">);

    const { currentStreak, longestStreak } = computeStreaks(
      ((activityRes.data ?? []) as Array<{ created_at: string }>).map((a) => a.created_at),
    );

    return { ...stats, currentStreak, longestStreak } as ProfileStats;
  });
