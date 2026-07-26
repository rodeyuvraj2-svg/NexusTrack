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
        // Check if email already exists using database function
        const { data: emailCheckData, error: emailCheckError } = await supabase.rpc("check_email_exists", {
          p_email: email.toLowerCase(),
        });

        if (emailCheckData === true) {
          toast.error("That account already exists. Please sign in instead.");
          setMode("signin");
          setBusy(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({ email, password });

        if (error) {
          if (/already registered|already exists|duplicate|already has an account/i.test(error.message)) {
            toast.error("That account already exists. Please sign in instead.");
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

        toast.error("That account already exists. Please sign in instead.");
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
