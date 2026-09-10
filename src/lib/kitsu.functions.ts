import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { cached } from "./api-cache";
import type { MediaSummary } from "./media-types";

// ---- Kitsu (kitsu.app) JSON:API ----
// No API key required. Third fallback layer after AniList → Jikan, and the
// primary provider for items saved with source "kitsu" (kitsu ids).
const KITSU_BASE = "https://kitsu.app/api/edge";

const KITSU_TIMEOUT = 5_000;
const KITSU_CACHE_TTL = 5 * 60_000; // same TTL as the AniList/Jikan caches

async function kitsu<T>(path: string): Promise<T> {
  const key = `kitsu:${path}`;
  return cached(key, KITSU_CACHE_TTL, async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), KITSU_TIMEOUT);
    try {
      const res = await fetch(KITSU_BASE + path, {
        headers: { Accept: "application/vnd.api+json" },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Kitsu ${res.status}: ${await res.text()}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  });
}

// ---- Response shapes (only the fields we use) ----

interface KitsuMedia {
  id: string;
  attributes: {
    canonicalTitle?: string | null;
    titles?: { en?: string | null; en_jp?: string | null } | null;
    synopsis?: string | null;
    posterImage?: { large?: string | null; medium?: string | null; original?: string | null } | null;
    coverImage?: { large?: string | null; original?: string | null } | null;
    startDate?: string | null;
    averageRating?: string | null;
    episodeCount?: number | null;
    episodeLength?: number | null;
    chapterCount?: number | null;
    volumeCount?: number | null;
    status?: string | null; // current / finished / upcoming / unreleased
    subtype?: string | null; // TV, movie, manga, novel…
  };
}

interface KitsuList { data: KitsuMedia[]; included?: { type: string; attributes: { title?: string | null } }[] }
interface KitsuSingle { data: KitsuMedia; included?: { type: string; attributes: { title?: string | null } }[] }

function yearFrom(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const year = parseInt(dateStr.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function normalizeStatus(status: string | null | undefined): string | null {
  switch (status) {
    case "current":
      return "RELEASING";
    case "finished":
      return "FINISHED";
    case "upcoming":
    case "unreleased":
      return "NOT_YET_RELEASED";
    default:
      return status ?? null;
  }
}

function posterOf(m: KitsuMedia): string | null {
  return m.attributes.posterImage?.large || m.attributes.posterImage?.medium || m.attributes.posterImage?.original || null;
}

function titleOf(m: KitsuMedia): string {
  return m.attributes.titles?.en || m.attributes.canonicalTitle || "Untitled";
}

function ratingOf(m: KitsuMedia): number | null {
  const r = m.attributes.averageRating;
  if (r == null) return null;
  const n = Number(r);
  return Number.isFinite(n) ? n / 10 : null;
}

function toAnimeSummary(m: KitsuMedia): MediaSummary {
  const a = m.attributes;
  const poster = posterOf(m);
  return {
    external_id: m.id,
    source: "kitsu",
    media_type: "anime",
    title: titleOf(m),
    overview: a.synopsis ?? null,
    poster_url: poster,
    backdrop_url: a.coverImage?.large || a.coverImage?.original || poster,
    release_year: yearFrom(a.startDate),
    vote_average: ratingOf(m),
    genres: [],
    runtime: a.episodeLength ?? null,
    season_count: a.episodeCount ?? null,
    status: normalizeStatus(a.status),
  };
}

function toMangaSummary(m: KitsuMedia): MediaSummary {
  const a = m.attributes;
  const poster = posterOf(m);
  return {
    external_id: m.id,
    source: "kitsu",
    media_type: "manga",
    title: titleOf(m),
    overview: a.synopsis ?? null,
    poster_url: poster,
    backdrop_url: a.coverImage?.large || a.coverImage?.original || poster,
    release_year: yearFrom(a.startDate),
    vote_average: ratingOf(m),
    genres: [],
    chapter_count: a.chapterCount ?? null,
    volume_count: a.volumeCount ?? null,
    status: normalizeStatus(a.status),
  };
}

// ---- Plain helpers (shared with anilist.functions.ts fallback chain) ----

// Kitsu categories are slugified genre names ("Sci-Fi" → "sci-fi").
function kitsuCategorySlugs(genres: string[]): string {
  return genres
    .map((g) => g.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean)
    .join(",");
}

export async function searchAnimeViaKitsu(q: string): Promise<MediaSummary[]> {
  const res = await kitsu<KitsuList>(`/anime?filter[text]=${encodeURIComponent(q)}&page[limit]=20`);
  return (res.data ?? []).map(toAnimeSummary);
}

export async function searchMangaViaKitsu(q: string): Promise<MediaSummary[]> {
  const res = await kitsu<KitsuList>(`/manga?filter[text]=${encodeURIComponent(q)}&page[limit]=20`);
  return (res.data ?? []).map(toMangaSummary);
}

export async function topAnimeViaKitsu(
  opts: { page?: number; genres?: string[]; sort?: "trending" | "popular" } = {},
): Promise<MediaSummary[]> {
  const params = new URLSearchParams({
    "page[limit]": "20",
    "page[offset]": String(((opts.page ?? 1) - 1) * 20),
    sort: "-userCount",
  });
  const cats = kitsuCategorySlugs(opts.genres ?? []);
  if (cats) params.set("filter[categories]", cats);
  const res = await kitsu<KitsuList>(`/anime?${params.toString()}`);
  return (res.data ?? []).map(toAnimeSummary);
}

export async function topMangaViaKitsu(
  opts: { page?: number; genres?: string[]; sort?: "top" | "popular" } = {},
): Promise<MediaSummary[]> {
  const params = new URLSearchParams({
    "page[limit]": "20",
    "page[offset]": String(((opts.page ?? 1) - 1) * 20),
    sort: opts.sort === "top" ? "-averageRating" : "-userCount",
  });
  const cats = kitsuCategorySlugs(opts.genres ?? []);
  if (cats) params.set("filter[categories]", cats);
  const res = await kitsu<KitsuList>(`/manga?${params.toString()}`);
  return (res.data ?? []).map(toMangaSummary);
}

export async function seasonalAnimeViaKitsu(): Promise<MediaSummary[]> {
  const res = await kitsu<KitsuList>(`/trending/anime?limit=20`);
  return (res.data ?? []).map(toAnimeSummary);
}

// ---- Server Functions (used by /media/{type}/kitsu/{id} detail pages) ----
// Kitsu has no cheap "relations" endpoint, so details return no relations —
// the franchise / More Like This sections simply stay hidden on kitsu pages.

function categoriesOf(included: { type: string; attributes: { title?: string | null } }[] | undefined): string[] {
  return (included ?? [])
    .filter((inc) => inc.type === "categories")
    .map((inc) => inc.attributes.title ?? "")
    .filter(Boolean)
    .slice(0, 8);
}

export const getKitsuAnimeDetails = createServerFn({ method: "GET" })
  .validator((input) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const res = await kitsu<KitsuSingle>(`/anime/${encodeURIComponent(data.id)}?include=categories`);
    const m = res.data;
    if (!m) throw new Error(`Anime not found (Kitsu ID: ${data.id})`);
    return {
      summary: { ...toAnimeSummary(m), genres: categoriesOf(res.included) },
      extra: {
        studios: [],
        episodes: m.attributes.episodeCount ?? null,
        rating: null,
        duration: m.attributes.episodeLength ? `${m.attributes.episodeLength} min per ep` : null,
        source: null,
        format: m.attributes.subtype?.toUpperCase() ?? null,
        season: null,
        seasonYear: yearFrom(m.attributes.startDate),
        relations: [],
      },
    };
  });

export const getKitsuMangaDetails = createServerFn({ method: "GET" })
  .validator((input) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const res = await kitsu<KitsuSingle>(`/manga/${encodeURIComponent(data.id)}?include=categories`);
    const m = res.data;
    if (!m) throw new Error(`Manga not found (Kitsu ID: ${data.id})`);
    return {
      summary: { ...toMangaSummary(m), genres: categoriesOf(res.included) },
      extra: {
        relations: [],
        chapters: m.attributes.chapterCount ?? null,
        volumes: m.attributes.volumeCount ?? null,
      },
    };
  });
