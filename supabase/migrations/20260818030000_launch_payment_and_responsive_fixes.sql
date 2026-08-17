/* NEXA launch reliability fixes
   - Allow authenticated users to submit their own payment records.
   - Allow a user to send only payment-request notifications to another user.
   - Prevent duplicate manual transaction IDs.
   - Add indexes used by payment/admin views.
*/

DROP POLICY IF EXISTS "tx_insert_own" ON public.transactions;
CREATE POLICY "tx_insert_own" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND amount_cents > 0
    AND status = 'pending'
    AND receiver_id IS NOT NULL
  );

DROP POLICY IF EXISTS "notifications_insert_payment_request" ON public.notifications;
CREATE POLICY "notifications_insert_payment_request" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = actor_id
    AND user_id <> auth.uid()
    AND type = 'payment_request'
    AND entity_type = 'payment_request'
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_trx_id_unique
  ON public.transactions (tx_trx_id)
  WHERE tx_trx_id IS NOT NULL AND length(trim(tx_trx_id)) > 0;

CREATE INDEX IF NOT EXISTS idx_transactions_user_created
  ON public.transactions (sender_id, receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_pending
  ON public.transactions (status, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notifications_payment_requests
  ON public.notifications (user_id, created_at DESC)
  WHERE type = 'payment_request';
