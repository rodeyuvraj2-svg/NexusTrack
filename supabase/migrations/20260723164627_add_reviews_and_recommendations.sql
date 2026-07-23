
-- REVIEWS
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  likes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, media_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_select_visible" ON public.reviews FOR SELECT USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = reviews.user_id AND (p.is_public OR public.are_friends(auth.uid(), reviews.user_id)))
);
CREATE POLICY "reviews_insert_self" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reviews_update_own" ON public.reviews FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reviews_delete_own" ON public.reviews FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX reviews_media_idx ON public.reviews (media_id, created_at DESC);
CREATE TRIGGER trg_reviews_updated BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- REVIEW LIKES (to prevent duplicate likes)
CREATE TABLE public.review_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.review_likes TO authenticated;
GRANT ALL ON public.review_likes TO service_role;
ALTER TABLE public.review_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "review_likes_select_visible" ON public.review_likes FOR SELECT USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = review_likes.user_id AND (p.is_public OR public.are_friends(auth.uid(), review_likes.user_id)))
);
CREATE POLICY "review_likes_insert_self" ON public.review_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "review_likes_delete_own" ON public.review_likes FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX review_likes_review_idx ON public.review_likes (review_id);

-- Trigger to maintain likes count on reviews
CREATE OR REPLACE FUNCTION public.update_review_likes_count() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reviews SET likes = likes + 1 WHERE id = NEW.review_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reviews SET likes = GREATEST(0, likes - 1) WHERE id = OLD.review_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER trg_review_likes_count AFTER INSERT OR DELETE ON public.review_likes FOR EACH ROW EXECUTE FUNCTION public.update_review_likes_count();

-- Grant execute on new functions to service_role only
REVOKE EXECUTE ON FUNCTION public.update_review_likes_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_review_likes_count() TO service_role;
