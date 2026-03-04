/**
 * revenueCatClient.ts — RevenueCat helper for Jobbo
 *
 * Uses the real @revenuecat/purchases-js SDK via lazy dynamic import
 * to avoid module-evaluation-time crashes in the Figma Make sandbox.
 * All SDK access goes through getRCInstance() which lazily configures
 * the Purchases singleton on first call.
 */

import { supabase } from './supabaseClient';

/* ─── Constants ──────────────────────────────────────────────── */
export const ENTITLEMENT_ID = 'pro';

const RC_API_KEY = 'rcb_wwFCDHTHNCPVrTYuugtaqpyFFmjJ'

/* ─── Lazy SDK access ────────────────────────────────────────── */
let _purchasesModule: typeof import('@revenuecat/purchases-js') | null = null;
let _instance: any | null = null;
let _configuredUserId: string | null = null;
let _needsReset = false;

/**
 * Suppress the async "Element has already been destroyed" error that the
 * RC SDK throws internally from a Stripe callback we can't catch.
 * We use BOTH window.onerror (returning true suppresses console output)
 * and addEventListener as a belt-and-suspenders approach.
 */
if (typeof window !== 'undefined') {
  const _origOnerror = window.onerror;
  window.onerror = function (msg, ...rest) {
    if (typeof msg === 'string' && msg.includes('already been destroyed')) {
      return true; // returning true suppresses the default console log
    }
    return _origOnerror ? (_origOnerror as any).call(this, msg, ...rest) : false;
  };

  window.addEventListener('error', (e) => {
    if (e.message?.includes?.('already been destroyed')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true); // use capture phase to intercept early

  window.addEventListener('unhandledrejection', (e) => {
    const msg = String(e.reason?.message ?? e.reason ?? '');
    if (msg.includes('already been destroyed')) {
      e.preventDefault();
    }
  }, true);
}

async function loadSDK() {
  if (!_purchasesModule) {
    _purchasesModule = await import('@revenuecat/purchases-js');
  }
  return _purchasesModule;
}

async function getRCInstance(userId: string) {
  if (!RC_API_KEY) {
    throw new Error('[RevenueCat] VITE_REVENUECAT_API_KEY is not set');
  }

  const sdk = await loadSDK();
  const Purchases = sdk.Purchases;

  // Deferred reset: close the old instance now (Stripe Elements have had time to clean up)
  if (_needsReset && _instance) {
    try { _instance.close(); } catch (_) { /* ignore */ }
    _instance = null;
    _configuredUserId = null;
    _needsReset = false;
  }

  // If already configured for this user, return existing instance
  if (_instance && _configuredUserId === userId && Purchases.isConfigured()) {
    return _instance;
  }

  // Configure (or re-configure for a different user)
  _instance = Purchases.configure({
    apiKey: RC_API_KEY,
    appUserId: userId,
  });
  _configuredUserId = userId;

  return _instance;
}

/** Tear down the singleton (call on sign-out). */
export function teardownRC(): void {
  if (_instance && typeof _instance.close === 'function') {
    try { _instance.close(); } catch (_) { /* ignore */ }
  }
  _instance = null;
  _configuredUserId = null;
}

/** Force a fresh SDK instance on next call (e.g. after purchase/cancel). */
function resetInstance(): void {
  // Don't call close() synchronously — Stripe Elements may still be mid-cleanup.
  // Instead mark for deferred reset so getRCInstance() cleans up on the next call,
  // by which time Stripe's internal teardown will have finished.
  _needsReset = true;
}

/* ─── Entitlement Check ──────────────────────────────────────── */

/**
 * Check whether the user is Pro. Tries RC SDK first, falls back to DB.
 */
export async function getProEntitlement(userId: string): Promise<boolean> {
  // Try RC SDK if API key is available
  if (RC_API_KEY) {
    try {
      const instance = await getRCInstance(userId);
      const isEntitled = await instance.isEntitledTo(ENTITLEMENT_ID);
      if (isEntitled) return true;
    } catch (err) {
      console.warn('[RevenueCat] entitlement check failed, falling back to DB:', err);
    }
  }

  // Fallback: read from DB
  try {
    const { data } = await supabase
      .from('users')
      .select('plan_tier')
      .eq('id', userId)
      .maybeSingle();
    return data?.plan_tier === 'pro';
  } catch {
    return false;
  }
}

/* ─── Customer Info ──────────────────────────────────────────── */

export interface RCCustomerInfo {
  isProActive: boolean;
  activeEntitlements: string[];
  managementURL: string | null;
  originalPurchaseDate: string | null;
  proExpirationDate: string | null;
  proWillRenew: boolean;
  raw: any;
}

export async function getCustomerInfo(userId: string): Promise<RCCustomerInfo> {
  if (RC_API_KEY) {
    try {
      const instance = await getRCInstance(userId);
      const info = await instance.getCustomerInfo();
      const proEntitlement = info.entitlements?.active?.[ENTITLEMENT_ID];
      return {
        isProActive: !!proEntitlement,
        activeEntitlements: Object.keys(info.entitlements?.active ?? {}),
        managementURL: info.managementURL ?? null,
        originalPurchaseDate: info.originalPurchaseDate ?? null,
        proExpirationDate: proEntitlement?.expirationDate?.toISOString?.() ?? null,
        proWillRenew: proEntitlement?.willRenew ?? false,
        raw: info,
      };
    } catch (err) {
      console.warn('[RevenueCat] getCustomerInfo failed:', err);
    }
  }

  // Fallback
  const isPro = await getProEntitlement(userId);
  return {
    isProActive: isPro,
    activeEntitlements: isPro ? ['pro'] : [],
    managementURL: null,
    originalPurchaseDate: null,
    proExpirationDate: null,
    proWillRenew: isPro,
    raw: null,
  };
}

/* ─── Offerings ──────────────────────────────────────────────── */

export async function getOfferings(userId: string) {
  if (!RC_API_KEY) return null;

  try {
    const instance = await getRCInstance(userId);
    const offerings = await instance.getOfferings();
    // Return the current (default) offering
    return offerings?.current ?? null;
  } catch (err) {
    console.warn('[RevenueCat] getOfferings failed:', err);
    return null;
  }
}

/* ─── Purchase ───────────────────────────────────────────────── */

export type PackageId = 'pro_monthly' | 'pro_annual';

/**
 * Open the RevenueCat / Stripe checkout for the given package.
 * This presents the payment form as a modal overlay.
 */
export async function purchasePackage(
  userId: string,
  packageId: PackageId,
  customerEmail?: string,
) {
  if (!RC_API_KEY) {
    throw new Error('[RevenueCat] VITE_REVENUECAT_API_KEY is not set. Cannot process payment.');
  }

  const instance = await getRCInstance(userId);
  const offerings = await instance.getOfferings();
  const currentOffering = offerings?.current;

  if (!currentOffering) {
    throw new Error('[RevenueCat] No current offering found. Please configure offerings in the RevenueCat dashboard.');
  }

  // Find the matching package
  const rcPackage = currentOffering.availablePackages.find((pkg: any) => {
    const id = (pkg.identifier || '').toLowerCase();
    if (packageId === 'pro_monthly') {
      return id.includes('month') || id === '$rc_monthly';
    }
    if (packageId === 'pro_annual') {
      return id.includes('annual') || id.includes('year') || id === '$rc_annual';
    }
    return false;
  });

  if (!rcPackage) {
    throw new Error(`[RevenueCat] Package "${packageId}" not found in current offering.`);
  }

  try {
    const result = await instance.purchase({
      rcPackage,
      customerEmail,
    });

    // After successful purchase, sync to DB
    try {
      await supabase
        .from('users')
        .update({ plan_tier: 'pro', generations_limit: 999 })
        .eq('id', userId);
    } catch (err) {
      console.warn('[RevenueCat] DB sync after purchase failed (webhook will handle):', err);
    }

    // Mark for reset after success so next purchase gets fresh Stripe Elements
    resetInstance();

    return result;
  } catch (err: any) {
    // Mark for deferred reset so the NEXT attempt gets a fresh instance
    resetInstance();
    throw err;
  }
}

/* ─── Management URL ─────────────────────────────────────────── */

export async function getManagementURL(userId: string): Promise<string | null> {
  if (!RC_API_KEY) return null;

  try {
    const info = await getCustomerInfo(userId);
    return info.managementURL;
  } catch {
    return null;
  }
}