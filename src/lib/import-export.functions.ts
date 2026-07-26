import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type WatchStatus = "watching" | "completed" | "planned" | "paused" | "dropped" | "skipped" | "rewatching";

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
      .select(`
        status, rating, favorite, hidden, notes, created_at, updated_at,
        media:media_id(title, media_type, source, external_id)
      `)
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []).map((r) => {
      const m = r.media as unknown as { title: string; media_type: string; source: string; external_id: string };
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
    });
  });

export const importLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({
      items: z.array(z.object({
        title: z.string(),
        media_type: z.string(),
        source: z.string(),
        external_id: z.string(),
        status: z.string().optional(),
        rating: z.number().nullable().optional(),
        favorite: z.boolean().optional(),
      })),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let imported = 0;
    let skipped = 0;

    for (const item of data.items) {
      const existing = await context.supabase
        .from("media")
        .select("id")
        .eq("media_type", item.media_type as "movie" | "tv" | "anime")
        .eq("source", item.source)
        .eq("external_id", item.external_id)
        .maybeSingle();

      const mediaId = existing.data?.id;
      if (!mediaId) { skipped++; continue; }

      const dup = await context.supabase
        .from("user_media")
        .select("id")
        .eq("user_id", context.userId)
        .eq("media_id", mediaId)
        .maybeSingle();
      if (dup.data) { skipped++; continue; }

      const { error } = await context.supabase.from("user_media").insert({
        user_id: context.userId,
        media_id: mediaId,
        status: (item.status as WatchStatus) ?? "planned",
        rating: item.rating ?? null,
        favorite: item.favorite ?? false,
      });
      if (!error) imported++;
      else skipped++;
    }

    return { imported, skipped };
  });
