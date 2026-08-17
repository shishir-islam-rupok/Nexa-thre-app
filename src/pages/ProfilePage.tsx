import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import type { Profile, Post } from '@/types';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Tabs from '@/components/ui/Tabs';
import EmptyState from '@/components/ui/EmptyState';
import { timeAgo, compactNumber, formatDate } from '@/lib/format';
import {
  ArrowLeft, Edit2, Check, X, UserPlus, UserCheck, MessageCircle,
  Calendar, MapPin, Link as LinkIcon, BadgeCheck, Heart, LogOut, Globe,
  Camera, Loader2,
} from 'lucide-react';
import { uploadFile } from '@/lib/upload';
import type { PageKey } from '@/components/AppShell';

interface ProfilePageProps {
  userId?: string | null;
  onBack: () => void;
  onNavigate: (page: PageKey) => void;
  onViewProfile?: (userId: string) => void;
}

export default function ProfilePage({ userId, onBack, onNavigate }: ProfilePageProps) {
  const { profile: myProfile, refreshProfile, signOut } = useAuth();
  const { showToast } = useToast();
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [replies, setReplies] = useState<Post[]>([]);
  const [mediaPosts, setMediaPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: '', bio: '', avatar_url: '', cover_url: '', location: '', website: '' });
  const [saving, setSaving] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [tab, setTab] = useState('posts');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [startingConversation, setStartingConversation] = useState(false);

  const isMe = !userId || userId === myProfile?.id;
  const targetId = userId || myProfile?.id;

  const load = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', targetId).maybeSingle();
    if (prof) {
      setUserProfile(prof as Profile);
      setEditForm({ full_name: prof.full_name, bio: prof.bio, avatar_url: prof.avatar_url, cover_url: prof.cover_url, location: prof.location, website: prof.website });
    }

    const [postsRes, repliesRes, followsRes, followingRes] = await Promise.all([
      supabase.from('posts').select('*, profile:profiles!user_id(*), likes(count), comments(count)').eq('user_id', targetId).is('reply_to', null).order('created_at', { ascending: false }),
      supabase.from('posts').select('*, profile:profiles!user_id(*), likes(count), comments(count)').eq('user_id', targetId).not('reply_to', 'is', null).order('created_at', { ascending: false }),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', targetId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', targetId),
    ]);

    const allPosts = (postsRes.data || []) as unknown as Post[];
    setPosts(allPosts);
    setReplies((repliesRes.data || []) as unknown as Post[]);
    setMediaPosts(allPosts.filter((p) => p.image_url));
    setFollowersCount(followsRes.count || 0);
    setFollowingCount(followingRes.count || 0);

    if (!isMe && myProfile) {
      const { data: followData } = await supabase.from('follows').select('id').eq('follower_id', myProfile.id).eq('following_id', targetId).maybeSingle();
      setIsFollowing(!!followData);
    }

    setLoading(false);
  }, [targetId, isMe, myProfile]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!myProfile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: editForm.full_name,
        bio: editForm.bio,
        avatar_url: editForm.avatar_url,
        cover_url: editForm.cover_url,
        location: editForm.location,
        website: editForm.website,
      })
      .eq('id', myProfile.id);
    if (error) {
      showToast('Failed to update profile', 'error');
    } else {
      await refreshProfile();
      await load();
      setIsEditing(false);
      showToast('Profile updated');
    }
    setSaving(false);
  }

  async function toggleFollow() {
    if (!myProfile || !targetId) return;
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', myProfile.id).eq('following_id', targetId);
      setIsFollowing(false);
      setFollowersCount((c) => c - 1);
    } else {
      await supabase.from('follows').insert({ follower_id: myProfile.id, following_id: targetId });
      setIsFollowing(true);
      setFollowersCount((c) => c + 1);
      showToast('Following');
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !myProfile) return;
    setUploadingAvatar(true);
    const result = await uploadFile(file, 'avatars');
    if (result.error) {
      showToast(result.error, 'error');
    } else {
      setEditForm((p) => ({ ...p, avatar_url: result.url }));
      await supabase.from('profiles').update({ avatar_url: result.url }).eq('id', myProfile.id);
      await refreshProfile();
      await load();
      showToast('Avatar updated');
    }
    setUploadingAvatar(false);
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !myProfile) return;
    setUploadingCover(true);
    const result = await uploadFile(file, 'uploads');
    if (result.error) {
      showToast(result.error, 'error');
    } else {
      setEditForm((p) => ({ ...p, cover_url: result.url }));
      await supabase.from('profiles').update({ cover_url: result.url }).eq('id', myProfile.id);
      await refreshProfile();
      await load();
      showToast('Cover updated');
    }
    setUploadingCover(false);
  }

  async function startConversation() {
    if (!myProfile || !targetId || startingConversation) return;
    setStartingConversation(true);
    const { error } = await supabase.rpc('get_or_create_direct_conversation', {
      other_user_id: targetId,
    });
    setStartingConversation(false);

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    onNavigate('messages');
  }

  if (loading || !userProfile) {
    return (
      <div className="flex items-center justify-center py-16 text-ink-400">
        <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {!isMe && (
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      )}

      {/* Cover + avatar */}
      <div className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl overflow-hidden mb-4">
        <div className="h-32 bg-gradient-to-r from-accent-500 to-accent-700 relative group">
          {userProfile.cover_url && <img src={userProfile.cover_url} alt="" className="w-full h-full object-cover" />}
          {isMe && (
            <label className="absolute inset-0 flex items-center justify-center bg-ink-950/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              {uploadingCover ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
              <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} disabled={uploadingCover} />
            </label>
          )}
        </div>
        <div className="px-6 pb-6">
          <div className="flex items-end justify-between -mt-12 mb-4">
            <div className="relative group">
              <Avatar name={userProfile.full_name} src={userProfile.avatar_url || undefined} size={96} className="ring-4 ring-white dark:ring-ink-900" />
              {isMe && (
                <label className="absolute bottom-0 right-0 w-7 h-7 bg-accent-600 rounded-full flex items-center justify-center cursor-pointer ring-2 ring-white dark:ring-ink-900 hover:bg-accent-700 transition-colors">
                  {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Camera className="w-3.5 h-3.5 text-white" />}
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                </label>
              )}
            </div>
            {isMe ? (
              <Button variant="secondary" size="sm" onClick={() => setIsEditing(!isEditing)}>
                <Edit2 className="w-3.5 h-3.5" /> Edit Profile
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={startConversation} loading={startingConversation}>
                  <MessageCircle className="w-3.5 h-3.5" /> Message
                </Button>
                <Button variant={isFollowing ? 'secondary' : 'primary'} size="sm" onClick={toggleFollow}>
                  {isFollowing ? <><UserCheck className="w-3.5 h-3.5" /> Following</> : <><UserPlus className="w-3.5 h-3.5" /> Follow</>}
                </Button>
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Full Name</label>
                <input type="text" value={editForm.full_name} onChange={(e) => setEditForm((p) => ({ ...p, full_name: e.target.value }))} className="w-full h-10 px-3 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-sm text-ink-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Bio</label>
                <textarea value={editForm.bio} onChange={(e) => setEditForm((p) => ({ ...p, bio: e.target.value }))} rows={3} maxLength={200} className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-sm text-ink-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 resize-none" />
              </div>
              <div className="flex items-center gap-3">
                <Avatar name={editForm.full_name || 'User'} src={editForm.avatar_url || undefined} size={56} />
                <label className="px-3 py-2 bg-ink-100 dark:bg-ink-800 rounded-lg text-sm text-ink-600 dark:text-ink-300 hover:bg-ink-200 dark:hover:bg-ink-700 cursor-pointer transition-colors flex items-center gap-1.5">
                  <Camera className="w-4 h-4" /> Change Avatar
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Location</label>
                <input type="text" value={editForm.location} onChange={(e) => setEditForm((p) => ({ ...p, location: e.target.value }))} placeholder="San Francisco, CA" className="w-full h-10 px-3 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-sm text-ink-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Website</label>
                <input type="url" value={editForm.website} onChange={(e) => setEditForm((p) => ({ ...p, website: e.target.value }))} placeholder="https://..." className="w-full h-10 px-3 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-sm text-ink-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} loading={saving}><Check className="w-3.5 h-3.5" /> Save</Button>
                <Button size="sm" variant="secondary" onClick={() => { setIsEditing(false); load(); }}><X className="w-3.5 h-3.5" /> Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <h2 className="text-lg font-bold text-ink-900 dark:text-white">{userProfile.full_name}</h2>
                {userProfile.verified && <BadgeCheck className="w-5 h-5 text-accent-500" />}
              </div>
              <p className="text-sm text-ink-400">@{userProfile.username}</p>
              {userProfile.bio && <p className="text-sm text-ink-600 dark:text-ink-300 mt-2 leading-relaxed">{userProfile.bio}</p>}

              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-ink-400">
                {userProfile.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {userProfile.location}</span>}
                {userProfile.website && <a href={userProfile.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent-600 dark:text-accent-400 hover:underline"><LinkIcon className="w-3.5 h-3.5" /> {userProfile.website.replace(/^https?:\/\//, '')}</a>}
                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Joined {formatDate(userProfile.created_at)}</span>
              </div>

              <div className="flex gap-6 mt-4">
                <div><span className="text-base font-bold text-ink-900 dark:text-white">{compactNumber(followingCount)}</span> <span className="text-sm text-ink-400">Following</span></div>
                <div><span className="text-base font-bold text-ink-900 dark:text-white">{compactNumber(followersCount)}</span> <span className="text-sm text-ink-400">Followers</span></div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      {!isEditing && (
        <>
          <Tabs
            tabs={[
              { key: 'posts', label: 'Posts', count: posts.length },
              { key: 'replies', label: 'Replies', count: replies.length },
              { key: 'media', label: 'Media', count: mediaPosts.length },
              { key: 'likes', label: 'Likes' },
            ]}
            active={tab}
            onChange={setTab}
            className="mb-5"
          />

          {tab === 'posts' && (
            posts.length === 0 ? (
              <EmptyState icon={<MessageCircle className="w-7 h-7" />} title="No posts yet" />
            ) : (
              <div className="space-y-3">
                {posts.map((post) => (
                  <div key={post.id} className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
                    <p className="text-sm text-ink-700 dark:text-ink-200 whitespace-pre-wrap">{post.content}</p>
                    {post.image_url && <img src={post.image_url} alt="" className="mt-3 rounded-xl w-full max-h-80 object-cover" />}
                    <div className="flex items-center gap-4 mt-3 text-xs text-ink-400">
                      <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> {compactNumber(post.like_count || 0)}</span>
                      <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {compactNumber(post.comment_count || 0)}</span>
                      <span className="ml-auto">{timeAgo(post.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
          {tab === 'replies' && (
            replies.length === 0 ? (
              <EmptyState icon={<MessageCircle className="w-7 h-7" />} title="No replies yet" />
            ) : (
              <div className="space-y-3">
                {replies.map((reply) => (
                  <div key={reply.id} className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
                    <p className="text-sm text-ink-700 dark:text-ink-200">{reply.content}</p>
                    <span className="text-xs text-ink-400 mt-2 block">{timeAgo(reply.created_at)}</span>
                  </div>
                ))}
              </div>
            )
          )}
          {tab === 'media' && (
            mediaPosts.length === 0 ? (
              <EmptyState icon={<Globe className="w-7 h-7" />} title="No media yet" />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {mediaPosts.map((post) => (
                  <img key={post.id} src={post.image_url} alt="" className="rounded-xl w-full h-40 object-cover" />
                ))}
              </div>
            )
          )}
          {tab === 'likes' && (
            <EmptyState icon={<Heart className="w-7 h-7" />} title="No liked posts" description="Posts you like will appear here." />
          )}

          {isMe && (
            <Button variant="outline" fullWidth className="mt-6 text-rose-500 border-rose-200 dark:border-rose-800/40 hover:bg-rose-50 dark:hover:bg-rose-900/20" onClick={signOut}>
              <LogOut className="w-4 h-4" /> Sign Out
            </Button>
          )}
        </>
      )}
    </div>
  );
}
