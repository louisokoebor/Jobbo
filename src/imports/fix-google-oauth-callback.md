Audit and fix the Google OAuth callback flow. After Google 
auth completes the app lands on /auth/callback but keeps 
spinning and never redirects to /onboarding or /dashboard.

---

STEP 1 — AUDIT FIRST, FIX SECOND

Before making any changes, read and report on:

1. Open AuthCallback.tsx — read the entire file and 
   report exactly what it does

2. Open the Supabase client file (supabaseClient.ts or 
   similar) — check how the client is initialised and 
   whether detectSessionInUrl is set to anything

3. Open App.tsx or the root component — check if there 
   is any global onAuthStateChange listener at the app 
   root level that could be consuming the SIGNED_IN 
   event before AuthCallback receives it

4. Open routes.tsx or the router config — confirm 
   /auth/callback is mapped to AuthCallback component

5. Check if there is any auth guard, protected route 
   wrapper, or middleware that wraps routes — if 
   /auth/callback is wrapped inside a protected route 
   that checks for an existing session and redirects 
   to /login when none is found, that would cause 
   exactly this symptom

---

STEP 2 — APPLY FIXES

Fix 1: Supabase client config
Open the Supabase client initialisation file.
Make sure it is created with these options:

  export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      }
    }
  )

detectSessionInUrl: true is critical — it tells Supabase 
to automatically parse the OAuth tokens from the URL 
hash/params when the page loads. Without this the 
callback page never sees the session.

Fix 2: Remove /auth/callback from any auth guard
If /auth/callback is inside a ProtectedRoute or 
RequireAuth wrapper component, move it outside so it 
is a completely public route. The callback page must 
be accessible without an existing session.

In the router the /auth/callback route must look like:
  { path: '/auth/callback', Component: AuthCallback }
NOT wrapped in any auth checking component.

Fix 3: Remove any global auth listener interference
If App.tsx or a root layout component has a 
onAuthStateChange listener, add this guard at the 
very top of the listener callback:

  if (window.location.pathname === '/auth/callback') return

Fix 4: Replace AuthCallback.tsx with this clean version:

  import { useEffect } from 'react'
  import { useNavigate } from 'react-router'
  import { supabase } from '../lib/supabaseClient'

  export function AuthCallback() {
    const navigate = useNavigate()

    useEffect(() => {
      let done = false
      let subscription: any = null
      let timeout: any = null

      const routeUser = async (session: any) => {
        if (done) return
        done = true
        clearTimeout(timeout)
        if (subscription) subscription.unsubscribe()

        try {
          const { data: cvProfiles } = await supabase
            .from('cv_profiles')
            .select('id')
            .eq('user_id', session.user.id)
            .limit(1)

          const hasOnboarded = cvProfiles && 
            cvProfiles.length > 0

          navigate(
            hasOnboarded ? '/dashboard' : '/onboarding', 
            { replace: true }
          )
        } catch (e) {
          console.error('routeUser error:', e)
          navigate('/onboarding', { replace: true })
        }
      }

      // Listen for auth state change
      const { data } = supabase.auth.onAuthStateChange(
        (event, session) => {
          console.log('AuthCallback:', event, !!session)
          if (event === 'SIGNED_IN' && session) {
            routeUser(session)
          }
          if (event === 'TOKEN_REFRESHED' && session) {
            routeUser(session)
          }
        }
      )
      subscription = data.subscription

      // Also check immediately in case session 
      // is already available
      supabase.auth.getSession().then(({ data }) => {
        console.log('getSession result:', !!data.session)
        if (data.session) {
          routeUser(data.session)
        }
      })

      // Fallback timeout
      timeout = setTimeout(() => {
        if (!done) {
          console.log('AuthCallback: timeout reached')
          if (subscription) subscription.unsubscribe()
          navigate('/login', { replace: true })
        }
      }, 15000)

      return () => {
        if (subscription) subscription.unsubscribe()
        clearTimeout(timeout)
      }
    }, [])

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
        <p style={{ 
          color: '#94A3B8', 
          fontSize: 14, 
          margin: 0 
        }}>
          Signing you in…
        </p>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

---

STEP 3 — VERIFY

After making all changes, report back:
- What was the Supabase client config before the fix?
- Was detectSessionInUrl missing or set to false?
- Was /auth/callback inside a protected route wrapper?
- Was there a global onAuthStateChange listener?

These are the three most likely causes of this exact 
symptom and all three must be checked.

Do not change any page styling or design.
Do not change email/password auth flows.