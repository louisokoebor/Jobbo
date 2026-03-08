Replace the RevenueCat billing integration in Applyly with direct Stripe 
integration. Remove all RevenueCat code and replace with Stripe Checkout 
and Stripe Customer Portal.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILES TO DELETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Delete src/app/lib/revenueCatClient.ts entirely.
Remove @revenuecat/purchases-js from package.json.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILE 1 — New Supabase Edge Function: stripe-webhook
Create at supabase/functions/stripe-webhook/index.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import Stripe from 'npm:stripe';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    );
  } catch (err) {
    console.error('Webhook signature failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  console.log('[Stripe Webhook] event type:', event.type);

  // checkout.session.completed — user just paid
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.supabase_user_id;
    const customerId = session.customer as string;

    if (!userId) {
      console.error('No supabase_user_id in session metadata');
      return new Response('Missing metadata', { status: 400 });
    }

    // Get subscription to find expiry
    const subscription = await stripe.subscriptions.retrieve(
      session.subscription as string
    );

    await supabase.from('users').update({
      plan_tier: 'pro',
      generations_limit: 999,
      stripe_customer_id: customerId,
      plan_expires_at: new Date(
        subscription.current_period_end * 1000
      ).toISOString(),
    }).eq('id', userId);

    console.log('[Stripe Webhook] upgraded user to pro:', userId);
  }

  // customer.subscription.deleted or payment_failed — downgrade
  if (
    event.type === 'customer.subscription.deleted' ||
    event.type === 'invoice.payment_failed'
  ) {
    const obj = event.data.object as any;
    const customerId = obj.customer as string;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .single();

    if (user) {
      await supabase.from('users').update({
        plan_tier: 'free',
        generations_limit: 3,
        plan_expires_at: null,
      }).eq('id', user.id);

      console.log('[Stripe Webhook] downgraded user to free:', user.id);
    }
  }

  // customer.subscription.updated — renewal, update expiry
  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .single();

    if (user) {
      await supabase.from('users').update({
        plan_expires_at: new Date(
          subscription.current_period_end * 1000
        ).toISOString(),
      }).eq('id', user.id);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILE 2 — Add two routes to the existing Supabase Edge Function server
Add these two endpoints to supabase/functions/server/index.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add at the top with other imports:
  import Stripe from 'npm:stripe';
  function stripe() {
    return new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
  }

Add these two route handlers:

// ── Create Stripe Checkout Session ──────────────────────────────
app.post('/make-server-3bbff5cf/create-checkout-session', async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ success: false, error: 'unauthorized' }, 401);

  const { priceId, planId } = await c.req.json();
  if (!priceId) return c.json({ success: false, error: 'priceId required' }, 400);

  // Get user email from Supabase
  const { data: userData } = await sb()
    .from('users')
    .select('email, stripe_customer_id')
    .eq('id', userId)
    .single();

  try {
    // Reuse existing Stripe customer if available
    let customerId = userData?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe().customers.create({
        email: userData?.email,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;
    }

    const session = await stripe().checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${c.req.header('origin') || 'https://applyly.figma.site'}/billing?success=true&plan=${planId}`,
      cancel_url: `${c.req.header('origin') || 'https://applyly.figma.site'}/billing?cancelled=true`,
      metadata: {
        supabase_user_id: userId,
        plan_id: planId,
      },
      allow_promotion_codes: true,
    });

    return c.json({ success: true, url: session.url });
  } catch (err: any) {
    console.error('Checkout session error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ── Create Stripe Customer Portal Session ───────────────────────
app.post('/make-server-3bbff5cf/create-portal-session', async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ success: false, error: 'unauthorized' }, 401);

  const { data: userData } = await sb()
    .from('users')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (!userData?.stripe_customer_id) {
    return c.json({ success: false, error: 'No Stripe customer found' }, 404);
  }

  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: userData.stripe_customer_id,
      return_url: `${c.req.header('origin') || 'https://applyly.figma.site'}/billing`,
    });

    return c.json({ success: true, url: session.url });
  } catch (err: any) {
    console.error('Portal session error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILE 3 — Rewrite src/app/components/BillingPage.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Remove all RevenueCat imports and references.
Replace with this Stripe-based logic:

CONSTANTS — add at top of file:
  const STRIPE_PRICE_MONTHLY = import.meta.env.VITE_STRIPE_PRICE_MONTHLY;
  const STRIPE_PRICE_ANNUAL = import.meta.env.VITE_STRIPE_PRICE_ANNUAL;
  const SERVER_URL = '/make-server-3bbff5cf';

  // Helper to get auth token for API calls
  async function getAuthToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

ON MOUNT — replace RC logic with pure Supabase read:
  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate('/login'); return; }
    setUserId(user.id);
    setUserEmail(user.email ?? null);

    const { data } = await supabase
      .from('users')
      .select('plan_tier, generations_used, generations_limit, stripe_customer_id')
      .eq('id', user.id)
      .single();

    const isPro = data?.plan_tier === 'pro';

    setPlan({
      planTier: isPro ? 'pro' : 'free',
      generationsUsed: data?.generations_used ?? 0,
      generationsLimit: data?.generations_limit ?? 3,
    });
    setActivePlanId(isPro ? 'pro_monthly' : 'free');
    setHasStripeCustomer(!!data?.stripe_customer_id);
    setLoading(false);

    // Check URL params for success/cancel redirect from Stripe
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      // Stripe redirected back after successful payment
      // Plan may not be updated yet (webhook can be slightly delayed)
      // Show success message and poll for up to 10 seconds
      setSuccessMsg("Payment successful! Your plan is being activated...");
      pollForProUpgrade(user.id);
    }
    if (params.get('cancelled') === 'true') {
      // Clean URL
      window.history.replaceState({}, '', '/billing');
    }
  }

Add this polling function inside the component:
  async function pollForProUpgrade(userId: string) {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const { data } = await supabase
        .from('users')
        .select('plan_tier, generations_limit')
        .eq('id', userId)
        .single();

      if (data?.plan_tier === 'pro') {
        setPlan(prev => ({ 
          ...prev, 
          planTier: 'pro',
          generationsLimit: data.generations_limit ?? 999,
        }));
        setActivePlanId('pro_monthly');
        setSuccessMsg("You're now on Pro! 🎉");
        window.history.replaceState({}, '', '/billing');
        setTimeout(() => setSuccessMsg(null), 5000);
        return;
      }
    }
    // After 15s still not updated — optimistically set pro
    setPlan(prev => ({ ...prev, planTier: 'pro', generationsLimit: 999 }));
    setActivePlanId('pro_monthly');
    setSuccessMsg("You're now on Pro! 🎉");
    window.history.replaceState({}, '', '/billing');
    setTimeout(() => setSuccessMsg(null), 5000);
  }

REPLACE handlePurchase with handleUpgrade:
  const handleUpgrade = async (planId: 'pro_monthly' | 'pro_annual') => {
    setPurchasingId(planId);
    setPurchaseError(null);

    try {
      const token = await getAuthToken();
      const priceId = planId === 'pro_monthly' 
        ? STRIPE_PRICE_MONTHLY 
        : STRIPE_PRICE_ANNUAL;

      const res = await fetch(`${SERVER_URL}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId, planId }),
      });

      const data = await res.json();
      if (!data.success || !data.url) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;

    } catch (err: any) {
      setPurchaseError(err.message || 'Something went wrong. Please try again.');
      setPurchasingId(null);
    }
    // Note: don't reset purchasingId on success — page will redirect
  };

REPLACE handleManage with:
  const handleManage = async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${SERVER_URL}/create-portal-session`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Portal error:', err);
    }
  };

PAYMENT FOOTER — update text to:
  "Payments processed securely by Stripe"

Remove all RevenueCat references from the footer.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENVIRONMENT VARIABLES NEEDED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add these to Figma Make environment variables:
  VITE_STRIPE_PRICE_MONTHLY=price_xxx   (your Stripe monthly price ID)
  VITE_STRIPE_PRICE_ANNUAL=price_xxx    (your Stripe annual price ID)

Add these to Supabase Edge Function secrets:
  STRIPE_SECRET_KEY=sk_test_xxx
  STRIPE_WEBHOOK_SECRET=whsec_xxx

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATABASE — run this SQL in Supabase SQL Editor
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS generations_limit INTEGER NOT NULL DEFAULT 3;

-- Fix existing pro users
UPDATE public.users SET generations_limit = 999 WHERE plan_tier = 'pro';

-- Index for webhook lookups
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id 
ON public.users(stripe_customer_id);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALSO — enable Stripe Customer Portal
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Go to Stripe Dashboard → Settings → Billing → Customer Portal
→ Activate the portal. This must be enabled for the portal 
session creation to work.