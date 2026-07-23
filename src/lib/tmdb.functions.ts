import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { MediaSummary, MediaType } from "./media-types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

function tmdbHeaders() {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY is not configured");
  // Support both v4 bearer tokens (long JWT) and v3 keys
  if (key.length > 60 && key.includes(".")) {
    return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } as Record<string, string>;
  }
  return { "Content-Type": "application/json" } as Record<string, string>;
}

function tmdbUrl(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(TMDB_BASE + path);
  const key = process.env.TMDB_API_KEY;
  if (key && !(key.length > 60 && key.includes("."))) url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  return url.toString();
}

async function tmdb<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const res = await fetch(tmdbUrl(path, params), { headers: tmdbHeaders() });
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function imgUrl(path: string | null | undefined, size = "w500") {
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
  .inputValidator((input) => z.object({ q: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const [movies, tv] = await Promise.all([
      tmdb<{ results: TmdbMovie[] }>("/search/movie", { query: data.q, include_adult: "false" }),
      tmdb<{ results: TmdbMovie[] }>("/search/tv", { query: data.q, include_adult: "false" }),
    ]);
    return {
      movies: movies.results.slice(0, 12).map((m) => toSummary(m, "movie")),
      tv: tv.results.slice(0, 12).map((m) => toSummary(m, "tv")),
    };
  });

export const trending = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ type: z.enum(["movie", "tv", "all"]).default("all") }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const res = await tmdb<{ results: TmdbMovie[] }>(`/trending/${data.type}/week`);
    return res.results.slice(0, 20).map((m) => {
      const type: MediaType = (m as unknown as { media_type?: string }).media_type === "tv" ? "tv" : data.type === "tv" ? "tv" : "movie";
      return toSummary(m, type);
    });
  });

export const discover = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ type: z.enum(["movie", "tv"]).default("movie"), category: z.enum(["popular", "top_rated", "upcoming", "now_playing", "on_the_air"]).default("popular") }).parse(input ?? {}))
  .handler(async ({ data }) => {
    // TV endpoints differ
    let path = `/${data.type}/${data.category}`;
    if (data.type === "tv" && (data.category === "upcoming" || data.category === "now_playing")) {
      path = `/tv/on_the_air`;
    }
    const res = await tmdb<{ results: TmdbMovie[] }>(path);
    return res.results.slice(0, 20).map((m) => toSummary(m, data.type));
  });

export const getDetails = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ type: z.enum(["movie", "tv"]), id: z.string() }).parse(input))
  .handler(async ({ data }) => {
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
  });

// Upsert media (and seasons) into cache, return internal media.id
export const cacheMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        type: z.enum(["movie", "tv", "anime"]),
        external_id: z.string(),
        source: z.enum(["tmdb", "jikan"]).default("tmdb"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Check cache first
    const existing = await context.supabase
      .from("media")
      .select("id")
      .eq("media_type", data.type)
      .eq("source", data.source)
      .eq("external_id", data.external_id)
      .maybeSingle();
    if (existing.data) return { id: existing.data.id };

    // For TMDB movies/tv, fetch details and upsert via service role (RLS blocks writes)
    let summary: MediaSummary;
    let seasons: Array<{ season_number: number; name: string; episode_count: number; air_date: string | null; poster_url: string | null; overview: string }> = [];
    if (data.source === "tmdb" && (data.type === "movie" || data.type === "tv")) {
      const det = await tmdb<TmdbMovie>(`/${data.type}/${data.external_id}`);
      summary = toSummary(det, data.type);
      if (data.type === "tv" && det.seasons) {
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
    } else if (data.source === "jikan" && data.type === "anime") {
      const r = await fetch(`https://api.jikan.moe/v4/anime/${data.external_id}/full`);
      if (!r.ok) throw new Error(`Jikan ${r.status}`);
      const j = (await r.json()) as { data: {
        mal_id: number; title: string; title_english?: string; synopsis?: string; images: { jpg: { image_url: string; large_image_url: string } };
        year?: number; score?: number; genres?: { name: string }[]; episodes?: number; status?: string;
      } };
      const a = j.data;
      summary = {
        external_id: String(a.mal_id),
        source: "jikan",
        media_type: "anime",
        title: a.title_english || a.title,
        overview: a.synopsis ?? null,
        poster_url: a.images.jpg.large_image_url,
        backdrop_url: a.images.jpg.large_image_url,
        release_year: a.year ?? null,
        vote_average: a.score ?? null,
        genres: a.genres?.map((g) => g.name) ?? [],
        runtime: null,
        season_count: null,
        status: a.status ?? null,
      };
    } else {
      throw new Error("Unsupported media source");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ins = await supabaseAdmin
      .from("media")
      .upsert(
        {
          media_type: summary.media_type,
          source: summary.source,
          external_id: summary.external_id,
          title: summary.title,
          overview: summary.overview,
          poster_url: summary.poster_url,
          backdrop_url: summary.backdrop_url,
          release_year: summary.release_year,
          vote_average: summary.vote_average,
          genres: summary.genres,
          runtime: summary.runtime,
          season_count: summary.season_count,
          status: summary.status,
        },
        { onConflict: "media_type,source,external_id" },
      )
      .select("id")
      .single();
    if (ins.error) throw ins.error;
    const mediaId = ins.data.id as string;

    if (seasons.length > 0) {
      await supabaseAdmin
        .from("seasons")
        .upsert(
          seasons.map((s) => ({
            media_id: mediaId,
            season_number: s.season_number,
            name: s.name,
            episode_count: s.episode_count,
            air_date: s.air_date,
            poster_url: s.poster_url,
            overview: s.overview,
          })),
          { onConflict: "media_id,season_number" },
        );
    }

    return { id: mediaId };
  });

// ----- Watch providers (streaming availability) -----

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority?: number;
}

export interface WatchProviderResult {
  link: string | null;
  flatrate: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
  ads: WatchProvider[];
}

export const getWatchProviders = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ type: z.enum(["movie", "tv"]), id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const res = await tmdb<{ results: Record<string, { link?: string; flatrate?: WatchProvider[]; rent?: WatchProvider[]; buy?: WatchProvider[]; ads?: WatchProvider[] }> }>(
      `/${data.type}/${data.id}/watch/providers`,
    );
    const results = res.results ?? {};
    // US as default region, plus a few major markets
    const region = "US";
    const entry = results[region] ?? results["GB"] ?? Object.values(results)[0] ?? {};
    return {
      link: entry.link ?? null,
      flatrate: (entry.flatrate ?? []).map((p) => ({ ...p, logo_path: imgUrl(p.logo_path, "w92") })),
      rent: (entry.rent ?? []).map((p) => ({ ...p, logo_path: imgUrl(p.logo_path, "w92") })),
      buy: (entry.buy ?? []).map((p) => ({ ...p, logo_path: imgUrl(p.logo_path, "w92") })),
      ads: (entry.ads ?? []).map((p) => ({ ...p, logo_path: imgUrl(p.logo_path, "w92") })),
    } as WatchProviderResult;
  });

// ----- Recommendations -----

export const getRecommendations = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ type: z.enum(["movie", "tv"]), id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const res = await tmdb<{ results: TmdbMovie[] }>(`/${data.type}/${data.id}/recommendations`);
    return res.results.slice(0, 12).map((m) => toSummary(m, data.type));
  });

export const getSimilar = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ type: z.enum(["movie", "tv"]), id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const res = await tmdb<{ results: TmdbMovie[] }>(`/${data.type}/${data.id}/similar`);
    return res.results.slice(0, 12).map((m) => toSummary(m, data.type));
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
  .inputValidator((input) => z.object({ type: z.enum(["movie", "tv"]), id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const res = await tmdb<{ cast: CastMember[]; crew: { id: number; name: string; job: string }[] }>(
      `/${data.type}/${data.id}/credits`,
    );
    const topCast = (res.cast ?? []).slice(0, 15).map((c) => ({
      ...c,
      profile_path: imgUrl(c.profile_path, "w185"),
    }));
    const director = (res.crew ?? []).find((c) => c.job === "Director");
    return { cast: topCast, director: director?.name ?? null };
  });

// ----- Export helpers -----

export const getMediaByIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ids: z.array(z.string().uuid()) }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.ids.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("media")
      .select("id, media_type, source, external_id, title, poster_url, release_year, vote_average, genres")
      .in("id", data.ids);
    if (error) throw error;
    return rows ?? [];
  });
