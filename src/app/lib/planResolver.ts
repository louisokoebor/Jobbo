import { supabase } from './supabaseClient';

export type PlanTier = 'free' | 'pro';

export interface ResolvedPlan {
  planTier: PlanTier;
  generationsUsed: number;
  generationsLimit: number;
  generationsRemaining: number;
  dbPlanTier: PlanTier;
}

/**
 * Resolve the user's effective plan using Supabase DB as the single source of truth.
 * Stripe webhook keeps the DB plan_tier in sync with subscription status.
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

  console.log('[PlanResolver] DB row:', { plan_tier: dbUser?.plan_tier, generations_used: dbUser?.generations_used, generations_limit: dbUser?.generations_limit });

  // Self-heal: if generations_limit is pro-level but plan_tier wasn't written
  if (dbPlanTier === 'free' && (dbUser?.generations_limit ?? 0) >= 999) {
    console.log('[PlanResolver] self-healing: generations_limit>=999 but plan_tier=free, returning pro and writing fix');
    supabase.from('users').update({ plan_tier: 'pro' }).eq('id', userId).then(({ error }) => {
      if (error) console.warn('[PlanResolver] self-heal write failed:', error.message);
      else console.log('[PlanResolver] self-heal write succeeded: plan_tier set to pro');
    });
    return {
      planTier: 'pro' as PlanTier,
      dbPlanTier: 'pro' as PlanTier,
      generationsUsed: dbUser?.generations_used ?? 0,
      generationsLimit: dbUser?.generations_limit ?? 999,
      generationsRemaining: Math.max(0, (dbUser?.generations_limit ?? 999) - (dbUser?.generations_used ?? 0)),
    };
  }

  return {
    planTier: dbPlanTier,
    dbPlanTier,
    generationsUsed: dbUser?.generations_used ?? 0,
    generationsLimit: dbUser?.generations_limit ?? (dbPlanTier === 'pro' ? 999 : 3),
    generationsRemaining: Math.max(0, (dbUser?.generations_limit ?? (dbPlanTier === 'pro' ? 999 : 3)) - (dbUser?.generations_used ?? 0)),
  };
}