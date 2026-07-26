import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — NexusTrack" },
      { name: "description", content: "Sign in to NexusTrack to track movies, TV, and anime in one unified library." },
      { property: "og:title", content: "Sign in — NexusTrack" },
      { property: "og:description", content: "Track movies, TV, and anime in one place." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  function welcomeToast(user: { user_metadata?: { full_name?: string }; email?: string }) {
    const name = user.user_metadata?.full_name || user.email || "User";
    toast.success(`Welcome, ${name}!`);
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Handle OAuth callback: exchange code for session
      const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const code = params?.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code).catch(() => {});
        if (typeof window !== "undefined") {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data?.session && typeof window !== "undefined") {
        const { data: userData } = await supabase.auth.getUser();
        if (cancelled) return;
        if (userData?.user) {
          welcomeToast(userData.user);
          window.location.replace("/dashboard");
        } else {
          await supabase.auth.signOut();
          setChecking(false);
        }
      } else {
        setChecking(false);
      }
    }
    init();

    const timeout = setTimeout(() => { if (!cancelled) setChecking(false); }, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session && typeof window !== "undefined") {
        welcomeToast(session.user);
        window.location.replace("/dashboard");
      }
    });

    return () => { cancelled = true; clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });

        if (error) {
          if (/already registered|already exists|duplicate|already has an account/i.test(error.message)) {
            toast.error("An account with this email already exists. Please sign in instead.");
            setMode("signin");
            return;
          }
          throw error;
        }

        if (data?.session) {
          welcomeToast(data.session.user);
          window.location.href = "/dashboard";
          return;
        }

        if (data?.user) {
          toast.success("Account created! Check your email to confirm.");
          return;
        }

        toast.error("An account with this email already exists. Please sign in instead.");
        setMode("signin");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (data?.session) {
          welcomeToast(data.session.user);
          window.location.href = "/dashboard";
        } else {
          toast.error("Could not sign in. Please try again.");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (error) throw error;
      setTimeout(() => setBusy(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      toast.error(message);
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-16">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-accent shadow-lg">
            <span className="text-lg font-black text-white">N</span>
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight">Nexus<span className="text-gradient">Track</span></div>
          </div>
        </Link>

        <div className="glass-strong rounded-2xl p-8">
          <div className="mb-6 flex gap-2">
            <button type="button" onClick={() => { setMode("signin"); setShowPassword(false); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                mode === "signin" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40"
              }`}>Sign in</button>
            <button type="button" onClick={() => { setMode("signup"); setShowPassword(false); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                mode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40"
              }`}>Create account</button>
          </div>

          <button type="button" onClick={handleGoogle} disabled={busy}
            className="mb-4 flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-background/40 py-2.5 text-sm font-medium hover:bg-background/60 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            )}
            Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Password</label>
              <div className="relative mt-1">
                <input type={showPassword ? "text" : "password"} required minLength={6} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background/40 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 inset-y-0 my-auto flex items-center text-muted-foreground hover:text-foreground"
                  tabIndex={-1} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={busy}
              className="w-full rounded-lg bg-gradient-accent py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-60 flex items-center justify-center gap-2">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Please wait…</>
                : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Free forever. No subscriptions. No ads.
        </p>
      </div>
    </div>
  );
}
