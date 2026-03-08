Fix the package lookup in src/app/lib/revenueCatClient.ts to match 
the exact RevenueCat dashboard configuration.

The offering identifier is: applyly-offerings
The packages are:
  - Package identifier: $rc_annual  → Product: applyly_pro_annual
  - Package identifier: $rc_monthly → Product: applyly_pro_monthly

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 1 — fetch the correct offering by identifier
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In purchasePackage(), replace the offerings fetch with:

  const offeringsResult = await rc.getOfferings();
  
  // Use the specific applyly-offerings, fall back to current
  const offering = 
    offeringsResult.all['applyly-offerings'] ?? 
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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 2 — map packageId to correct RC package identifier
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Replace the package lookup logic with this exact mapping:

  // Map our internal IDs to RC package identifiers
  const packageIdentifierMap: Record<PackageId, string[]> = {
    pro_monthly: ['$rc_monthly', 'pro_monthly', 'applyly_pro_monthly'],
    pro_annual:  ['$rc_annual',  'pro_annual',  'applyly_pro_annual'],
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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 3 — also update getOfferings() helper
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Update the existing getOfferings() function to also prefer applyly-offerings:

  export async function getOfferings(userId: string) {
    const rc = getRCInstance(userId);
    const result = await rc.getOfferings();
    return result.all['applyly-offerings'] ?? result.current;
  }