import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { allFeedWindow, composeMixedFeed } from "./feed-compose";
import { fetchAnimeFeed, fetchMangaFeed } from "./anilist.functions";
import type { MediaSummary } from "./media-types";

/**
 * Balanced mixed-media feed — the Dashboard's "All" option. One page = 20
 * items assembled from four independent ranking lists (5 trending/popular
 * movies + 5 TV + 5 anime + 5 manga), round-robin interleaved so no single
 * type dominates, deduplicated by source+media_type+external_id.
 *
 * Provider failures are isolated: each list is fetched independently with
 * Promise.allSettled and a failed provider simply contributes nothing. The
 * response reports which lists came back empty so the UI can show an
 * unobtrusive partial-results note. NO hard-coded demo rows are ever
 * returned here — empty beats fake.
 *
 * All upstream reads go through the providers' own cached() helpers and the
 * TMDB circuit breaker (tmdb-feed.ts, AniList → Jikan → Kitsu chains in
 * anilist.functions.ts).
 */

// Raw TMDB list fetchers — the same tmdb() helper with circuit breaker,
// cache, and auth as the public server functions, but importable directly
// by this module (it lives in the same server bundle as tmdb.functions.ts).
import {
  fetchTmdbFeed,
  fetchTmdbDiscoverFeed,
  type TmdbFeedKind,
  type TmdbDiscoverSort,
} from "./tmdb-feed";

const PER_TYPE = 5; // items per media type per page → 20 total
const FEED_PAGE_SIZE = PER_TYPE * 4;

export interface MixedFeedResult {
  items: MediaSummary[];
  /** Media types that returned zero rows (provider down or empty) — lets the
   *  UI show "partial results" without inventing data. */
  missing: Array<"movie" | "tv" | "anime" | "manga">;
}

export const mixedFeed = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        /** Ranking mode: trending = momentum, popular = long-term popularity. */
        mode: z.enum(["trending", "popular"]).default("trending"),
        /** 1-based page of the composed 20-item feed. */
        page: z.number().int().min(1).default(1),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const mode: TmdbFeedKind = data.mode;
    // Mixed-feed page N draws each provider's list page ceil(N/2): the four
    // lists together produce 20 items per mixed page, but each provider
    // list holds 20 per page, so every mixed page uses one provider page
    // and provider pages advance every two mixed pages (10 drawn per page).
    const providerPage = Math.ceil(data.page / 2);

    const settled = await Promise.allSettled([
      // Fetch 2× PER_TYPE per provider page so mixed page 2 can window into
      // the second half of the same provider page without a second request.
      fetchTmdbFeed("movie", mode, providerPage, PER_TYPE * 2),
      fetchTmdbFeed("tv", mode, providerPage, PER_TYPE * 2),
      fetchAnimeFeed(mode, providerPage, PER_TYPE * 2),
      fetchMangaFeed(mode, providerPage, PER_TYPE * 2),
    ]);

    const lists: MediaSummary[][] = settled.map((s) => (s.status === "fulfilled" ? s.value : []));

    // For page 2 of the mixed feed, the same provider page has already
    // contributed its first 5 per type — offset into the fetched lists.
    const offset = ((data.page - 1) % 2) * PER_TYPE;
    const windowed = lists.map((list) => list.slice(offset, offset + PER_TYPE));

    const items = composeMixedFeed(windowed, FEED_PAGE_SIZE);
    const missing: MixedFeedResult["missing"] = [];
    if (windowed[0].length === 0) missing.push("movie");
    if (windowed[1].length === 0) missing.push("tv");
    if (windowed[2].length === 0) missing.push("anime");
    if (windowed[3].length === 0) missing.push("manga");

    return { items, missing } satisfies MixedFeedResult;
  });

// ─── Per-type "All" feeds (Discover) ─────────────────────────────────────────
//
// Discover's "All" is BROAD DISCOVERY WITHIN ONE TYPE — never a mix of
// media types. Each 20-item page interleaves windows from several
// same-type rankings so it can't collapse into "Popular" (the #1 entry of
// each ranking leads, and the composition differs from any single list):
//
//   movie: popular + now_playing + upcoming + top_rated (TMDB)
//   tv:    popular + on_the_air + top_rated          (TMDB)
//   anime: TRENDING_DESC + POPULARITY_DESC           (AniList chain)
//   manga: TRENDING_DESC + POPULARITY_DESC           (AniList chain)
//
// Sub-lists are fetched independently (allSettled) — a failed list just
// contributes nothing, and no demo rows are ever returned.

const TMDB_ALL_LISTS: Record<"movie" | "tv", TmdbFeedKind[]> = {
  movie: ["popular", "now_playing", "upcoming", "top_rated"],
  tv: ["popular", "on_the_air", "top_rated"],
};

export const mediaAllFeed = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        /** The ONE media type this feed may contain. */
        type: z.enum(["movie", "tv", "anime", "manga"]),
        /** 1-based page of the composed 20-item feed. */
        page: z.number().int().min(1).default(1),
        /** Comma-separated genre filter — TMDB genre ids for movie/tv
         *  (routed through /discover, since the category endpoints can't
         *  filter) and AniList genre names for anime/manga. */
        genre: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const genreList =
      data.genre
        ?.split(",")
        .map((g) => g.trim())
        .filter(Boolean) ?? [];

    if (data.type === "movie" || data.type === "tv") {
      const tmdbType: "movie" | "tv" = data.type;
      if (genreList.length > 0) {
        // Genres aren't supported by the category endpoints — compose All
        // from /discover with with_genres under three different rankings so
        // it stays broad (and still isn't just Popular under another name).
        const kinds: TmdbDiscoverSort[] = ["popularity", "top_rated", "newest"];
        const { subPage, offset, windowSize } = allFeedWindow(kinds.length, data.page);
        const genreParam = genreList.join(",");
        const settled = await Promise.allSettled(
          kinds.map((k) =>
            fetchTmdbDiscoverFeed(tmdbType, k, subPage, offset + windowSize, genreParam),
          ),
        );
        const windowed = settled.map((s) =>
          s.status === "fulfilled" ? s.value.slice(offset, offset + windowSize) : [],
        );
        return composeMixedFeed(windowed, FEED_PAGE_SIZE);
      }
      const kinds = TMDB_ALL_LISTS[tmdbType];
      const { subPage, offset, windowSize } = allFeedWindow(kinds.length, data.page);
      const settled = await Promise.allSettled(
        kinds.map((kind) => fetchTmdbFeed(tmdbType, kind, subPage, offset + windowSize)),
      );
      const windowed = settled.map((s) =>
        s.status === "fulfilled" ? s.value.slice(offset, offset + windowSize) : [],
      );
      return composeMixedFeed(windowed, FEED_PAGE_SIZE);
    }

    // anime / manga: TRENDING_DESC + POPULARITY_DESC from the AniList chain
    const { subPage, offset, windowSize } = allFeedWindow(2, data.page);
    const perList = offset + windowSize;
    const settled =
      data.type === "anime"
        ? await Promise.allSettled([
            fetchAnimeFeed("trending", subPage, perList, genreList),
            fetchAnimeFeed("popular", subPage, perList, genreList),
          ])
        : await Promise.allSettled([
            fetchMangaFeed("trending", subPage, perList, genreList),
            fetchMangaFeed("popular", subPage, perList, genreList),
          ]);
    const windowed = settled.map((s) =>
      s.status === "fulfilled" ? s.value.slice(offset, offset + windowSize) : [],
    );
    return composeMixedFeed(windowed, FEED_PAGE_SIZE);
  });
