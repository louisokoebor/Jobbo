import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey,
  {
    auth: {
      // Implicit flow: tokens arrive in the URL hash (#access_token=...).
      // detectSessionInUrl: true lets supabase-js read them automatically.
      // This is the standard approach from the Supabase Google Auth guide.
       flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
