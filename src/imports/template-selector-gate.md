Gate the template selector dropdown in the CV editor toolbar.
Free users can only use Clean. Sidebar and Minimal are Pro only.
Do NOT change any other screens, routing, or auth flow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIND the template dropdown
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the CV editor component, find the "Clean ▾" dropdown 
button in the toolbar that opens a menu with three options:
Clean, Sidebar, Minimal.

Read how the dropdown is built — it may be a custom 
dropdown, a select element, or a popover menu.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 1 — Read plan from UserPlanContext
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Import and read plan tier if not already available 
in this component:
  const { planTier } = useUserPlan();
  const isPro = planTier === 'pro';

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 2 — Gate dropdown items
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the dropdown menu, for each template option apply 
this logic:

const TEMPLATES = [
  { id: 'clean',   label: 'Clean',   requiresPro: false },
  { id: 'sidebar', label: 'Sidebar', requiresPro: true  },
  { id: 'minimal', label: 'Minimal', requiresPro: true  },
];

For each item where requiresPro is true AND isPro is false:

  - Render the item but visually indicate it is locked:
    - Add a Lock icon (lucide-react size 12) after the label
    - Color the label secondary/muted, not primary
    - Opacity: 0.65
    - Cursor: pointer — still clickable

  - On click: do NOT switch the template
    Instead close the dropdown and show a small toast 
    or inline banner below the toolbar:

      "Sidebar and Minimal templates are Pro features"
      With a link: "Upgrade to Pro →" that navigates to /billing

    Toast style:
      position: fixed, bottom 24px, left 50%, 
      transform translateX(-50%)
      background: surface elevated
      border: 1px solid rgba(26,86,219,0.3)
      border-radius: 8px
      padding: 12px 20px
      display: flex, align-items center, gap 12px
      fontSize 13px, color primary
      zIndex 9999
      Auto-dismiss after 4 seconds
      
      Upgrade link: color #1A56DB, fontWeight 600

  - For pro users: all three items work exactly as before,
    no lock icon, no restrictions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 3 — Reset to Clean if free user somehow 
has a pro template selected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

On component mount, add a guard:
  useEffect(() => {
    if (!isPro && selectedTemplate !== 'clean') {
      setSelectedTemplate('clean');
    }
  }, [isPro]);

This handles edge cases where a user downgrades but 
returns to a CV that had a pro template selected.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 4 — Gate the server side too
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In supabase/functions/server/index.tsx, find any endpoint 
that saves or generates a PDF with a template_id parameter.

Add a plan check before processing:
  const templateId = body.template_id || 'clean';
  const proTemplates = ['sidebar', 'minimal'];
  
  if (proTemplates.includes(templateId)) {
    const { data: userData } = await sb()
      .from('users')
      .select('plan_tier')
      .eq('id', userId)
      .single();
      
    if (userData?.plan_tier !== 'pro') {
      console.warn('[template] free user attempted pro template:', 
        templateId, userId);
      // Silently fall back to clean rather than error
      body.template_id = 'clean';
    }
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Do not change the template rendering or PDF logic
- Do not change any other screens or components  
- Do not change billing, auth, or routing
- If planTier is loading or undefined, default to 
  treating the user as free — fail closed not open
- Keep the dropdown open/close behaviour exactly as is
- Only add the lock indicators and click intercept