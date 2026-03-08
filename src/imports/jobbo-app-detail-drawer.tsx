Build the Application Detail Panel for Applyly — an AI-powered CV tailoring SaaS. This is a side drawer on desktop, full page on mobile.

THEME
Same dark/light system. Drawer itself uses glass treatment layered over the blurred dashboard behind it.

DESKTOP DRAWER
Slides in from the right. Width: 540px. Full viewport height. Position: fixed right 0, top 0. Z-index above dashboard.
Background: glass treatment (rgba(30,41,59,0.95) dark / rgba(255,255,255,0.95) light), backdrop-filter blur(20px). Border-left: 1px solid border colour.
Animation: translateX(540px → 0) over 240ms ease-out. Overlay behind drawer: rgba(0,0,0,0.3) covers rest of viewport, clicking it closes drawer.

MOBILE
Full page. No overlay. Slide in from right same animation.

DRAWER HEADER
Padding 24px 24px 0. Border-bottom below header.
Top row: close button ← left (chevron left icon, ghost), application status badge pill right (colour-coded).
Job title: Inter 700 20px primary text, margin-top 8px.
Company: Inter 500 14px secondary text.
Date applied: Inter 400 13px secondary text "Applied 12 Jan 2025".

TAB BAR
5 tabs below header. Horizontal row, padding 0 24px. Border-bottom.
Tabs: "Overview" | "CV" | "Cover Letter" | "Documents" | "Notes"
Active tab: primary text colour, brand blue 2px border-bottom. Inactive: secondary text, no border. Inter 500 14px. Hover: primary text.

TAB CONTENT AREA
Padding 24px. Vertically scrollable.

---

TAB 1: OVERVIEW

Status updater row: "Status" label left, status dropdown right (shows current status with colour dot, all 6 options in dropdown with colour dots). On change: Kanban card updates instantly.

Next action date: "Next action" label, date picker input. 44px height, surface bg, brand blue focus. "Set a reminder" placeholder.

Job description summary: collapsible section. "Job Summary ▾" header, content is the parsed job summary text. Collapsed by default showing 3 lines, "Show more" expand link.

Status timeline: vertical line on left (2px, border colour). Each event: dot on line (6px circle, filled colour matching status) + date right of dot secondary 12px + status label primary 13px. Events ordered newest first.

---

TAB 2: CV

Compact read-only CV preview inside the drawer. Shows the generated CV in mini form.
Padding 0. White background card for the CV preview. Scale to fit drawer width.
Two buttons below preview: "Edit CV →" secondary button | "Download PDF" primary button.
If no CV generated yet: empty state — document icon, "No CV generated for this application yet" secondary text, "Generate CV →" primary button.

---

TAB 3: COVER LETTER

If cover letter exists:
- Compact preview of letter text (first 150 chars, faded out at bottom with "Show full letter" link)
- Tone badge pill showing selected tone
- "Edit" secondary button | "Download PDF" primary button | "Regenerate" ghost button with refresh icon

If no cover letter yet:
- Empty state: letter icon, "No cover letter yet"
- Tone selector: 3 pill toggle buttons "Professional" / "Conversational" / "Confident" — one selectable at a time, selected = brand blue filled, unselected = surface-elevated
- "Generate Cover Letter" primary button full width
- Free tier: entire section locked, upgrade prompt

---

TAB 4: DOCUMENTS

File list — each file as a row: file type icon (PDF/DOCX) | file name Inter 500 13px | doc type badge secondary pill | upload date secondary 12px | download icon button | delete icon button (danger red on hover).
Empty state: "No documents uploaded" secondary text, paperclip icon.
"Upload Document" ghost button below list — opens file picker (Pro only feature, locked on free with upgrade prompt).

---

TAB 5: NOTES

Interview metadata row:
- Interview date: date+time picker input, compact
- Interview type: segmented pill selector "Phone" / "Video" / "In-Person" / "Assessment Centre"
All in a 2-column grid layout.

Notes textarea: "Interview prep, questions asked, feedback received..." placeholder. Min height 200px, resize vertical. Inter 400 14px. Auto-save with 1s debounce, shows "Saved ✓" green secondary text bottom-right when saved.

Outcome field: "Outcome" label, text input, placeholder "e.g. Progressed to next round, Rejected, Awaiting feedback"

"Save Notes" primary button at bottom.

INTERACTIONS
- Drawer slide in/out: translateX animation 240ms ease-out
- Tab switch: content fades (100ms out, 150ms in)
- Status change: optimistic UI update (update Kanban card immediately, then sync to DB)
- All saves: show inline "Saved ✓" confirmation, no toast needed for autosave
