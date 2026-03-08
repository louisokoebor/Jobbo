Enforce the 3 CV generation limit for free users.
Currently free users can generate unlimited CVs.
Do NOT change any UI, layout, or other screens.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — Verify DB schema
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Confirm these columns exist on public.users:
  generations_used    INTEGER DEFAULT 0
  generations_limit   INTEGER DEFAULT 3
  plan_tier           TEXT DEFAULT 'free'

If any are missing run:
  ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS generations_used 
    INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS generations_limit 
    INTEGER NOT NULL DEFAULT 3;

Ensure all existing pro users have generations_limit = 999:
  UPDATE public.users 
  SET generations_limit = 999 
  WHERE plan_tier = 'pro';

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — Enforce limit in generate-cv endpoint
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In supabase/functions/server/index.tsx, in the 
generate-cv endpoint, add this check BEFORE the 
OpenAI call:

  // Fetch user's current usage and limit
  const { data: userData, error: userError } = await sb()
    .from('users')
    .select('plan_tier, generations_used, generations_limit')
    .eq('id', userId)
    .single();

  if (userError || !userData) {
    return c.json({ 
      error: 'Could not verify account status' 
    }, 500);
  }

  const used  = userData.generations_used ?? 0;
  const limit = userData.generations_limit ?? 3;

  console.log(`[generate-cv] user ${userId}: ` +
    `${used}/${limit} generations used, ` +
    `plan: ${userData.plan_tier}`);

  if (used >= limit) {
    return c.json({
      success: false,
      error: 'Generation limit reached',
      code: 'GENERATION_LIMIT_REACHED',
      used,
      limit,
      plan_tier: userData.plan_tier,
    }, 403);
  }

  // --- existing OpenAI generation logic here ---

  // AFTER successful generation, increment the counter:
  const { error: incrementError } = await sb()
    .from('users')
    .update({ 
      generations_used: used + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (incrementError) {
    console.error('[generate-cv] failed to increment:', 
      incrementError);
    // Do not fail the request — CV was generated successfully
    // Log for manual reconciliation
  }

  console.log(`[generate-cv] incremented to ${used + 1}/${limit}`);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — Handle limit error in the client UI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find where the generate-cv API call is made in the 
client (likely in the new application flow or CV editor).

When the response returns code: 'GENERATION_LIMIT_REACHED':
  Do NOT show a generic error toast.
  Instead show an upgrade modal:

  Modal (centred, max-width 440px):
    
    Top icon: Sparkles from lucide-react, size 32, 
              color #1A56DB

    Heading: "You've used all 3 free generations"
    Inter 600 20px, text-align center

    Body: "Upgrade to Pro for unlimited CV generations, 
    cover letters, and advanced templates."
    fontSize 14, color secondary, text-align center,
    lineHeight 1.6, marginBottom 24px

    Usage indicator:
      Small row: "3 / 3 generations used"
      Progress bar: full width, filled red, height 6px,
      border-radius 999px

    Primary CTA: "Upgrade to Pro →"
      Full width, background #1A56DB, height 44px,
      onClick: navigate('/billing'), close modal

    Secondary: "Maybe later"
      Full width, background transparent, 
      border: 1px solid border-color
      onClick: close modal

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — Also enforce on generate-cover-letter
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cover letter generation already requires Pro (from 
previous prompts) so the plan check handles it.
But add a generations_used increment there too so 
usage tracking is accurate for pro users.

In generate-cover-letter endpoint, after successful 
generation:
  await sb()
    .from('users')
    .update({ 
      generations_used: supabase.sql`generations_used + 1`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

Use raw SQL increment to avoid race conditions:
  .update({ generations_used: sb().rpc('increment', 
    { row_id: userId }) })

Or simpler — fetch current value first then increment,
same pattern as generate-cv above.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — Surface usage count in UserPlanContext
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In UserPlanContext, ensure the context value exposes:
  generationsUsed: number
  generationsLimit: number
  generationsRemaining: number  
    // = Math.max(0, limit - used)

These are used by the Profile page (next prompt) 
and any other component that needs to show usage.

If the context already fetches these fields from 
public.users, verify they are exposed in the context 
value object. If not, add them.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Pro users (generations_limit = 999) are never blocked
- Do not reset generations_used on a monthly basis yet — 
  keep it as lifetime count for now, can add monthly 
  reset later
- Do not change any UI outside of the upgrade modal
- If the increment fails after generation, log but 
  do not fail the response — the CV was already generated
- Do not change billing, auth, or routing