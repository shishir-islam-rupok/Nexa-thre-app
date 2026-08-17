import { useState, useCallback } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { CallProvider } from '@/context/CallContext';
import { ToastProvider } from '@/components/ui/Toast';
import AuthPage from '@/pages/AuthPage';
import AppShell, { type PageKey } from '@/components/AppShell';
import FeedPage from '@/pages/FeedPage';
import ExplorePage from '@/pages/ExplorePage';
import MessagesPage from '@/pages/MessagesPage';
import CommunitiesPage from '@/pages/CommunitiesPage';
import WalletPage from '@/pages/WalletPage';
import NotificationsPage from '@/pages/NotificationsPage';
import SavedPage from '@/pages/SavedPage';
import ProfilePage from '@/pages/ProfilePage';
import SettingsPage from '@/pages/SettingsPage';
import AdminPage from '@/pages/AdminPage';
import Spinner from '@/components/ui/Spinner';
import CallManager from '@/components/call/CallManager';
import { isSupabaseConfigured } from '@/lib/supabase';

function ConfigurationRequired() {
  return (
    <main className="min-h-screen bg-ink-50 dark:bg-ink-950 px-6 py-16 text-ink-900 dark:text-white">
      <div className="mx-auto max-w-lg">
        <p className="text-sm font-semibold text-accent-600">NEXA</p>
        <h1 className="mt-3 text-2xl font-bold">Supabase configuration is required</h1>
        <p className="mt-3 text-sm leading-6 text-ink-600 dark:text-ink-300">
          Add your project URL and anon key to a local <code className="font-mono">.env</code> file, then restart the dev server.
        </p>
        <pre className="mt-6 overflow-x-auto border border-ink-200 bg-white p-4 text-sm text-ink-800 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-100"><code>{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}</code></pre>
      </div>
    </main>
  );
}

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [page, setPage] = useState<PageKey>('home');
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);

  const navigate = useCallback((p: PageKey) => {
    setPage(p);
    if (p !== 'profile') setViewProfileId(null);
  }, []);

  const viewProfile = useCallback((userId: string) => {
    setViewProfileId(userId);
    setPage('profile');
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50 dark:bg-ink-950">
        <div className="flex flex-col items-center gap-3 text-ink-400">
          <Spinner size={32} className="text-accent-600" />
          <p className="text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return <AuthPage />;
  }

  return (
    <AppShell
      currentPage={page}
      onNavigate={navigate}
      viewProfileId={viewProfileId}
      onClearProfileView={() => setViewProfileId(null)}
      onViewProfile={viewProfile}
    >
      {page === 'home' && <FeedPage onViewProfile={viewProfile} onNavigate={navigate} />}
      {page === 'explore' && <ExplorePage onViewProfile={viewProfile} onNavigate={navigate} />}
      {page === 'messages' && <MessagesPage onViewProfile={viewProfile} />}
      {page === 'communities' && <CommunitiesPage onNavigate={navigate} />}
      {page === 'wallet' && <WalletPage onViewProfile={viewProfile} />}
      {page === 'notifications' && <NotificationsPage onViewProfile={viewProfile} />}
      {page === 'saved' && <SavedPage onViewProfile={viewProfile} />}
      {page === 'profile' && (
        <ProfilePage userId={viewProfileId} onBack={() => navigate('home')} onNavigate={navigate} />
      )}
      {page === 'settings' && <SettingsPage />}
      {page === 'admin' && <AdminPage />}
      <CallManager />
    </AppShell>
  );
}

export default function App() {
  if (!isSupabaseConfigured) {
    return <ConfigurationRequired />;
  }

  return (
    <AuthProvider>
      <CallProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </CallProvider>
    </AuthProvider>
  );
}
