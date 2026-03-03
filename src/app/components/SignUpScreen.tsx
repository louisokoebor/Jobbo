import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Eye, EyeOff, Sun, Moon, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

type Theme = 'dark' | 'light';

interface ToastItem {
  id: string;
  type: 'error' | 'success';
  message: string;
  visible: boolean;
}

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: '', color: '#EF4444' };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { score: 1, label: 'Weak', color: '#EF4444' };
  if (score === 2) return { score: 2, label: 'Fair', color: '#F59E0B' };
  if (score === 3) return { score: 3, label: 'Good', color: '#F59E0B' };
  if (score === 4) return { score: 4, label: 'Strong', color: '#10B981' };
  return { score: 5, label: 'Very Strong', color: '#10B981' };
}

/* ─── Google Icon ─────────────────────────────────────────────── */
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

/* ─── Theme Toggle ────────────────────────────────────────────── */
function ThemeToggleButton({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? (isDark ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.06)') : 'none',
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

/* ─── Google OAuth Button ─────────────────────────────────────── */
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
        background: hovered ? (isDark ? 'rgba(26,86,219,0.06)' : 'rgba(26,86,219,0.04)') : (isDark ? '#1E293B' : '#FFFFFF'),
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

/* ─── Or Divider ──────────────────────────────────────────────── */
function OrDivider({ isDark }: { isDark: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <div style={{ flex: 1, height: 1, background: isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.3)' }} />
      <span style={{ fontSize: 12, fontFamily: 'Inter, sans-serif', fontWeight: 400, color: isDark ? '#94A3B8' : '#64748B', flexShrink: 0 }}>or</span>
      <div style={{ flex: 1, height: 1, background: isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.3)' }} />
    </div>
  );
}

/* ─── Input Field ─────────────────────────────────────────────── */
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
}

function InputField({ id, label, type = 'text', value, onChange, placeholder, error, isDark, rightElement, autoComplete }: InputFieldProps) {
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

/* ─── Sign Up Screen ──────────────────────────────────────────── */
export function SignUpScreen() {
  const navigate = useNavigate();

  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('jobbo-theme') as Theme) || 'dark';
    }
    return 'dark';
  });

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [btnPressed, setBtnPressed] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);

  const isDark = theme === 'dark';
  const passwordStrength = getPasswordStrength(password);
  const strengthSegments = 4;
  const filledSegments = Math.ceil((passwordStrength.score / 5) * strengthSegments);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('jobbo-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  const addToast = (type: ToastItem['type'], message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, message, visible: true }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignUp = async () => {
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
      addToast('error', 'Google sign in failed: ' + error.message);
      return;
    }

    if (data?.url) {
      // Manually redirect to the Google auth URL
      // in case Supabase is not auto-redirecting
      window.location.href = data.url;
    } else {
      setGoogleLoading(false);
      addToast('error', 'Could not get Google sign in URL');
    }
  };

  const validateSignUp = () => {
    const e: Record<string, string> = {};
    if (!email.trim()) e.email = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Please enter a valid email address';
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'Password must be at least 8 characters';
    if (!confirmPassword) e.confirmPassword = 'Please confirm your password';
    else if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSignUp = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validateSignUp()) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        addToast('error', error.message);
        return;
      }
      addToast('success', 'Account created! Taking you to onboarding…');
      setTimeout(() => navigate('/onboarding'), 800);
    } finally {
      setIsLoading(false);
    }
  };

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

      {/* Toast container */}
      <div style={{ position: 'fixed', top: 76, right: 20, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              pointerEvents: 'auto',
              background: isDark ? 'rgba(15,23,42,0.93)' : 'rgba(248,250,252,0.95)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
              borderLeft: `3px solid ${toast.type === 'error' ? '#EF4444' : '#10B981'}`,
              borderRadius: 8,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: isDark ? '#F8FAFC' : '#0F172A',
              fontSize: 13,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 400,
              boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(15,23,42,0.08)',
              minWidth: 280,
              maxWidth: 380,
              animation: 'jb-slide-in 0.2s ease-out',
            }}
          >
            {toast.type === 'error'
              ? <AlertCircle size={15} color="#EF4444" style={{ flexShrink: 0 }} />
              : <CheckCircle2 size={15} color="#10B981" style={{ flexShrink: 0 }} />
            }
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

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
          onClick={() => navigate('/login')}
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
        <div
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
              Create your account
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
              Start tailoring CVs in seconds
            </p>
          </div>

          {/* Google OAuth */}
          <GoogleOAuthButton isDark={isDark} onClick={handleGoogleSignUp} loading={googleLoading} />

          {/* Divider */}
          <OrDivider isDark={isDark} />

          {/* Form */}
          <form onSubmit={handleSignUp} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <InputField
              id="signup-email"
              label="Email Address"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              error={errors.email}
              isDark={isDark}
              autoComplete="email"
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <InputField
                id="signup-password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                placeholder="Minimum 8 characters"
                error={errors.password}
                isDark={isDark}
                autoComplete="new-password"
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDark ? '#94A3B8' : '#64748B', padding: 0, display: 'flex', alignItems: 'center', lineHeight: 1 }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />

              {/* Password strength bar */}
              {password.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {Array.from({ length: strengthSegments }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: 3,
                          borderRadius: 99,
                          background: i < filledSegments
                            ? passwordStrength.color
                            : isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)',
                          transition: 'background 0.2s',
                        }}
                      />
                    ))}
                  </div>
                  <p style={{ marginTop: 4, fontSize: 11, fontFamily: 'Inter, sans-serif', fontWeight: 500, color: passwordStrength.color, lineHeight: 1.4, margin: '4px 0 0' }}>
                    {passwordStrength.label}
                  </p>
                </div>
              )}
            </div>

            <InputField
              id="signup-confirm-password"
              label="Confirm Password"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Repeat your password"
              error={errors.confirmPassword}
              isDark={isDark}
              autoComplete="new-password"
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(v => !v)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDark ? '#94A3B8' : '#64748B', padding: 0, display: 'flex', alignItems: 'center', lineHeight: 1 }}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              onMouseDown={() => setBtnPressed(true)}
              onMouseUp={() => setBtnPressed(false)}
              onMouseEnter={() => setBtnHovered(true)}
              onMouseLeave={() => { setBtnPressed(false); setBtnHovered(false); }}
              style={{
                marginTop: 4,
                width: '100%',
                height: 44,
                background: (btnHovered || isLoading) ? '#1E40AF' : '#1A56DB',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                fontFamily: 'Inter, sans-serif',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transform: btnPressed && !isLoading ? 'scale(0.97)' : 'scale(1)',
                transition: 'background 0.15s, transform 0.1s',
                lineHeight: 1,
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} style={{ animation: 'jb-spin 0.8s linear infinite', flexShrink: 0 }} />
                  <span>Creating account…</span>
                </>
              ) : (
                'Create Account'
              )}
            </button>
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
            Already have an account?{' '}
            <button
              onClick={() => navigate('/login')}
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
              Log in
            </button>
          </p>
        </div>
      </main>

      <style>{`
        @keyframes jb-card-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes jb-slide-in {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
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