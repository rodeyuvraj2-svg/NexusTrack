import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { listNotifications, markNotificationRead } from "@/lib/notifications.functions";
import {
  listReceivedRecommendations, listSentRecommendations, markRecommendationRead, dismissRecommendation, deleteRecommendation,
  type RecommendationItem,
} from "@/lib/recommendations.functions";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonRow } from "@/components/Skeletons";
import { ErrorPanel } from "@/components/ErrorPanel";
import { EmptyState } from "@/components/EmptyState";
import { Bell, CheckCheck, UserPlus, Heart, Film, Star, Users, Send, Check, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — NexusTrack" }, { name: "description", content: "Your recent activity, friend updates, and recommendations." }] }),
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

interface NotificationItem {
  id: string;
  kind: string;
  payload: Record<string, string | null> | null;
  read_at: string | null;
  created_at: string;
}

type FeedItem =
  | ({ type: "notification" } & NotificationItem)
  | { type: "recommendation"; id: string; rec: RecommendationItem };

function Notifications() {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotifications);
  const readFn = useServerFn(markNotificationRead);
  const recListFn = useServerFn(listReceivedRecommendations);
  const sentListFn = useServerFn(listSentRecommendations);
  const recReadFn = useServerFn(markRecommendationRead);
  const recDismissFn = useServerFn(dismissRecommendation);
  const recDeleteFn = useServerFn(deleteRecommendation);

  const q = useQuery<NotificationItem[]>({ queryKey: ["notifications"], queryFn: () => listFn() });
  // Received recommendations live in their own table but share this feed.
  const recQ = useQuery<RecommendationItem[]>({
    queryKey: ["recommendations", "received"],
    queryFn: () => recListFn(),
  });
  // Sent recommendations — sender-side copies, deletable only.
  const sentQ = useQuery<RecommendationItem[]>({
    queryKey: ["recommendations", "sent"],
    queryFn: () => sentListFn(),
  });

  // Unread count derives from the fetched lists — no separate count
  // roundtrip (the AppShell nav keeps its own polled badge query).
  const unreadRecs = (recQ.data ?? []).filter((r) => r.status === "unread").length;
  const unread = (q.data ?? []).filter((n) => !n.read_at).length + unreadRecs;

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

  // Same idea for recommendations: mark read / dismiss / delete are patched
  // locally so the feed and badge update instantly. `wasUnread` keeps the
  // badge accurate — only unread rows decrement it when removed.
  const patchRecLocally = useCallback((id: string, action: "read" | "dismiss" | "delete", wasUnread: boolean) => {
    const now = new Date().toISOString();
    qc.setQueryData<RecommendationItem[]>(["recommendations", "received"], (old) => {
      if (!old) return old;
      if (action === "read") {
        return old.map((r) => (r.id === id && r.status === "unread" ? { ...r, status: "read" as const, read_at: now } : r));
      }
      return old.filter((r) => r.id !== id); // dismiss/delete both leave the feed
    });
    qc.setQueryData<RecommendationItem[]>(["recommendations", "sent"], (old) =>
      action === "delete" ? (old ?? []).filter((r) => r.id !== id) : old,
    );
    if (wasUnread) {
      qc.setQueryData<number>(["unread-count"], (old) => Math.max(0, (old ?? 0) - 1));
    }
  }, [qc]);

  const invalidateRecs = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["recommendations"] });
    qc.invalidateQueries({ queryKey: ["unread-count"] });
  }, [qc]);

  useEffect(() => {
    const channel = supabase
      .channel("notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        qc.invalidateQueries({ queryKey: ["unread-count"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "media_recommendations" }, () => {
        qc.invalidateQueries({ queryKey: ["recommendations"] });
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

  const mRecRead = useMutation({
    mutationFn: (vars: { id: string; wasUnread: boolean }) => recReadFn({ data: { id: vars.id } }),
    onMutate: (vars) => patchRecLocally(vars.id, "read", vars.wasUnread),
    onError: invalidateRecs,
  });

  const mRecDismiss = useMutation({
    mutationFn: (vars: { id: string; wasUnread: boolean }) => recDismissFn({ data: { id: vars.id } }),
    onMutate: (vars) => patchRecLocally(vars.id, "dismiss", vars.wasUnread),
    onError: invalidateRecs,
  });

  const mRecDelete = useMutation({
    mutationFn: (vars: { id: string; wasUnread: boolean }) => recDeleteFn({ data: { id: vars.id } }),
    onMutate: (vars) => patchRecLocally(vars.id, "delete", vars.wasUnread),
    onError: invalidateRecs,
    onSettled: invalidateRecs,
  });

  // Merge notifications + received recommendations into one feed, newest first.
  const feedTs = (f: FeedItem) => (f.type === "notification" ? f.created_at : f.rec.created_at);
  const feed: FeedItem[] = [
    ...(q.data ?? []).map((n): FeedItem => ({ type: "notification", ...n })),
    ...(recQ.data ?? []).map((r): FeedItem => ({ type: "recommendation", id: r.id, rec: r })),
  ].sort((a, b) => new Date(feedTs(b)).getTime() - new Date(feedTs(a)).getTime());

  const isLoading = q.isLoading || recQ.isLoading;
  const loadError = q.error?.message ?? recQ.error?.message ?? null;
  const sentItems = sentQ.data ?? [];

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            Notifications
            {unread > 0 ? (
              <span className="rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-bold text-accent tabular-nums" aria-label={`${unread} unread`}>
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </span>
        }
        actions={
          (q.data ?? []).some((n) => !n.read_at) ? (
            <button onClick={() => mReadAll.mutate()} className="flex items-center gap-1.5 rounded-lg glass px-3 py-1.5 text-sm hover:bg-muted/40">
              <CheckCheck className="h-4 w-4" /> Mark all read
            </button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : loadError ? (
        <ErrorPanel
          tone="destructive"
          title="Couldn't load notifications"
          detail={loadError}
          action={
            <button
              onClick={() => { q.refetch(); recQ.refetch(); }}
              className="rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white btn-press"
            >
              Try again
            </button>
          }
        />
      ) : feed.length === 0 ? (
        <EmptyState
          variant="panel"
          icon={Bell}
          title="No notifications yet"
          description="Friend activity and recommendations will show up here."
        />
      ) : (
        <div className="space-y-2">
          {feed.map((item) =>
            item.type === "notification" ? (
              <button
                key={item.id}
                onClick={() => !item.read_at && mReadOne.mutate(item.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl p-4 text-left transition-colors",
                  item.read_at ? "glass" : "glass-strong ring-1 ring-accent/30",
                )}
              >
                <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/20 text-primary">
                  {(() => { const Icon = KIND_ICONS[item.kind] ?? Bell; return <Icon className="h-4 w-4" />; })()}
                </div>
                <div className="flex-1">
                  <p className="text-sm">{item.payload?.message ?? item.kind}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                {!item.read_at ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" /> : null}
              </button>
            ) : (
              <RecommendationCard
                key={item.id}
                rec={item.rec}
                onRead={() => item.rec.status === "unread" && mRecRead.mutate({ id: item.id, wasUnread: true })}
                onDismiss={() => mRecDismiss.mutate({ id: item.id, wasUnread: item.rec.status === "unread" })}
                onDelete={() => mRecDelete.mutate({ id: item.id, wasUnread: item.rec.status === "unread" })}
              />
            ),
          )}
        </div>
      )}

      {/* Sent recommendations — sender-side copies with a delete action */}
      {!sentQ.isLoading && sentItems.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-bold flex items-center gap-2">
            <Send className="h-5 w-5 text-accent" /> Sent recommendations
          </h2>
          <div className="space-y-2">
            {sentItems.map((rec) => (
              <div key={rec.id} className="glass rounded-xl p-3 flex items-center gap-3">
                {rec.media?.poster_url ? (
                  <img src={rec.media.poster_url} alt="" loading="lazy" className="h-12 w-8 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="grid h-12 w-8 shrink-0 place-items-center rounded-md bg-muted/40">
                    <Film className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{rec.media?.title ?? "Unknown title"}</p>
                  <p className="text-xs text-muted-foreground">
                    Sent {new Date(rec.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                    {rec.status === "unread" ? " · not seen yet" : ""}
                  </p>
                </div>
                <button
                  onClick={() => mRecDelete.mutate({ id: rec.id, wasUnread: rec.status === "unread" })}
                  disabled={mRecDelete.isPending}
                  aria-label="Delete sent recommendation"
                  title="Delete"
                  className="rounded-lg p-2 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ---- Recommendation card (received) ----

function RecommendationCard({
  rec, onRead, onDismiss, onDelete,
}: {
  rec: RecommendationItem;
  onRead: () => void;
  onDismiss: () => void;
  onDelete: () => void;
}) {
  const senderName = rec.sender?.display_name || rec.sender?.username || "Someone";
  const isUnread = rec.status === "unread";
  const media = rec.media;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl p-4 transition-colors",
        isUnread ? "glass-strong ring-1 ring-accent/30" : "glass",
      )}
    >
      {/* Sender avatar */}
      {rec.sender?.avatar_url ? (
        <img src={rec.sender.avatar_url} alt="" loading="lazy" className="mt-0.5 h-9 w-9 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-accent text-xs font-bold text-white">
          {senderName.charAt(0).toUpperCase()}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold">{senderName}</span>{" "}
          <span className="text-muted-foreground">recommended this to you.</span>
        </p>

        {/* Media: poster + title — clicking opens the details page */}
        {media ? (
          <Link
            to="/media/$type/$source/$id"
            params={{ type: media.media_type, source: media.source, id: media.external_id }}
            onClick={() => isUnread && onRead()}
            className="mt-2 flex items-center gap-2.5 rounded-lg bg-muted/30 p-2 transition-colors hover:bg-muted/50"
          >
            {media.poster_url ? (
              <img src={media.poster_url} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded-md object-cover" />
            ) : (
              <span className="grid h-14 w-10 shrink-0 place-items-center rounded-md bg-muted/40">
                <Film className="h-4 w-4 text-muted-foreground" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{media.title}</span>
              <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">{media.media_type}</span>
            </span>
          </Link>
        ) : null}

        {rec.message ? (
          <p className="mt-2 rounded-lg bg-accent/10 px-3 py-2 text-sm italic text-accent">“{rec.message}”</p>
        ) : null}

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {new Date(rec.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </p>
          <div className="flex items-center gap-0.5">
            {isUnread ? (
              <button
                onClick={onRead}
                aria-label="Mark as read"
                title="Mark as read"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-primary"
              >
                <Check className="h-4 w-4" />
              </button>
            ) : null}
            <button
              onClick={onDismiss}
              aria-label="Dismiss recommendation"
              title="Dismiss"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              aria-label="Delete recommendation"
              title="Delete"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {isUnread ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" /> : null}
    </div>
  );
}
