// Pure statistics helpers for profile stats — extracted from getStats so
// they can be unit-tested without a database. No server-only imports here.

export interface StatMedia {
  id: string;
  media_type: string;
  runtime: number | null;
  title: string;
  poster_url: string | null;
  source: string;
  external_id: string;
  genres: string[] | null;
  season_count: number | null;
}

export interface StatRow {
  status: string;
  rating: number | null;
  favorite: boolean;
  media: StatMedia | null;
}

/**
 * Sum hours across completed items.
 * - Movies: runtime is the full film length.
 * - TV/anime: runtime is per-episode; multiplied by the episode count.
 *   For anilist anime, `season_count` holds the total episode count; for
 *   TMDB TV it holds the number of seasons (an approximation until the
 *   seasons' episode counts are summed).
 */
export function computeHoursWatched(list: StatRow[]): number {
  let hours = 0;
  for (const r of list) {
    if (r.status !== "completed") continue;
    const m = r.media;
    if (!m?.runtime || m.runtime <= 0) continue;
    if (m.media_type === "movie") {
      hours += m.runtime / 60;
    } else {
      const episodeCount = m.season_count ?? 0;
      hours += (m.runtime * (episodeCount > 0 ? episodeCount : 1)) / 60;
    }
  }
  return Math.round(hours);
}

/** Top 8 genres by how many library items carry them. */
export function computeFavoriteGenres(list: StatRow[]): Array<{ genre: string; count: number }> {
  const genreMap = new Map<string, number>();
  for (const r of list) {
    if (r.media?.genres) {
      for (const g of r.media.genres) {
        genreMap.set(g, (genreMap.get(g) ?? 0) + 1);
      }
    }
  }
  return Array.from(genreMap.entries())
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
}

/**
 * Streaks over local calendar dates (not UTC — a user active at 9pm in a
 * UTC+offset timezone shouldn't have their streak broken at UTC midnight).
 *
 * @param activityDates ISO timestamp strings of activity events.
 * @param now            Current time (injectable for tests).
 */
export function computeStreaks(activityDates: string[], now: Date = new Date()): StreakResult {
  const localDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const shiftDays = (dateStr: string, days: number) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return localDateStr(new Date(y, m - 1, d + days));
  };

  // Distinct local calendar dates, newest first.
  const dates = new Set<string>(activityDates.map((iso) => localDateStr(new Date(iso))));
  const sortedDates = Array.from(dates).sort().reverse();

  let currentStreak = 0;
  let longestStreak = 0;
  if (sortedDates.length === 0) return { currentStreak, longestStreak };

  const today = localDateStr(now);
  const yesterday = shiftDays(today, -1);
  if (sortedDates.includes(today) || sortedDates.includes(yesterday)) {
    let cursor = sortedDates.includes(today) ? today : yesterday;
    for (const d of sortedDates) {
      if (d === cursor) {
        currentStreak++;
        cursor = shiftDays(cursor, -1);
      } else if (d < cursor) {
        break;
      }
    }
  }
  let run = 1;
  for (let i = sortedDates.length - 1; i > 0; i--) {
    if (sortedDates[i] === shiftDays(sortedDates[i - 1], -1)) {
      run++;
      longestStreak = Math.max(longestStreak, run);
    } else {
      run = 1;
    }
  }
  longestStreak = Math.max(longestStreak, currentStreak, 1);
  return { currentStreak, longestStreak };
}
