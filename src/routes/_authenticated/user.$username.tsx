import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPublicProfile, copyFromFriend } from "@/lib/friends.functions";
import { STATUS_LABELS, STATUS_COLORS, getStatusLabel, type WatchStatus } from "@/lib/media-types";
import { Film, Heart, Check, BookmarkIcon, Plus, Users, UserPlus, UserCheck, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getFollowCounts, getFollowers, getFollowing, isFollowing, followUser, unfollowUser } from "@/lib/follows.functions";
import { useGuest } from "@/lib/guest";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_FILTERS = ["all", "planned", "watching", "completed", "favorites"] as const;
const TYPE_FILTERS = ["all", "movie", "tv", "anime", "manga"] as const;

export const Route = createFileRoute("/_authenticated/user/$username")({
  head: () => ({ meta: [{ title: "Profile — NexusTrack" }, { name: "description", content: "View a friend's library." }] }),
  component: FriendProfile,
});

function FriendProfile() {
  const { username } = useParams({ from: "/_authenticated/user/$username" });
  const qc = useQueryClient();
  const profileFn = useServerFn(getPublicProfile);
  const copyFn = useServerFn(copyFromFriend);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const q = useQuery({ queryKey: ["public-profile", username], queryFn: () => profileFn({ data: { username } }), placeholderData: (prev) => prev });

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null)); }, []);

  const countFn = useServerFn(getFollowCounts);
  const isFollowingFn = useServerFn(isFollowing);
  const followMutFn = useServerFn(followUser);
  const unfollowMutFn = useServerFn(unfollowUser);

  const profileId = q.data?.profile?.id;
  const isOwnProfile = profileId && currentUserId && profileId === currentUserId;
  const followCountsQ = useQuery({
    queryKey: ["follow-counts", profileId],
    queryFn: () => countFn({ data: { user_id: profileId! } }),
    enabled: !!profileId,
    staleTime: 60_000,
  });

  const followingQ = useQuery({
    queryKey: ["is-following", profileId],
    queryFn: () => isFollowingFn({ data: { target_user_id: profileId! } }),
    enabled: !!profileId,
  });

  const mFollow = useMutation({
    mutationFn: () => followMutFn({ data: { following_id: profileId! } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["is-following"] }); qc.invalidateQueries({ queryKey: ["follow-counts"] }); },
  });

  const mUnfollow = useMutation({
    mutationFn: () => unfollowMutFn({ data: { following_id: profileId! } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["is-following"] }); qc.invalidateQueries({ queryKey: ["follow-counts"] }); },
  });

  const [listMode, setListMode] = useState<"followers" | "following" | null>(null);
  const followersFn = useServerFn(getFollowers);
  const followingListFn = useServerFn(getFollowing);
  const followersListQ = useQuery({
    queryKey: ["followers", profileId],
    queryFn: () => followersFn({ data: { user_id: profileId! } }),
    enabled: listMode === "followers" && !!profileId,
  });
  const followingListQ = useQuery({
    queryKey: ["following-list", profileId],
    queryFn: () => followingListFn({ data: { user_id: profileId! } }),
    enabled: listMode === "following" && !!profileId,
  });

  const mCopy = useMutation({
    mutationFn: (vars: { media_id: string; source_user_id: string }) =>
      copyFn({ data: { media_id: vars.media_id, copy_status: false, copy_favorite: false, source_user_id: vars.source_user_id } }),
    onSuccess: (res) => {
      if (res.duplicate) toast.info("Already in your library");
      else { toast.success("Added to your watchlist!"); qc.invalidateQueries({ queryKey: ["library"] }); }
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <FriendProfileSkeleton />;
  if (!q.data) return (
    <div className="glass rounded-2xl p-12 text-center">
      <p className="text-muted-foreground">This profile is private or doesn't exist.</p>
      <Link to="/friends" className="mt-4 inline-block rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white">Back to friends</Link>
    </div>
  );

  const { profile, library, isPrivate } = q.data;
  const watching = library.filter((l) => l.status === "watching" || l.status === "rewatching");
  const completed = library.filter((l) => l.status === "completed");
  const planned = library.filter((l) => l.status === "planned");
  const favorites = library.filter((l) => l.favorite);

  const filtered = library.filter((item) => {
    if (statusFilter === "favorites" && !item.favorite) return false;
    if (statusFilter === "watching" && item.status !== "watching" && item.status !== "rewatching") return false;
    if (statusFilter === "completed" && item.status !== "completed") return false;
    if (statusFilter === "planned" && item.status !== "planned") return false;
    const mediaType = (item.media as unknown as { media_type?: string })?.media_type;
    if (typeFilter !== "all" && mediaType !== typeFilter) return false;
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" loading="lazy" className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <div className="h-24 w-24 rounded-full bg-gradient-accent grid place-items-center text-white text-3xl font-black">
            {(profile.display_name || profile.username).charAt(0).toUpperCase()}
          </div>
        )}
        <div className="text-center sm:text-left">
          <h1 className="text-3xl md:text-4xl font-bold">{profile.display_name || profile.username}</h1>
          <p className="text-muted-foreground">@{profile.username}</p>
          {profile.bio ? <p className="mt-2 max-w-md text-sm text-muted-foreground">{profile.bio}</p> : null}
          {/* Follow counts */}
          <div className="mt-2 flex items-center gap-4 text-sm">
            <button type="button" onClick={() => setListMode("followers")} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <Users className="h-4 w-4" />
              <span className="font-semibold text-foreground">{followCountsQ.data?.followers ?? 0}</span> followers
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button type="button" onClick={() => setListMode("following")} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <span className="font-semibold text-foreground">{followCountsQ.data?.following ?? 0}</span> following
            </button>
          </div>
          {/* Follow/Unfollow button (hidden for own profile) */}
          {!isOwnProfile ? (
            followingQ.data ? (
              <button onClick={() => mUnfollow.mutate()} disabled={mUnfollow.isPending}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg glass px-3 py-1.5 text-sm hover:bg-muted/40">
                <UserCheck className="h-3.5 w-3.5" /> Following
              </button>
            ) : (
              <button onClick={() => mFollow.mutate()} disabled={mFollow.isPending}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gradient-accent px-3 py-1.5 text-sm font-semibold text-white">
                <UserPlus className="h-3.5 w-3.5" /> Follow
              </button>
            )
          ) : null}
          {isPrivate && (
            <p className="mt-2 text-xs text-muted-foreground italic">This profile is private. Follow them to see their library.</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-5 gap-3">
        {[
          { label: "In library", value: library.length, Icon: Film },
          { label: "Planned", value: planned.length, Icon: Clock },
          { label: "Watching", value: watching.length, Icon: BookmarkIcon },
          { label: "Completed", value: completed.length, Icon: Check },
          { label: "Favorites", value: favorites.length, Icon: Heart },
        ].map((s) => (
          <div key={s.label} className="glass rounded-xl p-4 text-center">
            <s.Icon className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
            <div className="text-2xl font-bold text-accent">{s.value}</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Status filter pills */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2 scrollbar-none md:flex-wrap">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 capitalize ${
              statusFilter === s ? "bg-gradient-accent text-white shadow-md" : "glass hover:bg-muted/40"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Type filter pills */}
      <div className="mb-8 flex flex-wrap gap-2">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wider transition-colors capitalize ${
              typeFilter === t ? "border-primary/50 bg-primary/20 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Filtered library grid */}
      {filtered.length > 0 ? (
        <FriendGrid items={filtered} profileId={profile.id} mCopy={mCopy} />
      ) : (
        <div className="glass rounded-2xl p-12 text-center">
          <p className="text-muted-foreground">
            {library.length === 0
              ? "This user hasn't added anything yet."
              : "No items match the selected filters."}
          </p>
        </div>
      )}

      {/* Followers/Following Dialog */}
      <Dialog open={listMode !== null} onOpenChange={(open) => { if (!open) setListMode(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{listMode === "followers" ? "Followers" : "Following"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {(listMode === "followers" ? followersListQ.data : followingListQ.data)?.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No one here yet.</p>
            ) : null}
            {(listMode === "followers" ? followersListQ.data : followingListQ.data)?.map((user: any) => (
              <Link key={user.id} to={"/user/" + user.username} onClick={() => setListMode(null)}>
                <div className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted/30 transition-colors">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gradient-accent grid place-items-center text-white font-bold text-sm">
                      {(user.display_name || user.username).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-semibold">{user.display_name || user.username}</div>
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

function FriendGrid({ items, profileId, mCopy }: {
  items: Array<{ id: string; status: WatchStatus; rating: number | null; favorite: boolean; media: { id: string; media_type: string; source: string; external_id: string; title: string; poster_url: string | null; release_year: number | null } }>;
  profileId: string;
  mCopy: { mutate: (vars: { media_id: string; source_user_id: string }) => void; isPending: boolean };
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {items.map((item) => {
        const m = item.media as unknown as { id: string; media_type: string; source: string; external_id: string; title: string; poster_url: string | null; release_year: number | null };
        if (!m) return null;
        return (
          <div key={item.id} className="group relative overflow-hidden rounded-xl glass">
            <Link to="/media/$type/$source/$id" params={{ type: m.media_type, source: m.source ?? "tmdb", id: m.external_id ?? m.id }} className="block">
              <div className="aspect-[2/3] bg-muted overflow-hidden">
                {m.poster_url ? <img src={m.poster_url} alt={m.title} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" /> : null}
              </div>
              <div className="p-2.5">
                <span className={cn("inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider", STATUS_COLORS[item.status])}>
                  {getStatusLabel(item.status, m?.media_type as "movie" | "tv" | "anime" | "manga")}
                </span>
                <h3 className="mt-1 line-clamp-2 text-xs font-semibold">{m.title}</h3>
              </div>
            </Link>
            <button
              onClick={() => mCopy.mutate({ media_id: m.id, source_user_id: profileId })}
              disabled={mCopy.isPending}
              className="absolute right-2 top-2 rounded-lg bg-gradient-accent p-1.5 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
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
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="glass rounded-xl p-4 h-24" />
        ))}
      </div>
    </div>
  );
}
