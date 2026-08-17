export interface Profile {
  id: string;
  username: string;
  full_name: string;
  bio: string;
  avatar_url: string;
  cover_url: string;
  location: string;
  website: string;
  verified: boolean;
  is_private: boolean;
  role: string;
  follower_count: number;
  following_count: number;
  post_count: number;
  created_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  content: string;
  image_url: string;
  media_urls: string[];
  visibility: string;
  reply_to: string | null;
  community_id: string | null;
  created_at: string;
  profile?: Profile;
  like_count?: number;
  comment_count?: number;
  liked_by_me?: boolean;
  saved_by_me?: boolean;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: Profile;
}

export interface Like {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
}

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string;
  expires_at: string;
  created_at: string;
  profile?: Profile;
}

export interface Conversation {
  id: string;
  created_at: string;
  other_user?: Profile;
  participants?: Profile[];
  last_message?: Message;
  unread_count?: number;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  attachment_url: string | null;
  read_at: string | null;
  created_at: string;
  reactions?: MessageReaction[];
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface CallLog {
  id: string;
  conversation_id: string;
  caller_id: string;
  receiver_id: string;
  call_type: 'voice' | 'video';
  status: 'missed' | 'completed' | 'declined';
  duration_seconds: number;
  started_at: string;
  ended_at: string | null;
  caller?: Profile;
  receiver?: Profile;
}

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  cover_url: string;
  icon_url: string;
  rules: string[];
  created_by: string;
  created_at: string;
  member_count?: number;
  joined?: boolean;
  creator?: Profile;
}

export interface CommunityMember {
  id: string;
  community_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profile?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  entity_id: string | null;
  entity_type: string;
  content: string;
  read: boolean;
  created_at: string;
  actor?: Profile;
}

export interface SavedPost {
  id: string;
  user_id: string;
  post_id: string;
  created_at: string;
  post?: Post;
}

export interface Wallet {
  id: string;
  user_id: string;
  balance_cents: number;
  currency: string;
  created_at: string;
}

export interface PaymentMethod {
  id: string;
  user_id: string;
  stripe_payment_method_id: string;
  card_brand: string;
  last4: string;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  sender_id: string;
  receiver_id: string;
  amount_cents: number;
  note: string;
  stripe_payment_intent_id: string;
  status: 'pending' | 'completed' | 'failed' | 'approved' | 'rejected' | 'cancelled';
  payment_method: string;
  tx_trx_id: string;
  sender_phone: string;
  screenshot_url: string;
  admin_note: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  sender?: Profile;
  receiver?: Profile;
}

export interface Report {
  id: string;
  reporter_id: string;
  entity_type: string;
  entity_id: string;
  reason: string;
  description: string;
  status: string;
  created_at: string;
}
