import { useParams, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getDetails,
  cacheMedia,
  getRecommendations,
  getCast,
  reclassifyMedia,
} from "@/lib/tmdb.functions";
import {
  getAnimeDetails,
  getMultipleAnimeDetails,
  getMangaDetails,
  getMultipleMangaDetails,
} from "@/lib/anilist.functions";
import {
  getLibraryItem,
  upsertLibraryItem,
  removeLibraryItem,
  listSeasonsWithProgress,
  setSeasonStatus,
} from "@/lib/library.functions";
import { listReviews, upsertReview, deleteReview, toggleReviewLike } from "@/lib/reviews.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { MediaSummary, WatchStatus } from "@/lib/media-types";

export function useMediaDetail() {
  const { type, source, id } = useParams({ from: "/_authenticated/media/$type/$source/$id" });
  const qc = useQueryClient();
  const router = useRouter();

  // ---- Server Functions ----
  const cacheFn = useServerFn(cacheMedia);
  const detailsFn = useServerFn(getDetails);
  const animeDetailsFn = useServerFn(getAnimeDetails);
  const multipleAnimeDetailsFn = useServerFn(getMultipleAnimeDetails);
  const mangaDetailsFn = useServerFn(getMangaDetails);
  const multipleMangaDetailsFn = useServerFn(getMultipleMangaDetails);
  const libFn = useServerFn(getLibraryItem);
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

  const isAnime = source === "anilist" && type !== "manga";
  const isManga = type === "manga";

  // ---- Core Details ----
  const tmdbDetailsQ = useQuery({
    queryKey: ["details", type, id],
    queryFn: () => detailsFn({ data: { type: type as "movie" | "tv", id } }),
    enabled: !isAnime,
    retry: 2,
    staleTime: 300_000,
  });

  const animeDetailsQ = useQuery({
    queryKey: ["anime-details", id],
    queryFn: () => animeDetailsFn({ data: { id } }),
    enabled: isAnime,
    retry: 2,
    staleTime: 300_000,
  });

  const mangaDetailsQ = useQuery({
    queryKey: ["manga-details", id],
    queryFn: () => mangaDetailsFn({ data: { id } }),
    enabled: isManga,
    retry: 2,
    staleTime: 300_000,
  });

  const detailsData = isManga
    ? { summary: mangaDetailsQ.data?.summary, extra: mangaDetailsQ.data?.extra }
    : isAnime
      ? { summary: animeDetailsQ.data?.summary, extra: animeDetailsQ.data?.extra }
      : {
          summary: tmdbDetailsQ.data?.summary,
          seasons: tmdbDetailsQ.data?.seasons,
          extra: undefined,
        };

  const detailsLoading = isManga
    ? mangaDetailsQ.isLoading
    : isAnime
      ? animeDetailsQ.isLoading
      : tmdbDetailsQ.isLoading;
  const detailsError = isManga
    ? mangaDetailsQ.isError
    : isAnime
      ? animeDetailsQ.isError
      : tmdbDetailsQ.isError;

  // ---- Cache/Library ----
  const cached = useQuery({
    queryKey: ["cache", type, source, id],
    queryFn: () =>
      cacheFn({
        data: {
          type: type as "movie" | "tv" | "anime" | "manga",
          source: source as "tmdb" | "anilist",
          external_id: id,
        },
      }),
    retry: 1,
    staleTime: 60_000,
  });

  const mediaId = cached.data?.id;

  const libraryEntry = useQuery({
    queryKey: ["library-entry", mediaId],
    queryFn: () => libFn({ data: { media_id: mediaId! } }),
    enabled: !!mediaId,
    staleTime: 30_000,
  });

  const seasons = useQuery({
    queryKey: ["seasons", mediaId],
    queryFn: () => seasonsFn({ data: { media_id: mediaId! } }),
    enabled: !!mediaId && (type === "tv" || isAnime) && !isManga,
    staleTime: 30_000,
  });

  // ---- Mutations ----
  const mReclassify = useMutation({
    mutationFn: (newType: "movie" | "tv" | "anime" | "manga") =>
      reclassifyFn({ data: { media_id: mediaId!, new_type: newType } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cache", type, source, id] });
      router.invalidate();
      toast.success("Reclassified!");
    },
    onError: (e) => toast.error(e.message),
  });

  const mUpsert = useMutation({
    mutationFn: (payload: {
      media_id: string;
      status?: WatchStatus;
      rating?: number | null;
      favorite?: boolean;
      hidden?: boolean;
      notes?: string | null;
    }) => upsertFn({ data: payload }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["library-entry", mediaId] });
      qc.invalidateQueries({ queryKey: ["library"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const mRemove = useMutation({
    mutationFn: () => removeFn({ data: { media_id: mediaId! } }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["library-entry", mediaId] });
      qc.invalidateQueries({ queryKey: ["library"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Removed from library");
    },
  });

  const mSetSeason = useMutation({
    mutationFn: (payload: { season_id: string; status: WatchStatus }) =>
      setSeasonFn({
        data: { media_id: mediaId!, season_id: payload.season_id, status: payload.status },
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["seasons", mediaId] });
      qc.invalidateQueries({ queryKey: ["library-entry", mediaId] });
      if (result.overallChanged) toast.success("All seasons completed — series marked as watched!");
    },
  });

  return {
    // Params & State
    type,
    source,
    id,
    mediaId,
    details: detailsData,
    detailsLoading,
    detailsError,
    libraryEntry,
    seasons,

    // Actions
    mReclassify,
    mUpsert,
    mRemove,
    mSetSeason,

    // Utils
    qc,
    router,
    isAnime,
    isManga,
  };
}
