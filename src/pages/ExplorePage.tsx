import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Profile, Post, Community } from '@/types';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Tabs from '@/components/ui/Tabs';
import { compactNumber, timeAgo } from '@/lib/format';
import { Search, TrendingUp, Users as UsersIcon, Image as ImageIcon, UserPlus, UserCheck, Compass, BadgeCheck } from 'lucide-react';
import type { PageKey } from '@/components/AppShell';

interface ExplorePageProps {
  onViewProfile: (userId: string) => void;
  onNavigate: (page: PageKey) => void;
}

export default function ExplorePage({ onViewProfile, onNavigate }: ExplorePageProps) {
  const { profile } = useAuth();
  const [tab, setTab] = useState('trending');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [allPosts, setAllPosts] = useState<{ content: string; created_at: string }[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [usersRes, postsRes, allPostsRes, communitiesRes, followsRes] = await Promise.all([
      supabase.from('profiles').select('*').neq('id', profile?.id || '').limit(20),
      supabase.from('posts').select('*, profile:profiles!user_id(*), likes(count), comments(count)').not('image_url', 'eq', '').order('created_at', { ascending: false }).limit(30),
      supabase.from('posts').select('content, created_at').order('created_at', { ascending: false }).limit(200),
      supabase.from('communities').select('*').limit(12),
      profile ? supabase.from('follows').select('following_id').eq('follower_id', profile.id) : Promise.resolve({ data: [] }),
    ]);

    setUsers((usersRes.data || []) as Profile[]);
    setPosts((postsRes.data || []) as unknown as Post[]);
    setAllPosts((allPostsRes.data || []) as { content: string; created_at: string }[]);
    setCommunities((communitiesRes.data || []) as Community[]);
    setFollowingIds(new Set((followsRes.data || []).map((f) => f.following_id)));
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  async function toggleFollow(userId: string) {
    if (!profile) return;
    if (followingIds.has(userId)) {
      await supabase.from('follows').delete().eq('follower_id', profile.id).eq('following_id', userId);
      setFollowingIds((prev) => { const n = new Set(prev); n.delete(userId); return n; });
    } else {
      await supabase.from('follows').insert({ follower_id: profile.id, following_id: userId });
      setFollowingIds((prev) => new Set(prev).add(userId));
    }
  }

  const filteredUsers = users.filter((u) =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  const mediaPosts = posts.filter((p) => p.image_url);

  const trendingTopics = (() => {
    const wordFreq: Record<string, number> = {};
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'it', 'this', 'that', 'was', 'are', 'be', 'i', 'you', 'he', 'she', 'we', 'they', 'my', 'your', 'his', 'her', 'our', 'their', 'not', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'just', 'so', 'if', 'then', 'than', 'too', 'very', 'about', 'from', 'up', 'out', 'no', 'yes']);
    allPosts.forEach((p) => {
      if (!p.content) return;
      const words = p.content.toLowerCase().match(/#\w+|[a-z]{3,}/g) || [];
      words.forEach((w) => {
        const clean = w.startsWith('#') ? w : w;
        if (!stopWords.has(clean.replace('#', ''))) {
          wordFreq[clean] = (wordFreq[clean] || 0) + 1;
        }
      });
    });
    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([topic, count]) => ({ topic, count }));
  })();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-ink-900 dark:text-white mb-4">Explore</h1>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search people, posts, communities..."
          className="w-full h-11 pl-11 pr-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl text-sm text-ink-800 dark:text-ink-100 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30 transition-all"
        />
      </div>

      <Tabs
        tabs={[
          { key: 'trending', label: 'Trending' },
          { key: 'people', label: 'People' },
          { key: 'communities', label: 'Communities' },
          { key: 'media', label: 'Media' },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5"
      />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : tab === 'trending' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-500 dark:text-ink-400 mb-2">
            <TrendingUp className="w-4 h-4" /> Trending topics
          </div>
          {trendingTopics.length === 0 ? (
            <p className="text-sm text-ink-400 py-4">No trending topics yet. Start posting to see trends here.</p>
          ) : (
            trendingTopics.map((t, i) => (
              <div key={t.topic} className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl hover:border-ink-300 dark:hover:border-ink-700 transition-colors cursor-pointer">
                <p className="text-xs text-ink-400">#{i + 1} · Trending</p>
                <p className="text-sm font-semibold text-ink-900 dark:text-ink-50 mt-0.5">{t.topic.startsWith('#') ? t.topic : `#${t.topic}`}</p>
                <p className="text-xs text-ink-400 mt-0.5">{compactNumber(t.count)} posts</p>
              </div>
            ))
          )}
          <div className="flex items-center gap-2 text-sm font-medium text-ink-500 dark:text-ink-400 mb-2 mt-6">
            <Compass className="w-4 h-4" /> Suggested posts
          </div>
          {posts.length === 0 ? (
            <p className="text-sm text-ink-400 py-4">No posts yet.</p>
          ) : (
            posts.slice(0, 5).map((post) => (
            <div key={post.id} className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl cursor-pointer" onClick={() => onViewProfile(post.user_id)}>
              <div className="flex items-center gap-2.5 mb-2">
                <Avatar name={post.profile?.full_name || 'User'} src={post.profile?.avatar_url || undefined} size={32} />
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-ink-800 dark:text-ink-100">{post.profile?.full_name}</span>
                    {post.profile?.verified && <BadgeCheck className="w-3.5 h-3.5 text-accent-500" />}
                  </div>
                  <span className="text-xs text-ink-400">{timeAgo(post.created_at)}</span>
                </div>
              </div>
              <p className="text-sm text-ink-700 dark:text-ink-200 line-clamp-2">{post.content}</p>
            </div>
            ))
          )}
        </div>
      ) : tab === 'people' ? (
        filteredUsers.length === 0 ? (
          <EmptyState icon={<UsersIcon className="w-7 h-7" />} title="No people found" description="Try a different search." />
        ) : (
          <div className="space-y-2">
            {filteredUsers.map((user) => (
              <div key={user.id} className="flex items-center gap-3 p-3 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
                <button onClick={() => onViewProfile(user.id)} className="shrink-0">
                  <Avatar name={user.full_name} src={user.avatar_url || undefined} size={44} />
                </button>
                <button onClick={() => onViewProfile(user.id)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-semibold text-ink-800 dark:text-ink-100 truncate">{user.full_name}</p>
                    {user.verified && <BadgeCheck className="w-4 h-4 text-accent-500" />}
                  </div>
                  <p className="text-xs text-ink-400 truncate">@{user.username}</p>
                  {user.bio && <p className="text-xs text-ink-500 truncate mt-0.5">{user.bio}</p>}
                </button>
                <Button
                  size="sm"
                  variant={followingIds.has(user.id) ? 'secondary' : 'primary'}
                  onClick={() => toggleFollow(user.id)}
                >
                  {followingIds.has(user.id) ? (
                    <><UserCheck className="w-3.5 h-3.5" /> Following</>
                  ) : (
                    <><UserPlus className="w-3.5 h-3.5" /> Follow</>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )
      ) : tab === 'communities' ? (
        communities.length === 0 ? (
          <EmptyState icon={<UsersIcon className="w-7 h-7" />} title="No communities yet" description="Communities will appear here once created." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {communities.map((c) => (
              <div key={c.id} className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl cursor-pointer hover:border-ink-300 dark:hover:border-ink-700 transition-colors" onClick={() => onNavigate('communities')}>
                <div className="flex items-center gap-3 mb-2">
                  {c.icon_url ? (
                    <img src={c.icon_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center">
                      <UsersIcon className="w-5 h-5 text-accent-600 dark:text-accent-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900 dark:text-ink-50 truncate">{c.name}</p>
                    <p className="text-xs text-ink-400">{c.category}</p>
                  </div>
                </div>
                <p className="text-xs text-ink-500 dark:text-ink-400 line-clamp-2">{c.description || 'No description'}</p>
              </div>
            ))}
          </div>
        )
      ) : (
        mediaPosts.length === 0 ? (
          <EmptyState icon={<ImageIcon className="w-7 h-7" />} title="No media yet" description="Posts with images will appear here." />
        ) : (
          <div className="columns-2 gap-3 [&>*]:mb-3">
            {mediaPosts.map((post) => (
              <div key={post.id} className="break-inside-avoid relative group cursor-pointer rounded-xl overflow-hidden" onClick={() => onViewProfile(post.user_id)}>
                <img src={post.image_url} alt="" className="w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={post.profile?.full_name || 'U'} src={post.profile?.avatar_url || undefined} size={24} />
                    <span className="text-xs text-white font-medium">{post.profile?.full_name}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
