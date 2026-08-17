import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Notification, Profile } from '@/types';
import Avatar from '@/components/ui/Avatar';
import EmptyState from '@/components/ui/EmptyState';
import { timeAgo } from '@/lib/format';
import { Bell, Heart, MessageCircle, UserPlus, DollarSign, AtSign, CheckCheck, Zap } from 'lucide-react';

interface Props { onViewProfile: (userId: string) => void; }
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = { like: Heart, comment: MessageCircle, follow: UserPlus, payment: DollarSign, mention: AtSign, message: MessageCircle };

export default function NotificationsPage({ onViewProfile }: Props) {
  const { profile } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('notifications').select('*,actor:profiles!actor_id(*)').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(100);
    setItems((data || []) as unknown as Notification[]); setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel(`notifications-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, (payload) => {
        setItems((prev) => [payload.new as Notification, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, (payload) => {
        setItems((prev) => prev.map((n) => n.id === payload.new.id ? payload.new as Notification : n));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  const filtered = useMemo(() => filter === 'all' ? items : items.filter((n) => n.type === filter), [items, filter]);
  const unread = items.filter((n) => !n.read).length;

  async function read(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }
  async function readAll() {
    if (!profile) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id).eq('read', false);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  if (!profile) return null;
  return <div className="max-w-2xl mx-auto px-4 py-6">
    <div className="flex items-center justify-between mb-5"><div><div className="flex items-center gap-2"><h1 className="text-xl font-bold">Notifications</h1>{unread > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[11px] font-bold animate-pulse">{unread} new</span>}</div><p className="text-xs text-ink-400 mt-1 flex items-center gap-1"><Zap className="w-3 h-3 text-accent-500" /> Live updates</p></div>{unread > 0 && <button onClick={readAll} className="flex items-center gap-1.5 text-sm text-accent-600 hover:underline"><CheckCheck className="w-4 h-4" /> Mark all read</button>}</div>
    <div className="flex gap-1 overflow-x-auto pb-3 scrollbar-none">{['all','mention','like','comment','follow','payment','message'].map((x) => <button key={x} onClick={() => setFilter(x)} className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize whitespace-nowrap transition-all ${filter === x ? 'bg-accent-600 text-white shadow-sm' : 'bg-ink-100 dark:bg-ink-800 text-ink-500 hover:scale-105'}`}>{x}</button>)}</div>
    {loading ? <div className="space-y-2">{[1,2,3,4].map((x) => <div key={x} className="h-16 rounded-xl bg-ink-100 dark:bg-ink-800 animate-pulse" />)}</div> : filtered.length === 0 ? <EmptyState icon={<Bell className="w-7 h-7" />} title="You're all caught up" description="New likes, follows, messages and payments will appear here instantly." /> : <div className="space-y-1">{filtered.map((n) => { const Icon = iconMap[n.type] || Bell; const actor = n.actor as Profile | null; return <button key={n.id} onClick={() => { read(n.id); if (actor) onViewProfile(actor.id); }} className={`w-full text-left flex items-center gap-3 p-3.5 rounded-xl transition-all hover:translate-x-0.5 hover:bg-ink-50 dark:hover:bg-ink-800 ${!n.read ? 'bg-accent-50/70 dark:bg-accent-900/10' : ''}`}><div className="relative shrink-0">{actor ? <Avatar name={actor.full_name} src={actor.avatar_url || undefined} size={42} /> : <div className="w-10 h-10 rounded-full bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center"><Bell className="w-5 h-5 text-accent-600" /></div>}<span className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 flex items-center justify-center"><Icon className="w-3 h-3 text-accent-500" /></span></div><div className="flex-1 min-w-0"><p className="text-sm text-ink-700 dark:text-ink-200">{n.content || `${actor?.full_name || 'Someone'} interacted with you`}</p><p className="text-xs text-ink-400 mt-0.5">{timeAgo(n.created_at)}</p></div>{!n.read && <span className="w-2.5 h-2.5 rounded-full bg-accent-500 shrink-0 animate-pulse" />}</button>; })}</div>}
  </div>;
}
