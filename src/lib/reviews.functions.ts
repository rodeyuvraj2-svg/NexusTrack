import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ media_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("reviews")
      .select("id, body, likes, created_at, updated_at, user_id")
      .eq("media_id", data.media_id)
      .order("likes", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    if (userIds.length === 0) return [];
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds);
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

    // Check which reviews the current user has liked
    const { data: myLikes } = await context.supabase
      .from("review_likes")
      .select("review_id")
      .eq("user_id", context.userId)
      .in("review_id", (rows ?? []).map((r) => r.id));

    const likedSet = new Set((myLikes ?? []).map((l) => l.review_id));

    return (rows ?? []).map((r) => ({
      ...r,
      profile: pmap.get(r.user_id),
      liked_by_me: likedSet.has(r.id),
    }));
  });

export const upsertReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ media_id: z.string().uuid(), body: z.string().min(1).max(1000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("reviews")
      .upsert(
        { user_id: context.userId, media_id: data.media_id, body: data.body },
        { onConflict: "user_id,media_id" },
      )
      .select("id, body, likes, created_at, updated_at, user_id")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("reviews")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const toggleReviewLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ review_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const existing = await context.supabase
      .from("review_likes")
      .select("id")
      .eq("review_id", data.review_id)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing.data) {
      const { error } = await context.supabase
        .from("review_likes")
        .delete()
        .eq("id", existing.data.id);
      if (error) throw error;
      return { liked: false };
    }

    const { error } = await context.supabase
      .from("review_likes")
      .insert({ review_id: data.review_id, user_id: context.userId });
    if (error) throw error;
    return { liked: true };
  });
