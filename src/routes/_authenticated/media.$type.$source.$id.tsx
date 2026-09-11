import { createFileRoute, useParams, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation, type UseQueryResult } from "@tanstack/react-query";
import { getDetails, cacheMedia, getRecommendations, getCast, reclassifyMedia, getTrailerKey } from "@/lib/tmdb.functions";
import { getAnimeDetails, getMultipleAnimeDetails, getMangaDetails, getMultipleMangaDetails } from "@/lib/anilist.functions";
import { getJikanAnimeDetails, getJikanMangaDetails, getMultipleJikanAnimeDetails, getMultipleJikanMangaDetails, getJikanDetailsByTitle } from "@/lib/jikan.functions";
import { getKitsuAnimeDetails, getKitsuMangaDetails } from "@/lib/kitsu.functions";
import { getLibraryItem, upsertLibraryItem, removeLibraryItem, listSeasonsWithProgress, setSeasonStatus, getMediaRowByExternal } from "@/lib/library.functions";
import { listReviews, upsertReview, deleteReview, toggleReviewLike } from "@/lib/reviews.functions";
import { createRecommendation, listRecommendableUsers, type RecommendableUser } from "@/lib/recommendations.functions";
import { STATUS_LABELS, STATUS_COLORS, getStatusLabel, type WatchStatus, type MediaSummary } from "@/lib/media-types";
import { MediaGrid } from "@/components/MediaCard";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { SectionHeader } from "@/components/PageHeader";
import { ErrorPanel } from "@/components/ErrorPanel";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRow } from "@/components/Skeletons";
import { SafeImage } from "@/components/SafeImage";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Star, Heart, Trash2, Check, ThumbsUp, MessageSquare, List, Play, CircleCheck, ArrowLeft, ExternalLink, Globe, BookmarkPlus, X, AlertCircle, Info, Send } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useGuest } from "@/lib/guest";
import type { RestrictedAction } from "@/lib/guest";

export const Route = createFileRoute("/_authenticated/media/$type/$source/$id")({
  head: () => ({ meta: [{ title: "Details — NexusTrack" }, { name: "description", content: "Track this title in your library, mark seasons, and see friends' progress." }] }),
  errorComponent: RouteErrorBoundary,
  component: MediaDetail,
});

const STATUS_OPTIONS: WatchStatus[] = ["planned", "watching", "completed"];

const SEASON_STATUS_ACTIONS: Array<{ key: WatchStatus; label: string; icon: typeof Play | typeof CircleCheck }> = [
  { key: "watching", label: "Watching", icon: Play },
  { key: "completed", label: "Completed", icon: CircleCheck },
  { key: "planned", label: "Plan to Read", icon: Play },
];

interface ReviewData {
  id: string;
  body: string;
  likes: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  profile: unknown;
  liked_by_me: boolean;
}

interface AnimeDetailsExtra {
  studios: string[];
  episodes: number | null;
  rating: string | null;
  duration: string | null;
  source: string | null;
  relations: Array<{
    relation: string;
    entries: Array<{ mal_id: number; name: string }>;
  }>;
}

interface MangaDetailsExtra {
  relations: Array<{
    relation: string;
    entries: Array<{ mal_id: number; name: string; poster_url: string | null; chapters: number | null; format: string | null }>;
  }>;
  chapters: number | null;
  volumes: number | null;
}

// ---- Types for season with progress ----
interface SeasonWithStatus {
  id: string;
  season_number: number;
  name: string | null;
  episode_count: number | null;
  air_date: string | null;
  poster_url: string | null;
  overview: string | null;
  status: string | null;
}

interface RelatedItem {
  mal_id: number;
  title: string;
  year: number | null;
  images: { jpg: { large_image_url: string | null; image_url: string | null } } | null;
  title_english?: string | null;
  synopsis?: string | null;
  episodes?: number | null;
  status?: string | null;
  type?: string;
  score?: number | null;
  genres?: { name: string }[];
  relation?: string;
}


// ---- Main Component ----

function MediaDetail() {
  const { type, source, id } = useParams({ from: "/_authenticated/media/$type/$source/$id" });
  const navigate = useNavigate();
  const router = useRouter();

  // True SPA back when there is in-app history (no reload — preserves the
  // previous page and its scroll position); dashboard only when the page was
  // opened directly in a fresh tab with nothing to go back to.
  const goBack = useCallback(() => {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: "/dashboard" });
  }, [router, navigate]);
  const qc = useQueryClient();

  // ---- Server Function Bindings ----
  const cacheFn = useServerFn(cacheMedia);
  const detailsFn = useServerFn(getDetails);
  const animeDetailsFn = useServerFn(getAnimeDetails);
  const jikanAnimeDetailsFn = useServerFn(getJikanAnimeDetails);
  const multipleAnimeDetailsFn = useServerFn(getMultipleAnimeDetails);
  const multipleJikanAnimeDetailsFn = useServerFn(getMultipleJikanAnimeDetails);
  const mangaDetailsFn = useServerFn(getMangaDetails);
  const jikanMangaDetailsFn = useServerFn(getJikanMangaDetails);
  const kitsuAnimeDetailsFn = useServerFn(getKitsuAnimeDetails);
  const kitsuMangaDetailsFn = useServerFn(getKitsuMangaDetails);
  const multipleMangaDetailsFn = useServerFn(getMultipleMangaDetails);
  const multipleJikanMangaDetailsFn = useServerFn(getMultipleJikanMangaDetails);
  const libFn = useServerFn(getLibraryItem);
  const mediaRowFn = useServerFn(getMediaRowByExternal);
  const upsertFn = useServerFn(upsertLibraryItem);
  const removeFn = useServerFn(removeLibraryItem);
  const seasonsFn = useServerFn(listSeasonsWithProgress);
  const setSeasonFn = useServerFn(setSeasonStatus);
  const recsFn = useServerFn(getRecommendations);
  const castFn = useServerFn(getCast);
  const reviewsFn = useServerFn(listReviews);
  const upsertReviewFn = useServerFn(upsertReview);
  const deleteReviewFn = useServerFn(deleteReview);
  const likeReviewFn = useServerFn(toggleReviewLike);
  const reclassifyFn = useServerFn(reclassifyMedia);
  const recommendFn = useServerFn(createRecommendation);
  const recommendableUsersFn = useServerFn(listRecommendableUsers);

  // ---- Recommend to Friend ----
  const [showRecommend, setShowRecommend] = useState(false);
  const recommendableQ = useQuery({
    queryKey: ["recommendable-users"],
    queryFn: () => recommendableUsersFn(),
    enabled: showRecommend,
    staleTime: 60_000,
  });
  const mRecommend = useMutation({
    mutationFn: (input: { recipient_id: string; message?: string }) =>
      recommendFn({
        data: {
          ...input,
          is_fallback: summary?.is_fallback ?? false,
          media: {
            source: source as "tmdb" | "anilist" | "jikan" | "kitsu",
            media_type: type as "movie" | "tv" | "anime" | "manga",
            external_id: id,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Recommendation sent!");
      setShowRecommend(false);
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
    onError: (e) => toast.error(e.message),
  });

  // ---- Local State ----
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null)); }, []);

  // ---- Reclassify mutation ----
  const mReclassify = useMutation({
    mutationFn: (newType: "movie" | "tv" | "anime" | "manga") =>
      reclassifyFn({ data: { media_id: mediaId!, new_type: newType } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cache", type, source, id] });
      toast.success("Reclassified!");
      // Refresh the page to reflect changes
      window.location.reload();
    },
    onError: (e) => toast.error(e.message),
  });

  // ---- Fetch Details (independent of cache) ----
  // Anime/manga items come from AniList, Jikan (MyAnimeList) or Kitsu —
  // each with its own details endpoint. Everything else is TMDB.
  const isJikan = source === "jikan";
  const isKitsu = source === "kitsu";
  const isAnime = (source === "anilist" || isJikan || isKitsu) && type !== "manga";
  const isManga = type === "manga";

  // Separate queries for TMDB vs anime/manga APIs due to different return types
  const tmdbDetailsQ = useQuery({
    queryKey: ["details", type, id],
    queryFn: () => detailsFn({ data: { type: type as "movie" | "tv", id } }),
    enabled: !isAnime,
    retry: 2,
    staleTime: 300_000,
  });

  const animeDetailsQ = useQuery({
    queryKey: ["anime-details", source, id],
    queryFn: () => {
      if (isJikan) return jikanAnimeDetailsFn({ data: { id } });
      if (isKitsu) return kitsuAnimeDetailsFn({ data: { id } });
      return animeDetailsFn({ data: { id } });
    },
    enabled: isAnime,
    retry: 1,
    staleTime: 300_000,
  });

  const mangaDetailsQ = useQuery({
    queryKey: ["manga-details", source, id],
    queryFn: () => {
      if (isJikan) return jikanMangaDetailsFn({ data: { id } });
      if (isKitsu) return kitsuMangaDetailsFn({ data: { id } });
      return mangaDetailsFn({ data: { id } });
    },
    enabled: isManga,
    retry: 1,
    staleTime: 300_000,
  });

  const detailsLoading = isManga ? mangaDetailsQ.isLoading : isAnime ? animeDetailsQ.isLoading : tmdbDetailsQ.isLoading;
  const detailsError = isManga ? mangaDetailsQ.isError : isAnime ? animeDetailsQ.isError : tmdbDetailsQ.isError;
  const detailsErrorMsg = isManga ? mangaDetailsQ.error?.message : isAnime ? animeDetailsQ.error?.message : tmdbDetailsQ.error?.message;
  const refetchDetails = isManga ? () => mangaDetailsQ.refetch() : isAnime ? () => animeDetailsQ.refetch() : () => tmdbDetailsQ.refetch();

  // ---- Cache / Media ID (for library features) ----
  const cached = useQuery({
    queryKey: ["cache", type, source, id],
    queryFn: () => cacheFn({ data: { type: type as "movie" | "tv" | "anime" | "manga", source: source as "tmdb" | "anilist" | "jikan" | "kitsu", external_id: id } }),
    retry: 1,
    staleTime: 60_000,
    // Don't fail the whole page if caching fails — it just means no library features
  });

  // Existing media row (never provisions) — lets the page render cached
  // metadata when the details API is down, even if cacheMedia above fails.
  const mediaRowQ = useQuery({
    queryKey: ["media-row", type, source, id],
    queryFn: () => mediaRowFn({ data: { source: source as "tmdb" | "anilist" | "jikan" | "kitsu", media_type: type as "movie" | "tv" | "anime" | "manga", external_id: id } }),
    retry: 1,
    staleTime: 60_000,
  });

  const mediaId = cached.data?.id ?? mediaRowQ.data?.id ?? undefined;
  const mediaRowTitle = mediaRowQ.data?.title ?? undefined;

  // Cross-provider rescue: when an AniList-saved item can't reach AniList,
  // look the saved title up on Jikan and use its full details (studios,
  // relations, episodes) for display. Library identity stays anilist.
  const jikanByTitleFn = useServerFn(getJikanDetailsByTitle);
  const crossDetailsQ = useQuery({
    queryKey: ["cross-details", source, id, mediaRowTitle],
    queryFn: () => jikanByTitleFn({ data: { title: mediaRowTitle!, type: isManga ? "manga" : "anime" } }),
    enabled: detailsError && source === "anilist" && !!mediaRowTitle,
    retry: 0,
    staleTime: 300_000,
  });
  const usingCrossProvider = !!crossDetailsQ.data?.summary;

  // Use a common interface for the data — prefer the item's own provider,
  // then the cross-provider lookup, then nothing (cached row takes over).
  const ownDetails = isManga
    ? { summary: mangaDetailsQ.data?.summary, extra: mangaDetailsQ.data?.extra }
    : isAnime
    ? { summary: animeDetailsQ.data?.summary, extra: animeDetailsQ.data?.extra }
    : { summary: tmdbDetailsQ.data?.summary, seasons: tmdbDetailsQ.data?.seasons, extra: undefined };
  const detailsData = ownDetails.summary
    ? ownDetails
    : crossDetailsQ.data?.summary
    ? { summary: crossDetailsQ.data.summary, extra: crossDetailsQ.data.extra }
    : ownDetails;

  // Which provider the loaded relations/ids belong to — franchise links and
  // the related-details batch fetch must use the SAME provider's ids.
  const relationsSource = (detailsData.summary?.source ?? source) as "anilist" | "jikan" | "kitsu";

  // Unified summary — the cached Supabase row renders IMMEDIATELY (while the
  // details API is still fetching/retrying) so the page never sits on a
  // skeleton during an API outage. When live details arrive they take over;
  // if they fail, the saved data stays and the banner below explains why
  // extras (studios, related titles) are missing.
  const fallbackSummary: MediaSummary | undefined = useMemo(() => {
    const row = mediaRowQ.data;
    if (!row) return undefined;
    return {
      external_id: row.external_id,
      source: row.source as MediaSummary["source"],
      media_type: row.media_type as MediaSummary["media_type"],
      title: row.title,
      overview: row.overview ?? null,
      poster_url: row.poster_url ?? null,
      backdrop_url: row.backdrop_url ?? null,
      release_year: row.release_year ?? null,
      vote_average: row.vote_average ?? null,
      genres: row.genres ?? [],
      runtime: row.runtime ?? null,
      season_count: row.season_count ?? null,
      chapter_count: row.chapter_count ?? null,
      volume_count: row.volume_count ?? null,
      status: row.status ?? null,
    };
  }, [mediaRowQ.data]);
  const usingCachedRow = detailsError && fallbackSummary !== undefined && !detailsData.summary;
  const summary: MediaSummary | undefined = detailsData.summary ?? fallbackSummary;

  // ---- Clipboard Helper ----
  const copyTitle = useCallback(async (label: string) => {
    if (!summary?.title) return;
    try {
      await navigator.clipboard.writeText(label);
      toast.success(`Copied "${label}" to clipboard.`);
    } catch {
      // Clipboard permission denied — continue silently
    }
  }, [summary?.title]);

  // ---- TMDB Watch Providers ----

  // Relations (Anime/Manga) — from whichever provider supplied the details
  const relations = detailsData.extra?.relations ?? [];

  // Related anime/manga details (for franchise view) — fetched from the same
  // provider the relations (and their ids) came from.
  const relatedIds = useMemo(() => {
    if (relations.length === 0) return [];
    const ids = new Set<string>();
    for (const rel of relations) {
      for (const entry of rel.entries) {
        if (String(entry.mal_id) !== id) ids.add(String(entry.mal_id));
      }
    }
    return Array.from(ids).slice(0, 8);
  }, [relations, id]);

  const relatedDetailsQ = useQuery<RelatedItem[]>({
    queryKey: ["related-anime", relationsSource, ...relatedIds],
    queryFn: async () => {
      if (isManga) {
        return (relationsSource === "jikan"
          ? multipleJikanMangaDetailsFn({ data: { ids: relatedIds } })
          : multipleMangaDetailsFn({ data: { ids: relatedIds.map(Number) } })) as unknown as RelatedItem[];
      }
      return (relationsSource === "jikan"
        ? multipleJikanAnimeDetailsFn({ data: { ids: relatedIds } })
        : multipleAnimeDetailsFn({ data: { ids: relatedIds } })) as unknown as RelatedItem[];
    },
    enabled: relatedIds.length > 0,
    staleTime: 300_000,
    retry: 1,
  });

  // Organize related entries by relation type for display
  const franchiseMap = useMemo(() => {
    if (relations.length === 0) return null;
    return relations.reduce((acc, rel) => {
      acc[rel.relation] = rel.entries;
      return acc;
    }, {} as Record<string, Array<{ mal_id: number; name: string }>>);
  }, [relations]);

  // ---- Library Entry ----
  const libraryEntry = useQuery({
    queryKey: ["library-entry", mediaId],
    queryFn: () => libFn({ data: { media_id: mediaId! } }),
    enabled: !!mediaId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (libraryEntry.data?.notes !== undefined) {
      setNotes(libraryEntry.data.notes ?? "");
    }
  }, [libraryEntry.data?.notes]);

  // ---- Seasons (for TV and anime, but not manga) ----
  const hasSeasons = (type === "tv" || isAnime) && !isManga;
  const seasons = useQuery({
    queryKey: ["seasons", mediaId],
    queryFn: () => seasonsFn({ data: { media_id: mediaId! } }),
    enabled: !!mediaId && hasSeasons,
    staleTime: 30_000,
  });

  // ---- Recs, Cast ----
  const isTmdbWithType = source === "tmdb" && (type === "movie" || type === "tv") && !isManga;
  const recs = useQuery({
    queryKey: ["recommendations", type, id],
    queryFn: () => recsFn({ data: { type: type as "movie" | "tv", id } }),
    enabled: isTmdbWithType,
    staleTime: 300_000,
  });
  const castQ = useQuery({
    queryKey: ["cast", type, id],
    queryFn: () => castFn({ data: { type: type as "movie" | "tv", id } }),
    enabled: isTmdbWithType,
    staleTime: 300_000,
  });

  // ---- Trailer ----
  const getTrailerFn = useServerFn(getTrailerKey);
  const trailerQ = useQuery({
    queryKey: ["trailer", type, id],
    queryFn: () => getTrailerFn({ data: { type: type as "movie" | "tv", id } }),
    enabled: isTmdbWithType,
    staleTime: Infinity,
  });
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const trailerKey = trailerQ.data;

  // ---- Reviews ----
  const reviews = useQuery<ReviewData[]>({
    queryKey: ["reviews", mediaId],
    queryFn: () => reviewsFn({ data: { media_id: mediaId! } }),
    enabled: !!mediaId,
    staleTime: 30_000,
  });

  // Fetch watch status of all related items in the franchise for this user
  const franchiseStatusesQ = useQuery({
    queryKey: ["franchise-statuses", relatedIds, id, currentUserId],
    queryFn: async () => {
      const allExternalIds = [id, ...relatedIds];
      const { data, error } = await supabase
        .from("user_media")
        .select(`
          status,
          favorite,
          media:media_id!inner(external_id, source)
        `)
        .eq("user_id", currentUserId!)
        .in("media.source", ["anilist", "jikan", "kitsu"])
        .in("media.external_id", allExternalIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: (isAnime || isManga) && !!currentUserId && (relatedIds.length > 0 || !!id),
    staleTime: 30_000,
  });

  const franchiseStatuses = franchiseStatusesQ.data ?? [];
  const statusMap = useMemo(() => {
    const map = new Map<string, { status: string; favorite: boolean }>();
    for (const row of franchiseStatuses) {
      const m = row.media as unknown as { external_id: string; source: string } | null;
      if (m?.external_id) {
        map.set(m.external_id, { status: row.status, favorite: row.favorite });
      }
    }
    return map;
  }, [franchiseStatuses]);

  // Helper to find the relation for a given related mal_id
  const relationForId = (malId: number) => {
    for (const rel of relations) {
      if (rel.entries.some((e) => e.mal_id === malId)) {
        return rel.relation;
      }
    }
    return "Related";
  };

  // Related items that aren't prequel/sequel — for "More Like This" section
  const animeRecommendations = useMemo(() => {
    if (!(isAnime || isManga) || !relatedDetailsQ.data) return [];
    const items = [];
    for (const item of relatedDetailsQ.data) {
      const rel = relationForId(item.mal_id);
      if (["PREQUEL", "SEQUEL", "PARENT_STORY"].includes(rel.toUpperCase())) continue;
      items.push(item);
    }
    return items;
  }, [isAnime, isManga, relatedDetailsQ.data, relations]);

  const franchiseList = useMemo(() => {
    if (!summary || !(isAnime || isManga)) return [];

    const items = [];

    // Add current item
    items.push({
      mal_id: Number(id),
      title: summary.title,
      year: summary.release_year ?? 0,
      poster_url: summary.poster_url,
      relation: "Currently Viewing",
      isCurrent: true,
    });

    // Add related items — only show prequel, sequel, and the current entry
    if (relatedDetailsQ.data) {
      for (const item of relatedDetailsQ.data) {
        const rel = relationForId(item.mal_id);
        if (!["PREQUEL", "SEQUEL", "PARENT_STORY"].includes(rel.toUpperCase())) continue;
        const poster = item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null;
        items.push({
          mal_id: item.mal_id,
          title: item.title,
          year: item.year ?? 0,
          poster_url: poster,
          relation: rel,
          isCurrent: false,
        });
      }
    }

    // Sort by year, then by mal_id to have a line of seasons/OVAs/etc.
    return items.sort((a, b) => {
      if (a.year === b.year) return a.mal_id - b.mal_id;
      if (!a.year) return 1;
      if (!b.year) return -1;
      return a.year - b.year;
    });
  }, [summary, isAnime, isManga, id, relatedDetailsQ.data, relations]);

  // ---- Mutations ----
  type UpsertPayload = { media_id: string; status?: WatchStatus; rating?: number | null; favorite?: boolean; hidden?: boolean; notes?: string | null };

  const { requireAuth } = useGuest();

  const mUpsert = useMutation({
    mutationFn: (payload: UpsertPayload) => upsertFn({ data: payload }),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["library-entry", mediaId] });
      const prev = qc.getQueryData(["library-entry", mediaId]);
      qc.setQueryData(["library-entry", mediaId], (old: unknown) => {
        const base = (old as { status?: WatchStatus; favorite?: boolean; rating?: number | null; notes?: string | null } | null) ?? { status: "planned" as WatchStatus, favorite: false, rating: null, notes: null };
        return { ...base, ...payload };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(["library-entry", mediaId], ctx?.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["library-entry", mediaId] });
      qc.invalidateQueries({ queryKey: ["library"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const mRemove = useMutation({
    mutationFn: () => removeFn({ data: { media_id: mediaId! } }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["library-entry", mediaId] });
      const prev = qc.getQueryData(["library-entry", mediaId]);
      qc.setQueryData(["library-entry", mediaId], null);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(["library-entry", mediaId], ctx?.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["library-entry", mediaId] });
      qc.invalidateQueries({ queryKey: ["library"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Removed from library");
    },
  });

  const mSetSeason = useMutation({
    mutationFn: (payload: { season_id: string; status: WatchStatus }) =>
      setSeasonFn({ data: { media_id: mediaId!, season_id: payload.season_id, status: payload.status } }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["seasons", mediaId] });
      qc.invalidateQueries({ queryKey: ["library-entry", mediaId] });
      qc.invalidateQueries({ queryKey: ["library"] });
      if (result.overallChanged) {
        toast.success("All seasons completed — series marked as watched!");
      }
    },
  });

  const markMainAnimeAsPlanned = useMutation({
    mutationFn: async (item: { mal_id: number; title: string }) => {
      const contentType = isManga ? "manga" : "anime";
      const cacheRes = await cacheFn({
        data: {
          type: contentType,
          // Franchise entries carry the relation provider's ids — provision
          // with that source, not the page's source.
          source: relationsSource,
          external_id: String(item.mal_id),
        },
      });
      if (!cacheRes?.id) throw new Error(`Failed to cache main ${contentType}`);
      await upsertFn({
        data: {
          media_id: cacheRes.id,
          status: "planned",
        },
      });
      return cacheRes.id;
    },
    onSuccess: (_targetMediaId, vars) => {
      qc.invalidateQueries({ queryKey: ["library"] });
      qc.invalidateQueries({ queryKey: ["franchise-statuses"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success(`Marked "${vars.title}" as Planned in your library!`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to add to library");
    },
  });

  const handleStatusChange = (opt: WatchStatus) => {
    const action = opt === "watching" ? "markWatching" : opt === "completed" ? "markCompleted" : "addToWatchlist";
    if (!requireAuth(action)) return;
    if (opt === "planned" && (isAnime || isManga) && franchiseList.length > 0) {
      const mainAnime = franchiseList[0];
      if (mainAnime && mainAnime.mal_id !== Number(id)) {
        markMainAnimeAsPlanned.mutate(mainAnime);
        return;
      }
    }
    mUpsert.mutate({ media_id: mediaId!, status: opt });
  };

  // ---- Loading / Error States ----
  // Skeleton only while there's nothing to show at all — if the cached row
  // already gave us a summary, render it instead of blocking on the API.
  if (detailsLoading && !summary) return <DetailSkeleton />;
  if (!summary) {
    return (
      <ErrorPanel
        tone="destructive"
        title="Could not load details"
        detail={detailsErrorMsg || "The API might be temporarily unavailable."}
        action={
          <div className="flex gap-2 justify-center">
            <button onClick={() => refetchDetails()} className="rounded-lg bg-gradient-accent px-5 py-2 text-sm font-semibold text-white">Try again</button>
            <Link to="/dashboard" className="rounded-lg glass px-5 py-2 text-sm font-medium">Go home</Link>
          </div>
        }
      />
    );
  }

  const entry = libraryEntry.data;
  const seasonList = (seasons.data ?? []) as SeasonWithStatus[];
  const entryFavorited = entry?.favorite ?? false;

  const handleFavorite = () => {
    if (!requireAuth("addFavorite")) return;
    mUpsert.mutate({ media_id: mediaId!, favorite: !entryFavorited });
  };

  const handleRemove = () => {
    mRemove.mutate();
  };

  const handleRating = (n: number) => {
    if (!requireAuth("rateMedia")) return;
    mUpsert.mutate({ media_id: mediaId!, rating: entry?.rating === n ? null : n });
  };

  return (
    <div className="max-w-full">
      {usingCrossProvider ? (
        <div className="mb-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs text-primary flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0" />
          <span>AniList is unreachable right now — showing matching data from MyAnimeList.</span>
        </div>
      ) : usingCachedRow ? (
        <div className="mb-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-xs text-warning flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            The {source === "jikan" ? "Jikan" : source === "kitsu" ? "Kitsu" : source === "anilist" ? "AniList" : "TMDB"} API is unreachable right now —
            showing your saved info. Some details (studios, related titles) may be missing.
          </span>
        </div>
      ) : null}
      {/* Back button — a plain in-flow child of the content container, aligned
          to its padding gutter (px-4/px-8). It cannot be clipped or slide
          under the sidebar at any width because it never leaves the content
          box — no negative margins, no absolute positioning. */}
      <div className="relative z-20 mb-2">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-2 rounded-full bg-background/70 border border-border/40 backdrop-blur-md px-4 py-2 text-sm font-semibold text-foreground hover:bg-background/90 transition-all shadow-xl"
          title="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>
      </div>

      {/* Hero — full-bleed backdrop pulled up UNDER the button row (the button
          floats over its top-left, matching the original design). The -mt is
          sized so the hero never rises above the main content box, so nothing
          here can be clipped by ancestors. Spacer keeps the original hero
          height so the poster overlap below is unchanged. */}
      <div className="relative -mx-4 md:-mx-8 -mt-16 mb-4 md:mb-8">
        {/* Backdrop photo (background layer) */}
        <div className="absolute inset-0 overflow-hidden">
          {summary.backdrop_url ? (
            <SafeImage src={summary.backdrop_url} alt="" wrapperClassName="h-full w-full" className="h-full w-full object-cover opacity-30" />
          ) : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent/20" />}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        </div>

        {/* Spacer preserving the hero height (button row sits over the top) */}
        <div className="h-[180px] md:h-[300px]" />
      </div>

      {/* === MOBILE LAYOUT (< md) === */}
      <div className="md:hidden">
        {/* Poster + Title + Meta */}
        <div className="flex flex-col items-center px-4">
          {/* Poster — centered, ~50% width */}
          <div className="w-3/5 max-w-[200px] aspect-[2/3] rounded-xl overflow-hidden glass shadow-2xl -mt-20 relative z-10">
            <SafeImage
              src={summary.poster_url}
              alt={summary.title}
              wrapperClassName="h-full w-full"
              className="h-full w-full object-cover"
            />
          </div>

          {/* Type / Meta */}
          <div className="mt-4 flex items-center justify-center gap-2 flex-wrap text-xs uppercase tracking-widest text-muted-foreground">
            {mediaId && !mReclassify.isPending ? (
              <select
                value={type}
                onChange={(e) => mReclassify.mutate(e.target.value as "movie" | "tv" | "anime" | "manga")}
                className="rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-xs font-semibold text-accent focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
              >
                <option value="movie">MOVIE</option>
                <option value="tv">TV</option>
                <option value="anime">ANIME</option>
                <option value="manga">MANGA</option>
              </select>
            ) : (
              <span className="text-accent font-semibold">{type}</span>
            )}
            {summary.release_year ? <span>· {summary.release_year}</span> : null}
            {isManga ? (
              <>
                {mangaDetailsQ.data?.extra?.chapters ? <span>· {mangaDetailsQ.data.extra.chapters} chapters</span> : null}
                {mangaDetailsQ.data?.extra?.volumes ? <span>· {mangaDetailsQ.data.extra.volumes} volumes</span> : null}
              </>
            ) : (
              <>
                {summary.runtime ? <span>· {summary.runtime}m</span> : null}
                {isAnime && animeDetailsQ.data?.extra?.duration ? <span>· {animeDetailsQ.data.extra.duration}</span> : null}
              </>
            )}
          </div>

          {/* Title */}
          <h1 className="mt-2 text-3xl font-black text-center px-2">{summary.title}</h1>

          {/* Rating */}
          {summary.vote_average ? (
            <div className="mt-2 flex items-center justify-center gap-1 text-warning">
              <Star className="h-5 w-5 fill-current" /> <span className="font-semibold text-lg">{summary.vote_average.toFixed(1)}</span>
              <span className="text-muted-foreground text-sm ml-1">/ 10</span>
            </div>
          ) : null}

          {/* Director */}
          {castQ.data?.director ? <p className="mt-1 text-sm text-muted-foreground text-center">Directed by {castQ.data.director}</p> : null}

          {/* Genres */}
          {summary.genres?.length ? (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {summary.genres.map((g) => <span key={g} className="rounded-full glass px-3 py-0.5 text-xs">{g}</span>)}
            </div>
          ) : null}

          {/* Overview */}
          {summary.overview ? (
            <p className="mt-4 w-full text-base text-muted-foreground leading-relaxed text-center max-w-2xl mx-auto">{summary.overview}</p>
          ) : null}
        </div>

        {/* Mobile Action Buttons — 2-column grid */}
        <div className="px-4 mt-6 w-full">
          {!entry?.id ? (
            /* Not in library: single full-width button */
            <button
              disabled={mUpsert.isPending || !mediaId}
              onClick={() => handleStatusChange("planned")}
              className="w-full min-h-[44px] rounded-lg bg-gradient-accent text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              <BookmarkPlus className="inline h-4 w-4 mr-1.5" />
              {getStatusLabel("planned", summary?.media_type)}
            </button>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map((opt) => {
                  const active = entry?.status === opt;
                  return (
                    <button
                      key={opt}
                      disabled={mUpsert.isPending || !mediaId}
                      onClick={() => handleStatusChange(opt)}
                      className={cn(
                        "w-full min-h-[44px] rounded-lg text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5",
                        active ? "bg-gradient-accent text-white" : "glass hover:bg-muted/40"
                      )}
                    >
                      {active ? <Check className="h-4 w-4" /> : null}
                      {getStatusLabel(opt, summary?.media_type)}
                    </button>
                  );
                })}
                <button
                  disabled={mUpsert.isPending || !mediaId}
                  onClick={handleFavorite}
                  className={cn(
                    "w-full min-h-[44px] rounded-lg text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5",
                    entryFavorited ? "bg-accent/25 text-accent" : "glass hover:bg-muted/40"
                  )}
                >
                  <Heart className={cn("h-4 w-4", entryFavorited && "fill-current")} />
                  {entryFavorited ? "Favorited" : "Favorite"}
                </button>
              </div>
              {entry ? (
                <button
                  onClick={handleRemove}
                  disabled={mRemove.isPending}
                  className="mt-2 w-full min-h-[44px] rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </button>
              ) : null}
            </>
          )}
          {!summary?.is_fallback ? (
            <button
              onClick={() => setShowRecommend(true)}
              className="mt-2 w-full min-h-[44px] rounded-lg glass text-sm font-medium hover:bg-muted/40 flex items-center justify-center gap-1.5"
            >
              <Send className="h-4 w-4" /> Recommend to Friend
            </button>
          ) : null}
        </div>

        {/* Trailer (mobile) */}
        {trailerKey ? (
          <div className="px-4 mt-4">
            <button
              onClick={() => setShowTrailerModal(true)}
              className="w-full min-h-[44px] rounded-lg bg-destructive/15 border border-destructive/30 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/25 transition-colors flex items-center justify-center gap-1.5"
            >
              <Play className="h-4 w-4 fill-current" /> Watch Trailer
            </button>
          </div>
        ) : null}

        {/* No mediaId message */}
        {!mediaId && !cached.isLoading ? (
          <p className="mt-3 text-xs text-muted-foreground text-center px-4">Library features require the service role to be configured.</p>
        ) : null}

        {/* Rating (if in library) */}
        {entry ? (
          <div className="px-4 mt-6">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Your rating</label>
            <div className="mt-1 flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button key={n}
                  onClick={() => handleRating(n)}
                  className={cn("h-9 w-9 shrink-0 rounded-md text-sm font-semibold transition-colors", entry.rating && entry.rating >= n ? "bg-warning text-background" : "glass hover:bg-muted/40")}
                >{n}</button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Notes (if in library) */}
        {entry ? (
          <div className="px-4 mt-6">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Private notes</label>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== (entry.notes ?? "") && mUpsert.mutate({ media_id: mediaId!, notes: notes || null })}
              rows={3} maxLength={1000}
              className="mt-1 w-full rounded-lg border border-input bg-background/40 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Thoughts, favorite scenes, watch date…"
            />
          </div>
        ) : null}
      </div>

      {/* === DESKTOP LAYOUT (md+) === */}
      <div className="hidden md:grid gap-8 md:grid-cols-[220px_1fr]">
        {/* Poster */}
        <div className="glass rounded-xl overflow-hidden aspect-[2/3] -mt-40 shadow-2xl relative z-10 max-w-[220px]">
          <SafeImage
            src={summary.poster_url}
            alt={summary.title}
            wrapperClassName="h-full w-full"
            className="h-full w-full object-cover"
          />
        </div>

        {/* Info column */}
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2 flex-wrap">
            {mediaId && !mReclassify.isPending ? (
              <select
                value={type}
                onChange={(e) => mReclassify.mutate(e.target.value as "movie" | "tv" | "anime")}
                className="rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-xs font-semibold text-accent focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
              >
                <option value="movie">MOVIE</option>
                <option value="tv">TV</option>
                <option value="anime">ANIME</option>
                <option value="manga">MANGA</option>
              </select>
            ) : (
              <span className="text-accent font-semibold">{type}</span>
            )}
            {summary.release_year ? <span>· {summary.release_year}</span> : null}
            {isManga ? (
              <>
                {mangaDetailsQ.data?.extra?.chapters ? <span>· {mangaDetailsQ.data.extra.chapters} chapters</span> : null}
                {mangaDetailsQ.data?.extra?.volumes ? <span>· {mangaDetailsQ.data.extra.volumes} volumes</span> : null}
              </>
            ) : (
              <>
                {summary.runtime ? <span>· {summary.runtime}m</span> : null}
                {isAnime && animeDetailsQ.data?.extra?.duration ? <span>· {animeDetailsQ.data.extra.duration}</span> : null}
              </>
            )}
          </div>
          <h1 className="mt-2 text-5xl font-black">{summary.title}</h1>
          {summary.vote_average ? (
            <div className="mt-2 flex items-center gap-1 text-warning">
              <Star className="h-4 w-4 fill-current" /> <span className="font-semibold">{summary.vote_average.toFixed(1)}</span>
              <span className="text-muted-foreground text-sm ml-1">/ 10</span>
            </div>
          ) : null}
          {castQ.data?.director ? <p className="mt-1 text-sm text-muted-foreground">Directed by {castQ.data.director}</p> : null}
          {summary.genres?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {summary.genres.map((g) => <span key={g} className="rounded-full glass px-3 py-0.5 text-xs">{g}</span>)}
            </div>
          ) : null}
          <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">{summary.overview}</p>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-2">
            {(entry?.id ? STATUS_OPTIONS : STATUS_OPTIONS.filter((o) => o === "planned")).map((opt) => {
              const mainAnime = franchiseList[0];
              const isPlannedRedirection = opt === "planned" && isAnime && mainAnime && mainAnime.mal_id !== Number(id);

              const active = isPlannedRedirection
                ? statusMap.get(String(mainAnime.mal_id))?.status === "planned"
                : entry?.status === opt;

              const disabled = isPlannedRedirection
                ? markMainAnimeAsPlanned.isPending
                : mUpsert.isPending || !mediaId;

              return (
                <button
                  key={opt}
                  disabled={disabled}
                  onClick={() => handleStatusChange(opt)}
                  className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40", active ? "bg-gradient-accent text-white" : "glass hover:bg-muted/40")}
                >
                  {active ? <Check className="inline h-4 w-4 mr-1" /> : null}
                  {getStatusLabel(opt, summary?.media_type)}
                </button>
              );
            })}
            <button
              disabled={mUpsert.isPending || !mediaId}
              onClick={handleFavorite}
              className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40", entryFavorited ? "bg-accent/25 text-accent" : "glass hover:bg-muted/40")}
            >
              <Heart className={cn("inline h-4 w-4 mr-1", entryFavorited && "fill-current")} /> {entryFavorited ? "Favorited" : "Favorite"}
            </button>
            {!summary?.is_fallback ? (
              <button
                onClick={() => setShowRecommend(true)}
                className="rounded-lg px-4 py-2 text-sm font-medium glass hover:bg-muted/40"
              >
                <Send className="inline h-4 w-4 mr-1" /> Recommend
              </button>
            ) : null}
            {entry ? (
              <button onClick={handleRemove} disabled={mRemove.isPending} className="rounded-lg px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10">
                <Trash2 className="inline h-4 w-4 mr-1" /> Remove
              </button>
            ) : null}
            {trailerKey ? (
              <button
                onClick={() => setShowTrailerModal(true)}
                className="rounded-lg bg-destructive/15 border border-destructive/30 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/25 transition-colors flex items-center gap-1.5"
              >
                <Play className="h-4 w-4 fill-current" /> Watch Trailer
              </button>
            ) : null}
          </div>

          {/* No mediaId message */}
          {!mediaId && !cached.isLoading ? (
            <p className="mt-3 text-xs text-muted-foreground">Library features require the service role to be configured.</p>
          ) : null}

          {/* Rating */}
          {entry ? (
            <div className="mt-6">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Your rating</label>
              <div className="mt-1 flex gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n}
                    onClick={() => handleRating(n)}
                    className={cn("h-8 w-8 rounded-md text-xs font-semibold transition-colors", entry.rating && entry.rating >= n ? "bg-warning text-background" : "glass hover:bg-muted/40")}
                  >{n}</button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Notes */}
          {entry ? (
            <div className="mt-6 max-w-xl">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Private notes</label>
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notes !== (entry.notes ?? "") && mUpsert.mutate({ media_id: mediaId!, notes: notes || null })}
                rows={3} maxLength={1000}
                className="mt-1 w-full rounded-lg border border-input bg-background/40 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Thoughts, favorite scenes, watch date…"
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* === SHARED SECTIONS (mobile + desktop) === */}

      {/* ---- Watch on (free streaming / reading sites) ---- */}
      {summary?.title ? (
        <section className="mt-6 md:mt-12 px-4 md:px-0">
          <SectionHeader
            className="mb-3 md:mb-4"
            title={<span className="flex items-center gap-2"><ExternalLink className="h-5 w-5 text-primary" /> {isManga ? "Read online" : "Watch online"}</span>}
          />
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:flex-wrap md:snap-none md:overflow-visible">
            {(isManga
              ? [
                  { name: "MangaDex", url: "https://mangadex.org" },
                  { name: "MangaPlus", url: "https://mangaplus.shueisha.co.jp" },
                  { name: "MangaFire", url: "https://mangafire.to" },
                ]
              : isAnime
              ? [
                  { name: "AnimeX", url: "https://animex.one" },
                  { name: "AnimePahe", url: "https://animepahe.pw" },
                  { name: "Anikoto", url: "https://anikoto.cz" },
                ]
              : [
                  { name: "Cinevaro", url: "https://cinevaro.app" },
                  { name: "Attacker", url: "https://attacker.bz" },
                  { name: "NightFlix", url: "https://www.nightflix.to" },
                  { name: "MoviesJoy", url: "https://moviesjoy.bz" },
                ]
            ).map((site) => (
              <button
                key={site.name}
                onClick={async () => {
                  await copyTitle(summary?.title ?? "");
                  window.open(site.url, "_blank", "noopener,noreferrer");
                }}
                className="inline-flex items-center gap-2 rounded-lg glass px-4 py-2.5 text-sm font-medium shrink-0 snap-start whitespace-nowrap hover:bg-muted/40 hover:scale-[1.02] transition-all cursor-pointer"
              >
                <Play className={`h-4 w-4 ${isAnime ? "text-primary" : "text-green-500"}`} />
                {site.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- Franchise Timeline (anime/manga) ---- */}
      {(isAnime || isManga) && franchiseList.length > 0 ? (
        <section className="mt-6 md:mt-12 px-4 md:px-0">
          <SectionHeader
            className="mb-3 md:mb-4"
            title={<span className="flex items-center gap-2"><List className="h-5 w-5 text-warning" /> {isManga ? "Related manga" : "Seasons, OVAs & Movies"}</span>}
          />
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-muted">
            {franchiseList.map((item) => {
              const itemStatus = statusMap.get(String(item.mal_id));
              return (
                <Link
                  key={item.mal_id}
                  to="/media/$type/$source/$id"
                  params={{ type: (isManga ? "manga" : "anime") as "manga" | "anime", source: (item.isCurrent ? source : relationsSource) as "anilist" | "jikan" | "kitsu", id: String(item.mal_id) }}
                  className={cn(
                    "group relative flex w-40 shrink-0 snap-start flex-col overflow-hidden rounded-xl glass hover:ring-2 hover:ring-accent transition-all",
                    item.isCurrent && "ring-2 ring-primary bg-primary/10"
                  )}
                >
                  <div className="aspect-[2/3] bg-muted overflow-hidden relative animate-fade-in">
                    {item.poster_url ? (
                      <SafeImage
                        src={item.poster_url}
                        alt={item.title}
                        wrapperClassName="h-full w-full"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-primary/10 to-accent/10" />
                    )}
                    {itemStatus?.status ? (
                      <span className={cn(
                        "absolute top-2 right-2 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider font-semibold shadow-md",
                        STATUS_COLORS[itemStatus.status as WatchStatus] || "bg-muted text-muted-foreground"
                      )}>
                        {getStatusLabel(itemStatus.status as WatchStatus, summary?.media_type)}
                      </span>
                    ) : null}
                  </div>
                  <div className="p-2.5 flex-1 flex flex-col justify-between">
                    <div>
                      <span className="inline-block rounded-md bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                        {item.relation.replace(/_/g, " ")}
                      </span>
                      <h3 className="line-clamp-2 text-xs font-semibold group-hover:text-primary transition-colors leading-tight">
                        {item.title}
                      </h3>
                    </div>
                    {item.year ? (
                      <p className="mt-1 text-[10px] text-muted-foreground">{item.year}</p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ---- More Like This (non-prequel/sequel relations) ---- */}
      {(isAnime || isManga) && animeRecommendations.length > 0 ? (
        <section className="mt-6 md:mt-12 px-4 md:px-0">
          <SectionHeader
            className="mb-3 md:mb-4"
            title={<span className="flex items-center gap-2"><ExternalLink className="h-5 w-5 text-primary" /> More Like This</span>}
          />
          <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-muted">
            {animeRecommendations.slice(0, 10).map((item) => (
              <Link
                key={item.mal_id}
                to="/media/$type/$source/$id"
                params={{ type: (isManga ? "manga" : "anime") as "manga" | "anime", source: relationsSource, id: String(item.mal_id) }}
                className="w-36 shrink-0 snap-start group"
              >
                <div className="aspect-[2/3] rounded-xl overflow-hidden glass mb-2">
                  <SafeImage
                    src={item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null}
                    alt={item.title}
                    wrapperClassName="h-full w-full"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="px-0.5">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="text-accent font-semibold">{relationForId(item.mal_id).replace(/_/g, " ")}</span>
                    {item.year ? <span>· {item.year}</span> : null}
                  </div>
                  <h3 className="mt-0.5 text-xs font-semibold line-clamp-2 leading-tight">{item.title}</h3>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- Seasons (tv/anime) ---- */}
      {hasSeasons && seasonList.length > 0 ? (
        <section className="mt-6 md:mt-12 px-4 md:px-0">
          <SectionHeader className="mb-3 md:mb-4" title="Seasons" />
          <div className="grid gap-3 md:grid-cols-2">
            {seasonList.map((sn) => (
              <div key={sn.id} className="glass rounded-xl p-4 flex gap-4">
                {sn.poster_url ? (
                  <SafeImage src={sn.poster_url} alt="" wrapperClassName="h-24 w-16 rounded-lg shrink-0 overflow-hidden" className="h-full w-full object-cover" />
                ) : <div className="h-24 w-16 rounded-lg bg-muted shrink-0" />}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{sn.name || `Season ${sn.season_number}`}</h3>
                  <p className="text-xs text-muted-foreground">{sn.episode_count ?? "?"} eps{sn.air_date ? ` · ${sn.air_date.slice(0, 4)}` : ""}{sn.overview ? ` · ${sn.overview.slice(0, 60)}…` : ""}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SEASON_STATUS_ACTIONS.map((action) => {
                      const active = sn.status === action.key;
                      return (
                        <button key={action.key}
                          onClick={() => mSetSeason.mutate({ season_id: sn.id, status: action.key })}
                          className={cn("rounded-md px-2.5 py-1 text-xs transition-colors flex items-center gap-1", active ? "bg-gradient-accent text-white" : "bg-muted/40 hover:bg-muted/60")}
                        >
                          {active ? <Check className="h-3 w-3" /> : <action.icon className="h-3 w-3" />}
                          {action.label}
                        </button>
                      );
                    })}
                    {sn.status && !["watching", "completed", "skipped", "planned", "dropped"].includes(sn.status) ? (
                      <span className="rounded-md px-2.5 py-1 text-xs bg-muted/40">
                        {getStatusLabel(sn.status as WatchStatus, summary?.media_type)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- Cast ---- */}
      {castQ.data && castQ.data.cast?.length > 0 ? (
        <section className="mt-6 md:mt-12 px-4 md:px-0">
          <SectionHeader className="mb-3 md:mb-4" title="Cast" />
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-muted">
            {castQ.data.cast.map((c) => (
              <div key={c.id} className="w-20 shrink-0 snap-start text-center">
                <div className="mx-auto h-20 w-20 overflow-hidden rounded-full bg-muted">
                  {c.profile_path ? (
                    <SafeImage src={c.profile_path} alt={c.name} wrapperClassName="h-full w-full" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <p className="mt-1.5 text-xs font-medium line-clamp-1">{c.name}</p>
                <p className="text-[10px] text-muted-foreground line-clamp-1">{c.character}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- Recommendations ---- */}
      {recs.data && recs.data.length > 0 ? (
        <section className="mt-6 md:mt-12 px-4 md:px-0">
          <SectionHeader className="mb-3 md:mb-4" title="More like this" />
          {/* Mobile: horizontal scroll */}
          <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-muted md:hidden">
            {recs.data.slice(0, 10).map((item) => (
              <Link
                key={`${item.source}-${item.media_type}-${item.external_id}`}
                to="/media/$type/$source/$id"
                params={{ type: item.media_type, source: item.source, id: item.external_id }}
                className="w-36 shrink-0 snap-start group"
              >
                <div className="aspect-[2/3] rounded-xl overflow-hidden glass mb-2">
                  <SafeImage
                    src={item.poster_url}
                    alt={item.title}
                    wrapperClassName="h-full w-full"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="px-0.5">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="text-accent font-semibold">{item.media_type}</span>
                    {item.release_year ? <span>· {item.release_year}</span> : null}
                    {item.vote_average != null ? (
                      <span className="ml-auto flex items-center gap-0.5 text-warning">
                        <Star className="h-2.5 w-2.5 fill-current" /> {item.vote_average.toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-0.5 text-xs font-semibold line-clamp-2 leading-tight">{item.title}</h3>
                </div>
              </Link>
            ))}
          </div>
          {/* Desktop: MediaGrid */}
          <div className="hidden md:block">
            <MediaGrid items={recs.data.slice(0, 6)} />
          </div>
        </section>
      ) : null}

      {/* ---- Reviews ---- */}
      {mediaId ? (
        <ReviewsSection
          mediaId={mediaId}
          reviews={reviews}
          upsertFn={upsertReviewFn}
          deleteFn={deleteReviewFn}
          likeFn={likeReviewFn}
          qc={qc}
          currentUserId={currentUserId}
          requireAuth={requireAuth}
        />
      ) : null}

      {/* ---- Trailer modal ---- */}
      <Dialog open={showTrailerModal} onOpenChange={setShowTrailerModal}>
        <DialogContent className="max-w-3xl overflow-hidden p-0">
          <DialogTitle className="sr-only">Trailer</DialogTitle>
          <div className="aspect-video w-full bg-black">
            {trailerKey ? (
              <iframe
                src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
                title={`${summary.title} trailer`}
                className="h-full w-full"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Recommend to Friend modal ---- */}
      <RecommendDialog
        open={showRecommend}
        onOpenChange={setShowRecommend}
        mediaTitle={summary.title}
        users={recommendableQ.data ?? []}
        usersLoading={recommendableQ.isLoading}
        usersError={recommendableQ.isError}
        onRetryUsers={() => recommendableQ.refetch()}
        isPending={mRecommend.isPending}
        onConfirm={(recipient_id, message) => mRecommend.mutate({ recipient_id, message: message || undefined })}
      />
    </div>
  );
}

// ---- Recommend to Friend modal ----

function RecommendDialog({
  open, onOpenChange, mediaTitle, users, usersLoading, usersError, onRetryUsers, isPending, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mediaTitle: string;
  users: RecommendableUser[];
  usersLoading: boolean;
  usersError: boolean;
  onRetryUsers: () => void;
  isPending: boolean;
  onConfirm: (recipientId: string, message: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);

  // Reset local state whenever the dialog closes
  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedId(null);
      setMessage("");
      setTouched(false);
    }
  }, [open]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) => u.username.toLowerCase().includes(q) || (u.display_name ?? "").toLowerCase().includes(q))
    : users;

  function handleConfirm() {
    setTouched(true);
    if (!selectedId) return;
    onConfirm(selectedId, message.trim());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogTitle>Recommend to a friend</DialogTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Share <span className="font-medium text-foreground">“{mediaTitle}”</span> with a friend or someone you follow.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="recommend-search" className="text-xs uppercase tracking-wider text-muted-foreground">
              Search people
            </label>
            <input
              id="recommend-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="username…"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-input bg-background/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Recipient list */}
          <div className="min-h-[120px]">
            {usersLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-lg bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : usersError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                Couldn't load your friends.
                <button onClick={onRetryUsers} className="ml-2 font-semibold underline">Try again</button>
              </div>
            ) : users.length === 0 ? (
              <p className="rounded-lg glass p-3 text-sm text-muted-foreground">
                You have no friends or followed users yet. Add some on the Friends page first.
              </p>
            ) : filtered.length === 0 ? (
              <p className="rounded-lg glass p-3 text-sm text-muted-foreground">No matches for “{search.trim()}”.</p>
            ) : (
              <ul role="listbox" aria-label="People you can recommend to" className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                {filtered.map((u) => {
                  const selected = selectedId === u.id;
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => { setSelectedId(u.id); setTouched(false); }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors",
                          selected ? "bg-primary/15 ring-1 ring-primary/40" : "glass hover:bg-muted/40",
                        )}
                      >
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-accent text-[11px] font-bold text-white">
                            {(u.display_name || u.username).charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{u.display_name || u.username}</span>
                          <span className="block truncate text-xs text-muted-foreground">@{u.username}</span>
                        </span>
                        {selected ? <Check className="h-4 w-4 shrink-0 text-primary" aria-label="Selected" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {touched && !selectedId ? (
              <p role="alert" className="mt-2 text-xs text-destructive">Select someone to recommend to.</p>
            ) : null}
          </div>

          {/* Optional message */}
          <div>
            <label htmlFor="recommend-message" className="text-xs uppercase tracking-wider text-muted-foreground">
              Message (optional)
            </label>
            <textarea
              id="recommend-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="You have to watch this! …"
              className="mt-1 w-full resize-none rounded-lg border border-input bg-background/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="mt-1 text-right text-[10px] text-muted-foreground">{message.length}/500</p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="rounded-lg glass px-4 py-2 text-sm font-medium hover:bg-muted/40 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending || !selectedId}
            className="rounded-lg bg-gradient-accent px-4 py-2 text-sm font-semibold text-white btn-press disabled:opacity-40 flex items-center gap-1.5"
          >
            <Send className="h-4 w-4" /> {isPending ? "Sending…" : "Send"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Reviews Section ----

function ReviewsSection({ mediaId, reviews, upsertFn, deleteFn, likeFn, qc, currentUserId, requireAuth }: {
  mediaId: string;
  reviews: UseQueryResult<ReviewData[]>;
  upsertFn: ReturnType<typeof useServerFn<typeof upsertReview>>;
  deleteFn: ReturnType<typeof useServerFn<typeof deleteReview>>;
  likeFn: ReturnType<typeof useServerFn<typeof toggleReviewLike>>;
  qc: ReturnType<typeof useQueryClient>;
  currentUserId: string | null;
  requireAuth: (action: RestrictedAction) => boolean;
}) {
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState("");

  const myReview = reviews.data?.find((r) => r.user_id === currentUserId);

  const mSave = useMutation({
    mutationFn: () => upsertFn({ data: { media_id: mediaId, body } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reviews", mediaId] }); setWriting(false); setBody(""); toast.success("Review posted"); },
  });
  const mDelete = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reviews", mediaId] }); toast.success("Review deleted"); },
  });
  const mLike = useMutation({
    mutationFn: (review_id: string) => likeFn({ data: { review_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews", mediaId] }),
  });

  return (
    <section className="mt-6 md:mt-12 px-4 md:px-0">
      <SectionHeader
        className="mb-3 md:mb-4"
        title="Reviews"
        action={
          !writing && !myReview ? (
            <button onClick={() => { if (requireAuth("writeReview")) setWriting(true); }} className="flex items-center gap-1.5 rounded-lg glass px-4 py-2.5 text-sm font-medium hover:bg-muted/40 min-h-[44px]">
              <MessageSquare className="h-4 w-4" /> Write a review
            </button>
          ) : undefined
        }
      />

      {writing ? (
        <div className="glass-strong mb-6 rounded-2xl p-4">
          <textarea
            value={body} onChange={(e) => setBody(e.target.value)} autoFocus rows={4} maxLength={1000}
            className="w-full rounded-lg border border-input bg-background/40 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="Share your thoughts (max 1000 characters)…"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{body.length}/1000</span>
            <div className="flex gap-2">
              <button onClick={() => { setWriting(false); setBody(""); }} className="rounded-lg glass px-3 py-1.5 text-sm">Cancel</button>
              <button onClick={() => { if (requireAuth("writeReview")) mSave.mutate(); }} disabled={!body.trim() || mSave.isPending} className="rounded-lg bg-gradient-accent px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
                {mSave.isPending ? "Posting…" : "Post review"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reviews.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : (reviews.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No reviews yet"
          description="Be the first to share your thoughts."
          variant="panel"
        />
      ) : (
        <div className="space-y-3">
          {reviews.data!.map((r) => {
            const p = r.profile as unknown as { username: string; display_name: string; avatar_url: string | null } | undefined;
            const isMine = r.user_id === currentUserId;
            return (
              <div key={r.id} className="glass rounded-xl p-4">
                <div className="mb-2 flex items-center gap-2">
                  {p?.avatar_url ? <img src={p.avatar_url} alt="" loading="lazy" className="h-8 w-8 rounded-full object-cover" /> : <div className="h-8 w-8 rounded-full bg-gradient-accent grid place-items-center text-white text-xs font-bold">{(p?.display_name || p?.username || "?").charAt(0).toUpperCase()}</div>}
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{p?.display_name || p?.username || "Someone"}</div>
                    <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</div>
                  </div>
                  {isMine ? (
                    <button onClick={() => { if (requireAuth("deleteReview")) mDelete.mutate(r.id); }} aria-label="Delete your review" className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <p className="text-sm leading-relaxed">{r.body}</p>
                <button
                  onClick={() => { if (requireAuth("likeReview")) mLike.mutate(r.id); }}
                  aria-label={r.liked_by_me ? "Unlike this review" : "Like this review"}
                  aria-pressed={r.liked_by_me}
                  className={cn("mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors", r.liked_by_me ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                >
                  <ThumbsUp className={cn("h-3.5 w-3.5", r.liked_by_me && "fill-current")} /> {r.likes}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---- Skeleton ----

function DetailSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Back button skeleton */}
      <div className="mb-2 h-9 w-24 rounded-full bg-muted" />
      {/* Hero skeleton (full-bleed, same geometry as the loaded page) */}
      <div className="-mx-4 md:-mx-8 -mt-16 mb-4 md:mb-8">
        <div className="h-[180px] md:h-[300px] bg-muted" />
      </div>
      {/* Mobile skeleton */}
      <div className="flex flex-col items-center px-4 md:hidden">
        <div className="w-[50vw] max-w-[220px] aspect-[2/3] rounded-xl bg-muted -mt-20 relative z-10" />
        <div className="mt-4 h-4 w-24 bg-muted rounded" />
        <div className="mt-3 h-8 w-3/4 bg-muted rounded" />
        <div className="mt-2 h-4 w-32 bg-muted rounded" />
        <div className="mt-4 h-20 w-full bg-muted rounded" />
      </div>
      {/* Desktop skeleton */}
      <div className="hidden md:grid gap-8 md:grid-cols-[220px_1fr]">
        <div className="aspect-[2/3] rounded-xl bg-muted" />
        <div className="space-y-4">
          <div className="h-4 w-32 bg-muted rounded" />
          <div className="h-10 w-96 bg-muted rounded" />
          <div className="h-4 w-48 bg-muted rounded" />
          <div className="h-20 w-full bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}
