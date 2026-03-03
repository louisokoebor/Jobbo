/**
 * UserPlanContext — Shared subscription / plan tier state
 *
 * Fetches `plan_tier` from the Supabase `users` table for the currently
 * authenticated user and exposes it app-wide via React Context.
 *
 * Changes from original:
 *  - Removed the blanket skip for Google OAuth users. The original skip
 *    (`app_metadata.provider === 'google'`) prevented plan tier from ever
 *    being refreshed for Google users after initial load, and caused silent
 *    failures when the auth state changed (e.g. after an upgrade).
 *  - Added a guard on the /auth/callback path only — we let AuthCallback
 *    own the routing logic there and don't want UserPlanContext to trigger
 *    a competing navigation.
 *  - Debounced rapid auth-state events (SIGNED_IN + TOKEN_REFRESHED can
 *    fire back-to-back on the OAuth redirect) so we only fetch once.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import { supabase } from './supabaseClient';

/* ─── Types ──────────────────────────────────────────────────── */
export type PlanTier = 'free' | 'pro';

interface UserPlanState {
  /** Current plan tier – defaults to 'free' until loaded */
  planTier: PlanTier;
  /** True while the initial fetch is in-flight */
  isLoading: boolean;
  /** Whether the user is on the free tier */
  isFreeTier: boolean;
  /** Whether the user is on the pro tier */
  isProTier: boolean;
  /** Authenticated user id (null when signed out) */
  userId: string | null;
  /** Re-fetch plan tier (e.g. after an upgrade) */
  refresh: () => Promise<void>;
}

const defaultState: UserPlanState = {
  planTier: 'free',
  isLoading: true,
  isFreeTier: true,
  isProTier: false,
  userId: null,
  refresh: async () => {},
};

const UserPlanContext = createContext<UserPlanState>(defaultState);

/* ─── Provider ───────────────────────────────────────────────── */
export function UserPlanProvider({ children }: { children: ReactNode }) {
  const [planTier, setPlanTier] = useState<PlanTier>('free');
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPlanTier = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setPlanTier('free');
        setUserId(null);
        setIsLoading(false);
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from('users')
        .select('plan_tier')
        .eq('id', user.id)
        .single();

      if (error) {
        console.warn(
          'UserPlanContext: Failed to fetch plan_tier — user row may not exist yet:',
          error.message,
        );
        // Fallback to free. This is expected for brand-new Google OAuth users
        // whose handle_new_user trigger hasn't completed yet.
        setPlanTier('free');
      } else {
        const tier = data?.plan_tier;
        setPlanTier(tier === 'pro' ? 'pro' : 'free');
      }
    } catch (err) {
      console.error('UserPlanContext: Unexpected error fetching plan tier:', err);
      setPlanTier('free');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchPlanTier();
  }, [fetchPlanTier]);

  // Re-fetch when auth state changes — debounced to handle rapid-fire events
  // (SIGNED_IN + TOKEN_REFRESHED both fire during OAuth redirect).
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Let AuthCallback own routing on its own page — don't trigger a
      // competing navigation by fetching plan tier mid-redirect.
      if (
        typeof window !== 'undefined' &&
        window.location.pathname === '/auth/callback'
      ) {
        return;
      }

      if (session?.user) {
        // Debounce: wait 300ms so back-to-back events only trigger one fetch
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          fetchPlanTier();
        }, 300);
      } else if (event === 'SIGNED_OUT') {
        setPlanTier('free');
        setUserId(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchPlanTier]);

  const value: UserPlanState = {
    planTier,
    isLoading,
    isFreeTier: planTier === 'free',
    isProTier: planTier === 'pro',
    userId,
    refresh: fetchPlanTier,
  };

  return (
    <UserPlanContext.Provider value={value}>{children}</UserPlanContext.Provider>
  );
}

/* ─── Hook ───────────────────────────────────────────────────── */
export function useUserPlan(): UserPlanState {
  return useContext(UserPlanContext);
}