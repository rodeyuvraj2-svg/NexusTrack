/**
 * Pure helpers for composing multi-provider feeds — balanced interleaving,
 * deduplication, and result-limiting. No I/O here so these are trivially
 * unit-testable; the mixedFeed server function in feed.functions.ts does
 * the fetching and uses these to shape the result.
 */

import type { MediaSummary } from "./media-types";

/** Stable identity for a media item across the app (same key format the
 *  Discover page and library use). */
export function mediaKey(
  item: Pick<MediaSummary, "source" | "media_type" | "external_id">,
): string {
  return `${item.source}-${item.media_type}-${item.external_id}`;
}

/**
 * Round-robin interleave any number of lists, then truncate to `limit`.
 *
 *   ([a1,a2,a3], [b1,b2], [c1]) → [a1,b1,c1,a2,b2,a3]
 *
 * This keeps the feed balanced — no single provider/type can dominate the
 * visible window — while preserving each list's own ranking order. Empty or
 * missing lists simply contribute nothing (a failed provider can't starve
 * the others).
 */
export function interleaveBalanced<T>(lists: T[][], limit: number): T[] {
  const out: T[] = [];
  const maxLength = lists.reduce((max, list) => Math.max(max, list.length), 0);
  for (let i = 0; i < maxLength && out.length < limit; i++) {
    for (const list of lists) {
      if (out.length >= limit) break;
      if (i < list.length) out.push(list[i]);
    }
  }
  return out;
}

/**
 * Deduplicate by source + media_type + external_id, preserving first-seen
 * order. Different providers use different id spaces (TMDB ids ≠ AniList
 * ids), so cross-provider collisions can't happen — but the same provider
 * can appear twice (e.g. a TMDB movie in both trending and popular pulls)
 * and the same title can legitimately exist as both anime and manga, which
 * is why media_type is part of the key.
 */
export function dedupeMedia<T extends Pick<MediaSummary, "source" | "media_type" | "external_id">>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = mediaKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** interleaveBalanced + dedupeMedia combined: balanced, unique, capped. */
export function composeMixedFeed(lists: MediaSummary[][], limit: number): MediaSummary[] {
  return dedupeMedia(interleaveBalanced(lists, limit * 2)).slice(0, limit);
}

/**
 * Windowing math for a per-type "All" feed. Each All page holds FEED_SIZE
 * (20) items drawn from `listCount` sub-rankings; every sub-ranking pages
 * 20 items at a time. A window of `windowSize` items is taken from each
 * sub-ranking, and consecutive All pages advance through the sub-ranking's
 * page before moving on:
 *   movie (4 lists) → 5-item windows, 4 All pages per sub-ranking page
 *   tv (3 lists)    → 7-item windows, 2 All pages per sub-ranking page
 *   anime/manga (2) → 10-item windows, 2 All pages per sub-ranking page
 */
export function allFeedWindow(
  listCount: number,
  page: number,
  feedSize = 20,
  subListPageSize = 20,
): { subPage: number; offset: number; windowSize: number } {
  const windowSize = Math.max(1, Math.ceil(feedSize / listCount));
  const pagesPerSubPage = Math.max(1, Math.floor(subListPageSize / windowSize));
  return {
    subPage: Math.ceil(page / pagesPerSubPage),
    offset: ((page - 1) % pagesPerSubPage) * windowSize,
    windowSize,
  };
}
