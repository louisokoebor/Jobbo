Update src/app/lib/revenueCatClient.ts and src/app/components/BillingPage.tsx 
to use real RevenueCat Web Billing with Stripe. The RC dashboard is fully 
configured with Stripe connected and live products set up.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 1 — revenueCatClient.ts: use env var for API key
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Replace the hardcoded RC_API_KEY line with:
  const RC_API_KEY = import.meta.env.VITE_REVENUECAT_API_KEY;

Then add this guard at the top of getRCInstance():
  if (!RC_API_KEY) {
    throw new Error('[RevenueCat] VITE_REVENUECAT_API_KEY is not set');
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 2 — revenueCatClient.ts: pass customerEmail to purchase
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Update the purchasePackage function signature to accept an optional email:
  export async function purchasePackage(
    userId: string,
    packageId: PackageId,
    customerEmail?: string,
  )

When calling rc.purchase(), pass the email to skip the email collection 
step in Stripe's payment sheet (better UX since we already have it):
  const result = await rc.purchase({ 
    rcPackage: pkg,
    ...(customerEmail ? { customerEmail } : {}),
  });

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 3 — revenueCatClient.ts: log available packages on every call
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Inside purchasePackage(), after fetching offerings, always log:
  console.log('[RC] current offering:', offerings.current?.identifier);
  console.log('[RC] available packages:', 
    offerings.current?.availablePackages.map((p: any) => ({
      id: p.identifier,
      product: p.rcBillingProduct?.identifier,
      price: p.rcBillingProduct?.currentPrice?.formattedPrice,
    }))
  );

This lets us confirm in DevTools that the right products and prices are 
loading from the connected Stripe account.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 4 — BillingPage.tsx: pass user email to purchasePackage
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When fetching the user on mount, also store their email in state:
  const [userEmail, setUserEmail] = useState<string | null>(null);

In the init() function, after getting the user:
  setUserEmail(user.email ?? null);

In handlePurchase(), pass the email:
  await purchasePackage(userId, packageId, userEmail ?? undefined);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 5 — BillingPage.tsx: full post-purchase state update
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Replace the entire try block inside handlePurchase() with this logic:

  try {
    await purchasePackage(userId, packageId, userEmail ?? undefined);

    // 1. Optimistically update DB
    await supabase
      .from('users')
      .update({ plan_tier: 'pro' })
      .eq('id', userId);

    // 2. Confirm with RC as source of truth
    const isPro = await getProEntitlement(userId);

    // 3. Update all plan state atomically
    setRcIsPro(isPro);
    setActivePlanId(packageId);
    setPlan(prev => ({ ...prev, planTier: isPro ? 'pro' : prev.planTier }));

    // 4. Show success message for 5 seconds
    setSuccessMsg("You're now on Pro! 🎉");
    successTimerRef.current = setTimeout(() => setSuccessMsg(null), 5000);

  } catch (err: any) {
    const msg: string = err?.message ?? '';
    const wasCancelled =
      err?.userCancelled === true ||
      msg.includes('PURCHASE_CANCELLED') ||
      msg.includes('USER_CANCELLED') ||
      msg.toLowerCase().includes('cancel') ||
      err?.code === 'PURCHASE_CANCELLED';

    if (!wasCancelled) {
      setPurchaseError(msg || 'Payment failed. Please try again.');
    }
    // If cancelled: silently reset, no error shown
  } finally {
    setPurchasingId(null);
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 6 — BillingPage.tsx: track which plan is active
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add new state at the top of the component:
  const [activePlanId, setActivePlanId] = useState<PackageId | 'free'>('free');

On mount, after determining isPro, set it:
  if (isPro) {
    // Try to detect monthly vs annual from RC customer info
    // Default to pro_monthly if we can't tell
    setActivePlanId('pro_monthly');
  } else {
    setActivePlanId('free');
  }

Pass activePlanId to each PlanCompareCard's isCurrent prop:
  Free card:      isCurrent={activePlanId === 'free'}
  Pro Monthly:    isCurrent={activePlanId === 'pro_monthly'}
  Pro Annual:     isCurrent={activePlanId === 'pro_annual'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 7 — BillingPage.tsx: fix pound sign display
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All price displays must use &pound; HTML entity, never the £ character:
  Free card price:        &pound;0
  Pro Monthly price:      &pound;9<span>/mo</span>
  Pro Annual price:       &pound;6.60<span>/mo</span>
  Pro Annual sub-price:   &pound;79 billed annually

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 8 — BillingPage.tsx: hide upgrade buttons when already Pro
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When isPro is true (plan.planTier === 'pro'):
- Pro Monthly card: do not render the Upgrade button at all
- Pro Annual card: do not render the Upgrade button at all
- Free card: show a disabled "Downgrade" text or just hide the CTA entirely
  (users manage cancellation via the "Manage Subscription" button in 
  the current plan card, not by clicking Free)

When isPro is false:
- Free card: show disabled "Current Plan" button  
- Pro Monthly: show "Upgrade →" button
- Pro Annual: show "Upgrade →" button

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AFTER APPLYING — how to test
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Make sure VITE_REVENUECAT_API_KEY is set in Figma Make environment 
   variables to your live rcb_ key from RevenueCat dashboard.
2. Click Upgrade on Pro Monthly.
3. A real Stripe payment form should now appear (not the test store modal).
4. Use test card 4242 4242 4242 4242, any future date, any CVC.
5. After payment: plan card should switch to Pro, success message appears.
6. Check browser console for [RC] available packages log to confirm 
   correct products and GBP prices are loading from Stripe.