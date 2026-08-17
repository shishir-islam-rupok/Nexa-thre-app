/* NEXA reliability upgrade
   - Atomic/admin-authorized payment settlement
   - Transaction status notification trigger
   - Message + mention notification triggers
   - Persistent hashtag/trending counters
*/

-- ------------------------------------------------------------
-- Trending hashtags
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hashtag_stats (
  hashtag text PRIMARY KEY,
  post_count bigint NOT NULL DEFAULT 0,
  last_used_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hashtag_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hashtag_stats_read_authenticated" ON public.hashtag_stats;
CREATE POLICY "hashtag_stats_read_authenticated" ON public.hashtag_stats
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_hashtag_stats_trending
  ON public.hashtag_stats (post_count DESC, last_used_at DESC);

CREATE OR REPLACE FUNCTION public.extract_post_hashtags(p_content text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(array_agg(DISTINCT lower(m[1])), ARRAY[]::text[])
  FROM regexp_matches(COALESCE(p_content, ''), '#([[:alnum:]_]+)', 'g') AS m;
$$;

CREATE OR REPLACE FUNCTION public.sync_hashtag_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tag text;
  tags text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    tags := public.extract_post_hashtags(OLD.content);
    FOREACH tag IN ARRAY tags LOOP
      UPDATE public.hashtag_stats
      SET post_count = GREATEST(0, post_count - 1)
      WHERE hashtag = tag;
    END LOOP;
    RETURN OLD;
  END IF;

  tags := public.extract_post_hashtags(NEW.content);
  FOREACH tag IN ARRAY tags LOOP
    INSERT INTO public.hashtag_stats(hashtag, post_count, last_used_at)
    VALUES (tag, 1, now())
    ON CONFLICT (hashtag) DO UPDATE SET
      post_count = public.hashtag_stats.post_count + 1,
      last_used_at = now();
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_hashtag_stats_insert ON public.posts;
CREATE TRIGGER trg_sync_hashtag_stats_insert
AFTER INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.sync_hashtag_stats();

DROP TRIGGER IF EXISTS trg_sync_hashtag_stats_delete ON public.posts;
CREATE TRIGGER trg_sync_hashtag_stats_delete
AFTER DELETE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.sync_hashtag_stats();

-- ------------------------------------------------------------
-- Notification generation
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  recipient uuid;
BEGIN
  SELECT cp.user_id INTO recipient
  FROM conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id
  LIMIT 1;

  IF recipient IS NOT NULL THEN
    INSERT INTO notifications(user_id, actor_id, type, entity_id, entity_type, content)
    VALUES (recipient, NEW.sender_id, 'message', NEW.conversation_id, 'conversation',
            CASE WHEN length(COALESCE(NEW.content, '')) > 80
              THEN left(NEW.content, 77) || '...'
              ELSE COALESCE(NEW.content, 'New message') END);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_message ON public.messages;
CREATE TRIGGER trg_notify_message
AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();

CREATE OR REPLACE FUNCTION public.notify_on_transaction_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('approved','rejected','completed','failed','cancelled') THEN
    INSERT INTO notifications(user_id, actor_id, type, entity_id, entity_type, content)
    VALUES (NEW.sender_id, NEW.reviewed_by, 'payment', NEW.id, 'transaction',
      'Payment ' || COALESCE(NEW.status, 'updated') || ' • ' ||
      to_char(COALESCE(NEW.amount_cents, 0) / 100.0, 'FM999999990.00'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_transaction_status ON public.transactions;
CREATE TRIGGER trg_notify_transaction_status
AFTER UPDATE OF status ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.notify_on_transaction_status();

-- ------------------------------------------------------------
-- Safe payment settlement
-- Client code must call this RPC instead of changing wallet balances.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_payment(
  p_transaction_id uuid,
  p_status text,
  p_admin_note text DEFAULT ''
)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid := auth.uid();
  tx public.transactions;
  sender_wallet public.wallets;
  receiver_wallet public.wallets;
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = actor AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can review payments';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid payment status';
  END IF;

  SELECT * INTO tx FROM public.transactions
  WHERE id = p_transaction_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF tx.status <> 'pending' THEN RAISE EXCEPTION 'Transaction has already been reviewed'; END IF;

  IF p_status = 'approved' THEN
    IF tx.sender_id = tx.receiver_id THEN
      INSERT INTO public.wallets(user_id, balance_cents, currency)
      VALUES (tx.receiver_id, 0, 'BDT')
      ON CONFLICT (user_id) DO NOTHING;
      SELECT * INTO receiver_wallet FROM public.wallets WHERE user_id = tx.receiver_id FOR UPDATE;
      UPDATE public.wallets
      SET balance_cents = receiver_wallet.balance_cents + tx.amount_cents
      WHERE user_id = tx.receiver_id;
    ELSE
      INSERT INTO public.wallets(user_id, balance_cents, currency)
      VALUES (tx.sender_id, 0, 'BDT'), (tx.receiver_id, 0, 'BDT')
      ON CONFLICT (user_id) DO NOTHING;
      SELECT * INTO sender_wallet FROM public.wallets WHERE user_id = tx.sender_id FOR UPDATE;
      SELECT * INTO receiver_wallet FROM public.wallets WHERE user_id = tx.receiver_id FOR UPDATE;

      IF sender_wallet.balance_cents < tx.amount_cents THEN
        RAISE EXCEPTION 'Insufficient sender balance';
      END IF;

      UPDATE public.wallets SET balance_cents = balance_cents - tx.amount_cents
      WHERE user_id = tx.sender_id;
      UPDATE public.wallets SET balance_cents = balance_cents + tx.amount_cents
      WHERE user_id = tx.receiver_id;
    END IF;
  END IF;

  UPDATE public.transactions
  SET status = p_status,
      admin_note = COALESCE(p_admin_note, admin_note, ''),
      reviewed_by = actor,
      reviewed_at = now()
  WHERE id = tx.id
  RETURNING * INTO tx;

  INSERT INTO public.admin_actions(admin_id, action, entity_type, entity_id, details)
  VALUES (actor, 'payment_' || p_status, 'transaction', tx.id::text, COALESCE(p_admin_note, ''));

  RETURN tx;
END;
$$;

REVOKE ALL ON FUNCTION public.review_payment(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_payment(uuid, text, text) TO authenticated;

-- Realtime for persistent trending and notifications.
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.hashtag_stats; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
