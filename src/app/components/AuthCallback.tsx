import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../lib/supabaseClient';

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let done = false;
    let subscription: any = null;
    let timeout: any = null;

    const routeUser = async (session: any) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      if (subscription) subscription.unsubscribe();

      try {
        const { data: cvProfiles } = await supabase
          .from('cv_profiles')
          .select('id')
          .eq('user_id', session.user.id)
          .limit(1);

        const hasOnboarded = cvProfiles && cvProfiles.length > 0;

        navigate(hasOnboarded ? '/dashboard' : '/onboarding', { replace: true });
      } catch (e) {
        console.error('routeUser error:', e);
        navigate('/onboarding', { replace: true });
      }
    };

    // Listen for auth state change
    const { data } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('AuthCallback:', event, !!session);
        if (event === 'SIGNED_IN' && session) {
          routeUser(session);
        }
        if (event === 'TOKEN_REFRESHED' && session) {
          routeUser(session);
        }
      }
    );
    subscription = data.subscription;

    // Also check immediately in case session is already available
    supabase.auth.getSession().then(({ data }) => {
      console.log('getSession result:', !!data.session);
      if (data.session) {
        routeUser(data.session);
      }
    });

    // Fallback timeout
    timeout = setTimeout(() => {
      if (!done) {
        console.log('AuthCallback: timeout reached');
        if (subscription) subscription.unsubscribe();
        navigate('/login', { replace: true });
      }
    }, 15000);

    return () => {
      if (subscription) subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      background: '#0F172A',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        border: '3px solid rgba(26,86,219,0.2)',
        borderTop: '3px solid #1A56DB',
        animation: 'spin 0.8s linear infinite'
      }} />
      <p style={{ color: '#94A3B8', fontSize: 14, margin: 0 }}>
        Signing you in…
      </p>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}