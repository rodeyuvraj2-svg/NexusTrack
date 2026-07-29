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
  { external_id: '21', source: 'anilist', media_type: 'anime', title: 'One Piece', poster_url: placeholderPoster('One Piece'), backdrop_url: placeholderPoster('One Piece', 'backdrop'), release_year: 1999, vote_average: 8.7, genres: ['Adventure', 'Action'], runtime: 24, season_count: 1100, status: 'RELEASING' },
  { external_id: '16498', source: 'anilist', media_type: 'anime', title: 'Attack on Titan', poster_url: placeholderPoster('Attack on Titan'), backdrop_url: placeholderPoster('Attack on Titan', 'backdrop'), release_year: 2013, vote_average: 8.8, genres: ['Action', 'Drama'], runtime: 24, season_count: 100, status: 'FINISHED' },
  { external_id: '1535', source: 'anilist', media_type: 'anime', title: 'Death Note', poster_url: placeholderPoster('Death Note'), backdrop_url: placeholderPoster('Death Note', 'backdrop'), release_year: 2006, vote_average: 8.6, genres: ['Mystery', 'Thriller'], runtime: 23, season_count: 37, status: 'FINISHED' },
  { external_id: '20605', source: 'anilist', media_type: 'anime', title: 'Frieren', poster_url: placeholderPoster('Frieren'), backdrop_url: placeholderPoster('Frieren', 'backdrop'), release_year: 2023, vote_average: 8.9, genres: ['Fantasy', 'Adventure'], runtime: 24, season_count: 28, status: 'RELEASING' },
  { external_id: '101922', source: 'anilist', media_type: 'anime', title: 'Demon Slayer', poster_url: placeholderPoster('Demon Slayer'), backdrop_url: placeholderPoster('Demon Slayer', 'backdrop'), release_year: 2019, vote_average: 8.7, genres: ['Action', 'Fantasy'], runtime: 24, season_count: 63, status: 'FINISHED' },
  { external_id: '113415', source: 'anilist', media_type: 'anime', title: 'Jujutsu Kaisen', poster_url: placeholderPoster('Jujutsu Kaisen'), backdrop_url: placeholderPoster('Jujutsu Kaisen', 'backdrop'), release_year: 2020, vote_average: 8.6, genres: ['Action', 'Fantasy'], runtime: 24, season_count: 47, status: 'FINISHED' },
  { external_id: '11757', source: 'anilist', media_type: 'anime', title: 'Steins;Gate', poster_url: placeholderPoster('Steins;Gate'), backdrop_url: placeholderPoster('Steins;Gate', 'backdrop'), release_year: 2011, vote_average: 9.1, genres: ['Sci-Fi', 'Thriller'], runtime: 24, season_count: 24, status: 'FINISHED' },
  { external_id: '1', source: 'anilist', media_type: 'anime', title: 'Cowboy Bebop', poster_url: placeholderPoster('Cowboy Bebop'), backdrop_url: placeholderPoster('Cowboy Bebop', 'backdrop'), release_year: 1998, vote_average: 8.9, genres: ['Action', 'Sci-Fi'], runtime: 24, season_count: 26, status: 'FINISHED' },
  { external_id: '5114', source: 'anilist', media_type: 'anime', title: 'Fullmetal Alchemist: Brotherhood', poster_url: placeholderPoster('Fullmetal Alchemist'), backdrop_url: placeholderPoster('Fullmetal Alchemist', 'backdrop'), release_year: 2009, vote_average: 9.2, genres: ['Action', 'Fantasy'], runtime: 24, season_count: 64, status: 'FINISHED' },
  { external_id: '20954', source: 'anilist', media_type: 'anime', title: 'Sousou no Frieren', poster_url: placeholderPoster('Sousou no Frieren'), backdrop_url: placeholderPoster('Sousou no Frieren', 'backdrop'), release_year: 2023, vote_average: 9.0, genres: ['Fantasy', 'Adventure'], runtime: 24, season_count: 28, status: 'RELEASING' },
  { external_id: '9253', source: 'anilist', media_type: 'anime', title: 'Steins;Gate 0', poster_url: placeholderPoster('Steins;Gate 0'), backdrop_url: placeholderPoster('Steins;Gate 0', 'backdrop'), release_year: 2018, vote_average: 8.3, genres: ['Sci-Fi', 'Drama'], runtime: 24, season_count: 23, status: 'FINISHED' },
  { external_id: '20755', source: 'anilist', media_type: 'anime', title: 'Spy x Family', poster_url: placeholderPoster('Spy x Family'), backdrop_url: placeholderPoster('Spy x Family', 'backdrop'), release_year: 2022, vote_average: 8.4, genres: ['Action', 'Comedy'], runtime: 24, season_count: 25, status: 'FINISHED' },
  { external_id: '131476', source: 'anilist', media_type: 'anime', title: 'Chainsaw Man', poster_url: placeholderPoster('Chainsaw Man'), backdrop_url: placeholderPoster('Chainsaw Man', 'backdrop'), release_year: 2022, vote_average: 8.4, genres: ['Action', 'Fantasy'], runtime: 24, season_count: 12, status: 'FINISHED' },
  { external_id: '21455', source: 'anilist', media_type: 'anime', title: 'Mob Psycho 100', poster_url: placeholderPoster('Mob Psycho 100'), backdrop_url: placeholderPoster('Mob Psycho 100', 'backdrop'), release_year: 2016, vote_average: 8.7, genres: ['Action', 'Comedy'], runtime: 24, season_count: 25, status: 'FINISHED' },
  { external_id: '11061', source: 'anilist', media_type: 'anime', title: 'Hunter x Hunter', poster_url: placeholderPoster('Hunter x Hunter'), backdrop_url: placeholderPoster('Hunter x Hunter', 'backdrop'), release_year: 2011, vote_average: 8.9, genres: ['Action', 'Adventure'], runtime: 24, season_count: 148, status: 'FINISHED' },
  { external_id: '22961', source: 'anilist', media_type: 'anime', title: 'Vinland Saga', poster_url: placeholderPoster('Vinland Saga'), backdrop_url: placeholderPoster('Vinland Saga', 'backdrop'), release_year: 2019, vote_average: 8.7, genres: ['Action', 'Drama'], runtime: 24, season_count: 24, status: 'FINISHED' },
  { external_id: '21592', source: 'anilist', media_type: 'anime', title: 'Violet Evergarden', poster_url: placeholderPoster('Violet Evergarden'), backdrop_url: placeholderPoster('Violet Evergarden', 'backdrop'), release_year: 2018, vote_average: 8.7, genres: ['Drama', 'Fantasy'], runtime: 24, season_count: 13, status: 'FINISHED' },
  { external_id: '15017', source: 'anilist', media_type: 'anime', title: 'Haikyuu!!', poster_url: placeholderPoster('Haikyuu'), backdrop_url: placeholderPoster('Haikyuu', 'backdrop'), release_year: 2014, vote_average: 8.5, genres: ['Sports', 'Comedy'], runtime: 24, season_count: 25, status: 'FINISHED' },
  { external_id: '21519', source: 'anilist', media_type: 'anime', title: 'Kaguya-sama: Love Is War', poster_url: placeholderPoster('Kaguya-sama'), backdrop_url: placeholderPoster('Kaguya-sama', 'backdrop'), release_year: 2019, vote_average: 8.3, genres: ['Comedy', 'Romance'], runtime: 24, season_count: 12, status: 'FINISHED' },
  { external_id: '120209', source: 'anilist', media_type: 'anime', title: 'Dandadan', poster_url: placeholderPoster('Dandadan'), backdrop_url: placeholderPoster('Dandadan', 'backdrop'), release_year: 2024, vote_average: 8.3, genres: ['Action', 'Comedy'], runtime: 24, season_count: 12, status: 'FINISHED' },
];

const FALLBACK_MANGA: MediaSummary[] = [
  { external_id: '30010', source: 'anilist', media_type: 'manga', title: 'One Piece', poster_url: placeholderPoster('One Piece Manga'), backdrop_url: placeholderPoster('One Piece Manga', 'backdrop'), release_year: 1997, vote_average: 8.5, genres: ['Adventure', 'Action'], chapter_count: 1100, volume_count: 100, status: 'RELEASING' },
  { external_id: '100100', source: 'anilist', media_type: 'manga', title: 'Berserk', poster_url: placeholderPoster('Berserk'), backdrop_url: placeholderPoster('Berserk', 'backdrop'), release_year: 1989, vote_average: 9.1, genres: ['Action', 'Fantasy'], chapter_count: 370, volume_count: 40, status: 'RELEASING' },
  { external_id: '101200', source: 'anilist', media_type: 'manga', title: 'Attack on Titan Manga', poster_url: placeholderPoster('AoT Manga'), backdrop_url: placeholderPoster('AoT Manga', 'backdrop'), release_year: 2009, vote_average: 8.7, genres: ['Action', 'Drama'], chapter_count: 139, volume_count: 34, status: 'FINISHED' },
  { external_id: '30015', source: 'anilist', media_type: 'manga', title: 'Vagabond', poster_url: placeholderPoster('Vagabond'), backdrop_url: placeholderPoster('Vagabond', 'backdrop'), release_year: 1998, vote_average: 9.0, genres: ['Action', 'Drama'], chapter_count: 327, volume_count: 37, status: 'RELEASING' },
  { external_id: '30020', source: 'anilist', media_type: 'manga', title: 'Monster', poster_url: placeholderPoster('Monster'), backdrop_url: placeholderPoster('Monster', 'backdrop'), release_year: 1994, vote_average: 9.0, genres: ['Mystery', 'Thriller'], chapter_count: 162, volume_count: 18, status: 'FINISHED' },
  { external_id: '102001', source: 'anilist', media_type: 'manga', title: 'Goodbye, Eri', poster_url: placeholderPoster('Goodbye Eri'), backdrop_url: placeholderPoster('Goodbye Eri', 'backdrop'), release_year: 2022, vote_average: 8.5, genres: ['Drama', 'Mystery'], chapter_count: 1, volume_count: 1, status: 'FINISHED' },
  { external_id: '30030', source: 'anilist', media_type: 'manga', title: '20th Century Boys', poster_url: placeholderPoster('20th Century Boys'), backdrop_url: placeholderPoster('20th Century Boys', 'backdrop'), release_year: 1999, vote_average: 8.8, genres: ['Mystery', 'Sci-Fi'], chapter_count: 249, volume_count: 22, status: 'FINISHED' },
  { external_id: '30040', source: 'anilist', media_type: 'manga', title: 'Pluto', poster_url: placeholderPoster('Pluto'), backdrop_url: placeholderPoster('Pluto', 'backdrop'), release_year: 2003, vote_average: 8.7, genres: ['Mystery', 'Sci-Fi'], chapter_count: 65, volume_count: 8, status: 'FINISHED' },
  { external_id: '30050', source: 'anilist', media_type: 'manga', title: 'Kingdom', poster_url: placeholderPoster('Kingdom'), backdrop_url: placeholderPoster('Kingdom', 'backdrop'), release_year: 2006, vote_average: 8.8, genres: ['Action', 'Drama'], chapter_count: 770, volume_count: 70, status: 'RELEASING' },
  { external_id: '30060', source: 'anilist', media_type: 'manga', title: 'Oyasumi Punpun', poster_url: placeholderPoster('Oyasumi Punpun'), backdrop_url: placeholderPoster('Oyasumi Punpun', 'backdrop'), release_year: 2007, vote_average: 8.6, genres: ['Drama', 'Slice of Life'], chapter_count: 147, volume_count: 13, status: 'FINISHED' },
  { external_id: '30070', source: 'anilist', media_type: 'manga', title: 'Slam Dunk', poster_url: placeholderPoster('Slam Dunk'), backdrop_url: placeholderPoster('Slam Dunk', 'backdrop'), release_year: 1990, vote_average: 8.6, genres: ['Sports', 'Drama'], chapter_count: 276, volume_count: 31, status: 'FINISHED' },
  { external_id: '30080', source: 'anilist', media_type: 'manga', title: 'Jujutsu Kaisen Manga', poster_url: placeholderPoster('JJK Manga'), backdrop_url: placeholderPoster('JJK Manga', 'backdrop'), release_year: 2018, vote_average: 8.4, genres: ['Action', 'Fantasy'], chapter_count: 270, volume_count: 28, status: 'RELEASING' },
  { external_id: '30090', source: 'anilist', media_type: 'manga', title: 'Chainsaw Man Manga', poster_url: placeholderPoster('CSM Manga'), backdrop_url: placeholderPoster('CSM Manga', 'backdrop'), release_year: 2018, vote_average: 8.5, genres: ['Action', 'Fantasy'], chapter_count: 190, volume_count: 20, status: 'RELEASING' },
  { external_id: '30100', source: 'anilist', media_type: 'manga', title: 'Demon Slayer Manga', poster_url: placeholderPoster('DS Manga'), backdrop_url: placeholderPoster('DS Manga', 'backdrop'), release_year: 2016, vote_average: 8.3, genres: ['Action', 'Fantasy'], chapter_count: 205, volume_count: 23, status: 'FINISHED' },
  { external_id: '30110', source: 'anilist', media_type: 'manga', title: 'Fullmetal Alchemist Manga', poster_url: placeholderPoster('FMA Manga'), backdrop_url: placeholderPoster('FMA Manga', 'backdrop'), release_year: 2001, vote_average: 8.9, genres: ['Action', 'Fantasy'], chapter_count: 108, volume_count: 27, status: 'FINISHED' },
  { external_id: '30120', source: 'anilist', media_type: 'manga', title: 'Death Note Manga', poster_url: placeholderPoster('DN Manga'), backdrop_url: placeholderPoster('DN Manga', 'backdrop'), release_year: 2003, vote_average: 8.6, genres: ['Mystery', 'Thriller'], chapter_count: 108, volume_count: 12, status: 'FINISHED' },
  { external_id: '30130', source: 'anilist', media_type: 'manga', title: 'Hunter x Hunter Manga', poster_url: placeholderPoster('HxH Manga'), backdrop_url: placeholderPoster('HxH Manga', 'backdrop'), release_year: 1998, vote_average: 8.5, genres: ['Action', 'Adventure'], chapter_count: 410, volume_count: 37, status: 'RELEASING' },
  { external_id: '30140', source: 'anilist', media_type: 'manga', title: 'Haikyuu!! Manga', poster_url: placeholderPoster('Haikyuu Manga'), backdrop_url: placeholderPoster('Haikyuu Manga', 'backdrop'), release_year: 2012, vote_average: 8.4, genres: ['Sports', 'Comedy'], chapter_count: 402, volume_count: 45, status: 'FINISHED' },
  { external_id: '30150', source: 'anilist', media_type: 'manga', title: 'Kaguya-sama Manga', poster_url: placeholderPoster('Kaguya Manga'), backdrop_url: placeholderPoster('Kaguya Manga', 'backdrop'), release_year: 2015, vote_average: 8.3, genres: ['Comedy', 'Romance'], chapter_count: 281, volume_count: 28, status: 'FINISHED' },
  { external_id: '30160', source: 'anilist', media_type: 'manga', title: 'Spy x Family Manga', poster_url: placeholderPoster('SxF Manga'), backdrop_url: placeholderPoster('SxF Manga', 'backdrop'), release_year: 2019, vote_average: 8.2, genres: ['Action', 'Comedy'], chapter_count: 105, volume_count: 14, status: 'RELEASING' },
];

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
  chapters?: number | null;
  volumes?: number | null;
  isAdult?: boolean | null;
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
        chapters?: number | null;
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

const ANILIST_TIMEOUT = 3_000; // 3 seconds — fallback kicks in fast if AniList is slow

// ---- GraphQL helper ----

async function anilist<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  async function fetchWithTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      return res;
    } finally {
      clearTimeout(id);
    }
  }

  const res = await fetchWithTimeout(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  }, ANILIST_TIMEOUT);

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? 1);
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 3) * 1000));
    const retry = await fetchWithTimeout(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
    }, ANILIST_TIMEOUT);
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

function toMangaSummary(a: AniListMedia): MediaSummary {
  const title = a.title?.english || a.title?.romaji || a.title?.native || "Unknown";
  return {
    external_id: String(a.id),
    source: "anilist",
    media_type: "manga",
    title,
    overview: a.description?.replace(/<[^>]*>/g, "") ?? null,
    poster_url: a.coverImage?.extraLarge || a.coverImage?.large || null,
    backdrop_url: a.bannerImage || null,
    release_year: a.seasonYear ?? null,
    vote_average: a.averageScore ? a.averageScore / 10 : null,
    genres: a.genres ?? [],
    chapter_count: a.chapters ?? null,
    volume_count: a.volumes ?? null,
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
            media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
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
      console.warn('[AniList] searchAnime failed:', error);
      return [];
    }
  });

export const topAnime = createServerFn({ method: "GET" })
  .validator((input) => z.object({
    page: z.number().int().min(1).default(1),
    genre: z.string().optional(),
    sort: z.enum(["trending", "popular"]).default("popular"),
  }).parse(input ?? {}))
  .handler(async ({ data }) => {
    try {
      const genreList = data.genre ? data.genre.split(",").map((g) => g.trim()).filter(Boolean) : [];
      const sortOrder = data.sort === "trending" ? "TRENDING_DESC" : "POPULARITY_DESC";
      const result = await anilist<{ Page: { media: AniListMedia[] } }>(
        `query ($page: Int, $genreIn: [String]) {
          Page(page: $page, perPage: 20) {
            media(sort: ${sortOrder}, type: ANIME, genre_in: $genreIn, isAdult: false) {
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
      console.warn('[AniList] topAnime failed:', error);
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
              media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, genre_in: $genreIn, isAdult: false) {
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
              media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, genre_in: $genreIn, isAdult: false) {
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
          media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, genre_in: $genreIn, isAdult: false) {
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
    console.warn('[AniList] seasonalAnime failed:', error);
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
            isAdult
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
            media(id_in: $ids, type: ANIME, isAdult: false) {
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

// ---- Manga --------

export const searchManga = createServerFn({ method: "GET" })
  .validator((input) => z.object({ q: z.string() }).parse(input))
  .handler(async ({ data }) => {
    try {
      const result = await anilist<{ Page: { media: AniListMedia[] } }>(
        `query ($q: String) {
          Page(page: 1, perPage: 20) {
            media(search: $q, type: MANGA, sort: SEARCH_MATCH, isAdult: false) {
              id
              title { romaji english }
              coverImage { extraLarge large }
              bannerImage
              averageScore
              chapters
              volumes
              status
              genres
              seasonYear
              description
            }
          }
        }`,
        { q: data.q }
      );
      return (result.Page.media ?? []).map(toMangaSummary);
    } catch (error) {
      console.warn('[AniList] searchManga failed:', error);
      return [];
    }
  });

export const topManga = createServerFn({ method: "GET" })
  .validator((input) => z.object({
    page: z.number().int().min(1).default(1),
    genre: z.string().optional(),
    type: z.enum(["top", "popular"]).default("popular"),
  }).parse(input ?? {}))
  .handler(async ({ data }) => {
    try {
      const genreList = data.genre ? data.genre.split(",").map((g) => g.trim()).filter(Boolean) : [];
      const sort = data.type === "top" ? "SCORE_DESC" : "POPULARITY_DESC";
      const perPage = data.type === "top" ? 20 : 40;
      const result = await anilist<{ Page: { media: AniListMedia[] } }>(
        `query ($page: Int, $genreIn: [String]) {
          Page(page: $page, perPage: ${perPage}) {
            media(sort: ${sort}, type: MANGA, genre_in: $genreIn, isAdult: false) {
              id
              title { romaji english }
              coverImage { extraLarge large }
              bannerImage
              averageScore
              chapters
              volumes
              status
              genres
              seasonYear
              description
            }
          }
        }`,
        { page: data.page, genreIn: genreList.length > 0 ? genreList : undefined },
      );
      return (result.Page.media ?? []).map(toMangaSummary);
    } catch (error) {
      console.warn('[AniList] topManga failed:', error);
      return FALLBACK_MANGA.slice(0, 20);
    }
  });

export const getMangaDetails = createServerFn({ method: "GET" })
  .validator((input) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    try {
      const result = await anilist<{ Media: AniListMedia }>(
        `query ($id: Int) {
          Media(id: $id, type: MANGA) {
            id
            title { romaji english native }
            description
            coverImage { extraLarge large }
            bannerImage
            averageScore
            chapters
            volumes
            status
            genres
            format
            seasonYear
            source(version: 2)
            popularity
            relations {
              edges {
                relationType(version: 2)
                node {
                  id
                  title { romaji english }
                  format
                  chapters
                  coverImage { large }
                }
              }
            }
          }
        }`,
        { id: Number(data.id) },
      );
      const a = result.Media;
      const MANGA_FORMATS = new Set(["MANGA", "ONE_SHOT", "NOVEL", "DOUJIN"]);
      const relations = (a.relations?.edges ?? [])
        .filter((edge) => MANGA_FORMATS.has(edge.node.format ?? ""))
        .map((edge) => ({
          relation: edge.relationType,
          entries: [{
            mal_id: edge.node.id,
            name: edge.node.title.english || edge.node.title.romaji || "",
            type: "manga",
            poster_url: edge.node.coverImage.large || null,
            chapters: edge.node.chapters ?? null,
            format: edge.node.format ?? null,
          }],
        }));
      return {
        summary: toMangaSummary(a),
        extra: { relations, chapters: a.chapters ?? null, volumes: a.volumes ?? null },
      };
    } catch (error) {
      console.warn('[AniList] getMangaDetails failed:', error);
      return { summary: FALLBACK_MANGA[0], extra: null };
    }
  });

export const getMultipleMangaDetails = createServerFn({ method: "GET" })
  .validator((input) => z.object({ ids: z.array(z.number()) }).parse(input))
  .handler(async ({ data }) => {
    const results: Array<{ mal_id: number; title: string; year: number | null; images: { jpg: { large_image_url: string | null; image_url: string | null } } | null; relation?: string }> = [];
    for (const mid of data.ids.slice(0, 8)) {
      try {
        const r = await anilist<{ Media: AniListMedia }>(
          `query ($id: Int) { Media(id: $id, type: MANGA) { id title { romaji english } coverImage { extraLarge large } seasonYear format } }`,
          { id: mid },
        );
        const a = r.Media;
        results.push({
          mal_id: a.id,
          title: a.title.english || a.title.romaji || "",
          year: a.seasonYear ?? null,
          images: { jpg: { large_image_url: a.coverImage?.extraLarge ?? null, image_url: a.coverImage?.large ?? null } },
        });
      } catch { /* skip failed */ }
    }
    return results;
  });
