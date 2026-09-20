import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Loader2, MailCheck, Chrome } from "lucide-react";
import { getAuthErrorMessage, parseRetryAfter } from "@/lib/auth-errors";
import { useGuest } from "@/lib/guest";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — NexusTrack" },
      {
        name: "description",
        content: "Sign in to NexusTrack to track movies, TV, and anime in one unified library.",
      },
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
      const params =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const code = params?.get("code");
      if (code && typeof window !== "undefined") {
        await supabase.auth.exchangeCodeForSession(code).catch(() => {});
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data?.session) {
        const { data: userData } = await supabase.auth.getUser();
        if (cancelled) return;
        if (userData?.user) {
          if (!isRecovering && typeof window !== "undefined") window.location.replace("/dashboard");
        } else {
          await supabase.auth.signOut();
          setChecking(false);
        }
      } else {
        setChecking(false);
      }
    }
    init();

    const timeout = setTimeout(() => {
      if (!cancelled) setChecking(false);
    }, 8000);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        isRecovering = true;
        setRecovering(true);
        setChecking(false);
      } else if (event === "SIGNED_IN" && session) {
        if (!isRecovering) window.location.replace("/dashboard");
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth` },
    });
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
          if (wait) {
            setRetryAfter(wait);
            return;
          }
          if (/already registered|already exists|duplicate/i.test(error.message)) {
            toast.error("This email is already registered. Sign in instead.");
            setMode("signin");
            return;
          }
          toast.error(getAuthErrorMessage(error));
          return;
        }
        if (data?.session) {
          window.location.replace("/dashboard");
          return;
        }
        if (data?.user) {
          setSignupSuccess(true);
          return;
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const wait = parseRetryAfter(error);
          if (wait) {
            setRetryAfter(wait);
            return;
          }
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
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });
      if (error) {
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
      if (error) {
        toast.error(getAuthErrorMessage(error));
        return;
      }
      toast.success("Password updated!");
      setRecovering(false);
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(getAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const authPanelClass =
    "w-full min-w-0 rounded-2xl border border-slate-800 bg-[#0b1220] p-5 shadow-[0_18px_42px_rgba(2,6,23,0.5)] sm:p-6";

  const inputClass =
    "w-full rounded-xl border border-slate-800 bg-[#0f172a] px-3.5 py-2.5 text-sm text-white transition-colors placeholder:text-slate-400 focus-visible:border-violet-400/70 focus-visible:outline-none";

  const staticShell = (content: React.ReactNode) => (
    <div className="relative min-h-screen overflow-hidden bg-[#050b14] text-slate-100">
      <div className="absolute inset-x-0 top-0 h-px bg-violet-400/50" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-8 sm:px-6">
        <Link
          to="/"
          className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/90 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500/60 hover:text-white sm:left-6 sm:top-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to NexusTrack
        </Link>

        <div className="w-full max-w-md">{content}</div>
      </div>
    </div>
  );

  if (checking) {
    return staticShell(
      <div className={`${authPanelClass} flex min-h-[420px] items-center justify-center`}>
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>,
    );
  }

  if (signupSuccess || resetSent) {
    return staticShell(
      <div className={authPanelClass}>
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full border border-slate-800 bg-slate-900 text-slate-200">
          <MailCheck className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-black tracking-[-0.04em] text-white">Check your email</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          {signupSuccess
            ? `We sent a confirmation link to ${email}. Click it to verify your account.`
            : `We sent a password reset link to ${email}. Click it to reset your password.`}
        </p>
      </div>,
    );
  }

  if (recovering) {
    return staticShell(
      <div className={authPanelClass}>
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-slate-800 bg-slate-900 text-sm font-bold text-slate-100">
            N
          </div>
          <span className="text-xl font-black tracking-[-0.04em] text-white">NexusTrack</span>
        </div>

        <h2 className="text-2xl font-black tracking-[-0.04em] text-white">Set new password</h2>
        <p className="mt-2 text-sm text-slate-300">Enter your new password below.</p>
        <form onSubmit={handleUpdatePassword} className="mt-5 space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-200">New password</label>
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              aria-label="New password"
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-200">
              Confirm password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              aria-label="Confirm new password"
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          {confirmPassword && newPassword !== confirmPassword ? (
            <p className="text-xs text-destructive">Passwords do not match</p>
          ) : null}
          <button
            type="submit"
            disabled={busy || newPassword.length < 6 || newPassword !== confirmPassword}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/30 bg-violet-600/20 px-4 py-2.5 text-sm font-semibold text-violet-50 transition-opacity disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Updating…
              </>
            ) : (
              "Update password"
            )}
          </button>
        </form>
      </div>,
    );
  }

  if (forgotPassword) {
    return staticShell(
      <div className={authPanelClass}>
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-slate-800 bg-slate-900 text-sm font-bold text-slate-100">
            N
          </div>
          <span className="text-xl font-black tracking-[-0.04em] text-white">NexusTrack</span>
        </div>

        <h2 className="text-2xl font-black tracking-[-0.04em] text-white">Reset password</h2>
        <p className="mt-2 text-sm text-slate-300">
          Enter your email and we'll send you a reset link.
        </p>
        <form onSubmit={handleResetPassword} className="mt-5 space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-200">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              autoComplete="email"
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={busy || retryAfter > 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/30 bg-violet-600/20 px-4 py-2.5 text-sm font-semibold text-violet-50 transition-opacity disabled:opacity-60"
          >
            {busy ? "Sending…" : retryAfter > 0 ? `Wait ${retryAfter}s…` : "Send reset link"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setForgotPassword(false);
            setRetryAfter(0);
          }}
          className="mt-4 w-full text-center text-sm font-medium text-slate-300 transition-colors hover:text-white"
        >
          Back to sign in
        </button>
      </div>,
    );
  }

  return (
    <>
      {staticShell(
        <div className={authPanelClass}>
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-slate-800 bg-slate-900 text-sm font-bold text-slate-100">
              N
            </div>
            <span className="text-xl font-black tracking-[-0.04em] text-white">NexusTrack</span>
          </div>

          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Welcome back
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
              {mode === "signin" ? "Sign in" : "Create account"}
            </h2>
          </div>

          <div
            className="mb-5 flex rounded-xl border border-slate-800 bg-[#0d1524] p-1"
            role="tablist"
            aria-label="Authentication mode"
          >
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setShowPassword(false);
                }}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  mode === m ? "bg-slate-800 text-white" : "text-slate-300 hover:text-white"
                }`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            className="mb-4 flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-slate-500/70 disabled:opacity-60"
          >
            <Chrome className="h-4 w-4" /> Continue with Google
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#0b1220] px-2 text-slate-400">or</span>
            </div>
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <div>
              <label
                htmlFor="auth-email"
                className="mb-1.5 block text-sm font-medium text-slate-200"
              >
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                autoComplete="email"
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="mb-1.5 block text-sm font-medium text-slate-200"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  aria-label="Password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-3 flex items-center text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="min-h-5">
              {mode === "signin" ? (
                <button
                  type="button"
                  onClick={() => setForgotPassword(true)}
                  className="inline-flex text-sm font-medium text-slate-300 transition-colors hover:text-white"
                >
                  Forgot password?
                </button>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={busy || retryAfter > 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/30 bg-violet-600/20 px-4 py-2.75 text-sm font-semibold text-violet-50 transition-colors hover:bg-violet-600/25 disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Please wait…
                </>
              ) : retryAfter > 0 ? (
                `Wait ${retryAfter}s…`
              ) : mode === "signup" ? (
                "Create account"
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={handleGuestMode}
            className="mt-4 w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-slate-500/70 hover:text-white"
          >
            Continue as Guest
          </button>
        </div>,
      )}
    </>
  );
}
