import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bell,
  Compass,
  Film,
  Home,
  LogIn,
  LogOut,
  Menu,
  Search,
  Settings,
  User,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearSupabaseSessionStorage, supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getUnreadCount } from "@/lib/notifications.functions";
import { getProfile } from "@/lib/auth.functions";
import { useGuest } from "@/lib/guest";
import type { RestrictedAction } from "@/lib/guest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Shared nav model ─────────────────────────────────────────────────────────
// Home, Discover, Library, Friends — only real routes. Library/Friends are
// personal pages: guests/anon are routed through the existing auth flow.

interface NavEntry {
  key: string;
  label: string;
  Icon: typeof Home;
  to: string;
  personal?: boolean;
  action?: RestrictedAction;
}

const NAV: NavEntry[] = [
  { key: "home", label: "Home", Icon: Home, to: "/dashboard" },
  { key: "discover", label: "Discover", Icon: Compass, to: "/discover" },
  {
    key: "library",
    label: "Library",
    Icon: Film,
    to: "/library",
    personal: true,
    action: "accessLibrary",
  },
  {
    key: "friends",
    label: "Friends",
    Icon: Users,
    to: "/friends",
    personal: true,
    action: "accessFriends",
  },
];

type AuthState = "loading" | "authed" | "guest" | "anon";

/** Lightweight session presence for the landing nav (getSession is local/instant). */
function useSessionPresence(enabled: boolean) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["session-present"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        try {
          clearSupabaseSessionStorage();
        } catch {
          // Ignore storage access issues on browsers that block it.
        }
        return false;
      }
      return true;
    },
    staleTime: 30_000,
    enabled,
  });
  useEffect(() => {
    if (!enabled) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      qc.invalidateQueries({ queryKey: ["session-present"] });
    });
    return () => subscription.unsubscribe();
  }, [enabled, qc]);
  return q.data ?? null;
}

export function FloatingNav({
  mode,
  onOpenSearch,
}: {
  mode: "landing" | "app";
  onOpenSearch?: () => void;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isGuest, enableGuest, disableGuest, requireAuth } = useGuest();
  const [drawer, setDrawer] = useState(false);

  // In the app, the route guard guarantees signed-in-or-guest, so we never
  // need a session probe. On the public landing we probe once to decide
  // whether to show guest CTAs or the authenticated account controls.
  const sessionPresent = useSessionPresence(mode === "landing");
  const authState: AuthState =
    mode === "app"
      ? isGuest
        ? "guest"
        : "authed"
      : sessionPresent === null
        ? "loading"
        : sessionPresent
          ? "authed"
          : isGuest
            ? "guest"
            : "anon";

  const authed = authState === "authed";
  const homeTo = authed ? "/dashboard" : mode === "landing" ? "/" : "/dashboard";

  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    disableGuest();
    navigate({ to: "/auth", replace: true });
  }

  // Discover is public browsing — a fresh visitor becomes a guest first so the
  // protected-route guard admits them (same pattern as "Continue as Guest").
  function goDiscover() {
    if (!authed && !isGuest) enableGuest();
    navigate({ to: "/discover" });
  }

  // Library / Friends are personal — non-authed users go through the auth flow
  // (guests see the account modal; anonymous visitors go to /auth).
  function goPersonal(entry: NavEntry) {
    if (authed) {
      navigate({ to: entry.to });
    } else if (isGuest && entry.action) {
      requireAuth(entry.action);
    } else {
      navigate({ to: "/auth" });
    }
  }

  function isActive(to: string) {
    if (to === "/") return pathname === "/";
    if (to === "/dashboard")
      return pathname === "/dashboard" || (mode === "landing" && pathname === "/");
    return pathname === to || pathname.startsWith(to + "/");
  }

  const navHref = (e: NavEntry) => (e.key === "home" ? homeTo : e.to);

  return (
    <>
      {/* ── Desktop floating pill ── */}
      <div className="fixed inset-x-0 top-4 z-50 hidden px-4 lg:block">
        <div className="floating-nav mx-auto flex w-[92%] max-w-6xl items-center gap-2 rounded-full py-2 pl-3 pr-2">
          <Brand to={homeTo} />

          <nav className="mx-auto flex items-center gap-1" aria-label="Primary">
            {NAV.map((e) => {
              const active = isActive(navHref(e));
              const cls = cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              );
              if (e.key === "home" || (authed && !e.personal)) {
                return (
                  <Link
                    key={e.key}
                    to={navHref(e)}
                    aria-current={active ? "page" : undefined}
                    className={cls}
                  >
                    <e.Icon className="h-4 w-4" />
                    {e.label}
                  </Link>
                );
              }
              if (e.key === "discover") {
                return (
                  <button
                    key={e.key}
                    onClick={goDiscover}
                    aria-current={active ? "page" : undefined}
                    className={cls}
                  >
                    <e.Icon className="h-4 w-4" />
                    {e.label}
                  </button>
                );
              }
              // personal, not authed
              return (
                <button key={e.key} onClick={() => goPersonal(e)} className={cls}>
                  <e.Icon className="h-4 w-4" />
                  {e.label}
                </button>
              );
            })}
          </nav>

          <RightControls
            authState={authState}
            mode={mode}
            onSignOut={signOut}
            onOpenSearch={onOpenSearch}
          />
        </div>
      </div>

      {/* ── Mobile top bar ── */}
      {mode === "app" ? (
        <div
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-between border-b border-border bg-background/95 px-4 shadow-sm backdrop-blur-lg lg:hidden"
          style={{ minHeight: "var(--topbar-h)" }}
        >
          <Brand to={homeTo} compact />
          <div className="flex items-center gap-1">
            {authed ? <NotificationsBell /> : null}
            <button
              onClick={() => setDrawer((v) => !v)}
              aria-label={drawer ? "Close menu" : "Open menu"}
              aria-expanded={drawer}
              className="grid h-10 w-10 place-items-center rounded-full text-foreground/80 hover:bg-muted"
            >
              {drawer ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Mobile drawer ── */}
      {mode === "app" && drawer ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 overflow-y-auto border-b border-border bg-background/97 p-4 backdrop-blur-xl animate-fade-in lg:hidden"
          style={{ top: "var(--topbar-h)" }}
        >
          <nav className="flex flex-col gap-1" aria-label="Mobile menu">
            {NAV.map((e) => {
              const active = isActive(navHref(e));
              const cls = cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-base font-medium transition-colors",
                active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted",
              );
              const content = (
                <>
                  <e.Icon className="h-5 w-5" /> {e.label}
                </>
              );
              if (e.key === "home" || (authed && !e.personal)) {
                return (
                  <Link
                    key={e.key}
                    to={navHref(e)}
                    aria-current={active ? "page" : undefined}
                    className={cls}
                  >
                    {content}
                  </Link>
                );
              }
              return (
                <button
                  key={e.key}
                  onClick={() => {
                    setDrawer(false);
                    if (e.key === "discover") {
                      goDiscover();
                    } else {
                      goPersonal(e);
                    }
                  }}
                  className={cn(cls, "text-left")}
                >
                  {content}
                </button>
              );
            })}
          </nav>

          <div className="mt-4 space-y-2 border-t border-border pt-4">
            {authed ? (
              <>
                <Link
                  to="/settings"
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-base font-medium text-foreground hover:bg-muted"
                >
                  <Settings className="h-5 w-5" /> Settings
                </Link>
                <button
                  onClick={signOut}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-base font-medium text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-5 w-5" /> Sign out
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  to="/auth"
                  className="rounded-full bg-gradient-accent px-4 py-3 text-center text-base font-semibold text-white shadow-md"
                >
                  Start tracking
                </Link>
                <Link
                  to="/auth"
                  className="rounded-full border border-border px-4 py-3 text-center text-base font-medium text-foreground hover:bg-muted"
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ── App-only mobile bottom nav (thumb reach) ── */}
      {mode === "app" ? (
        <BottomNav pathname={pathname} isGuest={isGuest} requireAuth={requireAuth} />
      ) : null}
    </>
  );
}

function Brand({ to, compact = false }: { to: string; compact?: boolean }) {
  return (
    <Link
      to={to}
      aria-label="NexusTrack home"
      className="flex items-center gap-2.5 text-[var(--hero-fg)]"
    >
      <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-accent shadow-sm">
        <span className="text-sm font-black text-white">N</span>
      </div>
      <span
        className={cn(
          "text-sm font-semibold tracking-tight text-foreground",
          compact ? "block" : "hidden sm:block",
        )}
      >
        NexusTrack
      </span>
    </Link>
  );
}

function RightControls({
  authState,
  mode,
  onSignOut,
  onOpenSearch,
}: {
  authState: AuthState;
  mode: "landing" | "app";
  onSignOut: () => void;
  onOpenSearch?: () => void;
}) {
  if (authState === "loading") {
    return <div className="h-9 w-24 animate-pulse rounded-full bg-muted" />;
  }
  if (authState === "authed") {
    return (
      <div className="flex items-center gap-1.5">
        {mode === "app" ? (
          <Link
            to="/search"
            aria-label="Search"
            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Search className="h-[18px] w-[18px]" />
          </Link>
        ) : null}
        <NotificationsBell />
        <AccountMenu onSignOut={onSignOut} />
      </div>
    );
  }
  // guest or anon
  return (
    <div className="flex items-center gap-2">
      <Link
        to="/auth"
        className="hidden rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground lg:inline-flex"
      >
        Sign in
      </Link>
      <Link
        to="/auth"
        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-shadow hover:shadow-md btn-press"
      >
        <LogIn className="h-4 w-4" /> Start tracking
      </Link>
    </div>
  );
}

// ─── Notifications bell (live unread badge + realtime) ──────────────────────────

function NotificationsBell() {
  const qc = useQueryClient();
  const countFn = useServerFn(getUnreadCount);
  const unreadQ = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => countFn(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  useEffect(() => {
    // Two instances of this component can be mounted simultaneously (desktop
    // pill + mobile top-bar). Remove any existing channel with this name first
    // so we never call .on() on an already-subscribed channel.
    const existing = supabase.getChannels().find((c) => c.topic === "realtime:nav-notifications");
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel("nav-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["unread-count"] });
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "media_recommendations" },
        () => qc.invalidateQueries({ queryKey: ["unread-count"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const unread = unreadQ.data ?? 0;
  return (
    <Link
      to="/notifications"
      aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
      className="relative grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Bell className="h-[18px] w-[18px]" />
      {unread > 0 ? (
        <span className="absolute right-1.5 top-1.5 grid min-h-[15px] min-w-[15px] place-items-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}

// ─── Account menu (avatar + green online dot → profile/settings/sign out) ──────

function AccountMenu({ onSignOut }: { onSignOut: () => void }) {
  const profileFn = useServerFn(getProfile);
  const profileQ = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileFn(),
    staleTime: 60_000,
  });
  const profile = profileQ.data as
    | { username: string; display_name: string | null; avatar_url: string | null }
    | undefined;
  const name = profile?.display_name || profile?.username || "Account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Account menu"
          className="relative grid h-9 w-9 place-items-center rounded-full ring-1 ring-border transition-shadow hover:shadow-sm"
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-accent text-xs font-bold text-white">
              {name.charAt(0).toUpperCase()}
            </span>
          )}
          {/* online dot */}
          <span className="absolute -bottom-0 -right-0 h-3 w-3 rounded-full border-2 border-card bg-success" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate text-sm font-semibold">{name}</span>
          {profile?.username ? (
            <span className="truncate text-xs font-normal text-muted-foreground">
              @{profile.username}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile" className="flex cursor-pointer items-center gap-2">
            <User className="h-4 w-4" /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings" className="flex cursor-pointer items-center gap-2">
            <Settings className="h-4 w-4" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onSignOut}
          className="flex cursor-pointer items-center gap-2 text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── App mobile bottom nav ──────────────────────────────────────────────────────

const BOTTOM_NAV = [
  { to: "/dashboard", label: "Home", Icon: Home, personal: false },
  { to: "/search", label: "Search", Icon: Search, personal: false },
  { to: "/discover", label: "Discover", Icon: Compass, personal: false },
  {
    to: "/library",
    label: "Library",
    Icon: Film,
    personal: true as const,
    action: "accessLibrary" as RestrictedAction,
  },
  { to: "/profile", label: "Profile", Icon: User, personal: false },
];

function BottomNav({
  pathname,
  isGuest,
  requireAuth,
}: {
  pathname: string;
  isGuest: boolean;
  requireAuth: (a: RestrictedAction) => boolean;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 shadow-lg backdrop-blur-lg safe-area-bottom lg:hidden"
      aria-label="Primary"
    >
      <div className="flex items-center justify-around px-2 py-1.5">
        {BOTTOM_NAV.map(({ to, label, Icon, personal, action }) => {
          const active = pathname === to || (to !== "/dashboard" && pathname.startsWith(to + "/"));
          const cls = cn(
            "flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-medium transition-colors",
            active ? "text-primary" : "text-muted-foreground hover:text-foreground",
          );
          if (personal && isGuest && action) {
            return (
              <button key={to} onClick={() => requireAuth(action)} className={cls}>
                <Icon className="h-[22px] w-[22px]" />
                <span className="truncate">{label}</span>
              </button>
            );
          }
          return (
            <Link
              key={to}
              to={to}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cls}
            >
              <Icon className="h-[22px] w-[22px]" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
