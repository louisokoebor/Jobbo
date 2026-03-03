Fix two connected issues in the onboarding flow.

---

ISSUE 1 — CV not saving to cv_profiles after upload

Find the CV upload handler in OnboardingWizard.tsx.

After the call to make-server-3bbff5cf/parse-cv succeeds 
and returns parsed_json, the code must save to the 
cv_profiles table. Check if this save is happening.

The save must look exactly like this:

  const { data: { session } } = 
    await supabase.auth.getSession()

  const { data: savedProfile, error: saveError } = 
    await supabase
      .from('cv_profiles')
      .insert({
        user_id: session.user.id,
        label: result.label || 
          file.name.replace(/\.[^/.]+$/, ''),
        parsed_json: result.parsed_json,
        raw_file_url: fileUrl,
        is_default: true
      })
      .select('id')
      .single()

  if (saveError) {
    console.error('cv_profiles save error:', saveError)
    showError('Failed to save CV. Please try again.')
    return
  }

  console.log('CV saved to cv_profiles:', savedProfile.id)
  // Store savedProfile.id in component state
  setSavedCvProfileId(savedProfile.id)
  // Proceed to step 2
  setStep(2)

If this save is missing or the error is being swallowed, 
add it now. The cv_profiles insert MUST happen before 
moving to step 2.

---

ISSUE 2 — Onboarding sends user back to start after 
completing step 3

Find the "Go to Dashboard" button handler on step 3 
of the onboarding wizard.

Replace whatever it currently does with this:

  const handleFinishOnboarding = async () => {
    // Verify the CV profile was actually saved
    const { data: { session } } = 
      await supabase.auth.getSession()
    
    if (!session) {
      navigate('/login', { replace: true })
      return
    }

    const { data: profiles } = await supabase
      .from('cv_profiles')
      .select('id')
      .eq('user_id', session.user.id)
      .limit(1)

    if (!profiles || profiles.length === 0) {
      // CV was not saved — go back to step 1
      console.error('No CV profile found — restarting')
      setStep(1)
      showError('Something went wrong. Please upload your CV again.')
      return
    }

    // CV exists — safe to go to dashboard
    navigate('/dashboard', { replace: true })
  }

Wire this function to the "Go to Dashboard" button 
on step 3 of the onboarding wizard.

---

ISSUE 3 — Auth callback routes back to onboarding 
for users who already completed it

The /auth/callback page checks cv_profiles to decide 
whether to send the user to /onboarding or /dashboard.
If the CV is not saved correctly this check always 
fails and the user loops back to onboarding.

Fixing issues 1 and 2 above will fix this automatically
once cv_profiles is being populated correctly.

---

DEBUGGING — add these console logs so we can verify 
the fix is working:

In the CV upload handler, after the parse-cv call:
  console.log('parse-cv result:', result)

After the cv_profiles insert:
  console.log('cv_profiles insert result:', savedProfile)
  console.log('cv_profiles insert error:', saveError)

In the handleFinishOnboarding function:
  console.log('profiles check:', profiles)

Do not change any styling or layout.
Do not change any other pages.