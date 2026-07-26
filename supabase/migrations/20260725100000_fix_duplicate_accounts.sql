-- ============================================================================
-- Migration: Fix duplicate account prevention
--
-- Changes:
-- 1. Make handle_new_user() idempotent — skips insert if profile already exists
-- 2. Re-create the trigger to use the updated function
-- 3. Revoke unnecessary permissions from trigger functions
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Make handle_new_user idempotent
-- --------------------------------------------------------------------------
-- If the trigger fires but the profile already exists (edge case during
-- re-confirmation flows), silently skip instead of crashing.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base_username TEXT; final_username TEXT; suffix INT := 0;
BEGIN
  -- Only insert if a profile doesn't already exist for this user
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  base_username := lower(regexp_replace(
    COALESCE(NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'preferred_username', split_part(NEW.email, '@', 1), 'user'),
    '[^a-z0-9_]', '', 'g'));
  IF base_username = '' OR base_username IS NULL THEN base_username := 'user'; END IF;
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    suffix := suffix + 1; final_username := base_username || suffix::text;
  END LOOP;
  INSERT INTO public.profiles (id, username, display_name, avatar_url) VALUES (
    NEW.id, final_username,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', final_username),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END; $$;

-- --------------------------------------------------------------------------
-- 2. Ensure the on_auth_user_created trigger exists (replaces if changed)
-- --------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- --------------------------------------------------------------------------
-- 3. Ensure proper function permissions
-- --------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
