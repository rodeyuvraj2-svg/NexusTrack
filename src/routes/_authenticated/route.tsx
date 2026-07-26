import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Session is invalid/expired — clear it to prevent redirect loop
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: AppShell,
});
