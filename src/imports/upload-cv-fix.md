Fix the "Upload new CV" option in the BASE CV dropdown on the 
New Application screen. Currently clicking it does nothing. 
Wire it up completely.

Do not change any styling or layout. Fix functionality only.

---

WHAT SHOULD HAPPEN WHEN "Upload new CV" IS CLICKED

Do not navigate away from the page. Instead, trigger a hidden 
file input click inline on this page so the user can upload 
without losing their job description progress.

---

STEP 1 — ADD HIDDEN FILE INPUT

Add a hidden file input element to the page (not visible in UI):
  <input 
    type="file" 
    id="cv-upload-input" 
    accept=".pdf,.docx" 
    style="display:none"
  />

When the user selects "Upload new CV" from the dropdown, 
programmatically trigger a click on this hidden input:
  document.getElementById('cv-upload-input').click()

---

STEP 2 — HANDLE FILE SELECTION

When the user selects a file from the file picker:

Validation — before doing anything, check:
  - File type must be .pdf or .docx
    Allowed MIME types: 
      application/pdf
      application/vnd.openxmlformats-officedocument.wordprocessingml.document
    If invalid: show red toast "Please upload a PDF or DOCX file"
    Return, do nothing else.

  - File size must be under 10MB (10 * 1024 * 1024 bytes)
    If too large: show red toast "File exceeds 10MB. Please use 
    a smaller file."
    Return.

If validation passes, proceed to Step 3.

---

STEP 3 — SHOW UPLOAD PROGRESS IN THE DROPDOWN

Replace the dropdown with an inline upload progress indicator
while the file uploads and parses. Style it the same as the 
dropdown (same height, same border, same border-radius):

  Left side: 
    - Filename truncated with ellipsis if too long
    - Filesize in secondary text e.g. "resume.pdf · 2.3 MB"
  Right side: 
    - Spinner (brand blue) + "Uploading..." in secondary text 13px

Do not allow the user to click Generate CV during this process
(keep the Generate CV button disabled).

---

STEP 4 — UPLOAD TO SUPABASE STORAGE

  const session = (await supabase.auth.getSession()).data.session
  const userId = session.user.id
  const fileExt = file.name.split('.').pop()
  const filePath = `${userId}/${Date.now()}-${file.name}`

  const { data: uploadData, error: uploadError } = await supabase
    .storage
    .from('cv-uploads')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false
    })

  If uploadError:
    Show red toast: "Upload failed. Please try again."
    Restore the dropdown to its previous state.
    Return.

  Get the file URL:
  const { data: urlData } = await supabase
    .storage
    .from('cv-uploads')
    .createSignedUrl(filePath, 3600)

  const fileUrl = urlData.signedUrl

---

STEP 5 — UPDATE PROGRESS INDICATOR

Update the inline progress indicator text:
  "Uploading..." → "Reading your CV..."

---

STEP 6 — CALL PARSE-CV EDGE FUNCTION

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/parse-cv`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file_url: fileUrl,
        label: file.name.replace(/\.[^/.]+$/, '')
      })
    }
  )
  const result = await response.json()

  If result.success === false or response not ok:
    Show red toast: "Couldn't read your CV. Make sure it's a 
    readable PDF or DOCX and try again."
    Restore dropdown to previous state.
    Return.

---

STEP 7 — UPDATE THE DROPDOWN WITH THE NEW CV

On success:

  Re-fetch all CV profiles from Supabase to get the updated list
  including the newly parsed one:

    const { data: profiles } = await supabase
      .from('cv_profiles')
      .select('id, label, created_at, is_default')
      .order('is_default', { ascending: false })

  Rebuild the dropdown options from the fresh profiles list.

  Auto-select the newly uploaded CV (result.cv_profile_id) 
  in the dropdown.

  Update local state: set selectedCvProfileId = result.cv_profile_id

  Show green success toast: "CV uploaded and ready to use"

  Re-enable the Generate CV button if a job description 
  has already been parsed (applicationId exists in local state).

---

STEP 8 — ERROR FALLBACK

If anything fails at any point (upload, parse, or refetch):
  Restore the dropdown to its previous state (showing the 
  previously selected CV profile or the placeholder if none 
  was selected before)
  
  Show red toast with a specific message per step above.
  
  Do not leave the user with a broken or empty dropdown.

---

SUMMARY OF LOCAL STATE CHANGES
  selectedCvProfileId → updated to newly uploaded CV id
  cvProfiles list → refreshed from Supabase after upload
  Generate CV button → re-evaluates its enabled/disabled state
    after upload completes (enabled if applicationId also exists)