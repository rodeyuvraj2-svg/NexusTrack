/**
 * Pure helpers for per-title progress (episode/chapter position).
 *
 * Media rules (mirrored by updateMediaProgress on the server):
 * - movie: never supports episode/chapter progress
 * - tv / anime: current_season + current_episode
 * - manga: current_chapter
 *
 * Every function treats null, undefined, negative, and non-integer values as
 * "no data" and never throws — progress fields come from loosely-typed
 * Supabase rows and must render safely in cards, lists, and detail panels.
 */

export type ProgressMediaType = "movie" | "tv" | "anime" | "manga";

/** Coerce a raw progress value to a valid non-negative integer, else null. */
function toCount(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  return n >= 0 ? n : null;
}

/** Only tv/anime (season+episode) and manga (chapter) support progress. */
export function supportsProgress(mediaType: string | null | undefined): boolean {
  return mediaType === "tv" || mediaType === "anime" || mediaType === "manga";
}

/**
 * TV/anime progress label: `S2 · E5`, or `S2 · E5 of 10` when the season's
 * episode total is known. Season is omitted when unknown (`E5`). Returns null
 * when there is no episode value to show.
 */
export function formatEpisodeProgress(
  season: number | null | undefined,
  episode: number | null | undefined,
  episodeTotal?: number | null | undefined,
): string | null {
  const ep = toCount(episode);
  if (ep === null) return null;
  const sn = toCount(season);
  const total = toCount(episodeTotal);
  const ofTotal = total !== null && total > 0 ? ` of ${total}` : "";
  return sn !== null ? `S${sn} · E${ep}${ofTotal}` : `E${ep}${ofTotal}`;
}

/**
 * Manga progress label: `Chapter 48`, or `Chapter 48 of 120` when the total
 * chapter count is known. Returns null when there is no chapter value.
 */
export function formatChapterProgress(
  chapter: number | null | undefined,
  chapterTotal?: number | null | undefined,
): string | null {
  const ch = toCount(chapter);
  if (ch === null) return null;
  const total = toCount(chapterTotal);
  const ofTotal = total !== null && total > 0 ? ` of ${total}` : "";
  return `Chapter ${ch}${ofTotal}`;
}

/**
 * Percentage of a known total, clamped to 0–100 for display. Returns null
 * whenever there is no *valid* total (null/undefined/zero/negative) or no
 * current value — never implying completion from an unknown total.
 */
export function calculateProgressPercent(
  current: number | null | undefined,
  total: number | null | undefined,
): number | null {
  const cur = toCount(current);
  const tot = toCount(total);
  if (cur === null || tot === null || tot <= 0) return null;
  const pct = Math.round((cur / tot) * 100);
  return Math.min(100, Math.max(0, pct));
}

/**
 * Label for the next item to watch/read: `Next: Episode 6` / `Next: Chapter 49`.
 * A missing current value means "start at the beginning" (Episode 1 / Chapter 1).
 * Total-aware so it never invents an item past the end:
 * - anime / manga: reaching the known total → `Completed`
 * - tv: finishing a season points at the NEXT season
 *   (`Next: Season 2 · Episode 1`); finishing the last known season → `Completed`
 * Movies return null. Unknown totals never imply completion.
 */
export function formatNextItemLabel(
  mediaType: string | null | undefined,
  current: { season?: number | null; episode?: number | null; chapter?: number | null } = {},
  totals?: {
    episodeTotal?: number | null;
    seasonTotal?: number | null;
    chapterTotal?: number | null;
  } | null,
): string | null {
  if (mediaType === "manga") {
    const ch = toCount(current.chapter);
    const total = toCount(totals?.chapterTotal);
    if (ch !== null && total !== null && total > 0 && ch >= total) return "Completed";
    return `Next: Chapter ${(ch ?? 0) + 1}`;
  }
  if (mediaType === "anime") {
    const ep = toCount(current.episode);
    const total = toCount(totals?.episodeTotal);
    if (ep !== null && total !== null && total > 0 && ep >= total) return "Completed";
    return `Next: Episode ${(ep ?? 0) + 1}`;
  }
  if (mediaType === "tv") {
    const ep = toCount(current.episode);
    if (ep === null) return "Next: Episode 1";
    const seasonTotal = toCount(totals?.episodeTotal);
    const atSeasonEnd = seasonTotal !== null && seasonTotal > 0 && ep >= seasonTotal;
    if (!atSeasonEnd) return `Next: Episode ${ep + 1}`;
    const sn = toCount(current.season);
    const maxSeason = toCount(totals?.seasonTotal);
    if (sn !== null && maxSeason !== null && maxSeason > 0 && sn < maxSeason) {
      return `Next: Season ${sn + 1} · Episode 1`;
    }
    return "Completed";
  }
  return null;
}

/**
 * Episode total for a specific season, chosen from cached season metadata
 * (listSeasonsWithProgress rows). Only a positive episode_count counts as
 * known; a missing season or missing count yields null.
 */
export function getSeasonEpisodeTotal(
  seasons: Array<{ season_number: number; episode_count: number | null }> | null | undefined,
  seasonNumber: number | null | undefined,
): number | null {
  const sn = toCount(seasonNumber);
  if (sn === null || !seasons?.length) return null;
  const match = seasons.find((s) => toCount(s.season_number) === sn);
  const count = toCount(match?.episode_count);
  return count !== null && count > 0 ? count : null;
}

// ─── Shared row shapes ──────────────────────────────────────────────────────

/**
 * Row shape returned by getContinueWatching (user_media joined with media).
 * Embedded joins lose inferred Supabase types, so the fetch sites cast to
 * this interface explicitly.
 */
export interface ContinueWatchingRow {
  id: string;
  media_id: string;
  status: string;
  current_season: number | null;
  current_episode: number | null;
  current_chapter: number | null;
  progress_updated_at: string | null;
  updated_at: string;
  media: {
    id: string;
    media_type: string;
    source: string;
    external_id: string;
    title: string;
    poster_url: string | null;
    release_year: number | null;
    vote_average: number | null;
    season_count: number | null;
    chapter_count: number | null;
  } | null;
}
