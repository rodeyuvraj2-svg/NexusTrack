import { describe, expect, test } from "bun:test";
import {
  supportsProgress,
  formatEpisodeProgress,
  formatChapterProgress,
  calculateProgressPercent,
  formatNextItemLabel,
  getSeasonEpisodeTotal,
} from "./progress-utils";

// ── supportsProgress ─────────────────────────────────────────────────────────

describe("supportsProgress", () => {
  test("tv, anime, and manga support progress", () => {
    expect(supportsProgress("tv")).toBe(true);
    expect(supportsProgress("anime")).toBe(true);
    expect(supportsProgress("manga")).toBe(true);
  });

  test("movies never support progress", () => {
    expect(supportsProgress("movie")).toBe(false);
  });

  test("unknown / missing types are not progress-capable", () => {
    expect(supportsProgress(null)).toBe(false);
    expect(supportsProgress(undefined)).toBe(false);
    expect(supportsProgress("book")).toBe(false);
    expect(supportsProgress("")).toBe(false);
  });
});

// ── formatEpisodeProgress ────────────────────────────────────────────────────

describe("formatEpisodeProgress", () => {
  test("season + episode → S2 · E5", () => {
    expect(formatEpisodeProgress(2, 5)).toBe("S2 · E5");
  });

  test("known season total → S2 · E5 of 10", () => {
    expect(formatEpisodeProgress(2, 5, 10)).toBe("S2 · E5 of 10");
  });

  test("episode without season → E5 / E5 of 10", () => {
    expect(formatEpisodeProgress(null, 5)).toBe("E5");
    expect(formatEpisodeProgress(null, 5, 10)).toBe("E5 of 10");
  });

  test("no episode → null even with a season", () => {
    expect(formatEpisodeProgress(2, null)).toBeNull();
    expect(formatEpisodeProgress(null, null)).toBeNull();
    expect(formatEpisodeProgress(undefined, undefined)).toBeNull();
  });

  test("zero values are valid", () => {
    expect(formatEpisodeProgress(0, 0)).toBe("S0 · E0");
    expect(formatEpisodeProgress(1, 0, 12)).toBe("S1 · E0 of 12");
  });

  test("negative values are treated as missing", () => {
    expect(formatEpisodeProgress(-2, 5)).toBe("E5");
    expect(formatEpisodeProgress(2, -5)).toBeNull();
    expect(formatEpisodeProgress(-1, -1, 10)).toBeNull();
  });

  test("invalid totals (null / zero / negative) are omitted", () => {
    expect(formatEpisodeProgress(2, 5, null)).toBe("S2 · E5");
    expect(formatEpisodeProgress(2, 5, 0)).toBe("S2 · E5");
    expect(formatEpisodeProgress(2, 5, -3)).toBe("S2 · E5");
    expect(formatEpisodeProgress(2, 5, undefined)).toBe("S2 · E5");
  });
});

// ── formatChapterProgress ────────────────────────────────────────────────────

describe("formatChapterProgress", () => {
  test("chapter → Chapter 48", () => {
    expect(formatChapterProgress(48)).toBe("Chapter 48");
  });

  test("known total → Chapter 48 of 120", () => {
    expect(formatChapterProgress(48, 120)).toBe("Chapter 48 of 120");
  });

  test("no chapter → null", () => {
    expect(formatChapterProgress(null)).toBeNull();
    expect(formatChapterProgress(undefined)).toBeNull();
  });

  test("zero chapter is valid", () => {
    expect(formatChapterProgress(0)).toBe("Chapter 0");
    expect(formatChapterProgress(0, 50)).toBe("Chapter 0 of 50");
  });

  test("negative chapter is treated as missing", () => {
    expect(formatChapterProgress(-5)).toBeNull();
  });

  test("invalid totals are omitted", () => {
    expect(formatChapterProgress(48, null)).toBe("Chapter 48");
    expect(formatChapterProgress(48, 0)).toBe("Chapter 48");
    expect(formatChapterProgress(48, -10)).toBe("Chapter 48");
  });
});

// ── calculateProgressPercent ─────────────────────────────────────────────────

describe("calculateProgressPercent", () => {
  test("simple ratios", () => {
    expect(calculateProgressPercent(5, 10)).toBe(50);
    expect(calculateProgressPercent(1, 4)).toBe(25);
    expect(calculateProgressPercent(0, 10)).toBe(0);
  });

  test("no valid total → null (never implies completion)", () => {
    expect(calculateProgressPercent(5, null)).toBeNull();
    expect(calculateProgressPercent(5, undefined)).toBeNull();
    expect(calculateProgressPercent(5, 0)).toBeNull();
    expect(calculateProgressPercent(5, -10)).toBeNull();
  });

  test("no current value → null", () => {
    expect(calculateProgressPercent(null, 10)).toBeNull();
    expect(calculateProgressPercent(undefined, 10)).toBeNull();
    expect(calculateProgressPercent(-3, 10)).toBeNull();
  });

  test("clamps above 100 and below 0", () => {
    expect(calculateProgressPercent(15, 10)).toBe(100);
    expect(calculateProgressPercent(1000, 10)).toBe(100);
  });

  test("rounds to whole percents", () => {
    expect(calculateProgressPercent(1, 3)).toBe(33);
    expect(calculateProgressPercent(2, 3)).toBe(67);
  });
});

// ── formatNextItemLabel ──────────────────────────────────────────────────────

describe("formatNextItemLabel", () => {
  test("tv/anime → next episode", () => {
    expect(formatNextItemLabel("tv", { episode: 5 })).toBe("Next: Episode 6");
    expect(formatNextItemLabel("anime", { episode: 12 })).toBe("Next: Episode 13");
  });

  test("manga → next chapter", () => {
    expect(formatNextItemLabel("manga", { chapter: 48 })).toBe("Next: Chapter 49");
  });

  test("missing current value starts at the beginning", () => {
    expect(formatNextItemLabel("tv", { episode: null })).toBe("Next: Episode 1");
    expect(formatNextItemLabel("manga", {})).toBe("Next: Chapter 1");
  });

  test("movie → null (no next item)", () => {
    expect(formatNextItemLabel("movie", { episode: 5 })).toBeNull();
    expect(formatNextItemLabel("movie")).toBeNull();
  });

  test("unknown type → null", () => {
    expect(formatNextItemLabel("book", { chapter: 3 })).toBeNull();
    expect(formatNextItemLabel(null)).toBeNull();
  });

  test("negative values are treated as not started", () => {
    expect(formatNextItemLabel("tv", { episode: -2 })).toBe("Next: Episode 1");
  });
});

// ── getSeasonEpisodeTotal ────────────────────────────────────────────────────

describe("getSeasonEpisodeTotal", () => {
  const seasons = [
    { season_number: 1, episode_count: 12 },
    { season_number: 2, episode_count: 10 },
    { season_number: 3, episode_count: null },
  ];

  test("returns the episode count for the matching season", () => {
    expect(getSeasonEpisodeTotal(seasons, 1)).toBe(12);
    expect(getSeasonEpisodeTotal(seasons, 2)).toBe(10);
  });

  test("missing season or null count → null", () => {
    expect(getSeasonEpisodeTotal(seasons, 3)).toBeNull();
    expect(getSeasonEpisodeTotal(seasons, 9)).toBeNull();
    expect(getSeasonEpisodeTotal(seasons, null)).toBeNull();
  });

  test("empty / missing season lists → null", () => {
    expect(getSeasonEpisodeTotal([], 1)).toBeNull();
    expect(getSeasonEpisodeTotal(null, 1)).toBeNull();
    expect(getSeasonEpisodeTotal(undefined, 1)).toBeNull();
  });

  test("zero or negative counts are not known totals", () => {
    expect(getSeasonEpisodeTotal([{ season_number: 1, episode_count: 0 }], 1)).toBeNull();
    expect(getSeasonEpisodeTotal([{ season_number: 1, episode_count: -5 }], 1)).toBeNull();
  });
});
