After the CV Editor screen, add a Cover Letter screen that 
appears as the next step in the flow after generating a CV.

The route is /cover-letter/[application_id]/[generated_cv_id]

After the user clicks "Save & Continue" or "Generate Cover 
Letter" on the CV Editor, navigate to this screen.

---

SCREEN LAYOUT

Same nav bar as all other screens.
Breadcrumb: "Dashboard / New Application / Cover Letter"
Page title: "Cover Letter"

Two-panel layout (same as CV Editor):
  Left panel (55%): editor and controls
  Right panel (45%): live preview of the letter

---

LEFT PANEL

TONE SELECTOR
Three pill buttons in a row — only one active at a time:
  [ Professional ]  [ Conversational ]  [ Confident ]
Default selected: Professional
Active state: solid brand blue background, white text
Inactive state: surface card background, secondary text

GENERATE BUTTON
Below tone selector:
  Large primary button: "Generate Cover Letter"
  On first load, auto-generate immediately using 
  tone = 'professional' — do not make the user click

LETTER EDITOR
Below the generate button:
  Full-width rich text area showing the generated letter
  Min height 400px, resizable
  Same input styling as the rest of the app
  Character count bottom right
  Auto-saves on blur (debounced 1000ms)

  Auto-save calls:
    await supabase
      .from('cover_letters')
      .update({ content: editorContent })
      .eq('id', coverLetterId)

REGENERATE BUTTON
Ghost style button below the editor:
  "↻ Regenerate with [selected tone]"
  On click: calls generate-cover-letter again with new tone
  Shows spinner while generating, replaces editor content 
  on success

---

RIGHT PANEL — LIVE PREVIEW

Shows the letter formatted as it would appear on the PDF:
  Candidate name (from CV) as header — bold, large
  Today's date — right aligned
  Letter body paragraphs with proper spacing
  Updates live as user edits the text area (300ms debounce)

---

GENERATE COVER LETTER API CALL

On mount (and on Regenerate click):

  const { data: { session } } = await supabase.auth.getSession()

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/generate-cover-letter`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyZXhnamFoa2RqcXh2dWxvZHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNzAzNjUsImV4cCI6MjA4Nzk0NjM2NX0.pkV8MPJYG-AyBPk5qG7iDJCT86aOzVKcti1wfygqpRM'
      },
      body: JSON.stringify({
        application_id: applicationId,
        generated_cv_id: generatedCvId,
        tone: selectedTone
      })
    }
  )

  const result = await response.json()

  if (result.success) {
    setCoverLetterId(result.cover_letter_id)
    setEditorContent(result.content)
  } else {
    showToast('error', 'Failed to generate cover letter. Please try again.')
  }

While generating: show skeleton shimmer in the right panel 
and a spinner on the generate/regenerate button.

---

BOTTOM ACTION BAR (sticky)

Three buttons in a row:
  1. "← Back to CV" — ghost button — navigates back to 
     /cv-editor/[generated_cv_id]
  
  2. "Download Cover Letter" — secondary button — calls 
     downloadCoverLetterPdf(editorContent, candidateName)
     from pdf-generator.js
  
  3. "Save & Finish →" — primary button — navigates to 
     /dashboard and shows success toast:
     "Application saved! Good luck 🎉"

---

CV EDITOR CHANGES

On the CV Editor screen, add a "Generate Cover Letter →" 
primary button in the bottom action bar next to the existing 
Download button.

On click: navigate to 
/cover-letter/[application_id]/[generated_cv_id]

The application_id is already stored in local state from 
when the application was created. The generated_cv_id comes 
from the URL parameter of the CV editor route.

---

DESIGN
Same dark/light theme support as all other screens.
Same glass nav, same surface cards, same button styles.
Same toast notifications for errors and success.
No new design patterns — reuse everything already built.