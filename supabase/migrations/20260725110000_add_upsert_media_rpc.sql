-- ============================================================================
-- Migration: Add upsert_media RPC — allows any authenticated user to insert
-- media records without requiring the service role key.
-- Uses SECURITY DEFINER so the function runs with the owner's privileges,
-- bypassing RLS on the media table.
-- ============================================================================

-- 1. Create the upsert_media function
CREATE OR REPLACE FUNCTION public.upsert_media(
  p_media_type TEXT,
  p_source TEXT,
  p_external_id TEXT,
  p_title TEXT,
  p_overview TEXT DEFAULT NULL,
  p_poster_url TEXT DEFAULT NULL,
  p_backdrop_url TEXT DEFAULT NULL,
  p_release_year INT DEFAULT NULL,
  p_vote_average NUMERIC DEFAULT NULL,
  p_genres TEXT[] DEFAULT NULL,
  p_runtime INT DEFAULT NULL,
  p_season_count INT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER  -- runs as the function owner, bypassing RLS
SET search_path = public
AS $$
DECLARE
  media_id UUID;
BEGIN
  -- Try to find existing media first
  SELECT id INTO media_id
  FROM public.media
  WHERE media_type = p_media_type::media_type
    AND source = p_source
    AND external_id = p_external_id;

  IF FOUND THEN
    RETURN media_id;
  END IF;

  -- Insert new record
  INSERT INTO public.media (
    media_type, source, external_id, title, overview,
    poster_url, backdrop_url, release_year, vote_average,
    genres, runtime, season_count, status
  ) VALUES (
    p_media_type::media_type, p_source, p_external_id, p_title, p_overview,
    p_poster_url, p_backdrop_url, p_release_year, p_vote_average,
    p_genres, p_runtime, p_season_count, p_status
  )
  RETURNING id INTO media_id;

  RETURN media_id;
END;
$$;

-- 2. Create the upsert_seasons function
CREATE OR REPLACE FUNCTION public.upsert_seasons(
  p_media_id UUID,
  p_seasons JSONB  -- array of {season_number, name, episode_count, air_date, poster_url, overview}
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  season JSONB;
BEGIN
  FOR season IN SELECT jsonb_array_elements(p_seasons)
  LOOP
    INSERT INTO public.seasons (
      media_id, season_number, name, episode_count, air_date, poster_url, overview
    ) VALUES (
      p_media_id,
      (season->>'season_number')::INT,
      season->>'name',
      (season->>'episode_count')::INT,
      NULLIF(season->>'air_date', ''),
      NULLIF(season->>'poster_url', ''),
      season->>'overview'
    )
    ON CONFLICT (media_id, season_number) DO UPDATE SET
      name = EXCLUDED.name,
      episode_count = EXCLUDED.episode_count,
      air_date = EXCLUDED.air_date,
      poster_url = EXCLUDED.poster_url,
      overview = EXCLUDED.overview;
  END LOOP;
END;
$$;

-- 3. Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.upsert_media(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, NUMERIC, TEXT[], INT, INT, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_media(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, NUMERIC, TEXT[], INT, INT, TEXT
) TO anon;

GRANT EXECUTE ON FUNCTION public.upsert_seasons(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_seasons(UUID, JSONB) TO anon;

-- 4. Revoke from service_role (they should use the client directly)
REVOKE EXECUTE ON FUNCTION public.upsert_media(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, NUMERIC, TEXT[], INT, INT, TEXT
) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.upsert_seasons(UUID, JSONB) FROM service_role;
