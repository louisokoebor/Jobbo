Remove all existing CV upload logic from the New Application 
page completely. Delete any Make server function calls, any 
references to make-server-3bbff5cf, and any broken upload 
wiring.

Then rewire the CV upload from scratch using only the 
Supabase client directly — no custom server functions needed.

Here is the complete upload flow to implement:

---

HIDDEN FILE INPUT

Add a hidden file input to the page:
  <input
    type="file"
    id="cv-upload-input"
    accept=".pdf,.docx"
    style="display:none"
  />

When "Upload CV →" in the amber banner is clicked OR when 
"Upload new CV" is selected in the CV dropdown:
  document.getElementById('cv-upload-input').click()
  Prevent any navigation — stay on this page.

---

ON FILE SELECTED — VALIDATE

  const file = event.target.files[0]
  if (!file) return

  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]

  if (!allowedTypes.includes(file.type)) {
    showToast('error', 'Please upload a PDF or DOCX file')
    return
  }

  if (file.size > 10 * 1024 * 1024) {
    showToast('error', 'File exceeds 10MB. Please use a smaller file.')
    return
  }

---

SHOW UPLOAD PROGRESS

Replace the amber banner (or dropdown) with an inline 
progress indicator — same dimensions, same border-radius:
  Left: file icon + filename + filesize
  Right: brand blue spinner + "Uploading..."

Disable the Generate CV button.

---

UPLOAD TO SUPABASE STORAGE

  const { data: { session } } = await supabase.auth.getSession()
  const userId = session.user.id
  const filePath = `${userId}/${Date.now()}-${file.name}`

  const { error: uploadError } = await supabase
    .storage
    .from('cv-uploads')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false
    })

  if (uploadError) {
    showToast('error', 'Upload failed. Please try again.')
    restoreAmberBanner()
    return
  }

  // Get a signed URL valid for 1 hour
  const { data: urlData } = await supabase
    .storage
    .from('cv-uploads')
    .createSignedUrl(filePath, 3600)

  const fileUrl = urlData.signedUrl

---

UPDATE PROGRESS TEXT

  Right side of progress indicator: 
  "Uploading..." → "Reading your CV..."

---

CALL PARSE-CV EDGE FUNCTION

  const { data: { session } } = await supabase.auth.getSession()

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/parse-cv`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        file_url: fileUrl,
        label: file.name.replace(/\.[^/.]+$/, '')
      })
    }
  )

  const result = await response.json()

  if (!result.success) {
    showToast('error', "Couldn't read your CV. Make sure it is a readable PDF or DOCX.")
    restoreAmberBanner()
    return
  }

---

ON SUCCESS — SHOW CV DROPDOWN

  // Fetch fresh CV profiles list
  const { data: profiles } = await supabase
    .from('cv_profiles')
    .select('id, label, created_at, is_default')
    .order('is_default', { ascending: false })

  // Replace amber banner / progress indicator with dropdown
  // Populated from profiles array
  // Auto-select result.cv_profile_id
  selectedCvProfileId = result.cv_profile_id

  showToast('success', 'CV uploaded and ready to use')

  // Re-evaluate Generate CV button
  // Enable if applicationId also exists in local state
  if (applicationId) {
    enableGenerateCvButton()
  }

---

ERROR FALLBACK

If anything fails at any step:
  Restore the amber banner exactly as before
  Show the red toast with the message for that step
  Never navigate away from the page
  Never leave the UI in a broken or empty state