Audit and fix the Google OAuth sign in flow completely.
The "Continue with Google" button shows a spinner but 
never redirects to Google. Email/password auth works 
correctly — do not touch it.

---

AUDIT — check all of the following:

1. Find the Supabase client configuration file. Confirm 
   it is initialised with the correct project URL and 
   anon key. Do not change it.

2. Find every place supabase.auth.signInWithOAuth is 
   called. Log the exact call and any response.

3. Find the /auth/callback route and confirm it exists 
   in the router configuration. If it is missing from 
   the router, add it.

4. Check if there is any code that is intercepting 
   navigation or catching errors before the OAuth 
   redirect can happen — such as a try/catch that 
   swallows the error, or a loading state that never 
   resolves.

---

FIXES — apply all of the following:

1. Replace the entire Google sign in handler on both 
   the login page and the signup page with this clean 
   minimal version:

   const handleGoogleSignIn = async () => {
     setGoogleLoading(true)
     const { error } = await supabase.auth.signInWithOAuth({
       provider: 'google',
       options: {
         redirectTo: window.location.origin + '/auth/callback'
       }
     })
     if (error) {
       setGoogleLoading(false)
       alert('Google sign in error: ' + error.message)
     }
     // Do not set loading false on success — 
     // browser will navigate away to Google
   }

2. Make sure the /auth/callback route is registered in 
   the app router alongside all other routes like 
   /dashboard, /login, /onboarding etc. If it is not 
   in the router, add it now pointing to the 
   AuthCallbackPage component.

3. Replace the entire /auth/callback page component 
   with this:

   export function AuthCallbackPage() {
     const navigate = useNavigate()

     useEffect(() => {
       const { data: { subscription } } = 
         supabase.auth.onAuthStateChange(
           async (event, session) => {
             if (event === 'SIGNED_IN' && session) {
               subscription.unsubscribe()
               
               const { data: cvProfiles } = await supabase
                 .from('cv_profiles')
                 .select('id')
                 .eq('user_id', session.user.id)
                 .limit(1)

               const hasOnboarded = cvProfiles && 
                 cvProfiles.length > 0

               if (hasOnboarded) {
                 navigate('/dashboard')
               } else {
                 navigate('/onboarding')
               }
             }
           }
         )

       const timeout = setTimeout(() => {
         subscription.unsubscribe()
         navigate('/login')
       }, 10000)

       return () => {
         subscription.unsubscribe()
         clearTimeout(timeout)
       }
     }, [])

     // Full screen loading UI
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

4. Remove any error query param handling on the login 
   page that shows "Session expired" — this was a 
   false error from the broken callback. Remove the 
   entire useEffect that reads error params from the 
   URL on the login page.

5. Make sure no global auth state listener 
   (onAuthStateChange at the app root level) is 
   intercepting the SIGNED_IN event and redirecting 
   away from /auth/callback before the callback page 
   can handle it. If such a listener exists at the 
   app root, add this guard at the top of its handler:

   if (window.location.pathname === '/auth/callback') 
     return

---

Do not change email/password login or signup.
Do not change any styling on any other page.
Do not change the Supabase client initialisation.