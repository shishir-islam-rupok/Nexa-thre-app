import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Post } from '@/types';
import Avatar from '@/components/ui/Avatar';
import EmptyState from '@/components/ui/EmptyState';
import { timeAgo, compactNumber } from '@/lib/format';
import { Bookmark, Heart, MessageCircle, BadgeCheck } from 'lucide-react';

interface SavedPageProps {
  onViewProfile: (userId: string) => void;
}

export default function SavedPage({ onViewProfile }: SavedPageProps) {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('saved_posts')
      .select('post:posts(*, profile:profiles!user_id(*), likes(count), comments(count))')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    const formatted: Post[] = (data || []).map((s) => {
      const p = (s as Record<string, unknown>).post as Record<string, unknown>;
      return {
        id: p.id as string,
        user_id: p.user_id as string,
        content: p.content as string,
        image_url: p.image_url as string,
        media_urls: (p.media_urls as string[]) || [],
        visibility: p.visibility as string,
        reply_to: p.reply_to as string | null,
        community_id: p.community_id as string | null,
        created_at: p.created_at as string,
        profile: p.profile as Post['profile'],
        like_count: (p.likes as Array<{ count: number }>)?.[0]?.count ?? 0,
        comment_count: (p.comments as Array<{ count: number }>)?.[0]?.count ?? 0,
      };
    });
    setPosts(formatted);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  if (!profile) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-ink-900 dark:text-white mb-5">Saved Posts</h1>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl animate-pulse" />)}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<Bookmark className="w-7 h-7" />}
          title="No saved posts yet"
          description="Bookmark posts from your feed to find them here later."
        />
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              onClick={() => onViewProfile(post.user_id)}
              className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl cursor-pointer hover:border-ink-300 dark:hover:border-ink-700 transition-colors"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <Avatar name={post.profile?.full_name || 'User'} src={post.profile?.avatar_url || undefined} size={32} />
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-ink-800 dark:text-ink-100">{post.profile?.full_name}</span>
                    {post.profile?.verified && <BadgeCheck className="w-3.5 h-3.5 text-accent-500" />}
                  </div>
                  <span className="text-xs text-ink-400">{timeAgo(post.created_at)}</span>
                </div>
                <Bookmark className="w-4 h-4 text-accent-500 fill-current ml-auto" />
              </div>
              <p className="text-sm text-ink-700 dark:text-ink-200 line-clamp-3">{post.content}</p>
              {post.image_url && <img src={post.image_url} alt="" className="mt-3 rounded-xl w-full max-h-60 object-cover" />}
              <div className="flex items-center gap-4 mt-3 text-xs text-ink-400">
                <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> {compactNumber(post.like_count || 0)}</span>
                <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {compactNumber(post.comment_count || 0)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
