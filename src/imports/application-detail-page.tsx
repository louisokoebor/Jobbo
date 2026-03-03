Create an Application Detail page at the route /applications/[id].

This is a full page — not a drawer or panel.
Navigated to when clicking a row on the Applications page.
Same nav bar, same dark/light theme, same design system.

---

PAGE LAYOUT

Sticky nav at top.
Scrollable content below.
Max content width: 1280px, centred, padding 0 24px.
Background: same radial gradient as other screens.

---

FETCH DATA ON MOUNT

Get the application id from the URL parameter.

Run these queries in parallel:

  const [appResult, cvResult, coverLetterResult, notesResult] = 
    await Promise.all([

      supabase
        .from('applications')
        .select('*')
        .eq('id', id)
        .single(),

      supabase
        .from('generated_cvs')
        .select('id, cv_json, match_score, feedback_json, feedback_generated_at, template_id, pdf_url')
        .eq('application_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),

      supabase
        .from('cover_letters')
        .select('id, content, tone, pdf_url, updated_at')
        .eq('application_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),

      supabase
        .from('interview_notes')
        .select('*')
        .eq('application_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ])

  const application = appResult.data
  const generatedCv = cvResult.data  // may be null
  const coverLetter = coverLetterResult.data  // may be null
  const notes = notesResult.data  // may be null

If application is null or fetch fails:
  Show error state: "Application not found"
  Back button to /applications

While loading: show full-page skeleton with shimmer

---

PAGE HEADER (padding-top 28px)

Breadcrumb row:
  "Applications" (link → /applications) / "[job_title]"
  Font 13px secondary text
  "/" separator in muted colour
  "Applications" has hover underline

Below breadcrumb (margin-top 8px):
Flex row, space-between, align-items flex-start:

Left:
  Job title — 28px, 600 weight, primary text
  Company name — 16px, secondary text, margin-top 4px

Right (flex row, gap 8px):
  Status dropdown (inline, not full width):
    Height 36px, width auto, padding 0 12px
    Shows current status with coloured dot indicator
    Options: Saved / Applied / Interview Scheduled / 
             Interview Done / Offer / Rejected
    On change:
      await supabase
        .from('applications')
        .update({ status: newStatus })
        .eq('id', id)
      Update local state immediately
  
  Back button (ghost style):
    "← Applications"
    Navigates to /applications

---

TAB BAR (margin-top 24px)

Horizontal tab bar, full width:
  Border-bottom: 1px solid border colour
  Tabs: Overview · Feedback · CV · Cover Letter · Notes

Tab style:
  Height 44px, padding 0 20px
  Font 14px, 500 weight
  Active: primary text, border-bottom 2px solid #1A56DB, 
          margin-bottom -1px
  Inactive: secondary text, no border
  Hover inactive: primary text

Read the ?tab= query param on mount to set the initial 
active tab. Default to Overview if no param.

On tab click: update URL query param without full navigation
  e.g. /applications/[id]?tab=feedback

---

TAB CONTENT AREA (padding-top 24px, padding-bottom 60px)

Two-column layout for Overview and Feedback tabs on desktop:
  Left column (65%): main content
  Right column (35%): sidebar info
Single column for CV, Cover Letter, Notes tabs.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAB: OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LEFT COLUMN:

Section: Job Description Summary
  Surface card, padding 24px
  From job_parsed_json:

  "Key Skills" label (section label style)
  Skills as chips (flex-wrap):
    Each chip: surface elevated bg, border, border-radius 999px,
    padding 4px 12px, 13px secondary text
  
  Margin-top 16px
  "Requirements" label
  Requirements as bullet list (top 6):
    Each: flex row, gap 8px, 5px circle bullet, 
    13px primary text, line-height 1.6
  
  Margin-top 16px  
  "Responsibilities" label
  Responsibilities as bullet list (top 4, with Show more):
    Same bullet style
    If more than 4: "Show all (X)" link in brand blue

  If job_url exists:
    "View original job posting →" link at bottom
    Opens in new tab

RIGHT COLUMN:

Card 1: Application Details
  Surface card, padding 20px
  
  Row: "APPLIED" label + date value
  Row: "STATUS" label + coloured status badge
  
  Divider
  
  "NEXT ACTION DATE" label
  Date input (full width):
    Default value: next_action_date
    On change:
      await supabase
        .from('applications')
        .update({ next_action_date: value })
        .eq('id', id)

Card 2: Status Timeline
  Surface card, padding 20px
  "TIMELINE" section label
  
  Vertical timeline:
    Each event: dot + date + label
    Dot: 10px circle
    Line connecting dots: 1px solid border colour
    
    Always show: "Created" with created_at date
    Show current status as the most recent event
    
    Status colours match badge colours from other screens
    Most recent event dot is filled brand blue
    Previous events dot is surface elevated

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAB: FEEDBACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Check generatedCv.feedback_json on mount.

If feedback_json is null AND no generated CV exists:
  Full-width centred empty state:
    Sparkles icon 48px, brand blue tint
    "Generate a CV first"
    "AI feedback is available once you have generated 
    a tailored CV for this application."
    Primary button: "Generate CV" → /new-application

If feedback_json is null AND generated CV exists:
  Full-width centred empty state:
    Sparkles icon 48px, brand blue tint
    "Get AI Feedback"
    "Find out exactly how strong this application is. 
    Our AI critically analyses your tailored CV against 
    the job requirements and gives you honest, 
    specific, actionable feedback."
    Primary button: "Analyse Application"
    On click: call analyse-application (see below)

LOADING STATE while calling analyse-application:
  Centred card with spinner
  Rotating status messages every 1.5s:
    "Reading the job requirements…"
    "Reviewing your CV…"
    "Forming an honest opinion…"
    "Writing up feedback…"

FEEDBACK LOADED (feedback_json exists):

LEFT COLUMN:

Score Hero Card (surface card, padding 24px, text-align centre):
  Large score circle (88px diameter):
    Border: 4px solid
      ≥80: #10B981
      60-79: #F59E0B
      <60: #EF4444
    Score number: 32px bold, same colour as border
    Background: transparent
  
  Verdict (margin-top 12px, 16px bold):
    strong_match → "Strong Match" in #10B981
    good_match → "Good Match" in #10B981
    moderate_match → "Moderate Match" in #F59E0B
    weak_match → "Weak Match" in #EF4444
    poor_match → "Poor Match" in #EF4444
  
  verdict_summary (margin-top 8px, 14px secondary text, 
  line-height 1.6, max-width 480px, margin 8px auto 0)
  
  Interview likelihood pill (margin-top 16px, inline-flex):
    very_likely / likely → green pill: "Likely to be interviewed"
    possible → amber pill: "Possible to be interviewed"
    unlikely / very_unlikely → red pill: "Unlikely to be interviewed"
    Title attribute = interview_likelihood_reasoning (tooltip)

CV Quality Scores (surface card, padding 24px, margin-top 16px):
  "CV QUALITY" section label, margin-bottom 16px
  
  Three score bars:
    For each of: Summary Quality · Bullet Strength · 
    Keyword Match
    
    Layout: label (120px) + bar (flex 1) + score (40px)
    Gap 12px between items, margin-bottom 12px
    
    Bar:
      Height 8px, border-radius 999px
      Background track: isDark rgba(148,163,184,0.12) 
                        else rgba(148,163,184,0.2)
      Fill width: (score/10)*100 %
      Fill colour:
        ≥8: #10B981
        ≥6: #F59E0B
        <6: #EF4444
      Transition: width 0.6s ease (animate on mount)
    
    Score: "X/10" in 13px, colour matches fill
    
    Clicking a bar row toggles expansion of feedback text:
      Expandable area below bar: feedback text in 13px 
      secondary text, padding 8px 0
      Smooth height transition

Strengths (surface card, padding 24px, margin-top 16px):
  Header row (flex, space-between):
    "✓ Strengths" in #10B981, 14px semibold
    Chevron toggle (collapses section)
  
  Each strength (margin-top 12px):
    Title: 14px semibold primary text
    Detail: 13px secondary text, margin-top 4px, 
    line-height 1.6

Weaknesses (surface card, padding 24px, margin-top 16px):
  Header row:
    "✗ Areas to Improve" in #F59E0B, 14px semibold
    Chevron toggle
  
  Each weakness (margin-top 12px):
    Title: 14px semibold primary text
    Detail: 13px secondary text, margin-top 4px
    Fix box (margin-top 8px):
      Background: rgba(26,86,219,0.08)
      Border-left: 3px solid #1A56DB
      Border-radius 0 6px 6px 0
      Padding: 10px 14px
      "💡 " + fix text in 13px primary text

RIGHT COLUMN:

Top 3 Actions Card (surface card, padding 24px):
  "TOP ACTIONS" section label
  
  Three action items (gap 16px between):
    Flex row, gap 16px, align-items flex-start
    
    Priority number:
      36px circle, background rgba(26,86,219,0.12),
      border 1px solid rgba(26,86,219,0.2)
      Number: 16px bold #1A56DB
      Flex-shrink 0
    
    Content:
      Action: 14px semibold primary text
      Reason: 13px secondary text, margin-top 4px, 
      line-height 1.5
    
    Divider between items (not after last)

Missing Keywords Card (surface card, padding 24px, 
margin-top 16px):
  "MISSING KEYWORDS" section label
  
  Chips (flex-wrap, gap 6px, margin-top 12px):
    bg rgba(245,158,11,0.10)
    border 1px solid rgba(245,158,11,0.25)
    text #F59E0B
    padding 4px 10px, border-radius 999px, 13px
  
  Helper text (margin-top 12px, 12px secondary):
    "Consider adding these keywords to strengthen your CV"
  
  "Edit CV" button (secondary style, full width, 
  margin-top 12px):
    If generatedCv exists: navigate to /cv-editor/[generatedCv.id]
    Else: disabled

Re-analyse button (ghost, margin-top 16px, full-width):
  "↻ Re-analyse Application"
  On click: call analyse-application again, replace content

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANALYSE APPLICATION API CALL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const { data: { session } } = await supabase.auth.getSession()

  const response = await fetch(
    'https://hrexgjahkdjqxvulodqu.supabase.co/functions/v1/analyse-application',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyZXhnamFoa2RqcXh2dWxvZHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNzAzNjUsImV4cCI6MjA4Nzk0NjM2NX0.pkV8MPJYG-AyBPk5qG7iDJCT86aOzVKcti1wfygqpRM'
      },
      body: JSON.stringify({
        application_id: id,
        generated_cv_id: generatedCv.id
      })
    }
  )

  const result = await response.json()

  if (result.success) {
    setFeedback(result.feedback)
    // Also update local generatedCv state so score 
    // shows immediately without refetch
    setGeneratedCv(prev => ({ 
      ...prev, 
      feedback_json: result.feedback,
      match_score: result.feedback.overall_score
    }))
  } else {
    showToast('error', 'Analysis failed. Please try again.')
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAB: CV
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Single column, max-width 800px, margin 0 auto.

If no generatedCv:
  Empty state card (centred, padding 48px):
    FileText icon 48px muted
    "No CV generated yet"
    "Generate a tailored CV for this application"
    Primary button: "Generate CV" → /new-application

If generatedCv exists:

  Action bar (flex row, gap 8px, margin-bottom 20px):
    Left: "Tailored CV" (16px semibold) + 
          match score badge if feedback exists
    Right: 
      "Edit CV" secondary button → /cv-editor/[generatedCv.id]
      "Download PDF" primary button → 
        calls downloadCvPdf(generatedCv.cv_json, 
        generatedCv.template_id ?? 'clean')

  CV preview card (surface card, padding 32px):
    Name: 24px bold primary text
    Contact line: email · phone · location in 13px secondary
    LinkedIn and portfolio as links if present
    
    Divider
    
    "SUMMARY" section label
    Summary text: 14px, line-height 1.7
    
    Divider
    
    "SKILLS" section label
    Skills as chips (same chip style as job skills)
    
    Divider
    
    "EXPERIENCE" section label
    First 3 work history roles:
      Role title: 15px semibold
      Company + dates: 13px secondary text
      Bullet points: 13px, line-height 1.6, 
      left-border 2px solid rgba(26,86,219,0.3),
      padding-left 12px, margin-left 4px
    
    "EDUCATION" section label (if education exists)
    Education entries: institution, qualification, dates

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAB: COVER LETTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Single column, max-width 800px, margin 0 auto.

If no coverLetter:
  Empty state card (centred, padding 48px):
    Mail icon 48px muted
    "No cover letter yet"
    "Generate a cover letter tailored to this role"
    
    Tone selector row (3 pills: Professional · 
    Conversational · Confident):
      Same pill style as filter pills
      Default: Professional
    
    Primary button: "Generate Cover Letter"
    
    On click:
      Show spinner on button, disable it
      
      const { data: { session } } = 
        await supabase.auth.getSession()
      
      if (!generatedCv) {
        showToast('error', 
          'Generate a CV for this application first')
        return
      }
      
      const response = await fetch(
        'https://hrexgjahkdjqxvulodqu.supabase.co/functions/v1/generate-cover-letter',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyZXhnamFoa2RqcXh2dWxvZHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNzAzNjUsImV4cCI6MjA4Nzk0NjM2NX0.pkV8MPJYG-AyBPk5qG7iDJCT86aOzVKcti1wfygqpRM'
          },
          body: JSON.stringify({
            application_id: id,
            generated_cv_id: generatedCv.id,
            tone: selectedTone
          })
        }
      )
      
      const result = await response.json()
      
      if (result.success) {
        setCoverLetter({ 
          id: result.cover_letter_id,
          content: result.content,
          tone: selectedTone
        })
        showToast('success', 'Cover letter generated')
      } else {
        showToast('error', 
          'Failed to generate cover letter. Try again.')
      }

If coverLetter exists:
  Action bar (flex, space-between):
    Left: tone badge showing current tone
    Right:
      Regenerate dropdown button (ghost):
        Dropdown with 3 tone options
        On select: calls generate-cover-letter again
        Shows spinner while generating
      "Download PDF" primary button:
        Calls downloadCoverLetterPdf(coverLetter.content,
        application.job_title + ' - Cover Letter')
  
  Cover letter preview card (surface card, padding 32px):
    Candidate name (from generatedCv.cv_json.name if available)
    in 16px bold, margin-bottom 4px
    Today's date right-aligned in 13px secondary text
    Divider
    Letter content in 14px, line-height 1.9,
    white-space pre-wrap (preserves paragraph breaks)
  
  Edit textarea (below preview card):
    "EDIT LETTER" section label
    Full-width textarea, min-height 300px
    Pre-filled with coverLetter.content
    On blur (debounced 800ms):
      await supabase
        .from('cover_letters')
        .update({ content: editedContent })
        .eq('id', coverLetter.id)
      Update preview card in real time as user types

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAB: NOTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Single column, max-width 700px, margin 0 auto.

Surface card, padding 24px:

  "INTERVIEW DETAILS" section label
  
  Two columns (gap 16px) on desktop, single on mobile:
    Left: Interview Date input (date type)
    Right: Interview Type select:
      Options: Phone / Video / In-Person / Assessment Centre
  
  Margin-top 16px:
  "OUTCOME" section label
  Text input, placeholder "e.g. Positive, awaiting feedback…"
  
  Margin-top 16px:
  "NOTES" section label
  Textarea, min-height 220px, 
  placeholder "Interview prep notes, questions asked, 
  feedback received…"
  
  All fields auto-save on blur:
    await supabase
      .from('interview_notes')
      .upsert({
        application_id: id,
        notes_text: notesText,
        interview_date: interviewDate || null,
        interview_type: interviewType || null,
        outcome: outcome || null
      },
      { onConflict: 'application_id' })
  
  Show "Saved" confirmation in secondary text for 1.5s 
  after each save (small checkmark + "Saved" text, 
  bottom right of the card)

  Pre-fill all fields from notes fetched on mount.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Below 768px:
  Two-column layouts become single column
  Tab bar scrolls horizontally if tabs overflow
  Header stacks vertically
  Action bars stack vertically with full-width buttons

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESIGN REMINDERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Same glassmorphic nav.
Same surface cards (solid, not glass) for content areas.
Same toast notifications.
Same button styles.
Smooth tab transitions (opacity + translateY 0.15s).
All colour tokens from the established design system.
Dark and light mode both fully supported.