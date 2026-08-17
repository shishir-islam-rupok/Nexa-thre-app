/*
# NEXA — Complete Platform Schema

## Overview
Full database schema for the NEXA all-in-one social platform with:
social feed, stories, messaging, communities, wallet/payments, notifications,
saved posts, message reactions, and user reports.

## Tables
1. profiles — User profiles linked to auth.users (with cover, location, website, verified, counts)
2. posts — Feed posts with media, visibility, reply threading, community scoping
3. comments — Comments on posts
4. likes — Likes on posts (unique per user per post)
5. follows — Follow relationships
6. stories — Ephemeral 24h stories with media
7. conversations — 1-on-1 and group conversation rooms
8. conversation_participants — Maps users to conversations
9. messages — Individual messages with read receipts
10. message_reactions — Emoji reactions on messages
11. call_logs — Voice/video call records
12. communities — User-created communities with categories and rules
13. community_members — Membership with roles (member/admin/moderator)
14. notifications — User notifications (like, comment, follow, message, payment, mention)
15. saved_posts — Bookmarked posts
16. wallets — User wallet balances in cents
17. payment_methods — Stored card references
18. transactions — P2P payment records
19. reports — User-submitted reports

## Security (RLS)
- All tables have RLS enabled with ownership or membership checks.
- See detailed policy comments in SQL below.
*/

-- ============================================
-- TABLES (created in dependency order)
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  full_name text NOT NULL DEFAULT '',
  bio text DEFAULT '',
  avatar_url text DEFAULT '',
  cover_url text DEFAULT '',
  location text DEFAULT '',
  website text DEFAULT '',
  verified boolean DEFAULT false,
  is_private boolean DEFAULT false,
  follower_count int DEFAULT 0,
  following_count int DEFAULT 0,
  post_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'General',
  cover_url text DEFAULT '',
  icon_url text DEFAULT '',
  rules text[] DEFAULT '{}',
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  image_url text DEFAULT '',
  media_urls text[] DEFAULT '{}',
  visibility text NOT NULL DEFAULT 'public',
  reply_to uuid REFERENCES posts(id) ON DELETE SET NULL,
  community_id uuid REFERENCES communities(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  media_url text NOT NULL DEFAULT '',
  media_type text NOT NULL DEFAULT 'image',
  caption text DEFAULT '',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz DEFAULT now()
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

CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL DEFAULT '👍',
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id)
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

CREATE TABLE IF NOT EXISTS community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz DEFAULT now(),
  UNIQUE(community_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'like',
  entity_id uuid,
  entity_type text DEFAULT '',
  content text DEFAULT '',
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, post_id)
);

CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  balance_cents int NOT NULL DEFAULT 0,
  currency text DEFAULT 'USD',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_payment_method_id text DEFAULT '',
  card_brand text DEFAULT '',
  last4 text DEFAULT '',
  exp_month int,
  exp_year int,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
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

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  entity_type text NOT NULL DEFAULT 'post',
  entity_id uuid NOT NULL,
  reason text NOT NULL DEFAULT 'spam',
  description text DEFAULT '',
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
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLICIES
-- ============================================

-- PROFILES
DROP POLICY IF EXISTS "profiles_read_all" ON profiles;
CREATE POLICY "profiles_read_all" ON profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- POSTS
DROP POLICY IF EXISTS "posts_read_all" ON posts;
CREATE POLICY "posts_read_all" ON posts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "posts_insert_own" ON posts;
CREATE POLICY "posts_insert_own" ON posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "posts_update_own" ON posts;
CREATE POLICY "posts_update_own" ON posts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "posts_delete_own" ON posts;
CREATE POLICY "posts_delete_own" ON posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- COMMENTS
DROP POLICY IF EXISTS "comments_read_all" ON comments;
CREATE POLICY "comments_read_all" ON comments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "comments_insert_own" ON comments;
CREATE POLICY "comments_insert_own" ON comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "comments_delete_own" ON comments;
CREATE POLICY "comments_delete_own" ON comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- LIKES
DROP POLICY IF EXISTS "likes_read_all" ON likes;
CREATE POLICY "likes_read_all" ON likes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "likes_insert_own" ON likes;
CREATE POLICY "likes_insert_own" ON likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "likes_delete_own" ON likes;
CREATE POLICY "likes_delete_own" ON likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- FOLLOWS
DROP POLICY IF EXISTS "follows_read_all" ON follows;
CREATE POLICY "follows_read_all" ON follows FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "follows_insert_own" ON follows;
CREATE POLICY "follows_insert_own" ON follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
DROP POLICY IF EXISTS "follows_delete_own" ON follows;
CREATE POLICY "follows_delete_own" ON follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- STORIES
DROP POLICY IF EXISTS "stories_read_all" ON stories;
CREATE POLICY "stories_read_all" ON stories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "stories_insert_own" ON stories;
CREATE POLICY "stories_insert_own" ON stories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "stories_delete_own" ON stories;
CREATE POLICY "stories_delete_own" ON stories FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- CONVERSATIONS
DROP POLICY IF EXISTS "conv_read_participant" ON conversations;
CREATE POLICY "conv_read_participant" ON conversations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()));
DROP POLICY IF EXISTS "conv_insert_any" ON conversations;
CREATE POLICY "conv_insert_any" ON conversations FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "conv_delete_participant" ON conversations;
CREATE POLICY "conv_delete_participant" ON conversations FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()));

-- CONVERSATION PARTICIPANTS
DROP POLICY IF EXISTS "cp_read_participant" ON conversation_participants;
CREATE POLICY "cp_read_participant" ON conversation_participants FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT cp2.conversation_id FROM conversation_participants cp2 WHERE cp2.user_id = auth.uid()) OR user_id = auth.uid());
DROP POLICY IF EXISTS "cp_insert_own_or_conv" ON conversation_participants;
CREATE POLICY "cp_insert_own_or_conv" ON conversation_participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM conversation_participants cp3 WHERE cp3.conversation_id = conversation_participants.conversation_id AND cp3.user_id = auth.uid()));

-- MESSAGES
DROP POLICY IF EXISTS "msg_read_participant" ON messages;
CREATE POLICY "msg_read_participant" ON messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()));
DROP POLICY IF EXISTS "msg_insert_participant" ON messages;
CREATE POLICY "msg_insert_participant" ON messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()));
DROP POLICY IF EXISTS "msg_update_participant" ON messages;
CREATE POLICY "msg_update_participant" ON messages FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()));
DROP POLICY IF EXISTS "msg_delete_own" ON messages;
CREATE POLICY "msg_delete_own" ON messages FOR DELETE TO authenticated USING (auth.uid() = sender_id);

-- MESSAGE REACTIONS
DROP POLICY IF EXISTS "reaction_read_participant" ON message_reactions;
CREATE POLICY "reaction_read_participant" ON message_reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM messages m JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id WHERE m.id = message_reactions.message_id AND cp.user_id = auth.uid()));
DROP POLICY IF EXISTS "reaction_insert_own" ON message_reactions;
CREATE POLICY "reaction_insert_own" ON message_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "reaction_delete_own" ON message_reactions;
CREATE POLICY "reaction_delete_own" ON message_reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- CALL LOGS
DROP POLICY IF EXISTS "calllog_read_party" ON call_logs;
CREATE POLICY "calllog_read_party" ON call_logs FOR SELECT TO authenticated USING (auth.uid() = caller_id OR auth.uid() = receiver_id);
DROP POLICY IF EXISTS "calllog_insert_caller" ON call_logs;
CREATE POLICY "calllog_insert_caller" ON call_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = caller_id);

-- COMMUNITIES
DROP POLICY IF EXISTS "communities_read_all" ON communities;
CREATE POLICY "communities_read_all" ON communities FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "communities_insert_own" ON communities;
CREATE POLICY "communities_insert_own" ON communities FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "communities_update_creator" ON communities;
CREATE POLICY "communities_update_creator" ON communities FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "communities_delete_creator" ON communities;
CREATE POLICY "communities_delete_creator" ON communities FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- COMMUNITY MEMBERS
DROP POLICY IF EXISTS "cm_read_all" ON community_members;
CREATE POLICY "cm_read_all" ON community_members FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cm_insert_own" ON community_members;
CREATE POLICY "cm_insert_own" ON community_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "cm_delete_own" ON community_members;
CREATE POLICY "cm_delete_own" ON community_members FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "cm_update_own" ON community_members;
CREATE POLICY "cm_update_own" ON community_members FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- NOTIFICATIONS
DROP POLICY IF EXISTS "notif_read_own" ON notifications;
CREATE POLICY "notif_read_own" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_insert_own" ON notifications;
CREATE POLICY "notif_insert_own" ON notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_update_own" ON notifications;
CREATE POLICY "notif_update_own" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_delete_own" ON notifications;
CREATE POLICY "notif_delete_own" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- SAVED POSTS
DROP POLICY IF EXISTS "saved_read_own" ON saved_posts;
CREATE POLICY "saved_read_own" ON saved_posts FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "saved_insert_own" ON saved_posts;
CREATE POLICY "saved_insert_own" ON saved_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "saved_delete_own" ON saved_posts;
CREATE POLICY "saved_delete_own" ON saved_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- WALLETS
DROP POLICY IF EXISTS "wallet_read_own" ON wallets;
CREATE POLICY "wallet_read_own" ON wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "wallet_insert_own" ON wallets;
CREATE POLICY "wallet_insert_own" ON wallets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "wallet_update_own" ON wallets;
CREATE POLICY "wallet_update_own" ON wallets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- PAYMENT METHODS
DROP POLICY IF EXISTS "pm_read_own" ON payment_methods;
CREATE POLICY "pm_read_own" ON payment_methods FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "pm_insert_own" ON payment_methods;
CREATE POLICY "pm_insert_own" ON payment_methods FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "pm_update_own" ON payment_methods;
CREATE POLICY "pm_update_own" ON payment_methods FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "pm_delete_own" ON payment_methods;
CREATE POLICY "pm_delete_own" ON payment_methods FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- TRANSACTIONS
DROP POLICY IF EXISTS "tx_read_party" ON transactions;
CREATE POLICY "tx_read_party" ON transactions FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
DROP POLICY IF EXISTS "tx_insert_sender" ON transactions;
CREATE POLICY "tx_insert_sender" ON transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
DROP POLICY IF EXISTS "tx_update_sender" ON transactions;
CREATE POLICY "tx_update_sender" ON transactions FOR UPDATE TO authenticated USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);

-- REPORTS
DROP POLICY IF EXISTS "reports_insert_any" ON reports;
CREATE POLICY "reports_insert_any" ON reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "reports_read_reporter" ON reports;
CREATE POLICY "reports_read_reporter" ON reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts (user_id);
CREATE INDEX IF NOT EXISTS idx_posts_community ON posts (community_id) WHERE community_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes (post_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id);
CREATE INDEX IF NOT EXISTS idx_stories_user ON stories (user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_conv ON conversation_participants (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON message_reactions (message_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_party ON call_logs (caller_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_communities_slug ON communities (slug);
CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members (user_id);
CREATE INDEX IF NOT EXISTS idx_community_members_community ON community_members (community_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, read);
CREATE INDEX IF NOT EXISTS idx_saved_posts_user ON saved_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_party ON transactions (sender_id, receiver_id);

-- ============================================
-- REALTIME
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE posts;
ALTER PUBLICATION supabase_realtime ADD TABLE likes;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE stories;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE community_members;
ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;