Fix Google OAuth sign in and sign up completely.
The existing email/password auth works correctly —
Google OAuth should behave identically in terms of
routing and onboarding flow.

Do not touch the email/password login or signup code.
Only modify the Google OAuth flow.

---

GOOGLE SIGN IN BUTTON

On the login page AND the signup page, find the 
"Continue with Google" button.

Replace whatever it currently does with exactly this:

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'https://applyly.figma.site/auth/callback',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      })
      if (error) {
        console.error('Google OAuth error:', error)
        showToast('error', 'Google sign in failed. Please try again.')
        setGoogleLoading(false)
      }
      // If no error, browser will redirect to Google
      // No further code needed here
    } catch (e) {
      console.error('Google OAuth unexpected error:', e)
      showToast('error', 'Something went wrong. Please try again.')
      setGoogleLoading(false)
    }
  }

Show a spinner on the Google button while googleLoading 
is true. Disable the button while loading.

---

AUTH CALLBACK PAGE

Create a new page/route at /auth/callback.

This page handles the redirect back from Google OAuth.
It should show a full-screen centred loading spinner
with the Applyly logo and "Signing you in…" text.
Same background as other screens, same theme.

The page logic:

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Exchange the code in the URL for a session
        const { data, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Auth callback error:', error)
          navigate('/login?error=auth_failed')
          return
        }

        if (!data.session) {
          // Session not ready yet, wait briefly and retry
          setTimeout(async () => {
            const { data: retryData } = await supabase.auth.getSession()
            if (retryData.session) {
              await handlePostAuth(retryData.session)
            } else {
              navigate('/login?error=no_session')
            }
          }, 1000)
          return
        }

        await handlePostAuth(data.session)
      } catch (e) {
        console.error('Callback unexpected error:', e)
        navigate('/login?error=unexpected')
      }
    }

    handleAuthCallback()
  }, [])

  const handlePostAuth = async (session) => {
    const userId = session.user.id

    // Check if user has a profile in public.users
    const { data: profile } = await supabase
      .from('users')
      .select('id, full_name, avatar_url')
      .eq('id', userId)
      .maybeSingle()

    // Check if user has any CV profiles (determines 
    // if they have completed onboarding)
    const { data: cvProfiles } = await supabase
      .from('cv_profiles')
      .select('id')
      .eq('user_id', userId)
      .limit(1)

    const hasCompletedOnboarding = cvProfiles && cvProfiles.length > 0

    if (!hasCompletedOnboarding) {
      // New user or user who hasn't uploaded a CV yet
      // Send to onboarding exactly like email signup does
      navigate('/onboarding')
    } else {
      // Returning user who has already onboarded
      navigate('/dashboard')
    }
  }

---

AUTH STATE LISTENER — applies to ALL pages

Find the existing auth state listener 
(supabase.auth.onAuthStateChange) that is used for 
email/password login.

Make sure it also handles the SIGNED_IN event that 
fires after OAuth redirect. The callback page above 
handles routing, so the listener should NOT 
double-navigate. Add a guard:

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      // Only handle if we're not already on the callback page
      // The /auth/callback page handles its own routing
      const currentPath = window.location.pathname
      if (currentPath === '/auth/callback') return
      
      // For email confirmations and magic links only
      // OAuth is handled by /auth/callback
      if (session.user.app_metadata?.provider === 'google') return
      
      // Email login already has its own handler, skip
    }
  })

---

USER PROFILE DISPLAY — fix "Loading" showing for Google users

Find everywhere in the app that displays the user's 
name or avatar (nav bar avatar, profile page, 
onboarding welcome message).

Replace any pattern like:
  user.user_metadata?.full_name
  OR
  profile?.full_name (when profile is from public.users)

With this reliable fallback chain:

  const displayName = 
    profile?.full_name ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.user_metadata?.name ||
    session?.user?.email?.split('@')[0] ||
    'User'

  const avatarUrl =
    profile?.avatar_url ||
    session?.user?.user_metadata?.avatar_url ||
    session?.user?.user_metadata?.picture ||
    null

For the avatar in the nav:
  If avatarUrl exists: show <img> with the avatar URL
    Width 32px, height 32px, border-radius 50%
    Object-fit cover
  If no avatarUrl: show the existing gradient circle 
    with the first letter of displayName

---

ONBOARDING PAGE — handle Google users correctly

On the onboarding page, find where it greets the user.

Replace any hardcoded or broken name display with:

  const { data: { session } } = await supabase.auth.getSession()
  
  const displayName = 
    session?.user?.user_metadata?.full_name ||
    session?.user?.user_metadata?.name ||
    session?.user?.email?.split('@')[0] ||
    'there'

  // Greeting: "Welcome, [first name]!"
  const firstName = displayName.split(' ')[0]

The onboarding flow for Google users should be 
identical to email users:
  Step 1: Upload base CV
  Step 2: Preview parsed CV  
  Step 3: Confirm and go to dashboard

Google users should NOT be able to skip onboarding 
and go directly to the dashboard if they have no 
CV profiles. The /auth/callback page already enforces 
this by checking cv_profiles.

---

LOGIN PAGE — handle error params

On the login page, check for error query params and 
show appropriate toasts:

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')
    if (error === 'auth_failed') {
      showToast('error', 'Sign in failed. Please try again.')
    } else if (error === 'no_session') {
      showToast('error', 'Session expired. Please sign in again.')
    } else if (error === 'unexpected') {
      showToast('error', 'Something went wrong. Please try again.')
    }
  }, [])

---

DO NOT CHANGE:
- Email/password login flow
- Email/password signup flow  
- Any existing routing for those flows
- Any styling, layout or design
- The Supabase client configuration