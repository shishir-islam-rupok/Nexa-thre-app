import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useDarkMode } from '@/lib/useDarkMode';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import {
  User, Lock, Shield, Bell, Palette, CreditCard, Ban, Link as LinkIcon,
  Moon, Sun, LogOut, Trash2, AlertTriangle,
} from 'lucide-react';

const sections = [
  { key: 'account', label: 'Account', icon: User },
  { key: 'privacy', label: 'Privacy', icon: Lock },
  { key: 'security', label: 'Security', icon: Shield },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'appearance', label: 'Appearance', icon: Palette },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'blocked', label: 'Blocked Users', icon: Ban },
  { key: 'connected', label: 'Connected Apps', icon: LinkIcon },
];

export default function SettingsPage() {
  const { profile, signOut, updatePassword, deleteAccount } = useAuth();
  const { dark, toggle } = useDarkMode();
  const { showToast } = useToast();
  const [active, setActive] = useState('account');
  const [notifSettings, setNotifSettings] = useState({ likes: true, comments: true, follows: true, messages: true, payments: true });
  const [privacySettings, setPrivacySettings] = useState({ privateAccount: profile?.is_private || false, showInSearch: true });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!profile) return null;

  async function handlePrivacyChange(key: string) {
    if (!profile) return;
    const newValue = !privacySettings[key as keyof typeof privacySettings];
    setPrivacySettings((prev) => ({ ...prev, [key]: newValue }));
    if (key === 'privateAccount') {
      await supabase.from('profiles').update({ is_private: newValue }).eq('id', profile.id);
      showToast('Privacy setting updated');
    }
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    setChangingPassword(true);
    const { error } = await updatePassword(newPassword);
    if (error) {
      showToast(error, 'error');
    } else {
      showToast('Password changed successfully');
      setShowPasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
    }
    setChangingPassword(false);
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== 'DELETE') {
      showToast('Type DELETE to confirm', 'error');
      return;
    }
    setDeleting(true);
    const { error } = await deleteAccount();
    if (error) {
      showToast(error, 'error');
    } else {
      showToast('Account deleted');
    }
    setDeleting(false);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-ink-900 dark:text-white mb-5">Settings</h1>

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
        {/* Sidebar */}
        <nav className="space-y-0.5">
          {sections.map((s) => (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active === s.key
                  ? 'bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400'
                  : 'text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800'
              }`}
            >
              <s.icon className="w-4 h-4" />
              {s.label}
            </button>
          ))}
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all mt-2"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </nav>

        {/* Content */}
        <div className="space-y-4">
          {active === 'account' && (
            <div className="space-y-4">
              <div className="p-5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl">
                <h2 className="text-sm font-semibold text-ink-900 dark:text-white mb-4">Profile</h2>
                <div className="flex items-center gap-4 mb-4">
                  <Avatar name={profile.full_name} src={profile.avatar_url || undefined} size={64} />
                  <div>
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{profile.full_name}</p>
                    <p className="text-xs text-ink-400">@{profile.username}</p>
                  </div>
                </div>
              </div>
              <div className="p-5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl">
                <h2 className="text-sm font-semibold text-ink-900 dark:text-white mb-2">Language</h2>
                <select className="w-full h-10 px-3 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-sm text-ink-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500/30">
                  <option>English</option>
                  <option>Bengali</option>
                </select>
              </div>
            </div>
          )}

          {active === 'privacy' && (
            <div className="p-5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl space-y-4">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Privacy Settings</h2>
              {[
                { key: 'privateAccount', label: 'Private account', desc: 'Only approved followers can see your posts' },
                { key: 'showInSearch', label: 'Show in search results', desc: 'Allow people to find you by username or name' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{item.label}</p>
                    <p className="text-xs text-ink-400 mt-0.5">{item.desc}</p>
                  </div>
                  <Toggle
                    on={privacySettings[item.key as keyof typeof privacySettings]}
                    onChange={() => handlePrivacyChange(item.key)}
                  />
                </div>
              ))}
            </div>
          )}

          {active === 'security' && (
            <div className="space-y-4">
              <div className="p-5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl space-y-4">
                <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Security</h2>
                <Button variant="outline" fullWidth onClick={() => setShowPasswordModal(true)}>Change Password</Button>
                <div className="pt-3 border-t border-ink-100 dark:border-ink-800">
                  <p className="text-xs text-ink-400">Your account is protected by Supabase Auth with secure password hashing and session management.</p>
                </div>
              </div>
              <div className="p-5 bg-white dark:bg-ink-900 border border-rose-200 dark:border-rose-800/40 rounded-2xl space-y-3">
                <h2 className="text-sm font-semibold text-rose-500">Danger Zone</h2>
                <p className="text-xs text-ink-400">Permanently delete your account and all associated data. This action cannot be undone.</p>
                <Button variant="outline" fullWidth className="text-rose-500 border-rose-200 dark:border-rose-800/40 hover:bg-rose-50 dark:hover:bg-rose-900/20" onClick={() => setShowDeleteModal(true)}>
                  <Trash2 className="w-4 h-4" /> Delete Account
                </Button>
              </div>
            </div>
          )}

          {active === 'notifications' && (
            <div className="p-5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl space-y-4">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Notification Preferences</h2>
              {Object.entries(notifSettings).map(([key, on]) => (
                <div key={key} className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink-800 dark:text-ink-100 capitalize">{key}</p>
                  <Toggle
                    on={on}
                    onChange={() => setNotifSettings((prev) => ({ ...prev, [key as keyof typeof prev]: !prev[key as keyof typeof prev] }))}
                  />
                </div>
              ))}
            </div>
          )}

          {active === 'appearance' && (
            <div className="p-5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl space-y-4">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Appearance</h2>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {dark ? <Moon className="w-5 h-5 text-accent-500" /> : <Sun className="w-5 h-5 text-amber-500" />}
                  <div>
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100">Dark Mode</p>
                    <p className="text-xs text-ink-400">Use dark theme</p>
                  </div>
                </div>
                <Toggle on={dark} onChange={toggle} />
              </div>
            </div>
          )}

          {active === 'payments' && (
            <div className="p-5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white mb-4">Payment Methods</h2>
              <p className="text-sm text-ink-400 mb-4">NEXA supports bKash and Nagad for sending and receiving money. Visit your Wallet to add funds or send payments.</p>
              <div className="flex items-center gap-3 p-3 bg-ink-50 dark:bg-ink-800 rounded-xl mb-3">
                <div className="w-10 h-10 rounded-lg bg-pink-500 flex items-center justify-center text-white font-bold">b</div>
                <div className="flex-1"><p className="text-sm font-medium text-ink-800 dark:text-ink-100">bKash</p><p className="text-xs text-ink-400">Mobile financial services</p></div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-ink-50 dark:bg-ink-800 rounded-xl">
                <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold">N</div>
                <div className="flex-1"><p className="text-sm font-medium text-ink-800 dark:text-ink-100">Nagad</p><p className="text-xs text-ink-400">Digital financial services</p></div>
              </div>
            </div>
          )}

          {active === 'blocked' && (
            <div className="p-5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white mb-4">Blocked Users</h2>
              <p className="text-sm text-ink-400">You haven't blocked anyone.</p>
            </div>
          )}

          {active === 'connected' && (
            <div className="p-5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white mb-4">Connected Apps</h2>
              <p className="text-sm text-ink-400">No apps connected to your NEXA account.</p>
            </div>
          )}
        </div>
      </div>

      {/* Change Password Modal */}
      <Modal open={showPasswordModal} onClose={() => setShowPasswordModal(false)} title="Change Password">
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">New Password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" className="w-full h-10 px-4 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-sm text-ink-900 dark:text-white placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Confirm Password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" className="w-full h-10 px-4 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-sm text-ink-900 dark:text-white placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
          </div>
          <Button fullWidth onClick={handleChangePassword} loading={changingPassword}>Update Password</Button>
        </div>
      </Modal>

      {/* Delete Account Modal */}
      <Modal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Account">
        <div className="p-5 space-y-4">
          <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-rose-700 dark:text-rose-400">This will permanently delete your account</p>
              <p className="text-xs text-rose-600 dark:text-rose-500 mt-1">All your posts, messages, and data will be removed. This cannot be undone.</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Type DELETE to confirm</label>
            <input type="text" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="DELETE" className="w-full h-10 px-4 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-sm text-ink-900 dark:text-white placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30" />
          </div>
          <Button fullWidth className="bg-rose-500 hover:bg-rose-600 text-white" onClick={handleDeleteAccount} loading={deleting} disabled={deleteConfirm !== 'DELETE'}>
            <Trash2 className="w-4 h-4" /> Delete My Account
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-accent-600' : 'bg-ink-200 dark:bg-ink-700'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}
