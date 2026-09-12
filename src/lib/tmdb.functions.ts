import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { cached } from "./api-cache";
import type { MediaSummary, MediaType } from "./media-types";
import type { Database } from "@/integrations/supabase/types";

const TMDB_CACHE_TTL = 5 * 60_000; // 5 min — TMDB data (trending/details) barely changes faster

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const TMDB_TIMEOUT = 4_000; // 4s fail-fast timeout when TMDB is unreachable

function placeholderPoster(title: string, variant: "poster" | "backdrop" = "poster") {
  const label = encodeURIComponent(title);
  const size = variant === "backdrop" ? "1600x900" : "500x750";
  return `https://placehold.co/${size}/111827/ffffff?text=${label}`;
}

const FALLBACK_MOVIES: MediaSummary[] = [
  {
    external_id: "27205",
    source: "tmdb",
    media_type: "movie",
    title: "Inception",
    overview: "A skilled thief enters dream worlds to steal secrets and plant ideas.",
    poster_url: placeholderPoster("Inception"),
    backdrop_url: placeholderPoster("Inception", "backdrop"),
    release_year: 2010,
    vote_average: 8.4,
    genres: ["Sci-Fi", "Thriller"],
    runtime: 148,
    season_count: null,
    status: null,
  },
  {
    external_id: "13",
    source: "tmdb",
    media_type: "movie",
    title: "Forrest Gump",
    overview: "The life story of a kind-hearted man who witnesses major historical events.",
    poster_url: placeholderPoster("Forrest Gump"),
    backdrop_url: placeholderPoster("Forrest Gump", "backdrop"),
    release_year: 1994,
    vote_average: 8.5,
    genres: ["Drama", "Romance"],
    runtime: 142,
    season_count: null,
    status: null,
  },
  {
    external_id: "603",
    source: "tmdb",
    media_type: "movie",
    title: "The Matrix",
    overview: "A hacker discovers the true nature of reality and his place in it.",
    poster_url: placeholderPoster("The Matrix"),
    backdrop_url: placeholderPoster("The Matrix", "backdrop"),
    release_year: 1999,
    vote_average: 8.2,
    genres: ["Action", "Sci-Fi"],
    runtime: 136,
    season_count: null,
    status: null,
  },
  {
    external_id: "496243",
    source: "tmdb",
    media_type: "movie",
    title: "Parasite",
    overview:
      "A poor family and a wealthy family become entangled in a darkly comic social satire.",
    poster_url: placeholderPoster("Parasite"),
    backdrop_url: placeholderPoster("Parasite", "backdrop"),
    release_year: 2019,
    vote_average: 8.5,
    genres: ["Drama", "Thriller"],
    runtime: 132,
    season_count: null,
    status: null,
  },
];

const FALLBACK_TV: MediaSummary[] = [
  {
    external_id: "1396",
    source: "tmdb",
    media_type: "tv",
    title: "Breaking Bad",
    overview: "A chemistry teacher turns to crime to secure his family's future.",
    poster_url: placeholderPoster("Breaking Bad"),
    backdrop_url: placeholderPoster("Breaking Bad", "backdrop"),
    release_year: 2008,
    vote_average: 9.5,
    genres: ["Crime", "Drama"],
    runtime: 45,
    season_count: 5,
    status: "Ended",
  },
  {
    external_id: "66732",
    source: "tmdb",
    media_type: "tv",
    title: "Stranger Things",
    overview: "A group of kids uncover supernatural forces in their small town.",
    poster_url: placeholderPoster("Stranger Things"),
    backdrop_url: placeholderPoster("Stranger Things", "backdrop"),
    release_year: 2016,
    vote_average: 8.7,
    genres: ["Sci-Fi", "Drama"],
    runtime: 60,
    season_count: 5,
    status: "Returning Series",
  },
  {
    external_id: "2316",
    source: "tmdb",
    media_type: "tv",
    title: "The Office",
    overview: "A mockumentary about office life at a Dunder Mifflin branch.",
    poster_url: placeholderPoster("The Office"),
    backdrop_url: placeholderPoster("The Office", "backdrop"),
    release_year: 2005,
    vote_average: 8.9,
    genres: ["Comedy", "Mockumentary"],
    runtime: 22,
    season_count: 9,
    status: "Ended",
  },
  {
    external_id: "73586",
    source: "tmdb",
    media_type: "tv",
    title: "Yellowstone",
    overview: "The Dutton family faces conflict over their Montana ranch.",
    poster_url: placeholderPoster("Yellowstone"),
    backdrop_url: placeholderPoster("Yellowstone", "backdrop"),
    release_year: 2018,
    vote_average: 8.3,
    genres: ["Drama", "Western"],
    runtime: 60,
    season_count: 5,
    status: "Returning Series",
  },
];

const FALLBACK_TRENDING: MediaSummary[] = [...FALLBACK_MOVIES, ...FALLBACK_TV];

function fallbackMediaList(type: "movie" | "tv", category?: string): MediaSummary[] {
  // Tag every demo row so the UI can block saving these placeholders —
  // their external_ids are real TMDB ids, which would otherwise let users
  // unknowingly add the wrong title to their library.
  const tag = (rows: MediaSummary[]) => rows.map((r) => ({ ...r, is_fallback: true }));
  if (category === "trending") return tag(FALLBACK_TRENDING);
  return type === "movie" ? tag(FALLBACK_MOVIES) : tag(FALLBACK_TV);
}

function tmdbHeaders(): Record<string, string> {
  const readToken = process.env.TMDB_READ_TOKEN;
  if (readToken)
    return { Authorization: `Bearer ${readToken}`, "Content-Type": "application/json" };
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey)
    throw new Error(
      "TMDB_API_KEY is not configured — add TMDB_API_KEY or TMDB_READ_TOKEN to your .env file.",
    );
  return { "Content-Type": "application/json" };
}

function tmdbUrl(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(TMDB_BASE + path);
  const readToken = process.env.TMDB_READ_TOKEN;
  if (!readToken) {
    const apiKey = process.env.TMDB_API_KEY;
    if (apiKey) url.searchParams.set("api_key", apiKey);
  }
  for (const [k, v] of Object.entries(params))
    if (v !== undefined) url.searchParams.set(k, String(v));
  return url.toString();
}

// ── Circuit breaker ──────────────────────────────────────────────────────────
// When TMDB is unreachable, every request would otherwise burn its full 4s
// timeout. After several consecutive failures, fail fast for a cooldown
// window instead — one bad TMDB minute shouldn't stall every page.

const BREAKER_FAILURE_THRESHOLD = 4;
const BREAKER_COOLDOWN_MS = 30_000;
const breaker = { failures: 0, openUntil: 0 };

function breakerAllowsRequest(): boolean {
  return Date.now() >= breaker.openUntil;
}
function recordSuccess() {
  breaker.failures = 0;
  breaker.openUntil = 0;
}
function recordFailure() {
  breaker.failures++;
  if (breaker.failures >= BREAKER_FAILURE_THRESHOLD) {
    breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    breaker.failures = 0;
  }
}

async function tmdb<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  if (!breakerAllowsRequest()) {
    throw new Error("TMDB temporarily unavailable (circuit open)");
  }
  const key = `tmdb:${path}?${JSON.stringify(params)}`;
  return cached(key, TMDB_CACHE_TTL, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      try {
        controller.abort();
      } catch {
        /* abort() throws if the signal already aborted — nothing to do */
      }
    }, TMDB_TIMEOUT);
    try {
      const res = await fetch(tmdbUrl(path, params), {
        headers: tmdbHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.status === 429) {
        // Honor Retry-After when present (capped) instead of a flat 1s.
        const retryAfterHeader = Number(res.headers.get("retry-after"));
        const retryAfterMs =
          Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
            ? Math.min(retryAfterHeader * 1000, 10_000)
            : 1000;
        await new Promise((r) => setTimeout(r, retryAfterMs));
        // Create a new controller for the retry with its own timeout
        const retryController = new AbortController();
        const retryTimeout = setTimeout(() => {
          try {
            retryController.abort();
          } catch {
            /* abort() throws if the signal already aborted — nothing to do */
          }
        }, TMDB_TIMEOUT);
        try {
          const retry = await fetch(tmdbUrl(path, params), {
            headers: tmdbHeaders(),
            signal: retryController.signal,
          });
          clearTimeout(retryTimeout);
          if (!retry.ok) throw new Error(`TMDB ${retry.status}: ${await retry.text()}`);
          recordSuccess();
          return retry.json() as Promise<T>;
        } catch (retryErr) {
          clearTimeout(retryTimeout);
          throw retryErr;
        }
      }
      if (!res.ok) throw new Error(`TMDB ${res.status}: ${await res.text()}`);
      recordSuccess();
      return res.json() as Promise<T>;
    } catch (err) {
      clearTimeout(timeout);
      recordFailure();
      throw err;
    }
  });
}

function imgUrl(path: string | null | undefined, size = "w342") {
  return path ? `${IMG}/${size}${path}` : null;
}

interface TmdbMovie {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  status?: string;
  seasons?: Array<{
    id: number;
    season_number: number;
    name: string;
    episode_count: number;
    air_date: string | null;
    poster_path: string | null;
    overview: string;
  }>;
}

function toSummary(item: TmdbMovie, type: MediaType): MediaSummary {
  const title = item.title ?? item.name ?? "Untitled";
  const dateStr = item.release_date ?? item.first_air_date;
  const year = dateStr ? parseInt(dateStr.slice(0, 4), 10) : null;
  return {
    external_id: String(item.id),
    source: "tmdb",
    media_type: type,
    title,
    overview: item.overview ?? null,
    poster_url: imgUrl(item.poster_path),
    backdrop_url: imgUrl(item.backdrop_path, "w1280"),
    release_year: Number.isFinite(year as number) ? (year as number) : null,
    vote_average: item.vote_average ?? null,
    genres: item.genres?.map((g) => g.name) ?? [],
    runtime: item.runtime ?? item.episode_run_time?.[0] ?? null,
    season_count: item.number_of_seasons ?? null,
    status: item.status ?? null,
  };
}

// ----- Public server functions -----

export const searchAll = createServerFn({ method: "GET" })
  .validator((input) => z.object({ q: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const [movies, tv] = await Promise.all([
        tmdb<{ results: TmdbMovie[] }>("/search/movie", { query: data.q, include_adult: "false" }),
        tmdb<{ results: TmdbMovie[] }>("/search/tv", { query: data.q, include_adult: "false" }),
      ]);
      return {
        movies: movies.results.slice(0, 12).map((m) => toSummary(m, "movie")),
        tv: tv.results.slice(0, 12).map((m) => toSummary(m, "tv")),
      };
    } catch (error) {
      console.warn("[TMDB] searchAll failed, using fallback media:", error);
      return {
        movies: fallbackMediaList("movie").slice(0, 6),
        tv: fallbackMediaList("tv").slice(0, 6),
      };
    }
  });

export const trending = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        type: z.enum(["movie", "tv", "all"]).default("all"),
        page: z.number().int().min(1).default(1),
        genre: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    try {
      // Trending endpoint doesn't support genre — use discover with popularity sort instead
      if (data.genre && data.type !== "all") {
        const res = await tmdb<{ results: TmdbMovie[] }>(`/discover/${data.type}`, {
          sort_by: "popularity.desc",
          with_genres: data.genre,
          page: data.page,
        });
        return res.results.map((m) => toSummary(m, data.type as "movie" | "tv"));
      }
      const res = await tmdb<{ results: TmdbMovie[] }>(`/trending/${data.type}/week`, {
        page: data.page,
      });
      return res.results.map((m) => {
        const mediaType: MediaType =
          (m as unknown as { media_type?: string }).media_type === "tv"
            ? "tv"
            : data.type === "tv"
              ? "tv"
              : "movie";
        return toSummary(m, mediaType);
      });
    } catch (error) {
      console.warn("[TMDB] trending failed, using fallback media:", error);
      const fallback = fallbackMediaList(data.type === "tv" ? "tv" : "movie", "trending").slice(
        0,
        12,
      );
      return data.genre
        ? fallback.filter((m) => data.genre?.split(",").some((g) => m.genres?.includes(g)))
        : fallback;
    }
  });

export const discover = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        type: z.enum(["movie", "tv"]).default("movie"),
        category: z
          .enum(["popular", "top_rated", "upcoming", "now_playing", "on_the_air"])
          .default("popular"),
        page: z.number().int().min(1).default(1),
        genre: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    try {
      if (data.genre) {
        const sortBy = data.category === "top_rated" ? "vote_count.desc" : "popularity.desc";
        const res = await tmdb<{ results: TmdbMovie[] }>(`/discover/${data.type}`, {
          sort_by: sortBy,
          with_genres: data.genre,
          page: data.page,
        });
        return res.results.map((m) => toSummary(m, data.type));
      }

      let path = `/${data.type}/${data.category}`;
      if (data.type === "tv" && (data.category === "upcoming" || data.category === "now_playing")) {
        path = `/tv/on_the_air`;
      }
      const res = await tmdb<{ results: TmdbMovie[] }>(path, { page: data.page });
      return res.results.map((m) => toSummary(m, data.type));
    } catch (error) {
      console.warn("[TMDB] discover failed, using fallback media:", error);
      return fallbackMediaList(data.type, data.category).slice(0, 12);
    }
  });

export const getDetails = createServerFn({ method: "GET" })
  .validator((input) => z.object({ type: z.enum(["movie", "tv"]), id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    try {
      const item = await tmdb<TmdbMovie>(`/${data.type}/${data.id}`);
      const summary = toSummary(item, data.type);
      const seasons =
        data.type === "tv" && item.seasons
          ? item.seasons
              .filter((s) => s.season_number > 0)
              .map((s) => ({
                season_number: s.season_number,
                name: s.name,
                episode_count: s.episode_count,
                air_date: s.air_date,
                poster_url: imgUrl(s.poster_path),
                overview: s.overview,
              }))
          : [];
      return { summary, seasons };
    } catch (error) {
      console.error("[TMDB] getDetails error:", error);
      throw new Error(
        `Failed to load details: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  });

// Upsert media (and seasons) into cache, return internal media.id
export const cacheMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        type: z.enum(["movie", "tv", "anime", "manga"]),
        external_id: z.string(),
        source: z.enum(["tmdb", "anilist", "jikan", "kitsu"]).default("tmdb"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    // provisionMedia fetches authoritative metadata from the source API and
    // only writes to `media` via the service-role client — the trusted path
    // shared with saveLibraryEntryByExternal.
    const { provisionMedia } = await import("@/lib/media-provision");
    const id = await provisionMedia(data.type, data.source, data.external_id);
    return { id };
  });

// ----- Recommendations -----

export const getRecommendations = createServerFn({ method: "GET" })
  .validator((input) => z.object({ type: z.enum(["movie", "tv"]), id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    try {
      const res = await tmdb<{ results: TmdbMovie[] }>(`/${data.type}/${data.id}/recommendations`);
      return res.results.slice(0, 12).map((m) => toSummary(m, data.type));
    } catch {
      return [] as MediaSummary[];
    }
  });

export const getSimilar = createServerFn({ method: "GET" })
  .validator((input) => z.object({ type: z.enum(["movie", "tv"]), id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    try {
      const res = await tmdb<{ results: TmdbMovie[] }>(`/${data.type}/${data.id}/similar`);
      return res.results.slice(0, 12).map((m) => toSummary(m, data.type));
    } catch {
      return [] as MediaSummary[];
    }
  });

// ----- Cast & crew -----

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export const getCast = createServerFn({ method: "GET" })
  .validator((input) => z.object({ type: z.enum(["movie", "tv"]), id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    try {
      const res = await tmdb<{
        cast: CastMember[];
        crew: { id: number; name: string; job: string }[];
      }>(`/${data.type}/${data.id}/credits`);
      const topCast = (res.cast ?? []).slice(0, 15).map((c) => ({
        ...c,
        profile_path: imgUrl(c.profile_path, "w185"),
      }));
      const director = (res.crew ?? []).find((c) => c.job === "Director");
      return { cast: topCast, director: director?.name ?? null };
    } catch {
      return { cast: [], director: null };
    }
  });

// ----- Reclassify media type -----

export const reclassifyMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        media_id: z.string().uuid(),
        new_type: z.enum(["movie", "tv", "anime", "manga"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("media")
      .update({ media_type: data.new_type as Database["public"]["Enums"]["media_type"] })
      .eq("id", data.media_id);
    if (error) throw new Error("Could not reclassify: " + error.message);
    return { ok: true };
  });

// ----- Genre helpers -----

export interface Genre {
  id: number;
  name: string;
}

export const getGenres = createServerFn({ method: "GET" })
  .validator((input) =>
    z.object({ type: z.enum(["movie", "tv"]).default("movie") }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    try {
      const res = await tmdb<{ genres: Genre[] }>(`/genre/${data.type}/list`);
      return res.genres ?? [];
    } catch {
      return [] as Genre[];
    }
  });

// ----- Video / Trailer helper -----

export const getTrailerKey = createServerFn({ method: "GET" })
  .validator((input) => z.object({ type: z.enum(["movie", "tv"]), id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    try {
      const res = await tmdb<{
        results: Array<{ key: string; site: string; type: string; official?: boolean }>;
      }>(`/${data.type}/${data.id}/videos`);
      const videos = res.results ?? [];
      const trailer =
        videos.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ??
        videos.find((v) => v.site === "YouTube" && v.type === "Trailer") ??
        videos.find((v) => v.site === "YouTube");
      return trailer?.key ?? null;
    } catch {
      return null;
    }
  });

// ----- Export helpers -----

export const getMediaByIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ ids: z.array(z.string().uuid()) }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.ids.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("media")
      .select(
        "id, media_type, source, external_id, title, poster_url, release_year, vote_average, genres",
      )
      .in("id", data.ids);
    if (error) throw error;
    return rows ?? [];
  });
