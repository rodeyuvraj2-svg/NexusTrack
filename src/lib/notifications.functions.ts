import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("notifications")
      .select("id, kind, payload, read_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    // Resolve friend notification payloads into friendly, human-readable messages.
    const friendKinds = ["friend_request", "friend_accept"];
    const fromUserIds = Array.from(new Set(
      (rows ?? [])
        .filter((n) => friendKinds.includes(n.kind))
        .map((n) => ((n.payload as Record<string, string> | null)?.from_user_id ?? ""))
        .filter(Boolean),
    ));

    let pmap = new Map<string, { username: string; display_name: string | null }>();
    if (fromUserIds.length > 0) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", fromUserIds);
      pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    }

    const enrich = (n: (typeof rows)[number]) => {
      const payload = (n.payload ?? {}) as Record<string, string | null>;
      const from = payload.from_user_id ? pmap.get(payload.from_user_id) : undefined;
      const name = from?.display_name || from?.username || "Someone";
      if (n.kind === "friend_request") return { ...n, payload: { ...payload, message: `${name} sent you a friend request` } };
      if (n.kind === "friend_accept") return { ...n, payload: { ...payload, message: `${name} accepted your friend request` } };
      return { ...n, payload };
    };

    return (rows ?? []).map(enrich);
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => {
    const v = input as { id?: string; all?: boolean };
    if (!v.id && !v.all) throw new Error("id or all required");
    return v;
  })
  .handler(async ({ data, context }) => {
    if (data.all) {
      const { error } = await context.supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", context.userId)
        .is("read_at", null);
      if (error) throw error;
    } else {
      const { error } = await context.supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", data.id!)
        .eq("user_id", context.userId);
      if (error) throw error;
    }
    return { ok: true };
  });

export const getUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw error;
    return count ?? 0;
  });
