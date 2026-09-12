import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Compass,
  Film,
  Home,
  LogOut,
  Search,
  Users,
  User,
  Menu,
  X,
  Bell,
  Settings,
  Command,
  LogIn,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/CommandPalette";
import { useLibraryMap } from "@/components/MediaCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getUnreadCount, listNotifications } from "@/lib/notifications.functions";
import { listFriends } from "@/lib/friends.functions";
import { getFollowCounts } from "@/lib/follows.functions";
import { getProfile } from "@/lib/auth.functions";
import { useGuest } from "@/lib/guest";

interface NavItem {
  to: string;
  label: string;
  Icon: typeof Home;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Home", Icon: Home },
      { to: "/search", label: "Search", Icon: Search },
      { to: "/discover", label: "Discover", Icon: Compass },
    ],
  },
  {
    label: "Library",
    items: [{ to: "/library", label: "My Library", Icon: Film }],
  },
  {
    label: "Social",
    items: [
      { to: "/friends", label: "Friends", Icon: Users },
      { to: "/notifications", label: "Notifications", Icon: Bell },
    ],
  },
];

const BOTTOM_NAV = [
  { to: "/dashboard", label: "Home", Icon: Home },
  { to: "/search", label: "Search", Icon: Search },
  { to: "/discover", label: "Discover", Icon: Compass },
  { to: "/library", label: "Library", Icon: Film },
  { to: "/profile", label: "Profile", Icon: User },
] as const;

export function AppShell() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const { isGuest, disableGuest } = useGuest();
  const qc = useQueryClient();

  const countFn = useServerFn(getUnreadCount);
  const unreadQ = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => countFn(),
    staleTime: 60_000,
    // Safety net only — realtime (below) is the primary update path.
    refetchInterval: 5 * 60_000,
    enabled: !isGuest,
  });

  // Push-based badge updates: new notifications (classic or media
  // recommendations) arrive over realtime and invalidate the cached count,
  // instead of polling every 30s per open tab. A slow 5-minute interval
  // remains as a safety net if realtime drops.
  useEffect(() => {
    if (isGuest) return;
    const channel = supabase
      .channel("appshell-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["unread-count"] });
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "media_recommendations" },
        () => {
          qc.invalidateQueries({ queryKey: ["unread-count"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isGuest, qc]);

  // Warm the shared library map at app start so card pills render together
  // with posters on every page (no second wave once grids mount).
  useLibraryMap();

  // Warm the small, frequently-visited page queries at app start — same
  // idea as the library warm above. Friends / notifications / profile would
  // otherwise be the only pages paying a cold server-function roundtrip on
  // first navigation (everything else is already cached), which the user
  // feels as a "breath" before content appears.
  const friendsFn = useServerFn(listFriends);
  const notifListFn = useServerFn(listNotifications);
  const profileFn = useServerFn(getProfile);
  const followCountsFn = useServerFn(getFollowCounts);

  useEffect(() => {
    if (isGuest) return;
    void qc.prefetchQuery({ queryKey: ["friends"], queryFn: () => friendsFn(), staleTime: 30_000 });
    void qc.prefetchQuery({ queryKey: ["notifications"], queryFn: () => notifListFn() });
    void qc
      .prefetchQuery({ queryKey: ["profile"], queryFn: () => profileFn(), staleTime: 60_000 })
      .then(() => {
        // Follow counts need the profile id — warm them once it resolves.
        const profile = qc.getQueryData<{ id?: string }>(["profile"]);
        if (profile?.id) {
          void qc.prefetchQuery({
            queryKey: ["follow-counts", profile.id],
            queryFn: () => followCountsFn({ data: { user_id: profile.id! } }),
            staleTime: 60_000,
          });
        }
      });
  }, [isGuest, qc, friendsFn, notifListFn, profileFn, followCountsFn]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    disableGuest();
    navigate({ to: "/auth", replace: true });
  }

  function signIn() {
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />

      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-56 flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur-sm px-3 py-5 md:flex">
        <Brand />
        <NavList pathname={pathname} unreadCount={unreadQ.data ?? 0} isGuest={isGuest} />
        <div className="mt-2 space-y-0.5">
          <button
            onClick={() => setCmdOpen(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
          >
            <Command className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Search</span>
            <kbd className="rounded border border-border/40 px-1.5 text-[10px] text-muted-foreground/60">
              ⌘K
            </kbd>
          </button>
        </div>
        <div className="mt-auto pt-2 border-t border-sidebar-border/60">
          {isGuest ? (
            <button
              onClick={signIn}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
            >
              <LogIn className="h-4 w-4 shrink-0" /> Sign in
            </button>
          ) : (
            <AccountMenu onSignOut={signOut} />
          )}
        </div>
      </aside>

      {/* Mobile top bar — height feeds --topbar-h, which the mobile menu
          below offsets from; change once, both follow. */}
      <div
        className="md:hidden fixed top-0 inset-x-0 z-40 bg-background/90 backdrop-blur-lg border-b border-border/40 flex items-center justify-between px-4 py-3"
        style={{ minHeight: "var(--topbar-h)" }}
      >
        <Brand compact />
        <div className="flex items-center gap-1">
          <Link
            to="/notifications"
            aria-label={`Notifications${unreadQ.data ? ` (${unreadQ.data} unread)` : ""}`}
            className="relative rounded-lg p-2 hover:bg-muted/30"
          >
            <Bell className="h-5 w-5 text-foreground/80" />
            {unreadQ.data ? (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
            ) : null}
          </Link>
          <button
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="rounded-lg p-2 hover:bg-muted/30"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {/* Mobile menu — top offset tracks the top bar height (var --topbar-h) */}
      {open && (
        <div
          className="md:hidden fixed inset-x-0 bottom-0 z-30 bg-background/95 backdrop-blur-lg border-b border-border/40 p-4 animate-fade-in overflow-y-auto"
          style={{ top: "var(--topbar-h)" }}
        >
          <NavList pathname={pathname} unreadCount={unreadQ.data ?? 0} isGuest={isGuest} vertical />
          <div className="mt-3 space-y-0.5">
            <button
              onClick={() => {
                setCmdOpen(true);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
            >
              <Command className="h-4 w-4" /> Quick search
            </button>
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
            >
              <Settings className="h-4 w-4" /> Settings
            </Link>
          </div>
          <div className="mt-3 pt-3 border-t border-border/40">
            {isGuest ? (
              <button
                onClick={signIn}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
              >
                <LogIn className="h-4 w-4" /> Sign in
              </button>
            ) : (
              <button
                onClick={signOut}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            )}
          </div>
        </div>
      )}

      <main className="flex-1 md:pl-0 pt-16 md:pt-0 pb-20 md:pb-0 overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-4 md:px-8 py-6 md:py-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-lg border-t border-border/40 safe-area-bottom"
        aria-label="Primary"
      >
        <div className="flex items-center justify-around px-2 py-1">
          {BOTTOM_NAV.map(({ to, label, Icon }) => {
            const active =
              pathname === to || (to !== "/dashboard" && pathname.startsWith(to + "/"));
            return (
              <Link
                key={to}
                to={to}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors min-w-0",
                  active ? "text-primary" : "text-muted-foreground/60 hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_6px_var(--primary)]")} />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/dashboard"
      aria-label="NexusTrack home"
      className={cn("flex items-center gap-2.5 px-1 mb-6", compact && "mb-0")}
    >
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-accent shadow-lg">
        <span className="text-sm font-black text-white">N</span>
      </div>
      <span className="text-base font-bold">
        Nexus<span className="text-primary">Track</span>
      </span>
    </Link>
  );
}

const GUEST_VISIBLE = new Set(["/dashboard", "/search", "/discover", "/notifications", "/profile"]);

function NavList({
  pathname,
  unreadCount,
  isGuest,
  vertical,
}: {
  pathname: string;
  unreadCount: number;
  isGuest?: boolean;
  vertical?: boolean;
}) {
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: isGuest ? g.items.filter((n) => GUEST_VISIBLE.has(n.to)) : g.items,
  })).filter((g) => g.items.length > 0);
  return (
    <nav
      className={cn("flex flex-col", vertical ? "gap-5" : "gap-5")}
      aria-label={vertical ? "Mobile menu" : "Main"}
    >
      {groups.map((group, gi) => (
        <div key={group.label} className={cn("flex flex-col gap-0.5", gi === 0 && "mt-1")}>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {group.label}
          </p>
          {group.items.map(({ to, label, Icon }) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" /> {label}
                {to === "/notifications" && unreadCount > 0 && (
                  <span
                    className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary tabular-nums"
                    aria-label={`${unreadCount} unread`}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// ─── Account menu (desktop sidebar footer) ───────────────────────────────────
// Identity row that opens the profile / settings / sign-out menu. Profile data
// comes from the ["profile"] query warmed at app start (below), so this renders
// from cache with no extra round trip.

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
        <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/30">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-7 w-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-accent text-[11px] font-bold text-white">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium leading-tight">{name}</span>
            {profile?.username ? (
              <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                @{profile.username}
              </span>
            ) : null}
          </span>
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground/60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-52">
        <DropdownMenuLabel className="truncate">
          @{profile?.username ?? "account"}
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
