Create an Applications page at the route /applications.

Same nav bar as all other screens with Applications tab 
active. Same dark/light theme. Same design system throughout.

---

PAGE HEADER

Left side:
  Page title: "Applications" (28px, semibold)
  Application count: "X applications" in secondary text 
  below the title — calculated from the fetched data

Right side:
  Primary button: "+ New Application" → navigates to 
  /new-application

---

SEARCH AND FILTERS BAR

Below the header, a full-width bar containing:

Search input (left, 280px wide):
  Placeholder: "Search by job title or company…"
  Filters the list in real time on keystroke
  Magnifying glass icon inside left of input

Filter pills (right of search, scrollable on mobile):
  [ All ] [ Saved ] [ Applied ] [ Interview ] [ Offer ] [ Rejected ]
  Only one active at a time
  Active: solid brand blue bg, white text
  Inactive: surface card bg, secondary text
  Clicking filters the list to that status

Sort dropdown (far right):
  Options: "Newest first" | "Oldest first" | "Company A–Z"
  Default: Newest first

---

FETCH ALL APPLICATIONS ON MOUNT

  const { data: applications, error } = await supabase
    .from('applications')
    .select('id, job_title, company, status, created_at, next_action_date, job_parsed_json')
    .order('created_at', { ascending: false })

Show skeleton rows while loading (3 shimmer rows).
If error, show red toast: "Failed to load applications"

---

APPLICATION LIST

Full-width list of rows. Each row is a surface card 
(background: card surface colour, border, border-radius 12px)
with 16px padding. Rows have 8px gap between them.

Each row contains:

LEFT — Company avatar (40x40px circle):
  If company name exists: show first letter of company name
  Background: gradient using brand blue to purple
  White letter, 16px bold

MIDDLE — Main content (flex: 1):
  Line 1: job_title (15px, semibold, primary text)
  Line 2: company name · location if available 
           (13px, secondary text)
  Line 3: status badge pill + date applied + 
           next action date amber pill if set

  Status badge colours:
    saved → rgba(148,163,184,0.15) bg, secondary text
    applied → rgba(26,86,219,0.15) bg, #1A56DB text
    interview_scheduled → rgba(245,158,11,0.15) bg, #F59E0B text
    interview_done → rgba(139,92,246,0.15) bg, #8B5CF6 text
    offer → rgba(16,185,129,0.15) bg, #10B981 text
    rejected → rgba(239,68,68,0.15) bg, #EF4444 text

RIGHT — Score + Actions:
  AI match score badge (if feedback has been run):
    Circle badge showing overall_score number
    Colour: green ≥80, amber 60-79, red <60
    Label: "Match" below the number in 10px secondary text
  
  Three icon buttons:
    Analyse icon (brain/sparkle icon) → triggers AI feedback
    Eye icon → opens Application Detail Panel
    Trash icon → delete with confirmation

Clicking anywhere on the row (except icon buttons) opens 
the Application Detail Panel.

---

APPLICATION DETAIL PANEL

Opens as a side drawer from the right (400px wide on 
desktop, full screen on mobile).
Glass treatment: backdrop blur, dark/light appropriate bg.
Close button top right (X icon).

Panel has 5 tabs:
  Overview | Feedback | CV | Cover Letter | Notes

--- TAB: OVERVIEW ---

Job title (20px bold) and company name
Status badge + status update dropdown:
  <select> with all 6 status options
  On change:
    await supabase
      .from('applications')
      .update({ status: newValue })
      .eq('id', applicationId)
  Update local state immediately.

Next action date picker:
  Label: "NEXT ACTION DATE"
  Date input, on change saves to applications.next_action_date

Status timeline:
  Vertical line with dated events showing status history
  Show at minimum: "Applied on DD MMM YYYY"
  Show current status as the latest event

Job description summary from job_parsed_json:
  Key skills as chips
  Top 3 requirements as bullet points

--- TAB: FEEDBACK ---

This is the AI feedback tab powered by analyse-application.

INITIAL STATE (no feedback yet):
  Centred empty state:
    Brain/sparkle icon (40px, brand blue tint)
    Heading: "Get AI Feedback"
    Body: "Find out how strong this application really is. 
    Our AI analyses your CV against the job requirements 
    and gives you honest, actionable feedback."
    Primary button: "Analyse Application"

LOADING STATE (while calling analyse-application):
  Full tab shimmer with rotating copy:
    "Reading the job requirements…"
    "Reviewing your CV…"  
    "Forming an honest opinion…"
    "Writing up feedback…"
  Cycle every 1.5 seconds

FEEDBACK LOADED STATE:

Section 1 — Score header:
  Large score circle (80px) centred at top:
    Number bold 32px inside
    Green ring ≥80, amber ring 60-79, red ring <60
  Verdict label below: "Strong Match" / "Good Match" / 
  "Moderate Match" / "Weak Match" / "Poor Match"
  verdict_summary text below in secondary text, 14px

  Interview likelihood pill:
    "Likely to get interview" → green pill
    "Possible" → amber pill
    "Unlikely" → red pill
    With the interview_likelihood_reasoning text as tooltip

Section 2 — CV Quality scores (3 mini score bars):
  SUMMARY QUALITY    [====      ] 6/10
  BULLET STRENGTH    [=======   ] 7/10
  KEYWORD MATCH      [====      ] 5/10
  
  Each bar: label left, progress bar centre, score right
  Clicking a bar expands to show the feedback text for 
  that dimension
  Bar colour matches score (green/amber/red)

Section 3 — Strengths (collapsible, default open):
  Header: "✓ Strengths" in green
  Each strength as a card:
    Title bold, detail text below in secondary text

Section 4 — Weaknesses (collapsible, default open):
  Header: "✗ Areas to Improve" in amber/red
  Each weakness as a card:
    Title bold
    Detail text in secondary text
    Fix suggestion in a blue-tinted box below:
      "💡 Fix: [fix text]"

Section 5 — Top 3 Actions:
  Header: "Top Actions to Improve This Application"
  Three numbered cards:
    Priority number (large, brand blue)
    Action text (bold)
    Reason text (secondary, smaller)

Section 6 — Missing Keywords:
  Header: "MISSING KEYWORDS"
  Chips in amber tint for each missing keyword
  Helper text: "Consider adding these to your CV"
  Edit CV button → navigates to cv-editor for this application

Regenerate feedback button at bottom (ghost style):
  "↻ Re-analyse"
  Calls analyse-application again and replaces content

--- TAB: CV ---

If generated CV exists:
  Preview the cv_json summary (name, summary, skills chips,
  first 2 work history roles)
  "Edit CV" button → navigates to /cv-editor/[generated_cv_id]
  "Download CV" button → calls downloadCvPdf from pdf-generator

If no generated CV:
  Empty state: "No CV generated yet"
  Button: "Generate CV" → navigates to /new-application

--- TAB: COVER LETTER ---

If cover letter exists (fetch from cover_letters table):
  Show content in a read-only text area
  "Edit & Download" button → navigates to cover letter screen

If no cover letter:
  Empty state: "No cover letter yet"
  Button: "Generate Cover Letter" 
  On click: calls generate-cover-letter Edge Function with
  the application's generated_cv_id and tone 'professional'
  Shows spinner while generating
  On success: displays the letter in the tab

--- TAB: NOTES ---

Interview notes form:
  Interview date: date input
  Interview type: select (Phone / Video / In-Person / 
  Assessment Centre)
  Outcome: text input (optional)
  Notes: large textarea

  On blur of any field:
    await supabase
      .from('interview_notes')
      .upsert({
        application_id: applicationId,
        notes_text: notesText,
        interview_date: interviewDate,
        interview_type: interviewType,
        outcome: outcome
      })
  
  Fetch existing notes on panel open:
    const { data } = await supabase
      .from('interview_notes')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

---

ANALYSE APPLICATION API CALL

When "Analyse Application" button is clicked:

  const { data: { session } } = await supabase.auth.getSession()

  // First get the generated_cv_id for this application
  const { data: cvData } = await supabase
    .from('generated_cvs')
    .select('id')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!cvData) {
    showToast('error', 'Generate a CV for this application first')
    return
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/analyse-application`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyZXhnamFoa2RqcXh2dWxvZHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNzAzNjUsImV4cCI6MjA4Nzk0NjM2NX0.pkV8MPJYG-AyBPk5qG7iDJCT86aOzVKcti1wfygqpRM'
      },
      body: JSON.stringify({
        application_id: applicationId,
        generated_cv_id: cvData.id
      })
    }
  )

  const result = await response.json()

  if (result.success) {
    setFeedback(result.feedback)
  } else {
    showToast('error', 'Analysis failed. Please try again.')
  }

Store feedback in local component state — do not persist 
to database (it can be regenerated on demand).

---

DELETE APPLICATION

Trash icon on each row:
  Confirmation dialog: "Delete [Job Title] at [Company]? 
  This will also delete the generated CV, cover letter, 
  and all notes. This cannot be undone."
  
  On confirm:
    await supabase
      .from('applications')
      .delete()
      .eq('id', applicationId)
  
  Remove from local state immediately.
  Show toast: "Application deleted"

---

EMPTY STATE

If no applications after loading:
  Centred in the page:
    Illustration: large inbox/folder icon (64px, muted)
    Heading: "No applications yet"
    Body: "Start by adding a job you want to apply for"
    Primary button: "+ New Application" → /new-application

If search/filter returns no results:
  "No applications match your search"
  "Clear filters" link resets search and filter

---

SUPABASE_URL is https://hrexgjahkdjqxvulodqu.supabase.co