import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { MediaSummary } from "./media-types";

// ---- Types ----

interface JikanAnime {
  mal_id: number;
  title: string;
  title_english?: string | null;
  synopsis?: string | null;
  images: { jpg: { image_url: string; large_image_url: string } };
  year?: number | null;
  score?: number | null;
  genres?: { name: string }[];
  episodes?: number | null;
  status?: string | null;
  rating?: string | null;
  studios?: { name: string }[];
  duration?: string | null;
}

interface JikanAnimeFull {
  mal_id: number;
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  synopsis?: string | null;
  images: { jpg: { image_url: string; large_image_url: string } };
  year?: number | null;
  score?: number | null;
  scored_by?: number | null;
  rank?: number | null;
  popularity?: number | null;
  genres?: { name: string }[];
  producers?: { name: string }[];
  licensors?: { name: string }[];
  studios?: { name: string }[];
  episodes?: number | null;
  status?: string | null;
  rating?: string | null;
  duration?: string | null;
  season?: string | null;
  broadcast?: { day?: string; time?: string; string?: string } | null;
  source?: string | null;
  trailer?: { url?: string; embed_url?: string } | null;
  relations?: Array<{
    relation: string;
    entry: Array<{ mal_id: number; type: string; name: string; url: string }>;
  }>;
}

interface JikanRelationEntry {
  mal_id: number;
  type: string; // "anime", "manga", etc.
  name: string;
  url: string;
}

interface JikanRelation {
  relation: string;
  entry: JikanRelationEntry[];
}

// ---- Helpers ----

function toSummary(a: JikanAnime): MediaSummary {
  return {
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
}

// Simple rate limiter: Jikan allows ~3 req/sec, 60/min
let lastJikanCall = 0;
async function jikan<T>(path: string): Promise<T> {
  const now = Date.now();
  const elapsed = now - lastJikanCall;
  if (elapsed < 400) {
    await new Promise((r) => setTimeout(r, 400 - elapsed));
  }
  lastJikanCall = Date.now();

  const res = await fetch("https://api.jikan.moe/v4" + path);
  if (res.status === 429) {
    // Rate limited — wait 1.5s and retry once
    await new Promise((r) => setTimeout(r, 1500));
    const retry = await fetch("https://api.jikan.moe/v4" + path);
    if (!retry.ok) {
      if (retry.status === 429) {
        throw new Error("Jikan API is temporarily rate-limited. Try again in a moment.");
      }
      throw new Error(`Jikan ${retry.status}: ${await retry.text()}`);
    }
    return retry.json() as Promise<T>;
  }
  if (!res.ok) throw new Error(`Jikan ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ---- Server Functions ----

export const searchAnime = createServerFn({ method: "GET" })
  .validator((input) => z.object({ q: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const r = await jikan<{ data: JikanAnime[] }>(`/anime?q=${encodeURIComponent(data.q)}&limit=12&sfw=true`);
      return r.data.map(toSummary);
    } catch (error) {
      console.error("[Jikan] searchAnime error:", error);
      return [] as MediaSummary[];
    }
  });

export const topAnime = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const r = await jikan<{ data: JikanAnime[] }>(`/top/anime?limit=20&filter=bypopularity`);
    return r.data.map(toSummary);
  } catch (error) {
    console.error("[Jikan] topAnime error:", error);
    return [] as MediaSummary[];
  }
});

export const seasonalAnime = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const r = await jikan<{ data: JikanAnime[] }>(`/seasons/now?limit=20`);
    return r.data.map(toSummary);
  } catch (error) {
    console.error("[Jikan] seasonalAnime error:", error);
    return [] as MediaSummary[];
  }
});

export const getAnimeDetails = createServerFn({ method: "GET" })
  .validator((input) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    try {
      const r = await jikan<{ data: JikanAnimeFull }>(`/anime/${data.id}/full`);
      const a = r.data;
      // Extract relations for franchise structure
      const relations = (a.relations ?? [])
        .filter((rel) => rel.entry.some((e) => e.type === "anime"))
        .map((rel) => ({
          relation: rel.relation,
          entries: rel.entry
            .filter((e) => e.type === "anime")
            .map((e) => ({
              mal_id: e.mal_id,
              name: e.name,
              type: e.type,
            })),
        }));

      return {
        summary: {
          external_id: String(a.mal_id),
          source: "jikan" as const,
          media_type: "anime" as const,
          title: a.title_english || a.title,
          overview: a.synopsis ?? null,
          poster_url: a.images.jpg.large_image_url,
          backdrop_url: a.images.jpg.large_image_url,
          release_year: a.year ?? null,
          vote_average: a.score ?? null,
          genres: a.genres?.map((g) => g.name) ?? [],
          runtime: null,
          season_count: a.episodes ?? null,
          status: a.status ?? null,
        } as MediaSummary,
        extra: {
          studios: a.studios?.map((s) => s.name) ?? [],
          episodes: a.episodes ?? null,
          rating: a.rating ?? null,
          duration: a.duration ?? null,
          source: a.source ?? null,
          relations,
        },
      };
    } catch (error) {
      console.error("[Jikan] getAnimeDetails error:", error);
      throw new Error(`Failed to load anime details: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  });

/**
 * Fetch details for multiple anime by ID.
 * Returns them in a map keyed by the anime's mal_id.
 * Used to build franchise/relation views.
 */
export const getMultipleAnimeDetails = createServerFn({ method: "GET" })
  .validator((input) => z.object({ ids: z.array(z.string()) }).parse(input))
  .handler(async ({ data }) => {
    const limit = 10; // max related entries to fetch to stay within rate limits
    const ids = data.ids.slice(0, limit);
    const results: Array<{
      mal_id: number;
      title: string;
      title_english?: string | null;
      synopsis?: string | null;
      images: { jpg: { large_image_url: string } };
      episodes?: number | null;
      status?: string | null;
      type: string;
      year?: number | null;
      score?: number | null;
      genres?: { name: string }[];
    }> = [];

    // Jikan rate limits — fetch sequentially
    for (const id of ids) {
      try {
        const r = await jikan<{ data: JikanAnimeFull }>(`/anime/${id}`);
        const a = r.data;
        results.push({
          mal_id: a.mal_id,
          title: a.title_english || a.title,
          title_english: a.title_english,
          synopsis: a.synopsis,
          images: a.images,
          episodes: a.episodes,
          status: a.status,
          type: "anime",
          year: a.year,
          score: a.score,
          genres: a.genres,
        });
      } catch {
        // Skip entries that fail to load
        continue;
      }
    }

    return results;
  });
