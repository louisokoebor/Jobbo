Fix BillingPage.tsx — the page shows "Free Plan" and Upgrade buttons 
for users who are already Pro in the database. The purchase flow works 
correctly, but on initial page load the plan state is not being read 
correctly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROOT CAUSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The init() function fetches plan_tier from Supabase AND checks RC 
entitlement. If the RC check fails or returns false (e.g. RC API key 
not set, or RC hasn't synced yet), the code overwrites the DB pro 
status with free. We need to trust EITHER source — if DB says pro OR 
RC says pro, the user is pro.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 1 — Trust DB OR RC, whichever says pro
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the init() function, replace the "trust RC over DB" logic with:

  // User is pro if EITHER source says so
  const isPro = dbPlan.planTier === 'pro' || rcIsPro;

  // Always set plan to pro if either source confirms it
  if (isPro) {
    dbPlan.planTier = 'pro';
  }

  setRcIsPro(isPro);
  setPlan(dbPlan);

  // Set activePlanId based on confirmed pro status
  setActivePlanId(isPro ? 'pro_monthly' : 'free');

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 2 — Make isPro derived from plan state, not a separate variable
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Replace the line:
  const isPro = plan.planTier === 'pro';

With:
  const isPro = plan.planTier === 'pro' || rcIsPro;

This ensures the UI always reflects the most permissive state from 
either source.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 3 — isCurrent and button logic based on activePlanId
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The three plan cards must use activePlanId for isCurrent:
  Free card:       isCurrent={activePlanId === 'free'}
  Pro Monthly:     isCurrent={activePlanId === 'pro_monthly'}
  Pro Annual:      isCurrent={activePlanId === 'pro_annual'}

The Upgrade button must only show when the user is NOT pro:
  Pro Monthly card: only render Upgrade button if !isPro
  Pro Annual card:  only render Upgrade button if !isPro
  
When isPro is true, both Pro cards should show no CTA button at all.
The Free card should show a disabled "Current Plan" button only when 
activePlanId === 'free'.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 4 — Current plan card reflects pro status on load
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The top "current plan" glass card uses isPro to decide what to render.
Since isPro is now derived from plan.planTier OR rcIsPro, this should 
update automatically once plan state is set correctly in init().

Double-check that the glass card renders:
- When isPro = true: "Pro Plan" blue badge, "Pro" title, 
  infinity icon + "Unlimited generations", "Manage Subscription →" button
- When isPro = false: "Free Plan" badge, "Free" title, 
  usage progress bar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 5 — Add console logs to debug plan load
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

At the end of init(), add:
  console.log('[BillingPage] DB plan_tier:', dbUser?.plan_tier);
  console.log('[BillingPage] RC isPro:', rcIsPro);  
  console.log('[BillingPage] final isPro:', isPro);
  console.log('[BillingPage] activePlanId:', isPro ? 'pro_monthly' : 'free');

This lets us confirm in DevTools that both sources are being read correctly.