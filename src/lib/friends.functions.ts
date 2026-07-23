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

    return {
      accepted: rows
        .filter((r) => r.status === "accepted")
        .map((r) => ({ ...r, profile: pmap.get(r.requester_id === context.userId ? r.addressee_id : r.requester_id) })),
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
  .inputValidator((input) => z.object({ q: z.string().min(1) }).parse(input))
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
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.user_id === context.userId) throw new Error("Cannot friend yourself");
    const { error } = await context.supabase.from("friendships").insert({
      requester_id: context.userId,
      addressee_id: data.user_id,
      status: "pending",
    });
    if (error && !error.message.includes("duplicate")) throw error;
    return { ok: true };
  });

export const respondFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), accept: z.boolean() }).parse(input))
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
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("friendships").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getPublicProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ username: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, bio, avatar_url, is_public")
      .eq("username", data.username.toLowerCase())
      .maybeSingle();
    if (!profile) return null;
    const { data: library } = await context.supabase
      .from("user_media")
      .select("id, status, rating, favorite, media:media_id(id, media_type, title, poster_url, release_year)")
      .eq("user_id", profile.id)
      .eq("hidden", false)
      .order("updated_at", { ascending: false })
      .limit(60);
    return { profile, library: library ?? [] };
  });

export const copyFromFriend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ media_id: z.string().uuid(), copy_status: z.boolean().default(true), copy_favorite: z.boolean().default(false), source_user_id: z.string().uuid() }).parse(input))
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
