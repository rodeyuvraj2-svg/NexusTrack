import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getPublicProfile, copyFromFriend } from "@/lib/friends.functions";
import { STATUS_LABELS, STATUS_COLORS, type WatchStatus } from "@/lib/media-types";
import { Star, Copy, Check, Film, Heart, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/user/$username")({
  head: () => ({ meta: [{ title: "Profile — NexusTrack" }, { name: "description", content: "View a friend's library and copy titles to your own." }] }),
  component: FriendProfile,
});

function FriendProfile() {
  const { username } = useParams({ from: "/_authenticated/user/$username" });
  const qc = useQueryClient();
  const profileFn = useServerFn(getPublicProfile);
  const copyFn = useServerFn(copyFromFriend);

  const q = useQuery({ queryKey: ["public-profile", username], queryFn: () => profileFn({ data: { username } }) });

  const [copied, setCopied] = useState<Set<string>>(new Set());
  const [copyStatus, setCopyStatus] = useState(true);
  const [copyFav, setCopyFav] = useState(false);

  const mCopy = useMutation({
    mutationFn: (vars: { media_id: string; source_user_id: string }) =>
      copyFn({ data: { media_id: vars.media_id, copy_status: copyStatus, copy_favorite: copyFav, source_user_id: vars.source_user_id } }),
    onSuccess: (res, vars) => {
      if (res.duplicate) toast.info("Already in your library");
      else { toast.success("Copied to your library"); setCopied((p) => new Set(p).add(vars.media_id)); }
      qc.invalidateQueries({ queryKey: ["library"] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!q.data) return (
    <div className="glass rounded-2xl p-12 text-center">
      <p className="text-muted-foreground">This profile is private or doesn't exist.</p>
      <Link to="/friends" className="mt-4 inline-block rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white">Back to friends</Link>
    </div>
  );

  const { profile, library } = q.data;
  const watching = library.filter((l) => l.status === "watching" || l.status === "rewatching");
  const completed = library.filter((l) => l.status === "completed");
  const favorites = library.filter((l) => l.favorite);

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <div className="h-24 w-24 rounded-full bg-gradient-accent grid place-items-center text-white text-3xl font-black">
            {(profile.display_name || profile.username).charAt(0).toUpperCase()}
          </div>
        )}
        <div className="text-center sm:text-left">
          <h1 className="text-3xl md:text-4xl font-bold">{profile.display_name || profile.username}</h1>
          <p className="text-muted-foreground">@{profile.username}</p>
          {profile.bio ? <p className="mt-2 max-w-md text-sm text-muted-foreground">{profile.bio}</p> : null}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-3">
        {[
          { label: "In library", value: library.length, Icon: Film },
          { label: "Completed", value: completed.length, Icon: Check },
          { label: "Favorites", value: favorites.length, Icon: Heart },
        ].map((s) => (
          <div key={s.label} className="glass rounded-xl p-4 text-center">
            <s.Icon className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
            <div className="text-2xl font-bold text-gradient">{s.value}</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Copy options */}
      <div className="glass-strong mb-8 flex flex-wrap items-center gap-4 rounded-2xl p-4">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Copy options:</span>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={copyStatus} onChange={(e) => setCopyStatus(e.target.checked)} className="h-4 w-4 rounded" />
          Copy watch status
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={copyFav} onChange={(e) => setCopyFav(e.target.checked)} className="h-4 w-4 rounded" />
          Copy favorite flag
        </label>
      </div>

      {/* Library sections */}
      {watching.length > 0 ? (
        <FriendSection title="Currently watching" items={watching} profileId={profile.id} mCopy={mCopy} copied={copied} />
      ) : null}
      {completed.length > 0 ? (
        <FriendSection title="Completed" items={completed} profileId={profile.id} mCopy={mCopy} copied={copied} />
      ) : null}
      {favorites.length > 0 ? (
        <FriendSection title="Favorites" items={favorites} profileId={profile.id} mCopy={mCopy} copied={copied} />
      ) : null}
      {library.length === 0 ? <p className="text-muted-foreground">This user hasn't added anything yet.</p> : null}
    </div>
  );
}

function FriendSection({ title, items, profileId, mCopy, copied }: {
  title: string;
  items: Array<{ id: string; status: WatchStatus; rating: number | null; favorite: boolean; media: { id: string; media_type: string; title: string; poster_url: string | null; release_year: number | null } }>;
  profileId: string;
  mCopy: ReturnType<typeof useMutation>;
  copied: Set<string>;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((item) => {
          const m = item.media as unknown as { id: string; media_type: string; title: string; poster_url: string | null; release_year: number | null };
          if (!m) return null;
          const isCopied = copied.has(m.id);
          return (
            <div key={item.id} className="group relative overflow-hidden rounded-xl glass">
              <Link to="/media/$type/$source/$id" params={{ type: m.media_type, source: "tmdb", id: m.id }} className="block">
                <div className="aspect-[2/3] bg-muted overflow-hidden">
                  {m.poster_url ? <img src={m.poster_url} alt={m.title} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" /> : null}
                </div>
                <div className="p-2.5">
                  <span className={cn("inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider", STATUS_COLORS[item.status])}>
                    {STATUS_LABELS[item.status]}
                  </span>
                  <h3 className="mt-1 line-clamp-2 text-xs font-semibold">{m.title}</h3>
                </div>
              </Link>
              <button
                onClick={() => mCopy.mutate({ media_id: m.id, source_user_id: profileId })}
                disabled={mCopy.isPending || isCopied}
                className={cn(
                  "absolute right-2 top-2 rounded-lg p-2 text-white shadow-lg transition-all",
                  isCopied ? "bg-success" : "bg-gradient-accent hover:scale-110",
                )}
                title={isCopied ? "Copied!" : "Copy to my library"}
              >
                {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
