import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../lib/supabaseClient';

/**
 * AuthCallback — handles the redirect back from Google OAuth (implicit flow).
 *
 * Flow (per Supabase Google Auth guide):
 * 1. User clicks "Continue with Google" → signInWithOAuth redirects browser to Google
 * 2. Google redirects to Supabase, which redirects here: /auth/callback#access_token=...
 * 3. supabase-js (with detectSessionInUrl: true) automatically reads the hash
 *    and establishes the session
 * 4. This component detects the session and routes the user:
 *    - New user (no cv_profiles row) → /onboarding
 *    - Returning user → /dashboard
 */
export function AuthCallback() {
  const navigate = useNavigate();
  const routed = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function routeUser(userId: string) {
      if (routed.current || cancelled) return;
      routed.current = true;

      console.log('[AuthCallback] routing user:', userId);

      try {
        const { data: cvProfiles, error } = await supabase
          .from('cv_profiles')
          .select('id')
          .eq('user_id', userId)
          .limit(1);

        if (cancelled) return;

        if (error) {
          console.warn('[AuthCallback] cv_profiles query error:', error.message);
          navigate('/onboarding', { replace: true });
          return;
        }

        const destination = (cvProfiles?.length ?? 0) > 0 ? '/dashboard' : '/onboarding';
        console.log('[AuthCallback] navigating to:', destination);
        navigate(destination, { replace: true });
      } catch (err) {
        console.error('[AuthCallback] routeUser error:', err);
        if (!cancelled) navigate('/onboarding', { replace: true });
      }
    }

    // Listen for auth state changes — supabase-js fires SIGNED_IN after
    // it reads the #access_token from the URL hash.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[AuthCallback] auth event:', event, session?.user?.email ?? 'no user');

        if (
          (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') &&
          session?.user
        ) {
          subscription.unsubscribe();
          routeUser(session.user.id);
        }
      }
    );

    // Also check immediately — the session may already exist if supabase-js
    // processed the hash before this effect ran.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !routed.current) {
        console.log('[AuthCallback] session already present on mount');
        subscription.unsubscribe();
        routeUser(session.user.id);
      }
    });

    // Safety timeout — if no session after 15 seconds, redirect to login
    const timeout = setTimeout(() => {
      if (!routed.current && !cancelled) {
        console.error('[AuthCallback] no session after 15s — redirecting to login');
        subscription.unsubscribe();
        navigate('/login', { replace: true });
      }
    }, 15000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        background: 'var(--bg, #0F172A)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: '3px solid rgba(26,86,219,0.15)',
          borderTopColor: '#1A56DB',
          animation: 'cb-spin 0.75s linear infinite',
        }}
      />
      <p style={{ color: '#94A3B8', fontSize: 15, margin: 0 }}>
        Signing you in…
      </p>
      <style>{`@keyframes cb-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default AuthCallback;
