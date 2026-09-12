import { createFileRoute, useParams, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPublicProfile, copyFromFriend } from "@/lib/friends.functions";
import { STATUS_LABELS, STATUS_COLORS, getStatusLabel, type WatchStatus } from "@/lib/media-types";
import {
  Film,
  Heart,
  Check,
  BookmarkIcon,
  Plus,
  Users,
  UserPlus,
  UserCheck,
  Clock,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getFollowState,
  getFollowers,
  getFollowing,
  followUser,
  unfollowUser,
  type FollowProfile,
} from "@/lib/follows.functions";
import { useGuest } from "@/lib/guest";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { FilterTabs, Chip } from "@/components/FilterTabs";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { Film as FilmIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STATUS_FILTERS = ["all", "planned", "watching", "completed", "favorites"] as const;
const TYPE_FILTERS = ["all", "movie", "tv", "anime", "manga"] as const;

export const Route = createFileRoute("/_authenticated/user/$username")({
  head: () => ({
    meta: [
      { title: "Profile — NexusTrack" },
      { name: "description", content: "View a friend's library." },
    ],
  }),
  errorComponent: RouteErrorBoundary,
  component: FriendProfile,
});

function FriendProfile() {
  const { username } = useParams({ from: "/_authenticated/user/$username" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const profileFn = useServerFn(getPublicProfile);
  const copyFn = useServerFn(copyFromFriend);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // SPA back when there is in-app history; friends page when opened directly
  const goBack = useCallback(() => {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: "/friends" });
  }, [router, navigate]);

  const q = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => profileFn({ data: { username } }),
    placeholderData: (prev) => prev,
  });

  // Session already lives in localStorage — getSession() reads it locally
  // (no network roundtrip, unlike getUser()). Server functions still
  // independently enforce auth on every call.
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setCurrentUserId(data.session?.user.id ?? null));
  }, []);

  const followStateFn = useServerFn(getFollowState);
  const followMutFn = useServerFn(followUser);
  const unfollowMutFn = useServerFn(unfollowUser);

  const profileId = q.data?.profile?.id;
  const isOwnProfile = profileId && currentUserId && profileId === currentUserId;

  // One roundtrip for counts + is-following (was two separate queries).
  const followStateQ = useQuery({
    queryKey: ["follow-state", profileId],
    queryFn: () => followStateFn({ data: { user_id: profileId! } }),
    enabled: !!profileId,
    staleTime: 60_000,
  });

  const isFollowing = followStateQ.data?.isFollowing ?? false;
  const followersCount = followStateQ.data?.followers ?? 0;
  const followingCount = followStateQ.data?.following ?? 0;

  // Optimistic follow/unfollow: flip the button and counts immediately,
  // roll back on error, and never refetch the whole profile or lists.
  const mToggleFollow = useMutation({
    mutationFn: (follow: boolean) =>
      follow
        ? followMutFn({ data: { following_id: profileId! } })
        : unfollowMutFn({ data: { following_id: profileId! } }),
    onMutate: async (follow) => {
      await qc.cancelQueries({ queryKey: ["follow-state", profileId] });
      const previous = qc.getQueryData(["follow-state", profileId]);
      qc.setQueryData(
        ["follow-state", profileId],
        (old: { followers: number; following: number; isFollowing: boolean } | undefined) =>
          old ? { ...old, isFollowing: follow, followers: old.followers + (follow ? 1 : -1) } : old,
      );
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(["follow-state", profileId], ctx.previous);
      toast.error("Couldn't update follow — try again");
    },
    onSettled: () => {
      // Reconcile with the server's truth, but only this one query.
      qc.invalidateQueries({ queryKey: ["follow-state", profileId] });
    },
  });

  const [listMode, setListMode] = useState<"followers" | "following" | null>(null);
  const followersFn = useServerFn(getFollowers);
  const followingListFn = useServerFn(getFollowing);
  const followersListQ = useQuery({
    queryKey: ["followers", profileId],
    queryFn: () => followersFn({ data: { user_id: profileId! } }),
    enabled: listMode === "followers" && !!profileId,
    staleTime: 60_000,
  });
  const followingListQ = useQuery({
    queryKey: ["following-list", profileId],
    queryFn: () => followingListFn({ data: { user_id: profileId! } }),
    enabled: listMode === "following" && !!profileId,
    staleTime: 60_000,
  });

  const mCopy = useMutation({
    mutationFn: (vars: { media_id: string; source_user_id: string }) =>
      copyFn({
        data: {
          media_id: vars.media_id,
          copy_status: false,
          copy_favorite: false,
          source_user_id: vars.source_user_id,
        },
      }),
    onSuccess: (res) => {
      if (res.duplicate) toast.info("Already in your library");
      else {
        toast.success("Added to your watchlist!");
        qc.invalidateQueries({ queryKey: ["library"] });
      }
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <FriendProfileSkeleton />;
  if (!q.data)
    return (
      <div className="glass rounded-2xl p-12 text-center">
        <p className="text-muted-foreground">This profile is private or doesn't exist.</p>
        <Link
          to="/friends"
          className="mt-4 inline-block rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white"
        >
          Back to friends
        </Link>
      </div>
    );

  // Row shape returned by getPublicProfile's library query.
  interface FriendLibItem {
    id: string;
    status: string;
    rating: number | null;
    favorite: boolean;
    media: {
      id: string;
      media_type: string;
      source: string;
      external_id: string;
      title: string;
      poster_url: string | null;
      release_year: number | null;
    } | null;
  }
  const { profile, library: rawLibrary, isPrivate } = q.data;
  const library = (rawLibrary ?? []) as FriendLibItem[];
  const watching = library.filter((l) => l.status === "watching" || l.status === "rewatching");
  const completed = library.filter((l) => l.status === "completed");
  const planned = library.filter((l) => l.status === "planned");
  const favorites = library.filter((l) => l.favorite);

  const filtered = library.filter((item) => {
    if (statusFilter === "favorites" && !item.favorite) return false;
    if (statusFilter === "watching" && item.status !== "watching" && item.status !== "rewatching")
      return false;
    if (statusFilter === "completed" && item.status !== "completed") return false;
    if (statusFilter === "planned" && item.status !== "planned") return false;
    const mediaType = item.media?.media_type;
    if (typeFilter !== "all" && mediaType !== typeFilter) return false;
    return true;
  });

  return (
    <div>
      {/* Back button */}
      <button
        onClick={goBack}
        className="mb-6 inline-flex items-center gap-2 rounded-full bg-muted border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent hover:text-accent-foreground transition-all shadow-md"
        title="Go back"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back</span>
      </button>

      {/* Header */}
      <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            loading="lazy"
            className="h-24 w-24 rounded-full object-cover"
          />
        ) : (
          <div className="h-24 w-24 rounded-full bg-gradient-accent grid place-items-center text-white text-3xl font-black">
            {(profile.display_name || profile.username).charAt(0).toUpperCase()}
          </div>
        )}
        <div className="text-center sm:text-left">
          <h1 className="text-3xl md:text-4xl font-bold">
            {profile.display_name || profile.username}
          </h1>
          <p className="text-muted-foreground">@{profile.username}</p>
          {profile.bio ? (
            <p className="mt-2 max-w-md text-sm text-muted-foreground">{profile.bio}</p>
          ) : null}
          {/* Follow counts (optimistic — update instantly on follow actions) */}
          <div className="mt-2 flex items-center gap-4 text-sm">
            <button
              type="button"
              onClick={() => setListMode("followers")}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Users className="h-4 w-4" />
              <span className="font-semibold text-foreground">{followersCount}</span> followers
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button
              type="button"
              onClick={() => setListMode("following")}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="font-semibold text-foreground">{followingCount}</span> following
            </button>
          </div>
          {/* Follow/Unfollow button (hidden for own profile) */}
          {!isOwnProfile ? (
            isFollowing ? (
              <button
                onClick={() => mToggleFollow.mutate(false)}
                disabled={mToggleFollow.isPending}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg glass px-3 py-1.5 text-sm hover:bg-muted/40"
              >
                <UserCheck className="h-3.5 w-3.5" /> Following
              </button>
            ) : (
              <button
                onClick={() => mToggleFollow.mutate(true)}
                disabled={mToggleFollow.isPending}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gradient-accent px-3 py-1.5 text-sm font-semibold text-white"
              >
                <UserPlus className="h-3.5 w-3.5" /> Follow
              </button>
            )
          ) : null}
          {isPrivate && (
            <p className="mt-2 text-xs text-muted-foreground italic">
              This profile is private. Send a friend request to see their library.
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {[
          { label: "In library", value: library.length, Icon: Film },
          { label: "Planned", value: planned.length, Icon: Clock },
          { label: "Watching", value: watching.length, Icon: BookmarkIcon },
          { label: "Completed", value: completed.length, Icon: Check },
          { label: "Favorites", value: favorites.length, Icon: Heart },
        ].map((s) => (
          <StatCard key={s.label} icon={s.Icon} label={s.label} value={s.value} className="p-4" />
        ))}
      </div>

      {/* Status filter pills */}
      <FilterTabs
        className="mb-4 md:flex-wrap"
        size="sm"
        options={STATUS_FILTERS.map((s) => ({
          value: s,
          label: s.charAt(0).toUpperCase() + s.slice(1),
        }))}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      {/* Type filter pills */}
      <div className="mb-8 flex flex-wrap gap-2">
        {TYPE_FILTERS.map((t) => (
          <Chip
            key={t}
            active={typeFilter === t}
            onClick={() => setTypeFilter(t)}
            className="capitalize"
          >
            {t}
          </Chip>
        ))}
      </div>

      {/* Filtered library grid */}
      {filtered.length > 0 ? (
        <FriendGrid items={filtered} profileId={profile.id} mCopy={mCopy} />
      ) : (
        <EmptyState
          variant="panel"
          icon={FilmIcon}
          title={library.length === 0 ? "Nothing here yet" : "No items match the selected filters."}
          description={
            library.length === 0
              ? "This user hasn't added anything to their library yet."
              : "Try a different status or type filter."
          }
        />
      )}

      {/* Followers/Following Dialog */}
      <Dialog
        open={listMode !== null}
        onOpenChange={(open) => {
          if (!open) setListMode(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{listMode === "followers" ? "Followers" : "Following"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {(listMode === "followers" ? followersListQ.data : followingListQ.data)?.length ===
            0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No one here yet.</p>
            ) : null}
            {(listMode === "followers"
              ? (followersListQ.data as FollowProfile[] | undefined)
              : (followingListQ.data as FollowProfile[] | undefined)
            )?.map((user) => (
              <Link key={user.id} to={"/user/" + user.username} onClick={() => setListMode(null)}>
                <div className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted/30 transition-colors">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gradient-accent grid place-items-center text-white font-bold text-sm">
                      {(user.display_name || user.username).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-semibold">
                      {user.display_name || user.username}
                    </div>
                    <div className="text-xs text-muted-foreground">@{user.username}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FriendGrid({
  items,
  profileId,
  mCopy,
}: {
  items: Array<{
    id: string;
    status: string;
    rating: number | null;
    favorite: boolean;
    media: {
      id: string;
      media_type: string;
      source: string;
      external_id: string;
      title: string;
      poster_url: string | null;
      release_year: number | null;
    } | null;
  }>;
  profileId: string;
  mCopy: {
    mutate: (vars: { media_id: string; source_user_id: string }) => void;
    isPending: boolean;
  };
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {items.map((item) => {
        const m = item.media;
        if (!m) return null;
        return (
          <div key={item.id} className="group relative overflow-hidden rounded-xl glass">
            <Link
              to="/media/$type/$source/$id"
              params={{ type: m.media_type, source: m.source ?? "tmdb", id: m.external_id ?? m.id }}
              className="block"
            >
              <div className="aspect-[2/3] bg-muted overflow-hidden">
                {m.poster_url ? (
                  <img
                    src={m.poster_url}
                    alt={m.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : null}
              </div>
              <div className="p-2.5">
                <span
                  className={cn(
                    "inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
                    STATUS_COLORS[item.status as WatchStatus],
                  )}
                >
                  {getStatusLabel(
                    item.status as WatchStatus,
                    m?.media_type as "movie" | "tv" | "anime" | "manga",
                  )}
                </span>
                <h3 className="mt-1 line-clamp-2 text-xs font-semibold">{m.title}</h3>
              </div>
            </Link>
            <button
              onClick={() => mCopy.mutate({ media_id: m.id, source_user_id: profileId })}
              disabled={mCopy.isPending}
              className="absolute right-2 top-2 rounded-lg bg-gradient-accent p-1.5 text-white shadow-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:scale-110"
              title="Add to my watchlist"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FriendProfileSkeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="flex items-center gap-4">
        <div className="h-24 w-24 rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-4 w-32 rounded bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="glass rounded-xl p-4 h-24" />
        ))}
      </div>
    </div>
  );
}
