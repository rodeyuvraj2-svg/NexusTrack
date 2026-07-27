import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Check if guest mode is active before redirecting
      try {
        const isGuest = localStorage.getItem("nt_guest") === "true";
        if (isGuest) return { user: null, isGuest: true };
      } catch {
        // localStorage unavailable — redirect to auth
      }
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    return { user: data.user, isGuest: false };
  },
  component: AppShell,
});
