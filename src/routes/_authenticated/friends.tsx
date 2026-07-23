import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listFriends, searchUsers, sendFriendRequest, respondFriendRequest, removeFriend } from "@/lib/friends.functions";
import { UserPlus, UserMinus, Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/friends")({
  head: () => ({ meta: [{ title: "Friends — NexusTrack" }, { name: "description", content: "Connect with friends and see what they're watching." }] }),
  component: Friends,
});

function Friends() {
  const qc = useQueryClient();
  const listFn = useServerFn(listFriends);
  const searchFn = useServerFn(searchUsers);
  const sendFn = useServerFn(sendFriendRequest);
  const respFn = useServerFn(respondFriendRequest);
  const rmFn = useServerFn(removeFriend);

  const [q, setQ] = useState("");
  const friends = useQuery({ queryKey: ["friends"], queryFn: () => listFn() });
  const search = useQuery({ queryKey: ["user-search", q], queryFn: () => searchFn({ data: { q } }), enabled: q.length > 1 });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["friends"] }); qc.invalidateQueries({ queryKey: ["user-search"] }); };

  const mSend = useMutation({ mutationFn: (id: string) => sendFn({ data: { user_id: id } }), onSuccess: () => { invalidate(); toast.success("Request sent"); } });
  const mResp = useMutation({ mutationFn: (v: { id: string; accept: boolean }) => respFn({ data: v }), onSuccess: invalidate });
  const mRm = useMutation({ mutationFn: (id: string) => rmFn({ data: { id } }), onSuccess: invalidate });

  return (
    <div>
      <h1 className="text-3xl md:text-4xl font-bold mb-6">Friends</h1>

      <div className="glass-strong rounded-2xl p-4 mb-8">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Find people</label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="username…"
          className="mt-1 w-full rounded-lg border border-input bg-background/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        {q.length > 1 && search.data ? (
          <ul className="mt-3 space-y-2">
            {search.data.length === 0 ? <p className="text-sm text-muted-foreground">No matches.</p> : null}
            {search.data.map((u) => (
              <li key={u.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-2.5">
                <Avatar url={u.avatar_url} name={u.display_name || u.username} />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{u.display_name || u.username}</div>
                  <div className="text-xs text-muted-foreground">@{u.username}</div>
                </div>
                <button onClick={() => mSend.mutate(u.id)} className="rounded-lg bg-gradient-accent px-3 py-1.5 text-xs font-semibold text-white">
                  <UserPlus className="inline h-3 w-3 mr-1" /> Add
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {friends.data?.incoming?.length ? (
        <Section title="Incoming requests">
          {friends.data.incoming.map((r) => {
            const p = r.profile as unknown as { username: string; display_name: string; avatar_url: string | null } | undefined;
            return (
              <div key={r.id} className="glass rounded-xl p-3 flex items-center gap-3">
                <Avatar url={p?.avatar_url ?? null} name={p?.display_name || p?.username || "?"} />
                <div className="flex-1"><div className="font-semibold text-sm">{p?.display_name || p?.username}</div></div>
                <button onClick={() => mResp.mutate({ id: r.id, accept: true })} className="rounded-lg bg-success/20 text-success p-2"><Check className="h-4 w-4" /></button>
                <button onClick={() => mResp.mutate({ id: r.id, accept: false })} className="rounded-lg bg-destructive/20 text-destructive p-2"><X className="h-4 w-4" /></button>
              </div>
            );
          })}
        </Section>
      ) : null}

      <Section title="Your friends">
        {(friends.data?.accepted ?? []).length === 0 ? <p className="text-muted-foreground">No friends yet — search above.</p> : null}
        {friends.data?.accepted.map((r) => {
          const p = r.profile as unknown as { username: string; display_name: string; avatar_url: string | null } | undefined;
          return (
            <div key={r.id} className="glass rounded-xl p-3 flex items-center gap-3 mb-2">
              <Avatar url={p?.avatar_url ?? null} name={p?.display_name || p?.username || "?"} />
              <div className="flex-1"><div className="font-semibold text-sm">{p?.display_name || p?.username}</div><div className="text-xs text-muted-foreground">@{p?.username}</div></div>
              <button onClick={() => mRm.mutate(r.id)} className="rounded-lg text-destructive hover:bg-destructive/10 p-2"><UserMinus className="h-4 w-4" /></button>
            </div>
          );
        })}
      </Section>

      {friends.data?.outgoing?.length ? (
        <Section title="Sent">
          {friends.data.outgoing.map((r) => {
            const p = r.profile as unknown as { username: string; display_name: string } | undefined;
            return <div key={r.id} className="glass rounded-xl p-3 text-sm text-muted-foreground">Pending: {p?.display_name || p?.username}</div>;
          })}
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mb-8"><h2 className="text-lg font-bold mb-3">{title}</h2><div className="space-y-2">{children}</div></section>;
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) return <img src={url} alt={name} className="h-10 w-10 rounded-full object-cover" />;
  return <div className="h-10 w-10 rounded-full bg-gradient-accent grid place-items-center text-white font-bold text-sm">{name.charAt(0).toUpperCase()}</div>;
}
