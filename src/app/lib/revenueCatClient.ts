/**
 * revenueCatClient.ts — Shared RevenueCat helper for Jobbo
 *
 * Wraps the @revenuecat/purchases-js SDK into simple async functions.
 * Every function takes a userId so the singleton auto-configures.
 *
 * IMPORTANT: The SDK is loaded lazily via dynamic import() to prevent
 * the app from crashing if the package fails to evaluate in restricted
 * environments (e.g. Figma sandbox).
 */

/* ─── Constants ──────────────────────────────────────────────── */
const RC_API_KEY = 'rcb_sb_AHJGFykqOSlnavormHshUuumv';
export const ENTITLEMENT_ID = 'pro';

/* ─── Lazy SDK loader ────────────────────────────────────────── */
let _PurchasesClass: any = null;
let _sdkLoadPromise: Promise<any> | null = null;

async function loadPurchasesSDK(): Promise<any> {
  if (_PurchasesClass) return _PurchasesClass;
  if (_sdkLoadPromise) return _sdkLoadPromise;

  _sdkLoadPromise = import('@revenuecat/purchases-js')
    .then((mod) => {
      _PurchasesClass = mod.Purchases;
      console.log('[RevenueCat] SDK loaded successfully');
      return _PurchasesClass;
    })
    .catch((err) => {
      console.warn('[RevenueCat] SDK failed to load:', err);
      _sdkLoadPromise = null; // allow retry
      throw err;
    });

  return _sdkLoadPromise;
}

/* ─── Singleton ──────────────────────────────────────────────── */
let instance: any = null;
let configuredUserId: string | null = null;

/**
 * Get (or create) a configured Purchases instance for the given user.
 * Reconfigures only when userId changes.
 */
async function getRCInstance(userId: string): Promise<any> {
  if (!RC_API_KEY) {
    throw new Error('[RevenueCat] API key is not set');
  }
  if (instance && configuredUserId === userId) return instance;

  const Purchases = await loadPurchasesSDK();
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
    const rc = await getRCInstance(userId);
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
  const rc = await getRCInstance(userId);
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
  const rc = await getRCInstance(userId);
  const result = await rc.getOfferings();
  return result.all['jobbo-offerings'] ?? result.current;
}

/* ─── Purchase ───────────────────────────────────────────────── */

export type PackageId = 'pro_monthly' | 'pro_annual';

export async function purchasePackage(
  userId: string,
  packageId: PackageId,
  customerEmail?: string,
) {
  const rc = await getRCInstance(userId);
  const offeringsResult = await rc.getOfferings();

  // Use the specific jobbo-offerings, fall back to current
  const offering =
    offeringsResult.all['jobbo-offerings'] ??
    offeringsResult.current;

  if (!offering) {
    throw new Error('No offering found in RevenueCat');
  }

  console.log('[RC] offering:', offering.identifier);
  console.log('[RC] packages:',
    offering.availablePackages.map((p: any) => ({
      packageId: p.identifier,
      productId: p.rcBillingProduct?.identifier,
      price: p.rcBillingProduct?.currentPrice?.formattedPrice,
    }))
  );

  // Map our internal IDs to RC package identifiers
  const packageIdentifierMap: Record<PackageId, string[]> = {
    pro_monthly: ['$rc_monthly', 'pro_monthly', 'jobbo_pro_monthly'],
    pro_annual:  ['$rc_annual',  'pro_annual',  'jobbo_pro_annual'],
  };

  const candidateIds = packageIdentifierMap[packageId];

  const pkg = offering.availablePackages.find((p: any) =>
    candidateIds.includes(p.identifier)
  );

  if (!pkg) {
    throw new Error(
      `Package not found for "${packageId}". ` +
      `Available: ${offering.availablePackages.map((p: any) => p.identifier).join(', ')}`
    );
  }

  console.log('[RC] purchasing package:', pkg.identifier);
  const result = await rc.purchase({
    rcPackage: pkg,
    ...(customerEmail ? { customerEmail } : {}),
  });
  return result;
}

/* ─── Management URL ─────────────────────────────────────────── */

export async function getManagementURL(userId: string): Promise<string | null> {
  const rc = await getRCInstance(userId);
  const info = await rc.getCustomerInfo();
  return info.managementURL;
}
