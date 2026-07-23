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
import { Hop as Home, Search, Compass, Film, Users, User as UserIcon, Bell, Settings, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  function go(to: string) {
    onOpenChange(false);
    navigate({ to });
  }

  async function signOut() {
    onOpenChange(false);
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages or jump to…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          <CommandItem onSelect={() => go("/dashboard")}><Home className="mr-2 h-4 w-4" /> Home</CommandItem>
          <CommandItem onSelect={() => go("/search")}><Search className="mr-2 h-4 w-4" /> Search</CommandItem>
          <CommandItem onSelect={() => go("/discover")}><Compass className="mr-2 h-4 w-4" /> Discover</CommandItem>
          <CommandItem onSelect={() => go("/library")}><Film className="mr-2 h-4 w-4" /> Library</CommandItem>
          <CommandItem onSelect={() => go("/friends")}><Users className="mr-2 h-4 w-4" /> Friends</CommandItem>
          <CommandItem onSelect={() => go("/notifications")}><Bell className="mr-2 h-4 w-4" /> Notifications</CommandItem>
          <CommandItem onSelect={() => go("/profile")}><UserIcon className="mr-2 h-4 w-4" /> Profile</CommandItem>
          <CommandItem onSelect={() => go("/settings")}><Settings className="mr-2 h-4 w-4" /> Settings</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Account">
          <CommandItem onSelect={signOut}><LogOut className="mr-2 h-4 w-4" /> Sign out</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
