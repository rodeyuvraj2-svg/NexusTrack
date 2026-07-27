import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Hop as Home, Search, Compass, Film, Users, User as UserIcon, Bell, Settings, LogOut, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useGuest } from "@/lib/guest";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isGuest, disableGuest } = useGuest();

  function go(to: string) {
    onOpenChange(false);
    navigate({ to });
  }

  async function signOut() {
    onOpenChange(false);
    await supabase.auth.signOut();
    disableGuest();
    navigate({ to: "/auth", replace: true });
  }

  function signIn() {
    onOpenChange(false);
    navigate({ to: "/auth" });
  }

  const pages = isGuest
    ? [
        { to: "/dashboard", label: "Home", Icon: Home },
        { to: "/search", label: "Search", Icon: Search },
        { to: "/discover", label: "Discover", Icon: Compass },
        { to: "/notifications", label: "Notifications", Icon: Bell },
        { to: "/profile", label: "Profile", Icon: UserIcon },
      ]
    : [
        { to: "/dashboard", label: "Home", Icon: Home },
        { to: "/search", label: "Search", Icon: Search },
        { to: "/discover", label: "Discover", Icon: Compass },
        { to: "/library", label: "Library", Icon: Film },
        { to: "/friends", label: "Friends", Icon: Users },
        { to: "/notifications", label: "Notifications", Icon: Bell },
        { to: "/profile", label: "Profile", Icon: UserIcon },
        { to: "/settings", label: "Settings", Icon: Settings },
      ];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages or jump to…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {pages.map(({ to, label, Icon }) => (
            <CommandItem key={to} onSelect={() => go(to)}>
              <Icon className="mr-2 h-4 w-4" /> {label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Account">
          {isGuest ? (
            <CommandItem onSelect={signIn}><LogIn className="mr-2 h-4 w-4" /> Sign in</CommandItem>
          ) : (
            <CommandItem onSelect={signOut}><LogOut className="mr-2 h-4 w-4" /> Sign out</CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
