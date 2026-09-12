import { describe, expect, test } from "bun:test";
import {
  computeStreaks,
  computeHoursWatched,
  computeFavoriteGenres,
  type StatRow,
} from "./stats-utils";

// ── computeStreaks ───────────────────────────────────────────────────────────

describe("computeStreaks", () => {
  // Reference "now" — fixed so tests are deterministic.
  const NOW = new Date(2026, 8, 6); // Sep 6 2026, local time

  const iso = (y: number, m: number, d: number, hour = 12) =>
    // Local-time ISO string; computeStreaks converts to local dates anyway.
    new Date(y, m - 1, d, hour).toISOString();

  test("empty activity → zero streaks", () => {
    expect(computeStreaks([], NOW)).toEqual({ currentStreak: 0, longestStreak: 0 });
  });

  test("active today and yesterday → current streak 2", () => {
    const dates = [iso(2026, 9, 5), iso(2026, 9, 6)];
    const r = computeStreaks(dates, NOW);
    expect(r.currentStreak).toBe(2);
    expect(r.longestStreak).toBe(2);
  });

  test("last active yesterday only → current streak 1 (grace day)", () => {
    const r = computeStreaks([iso(2026, 9, 5)], NOW);
    expect(r.currentStreak).toBe(1);
  });

  test("last active two days ago → current streak 0, longest 1", () => {
    const r = computeStreaks([iso(2026, 9, 4)], NOW);
    expect(r.currentStreak).toBe(0);
    expect(r.longestStreak).toBe(1);
  });

  test("gap breaks the current streak but keeps the longest", () => {
    // 5-day run ending 3 days ago, plus today.
    const dates = [
      iso(2026, 9, 1),
      iso(2026, 9, 2),
      iso(2026, 9, 3),
      iso(2026, 9, 4),
      iso(2026, 9, 5),
      iso(2026, 9, 6),
    ];
    const r = computeStreaks(dates, NOW);
    // Sorted distinct dates: 1–6 → actually continuous, streak 6.
    expect(r.currentStreak).toBe(6);
    expect(r.longestStreak).toBe(6);
  });

  test("longest streak survives a gap that breaks the current streak", () => {
    // Runs: Sep 1–4 (4 days), gap, Sep 6 (today).
    const dates = [
      iso(2026, 9, 1),
      iso(2026, 9, 2),
      iso(2026, 9, 3),
      iso(2026, 9, 4),
      iso(2026, 9, 6),
    ];
    const r = computeStreaks(dates, NOW);
    expect(r.currentStreak).toBe(1); // just today
    expect(r.longestStreak).toBe(4);
  });

  test("multiple same-day events count once", () => {
    const dates = [iso(2026, 9, 6, 9), iso(2026, 9, 6, 22), iso(2026, 9, 6, 3)];
    const r = computeStreaks(dates, NOW);
    expect(r.currentStreak).toBe(1);
  });

  test("late-night activity in a UTC+offset zone lands on the local date", () => {
    // 2026-09-06 00:30 local (UTC+5:30) = 2026-09-05 19:00 UTC.
    // If the streak used UTC dates (the old bug), this would map to Sep 5.
    const lateNightLocal = new Date(2026, 8, 6, 0, 30).toISOString();
    const r = computeStreaks([lateNightLocal], NOW);
    expect(r.currentStreak).toBe(1);
  });
});

// ── computeHoursWatched ──────────────────────────────────────────────────────

describe("computeHoursWatched", () => {
  const row = (partial: Partial<StatRow>): StatRow => ({
    status: "completed",
    rating: null,
    favorite: false,
    media: {
      id: "m1",
      media_type: "movie",
      runtime: 120,
      title: "T",
      poster_url: null,
      source: "tmdb",
      external_id: "1",
      genres: null,
      season_count: null,
    },
    ...partial,
  });

  test("movie runtime counts once", () => {
    expect(computeHoursWatched([row({})])).toBe(2); // 120 min
  });

  test("non-completed items are ignored", () => {
    expect(computeHoursWatched([row({ status: "watching" })])).toBe(0);
  });

  test("per-episode runtime multiplies by episode count (anime)", () => {
    // 24 min × 12 episodes = 288 min ≈ 4.8 → rounds to 5
    const anime = row({
      media: {
        id: "a1",
        media_type: "anime",
        runtime: 24,
        title: "A",
        poster_url: null,
        source: "anilist",
        external_id: "2",
        genres: null,
        season_count: 12, // anilist stores episode count here
      },
    });
    expect(computeHoursWatched([anime])).toBe(5);
  });

  test("missing season_count falls back to a single episode", () => {
    const tv = row({
      media: {
        id: "t1",
        media_type: "tv",
        runtime: 60,
        title: "V",
        poster_url: null,
        source: "tmdb",
        external_id: "3",
        genres: null,
        season_count: null,
      },
    });
    expect(computeHoursWatched([tv])).toBe(1);
  });

  test("null/zero runtime contributes nothing", () => {
    expect(computeHoursWatched([row({ media: null })])).toBe(0);
  });
});

// ── computeFavoriteGenres ────────────────────────────────────────────────────

describe("computeFavoriteGenres", () => {
  test("counts and ranks genres, top 8", () => {
    const mk = (genres: string[]): StatRow => ({
      status: "completed",
      rating: null,
      favorite: false,
      media: {
        id: "x",
        media_type: "movie",
        runtime: null,
        title: "x",
        poster_url: null,
        source: "tmdb",
        external_id: "x",
        genres,
        season_count: null,
      },
    });
    const rows = [
      mk(["Drama", "Thriller"]),
      mk(["Drama"]),
      mk(["Drama", "Sci-Fi"]),
      mk([]),
      { status: "planned", rating: null, favorite: false, media: null },
    ];
    const out = computeFavoriteGenres(rows);
    expect(out[0]).toEqual({ genre: "Drama", count: 3 });
    expect(out).toHaveLength(3); // Drama, Thriller, Sci-Fi
  });

  test("no genres → empty array", () => {
    expect(
      computeFavoriteGenres([{ status: "planned", rating: null, favorite: false, media: null }]),
    ).toEqual([]);
  });
});
