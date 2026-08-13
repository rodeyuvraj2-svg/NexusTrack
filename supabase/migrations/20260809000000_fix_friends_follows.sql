-- Fix friends & follows coherence.
--
-- Problem: friendships (mutual) and follows (unidirectional) were disconnected.
-- Accepting a friend request never created a follow, so users had to manually
-- follow someone they just became friends with. Also, friend requests and
-- accepts never generated notifications.
--
-- Fixes:
--   1. When a friendship becomes 'accepted', both users auto-follow each other.
--   2. When an accepted friendship is removed, the mutual follows are removed too.
--   3. New friend request → notification for the addressee.
--   4. Friend request accepted → notification for the requester.

-- ── 1. Auto mutual-follow on accept ──
CREATE OR REPLACE FUNCTION public.auto_follow_on_friend_accept()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    INSERT INTO public.follows (follower_id, following_id)
    VALUES
      (NEW.requester_id, NEW.addressee_id),
      (NEW.addressee_id, NEW.requester_id)
    ON CONFLICT (follower_id, following_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_friendships_auto_follow ON public.friendships;
CREATE TRIGGER trg_friendships_auto_follow
AFTER UPDATE OF status ON public.friendships
FOR EACH ROW
EXECUTE FUNCTION public.auto_follow_on_friend_accept();

-- ── 2. Remove mutual follows when an accepted friendship is deleted ──
CREATE OR REPLACE FUNCTION public.remove_follows_on_friend_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'accepted' THEN
    DELETE FROM public.follows
    WHERE (follower_id = OLD.requester_id AND following_id = OLD.addressee_id)
       OR (follower_id = OLD.addressee_id AND following_id = OLD.requester_id);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_friendships_remove_follows ON public.friendships;
CREATE TRIGGER trg_friendships_remove_follows
AFTER DELETE ON public.friendships
FOR EACH ROW
EXECUTE FUNCTION public.remove_follows_on_friend_removal();

-- ── 3. Notify addressee on new friend request ──
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

-- ── 4. Notify requester when request is accepted ──
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
