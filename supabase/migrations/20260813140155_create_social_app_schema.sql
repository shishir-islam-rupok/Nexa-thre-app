/*
# Social App Schema — Profiles, Posts, Comments, Likes, Follows, Conversations, Messages, Calls, Transactions

## Overview
Creates the full database schema for a social media app with Facebook-style feed,
WhatsApp-style messaging and calls, and PayPal-style person-to-person payments.

## New Tables
1. profiles — Public user profile data linked to auth.users
2. posts — User posts in the social feed
3. comments — Comments on posts
4. likes — Likes on posts (one per user per post)
5. follows — Follow relationships between users
6. conversations — 1-on-1 conversation rooms
7. conversation_participants — Maps users to conversations
8. messages — Individual messages in conversations
9. call_logs — Record of voice/video calls
10. transactions — P2P payment records (Stripe)

## Security (RLS)
- All tables have RLS enabled.
- profiles: anyone authenticated can read; users can update only their own.
- posts, comments, likes: anyone authenticated can read; users can create/update/delete only their own.
- follows: anyone authenticated can read; users can create/delete only their own follows.
- conversations + participants: users can read only conversations they participate in.
- messages: users can read/send messages only in conversations they participate in.
- call_logs: users can read logs where they are caller or receiver.
- transactions: users can read transactions where they are sender or receiver; can create only as sender.
*/

-- ============================================
-- TABLES (all created first, before policies)
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  full_name text NOT NULL DEFAULT '',
  bio text DEFAULT '',
  avatar_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  image_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  caller_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  call_type text NOT NULL DEFAULT 'voice',
  status text NOT NULL DEFAULT 'completed',
  duration_seconds int NOT NULL DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_cents int NOT NULL,
  note text DEFAULT '',
  stripe_payment_intent_id text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLICIES
-- ============================================

-- PROFILES
DROP POLICY IF EXISTS "profiles_read_all" ON profiles;
CREATE POLICY "profiles_read_all" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- POSTS
DROP POLICY IF EXISTS "posts_read_all" ON posts;
CREATE POLICY "posts_read_all" ON posts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "posts_insert_own" ON posts;
CREATE POLICY "posts_insert_own" ON posts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "posts_update_own" ON posts;
CREATE POLICY "posts_update_own" ON posts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "posts_delete_own" ON posts;
CREATE POLICY "posts_delete_own" ON posts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- COMMENTS
DROP POLICY IF EXISTS "comments_read_all" ON comments;
CREATE POLICY "comments_read_all" ON comments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "comments_insert_own" ON comments;
CREATE POLICY "comments_insert_own" ON comments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comments_delete_own" ON comments;
CREATE POLICY "comments_delete_own" ON comments FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- LIKES
DROP POLICY IF EXISTS "likes_read_all" ON likes;
CREATE POLICY "likes_read_all" ON likes FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "likes_insert_own" ON likes;
CREATE POLICY "likes_insert_own" ON likes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "likes_delete_own" ON likes;
CREATE POLICY "likes_delete_own" ON likes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- FOLLOWS
DROP POLICY IF EXISTS "follows_read_all" ON follows;
CREATE POLICY "follows_read_all" ON follows FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "follows_insert_own" ON follows;
CREATE POLICY "follows_insert_own" ON follows FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "follows_delete_own" ON follows;
CREATE POLICY "follows_delete_own" ON follows FOR DELETE
  TO authenticated USING (auth.uid() = follower_id);

-- CONVERSATIONS
DROP POLICY IF EXISTS "conv_read_participant" ON conversations;
CREATE POLICY "conv_read_participant" ON conversations FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "conv_insert_any" ON conversations;
CREATE POLICY "conv_insert_any" ON conversations FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "conv_delete_participant" ON conversations;
CREATE POLICY "conv_delete_participant" ON conversations FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid())
  );

-- CONVERSATION PARTICIPANTS
DROP POLICY IF EXISTS "cp_read_participant" ON conversation_participants;
CREATE POLICY "cp_read_participant" ON conversation_participants FOR SELECT
  TO authenticated USING (
    conversation_id IN (
      SELECT cp2.conversation_id FROM conversation_participants cp2 WHERE cp2.user_id = auth.uid()
    ) OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "cp_insert_own_or_conv" ON conversation_participants;
CREATE POLICY "cp_insert_own_or_conv" ON conversation_participants FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM conversation_participants cp3
      WHERE cp3.conversation_id = conversation_participants.conversation_id
      AND cp3.user_id = auth.uid()
    )
  );

-- MESSAGES
DROP POLICY IF EXISTS "msg_read_participant" ON messages;
CREATE POLICY "msg_read_participant" ON messages FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "msg_insert_participant" ON messages;
CREATE POLICY "msg_insert_participant" ON messages FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "msg_update_participant" ON messages;
CREATE POLICY "msg_update_participant" ON messages FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid())
  );

-- CALL LOGS
DROP POLICY IF EXISTS "calllog_read_party" ON call_logs;
CREATE POLICY "calllog_read_party" ON call_logs FOR SELECT
  TO authenticated USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "calllog_insert_caller" ON call_logs;
CREATE POLICY "calllog_insert_caller" ON call_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = caller_id);

-- TRANSACTIONS
DROP POLICY IF EXISTS "tx_read_party" ON transactions;
CREATE POLICY "tx_read_party" ON transactions FOR SELECT
  TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "tx_insert_sender" ON transactions;
CREATE POLICY "tx_insert_sender" ON transactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "tx_update_sender" ON transactions;
CREATE POLICY "tx_update_sender" ON transactions FOR UPDATE
  TO authenticated USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts (user_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes (post_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_conv ON conversation_participants (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_call_logs_party ON call_logs (caller_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_transactions_party ON transactions (sender_id, receiver_id);

-- ============================================
-- REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE posts;
ALTER PUBLICATION supabase_realtime ADD TABLE likes;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_participants;