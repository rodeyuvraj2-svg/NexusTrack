import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { MediaSummary, MediaType } from "./media-types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

function tmdbHeaders(): Record<string, string> {
  // Prefer the Read Access Token (v4 Bearer auth) — more modern and reliable
  const readToken = process.env.TMDB_READ_TOKEN;
  if (readToken) {
    return { Authorization: `Bearer ${readToken}`, "Content-Type": "application/json" };
  }
  // Fall back to v3 API key (passed as query param, no auth header needed)
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY is not configured — add TMDB_API_KEY or TMDB_READ_TOKEN to your .env file.");
  return { "Content-Type": "application/json" };
}

function tmdbUrl(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(TMDB_BASE + path);
  // Only append api_key if we're NOT using Bearer token auth
  const readToken = process.env.TMDB_READ_TOKEN;
  if (!readToken) {
    const apiKey = process.env.TMDB_API_KEY;
    if (apiKey) url.searchParams.set("api_key", apiKey);
  }
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  return url.toString();
}

async function tmdb<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const res = await fetch(tmdbUrl(path, params), { headers: tmdbHeaders() });
  if (res.status === 429) {
    // Rate limited — wait 1s and retry once
    await new Promise((r) => setTimeout(r, 1000));
    const retry = await fetch(tmdbUrl(path, params), { headers: tmdbHeaders() });
    if (!retry.ok) throw new Error(`TMDB ${retry.status} (rate limited): ${await retry.text()}`);
    return retry.json() as Promise<T>;
  }
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
      console.error("[TMDB] searchAll error:", error);
      if (!process.env.TMDB_API_KEY) {
        throw new Error("TMDB_API_KEY is not configured in your .env file.");
      }
      return { movies: [], tv: [] };
    }
  });

export const trending = createServerFn({ method: "GET" })
  .validator((input) => z.object({
    type: z.enum(["movie", "tv", "all"]).default("all"),
    page: z.number().int().min(1).default(1),
  }).parse(input ?? {}))
  .handler(async ({ data }) => {
    try {
      const res = await tmdb<{ results: TmdbMovie[] }>(`/trending/${data.type}/week`, { page: data.page });
      return res.results.map((m) => {
        const mediaType: MediaType = (m as unknown as { media_type?: string }).media_type === "tv" ? "tv" : data.type === "tv" ? "tv" : "movie";
        return toSummary(m, mediaType);
      });
    } catch (error) {
      console.error("[TMDB] trending error:", error);
      if (!process.env.TMDB_API_KEY) {
        throw new Error("TMDB_API_KEY is not configured in your .env file.");
      }
      return [] as MediaSummary[];
    }
  });

export const discover = createServerFn({ method: "GET" })
  .validator((input) => z.object({
    type: z.enum(["movie", "tv"]).default("movie"),
    category: z.enum(["popular", "top_rated", "upcoming", "now_playing", "on_the_air"]).default("popular"),
    page: z.number().int().min(1).default(1),
    genre: z.string().optional(),
  }).parse(input ?? {}))
  .handler(async ({ data }) => {
    try {
      // If a genre filter is active, use the discover endpoint with with_genres
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
      console.error("[TMDB] discover error:", error);
      if (!process.env.TMDB_API_KEY) {
        throw new Error("TMDB_API_KEY is not configured in your .env file.");
      }
      return [] as MediaSummary[];
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
      throw new Error(`Failed to load details: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  });

// Upsert media (and seasons) into cache, return internal media.id
export const cacheMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        type: z.enum(["movie", "tv", "anime"]),
        external_id: z.string(),
        source: z.enum(["tmdb", "jikan", "anilist"]).default("tmdb"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Check cache first using the user's authenticated client
    const existing = await context.supabase
      .from("media")
      .select("id")
      .eq("media_type", data.type)
      .eq("source", data.source)
      .eq("external_id", data.external_id)
      .maybeSingle();
    if (existing.data) return { id: existing.data.id };

    // Fetch media details from the source API
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
    } else if ((data.source === "anilist" || data.source === "jikan") && data.type === "anime") {
      // Fetch from AniList GraphQL (no API key needed)
      const aniRes = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          query: `query ($id: Int) {
            Media(id: $id, type: ANIME) {
              id title { romaji english }
              description coverImage { extraLarge large }
              bannerImage averageScore episodes duration
              status genres seasonYear source
            }
          }`,
          variables: { id: Number(data.external_id) },
        }),
      });
      if (!aniRes.ok) throw new Error(`AniList ${aniRes.status}: ${await aniRes.text()}`);
      const aniJson = (await aniRes.json()) as {
        data: {
          Media: {
            id: number; title: { romaji: string | null; english: string | null };
            description?: string | null;
            coverImage: { extraLarge?: string | null; large?: string | null };
            bannerImage?: string | null;
            averageScore?: number | null; episodes?: number | null;
            duration?: number | null; status?: string | null;
            genres?: string[]; seasonYear?: number | null; source?: string | null;
          }
        }
      };
      const a = aniJson.data.Media;
      const poster = a.coverImage.extraLarge || a.coverImage.large || null;
      summary = {
        external_id: String(a.id),
        source: "anilist",
        media_type: "anime",
        title: a.title.english || a.title.romaji || "Untitled",
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
    } else {
      throw new Error("Unsupported media source");
    }

    // Try to use the upsert_media RPC (works without service role key)
    let mediaId: string | null = null;
    try {
      const { data: rpcId, error: rpcError } = await (context.supabase.rpc as Function)(
        "upsert_media",
        {
          p_media_type: data.type,
          p_source: data.source,
          p_external_id: data.external_id,
          p_title: summary.title,
          p_overview: summary.overview ?? null,
          p_poster_url: summary.poster_url ?? null,
          p_backdrop_url: summary.backdrop_url ?? null,
          p_release_year: summary.release_year ?? null,
          p_vote_average: summary.vote_average ?? null,
          p_genres: summary.genres ?? null,
          p_runtime: summary.runtime ?? null,
          p_season_count: summary.season_count ?? null,
          p_status: summary.status ?? null,
        }
      );
      if (!rpcError && rpcId) mediaId = String(rpcId);
    } catch {
      // RPC not available — fall through to service role or direct insert
    }

    // Fallback: use service role if RPC not available
    if (!mediaId) {
      try {
        const mod = await import("@/integrations/supabase/client.server");
        const admin = mod.supabaseAdmin as import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database> | undefined;
        // admin is a Proxy, always truthy; check .from to see if the real client exists
        if (admin?.from) {
          const ins = await admin
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
          mediaId = ins.data.id as string;
        }
      } catch {
        // Service role client unavailable — fall through to direct insert
      }
      // Last resort: try direct insert with user's client (may fail due to RLS)
      if (!mediaId) {
        const ins = await context.supabase
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
        if (ins.error) throw new Error("Could not add this title to the database. Please ensure the database migration has been applied (upsert_media RPC).");
        mediaId = ins.data.id as string;
      }
    }

    if (seasons.length > 0 && mediaId) {
      // Try RPC first (works without service role)
      try {
        await (context.supabase.rpc as Function)("upsert_seasons", {
          p_media_id: mediaId,
          p_seasons: JSON.stringify(seasons),
        });
      } catch {
        // RPC not available — try direct upsert (may need service role)
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server").catch(() => ({ supabaseAdmin: null }));
          if (supabaseAdmin?.from) {
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
        } catch {
          // Non-critical — seasons may already exist
        }
      }
    }

    return { id: mediaId! };
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
  .validator((input) => z.object({ type: z.enum(["movie", "tv"]), id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    try {
      const res = await tmdb<{ results: Record<string, { link?: string; flatrate?: WatchProvider[]; rent?: WatchProvider[]; buy?: WatchProvider[]; ads?: WatchProvider[] }> }>(
        `/${data.type}/${data.id}/watch/providers`,
      );
      const results = res.results ?? {};
      const region = "US";
      const entry = results[region] ?? results["GB"] ?? Object.values(results)[0] ?? {};
      return {
        link: entry.link ?? null,
        flatrate: (entry.flatrate ?? []).map((p) => ({ ...p, logo_path: imgUrl(p.logo_path, "w92") })),
        rent: (entry.rent ?? []).map((p) => ({ ...p, logo_path: imgUrl(p.logo_path, "w92") })),
        buy: (entry.buy ?? []).map((p) => ({ ...p, logo_path: imgUrl(p.logo_path, "w92") })),
        ads: (entry.ads ?? []).map((p) => ({ ...p, logo_path: imgUrl(p.logo_path, "w92") })),
      } as WatchProviderResult;
    } catch {
      return null;
    }
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
      const res = await tmdb<{ cast: CastMember[]; crew: { id: number; name: string; job: string }[] }>(
        `/${data.type}/${data.id}/credits`,
      );
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
    z.object({
      media_id: z.string().uuid(),
      new_type: z.enum(["movie", "tv", "anime"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("media")
      .update({ media_type: data.new_type })
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
  .validator((input) => z.object({ type: z.enum(["movie", "tv"]).default("movie") }).parse(input ?? {}))
  .handler(async ({ data }) => {
    try {
      const res = await tmdb<{ genres: Genre[] }>(`/genre/${data.type}/list`);
      return res.genres ?? [];
    } catch {
      return [] as Genre[];
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
      .select("id, media_type, source, external_id, title, poster_url, release_year, vote_average, genres")
      .in("id", data.ids);
    if (error) throw error;
    return rows ?? [];
  });
