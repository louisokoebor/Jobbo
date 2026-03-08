/**
 * UserPlanContext — Shared subscription / plan tier state
 *
 * Uses Supabase DB as the single source of truth for plan status.
 * Stripe webhook keeps the DB in sync with subscription changes.
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
import { resolveUserPlan } from './planResolver';

/* ─── Types ──────────────────────────────────────────────────── */
export type PlanTier = 'free' | 'pro';

interface UserPlanState {
  planTier: PlanTier;
  isLoading: boolean;
  isFreeTier: boolean;
  isProTier: boolean;
  userId: string | null;
  generationsUsed: number;
  generationsLimit: number;
  generationsRemaining: number;
  refresh: () => Promise<void>;
}

const defaultState: UserPlanState = {
  planTier: 'free',
  isLoading: true,
  isFreeTier: true,
  isProTier: false,
  userId: null,
  generationsUsed: 0,
  generationsLimit: 3,
  generationsRemaining: 3,
  refresh: async () => {},
};

const UserPlanContext = createContext<UserPlanState>(defaultState);

/* ─── Provider ───────────────────────────────────────────────── */
export function UserPlanProvider({ children }: { children: ReactNode }) {
  const [planTier, setPlanTier] = useState<PlanTier>('free');
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [generationsUsed, setGenerationsUsed] = useState(0);
  const [generationsLimit, setGenerationsLimit] = useState(3);
  const [generationsRemaining, setGenerationsRemaining] = useState(3);
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

      const resolvedPlan = await resolveUserPlan(user.id);
      console.log('[UserPlanContext] fetched plan:', resolvedPlan.planTier, 'dbPlanTier:', resolvedPlan.dbPlanTier);
      setPlanTier(resolvedPlan.planTier);
      setGenerationsUsed(resolvedPlan.generationsUsed);
      setGenerationsLimit(resolvedPlan.generationsLimit);
      setGenerationsRemaining(resolvedPlan.generationsRemaining);
    } catch (err) {
      console.error('UserPlanContext: Unexpected error:', err);
      setPlanTier('free');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlanTier();
  }, [fetchPlanTier]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        typeof window !== 'undefined' &&
        window.location.pathname === '/auth/callback'
      ) {
        return;
      }

      if (session?.user) {
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
    generationsUsed,
    generationsLimit,
    generationsRemaining,
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