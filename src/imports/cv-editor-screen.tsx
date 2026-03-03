
Build the CV Editor screen for Jobbo — an AI-powered CV tailoring SaaS. This is the most complex and important screen in the product.

THEME
Same dark/light system, same tokens, same nav shell.

LAYOUT
Full app shell. Below nav: split view, no additional header padding.
Left panel (editor): 58% width, vertically scrollable, solid surface panels for readability.
Right panel (live preview): 42% width, sticky top 60px, shows a rendered CV preview updating in real-time.
Thin 1px border divider between panels.

TOP ACTION BAR (below nav, above split panels)
Full width, surface bg, border-bottom, padding 12px 24px. Height 56px.
Left: breadcrumb "Dashboard / Software Engineer — Acme Corp" secondary 13px
Centre: ATS match score badge — rounded pill, Inter 600 14px white text. Colour: green (#10B981) ≥80%, amber (#F59E0B) 60–79%, red (#EF4444) <60%. "87% ATS Match" format.
Right: Template selector dropdown (compact, 140px) + "Preview PDF" secondary button + "Save" primary button (compact 36px height). Save button shows spinner while saving, then green check for 2s.

---

LEFT PANEL — EDITOR

All sections are solid surface cards (NOT glass). Stack vertically with 12px gaps. Padding 24px inside each card.

SECTION: NAME & CONTACT
Card with label "PERSONAL DETAILS" uppercase 11px secondary.
Two-column grid inputs: Full Name (spans full width) | Email | Phone | Location | LinkedIn URL | Portfolio URL.
All inputs: filled style, surface bg, 44px height, brand blue focus ring.

SECTION: PROFESSIONAL SUMMARY
Label "PROFESSIONAL SUMMARY" uppercase.
Textarea: 120px height, resize vertical. Below: character counter right-aligned "X / 600" secondary 12px. Aim for 3–5 sentences helper text secondary 12px.

SECTION: SKILLS
Label "SKILLS" uppercase + chip count badge secondary.
Skills container: wrapping flex row of chip inputs.
Each chip: pill shape, padding 6px 12px, border-radius 999px, Inter 500 13px.
- Matched to job (green tint): bg rgba(16,185,129,0.15), text #10B981, border rgba(16,185,129,0.3)
- General (neutral): surface-elevated bg, secondary text, border colour border
- Skills gap (amber): bg rgba(245,158,11,0.15), text #F59E0B, border rgba(245,158,11,0.3)
Each chip has an × remove button on hover (right side of chip).
"+ Add skill" ghost chip at end of row — dashed border, secondary text, clicking opens inline text input in-place.
Chips are draggable to reorder.

SKILLS GAP BANNER
If skills_gap array is non-empty: amber banner between Skills and Work History sections.
Background rgba(245,158,11,0.08), border-left 3px solid #F59E0B, border-radius 8px, padding 12px 16px.
Icon: warning triangle amber. Text: "Missing keywords from this job:" then comma-separated skills in amber bold. "Add them above ↑" link text.

SECTION: WORK HISTORY
Label "WORK EXPERIENCE" uppercase + "Add Role" ghost button right-aligned.
Each role: collapsible card within the section card. Surface-elevated bg, border-radius 8px, padding 16px. Margin-bottom 8px.

Role card header row: drag handle (⠿ icon, secondary text, cursor grab) | job title Input (Inter 600 14px, inline, no visible border until focused) | company input | date range inputs (Start / End, compact) | chevron to collapse/expand.
Role card body (expanded): bullet point list editor.
Each bullet: row with drag handle + textarea (auto-height, 1 line min) + × delete button.
"+ Add bullet" ghost link at bottom of bullet list.
"Delete this role" danger ghost link very bottom of card.
"+ Add Role" creates a new empty role card at the bottom, expands automatically.
Roles are draggable to reorder (drag handle on header).

SECTION: EDUCATION
Label "EDUCATION" uppercase + "Add Education" ghost button.
Same collapsible card pattern as work history: institution input | qualification input | dates | grade input.

SECTION: CERTIFICATIONS & LINKS (optional, toggled)
Label "CERTIFICATIONS & LINKS" uppercase + toggle switch right to show/hide section.
When shown: free-form entries. Each entry row: label input | URL input | × button. "+ Add entry" link.

---

RIGHT PANEL — LIVE PREVIEW

Sticky, non-scrollable container. Inside: A4 document preview.
White (#FFFFFF) document background always (this is the CV, not the app UI). Thin shadow around document. Scale to fit within the panel — calculate scale based on viewport. Document is 794px wide at 100% scale (A4 at 96dpi).

The preview renders the CV JSON into a clean HTML template matching the selected template style.

CLEAN template (default):
- Top: name Inter 700 20px #0F172A, contact info row below 11px #64748B separated by dots
- Section headings: Inter 600 12px #0F172A uppercase letter-spacing 0.08em, 1px border-bottom #E2E8F0, margin-bottom 6px
- Skills: comma-separated in body text or small pill shapes
- Work history: title bold left + dates right, company below italic, bullets with em-dash
- Education: same pattern
- Body text: 11px #374151, line-height 1.5
- Margins: 32px all sides

Preview updates on any editor change with 300ms debounce. While updating: subtle opacity flicker (0.7 → 1.0, 150ms).

INTERACTIONS
- Editor and preview scroll independently
- Clicking a section in the right preview panel highlights the corresponding left panel section (smooth scroll + brief blue glow on the section card)
- Drag to reorder roles/bullets: ghost element while dragging, placeholder slot shown
- All inputs auto-save to local state on change (300ms debounce). Manual save button pushes to Supabase.
- Unsaved changes indicator: small amber dot on Save button when local state differs from saved state
