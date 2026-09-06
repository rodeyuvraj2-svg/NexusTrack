-- Move getStats' heavy aggregation into the database.
--
-- The old server function loaded the user's ENTIRE library into JS and
-- counted/folded it there — fine for small libraries, a real cost for large
-- ones. This RPC computes counts, per-type breakdowns, favorite genres, top
-- ratings, and hours watched in a single indexed scan and returns one JSON
-- object. The streak calculation stays in JS (it depends on the server's
-- local timezone).

CREATE OR REPLACE FUNCTION public.get_profile_stats(p_user_id UUID)
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- Personal stats only: callers may only request their own numbers.
  -- (Matches the old server function, which always used context.userId.)
  WITH auth_check AS (
    SELECT CASE WHEN p_user_id = auth.uid() THEN true
           ELSE (SELECT public.are_friends(p_user_id, auth.uid())) END AS allowed
  ),
  lib AS (
    SELECT um.status, um.rating, um.favorite,
           m.id AS media_id, m.media_type, m.runtime, m.title, m.poster_url,
           m.source, m.external_id, m.genres, m.season_count
    FROM public.user_media um
    JOIN public.media m ON m.id = um.media_id
    WHERE um.user_id = p_user_id
      AND (p_user_id = auth.uid() OR NOT um.hidden)
  ),
  agg AS (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'completed')::int AS completed,
      count(*) FILTER (WHERE status IN ('watching','rewatching'))::int AS watching,
      count(*) FILTER (WHERE status = 'planned')::int AS planned,
      count(*) FILTER (WHERE favorite)::int AS favorites,
      count(*) FILTER (WHERE media_type = 'movie')::int AS movies,
      count(*) FILTER (WHERE media_type = 'tv')::int AS tv,
      count(*) FILTER (WHERE media_type = 'anime')::int AS anime,
      count(*) FILTER (WHERE media_type = 'manga')::int AS manga,
      count(*) FILTER (WHERE status = 'completed' AND media_type = 'movie')::int AS completed_movies,
      count(*) FILTER (WHERE status = 'completed' AND media_type = 'tv')::int AS completed_tv,
      count(*) FILTER (WHERE status = 'completed' AND media_type = 'anime')::int AS completed_anime,
      count(*) FILTER (WHERE status = 'completed' AND media_type = 'manga')::int AS completed_manga,
      -- Movies: runtime is total length. TV/anime: per-episode runtime
      -- times episode count (season_count; 1 when unknown) — same formula
      -- the JS version used.
      round(
        coalesce(sum(
          CASE WHEN status = 'completed' AND runtime IS NOT NULL AND runtime > 0 THEN
            CASE WHEN media_type = 'movie'
                 THEN runtime
                 ELSE runtime * GREATEST(coalesce(season_count, 0), 1)
            END
          END
        ), 0) / 60.0
      )::int AS hours_watched
    FROM lib
  ),
  genres AS (
    SELECT g AS genre, count(*)::int AS count
    FROM lib, unnest(coalesce(genres, '{}'::text[])) AS g
    GROUP BY g
    ORDER BY count DESC, genre
    LIMIT 8
  ),
  top AS (
    SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) AS items FROM (
      SELECT title, rating, poster_url, media_id, media_type, source, external_id
      FROM lib
      WHERE rating IS NOT NULL AND rating > 0
      ORDER BY rating DESC
      LIMIT 6
    ) t
  )
  SELECT json_build_object(
    'total', agg.total,
    'completed', agg.completed,
    'watching', agg.watching,
    'planned', agg.planned,
    'favorites', agg.favorites,
    'movies', agg.movies,
    'tv', agg.tv,
    'anime', agg.anime,
    'manga', agg.manga,
    'completedMovies', agg.completed_movies,
    'completedTv', agg.completed_tv,
    'completedAnime', agg.completed_anime,
    'completedManga', agg.completed_manga,
    'completionPct', CASE WHEN agg.total > 0 THEN round(agg.completed * 100.0 / agg.total)::int ELSE 0 END,
    'hoursWatched', agg.hours_watched,
    'favoriteGenres', (SELECT coalesce(json_agg(row_to_json(genres)), '[]'::json) FROM genres),
    'topRatings', (SELECT items FROM top)
  )
  FROM agg
  WHERE (SELECT allowed FROM auth_check)
$$;

REVOKE EXECUTE ON FUNCTION public.get_profile_stats(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_stats(UUID) TO authenticated;

-- Index that backs the RPC's scan (user's rows joined to media).
CREATE INDEX IF NOT EXISTS user_media_user_media_idx ON public.user_media (user_id, media_id);
