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
    return rows ?? [];
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
