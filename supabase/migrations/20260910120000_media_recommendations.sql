-- media_recommendations: "Recommend to Friend" feature.
-- A recommendation is addressed by the media's internal id (FK to the
-- trusted, provisioned media cache) plus its external identity for
-- reference. Both sender and recipient may hard-delete a row; account
-- deletion cascades. Rows expire after 30 days via a scheduled cleanup.

CREATE TABLE IF NOT EXISTS public.media_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
  media_type public.media_type NOT NULL,
  source TEXT NOT NULL DEFAULT 'tmdb',
  external_id TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'unread'
    CHECK (status IN ('unread', 'read', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',
  CONSTRAINT media_recommendations_not_self CHECK (sender_id <> recipient_id)
);

-- Only one ACTIVE recommendation per (sender, recipient, media) — dismissed
-- (or deleted) ones don't block a fresh recommendation.
CREATE UNIQUE INDEX IF NOT EXISTS media_recommendations_active_uniq
  ON public.media_recommendations (sender_id, recipient_id, media_id)
  WHERE status <> 'dismissed';

CREATE INDEX IF NOT EXISTS media_recommendations_recipient_idx
  ON public.media_recommendations (recipient_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS media_recommendations_sender_idx
  ON public.media_recommendations (sender_id, created_at DESC);
-- For the scheduled expired-row cleanup scan.
CREATE INDEX IF NOT EXISTS media_recommendations_expires_idx
  ON public.media_recommendations (expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_recommendations TO authenticated;
GRANT ALL ON public.media_recommendations TO service_role;

ALTER TABLE public.media_recommendations ENABLE ROW LEVEL SECURITY;

-- Users see only recommendations they sent or received.
CREATE POLICY "media_recommendations_select_own" ON public.media_recommendations
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Only the sender can create a recommendation addressed from them.
CREATE POLICY "media_recommendations_insert_sender" ON public.media_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- Only the recipient changes status (mark read / dismiss).
CREATE POLICY "media_recommendations_update_recipient" ON public.media_recommendations
  FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- Sender OR recipient may permanently delete their copy.
CREATE POLICY "media_recommendations_delete_own" ON public.media_recommendations
  FOR DELETE TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Scheduled cleanup (pg_cron, daily ~3am):
--   1. recommendations past their 30-day expiry
--   2. activity rows older than 15 days (keeps the friends activity feed fresh)
-- pg_cron may be unavailable on some plans — degrade to a notice so the
-- migration still applies; cleanups can then run from any scheduler.
DO $do$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'nexustrack-cleanup-expired-recommendations', '17 3 * * *',
    $cron$ DELETE FROM public.media_recommendations WHERE expires_at < now() $cron$
  );
  PERFORM cron.schedule(
    'nexustrack-cleanup-old-activity', '23 3 * * *',
    $cron$ DELETE FROM public.activity WHERE created_at < now() - INTERVAL '15 days' $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable (%) — schedule the cleanups externally.', SQLERRM;
END
$do$;
