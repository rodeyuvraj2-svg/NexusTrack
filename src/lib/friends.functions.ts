import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Serializable profile shape shared by the friendship payloads — server
// functions validate serializability, so `unknown`/`any` values fail.
interface FriendProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export const listFriends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("friendships")
      .select("id, status, requester_id, addressee_id, created_at")
      .or(`requester_id.eq.${context.userId},addressee_id.eq.${context.userId}`)
      .order("created_at", { ascending: false });
    if (error) throw error;

    interface FriendshipRow {
      id: string;
      status: "pending" | "accepted" | "blocked";
      requester_id: string;
      addressee_id: string;
      created_at: string;
    }
    const friendRows = (rows ?? []) as FriendshipRow[];

    const otherIds = Array.from(new Set(friendRows.map((r) => (r.requester_id === context.userId ? r.addressee_id : r.requester_id))));
    if (otherIds.length === 0) return { accepted: [], incoming: [], outgoing: [] };

    // Profiles and library stats both depend only on the friendship rows —
    // fetch them in parallel instead of back-to-back roundtrips.
    const acceptedFriendIds = friendRows
      .filter((r) => r.status === "accepted")
      .map((r) => (r.requester_id === context.userId ? r.addressee_id : r.requester_id));

    const [profilesRes, statsRes] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", otherIds),
      acceptedFriendIds.length > 0
        ? context.supabase
            .from("user_media")
            .select("user_id, status, favorite, media:media_id(media_type)")
            .in("user_id", acceptedFriendIds)
        : Promise.resolve({ data: [] as Array<{ user_id: string; status: string; favorite: boolean; media: { media_type: string } | null }>, error: null }),
    ]);
    if (profilesRes.error) throw profilesRes.error;
    const pmap = new Map(
      (profilesRes.data ?? []).map((p: FriendProfileRow): [string, FriendProfileRow] => [p.id, p]),
    );

    interface FriendLibraryStats { watching: number; completed: number; planned: number; favorites: number; movies: number; tv: number; anime: number; }
    const libraryStats: Map<string, FriendLibraryStats> = new Map();
    for (const s of (statsRes.data ?? []) as Array<{ user_id: string; status: string; favorite: boolean; media: { media_type: string } | null }>) {
      const entry = libraryStats.get(s.user_id) ?? { watching: 0, completed: 0, planned: 0, favorites: 0, movies: 0, tv: 0, anime: 0 };
      if (s.status === "watching" || s.status === "rewatching") entry.watching++;
      if (s.status === "completed") entry.completed++;
      if (s.status === "planned") entry.planned++;
      if (s.favorite) entry.favorites++;
      const mediaType = s.media?.media_type;
      if (mediaType === "movie") entry.movies++;
      else if (mediaType === "tv") entry.tv++;
      else if (mediaType === "anime") entry.anime++;
      libraryStats.set(s.user_id, entry);
    }

    return {
      accepted: friendRows
        .filter((r) => r.status === "accepted")
        .map((r) => {
          const friendId = r.requester_id === context.userId ? r.addressee_id : r.requester_id;
          return { ...r, profile: pmap.get(friendId), library: libraryStats.get(friendId) ?? { watching: 0, completed: 0, planned: 0, favorites: 0 } };
        }),
      incoming: friendRows
        .filter((r) => r.status === "pending" && r.addressee_id === context.userId)
        .map((r) => ({ ...r, profile: pmap.get(r.requester_id) })),
      outgoing: friendRows
        .filter((r) => r.status === "pending" && r.requester_id === context.userId)
        .map((r) => ({ ...r, profile: pmap.get(r.addressee_id) })),
    };
  });

export const searchUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ q: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .ilike("username", `%${data.q}%`)
      .neq("id", context.userId)
      .limit(20);
    return rows ?? [];
  });

export const sendFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.user_id === context.userId) throw new Error("Cannot friend yourself");

    // Check for an existing friendship in EITHER direction.
    // The unique constraint is directional, so sending a request to someone
    // who already requested you would otherwise create a duplicate row.
    const { data: existing } = await context.supabase
      .from("friendships")
      .select("id, status, requester_id, addressee_id")
      .or(`and(requester_id.eq.${context.userId},addressee_id.eq.${data.user_id}),and(requester_id.eq.${data.user_id},addressee_id.eq.${context.userId})`)
      .maybeSingle();

    if (existing) {
      // Already friends — nothing to do.
      if (existing.status === "accepted") return { ok: true, status: "already_friends" };
      // I already sent a pending request — nothing to do.
      if (existing.requester_id === context.userId) return { ok: true, status: "pending" };
      // They requested me first — auto-accept instead of creating a duplicate.
      // (The DB trigger then creates the mutual follows.)
      const { error: acceptError } = await context.supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", existing.id)
        .eq("addressee_id", context.userId);
      if (acceptError) throw acceptError;
      return { ok: true, status: "accepted" };
    }

    const { error } = await context.supabase.from("friendships").insert({
      requester_id: context.userId,
      addressee_id: data.user_id,
      status: "pending",
    });
    // 23505 = unique constraint violation (duplicate friendship request)
    if (error && error.code !== "23505") throw error;
    return { ok: true, status: "sent" };
  });

export const respondFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid(), accept: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.accept) {
      const { error } = await context.supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", data.id)
        .eq("addressee_id", context.userId);
      if (error) throw error;
    } else {
      const { error } = await context.supabase.from("friendships").delete().eq("id", data.id);
      if (error) throw error;
    }
    return { ok: true };
  });

export const removeFriend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("friendships").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getPublicProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ username: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, bio, avatar_url, is_public")
      .eq("username", data.username.toLowerCase())
      .maybeSingle();
    if (!profile) return null;

    // Check visibility: own profile, public profile, or friend
    const isOwnProfile = profile.id === context.userId;
    const isPublic = profile.is_public;

    // Friendship check and library load are independent — run both in
    // parallel instead of a sequential waterfall. The library rows are only
    // returned when visibility allows, but the queries themselves overlap.
    const [friendRes, libraryRes] = await Promise.all([
      context.supabase
        .from("friendships")
        .select("status")
        .eq("status", "accepted")
        .or(`and(requester_id.eq.${context.userId},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${context.userId})`)
        .maybeSingle(),
      context.supabase
        .from("user_media")
        .select("id, status, rating, favorite, media:media_id(id, media_type, source, external_id, title, poster_url, release_year)")
        .eq("user_id", profile.id)
        .eq("hidden", false)
        .order("updated_at", { ascending: false })
        .limit(60),
    ]);
    const isFriend = !!friendRes.data;

    if (!isOwnProfile && !isPublic && !isFriend) {
      return { profile: { ...profile, username: "Private User", display_name: null, bio: null, avatar_url: null }, library: [], isPrivate: true };
    }

    return { profile, library: libraryRes.data ?? [], isPrivate: false };
  });

export const copyFromFriend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ media_id: z.string().uuid(), copy_status: z.boolean().default(true), copy_favorite: z.boolean().default(false), source_user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const src = await context.supabase
      .from("user_media")
      .select("status, favorite")
      .eq("user_id", data.source_user_id)
      .eq("media_id", data.media_id)
      .maybeSingle();
    const status = data.copy_status && src.data ? src.data.status : "planned";
    const favorite = data.copy_favorite && src.data ? src.data.favorite : false;
    const existing = await context.supabase
      .from("user_media")
      .select("id")
      .eq("user_id", context.userId)
      .eq("media_id", data.media_id)
      .maybeSingle();
    if (existing.data) return { ok: true, duplicate: true };
    const { error } = await context.supabase.from("user_media").insert({
      user_id: context.userId,
      media_id: data.media_id,
      status,
      favorite,
    });
    if (error) throw error;
    return { ok: true };
  });
