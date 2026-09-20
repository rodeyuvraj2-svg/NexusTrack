# NexusTrack UI Redesign — Master Plan

> **Status (2026-09-11): All phases complete.** Direction was revised mid-project:
> the user chose to keep the original visual identity exactly (dark #0F172A,
> indigo/violet, gradients, glass) — the redesign became a consistency pass only.
> Phases 1–9 executed: shared components (PageHeader, SectionHeader, FilterTabs,
> Chip, StatCard, Skeletons, ErrorPanel, EmptyState), unified borders (/40
> standard, /50 emphasized, /60 hover), one pill system, unified
> loading/empty/error states, aria-labels, focus ring, reduced-motion,
> scrollbar-none fix, dead import cleanup.

**Direction:** Keep the original visual identity EXACTLY — dark #0F172A base, indigo/violet brand, radial gradient background, glassmorphism, 0.75rem radius, weight-800 headings. "Professional" = consistency: one pill/tab system, unified borders, unified loading/empty/error states, accessibility. NO aesthetic changes (colors, gradients, glass, radius, type weights) without asking the user first.
**Scope:** Presentation only. Zero changes to data logic, server functions, queries, routing, or auth.

---

## 0. Design Foundation (styles.css)

### 0.1 Color tokens

Replace the indigo/violet glass palette with a flat, elevated dark scale + blue accent.

| Token                  | New value (oklch)     | ~Hex        | Role                                              |
| ---------------------- | --------------------- | ----------- | ------------------------------------------------- |
| `--background`         | `0.145 0.008 255`     | #0D1117-ish | app background (flat, no radial gradients)        |
| `--card`               | `0.185 0.01 255`      | #161B26     | cards, panels                                     |
| `--popover`            | `0.205 0.01 255`      |             | dropdowns, menus                                  |
| `--muted`              | `0.235 0.01 255`      |             | subtle fills                                      |
| `--muted-foreground`   | `0.63 0.012 255`      | #8B93A3     | secondary text                                    |
| `--foreground`         | `0.97 0.005 255`      |             | primary text                                      |
| `--primary`            | `0.62 0.19 255`       | #3B82F6     | accent — buttons, active states, links            |
| `--primary-foreground` | `0.99 0.005 255`      |             |                                                   |
| `--accent`             | `0.68 0.16 255`       | #60A5FA     | hover accent (same hue family)                    |
| `--border`             | `oklch(1 0 0 / 0.08)` |             | ONE border token — kills all /30 /40 /50 variants |
| `--destructive`        | `0.62 0.21 25`        |             |                                                   |
| `--success`            | `0.68 0.17 150`       |             |                                                   |
| `--warning`            | `0.78 0.16 80`        |             |                                                   |

Sidebar tokens mirror card/muted. `--ring: var(--primary)`.

### 0.2 Remove

- The 3 fixed radial gradients on `body` (purple/red noise)
- `@utility glass`, `glass-strong`, `ring-accent`, `image-glow-border` (+ all 146 usages swept)
- `bg-gradient-accent` utility (brand mark gets a solid blue tile)
- `animate-float`, glow drop-shadows, `hover:scale-[1.02]` patterns

### 0.3 Add

- Elevation scale: `--shadow-xs/sm/md/lg` (subtle black shadows only)
- `--radius: 0.625rem` (tighter, more professional)
- Focus ring: `:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }` global
- `@media (prefers-reduced-motion: reduce)` — kill all transitions/animations
- Tabular numerals for stats: `font-variant-numeric: tabular-nums` on stat values

### 0.4 Typography

Keep Inter, fix the weight system:

- `h1` 700 (not 800/black), `h2` 600, `h3` 600 — page titles max `text-2xl`/`text-3xl`
- Body 400, UI labels 500, small caps labels: `text-xs font-medium uppercase tracking-wide text-muted-foreground`
- Stats: `text-2xl font-semibold tabular-nums` (not `font-black text-xl`)

---

## 1. Shared Components (new in `src/components/`)

| Component                                       | Replaces                                                                                                    | Notes                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `PageHeader`                                    | ad-hoc `<h1>` + `<p>` blocks                                                                                | title, description, actions slot; consistent mb                                                      |
| `SectionHeader`                                 | dashboard `Section`, search/discover `<h2>`s                                                                | title, count badge, "View all →" link                                                                |
| `FilterTabs`                                    | 4 different pill systems (dashboard TypeFilter, search category pills, library status pills, discover tabs) | segmented control: solid track, active = blue fill w/ white text, inactive = transparent hover muted |
| `Chip`                                          | genre chips, type filter pills                                                                              | outlined, sm                                                                                         |
| `StatCard`                                      | dashboard + profile stat tiles                                                                              | icon, value (tabular), label; solid card, border token                                               |
| `SkeletonCard` / `SkeletonRow` / `SkeletonGrid` | per-page hand-rolled skeletons                                                                              | single source; poster-shaped + list-row-shaped                                                       |
| `EmptyState` (upgraded)                         | mixed empty panels                                                                                          | icon, title, description, action; solid card                                                         |
| `ErrorPanel`                                    | inline error divs                                                                                           | icon, message, retry button                                                                          |

Rule: pages stop using raw `<button>`/`<input>` with ad-hoc classes — use `ui/button`, `ui/input`, `ui/select` consistently.

---

## 2. AppShell

- Sidebar: solid `bg-card`, single border-right, 240px
- Active nav item: `bg-primary/10 text-primary font-medium` + 2px left indicator bar (remove glow drop-shadow)
- Unread badge: solid blue pill with count
- Brand: solid blue rounded square with "N", white "Nexus" + `text-primary "Track"`
- `⌘K` row + Settings + Sign out stay, muted style
- Mobile top bar: solid bg (no backdrop-blur), bottom nav: 5 items, active = blue icon+label, no drop-shadow glow
- Main content: `max-w-7xl` unchanged; remove `md:pt-0` hack cleanup if trivial

---

## 3. MediaCard (most-seen component)

- Card: `rounded-lg border bg-card` (solid), hover: `border-primary/40` + tiny translate-y, NO scale-105 on poster (keep subtle brightness/saturate shift only)
- Rating badge: top-left, `bg-black/70 text-white` chip w/ star
- Favorite: heart button, filled blue when active, ghost otherwise
- Meta row: type label as tiny `Chip`-style tag + year
- StatusPill: solid outlined chip; watching = blue, completed = green, planned = amber; dropdown = `ui/dropdown-menu` instead of custom div
- "Offline preview" fallback chip: muted outline + info icon (AniList outage makes these common)
- Grid: `grid-cols-2 sm:3 md:4 lg:5 xl:6` unchanged

---

## 4. Pages (in execution order)

### 4.1 auth.tsx

Split layout: left brand panel (solid dark, logo, tagline, 3 feature bullets), right centered form card (email, password w/ show toggle, primary submit, divider, Google button, guest link). Mode toggle = segmented `FilterTabs`. Success/reset screens: same card, success icon. Inputs get real `ui/input` styling w/ focus ring.

### 4.2 index.tsx (landing)

Hero: headline + sub + two CTAs (solid blue + outlined). Feature grid: 6 solid cards, icon + title + line. Footer minimal. No gradients — one blue accent on the word "Track" and CTAs.

### 4.3 dashboard.tsx

- `PageHeader`: "Welcome back, {name}." + description
- `StatCard` row (4)
- Continue Watching → `SectionHeader` + grid (or horizontal scroll row)
- Trending/Popular → `SectionHeader` + `FilterTabs` + grid; loading = `SkeletonGrid`
- Friend activity → rows: avatar, text, relative time; solid `bg-card` rows
- All states: `SkeletonGrid` / `ErrorPanel` / `EmptyState`

### 4.4 search.tsx

- `PageHeader`
- Search bar: large solid input, `Search` icon, focus ring, clear button
- `FilterTabs` for categories (replaces gradient pills)
- Results: `SectionHeader` w/ count chips; sections in fixed order Movies → TV → Anime → Manga
- Warning banner: `ui/alert` warning variant
- Idle / empty / loading / error states via shared components

### 4.5 discover.tsx

- `PageHeader`
- `FilterTabs` (Movies/TV/Anime/Manga) + sort `FilterTabs` (compact) or `ui/select`
- Genre chips: `Chip` row, multi-select, active = blue fill
- Grid + infinite scroll; loading more = `SkeletonGrid` row appended; end sentinel
- Error → `ErrorPanel` w/ retry

### 4.6 library.tsx

- `PageHeader` + "Find something" outlined button
- Status filters: `FilterTabs` w/ icons; type filters: `Chip` row
- Search input (`ui/input`) + sort (`ui/select` w/ asc/desc toggle button)
- Grid; loading = `SkeletonGrid` ×12; guest = `EmptyState` w/ sign-in CTA

### 4.7 media.$type.$source.$id.tsx (biggest page)

- Hero: backdrop image w/ single dark gradient-to-transparent at bottom (overlay only over image — acceptable, it's imagery not decoration)
- Poster + title + meta chips (year, runtime, genres, rating star)
- Action bar: status `Select`, favorite toggle button, "Recommend to friend" outlined button, trailer link
- Seasons list: solid rows w/ poster thumb, name, progress, status control
- Cast: avatar circles w/ name/role (horizontal scroll)
- Reviews: `ui/card` blocks, like button, own review textarea (`ui/textarea`)
- Related: `MediaGrid`
- Recommend dialog: `ui/dialog` + user list rows
- All loading sections: skeletons; error: `ErrorPanel`

### 4.8 profile.tsx + user.$username.tsx

- Header card: avatar (ring), name, username, bio, edit button (own) / follow button (other)
- `StatCard` row (5)
- Completion ring: keep, re-colored to blue
- Favorites grid, recent activity rows, followers/following dialogs
- Edit mode: inline form w/ proper inputs

### 4.9 friends.tsx

- `PageHeader` + add-friend input
- Tabs (friends/requests/suggestions) via `FilterTabs`
- Person rows: avatar, name, mutual count, action buttons; solid rows

### 4.10 notifications.tsx

- `PageHeader` + "Mark all read" button
- Grouped rows: icon by type, body, relative time; unread = blue left border + `bg-primary/5`
- Empty → `EmptyState`

### 4.11 settings.tsx

- `PageHeader`
- Grouped `ui/card` sections: Account, Preferences, Data (import/export), Danger zone (destructive)
- Labels + descriptions + `ui/switch`/`ui/select` controls; consistent row layout

### 4.12 CommandPalette, RoutePending, RouteErrorBoundary, GuestRestrictionModal

- Palette: solid popover, blue highlight on active row
- Pending: centered spinner + route-loading bar (keep existing top bar animation, recolor)
- Error boundary: `ErrorPanel` style page

---

## 5. Cross-cutting

- **Loading:** skeleton-first everywhere (shape-matched), spinners only for inline button actions
- **Empty:** only `EmptyState` component
- **Error:** only `ErrorPanel` / `RouteErrorBoundary`
- **Accessibility:** global focus-visible ring; aria-labels on all icon-only buttons (favorite, menu, sort direction); contrast ≥ 4.5:1 for text; pill/tab groups use real `<button>`s (already do)
- **Motion:** 150ms ease-out standard; `animate-fade-in` kept for route content only; `btn-press` kept; everything else removed; prefers-reduced-motion kills all
- **Fallback demo rows (AniList outage):** "Offline preview" chip must look intentional, not broken

---

## 6. Execution order (commits)

1. **Foundation** — styles.css tokens, remove glass/gradient utilities, elevation + typography + focus ring (app instantly looks flatter; pages briefly reference removed classes → fix in same commit where trivial)
2. **Shared components** — PageHeader, FilterTabs, StatCard, Skeletons, EmptyState, ErrorPanel, Chip
3. **AppShell + MediaCard** — every page inherits the new look
4. **Dashboard + Search** (highest traffic)
5. **Library + Discover**
6. **Media detail page**
7. **Profile + user profile + Friends + Notifications**
8. **Settings + Auth + Landing + CommandPalette + error/pending**
9. **Sweep + QA** — grep for leftover `glass|gradient-accent|border-border/\d`, verify every page/state, `bun run lint`, visual pass at 375px / 768px / 1440px

Verification after each phase: `bun run dev`, click through affected pages, check loading/empty/error states, keyboard focus pass.

---

## 7. Out of scope (unchanged)

- All server functions, API fallback chains, caching, realtime
- Routing structure, URL schemas
- Auth flows and guest logic
- Content/feature changes
