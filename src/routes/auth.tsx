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
    "w-full min-w-0 rounded-[28px] border border-white/10 bg-[#0b1220]/85 p-4 shadow-[0_24px_60px_rgba(2,6,23,0.58)] backdrop-blur-xl sm:p-5";

  const inputClass =
    "w-full rounded-xl border border-slate-700/70 bg-[#0b1220]/95 px-3.5 py-2.5 text-sm text-white transition-all placeholder:text-slate-400 focus-visible:border-violet-400/70 focus-visible:bg-[#0d1525] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(139,92,246,0.14)]";

  const staticShell = (content: React.ReactNode) => (
    <div className="min-h-screen bg-[#050b14] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] items-stretch overflow-hidden bg-[#050b14]">
        <aside className="relative hidden flex-1 overflow-hidden bg-[#090d18] lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(168,85,247,0.28),transparent_22%),radial-gradient(circle_at_82%_78%,rgba(59,130,246,0.24),transparent_28%),linear-gradient(135deg,#120f2d_0%,#0b1020_38%,#0b1220_100%)]" />

          <div className="absolute inset-0 opacity-70">
            {[
              {
                url: "https://image.tmdb.org/t/p/w780/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg",
                className:
                  "-left-8 top-16 h-[42%] w-[23%] rotate-[-18deg] shadow-[0_28px_80px_rgba(45,30,80,0.45)]",
              },
              {
                url: "https://image.tmdb.org/t/p/w780/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
                className:
                  "left-[18%] top-[16%] h-[42%] w-[22%] rotate-[12deg] shadow-[0_28px_90px_rgba(22,59,110,0.4)]",
              },
              {
                url: "https://image.tmdb.org/t/p/w780/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
                className:
                  "bottom-10 right-[9%] h-[38%] w-[20%] rotate-[14deg] shadow-[0_28px_80px_rgba(30,64,175,0.28)]",
              },
            ].map((art) => (
              <div
                key={art.className}
                className={`absolute overflow-hidden rounded-[2rem] border border-white/8 ${art.className}`}
              >
                <img
                  src={art.url}
                  alt=""
                  className="h-full w-full object-cover opacity-70 grayscale-[0.15]"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/15 via-slate-950/15 to-blue-500/15" />
              </div>
            ))}
          </div>

          <div className="relative z-10 flex h-full flex-col justify-between p-10 pb-8 pt-8 xl:p-14 xl:pt-10">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 text-sm font-black text-white shadow-[0_18px_36px_rgba(99,102,241,0.45)]">
                N
              </div>
              <span className="text-lg font-semibold tracking-[-0.04em] text-white">
                NexusTrack
              </span>
            </div>

            <div className="max-w-xl -translate-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-violet-200/80">
                Track every story.
              </p>
              <h1 className="mt-5 text-[2.6rem] font-black leading-[0.96] tracking-[-0.06em] text-white xl:text-[4.2rem]">
                Track every <span className="text-violet-200">story.</span>
              </h1>
              <p className="mt-4 max-w-md text-base leading-relaxed text-slate-200/85 xl:text-lg">
                A cinematic home for your movies, TV shows, anime, and manga—organized in one
                library, with progress that always follows you.
              </p>
              <div className="mt-7 flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-200/80">
                {["Movies", "TV", "Anime", "Manga"].map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-white/10 bg-slate-900/20 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-300/80">
              <span className="h-2 w-2 rounded-full bg-violet-400" />
              Discover. Track. Repeat.
            </div>
          </div>
        </aside>

        <div className="relative flex w-full flex-1 items-center justify-center bg-[#050b14] px-3 py-7 sm:px-6 lg:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.08),transparent_36%)]" />
          <Link
            to="/"
            className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-violet-400/50 hover:text-white sm:left-6 sm:top-6 sm:px-3 sm:py-2 sm:text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to NexusTrack
          </Link>

          <div className="relative w-full max-w-[420px] pt-12 sm:pt-0">{content}</div>
        </div>
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
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-slate-800 bg-slate-900 text-slate-200">
          <MailCheck className="h-5 w-5" />
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
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-xl border border-slate-800 bg-slate-900 text-sm font-bold text-slate-100">
            N
          </div>
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
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-xl border border-slate-800 bg-slate-900 text-sm font-bold text-slate-100">
            N
          </div>
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
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-xl border border-slate-800 bg-slate-900 text-sm font-bold text-slate-100">
              N
            </div>
          </div>

          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Welcome back
            </p>
            <h2 className="mt-2 text-[1.7rem] font-black leading-tight tracking-[-0.05em] text-white">
              {mode === "signin" ? "Sign in to your library" : "Create your library"}
            </h2>
          </div>

          <div
            className="mb-5 flex rounded-xl border border-white/10 bg-slate-900/70 p-1"
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
                  mode === m
                    ? "bg-gradient-to-r from-violet-500/20 to-blue-500/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "text-slate-300 hover:text-white"
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
            className="mb-3 flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-violet-400/40 hover:bg-slate-900/90 disabled:opacity-60"
          >
            <Chrome className="h-4 w-4" /> Continue with Google
          </button>

          <div className="relative my-3">
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
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-400/30 bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2.75 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(99,102,241,0.24)] transition-colors hover:brightness-110 disabled:opacity-60"
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
            className="mt-3 w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-violet-400/40 hover:text-white"
          >
            Continue as Guest
          </button>
        </div>,
      )}
    </>
  );
}
