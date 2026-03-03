Fix the "Upload CV →" link in the BASE CV card on the New 
Application screen. Currently clicking it navigates away to 
another page which loses the user's job description progress. 
It must never navigate away from this page.

Do not change any styling or layout. Fix functionality only.

---

THE FIX

The amber banner currently has an "Upload CV →" link that 
navigates to /profile or /login. Remove that navigation 
behaviour completely.

Instead, when "Upload CV →" is clicked:
  - Stay on the New Application page
  - Programmatically trigger a hidden file input click
  - The rest of the upload flow runs inline on this page

---

STEP 1 — REMOVE THE NAVIGATION

Find the "Upload CV →" link/button in the amber banner inside 
the BASE CV card. Remove any href, routing, or navigation 
action attached to it. It must not navigate anywhere.

---

STEP 2 — ADD HIDDEN FILE INPUT

Add a hidden file input element to the page (not visible in UI):
  <input
    type="file"
    id="cv-upload-input"
    accept=".pdf,.docx"
    style="display:none"
  />

On "Upload CV →" click, trigger:
  document.getElementById('cv-upload-input').click()

---

STEP 3 — VALIDATE THE FILE

When the user selects a file:

  If file type is not .pdf or .docx:
    Show red toast: "Please upload a PDF or DOCX file"
    Return.

  If file size exceeds 10MB (10 * 1024 * 1024 bytes):
    Show red toast: "File exceeds 10MB. Please use a smaller file."
    Return.

  Allowed MIME types:
    application/pdf
    application/vnd.openxmlformats-officedocument.wordprocessingml.document

---

STEP 4 — REPLACE THE AMBER BANNER WITH UPLOAD PROGRESS

Once a valid file is selected, replace the amber banner with 
an inline progress card (same dimensions, same border-radius, 
same border):
  
  Left side:
    - File icon
    - Filename in --text-primary 13px (truncated if long)
    - Filesize in --text-secondary 12px e.g. "2.3 MB"
  Right side:
    - Brand blue spinner + "Uploading..." --text-secondary 13px

Keep the Generate CV button disabled during this entire process.

---

STEP 5 — UPLOAD TO SUPABASE STORAGE

  const session = (await supabase.auth.getSession()).data.session
  const userId = session.user.id
  const filePath = `${userId}/${Date.now()}-${file.name}`

  const { error: uploadError } = await supabase
    .storage
    .from('cv-uploads')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false
    })

  If uploadError:
    Show red toast: "Upload failed. Please try again."
    Restore the amber banner.
    Return.

  Get signed URL:
  const { data: urlData } = await supabase
    .storage
    .from('cv-uploads')
    .createSignedUrl(filePath, 3600)

  const fileUrl = urlData.signedUrl

---

STEP 6 — UPDATE PROGRESS TEXT

Update the right side of the progress card:
  "Uploading..." → "Reading your CV..."

---

STEP 7 — CALL PARSE-CV EDGE FUNCTION

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

  If result.success === false:
    Show red toast: "Couldn't read your CV. Make sure it is a 
    readable PDF or DOCX and try again."
    Restore the amber banner.
    Return.

---

STEP 8 — REPLACE AMBER BANNER WITH CV DROPDOWN

On success, the amber banner is gone permanently. Replace the 
entire BASE CV card contents with the standard CV dropdown:

  Re-fetch CV profiles:
    const { data: profiles } = await supabase
      .from('cv_profiles')
      .select('id, label, created_at, is_default')
      .order('is_default', { ascending: false })

  Render the dropdown populated with real profiles.
  
  Auto-select the newly uploaded CV:
    selectedCvProfileId = result.cv_profile_id

  Add "Upload new CV" as the last option in the dropdown.
  Wire that option to trigger the same hidden file input 
  click as above so the user can upload additional CVs.

  Show green success toast: "CV uploaded and ready to use"

  Re-evaluate the Generate CV button:
    Enable it if applicationId also exists in local state
    (meaning a job has already been fetched and parsed)

---

STEP 9 — ERROR FALLBACK

If anything fails at any step:
  Restore the amber banner exactly as it was before
  Show the appropriate red toast message
  Do not leave the page in a broken state
  Do not navigate away under any circumstances