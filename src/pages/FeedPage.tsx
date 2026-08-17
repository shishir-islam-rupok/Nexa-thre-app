import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import type { Post, Comment, Profile, Story } from '@/types';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Dropdown from '@/components/ui/Dropdown';
import EmptyState from '@/components/ui/EmptyState';
import { uploadFile } from '@/lib/upload';
import { timeAgo } from '@/lib/format';
import { compactNumber } from '@/lib/format';
import {
  Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Trash2,
  ImagePlus, Send, Globe, Users as UsersIcon, Lock, Plus, X,
  BadgeCheck, Loader2,
} from 'lucide-react';
import type { PageKey } from '@/components/AppShell';

interface FeedPageProps {
  onViewProfile: (userId: string) => void;
  onNavigate: (page: PageKey) => void;
}

export default function FeedPage({ onViewProfile }: FeedPageProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerContent, setComposerContent] = useState('');
  const [composerImage, setComposerImage] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [posting, setPosting] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>('public');
  const [filter, setFilter] = useState<'foryou' | 'following'>('foryou');
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentsByPost, setCommentsByPost] = useState<Record<string, Comment[]>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [viewingStory, setViewingStory] = useState<Profile | null>(null);

  const loadFollowing = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', profile.id);
    setFollowingIds(new Set((data || []).map((f) => f.following_id)));
  }, [profile]);

  const loadSaved = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('saved_posts')
      .select('post_id')
      .eq('user_id', profile.id);
    setSavedIds(new Set((data || []).map((s) => s.post_id)));
  }, [profile]);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select(`*, profile:profiles!user_id(*), likes(count), comments(count)`)
      .is('reply_to', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data) {
      setLoading(false);
      return;
    }

    const postIds = data.map((p) => p.id);
    const [likesRes, commentsRes] = await Promise.all([
      supabase.from('likes').select('post_id').in('post_id', postIds).eq('user_id', profile?.id || ''),
      supabase.from('comments').select('id, post_id, content, created_at, user_id, profile:profiles!user_id(*)').in('post_id', postIds).order('created_at', { ascending: true }),
    ]);

    const likedSet = new Set((likesRes.data || []).map((l) => l.post_id));
    const commentsMap: Record<string, Comment[]> = {};
    (commentsRes.data || []).forEach((c) => {
      const comment: Comment = {
        id: c.id,
        post_id: c.post_id,
        user_id: c.user_id,
        content: c.content,
        created_at: c.created_at,
        profile: c.profile as unknown as Profile,
      };
      if (!commentsMap[c.post_id]) commentsMap[c.post_id] = [];
      commentsMap[c.post_id].push(comment);
    });

    const formatted: Post[] = data.map((p) => ({
      id: p.id,
      user_id: p.user_id,
      content: p.content,
      image_url: p.image_url,
      media_urls: p.media_urls || [],
      visibility: p.visibility,
      reply_to: p.reply_to,
      community_id: p.community_id,
      created_at: p.created_at,
      profile: p.profile as unknown as Profile,
      like_count: p.likes?.[0]?.count ?? 0,
      comment_count: p.comments?.[0]?.count ?? 0,
      liked_by_me: likedSet.has(p.id),
      saved_by_me: savedIds.has(p.id),
    }));

    setPosts(formatted);
    setCommentsByPost(commentsMap);
    setLoading(false);
  }, [profile, savedIds]);

  const loadStories = useCallback(async () => {
    const { data } = await supabase
      .from('stories')
      .select('*, profile:profiles!user_id(*)')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    setStories((data || []) as unknown as Story[]);
  }, []);

  useEffect(() => {
    loadFollowing();
    loadSaved();
    loadStories();
  }, [loadFollowing, loadSaved, loadStories]);

  useEffect(() => {
    if (profile) loadPosts();
  }, [profile, loadPosts]);

  useEffect(() => {
    const channel = supabase
      .channel('feed-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => loadPosts())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, () => loadPosts())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes' }, () => loadPosts())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'likes' }, () => loadPosts())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, () => loadPosts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadPosts]);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    const result = await uploadFile(file, 'uploads');
    if (result.error) {
      showToast(result.error, 'error');
    } else {
      setComposerImage(result.url);
    }
    setUploadingImage(false);
  }

  async function handlePost() {
    if (!composerContent.trim() && !composerImage) return;
    setPosting(true);
    const { error } = await supabase
      .from('posts')
      .insert({ content: composerContent.trim(), image_url: composerImage || null, visibility });
    if (error) {
      showToast('Failed to post', 'error');
    } else {
      setComposerContent('');
      setComposerImage('');
      showToast('Posted successfully');
      loadPosts();
    }
    setPosting(false);
  }

  async function toggleLike(postId: string, liked: boolean) {
    if (!profile) return;
    if (liked) {
      await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', profile.id);
    } else {
      await supabase.from('likes').insert({ post_id: postId });
    }
    loadPosts();
  }

  async function toggleSave(postId: string) {
    if (!profile) return;
    if (savedIds.has(postId)) {
      await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', profile.id);
      setSavedIds((prev) => { const n = new Set(prev); n.delete(postId); return n; });
      showToast('Removed from saved', 'info');
    } else {
      await supabase.from('saved_posts').insert({ post_id: postId });
      setSavedIds((prev) => new Set(prev).add(postId));
      showToast('Saved');
    }
  }

  async function deletePost(postId: string) {
    await supabase.from('posts').delete().eq('id', postId);
    showToast('Post deleted', 'info');
    loadPosts();
  }

  async function submitComment(postId: string) {
    const text = commentInputs[postId]?.trim();
    if (!text || !profile) return;
    await supabase.from('comments').insert({ post_id: postId, content: text });
    setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
    loadPosts();
  }

  function toggleComments(postId: string) {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  async function deleteComment(commentId: string) {
    await supabase.from('comments').delete().eq('id', commentId);
    loadPosts();
  }

  async function addStory(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const result = await uploadFile(file, 'uploads');
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    const { error } = await supabase
      .from('stories')
      .insert({ user_id: profile.id, media_url: result.url, media_type: 'image' });
    if (error) {
      showToast('Failed to add story', 'error');
    } else {
      showToast('Story added');
      loadStories();
    }
  }

  const visiblePosts = filter === 'following' && profile
    ? posts.filter((p) => followingIds.has(p.user_id) || p.user_id === profile.id)
    : posts;

  const storyUsers = stories.reduce((acc, s) => {
    if (!acc.find((u) => u.user_id === s.user_id)) acc.push(s);
    return acc;
  }, [] as Story[]);

  const visibilityIcon = { public: Globe, followers: UsersIcon, private: Lock };
  const VisibilityIcon = visibilityIcon[visibility];

  if (!profile) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Stories rail */}
      <div className="flex items-center gap-4 overflow-x-auto scrollbar-none pb-4 mb-2">
        {/* Add story */}
        <label className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer">
          <div className="relative w-16 h-16">
            <Avatar name={profile.full_name} src={profile.avatar_url || undefined} size={64} className="opacity-90" />
            <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-accent-600 border-2 border-white dark:border-ink-950 flex items-center justify-center">
              <Plus className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <span className="text-xs text-ink-500 dark:text-ink-400">Add Story</span>
          <input type="file" accept="image/*" className="hidden" onChange={addStory} />
        </label>
        {/* Stories */}
        {storyUsers.map((story) => {
          const sProfile = story.profile as Profile;
          if (!sProfile) return null;
          return (
            <button
              key={story.user_id}
              onClick={() => setViewingStory(sProfile)}
              className="flex flex-col items-center gap-1.5 shrink-0"
            >
              <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-accent-500 via-accent-400 to-emerald-400">
                <div className="w-full h-full rounded-full p-[2px] bg-white dark:bg-ink-950">
                  <Avatar name={sProfile.full_name} src={sProfile.avatar_url || undefined} size={56} />
                </div>
              </div>
              <span className="text-xs text-ink-500 dark:text-ink-400 max-w-[64px] truncate">{sProfile.username}</span>
            </button>
          );
        })}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 p-1 bg-ink-100 dark:bg-ink-800 rounded-xl w-fit mb-5">
        {(['foryou', 'following'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === f ? 'bg-white dark:bg-ink-900 text-ink-900 dark:text-white shadow-sm' : 'text-ink-500 dark:text-ink-400'
            }`}
          >
            {f === 'foryou' ? 'For You' : 'Following'}
          </button>
        ))}
      </div>

      {/* Composer */}
      <div className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl p-4 mb-5">
        <div className="flex gap-3">
          <Avatar name={profile.full_name} src={profile.avatar_url || undefined} size={40} />
          <div className="flex-1">
            <textarea
              value={composerContent}
              onChange={(e) => setComposerContent(e.target.value)}
              placeholder="What's happening?"
              rows={2}
              className="w-full px-4 py-3 bg-ink-50 dark:bg-ink-800 border border-ink-100 dark:border-ink-700 rounded-xl text-sm text-ink-800 dark:text-ink-100 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30 transition-all resize-none"
            />
            {composerImage && (
              <div className="mt-2 relative inline-block">
                <img src={composerImage} alt="" className="max-h-32 rounded-xl object-cover" />
                <button
                  onClick={() => setComposerImage('')}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-rose-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {uploadingImage && (
              <div className="mt-2 flex items-center gap-2 text-sm text-ink-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Uploading image...
              </div>
            )}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1">
                <label className="p-2 rounded-lg text-ink-500 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors cursor-pointer">
                  {uploadingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                </label>
                <Dropdown
                  trigger={
                    <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink-500 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors">
                      <VisibilityIcon className="w-3.5 h-3.5" />
                      <span className="capitalize">{visibility}</span>
                    </button>
                  }
                  items={[
                    { label: 'Public', icon: <Globe className="w-4 h-4" />, onClick: () => setVisibility('public') },
                    { label: 'Followers', icon: <UsersIcon className="w-4 h-4" />, onClick: () => setVisibility('followers') },
                    { label: 'Private', icon: <Lock className="w-4 h-4" />, onClick: () => setVisibility('private') },
                  ]}
                />
              </div>
              <Button
                size="sm"
                onClick={handlePost}
                loading={posting}
                disabled={!composerContent.trim() && !composerImage}
              >
                Post
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Posts */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-ink-200 dark:bg-ink-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-28 bg-ink-200 dark:bg-ink-700 rounded" />
                  <div className="h-3 w-full bg-ink-200 dark:bg-ink-700 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : visiblePosts.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="w-7 h-7" />}
          title={filter === 'following' ? 'No posts from people you follow' : 'No posts yet'}
          description={filter === 'following' ? 'Follow people to see their posts here.' : 'Be the first to share something.'}
        />
      ) : (
        <div className="space-y-4">
          {visiblePosts.map((post) => {
            const VisIcon = visibilityIcon[post.visibility as keyof typeof visibilityIcon] || Globe;
            return (
              <article key={post.id} className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 pb-3">
                  <button onClick={() => onViewProfile(post.user_id)} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <Avatar name={post.profile?.full_name || 'User'} src={post.profile?.avatar_url || undefined} size={40} />
                    <div className="text-left">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">{post.profile?.full_name}</span>
                        {post.profile?.verified && <BadgeCheck className="w-4 h-4 text-accent-500" />}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-ink-400">
                        <span>@{post.profile?.username}</span>
                        <span>·</span>
                        <span>{timeAgo(post.created_at)}</span>
                        <VisIcon className="w-3 h-3" />
                      </div>
                    </div>
                  </button>
                  {post.user_id === profile.id && (
                    <Dropdown
                      trigger={<IconButton size="sm"><MoreHorizontal /></IconButton>}
                      items={[
                        { label: 'Delete post', icon: <Trash2 className="w-4 h-4" />, onClick: () => deletePost(post.id), danger: true },
                      ]}
                    />
                  )}
                </div>

                {/* Content */}
                {post.content && (
                  <p className="px-4 pb-3 text-sm text-ink-700 dark:text-ink-200 whitespace-pre-wrap leading-relaxed">{post.content}</p>
                )}

                {/* Media */}
                {post.image_url && (
                  <img src={post.image_url} alt="" className="w-full max-h-[500px] object-cover border-y border-ink-100 dark:border-ink-800" />
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 px-2 py-2">
                  <button
                    onClick={() => toggleLike(post.id, !!post.liked_by_me)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      post.liked_by_me ? 'text-rose-500' : 'text-ink-500 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800'
                    }`}
                  >
                    <Heart className={`w-[18px] h-[18px] ${post.liked_by_me ? 'fill-current' : ''}`} />
                    {post.like_count ? compactNumber(post.like_count) : ''}
                  </button>
                  <button
                    onClick={() => toggleComments(post.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-ink-500 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 transition-all"
                  >
                    <MessageCircle className="w-[18px] h-[18px]" />
                    {post.comment_count ? compactNumber(post.comment_count) : ''}
                  </button>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(post.content || ''); showToast('Copied to clipboard'); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-ink-500 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 transition-all"
                  >
                    <Share2 className="w-[18px] h-[18px]" />
                  </button>
                  <button
                    onClick={() => toggleSave(post.id)}
                    className={`ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      savedIds.has(post.id) ? 'text-accent-600 dark:text-accent-400' : 'text-ink-500 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800'
                    }`}
                  >
                    <Bookmark className={`w-[18px] h-[18px] ${savedIds.has(post.id) ? 'fill-current' : ''}`} />
                  </button>
                </div>

                {/* Comments */}
                {expandedComments.has(post.id) && (
                  <div className="px-4 pb-4 border-t border-ink-100 dark:border-ink-800 pt-3 space-y-3 animate-slide-down">
                    {(commentsByPost[post.id] || []).map((c) => (
                      <div key={c.id} className="flex gap-2.5 group">
                        <Avatar name={c.profile?.full_name || 'User'} src={c.profile?.avatar_url || undefined} size={28} />
                        <div className="flex-1 min-w-0">
                          <div className="bg-ink-100 dark:bg-ink-800 rounded-xl px-3 py-2">
                            <span className="text-xs font-semibold text-ink-700 dark:text-ink-200">{c.profile?.full_name}</span>
                            <p className="text-sm text-ink-700 dark:text-ink-200 break-words">{c.content}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 ml-1">
                            <span className="text-xs text-ink-400">{timeAgo(c.created_at)}</span>
                            {c.user_id === profile.id && (
                              <button onClick={() => deleteComment(c.id)} className="text-xs text-ink-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(commentsByPost[post.id] || []).length === 0 && (
                      <p className="text-sm text-ink-400 text-center py-2">No comments yet</p>
                    )}
                    <div className="flex gap-2 items-center">
                      <Avatar name={profile.full_name} src={profile.avatar_url || undefined} size={28} />
                      <input
                        type="text"
                        value={commentInputs[post.id] || ''}
                        onChange={(e) => setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && submitComment(post.id)}
                        placeholder="Write a comment..."
                        className="flex-1 h-9 px-3.5 bg-ink-100 dark:bg-ink-800 border-0 rounded-full text-sm text-ink-800 dark:text-ink-100 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
                      />
                      <button onClick={() => submitComment(post.id)} className="p-2 text-accent-500 hover:text-accent-600 transition-colors">
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Story viewer */}
      {viewingStory && (
        <div className="fixed inset-0 z-50 bg-ink-950/90 flex items-center justify-center animate-fade-in" onClick={() => setViewingStory(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2">
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <Avatar name={viewingStory.full_name} src={viewingStory.avatar_url || undefined} size={40} />
              <div>
                <p className="text-white font-medium text-sm">{viewingStory.full_name}</p>
                <p className="text-white/50 text-xs">@{viewingStory.username}</p>
              </div>
            </div>
            {(() => {
              const userStory = stories.find((s) => s.user_id === viewingStory.id);
              return userStory?.media_url ? (
                <img src={userStory.media_url} alt="" className="w-full max-h-[60vh] object-cover rounded-2xl" />
              ) : (
                <div className="w-full h-64 bg-ink-800 rounded-2xl flex items-center justify-center">
                  <p className="text-white/50 text-sm">No story media</p>
                </div>
              );
            })()}
            <div className="flex gap-2 mt-4">
              <input
                type="text"
                placeholder="Reply..."
                className="flex-1 h-10 px-4 bg-white/10 border border-white/20 rounded-full text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
              />
              <button className="px-4 bg-accent-600 text-white rounded-full text-sm font-medium hover:bg-accent-700 transition-colors">
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
