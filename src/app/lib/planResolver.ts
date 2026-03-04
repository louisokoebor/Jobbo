import { supabase } from './supabaseClient';
import { getProEntitlement } from './revenueCatClient';

export type PlanTier = 'free' | 'pro';

export interface ResolvedPlan {
  planTier: PlanTier;
  generationsUsed: number;
  generationsLimit: number;
  dbPlanTier: PlanTier;
  rcIsPro: boolean;
}

/**
 * Resolve the user's effective plan with Supabase DB as primary source of truth.
 * If DB says pro, user is pro regardless of RevenueCat entitlement state.
 */
export async function resolveUserPlan(userId: string): Promise<ResolvedPlan> {
  const { data: dbUser, error: dbError } = await supabase
    .from('users')
    .select('plan_tier, generations_used, generations_limit')
    .eq('id', userId)
    .single();

  if (dbError) {
    console.warn('[PlanResolver] Failed to read users row:', dbError.message);
  }

  const dbPlanTier: PlanTier = dbUser?.plan_tier === 'pro' ? 'pro' : 'free';

  let rcIsPro = false;
  try {
    rcIsPro = await getProEntitlement(userId);
  } catch (err) {
    console.warn('[PlanResolver] RC entitlement check failed:', err);
  }

  const planTier: PlanTier = dbPlanTier === 'pro' || rcIsPro ? 'pro' : 'free';

  return {
    planTier,
    dbPlanTier,
    rcIsPro,
    generationsUsed: dbUser?.generations_used ?? 0,
    generationsLimit: dbUser?.generations_limit ?? (planTier === 'pro' ? 999 : 3),
  };
}
