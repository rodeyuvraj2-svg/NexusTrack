import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!supabaseAdmin?.from) {
      throw new Error(
        "Account deletion requires SUPABASE_SERVICE_ROLE_KEY in your .env file. " +
        "Get it from your Supabase dashboard: Settings → API → service_role key"
      );
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw error;
    return { ok: true };
  });
