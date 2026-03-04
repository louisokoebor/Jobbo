import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';

const PRO_EVENTS = [
  'INITIAL_PURCHASE',
  'RENEWAL',
  'NON_RENEWING_PURCHASE',
  'INVOICE_ISSUANCE',
  'UNCANCELLATION',
] as const;

const DOWNGRADE_EVENTS = [
  'CANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'PRODUCT_CHANGE',
] as const;

function adminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRole) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, serviceRole);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { success: false, error: 'method_not_allowed' });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { success: false, error: 'invalid_json' });
  }

  const event = payload?.event ?? payload;
  const eventType = event?.type;
  const appUserId = event?.app_user_id;
  const rcCustomerId = event?.original_app_user_id ?? event?.app_user_id ?? null;

  if (!eventType || !appUserId) {
    return json(400, { success: false, error: 'missing_event_type_or_app_user_id' });
  }

  const sb = adminClient();

  const isProEvent = PRO_EVENTS.includes(eventType);
  const isDowngradeEvent = DOWNGRADE_EVENTS.includes(eventType);

  if (!isProEvent && !isDowngradeEvent) {
    return json(200, {
      success: true,
      ignored: true,
      message: `Unhandled event type: ${eventType}`,
    });
  }

  const updates: Record<string, unknown> = {
    rc_customer_id: rcCustomerId,
  };

  if (isProEvent) {
    updates.plan_tier = 'pro';
    updates.generations_limit = 999;
  }

  if (isDowngradeEvent) {
    updates.plan_tier = 'free';
    updates.generations_limit = 3;
  }

  if (event?.expiration_at_ms) {
    updates.plan_expires_at = new Date(event.expiration_at_ms).toISOString();
  }

  const { error } = await sb
    .from('users')
    .update(updates)
    .eq('id', appUserId);

  if (error) {
    console.error('[revenuecat-webhook] Failed to update user:', error.message, {
      eventType,
      appUserId,
      updates,
    });
    return json(500, { success: false, error: 'db_update_failed', details: error.message });
  }

  return json(200, {
    success: true,
    eventType,
    appUserId,
    updates,
    proEvents: PRO_EVENTS,
  });
});
