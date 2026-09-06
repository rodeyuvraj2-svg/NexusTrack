import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listNotifications, markNotificationRead } from "@/lib/notifications.functions";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { Bell, CheckCheck, UserPlus, Heart, Film, Star, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — NexusTrack" }, { name: "description", content: "Your recent activity and friend updates." }] }),
  errorComponent: RouteErrorBoundary,
  component: Notifications,
});

const KIND_ICONS: Record<string, typeof Bell> = {
  friend_request: UserPlus,
  friend_accept: Users,
  friend_accepted: Users,
  copied: Heart,
  new_season: Film,
  upcoming: Bell,
  friend_completed: Star,
  review_liked: Heart,
};

function Notifications() {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotifications);
  const readFn = useServerFn(markNotificationRead);

  interface NotificationItem {
    id: string;
    kind: string;
    payload: Record<string, string | null> | null;
    read_at: string | null;
    created_at: string;
  }
  const q = useQuery<NotificationItem[]>({ queryKey: ["notifications"], queryFn: () => listFn() });
  // Unread count derives from the already-fetched list — no separate
  // count roundtrip (the AppShell nav keeps its own polled badge query).
  const unread = (q.data ?? []).filter((n) => !n.read_at).length;

  // Patch the list cache in place for a read-marking mutation — flipping
  // read_at locally instead of invalidating and refetching the whole list.
  const patchReadLocally = useCallback((ids: string[] | "all") => {
    qc.setQueryData<Array<{ id: string; read_at: string | null }>>(["notifications"], (old) => {
      if (!old) return old;
      const now = new Date().toISOString();
      return old.map((n) => (ids === "all" || ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n));
    });
    // Keep the nav badge in sync without refetching it either.
    qc.setQueryData<number>(["unread-count"], (old) => (ids === "all" ? 0 : Math.max(0, (old ?? 0) - ids.length)));
  }, [qc]);

  useEffect(() => {
    const channel = supabase
      .channel("notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        qc.invalidateQueries({ queryKey: ["unread-count"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const mReadAll = useMutation({
    mutationFn: () => readFn({ data: { all: true } }),
    onMutate: () => patchReadLocally("all"),
    onError: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["unread-count"] }); },
  });

  const mReadOne = useMutation({
    mutationFn: (id: string) => readFn({ data: { id } }),
    onMutate: (id) => patchReadLocally([id]),
    onError: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["unread-count"] }); },
  });

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl md:text-4xl font-bold">Notifications</h1>
          {unread > 0 ? (
            <span className="rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-bold text-accent">{unread}</span>
          ) : null}
        </div>
        {q.data && q.data.some((n) => !n.read_at) ? (
          <button onClick={() => mReadAll.mutate()} className="flex items-center gap-1.5 rounded-lg glass px-3 py-1.5 text-sm hover:bg-muted/40">
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        ) : null}
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass rounded-xl p-4 h-20 animate-pulse flex gap-3">
              <div className="h-9 w-9 shrink-0 rounded-lg bg-muted/40" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-muted/30" />
                <div className="h-3 w-1/4 rounded bg-muted/20" />
              </div>
            </div>
          ))}
        </div>
      ) : (q.data?.length ?? 0) === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {q.data!.map((n) => {
            const Icon = KIND_ICONS[n.kind] ?? Bell;
            const payload = n.payload;
            return (
              <button
                key={n.id}
                onClick={() => !n.read_at && mReadOne.mutate(n.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl p-4 text-left transition-colors",
                  n.read_at ? "glass" : "glass-strong ring-1 ring-accent/30",
                )}
              >
                <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/20 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm">{payload?.message ?? n.kind}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                {!n.read_at ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
