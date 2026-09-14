/**
 * Universal progress-limit rules — the single source of truth for what
 * episode / season / chapter values are *saveable*, enforced in three
 * places that all import this module:
 *
 *   1. UI inputs & stepper buttons (ProgressPanel)
 *   2. Optimistic cache patches (invalid values never enter the cache)
 *   3. Server functions (updateMediaProgress — the authoritative guard)
 *
 * Design rules:
 * - A limit is only enforced when a RELIABLE total is known (> 0 integer
 *   from the trusted `media`/`seasons` cache tables). Unknown totals never
 *   block tracking, and a total of 0 is treated as unknown, not "nothing".
 * - Existing rows that already exceed a known total (metadata changed since
 *   the save) are preserved untouched — validation only fires when the user
 *   attempts a NEW save. See `validateProgressUpdate`'s preserveLegacy flag.
 * - Everything is pure and dependency-free so it runs in browser and server
 *   bundles alike (mirrors progress-utils.ts).
 */

import type { ProgressMediaType } from "./progress-utils";

/** Metadata totals needed for validation, read from trusted sources only. */
export interface ProgressLimits {
  /** Episode count of the season being saved (tv), or the anime's total
   *  episode count. Null/0 = unknown. */
  episodeTotal?: number | null;
  /** Highest real season number (tv, from the seasons table). Null = unknown. */
  seasonTotal?: number | null;
  /** Total chapters (manga). Null/0 = unknown. */
  chapterTotal?: number | null;
}

/** The progress values being validated (all optional — partial updates). */
export interface ProgressInput {
  current_season?: number | null;
  current_episode?: number | null;
  current_chapter?: number | null;
}

export interface ProgressValidationResult {
  ok: boolean;
  /** Human-friendly message when ok is false, e.g.
   *  "Season 2 has 10 episodes. Progress cannot exceed episode 10." */
  message?: string;
}

/** Only a positive integer counts as a known total (0 and negatives = unknown). */
function knownTotal(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  return n > 0 ? n : null;
}

/**
 * Validate a progress update against known limits. Does NOT check
 * media-type field combinations (movie-with-episodes etc.) — the server
 * function already owns that; this is purely about value ceilings.
 */
export function validateProgressValues(
  mediaType: ProgressMediaType | string,
  input: ProgressInput,
  limits: ProgressLimits,
): ProgressValidationResult {
  const seasonTotal = knownTotal(limits.seasonTotal);
  const episodeTotal = knownTotal(limits.episodeTotal);
  const chapterTotal = knownTotal(limits.chapterTotal);

  if (mediaType === "movie") {
    // Movies never carry progress — the server rejects the payload, but a
    // shared rule here keeps client-side callers consistent too.
    const supplied =
      input.current_season !== undefined ||
      input.current_episode !== undefined ||
      input.current_chapter !== undefined;
    if (supplied) return { ok: false, message: "Movies don't support progress tracking." };
    return { ok: true };
  }

  if (mediaType === "manga") {
    if (
      chapterTotal !== null &&
      input.current_chapter != null &&
      input.current_chapter > chapterTotal
    ) {
      return {
        ok: false,
        message: `This manga has ${chapterTotal} chapters. Progress cannot exceed chapter ${chapterTotal}.`,
      };
    }
    return { ok: true };
  }

  // tv / anime
  if (seasonTotal !== null && input.current_season != null && input.current_season > seasonTotal) {
    return {
      ok: false,
      message: `This series has ${seasonTotal} season${seasonTotal === 1 ? "" : "s"}.`,
    };
  }
  if (
    episodeTotal !== null &&
    input.current_episode != null &&
    input.current_episode > episodeTotal
  ) {
    const ofSeason =
      input.current_season != null ? `Season ${input.current_season} has` : "This title has";
    return {
      ok: false,
      message: `${ofSeason} ${episodeTotal} episode${episodeTotal === 1 ? "" : "s"}. Progress cannot exceed episode ${episodeTotal}.`,
    };
  }
  return { ok: true };
}

/** Media-type-specific wording for the "N total" hint under an input. */
export function progressTotalHint(
  mediaType: "tv" | "anime" | "manga",
  limits: ProgressLimits,
): string | null {
  if (mediaType === "manga") {
    const t = knownTotal(limits.chapterTotal);
    return t !== null ? `${t} chapters total` : null;
  }
  const t = knownTotal(limits.episodeTotal);
  if (t === null) return null;
  return mediaType === "anime" ? `${t} episodes total` : `${t} episodes this season`;
}

/**
 * Episode total for a season change: when the user picks a new season,
 * this is the value the episode input must be re-validated against.
 * Returns null when the new season's count is unknown.
 */
export function episodeTotalForSeason(
  seasons: Array<{ season_number: number; episode_count: number | null }> | null | undefined,
  seasonNumber: number | null | undefined,
): number | null {
  if (seasonNumber == null || !seasons?.length) return null;
  const match = seasons.find((s) => s.season_number === seasonNumber);
  return knownTotal(match?.episode_count);
}

/**
 * Can the increment button still go up? False at the last episode/chapter
 * of a known total (or on a movie, which never shows steppers at all).
 */
export function canIncrement(
  mediaType: "tv" | "anime" | "manga",
  current: { episode?: number | null; chapter?: number | null },
  limits: ProgressLimits,
): boolean {
  if (mediaType === "manga") {
    const total = knownTotal(limits.chapterTotal);
    if (total === null) return true;
    return (current.chapter ?? 0) < total;
  }
  const total = knownTotal(limits.episodeTotal);
  if (total === null) return true;
  return (current.episode ?? 0) < total;
}
