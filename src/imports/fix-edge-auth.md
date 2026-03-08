Fix the API calls to the Edge Function so they pass the 
user's JWT in the Authorization header instead of the 
Supabase anon key.

This is causing 401 errors on all protected endpoints 
after a security update to the Edge Function.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIND THE PROBLEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find every place in the codebase that makes a fetch() 
or axios call to the Edge Function URL:
  /make-server-3bbff5cf/

Look at what is being sent in the Authorization or 
X-User-Token header on these calls. It is likely one 
of these wrong patterns:

  WRONG — sending anon key:
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
    }

  WRONG — sending nothing:
    headers: {
      'Content-Type': 'application/json',
    }

  WRONG — sending X-User-Token with anon key:
    headers: {
      'X-User-Token': supabaseAnonKey,
    }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE FIX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every fetch to /make-server-3bbff5cf/* must send the 
user's current session JWT, not the anon key.

Get the JWT from the active Supabase session:

  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;

  if (!jwt) {
    // User is not logged in — redirect to login
    router.push('/login');
    return;
  }

Then pass it in the Authorization header:

  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwt}`,
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APPLY THIS TO ALL EDGE FUNCTION CALLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find and fix every fetch call to these endpoints:
  - /make-server-3bbff5cf/application-data/:id
  - /make-server-3bbff5cf/generated-cv/:id
  - /make-server-3bbff5cf/save-notes
  - /make-server-3bbff5cf/save-cover-letter
  - /make-server-3bbff5cf/generate-cv
  - /make-server-3bbff5cf/generate-cover-letter
  - /make-server-3bbff5cf/parse-cv
  - /make-server-3bbff5cf/analyse-application
  - /make-server-3bbff5cf/improve-bullet
  - /make-server-3bbff5cf/generate-pdf
  - /make-server-3bbff5cf/extract-job-terms
  - /make-server-3bbff5cf/generate-interview-prep
  - /make-server-3bbff5cf/save-interview-answer
  - /make-server-3bbff5cf/patch-cv-gap
  - /make-server-3bbff5cf/delete-account
  - /make-server-3bbff5cf/create-checkout-session
  - /make-server-3bbff5cf/create-portal-session

If there is a shared API helper function or a central 
fetch wrapper used across the app, fix it there once 
and it will apply everywhere. Look for files named:
  api.ts / apiClient.ts / fetchWithAuth.ts / 
  supabaseClient.ts / lib/api.ts

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE A SHARED HELPER IF ONE DOESN'T EXIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If there is no central fetch wrapper, create one:

  // lib/apiFetch.ts
  export async function apiFetch(
    path: string,
    options: RequestInit = {}
  ) {
    const { data: { session } } = await supabase.auth.getSession();
    const jwt = session?.access_token;

    if (!jwt) throw new Error('Not authenticated');

    const BASE = 'https://YOUR_SUPABASE_PROJECT.supabase.co/functions/v1';

    return fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Beare