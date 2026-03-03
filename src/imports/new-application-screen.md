Build the New Application screen for Jobbo — an AI-powered CV tailoring SaaS.

THEME
Same dark/light system, same tokens, same nav shell as Dashboard.

LAYOUT
Full app shell with nav. Below nav: two-panel layout desktop only.
Left panel: 55% width, all inputs, vertically scrollable.
Right panel: 45% width, sticky (top: 72px), shows live parsed job summary once fetched. Right panel is empty/placeholder state until job is fetched.
On tablet/mobile: right panel collapses below left panel as an accordion that expands when job is parsed.
24px gap between panels. 1px divider line (border colour) between them on desktop.

PAGE HEADER
Below nav, above panels. Breadcrumb: "Dashboard / New Application" secondary text 13px. Page title "New Application" Inter 600 28px primary text. Margin-bottom 32px.

---

LEFT PANEL

All content in solid surface cards (not glass — form needs readability). Each card has: surface bg, 1px border, border-radius 12px, padding 24px, margin-bottom 16px.

CARD 1 — JOB SOURCE

Label row: "JOB SOURCE" uppercase label left, toggle switch right labelled "Paste instead" secondary text 13px.

URL MODE (default):
- Text input full width, placeholder "https://reed.co.uk/jobs/..." height 44px, filled style
- Below input: small helper text secondary 12px "Works with Reed, Indeed, Totaljobs, and more. LinkedIn will ask you to paste manually."
- "Fetch Job" primary button right-aligned, 120px wide, height 44px. Loading state: spinner + "Fetching..."
- Fetch success: green checkmark inline right of input, "Job found!" text #10B981 13px
- Fetch fail: amber warning inline, input transitions to paste mode automatically with a smooth height animation

PASTE MODE (toggled or auto-fallback):
- Textarea replaces URL input. Placeholder: "Paste the full job description here..." Height 200px, resize: vertical.
- Character counter bottom-right of textarea: secondary text 12px "0 / 5000"
- "Parse Description" primary button right-aligned below textarea
- If < 50 characters when Parse clicked: amber warning below textarea "This looks too short — paste the full job description for best results"

CARD 2 — BASE CV PROFILE
Label: "BASE CV" uppercase
Dropdown select — full width, surface bg, shows saved CV profiles. Default selects the is_default profile. Label shows profile name + upload date secondary text. "Upload new CV" option at bottom of dropdown with + icon.
If no CV profile exists: amber banner "No base CV saved — upload one first" with "Upload CV →" link.

CARD 3 — CIVIL SERVICE MODE (Phase 3, shown locked on free tier)
Row layout: left side label "Civil Service Mode" Inter 500 14px primary text + description below "Rewrites bullets in STAR format aligned to Civil Service Success Profiles" secondary 12px. Right side: toggle switch.
Free tier: toggle is locked, lock icon visible, clicking shows upgrade tooltip "Available on Pro plan".
Pro: toggle functional, enabled state shows indigo/blue filled pill.

CARD 4 — SUPPLEMENTARY DOCUMENTS (Phase 3, shown locked on free tier)
Label: "SUPPORTING DOCUMENTS" uppercase + "Pro" badge pill
Free tier: entire card interior greyed, lock overlay, "Upgrade to Pro to upload competency frameworks, person specs, and more" with Upgrade button.
Pro: drag-and-drop zone same style as onboarding upload zone but shorter (padding 24px). Accepts PDF/DOCX. Shows uploaded files as chips: filename chip with doc type dropdown (JD / Competency Framework / Person Spec / Company Values / Other) and X remove button. Max 5 files shown as chips row.

BOTTOM CTA
Sticky to bottom of left panel on desktop. White gradient fade above it.
"Generate CV →" primary button, full width, height 48px, Inter 600 16px.
Disabled state (greyed, cursor: not-allowed) until: job description is fetched/parsed AND base CV is selected.
Enabled state: solid brand blue, hover brand dark.
Loading state (after click): full-screen overlay, dark bg with blur, centred card showing:
- Spinner animation (brand blue, 40px)
- Rotating status copy (cycles every 1.5s): "Analysing job description..." → "Matching your experience..." → "Optimising for ATS..." → "Almost done..."
- Cannot be dismissed — wait for Edge Function to complete

---

RIGHT PANEL

EMPTY STATE
Centred placeholder: document icon (48px, muted), "Your job summary will appear here once you fetch or paste a job description" secondary text 14px, max-width 280px centred.

LOADED STATE — PARSED JOB SUMMARY
Solid surface card. Padding 24px. Border-radius 12px.

Top: company name Inter 700 20px primary text + location secondary 14px. Job title below Inter 600 16px brand blue. Employment type + salary range (if found) as pills row — surface-elevated bg secondary text 12px pills.

Section: "KEY REQUIREMENTS" uppercase label, then requirements as a bulleted list, 13px primary text, 4px line spacing.

Section: "RESPONSIBILITIES" uppercase label, same list format, max 5 items shown, "Show all" expand link.

Section: "NICE TO HAVE" — amber tinted section bg, amber label, items listed. Only shown if data exists.

Match preview pill at bottom: "Estimated ATS match: ~XX%" — shown as a soft brand-blue tinted pill. Note: this is an estimate before full generation.

INTERACTIONS
- Right panel fades in (200ms) when job summary loads
- All cards on left panel have smooth height transitions when content changes
- Toggle between URL/paste mode: smooth 200ms height animation
- Mobile: right panel collapses to an accordion below left panel with "Job Summary ▼" header that expands
