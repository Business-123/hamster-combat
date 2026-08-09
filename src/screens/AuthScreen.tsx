import React, { useState } from 'react';
import { kombatHamsterHero } from '../images';
import { login, signup, forgotPassword, resetPassword } from '../auth';
import { GameState } from '../api';
import InstallAppButton from '../components/InstallAppButton';

type Mode = 'login' | 'signup' | 'forgot';

type Props = {
  onAuthenticated: (info: { email: string; name: string; state: GameState }) => void;
  // Present when the page was opened from a "reset your password" email
  // link (?resetToken=...) — swaps the whole screen to a "set new password"
  // form instead of the normal login/signup tabs.
  resetToken?: string | null;
};

const EyeIcon: React.FC<{ open: boolean }> = ({ open }) =>
  open ? (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 3l18 18M10.6 10.7a3 3 0 0 0 4.24 4.24M9.4 5.5A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-3.4 4.15M6.3 6.4C4 8 2 12 2 12a13.3 13.3 0 0 0 4.24 4.6A10.9 10.9 0 0 0 12 19c1 0 1.96-.13 2.85-.38"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

// Very light strength signal — length + character variety. Purely a visual
// nudge for the signup form, not enforced server-side beyond the 8-char minimum.
function passwordStrength(password: string): { label: string; score: number; color: string } {
  if (!password) return { label: '', score: 0, color: 'transparent' };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[0-9]/.test(password) && /[a-zA-Z]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  const levels = [
    { label: 'Too short', color: '#e5484d' },
    { label: 'Weak', color: '#e5484d' },
    { label: 'Okay', color: '#f3ba2f' },
    { label: 'Good', color: '#3dd68c' },
    { label: 'Strong', color: '#3dd68c' },
  ];
  return { ...levels[score], score };
}

const AuthScreen: React.FC<Props> = ({ onAuthenticated, resetToken }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Forgot password" request form.
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // "Set a new password" form, shown instead of everything else when the
  // screen was opened from an emailed reset link.
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetDone, setResetDone] = useState(false);

  const isSignup = mode === 'signup';
  const strength = passwordStrength(password);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setShowPassword(false);
    setShowConfirm(false);
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = forgotEmail.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setSubmitting(true);
    try {
      await forgotPassword(trimmed);
      setForgotSent(true);
    } catch {
      // forgotPassword() intentionally never throws for a not-found email —
      // this only fires on a genuine network error.
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(resetToken as string, newPassword);
      setResetDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (isSignup && password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (isSignup && fullName.trim().length < 2) {
      setError('Enter your full name');
      return;
    }
    if (isSignup && phone.trim() && phone.trim().length < 6) {
      setError('Enter a valid phone number, or leave it blank');
      return;
    }

    setSubmitting(true);
    try {
      const result = isSignup
        ? await signup(trimmedEmail, password, fullName.trim(), phone.trim() || undefined)
        : await login(trimmedEmail, password);
      onAuthenticated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="relative w-full min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden bg-black">
      {/* Hero background */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-110"
        style={{ backgroundImage: `url(${kombatHamsterHero})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-black" />
      <div className="absolute inset-0 bg-black/20" />
      <InstallAppButton variant="pill" className="fixed top-4 right-4 z-[60]" />
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );

  const header = (subtitle: string) => (
    <div className="flex flex-col items-center mb-6">
      <div className="mb-4 rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/60 w-40">
        <img src={kombatHamsterHero} alt="Kombat Hamster" className="w-full h-full object-cover" />
      </div>
      <h1 className="relative text-3xl font-extrabold tracking-wide text-center px-4 py-1">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-2xl bg-black/55 backdrop-blur-sm -z-10"
        />
        <span
          className="text-white"
          style={{ textShadow: '0 0 14px rgba(0,0,0,0.9), 0 0 28px rgba(0,0,0,0.7), 0 2px 4px rgba(0,0,0,0.9)' }}
        >
          KOMBAT
        </span>{' '}
        <span
          className="text-[#f3ba2f]"
          style={{ textShadow: '0 0 18px rgba(243,186,47,0.85), 0 2px 4px rgba(0,0,0,0.9)' }}
        >
          HAMSTER
        </span>
      </h1>
      <p className="text-xs text-[#c9c6c1] mt-1 text-center">{subtitle}</p>
    </div>
  );

  // Opened from an emailed reset link — show only the "set a new password"
  // form (or a confirmation once it's done), never the login/signup tabs.
  if (resetToken) {
    if (resetDone) {
      return shell(
        <>
          {header('Your password has been reset')}
          <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl shadow-black/50 text-center space-y-3">
            <p className="text-sm text-[#c9c6c1]">You can now log in with your new password.</p>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/';
              }}
              className="w-full bg-[#f3ba2f] text-black text-sm font-bold rounded-xl py-2.5"
            >
              Go to log in
            </button>
          </div>
        </>
      );
    }
    return shell(
      <>
        {header('Choose a new password')}
        <form
          onSubmit={handleResetSubmit}
          className="space-y-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl shadow-black/50"
        >
          <div>
            <label className="text-[11px] text-[#85827d] mb-1 block">New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#1c1f24] text-sm rounded-lg px-3 py-2.5 text-white placeholder-[#85827d] outline-none focus:ring-2 focus:ring-[#f3ba2f]"
            />
          </div>
          <div>
            <label className="text-[11px] text-[#85827d] mb-1 block">Confirm new password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#1c1f24] text-sm rounded-lg px-3 py-2.5 text-white placeholder-[#85827d] outline-none focus:ring-2 focus:ring-[#f3ba2f]"
            />
          </div>
          {error && <p className="text-xs text-[#e5484d] text-center">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#f3ba2f] text-black text-sm font-bold rounded-xl py-2.5 mt-2 disabled:opacity-50"
          >
            {submitting ? 'Please wait...' : 'Reset password'}
          </button>
        </form>
      </>
    );
  }

  // "Forgot password?" request form — swaps in for the login/signup tabs.
  if (mode === 'forgot') {
    return shell(
      <>
        {header('Reset your password')}
        {forgotSent ? (
          <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl shadow-black/50 text-center space-y-3">
            <p className="text-sm text-[#c9c6c1]">
              If an account exists for <span className="text-white">{forgotEmail.trim()}</span>, we've sent a link to
              reset the password. Check your inbox.
            </p>
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full bg-[#f3ba2f] text-black text-sm font-bold rounded-xl py-2.5"
            >
              Back to log in
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleForgotSubmit}
            className="space-y-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl shadow-black/50"
          >
            <div>
              <label className="text-[11px] text-[#85827d] mb-1 block">Email</label>
              <input
                type="email"
                autoComplete="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#1c1f24] text-sm rounded-lg px-3 py-2.5 text-white placeholder-[#85827d] outline-none focus:ring-2 focus:ring-[#f3ba2f]"
              />
            </div>
            {error && <p className="text-xs text-[#e5484d] text-center">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#f3ba2f] text-black text-sm font-bold rounded-xl py-2.5 mt-2 disabled:opacity-50"
            >
              {submitting ? 'Please wait...' : 'Send reset link'}
            </button>
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full text-center text-[11px] text-[#85827d] underline underline-offset-2"
            >
              Back to log in
            </button>
          </form>
        )}
      </>
    );
  }

  return shell(
    <>
      {header(isSignup ? 'Create an account to save your progress' : 'Log in to continue mining')}

      <div className="flex bg-[#1c1f24]/90 backdrop-blur rounded-xl p-1 mb-5 border border-white/5">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 text-xs font-bold rounded-lg py-2 transition-colors ${
              mode === 'login' ? 'bg-[#f3ba2f] text-black' : 'text-[#85827d]'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`flex-1 text-xs font-bold rounded-lg py-2 transition-colors ${
              mode === 'signup' ? 'bg-[#f3ba2f] text-black' : 'text-[#85827d]'
            }`}
          >
            Sign up
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl shadow-black/50"
        >
          {isSignup && (
            <div>
              <label className="text-[11px] text-[#85827d] mb-1 block">Full name</label>
              <input
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Kwame Mensah"
                className="w-full bg-[#1c1f24] text-sm rounded-lg px-3 py-2.5 text-white placeholder-[#85827d] outline-none focus:ring-2 focus:ring-[#f3ba2f]"
              />
            </div>
          )}

          {isSignup && (
            <div>
              <label className="text-[11px] text-[#85827d] mb-1 block">Phone number (optional)</label>
              <input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+233 20 000 0000"
                className="w-full bg-[#1c1f24] text-sm rounded-lg px-3 py-2.5 text-white placeholder-[#85827d] outline-none focus:ring-2 focus:ring-[#f3ba2f]"
              />
            </div>
          )}

          <div>
            <label className="text-[11px] text-[#85827d] mb-1 block">Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-[#1c1f24] text-sm rounded-lg px-3 py-2.5 text-white placeholder-[#85827d] outline-none focus:ring-2 focus:ring-[#f3ba2f]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-[#85827d] block">Password</label>
              {!isSignup && (
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email);
                    setForgotSent(false);
                    switchMode('forgot');
                  }}
                  className="text-[11px] text-[#85827d] underline underline-offset-2 hover:text-white transition-colors"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#1c1f24] text-sm rounded-lg pl-3 pr-10 py-2.5 text-white placeholder-[#85827d] outline-none focus:ring-2 focus:ring-[#f3ba2f]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-0 top-0 h-full w-10 flex items-center justify-center text-[#85827d] hover:text-white transition-colors"
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
            {isSignup && password.length > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1 bg-[#1c1f24] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(strength.score / 4) * 100}%`, backgroundColor: strength.color }}
                  />
                </div>
                <span className="text-[10px] text-[#85827d]">{strength.label}</span>
              </div>
            )}
          </div>

          {isSignup && (
            <div>
              <label className="text-[11px] text-[#85827d] mb-1 block">Confirm password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#1c1f24] text-sm rounded-lg pl-3 pr-10 py-2.5 text-white placeholder-[#85827d] outline-none focus:ring-2 focus:ring-[#f3ba2f]"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  className="absolute right-0 top-0 h-full w-10 flex items-center justify-center text-[#85827d] hover:text-white transition-colors"
                >
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-[#e5484d] text-center">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#f3ba2f] text-black text-sm font-bold rounded-xl py-2.5 mt-2 disabled:opacity-50"
          >
            {submitting ? 'Please wait...' : isSignup ? 'Create account' : 'Log in'}
          </button>
        </form>
    </>
  );
};

export default AuthScreen;
