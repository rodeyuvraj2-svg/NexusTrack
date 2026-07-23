import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getStats } from "@/lib/library.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — NexusTrack" }, { name: "description", content: "Your NexusTrack profile and stats." }] }),
  component: Profile,
});

function Profile() {
  const statsFn = useServerFn(getStats);
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => statsFn() });
  const [profile, setProfile] = useState<{ id: string; username: string; display_name: string | null; bio: string | null; avatar_url: string | null; is_public: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (data) setProfile(data);
    })();
  }, []);

  async function save() {
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({
      display_name: profile.display_name,
      bio: profile.bio,
      is_public: profile.is_public,
    }).eq("id", profile.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  }

  if (!profile) return <p>Loading…</p>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="h-20 w-20 rounded-full bg-gradient-accent grid place-items-center text-white text-2xl font-black">
            {(profile.display_name || profile.username).charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold">{profile.display_name || profile.username}</h1>
          <p className="text-muted-foreground">@{profile.username}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { l: "Total", v: stats.data?.total ?? "—" },
          { l: "Completed", v: stats.data?.completed ?? "—" },
          { l: "Movies", v: stats.data?.movies ?? "—" },
          { l: "Anime", v: stats.data?.anime ?? "—" },
        ].map((s) => (
          <div key={s.l} className="glass rounded-xl p-4">
            <div className="text-xs uppercase text-muted-foreground tracking-wider">{s.l}</div>
            <div className="mt-1 text-2xl font-bold text-gradient">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="glass-strong rounded-2xl p-6 space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Display name</label>
          <input value={profile.display_name ?? ""} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
            className="mt-1 w-full rounded-lg border border-input bg-background/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Bio</label>
          <textarea value={profile.bio ?? ""} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} rows={3} maxLength={500}
            className="mt-1 w-full rounded-lg border border-input bg-background/40 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={profile.is_public} onChange={(e) => setProfile({ ...profile, is_public: e.target.checked })} className="h-4 w-4 rounded" />
          Public profile — anyone can view my library (unless items are hidden)
        </label>
        <button onClick={save} disabled={busy} className="rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
