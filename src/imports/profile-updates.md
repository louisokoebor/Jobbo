Add four sections to the Profile page.
Do NOT change any other screens, routing, or auth flow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — Plan & Usage (add at TOP, above Account)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read from UserPlanContext:
  planTier, generationsUsed, generationsLimit

Card component, same surface style as rest of page:

  Section label: "PLAN & USAGE" — uppercase secondary

  Inner card:
    Left side:
      Plan badge row:
        IF pro:
          Pill: background rgba(26,86,219,0.12), 
                color #1A56DB, text "Pro Plan",
                Inter 600 13px, padding 4px 12px,
                border-radius 999px
        IF free:
          Pill: background rgba(107,114,128,0.12),
                color #6B7280, text "Free Plan",
                same sizing

      Below badge:
        "CV Generations"
        fontSize 12, color secondary, marginTop 8px

      Usage bar:
        Row: "{generationsUsed} / {generationsLimit} used"
        fontSize 13, color primary, marginBottom 6px

        Progress bar:
          width: 240px, height: 6px, 
          border-radius 999px
          background: rgba(255,255,255,0.08)
          Fill:
            width: {(generationsUsed/generationsLimit)*100}%
            background: 
              if < 50% used: #10B981 (green)
              if 50-80% used: #F59E0B (amber)
              if > 80% used: #EF4444 (red)
            border-radius: 999px
            transition: width 0.4s ease

    Right side (IF free user only):
      "Upgrade to Pro" button:
        background #1A56DB, color white
        padding: 10px 20px, border-radius 8px
        fontSize 13, fontWeight 600
        onClick: navigate('/billing')
      
      Below button:
        "£9/mo or £79/yr"
        fontSize 11, color secondary, 
        textAlign center, marginTop 4px

    IF pro user, right side shows:
      "Manage subscription →"
      fontSize 13, color #1A56DB, cursor pointer
      onClick: calls create-portal-session endpoint 
               (already exists from billing setup)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — Personal Details (add after Account)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add a new DB column if not exists:
  ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS personal_details JSONB;

This stores: { name, phone, location, linkedin, portfolio }

Section label: "PERSONAL DETAILS"

Below label, explanatory text:
  "These details pre-fill every CV you generate."
  fontSize 12, color secondary, marginBottom 16px

Form fields in a 2-column grid on desktop, 
1 column on mobile:

  Full Name        — text input
  Phone            — text input, type tel
  Location         — text input (e.g. "Salford, Manchester")
  LinkedIn URL     — text input, placeholder "linkedin.com/in/..."
  Portfolio URL    — text input, placeholder "yoursite.com"

Each field:
  Label: uppercase 11px secondary above input
  Input: same style as rest of app inputs
  Full width of its column

Below the grid:
  "Save Details" button — right-aligned
  background #1A56DB, color white, padding 10px 24px,
  border-radius 8px, fontSize 13, fontWeight 600

On save:
  1. Update public.users.personal_details with form values
  2. Show "Saved ✓" inline next to button for 2s
  3. Refresh UserPlanContext or user data so other 
     components that read personal_details get fresh data

On load:
  Read personal_details from public.users for current user
  Pre-populate the form fields

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2A — Use personal_details in generate-cv
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the generate-cv endpoint, after fetching the user:
  const { data: userRow } = await sb()
    .from('users')
    .select('personal_details')
    .eq('id', userId)
    .single();

  const personalDetails = userRow?.personal_details;

If personalDetails exists and has values, use them to 
override the contact fields in the generated CV output:

  After GPT returns the cv_json, merge personal details:
    if (personalDetails) {
      generatedCv.name     = personalDetails.name 
                             || generatedCv.name;
      generatedCv.phone    = personalDetails.phone 
                             || generatedCv.phone;
      generatedCv.location = personalDetails.location 
                             || generatedCv.location;
      generatedCv.linkedin = personalDetails.linkedin 
                             || generatedCv.linkedin;
      generatedCv.portfolio = personalDetails.portfolio 
                             || generatedCv.portfolio;
    }

This ensures the correct contact details are always 
on the CV regardless of what was in the uploaded file.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — Notification Preferences
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add DB column:
  ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notification_preferences 
    JSONB DEFAULT '{
      "application_status_change": true,
      "weekly_summary": false
    }';

Section label: "NOTIFICATIONS"

Two toggle rows, each:
  Left: label + description
  Right: toggle switch

Row 1:
  Label: "Application status changes"
  Description: "Get notified when you update an 
  application status"
  fontSize 12, color secondary
  Toggle: default ON

Row 2:
  Label: "Weekly job search summary"
  Description: "A weekly overview of your active 
  applications"
  fontSize 12, color secondary
  Toggle: default OFF

Toggle component styling:
  Width 44px, height 24px, border-radius 999px
  OFF: background rgba(255,255,255,0.1)
  ON: background #1A56DB
  Thumb: white circle 20px, transition 0.2s

On toggle change:
  Immediately update local state (optimistic)
  Save to Supabase:
    await supabase
      .from('users')
      .update({ 
        notification_preferences: { 
          ...currentPrefs, 
          [key]: newValue 
        }
      })
      .eq('id', userId);
  
  No save button needed — auto-saves on change.
  Show brief "Saved" text near the toggle that fades 
  after 1.5s.

Note: Actual email sending is not in scope for this 
prompt — just save the preferences to DB. Email 
implementation comes later.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — Danger Zone (bottom of page)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add at the very bottom of the profile page, 
below all other sections.

Section label: "DANGER ZONE" — color #EF4444

Collapsible — collapsed by default.
Toggle row:
  "Account deletion" secondary text 13px
  ChevronDown/Up icon right-aligned
  Clicking the row expands/collapses

When expanded:
  Warning text:
    "Deleting your account is permanent and cannot 
    be undone. All your applications, generated CVs, 
    and uploaded files will be deleted immediately."
    fontSize 13, color #F87171, lineHeight 1.6,
    marginBottom 16px

  "Delete my account" button:
    background transparent
    border: 1px solid #EF4444
    color: #EF4444
    padding: 10px 20px
    border-radius 8px
    fontSize 13
    fontWeight 600
    cursor pointer
    hover: background rgba(239,68,68,0.08)

  On click — show confirmation modal:
    
    Heading: "Are you absolutely sure?"
    fontSize 18, fontWeight 600, color primary

    Body: "This will permanently delete your Applyly 
    account and all associated data including:
    • All job applications
    • Generated CVs and cover letters  
    • Uploaded CV files
    • Interview prep questions
    This action cannot be reversed."
    fontSize 13, color secondary, lineHeight 1.6

    Confirm input:
      Label: 'Type "DELETE" to confirm'
      fontSize 12, color secondary
      Input: text field
      Only enable the delete button when value === 'DELETE'

    Two buttons:
      "Cancel" — secondary style, closes modal
      "Permanently delete account" — 
        background #EF4444, color white
        disabled and opacity 0.4 until input matches
        enabled when input === 'DELETE'

    On confirmed delete:
      Call a new endpoint: DELETE /delete-account
      Which:
        1. Deletes all user data from all tables
        2. Deletes uploaded files from Supabase Storage
        3. Calls supabase.auth.admin.deleteUser(userId)
        4. Signs the user out client-side
        5. Navigates to '/' or '/goodbye' page

      Add the endpoint to server/index.tsx:
        app.delete('/make-server-3bbff5cf/delete-account',
        async (c) => {
          const userId = extractUserId(c);
          if (!userId) return c.json({ error: 'unauthorized' }, 401);
          
          // Delete in order respecting FK constraints:
          await sb().from('interview_prep')
            .delete().eq('user_id', userId);
          await sb().from('generated_cvs')
            .delete().eq('user_id', userId);
          await sb().from('applications')
            .delete().eq('user_id', userId);
          await sb().from('cv_profiles')
            .delete().eq('user_id', userId);
          await sb().from('users')
            .delete().eq('id', userId);
          
          // Delete auth user last
          const adminClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
          );
          await adminClient.auth.admin.deleteUser(userId);
          
          return c.json({ success: true });
        });

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — Connected Accounts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add after the Account section, before Personal Details.

Read from Supabase auth session:
  const { data: { user } } = await supabase.auth.getUser();
  const providers = user?.app_metadata?.providers ?? [];
  const hasGoogle = providers.includes('google');
  const hasEmail  = providers.includes('email');

Section label: "CONNECTED ACCOUNTS"

Row per provider:

  Google row:
    Left: Google icon (use a simple coloured G SVG) 
          + "Google" Inter 500 14px
    Right: 
      IF hasGoogle: 
        Green badge "Connected" — 
        pill, background rgba(16,185,129,0.12), 
        color #10B981, fontSize 12px
      IF !hasGoogle:
        "Connect" button — small, border style,
        onClick: trigger Google OAuth link flow:
          supabase.auth.linkIdentity({ 
            provider: 'google' 
          })

  Email/Password row:
    Left: Mail icon (lucide-react) + "Email & Password"
    Right:
      IF hasEmail: "Connected" green badge
      IF !hasEmail: not shown 
        (would only show if Google-only user, 
         add password flow later)

Note: linkIdentity may not be available in all 
Supabase versions. If not available, show the 
connected state as read-only and omit the Connect 
button. Check Supabase client version first.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAGE ORDER (top to bottom)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. Plan & Usage
  2. Account (existing — email + change password)
  3. Connected Accounts
  4. Personal Details
  5. Base CV Profiles (existing)
  6. Notification Preferences
  7. Danger Zone

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Do not change any other screens
- Do not change billing, routing, or auth flow
- If any DB column already exists, skip the ALTER TABLE
- All new DB columns must have safe defaults so 
  existing users are not broken
- Personal details save must not overwrite cv_profiles
  — it is a separate override layer
- Danger zone delete must be wrapped in try/catch 
  and if any step fails, log the error but continue 
  attempting subsequent deletions rather than 
  stopping mid-delete