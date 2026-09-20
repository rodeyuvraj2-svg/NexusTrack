import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { GuestProvider } from "@/lib/guest";
import { GuestRestrictionModal } from "@/components/GuestRestrictionModal";
import { supabase } from "@/integrations/supabase/client";
import {
  THEME_BOOT_SCRIPT,
  applyTheme,
  getAppliedTheme,
  isThemeId,
  isLightTheme,
  useAppliedTheme,
} from "@/lib/theme";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error("Root error boundary caught:", error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "NexusTrack — One list, every screen" },
      {
        name: "description",
        content:
          "Track movies, TV, and anime together. Season-level progress, unified search, friends' libraries. Free forever.",
      },
      { name: "author", content: "NexusTrack" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://image.tmdb.org" },
      { rel: "preconnect", href: "https://s4.anilist.co" },
      { rel: "preconnect", href: "https://cdn.myanimelist.net" },
      { rel: "preconnect", href: "https://media.kitsu.app" },
      { rel: "icon", href: "/favicon.svg?v=2", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Apply the cached theme before first paint — a saved non-default
            theme must never flash the default one first. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Syncs the signed-in user's saved theme (profiles.theme — the source of
 * truth) onto <html> right after mount. The boot script already applied the
 * cached value from localStorage, so this normally confirms the same theme;
 * if it was changed on another device, it corrects immediately. Guests and
 * signed-out visitors keep their localStorage preference.
 */
function ThemeSync() {
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId || cancelled) return;
      supabase
        .from("profiles")
        .select("theme")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data: row }) => {
          if (cancelled) return;
          const saved = row?.theme;
          if (isThemeId(saved) && saved !== getAppliedTheme()) applyTheme(saved);
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const theme = useAppliedTheme();

  return (
    <QueryClientProvider client={queryClient}>
      <GuestProvider>
        <ThemeSync />
        <Outlet />
        <GuestRestrictionModal />
      </GuestProvider>
      <Toaster theme={isLightTheme(theme) ? "light" : "dark"} position="top-right" richColors />
    </QueryClientProvider>
  );
}
