import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listFriends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("friendships")
      .select("id, status, requester_id, addressee_id, created_at")
      .or(`requester_id.eq.${context.userId},addressee_id.eq.${context.userId}`)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const otherIds = Array.from(new Set(rows.map((r) => (r.requester_id === context.userId ? r.addressee_id : r.requester_id))));
    if (otherIds.length === 0) return { accepted: [], incoming: [], outgoing: [] };
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", otherIds);
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

    // Fetch library stats for accepted friends
    const acceptedFriendIds = rows
      .filter((r) => r.status === "accepted")
      .map((r) => (r.requester_id === context.userId ? r.addressee_id : r.requester_id));
    interface FriendLibraryStats { watching: number; completed: number; planned: number; favorites: number; movies: number; tv: number; anime: number; }
    let libraryStats: Map<string, FriendLibraryStats> = new Map();
    if (acceptedFriendIds.length > 0) {
      const { data: stats } = await context.supabase
        .from("user_media")
        .select("user_id, status, favorite, media:media_id(media_type)")
        .in("user_id", acceptedFriendIds);
      for (const s of stats ?? []) {
        const entry = libraryStats.get(s.user_id) ?? { watching: 0, completed: 0, planned: 0, favorites: 0, movies: 0, tv: 0, anime: 0 };
        if (s.status === "watching" || s.status === "rewatching") entry.watching++;
        if (s.status === "completed") entry.completed++;
        if (s.status === "planned") entry.planned++;
        if (s.favorite) entry.favorites++;
        const mediaType = (s.media as unknown as { media_type?: string } | null)?.media_type;
        if (mediaType === "movie") entry.movies++;
        else if (mediaType === "tv") entry.tv++;
        else if (mediaType === "anime") entry.anime++;
        libraryStats.set(s.user_id, entry);
      }
    }

    return {
      accepted: rows
        .filter((r) => r.status === "accepted")
        .map((r) => {
          const friendId = r.requester_id === context.userId ? r.addressee_id : r.requester_id;
          return { ...r, profile: pmap.get(friendId), library: libraryStats.get(friendId) ?? { watching: 0, completed: 0, planned: 0, favorites: 0 } };
        }),
      incoming: rows
        .filter((r) => r.status === "pending" && r.addressee_id === context.userId)
        .map((r) => ({ ...r, profile: pmap.get(r.requester_id) })),
      outgoing: rows
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
    const { error } = await context.supabase.from("friendships").insert({
      requester_id: context.userId,
      addressee_id: data.user_id,
      status: "pending",
    });
    // 23505 = unique constraint violation (duplicate friendship request)
    if (error && error.code !== "23505") throw error;
    return { ok: true };
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
    const { data: friendRow } = await context.supabase
      .from("friendships")
      .select("status")
      .eq("status", "accepted")
      .or(`and(requester_id.eq.${context.userId},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${context.userId})`)
      .maybeSingle();
    const isFriend = !!friendRow;

    if (!isOwnProfile && !isPublic && !isFriend) {
      return { profile: { ...profile, username: "Private User", display_name: null, bio: null, avatar_url: null }, library: [], isPrivate: true };
    }

    const { data: library } = await context.supabase
      .from("user_media")
      .select("id, status, rating, favorite, media:media_id(id, media_type, source, external_id, title, poster_url, release_year)")
      .eq("user_id", profile.id)
      .eq("hidden", false)
      .order("updated_at", { ascending: false })
      .limit(60);
    return { profile, library: library ?? [], isPrivate: false };
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
