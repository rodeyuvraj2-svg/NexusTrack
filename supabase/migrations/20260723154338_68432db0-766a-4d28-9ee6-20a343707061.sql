
CREATE TYPE public.media_type AS ENUM ('movie', 'tv', 'anime');
CREATE TYPE public.watch_status AS ENUM ('watching','completed','planned','paused','dropped','skipped','rewatching');
CREATE TYPE public.friend_status AS ENUM ('pending','accepted','blocked');
CREATE TYPE public.activity_kind AS ENUM ('started','completed','added','favorited','rated','friend_joined');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_public_or_self" ON public.profiles FOR SELECT USING (is_public OR auth.uid() = id);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE INDEX profiles_username_idx ON public.profiles (lower(username));

-- MEDIA CACHE
CREATE TABLE public.media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_type public.media_type NOT NULL,
  external_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'tmdb',
  title TEXT NOT NULL,
  original_title TEXT,
  overview TEXT,
  poster_url TEXT,
  backdrop_url TEXT,
  release_year INT,
  runtime INT,
  genres TEXT[] DEFAULT '{}',
  vote_average NUMERIC(3,1),
  season_count INT,
  status TEXT,
  raw JSONB,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (media_type, source, external_id)
);
GRANT SELECT ON public.media TO authenticated, anon;
GRANT ALL ON public.media TO service_role;
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media_read_all" ON public.media FOR SELECT USING (true);
CREATE INDEX media_lookup_idx ON public.media (media_type, source, external_id);

-- SEASONS
CREATE TABLE public.seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
  season_number INT NOT NULL,
  name TEXT,
  episode_count INT,
  air_date DATE,
  poster_url TEXT,
  overview TEXT,
  UNIQUE (media_id, season_number)
);
GRANT SELECT ON public.seasons TO authenticated, anon;
GRANT ALL ON public.seasons TO service_role;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seasons_read_all" ON public.seasons FOR SELECT USING (true);

-- FRIENDSHIPS (before are_friends helper)
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.friend_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "friendships_select_involved" ON public.friendships FOR SELECT USING (auth.uid() IN (requester_id, addressee_id));
CREATE POLICY "friendships_insert_as_requester" ON public.friendships FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "friendships_update_involved" ON public.friendships FOR UPDATE USING (auth.uid() IN (requester_id, addressee_id)) WITH CHECK (auth.uid() IN (requester_id, addressee_id));
CREATE POLICY "friendships_delete_involved" ON public.friendships FOR DELETE USING (auth.uid() IN (requester_id, addressee_id));

CREATE OR REPLACE FUNCTION public.are_friends(a UUID, b UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = a AND addressee_id = b) OR (requester_id = b AND addressee_id = a))
  );
$$;

-- USER MEDIA
CREATE TABLE public.user_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
  status public.watch_status NOT NULL DEFAULT 'planned',
  rating INT CHECK (rating BETWEEN 0 AND 10),
  favorite BOOLEAN NOT NULL DEFAULT FALSE,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  progress INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, media_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_media TO authenticated;
GRANT ALL ON public.user_media TO service_role;
ALTER TABLE public.user_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_media_select_own_or_friend" ON public.user_media FOR SELECT USING (
  auth.uid() = user_id
  OR (NOT hidden AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_media.user_id AND (p.is_public OR public.are_friends(auth.uid(), user_media.user_id))))
);
CREATE POLICY "user_media_insert_own" ON public.user_media FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_media_update_own" ON public.user_media FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_media_delete_own" ON public.user_media FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX user_media_user_idx ON public.user_media (user_id, status);
CREATE INDEX user_media_media_idx ON public.user_media (media_id);

-- USER SEASONS
CREATE TABLE public.user_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_media_id UUID NOT NULL REFERENCES public.user_media(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  status public.watch_status NOT NULL DEFAULT 'planned',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, season_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_seasons TO authenticated;
GRANT ALL ON public.user_seasons TO service_role;
ALTER TABLE public.user_seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_seasons_select_own" ON public.user_seasons FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_seasons_write_own" ON public.user_seasons FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX user_seasons_um_idx ON public.user_seasons (user_media_id);

-- ACTIVITY
CREATE TABLE public.activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.activity_kind NOT NULL,
  media_id UUID REFERENCES public.media(id) ON DELETE CASCADE,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.activity TO authenticated;
GRANT ALL ON public.activity TO service_role;
ALTER TABLE public.activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_select_visible" ON public.activity FOR SELECT USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = activity.user_id AND (p.is_public OR public.are_friends(auth.uid(), activity.user_id)))
);
CREATE POLICY "activity_insert_self" ON public.activity FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "activity_delete_self" ON public.activity FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX activity_user_idx ON public.activity (user_id, created_at DESC);

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);

-- TIMESTAMP TRIGGERS
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_user_media_updated BEFORE UPDATE ON public.user_media FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_user_seasons_updated BEFORE UPDATE ON public.user_seasons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_friendships_updated BEFORE UPDATE ON public.friendships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- AUTO PROFILE
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base_username TEXT; final_username TEXT; suffix INT := 0;
BEGIN
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
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEASON ROLLUP
CREATE OR REPLACE FUNCTION public.rollup_user_media_status() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE um_id UUID; total INT; completed_or_skipped INT; watching INT; planned INT; new_status public.watch_status;
BEGIN
  um_id := COALESCE(NEW.user_media_id, OLD.user_media_id);
  SELECT COUNT(*) INTO total FROM public.user_seasons WHERE user_media_id = um_id;
  IF total = 0 THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COUNT(*) INTO completed_or_skipped FROM public.user_seasons WHERE user_media_id = um_id AND status IN ('completed','skipped');
  SELECT COUNT(*) INTO watching FROM public.user_seasons WHERE user_media_id = um_id AND status IN ('watching','rewatching');
  SELECT COUNT(*) INTO planned FROM public.user_seasons WHERE user_media_id = um_id AND status = 'planned';
  IF completed_or_skipped = total THEN new_status := 'completed';
  ELSIF watching > 0 THEN new_status := 'watching';
  ELSIF planned > 0 THEN new_status := 'planned';
  ELSE new_status := 'paused'; END IF;
  UPDATE public.user_media SET status = new_status, updated_at = now() WHERE id = um_id;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER trg_user_seasons_rollup AFTER INSERT OR UPDATE OR DELETE ON public.user_seasons FOR EACH ROW EXECUTE FUNCTION public.rollup_user_media_status();
