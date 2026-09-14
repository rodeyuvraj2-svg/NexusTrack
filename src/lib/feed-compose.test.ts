import { describe, expect, test } from "bun:test";
import {
  interleaveBalanced,
  dedupeMedia,
  composeMixedFeed,
  mediaKey,
  allFeedWindow,
} from "./feed-compose";
import type { MediaSummary } from "./media-types";

function item(
  source: MediaSummary["source"],
  media_type: MediaSummary["media_type"],
  external_id: string,
  title = external_id,
): MediaSummary {
  return {
    external_id,
    source,
    media_type,
    title,
    overview: null,
    poster_url: null,
    backdrop_url: null,
    release_year: null,
    vote_average: null,
    genres: [],
    runtime: null,
    season_count: null,
    chapter_count: null,
    volume_count: null,
    status: null,
  };
}

// ── interleaveBalanced ───────────────────────────────────────────────────────

describe("interleaveBalanced", () => {
  test("round-robins lists so no provider dominates", () => {
    const out = interleaveBalanced([["a1", "a2", "a3"], ["b1", "b2"], ["c1"]], 10);
    expect(out).toEqual(["a1", "b1", "c1", "a2", "b2", "a3"]);
  });

  test("respects the limit", () => {
    const out = interleaveBalanced(
      [
        ["a1", "a2", "a3"],
        ["b1", "b2", "b3"],
      ],
      4,
    );
    expect(out).toEqual(["a1", "b1", "a2", "b2"]);
  });

  test("empty and missing lists contribute nothing", () => {
    const out = interleaveBalanced([[], ["b1"], [] as string[]], 10);
    expect(out).toEqual(["b1"]);
  });

  test("first item comes from the first list (stable ordering)", () => {
    const out = interleaveBalanced([["a1"], ["b1"], ["c1"]], 3);
    expect(out[0]).toBe("a1");
  });
});

// ── dedupeMedia ─────────────────────────────────────────────────────────────

describe("dedupeMedia", () => {
  test("removes exact duplicates, keeps first occurrence", () => {
    const a = item("tmdb", "movie", "27205", "Inception");
    const a2 = item("tmdb", "movie", "27205", "Inception");
    const b = item("tmdb", "tv", "1396", "Breaking Bad");
    expect(dedupeMedia([a, b, a2])).toEqual([a, b]);
  });

  test("same id under different media types is NOT a duplicate", () => {
    const anime = item("anilist", "anime", "21", "One Piece");
    const manga = item("anilist", "manga", "21", "One Piece");
    expect(dedupeMedia([anime, manga])).toHaveLength(2);
  });

  test("same id from different sources is NOT a duplicate", () => {
    const anilist = item("anilist", "manga", "30002", "Berserk");
    const jikan = item("jikan", "manga", "30002", "Berserk");
    expect(dedupeMedia([anilist, jikan])).toHaveLength(2);
  });
});

// ── composeMixedFeed ────────────────────────────────────────────────────────

describe("composeMixedFeed", () => {
  test("balanced mix of all four types with no type dominating", () => {
    const movies = ["m1", "m2", "m3", "m4", "m5"].map((id) => item("tmdb", "movie", id));
    const tv = ["t1", "t2", "t3", "t4", "t5"].map((id) => item("tmdb", "tv", id));
    const anime = ["a1", "a2", "a3", "a4", "a5"].map((id) => item("anilist", "anime", id));
    const manga = ["g1", "g2", "g3", "g4", "g5"].map((id) => item("anilist", "manga", id));

    const out = composeMixedFeed([movies, tv, anime, manga], 20);
    expect(out).toHaveLength(20);

    // First four items are one of each type (round-robin)
    const firstFourTypes = out
      .slice(0, 4)
      .map((m) => m.media_type)
      .sort();
    expect(firstFourTypes).toEqual(["anime", "manga", "movie", "tv"]);

    // Exactly 5 of each type in the full feed
    for (const type of ["movie", "tv", "anime", "manga"] as const) {
      expect(out.filter((m) => m.media_type === type)).toHaveLength(5);
    }
  });

  test("a failed provider doesn't starve the others or shrink the limit", () => {
    const movies = ["m1", "m2", "m3", "m4", "m5", "m6"].map((id) => item("tmdb", "movie", id));
    const tv = ["t1", "t2", "t3", "t4", "t5", "t6"].map((id) => item("tmdb", "tv", id));
    const out = composeMixedFeed([movies, tv, [], []], 20);
    expect(out).toHaveLength(12);
    expect(out[0].media_type).toBe("movie");
    expect(out[1].media_type).toBe("tv");
  });

  test("dedupes duplicates across the composed window", () => {
    const dup = item("tmdb", "movie", "27205");
    const list1 = [dup, item("tmdb", "movie", "2")];
    const list2 = [dup, item("tmdb", "tv", "3")];
    const out = composeMixedFeed([list1, list2], 10);
    expect(out.filter((m) => m.external_id === "27205")).toHaveLength(1);
  });

  test("preserves correct media_type/source so cards link to the right page", () => {
    const out = composeMixedFeed(
      [[item("anilist", "manga", "30002")], [item("jikan", "anime", "5")]],
      10,
    );
    expect(out[0]).toMatchObject({ source: "anilist", media_type: "manga", external_id: "30002" });
    expect(out[1]).toMatchObject({ source: "jikan", media_type: "anime", external_id: "5" });
  });
});

// ── mediaKey ────────────────────────────────────────────────────────────────

describe("mediaKey", () => {
  test("combines source, type, and external id", () => {
    expect(mediaKey(item("tmdb", "movie", "27205"))).toBe("tmdb-movie-27205");
  });
});

// ─── Per-type "All" feeds (Discover) ─────────────────────────────────────────

describe("allFeedWindow", () => {
  test("movie (4 lists): 5-item windows, 4 All pages per sub-ranking page", () => {
    expect(allFeedWindow(4, 1)).toEqual({ subPage: 1, offset: 0, windowSize: 5 });
    expect(allFeedWindow(4, 2)).toEqual({ subPage: 1, offset: 5, windowSize: 5 });
    expect(allFeedWindow(4, 4)).toEqual({ subPage: 1, offset: 15, windowSize: 5 });
    expect(allFeedWindow(4, 5)).toEqual({ subPage: 2, offset: 0, windowSize: 5 });
  });

  test("tv (3 lists): 7-item windows, 2 All pages per sub-ranking page", () => {
    expect(allFeedWindow(3, 1)).toEqual({ subPage: 1, offset: 0, windowSize: 7 });
    expect(allFeedWindow(3, 2)).toEqual({ subPage: 1, offset: 7, windowSize: 7 });
    expect(allFeedWindow(3, 3)).toEqual({ subPage: 2, offset: 0, windowSize: 7 });
  });

  test("anime/manga (2 lists): 10-item windows, 2 All pages per sub-ranking page", () => {
    expect(allFeedWindow(2, 1)).toEqual({ subPage: 1, offset: 0, windowSize: 10 });
    expect(allFeedWindow(2, 2)).toEqual({ subPage: 1, offset: 10, windowSize: 10 });
    expect(allFeedWindow(2, 3)).toEqual({ subPage: 2, offset: 0, windowSize: 10 });
  });
});

describe("per-type All composition", () => {
  /** Same construction mediaAllFeed uses: window each sub-ranking, then
   *  interleave + dedupe + cap. Mirrors the server handler's shape so the
   *  type-purity / balance / dedup guarantees are tested for real. */
  function buildTypeAll(
    media_type: "movie" | "tv" | "anime" | "manga",
    source: MediaSummary["source"],
    listCount: number,
    page: number,
  ): MediaSummary[] {
    const { offset, windowSize } = allFeedWindow(listCount, page);
    const lists = Array.from({ length: listCount }, (_, li) =>
      Array.from({ length: 20 }, (_, i) =>
        item(source, media_type, `l${li}-${i}`, `List ${li} item ${i}`),
      ),
    ).map((list) => list.slice(offset, offset + windowSize));
    return composeMixedFeed(lists, 20);
  }

  test("movie All returns movies only, balanced across its 4 rankings", () => {
    const out = buildTypeAll("movie", "tmdb", 4, 1);
    expect(out).toHaveLength(20);
    expect(out.every((m) => m.media_type === "movie")).toBe(true);
    for (let li = 0; li < 4; li++) {
      expect(out.filter((m) => m.external_id.startsWith(`l${li}-`))).toHaveLength(5);
    }
  });

  test("tv All returns TV only, balanced across its 3 rankings", () => {
    const out = buildTypeAll("tv", "tmdb", 3, 1);
    expect(out).toHaveLength(20);
    expect(out.every((m) => m.media_type === "tv")).toBe(true);
  });

  test("anime All returns anime only, balanced across trending + popular", () => {
    const out = buildTypeAll("anime", "anilist", 2, 1);
    expect(out).toHaveLength(20);
    expect(out.every((m) => m.media_type === "anime")).toBe(true);
    expect(out.filter((m) => m.external_id.startsWith("l0-"))).toHaveLength(10);
    expect(out.filter((m) => m.external_id.startsWith("l1-"))).toHaveLength(10);
  });

  test("manga All returns manga only", () => {
    const out = buildTypeAll("manga", "anilist", 2, 1);
    expect(out).toHaveLength(20);
    expect(out.every((m) => m.media_type === "manga")).toBe(true);
  });

  test("a title appearing in two same-type rankings is deduplicated", () => {
    const popular = [
      item("tmdb", "movie", "shared", "In Theaters"),
      ...Array.from({ length: 9 }, (_, i) => item("tmdb", "movie", `p${i}`)),
    ];
    const topRated = [
      item("tmdb", "movie", "shared", "Also Top Rated"),
      ...Array.from({ length: 9 }, (_, i) => item("tmdb", "movie", `t${i}`)),
    ];
    const out = composeMixedFeed([popular.slice(0, 10), topRated.slice(0, 10)], 20);
    expect(out.filter((m) => m.external_id === "shared")).toHaveLength(1);
    expect(out).toHaveLength(19);
  });
});
