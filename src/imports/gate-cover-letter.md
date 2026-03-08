Gate the cover letter tab on the application/[id] page so free users 
cannot generate cover letters. Do NOT change any other screens, 
billing, auth, or routing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIND the cover letter tab content on the application detail page
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read the application/[id] page component and find:
- The "Cover Letter" tab panel content
- The "Generate Cover Letter" button that calls the 
  generate-cover-letter endpoint
- Any cover letter editor/display that shows after generation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 1 — Gate the Generate button
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read plan tier from UserPlanContext:
  const { planTier } = useUserPlan();
  const isPro = planTier === 'pro';

Replace the existing Generate Cover Letter button with a 
plan-aware version:

IF isPro — show the existing button exactly as it is, 
no behaviour change.

IF free — replace the entire cover letter tab content with 
an upgrade prompt card. Do not show the generate button or 
any cover letter editor at all. Show this instead:

  A centred card with padding 40px, border-radius 12px,
  glass treatment (same as rest of app), max-width 480px, 
  margin 40px auto:

  Top: lock icon (Lock from lucide-react) size 32, 
       color #1A56DB, margin-bottom 16px

  Heading: "Cover Letters are a Pro feature"
  Inter 600 20px, color primary, margin-bottom 8px, 
  text-align center

  Body: "Upgrade to Pro to generate tailored cover letters 
  that address your CV gaps and make a strong first impression."
  fontSize 14, color secondary, text-align center, 
  lineHeight 1.6, margin-bottom 24px

  Feature list (3 items, left-aligned, inside the card):
  Each row: Check icon (green #10B981 size 14) + text 13px
    ✓ AI-written cover letters tailored to each job
    ✓ Automatically addresses your CV gaps
    ✓ Multiple tone options (professional, confident, conversational)
  margin-bottom 24px

  Primary CTA button:
    Label: "Upgrade to Pro →"
    Full width of card
    Background: #1A56DB
    Color: white
    Height: 44px
    Border-radius: 8px
    Font: Inter 600 14px
    onClick: navigate('/billing')

  Below button, secondary text:
    "£9/mo or £6.60/mo billed annually"
    fontSize 12, color secondary, text-align center, 
    margin-top 8px

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 2 — Gate the tab itself visually
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

On the tab navigation row at the top of the application page
(Overview | Feedback | CV | Cover Letter | Notes):

When isPro is false, add a lock indicator to the Cover Letter tab:

  Tab label: "Cover Letter 🔒"
  OR: show a small Lock icon (size 11) inline after the text
  Tab remains clickable — clicking it shows the upgrade 
  prompt card from Change 1, not a disabled state.
  Do not prevent navigation to the tab.

This signals to free users the feature exists and is 
accessible after upgrading, without blocking discovery.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 3 — Gate the server endpoint
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In supabase/functions/server/index.tsx, in the 
generate-cover-letter endpoint, add a plan check 
before running the AI:

After extracting userId, query the users table:
  const { data: userData } = await sb()
    .from('users')
    .select('plan_tier')
    .eq('id', userId)
    .single();

  if (userData?.plan_tier !== 'pro') {
    return c.json({ 
      success: false, 
      error: 'Cover letter generation requires a Pro plan',
      code: 'PLAN_UPGRADE_REQUIRED'
    }, 403);
  }

This ensures even if someone bypasses the UI they cannot 
generate cover letters without a Pro plan.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Do not change any other tabs (Overview, Feedback, CV, Notes)
- Do not change the CV generation flow — that stays available 
  to free users within their generation limit
- Do not change billing page, auth, or any other screen
- If planTier is loading/undefined, default to showing the 
  locked state (fail closed not open)
- Keep all existing pro user cover letter functionality 
  exactly as it is