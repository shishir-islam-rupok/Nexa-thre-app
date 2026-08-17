/*
# NEXA — Bangladesh Payment System, Admin Roles, Storage, Notification Triggers

## Changes

### 1. Transactions table additions
- Added columns: `payment_method` (bkash/nagad/manual), `tx_trx_id`, `sender_phone`, `screenshot_url`, `admin_note`, `reviewed_by`, `reviewed_at`
- These support the manual payment verification flow where users submit bKash/Nagad payments for admin review

### 2. Admin role support
- Added `role` column to profiles (user/admin/moderator), default 'user'
- Added RLS policies so admin users can read all transactions, update transaction status, and manage reports

### 3. Storage buckets
- Created `uploads` bucket for user file uploads (images, videos, documents)
- Created `avatars` bucket for profile pictures
- Set public read policies on both buckets

### 4. Notification triggers
- Created trigger function `notify_on_like` that inserts a notification when a like is added
- Created trigger function `notify_on_comment` that inserts a notification when a comment is added
- Created trigger function `notify_on_follow` that inserts a notification when a follow is added
- Attached triggers to likes, comments, and follows tables

### 5. Reports admin policies
- Admin users can now read all reports and update report status

### 6. Admin actions log
- New table `admin_actions` to track admin moderation actions with RLS
*/

-- ============================================
-- 1. ADD COLUMNS TO TRANSACTIONS
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'payment_method') THEN
    ALTER TABLE transactions ADD COLUMN payment_method text DEFAULT 'wallet';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'tx_trx_id') THEN
    ALTER TABLE transactions ADD COLUMN tx_trx_id text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'sender_phone') THEN
    ALTER TABLE transactions ADD COLUMN sender_phone text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'screenshot_url') THEN
    ALTER TABLE transactions ADD COLUMN screenshot_url text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'admin_note') THEN
    ALTER TABLE transactions ADD COLUMN admin_note text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'reviewed_by') THEN
    ALTER TABLE transactions ADD COLUMN reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'reviewed_at') THEN
    ALTER TABLE transactions ADD COLUMN reviewed_at timestamptz;
  END IF;
END $$;

-- Update status to allow 'approved', 'rejected', 'cancelled' in addition to existing
-- (no constraint change needed, status is text)

-- ============================================
-- 2. ADMIN ROLE ON PROFILES
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
    ALTER TABLE profiles ADD COLUMN role text NOT NULL DEFAULT 'user';
  END IF;
END $$;

-- Allow anyone to read role (needed for UI checks), only self to update
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Admin can read all transactions
DROP POLICY IF EXISTS "tx_read_admin" ON transactions;
CREATE POLICY "tx_read_admin" ON transactions FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')));

-- Admin can update transaction status (for approval/rejection)
DROP POLICY IF EXISTS "tx_update_admin" ON transactions;
CREATE POLICY "tx_update_admin" ON transactions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')));

-- Admin can read all reports
DROP POLICY IF EXISTS "reports_read_admin" ON reports;
CREATE POLICY "reports_read_admin" ON reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')));

-- Admin can update report status
DROP POLICY IF EXISTS "reports_update_admin" ON reports;
CREATE POLICY "reports_update_admin" ON reports FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')));

-- Admin can read all profiles (already have profiles_read_all)

-- ============================================
-- 3. STORAGE BUCKETS
-- ============================================

INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies for uploads bucket
DROP POLICY IF EXISTS "uploads_read_all" ON storage.objects;
CREATE POLICY "uploads_read_all" ON storage.objects FOR SELECT TO authenticated USING (bucket_id IN ('uploads', 'avatars'));

DROP POLICY IF EXISTS "uploads_insert_own" ON storage.objects;
CREATE POLICY "uploads_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('uploads', 'avatars') AND auth.uid() = owner);

DROP POLICY IF EXISTS "uploads_update_own" ON storage.objects;
CREATE POLICY "uploads_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('uploads', 'avatars') AND auth.uid() = owner);

DROP POLICY IF EXISTS "uploads_delete_own" ON storage.objects;
CREATE POLICY "uploads_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('uploads', 'avatars') AND auth.uid() = owner);

-- ============================================
-- 4. NOTIFICATION TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION notify_on_like() RETURNS trigger AS $$
BEGIN
  INSERT INTO notifications (user_id, actor_id, type, entity_id, entity_type, content)
  SELECT p.user_id, NEW.user_id, 'like', NEW.post_id, 'post', ''
  FROM posts p WHERE p.id = NEW.post_id AND p.user_id != NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_like ON likes;
CREATE TRIGGER trg_notify_like AFTER INSERT ON likes
  FOR EACH ROW EXECUTE FUNCTION notify_on_like();

CREATE OR REPLACE FUNCTION notify_on_comment() RETURNS trigger AS $$
BEGIN
  INSERT INTO notifications (user_id, actor_id, type, entity_id, entity_type, content)
  SELECT p.user_id, NEW.user_id, 'comment', NEW.post_id, 'post', NEW.content
  FROM posts p WHERE p.id = NEW.post_id AND p.user_id != NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_comment ON comments;
CREATE TRIGGER trg_notify_comment AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION notify_on_comment();

CREATE OR REPLACE FUNCTION notify_on_follow() RETURNS trigger AS $$
BEGIN
  INSERT INTO notifications (user_id, actor_id, type, entity_id, entity_type, content)
  VALUES (NEW.following_id, NEW.follower_id, 'follow', NEW.id, 'follow', '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_follow ON follows;
CREATE TRIGGER trg_notify_follow AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION notify_on_follow();

-- ============================================
-- 5. ADMIN ACTIONS LOG
-- ============================================

CREATE TABLE IF NOT EXISTS admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text NOT NULL DEFAULT '',
  entity_id text NOT NULL DEFAULT '',
  details text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_actions_read_admin" ON admin_actions;
CREATE POLICY "admin_actions_read_admin" ON admin_actions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')));

DROP POLICY IF EXISTS "admin_actions_insert_admin" ON admin_actions;
CREATE POLICY "admin_actions_insert_admin" ON admin_actions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')));

-- ============================================
-- 6. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);
CREATE INDEX IF NOT EXISTS idx_transactions_method ON transactions (payment_method);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions (admin_id);

-- ============================================
-- 7. REALTIME UPDATES
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE call_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE reports;
