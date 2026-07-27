import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Get friend IDs
    const { data: friendRows } = await context.supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${context.userId},addressee_id.eq.${context.userId}`);

    const friendIds = new Set<string>();
    if (friendRows) {
      for (const row of friendRows) {
        if (row.requester_id !== context.userId) friendIds.add(row.requester_id);
        if (row.addressee_id !== context.userId) friendIds.add(row.addressee_id);
      }
    }
    // Always include own activity
    friendIds.add(context.userId);

    if (friendIds.size === 0) return [];

    const { data: rows, error } = await context.supabase
      .from("activity")
      .select("id, kind, created_at, user_id, media:media_id(id, media_type, title, poster_url)")
      .in("user_id", Array.from(friendIds))
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;

    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds);
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    return rows.map((r) => ({ ...r, profile: pmap.get(r.user_id) }));
  });
