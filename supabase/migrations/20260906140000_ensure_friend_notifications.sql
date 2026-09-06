-- Make friend-request notifications actually reach the client.
--
-- The notify_friend_request / notify_friend_accept triggers (see
-- 20260809000000_fix_friends_follows.sql) create `notifications` rows, and
-- the notifications page enriches them into human-readable messages. Two
-- things can silently break that pipeline, so enforce them idempotently:
--
--   1. The triggers must exist on the live database (re-created here in
--      case the earlier migration never ran).
--   2. `notifications` must be in the supabase_realtime publication, or
--      the client's postgres_changes subscription never fires and the
--      badge/page only updates on full refresh.

-- ── 1. (Re)ensure the friend request / accept triggers ──
CREATE OR REPLACE FUNCTION public.notify_friend_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, kind, payload)
    VALUES (
      NEW.addressee_id,
      'friend_request',
      jsonb_build_object('friendship_id', NEW.id, 'from_user_id', NEW.requester_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_friendships_notify_request ON public.friendships;
CREATE TRIGGER trg_friendships_notify_request
AFTER INSERT ON public.friendships
FOR EACH ROW
EXECUTE FUNCTION public.notify_friend_request();

CREATE OR REPLACE FUNCTION public.notify_friend_accept()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    INSERT INTO public.notifications (user_id, kind, payload)
    VALUES (
      NEW.requester_id,
      'friend_accept',
      jsonb_build_object('friendship_id', NEW.id, 'from_user_id', NEW.addressee_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_friendships_notify_accept ON public.friendships;
CREATE TRIGGER trg_friendships_notify_accept
AFTER UPDATE OF status ON public.friendships
FOR EACH ROW
EXECUTE FUNCTION public.notify_friend_accept();

-- ── 2. Enable realtime for notifications ──
-- (ADD TABLE errors if already a member — swallow that one case so the
-- migration is re-runnable.)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL; -- already in the publication
END $$;
