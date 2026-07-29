import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, MailCheck, Chrome } from "lucide-react";
import { getAuthErrorMessage, parseRetryAfter } from "@/lib/auth-errors";
import { useGuest } from "@/lib/guest";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — NexusTrack" },
      { name: "description", content: "Sign in to NexusTrack to track movies, TV, and anime in one unified library." },
      { property: "og:title", content: "Sign in — NexusTrack" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { enableGuest } = useGuest();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Rate limit countdown
  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = setInterval(() => setRetryAfter((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(timer);
  }, [retryAfter]);

  useEffect(() => {
    let cancelled = false;
    let isRecovering = false;

    async function init() {
      const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const code = params?.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code).catch(() => {});
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data?.session) {
        const { data: userData } = await supabase.auth.getUser();
        if (cancelled) return;
        if (userData?.user) {
          if (!isRecovering) window.location.replace("/dashboard");
        } else {
          await supabase.auth.signOut();
          setChecking(false);
        }
      } else {
        setChecking(false);
      }
    }
    init();

    const timeout = setTimeout(() => { if (!cancelled) setChecking(false); }, 8000);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { isRecovering = true; setRecovering(true); setChecking(false); }
      else if (event === "SIGNED_IN" && session) {
        if (!isRecovering) window.location.replace("/dashboard");
      }
    });

    return () => { cancelled = true; clearTimeout(timeout); subscription.unsubscribe(); };
  }, [navigate]);

  const handleGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth` } });
    if (error) toast.error(getAuthErrorMessage(error));
  }, []);

  const handleGuestMode = useCallback(() => {
    enableGuest();
    navigate({ to: "/dashboard" });
  }, [enableGuest, navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (busy || retryAfter > 0) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          const wait = parseRetryAfter(error);
          if (wait) { setRetryAfter(wait); return; }
          if (/already registered|already exists|duplicate/i.test(error.message)) {
            toast.error("This email is already registered. Sign in instead.");
            setMode("signin");
            return;
          }
          toast.error(getAuthErrorMessage(error));
          return;
        }
        if (data?.session) { window.location.replace("/dashboard"); return; }
        if (data?.user) { setSignupSuccess(true); return; }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const wait = parseRetryAfter(error);
          if (wait) { setRetryAfter(wait); return; }
          toast.error(getAuthErrorMessage(error));
          return;
        }
        if (data?.session) window.location.replace("/dashboard");
      }
    } catch (err) {
      toast.error(getAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth?reset=true` });
      if (error) { toast.error(getAuthErrorMessage(error)); return; }
      setResetSent(true);
    } catch (err) { toast.error(getAuthErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy || newPassword.length < 6 || newPassword !== confirmPassword) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) { toast.error(getAuthErrorMessage(error)); return; }
      toast.success("Password updated!");
      setRecovering(false);
      navigate({ to: "/dashboard" });
    } catch (err) { toast.error(getAuthErrorMessage(err)); }
    finally { setBusy(false); }
  }

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (signupSuccess || resetSent) {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-6 inline-flex items-center justify-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-accent shadow-lg">
              <span className="text-base font-black text-white">N</span>
            </div>
            <span className="text-xl font-bold">Nexus<span className="text-primary">Track</span></span>
          </div>
          <div className="glass-strong rounded-2xl p-8">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-success/20">
              <MailCheck className="h-7 w-7 text-success" />
            </div>
            <h2 className="text-lg font-bold">Check your email</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {signupSuccess
                ? `We sent a confirmation link to ${email}. Click it to verify your account.`
                : `We sent a password reset link to ${email}. Click it to reset your password.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (recovering) {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <div className="inline-flex items-center justify-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-accent shadow-lg">
                <span className="text-base font-black text-white">N</span>
              </div>
              <span className="text-xl font-bold">Nexus<span className="text-primary">Track</span></span>
            </div>
          </div>
          <div className="glass-strong rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-1">Set new password</h2>
            <p className="text-sm text-muted-foreground mb-5">Enter your new password below.</p>
            <form onSubmit={handleUpdatePassword} className="space-y-3">
              <div>
                <input type={showPassword ? "text" : "password"} required minLength={6} value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)} placeholder="New password"
                  className="w-full rounded-lg border border-input bg-background/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50" />
              </div>
              <div>
                <input type="password" required minLength={6} value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password"
                  className="w-full rounded-lg border border-input bg-background/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50" />
              </div>
              {confirmPassword && newPassword !== confirmPassword ? (
                <p className="text-xs text-destructive">Passwords do not match</p>
              ) : null}
              <button type="submit" disabled={busy || newPassword.length < 6 || newPassword !== confirmPassword}
                className="w-full rounded-lg bg-gradient-accent py-2.5 text-sm font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</> : "Update password"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (forgotPassword) {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <div className="inline-flex items-center justify-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-accent shadow-lg">
                <span className="text-base font-black text-white">N</span>
              </div>
              <span className="text-xl font-bold">Nexus<span className="text-primary">Track</span></span>
            </div>
          </div>
          <div className="glass-strong rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-1">Reset password</h2>
            <p className="text-sm text-muted-foreground mb-5">Enter your email and we'll send you a reset link.</p>
            <form onSubmit={handleResetPassword} className="space-y-3">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                className="w-full rounded-lg border border-input bg-background/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50" />
              <button type="submit" disabled={busy || retryAfter > 0}
                className="w-full rounded-lg bg-gradient-accent py-2.5 text-sm font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2">
                {busy ? "Sending…" : retryAfter > 0 ? `Wait ${retryAfter}s…` : "Send reset link"}
              </button>
            </form>
            <button type="button" onClick={() => { setForgotPassword(false); setRetryAfter(0); }}
              className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors">
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-accent shadow-lg">
            <span className="text-base font-black text-white">N</span>
          </div>
          <span className="text-xl font-bold">Nexus<span className="text-primary">Track</span></span>
        </Link>

        <div className="glass-strong rounded-2xl p-6">
          {/* Tabs */}
          <div className="mb-5 flex rounded-lg bg-muted/50 p-0.5">
            {(["signin", "signup"] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setShowPassword(false); }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
                  mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {/* Google */}
          <button type="button" onClick={handleGoogle} disabled={busy}
            className="w-full rounded-lg border border-border/50 bg-card/30 py-2.5 text-sm font-medium text-foreground hover:bg-card/60 transition-colors disabled:opacity-60 flex items-center justify-center gap-2.5 mb-3">
            <Chrome className="h-4 w-4" /> Continue with Google
          </button>

          {/* Divider */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/30" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-[var(--card)] px-2 text-muted-foreground/60">or</span></div>
          </div>

          {/* Email form */}
          <form onSubmit={handleEmail} className="space-y-3">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
              className="w-full rounded-lg border border-input bg-background/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50" />
            <div className="relative">
              <input type={showPassword ? "text" : "password"} required minLength={6} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="Password"
                className="w-full rounded-lg border border-input bg-background/40 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 inset-y-0 my-auto flex items-center text-muted-foreground hover:text-foreground" tabIndex={-1}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {mode === "signin" && (
              <button type="button" onClick={() => setForgotPassword(true)}
                className="block text-xs text-muted-foreground hover:text-primary transition-colors">
                Forgot password?
              </button>
            )}
            <button type="submit" disabled={busy || retryAfter > 0}
              className="w-full rounded-lg bg-gradient-accent py-2.5 text-sm font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Please wait…</>
                : retryAfter > 0 ? `Wait ${retryAfter}s…`
                : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          {/* Guest */}
          <button type="button" onClick={handleGuestMode}
            className="mt-3 w-full rounded-lg border border-border/30 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors">
            Continue as Guest
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          Free forever. No subscriptions. No ads.
        </p>
      </div>
    </div>
  );
}
