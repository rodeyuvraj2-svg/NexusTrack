import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { loadGuestState } from "@/lib/guest";
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
      if (loadGuestState()) return { user: null, isGuest: true };
      // Only sign out for genuine auth failures (e.g. the refresh token was
      // revoked / is invalid). Transient network errors during a token
      // refresh must not destroy the local session — the user would be
      // logged out by a momentary offline blip. Redirecting to /auth is
      // fine either way; the login page will pick the session back up.
      const authFailure =
        !!error && /refresh|invalid|revoked|expired|bad.?jwt/i.test(error.message);
      if (authFailure) {
        await supabase.auth.signOut();
      }
      throw redirect({ to: "/auth" });
    }
    return { user: data.session.user, isGuest: false };
  },
  component: AppShell,
});
