-- Accepted friends can see one another's profile metadata even when a profile
-- is marked private. This keeps the Friends page useful without making private
-- profiles publicly discoverable.
DROP POLICY IF EXISTS "profiles_select_public_or_self" ON public.profiles;

CREATE POLICY "profiles_select_public_self_or_friend"
  ON public.profiles
  FOR SELECT
  USING (
    is_public
    OR auth.uid() = id
    OR public.are_friends(auth.uid(), id)
  );
