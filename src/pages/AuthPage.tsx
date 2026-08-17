import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useDarkMode } from '@/lib/useDarkMode';
import { Moon, Sun, ArrowRight, Mail, Lock, User, Phone, KeyRound, CheckCircle2 } from 'lucide-react';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset' | 'phone' | 'otp';

export default function AuthPage() {
  const { signIn, signUp, signInWithGoogle, sendOtp, verifyOtp, resetPassword, updatePassword } = useAuth();
  const { dark, toggle } = useDarkMode();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'reset') {
      setMode('reset');
    }
  }, []);

  function switchMode(m: AuthMode) {
    setMode(m);
    setError('');
    setSuccess('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);

    try {
      if (mode === 'signup') {
        const { error: err } = await signUp(email, password, username, fullName);
        if (err) setError(err);
        else setSuccess('Account created! You are now signed in.');
      } else if (mode === 'signin') {
        const { error: err } = await signIn(email, password);
        if (err) setError(err);
      } else if (mode === 'forgot') {
        const { error: err } = await resetPassword(email);
        if (err) setError(err);
        else setSuccess('Password reset link sent to your email.');
      } else if (mode === 'reset') {
        if (newPassword.length < 6) {
          setError('Password must be at least 6 characters.');
        } else {
          const { error: err } = await updatePassword(newPassword);
          if (err) setError(err);
          else setSuccess('Password updated! You can now sign in.');
        }
      } else if (mode === 'phone') {
        if (!phone.trim()) {
          setError('Enter your phone number.');
        } else {
          const { error: err } = await sendOtp(phone);
          if (err) setError(err);
          else { setSuccess('OTP sent to your phone.'); setMode('otp'); }
        }
      } else if (mode === 'otp') {
        const { error: err } = await verifyOtp(phone, otp);
        if (err) setError(err);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setBusy(false);
  }

  async function handleGoogle() {
    setError('');
    setBusy(true);
    const { error: err } = await signInWithGoogle();
    if (err) { setError(err); setBusy(false); }
  }

  return (
    <div className="min-h-screen flex bg-ink-50 dark:bg-ink-950">
      {/* Left panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 bg-ink-900 text-white relative overflow-hidden">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent-600 flex items-center justify-center">
            <span className="font-bold">N</span>
          </div>
          <span className="text-lg font-bold tracking-tight">NEXA</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl font-bold tracking-tight leading-tight mb-4">
            One platform for everything.
          </h1>
          <p className="text-ink-400 text-lg leading-relaxed">
            Social feed, messaging, communities, and payments — all in one place.
          </p>
          <div className="mt-10 space-y-4">
            {[
              { label: 'Share and connect', desc: 'Posts, stories, and real-time chat' },
              { label: 'Join communities', desc: 'Find your people around any topic' },
              { label: 'Send money instantly', desc: 'Pay friends with bKash, Nagad, and more' },
            ].map((f) => (
              <div key={f.label} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-500 mt-2.5 shrink-0" />
                <div>
                  <p className="font-medium">{f.label}</p>
                  <p className="text-sm text-ink-400">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-ink-500">© 2026 NEXA · All rights reserved</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
        <button
          onClick={toggle}
          className="absolute top-6 right-6 p-2 rounded-lg text-ink-400 hover:text-ink-600 hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors"
        >
          {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl bg-accent-600 flex items-center justify-center">
              <span className="font-bold text-white">N</span>
            </div>
            <span className="text-lg font-bold tracking-tight text-ink-900 dark:text-white">NEXA</span>
          </div>

          <h2 className="text-2xl font-bold text-ink-900 dark:text-white tracking-tight mb-1">
            {mode === 'signin' && 'Welcome back'}
            {mode === 'signup' && 'Create your account'}
            {mode === 'forgot' && 'Reset your password'}
            {mode === 'reset' && 'Set a new password'}
            {mode === 'phone' && 'Sign in with phone'}
            {mode === 'otp' && 'Verify your number'}
          </h2>
          <p className="text-sm text-ink-400 mb-6">
            {mode === 'signin' && 'Sign in to continue to NEXA'}
            {mode === 'signup' && 'Join NEXA in seconds'}
            {mode === 'forgot' && 'Enter your email to receive a reset link'}
            {mode === 'reset' && 'Enter your new password below'}
            {mode === 'phone' && 'Enter your phone number to receive an OTP'}
            {mode === 'otp' && `Enter the code sent to ${phone}`}
          </p>

          {(mode === 'signin' || mode === 'signup') && (
            <>
              {/* Google sign-in */}
              <button
                onClick={handleGoogle}
                disabled={busy}
                className="w-full h-11 flex items-center justify-center gap-3 border border-ink-200 dark:border-ink-700 rounded-xl text-sm font-medium text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-800 transition-all disabled:opacity-50 mb-4"
              >
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-ink-200 dark:bg-ink-700" />
                <span className="text-xs text-ink-400">or</span>
                <div className="flex-1 h-px bg-ink-200 dark:bg-ink-700" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <InputField icon={<User className="w-4 h-4" />} label="Username" value={username} onChange={setUsername} placeholder="johndoe" />
                <InputField icon={<User className="w-4 h-4" />} label="Full Name" value={fullName} onChange={setFullName} placeholder="John Doe" />
              </>
            )}

            {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && (
              <InputField icon={<Mail className="w-4 h-4" />} label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
            )}

            {(mode === 'signin' || mode === 'signup') && (
              <InputField icon={<Lock className="w-4 h-4" />} label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" />
            )}

            {mode === 'reset' && (
              <InputField icon={<Lock className="w-4 h-4" />} label="New Password" type="password" value={newPassword} onChange={setNewPassword} placeholder="At least 6 characters" />
            )}

            {mode === 'phone' && (
              <InputField icon={<Phone className="w-4 h-4" />} label="Phone Number" type="tel" value={phone} onChange={setPhone} placeholder="+8801XXXXXXXXX" />
            )}

            {mode === 'otp' && (
              <>
                <InputField icon={<KeyRound className="w-4 h-4" />} label="OTP Code" value={otp} onChange={setOtp} placeholder="6-digit code" />
                <button type="button" onClick={() => switchMode('phone')} className="text-xs text-accent-600 dark:text-accent-400 hover:underline">
                  Change phone number
                </button>
              </>
            )}

            {error && (
              <div className="text-sm text-rose-500 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 rounded-lg px-3.5 py-2.5">
                {error}
              </div>
            )}

            {success && (
              <div className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-lg px-3.5 py-2.5 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full h-11 bg-accent-600 text-white font-medium rounded-xl hover:bg-accent-700 active:bg-accent-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {busy ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <>
                  {mode === 'signin' && 'Sign In'}
                  {mode === 'signup' && 'Create Account'}
                  {mode === 'forgot' && 'Send Reset Link'}
                  {mode === 'reset' && 'Update Password'}
                  {mode === 'phone' && 'Send OTP'}
                  {mode === 'otp' && 'Verify & Sign In'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Mode switcher links */}
          <div className="mt-6 space-y-2 text-center">
            {mode === 'signin' && (
              <>
                <button onClick={() => switchMode('signup')} className="text-sm text-accent-600 dark:text-accent-400 hover:underline">
                  Don't have an account? Sign up
                </button>
                <div>
                  <button onClick={() => switchMode('forgot')} className="text-sm text-ink-400 hover:text-ink-600 dark:hover:text-ink-200">
                    Forgot password?
                  </button>
                </div>
                <div>
                  <button onClick={() => switchMode('phone')} className="text-sm text-ink-400 hover:text-ink-600 dark:hover:text-ink-200">
                    Sign in with phone instead
                  </button>
                </div>
              </>
            )}
            {mode === 'signup' && (
              <button onClick={() => switchMode('signin')} className="text-sm text-accent-600 dark:text-accent-400 hover:underline">
                Already have an account? Sign in
              </button>
            )}
            {mode === 'forgot' && (
              <button onClick={() => switchMode('signin')} className="text-sm text-accent-600 dark:text-accent-400 hover:underline">
                Back to sign in
              </button>
            )}
            {mode === 'reset' && !success && (
              <button onClick={() => switchMode('signin')} className="text-sm text-accent-600 dark:text-accent-400 hover:underline">
                Back to sign in
              </button>
            )}
            {mode === 'reset' && success && (
              <button onClick={() => switchMode('signin')} className="text-sm text-accent-600 dark:text-accent-400 hover:underline">
                Go to sign in
              </button>
            )}
            {mode === 'phone' && (
              <button onClick={() => switchMode('signin')} className="text-sm text-accent-600 dark:text-accent-400 hover:underline">
                Use email instead
              </button>
            )}
          </div>

          <p className="text-xs text-ink-400 text-center mt-6">
            By continuing, you agree to NEXA's Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}

function InputField({ icon, label, value, onChange, placeholder, type = 'text' }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">{label}</label>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="w-full h-11 pl-10 pr-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-xl text-sm text-ink-900 dark:text-white placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-transparent transition-all"
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
