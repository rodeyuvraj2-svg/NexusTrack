import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Compass, Film, Hop as Home, LogOut, Search, Users, User as UserIcon, Menu, X, Bell, Settings, Command, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/CommandPalette";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getUnreadCount } from "@/lib/notifications.functions";
import { useGuest } from "@/lib/guest";

const nav = [
  { to: "/dashboard", label: "Home", Icon: Home },
  { to: "/search", label: "Search", Icon: Search },
  { to: "/discover", label: "Discover", Icon: Compass },
  { to: "/library", label: "Library", Icon: Film },
  { to: "/friends", label: "Friends", Icon: Users },
  { to: "/notifications", label: "Notifications", Icon: Bell },
  { to: "/profile", label: "Profile", Icon: UserIcon },
  { to: "/settings", label: "Settings", Icon: Settings },
] as const;

export function AppShell() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const { isGuest, disableGuest } = useGuest();

  const countFn = useServerFn(getUnreadCount);
  const unreadQ = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => countFn(),
    refetchInterval: 30000,
    enabled: !isGuest,
  });

  useEffect(() => { setOpen(false); }, [pathname]);

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
      <aside className="sticky top-0 hidden h-screen w-60 flex-shrink-0 flex-col border-r border-border/60 glass px-4 py-6 md:flex">
        <Brand />
        <NavList pathname={pathname} unreadCount={unreadQ.data ?? 0} isGuest={isGuest} />
        <button onClick={() => setCmdOpen(true)} className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
          <Command className="h-4 w-4" /> Quick search
          <kbd className="ml-auto rounded border border-border/60 px-1.5 text-[10px]">⌘K</kbd>
        </button>
        {isGuest ? (
          <button onClick={signIn} className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
            <LogIn className="h-4 w-4" /> Sign in
          </button>
        ) : (
          <button onClick={signOut} className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        )}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border/60 flex items-center justify-between px-4 py-3 shadow-sm">
        <Brand compact />
        <div className="flex items-center gap-2">
          <Link to="/notifications" className="relative rounded-lg p-2 hover:bg-muted/40">
            <Bell className="h-5 w-5 text-foreground" />
            {unreadQ.data ? <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" /> : null}
          </Link>
          <button onClick={() => setOpen(!open)} className="rounded-lg p-2 hover:bg-muted/40 transition-colors" aria-label="Menu">
            {open ? <X className="h-5 w-5 text-foreground" /> : <Menu className="h-5 w-5 text-foreground" />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="md:hidden fixed inset-x-0 top-14 z-30 bg-background/95 backdrop-blur-lg border-b border-border/60 p-4 shadow-lg">
          <NavList pathname={pathname} unreadCount={unreadQ.data ?? 0} isGuest={isGuest} />
          {isGuest ? (
            <button onClick={signIn} className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
              <LogIn className="h-4 w-4" /> Sign in
            </button>
          ) : (
            <button onClick={signOut} className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          )}
        </div>
      ) : null}

      <main className="flex-1 md:pl-0 pt-16 md:pt-0">
        <div className="mx-auto max-w-7xl px-4 md:px-8 py-6 md:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/dashboard" className={cn("mb-6 flex items-center gap-2", compact && "mb-0")}>
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-accent shadow-lg">
        <span className="text-sm font-black text-white">N</span>
      </div>
      <div className="leading-none">
        <div className="text-lg font-bold tracking-tight">Nexus<span className="text-accent">Track</span></div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-widest">one list, every screen</div>
      </div>
    </Link>
  );
}

const GUEST_VISIBLE = new Set(["/dashboard", "/search", "/discover", "/notifications", "/profile"]);

function NavList({ pathname, unreadCount, isGuest }: { pathname: string; unreadCount: number; isGuest?: boolean }) {
  const items = isGuest ? nav.filter((n) => GUEST_VISIBLE.has(n.to)) : nav;
  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ to, label, Icon }) => {
        const active = pathname === to || pathname.startsWith(to + "/");
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary/15 text-foreground ring-1 ring-primary/30"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" /> {label}
            {to === "/notifications" && unreadCount > 0 ? (
              <span className="ml-auto rounded-full bg-accent/20 px-2 py-0.5 text-xs font-bold text-accent">{unreadCount}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
