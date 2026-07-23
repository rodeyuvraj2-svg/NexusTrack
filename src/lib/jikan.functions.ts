import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { MediaSummary } from "./media-types";

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
}

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

async function jikan<T>(path: string): Promise<T> {
  const res = await fetch("https://api.jikan.moe/v4" + path);
  if (!res.ok) throw new Error(`Jikan ${res.status}`);
  return res.json() as Promise<T>;
}

export const searchAnime = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ q: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const r = await jikan<{ data: JikanAnime[] }>(`/anime?q=${encodeURIComponent(data.q)}&limit=12&sfw=true`);
    return r.data.map(toSummary);
  });

export const topAnime = createServerFn({ method: "GET" }).handler(async () => {
  const r = await jikan<{ data: JikanAnime[] }>(`/top/anime?limit=20&filter=bypopularity`);
  return r.data.map(toSummary);
});

export const seasonalAnime = createServerFn({ method: "GET" }).handler(async () => {
  const r = await jikan<{ data: JikanAnime[] }>(`/seasons/now?limit=20`);
  return r.data.map(toSummary);
});
