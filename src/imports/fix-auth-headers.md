Fix the Invalid JWT error when calling parse-cv. The server 
function at /make-server-3bbff5cf/parse-cv is working correctly.
The problem is the Authorization header being sent from the 
frontend is wrong.

Find every place in the code that calls 
/make-server-3bbff5cf/parse-cv and replace the auth header 
logic with this exact pattern:

  // Get a fresh session immediately before the call
  const { data: { session }, error: sessionError } = 
    await supabase.auth.getSession()

  if (!session || sessionError) {
    console.error('No active session found:', sessionError)
    showToast('error', 'Session expired — please log in again.')
    return
  }

  console.log('Token being sent:', session.access_token.slice(0, 20) + '...')

  const response = await fetch(
    '[YOUR_MAKE_SERVER_URL]/make-server-3bbff5cf/parse-cv',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file_url: fileUrl,
        label: file.name.replace(/\.[^/.]+$/, '')
      })
    }
  )

  const result = await response.json()
  console.log('parse-cv response:', result)

Key things to verify and fix:
1. session.access_token must be used — NOT the anon key, NOT 
   a hardcoded string, NOT supabase.auth.session()
2. The Authorization header value must be exactly: 
   "Bearer " followed by the access_token with a space between
3. Do NOT add an apikey header to this call — this is a Make 
   server function, not a Supabase Edge Function, so apikey 
   is not needed and may interfere
4. Add the console.log lines above so you can verify in the 
   browser console that a real token is being sent

Also apply the same fresh session pattern to ALL other Make 
server function calls on this page:
  - /make-server-3bbff5cf/scrape-job (if it exists)
  - /make-server-3bbff5cf/parse-job (if it exists)
  - /make-server-3bbff5cf/generate-cv (if it exists)

After applying this fix, open the browser console, attempt 
the CV upload again, and check:
  - The console.log shows a token starting with "ey"
  - The parse-cv response log shows success or a specific error

Do not change any styling or layout. Auth headers only.