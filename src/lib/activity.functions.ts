import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("activity")
      .select("id, kind, created_at, user_id, media:media_id(id, media_type, title, poster_url)")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds);
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    return rows.map((r) => ({ ...r, profile: pmap.get(r.user_id) }));
  });
