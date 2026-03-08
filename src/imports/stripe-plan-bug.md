BUG: After a successful Stripe checkout, plan shows Pro briefly 
then reverts to Free in the UI. However generations_limit updates 
correctly to 999 in the database. plan_tier stays as 'free' in DB.

SYMPTOMS:
- Stripe checkout completes successfully
- UI briefly shows Pro state
- UI then reverts to showing Free
- DB: generations_limit = 999 (correct)
- DB: plan_tier = 'free' (not updated)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — DIAGNOSE BEFORE FIXING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before making any changes, read all of these files and trace 
the full post-purchase flow:

- src/app/components/BillingPage.tsx
- src/app/lib/UserPlanContext.tsx (or equivalent plan state file)
- supabase/functions/stripe-webhook/index.ts (or wherever 
  the stripe webhook handler lives)
- supabase/functions/server/index.tsx (the create-checkout-session 
  endpoint specifically)
- Any other file that reads or writes plan_tier

Answer these questions through code inspection:

1. In the stripe webhook handler — is plan_tier being updated 
   in the same .update() call as generations_limit, or in a 
   separate call? If separate, could one be succeeding and the 
   other failing silently?

2. In create-checkout-session — is supabase_user_id being passed 
   in the session metadata? Log what metadata is actually being set.

3. In the webhook handler — is it matching the user by 
   supabase_user_id from metadata, or by stripe_customer_id, 
   or something else? Could the match be failing silently 
   (no rows matched = no error, just no update)?

4. In BillingPage — after redirect back from Stripe with 
   ?success=true, what sequence of state updates happens? 
   Is there anything that could SET plan_tier to 'pro' 
   optimistically and then a subsequent Supabase read 
   OVERWRITE it back to 'free'?

5. In UserPlanContext — is there a useEffect, subscription, 
   or polling interval that re-reads plan_tier from Supabase 
   periodically? Could it be reading the DB before the webhook 
   has updated plan_tier and caching 'free'?

6. The fact that generations_limit updates to 999 but plan_tier 
   stays free is the most important clue. Are these written by 
   the SAME code path or different ones? If the same .update() 
   call writes both, they should both succeed or both fail — 
   so if only one is updating something else is overwriting 
   plan_tier back to 'free' AFTER the webhook runs.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — ADD DIAGNOSTIC LOGGING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before fixing anything, add logging to confirm the diagnosis:

In the stripe webhook handler, after the .update() call add:
  console.log('[webhook] update payload:', { plan_tier: 'pro', generations_limit: 999 });
  console.log('[webhook] update result:', JSON.stringify(data));
  console.log('[webhook] update error:', JSON.stringify(error));
  console.log('[webhook] userId used for match:', userId);

Use .update({ plan_tier: 'pro', generations_limit: 999 })
.eq('id', userId)
.select('id, plan_tier, generations_limit')
so the returned data confirms what was actually written.

In BillingPage, log every plan_tier state change:
  console.log('[BillingPage] plan state changed:', plan);

In UserPlanContext, log every time plan is fetched from DB:
  console.log('[UserPlanContext] fetched plan:', data?.plan_tier);

Run a test purchase and share the console output — the logs 
will pinpoint exactly where the reversion happens.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — FIX BASED ON WHAT YOU FIND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Based on the diagnosis in Steps 1-2, apply the appropriate fix.
The most likely causes in order of probability are:

SCENARIO A — Webhook is not updating plan_tier at all
(generations_limit updates via a different code path, 
plan_tier update is silently failing — no row match):
  Fix: Add .select() after .update() to confirm rows matched.
  Check userId in metadata matches the actual Supabase user id.
  Add: console.log('[webhook] rows updated:', data?.length)

SCENARIO B — Webhook updates plan_tier but UserPlanContext 
overwrites it back to free (race condition):
  Fix: In UserPlanContext, after the Stripe redirect success,
  delay the automatic refetch by 5 seconds to give the webhook 
  time to complete. Or expose a refreshPlan() function and call 
  it explicitly from BillingPage after polling confirms pro in DB.

SCENARIO C — Two separate .update() calls — one for 
generations_limit (succeeding) and one for plan_tier (failing):
  Fix: Merge into a single .update() call that sets both fields 
  atomically.

SCENARIO D — BillingPage optimistic update sets plan_tier='pro' 
in UI state but does NOT write it to the DB, then a DB read 
overwrites it:
  Fix: Ensure the optimistic supabase.update() call includes 
  plan_tier: 'pro' alongside generations_limit: 999.

SCENARIO E — Something else entirely:
  Fix whatever the logs reveal. The logging in Step 2 should 
  make the cause unambiguous.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Do not change any UI, layout, or other screens
- Do not change auth flow or routing
- Diagnose first, fix second — do not apply speculative fixes
- The logging added in Step 2 can be left in temporarily 
  for testing, but note where it is so it can be cleaned up later