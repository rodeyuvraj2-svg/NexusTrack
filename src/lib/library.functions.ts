import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const StatusEnum = z.enum(["watching", "completed", "planned", "paused", "dropped", "skipped", "rewatching"]);

export const listLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: StatusEnum.optional(),
        type: z.enum(["movie", "tv", "anime"]).optional(),
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
    const { data: rows, error } = await q;
    if (error) throw error;
    const filtered = data.type ? rows.filter((r) => (r.media as unknown as { media_type: string })?.media_type === data.type) : rows;
    return filtered;
  });

export const upsertLibraryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
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
  .handler(async ({ data, context }) => {
    const existing = await context.supabase
      .from("user_media")
      .select("id")
      .eq("user_id", context.userId)
      .eq("media_id", data.media_id)
      .maybeSingle();
    if (existing.data) {
      const patch: Record<string, unknown> = {};
      if (data.status !== undefined) patch.status = data.status;
      if (data.rating !== undefined) patch.rating = data.rating;
      if (data.favorite !== undefined) patch.favorite = data.favorite;
      if (data.hidden !== undefined) patch.hidden = data.hidden;
      if (data.notes !== undefined) patch.notes = data.notes;
      const { data: row, error } = await context.supabase
        .from("user_media")
        .update(patch)
        .eq("id", existing.data.id)
        .select("*")
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("user_media")
      .insert({
        user_id: context.userId,
        media_id: data.media_id,
        status: data.status ?? "planned",
        rating: data.rating ?? null,
        favorite: data.favorite ?? false,
        hidden: data.hidden ?? false,
        notes: data.notes ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    // log activity
    await context.supabase.from("activity").insert({
      user_id: context.userId,
      kind: "added",
      media_id: data.media_id,
    });
    return row;
  });

export const removeLibraryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ media_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
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
  .inputValidator((input) => z.object({ media_id: z.string().uuid() }).parse(input))
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
  .inputValidator((input) => z.object({ media_id: z.string().uuid() }).parse(input))
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
  .inputValidator((input) =>
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
      .select("id")
      .eq("user_id", context.userId)
      .eq("media_id", data.media_id)
      .maybeSingle();
    let umId = um.data?.id;
    if (!umId) {
      const ins = await context.supabase
        .from("user_media")
        .insert({ user_id: context.userId, media_id: data.media_id, status: "watching" })
        .select("id")
        .single();
      if (ins.error) throw ins.error;
      umId = ins.data.id;
    }
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
    return { ok: true };
  });

// Stats ---------------------------------------------------------------

export const getStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows } = await context.supabase
      .from("user_media")
      .select("status, media:media_id(media_type, runtime)")
      .eq("user_id", context.userId);
    const list = rows ?? [];
    const total = list.length;
    const completed = list.filter((r) => r.status === "completed").length;
    const watching = list.filter((r) => r.status === "watching" || r.status === "rewatching").length;
    const movies = list.filter((r) => (r.media as unknown as { media_type: string })?.media_type === "movie").length;
    const tv = list.filter((r) => (r.media as unknown as { media_type: string })?.media_type === "tv").length;
    const anime = list.filter((r) => (r.media as unknown as { media_type: string })?.media_type === "anime").length;
    return { total, completed, watching, movies, tv, anime };
  });
