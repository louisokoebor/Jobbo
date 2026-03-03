import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../lib/supabaseClient';


/**
 * AuthCallback
 *
 * Flow:
 * 1. main.tsx captures ?code= into sessionStorage BEFORE Supabase can strip it
 * 2. supabaseClient has detectSessionInUrl: false so it never touches the URL
 * 3. This component reads the code from sessionStorage and exchanges it
 * 4. Routes to /onboarding (new user) or /dashboard (returning user)
 */
export function AuthCallback() {
  const navigate = useNavigate();
  const didRun = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invoke
    if (didRun.current) return;
    didRun.current = true;

    let cancelled = false;

    async function run() {
      // ── Read code from sessionStorage (set in main.tsx) ───────────────
      const code = sessionStorage.getItem('jobbo_oauth_code');

      console.log('[AuthCallback] code from sessionStorage:', code ? `${code.slice(0, 20)}...` : 'MISSING');

      if (!code) {
        // No code — check if there's already a valid session
        // (e.g. user navigated here directly, or session persisted)
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          console.log('[AuthCallback] no code but existing session found — routing');
          sessionStorage.removeItem('jobbo_oauth_code');
          await routeUser(session.user.id, navigate);
          return;
        }

        console.error('[AuthCallback] no code in sessionStorage and no session — redirecting to login');
        console.error('[AuthCallback] this means main.tsx did not capture the code');
        console.error('[AuthCallback] → check that the code capture block is at the very top of main.tsx, before any imports');
        navigate('/login', { replace: true });
        return;
      }

      // ── Exchange the code for a session ───────────────────────────────
      console.log('[AuthCallback] exchanging code...');

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      // Always clear the code — it can only be used once
      sessionStorage.removeItem('jobbo_oauth_code');

      if (cancelled) return;

      if (error) {
        console.error('[AuthCallback] exchangeCodeForSession error:', error.message);

        // "invalid_grant" means the code was already used (e.g. page refresh)
        // Check if a session already exists from a previous successful exchange
        if (error.message.includes('invalid') || error.message.includes('expired')) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            console.log('[AuthCallback] code already used, but session exists — routing');
            await routeUser(session.user.id, navigate);
            return;
          }
        }

        navigate('/login', { replace: true });
        return;
      }

      if (!data?.session?.user) {
        console.error('[AuthCallback] exchange returned no session');
        navigate('/login', { replace: true });
        return;
      }

      console.log('[AuthCallback] exchange succeeded:', data.session.user.email);
      await routeUser(data.session.user.id, navigate);
    }

    run();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      background: 'var(--background, #0F172A)',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: '3px solid rgba(26,86,219,0.15)',
        borderTopColor: '#1A56DB',
        animation: 'spin 0.75s linear infinite',
      }} />
      <p style={{ color: 'var(--text-secondary, #94A3B8)', fontSize: 15, margin: 0 }}>
        Signing you in…
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Route new vs returning users ─────────────────────────────────────────────
async function routeUser(userId: string, navigate: ReturnType<typeof useNavigate>) {
  try {
    const { data: cvProfiles, error } = await supabase
      .from('cv_profiles')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (error) {
      // RLS error = handle_new_user trigger hasn't created public.users row yet
      console.warn('[AuthCallback] cv_profiles query failed:', error.message);
      console.warn('[AuthCallback] → run handle_new_user_trigger.sql in Supabase SQL editor');
      navigate('/onboarding', { replace: true });
      return;
    }

    const dest = (cvProfiles?.length ?? 0) > 0 ? '/dashboard' : '/onboarding';
    console.log('[AuthCallback] routing to:', dest);
    navigate(dest, { replace: true });
  } catch (err) {
    console.error('[AuthCallback] routeUser error:', err);
    navigate('/onboarding', { replace: true });
  }
}

export default AuthCallback;