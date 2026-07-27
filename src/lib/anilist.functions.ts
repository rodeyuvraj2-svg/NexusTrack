import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { MediaSummary } from "./media-types";

// ---- AniList GraphQL endpoint ----
const ANILIST_URL = "https://graphql.anilist.co";
function placeholderPoster(title: string, variant: 'poster' | 'backdrop' = 'poster') {
  const label = encodeURIComponent(title);
  const size = variant === 'backdrop' ? '1600x900' : '500x750';
  return `https://placehold.co/${size}/111827/ffffff?text=${label}`;
}

const FALLBACK_ANIME: MediaSummary[] = [
  { external_id: '21', source: 'anilist', media_type: 'anime', title: 'One Piece', overview: 'A young pirate sets sail to become the King of the Pirates.', poster_url: placeholderPoster('One Piece'), backdrop_url: placeholderPoster('One Piece', 'backdrop'), release_year: 1999, vote_average: 8.7, genres: ['Adventure', 'Action'], runtime: 24, season_count: 1100, status: 'RELEASING' },
  { external_id: '16498', source: 'anilist', media_type: 'anime', title: 'Attack on Titan', overview: 'Humanity fights for survival against giant humanoid creatures.', poster_url: placeholderPoster('Attack on Titan'), backdrop_url: placeholderPoster('Attack on Titan', 'backdrop'), release_year: 2013, vote_average: 8.8, genres: ['Action', 'Drama'], runtime: 24, season_count: 100, status: 'FINISHED' },
  { external_id: '1535', source: 'anilist', media_type: 'anime', title: 'Death Note', overview: 'A gifted student discovers a notebook that can kill anyone whose name is written in it.', poster_url: placeholderPoster('Death Note'), backdrop_url: placeholderPoster('Death Note', 'backdrop'), release_year: 2006, vote_average: 8.6, genres: ['Mystery', 'Thriller'], runtime: 23, season_count: 37, status: 'FINISHED' },
  { external_id: '20605', source: 'anilist', media_type: 'anime', title: 'Frieren', overview: 'An elf mage journeys through a fantasy world after a long quest.', poster_url: placeholderPoster('Frieren'), backdrop_url: placeholderPoster('Frieren', 'backdrop'), release_year: 2023, vote_average: 8.9, genres: ['Fantasy', 'Adventure'], runtime: 24, season_count: 28, status: 'RELEASING' },
];
// ---- Types ----

interface AniListMedia {
  id: number;
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  };
  description?: string | null;
  coverImage: {
    extraLarge?: string | null;
    large?: string | null;
    medium?: string | null;
  };
  bannerImage?: string | null;
  averageScore?: number | null;
  episodes?: number | null;
  duration?: number | null;
  status?: string | null;
  genres?: string[];
  format?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  source?: string | null;
  popularity?: number | null;
  studios?: { nodes: { name: string }[] };
  relations?: {
    edges: Array<{
      relationType: string;
      node: {
        id: number;
        title: { romaji: string | null; english: string | null };
        format: string | null;
        episodes: number | null;
        coverImage: { large: string | null };
      };
    }>;
  };
  recommendations?: {
    nodes: Array<{
      mediaRecommendation: {
        id: number;
        title: { romaji: string | null; english: string | null };
        coverImage: { large: string | null };
      } | null;
    }>;
  };
}

// ---- GraphQL helper ----

async function anilist<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? 1);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    const retry = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!retry.ok) throw new Error(`AniList rate limited: ${retry.status}`);
    const json = (await retry.json()) as { data: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(`AniList GraphQL error: ${json.errors[0].message}`);
    return json.data;
  }

  if (!res.ok) throw new Error(`AniList ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`AniList GraphQL error: ${json.errors[0].message}`);
  return json.data;
}

// ---- Helpers ----

function toSummary(a: AniListMedia): MediaSummary {
  const title = a.title.english || a.title.romaji || "Untitled";
  const poster = a.coverImage.extraLarge || a.coverImage.large || a.coverImage.medium || null;
  return {
    external_id: String(a.id),
    source: "anilist",
    media_type: "anime",
    title,
    overview: a.description ? a.description.replace(/<[^>]*>/g, "") : null,
    poster_url: poster,
    backdrop_url: a.bannerImage || poster,
    release_year: a.seasonYear ?? null,
    vote_average: a.averageScore ? a.averageScore / 10 : null,
    genres: a.genres ?? [],
    runtime: a.duration ?? null,
    season_count: a.episodes ?? null,
    status: a.status ?? null,
  };
}

// ---- Server Functions ----

export const searchAnime = createServerFn({ method: "GET" })
  .validator((input) => z.object({ q: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const result = await anilist<{ Page: { media: AniListMedia[] } }>(
        `query ($search: String) {
          Page(page: 1, perPage: 20) {
            media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
              id
              title { romaji english native }
              description
              coverImage { extraLarge large medium }
              bannerImage
              averageScore
              episodes
              status
              genres
              seasonYear
              format
            }
          }
        }`,
        { search: data.q },
      );
      return (result.Page.media ?? []).map(toSummary);
    } catch (error) {
      console.warn('[AniList] searchAnime failed, using fallback anime:', error);
      return FALLBACK_ANIME.slice(0, 6);
    }
  });

export const topAnime = createServerFn({ method: "GET" })
  .validator((input) => z.object({
    page: z.number().int().min(1).default(1),
    genre: z.string().optional(),
  }).parse(input ?? {}))
  .handler(async ({ data }) => {
    try {
      const genreList = data.genre ? data.genre.split(",").map((g) => g.trim()).filter(Boolean) : [];
      const result = await anilist<{ Page: { media: AniListMedia[] } }>(
        `query ($page: Int, $genreIn: [String]) {
          Page(page: $page, perPage: 20) {
            media(sort: POPULARITY_DESC, type: ANIME, genre_in: $genreIn) {
              id
              title { romaji english }
              coverImage { extraLarge large }
              bannerImage
              averageScore
              episodes
              status
              genres
              seasonYear
            }
          }
        }`,
        { page: data.page, genreIn: genreList.length > 0 ? genreList : undefined },
      );
      return (result.Page.media ?? []).map(toSummary);
    } catch (error) {
      console.warn('[AniList] topAnime failed, using fallback anime:', error);
      return FALLBACK_ANIME.slice(0, 6);
    }
  });

export const seasonalAnime = createServerFn({ method: "GET" })
  .validator((input) => z.object({
    page: z.number().int().min(1).default(1),
    genre: z.string().optional(),
  }).parse(input ?? {}))
  .handler(async ({ data }) => {
  try {
    const genreList = data.genre ? data.genre.split(",").map((g) => g.trim()).filter(Boolean) : [];
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    // Determine current and previous season
    const seasons = ["WINTER", "SPRING", "SUMMER", "FALL"] as const;
    const currentSeasonIdx = month < 3 ? 0 : month < 6 ? 1 : month < 9 ? 2 : 3;
    const currentSeason = seasons[currentSeasonIdx];
    const prevIdx = currentSeasonIdx === 0 ? 3 : currentSeasonIdx - 1;
    const prevSeason = seasons[prevIdx];
    const prevYear = currentSeasonIdx === 0 ? year - 1 : year;

    if (data.page === 1) {
      // Page 1: combine current season (20) + previous season (10)
      const genreVars = genreList.length > 0 ? { genreIn: genreList } : {};
      const [currentRes, prevRes] = await Promise.allSettled([
        anilist<{ Page: { media: AniListMedia[] } }>(
          `query ($season: MediaSeason, $year: Int, $genreIn: [String]) {
            Page(page: 1, perPage: 20) {
              media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, genre_in: $genreIn) {
                id
                title { romaji english }
                coverImage { extraLarge large }
                bannerImage
                averageScore
                episodes
                status
                genres
                seasonYear
              }
            }
          }`,
          { season: currentSeason, year, ...genreVars },
        ),
        anilist<{ Page: { media: AniListMedia[] } }>(
          `query ($season: MediaSeason, $year: Int, $genreIn: [String]) {
            Page(page: 1, perPage: 10) {
              media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, genre_in: $genreIn) {
                id
                title { romaji english }
                coverImage { extraLarge large }
                bannerImage
                averageScore
                episodes
                status
                genres
                seasonYear
              }
            }
          }`,
          { season: prevSeason, year: prevYear, ...genreVars },
        ),
      ]);

      const current = currentRes.status === "fulfilled" ? currentRes.value.Page.media ?? [] : [];
      const prev = prevRes.status === "fulfilled" ? prevRes.value.Page.media ?? [] : [];

      // Combine, deduplicate by ID
      const seen = new Set<number>();
      return [...current, ...prev].filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      }).map(toSummary);
    }

    // Page 2+: fetch more from current season
    const result = await anilist<{ Page: { media: AniListMedia[] } }>(
      `query ($season: MediaSeason, $year: Int, $page: Int, $genreIn: [String]) {
        Page(page: $page, perPage: 20) {
          media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, genre_in: $genreIn) {
            id
            title { romaji english }
            coverImage { extraLarge large }
            bannerImage
            averageScore
            episodes
            status
            genres
            seasonYear
          }
        }
      }`,
      { season: currentSeason, year, page: data.page, genreIn: genreList.length > 0 ? genreList : undefined },
    );
    return (result.Page.media ?? []).map(toSummary);
  } catch (error) {
    console.warn('[AniList] seasonalAnime failed, using fallback anime:', error);
    return FALLBACK_ANIME.slice(0, 6);
  }
});

export const getAnimeDetails = createServerFn({ method: "GET" })
  .validator((input) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    try {
      const result = await anilist<{ Media: AniListMedia }>(
        `query ($id: Int) {
          Media(id: $id, type: ANIME) {
            id
            title { romaji english native }
            description
            coverImage { extraLarge large }
            bannerImage
            averageScore
            episodes
            duration
            status
            genres
            format
            season
            seasonYear
            source
            popularity
            studios { nodes { name } }
            relations {
              edges {
                relationType(version: 2)
                node {
                  id
                  title { romaji english }
                  format
                  episodes
                  coverImage { large }
                }
              }
            }
          }
        }`,
        { id: Number(data.id) },
      );

      const a = result.Media;

      // Build relations — filter to ANIME-format entries only
      const ANIME_FORMATS = new Set(["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"]);
      const relations = (a.relations?.edges ?? [])
        .filter((edge) => ANIME_FORMATS.has(edge.node.format ?? ""))
        .map((edge) => ({
          relation: edge.relationType,
          entries: [
            {
              mal_id: edge.node.id, // reuse field name for compat
              name: edge.node.title.english || edge.node.title.romaji || "",
              type: "anime",
              poster_url: edge.node.coverImage.large || null,
              episodes: edge.node.episodes ?? null,
              format: edge.node.format ?? null,
            },
          ],
        }));

      return {
        summary: toSummary(a),
        extra: {
          studios: a.studios?.nodes.map((s) => s.name) ?? [],
          episodes: a.episodes ?? null,
          rating: null,
          duration: a.duration ? `${a.duration} min per ep` : null,
          source: a.source ?? null,
          format: a.format ?? null,
          season: a.season ?? null,
          seasonYear: a.seasonYear ?? null,
          relations,
        },
      };
    } catch (error) {
      console.error("[AniList] getAnimeDetails error:", error);
      throw new Error(`Failed to load anime details: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  });

/**
 * Fetch details for multiple anime by AniList ID (in one batch GraphQL call).
 * Used to build franchise / relation views.
 */
export const getMultipleAnimeDetails = createServerFn({ method: "GET" })
  .validator((input) => z.object({ ids: z.array(z.string()) }).parse(input))
  .handler(async ({ data }) => {
    const ids = data.ids.slice(0, 12).map(Number).filter(Boolean);
    if (ids.length === 0) return [];

    try {
      // AniList supports fetching multiple via Page filter
      const result = await anilist<{ Page: { media: AniListMedia[] } }>(
        `query ($ids: [Int]) {
          Page(page: 1, perPage: 12) {
            media(id_in: $ids, type: ANIME) {
              id
              title { romaji english }
              description
              coverImage { extraLarge large }
              bannerImage
              averageScore
              episodes
              status
              genres
              seasonYear
              format
            }
          }
        }`,
        { ids },
      );

      return (result.Page.media ?? []).map((a) => ({
        mal_id: a.id,
        title: a.title.english || a.title.romaji || "Untitled",
        title_english: a.title.english,
        synopsis: a.description ? a.description.replace(/<[^>]*>/g, "") : null,
        images: {
          jpg: {
            image_url: a.coverImage.large || "",
            large_image_url: a.coverImage.extraLarge || a.coverImage.large || "",
          },
        },
        episodes: a.episodes ?? null,
        status: a.status ?? null,
        type: "anime",
        year: a.seasonYear ?? null,
        score: a.averageScore ? a.averageScore / 10 : null,
        genres: (a.genres ?? []).map((g) => ({ name: g })),
      }));
    } catch (error) {
      console.error("[AniList] getMultipleAnimeDetails error:", error);
      return [];
    }
  });
