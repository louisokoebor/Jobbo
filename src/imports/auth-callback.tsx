Fix the /auth/callback page. It is showing "Session expired" 
because it calls getSession() before Supabase has finished 
exchanging the OAuth code for a session.

Replace the entire useEffect on the /auth/callback page 
with this:

  useEffect(() => {
    // Listen for the SIGNED_IN event which fires once
    // Supabase has finished exchanging the OAuth code.
    // This is the correct way to handle OAuth callbacks —
    // do NOT call getSession() immediately on mount.
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          subscription.unsubscribe()
          await handlePostAuth(session)
        }

        if (event === 'SIGNED_OUT') {
          subscription.unsubscribe()
          navigate('/login?error=auth_failed')
        }
      }
    )

    // Safety timeout — if nothing fires after 8 seconds
    // something went wrong
    const timeout = setTimeout(() => {
      subscription.unsubscribe()
      navigate('/login?error=no_session')
    }, 8000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const handlePostAuth = async (session) => {
    try {
      const userId = session.user.id

      const { data: cvProfiles } = await supabase
        .from('cv_profiles')
        .select('id')
        .eq('user_id', userId)
        .limit(1)

      const hasCompletedOnboarding = cvProfiles && cvProfiles.length > 0

      if (!hasCompletedOnboarding) {
        navigate('/onboarding')
      } else {
        navigate('/dashboard')
      }
    } catch (e) {
      console.error('handlePostAuth error:', e)
      navigate('/dashboard')
    }
  }

Do not change any styling on the callback page.
Do not change any other auth code.