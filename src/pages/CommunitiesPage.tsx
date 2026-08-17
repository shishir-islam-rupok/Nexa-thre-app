import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import type { Community, Profile, Post } from '@/types';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import Tabs from '@/components/ui/Tabs';
import { compactNumber, timeAgo } from '@/lib/format';
import { Plus, Users as UsersIcon, Search, BadgeCheck, ArrowLeft, Globe, Shield } from 'lucide-react';
import type { PageKey } from '@/components/AppShell';

interface CommunitiesPageProps {
  onNavigate: (page: PageKey) => void;
}

const CATEGORIES = ['Technology', 'Design', 'Gaming', 'Music', 'Sports', 'Education', 'Business', 'Lifestyle'];

export default function CommunitiesPage({ onNavigate }: CommunitiesPageProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '', category: 'Technology' });

  const load = useCallback(async () => {
    setLoading(true);
    const [commRes, memberRes] = await Promise.all([
      supabase.from('communities').select('*').order('created_at', { ascending: false }),
      profile ? supabase.from('community_members').select('community_id').eq('user_id', profile.id) : Promise.resolve({ data: [] }),
    ]);
    setCommunities((commRes.data || []) as Community[]);
    setJoinedIds(new Set((memberRes.data || []).map((m) => m.community_id)));
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  async function toggleJoin(commId: string) {
    if (!profile) return;
    if (joinedIds.has(commId)) {
      await supabase.from('community_members').delete().eq('community_id', commId).eq('user_id', profile.id);
      setJoinedIds((prev) => { const n = new Set(prev); n.delete(commId); return n; });
      showToast('Left community', 'info');
    } else {
      await supabase.from('community_members').insert({ community_id: commId, user_id: profile.id });
      setJoinedIds((prev) => new Set(prev).add(commId));
      showToast('Joined community');
    }
  }

  async function createCommunity() {
    if (!profile || !createForm.name.trim()) return;
    const slug = createForm.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50);
    const { data, error } = await supabase
      .from('communities')
      .insert({ name: createForm.name.trim(), slug, description: createForm.description.trim(), category: createForm.category, created_by: profile.id })
      .select()
      .single();
    if (error) {
      showToast('Failed to create community', 'error');
      return;
    }
    await supabase.from('community_members').insert({ community_id: data.id, user_id: profile.id, role: 'admin' });
    setJoinedIds((prev) => new Set(prev).add(data.id));
    setShowCreate(false);
    setCreateForm({ name: '', description: '', category: 'Technology' });
    showToast('Community created');
    load();
  }

  const filtered = communities.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'All' || c.category === category;
    return matchesSearch && matchesCategory;
  });

  if (selectedCommunity) {
    return (
      <CommunityDetail
        community={selectedCommunity}
        joined={joinedIds.has(selectedCommunity.id)}
        onJoin={() => toggleJoin(selectedCommunity.id)}
        onBack={() => setSelectedCommunity(null)}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-ink-900 dark:text-white">Communities</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> Create
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search communities..."
          className="w-full h-11 pl-11 pr-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl text-sm text-ink-800 dark:text-ink-100 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
        />
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-3 mb-3">
        {['All', ...CATEGORIES].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              category === cat ? 'bg-accent-600 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:bg-ink-200 dark:hover:bg-ink-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<UsersIcon className="w-7 h-7" />} title="No communities found" description="Create one to get started." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((c) => (
            <div key={c.id} className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl hover:border-ink-300 dark:hover:border-ink-700 transition-colors cursor-pointer" onClick={() => setSelectedCommunity(c)}>
              <div className="flex items-start gap-3 mb-3">
                {c.icon_url ? (
                  <img src={c.icon_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center">
                    <UsersIcon className="w-6 h-6 text-accent-600 dark:text-accent-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-900 dark:text-ink-50 truncate">{c.name}</p>
                  <p className="text-xs text-ink-400">{c.category}</p>
                </div>
              </div>
              <p className="text-xs text-ink-500 dark:text-ink-400 line-clamp-2 mb-3">{c.description || 'No description'}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-400">{joinedIds.has(c.id) ? 'Member' : 'Not joined'}</span>
                <Button
                  size="sm"
                  variant={joinedIds.has(c.id) ? 'secondary' : 'primary'}
                  onClick={(e) => { e.stopPropagation(); toggleJoin(c.id); }}
                >
                  {joinedIds.has(c.id) ? 'Joined' : 'Join'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Community">
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Name</label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Community name"
              className="w-full h-10 px-4 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-sm text-ink-900 dark:text-white placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Description</label>
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
              placeholder="What's this community about?"
              className="w-full px-4 py-3 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-sm text-ink-900 dark:text-white placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Category</label>
            <select
              value={createForm.category}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, category: e.target.value }))}
              className="w-full h-10 px-4 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-sm text-ink-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            >
              {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <Button fullWidth onClick={createCommunity} disabled={!createForm.name.trim()}>
            Create Community
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function CommunityDetail({ community, joined, onJoin, onBack, onNavigate }: {
  community: Community;
  joined: boolean;
  onJoin: () => void;
  onBack: () => void;
  onNavigate: (page: PageKey) => void;
}) {
  const { profile } = useAuth();
  const [tab, setTab] = useState('about');
  const [members, setMembers] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [memberCount, setMemberCount] = useState(0);

  useEffect(() => {
    (async () => {
      const [memberRes, postsRes, countRes] = await Promise.all([
        supabase.from('community_members').select('profile:profiles!user_id(*)').eq('community_id', community.id).limit(20),
        supabase.from('posts').select('*, profile:profiles!user_id(*), likes(count), comments(count)').eq('community_id', community.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('community_members').select('*', { count: 'exact', head: true }).eq('community_id', community.id),
      ]);
      setMembers((memberRes.data || []).map((m) => (m as Record<string, unknown>).profile as unknown as Profile));
      setPosts((postsRes.data || []) as unknown as Post[]);
      setMemberCount(countRes.count || 0);
    })();
  }, [community.id]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to communities
      </button>

      {/* Header */}
      <div className="h-32 bg-gradient-to-r from-accent-500 to-accent-700 rounded-2xl mb-4" />
      <div className="flex items-start justify-between -mt-12 px-4 mb-4">
        <div className="w-20 h-20 rounded-2xl bg-white dark:bg-ink-900 border-4 border-white dark:border-ink-900 flex items-center justify-center">
          {community.icon_url ? (
            <img src={community.icon_url} alt="" className="w-full h-full rounded-xl object-cover" />
          ) : (
            <UsersIcon className="w-10 h-10 text-accent-600" />
          )}
        </div>
        <Button variant={joined ? 'secondary' : 'primary'} onClick={onJoin} className="mt-12">
          {joined ? 'Joined' : 'Join'}
        </Button>
      </div>

      <h1 className="text-xl font-bold text-ink-900 dark:text-white">{community.name}</h1>
      <div className="flex items-center gap-3 mt-1 mb-3">
        <span className="text-sm text-ink-400">{compactNumber(memberCount)} members</span>
        <span className="text-xs text-ink-400 bg-ink-100 dark:bg-ink-800 px-2 py-0.5 rounded-md">{community.category}</span>
      </div>
      {community.description && <p className="text-sm text-ink-600 dark:text-ink-300 mb-5">{community.description}</p>}

      <Tabs
        tabs={[
          { key: 'about', label: 'About' },
          { key: 'posts', label: 'Posts', count: posts.length },
          { key: 'members', label: 'Members', count: memberCount },
          { key: 'rules', label: 'Rules' },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'about' && (
        <div className="space-y-3">
          <div className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
            <p className="text-sm text-ink-600 dark:text-ink-300">{community.description || 'No description provided.'}</p>
          </div>
          <div className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
            <div className="flex items-center gap-2 text-sm font-medium text-ink-700 dark:text-ink-200 mb-2">
              <Globe className="w-4 h-4" /> Community Info
            </div>
            <p className="text-xs text-ink-400">Created {timeAgo(community.created_at)}</p>
          </div>
        </div>
      )}

      {tab === 'posts' && (
        posts.length === 0 ? (
          <EmptyState icon={<UsersIcon className="w-7 h-7" />} title="No posts yet" description="Be the first to post in this community." />
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <div key={post.id} className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <Avatar name={post.profile?.full_name || 'User'} src={post.profile?.avatar_url || undefined} size={32} />
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium text-ink-800 dark:text-ink-100">{post.profile?.full_name}</span>
                      {post.profile?.verified && <BadgeCheck className="w-3.5 h-3.5 text-accent-500" />}
                    </div>
                    <span className="text-xs text-ink-400">{timeAgo(post.created_at)}</span>
                  </div>
                </div>
                <p className="text-sm text-ink-700 dark:text-ink-200">{post.content}</p>
                {post.image_url && <img src={post.image_url} alt="" className="mt-3 rounded-xl w-full max-h-80 object-cover" />}
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'members' && (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-3 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl" onClick={() => { if (m.id !== profile?.id) onNavigate('profile'); }}>
              <Avatar name={m.full_name} src={m.avatar_url || undefined} size={40} />
              <div className="flex-1">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{m.full_name}</p>
                  {m.verified && <BadgeCheck className="w-3.5 h-3.5 text-accent-500" />}
                </div>
                <p className="text-xs text-ink-400">@{m.username}</p>
              </div>
            </div>
          ))}
          {members.length === 0 && <EmptyState icon={<UsersIcon className="w-7 h-7" />} title="No members yet" />}
        </div>
      )}

      {tab === 'rules' && (
        <div className="space-y-2">
          {(community.rules || []).length === 0 ? (
            <div className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-700 dark:text-ink-200 mb-1">
                <Shield className="w-4 h-4" /> Community Rules
              </div>
              <p className="text-sm text-ink-400">No rules have been set for this community yet.</p>
            </div>
          ) : (
            (community.rules || []).map((rule, i) => (
              <div key={i} className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
                <p className="text-sm text-ink-700 dark:text-ink-200"><span className="font-semibold">{i + 1}.</span> {rule}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
