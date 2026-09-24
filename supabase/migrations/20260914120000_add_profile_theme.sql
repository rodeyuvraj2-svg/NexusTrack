-- Per-user app theme (Settings → Theme). Values mirror the theme ids
-- defined in src/lib/theme.ts and src/styles.css.
--
-- Existing profiles backfill to 'nexus-dark' (the app's original look), so
-- nothing changes visually for current users until they pick a theme.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'nexus-light';

-- Validated check constraint — a theme value that isn't one of the four
-- known themes can never be stored.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_theme_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_theme_check
      CHECK (theme IN ('nexus-light'));
  END IF;
END $$;
