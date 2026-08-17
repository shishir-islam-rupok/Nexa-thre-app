import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import type { Post, Comment, Profile, Story } from '@/types';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import EmptyState from '@/components/ui/EmptyState';
import { uploadFile } from '@/lib/upload';
import { compactNumber, timeAgo } from '@/lib/format';
import { extractHashtags, rankFeed } from '@/lib/feedAlgorithm';
import { Heart, MessageCircle, Share2, Bookmark, ImagePlus, Send, Plus, X, BadgeCheck, Loader2, TrendingUp } from 'lucide-react';
import type { PageKey } from '@/components/AppShell';

interface FeedPageProps { onViewProfile: (userId: string) => void; onNavigate: (page: PageKey) => void; }

export default function FeedPage({ onViewProfile }: FeedPageProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState('');
  const [tab, setTab] = useState<'foryou' | 'following'>('foryou');
  const [text, setText] = useState('');
  const [image, setImage] = useState('');
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPosts = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data, error } = await supabase.from('posts')
      .select('*, profile:profiles!user_id(*), likes(count), comments(count)')
      .is('reply_to', null).order('created_at', { ascending: false }).limit(80);
    if (error || !data) { setLoading(false); return; }
    const ids = data.map((p) => p.id);
    const [likes, saved, cs] = await Promise.all([
      supabase.from('likes').select('post_id').in('post_id', ids).eq('user_id', profile.id),
      supabase.from('saved_posts').select('post_id').eq('user_id', profile.id),
      supabase.from('comments').select('id,post_id,content,created_at,user_id,profile:profiles!user_id(*)').in('post_id', ids).order('created_at', { ascending: true }),
    ]);
    const liked = new Set((likes.data || []).map((x) => x.post_id));
    const savedSet = new Set((saved.data || []).map((x) => x.post_id));
    const map: Record<string, Comment[]> = {};
    (cs.data || []).forEach((c) => { (map[c.post_id] ||= []).push(c as unknown as Comment); });
    setSavedIds(savedSet); setComments(map);
    setPosts(data.map((p) => ({
      id: p.id, user_id: p.user_id, content: p.content || '', image_url: p.image_url || '', media_urls: p.media_urls || [],
      visibility: p.visibility, reply_to: p.reply_to, community_id: p.community_id, created_at: p.created_at,
      profile: p.profile as unknown as Profile, like_count: p.likes?.[0]?.count || 0, comment_count: p.comments?.[0]?.count || 0,
      liked_by_me: liked.has(p.id), saved_by_me: savedSet.has(p.id),
    })));
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    Promise.all([
      supabase.from('follows').select('following_id').eq('follower_id', profile.id),
      supabase.from('stories').select('*,profile:profiles!user_id(*)').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
    ]).then(([f, s]) => {
      setFollowingIds(new Set((f.data || []).map((x) => x.following_id)));
      setStories((s.data || []) as unknown as Story[]);
    });
    loadPosts();
  }, [profile, loadPosts]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel('nexa-feed-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, loadPosts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, loadPosts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, loadPosts)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, loadPosts]);

  const ranked = useMemo(() => rankFeed(posts, followingIds, savedIds), [posts, followingIds, savedIds]);
  const visible = ranked.filter((p) => {
    const social = tab === 'foryou' || followingIds.has(p.user_id) || p.user_id === profile?.id;
    const tag = !tagFilter || extractHashtags(p.content).includes(tagFilter.toLowerCase());
    return social && tag;
  });

  const trending = useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach((p) => extractHashtags(p.content).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [posts]);

  async function postNow() {
    if (!profile || (!text.trim() && !image)) return;
    setPosting(true);
    const { error } = await supabase.from('posts').insert({ content: text.trim(), image_url: image || null, visibility: 'public' });
    if (error) showToast(error.message, 'error');
    else { setText(''); setImage(''); showToast('Posted'); loadPosts(); }
    setPosting(false);
  }

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); const result = await uploadFile(file, 'uploads');
    if (result.error) showToast(result.error, 'error'); else setImage(result.url);
    setUploading(false);
  }

  async function like(post: Post) {
    if (!profile) return;
    if (post.liked_by_me) await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', profile.id);
    else await supabase.from('likes').insert({ post_id: post.id });
    loadPosts();
  }

  async function save(post: Post) {
    if (!profile) return;
    if (savedIds.has(post.id)) await supabase.from('saved_posts').delete().eq('post_id', post.id).eq('user_id', profile.id);
    else await supabase.from('saved_posts').insert({ post_id: post.id, user_id: profile.id });
    loadPosts();
  }

  async function comment(postId: string) {
    if (!profile) return;
    const value = commentInputs[postId]?.trim(); if (!value) return;
    await supabase.from('comments').insert({ post_id: postId, content: value, user_id: profile.id });
    setCommentInputs((x) => ({ ...x, [postId]: '' })); loadPosts();
  }

  async function addStory(e: React.ChangeEvent<HTMLInputElement>) {
    if (!profile || !e.target.files?.[0]) return;
    const result = await uploadFile(e.target.files[0], 'uploads');
    if (result.error) showToast(result.error, 'error');
    else { await supabase.from('stories').insert({ user_id: profile.id, media_url: result.url, media_type: 'image' }); showToast('Story added'); }
  }

  if (!profile) return null;
  const uniqueStories = stories.filter((s, i, a) => a.findIndex((x) => x.user_id === s.user_id) === i);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 overflow-x-auto pb-5 scrollbar-none">
        <label className="shrink-0 cursor-pointer text-center group">
          <div className="relative w-16 h-16 rounded-full ring-2 ring-accent-500/60 p-0.5 group-hover:scale-105 transition-transform">
            <Avatar name={profile.full_name} src={profile.avatar_url || undefined} size={60} />
            <span className="absolute -right-0.5 -bottom-0.5 w-6 h-6 rounded-full bg-accent-600 border-2 border-white dark:border-ink-950 flex items-center justify-center"><Plus className="w-3 h-3 text-white" /></span>
          </div><span className="text-[11px] text-ink-500">Your story</span><input type="file" accept="image/*" className="hidden" onChange={addStory} />
        </label>
        {uniqueStories.map((s) => <button key={s.user_id} onClick={() => showToast(`Story by ${(s.profile as Profile)?.full_name || 'user'}`, 'info')} className="shrink-0 text-center hover:scale-105 transition-transform">
          <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-tr from-accent-500 to-emerald-400"><div className="rounded-full bg-white dark:bg-ink-950 p-0.5"><Avatar name={(s.profile as Profile)?.full_name || 'User'} src={(s.profile as Profile)?.avatar_url || undefined} size={58} /></div></div>
          <span className="block text-[11px] text-ink-500 max-w-16 truncate">@{(s.profile as Profile)?.username}</span>
        </button>)}
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="inline-flex p-1 rounded-xl bg-ink-100 dark:bg-ink-800">
          {(['foryou', 'following'] as const).map((x) => <button key={x} onClick={() => setTab(x)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === x ? 'bg-white dark:bg-ink-900 text-ink-900 dark:text-white shadow-sm' : 'text-ink-500'}`}>{x === 'foryou' ? 'For You' : 'Following'}</button>)}
        </div>
        <div className="hidden sm:flex items-center gap-1 text-xs text-ink-400"><TrendingUp className="w-4 h-4" /> Ranked by relevance</div>
      </div>

      {trending.length > 0 && <div className="flex gap-2 overflow-x-auto scrollbar-none pb-4">
        {trending.map(([tag, count]) => <button key={tag} onClick={() => setTagFilter(tagFilter === tag ? '' : tag)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${tagFilter === tag ? 'bg-accent-600 text-white scale-105' : 'bg-accent-50 dark:bg-accent-900/20 text-accent-700 dark:text-accent-300 hover:scale-105'}`}>#{tag} <span className="opacity-60">{count}</span></button>)}
      </div>}

      <div className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl p-4 mb-5 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex gap-3"><Avatar name={profile.full_name} src={profile.avatar_url || undefined} size={42} /><div className="flex-1">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What's happening? Add #hashtags..." rows={2} className="w-full px-4 py-3 bg-ink-50 dark:bg-ink-800 rounded-xl border border-transparent focus:border-accent-500 focus:outline-none transition-all resize-none text-sm" />
          {image && <div className="relative mt-2 inline-block"><img src={image} alt="" className="max-h-40 rounded-xl" /><button onClick={() => setImage('')} className="absolute -top-2 -right-2 rounded-full bg-rose-500 text-white p-1"><X className="w-3 h-3" /></button></div>}
          <div className="flex items-center justify-between mt-3"><label className="p-2 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-800 cursor-pointer transition-colors"><ImagePlus className="w-5 h-5 text-accent-600" /><input type="file" accept="image/*" className="hidden" onChange={uploadImage} /></label><Button size="sm" onClick={postNow} loading={posting} disabled={!text.trim() && !image}>Post</Button></div>
          {uploading && <p className="text-xs text-ink-400 mt-2 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</p>}
        </div></div>
      </div>

      {loading ? <div className="space-y-4">{[1,2,3].map((x) => <div key={x} className="h-52 rounded-2xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 animate-pulse" />)}</div> : visible.length === 0 ? <EmptyState icon={<MessageCircle className="w-7 h-7" />} title={tagFilter ? `No posts for #${tagFilter}` : 'No posts yet'} description="Follow people and share something to get your feed moving." /> : <div className="space-y-4">
        {visible.map((post) => {
          const tags = extractHashtags(post.content); const open = expanded.has(post.id);
          return <article key={post.id} className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 animate-fade-in">
            <div className="flex items-center gap-3 p-4"><button onClick={() => onViewProfile(post.user_id)} className="hover:scale-105 transition-transform"><Avatar name={post.profile?.full_name || 'User'} src={post.profile?.avatar_url || undefined} size={42} /></button><button onClick={() => onViewProfile(post.user_id)} className="text-left flex-1 min-w-0"><div className="flex items-center gap-1"><span className="font-semibold text-sm truncate">{post.profile?.full_name}</span>{post.profile?.verified && <BadgeCheck className="w-4 h-4 text-accent-500" />}</div><span className="text-xs text-ink-400">@{post.profile?.username} · {timeAgo(post.created_at)}</span></button></div>
            {post.content && <div className="px-4 pb-3 text-sm leading-6 whitespace-pre-wrap">{post.content.split(/(#[\p{L}\p{N}_]+)/gu).map((part, i) => part.startsWith('#') ? <button key={i} onClick={() => setTagFilter(part.slice(1).toLowerCase())} className="text-accent-600 dark:text-accent-400 font-medium hover:underline">{part}</button> : <span key={i}>{part}</span>)}</div>}
            {tags.length > 0 && <div className="px-4 pb-3 flex gap-1.5 flex-wrap">{tags.map((tag) => <button key={tag} onClick={() => setTagFilter(tag)} className="text-xs text-accent-600 dark:text-accent-400 hover:underline">#{tag}</button>)}</div>}
            {post.image_url && <img src={post.image_url} alt="" className="w-full max-h-[560px] object-cover" loading="lazy" />}
            <div className="flex items-center gap-1 px-2 py-2 border-t border-ink-100 dark:border-ink-800"><button onClick={() => like(post)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all hover:bg-ink-100 dark:hover:bg-ink-800 active:scale-90 ${post.liked_by_me ? 'text-rose-500' : 'text-ink-500'}`}><Heart className={`w-5 h-5 ${post.liked_by_me ? 'fill-current' : ''}`} />{post.like_count ? compactNumber(post.like_count) : ''}</button><button onClick={() => setExpanded((s) => { const n = new Set(s); n.has(post.id) ? n.delete(post.id) : n.add(post.id); return n; })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800"><MessageCircle className="w-5 h-5" />{post.comment_count ? compactNumber(post.comment_count) : ''}</button><button onClick={() => { navigator.clipboard?.writeText(post.content); showToast('Post copied'); }} className="p-2 rounded-lg text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800"><Share2 className="w-5 h-5" /></button><button onClick={() => save(post)} className={`ml-auto p-2 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-800 ${savedIds.has(post.id) ? 'text-accent-600' : 'text-ink-500'}`}><Bookmark className={`w-5 h-5 ${savedIds.has(post.id) ? 'fill-current' : ''}`} /></button></div>
            {open && <div className="border-t border-ink-100 dark:border-ink-800 p-4 space-y-3 animate-slide-down">{(comments[post.id] || []).map((c) => <div key={c.id} className="flex gap-2"><Avatar name={c.profile?.full_name || 'User'} src={c.profile?.avatar_url || undefined} size={30} /><div className="bg-ink-100 dark:bg-ink-800 rounded-xl px-3 py-2 text-sm"><b>{c.profile?.full_name}</b><div>{c.content}</div></div></div>)}<div className="flex gap-2"><Avatar name={profile.full_name} src={profile.avatar_url || undefined} size={30} /><input value={commentInputs[post.id] || ''} onChange={(e) => setCommentInputs((x) => ({ ...x, [post.id]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && comment(post.id)} placeholder="Write a comment..." className="flex-1 h-9 rounded-full bg-ink-100 dark:bg-ink-800 px-4 text-sm outline-none focus:ring-2 focus:ring-accent-500/30" /><IconButton size="sm" onClick={() => comment(post.id)}><Send /></IconButton></div></div>}
          </article>;
        })}
      </div>}
    </div>
  );
}
