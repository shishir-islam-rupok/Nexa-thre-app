import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import type { Transaction, Profile, Wallet } from '@/types';
import { uploadFile } from '@/lib/upload';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { formatCurrency, formatDateTime, compactNumber } from '@/lib/format';
import {
  ArrowUpRight, ArrowDownLeft, Plus, Send, Download, Search,
  CheckCircle2, AlertCircle, Clock, XCircle, CreditCard, Wallet as WalletIcon,
  X, Upload, Image as ImageIcon, Phone,
} from 'lucide-react';

interface WalletPageProps {
  onViewProfile: (userId: string) => void;
}

const PAYMENT_METHODS = [
  { id: 'bkash', name: 'bKash', number: '01712-345678', color: 'bg-pink-500' },
  { id: 'nagad', name: 'Nagad', number: '01812-345678', color: 'bg-orange-500' },
];

export default function WalletPage({ onViewProfile }: WalletPageProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSend, setShowSend] = useState(false);
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);

  // Send money form state
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sendStep, setSendStep] = useState<'recipient' | 'amount' | 'method' | 'manual' | 'success'>('recipient');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [txTrxId, setTxTrxId] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add money form state
  const [addAmount, setAddAmount] = useState('');
  const [addMethod, setAddMethod] = useState('');
  const [addTrxId, setAddTrxId] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addScreenshot, setAddScreenshot] = useState<File | null>(null);
  const [addScreenshotUrl, setAddScreenshotUrl] = useState('');
  const [addingMoney, setAddingMoney] = useState(false);

  // Request money form state
  const [requestStep, setRequestStep] = useState<'recipient' | 'amount' | 'success'>('recipient');
  const [requestAmount, setRequestAmount] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    let { data: w } = await supabase.from('wallets').select('*').eq('user_id', profile.id).maybeSingle();
    if (!w) {
      const { data: newW } = await supabase.from('wallets').insert({ user_id: profile.id }).select().single();
      w = newW;
    }
    setWallet(w as Wallet);

    const { data: txs } = await supabase
      .from('transactions')
      .select('*, sender:profiles!sender_id(*), receiver:profiles!receiver_id(*)')
      .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`)
      .order('created_at', { ascending: false })
      .limit(50);
    setTransactions((txs || []) as Transaction[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (showSend || showRequest) {
      supabase.from('profiles').select('*').neq('id', profile?.id || '').then(({ data }) => setUsers((data || []) as Profile[]));
    }
  }, [showSend, showRequest, profile]);

  function resetSendForm() {
    setSelectedUser(null);
    setAmount('');
    setNote('');
    setPaymentMethod('');
    setTxTrxId('');
    setSenderPhone('');
    setScreenshotFile(null);
    setScreenshotUrl('');
    setSendStep('recipient');
  }

  function resetRequestForm() {
    setSelectedUser(null);
    setRequestAmount('');
    setRequestNote('');
    setRequestStep('recipient');
  }

  async function handleRequestMoney() {
    if (!profile || !selectedUser || !requestAmount) return;
    const cents = Math.round(parseFloat(requestAmount) * 100);
    if (cents <= 0) return;
    setRequesting(true);
    const { error } = await supabase.from('notifications').insert({
      user_id: selectedUser.id,
      actor_id: profile.id,
      type: 'payment_request',
      entity_type: 'payment_request',
      content: `${profile.full_name} requested ${formatCurrency(cents)}${requestNote.trim() ? ': ' + requestNote.trim() : ''}`,
    });
    if (error) {
      showToast('Failed to send request', 'error');
    } else {
      setRequestStep('success');
      showToast('Request sent');
      setTimeout(() => { setShowRequest(false); resetRequestForm(); }, 2500);
    }
    setRequesting(false);
  }

  async function handleScreenshotUpload(file: File) {
    setUploadingScreenshot(true);
    const result = await uploadFile(file, 'uploads');
    if (result.error) {
      showToast(result.error, 'error');
    } else {
      setScreenshotUrl(result.url);
      setScreenshotFile(file);
      showToast('Screenshot uploaded');
    }
    setUploadingScreenshot(false);
  }

  async function handleAddScreenshotUpload(file: File) {
    setUploadingScreenshot(true);
    const result = await uploadFile(file, 'uploads');
    if (result.error) {
      showToast(result.error, 'error');
    } else {
      setAddScreenshotUrl(result.url);
      setAddScreenshot(file);
      showToast('Screenshot uploaded');
    }
    setUploadingScreenshot(false);
  }

  async function handleSendPayment() {
    if (!profile || !selectedUser || !amount || !paymentMethod) return;
    const cents = Math.round(parseFloat(amount) * 100);
    if (cents <= 0) return;

    if (!txTrxId.trim() || !senderPhone.trim()) {
      showToast('Transaction ID and sender phone are required', 'error');
      return;
    }

    setSending(true);
    const { error } = await supabase.from('transactions').insert({
      sender_id: profile.id,
      receiver_id: selectedUser.id,
      amount_cents: cents,
      note: note.trim(),
      status: 'pending',
      payment_method: paymentMethod,
      tx_trx_id: txTrxId.trim(),
      sender_phone: senderPhone.trim(),
      screenshot_url: screenshotUrl,
    });

    if (error) {
      showToast('Failed to submit payment', 'error');
    } else {
      setSendStep('success');
      showToast('Payment submitted for verification');
      load();
      setTimeout(() => { setShowSend(false); resetSendForm(); }, 3000);
    }
    setSending(false);
  }

  async function handleAddMoney() {
    if (!profile || !addAmount || !addMethod) return;
    const cents = Math.round(parseFloat(addAmount) * 100);
    if (cents <= 0) return;

    if (!addTrxId.trim() || !addPhone.trim()) {
      showToast('Transaction ID and sender phone are required', 'error');
      return;
    }

    setAddingMoney(true);
    // Create a self-transaction for adding money
    const { error } = await supabase.from('transactions').insert({
      sender_id: profile.id,
      receiver_id: profile.id,
      amount_cents: cents,
      note: 'Add money to wallet',
      status: 'pending',
      payment_method: addMethod,
      tx_trx_id: addTrxId.trim(),
      sender_phone: addPhone.trim(),
      screenshot_url: addScreenshotUrl,
    });

    if (error) {
      showToast('Failed to submit request', 'error');
    } else {
      showToast('Add money request submitted for verification');
      setAddAmount('');
      setAddMethod('');
      setAddTrxId('');
      setAddPhone('');
      setAddScreenshot(null);
      setAddScreenshotUrl('');
      setShowAddMoney(false);
      load();
    }
    setAddingMoney(false);
  }

  const totalSent = transactions.filter((t) => t.sender_id === profile?.id && t.status === 'approved').reduce((s, t) => s + t.amount_cents, 0);
  const totalReceived = transactions.filter((t) => t.receiver_id === profile?.id && t.status === 'approved').reduce((s, t) => s + t.amount_cents, 0);
  const pendingCount = transactions.filter((t) => t.status === 'pending').length;

  if (!profile) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-ink-900 dark:text-white mb-5">Wallet</h1>

      {/* Balance card */}
      <div className="bg-ink-900 dark:bg-ink-850 rounded-2xl p-6 mb-5 text-white">
        <div className="flex items-center gap-2 text-ink-400 mb-1">
          <WalletIcon className="w-4 h-4" />
          <span className="text-xs font-medium">Available Balance</span>
        </div>
        <p className="text-3xl font-bold tracking-tight">{formatCurrency(wallet?.balance_cents || 0)}</p>
        {pendingCount > 0 && (
          <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
            <Clock className="w-3 h-3" /> {pendingCount} payment{pendingCount > 1 ? 's' : ''} pending verification
          </p>
        )}
        <div className="flex items-center gap-2 mt-5">
          <button onClick={() => setShowAddMoney(true)} className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Add Money
          </button>
          <button onClick={() => { resetSendForm(); setShowSend(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-sm font-medium transition-colors">
            <Send className="w-4 h-4" /> Send
          </button>
          <button onClick={() => setShowRequest(true)} className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-sm font-medium transition-colors">
            <Download className="w-4 h-4" /> Request
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 text-rose-500" />
            </div>
            <span className="text-xs font-medium text-ink-400">Total Sent</span>
          </div>
          <p className="text-xl font-bold text-ink-900 dark:text-white">{formatCurrency(totalSent)}</p>
        </div>
        <div className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
            </div>
            <span className="text-xs font-medium text-ink-400">Total Received</span>
          </div>
          <p className="text-xl font-bold text-ink-900 dark:text-white">{formatCurrency(totalReceived)}</p>
        </div>
      </div>

      {/* Transactions */}
      <h2 className="text-sm font-semibold text-ink-500 dark:text-ink-400 mb-3">Recent Transactions</h2>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl animate-pulse" />)}
        </div>
      ) : transactions.length === 0 ? (
        <EmptyState icon={<CreditCard className="w-7 h-7" />} title="No transactions yet" description="Send money or add funds to get started." />
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => {
            const isSent = tx.sender_id === profile.id && tx.receiver_id !== profile.id;
            const isSelf = tx.sender_id === tx.receiver_id;
            const otherUser = isSent ? tx.receiver : tx.sender;
            const methodName = PAYMENT_METHODS.find((m) => m.id === tx.payment_method)?.name || tx.payment_method || 'Wallet';
            return (
              <div key={tx.id} className="flex items-center gap-3 p-3.5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl">
                {otherUser ? (
                  <button onClick={() => onViewProfile(otherUser.id)}>
                    <Avatar name={otherUser.full_name} src={otherUser.avatar_url || undefined} size={40} />
                  </button>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-ink-100 dark:bg-ink-800 flex items-center justify-center">
                    <WalletIcon className="w-5 h-5 text-ink-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                    {isSelf ? 'Add Money' : `${isSent ? 'To' : 'From'} ${otherUser?.full_name || 'User'}`}
                  </p>
                  <p className="text-xs text-ink-400">{formatDateTime(tx.created_at)}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {tx.payment_method && tx.payment_method !== 'wallet' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-800 text-ink-500">{methodName}</span>
                    )}
                    {tx.note && <span className="text-xs text-ink-400 truncate">{tx.note}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${isSelf ? 'text-emerald-500' : isSent ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {isSelf ? '+' : isSent ? '-' : '+'}{formatCurrency(tx.amount_cents)}
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    {tx.status === 'approved' && <span className="flex items-center gap-1 text-xs text-emerald-500"><CheckCircle2 className="w-3 h-3" /> Approved</span>}
                    {tx.status === 'completed' && <span className="flex items-center gap-1 text-xs text-emerald-500"><CheckCircle2 className="w-3 h-3" /> Completed</span>}
                    {tx.status === 'pending' && <span className="flex items-center gap-1 text-xs text-amber-500"><Clock className="w-3 h-3" /> Pending</span>}
                    {tx.status === 'rejected' && <span className="flex items-center gap-1 text-xs text-rose-500"><XCircle className="w-3 h-3" /> Rejected</span>}
                    {tx.status === 'failed' && <span className="flex items-center gap-1 text-xs text-rose-500"><AlertCircle className="w-3 h-3" /> Failed</span>}
                    {tx.status === 'cancelled' && <span className="flex items-center gap-1 text-xs text-ink-400"><XCircle className="w-3 h-3" /> Cancelled</span>}
                  </div>
                  {tx.admin_note && tx.status === 'rejected' && (
                    <p className="text-[10px] text-rose-400 mt-0.5 max-w-[120px] truncate">{tx.admin_note}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Send Money Modal — multi-step */}
      <Modal open={showSend} onClose={() => { setShowSend(false); resetSendForm(); }} title="Send Money">
        <div className="p-5">
          {sendStep === 'recipient' && (
            <>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search recipient..." className="w-full h-10 pl-9 pr-4 bg-ink-100 dark:bg-ink-800 border-0 rounded-lg text-sm text-ink-800 dark:text-ink-100 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
              </div>
              <div className="max-h-64 overflow-y-auto scrollbar-thin space-y-1">
                {users.filter((u) => u.full_name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase())).map((user) => (
                  <button key={user.id} onClick={() => { setSelectedUser(user); setSendStep('amount'); }} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors text-left">
                    <Avatar name={user.full_name} src={user.avatar_url || undefined} size={40} />
                    <div><p className="text-sm font-medium text-ink-800 dark:text-ink-100">{user.full_name}</p><p className="text-xs text-ink-400">@{user.username}</p></div>
                  </button>
                ))}
              </div>
            </>
          )}

          {sendStep === 'amount' && selectedUser && (
            <>
              <div className="flex items-center gap-3 mb-4 p-3 bg-ink-50 dark:bg-ink-800 rounded-xl">
                <Avatar name={selectedUser.full_name} src={selectedUser.avatar_url || undefined} size={44} />
                <div><p className="text-sm font-semibold text-ink-800 dark:text-ink-100">{selectedUser.full_name}</p><p className="text-xs text-ink-400">@{selectedUser.username}</p></div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Amount (BDT)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-ink-400">৳</span>
                  <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" min="0" step="0.01" className="w-full h-14 pl-10 pr-4 text-2xl font-bold text-ink-900 dark:text-white bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Note (optional)</label>
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's this for?" maxLength={100} className="w-full h-10 px-4 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-sm text-ink-900 dark:text-white placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setSendStep('recipient')}><X className="w-4 h-4" /> Back</Button>
                <Button fullWidth onClick={() => setSendStep('method')} disabled={!amount}>Continue</Button>
              </div>
            </>
          )}

          {sendStep === 'method' && (
            <>
              <p className="text-sm font-medium text-ink-700 dark:text-ink-200 mb-3">Select payment method</p>
              <div className="space-y-2 mb-4">
                {PAYMENT_METHODS.map((m) => (
                  <button key={m.id} onClick={() => setPaymentMethod(m.id)} className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all ${paymentMethod === m.id ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20' : 'border-ink-200 dark:border-ink-700 hover:border-ink-300'}`}>
                    <div className={`w-10 h-10 rounded-xl ${m.color} flex items-center justify-center text-white font-bold text-sm`}>{m.name[0]}</div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">{m.name}</p>
                      <p className="text-xs text-ink-400">Send to {m.number}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setSendStep('amount')}>Back</Button>
                <Button fullWidth onClick={() => setSendStep('manual')} disabled={!paymentMethod}>Continue</Button>
              </div>
            </>
          )}

          {sendStep === 'manual' && paymentMethod && (
            <>
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl mb-4">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">Payment Instructions</p>
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  1. Open your {PAYMENT_METHODS.find((m) => m.id === paymentMethod)?.name} app<br />
                  2. Send ৳{amount} to {PAYMENT_METHODS.find((m) => m.id === paymentMethod)?.number}<br />
                  3. Copy the Transaction ID after payment<br />
                  4. Enter the details below and submit
                </p>
              </div>
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Transaction ID</label>
                  <input type="text" value={txTrxId} onChange={(e) => setTxTrxId(e.target.value)} placeholder="e.g. 9F2XABCD123" className="w-full h-10 px-4 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-sm text-ink-900 dark:text-white placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Your {PAYMENT_METHODS.find((m) => m.id === paymentMethod)?.name} Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                    <input type="tel" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} placeholder="01XXXXXXXXX" className="w-full h-10 pl-9 pr-4 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-sm text-ink-900 dark:text-white placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Payment Screenshot (optional)</label>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleScreenshotUpload(f); }} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploadingScreenshot} className="w-full h-10 flex items-center justify-center gap-2 border border-dashed border-ink-300 dark:border-ink-600 rounded-xl text-sm text-ink-500 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors">
                    {uploadingScreenshot ? <><Upload className="w-4 h-4 animate-pulse" /> Uploading...</> : screenshotUrl ? <><ImageIcon className="w-4 h-4" /> Screenshot attached</> : <><Upload className="w-4 h-4" /> Upload screenshot</>}
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setSendStep('method')}>Back</Button>
                <Button fullWidth onClick={handleSendPayment} loading={sending} disabled={!txTrxId.trim() || !senderPhone.trim()}>
                  Submit for Verification
                </Button>
              </div>
            </>
          )}

          {sendStep === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold text-ink-900 dark:text-white mb-1">Payment Submitted</h3>
              <p className="text-sm text-ink-400">Your payment is pending verification. You'll be notified once it's approved.</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Add Money Modal */}
      <Modal open={showAddMoney} onClose={() => setShowAddMoney(false)} title="Add Money">
        <div className="p-5">
          <p className="text-sm font-medium text-ink-700 dark:text-ink-200 mb-3">Select payment method</p>
          <div className="space-y-2 mb-4">
            {PAYMENT_METHODS.map((m) => (
              <button key={m.id} onClick={() => setAddMethod(m.id)} className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all ${addMethod === m.id ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20' : 'border-ink-200 dark:border-ink-700 hover:border-ink-300'}`}>
                <div className={`w-10 h-10 rounded-xl ${m.color} flex items-center justify-center text-white font-bold text-sm`}>{m.name[0]}</div>
                <div className="text-left"><p className="text-sm font-semibold text-ink-800 dark:text-ink-100">{m.name}</p><p className="text-xs text-ink-400">Send to {m.number}</p></div>
              </button>
            ))}
          </div>

          {addMethod && (
            <>
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl mb-4">
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  Send money to the {PAYMENT_METHODS.find((m) => m.id === addMethod)?.name} number above, then enter the transaction details below.
                </p>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Amount (BDT)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-ink-400">৳</span>
                  <input type="number" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} placeholder="0" min="0" step="0.01" className="w-full h-14 pl-10 pr-4 text-2xl font-bold text-ink-900 dark:text-white bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Transaction ID</label>
                <input type="text" value={addTrxId} onChange={(e) => setAddTrxId(e.target.value)} placeholder="e.g. 9F2XABCD123" className="w-full h-10 px-4 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-sm text-ink-900 dark:text-white placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Your Number</label>
                <input type="tel" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} placeholder="01XXXXXXXXX" className="w-full h-10 px-4 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-sm text-ink-900 dark:text-white placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Screenshot (optional)</label>
                <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAddScreenshotUpload(f); }} className="hidden" id="add-money-screenshot" />
                <label htmlFor="add-money-screenshot" className="w-full h-10 flex items-center justify-center gap-2 border border-dashed border-ink-300 dark:border-ink-600 rounded-xl text-sm text-ink-500 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors cursor-pointer">
                  {uploadingScreenshot ? 'Uploading...' : addScreenshotUrl ? 'Screenshot attached' : 'Upload screenshot'}
                </label>
              </div>
              <Button fullWidth size="lg" onClick={handleAddMoney} loading={addingMoney} disabled={!addAmount || !addTrxId.trim() || !addPhone.trim()}>
                Submit for Verification
              </Button>
            </>
          )}
        </div>
      </Modal>

      {/* Request Modal */}
      <Modal open={showRequest} onClose={() => { setShowRequest(false); resetRequestForm(); }} title="Request Money">
        <div className="p-5">
          {requestStep === 'recipient' && (
            <>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search person..." className="w-full h-10 pl-9 pr-4 bg-ink-100 dark:bg-ink-800 border-0 rounded-lg text-sm text-ink-800 dark:text-ink-100 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
              </div>
              <div className="max-h-64 overflow-y-auto scrollbar-thin space-y-1">
                {users.filter((u) => u.full_name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase())).map((user) => (
                  <button key={user.id} onClick={() => { setSelectedUser(user); setRequestStep('amount'); }} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors text-left">
                    <Avatar name={user.full_name} src={user.avatar_url || undefined} size={40} />
                    <div><p className="text-sm font-medium text-ink-800 dark:text-ink-100">{user.full_name}</p><p className="text-xs text-ink-400">@{user.username}</p></div>
                  </button>
                ))}
              </div>
            </>
          )}
          {requestStep === 'amount' && selectedUser && (
            <>
              <div className="flex items-center gap-3 mb-4 p-3 bg-ink-50 dark:bg-ink-800 rounded-xl">
                <Avatar name={selectedUser.full_name} src={selectedUser.avatar_url || undefined} size={44} />
                <div><p className="text-sm font-semibold text-ink-800 dark:text-ink-100">{selectedUser.full_name}</p><p className="text-xs text-ink-400">@{selectedUser.username}</p></div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Amount (BDT)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-ink-400">৳</span>
                  <input type="number" value={requestAmount} onChange={(e) => setRequestAmount(e.target.value)} placeholder="0" min="0" step="0.01" className="w-full h-14 pl-10 pr-4 text-2xl font-bold text-ink-900 dark:text-white bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Note (optional)</label>
                <input type="text" value={requestNote} onChange={(e) => setRequestNote(e.target.value)} placeholder="What's this for?" maxLength={100} className="w-full h-10 px-4 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-sm text-ink-900 dark:text-white placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setRequestStep('recipient')}><X className="w-4 h-4" /> Back</Button>
                <Button fullWidth onClick={handleRequestMoney} loading={requesting} disabled={!requestAmount}>Send Request</Button>
              </div>
            </>
          )}
          {requestStep === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold text-ink-900 dark:text-white mb-1">Request Sent</h3>
              <p className="text-sm text-ink-400">{selectedUser?.full_name} will be notified of your request.</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
