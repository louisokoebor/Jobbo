/**
 * UserPlanContext — Shared subscription / plan tier state
 *
 * Fetches `plan_tier` from the Supabase `users` table for the currently
 * authenticated user and exposes it app-wide via React Context.
 *
 * plan_tier_enum: 'free' | 'pro'
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
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
          'UserPlanContext: Failed to fetch plan_tier from users table:',
          error.message,
        );
        // Fallback — treat as free if the row doesn't exist yet
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

  // Re-fetch when the auth state changes (sign-in / sign-out / token refresh)
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Guard: skip SIGNED_IN events on the /auth/callback page — it handles its own routing
      if (event === 'SIGNED_IN' && typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        if (currentPath === '/auth/callback') return;
        // For Google OAuth users arriving via other paths, skip to avoid double-navigation
        if (session?.user?.app_metadata?.provider === 'google') return;
      }

      if (session?.user) {
        fetchPlanTier();
      } else {
        setPlanTier('free');
        setUserId(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
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