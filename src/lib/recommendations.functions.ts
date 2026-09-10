import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  RecommendationError,
  RECOMMENDATION_MESSAGE_MAX,
  assertNotFallbackMedia,
  assertNotSelf,
  assertNoDuplicate,
  canDeleteRecommendation,
  canDismiss,
  canUpdateRecommendation,
  defaultExpiresAt,
  isExpired,
  isRecommendableRecipient,
  nextStatusAfterRead,
  type RecommendationRecord,
} from "./recommendation-logic";

// ---- Shared types (serializable server-fn payloads) ----

export interface RecommendableUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface RecommendationItem {
  id: string;
  message: string | null;
  status: "unread" | "read" | "dismissed";
  created_at: string;
  read_at: string | null;
  sender: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
  recipient_id: string;
  media: {
    id: string;
    media_type: "movie" | "tv" | "anime" | "manga";
    source: "tmdb" | "anilist" | "jikan" | "kitsu";
    external_id: string;
    title: string;
    poster_url: string | null;
  } | null;
}

interface FriendshipEdge { requester_id: string; addressee_id: string }
interface FollowEdge { follower_id: string; following_id: string }

/**
 * Users the given user may recommend to: accepted friends (either
 * direction) plus followed/following users (either direction) — the same
 * relationship model the friends page uses.
 */
async function loadRelatedUserIds(supabase: any, userId: string): Promise<Set<string>> {
  const [friendsRes, followsRes] = await Promise.all([
    supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    supabase
      .from("follows")
      .select("follower_id, following_id")
      .or(`follower_id.eq.${userId},following_id.eq.${userId}`),
  ]);
  if (friendsRes.error) throw friendsRes.error;
  if (followsRes.error) throw followsRes.error;

  const ids = new Set<string>();
  for (const r of (friendsRes.data ?? []) as FriendshipEdge[]) {
    ids.add(r.requester_id === userId ? r.addressee_id : r.requester_id);
  }
  for (const r of (followsRes.data ?? []) as FollowEdge[]) {
    if (r.follower_id !== userId) ids.add(r.follower_id);
    if (r.following_id !== userId) ids.add(r.following_id);
  }
  ids.delete(userId);
  return ids;
}

const MediaRefSchema = z.object({
  source: z.enum(["tmdb", "anilist", "jikan", "kitsu"]),
  media_type: z.enum(["movie", "tv", "anime", "manga"]),
  external_id: z.string().min(1).max(64),
});

// ---- Create ----

export const createRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        recipient_id: z.string().uuid(),
        message: z.string().trim().max(RECOMMENDATION_MESSAGE_MAX).optional(),
        // Client-side demo rows (provider outage placeholders) are rejected;
        // real enforcement is provisioning — only trusted source-API data
        // ever reaches the global media table.
        is_fallback: z.boolean().optional(),
        media: MediaRefSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    assertNotFallbackMedia(data.is_fallback);
    assertNotSelf(context.userId, data.recipient_id);

    const related = await loadRelatedUserIds(context.supabase, context.userId);
    if (!isRecommendableRecipient(related, data.recipient_id)) {
      throw new RecommendationError("You can only recommend media to friends or people you follow.");
    }

    // Trusted provisioning: fetch authoritative metadata from the source
    // API — never client-supplied strings (world-readable shared table).
    const { provisionMedia } = await import("@/lib/media-provision");
    const mediaId = await provisionMedia(data.media.media_type, data.media.source, data.media.external_id);

    // Duplicate guard (the partial unique index is the hard guarantee).
    const { data: dup } = await context.supabase
      .from("media_recommendations")
      .select("id, sender_id, recipient_id, status")
      .eq("sender_id", context.userId)
      .eq("recipient_id", data.recipient_id)
      .eq("media_id", mediaId)
      .neq("status", "dismissed")
      .maybeSingle();
    assertNoDuplicate(dup as RecommendationRecord | null);

    const { data: row, error } = await context.supabase
      .from("media_recommendations")
      .insert({
        sender_id: context.userId,
        recipient_id: data.recipient_id,
        media_id: mediaId,
        media_type: data.media.media_type as any,
        source: data.media.source,
        external_id: data.media.external_id,
        message: data.message ?? null,
        expires_at: defaultExpiresAt(),
      })
      .select("id")
      .single();
    if (error) {
      // 23505: lost the race against the unique active-recommendation index.
      if (error.code === "23505") throw new RecommendationError("You already recommended this to that user.");
      throw error;
    }
    return { id: row.id as string };
  });

// ---- List ----
// Deliberately validator-less GET+middleware functions (the exact shape of
// listNotifications): one per "box", instead of a single fn with a
// `box` param validated through a zod default.

export const listReceivedRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("media_recommendations")
      .select(`
        id, message, status, created_at, read_at, expires_at, recipient_id, sender_id,
        media:media_id(id, media_type, source, external_id, title, poster_url)
      `)
      .eq("recipient_id", context.userId)
      .neq("status", "dismissed")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return mapRecommendationRows(context.supabase, rows);
  });

export const listSentRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("media_recommendations")
      .select(`
        id, message, status, created_at, read_at, expires_at, recipient_id, sender_id,
        media:media_id(id, media_type, source, external_id, title, poster_url)
      `)
      .eq("sender_id", context.userId)
      .neq("status", "dismissed")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return mapRecommendationRows(context.supabase, rows);
  });

/**
 * Shared row-mapping for the two list functions. sender_id references
 * auth.users, NOT public.profiles, so an embedded join can't reach
 * username/avatar — senders are resolved with a second batched profiles
 * query (same pattern as follows.functions).
 */
async function mapRecommendationRows(supabase: any, rows: unknown): Promise<RecommendationItem[]> {
  // Embedded to-one joins arrive untyped (and modeled as arrays by the
  // untyped client) — normalize to the serializable item shape.
  const raw = (rows ?? []) as unknown as Array<{
    id: string;
    message: string | null;
    status: RecommendationItem["status"];
    created_at: string;
    read_at: string | null;
    expires_at: string;
    recipient_id: string;
    sender_id: string;
    media: { id: string; media_type: string; source: string; external_id: string; title: string; poster_url: string | null } | null;
  }>;

  const senderIds = Array.from(new Set(raw.map((r) => r.sender_id)));
  let pmap = new Map<string, RecommendableUser>();
  if (senderIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", senderIds);
    if (pErr) throw pErr;
    pmap = new Map((profiles ?? []).map((p: RecommendableUser): [string, RecommendableUser] => [p.id, p]));
  }

  return raw
    .filter((r) => !isExpired({ expires_at: r.expires_at }))
    .map((r) => ({
      id: r.id,
      message: r.message,
      status: r.status,
      created_at: r.created_at,
      read_at: r.read_at,
      recipient_id: r.recipient_id,
      sender: pmap.get(r.sender_id) ?? null,
      media: r.media
        ? {
            id: r.media.id,
            media_type: r.media.media_type as "movie" | "tv" | "anime" | "manga",
            source: r.media.source as "tmdb" | "anilist" | "jikan" | "kitsu",
            external_id: r.media.external_id,
            title: r.media.title,
            poster_url: r.media.poster_url ?? null,
          }
        : null,
    }));
}

// ---- Mark read / dismiss / delete ----

export const markRecommendationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rec, error } = await context.supabase
      .from("media_recommendations")
      .select("id, sender_id, recipient_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!rec) throw new RecommendationError("Recommendation not found.");
    if (!canUpdateRecommendation(context.userId, rec as RecommendationRecord)) {
      throw new RecommendationError("Only the recipient can mark a recommendation as read.");
    }
    const next = nextStatusAfterRead((rec as RecommendationRecord).status);
    if (!next) return { ok: true }; // already read/dismissed — idempotent
    const { error: updateError } = await context.supabase
      .from("media_recommendations")
      .update({ status: "read", read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("recipient_id", context.userId);
    if (updateError) throw updateError;
    return { ok: true };
  });

export const dismissRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rec, error } = await context.supabase
      .from("media_recommendations")
      .select("id, sender_id, recipient_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!rec) throw new RecommendationError("Recommendation not found.");
    if (!canUpdateRecommendation(context.userId, rec as RecommendationRecord)) {
      throw new RecommendationError("Only the recipient can dismiss a recommendation.");
    }
    if (!canDismiss((rec as RecommendationRecord).status)) return { ok: true };
    const { error: updateError } = await context.supabase
      .from("media_recommendations")
      .update({ status: "dismissed" })
      .eq("id", data.id)
      .eq("recipient_id", context.userId);
    if (updateError) throw updateError;
    return { ok: true };
  });

export const deleteRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rec, error } = await context.supabase
      .from("media_recommendations")
      .select("id, sender_id, recipient_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!rec) throw new RecommendationError("Recommendation not found.");
    if (!canDeleteRecommendation(context.userId, rec as RecommendationRecord)) {
      throw new RecommendationError("You can only delete recommendations you sent or received.");
    }
    // Hard delete — the RLS DELETE policy double-enforces ownership.
    const { error: deleteError } = await context.supabase
      .from("media_recommendations")
      .delete()
      .eq("id", data.id);
    if (deleteError) throw deleteError;
    return { ok: true };
  });

// ---- Recipient picker ----

export const listRecommendableUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ids = await loadRelatedUserIds(context.supabase, context.userId);
    if (ids.size === 0) return [] as RecommendableUser[];
    const { data: profiles, error } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", Array.from(ids));
    if (error) throw error;
    return (profiles ?? []) as RecommendableUser[];
  });
