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
import { FloatingNav } from "@/components/FloatingNav";
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
    void qc.prefetchQuery({
      queryKey: ["notifications"],
      queryFn: () => notifListFn(),
      staleTime: 60_000,
    });
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
    <div className="min-h-screen bg-background text-foreground">
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <FloatingNav mode="app" />

      <main className="relative min-h-screen overflow-hidden pb-20 pt-[calc(var(--topbar-h)+1rem)] lg:pb-8 lg:pt-28">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.18),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(59,130,246,0.12),_transparent_36%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-border/70" />

        <div className="relative mx-auto max-w-6xl px-4 py-4 md:px-6 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/dashboard"
      aria-label="Home"
      className={cn("flex items-center gap-2.5 px-1 mb-6", compact && "mb-0")}
    >
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-accent shadow-lg">
        <span className="text-sm font-black text-white">N</span>
      </div>
      <span className="sr-only">Home</span>
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
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "border-primary/20 bg-primary/10 text-foreground font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "border-transparent text-muted-foreground hover:border-border/40 hover:bg-muted/30 hover:text-foreground",
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
