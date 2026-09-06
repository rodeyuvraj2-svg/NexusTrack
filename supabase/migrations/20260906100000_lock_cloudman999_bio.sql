-- Keep cloudman999's bio fixed at "noob".
-- This is enforced in the database so direct Supabase/API updates cannot bypass it.

UPDATE public.profiles
SET bio = 'noob'
WHERE id = '15132a6a-ea4f-4bae-9c17-1e4a84bd5e8c'::uuid;

CREATE OR REPLACE FUNCTION public.lock_cloudman999_bio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id = '15132a6a-ea4f-4bae-9c17-1e4a84bd5e8c'::uuid THEN
    NEW.bio := 'noob';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_cloudman999_bio ON public.profiles;
CREATE TRIGGER trg_lock_cloudman999_bio
BEFORE INSERT OR UPDATE OF bio ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.lock_cloudman999_bio();
