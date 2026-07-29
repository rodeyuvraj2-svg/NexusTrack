import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Compass, Film, Home, LogOut, Search, Users, User, Menu, X, Bell, Settings, Command, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/CommandPalette";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getUnreadCount } from "@/lib/notifications.functions";
import { useGuest } from "@/lib/guest";

const NAV = [
  { to: "/dashboard", label: "Home", Icon: Home },
  { to: "/search", label: "Search", Icon: Search },
  { to: "/discover", label: "Discover", Icon: Compass },
  { to: "/library", label: "Library", Icon: Film },
  { to: "/friends", label: "Friends", Icon: Users },
  { to: "/notifications", label: "Notifications", Icon: Bell },
  { to: "/profile", label: "Profile", Icon: User },
] as const;

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
      <aside className="sticky top-0 hidden h-screen w-56 flex-shrink-0 flex-col border-r border-border/40 bg-sidebar/80 backdrop-blur-sm px-3 py-5 md:flex">
        <Brand />
        <NavList pathname={pathname} unreadCount={unreadQ.data ?? 0} isGuest={isGuest} />
        <div className="mt-2 space-y-0.5">
          <button onClick={() => setCmdOpen(true)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors">
            <Command className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Search</span>
            <kbd className="rounded border border-border/40 px-1.5 text-[10px] text-muted-foreground/60">⌘K</kbd>
          </button>
          <Link to="/settings" className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
            pathname === "/settings"
              ? "bg-primary/10 text-foreground"
              : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
          )}>
            <Settings className="h-4 w-4 shrink-0" /> Settings
          </Link>
        </div>
        <div className="mt-auto pt-2 border-t border-border/20">
          {isGuest ? (
            <button onClick={signIn} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors">
              <LogIn className="h-4 w-4 shrink-0" /> Sign in
            </button>
          ) : (
            <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors">
              <LogOut className="h-4 w-4 shrink-0" /> Sign out
            </button>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-background/90 backdrop-blur-lg border-b border-border/30 flex items-center justify-between px-4 py-3">
        <Brand compact />
        <div className="flex items-center gap-1">
          <Link to="/notifications" className="relative rounded-lg p-2 hover:bg-muted/30">
            <Bell className="h-5 w-5 text-foreground/80" />
            {unreadQ.data ? <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" /> : null}
          </Link>
          <button onClick={() => setOpen(!open)} className="rounded-lg p-2 hover:bg-muted/30" aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden fixed inset-x-0 top-[57px] bottom-0 z-30 bg-background/95 backdrop-blur-lg border-b border-border/30 p-4 animate-fade-in overflow-y-auto">
          <NavList pathname={pathname} unreadCount={unreadQ.data ?? 0} isGuest={isGuest} vertical />
          <div className="mt-3 space-y-0.5">
            <button onClick={() => { setCmdOpen(true); setOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/30 transition-colors">
              <Command className="h-4 w-4" /> Quick search
            </button>
            <Link to="/settings" onClick={() => setOpen(false)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/30 transition-colors">
              <Settings className="h-4 w-4" /> Settings
            </Link>
          </div>
          <div className="mt-3 pt-3 border-t border-border/20">
            {isGuest ? (
              <button onClick={signIn} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/30 transition-colors">
                <LogIn className="h-4 w-4" /> Sign in
              </button>
            ) : (
              <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/30 transition-colors">
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
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-lg border-t border-border/30 safe-area-bottom">
        <div className="flex items-center justify-around px-2 py-1">
          {BOTTOM_NAV.map(({ to, label, Icon }) => {
            const active = pathname === to || (to !== "/dashboard" && pathname.startsWith(to + "/"));
            return (
              <Link key={to} to={to}
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
    <Link to="/dashboard" className={cn("flex items-center gap-2.5 px-1 mb-6", compact && "mb-0")}>
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-accent shadow-lg">
        <span className="text-sm font-black text-white">N</span>
      </div>
      <span className="text-base font-bold">Nexus<span className="text-primary">Track</span></span>
    </Link>
  );
}

const GUEST_VISIBLE = new Set(["/dashboard", "/search", "/discover", "/notifications", "/profile"]);

function NavList({ pathname, unreadCount, isGuest, vertical }: { pathname: string; unreadCount: number; isGuest?: boolean; vertical?: boolean }) {
  const items = isGuest ? NAV.filter((n) => GUEST_VISIBLE.has(n.to)) : NAV;
  return (
    <nav className={cn("flex flex-col gap-0.5", vertical && "gap-0.5")}>
      {items.map(({ to, label, Icon }) => {
        const active = pathname === to || pathname.startsWith(to + "/");
        return (
          <Link key={to} to={to}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-primary/10 text-foreground font-medium"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" /> {label}
            {to === "/notifications" && unreadCount > 0 && (
              <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">{unreadCount}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
