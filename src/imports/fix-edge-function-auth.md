Fix the parse-cv Edge Function call on the New Application 
screen. It is returning a 401 Invalid JWT error. The issue is 
that the Authorization header is not being passed correctly.

Do not change any styling or layout. Fix the auth header only.

---

FIND THE PARSE-CV FETCH CALL

Find where the app calls the parse-cv Edge Function. It 
currently looks something like this:

  fetch(`${SUPABASE_URL}/functions/v1/parse-cv`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ file_url: fileUrl, label: label })
  })

---

REPLACE THE AUTH HEADER LOGIC

The session may not be available the way it is currently being 
accessed. Replace the entire fetch call with this exact pattern:

  // Always get a fresh session immediately before the call
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    // Show red toast and return — do not proceed
    showToast('error', 'You must be logged in to upload a CV.')
    return
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/parse-cv`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        file_url: fileUrl,
        label: file.name.replace(/\.[^/.]+$/, '')
      })
    }
  )

The key changes are:
  1. await supabase.auth.getSession() called fresh immediately 
     before the fetch — not cached from earlier in the flow
  2. Added 'apikey': SUPABASE_ANON_KEY as a second header —
     Supabase Edge Functions require both the Authorization 
     header AND the apikey header to validate the JWT correctly

---

APPLY THE SAME FIX TO ALL OTHER EDGE FUNCTION CALLS

The same 401 error will happen on every other Edge Function 
call if the headers are inconsistent. Find every fetch call 
to Supabase Edge Functions on this page and make sure they 
all use this exact same header pattern:

  const { data: { session } } = await supabase.auth.getSession()

  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY
  }

Edge Function calls to fix on this page:
  - /functions/v1/scrape-job
  - /functions/v1/parse-job
  - /functions/v1/parse-cv
  - /functions/v1/generate-cv

Do not change anything else. Headers only.