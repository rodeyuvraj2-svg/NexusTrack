import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { cached } from "./api-cache";
import type { MediaSummary } from "./media-types";

// ---- Jikan (MyAnimeList) REST API ----
// No API key required. Used as the fallback provider when AniList is
// unreachable, and as the primary provider for items saved with
// source "jikan" (external_id = MyAnimeList ID).
const JIKAN_BASE = "https://api.jikan.moe/v4";

const JIKAN_TIMEOUT = 5_000;
const JIKAN_CACHE_TTL = 5 * 60_000; // same TTL as the AniList cache
const JIKAN_MIN_INTERVAL = 400; // public limit is 3 req/s — stay safely under

// Serialize outbound calls so bursts (e.g. discover page fan-out) can't
// trip Jikan's per-second rate limit. Cached responses skip the queue.
let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();
function paceRequests(): Promise<void> {
  const run = queue.then(async () => {
    const wait = JIKAN_MIN_INTERVAL - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
  });
  queue = run.catch(() => {}); // keep the chain alive on failures
  return run;
}

async function jikan<T>(path: string): Promise<T> {
  const key = `jikan:${path}`;
  return cached(key, JIKAN_CACHE_TTL, async () => {
    await paceRequests();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), JIKAN_TIMEOUT);
    try {
      const res = await fetch(JIKAN_BASE + path, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`Jikan ${res.status}: ${await res.text()}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  });
}

// ---- Response shapes (only the fields we use) ----

interface JikanEntry {
  mal_id: number;
  type?: string | null;
  name?: string | null;
  images?: { jpg?: { large_image_url?: string | null; image_url?: string | null } | null } | null;
}

interface JikanMedia {
  mal_id: number;
  title?: string | null;
  title_english?: string | null;
  synopsis?: string | null;
  images?: { jpg?: { large_image_url?: string | null; image_url?: string | null } | null } | null;
  score?: number | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  status?: string | null;
  type?: string | null;
  source?: string | null;
  duration?: string | null; // "24 min per ep"
  genres?: { name: string }[] | null;
  themes?: { name: string }[] | null;
  studios?: { name: string }[] | null;
  published?: { from?: string | null } | null;
  aired?: { from?: string | null } | null;
  relations?: { relation: string; entry: JikanEntry[] }[] | null;
}

function yearFrom(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const year = parseInt(dateStr.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

/** "24 min per ep" → 24; "2 hr 5 min" → 125. */
function runtimeFromDuration(duration: string | null | undefined): number | null {
  if (!duration) return null;
  let mins = 0;
  const hr = /(\d+)\s*hr/.exec(duration);
  const min = /(\d+)\s*min/.exec(duration);
  if (hr) mins += Number(hr[1]) * 60;
  if (min) mins += Number(min[1]);
  return mins > 0 ? mins : null;
}

// Jikan status strings → AniList-style labels used elsewhere in the app.
function normalizeStatus(status: string | null | undefined): string | null {
  switch (status) {
    case "Currently Airing":
    case "Publishing":
      return "RELEASING";
    case "Finished Airing":
    case "Finished":
      return "FINISHED";
    case "Not yet aired":
    case "On hiatus":
      return "NOT_YET_RELEASED";
    default:
      return status ?? null;
  }
}

function posterOf(m: JikanMedia): string | null {
  return m.images?.jpg?.large_image_url || m.images?.jpg?.image_url || null;
}

function toAnimeSummary(m: JikanMedia): MediaSummary {
  const genres = [...(m.genres ?? []), ...(m.themes ?? [])].map((g) => g.name);
  return {
    external_id: String(m.mal_id),
    source: "jikan",
    media_type: "anime",
    title: m.title_english || m.title || "Untitled",
    overview: m.synopsis ?? null,
    poster_url: posterOf(m),
    backdrop_url: posterOf(m),
    release_year: yearFrom(m.aired?.from),
    vote_average: m.score ?? null,
    genres,
    runtime: runtimeFromDuration(m.duration),
    season_count: m.episodes ?? null,
    status: normalizeStatus(m.status),
  };
}

function toMangaSummary(m: JikanMedia): MediaSummary {
  const genres = [...(m.genres ?? []), ...(m.themes ?? [])].map((g) => g.name);
  return {
    external_id: String(m.mal_id),
    source: "jikan",
    media_type: "manga",
    title: m.title_english || m.title || "Untitled",
    overview: m.synopsis ?? null,
    poster_url: posterOf(m),
    backdrop_url: posterOf(m),
    release_year: yearFrom(m.published?.from),
    vote_average: m.score ?? null,
    genres,
    chapter_count: m.chapters ?? null,
    volume_count: m.volumes ?? null,
    status: normalizeStatus(m.status),
  };
}

/** Relations in the same shape AniList details return, so the franchise
 *  view renders identically. Relation labels are normalized to AniList's
 *  UPPER_SNAKE keys ("Parent story" → "PARENT_STORY") because the detail
 *  route filters franchises on PREQUEL/SEQUEL/PARENT_STORY.
 *  `mal_id` carries the MAL id (for jikan items the franchise links use
 *  source "jikan"). */
function toRelations(m: JikanMedia, kinds: Set<string>) {
  const out: {
    relation: string;
    entries: {
      mal_id: number;
      name: string;
      type: string | null;
      poster_url: string | null;
      episodes: number | null;
      format: string | null;
    }[];
  }[] = [];
  const seen = new Set<number>();
  for (const rel of m.relations ?? []) {
    const entries = rel.entry
      .filter((e) => kinds.has(e.type ?? ""))
      .map((e) => ({
        mal_id: e.mal_id,
        name: e.name || "",
        type: e.type ?? null,
        poster_url: e.images?.jpg?.large_image_url ?? e.images?.jpg?.image_url ?? null,
        episodes: null,
        format: null,
      }))
      .filter((e) => {
        if (!e.name || seen.has(e.mal_id)) return false;
        seen.add(e.mal_id);
        return true;
      });
    if (entries.length > 0) {
      out.push({ relation: rel.relation.replace(/[-\s]+/g, "_").toUpperCase(), entries });
    }
  }
  return out;
}

const ANIME_TYPES = new Set(["anime"]);
const MANGA_TYPES = new Set([
  "manga",
  "manhwa",
  "manhua",
  "light_novel",
  "novel",
  "one_shot",
  "doujin",
]);

// ---- Plain helpers (shared with anilist.functions.ts fallbacks) ----

// MAL genre ids for the genre names the Discover page uses (same id space
// for anime and manga). Unknown names are dropped by malGenreIds().
const MAL_GENRE_IDS: Record<string, number> = {
  action: 1,
  adventure: 2,
  comedy: 4,
  drama: 8,
  fantasy: 10,
  horror: 14,
  mystery: 7,
  romance: 22,
  "sci-fi": 24,
  "slice of life": 36,
  sports: 30,
  thriller: 41,
};

function malGenreIds(genres: string[]): number[] {
  return genres
    .map((g) => MAL_GENRE_IDS[g.trim().toLowerCase()])
    .filter((n): n is number => n != null);
}

export async function searchAnimeViaJikan(q: string): Promise<MediaSummary[]> {
  const res = await jikan<{ data: JikanMedia[] }>(
    `/anime?q=${encodeURIComponent(q)}&limit=20&sfw=true`,
  );
  return (res.data ?? []).map(toAnimeSummary);
}

export async function searchMangaViaJikan(q: string): Promise<MediaSummary[]> {
  const res = await jikan<{ data: JikanMedia[] }>(
    `/manga?q=${encodeURIComponent(q)}&limit=20&sfw=true`,
  );
  return (res.data ?? []).map(toMangaSummary);
}

export async function topAnimeViaJikan(
  page = 1,
  opts: { genres?: string[]; sort?: "trending" | "popular" } = {},
): Promise<MediaSummary[]> {
  const genreIds = malGenreIds(opts.genres ?? []);
  let path: string;
  if (genreIds.length > 0) {
    // The /anime search endpoint is the only one with genre filtering.
    const params = new URLSearchParams({
      genres: genreIds.join(","),
      order_by: "members",
      sort: "desc",
      page: String(page),
      limit: "20",
      sfw: "true",
    });
    if (opts.sort === "trending") params.set("status", "airing");
    path = `/anime?${params.toString()}`;
  } else {
    const filter = opts.sort === "trending" ? "airing" : "bypopularity";
    path = `/top/anime?page=${page}&limit=20&filter=${filter}&sfw=true`;
  }
  const res = await jikan<{ data: JikanMedia[] }>(path);
  return (res.data ?? []).map(toAnimeSummary);
}

export async function topMangaViaJikan(
  page = 1,
  opts: { genres?: string[]; type?: "top" | "popular" } = {},
): Promise<MediaSummary[]> {
  const genreIds = malGenreIds(opts.genres ?? []);
  let path: string;
  if (genreIds.length > 0) {
    const params = new URLSearchParams({
      genres: genreIds.join(","),
      order_by: opts.type === "top" ? "score" : "members",
      sort: "desc",
      page: String(page),
      limit: "20",
      sfw: "true",
    });
    path = `/manga?${params.toString()}`;
  } else {
    path =
      opts.type === "top"
        ? `/top/manga?page=${page}&limit=20&sfw=true` // default ordering is by score
        : `/top/manga?page=${page}&limit=20&filter=bypopularity&sfw=true`;
  }
  const res = await jikan<{ data: JikanMedia[] }>(path);
  return (res.data ?? []).map(toMangaSummary);
}

export async function seasonalAnimeViaJikan(page = 1): Promise<MediaSummary[]> {
  const res = await jikan<{ data: JikanMedia[] }>(`/seasons/now?page=${page}&limit=20&sfw=true`);
  return (res.data ?? []).map(toAnimeSummary);
}

// ---- Server Functions (used by /media/{type}/jikan/{id} detail pages) ----

export const jikanSearchAnime = createServerFn({ method: "GET" })
  .validator((input) => z.object({ q: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => searchAnimeViaJikan(data.q));

export const jikanSearchManga = createServerFn({ method: "GET" })
  .validator((input) => z.object({ q: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => searchMangaViaJikan(data.q));

export const jikanTopAnime = createServerFn({ method: "GET" })
  .validator((input) => z.object({ page: z.number().int().min(1).default(1) }).parse(input ?? {}))
  .handler(async ({ data }) => topAnimeViaJikan(data.page));

export const jikanTopManga = createServerFn({ method: "GET" })
  .validator((input) => z.object({ page: z.number().int().min(1).default(1) }).parse(input ?? {}))
  .handler(async ({ data }) => topMangaViaJikan(data.page));

export const jikanSeasonalAnime = createServerFn({ method: "GET" })
  .validator((input) => z.object({ page: z.number().int().min(1).default(1) }).parse(input ?? {}))
  .handler(async ({ data }) => seasonalAnimeViaJikan(data.page));

export const getJikanAnimeDetails = createServerFn({ method: "GET" })
  .validator((input) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const res = await jikan<{ data: JikanMedia }>(`/anime/${encodeURIComponent(data.id)}/full`);
    const m = res.data;
    if (!m) throw new Error(`Anime not found (MAL ID: ${data.id})`);
    return {
      summary: toAnimeSummary(m),
      extra: {
        studios: (m.studios ?? []).map((s) => s.name),
        episodes: m.episodes ?? null,
        rating: null,
        duration: m.duration ?? null,
        source: m.source ?? null,
        format: m.type ?? null,
        season: null,
        seasonYear: yearFrom(m.aired?.from),
        relations: toRelations(m, ANIME_TYPES),
      },
    };
  });

export const getJikanMangaDetails = createServerFn({ method: "GET" })
  .validator((input) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const res = await jikan<{ data: JikanMedia }>(`/manga/${encodeURIComponent(data.id)}/full`);
    const m = res.data;
    if (!m) throw new Error(`Manga not found (MAL ID: ${data.id})`);
    return {
      summary: toMangaSummary(m),
      extra: {
        relations: toRelations(m, MANGA_TYPES),
        chapters: m.chapters ?? null,
        volumes: m.volumes ?? null,
      },
    };
  });

/**
 * Details for an item identified by TITLE instead of id — used when an
 * AniList-saved item's detail page can't reach AniList: we look the title
 * up on Jikan and serve its full details (studios, relations, episodes).
 * The returned summary carries jikan/mal ids — callers keep using the
 * original anilist id for library identity, this is display data only.
 */
export const getJikanDetailsByTitle = createServerFn({ method: "GET" })
  .validator((input) =>
    z.object({ title: z.string().min(1), type: z.enum(["anime", "manga"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    const search = await jikan<{ data: JikanMedia[] }>(
      `/${data.type}?q=${encodeURIComponent(data.title)}&limit=5&sfw=true`,
    );
    const candidates = search.data ?? [];
    if (candidates.length === 0) throw new Error(`No ${data.type} found for "${data.title}"`);

    // Prefer an exact normalized-title match; fall back to the top result.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const target = norm(data.title);
    const best =
      candidates.find(
        (c) => norm(c.title_english ?? "") === target || norm(c.title ?? "") === target,
      ) ?? candidates[0];

    const res = await jikan<{ data: JikanMedia }>(
      `/${data.type}/${encodeURIComponent(String(best.mal_id))}/full`,
    );
    const m = res.data;
    if (!m) throw new Error(`Jikan returned no details for "${data.title}"`);

    if (data.type === "manga") {
      return {
        summary: toMangaSummary(m),
        extra: {
          relations: toRelations(m, MANGA_TYPES),
          chapters: m.chapters ?? null,
          volumes: m.volumes ?? null,
        },
      };
    }
    return {
      summary: toAnimeSummary(m),
      extra: {
        studios: (m.studios ?? []).map((s) => s.name),
        episodes: m.episodes ?? null,
        rating: null,
        duration: m.duration ?? null,
        source: m.source ?? null,
        format: m.type ?? null,
        season: null,
        seasonYear: yearFrom(m.aired?.from),
        relations: toRelations(m, ANIME_TYPES),
      },
    };
  });

/** Batch detail fetch for franchise views — same return shape as
 *  getMultipleAnimeDetails so the detail route renders both identically. */
export const getMultipleJikanAnimeDetails = createServerFn({ method: "GET" })
  .validator((input) => z.object({ ids: z.array(z.string()) }).parse(input))
  .handler(async ({ data }) => {
    const ids = data.ids.slice(0, 8);
    const settled = await Promise.allSettled(
      ids.map((mid) => jikan<{ data: JikanMedia }>(`/anime/${encodeURIComponent(mid)}/full`)),
    );
    return settled
      .filter((s): s is PromiseFulfilledResult<{ data: JikanMedia }> => s.status === "fulfilled")
      .map((s) => {
        const m = s.value.data;
        return {
          mal_id: m.mal_id,
          title: m.title_english || m.title || "Untitled",
          title_english: m.title_english ?? null,
          synopsis: m.synopsis ?? null,
          images: { jpg: { image_url: posterOf(m) ?? "", large_image_url: posterOf(m) ?? "" } },
          episodes: m.episodes ?? null,
          status: normalizeStatus(m.status),
          type: "anime",
          year: yearFrom(m.aired?.from),
          score: m.score ?? null,
          genres: (m.genres ?? []).map((g) => ({ name: g.name })),
        };
      });
  });

export const getMultipleJikanMangaDetails = createServerFn({ method: "GET" })
  .validator((input) => z.object({ ids: z.array(z.string()) }).parse(input))
  .handler(async ({ data }) => {
    const ids = data.ids.slice(0, 8);
    const settled = await Promise.allSettled(
      ids.map((mid) => jikan<{ data: JikanMedia }>(`/manga/${encodeURIComponent(mid)}/full`)),
    );
    return settled
      .filter((s): s is PromiseFulfilledResult<{ data: JikanMedia }> => s.status === "fulfilled")
      .map((s) => {
        const m = s.value.data;
        return {
          mal_id: m.mal_id,
          title: m.title_english || m.title || "Untitled",
          title_english: m.title_english ?? null,
          synopsis: m.synopsis ?? null,
          images: { jpg: { image_url: posterOf(m) ?? "", large_image_url: posterOf(m) ?? "" } },
          chapters: m.chapters ?? null,
          status: normalizeStatus(m.status),
          type: "manga",
          year: yearFrom(m.published?.from),
          score: m.score ?? null,
          genres: (m.genres ?? []).map((g) => ({ name: g.name })),
        };
      });
  });
