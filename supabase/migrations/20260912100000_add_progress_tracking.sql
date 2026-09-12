-- Per-title progress tracking (episode/chapter position) on user_media.
--
-- Movies never carry progress; tv/anime use current_season +
-- current_episode, manga uses current_chapter. All columns are nullable so
-- every existing row stays valid without a backfill. The app enforces the
-- type-specific combinations in updateMediaProgress (the media type lives on
-- the joined `media` row, so a DB-level cross-table check isn't practical
-- here); the DB only guarantees non-negative values.
--
-- user_seasons (season-level status tracking) is untouched — its rollup
-- trigger keeps working exactly as before.

ALTER TABLE public.user_media
  ADD COLUMN IF NOT EXISTS current_season integer,
  ADD COLUMN IF NOT EXISTS current_episode integer,
  ADD COLUMN IF NOT EXISTS current_chapter integer,
  ADD COLUMN IF NOT EXISTS progress_updated_at timestamptz;

ALTER TABLE public.user_media
  ADD CONSTRAINT user_media_current_season_nonnegative
    CHECK (current_season IS NULL OR current_season >= 0),
  ADD CONSTRAINT user_media_current_episode_nonnegative
    CHECK (current_episode IS NULL OR current_episode >= 0),
  ADD CONSTRAINT user_media_current_chapter_nonnegative
    CHECK (current_chapter IS NULL OR current_chapter >= 0);

-- Supports the dashboard's continue-watching query: this user's visible
-- watching/rewatching records, most recently updated progress first.
CREATE INDEX user_media_active_progress_idx
  ON public.user_media (user_id, progress_updated_at DESC)
  WHERE hidden = false AND status IN ('watching', 'rewatching');
