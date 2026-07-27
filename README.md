# NexusTrack

NexusTrack is a polished entertainment tracking experience built for people who watch movies, TV, and anime across multiple platforms. It unifies discovery, library tracking, friend activity, and data portability in a modern web app.

## Overview

NexusTrack provides a complete user journey from discovery to playback tracking:

- Unified movie, TV, and anime tracking
- Season-aware progress and watch status
- Watchlist, watching, completed, favorite, and rating workflows
- Multi-source search across TMDB and anime providers
- Trending, popular, top-rated, upcoming, and seasonal discovery feeds
- Supabase-authenticated accounts with guest mode support
- Friends, requests, public profiles, and activity sharing
- Notifications and unread counts with real-time updates
- Library export/import in JSON or CSV
- Safe image loading and graceful poster fallbacks
- Responsive desktop and mobile-first UI

## Key Features

### Authentication & user state
- Email/password auth via Supabase
- Guest mode for quick preview and onboarding
- Guest restrictions with modal prompts for protected actions
- Persistent guest state via local storage

### Core app sections
- `/` — public landing page with feature preview and poster showcase
- `/auth` — sign-in, signup, password recovery, and guest entry
- `/dashboard` — personalized homepage with stats, continue watching, trending, popular, and seasonal cards
- `/discover` — discovery hub with tabs for movies, TV, anime, genre filters, and infinite scrolling
- `/search` — combined movie/TV/anime search experience with debounced queries
- `/library` — library management with status and type filters
- `/friends` — friend discovery, requests, outgoing invites, and friend library summaries
- `/notifications` — activity feed with read/unread status and real-time Supabase updates
- `/settings` — profile settings, data export/import, and account deletion
- `/user/:username` — public friend profile and follow/copy actions
- `/media/:type/:source/:id` — media detail pages with reviews, friends, and library controls

### Media & discovery
- TMDB integration for movies and TV metadata
- Anilist and Jikan support for anime discovery
- Poster caching and fallback artwork for unavailable covers
- Media cards with status badges and action buttons
- Search results show movies, TV, and anime in one view

### Library & interaction
- Add media to watchlist, watching, completed, favorites
- Mark status changes with optimistic UI updates
- Track progress at the season level for TV and anime
- Copy titles from friends' libraries
- Import/export library data for backup and migration
- Account deletion and profile persistence

## Technical stack

- React 19
- TypeScript
- Tailwind CSS
- TanStack Start (server/client rendering)
- TanStack React Router
- TanStack React Query
- Supabase (auth, database, realtime)
- Lucide icons
- Sonner toast notifications
- Nitro / Vercel-compatible production build

## Project structure

- `src/routes` — page routes and route components
- `src/components` — reusable UI components and controls
- `src/lib` — data access, API integration, auth, and utilities
- `src/integrations` — Supabase client and auth middleware
- `src/hooks` — shared hooks like device detection and guest state
- `supabase/migrations` — database schema and RLS migration scripts

## Getting started

1. Clone the repository:

```bash
git clone https://github.com/rodeyuvraj2-svg/NexusTrack.git
cd NexusTrack/NexusTrack
```

2. Install dependencies:

```bash
bun install
```

3. Create a `.env` file in the project root with the required keys:

```env
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<your-public-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-public-key>
TMDB_API_KEY=<your-tmdb-api-key>
TMDB_READ_TOKEN=<your-tmdb-read-token>
```

4. Start the development server:

```bash
bun run dev
```

Open the local URL shown in the terminal.

## Build & deploy

- `bun run dev` — run locally
- `bun run build` — build production assets
- `bun run preview` — preview the production build
- `bun run lint` — lint the codebase
- `bun run format` — format source files

## Notes

- The app is optimized for both desktop and mobile screens.
- Supabase is used for auth, real-time notifications, library persistence, and friend connections.
- The public landing page uses sample poster previews and hero content to show the product flow.
- Media discovery gracefully falls back to placeholder data when external APIs are unavailable.

## Contributing

- Follow existing component patterns in `src/components`.
- Keep UI updates consistent with the existing Tailwind/TanStack design.
- Use `useServerFn` for server-only actions and `useQuery` / `useMutation` for client-side state.
- Keep secrets out of Git and use `.env` for local configuration.
