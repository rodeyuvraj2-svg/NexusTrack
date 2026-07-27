-- Close public write and account-enumeration paths introduced by earlier migrations.
-- Metadata is now written only by the server with the service-role client.

REVOKE EXECUTE ON FUNCTION public.check_email_exists(TEXT) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_media(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, NUMERIC, TEXT[], INT, INT, TEXT
) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_seasons(UUID, JSONB) FROM anon, authenticated;

DROP POLICY IF EXISTS "media_insert_authenticated" ON public.media;
DROP POLICY IF EXISTS "media_update_authenticated" ON public.media;
REVOKE INSERT, UPDATE ON public.media FROM authenticated;
