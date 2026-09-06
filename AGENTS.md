# NexusTrack — Agent & Contributor Guide

A media tracking app (movies / TV / anime / manga) built with **TanStack Start**,
React 19, Supabase (Postgres + RLS + Realtime), TanStack Query, and Tailwind v4.
Package manager is **Bun**.

## Commands

```sh
bun install            # install (bun.lock is the single lockfile)
bun run dev            # dev server
bun run build          # production build
bun run lint           # eslint
bun run format         # prettier --write .
bun test               # unit tests (bun's built-in runner, no extra deps)
bunx tsc --noEmit      # typecheck — run before every commit
supabase db push       # apply supabase/migrations to the linked project
```

## Architecture

- **`src/routes/`** — TanStack Router file routes. Everything under
  `_authenticated/` is client-rendered (`ssr: false`) behind a Supabase
  session check in `route.tsx`.
- **`src/lib/*.functions.ts`** — TanStack Start **server functions**. These
  files ship to the client bundle as stubs; anything server-only (env vars,
  service-role keys) must live in a separate module and be **dynamically
  imported inside the handler body**:
  ```ts
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  ```
- **`src/integrations/supabase/client.server.ts`** — service-role client
  (bypasses RLS). Never import it statically from `*.functions.ts` or routes.
- **`src/lib/media-provision.ts`** — the only trusted writer of the global
  `media`/`seasons` cache tables. It fetches metadata from TMDB/AniList;
  client-supplied metadata must never be written to these tables.
- **`supabase/migrations/`** — schema + triggers. Season→series rollups and
  friend-request notifications are enforced by DB triggers, not app code.
  `get_profile_stats` is a SQL RPC used by the stats page.

## Conventions

- **Validation:** every server function validates input with zod. Use the
  shared enums (`StatusEnum`, `z.enum(["movie","tv","anime","manga"])`, uuid
  helpers) instead of free strings.
- **Data fetching (client):** TanStack Query with the singleton client from
  `src/router.tsx` (5-min staleTime, no refetch on focus). Shared cache keys:
  `["library","all"]`, `["stats"]`, `["follow-state", userId]`,
  `["notifications"]`, `["unread-count"]`, `["public-profile", username]`.
  Mutations should patch these caches optimistically and roll back on error
  (see the follow/unfollow mutation in `user.$username.tsx` for the pattern).
- **Supabase query typing:** results that go through `.or()` or embedded
  joins lose their inferred types — cast with an explicit row interface at
  the fetch site rather than scattering `any`.
- **`follows` FKs reference `auth.users`, not `profiles`** — you cannot do a
  single embedded join from follows to profiles; fetch ids, then profiles.
- **External APIs:** all TMDB/AniList reads go through `cached()` in
  `src/lib/api-cache.ts` (in-memory TTL cache, shared key format
  `tmdb:${path}?${JSON.stringify(params)}`). TMDB has a circuit breaker —
  don't bypass `tmdb()`.
- **Fallback demo rows** (`is_fallback: true` in `MediaSummary`) are shown
  when TMDB is down and must never be saveable to a library.
- **Line endings:** prettier is configured with `endOfLine: "auto"` (Windows
  CRLF working trees are expected). Don't "fix" the `.prettierrc`.

## Gotchas

- `head: true` Supabase queries return no rows — request
  `{ count: "exact", head: true }` or the count is undefined.
- `applyLibraryUpsert` preserves unspecified fields using `!== undefined`
  checks (not `??`) so an explicit `null` can clear a field.
- All user-owned tables cascade from `auth.users` — deleting an auth user
  cleans everything.
- The auth middleware caches token validation for 30s; revoked sessions can
  take up to that long to be rejected.
