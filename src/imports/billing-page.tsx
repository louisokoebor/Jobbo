Build the Billing & Plan page for Jobbo at src/app/components/BillingPage.tsx.
Also create src/app/lib/revenueCatClient.ts as a shared RC helper.
Add the route { path: '/billing', Component: BillingPage } to src/app/routes.tsx.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILE 1 — src/app/lib/revenueCatClient.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Import { Purchases } from '@revenuecat/purchases-js'.

Export an async function getRCInstance(userId: string) that calls:
  Purchases.configure({
    apiKey: import.meta.env.VITE_REVENUECAT_API_KEY,
    appUserId: userId,
  })
and returns the instance.

Export async function getProEntitlement(userId: string):
  - Calls getRCInstance(userId)
  - Calls instance.getCustomerInfo()
  - Returns true if entitlements.active['pro'] exists, false otherwise

Export async function getOfferings(userId: string):
  - Calls getRCInstance(userId)
  - Calls instance.getOfferings()
  - Returns current offering

Export async function purchasePackage(userId: string, packageId: 'pro_monthly' | 'pro_annual'):
  - Gets offerings
  - Finds package where pkg.identifier === packageId
  - Calls instance.purchase({ rcPackage: pkg })
  - RevenueCat renders its own Stripe payment sheet — no custom form needed
  - Returns the result

Export async function getManagementURL(userId: string):
  - Gets RC instance
  - Calls instance.getManagementURL()
  - Returns the URL string

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILE 2 — src/app/components/BillingPage.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPORTS: React hooks, useNavigate from react-router, lucide-react icons
(Check, X, Infinity, Lock, Zap, ChevronRight, Loader2), supabase from
../lib/supabaseClient, and all four exports from ../lib/revenueCatClient.

THEME: Read 'jobbo-theme' from localStorage. isDark = theme === 'dark'.
Same dark/light CSS variables as the rest of the app.

ON MOUNT:
1. Call supabase.auth.getUser(). If no user, navigate('/login').
2. Call supabase.from('users').select('plan_tier, generations_used,
   generations_limit').eq('id', user.id).single() to get DB plan state.
3. Call getProEntitlement(user.id) to get live RC entitlement status.
4. If RC says pro but DB says free (or vice versa), trust RC as source
   of truth — update local state to match RC.
5. Set loading = false.

LAYOUT: max-width 720px, centred, padding 40px 24px.
Same sticky nav as other pages (Jobbo logo left, back arrow right).

PAGE HEADER:
  "Billing & Plan" — Inter 600 28px
  "Manage your subscription and usage" — secondary 14px
  margin-bottom 40px

CURRENT PLAN CARD (glass treatment — same spec as rest of app):
  Show skeleton shimmer (animated gradient) while loading = true.
  When loaded, show two columns:

  LEFT COLUMN:
    - Badge pill: "Free Plan" (surface bg, secondary text) or
      "Pro Plan" (brand blue #1A56DB bg, white text, Zap icon)
      Inter 600 13px, border-radius 20px, padding 4px 12px
    - Plan name: "Free" or "Pro" — Inter 700 22px
    - If Pro: "Active since [date]" — secondary 13px
    - If Pro: "Next billing: [date]" — secondary 12px

  RIGHT COLUMN:
    - If Free: label "CV Generations" uppercase secondary 11px,
      progress bar 240px wide 8px tall border-radius 4px,
      track rgba surface, fill #1A56DB (red #EF4444 if 100%),
      "{used} of {limit} used" secondary 13px below
    - If Pro: Infinity icon (green) + "Unlimited generations" secondary 13px
    - If Pro: ghost button "Manage Subscription →" that calls
      getManagementURL(userId) then opens URL in new tab

PLAN COMPARISON — section header "Plans" Inter 600 20px, margin-bottom 20px
Three equal-width cards in a row (gap 16px, flex-wrap for mobile):

Card spec: surface bg, border 1px border-colour, border-radius 12px,
padding 24px, flex-column, gap 20px.
Current plan card: border 2px #1A56DB, box-shadow blue glow.
Pro Annual card: "Best Value" green pill top-right corner.
Current plan card: "Current Plan" pill top-right corner (blue tint).

FREE card:
  Name "Free" — Inter 700 18px
  Price "£0" — Inter 700 28px
  Features list (see below)
  CTA: disabled button "Current Plan" if user is free, else nothing
       (free users cannot downgrade from pro, but show the card)

PRO MONTHLY card:
  Name "Pro Monthly" — Inter 700 18px
  Price "£9/mo" — Inter 700 28px
  Features list
  CTA: "Upgrade →" primary button — calls purchasePackage(userId, 'pro_monthly')
       Show Loader2 spinner on button while purchase is in-flight
       On success: refresh plan state, show success message

PRO ANNUAL card:
  Name "Pro Annual" — Inter 700 18px
  Price "£6.60/mo" — Inter 700 28px
  Sub-price "£79 billed annually" — secondary 12px
  Features list
  CTA: "Upgrade →" primary button — calls purchasePackage(userId, 'pro_annual')
       Same loading/success behaviour as monthly

FEATURES LIST (same for all three cards, value differs per plan):
Each row: Check icon (green #10B981) or X icon (secondary/muted) + label text 13px
If value is a string (not just true/false), append " — [value]" in secondary colour.

Feature            | Free        | Pro
-------------------|-------------|------------------
CV generations     | 3 lifetime  | Unlimited
Cover letters      | ✗           | ✓
Base CV profiles   | 1           | 3
CV templates       | 1           | All 3
Doc upload         | ✗           | Up to 5
Civil Service Mode | ✗           | ✓
App tracker        | 10 apps     | Unlimited
Interview notes    | ✗           | ✓
App history        | 30 days     | Unlimited

PAYMENT FOOTER (centred, margin-top 48px):
  Lock icon + "Payments processed securely by RevenueCat & Stripe" — secondary 13px
  "Cancel anytime from your account" — secondary/muted 12px

ERROR HANDLING:
  If purchasePackage throws, catch the error. If error message includes
  'PURCHASE_CANCELLED' or 'USER_CANCELLED', silently reset button state —
  the user just closed the payment sheet. For any other error, show a red
  inline error message below the button.

AFTER SUCCESSFUL PURCHASE:
  1. Call supabase.from('users').update({ plan_tier: 'pro' }).eq('id', userId)
     to sync the DB immediately (webhook will also fire, but this is instant UX).
  2. Refresh plan state from RC by calling getProEntitlement(userId) again.
  3. Show a brief success state on the card ("You're now on Pro! 🎉").

ANIMATIONS:
  - Page entrance: fade-up 0.3s ease-out
  - Shimmer skeleton on plan card while loading
  - Progress bar width animates on load (transition: width 0.6s ease)
  - Upgrade buttons scale(0.97) on active press