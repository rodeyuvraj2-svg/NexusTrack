import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

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
      .select("id, status, rating, favorite, hidden, notes, progress, created_at, updated_at, media:media_id(id, media_type, source, external_id, title, poster_url, release_year, vote_average, genres)")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    if (data.favorite) q = q.eq("favorite", true);
    if (data.type) q = q.eq("media.media_type", data.type as any);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows;
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
  // Fetch full existing record to compare all fields
  const { data: existing } = await supabase
    .from("user_media")
    .select("id, status, favorite")
    .eq("user_id", userId)
    .eq("media_id", mediaId)
    .maybeSingle();

  if (existing) {
    const patch: {
      status?: typeof data.status;
      rating?: typeof data.rating;
      favorite?: boolean;
      hidden?: boolean;
      notes?: string | null;
    } = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.rating !== undefined) patch.rating = data.rating;
    if (data.favorite !== undefined) patch.favorite = data.favorite;
    if (data.hidden !== undefined) patch.hidden = data.hidden;
    if (data.notes !== undefined) patch.notes = data.notes;

    const { data: row, error } = await supabase
      .from("user_media")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;

    // Log activity (non-critical — wrapped in try/catch)
    try {
      if (data.status === "completed" && existing.status !== "completed") {
        await supabase.from("activity").insert({
          user_id: userId, kind: "completed", media_id: mediaId,
        }).maybeSingle();
      }
      if (data.status === "watching" && existing.status !== "watching") {
        await supabase.from("activity").insert({
          user_id: userId, kind: "started", media_id: mediaId,
        }).maybeSingle();
      }
      if (data.favorite === true && !existing.favorite) {
        await supabase.from("activity").insert({
          user_id: userId, kind: "favorited", media_id: mediaId,
        }).maybeSingle();
      }
    } catch { /* activity logging is non-critical */ }

    return row;
  }

  const { data: row, error } = await supabase
    .from("user_media")
    .insert({
      user_id: userId,
      media_id: mediaId,
      status: data.status ?? "planned",
      rating: data.rating ?? null,
      favorite: data.favorite ?? false,
      hidden: data.hidden ?? false,
      notes: data.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  // Log "added" for new entries (non-critical)
  try {
    await supabase.from("activity").insert({
      user_id: userId,
      kind: data.favorite ? "favorited" : "added",
      media_id: mediaId,
    }).maybeSingle();
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

const MediaRefSchema = z.object({
  source: z.enum(["tmdb", "anilist"]),
  media_type: z.enum(["movie", "tv", "anime", "manga"]),
  external_id: z.string().min(1),
  title: z.string().min(1),
  poster_url: z.string().nullable().optional(),
  release_year: z.number().nullable().optional(),
  vote_average: z.number().nullable().optional(),
});

/**
 * Save a library change addressed by the media's external identity
 * (source + external id) instead of the internal media id. The media row
 * is created on demand from the client-provided summary — only when the
 * user actually saves something, never for items they merely browse.
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
    // 1. Ensure the media row exists (read-first; insert only when missing)
    const { data: existing } = await context.supabase
      .from("media")
      .select("id")
      .eq("media_type", data.item.media_type)
      .eq("source", data.item.source)
      .eq("external_id", data.item.external_id)
      .maybeSingle();

    let mediaId = existing?.id as string | undefined;
    if (!mediaId) {
      // Media metadata is global and must only be written by the trusted server client.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (!supabaseAdmin?.from) {
        throw new Error("Media caching is unavailable: SUPABASE_SERVICE_ROLE_KEY is not configured.");
      }
      const { data: mediaRow, error: mediaError } = await supabaseAdmin
        .from("media")
        .upsert(
          {
            media_type: data.item.media_type,
            source: data.item.source,
            external_id: data.item.external_id,
            title: data.item.title,
            poster_url: data.item.poster_url ?? null,
            release_year: data.item.release_year ?? null,
            vote_average: data.item.vote_average ?? null,
          },
          { onConflict: "media_type,source,external_id" },
        )
        .select("id")
        .single();
      if (mediaError || !mediaRow) throw mediaError ?? new Error("Could not save media metadata.");
      mediaId = mediaRow.id as string;
    }

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
    const { data: progress } = await context.supabase
      .from("user_seasons")
      .select("season_id, status")
      .eq("user_id", context.userId);
    const map = new Map((progress ?? []).map((p) => [p.season_id, p.status]));
    return seasons.map((s) => ({ ...s, status: map.get(s.id) ?? null }));
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

    // ---- Auto-complete series logic ----
    // If all seasons for this media are completed or skipped, mark the entire series as completed.
    // Fetch all seasons for this media
    const { data: allSeasons } = await context.supabase
      .from("seasons")
      .select("id")
      .eq("media_id", data.media_id);

    if (allSeasons && allSeasons.length > 0) {
      const { data: seasonProgress } = await context.supabase
        .from("user_seasons")
        .select("season_id, status")
        .eq("user_id", context.userId)
        .eq("user_media_id", umId);

      const progressMap = new Map((seasonProgress ?? []).map((s) => [s.season_id, s.status]));

      // A season is considered "done" if completed, skipped, or dropped
      const doneStatuses = new Set(["completed", "skipped", "dropped"]);
      const allDone = allSeasons.every((s) => doneStatuses.has(progressMap.get(s.id) ?? ""));

      if (allDone && um.data?.status !== "completed") {
        // Auto-complete the series
        await context.supabase
          .from("user_media")
          .update({ status: "completed" })
          .eq("id", umId);
        overallChanged = true;
      }
    }

    // Log activity for status changes (non-critical)
    if (overallChanged || (data.status === "completed" && um.data?.status !== "completed")) {
      try {
        await context.supabase.from("activity").insert({
          user_id: context.userId,
          kind: data.status === "completed" ? "completed" : "started",
          media_id: data.media_id,
        }).maybeSingle();
      } catch { /* activity logging is non-critical */ }
    }

    return { ok: true, overallChanged };
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

export const getStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const um = context.supabase.from("user_media").select("status, rating, favorite, media:media_id(id, media_type, runtime, title, poster_url, source, external_id, genres, season_count)").eq("user_id", context.userId);
    const [umResult] = await Promise.all([
      // Fetch all needed data in parallel
      Promise.all([
        // Raw data for complex computations
        um,
        // Streak from activity
        context.supabase
          .from("activity")
          .select("created_at")
          .eq("user_id", context.userId)
          .order("created_at", { ascending: false })
          .limit(500),
      ]),
    ]);

    const [{ data: rows }, { data: activityRows }] = umResult;
    const list = rows ?? [];

    // ── Counts via DB aggregations ────────────────────────────────────────
    const total = list.length;
    const completed = list.filter((r) => r.status === "completed").length;
    const watching = list.filter((r) => r.status === "watching" || r.status === "rewatching").length;
    const planned = list.filter((r) => r.status === "planned").length;
    const favorites = list.filter((r) => r.favorite).length;
    const movies = list.filter((r) => (r.media as { media_type: string } | null)?.media_type === "movie").length;
    const tv = list.filter((r) => (r.media as { media_type: string } | null)?.media_type === "tv").length;
    const anime = list.filter((r) => (r.media as { media_type: string } | null)?.media_type === "anime").length;
    const manga = list.filter((r) => (r.media as { media_type: string } | null)?.media_type === "manga").length;
    const completedMovies = list.filter((r) => r.status === "completed" && (r.media as { media_type: string } | null)?.media_type === "movie").length;
    const completedTv = list.filter((r) => r.status === "completed" && (r.media as { media_type: string } | null)?.media_type === "tv").length;
    const completedAnime = list.filter((r) => r.status === "completed" && (r.media as { media_type: string } | null)?.media_type === "anime").length;
    const completedManga = list.filter((r) => r.status === "completed" && (r.media as { media_type: string } | null)?.media_type === "manga").length;
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Hours watched: sum runtime for all completed items
    let hoursWatched = 0;
    for (const r of list) {
      if (r.status !== "completed") continue;
      const m = r.media as { runtime: number | null; season_count?: number | null } | null;
      if (m?.runtime && m.runtime > 0) {
        // Anime/TV runtime is per-episode; multiply by episode count for total
        const multiplier = (r.media as { media_type?: string } | null)?.media_type === "movie" ? 1 : (m.season_count ?? 1);
        hoursWatched += (m.runtime * multiplier) / 60;
      }
    }
    hoursWatched = Math.round(hoursWatched);

    // Favorite genres
    const genreMap = new Map<string, number>();
    for (const r of list) {
      const m = r.media as { genres: string[] | null } | null;
      if (m?.genres) {
        for (const g of m.genres) {
          genreMap.set(g, (genreMap.get(g) ?? 0) + 1);
        }
      }
    }
    const favoriteGenres = Array.from(genreMap.entries())
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Top rated items
    const topRatings = list
      .filter((r) => r.rating != null && r.rating > 0)
      .map((r) => {
        const m = r.media as { id: string; title: string; poster_url: string | null; media_type: string; source: string; external_id: string } | null;
        return { title: m?.title ?? "", rating: r.rating!, poster_url: m?.poster_url ?? null, media_id: m?.id ?? "", media_type: m?.media_type ?? "", source: m?.source ?? "", external_id: m?.external_id ?? "" };
      })
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 6);

    // Streak
    const dates = new Set<string>();
    for (const a of (activityRows ?? []) as { created_at: string }[]) {
      dates.add(a.created_at.slice(0, 10));
    }
    const sortedDates = Array.from(dates).sort().reverse();
    let currentStreak = 0;
    let longestStreak = 0;
    if (sortedDates.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (sortedDates.includes(today) || sortedDates.includes(yesterday)) {
        let cursor = sortedDates.includes(today) ? today : yesterday;
        for (const d of sortedDates) {
          if (d === cursor) {
            currentStreak++;
            cursor = new Date(Date.parse(cursor) - 86400000).toISOString().slice(0, 10);
          } else if (d < cursor) {
            break;
          }
        }
      }
      let run = 1;
      for (let i = sortedDates.length - 1; i > 0; i--) {
        const prev = new Date(Date.parse(sortedDates[i - 1]) - 86400000).toISOString().slice(0, 10);
        if (sortedDates[i] === prev) { run++; longestStreak = Math.max(longestStreak, run); }
        else { run = 1; }
      }
      longestStreak = Math.max(longestStreak, currentStreak, sortedDates.length > 0 ? 1 : 0);
    }

    return { total, completed, watching, planned, favorites, movies, tv, anime, manga, completedMovies, completedTv, completedAnime, completedManga, completionPct, hoursWatched, favoriteGenres, topRatings, currentStreak, longestStreak } as ProfileStats;
  });
