import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
    const { data: rows, error } = await context.supabase
      .from("notifications")
      .select("id, kind, payload, read_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    interface NotificationRow {
      id: string;
      kind: string;
      payload: Record<string, string> | null;
      read_at: string | null;
      created_at: string;
    }
    const notifications = (rows ?? []) as NotificationRow[];

    // Resolve friend notification payloads into friendly, human-readable messages.
    // Profile lookup is one batched .in() query over the distinct from_user_ids.
    const friendKinds = ["friend_request", "friend_accept"];
    const fromUserIds = Array.from(new Set(
      notifications
        .filter((n) => friendKinds.includes(n.kind))
        .map((n) => (n.payload?.from_user_id ?? ""))
        .filter(Boolean),
    ));

    let pmap = new Map<string, { username: string; display_name: string | null }>();
    if (fromUserIds.length > 0) {
      const { data: profiles, error: pErr } = await context.supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", fromUserIds);
      if (pErr) throw pErr;
      pmap = new Map((profiles ?? []).map((p: { id: string; username: string; display_name: string | null }) => [p.id, p]));
    }

    const enrich = (n: NotificationRow) => {
      const payload = (n.payload ?? {}) as Record<string, string | null>;
      const from = payload.from_user_id ? pmap.get(payload.from_user_id) : undefined;
      const name = from?.display_name || from?.username || "Someone";
      if (n.kind === "friend_request") return { ...n, payload: { ...payload, message: `${name} sent you a friend request` } };
      if (n.kind === "friend_accept") return { ...n, payload: { ...payload, message: `${name} accepted your friend request` } };
      return { ...n, payload };
    };

    return notifications.map(enrich);
    } catch (err) {
      console.error("[listNotifications] failed:", err);
      throw new Error(`listNotifications: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() })
      .refine((v) => v.id || v.all, { message: "id or all required" })
      .parse(input),
  )
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
    // Unread classic notifications + unread media recommendations make up
    // the badge count together.
    const [notifRes, recRes] = await Promise.all([
      context.supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .is("read_at", null),
      context.supabase
        .from("media_recommendations")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", context.userId)
        .eq("status", "unread")
        .gt("expires_at", new Date().toISOString()),
    ]);
    if (notifRes.error) throw notifRes.error;
    if (recRes.error) throw recRes.error;
    return (notifRes.count ?? 0) + (recRes.count ?? 0);
  });
