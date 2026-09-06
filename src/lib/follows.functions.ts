import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface FollowProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

const uuid = z.string().uuid();

// Follow a user
export const followUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ following_id: uuid }).parse(input))
  .handler(async ({ context, data }) => {
    if (data.following_id === context.userId) throw new Error("Cannot follow yourself");
    const { error } = await context.supabase
      .from("follows")
      .insert({ follower_id: context.userId, following_id: data.following_id });
    // 23505 = unique_violation — already following, treat as success
    if (error && error.code !== "23505") throw error;
    return { ok: true };
  });

// Unfollow a user
export const unfollowUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ following_id: uuid }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("follows")
      .delete()
      .eq("follower_id", context.userId)
      .eq("following_id", data.following_id);
    if (error) throw error;
    return { ok: true };
  });

// Check if current user follows a target user
export const isFollowing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ target_user_id: uuid }).parse(input))
  .handler(async ({ context, data }) => {
    const { count, error } = await context.supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", context.userId)
      .eq("following_id", data.target_user_id);
    if (error) throw error;
    return (count ?? 0) > 0;
  });

// Get follower and following counts for a user
export const getFollowCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ user_id: uuid }).parse(input))
  .handler(async ({ context, data }) => {
    const [followerCount, followingCount] = await Promise.all([
      context.supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", data.user_id),
      context.supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", data.user_id),
    ]);
    if (followerCount.error) throw followerCount.error;
    if (followingCount.error) throw followingCount.error;
    return {
      followers: followerCount.count ?? 0,
      following: followingCount.count ?? 0,
    };
  });

/**
 * Everything a profile header needs about the follow graph in ONE server
 * call: both counts plus whether the current user follows the target.
 * Replaces the previous counts + isFollowing pair of roundtrips.
 */
export const getFollowState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ user_id: uuid }).parse(input))
  .handler(async ({ context, data }) => {
    const [followerCount, followingCount, isFollowing] = await Promise.all([
      context.supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", data.user_id),
      context.supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", data.user_id),
      // head:true returns no rows — the answer is in `count`, so it must be
      // requested explicitly (a bare head query leaves count undefined and
      // makes this always read as "not following").
      context.supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("follower_id", context.userId)
        .eq("following_id", data.user_id),
    ]);
    if (followerCount.error) throw followerCount.error;
    if (followingCount.error) throw followingCount.error;
    if (isFollowing.error) throw isFollowing.error;
    return {
      followers: followerCount.count ?? 0,
      following: followingCount.count ?? 0,
      isFollowing: (isFollowing.count ?? 0) > 0,
    };
  });

// Get followers list for a user.
// Two queries (ids, then profiles): follows' FKs reference auth.users, not
// public.profiles, so a single embedded join can't traverse to profiles.
interface FollowProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export const getFollowers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ user_id: uuid }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("follows")
      .select("follower_id")
      .eq("following_id", data.user_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const userIds = (rows ?? []).map((r) => r.follower_id);
    if (userIds.length === 0) return [] as FollowProfileRow[];
    const { data: profiles, error: profilesError } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds);
    if (profilesError) throw profilesError;
    return (profiles ?? []) as FollowProfileRow[];
  });

// Get following list for a user (same two-step pattern).
export const getFollowing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ user_id: uuid }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", data.user_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const userIds = (rows ?? []).map((r) => r.following_id);
    if (userIds.length === 0) return [] as FollowProfileRow[];
    const { data: profiles, error: profilesError } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds);
    if (profilesError) throw profilesError;
    return (profiles ?? []) as FollowProfileRow[];
  });
