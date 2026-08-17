import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import type { Profile, Transaction, Post, Report } from '@/types';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import Tabs from '@/components/ui/Tabs';
import { formatCurrency, formatDateTime, compactNumber, timeAgo } from '@/lib/format';
import {
  Users, CreditCard, Flag, FileText, Check, X,
  Search, CheckCircle2, XCircle, Shield, Eye,
} from 'lucide-react';

type AdminTab = 'overview' | 'users' | 'payments' | 'reports' | 'posts';

export default function AdminPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [users, setUsers] = useState<Profile[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [reviewTx, setReviewTx] = useState<Transaction | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [usersRes, txRes, reportsRes, postsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('transactions').select('*, sender:profiles!sender_id(*), receiver:profiles!receiver_id(*)').order('created_at', { ascending: false }).limit(100),
      supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('posts').select('*, profile:profiles!user_id(*)').order('created_at', { ascending: false }).limit(50),
    ]);
    setUsers((usersRes.data || []) as Profile[]);
    setTransactions((txRes.data || []) as Transaction[]);
    setReports((reportsRes.data || []) as Report[]);
    setPosts((postsRes.data || []) as unknown as Post[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!profile || (profile.role !== 'admin' && profile.role !== 'moderator')) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState
          icon={<Shield className="w-7 h-7" />}
          title="Access denied"
          description="You don't have permission to view this page."
        />
      </div>
    );
  }

  const pendingTx = transactions.filter((t) => t.status === 'pending');
  const pendingReports = reports.filter((r) => r.status === 'pending');

  async function reviewTransaction(tx: Transaction, action: 'approved' | 'rejected') {
    if (!profile) return;
    setReviewing(true);
    const { error } = await supabase
      .from('transactions')
      .update({
        status: action,
        admin_note: adminNote.trim(),
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', tx.id);

    if (error) {
      showToast('Failed to update transaction', 'error');
    } else {
      // If approved, update the receiver's wallet
      if (action === 'approved') {
        // For self-transactions (add money), add to own wallet
        if (tx.sender_id === tx.receiver_id) {
          const { data: wallet } = await supabase.from('wallets').select('*').eq('user_id', tx.sender_id).maybeSingle();
          if (wallet) {
            await supabase.from('wallets').update({ balance_cents: wallet.balance_cents + tx.amount_cents }).eq('user_id', tx.sender_id);
          }
        } else {
          // Deduct from sender, add to receiver
          const { data: senderWallet } = await supabase.from('wallets').select('*').eq('user_id', tx.sender_id).maybeSingle();
          const { data: receiverWallet } = await supabase.from('wallets').select('*').eq('user_id', tx.receiver_id).maybeSingle();
          if (receiverWallet) {
            await supabase.from('wallets').update({ balance_cents: receiverWallet.balance_cents + tx.amount_cents }).eq('user_id', tx.receiver_id);
          }
          if (senderWallet) {
            await supabase.from('wallets').update({ balance_cents: Math.max(0, senderWallet.balance_cents - tx.amount_cents) }).eq('user_id', tx.sender_id);
          }
        }

        // Send notification to the sender
        await supabase.from('notifications').insert({
          user_id: tx.sender_id,
          actor_id: profile.id,
          type: 'payment',
          entity_id: tx.id,
          entity_type: 'transaction',
          content: `Your payment of ${formatCurrency(tx.amount_cents)} has been approved`,
        });

        // Send notification to receiver if different
        if (tx.receiver_id !== tx.sender_id) {
          await supabase.from('notifications').insert({
            user_id: tx.receiver_id,
            actor_id: profile.id,
            type: 'payment',
            entity_id: tx.id,
            entity_type: 'transaction',
            content: `You received ${formatCurrency(tx.amount_cents)}`,
          });
        }
      } else {
        // Rejected - notify sender
        await supabase.from('notifications').insert({
          user_id: tx.sender_id,
          actor_id: profile.id,
          type: 'payment',
          entity_id: tx.id,
          entity_type: 'transaction',
          content: `Your payment of ${formatCurrency(tx.amount_cents)} was rejected${adminNote.trim() ? ': ' + adminNote.trim() : ''}`,
        });
      }

      // Log admin action
      await supabase.from('admin_actions').insert({
        admin_id: profile.id,
        action: `transaction_${action}`,
        entity_type: 'transaction',
        entity_id: tx.id,
        details: adminNote.trim(),
      });

      showToast(`Transaction ${action}`);
      setReviewTx(null);
      setAdminNote('');
      load();
    }
    setReviewing(false);
  }

  async function updateReportStatus(reportId: string, status: string) {
    if (!profile) return;
    await supabase.from('reports').update({ status }).eq('id', reportId);
    await supabase.from('admin_actions').insert({
      admin_id: profile.id,
      action: `report_${status}`,
      entity_type: 'report',
      entity_id: reportId,
    });
    showToast(`Report marked as ${status}`);
    load();
  }

  async function deletePost(postId: string) {
    if (!profile) return;
    await supabase.from('posts').delete().eq('id', postId);
    await supabase.from('admin_actions').insert({
      admin_id: profile.id,
      action: 'post_deleted',
      entity_type: 'post',
      entity_id: postId,
    });
    showToast('Post deleted');
    load();
  }

  async function toggleUserSuspension(user: Profile) {
    // We can't suspend auth users from client, but we can mark them
    const { error } = await supabase
      .from('profiles')
      .update({ is_private: !user.is_private })
      .eq('id', user.id);
    if (error) {
      showToast('Failed to update user', 'error');
    } else {
      showToast('User updated');
      load();
    }
  }

  const filteredUsers = users.filter((u) =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-5">
        <Shield className="w-5 h-5 text-accent-600" />
        <h1 className="text-xl font-bold text-ink-900 dark:text-white">Admin Dashboard</h1>
      </div>

      <Tabs
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'users', label: 'Users', count: users.length },
          { key: 'payments', label: 'Payments', count: pendingTx.length },
          { key: 'reports', label: 'Reports', count: pendingReports.length },
          { key: 'posts', label: 'Posts' },
        ]}
        active={tab}
        onChange={(t) => setTab(t as AdminTab)}
        className="mb-5"
      />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : tab === 'overview' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Users className="w-5 h-5" />} label="Total Users" value={compactNumber(users.length)} />
            <StatCard icon={<CreditCard className="w-5 h-5" />} label="Pending Payments" value={compactNumber(pendingTx.length)} />
            <StatCard icon={<Flag className="w-5 h-5" />} label="Pending Reports" value={compactNumber(pendingReports.length)} />
            <StatCard icon={<FileText className="w-5 h-5" />} label="Total Posts" value={compactNumber(posts.length)} />
          </div>

          <div className="p-5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white mb-3">Recent Transactions</h2>
            <div className="space-y-2">
              {transactions.slice(0, 5).map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink-700 dark:text-ink-200">
                      {tx.sender?.full_name} → {tx.receiver?.full_name}
                    </p>
                    <p className="text-xs text-ink-400">{formatDateTime(tx.created_at)}</p>
                  </div>
                  <span className="text-sm font-semibold text-ink-800 dark:text-ink-100">{formatCurrency(tx.amount_cents)}</span>
                  <StatusBadge status={tx.status} />
                </div>
              ))}
              {transactions.length === 0 && <p className="text-sm text-ink-400">No transactions yet</p>}
            </div>
          </div>
        </div>
      ) : tab === 'users' ? (
        <div>
          <div className="relative mb-4">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="w-full h-11 pl-11 pr-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl text-sm text-ink-800 dark:text-ink-100 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
          </div>
          <div className="space-y-2">
            {filteredUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-3.5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
                <Avatar name={u.full_name} src={u.avatar_url || undefined} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-800 dark:text-ink-100 truncate">{u.full_name}</p>
                  <p className="text-xs text-ink-400 truncate">@{u.username} · joined {timeAgo(u.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {u.role === 'admin' && <span className="text-xs px-2 py-0.5 rounded bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-400 font-medium">Admin</span>}
                  <Button size="sm" variant="outline" onClick={() => toggleUserSuspension(u)}>
                    {u.is_private ? 'Activate' : 'Suspend'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : tab === 'payments' ? (
        <div className="space-y-2">
          {transactions.length === 0 ? (
            <EmptyState icon={<CreditCard className="w-7 h-7" />} title="No transactions" />
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {tx.sender && <Avatar name={tx.sender.full_name} src={tx.sender.avatar_url || undefined} size={36} />}
                    <div>
                      <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">{tx.sender?.full_name}</p>
                      <p className="text-xs text-ink-400">→ {tx.receiver?.full_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-ink-900 dark:text-white">{formatCurrency(tx.amount_cents)}</p>
                    <StatusBadge status={tx.status} />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                  <div><span className="text-ink-400">Method:</span> <span className="text-ink-600 dark:text-ink-300 capitalize">{tx.payment_method || 'wallet'}</span></div>
                  <div><span className="text-ink-400">Trx ID:</span> <span className="text-ink-600 dark:text-ink-300 font-mono">{tx.tx_trx_id || '-'}</span></div>
                  <div><span className="text-ink-400">Phone:</span> <span className="text-ink-600 dark:text-ink-300">{tx.sender_phone || '-'}</span></div>
                  <div><span className="text-ink-400">Date:</span> <span className="text-ink-600 dark:text-ink-300">{formatDateTime(tx.created_at)}</span></div>
                </div>
                {tx.screenshot_url && (
                  <a href={tx.screenshot_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-600 dark:text-accent-400 hover:underline mb-3">
                    <Eye className="w-3.5 h-3.5" /> View screenshot
                  </a>
                )}
                {tx.admin_note && <p className="text-xs text-ink-400 mb-3">Admin note: {tx.admin_note}</p>}
                {tx.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { setReviewTx(tx); setAdminNote(''); }}><Check className="w-3.5 h-3.5" /> Review</Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : tab === 'reports' ? (
        <div className="space-y-2">
          {reports.length === 0 ? (
            <EmptyState icon={<Flag className="w-7 h-7" />} title="No reports" description="User reports will appear here." />
          ) : (
            reports.map((r) => (
              <div key={r.id} className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-ink-800 dark:text-ink-100 capitalize">{r.entity_type} report</p>
                    <p className="text-xs text-ink-400">{formatDateTime(r.created_at)}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-sm text-ink-600 dark:text-ink-300 mb-2"><span className="font-medium">Reason:</span> {r.reason}</p>
                {r.description && <p className="text-sm text-ink-500 dark:text-ink-400 mb-3">{r.description}</p>}
                {r.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateReportStatus(r.id, 'resolved')}>Resolve</Button>
                    <Button size="sm" variant="outline" onClick={() => updateReportStatus(r.id, 'dismissed')}>Dismiss</Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : tab === 'posts' ? (
        <div className="space-y-2">
          {posts.length === 0 ? (
            <EmptyState icon={<FileText className="w-7 h-7" />} title="No posts" />
          ) : (
            posts.map((p) => (
              <div key={p.id} className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <Avatar name={p.profile?.full_name || 'User'} src={p.profile?.avatar_url || undefined} size={32} />
                  <div>
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{p.profile?.full_name}</p>
                    <p className="text-xs text-ink-400">{timeAgo(p.created_at)}</p>
                  </div>
                  <Button size="sm" variant="outline" className="ml-auto text-rose-500" onClick={() => deletePost(p.id)}>
                    <X className="w-3.5 h-3.5" /> Delete
                  </Button>
                </div>
                <p className="text-sm text-ink-700 dark:text-ink-200 line-clamp-3">{p.content}</p>
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* Review transaction modal */}
      <Modal open={!!reviewTx} onClose={() => setReviewTx(null)} title="Review Payment">
        {reviewTx && (
          <div className="p-5">
            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-400">Amount</span>
                <span className="text-lg font-bold text-ink-900 dark:text-white">{formatCurrency(reviewTx.amount_cents)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-400">From</span>
                <span className="text-sm text-ink-700 dark:text-ink-200">{reviewTx.sender?.full_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-400">To</span>
                <span className="text-sm text-ink-700 dark:text-ink-200">{reviewTx.receiver?.full_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-400">Method</span>
                <span className="text-sm text-ink-700 dark:text-ink-200 capitalize">{reviewTx.payment_method}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-400">Transaction ID</span>
                <span className="text-sm text-ink-700 dark:text-ink-200 font-mono">{reviewTx.tx_trx_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-400">Sender Phone</span>
                <span className="text-sm text-ink-700 dark:text-ink-200">{reviewTx.sender_phone}</span>
              </div>
              {reviewTx.screenshot_url && (
                <a href={reviewTx.screenshot_url} target="_blank" rel="noreferrer" className="block">
                  <img src={reviewTx.screenshot_url} alt="Payment screenshot" className="w-full max-h-48 object-cover rounded-xl" />
                </a>
              )}
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Admin Note (optional)</label>
              <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={2} placeholder="Add a note for the user..." className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-sm text-ink-900 dark:text-white placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30 resize-none" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setReviewTx(null)}>Cancel</Button>
              <Button variant="outline" className="text-rose-500 border-rose-200 dark:border-rose-800/40" onClick={() => reviewTransaction(reviewTx, 'rejected')} loading={reviewing}>
                <XCircle className="w-4 h-4" /> Reject
              </Button>
              <Button onClick={() => reviewTransaction(reviewTx, 'approved')} loading={reviewing}>
                <CheckCircle2 className="w-4 h-4" /> Approve
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
      <div className="w-9 h-9 rounded-lg bg-accent-50 dark:bg-accent-900/20 flex items-center justify-center text-accent-600 dark:text-accent-400 mb-2">
        {icon}
      </div>
      <p className="text-2xl font-bold text-ink-900 dark:text-white">{value}</p>
      <p className="text-xs text-ink-400">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20',
    approved: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20',
    completed: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20',
    rejected: 'text-rose-500 bg-rose-50 dark:bg-rose-900/20',
    failed: 'text-rose-500 bg-rose-50 dark:bg-rose-900/20',
    cancelled: 'text-ink-400 bg-ink-100 dark:bg-ink-800',
    resolved: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20',
    dismissed: 'text-ink-400 bg-ink-100 dark:bg-ink-800',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}
