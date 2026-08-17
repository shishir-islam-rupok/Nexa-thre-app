import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import type { Profile, Transaction, Report, Post } from '@/types';
import Avatar from '@/components/ui/Avatar';
import EmptyState from '@/components/ui/EmptyState';
import { compactNumber, formatCurrency, formatDateTime, timeAgo } from '@/lib/format';
import { Shield, Users, CreditCard, Flag, FileText, Search, CheckCircle2, XCircle, Activity, DollarSign } from 'lucide-react';

type Tab = 'overview' | 'users' | 'payments' | 'reports' | 'posts';

export default function AdminPage() {
  const { profile } = useAuth(); const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<Profile[]>([]); const [tx, setTx] = useState<Transaction[]>([]); const [reports, setReports] = useState<Report[]>([]); const [posts, setPosts] = useState<Post[]>([]);
  const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile || !['admin','moderator'].includes(profile.role)) return;
    const [u, t, r, p] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('transactions').select('*,sender:profiles!sender_id(*),receiver:profiles!receiver_id(*)').order('created_at', { ascending: false }).limit(200),
      supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('posts').select('*,profile:profiles!user_id(*)').order('created_at', { ascending: false }).limit(100),
    ]);
    setUsers((u.data || []) as Profile[]); setTx((t.data || []) as Transaction[]); setReports((r.data || []) as Report[]); setPosts((p.data || []) as unknown as Post[]); setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!profile || !['admin','moderator'].includes(profile.role)) return;
    const channel = supabase.channel('nexa-admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, load]);

  if (!profile || !['admin','moderator'].includes(profile.role)) return <div className="max-w-xl mx-auto px-4 py-16"><EmptyState icon={<Shield />} title="Access denied" description="Only admins and moderators can open the control center." /></div>;

  const pending = tx.filter((x) => x.status === 'pending'); const pendingReports = reports.filter((x) => x.status === 'pending');
  const filteredUsers = users.filter((u) => `${u.full_name} ${u.username}`.toLowerCase().includes(query.toLowerCase()));
  const totalVolume = tx.filter((x) => ['approved','completed'].includes(x.status)).reduce((s, x) => s + x.amount_cents, 0);

  async function reviewPayment(item: Transaction, status: 'approved' | 'rejected') {
    if (profile.role !== 'admin') { showToast('Only admins can approve payments', 'error'); return; }
    setBusy(item.id);
    const { error } = await supabase.from('transactions').update({ status, reviewed_by: profile.id, reviewed_at: new Date().toISOString() }).eq('id', item.id);
    if (error) { showToast(error.message, 'error'); setBusy(null); return; }
    if (status === 'approved') {
      if (item.sender_id === item.receiver_id) {
        const { data: w } = await supabase.from('wallets').select('balance_cents').eq('user_id', item.receiver_id).maybeSingle();
        if (w) await supabase.from('wallets').update({ balance_cents: w.balance_cents + item.amount_cents }).eq('user_id', item.receiver_id);
      } else {
        const [{ data: sender }, { data: receiver }] = await Promise.all([
          supabase.from('wallets').select('balance_cents').eq('user_id', item.sender_id).maybeSingle(),
          supabase.from('wallets').select('balance_cents').eq('user_id', item.receiver_id).maybeSingle(),
        ]);
        if (sender) await supabase.from('wallets').update({ balance_cents: Math.max(0, sender.balance_cents - item.amount_cents) }).eq('user_id', item.sender_id);
        if (receiver) await supabase.from('wallets').update({ balance_cents: receiver.balance_cents + item.amount_cents }).eq('user_id', item.receiver_id);
      }
    }
    await supabase.from('notifications').insert({ user_id: item.sender_id, actor_id: profile.id, type: 'payment', entity_id: item.id, entity_type: 'transaction', content: `Payment ${formatCurrency(item.amount_cents)} ${status}` });
    await supabase.from('admin_actions').insert({ admin_id: profile.id, action: `payment_${status}`, entity_type: 'transaction', entity_id: item.id });
    showToast(`Payment ${status}`); setBusy(null); load();
  }

  async function reportStatus(id: string, status: string) {
    await supabase.from('reports').update({ status }).eq('id', id);
    await supabase.from('admin_actions').insert({ admin_id: profile.id, action: `report_${status}`, entity_type: 'report', entity_id: id });
    load(); showToast(`Report ${status}`);
  }

  async function deletePost(id: string) {
    await supabase.from('posts').delete().eq('id', id);
    await supabase.from('admin_actions').insert({ admin_id: profile.id, action: 'post_deleted', entity_type: 'post', entity_id: id });
    load(); showToast('Post removed');
  }

  async function setRole(user: Profile, role: string) {
    if (profile.role !== 'admin' || user.id === profile.id) return;
    const { error } = await supabase.from('profiles').update({ role }).eq('id', user.id);
    if (error) showToast(error.message, 'error'); else { showToast('Role updated'); load(); }
  }

  const tabs: [Tab,string,number?][] = [['overview','Overview'],['users','Users',users.length],['payments','Payments',pending.length],['reports','Reports',pendingReports.length],['posts','Moderation',posts.length]];
  return <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
    <header className="flex items-center justify-between"><div><div className="flex items-center gap-2"><div className="w-9 h-9 rounded-xl bg-accent-600 text-white flex items-center justify-center"><Shield className="w-5 h-5" /></div><div><h1 className="text-xl font-bold">NEXA Control Center</h1><p className="text-xs text-ink-400 flex items-center gap-1"><Activity className="w-3 h-3 text-emerald-500" /> Live moderation and payments</p></div></div></div><span className="px-2.5 py-1 rounded-full bg-accent-50 dark:bg-accent-900/20 text-accent-600 text-xs font-semibold uppercase">{profile.role}</span></header>
    <div className="flex gap-1 overflow-x-auto p-1 rounded-xl bg-ink-100 dark:bg-ink-800">{tabs.map(([key,label,count]) => <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${tab === key ? 'bg-white dark:bg-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}>{label}{count !== undefined && <span className="ml-1.5 text-xs opacity-60">{compactNumber(count)}</span>}</button>)}</div>
    {loading ? <div className="h-64 rounded-2xl bg-ink-100 dark:bg-ink-800 animate-pulse" /> : tab === 'overview' ? <div className="space-y-5"><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[[Users,'Users',users.length],[CreditCard,'Pending',pending.length],[Flag,'Reports',pendingReports.length],[DollarSign,'Volume',formatCurrency(totalVolume)]].map(([Icon,label,value]) => <div key={String(label)} className="rounded-2xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 p-4 hover:-translate-y-0.5 transition-transform"><Icon className="w-5 h-5 text-accent-600 mb-3" /><p className="text-2xl font-bold">{String(value)}</p><p className="text-xs text-ink-400 mt-1">{String(label)}</p></div>)}</div><section className="rounded-2xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 p-5"><h2 className="font-semibold mb-3">Latest payment activity</h2>{tx.slice(0,8).map((x) => <div key={x.id} className="flex items-center gap-3 py-2.5 border-b last:border-0 border-ink-100 dark:border-ink-800"><Avatar name={x.sender?.full_name || 'User'} src={x.sender?.avatar_url || undefined} size={34} /><div className="flex-1"><p className="text-sm font-medium">{x.sender?.full_name} → {x.receiver?.full_name}</p><p className="text-xs text-ink-400">{timeAgo(x.created_at)}</p></div><b className="text-sm">{formatCurrency(x.amount_cents)}</b><Status status={x.status} /></div>)}</section></div> : tab === 'users' ? <section><div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users..." className="w-full h-11 pl-10 pr-4 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 outline-none focus:ring-2 focus:ring-accent-500/30" /></div><div className="grid md:grid-cols-2 gap-2">{filteredUsers.map((u) => <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800"><Avatar name={u.full_name} src={u.avatar_url || undefined} size={42} /><div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{u.full_name}</p><p className="text-xs text-ink-400 truncate">@{u.username} · {timeAgo(u.created_at)}</p></div>{profile.role === 'admin' ? <select value={u.role} onChange={(e) => setRole(u,e.target.value)} className="text-xs rounded-lg bg-ink-100 dark:bg-ink-800 px-2 py-1.5"><option value="user">User</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select> : <span className="text-xs text-ink-400">{u.role}</span>}</div>)}</div></section> : tab === 'payments' ? <section className="space-y-3">{tx.length === 0 ? <EmptyState icon={<CreditCard />} title="No payments" /> : tx.map((x) => <div key={x.id} className="p-4 rounded-2xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 hover:shadow-md transition-shadow"><div className="flex items-start gap-3"><Avatar name={x.sender?.full_name || 'User'} src={x.sender?.avatar_url || undefined} size={40} /><div className="flex-1"><p className="font-semibold text-sm">{x.sender?.full_name} → {x.receiver?.full_name}</p><p className="text-xs text-ink-400">{formatDateTime(x.created_at)} · {x.payment_method || 'wallet'} · Trx: {x.tx_trx_id || '-'}</p>{x.admin_note && <p className="text-xs mt-2 text-ink-500">Note: {x.admin_note}</p>}</div><div className="text-right"><b>{formatCurrency(x.amount_cents)}</b><div className="mt-1"><Status status={x.status} /></div></div></div>{x.status === 'pending' && <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-ink-100 dark:border-ink-800"><button disabled={busy === x.id} onClick={() => reviewPayment(x,'rejected')} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"><XCircle className="inline w-4 h-4 mr-1" />Reject</button><button disabled={busy === x.id} onClick={() => reviewPayment(x,'approved')} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"><CheckCircle2 className="inline w-4 h-4 mr-1" />Approve</button></div>}</div>)}</section> : tab === 'reports' ? <section className="space-y-2">{reports.length === 0 ? <EmptyState icon={<Flag />} title="No reports" /> : reports.map((r) => <div key={r.id} className="p-4 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800"><div className="flex items-start gap-3"><Flag className="w-5 h-5 text-rose-500 mt-0.5" /><div className="flex-1"><p className="text-sm font-semibold">{r.reason}</p><p className="text-xs text-ink-500 mt-1">{r.description || 'No description'}</p><p className="text-xs text-ink-400 mt-2">{formatDateTime(r.created_at)} · {r.entity_type}</p></div><div className="flex gap-1">{r.status === 'pending' && <><button onClick={() => reportStatus(r.id,'reviewed')} className="px-2.5 py-1.5 rounded-lg text-xs bg-ink-100 dark:bg-ink-800">Review</button><button onClick={() => reportStatus(r.id,'resolved')} className="px-2.5 py-1.5 rounded-lg text-xs bg-emerald-50 text-emerald-600">Resolve</button></>}</div></div></div>)}</section> : <section className="space-y-2">{posts.map((p) => <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800"><Avatar name={p.profile?.full_name || 'User'} src={p.profile?.avatar_url || undefined} size={36} /><div className="flex-1 min-w-0"><p className="text-sm font-semibold">{p.profile?.full_name}</p><p className="text-xs text-ink-500 truncate">{p.content}</p></div><button onClick={() => deletePost(p.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50">Remove</button></div>)}</section>}
  </div>;
}

function Status({ status }: { status: string }) { const ok = ['approved','completed'].includes(status); const bad = ['rejected','failed','cancelled'].includes(status); return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${ok ? 'bg-emerald-50 text-emerald-600' : bad ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>{status}</span>; }
