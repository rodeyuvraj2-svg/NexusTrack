import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { exportLibrary, importLibrary } from "@/lib/import-export.functions";
import { deleteAccount, getProfile } from "@/lib/auth.functions";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { FilterTabs } from "@/components/FilterTabs";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { useGuest } from "@/lib/guest";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Download,
  Upload,
  Trash2,
  User as UserIcon,
  Settings as SettingsIcon,
  Shield,
  Database,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — NexusTrack" },
      { name: "description", content: "Manage your account, privacy, and data." },
    ],
  }),
  errorComponent: RouteErrorBoundary,
  component: Settings,
});

type SectionKey = "profile" | "privacy" | "data" | "account";
const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "profile", label: "Profile" },
  { key: "privacy", label: "Privacy" },
  { key: "data", label: "Data" },
  { key: "account", label: "Account" },
];

function Settings() {
  const { isGuest } = useGuest();
  const qc = useQueryClient();

  const exportFn = useServerFn(exportLibrary);
  const importFn = useServerFn(importLibrary);
  const deleteFn = useServerFn(deleteAccount);

  const [section, setSection] = useState<SectionKey>("profile");
  const [profile, setProfile] = useState<{
    id: string;
    username: string;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    is_public: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const profileFn = useServerFn(getProfile);
  const profileQ = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileFn(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (profileQ.data) setProfile(profileQ.data);
  }, [profileQ.data]);

  async function saveProfile() {
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: profile.display_name,
        bio: profile.bio,
      })
      .eq("id", profile.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["public-profile"] });
    }
  }

  async function setPrivacy(isPublic: boolean) {
    if (!profile || privacyBusy) return;
    setPrivacyBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ is_public: isPublic })
      .eq("id", profile.id);
    setPrivacyBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      setProfile({ ...profile, is_public: isPublic });
      toast.success(isPublic ? "Your profile is now public" : "Your profile is now private");
      qc.invalidateQueries({ queryKey: ["public-profile"] });
    }
  }

  async function handleExport(format: "json" | "csv") {
    const data = (await exportFn()) as Array<{
      title: string;
      media_type: string;
      source: string;
      external_id: string;
      status: string;
      rating: number | null;
      favorite: boolean;
      hidden: boolean;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>;
    let content: string;
    let mime: string;
    if (format === "json") {
      content = JSON.stringify(data, null, 2);
      mime = "application/json";
    } else {
      const headers =
        "title,media_type,source,external_id,status,rating,favorite,hidden,notes,created_at,updated_at";
      const rows = data.map((r) =>
        [
          r.title,
          r.media_type,
          r.source,
          r.external_id,
          r.status,
          r.rating ?? "",
          r.favorite,
          r.hidden,
          (r.notes ?? "").replace(/,/g, ";"),
          r.created_at,
          r.updated_at,
        ].join(","),
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

  if (isGuest) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Settings" className="mb-8" />
        <EmptyState
          icon={SettingsIcon}
          title="Sign in to manage settings"
          description="Customize your profile, manage your data, and control your privacy."
          variant="panel"
          action={
            <Link
              to="/auth"
              className="inline-block rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white"
            >
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

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

  async function handleDeleteAccount() {
    if (
      !confirm(
        "This will permanently delete your account and all data. This cannot be undone. Are you sure?",
      )
    )
      return;
    if (!profile) return;
    setBusy(true);
    try {
      await deleteFn();
      toast.success("Account deleted");
      window.location.href = "/";
    } catch (error) {
      await supabase.auth.signOut();
      toast.error(
        error instanceof Error ? error.message : "Please contact support to delete your account",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!profile) return <SettingsSkeleton />;

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" className="mb-8" />

      <div className="flex flex-col gap-8 md:flex-row">
        {/* Section nav — sticky sidebar on desktop, horizontal pills on mobile */}
        <nav aria-label="Settings sections" className="md:w-48 md:shrink-0">
          <div className="md:sticky md:top-8">
            {/* Desktop list */}
            <ul className="hidden gap-0.5 md:flex md:flex-col">
              {SECTIONS.map((s) => (
                <li key={s.key}>
                  <button
                    onClick={() => setSection(s.key)}
                    aria-current={section === s.key ? "true" : undefined}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      section === s.key
                        ? "bg-primary/10 font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
            {/* Mobile pills */}
            <FilterTabs
              className="md:hidden"
              size="sm"
              options={SECTIONS.map((s) => ({ value: s.key, label: s.label }))}
              value={section}
              onChange={setSection}
            />
          </div>
        </nav>

        {/* Main panel */}
        <div className="min-w-0 flex-1">
          {section === "profile" && (
            <section className="glass-strong rounded-2xl p-6">
              <div className="mb-4 flex items-center gap-2">
                <UserIcon className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">Profile</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="settings-username"
                    className="text-xs uppercase tracking-wider text-muted-foreground"
                  >
                    Username
                  </label>
                  <input
                    id="settings-username"
                    value={profile.username}
                    disabled
                    className="mt-1 w-full rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
                  />
                </div>
                <div>
                  <label
                    htmlFor="settings-display-name"
                    className="text-xs uppercase tracking-wider text-muted-foreground"
                  >
                    Display name
                  </label>
                  <input
                    id="settings-display-name"
                    value={profile.display_name ?? ""}
                    onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-input bg-background/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label
                    htmlFor="settings-bio"
                    className="text-xs uppercase tracking-wider text-muted-foreground"
                  >
                    Bio
                  </label>
                  <textarea
                    id="settings-bio"
                    value={profile.bio ?? ""}
                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                    rows={3}
                    maxLength={500}
                    className="mt-1 w-full rounded-lg border border-input bg-background/40 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <button
                  onClick={saveProfile}
                  disabled={busy}
                  className="rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </section>
          )}

          {section === "privacy" && (
            <section className="glass-strong rounded-2xl p-6">
              <div className="mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">Privacy</h2>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Public profile</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Public profiles can be viewed by anyone with your username. Private profiles are
                    only visible to you and your friends.
                  </p>
                </div>
                <button
                  onClick={() => setPrivacy(!profile.is_public)}
                  disabled={privacyBusy}
                  role="switch"
                  aria-checked={profile.is_public}
                  aria-label="Public profile"
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60",
                    profile.is_public ? "bg-primary" : "bg-muted-foreground/30",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                      profile.is_public ? "left-[22px]" : "left-0.5",
                    )}
                  />
                </button>
              </div>
            </section>
          )}

          {section === "data" && (
            <section className="glass-strong rounded-2xl p-6">
              <div className="mb-4 flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">Your data</h2>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                Export your library as backup. Import a previously exported JSON file to restore it.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleExport("json")}
                  className="flex items-center gap-2 rounded-lg glass px-4 py-2 text-sm font-medium hover:bg-muted/40"
                >
                  <Download className="h-4 w-4" /> Export JSON
                </button>
                <button
                  onClick={() => handleExport("csv")}
                  className="flex items-center gap-2 rounded-lg glass px-4 py-2 text-sm font-medium hover:bg-muted/40"
                >
                  <Download className="h-4 w-4" /> Export CSV
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={mImport.isPending}
                  className="flex items-center gap-2 rounded-lg bg-gradient-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />{" "}
                  {mImport.isPending ? "Importing…" : "Upload & Import"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,.csv"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </div>
              {mImport.isPending ? (
                <p className="mt-3 text-xs text-muted-foreground">Importing items…</p>
              ) : null}
            </section>
          )}

          {section === "account" && (
            <section className="glass-strong rounded-2xl border border-destructive/30 p-6">
              <div className="mb-4 flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                <h2 className="text-lg font-bold text-destructive">Danger zone</h2>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                Permanently delete your account and all associated data. This action cannot be
                undone.
              </p>
              <button
                onClick={handleDeleteAccount}
                disabled={busy}
                className="rounded-lg bg-destructive px-5 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
              >
                Delete my account
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="max-w-4xl animate-pulse space-y-8">
      <div className="h-9 w-48 rounded bg-muted" />
      <div className="flex flex-col gap-8 md:flex-row">
        <div className="hidden md:block md:w-48 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 rounded bg-muted/30" />
          ))}
        </div>
        <div className="glass-strong min-w-0 flex-1 rounded-2xl p-6 space-y-4">
          <div className="h-6 w-32 rounded bg-muted" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-20 rounded bg-muted/30" />
                <div className="h-10 w-full rounded bg-muted/20" />
              </div>
            ))}
          </div>
          <div className="h-10 w-32 rounded bg-muted/30" />
        </div>
      </div>
    </div>
  );
}
