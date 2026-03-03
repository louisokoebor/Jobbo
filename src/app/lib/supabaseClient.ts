import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';

// ── Capture ?code= BEFORE createClient() strips it from the URL ──────────────
// supabase-js calls window.history.replaceState on init when detectSessionInUrl
// is true, wiping the ?code= param before AuthCallback ever mounts.
// This block runs at module load time — just before the client is created —
// so we save the code to sessionStorage first.
(function captureOAuthCode() {
  try {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      sessionStorage.setItem('jobbo_oauth_code', code);
      console.log('[supabaseClient] OAuth code captured');
    }
  } catch (_) {}
})();

export const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey,
  {
    auth: {
      // false — we handle the exchange ourselves in AuthCallback
      // using the code saved above
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);