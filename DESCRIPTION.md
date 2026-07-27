# NexusTrack Description

NexusTrack is a professional entertainment tracking application that unifies movies, TV, and anime into one cohesive library. It is designed to help users discover new titles, track ongoing shows, maintain watch history, and share what they are watching with friends.

## What NexusTrack does

- Tracks movies, TV shows, and anime in a single unified library
- Supports watchlist, watching, completed, and favorite statuses
- Enables season-level tracking for TV and anime
- Provides multi-source search across TMDB and anime data providers
- Delivers trending, popular, top-rated, and seasonal discovery feeds
- Maintains authenticated user libraries through Supabase
- Supports guest mode for browsing without signing in
- Offers friend connections, requests, and public profile browsing
- Includes notifications with unread count and real-time updates
- Allows export/import of library data as JSON or CSV
- Handles poster rendering and fallback image states gracefully

## Core sections

- `/` — Landing page with feature highlights, mock poster grid, and CTA
- `/auth` — Authentication, password reset, guest mode, and OAuth handling
- `/dashboard` — Personalized dashboard with stats, activity, and recommendations
- `/discover` — Discovery hub for movies, TV, and anime with filters and infinite scroll
- `/search` — Unified search result page for movies, TV, and anime
- `/library` — Filterable user library with status controls
- `/friends` — Friend management, search, requests, and shared library summaries
- `/notifications` — Notification center with real-time Supabase updates
- `/settings` — Profile management, data export/import, and account deletion
- `/user/:username` — Public friend profile pages with copy actions
- `/media/:type/:source/:id` — Detailed media pages with reviews and library actions

## Technical highlights

- Built with React 19, TypeScript, and Tailwind CSS
- Uses TanStack Start, React Router, React Query, and Nitro
- Integrates Supabase for auth, database, and realtime features
- TMDB, Anilist, and Jikan API support for metadata and discovery
- Guest mode with local state persistence and user action gating
- Safe image handling using a custom `SafeImage` component
- Optimistic UI updates for library actions and status changes
- Responsive UI with polished cards, badges, and action panels
- Production-ready build config for Vercel or similar Node/Vite hosting

## Why it feels professional

- Organized route-based architecture with clear page separation
- Consistent design system across cards, modals, and notifications
- Data-driven discovery and search flows with debounce and caching
- Realtime updates for notifications and friend activity
- Library export/import and account cleanup tools for power users
- Strong emphasis on UX, progressive enhancement, and graceful failure handling
