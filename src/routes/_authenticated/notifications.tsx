import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listNotifications, markNotificationRead, getUnreadCount } from "@/lib/notifications.functions";
import { Bell, CheckCheck, UserPlus, Heart, Film, Star, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — NexusTrack" }, { name: "description", content: "Your recent activity and friend updates." }] }),
  component: Notifications,
});

const KIND_ICONS: Record<string, typeof Bell> = {
  friend_request: UserPlus,
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
  const countFn = useServerFn(getUnreadCount);

  const q = useQuery({ queryKey: ["notifications"], queryFn: () => listFn() });
  const countQ = useQuery({ queryKey: ["unread-count"], queryFn: () => countFn() });

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["unread-count"] }); },
  });

  const mReadOne = useMutation({
    mutationFn: (id: string) => readFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["unread-count"] }); },
  });

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl md:text-4xl font-bold">Notifications</h1>
          {countQ.data ? (
            <span className="rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-bold text-accent">{countQ.data}</span>
          ) : null}
        </div>
        {q.data && q.data.some((n) => !n.read_at) ? (
          <button onClick={() => mReadAll.mutate()} className="flex items-center gap-1.5 rounded-lg glass px-3 py-1.5 text-sm hover:bg-muted/40">
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        ) : null}
      </div>

      {q.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (q.data?.length ?? 0) === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {q.data!.map((n) => {
            const Icon = KIND_ICONS[n.kind] ?? Bell;
            const payload = n.payload as Record<string, string> | null;
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
