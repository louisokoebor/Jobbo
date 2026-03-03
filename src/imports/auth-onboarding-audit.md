Perform a full audit of the authentication flow and 
onboarding CV upload flow. Fix all broken parts.
Do not change any working UI styling or design.

---

ISSUE 1 — Google OAuth button spins and never redirects

Audit:
- Find every file that references signInWithOAuth
- Find every file that references /auth/callback
- Check the router config file and list all registered 
  routes — confirm /auth/callback is in there
- Check if any global onAuthStateChange listener exists 
  at the app root level that might be redirecting away 
  before the callback page loads
- Check if the Google provider is enabled in the 
  Supabase config

Fix:
- Simplify the Google button handler on both login and 
  signup pages to this and nothing else:

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback'
      }
    })
    if (error) {
      setGoogleLoading(false)
      showToast('error', error.message)
    }

- Ensure /auth/callback is registered as a route in 
  the router

- The /auth/callback page should contain only this logic:

    useEffect(() => {
      const { data: { subscription } } =
        supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_IN' && session) {
            subscription.unsubscribe()
            const { data: cvProfiles } = await supabase
              .from('cv_profiles')
              .select('id')
              .eq('user_id', session.user.id)
              .limit(1)
            const hasOnboarded = cvProfiles && cvProfiles.length > 0
            navigate(hasOnboarded ? '/dashboard' : '/onboarding')
          }
        })
      const timeout = setTimeout(() => {
        subscription.unsubscribe()
        navigate('/login')
      }, 10000)
      return () => {
        subscription.unsubscribe()
        clearTimeout(timeout)
      }
    }, [])

- If a global onAuthStateChange exists at the app root, 
  add this as the first line of its callback:
    if (window.location.pathname === '/auth/callback') return

- Remove any useEffect on the login page that reads 
  error query params and shows "Session expired" —
  delete it entirely

---

ISSUE 2 — Onboarding CV upload shows 
"Failed to analyse your CV. Please go back and try again."

Audit:
- Find the onboarding page CV upload step
- Find every fetch call on that page
- Find what URL it is calling for CV parsing
- Check what the response body actually says when 
  it fails — add console.log(await response.json()) 
  before any error handling
- Check if the file upload to Supabase Storage 
  cv-uploads bucket is succeeding before the parse call
- Check if the signed URL is being generated correctly
  after the upload

Fix:
- The CV upload on onboarding should follow this exact 
  sequence:

  1. Upload file to Supabase Storage cv-uploads bucket:
       const filePath = `${userId}/${Date.now()}-${file.name}`
       const { error: uploadError } = await supabase
         .storage
         .from('cv-uploads')
         .upload(filePath, file, { 
           contentType: file.type, 
           upsert: false 
         })

  2. Get a signed URL valid for 1 hour:
       const { data: urlData } = await supabase
         .storage
         .from('cv-uploads')
         .createSignedUrl(filePath, 3600)
       const fileUrl = urlData?.signedUrl

  3. Call the Make server parse-cv endpoint:
       const { data: { session } } = 
         await supabase.auth.getSession()
       
       const response = await fetch(
         'https://hrexgjahkdjqxvulodqu.supabase.co' +
         '/functions/v1/make-server-3bbff5cf/parse-cv',
         {
           method: 'POST',
           headers: {
             'Authorization': `Bearer ${session.access_token}`,
             'Content-Type': 'application/json',
             'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyZXhnamFoa2RqcXh2dWxvZHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNzAzNjUsImV4cCI6MjA4Nzk0NjM2NX0.pkV8MPJYG-AyBPk5qG7iDJCT86aOzVKcti1wfygqpRM'
           },
           body: JSON.stringify({
             file_url: fileUrl,
             label: file.name.replace(/\.[^/.]+$/, '')
           })
         }
       )
       
       const result = await response.json()
       console.log('parse-cv result:', result)

  4. If result.success is true:
       Save parsed_json to Supabase cv_profiles table:
         const { data: cvProfile } = await supabase
           .from('cv_profiles')
           .insert({
             user_id: session.user.id,
             label: result.label || 
               file.name.replace(/\.[^/.]+$/, ''),
             parsed_json: result.parsed_json,
             raw_file_url: fileUrl,
             is_default: true
           })
           .select('id')
           .single()
       
       Then proceed to onboarding step 2 (preview parsed CV)

  5. If result.success is false:
       Show the exact error message from result.message 
       in a red toast — not a generic message
       Log the full result object to console

- Make sure the onboarding page is NOT calling 
  /functions/v1/parse-cv directly — it must call 
  /functions/v1/make-server-3bbff5cf/parse-cv

- Make sure the onboarding page is NOT calling any 
  endpoint called "analyse-cv" or "analyse" — there 
  is no such endpoint. The only CV parsing endpoint 
  is make-server-3bbff5cf/parse-cv

---

IMPORTANT
Do not change any page styling or design.
Do not change the working email/password login flow.
Do not change the working email/password signup flow.
Fix only the two issues described above.