Fix the /auth/callback page. Google OAuth works and 
creates the user correctly but the callback page keeps 
loading and never redirects to onboarding or dashboard.

The problem is that onAuthStateChange misses the 
SIGNED_IN event because it already fired before the 
listener is set up.

Replace the entire /auth/callback page component logic 
with this:

  useEffect(() => {
    const handleRedirect = async () => {
      // First check if session already exists —
      // the SIGNED_IN event may have already fired
      // before our listener was registered
      const { data: { session } } = 
        await supabase.auth.getSession()

      if (session) {
        // Session already available — redirect now
        await routeUser(session)
        return
      }

      // Session not ready yet — wait for the event
      const { data: { subscription } } =
        supabase.auth.onAuthStateChange(
          async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
              subscription.unsubscribe()
              await routeUser(session)
            }
          }
        )

      // Safety timeout
      const timeout = setTimeout(() => {
        subscription.unsubscribe()
        navigate('/login')
      }, 10000)

      return () => {
        subscription.unsubscribe()
        clearTimeout(timeout)
      }
    }

    const routeUser = async (session) => {
      try {
        const { data: cvProfiles } = await supabase
          .from('cv_profiles')
          .select('id')
          .eq('user_id', session.user.id)
          .limit(1)

        const hasOnboarded = cvProfiles && 
          cvProfiles.length > 0

        navigate(hasOnboarded ? '/dashboard' : '/onboarding')
      } catch (e) {
        console.error('routeUser error:', e)
        navigate('/onboarding')
      }
    }

    handleRedirect()
  }, [])

Do not change the loading spinner UI on this page.
Do not change any other page or auth code.