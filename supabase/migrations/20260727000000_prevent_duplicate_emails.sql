-- ============================================================================
-- Migration: Prevent duplicate email registrations
--
-- Creates a function to check if an email is already registered, used by
-- the auth page before allowing signup. Also modifies handle_new_user to
-- handle OAuth duplicate email cases gracefully.
-- ============================================================================

-- Function to check if email exists (used by the app before signup)
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE email = p_email);
$$;

GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO anon;
