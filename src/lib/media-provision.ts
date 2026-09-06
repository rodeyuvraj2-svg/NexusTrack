// SERVER-ONLY: provision rows in the global `media` / `seasons` cache tables
// using authoritative metadata fetched from the source API (TMDB / AniList).
//
// Security: the `media` table is world-readable, so its contents must never
// be seeded from client-supplied strings (title, poster URL, …) — a crafted
// request could poison shared rows for every user. This module is the single
// trusted path for media upserts: it only accepts an external identity
// (media_type + source + external_id) and re-fetches everything else.
//
// Import it dynamically inside server-function handler bodies (like
// `client.server.ts`) so it never ships to the client bundle.

import type { MediaSummary, MediaType } from "./media-types";
import { cached } from "./api-cache";

const TMDB_CACHE_TTL = 5 * 60_000; // same TTL as tmdb.functions.ts
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const FETCH_TIMEOUT = 4_000;

// ── TMDB ─────────────────────────────────────────────────────────────────────

function tmdbHeaders(): Record<string, string> {
  const readToken = process.env.TMDB_READ_TOKEN;
  if (readToken) return { Authorization: `Bearer ${readToken}`, "Content-Type": "application/json" };
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY is not configured — add TMDB_API_KEY or TMDB_READ_TOKEN to your .env file.");
  return { "Content-Type": "application/json" };
}

function tmdbUrl(path: string): string {
  const url = new URL(TMDB_BASE + path);
  const readToken = process.env.TMDB_READ_TOKEN;
  if (!readToken) {
    const apiKey = process.env.TMDB_API_KEY;
    if (apiKey) url.searchParams.set("api_key", apiKey);
  }
  return url.toString();
}

interface TmdbMovie {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
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

function imgUrl(path: string | null | undefined, size = "w342") {
  return path ? `${IMG}/${size}${path}` : null;
}

async function tmdbFetch<T>(path: string): Promise<T> {
  // Same key format as tmdb.functions.ts so both modules share cache entries.
  const key = `tmdb:${path}?{}`;
  return cached(key, TMDB_CACHE_TTL, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => { try { controller.abort(); } catch {} }, FETCH_TIMEOUT);
    try {
      const res = await fetch(tmdbUrl(path), { headers: tmdbHeaders(), signal: controller.signal });
      if (!res.ok) throw new Error(`TMDB ${res.status}: ${await res.text()}`);
      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  });
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

// ── AniList ──────────────────────────────────────────────────────────────────

async function anilistFetch<T>(query: string, id: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => { try { controller.abort(); } catch {} }, FETCH_TIMEOUT);
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: { id } }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`AniList ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

interface AniListMedia {
  id: number;
  title: { romaji: string | null; english: string | null };
  description?: string | null;
  coverImage: { extraLarge?: string | null; large?: string | null };
  bannerImage?: string | null;
  averageScore?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  episodes?: number | null;
  duration?: number | null;
  status?: string | null;
  genres?: string[];
  seasonYear?: number | null;
}

function anilistSummary(a: AniListMedia, type: "anime" | "manga"): MediaSummary {
  const poster = a.coverImage.extraLarge || a.coverImage.large || null;
  return {
    external_id: String(a.id),
    source: "anilist",
    media_type: type,
    title: a.title.english || a.title.romaji || "Untitled",
    overview: a.description ? a.description.replace(/<[^>]*>/g, "") : null,
    poster_url: poster,
    backdrop_url: a.bannerImage || poster,
    release_year: a.seasonYear ?? null,
    vote_average: a.averageScore != null ? a.averageScore / 10 : null,
    genres: a.genres ?? [],
    ...(type === "manga"
      ? { chapter_count: a.chapters ?? null, volume_count: a.volumes ?? null }
      : { runtime: a.duration ?? null, season_count: a.episodes ?? null }),
    status: a.status ?? null,
  };
}

// ── Provisioning ─────────────────────────────────────────────────────────────

export interface ProvisionedMedia {
  id: string;
  summary: MediaSummary;
  seasons: Array<{
    season_number: number;
    name: string;
    episode_count: number;
    air_date: string | null;
    poster_url: string | null;
    overview: string;
  }>;
}

/**
 * Fetch authoritative metadata for `type + source + external_id` from the
 * source API. Returns the summary plus seasons (TV only). Throws when the
 * source API is unavailable — callers must not fall back to client data.
 */
export async function fetchAuthoritativeMedia(
  type: MediaType,
  source: "tmdb" | "anilist",
  externalId: string,
): Promise<ProvisionedMedia> {
  let summary: MediaSummary;
  let seasons: ProvisionedMedia["seasons"] = [];

  if (source === "tmdb" && (type === "movie" || type === "tv")) {
    const det = await tmdbFetch<TmdbMovie>(`/${type}/${encodeURIComponent(externalId)}`);
    summary = toSummary(det, type);
    if (type === "tv" && det.seasons) {
      seasons = det.seasons
        .filter((s) => s.season_number > 0)
        .map((s) => ({
          season_number: s.season_number,
          name: s.name,
          episode_count: s.episode_count,
          air_date: s.air_date,
          poster_url: imgUrl(s.poster_path),
          overview: s.overview,
        }));
    }
  } else if (source === "anilist" && type === "manga") {
    const json = await anilistFetch<{ data: { Media: AniListMedia } }>(
      `query ($id: Int) {
        Media(id: $id, type: MANGA) {
          id title { romaji english }
          description coverImage { extraLarge large }
          bannerImage averageScore chapters volumes
          status genres seasonYear
        }
      }`,
      Number(externalId),
    );
    summary = anilistSummary(json.data.Media, "manga");
  } else if (source === "anilist" && type === "anime") {
    const json = await anilistFetch<{ data: { Media: AniListMedia } }>(
      `query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id title { romaji english }
          description coverImage { extraLarge large }
          bannerImage averageScore episodes duration
          status genres seasonYear source
        }
      }`,
      Number(externalId),
    );
    summary = anilistSummary(json.data.Media, "anime");
  } else {
    throw new Error(`Unsupported media source: ${source}/${type}`);
  }

  return { id: "", summary, seasons };
}

/**
 * Ensure a `media` row (and its `seasons`) exists in the DB cache, seeded
 * from the source API — never from client-supplied metadata. Returns the
 * internal media id.
 */
export async function provisionMedia(
  type: MediaType,
  source: "tmdb" | "anilist",
  externalId: string,
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!supabaseAdmin?.from) {
    throw new Error("Media caching is unavailable: SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  // Check the cache first. TV shows created as placeholders may have no
  // seasons yet — fall through to fetch and fill them.
  const existing = await supabaseAdmin
    .from("media")
    .select("id")
    .eq("media_type", type as any)
    .eq("source", source)
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing.data) {
    if (!(source === "tmdb" && type === "tv")) return existing.data.id as string;
    const { count } = await supabaseAdmin
      .from("seasons")
      .select("id", { count: "exact", head: true })
      .eq("media_id", existing.data.id);
    if (count && count > 0) return existing.data.id as string;
  }

  const { summary, seasons } = await fetchAuthoritativeMedia(type, source, externalId);

  const { data: mediaRow, error: mediaError } = await supabaseAdmin
    .from("media")
    .upsert(
      {
        media_type: summary.media_type as any,
        source: summary.source,
        external_id: summary.external_id,
        title: summary.title,
        overview: summary.overview ?? null,
        poster_url: summary.poster_url ?? null,
        backdrop_url: summary.backdrop_url ?? null,
        release_year: summary.release_year ?? null,
        vote_average: summary.vote_average ?? null,
        genres: summary.genres ?? [],
        runtime: summary.runtime ?? null,
        season_count: summary.season_count ?? null,
        chapter_count: summary.chapter_count ?? null,
        volume_count: summary.volume_count ?? null,
        status: summary.status ?? null,
      },
      { onConflict: "media_type,source,external_id" },
    )
    .select("id")
    .single();
  if (mediaError || !mediaRow) throw mediaError ?? new Error("Could not cache media metadata.");
  const mediaId = mediaRow.id as string;

  if (seasons.length > 0) {
    const { error: seasonsError } = await supabaseAdmin
      .from("seasons")
      .upsert(
        seasons.map((s) => ({ ...s, media_id: mediaId })),
        { onConflict: "media_id,season_number" },
      );
    if (seasonsError) throw seasonsError;
  }

  return mediaId;
}
