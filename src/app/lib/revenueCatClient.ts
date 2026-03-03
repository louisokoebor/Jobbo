/**
 * revenueCatClient.ts — Shared RevenueCat helper for Jobbo
 *
 * Wraps the @revenuecat/purchases-js SDK into simple async functions.
 * Every function takes a userId so the singleton auto-configures.
 */

import { Purchases } from '@revenuecat/purchases-js';

/* ─── Constants ──────────────────────────────────────────────── */
const RC_API_KEY = 'test_DkPyRtPqsSoMNcckXEeepcvpYow';
export const ENTITLEMENT_ID = 'pro';

/* ─── Singleton ──────────────────────────────────────────────── */
let instance: Purchases | null = null;
let configuredUserId: string | null = null;

/**
 * Get (or create) a configured Purchases instance for the given user.
 * Reconfigures only when userId changes.
 */
export function getRCInstance(userId: string): Purchases {
  if (instance && configuredUserId === userId) return instance;

  console.log('[RevenueCat] Configuring for user:', userId);
  instance = Purchases.configure(RC_API_KEY, userId);
  configuredUserId = userId;
  return instance;
}

/** Tear down the singleton (call on sign-out). */
export function teardownRC(): void {
  instance = null;
  configuredUserId = null;
  console.log('[RevenueCat] Torn down');
}

/* ─── Entitlement Check ──────────────────────────────────────── */

/**
 * Returns true if the user has the "pro" entitlement active.
 */
export async function getProEntitlement(userId: string): Promise<boolean> {
  try {
    const rc = getRCInstance(userId);
    const info = await rc.getCustomerInfo();
    return !!info.entitlements.active[ENTITLEMENT_ID];
  } catch (err) {
    console.error('[RevenueCat] getProEntitlement error:', err);
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
  const rc = getRCInstance(userId);
  const info = await rc.getCustomerInfo();
  const pro = info.entitlements.active[ENTITLEMENT_ID] || null;

  return {
    isProActive: !!pro,
    activeEntitlements: Object.keys(info.entitlements.active),
    managementURL: info.managementURL,
    originalPurchaseDate: info.originalPurchaseDate,
    proExpirationDate: pro?.expirationDate || null,
    proWillRenew: pro?.willRenew ?? false,
    raw: info,
  };
}

/* ─── Offerings ──────────────────────────────────────────────── */

export async function getOfferings(userId: string) {
  const rc = getRCInstance(userId);
  const offerings = await rc.getOfferings();
  return offerings.current;
}

/* ─── Purchase ───────────────────────────────────────────────── */

export type PackageId = 'pro_monthly' | 'pro_annual';

export async function purchasePackage(
  userId: string,
  packageId: PackageId,
) {
  const rc = getRCInstance(userId);
  const offerings = await rc.getOfferings();

  if (!offerings.current) {
    throw new Error('No current offering configured in RevenueCat');
  }

  const pkg = offerings.current.availablePackages.find(
    (p: any) => p.identifier === packageId,
  );

  if (!pkg) {
    // Fallback: try matching by $rc_ convention
    const rcId =
      packageId === 'pro_monthly' ? '$rc_monthly' :
      packageId === 'pro_annual' ? '$rc_annual' : packageId;

    const fallbackPkg = offerings.current.availablePackages.find(
      (p: any) => p.identifier === rcId,
    );

    if (!fallbackPkg) {
      throw new Error(
        `Package "${packageId}" not found. Available: ${offerings.current.availablePackages.map((p: any) => p.identifier).join(', ')}`,
      );
    }

    // RevenueCat renders its own Stripe payment sheet — no custom form needed
    const result = await rc.purchase({ rcPackage: fallbackPkg });
    return result;
  }

  const result = await rc.purchase({ rcPackage: pkg });
  return result;
}

/* ─── Management URL ─────────────────────────────────────────── */

export async function getManagementURL(userId: string): Promise<string | null> {
  const rc = getRCInstance(userId);
  const info = await rc.getCustomerInfo();
  return info.managementURL;
}
