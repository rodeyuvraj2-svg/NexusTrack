import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type WatchStatus =
  | "watching"
  | "completed"
  | "planned"
  | "paused"
  | "dropped"
  | "skipped"
  | "rewatching";

export interface ExportRow {
  title: string;
  media_type: string;
  source: string;
  external_id: string;
  status: string;
  rating: number | null;
  favorite: boolean;
  hidden: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const exportLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("user_media")
      .select(
        `
        status, rating, favorite, hidden, notes, created_at, updated_at,
        media:media_id(title, media_type, source, external_id)
      `,
      )
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []).map(
      (r: {
        status: string;
        rating: number | null;
        favorite: boolean;
        hidden: boolean;
        notes: string | null;
        created_at: string;
        updated_at: string;
        media: { title: string; media_type: string; source: string; external_id: string } | null;
      }) => {
        const m = r.media;
        return {
          title: m?.title ?? "",
          media_type: m?.media_type ?? "",
          source: m?.source ?? "",
          external_id: m?.external_id ?? "",
          status: r.status,
          rating: r.rating,
          favorite: r.favorite,
          hidden: r.hidden,
          notes: r.notes,
          created_at: r.created_at,
          updated_at: r.updated_at,
        } as ExportRow;
      },
    );
  });

export const importLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        // Same enums the rest of the app uses — a bad status/media_type in an
        // import file must fail validation, not get cast into the DB.
        items: z
          .array(
            z.object({
              title: z.string().min(1).max(300),
              media_type: z.enum(["movie", "tv", "anime", "manga"]),
              source: z.enum(["tmdb", "anilist", "jikan", "kitsu"]),
              external_id: z.string().min(1).max(64),
              status: z
                .enum([
                  "watching",
                  "completed",
                  "planned",
                  "paused",
                  "dropped",
                  "skipped",
                  "rewatching",
                ])
                .optional(),
              rating: z.number().int().min(0).max(10).nullable().optional(),
              favorite: z.boolean().optional(),
            }),
          )
          .max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let imported = 0;
    let skipped = 0;

    // Batched instead of N+1: fetch all matching media rows in one query
    // (PostgREST can OR across media_type/source/external_id via `or()`),
    // then insert every new user_media row in one upsert.
    const BATCH = 50;
    for (let i = 0; i < data.items.length; i += BATCH) {
      const batch = data.items.slice(i, i + BATCH);
      const orFilter = batch
        .map(
          (it) =>
            `and(media_type.eq.${it.media_type},source.eq.${it.source},external_id.eq.${it.external_id})`,
        )
        .join(",");
      const { data: mediaRows, error: mediaError } = await context.supabase
        .from("media")
        .select("id, media_type, source, external_id")
        .or(orFilter);
      if (mediaError) throw mediaError;

      const idByKey = new Map(
        (mediaRows ?? []).map(
          (m: { id: string; media_type: string; source: string; external_id: string }) => [
            `${m.media_type}|${m.source}|${m.external_id}`,
            m.id,
          ],
        ),
      );

      // Existing entries for these media ids — upsert on (user_id, media_id)
      // makes re-imports idempotent, but skip already-present rows entirely
      // so we don't overwrite newer local edits on re-import.
      const mediaIds = [...idByKey.values()];
      const { data: existing, error: existingError } = mediaIds.length
        ? await context.supabase
            .from("user_media")
            .select("media_id")
            .eq("user_id", context.userId)
            .in("media_id", mediaIds)
        : { data: [], error: null };
      if (existingError) throw existingError;
      const alreadyPresent = new Set((existing ?? []).map((r: { media_id: string }) => r.media_id));

      const toInsert = batch.flatMap((it) => {
        const mediaId = idByKey.get(`${it.media_type}|${it.source}|${it.external_id}`);
        if (!mediaId || alreadyPresent.has(mediaId)) return [];
        return [
          {
            user_id: context.userId,
            media_id: mediaId,
            status: (it.status as WatchStatus) ?? "planned",
            rating: it.rating ?? null,
            favorite: it.favorite ?? false,
          },
        ];
      });

      const totalBatch = batch.length;
      if (toInsert.length > 0) {
        const { error: insertError } = await context.supabase
          .from("user_media")
          .upsert(toInsert, { onConflict: "user_id,media_id" });
        if (insertError) throw insertError;
        imported += toInsert.length;
      }
      skipped += totalBatch - toInsert.length;
    }

    return { imported, skipped };
  });
