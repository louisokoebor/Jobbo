/**
 * UserPlanContext — Shared subscription / plan tier state
 *
 * Uses RevenueCat as the source of truth for entitlements.
 * Falls back to Supabase users.plan_tier if RC is unavailable.
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
import {
  getRCInstance,
  teardownRC,
  getProEntitlement,
  getCustomerInfo,
  type RCCustomerInfo,
} from './revenueCatClient';

/* ─── Types ──────────────────────────────────────────────────── */
export type PlanTier = 'free' | 'pro';

interface UserPlanState {
  planTier: PlanTier;
  isLoading: boolean;
  isFreeTier: boolean;
  isProTier: boolean;
  userId: string | null;
  rcCustomerInfo: RCCustomerInfo | null;
  refresh: () => Promise<void>;
}

const defaultState: UserPlanState = {
  planTier: 'free',
  isLoading: true,
  isFreeTier: true,
  isProTier: false,
  userId: null,
  rcCustomerInfo: null,
  refresh: async () => {},
};

const UserPlanContext = createContext<UserPlanState>(defaultState);

/* ─── Provider ───────────────────────────────────────────────── */
export function UserPlanProvider({ children }: { children: ReactNode }) {
  const [planTier, setPlanTier] = useState<PlanTier>('free');
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [rcCustomerInfo, setRcCustomerInfo] = useState<RCCustomerInfo | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPlanTier = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setPlanTier('free');
        setUserId(null);
        setRcCustomerInfo(null);
        setIsLoading(false);
        teardownRC();
        return;
      }

      setUserId(user.id);

      // ── RevenueCat entitlement check ──
      try {
        getRCInstance(user.id);
        const isPro = await getProEntitlement(user.id);
        const info = await getCustomerInfo(user.id);
        setRcCustomerInfo(info);
        setPlanTier(isPro ? 'pro' : 'free');
        setIsLoading(false);
        return;
      } catch (rcErr) {
        console.warn(
          'UserPlanContext: RevenueCat check failed, falling back to Supabase:',
          rcErr,
        );
      }

      // ── Fallback: Supabase users table ──
      const { data, error } = await supabase
        .from('users')
        .select('plan_tier')
        .eq('id', user.id)
        .single();

      if (error) {
        console.warn('UserPlanContext: Failed to fetch plan_tier:', error.message);
        setPlanTier('free');
      } else {
        setPlanTier(data?.plan_tier === 'pro' ? 'pro' : 'free');
      }
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
        setRcCustomerInfo(null);
        setIsLoading(false);
        teardownRC();
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
    rcCustomerInfo,
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
