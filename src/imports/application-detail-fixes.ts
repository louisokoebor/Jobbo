Fix the data fetching on the Application Detail page 
/applications/[id]. The CV, Cover Letter and Feedback tabs 
are not loading existing data.

Find the data fetching code on mount and replace the entire 
fetch block with this:

  const id = // get from URL params as before

  // Fetch application first
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select('*')
    .eq('id', id)
    .single()

  if (appError || !application) {
    setLoadError(true)
    setLoading(false)
    return
  }

  setApplication(application)

  // Fetch related records separately with maybeSingle()
  // maybeSingle() returns null instead of throwing when 
  // no row exists — this is the critical fix

  const { data: cvData } = await supabase
    .from('generated_cvs')
    .select('id, cv_json, match_score, feedback_json, feedback_generated_at, template_id, pdf_url, created_at')
    .eq('application_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: coverLetterData } = await supabase
    .from('cover_letters')
    .select('id, content, tone, pdf_url, updated_at, created_at')
    .eq('application_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: notesData } = await supabase
    .from('interview_notes')
    .select('*')
    .eq('application_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  setGeneratedCv(cvData ?? null)
  setCoverLetter(coverLetterData ?? null)
  setNotes(notesData ?? null)
  setLoading(false)

  // If CV exists and feedback_json is null, 
  // auto-trigger analysis in the background
  if (cvData && !cvData.feedback_json) {
    runAnalysis(cvData.id)
  }

  // If CV exists and feedback_json already exists,
  // load it directly into feedback state
  if (cvData?.feedback_json) {
    setFeedback(cvData.feedback_json)
  }

---

Also add a runAnalysis function that can be called both 
on mount (if no feedback yet) and when the user clicks 
Re-analyse:

  const runAnalysis = async (cvId: string) => {
    setAnalysisLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

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
            generated_cv_id: cvId
          })
        }
      )

      const result = await response.json()
      if (result.success) {
        setFeedback(result.feedback)
        setGeneratedCv(prev => prev ? {
          ...prev,
          feedback_json: result.feedback,
          match_score: result.feedback.overall_score
        } : prev)
      }
    } catch (e) {
      console.error('Analysis error:', e)
    } finally {
      setAnalysisLoading(false)
    }
  }

---

Fix the conditional rendering for each tab:

CV tab condition:
  Show empty state ONLY if: generatedCv === null
  Show CV preview if: generatedCv !== null

Cover Letter tab condition:
  Show empty state ONLY if: coverLetter === null
  Show letter content if: coverLetter !== null

Feedback tab condition:
  Show "generate CV first" ONLY if: generatedCv === null
  Show loading state if: generatedCv !== null AND 
    analysisLoading === true
  Show "analyse" prompt if: generatedCv !== null AND 
    feedback === null AND analysisLoading === false
  Show feedback if: feedback !== null

The bug is that all three were showing empty state because 
the original .single() calls were throwing errors when 
no row was found, causing all related data to be set to 
null even when records exist.

Do not change any styling or layout.