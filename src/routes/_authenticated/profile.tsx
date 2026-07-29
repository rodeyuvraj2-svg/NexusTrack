import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStats, listLibrary } from "@/lib/library.functions";
import { getStatusLabel, type WatchStatus } from "@/lib/media-types";
import { Star, Clock, Flame, TrendingUp, CheckCircle2, Film, Tv, Sparkles, Heart, Edit3, Save, Users, BookmarkPlus, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useGuest } from "@/lib/guest";
import { EmptyState } from "@/components/EmptyState";
import { getFollowCounts, getFollowers, getFollowing } from "@/lib/follows.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — NexusTrack" }, { name: "description", content: "Your stats, favorites, and watch history." }] }),
  component: Profile,
});

const STAT_CARDS: { key: string; label: string; Icon: typeof Film; suffix?: string | ((v: number) => string) }[] = [
  { key: "total", label: "In Library", Icon: Film },
  { key: "completed", label: "Completed", Icon: CheckCircle2 },
  { key: "watching", label: "Watching", Icon: Eye },
  { key: "hoursWatched", label: "Hours", Icon: Clock, suffix: "h" },
  { key: "currentStreak", label: "Streak", Icon: Flame, suffix: (v: number) => `${v}${v === 1 ? " day" : " days"}` },
];

function Profile() {
  const qc = useQueryClient();
  const statsFn = useServerFn(getStats);
  const libFn = useServerFn(listLibrary);

  const [profile, setProfile] = useState<{ id: string; username: string; display_name: string | null; bio: string | null; avatar_url: string | null; is_public: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const { isGuest } = useGuest();

  if (isGuest) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Profile</h1>
        <EmptyState
          icon={Users}
          title="Sign in to see your profile"
          description="Track your stats, manage your favorites, and keep your watch history."
          action={<Link to="/auth" className="inline-block rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white">Sign in</Link>}
        />
      </div>
    );
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (data) { setProfile(data); setDisplayName(data.display_name ?? ""); setBio(data.bio ?? ""); }
    })();
  }, []);

  const statsQ = useQuery({ queryKey: ["stats"], queryFn: () => statsFn() });
  const libQ = useQuery({ queryKey: ["library", "profile"], queryFn: () => libFn() });
  const countFn = useServerFn(getFollowCounts);
  const followCountsQ = useQuery({
    queryKey: ["follow-counts", profile?.id],
    queryFn: () => countFn({ data: { user_id: profile!.id } }),
    enabled: !!profile?.id,
    staleTime: 60_000,
  });

  const [listMode, setListMode] = useState<"followers" | "following" | null>(null);
  const followersFn = useServerFn(getFollowers);
  const followingFn = useServerFn(getFollowing);
  const followersQ = useQuery({
    queryKey: ["followers", profile?.id],
    queryFn: () => followersFn({ data: { user_id: profile!.id } }),
    enabled: listMode === "followers" && !!profile?.id,
  });
  const followingQ = useQuery({
    queryKey: ["following", profile?.id],
    queryFn: () => followingFn({ data: { user_id: profile!.id } }),
    enabled: listMode === "following" && !!profile?.id,
  });

  async function saveProfile() {
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ display_name: displayName, bio }).eq("id", profile.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Profile updated"); setEditing(false); setProfile({ ...profile, display_name: displayName, bio }); qc.invalidateQueries({ queryKey: ["public-profile"] }); }
  }

  if (!profile) return <ProfileSkeleton />;
  const s = statsQ.data;
  const favorites = (libQ.data ?? []).filter((r) => r.favorite).slice(0, 6);
  const recentlyAdded = [...(libQ.data ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6);

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover ring-2 ring-border/40" />
        ) : (
          <div className="h-20 w-20 rounded-full bg-gradient-accent grid place-items-center text-white text-2xl font-black ring-2 ring-border/40">
            {(profile.display_name || profile.username).charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 text-center sm:text-left">
          {editing ? (
            <div className="space-y-3 max-w-md">
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name"
                className="w-full rounded-lg border border-input bg-background/40 px-3 py-2 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50" />
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} maxLength={500} placeholder="Bio"
                className="w-full rounded-lg border border-input bg-background/40 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50 resize-none" />
              <div className="flex gap-2">
                <button onClick={saveProfile} disabled={busy}
                  className="rounded-lg bg-gradient-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 flex items-center gap-1.5">
                  <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save"}
                </button>
                <button onClick={() => { setEditing(false); setDisplayName(profile.display_name ?? ""); setBio(profile.bio ?? ""); }}
                  className="rounded-lg border border-border/40 px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl md:text-3xl font-bold">{profile.display_name || profile.username}</h1>
              <p className="text-sm text-muted-foreground/70">@{profile.username}</p>
              {profile.bio && <p className="mt-2 max-w-md text-sm text-muted-foreground/80 leading-relaxed">{profile.bio}</p>}

              {/* Follow counts */}
              <div className="mt-3 flex items-center gap-4 text-sm">
                <button type="button" onClick={() => setListMode("followers")} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  <Users className="h-3.5 w-3.5" />
                  <span className="font-semibold text-foreground">{followCountsQ.data?.followers ?? 0}</span> followers
                </button>
                <span className="text-muted-foreground/30">·</span>
                <button type="button" onClick={() => setListMode("following")} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  <span className="font-semibold text-foreground">{followCountsQ.data?.following ?? 0}</span> following
                </button>
              </div>

              <button onClick={() => setEditing(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                <Edit3 className="h-3.5 w-3.5" /> Edit profile
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {STAT_CARDS.map(({ key, label, Icon, suffix }) => {
          const raw = s?.[key as keyof typeof s];
          const value = typeof raw === "number" ? raw : 0;
          const display = typeof suffix === "function" ? suffix(value) : suffix ? `${value}${suffix}` : value;
          return (
            <div key={key} className="glass rounded-xl p-4 text-center card-hover">
              <Icon className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground/60" />
              <div className="text-xl font-black text-foreground">{display}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{label}</div>
            </div>
          );
        })}
      </div>

      {/* ── Completion ring + Levels ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass-strong rounded-2xl p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70 mb-4">Completion</h3>
          <div className="flex items-center gap-5">
            <div className="relative h-20 w-20 shrink-0">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/20" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="url(#grad)" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${(s?.completionPct ?? 0) * 2.64} 264`} />
                <defs><linearGradient id="grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#8b5cf6" /></linearGradient></defs>
              </svg>
              <div className="absolute inset-0 grid place-items-center">
                <span className="text-lg font-black text-primary">{s?.completionPct ?? 0}%</span>
              </div>
            </div>
            <div className="flex-1 space-y-1.5 min-w-0">
              <BreakdownRow label="Movies" value={s?.completedMovies ?? 0} total={s?.completed ?? 1} color="bg-primary" />
              <BreakdownRow label="TV" value={s?.completedTv ?? 0} total={s?.completed ?? 1} color="bg-accent" />
              <BreakdownRow label="Anime" value={s?.completedAnime ?? 0} total={s?.completed ?? 1} color="bg-success" />
              <BreakdownRow label="Manga" value={s?.completedManga ?? 0} total={s?.completed ?? 1} color="bg-warning" />
            </div>
          </div>
        </div>
        <div className="glass-strong rounded-2xl p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70 mb-4">Levels</h3>
          <div className="space-y-2.5">
            <LevelRow label="Movies" completed={s?.completedMovies ?? 0} icon="🎬" />
            <LevelRow label="TV Shows" completed={s?.completedTv ?? 0} icon="📺" />
            <LevelRow label="Anime" completed={s?.completedAnime ?? 0} icon="🌟" />
            <LevelRow label="Manga" completed={s?.completedManga ?? 0} icon="📖" />
          </div>
        </div>
      </div>

      {/* ── Top Rated ── */}
      {s?.topRatings && s.topRatings.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Star className="h-4 w-4 text-warning" /> Top Rated
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {s.topRatings.map((r) => (
              <Link key={r.media_id} to="/media/$type/$source/$id" params={{ type: r.media_type, source: r.source, id: r.external_id }}
                className="group relative overflow-hidden rounded-xl bg-card/60 border border-border/30 hover:border-border/60 transition-all">
                <div className="aspect-[2/3] bg-muted overflow-hidden">
                  {r.poster_url ? <img src={r.poster_url} alt={r.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : null}
                </div>
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2.5">
                  <div className="flex items-center gap-1 text-warning">
                    <Star className="h-3 w-3 fill-current" />
                    <span className="text-xs font-bold">{r.rating}/10</span>
                  </div>
                  <p className="line-clamp-1 text-xs font-medium text-white">{r.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Favorites ── */}
      {favorites.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Heart className="h-4 w-4 text-accent" /> Favorites
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {favorites.map((r) => {
              const m = r.media as unknown as { id: string; title: string; poster_url: string | null; media_type: string; source: string; external_id: string };
              return (
                <Link key={r.id} to="/media/$type/$source/$id" params={{ type: m.media_type, source: m.source, id: m.external_id }}
                  className="group relative overflow-hidden rounded-xl bg-card/60 border border-border/30 hover:border-border/60 transition-all">
                  <div className="aspect-[2/3] bg-muted overflow-hidden">
                    {m.poster_url ? <img src={m.poster_url} alt={m.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : null}
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <p className="line-clamp-1 text-xs font-medium text-white">{m.title}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Recently Added ── */}
      {recentlyAdded.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Recently Added
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {recentlyAdded.map((r) => {
              const m = r.media as unknown as { id: string; title: string; poster_url: string | null; media_type: string; source: string; external_id: string };
              return (
                <Link key={r.id} to="/media/$type/$source/$id" params={{ type: m.media_type, source: m.source, id: m.external_id }}
                  className="group relative overflow-hidden rounded-xl bg-card/60 border border-border/30 hover:border-border/60 transition-all">
                  <div className="aspect-[2/3] bg-muted overflow-hidden">
                    {m.poster_url ? <img src={m.poster_url} alt={m.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : null}
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <span className={cn("inline-block rounded-full border px-1.5 py-0.5 text-[8px] uppercase tracking-wider font-medium",
                      r.status === "completed" ? "border-success/40 text-success" :
                      r.status === "watching" ? "border-primary/40 text-primary" :
                      "border-muted-foreground/30 text-muted-foreground")}>
                      {getStatusLabel(r.status as WatchStatus)}
                    </span>
                    <p className="mt-0.5 line-clamp-1 text-[11px] font-medium text-white">{m.title}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Followers/Following Dialog ── */}
      <Dialog open={listMode !== null} onOpenChange={(open) => { if (!open) setListMode(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{listMode === "followers" ? "Followers" : "Following"}</DialogTitle></DialogHeader>
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {(listMode === "followers" ? followersQ.data : followingQ.data)?.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No one here yet.</p>
            ) : null}
            {(listMode === "followers" ? followersQ.data : followingQ.data)?.map((user) => (
              <Link key={user.id} to={"/user/" + user.username} onClick={() => setListMode(null)}>
                <div className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted/20 transition-colors">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-gradient-accent grid place-items-center text-white font-bold text-sm">
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

function BreakdownRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-[11px] text-muted-foreground/70">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/20">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-5 text-right text-[11px] font-semibold text-foreground/80">{value}</span>
    </div>
  );
}

function getLevel(completed: number): { title: string; emoji: string; color: string; next: number } {
  if (completed >= 50) return { title: "Diamond", emoji: "👑", color: "text-sky-400", next: -1 };
  if (completed >= 30) return { title: "Platinum", emoji: "💎", color: "text-cyan-400", next: 50 };
  if (completed >= 15) return { title: "Gold", emoji: "🥇", color: "text-yellow-500", next: 30 };
  if (completed >= 5) return { title: "Silver", emoji: "🥈", color: "text-gray-400", next: 15 };
  if (completed >= 1) return { title: "Bronze", emoji: "🥉", color: "text-amber-700", next: 5 };
  return { title: "Beginner", emoji: "🌱", color: "text-muted-foreground", next: 1 };
}

function LevelRow({ label, completed, icon }: { label: string; completed: number; icon: string }) {
  const level = getLevel(completed);
  const progress = level.next > 0 ? Math.round((completed / level.next) * 100) : 100;
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-base shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{label}</span>
          <span className={cn("text-xs font-bold", level.color)}>{level.emoji} {level.title}</span>
        </div>
        <div className="mt-1 h-1 rounded-full bg-muted/20 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground/60">
          {level.next > 0 ? `${completed} / ${level.next}` : `Max level!`}
        </p>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-full bg-muted/40" />
        <div className="flex-1 space-y-2">
          <div className="h-7 w-48 rounded bg-muted/30" />
          <div className="h-4 w-32 rounded bg-muted/20" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="glass rounded-xl p-4 h-24" />
        ))}
      </div>
    </div>
  );
}
