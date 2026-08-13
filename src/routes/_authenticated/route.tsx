import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Use getSession() (reads local storage, no network) instead of getUser()
    // (which makes a live Supabase request and can stall indefinitely locally).
    // Server-side route functions validate tokens independently via requireSupabaseAuth.
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      // Check if guest mode is active before redirecting
      try {
        if (typeof window !== "undefined") {
          const isGuest = localStorage.getItem("nt_guest") === "true";
          if (isGuest) return { user: null, isGuest: true };
        }
      } catch {
        // localStorage unavailable — redirect to auth
      }
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    return { user: data.session.user, isGuest: false };
  },
  component: AppShell,
});
