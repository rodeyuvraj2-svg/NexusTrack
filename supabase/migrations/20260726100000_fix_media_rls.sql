-- ============================================================================
-- Migration: Fix media table RLS — allow authenticated users to insert/update
--
-- The media table only had a SELECT policy for authenticated users, which
-- meant cacheMedia's fallback direct insert always failed when:
--   1. The upsert_media RPC wasn't applied yet, AND
--   2. The SUPABASE_SERVICE_ROLE_KEY wasn't set
--
-- This adds INSERT and UPDATE policies so the direct upsert path works.
-- ============================================================================

-- 1. Grant INSERT and UPDATE to authenticated users
GRANT INSERT (media_type, source, external_id, title, original_title, overview, poster_url, backdrop_url, release_year, runtime, genres, vote_average, season_count, status, raw)
  ON public.media TO authenticated;
GRANT UPDATE (media_type, source, external_id, title, original_title, overview, poster_url, backdrop_url, release_year, runtime, genres, vote_average, season_count, status, raw)
  ON public.media TO authenticated;

-- 2. Create INSERT policy — any authenticated user can insert
CREATE POLICY "media_insert_authenticated" ON public.media
  FOR INSERT
  WITH CHECK (true);

-- 3. Create UPDATE policy — any authenticated user can update (used by upsert)
CREATE POLICY "media_update_authenticated" ON public.media
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
