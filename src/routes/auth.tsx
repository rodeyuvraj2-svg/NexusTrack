import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { getAuthErrorMessage, parseRetryAfter } from "@/lib/auth-errors";
import { useGuest } from "@/lib/guest";

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
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Rate limit countdown
  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = setInterval(() => setRetryAfter((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(timer);
  }, [retryAfter]);

  function welcomeToast(user: { user_metadata?: { full_name?: string }; email?: string }) {
    const name = user.user_metadata?.full_name || user.email || "User";
    toast.success(`Welcome, ${name}!`);
  }

  useEffect(() => {
    let cancelled = false;
    let isRecovering = false;

    async function init() {
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
          if (!isRecovering) {
            welcomeToast(userData.user);
            window.location.replace("/dashboard");
          }
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
      if (event === "PASSWORD_RECOVERY") {
        isRecovering = true;
        setRecovering(true);
        setChecking(false);
      } else if (event === "SIGNED_IN" && session && typeof window !== "undefined") {
        if (!isRecovering) {
          welcomeToast(session.user);
          window.location.replace("/dashboard");
        }
      }
    });

    return () => { cancelled = true; clearTimeout(timeout); subscription.unsubscribe(); };
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
          // Check for rate limit
          const wait = parseRetryAfter(error);
          if (wait) {
            setRetryAfter(wait);
            toast.error(getAuthErrorMessage("email_rate_limit"));
            return;
          }
          if (/already registered|already exists|duplicate|already has an account/i.test(error.message)) {
            toast.error(getAuthErrorMessage("email_taken"));
            setMode("signin");
            return;
          }
          toast.error(getAuthErrorMessage(error));
          return;
        }

        if (data?.session) {
          welcomeToast(data.session.user);
          window.location.href = "/dashboard";
          return;
        }

        if (data?.user) {
          // Show success state instead of just a toast
          setSignupSuccess(true);
          return;
        }

        toast.error(getAuthErrorMessage("email_taken"));
        setMode("signin");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          // Check for rate limit
          const wait = parseRetryAfter(error);
          if (wait) {
            setRetryAfter(wait);
            toast.error(getAuthErrorMessage("email_rate_limit"));
            return;
          }
          // Check for unconfirmed email
          if (/email not confirmed/i.test(error.message)) {
            toast.error(getAuthErrorMessage("email_not_confirmed"));
            return;
          }
          toast.error(getAuthErrorMessage(error));
          return;
        }

        if (data?.session) {
          welcomeToast(data.session.user);
          window.location.href = "/dashboard";
        } else {
          toast.error(getAuthErrorMessage("invalid_credentials"));
        }
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
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });
      if (error) {
        const wait = parseRetryAfter(error);
        if (wait) setRetryAfter(wait);
        toast.error(getAuthErrorMessage(error));
        return;
      }
      setResetSent(true);
    } catch (err) {
      toast.error(getAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy || newPassword.length < 6 || newPassword !== confirmPassword) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) { toast.error(getAuthErrorMessage(error)); return; }
      toast.success("Password updated successfully!");
      setRecovering(false);
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(getAuthErrorMessage(err));
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

  // Signup success state
  if (signupSuccess) {
    return (
      <div className="min-h-screen grid place-items-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <Link to="/" className="mb-8 flex items-center justify-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-accent shadow-lg">
              <span className="text-lg font-black text-white">N</span>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight">Nexus<span className="text-accent">Track</span></div>
            </div>
          </Link>
          <div className="glass-strong rounded-2xl p-10">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-success/20">
              <MailCheck className="h-8 w-8 text-success" />
            </div>
            <h2 className="text-xl font-bold">Check your email</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
              Click the link to verify your account and start tracking.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Didn't get the email? Check your spam folder or try again.
            </p>
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Free forever. No subscriptions. No ads.
          </p>
        </div>
      </div>
    );
  }

  // Reset success state
  if (resetSent) {
    return (
      <div className="min-h-screen grid place-items-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <Link to="/" className="mb-8 flex items-center justify-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-accent shadow-lg">
              <span className="text-lg font-black text-white">N</span>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight">Nexus<span className="text-accent">Track</span></div>
            </div>
          </Link>
          <div className="glass-strong rounded-2xl p-10">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-success/20">
              <MailCheck className="h-8 w-8 text-success" />
            </div>
            <h2 className="text-xl font-bold">Check your email</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              We sent a password reset link to <span className="font-medium text-foreground">{email}</span>.
              Click the link to reset your password.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Didn't get the email? Check your spam folder or{" "}
              <button type="button" onClick={() => { setResetSent(false); setForgotPassword(true); }} className="text-primary hover:underline">
                try again
              </button>.
            </p>
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Free forever. No subscriptions. No ads.
          </p>
        </div>
      </div>
    );
  }

  // Forgot password view
  if (forgotPassword) {
    return (
      <div className="min-h-screen grid place-items-center px-4 py-16">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 flex items-center justify-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-accent shadow-lg">
              <span className="text-lg font-black text-white">N</span>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight">Nexus<span className="text-accent">Track</span></div>
            </div>
          </Link>
          <div className="glass-strong rounded-2xl p-8">
            <h2 className="text-xl font-bold mb-2">Reset your password</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Enter your email and we'll send you a link to reset your password.
            </p>
            <form onSubmit={handleResetPassword} className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <button type="submit" disabled={busy || retryAfter > 0}
                className="w-full rounded-lg bg-gradient-accent py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-60 flex items-center justify-center gap-2">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : retryAfter > 0 ? `Please wait ${retryAfter}s…`
                  : "Send reset link"}
              </button>
            </form>
            <div className="mt-4 text-center">
              <button type="button" onClick={() => { setForgotPassword(false); setRetryAfter(0); }}
                className="text-xs text-muted-foreground hover:text-primary transition-colors">
                Back to sign in
              </button>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Free forever. No subscriptions. No ads.
          </p>
        </div>
      </div>
    );
  }

  // Password recovery form (after email link is clicked)
  if (recovering) {
    return (
      <div className="min-h-screen grid place-items-center px-4 py-16">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 flex items-center justify-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-accent shadow-lg">
              <span className="text-lg font-black text-white">N</span>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight">Nexus<span className="text-accent">Track</span></div>
            </div>
          </Link>
          <div className="glass-strong rounded-2xl p-8">
            <h2 className="text-xl font-bold mb-2">Set new password</h2>
            <p className="text-sm text-muted-foreground mb-6">Enter your new password below.</p>
            <form onSubmit={handleUpdatePassword} className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">New password</label>
                <div className="relative mt-1">
                  <input type={showNewPassword ? "text" : "password"} required minLength={6} value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background/40 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 inset-y-0 my-auto flex items-center text-muted-foreground hover:text-foreground" tabIndex={-1}>
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Confirm password</label>
                <input type="password" required minLength={6} value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              {confirmPassword && newPassword !== confirmPassword ? (
                <p className="text-xs text-destructive">Passwords do not match</p>
              ) : null}
              <button type="submit" disabled={busy || newPassword.length < 6 || newPassword !== confirmPassword}
                className="w-full rounded-lg bg-gradient-accent py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-60 flex items-center justify-center gap-2">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</> : "Update password"}
              </button>
            </form>
          </div>
        </div>
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
            <div className="text-2xl font-bold tracking-tight">Nexus<span className="text-accent">Track</span></div>
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
              {mode === "signin" ? (
                <button type="button" onClick={() => setForgotPassword(true)} className="mt-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                  Forgot password?
                </button>
              ) : null}
            </div>
            <button type="submit" disabled={busy || retryAfter > 0}
              className="w-full rounded-lg bg-gradient-accent py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-60 flex items-center justify-center gap-2">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Please wait…</>
                : retryAfter > 0 ? `Please wait ${retryAfter}s…`
                : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/40" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[var(--card)] px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {/* Continue as Guest */}
          <button
            type="button"
            onClick={handleGuestMode}
            className="w-full rounded-lg border border-border/40 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
          >
            Continue as Guest
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Free forever. No subscriptions. No ads.
        </p>
      </div>
    </div>
  );
}
