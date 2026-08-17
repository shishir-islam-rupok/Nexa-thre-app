-- Prevent users from promoting themselves through the profile update policy.
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND role = 'admin'
     ) THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- Backfill hashtag counters for posts that existed before the trigger was installed.
INSERT INTO public.hashtag_stats(hashtag, post_count, last_used_at)
SELECT tag, count(*)::bigint, max(created_at)
FROM public.posts p
CROSS JOIN LATERAL unnest(public.extract_post_hashtags(p.content)) AS tag
GROUP BY tag
ON CONFLICT (hashtag) DO UPDATE SET
  post_count = EXCLUDED.post_count,
  last_used_at = EXCLUDED.last_used_at;

-- Helpful feed indexes.
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages (conversation_id, created_at DESC);
