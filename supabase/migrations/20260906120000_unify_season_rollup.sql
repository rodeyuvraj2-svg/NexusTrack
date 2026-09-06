-- Unify season rollup: the DB trigger and setSeasonStatus' JS logic both
-- rolled season progress up to the series status, with DIFFERENT "done"
-- definitions (the trigger ignored 'dropped'; the JS included it). That
-- meant the JS write and the trigger could fight, leaving the series status
-- flapping depending on which path ran last.
--
-- The trigger is the single source of truth now: the JS rollup is removed
-- from the server function and this migration aligns the trigger's "done"
-- set to include 'dropped' (a series where every season is completed,
-- skipped, or dropped is finished for that viewer).

CREATE OR REPLACE FUNCTION public.rollup_user_media_status() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE um_id UUID; total INT; done INT; watching INT; planned INT; new_status public.watch_status;
BEGIN
  um_id := COALESCE(NEW.user_media_id, OLD.user_media_id);
  SELECT COUNT(*) INTO total FROM public.user_seasons WHERE user_media_id = um_id;
  IF total = 0 THEN RETURN COALESCE(NEW, OLD); END IF;
  -- 'dropped' now counts as done — matches the app's rollup semantics.
  SELECT COUNT(*) INTO done FROM public.user_seasons WHERE user_media_id = um_id AND status IN ('completed','skipped','dropped');
  SELECT COUNT(*) INTO watching FROM public.user_seasons WHERE user_media_id = um_id AND status IN ('watching','rewatching');
  SELECT COUNT(*) INTO planned FROM public.user_seasons WHERE user_media_id = um_id AND status = 'planned';
  IF done = total THEN new_status := 'completed';
  ELSIF watching > 0 THEN new_status := 'watching';
  ELSIF planned > 0 THEN new_status := 'planned';
  ELSE new_status := 'paused'; END IF;
  UPDATE public.user_media SET status = new_status, updated_at = now() WHERE id = um_id;
  RETURN COALESCE(NEW, OLD);
END; $$;
