The parse-cv Make server function now returns the parsed CV JSON
instead of saving it to Supabase itself. Update the CV upload 
flow in the frontend to save to Supabase directly after 
receiving the parsed JSON.

Find the handleCvFileSelect function. After the fetch call to
make-server-3bbff5cf/parse-cv succeeds, replace the current
success handling with this:

  const result = await response.json()

  if (!response.ok || result.success === false) {
    addToast('error', "Couldn't read your CV. Make sure it's a readable PDF or DOCX.")
    setIsUploadingCv(false)
    setUploadingCvFile(null)
    setSelectedCvId(prevId)
    return
  }

  // Check if this is the user's first CV profile
  const { data: existingProfiles } = await supabase
    .from('cv_profiles')
    .select('id')
    .eq('user_id', session.user.id)

  const isFirst = !existingProfiles || existingProfiles.length === 0

  // Save parsed CV to Supabase directly from frontend
  const { data: savedProfile, error: saveError } = await supabase
    .from('cv_profiles')
    .insert({
      user_id: session.user.id,
      label: result.label || file.name.replace(/\.[^/.]+$/, ''),
      parsed_json: result.parsed_json,
      raw_file_url: fileUrl,
      is_default: isFirst
    })
    .select('id')
    .single()

  if (saveError) {
    console.error('cv_profiles save error:', saveError)
    addToast('error', 'CV parsed but could not be saved. Please try again.')
    setIsUploadingCv(false)
    setUploadingCvFile(null)
    setSelectedCvId(prevId)
    return
  }

  // Fetch fresh profiles and auto-select the new one
  const freshProfiles = await fetchCvProfiles()
  setCvProfiles(freshProfiles)
  setSelectedCvId(savedProfile.id)
  setIsUploadingCv(false)
  setUploadingCvFile(null)
  addToast('success', 'CV uploaded and ready to use')

Do not change any other code or styling.