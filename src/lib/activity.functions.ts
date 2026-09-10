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
      .select("id, kind, created_at, user_id, media:media_id(id, media_type, source, external_id, title, poster_url)")
      .in("user_id", Array.from(friendIds))
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;

    interface ActivityRow {
      id: string;
      kind: string;
      created_at: string;
      user_id: string;
      media: { id: string; media_type: string; source: string; external_id: string; title: string; poster_url: string | null } | null;
    }
    const typedRows = (rows ?? []) as ActivityRow[];

    const userIds = Array.from(new Set(typedRows.map((r) => r.user_id)));
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds);
    // Typed tuple so the Map values stay serializable (server functions
    // reject `unknown`), and so `p` isn't implicit any.
    interface ProfileRow { id: string; username: string; display_name: string | null; avatar_url: string | null }
    const pmap = new Map((profiles ?? []).map((p: ProfileRow): [string, ProfileRow] => [p.id, p]));
    return typedRows.map((r) => ({ ...r, profile: pmap.get(r.user_id) }));
  });
