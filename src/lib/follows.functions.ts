import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface FollowProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

// Follow a user
export const followUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { following_id: string }) => data)
  .handler(async ({ context, data }) => {
    const { error } = await (context.supabase as any)
      .from("follows")
      .insert({ follower_id: context.userId, following_id: data.following_id });
    if (error && error.code !== "23505") throw error;
    return { ok: true };
  });

// Unfollow a user
export const unfollowUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { following_id: string }) => data)
  .handler(async ({ context, data }) => {
    await (context.supabase as any)
      .from("follows")
      .delete()
      .eq("follower_id", context.userId)
      .eq("following_id", data.following_id);
    return { ok: true };
  });

// Check if current user follows a target user
export const isFollowing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { target_user_id: string }) => data)
  .handler(async ({ context, data }) => {
    const { count } = await (context.supabase as any)
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", context.userId)
      .eq("following_id", data.target_user_id);
    return (count ?? 0) > 0;
  });

// Get follower and following counts for a user
export const getFollowCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { user_id: string }) => data)
  .handler(async ({ context, data }) => {
    const [followerCount, followingCount] = await Promise.all([
      (context.supabase as any).from("follows").select("*", { count: "exact", head: true }).eq("following_id", data.user_id),
      (context.supabase as any).from("follows").select("*", { count: "exact", head: true }).eq("follower_id", data.user_id),
    ]);
    return {
      followers: followerCount.count ?? 0,
      following: followingCount.count ?? 0,
    };
  });

// Get followers list for a user
export const getFollowers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { user_id: string }) => data)
  .handler(async ({ context, data }) => {
    const { data: ids } = await (context.supabase as any)
      .from("follows")
      .select("follower_id")
      .eq("following_id", data.user_id)
      .order("created_at", { ascending: false });

    if (!ids || ids.length === 0) return [];
    const userIds = ids.map((r: any) => r.follower_id);
    const { data: profiles } = await (context.supabase as any)
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds);
    return (profiles ?? []) as FollowProfile[];
  });

// Get following list for a user
export const getFollowing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { user_id: string }) => data)
  .handler(async ({ context, data }) => {
    const { data: ids } = await (context.supabase as any)
      .from("follows")
      .select("following_id")
      .eq("follower_id", data.user_id)
      .order("created_at", { ascending: false });

    if (!ids || ids.length === 0) return [];
    const userIds = ids.map((r: any) => r.following_id);
    const { data: profiles } = await (context.supabase as any)
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds);
    return (profiles ?? []) as FollowProfile[];
  });
