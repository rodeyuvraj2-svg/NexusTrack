import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { exportLibrary, importLibrary } from "@/lib/import-export.functions";
import { toast } from "sonner";
import { Download, Upload, Trash2, Shield, User as UserIcon, Globe } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — NexusTrack" }, { name: "description", content: "Manage your account, privacy, and data." }] }),
  component: Settings,
});

function Settings() {
  const qc = useQueryClient();
  const exportFn = useServerFn(exportLibrary);
  const importFn = useServerFn(importLibrary);

  const [profile, setProfile] = useState<{ id: string; username: string; display_name: string | null; bio: string | null; avatar_url: string | null; is_public: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (data) setProfile(data);
    })();
  }, []);

  async function saveProfile() {
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({
      display_name: profile.display_name,
      bio: profile.bio,
      is_public: profile.is_public,
    }).eq("id", profile.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["public-profile"] }); }
  }

  async function handleExport(format: "json" | "csv") {
    const data = await exportFn();
    let content: string;
    let mime: string;
    if (format === "json") {
      content = JSON.stringify(data, null, 2);
      mime = "application/json";
    } else {
      const headers = "title,media_type,source,external_id,status,rating,favorite,hidden,notes,created_at,updated_at";
      const rows = data.map((r) =>
        [r.title, r.media_type, r.source, r.external_id, r.status, r.rating ?? "", r.favorite, r.hidden, (r.notes ?? "").replace(/,/g, ";"), r.created_at, r.updated_at].join(",")
      );
      content = [headers, ...rows].join("\n");
      mime = "text/csv";
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexustrack-library.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.length} items as ${format.toUpperCase()}`);
  }

  const mImport = useMutation({
    mutationFn: (items: unknown[]) => importFn({ data: { items: items as never } }),
    onSuccess: (res) => {
      toast.success(`Imported ${res.imported} items (${res.skipped} skipped)`);
      qc.invalidateQueries({ queryKey: ["library"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e) => toast.error(e.message),
  });

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as unknown[];
      mImport.mutate(data);
    } catch {
      toast.error("Invalid JSON file");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function deleteAccount() {
    if (!confirm("This will permanently delete your account and all data. This cannot be undone. Are you sure?")) return;
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase.rpc("delete_user");
    setBusy(false);
    if (error) {
      // Fallback: sign out and redirect
      await supabase.auth.signOut();
      toast.error("Please contact support to delete your account");
    } else {
      toast.success("Account deleted");
      window.location.href = "/";
    }
  }

  if (!profile) return <p>Loading…</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-8 text-3xl md:text-4xl font-bold">Settings</h1>

      {/* Profile section */}
      <section className="glass-strong mb-6 rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Profile</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Username</label>
            <input value={profile.username} disabled
              className="mt-1 w-full rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground" />
          </div>
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
          <button onClick={saveProfile} disabled={busy}
            className="rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </section>

      {/* Privacy section */}
      <section className="glass-strong mb-6 rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Privacy</h2>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={profile.is_public} onChange={(e) => setProfile({ ...profile, is_public: e.target.checked })}
            className="h-5 w-5 rounded" />
          <div>
            <div className="font-medium flex items-center gap-1.5"><Globe className="h-4 w-4" /> Public profile</div>
            <div className="text-xs text-muted-foreground">Anyone can view your library (except hidden titles)</div>
          </div>
        </label>
        <button onClick={saveProfile} disabled={busy}
          className="mt-4 rounded-lg glass px-5 py-2 text-sm font-medium hover:bg-muted/40 disabled:opacity-60">
          Apply privacy settings
        </button>
      </section>

      {/* Data section */}
      <section className="glass-strong mb-6 rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <Download className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Your data</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">Export your library to back it up or move it elsewhere. Import from a previously exported JSON file.</p>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => handleExport("json")} className="flex items-center gap-2 rounded-lg glass px-4 py-2 text-sm font-medium hover:bg-muted/40">
            <Download className="h-4 w-4" /> Export JSON
          </button>
          <button onClick={() => handleExport("csv")} className="flex items-center gap-2 rounded-lg glass px-4 py-2 text-sm font-medium hover:bg-muted/40">
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={mImport.isPending}
            className="flex items-center gap-2 rounded-lg glass px-4 py-2 text-sm font-medium hover:bg-muted/40 disabled:opacity-60">
            <Upload className="h-4 w-4" /> {mImport.isPending ? "Importing…" : "Import JSON"}
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleImportFile} className="hidden" />
        </div>
      </section>

      {/* Danger zone */}
      <section className="glass-strong rounded-2xl border border-destructive/30 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-destructive" />
          <h2 className="text-lg font-bold text-destructive">Danger zone</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">Permanently delete your account and all associated data. This action cannot be undone.</p>
        <button onClick={deleteAccount} disabled={busy}
          className="rounded-lg bg-destructive px-5 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60">
          Delete my account
        </button>
      </section>
    </div>
  );
}
