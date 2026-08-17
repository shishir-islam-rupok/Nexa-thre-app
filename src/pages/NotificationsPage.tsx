import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Notification, Profile } from '@/types';
import Avatar from '@/components/ui/Avatar';
import Tabs from '@/components/ui/Tabs';
import EmptyState from '@/components/ui/EmptyState';
import { timeAgo } from '@/lib/format';
import { Bell, Heart, MessageCircle, UserPlus, DollarSign, AtSign, CheckCheck } from 'lucide-react';

interface NotificationsPageProps {
  onViewProfile: (userId: string) => void;
}

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  payment: DollarSign,
  mention: AtSign,
  message: MessageCircle,
};

export default function NotificationsPage({ onViewProfile }: NotificationsPageProps) {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*, actor:profiles!actor_id(*)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications((data || []) as unknown as Notification[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  async function markAllRead() {
    if (!profile) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id).eq('read', false);
    load();
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }

  const filtered = filter === 'all' ? notifications : notifications.filter((n) => n.type === filter);

  if (!profile) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-ink-900 dark:text-white">Notifications</h1>
        {notifications.some((n) => !n.read) && (
          <button onClick={markAllRead} className="flex items-center gap-1.5 text-sm text-accent-600 dark:text-accent-400 hover:underline">
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      <Tabs
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'mention', label: 'Mentions' },
          { key: 'like', label: 'Likes' },
          { key: 'comment', label: 'Comments' },
          { key: 'follow', label: 'Follows' },
          { key: 'payment', label: 'Payments' },
        ]}
        active={filter}
        onChange={setFilter}
        className="mb-5"
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Bell className="w-7 h-7" />} title="You're all caught up" description="No notifications to show right now." />
      ) : (
        <div className="space-y-1">
          {filtered.map((n) => {
            const Icon = typeIcons[n.type] || Bell;
            const actor = n.actor as Profile | null;
            return (
              <div
                key={n.id}
                onClick={() => { markRead(n.id); if (actor) onViewProfile(actor.id); }}
                className={`flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-colors ${n.read ? 'bg-transparent' : 'bg-accent-50/50 dark:bg-accent-900/10'} hover:bg-ink-50 dark:hover:bg-ink-800`}
              >
                <div className="relative shrink-0">
                  {actor && <Avatar name={actor.full_name} src={actor.avatar_url || undefined} size={40} />}
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white dark:bg-ink-900 flex items-center justify-center border border-ink-200 dark:border-ink-700">
                    <Icon className={`w-3 h-3 ${n.type === 'like' ? 'text-rose-500' : n.type === 'payment' ? 'text-emerald-500' : 'text-accent-500'}`} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-700 dark:text-ink-200">
                    {n.content || `${actor?.full_name || 'Someone'} ${n.type === 'like' ? 'liked your post' : n.type === 'follow' ? 'started following you' : n.type === 'comment' ? 'commented on your post' : n.type === 'payment' ? 'sent you money' : 'mentioned you'}`}
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">{timeAgo(n.created_at)}</p>
                </div>
                {!n.read && <div className="w-2 h-2 rounded-full bg-accent-500 shrink-0" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
