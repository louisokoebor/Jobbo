Remove the template selector feature entirely from the app.
Keep only the Clean template. Do NOT change any other 
screens, routing, or auth flow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REMOVE — Template selector dropdown in CV editor
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the CV editor toolbar, remove:
- The "Clean ▾" dropdown button entirely
- All dropdown menu logic (open/close state, 
  option rendering, click handlers)
- The plan-gating logic for Sidebar/Minimal templates
- The locked template toast/popover
- The useEffect that resets to Clean on plan downgrade
- selectedTemplate state variable if it is only 
  used for the template selector

The toolbar should simply read:
  [← Back to Application] [Preview PDF] [Save] 
  [Generate Cover Letter →]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REMOVE — Template selector in PDF Preview modal
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the PDF Preview modal, remove:
- The three template tab buttons 
  (Clean | Sidebar 🔒 | Minimal 🔒)
- All tab switching logic
- The locked template upgrade popover
- Any template state in this component

The modal header should just show:
  [CV Preview — Name — Role]  [zoom controls]  
  [Download PDF]  [×]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REMOVE — Sidebar and Minimal template components
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Delete or neutralise:
- SidebarTemplate.tsx (or equivalent) if it exists
- MinimalTemplate.tsx (or equivalent) if it exists
- Any template switching logic that conditionally 
  renders different template components

Keep only the Clean template component.
It should render unconditionally — no template 
prop needed, no conditional branching.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REMOVE — Template branching in generate-pdf endpoint
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In supabase/functions/server/index.tsx in the 
generate-pdf endpoint:

- Remove the template_id parameter from the 
  request body reading
- Remove the plan check for pro templates
- Remove any buildSidebarPDF or buildMinimalPDF 
  functions if they were implemented
- Remove the template branching in buildPDF

Simplify to:
  const pdfBytes = await buildPDF(cvJson);
  // No template parameter needed

buildPDF always renders Clean layout.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REMOVE — Template from download handler
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the client download PDF handler, remove 
template_id from the request body:

  body: JSON.stringify({
    cv_json: cvData,
    // template_id removed
  })

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEEP — Everything else exactly as is
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Keep untouched:
- Clean template HTML/CSS render component
- buildPDF Clean layout logic
- PDF preview modal (just without template tabs)
- CV editor (just without template dropdown)
- All CV data, save, and generation logic
- All other screens and features

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Do not change any CV content rendering
- Do not change billing, auth, or routing
- If template_id is stored on generated_cvs rows 
  in the DB, leave the column — just stop writing 
  to it and stop reading from it
- After removing, verify the Download PDF button 
  still works end-to-end with the Clean layout