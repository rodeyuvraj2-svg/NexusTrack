import { describe, expect, test } from "bun:test";
import {
  validateProgressValues,
  progressTotalHint,
  episodeTotalForSeason,
  canIncrement,
} from "./progress-limits";

// ── validateProgressValues ──────────────────────────────────────────────────

describe("validateProgressValues — tv", () => {
  const limits = { seasonTotal: 3, episodeTotal: 10 };

  test("valid season + episode pass", () => {
    const s2e10 = validateProgressValues("tv", { current_season: 2, current_episode: 10 }, limits);
    expect(s2e10).toEqual({ ok: true });
    const s1e1 = validateProgressValues("tv", { current_season: 1, current_episode: 1 }, limits);
    expect(s1e1).toEqual({ ok: true });
  });

  test("season beyond the real season count is rejected", () => {
    const r = validateProgressValues("tv", { current_season: 4, current_episode: 1 }, limits);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("3 seasons");
  });

  test("episode beyond the season's episode count is rejected with a specific message", () => {
    const r = validateProgressValues("tv", { current_season: 2, current_episode: 11 }, limits);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Season 2 has 10 episodes");
    expect(r.message).toContain("episode 10");
  });

  test("null values never violate limits (clearing progress is always ok)", () => {
    const r = validateProgressValues("tv", { current_season: null, current_episode: null }, limits);
    expect(r).toEqual({ ok: true });
  });

  test("unknown totals never block a save", () => {
    const r = validateProgressValues("tv", { current_season: 99, current_episode: 999 }, {});
    expect(r.ok).toBe(true);
  });

  test("zero totals are treated as unknown, not as 'nothing allowed'", () => {
    const r = validateProgressValues(
      "tv",
      { current_season: 2, current_episode: 5 },
      {
        seasonTotal: 0,
        episodeTotal: 0,
      },
    );
    expect(r.ok).toBe(true);
  });

  test("exact-limit values pass (the final episode is saveable)", () => {
    const r = validateProgressValues("tv", { current_season: 3, current_episode: 10 }, limits);
    expect(r.ok).toBe(true);
  });
});

describe("validateProgressValues — anime", () => {
  // anime: episodeTotal = total episodes of the whole series
  const limits = { episodeTotal: 24 };

  test("episode within total passes", () => {
    expect(validateProgressValues("anime", { current_episode: 24 }, limits).ok).toBe(true);
  });

  test("episode beyond total is rejected", () => {
    const r = validateProgressValues("anime", { current_episode: 25 }, limits);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("24 episodes");
  });

  test("unknown total (currently airing, no count) allows any progress", () => {
    expect(validateProgressValues("anime", { current_episode: 500 }, {}).ok).toBe(true);
  });
});

describe("validateProgressValues — manga", () => {
  const limits = { chapterTotal: 120 };

  test("chapter within total passes", () => {
    expect(validateProgressValues("manga", { current_chapter: 120 }, limits).ok).toBe(true);
  });

  test("chapter beyond total is rejected", () => {
    const r = validateProgressValues("manga", { current_chapter: 121 }, limits);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("120 chapters");
  });

  test("unknown chapter total allows progress", () => {
    expect(validateProgressValues("manga", { current_chapter: 999 }, {}).ok).toBe(true);
  });
});

describe("validateProgressValues — movie", () => {
  test("any progress payload on a movie is rejected", () => {
    expect(validateProgressValues("movie", { current_episode: 1 }, {}).ok).toBe(false);
    expect(validateProgressValues("movie", { current_chapter: 1 }, {}).ok).toBe(false);
  });

  test("empty payload on a movie is fine", () => {
    expect(validateProgressValues("movie", {}, {}).ok).toBe(true);
  });
});

// ── progressTotalHint ───────────────────────────────────────────────────────

describe("progressTotalHint", () => {
  test("manga with known total", () => {
    expect(progressTotalHint("manga", { chapterTotal: 120 })).toBe("120 chapters total");
  });

  test("manga unknown total → null", () => {
    expect(progressTotalHint("manga", {})).toBeNull();
    expect(progressTotalHint("manga", { chapterTotal: 0 })).toBeNull();
  });

  test("anime wording uses episodes", () => {
    expect(progressTotalHint("anime", { episodeTotal: 24 })).toBe("24 episodes total");
  });

  test("tv wording is per-season", () => {
    expect(progressTotalHint("tv", { episodeTotal: 10 })).toBe("10 episodes this season");
  });
});

// ── episodeTotalForSeason ───────────────────────────────────────────────────

describe("episodeTotalForSeason", () => {
  const seasons = [
    { season_number: 1, episode_count: 12 },
    { season_number: 2, episode_count: 10 },
    { season_number: 3, episode_count: null },
  ];

  test("returns the matching season's count", () => {
    expect(episodeTotalForSeason(seasons, 1)).toBe(12);
    expect(episodeTotalForSeason(seasons, 2)).toBe(10);
  });

  test("unknown season or null count → null (never a false max)", () => {
    expect(episodeTotalForSeason(seasons, 3)).toBeNull();
    expect(episodeTotalForSeason(seasons, 9)).toBeNull();
    expect(episodeTotalForSeason(null, 1)).toBeNull();
  });

  test("zero count is unknown, not zero-max", () => {
    expect(episodeTotalForSeason([{ season_number: 1, episode_count: 0 }], 1)).toBeNull();
  });
});

// ── canIncrement ────────────────────────────────────────────────────────────

describe("canIncrement", () => {
  test("stops at the last chapter of a known total", () => {
    expect(canIncrement("manga", { chapter: 119 }, { chapterTotal: 120 })).toBe(true);
    expect(canIncrement("manga", { chapter: 120 }, { chapterTotal: 120 })).toBe(false);
  });

  test("stops at the last episode of a known season", () => {
    expect(canIncrement("tv", { episode: 9 }, { episodeTotal: 10 })).toBe(true);
    expect(canIncrement("tv", { episode: 10 }, { episodeTotal: 10 })).toBe(false);
    expect(canIncrement("anime", { episode: 24 }, { episodeTotal: 24 })).toBe(false);
  });

  test("unknown totals allow incrementing (no false ceiling)", () => {
    expect(canIncrement("manga", { chapter: 500 }, {})).toBe(true);
    expect(canIncrement("anime", { episode: 500 }, {})).toBe(true);
    expect(canIncrement("tv", { episode: 500 }, { episodeTotal: 0 })).toBe(true);
  });
});
