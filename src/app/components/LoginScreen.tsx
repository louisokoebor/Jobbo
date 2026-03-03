/**
 * LoginScreen.tsx — Jobbo
 *
 * PROTECTED ROUTE NOTES:
 * - After logout or session expiry, middleware redirects any /dashboard (or other
 *   protected route) attempt here, storing the originally requested URL in
 *   sessionStorage key "jobbo-redirect-after-login".
 * - On successful login this screen reads that key, clears it, and navigates to
 *   the stored URL (falling back to /dashboard).
 * - A session check (e.g. Supabase getSession) should run on mount; if a valid
 *   session already exists, navigate immediately to /dashboard.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Eye, EyeOff, Sun, Moon,
  AlertCircle, CheckCircle2, Loader2, ArrowLeft,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

/* ─── Types ──────────────────────────────────────────────────── */
type Theme = 'dark' | 'light';
type CardState = 'login' | 'forgot' | 'forgot-success';

/* ─── Shared sub-components ─────────────────────────────────── */

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function ThemeToggleButton({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? isDark ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.06)'
          : 'none',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        color: isDark ? '#94A3B8' : '#64748B',
        padding: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.15s, color 0.15s',
        lineHeight: 1,
      }}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function GoogleOAuthButton({ isDark, onClick, loading = false }: { isDark: boolean; onClick: () => void; loading?: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        height: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        background: hovered
          ? isDark ? 'rgba(26,86,219,0.06)' : 'rgba(26,86,219,0.04)'
          : isDark ? '#1E293B' : '#FFFFFF',
        border: `1px solid ${hovered ? '#1A56DB' : isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.3)'}`,
        borderRadius: 8,
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: 14,
        fontWeight: 500,
        fontFamily: 'Inter, sans-serif',
        color: isDark ? '#F8FAFC' : '#0F172A',
        transition: 'background 0.15s, border-color 0.15s',
        marginBottom: 20,
        lineHeight: 1,
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? (
        <>
          <Loader2 size={16} style={{ animation: 'jb-spin 0.8s linear infinite', flexShrink: 0 }} />
          <span>Connecting to Google…</span>
        </>
      ) : (
        <>
          <GoogleIcon />
          Continue with Google
        </>
      )}
    </button>
  );
}

function OrDivider({ isDark }: { isDark: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <div style={{ flex: 1, height: 1, background: isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.3)' }} />
      <span style={{ fontSize: 12, fontFamily: 'Inter, sans-serif', fontWeight: 400, color: isDark ? '#94A3B8' : '#64748B', flexShrink: 0 }}>or</span>
      <div style={{ flex: 1, height: 1, background: isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.3)' }} />
    </div>
  );
}

interface InputFieldProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  isDark: boolean;
  rightElement?: React.ReactNode;
  autoComplete?: string;
  autoFocus?: boolean;
}

function InputField({ id, label, type = 'text', value, onChange, placeholder, error, isDark, rightElement, autoComplete, autoFocus }: InputFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <label
        htmlFor={id}
        style={{
          fontSize: 11,
          fontWeight: 500,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: isDark ? '#94A3B8' : '#64748B',
          lineHeight: 1.4,
        }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%',
            height: 44,
            padding: rightElement ? '0 44px 0 14px' : '0 14px',
            background: isDark ? '#1E293B' : '#FFFFFF',
            border: error
              ? '1px solid #EF4444'
              : focused
              ? '1px solid #1A56DB'
              : `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'}`,
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 400,
            fontFamily: 'Inter, sans-serif',
            color: isDark ? '#F8FAFC' : '#0F172A',
            outline: 'none',
            boxShadow: error
              ? '0 0 0 3px rgba(239,68,68,0.15)'
              : focused
              ? '0 0 0 3px rgba(26,86,219,0.25)'
              : 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            boxSizing: 'border-box',
          }}
        />
        {rightElement && (
          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
            {rightElement}
          </div>
        )}
      </div>
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#EF4444', fontSize: 12, fontFamily: 'Inter, sans-serif', fontWeight: 400, lineHeight: 1.4 }}>
          <AlertCircle size={12} style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}
    </div>
  );
}

interface PrimaryButtonProps {
  type?: 'submit' | 'button';
  disabled?: boolean;
  isLoading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}

function PrimaryButton({ type = 'submit', disabled, isLoading, loadingText, children, onClick, style: extraStyle }: PrimaryButtonProps) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setPressed(false); setHovered(false); }}
      style={{
        width: '100%',
        height: 44,
        background: hovered || isLoading ? '#1E40AF' : '#1A56DB',
        color: '#FFFFFF',
        border: 'none',
        borderRadius: 8,
        fontSize: 15,
        fontWeight: 600,
        fontFamily: 'Inter, sans-serif',
        cursor: (disabled || isLoading) ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        transform: pressed && !isLoading ? 'scale(0.97)' : 'scale(1)',
        transition: 'background 0.15s, transform 0.1s',
        lineHeight: 1,
        ...extraStyle,
      }}
    >
      {isLoading ? (
        <>
          <Loader2 size={16} style={{ animation: 'jb-spin 0.8s linear infinite', flexShrink: 0 }} />
          <span>{loadingText ?? 'Loading…'}</span>
        </>
      ) : children}
    </button>
  );
}

function GhostLinkButton({
  onClick, children, isDark, centered = false, icon,
}: {
  onClick: () => void;
  children: React.ReactNode;
  isDark: boolean;
  centered?: boolean;
  icon?: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'none',
        border: 'none',
        padding: '6px 0',
        cursor: 'pointer',
        color: hovered ? (isDark ? '#F8FAFC' : '#0F172A') : (isDark ? '#94A3B8' : '#64748B'),
        fontSize: 13,
        fontWeight: 500,
        fontFamily: 'Inter, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: centered ? 'center' : 'flex-start',
        gap: 6,
        width: centered ? '100%' : 'auto',
        transition: 'color 0.15s',
        lineHeight: 1,
        textDecoration: hovered ? 'underline' : 'none',
      }}
    >
      {icon}
      {children}
    </button>
  );
}

/* ─── Error Banner ───────────────────────────────────────────── */
function ErrorBanner({ message, isDark }: { message: string; isDark: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 14px',
        background: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.06)',
        border: `1px solid rgba(239,68,68,${isDark ? '0.3' : '0.2'})`,
        borderRadius: 8,
        marginBottom: 20,
        animation: 'jb-fade-in 0.2s ease-out',
      }}
    >
      <AlertCircle size={15} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ margin: 0, fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: '#EF4444', lineHeight: 1.5 }}>
        {message}
      </p>
    </div>
  );
}

/* ─── Forgot Password Success ────────────────────────────────── */
function ForgotSuccess({ email, isDark, onBack }: { email: string; isDark: boolean; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '8px 0', animation: 'jb-card-in 0.3s ease-out' }}>
      {/* Green check circle */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'rgba(16,185,129,0.12)',
          border: '1.5px solid rgba(16,185,129,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        }}
      >
        <CheckCircle2 size={30} color="#10B981" strokeWidth={1.75} />
      </div>

      <h2
        style={{
          fontSize: 22,
          fontWeight: 600,
          fontFamily: 'Inter, sans-serif',
          color: isDark ? '#F8FAFC' : '#0F172A',
          margin: '0 0 10px',
          lineHeight: 1.3,
        }}
      >
        Check your email
      </h2>
      <p
        style={{
          fontSize: 14,
          fontWeight: 400,
          fontFamily: 'Inter, sans-serif',
          color: isDark ? '#94A3B8' : '#64748B',
          margin: '0 0 8px',
          lineHeight: 1.6,
          maxWidth: 300,
        }}
      >
        We sent a password reset link to
      </p>
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          fontFamily: 'Inter, sans-serif',
          color: isDark ? '#F8FAFC' : '#0F172A',
          margin: '0 0 32px',
          wordBreak: 'break-all',
        }}
      >
        {email}
      </p>

      <p
        style={{
          fontSize: 13,
          fontWeight: 400,
          fontFamily: 'Inter, sans-serif',
          color: isDark ? '#94A3B8' : '#64748B',
          margin: '0 0 24px',
          lineHeight: 1.5,
        }}
      >
        Didn't receive it? Check your spam folder or{' '}
        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: '#1A56DB',
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'Inter, sans-serif',
            display: 'inline',
            textDecoration: 'underline',
          }}
        >
          try again
        </button>
        .
      </p>

      <GhostLinkButton onClick={onBack} isDark={isDark} centered icon={<ArrowLeft size={14} />}>
        Back to sign in
      </GhostLinkButton>
    </div>
  );
}

/* ─── Main Screen ────────────────────────────────────────────── */
export function LoginScreen() {
  const navigate = useNavigate();

  /* Theme */
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('jobbo-theme') as Theme) || 'dark';
    }
    return 'dark';
  });

  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('jobbo-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  /* Card state */
  const [cardState, setCardState] = useState<CardState>('login');
  const [cardKey, setCardKey] = useState(0);

  const transitionTo = (next: CardState) => {
    setCardState(next);
    setCardKey(k => k + 1);
  };

  /* Form – login */
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});
  const [credentialError, setCredentialError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  /* Form – forgot password */
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotErrors, setForgotErrors] = useState<Record<string, string>>({});
  const [forgotLoading, setForgotLoading] = useState(false);
  const [sentToEmail, setSentToEmail] = useState('');

  /* ── Handlers ── */
  const handleGoogleLogin = async () => {
    setGoogleLoading(true);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
        skipBrowserRedirect: false,
      },
    });

    console.log('signInWithOAuth data:', data);
    console.log('signInWithOAuth error:', error);

    if (error) {
      console.error('Google OAuth error:', error);
      setGoogleLoading(false);
      alert('Google sign in failed: ' + error.message);
      return;
    }

    if (data?.url) {
      // Manually redirect to the Google auth URL
      // in case Supabase is not auto-redirecting
      window.location.href = data.url;
    } else {
      setGoogleLoading(false);
      alert('Could not get Google sign in URL');
    }
  };

  const validateLogin = () => {
    const e: Record<string, string> = {};
    if (!loginEmail.trim()) e.loginEmail = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) e.loginEmail = 'Please enter a valid email address';
    if (!loginPassword) e.loginPassword = 'Password is required';
    setLoginErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setCredentialError('');
    if (!validateLogin()) return;

    setLoginLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        setCredentialError('Invalid email or password. Please try again.');
        return;
      }

      const redirect = sessionStorage.getItem('jobbo-redirect-after-login') || '/dashboard';
      sessionStorage.removeItem('jobbo-redirect-after-login');
      navigate(redirect);
    } finally {
      setLoginLoading(false);
    }
  };

  const validateForgot = () => {
    const e: Record<string, string> = {};
    if (!forgotEmail.trim()) e.forgotEmail = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) e.forgotEmail = 'Please enter a valid email address';
    setForgotErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleForgot = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validateForgot()) return;
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail);
      if (error) {
        setForgotErrors({ forgotEmail: error.message });
        return;
      }
      setSentToEmail(forgotEmail);
      transitionTo('forgot-success');
    } finally {
      setForgotLoading(false);
    }
  };

  const goToLogin = () => {
    setCredentialError('');
    setLoginErrors({});
    setForgotErrors({});
    transitionTo('login');
  };

  /* ── Render ── */
  return (
    <div
      style={{
        fontFamily: 'Inter, sans-serif',
        minHeight: '100vh',
        background: isDark
          ? 'radial-gradient(ellipse at 50% 40%, #1E293B 0%, #0F172A 65%)'
          : 'radial-gradient(ellipse at 50% 40%, #EFF6FF 0%, #F1F5F9 65%)',
        color: isDark ? '#F8FAFC' : '#0F172A',
        transition: 'background 0.2s, color 0.2s',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Noise texture */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          opacity: 0.035,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '300px 300px',
        }}
      />

      {/* Navbar */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          height: 60,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: isDark ? 'rgba(30,41,59,0.6)' : 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
          transition: 'background 0.2s, border-color 0.2s',
        }}
      >
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: 20,
            fontWeight: 700,
            fontFamily: 'Inter, sans-serif',
            color: '#1A56DB',
            letterSpacing: '-0.025em',
            userSelect: 'none',
            lineHeight: 1,
          }}
        >
          Jobbo
        </button>
        <ThemeToggleButton isDark={isDark} onToggle={toggleTheme} />
      </nav>

      {/* Main */}
      <main
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 60px)',
          padding: '32px 16px 48px',
        }}
      >
        {/* Glass card */}
        <div
          key={cardKey}
          style={{
            width: '100%',
            maxWidth: 440,
            background: isDark ? 'rgba(30,41,59,0.6)' : 'rgba(255,255,255,0.6)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
            borderRadius: 12,
            boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(15,23,42,0.08)',
            padding: 40,
            animation: 'jb-card-in 0.3s ease-out',
          }}
        >

          {/* ── State: LOGIN ── */}
          {cardState === 'login' && (
            <>
              {/* Header */}
              <div style={{ marginBottom: 28 }}>
                <h1
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    fontFamily: 'Inter, sans-serif',
                    color: isDark ? '#F8FAFC' : '#0F172A',
                    margin: '0 0 6px',
                    lineHeight: 1.3,
                  }}
                >
                  Welcome back
                </h1>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 400,
                    fontFamily: 'Inter, sans-serif',
                    color: isDark ? '#94A3B8' : '#64748B',
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Sign in to your Jobbo account
                </p>
              </div>

              {/* Google OAuth */}
              <GoogleOAuthButton isDark={isDark} onClick={handleGoogleLogin} loading={googleLoading} />

              {/* Divider */}
              <OrDivider isDark={isDark} />

              {/* Credential error banner */}
              {credentialError && (
                <ErrorBanner message={credentialError} isDark={isDark} />
              )}

              {/* Login form */}
              <form onSubmit={handleLogin} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <InputField
                  id="login-email"
                  label="Email Address"
                  type="email"
                  value={loginEmail}
                  onChange={v => { setLoginEmail(v); setCredentialError(''); }}
                  placeholder="you@example.com"
                  error={loginErrors.loginEmail}
                  isDark={isDark}
                  autoComplete="email"
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <InputField
                    id="login-password"
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={v => { setLoginPassword(v); setCredentialError(''); }}
                    placeholder="Your password"
                    error={loginErrors.loginPassword}
                    isDark={isDark}
                    autoComplete="current-password"
                    rightElement={
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: isDark ? '#94A3B8' : '#64748B',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          lineHeight: 1,
                        }}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    }
                  />

                  {/* Forgot password link */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => transitionTo('forgot')}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: '#1A56DB',
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: 'Inter, sans-serif',
                        lineHeight: 1,
                        textDecoration: 'none',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                    >
                      Forgot your password?
                    </button>
                  </div>
                </div>

                {/* CTA */}
                <PrimaryButton
                  type="submit"
                  isLoading={loginLoading}
                  loadingText="Signing in…"
                  style={{ marginTop: 4 }}
                >
                  Sign In
                </PrimaryButton>
              </form>

              {/* Footer */}
              <p
                style={{
                  marginTop: 24,
                  textAlign: 'center',
                  fontSize: 14,
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 400,
                  color: isDark ? '#94A3B8' : '#64748B',
                  margin: '24px 0 0',
                  lineHeight: 1.5,
                }}
              >
                Don't have an account?{' '}
                <button
                  onClick={() => navigate('/signup')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: '#1A56DB',
                    fontSize: 14,
                    fontWeight: 500,
                    fontFamily: 'Inter, sans-serif',
                    lineHeight: 1,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                >
                  Sign up free
                </button>
              </p>
            </>
          )}

          {/* ── State: FORGOT PASSWORD ── */}
          {cardState === 'forgot' && (
            <>
              {/* Back + Header */}
              <div style={{ marginBottom: 28 }}>
                <button
                  type="button"
                  onClick={goToLogin}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'none',
                    border: 'none',
                    padding: '0 0 16px',
                    cursor: 'pointer',
                    color: isDark ? '#94A3B8' : '#64748B',
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: 'Inter, sans-serif',
                    lineHeight: 1,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = isDark ? '#F8FAFC' : '#0F172A')}
                  onMouseLeave={e => (e.currentTarget.style.color = isDark ? '#94A3B8' : '#64748B')}
                >
                  <ArrowLeft size={14} />
                  Back to sign in
                </button>

                <h1
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    fontFamily: 'Inter, sans-serif',
                    color: isDark ? '#F8FAFC' : '#0F172A',
                    margin: '0 0 6px',
                    lineHeight: 1.3,
                  }}
                >
                  Reset your password
                </h1>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 400,
                    fontFamily: 'Inter, sans-serif',
                    color: isDark ? '#94A3B8' : '#64748B',
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Enter your email and we'll send a reset link
                </p>
              </div>

              <form onSubmit={handleForgot} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <InputField
                  id="forgot-email"
                  label="Email Address"
                  type="email"
                  value={forgotEmail}
                  onChange={setForgotEmail}
                  placeholder="you@example.com"
                  error={forgotErrors.forgotEmail}
                  isDark={isDark}
                  autoComplete="email"
                  autoFocus
                />

                <PrimaryButton
                  type="submit"
                  isLoading={forgotLoading}
                  loadingText="Sending link…"
                  style={{ marginTop: 4 }}
                >
                  Send Reset Link
                </PrimaryButton>
              </form>

              {/* Ghost back link */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
                <GhostLinkButton onClick={goToLogin} isDark={isDark} centered icon={<ArrowLeft size={14} />}>
                  Back to sign in
                </GhostLinkButton>
              </div>
            </>
          )}

          {/* ── State: FORGOT SUCCESS ── */}
          {cardState === 'forgot-success' && (
            <ForgotSuccess
              email={sentToEmail}
              isDark={isDark}
              onBack={() => transitionTo('forgot')}
            />
          )}

        </div>
      </main>

      {/* Global keyframes */}
      <style>{`
        @keyframes jb-card-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes jb-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes jb-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        * { box-sizing: border-box; }
        input::placeholder { opacity: 0.55; }
      `}</style>
    </div>
  );
}