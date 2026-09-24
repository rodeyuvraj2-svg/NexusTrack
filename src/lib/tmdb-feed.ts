// SERVER-ONLY helper module (no "use client", no createServerFn — imported
// only by server-function handlers such as feed.functions.ts). Exposes raw
// TMDB list fetching with the same circuit breaker, cached() TTL cache, and
// auth handling as tmdb.functions.ts, without wrapping each call in a
// client-callable server function.

import { cached } from "./api-cache";
import type { MediaSummary, MediaType } from "./media-types";

const TMDB_CACHE_TTL = 5 * 60_000; // same TTL as tmdb.functions.ts

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_TIMEOUT = 4_000;

export type TmdbFeedKind =
  | "trending"
  | "popular"
  | "top_rated"
  | "now_playing"
  | "upcoming"
  | "on_the_air";

// ── Auth (mirrors tmdb.functions.ts) ────────────────────────────────────────

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

// ── Circuit breaker (same policy as tmdb.functions.ts) ──────────────────────

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

// Same key format as tmdb.functions.ts so both modules share cache entries.
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
    const timeout = setTimeout(() => controller.abort(), TMDB_TIMEOUT);
    try {
      const res = await fetch(tmdbUrl(path, params), {
        headers: tmdbHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timeout);
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

// ── Response shape + summary mapping (subset of TmdbMovie fields) ───────────

interface TmdbListItem {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
  media_type?: string;
}

function imgUrl(path: string | null | undefined, size = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

function toSummary(item: TmdbListItem, type: MediaType): MediaSummary {
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
    genres: [],
    season_count: null,
    status: null,
  };
}

/**
 * Raw TMDB ranking list for feed composition. trending → /trending/{type}/week,
 * popular → /{type}/popular, plus the category lists per-type "All" feeds are
 * built from (now_playing/upcoming for movies, on_the_air for TV).
 * Returns [] on failure — composed feeds show the healthy lists' results
 * instead of failing (and never demo rows).
 */
export async function fetchTmdbFeed(
  type: "movie" | "tv",
  kind: TmdbFeedKind,
  page: number,
  limit: number,
): Promise<MediaSummary[]> {
  try {
    const path =
      kind === "trending"
        ? `/trending/${type}/week`
        : kind === "on_the_air"
          ? "/tv/on_the_air"
          : kind === "now_playing"
            ? "/movie/now_playing"
            : kind === "upcoming"
              ? "/movie/upcoming"
              : `/${type}/${kind}`;
    const res = await tmdb<{ results: TmdbListItem[] }>(path, { page });
    return (res.results ?? []).slice(0, limit).map((m) => toSummary(m, type));
  } catch (error) {
    console.warn(`[TMDB] fetchTmdbFeed(${type}/${kind}) failed:`, error);
    return [];
  }
}

/**
 * /discover/{type} list with genre filtering — the genre-capable stand-in
 * for the category endpoints (which don't accept with_genres). `top_rated`
 * adds a minimum-vote-count floor so obscure titles with a handful of 10/10
 * ratings can't dominate; `newest` sorts by release date up to today.
 * Returns [] on failure (same no-demo-rows rule as fetchTmdbFeed).
 */
export type TmdbDiscoverSort = "popularity" | "top_rated" | "newest";

export async function fetchTmdbDiscoverFeed(
  type: "movie" | "tv",
  sort: TmdbDiscoverSort,
  page: number,
  limit: number,
  genreIds?: string,
): Promise<MediaSummary[]> {
  try {
    const res = await tmdb<{ results: TmdbListItem[] }>(`/discover/${type}`, {
      page,
      include_adult: "false",
      sort_by:
        sort === "popularity"
          ? "popularity.desc"
          : sort === "top_rated"
            ? "vote_average.desc"
            : type === "movie"
              ? "primary_release_date.desc"
              : "first_air_date.desc",
      with_genres: genreIds,
      "vote_count.gte": sort === "top_rated" ? 300 : undefined,
      [type === "movie" ? "primary_release_date.lte" : "first_air_date.lte"]:
        sort === "newest" ? new Date().toISOString().slice(0, 10) : undefined,
    });
    return (res.results ?? []).slice(0, limit).map((m) => toSummary(m, type));
  } catch (error) {
    console.warn(`[TMDB] fetchTmdbDiscoverFeed(${type}/${sort}) failed:`, error);
    return [];
  }
}
