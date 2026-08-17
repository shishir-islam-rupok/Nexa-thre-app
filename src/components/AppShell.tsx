import { useState, useEffect, useCallback } from 'react';
import {
  Home, Compass, MessageCircle, Wallet, Bell, Bookmark,
  User, Settings, Plus, Search, Moon, Sun, HelpCircle,
  LogOut, Menu, X, Shield,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useDarkMode } from '@/lib/useDarkMode';
import Avatar from '@/components/ui/Avatar';
import IconButton from '@/components/ui/IconButton';
import { supabase } from '@/lib/supabase';
import { compactNumber } from '@/lib/format';

export type PageKey =
  | 'home' | 'explore' | 'messages' | 'communities' | 'wallet'
  | 'notifications' | 'saved' | 'profile' | 'settings' | 'admin';

interface AppShellProps {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  children: React.ReactNode;
  viewProfileId?: string | null;
  onClearProfileView?: () => void;
  onViewProfile?: (userId: string) => void;
}

interface NavItem {
  key: PageKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'explore', label: 'Explore', icon: Compass },
  { key: 'messages', label: 'Messages', icon: MessageCircle },
  { key: 'communities', label: 'Communities', icon: Plus },
  { key: 'wallet', label: 'Wallet', icon: Wallet },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'saved', label: 'Saved', icon: Bookmark },
  { key: 'profile', label: 'Profile', icon: User },
];

const adminNavItem: NavItem = { key: 'admin', label: 'Admin', icon: Shield };

const mobileNavItems: NavItem[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'explore', label: 'Explore', icon: Compass },
  { key: 'messages', label: 'Chat', icon: MessageCircle },
  { key: 'wallet', label: 'Wallet', icon: Wallet },
  { key: 'profile', label: 'Profile', icon: User },
];

export default function AppShell({
  currentPage, onNavigate, children, viewProfileId, onClearProfileView, onViewProfile,
}: AppShellProps) {
  const { profile, signOut } = useAuth();
  const { dark, toggle } = useDarkMode();
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<{ id: string; full_name: string; username: string; avatar_url: string }[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadUnread = useCallback(async () => {
    if (!profile) return;
    const { count: msgCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .neq('sender_id', profile.id)
      .is('read_at', null);
    setUnreadMsgs(msgCount || 0);

    const { count: notifCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('read', false)
      .eq('user_id', profile.id);
    setUnreadNotifs(notifCount || 0);
  }, [profile]);

  useEffect(() => {
    loadUnread();
    const interval = setInterval(loadUnread, 15000);
    return () => clearInterval(interval);
  }, [loadUnread]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .or(`full_name.ilike.%${searchQuery}%,username.ilike.%${searchQuery}%`)
        .limit(5);
      setSearchResults(data || []);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (!profile) return null;

  const handleNavClick = (key: PageKey) => {
    onNavigate(key);
    setMobileMenuOpen(false);
  };

  return (
    <div className="h-screen flex flex-col bg-ink-50 dark:bg-ink-950">
      {/* Top bar */}
      <header className="h-14 border-b border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 flex items-center px-4 gap-3 shrink-0 z-30">
        {/* Logo */}
        <button
          onClick={() => handleNavClick('home')}
          className="flex items-center gap-2 shrink-0"
        >
          <div className="w-8 h-8 rounded-lg bg-accent-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <span className="text-base font-bold text-ink-900 dark:text-white hidden sm:block tracking-tight">NEXA</span>
        </button>

        {/* Search */}
        <div className="flex-1 max-w-md mx-auto relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Search people, posts, communities..."
              className="w-full h-9 pl-9 pr-4 bg-ink-100 dark:bg-ink-800 border-0 rounded-lg text-sm text-ink-800 dark:text-ink-100 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-all"
            />
          </div>
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 w-full bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl shadow-lg py-1.5 z-50 animate-slide-down">
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  onMouseDown={() => {
                    if (onViewProfile) onViewProfile(r.id);
                    setSearchQuery('');
                    setSearchOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors text-left"
                >
                  <Avatar name={r.full_name} src={r.avatar_url || undefined} size={32} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100 truncate">{r.full_name}</p>
                    <p className="text-xs text-ink-400 truncate">@{r.username}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1 shrink-0">
          <IconButton onClick={toggle} aria-label="Toggle theme">
            {dark ? <Sun /> : <Moon />}
          </IconButton>
          <button
            onClick={() => handleNavClick('notifications')}
            className="relative p-2 rounded-lg text-ink-500 hover:text-ink-700 hover:bg-ink-100 dark:text-ink-400 dark:hover:text-ink-200 dark:hover:bg-ink-800 transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadNotifs > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
                {compactNumber(unreadNotifs)}
              </span>
            )}
          </button>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 rounded-lg text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar — desktop */}
        <aside className="hidden md:flex flex-col w-60 lg:w-64 border-r border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 shrink-0">
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto scrollbar-thin">
            {navItems.map((item) => {
              const isActive = currentPage === item.key;
              const badge = item.key === 'messages' ? unreadMsgs : item.key === 'notifications' ? unreadNotifs : 0;
              return (
                <button
                  key={item.key}
                  onClick={() => handleNavClick(item.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400'
                      : 'text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800'
                  }`}
                >
                  <item.icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-accent-600 dark:text-accent-400' : ''}`} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {badge > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
                      {compactNumber(badge)}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Bottom section */}
          <div className="p-3 border-t border-ink-100 dark:border-ink-800 space-y-0.5">
            {(profile.role === 'admin' || profile.role === 'moderator') && (
              <button
                onClick={() => handleNavClick('admin')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  currentPage === 'admin'
                    ? 'bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400'
                    : 'text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800'
                }`}
              >
                <Shield className="w-5 h-5" />
                Admin Dashboard
              </button>
            )}
            <button
              onClick={() => handleNavClick('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                currentPage === 'settings'
                  ? 'bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400'
                  : 'text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800'
              }`}
            >
              <Settings className="w-5 h-5" />
              Settings
            </button>
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800 transition-all"
            >
              <HelpCircle className="w-5 h-5" />
              Help
            </button>
            <div className="flex items-center gap-3 px-3 py-2 mt-1">
              <Avatar name={profile.full_name} src={profile.avatar_url || undefined} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-800 dark:text-ink-100 truncate">{profile.full_name}</p>
                <p className="text-xs text-ink-400 truncate">@{profile.username}</p>
              </div>
              <IconButton
                size="sm"
                onClick={signOut}
                aria-label="Sign out"
                className="shrink-0"
              >
                <LogOut />
              </IconButton>
            </div>
          </div>
        </aside>

        {/* Mobile menu overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-ink-950/40 backdrop-blur-sm md:hidden animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
          >
            <aside
              className="absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-ink-900 border-r border-ink-200 dark:border-ink-800 p-4 animate-slide-down"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-accent-600 flex items-center justify-center">
                    <span className="text-white font-bold text-sm">N</span>
                  </div>
                  <span className="text-base font-bold tracking-tight">NEXA</span>
                </div>
                <IconButton onClick={() => setMobileMenuOpen(false)}>
                  <X />
                </IconButton>
              </div>
              <nav className="space-y-0.5">
                {[...navItems, { key: 'settings' as PageKey, label: 'Settings', icon: Settings }, ...((profile.role === 'admin' || profile.role === 'moderator') ? [adminNavItem] : [])].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => handleNavClick(item.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      currentPage === item.key
                        ? 'bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400'
                        : 'text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </button>
                ))}
                <button
                  onClick={() => { signOut(); setMobileMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </button>
              </nav>
            </aside>
          </div>
        )}

        {/* Center content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </main>

        {/* Right panel — desktop only, hidden on some pages */}
        {currentPage !== 'messages' && currentPage !== 'settings' && currentPage !== 'admin' && (
          <aside className="hidden xl:flex flex-col w-72 border-l border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 shrink-0 overflow-y-auto scrollbar-thin">
            <RightPanel onNavigate={onNavigate} />
          </aside>
        )}
      </div>

      {/* Bottom nav — mobile */}
      <nav className="md:hidden h-14 border-t border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 flex items-center justify-around shrink-0 z-30">
        {mobileNavItems.map((item) => {
          const isActive = currentPage === item.key;
          const badge = item.key === 'messages' ? unreadMsgs : 0;
          return (
            <button
              key={item.key}
              onClick={() => handleNavClick(item.key)}
              className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                isActive ? 'text-accent-600 dark:text-accent-400' : 'text-ink-400 dark:text-ink-500'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {badge > 0 && (
                <span className="absolute top-1 right-[28%] min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
                  {compactNumber(badge)}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function RightPanel({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  const { profile } = useAuth();
  const [suggestions, setSuggestions] = useState<{ id: string; full_name: string; username: string; avatar_url: string; bio: string }[]>([]);

  useEffect(() => {
    (async () => {
      if (!profile) return;
      const { data: following } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', profile.id);
      const followingIds = (following || []).map((f) => f.following_id);
      followingIds.push(profile.id);

      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url, bio')
        .not('id', 'in', `(${followingIds.map((id) => `"${id}"`).join(',')})`)
        .limit(3);
      setSuggestions(data || []);
    })();
  }, [profile]);

  return (
    <div className="p-4 space-y-5">
      {/* Suggestions */}
      <div>
        <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-3">Suggestions</h3>
        <div className="space-y-1">
          {suggestions.length === 0 ? (
            <p className="text-sm text-ink-400 py-2">No suggestions yet.</p>
          ) : (
            suggestions.map((user) => (
              <div key={user.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors">
                <Avatar name={user.full_name} src={user.avatar_url || undefined} size={36} />
                <button
                  onClick={() => onNavigate('profile')}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-sm font-medium text-ink-800 dark:text-ink-100 truncate">{user.full_name}</p>
                  <p className="text-xs text-ink-400 truncate">@{user.username}</p>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Trending topics */}
      <div>
        <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-3">Trending</h3>
        <div className="space-y-2.5">
          {['Design Systems', 'Product Launch', 'Web Development', 'Startups', 'AI Tools'].map((topic, i) => (
            <div key={topic} className="cursor-pointer">
              <p className="text-xs text-ink-400">#{i + 1} · Trending</p>
              <p className="text-sm font-medium text-ink-700 dark:text-ink-200">{topic}</p>
              <p className="text-xs text-ink-400">{compactNumber(Math.floor(Math.random() * 9000) + 100)} posts</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-ink-100 dark:border-ink-800">
        <p className="text-xs text-ink-400 leading-relaxed">
          NEXA · About · Privacy · Terms · Help
        </p>
        <p className="text-xs text-ink-300 mt-1">© 2026 NEXA</p>
      </div>
    </div>
  );
}
