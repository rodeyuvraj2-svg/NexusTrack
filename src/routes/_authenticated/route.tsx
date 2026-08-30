import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession() normally resolves instantly from local storage. But while
    // supabase-js refreshes an expired access token it holds the navigator
    // lock — if that refresh hangs, getSession blocks forever and every
    // navigation would hang with it. Race it with a timeout so route
    // transitions always proceed; server functions validate tokens
    // independently, so rendering with a null user is safe.
    const session = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);

    if (!session) {
      // Timed out (stuck token refresh) — let the page render
      return { user: null, isGuest: false };
    }

    const { data, error } = session;
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
