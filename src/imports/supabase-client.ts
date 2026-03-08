# Fix Google OAuth — Complete Surgical Prompt

## Context
This is a React + Supabase app deployed on Figma Make at applyly.figma.site. Google OAuth redirects back to `/auth/callback` correctly (confirmed via network tab) but the app immediately redirects to login. The session is never established.

## Root Cause
`detectSessionInUrl: false` was set to prevent Supabase stripping the `?code=` from the URL before AuthCallback mounts. But this also stops Supabase from exchanging the code at all — `exchangeCodeForSession()` requires the PKCE verifier that Supabase stores in localStorage, and with `detectSessionInUrl: false` that verifier is never read. The result: exchange silently fails, session is null, app redirects to login.

The correct approach: `detectSessionInUrl: true` (let Supabase handle the exchange automatically in the background), then in AuthCallback register the auth state listener FIRST before any async call, and poll `getSession()` as a fallback for up to 20 seconds.

---

## File 1 — Replace `src/app/lib/supabaseClient.ts` entirely

```typescript
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey,
  {
    auth: {
      // TRUE — let supabase-js automatically exchange ?code= on the callback
      // page using the PKCE verifier it stored in localStorage during signInWithOAuth.
      // This is the only reliable way to complete the exchange in Figma Make's
      // module environment where the capture IIFE timing cannot be guaranteed.
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
```

---

## File 2 — Replace `src/app/components/AuthCallback.tsx` entirely

```typescript
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../lib/supabaseClient';

/**
 * AuthCallback — handles the redirect back from Google OAuth.
 *
 * IMPORTANT: This component must stay on a public route (never inside a
 * ProtectedRoute). It is already public in routes.tsx — do not change that.
 *
 * How this works:
 * 1. User clicks "Continue with Google" on LoginScreen or SignUpScreen
 * 2. supabase.auth.signInWithOAuth() stores a PKCE verifier in localStorage
 *    and redirects the browser to Google
 * 3. Google redirects to Supabase, which redirects to /auth/callback?code=xxx
 * 4. The Supabase client initialises with detectSessionInUrl:true and
 *    automatically starts exchanging ?code= for a session in the background
 * 5. THIS component mounts and immediately:
 *    a. Registers an onAuthStateChange listener (catches SIGNED_IN if it fires
 *       after we mount)
 *    b. Calls getSession() (catches the session if the exchange already
 *       completed before we mounted)
 *    c. Polls getSession() every 400ms for up to 20 seconds as a belt-and-
 *       braces fallback
 * 6. The moment a session appears (via any of the above), we route the user:
 *    - New user (no cv_profiles row) → /onboarding
 *    - Returning user → /dashboard
 *
 * Works for both Login ("Continue with Google") and Sign Up ("Continue with
 * Google") flows because both call supabase.auth.signInWithOAuth — Supabase
 * creates the user on first OAuth sign-in automatically.
 */
export function AuthCallback() {
  const navigate = useNavigate();
  const didRun = useRef(false);
  const routed = useRef(false);

  useEffect(() => {
    // React StrictMode double-invoke guard
    if (didRun.current) return;
    didRun.current = true;

    let cancelled = false;

    // ── Route helper ────────────────────────────────────────────────────
    async function routeUser(userId: string) {
      // Guard: only route once even if multiple signals fire simultaneously
      if (routed.current || cancelled) return;
      routed.current = true;

      console.log('[AuthCallback] routing user:', userId);

      try {
        const { data: cvProfiles, error } = await supabase
          .from('cv_profiles')
          .select('id')
          .eq('user_id', userId)
          .limit(1);

        if (cancelled) return;

        if (error) {
          // RLS error = handle_new_user trigger hasn't created public.users row.
          // Safe fallback: send to onboarding.
          console.warn('[AuthCallback] cv_profiles query error:', error.message);
          console.warn('[AuthCallback] → ensure handle_new_user_trigger.sql has been run in Supabase SQL Editor');
          navigate('/onboarding', { replace: true });
          return;
        }

        const destination = (cvProfiles?.length ?? 0) > 0 ? '/dashboard' : '/onboarding';
        console.log('[AuthCallback] navigating to:', destination);
        navigate(destination, { replace: true });

      } catch (err) {
        console.error('[AuthCallback] routeUser error:', err);
        if (!cancelled) navigate('/onboarding', { replace: true });
      }
    }

    // ── Main flow ────────────────────────────────────────────────────────
    async function run() {
      console.log('[AuthCallback] mounted');

      // STEP 1: Register onAuthStateChange listener FIRST — before any await.
      // If the SIGNED_IN event fires after we mount but before getSession()
      // returns, we catch it here.
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          console.log('[AuthCallback] auth event:', event, session?.user?.email ?? 'no user');

          if (
            (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') &&
            session?.user
          ) {
            console.log('[AuthCallback] session via auth event');
            subscription.unsubscribe();
            routeUser(session.user.id);
          }
        }
      );

      // STEP 2: Check if session already exists (exchange may have completed
      // before the listener was registered).
      const { data: { session: existingSession } } = await supabase.auth.getSession();

      if (existingSession?.user) {
        console.log('[AuthCallback] session already present on mount');
        subscription.unsubscribe();
        await routeUser(existingSession.user.id);
        return;
      }

      // STEP 3: Poll as belt-and-braces fallback.
      // supabase-js is exchanging the code asynchronously. We poll until it
      // appears. Typical exchange time: 200ms–2000ms. We allow up to 20s.
      console.log('[AuthCallback] no session yet — polling...');

      const POLL_INTERVAL = 400;
      const MAX_POLLS = 50; // 50 × 400ms = 20 seconds

      for (let i = 0; i < MAX_POLLS; i++) {
        if (cancelled || routed.current) {
          subscription.unsubscribe();
          return;
        }

        await new Promise<void>((res) => setTimeout(res, POLL_INTERVAL));

        if (cancelled || routed.current) {
          subscription.unsubscribe();
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          console.log(`[AuthCallback] session found on poll ${i + 1}`);
          subscription.unsubscribe();
          await routeUser(session.user.id);
          return;
        }

        if (i === 0 || (i + 1) % 5 === 0) {
          console.log(`[AuthCallback] poll ${i + 1}/${MAX_POLLS} — still waiting...`);
        }
      }

      // STEP 4: 20 seconds elapsed, no session. Something is genuinely broken.
      subscription.unsubscribe();
      if (cancelled || routed.current) return;

      console.error('[AuthCallback] FAILED — no session after 20s');
      console.error('[AuthCallback] Checklist:');
      console.error('  1. Is https://applyly.figma.site/auth/callback in Supabase → Auth → Redirect URLs?');
      console.error('  2. Is the handle_new_user SQL trigger installed in Supabase?');
      console.error('  3. Is Google provider enabled in Supabase → Auth → Providers?');
      console.error('  4. Are Client ID and Secret filled in for Google provider?');

      navigate('/login', { replace: true });
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        background: 'var(--background, #0F172A)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: '3px solid rgba(26,86,219,0.15)',
          borderTopColor: '#1A56DB',
          animation: 'cb-spin 0.75s linear infinite',
        }}
      />
      <p style={{ color: '#94A3B8', fontSize: 15, margin: 0 }}>
        Signing you in…
      </p>
      <style>{`@keyframes cb-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default AuthCallback;
```

---

## File 3 — Verify `src/app/lib/UserPlanContext.tsx` has this guard

Inside the `onAuthStateChange` callback in UserPlanContext, confirm this block exists and is correct:

```typescript
supabase.auth.onAuthStateChange((event, session) => {
  // Do NOT interfere while AuthCallback is processing the OAuth redirect
  if (
    typeof window !== 'undefined' &&
    window.location.pathname === '/auth/callback'
  ) {
    return;
  }
  // ... rest of the handler
});
```

If this guard is NOT present, UserPlanContext will compete with AuthCallback and potentially trigger its own navigation. Add it if missing.

---

## SQL to run in Supabase Dashboard → SQL Editor

If Google users appear in Authentication → Users but NOT in your `public.users` table, run this:

```sql
-- Create the trigger function
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, avatar_url, plan_tier, generations_used, generations_limit)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    'free',
    0,
    3
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Attach trigger to auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Backfill existing Google users who are missing from public.users
insert into public.users (id, email, full_name, avatar_url, plan_tier, generations_used, generations_limit)
select
  au.id,
  au.email,
  coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', ''),
  coalesce(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture', ''),
  'free',
  0,
  3
from auth.users au
left join public.users pu on au.id = pu.id
where pu.id is null;
```

---

## Supabase Dashboard Checklist

Authentication → URL Configuration:
- Site URL: `https://applyly.figma.site`
- Redirect URLs must include exactly: `https://applyly.figma.site/auth/callback`

Authentication → Providers → Google:
- Toggle must be ON (green)
- Client ID: filled in
- Client Secret: filled in

---

## How to verify it's working

After applying all changes, open DevTools → Console before clicking "Continue with Google". You should see this sequence:

```
[AuthCallback] mounted
[AuthCallback] no session yet — polling...
[AuthCallback] auth event: SIGNED_IN user@gmail.com
[AuthCallback] session via auth event
[AuthCallback] routing user: xxx-yyy-zzz
[AuthCallback] navigating to: /onboarding   ← new user
                             or /dashboard   ← returning user
```

If instead you see poll 1, 5, 10... counting up to 50 and then failure, the issue is the PKCE verifier being lost. In that case, share the Supabase project ID and I will diagnose whether implicit flow is needed.