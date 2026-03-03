Build the 3-step Onboarding Wizard for Jobbo — an AI-powered CV tailoring SaaS.

THEME
Same dark/light mode system. Same tokens, same nav. Background: same deep gradient with texture.

DESIGN SYSTEM
Same as auth screens. Inter font, all same tokens.

LAYOUT
Full viewport. Nav at top (glass, Jobbo wordmark, theme toggle, no other nav links since user is mid-onboarding). Below nav: centred content column, max-width 560px, padding top 48px.

PROGRESS INDICATOR
Horizontal stepper at top of content area. 3 steps connected by a line.
Each step: numbered circle 32px diameter.
- Completed: filled #1A56DB, white checkmark icon
- Active: filled #1A56DB, white number, subtle pulse ring animation rgba(26,86,219,0.3)
- Upcoming: background #1E293B (dark) / #E2E8F0 (light), secondary text colour number
Connecting line between circles: completed segment = #1A56DB, upcoming = border colour.
Step labels below circles: 12px Inter 500, uppercase, letter-spacing 0.05em — "Upload CV" / "Preview" / "Confirm"

"Skip for now" link — right-aligned, secondary text colour, 13px, ghost style, visible on all 3 steps.

---

STEP 1 — Upload Base CV

Heading: "Upload your base CV" — Inter 600, 24px, margin-top 32px
Subtext: "We'll use this as the foundation for all your tailored applications" — secondary colour, 14px, margin-bottom 32px

Upload Zone (large, prominent):
- Solid card (not glass — use surface colour for readability inside wizard)
- Border: 2px dashed rgba(148,163,184,0.3), border-radius 12px
- Padding: 48px 32px
- Centred content: upload arrow icon (32px, secondary colour), then "Drag and drop your CV here" Inter 500 16px primary text, then "PDF or DOCX · Max 10MB" secondary text 13px, then "or browse files" brand blue underline link 13px
- Hover state: border-color #1A56DB, background rgba(26,86,219,0.04)
- Active drag-over: background rgba(26,86,219,0.08), border solid brand blue, scale(1.01) subtle

Uploaded state (after file selected):
- Zone shrinks to a compact row: file icon left, filename + file size centre, green check icon right, red X button far right to remove
- Border turns green, background rgba(16,185,129,0.06)

Accepted formats validation: PDF and DOCX only. Reject others with inline error below zone: "Please upload a PDF or DOCX file" in #EF4444.
File too large: "File must be under 10MB"

"Next: Preview your CV" — primary button, full width, disabled (greyed, no pointer) until file uploaded. Enabled once file is present. Loading state during upload to Supabase Storage.

---

STEP 2 — Preview Parsed CV

Shown after parse-cv Edge Function returns. Display a read-only structured preview of extracted CV data.

Loading state: full step area shows skeleton shimmer blocks — grey animated gradient blocks in the shape of the content below. Text "Analysing your CV..." below a spinner.

Parsed preview layout (solid surface cards, not glass):

Section cards stacked vertically with 16px gap:

1. PROFILE card — name in Inter 600 20px, email + phone + location in a row secondary text 13px. Avatar placeholder circle left if no photo.

2. SUMMARY card — "Professional Summary" label (uppercase 11px secondary), then summary text body 14px in a light tinted surface.

3. SKILLS card — "Skills" label, then skills displayed as chips. Each chip: rounded pill, surface-elevated bg, secondary text, 12px. Max 3 rows, overflow hidden with "+N more" chip if many.

4. WORK HISTORY card — "Experience" label, then each role as a sub-card: job title Inter 600 14px, company + dates secondary 13px, bullet points 13px with dot markers. Max 3 roles shown, "Show all X roles" expand link if more.

5. EDUCATION card — institution, qualification, dates. Same sub-card pattern.

Empty sections: show "Not found in CV" in secondary text, italic, 13px — do not hide sections entirely.

Skills gap or parsing issues: amber banner above cards "Some sections couldn't be parsed — you can edit these after generating" with warning icon.

Check Supabase note: cv_profiles row should exist with parsed_json and is_default = true.

"Looks good, continue →" primary button. "← Back" ghost link.

---

STEP 3 — Confirm Profile Saved

Success state. Centred layout.

Large animated success icon: circle with checkmark, draws in with a stroke animation over 600ms. Circle colour: #10B981.

Heading: "You're all set!" — Inter 700, 28px
Subtext: "Your CV has been saved as your base profile. You can always update it in Settings." — secondary colour, 15px, max-width 380px centred.

Profile summary pill below: avatar circle + name + "Base CV" label — surface card, inline row, rounded.

"Go to Dashboard →" — primary button, 200px wide, centred. On click: fade transition to dashboard.

INTERACTIONS
- Step transitions: content fades out (150ms) then new content fades in (200ms). Progress indicator updates.
- No full page reloads between steps — single page wizard.
- Mobile: same layout, upload zone slightly shorter, content padding 16px.
