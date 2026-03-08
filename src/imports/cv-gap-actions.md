Add smart gap resolution actions to the Gap Analysis section 
in the CV editor. Do NOT change any other screens or features.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONCEPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The gap analysis shows requirements the CV doesn't evidence.
But the user may HAVE that experience — it just wasn't in 
their CV. Each gap should have a quick action that lets the 
user tell the AI "I do have this — add it" and the AI 
intelligently inserts it into the right place in the CV.

This is a low-token targeted edit, not a full CV regeneration.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UI CHANGES — Gap Analysis card
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each gap item in the gap analysis section currently shows:
  • Listed building experience

Change each gap item to show:

  • Listed building experience
    Two action buttons below the gap text, small and subtle:

    [+ Add to CV]    [✗ I don't have this]

    "Add to CV" button styling:
      fontSize: 11px
      color: #1A56DB
      background: rgba(26,86,219,0.08)
      border: 1px solid rgba(26,86,219,0.2)
      border-radius: 6px
      padding: 3px 10px
      cursor: pointer
      fontWeight: 500
      hover: background rgba(26,86,219,0.15)

    "I don't have this" button styling:
      fontSize: 11px
      color: #6B7280
      background: transparent
      border: 1px solid rgba(107,114,128,0.2)
      border-radius: 6px
      padding: 3px 10px
      cursor: pointer
      hover: color #9CA3AF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"I don't have this" behaviour
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Clicking "I don't have this":
  - Remove this gap item from the displayed list 
    (local state only — do not save to DB)
  - Add it to a local dismissed_gaps Set so it 
    does not reappear until page reload
  - Animate out with opacity 0 + height 0 over 200ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"Add to CV" flow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When "Add to CV" is clicked for a gap item:

STEP 1 — Show a small inline input below the gap item:

  A text field appears with a smart placeholder:
    - If gap is a skill-type term (e.g. "procurement management"):
        placeholder: "Briefly describe your experience 
                      with procurement management..."
    - If gap is an experience/qualification type:
        placeholder: "Which role involved this? 
                      Any details to include?"
    - If gap is a certification/licence:
        placeholder: "Do you hold this? Any details 
                      (date obtained, number, etc.)?"

  The placeholder type is determined by checking if 
  the gap term matches patterns:
    - certifications: contains words like "certificate", 
      "licence", "license", "certified", "qualification", 
      "CSCS", "IPAF", "NEBOSH" etc → certification type
    - skills: short terms (1-3 words) without 
      experience/year language → skill type  
    - default → experience type

  Below the input, two buttons:
    [Apply with AI ✨]    [Cancel]
    
    Apply button: #1A56DB, white text, small
    Cancel: text button, grey

  Input is optional — user can click Apply with AI 
  with an empty input and the AI will make a 
  reasonable insertion based on context alone.

STEP 2 — Call new endpoint: patch-cv-gap

  When Apply is clicked:
    
    1. Show loading state on the gap item:
       - Spinner replaces the ✨ icon
       - Input becomes read-only
       - "Updating CV..." text below input, 12px secondary

    2. Call the endpoint with:
      {
        application_id: applicationId,
        generated_cv_id: generatedCvId,
        gap_term: "listed building experience",
        gap_type: "experience" | "skill" | "certification",
        user_context: "I managed listed buildings at EQUANS 
                       for 2 years" (or empty string)
      }

STEP 3 — Apply the patch to cvData

  On success the endpoint returns a patch:
  {
    patch_type: "add_skill" | "update_bullet" | "add_bullet",
    target_role_index: 0,    // for bullet patches
    new_skill: "...",        // for add_skill
    bullet_index: 2,         // for update_bullet  
    new_bullet: "...",       // for update_bullet/add_bullet
    explanation: "Added to EQUANS role bullet 3"
  }

  Apply the patch to local cvData state:
    - add_skill: append to cvData.skills array
    - add_bullet: insert new bullet into the 
      specified role's bullets array
    - update_bullet: replace the specified bullet 
      in the specified role

  After applying:
    1. Remove the gap item from the gap analysis list
       with a success animation: ✓ green flash then 
       fade out over 300ms
    2. Briefly highlight the changed section in the 
       CV preview: flash a subtle blue border on the 
       affected section for 1.5s
    3. Auto-save: trigger the existing save flow 
       so the patch persists to Supabase
    4. Re-run gap analysis on the updated cvData 
       (client-side, debounced 500ms) so the gap 
       list refreshes to reflect the fix

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEW ENDPOINT — patch-cv-gap
Add to supabase/functions/server/index.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/make-server-3bbff5cf/patch-cv-gap', async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);

  let applicationId: string, generatedCvId: string,
      gapTerm: string, gapType: string, 
      userContext: string;
  try {
    const b = await c.req.json();
    applicationId = b.application_id;
    generatedCvId = b.generated_cv_id;
    gapTerm       = b.gap_term;
    gapType       = b.gap_type || 'experience';
    userContext   = b.user_context || '';
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  // Fetch current generated CV
  const { data: genCv } = await sb()
    .from('generated_cvs')
    .select('cv_json')
    .eq('id', generatedCvId)
    .eq('user_id', userId)
    .single();

  if (!genCv) {
    return c.json({ error: 'Generated CV not found' }, 404);
  }

  // Fetch job title for context
  const { data: appRow } = await sb()
    .from('applications')
    .select('job_title, company')
    .eq('id', applicationId)
    .single();

  let key: string;
  try { key = openaiKey(); } catch {
    return c.json({ error: 'OpenAI key not configured' }, 500);
  }

  const cvJson = genCv.cv_json as any;

  const systemPrompt = `You are a precise CV editor. You make 
minimal, targeted changes to a CV to address a specific gap.
You never rewrite sections wholesale — you make the smallest 
change that naturally and honestly addresses the gap.
Return ONLY valid JSON, no markdown, no explanation.`;

  const userPrompt = `A CV has a gap that needs addressing.
The candidate DOES have this experience/skill — it just 
wasn't captured in their CV.

ROLE APPLYING FOR: ${appRow?.job_title} at ${appRow?.company}

GAP TO ADDRESS: "${gapTerm}"
GAP TYPE: ${gapType}
CANDIDATE CONTEXT: "${userContext || 'No additional context provided'}"

CURRENT CV:
${JSON.stringify(cvJson, null, 2).slice(0, 3000)}

TASK:
Determine the best minimal patch to address this gap:

If gap_type is "skill":
  - Add "${gapTerm}" to the skills array
  - Return patch_type: "add_skill"
  - Also check if any existing bullet could be updated 
    to reference this skill — if yes, return that too
    as a second patch

If gap_type is "experience":
  - Find the most relevant role in work_history
  - Either UPDATE an existing bullet to reference 
    this experience (preferred — less disruptive)
  - OR ADD a new bullet if no existing bullet can 
    be naturally updated
  - The change must be honest — only add if the 
    candidate plausibly had this experience given 
    their role title, company, and other bullets
  - If userContext is provided, use it to make 
    the bullet specific

If gap_type is "certification":
  - If user confirmed they have it, add to 
    certifications array
  - Return patch_type: "add_certification"

RULES:
- Make the minimum change needed
- Never invent specific numbers or metrics not 
  provided in userContext
- The patched bullet must read naturally alongside 
  existing bullets
- Maximum 1-2 sentence bullet

Return this exact JSON:
{
  "patch_type": "add_skill" | "update_bullet" | 
                "add_bullet" | "add_certification",
  "target_role_index": 0,
  "bullet_index": 2,
  "new_skill": "...",
  "new_bullet": "...",
  "new_certification": "...",
  "explanation": "Added to [Company] role — [reason]"
}

Only include fields relevant to the patch_type.`;

  try {
    const response = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',  // low token, targeted task
          temperature: 0.2,
          max_tokens: 400,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      }
    );

    if (!response.ok) {
      return c.json({ error: 'AI patch failed' }, 500);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? '{}';
    const patch = JSON.parse(raw);

    console.log('[patch-cv-gap] patch for gap:', 
      gapTerm, JSON.stringify(patch));

    return c.json({ success: true, patch });

  } catch (err) {
    console.error('[patch-cv-gap] error:', err);
    return c.json({ error: 'Failed to generate patch' }, 500);
  }
});

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GAP ANALYSIS RE-RUN AFTER PATCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After applying a patch to cvData and saving:

If using AI-extracted terms (useJobTerms):
  Re-run the gap analysis against the updated cvData.
  The existing client-side scoring logic should 
  handle this automatically if cvData state is 
  updated correctly — the gap analysis reads from 
  cvData reactively.

If gap analysis is computed on page load only 
(not reactive):
  Add a recomputeGaps() function that re-runs 
  the gap comparison between cvData.skills_gap 
  and the current cvData content, then updates 
  the displayed gap list.

  Call recomputeGaps() after each successful patch.

The gap item that was just addressed should 
disappear from the list immediately (already 
handled in the UI step above). The re-run 
confirms whether any other gaps were also 
resolved as a side effect of the patch.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Only change the gap analysis section in the CV editor
- Do not change the generate-cv flow, billing, or auth
- gpt-4o-mini is correct here — this is a small 
  targeted task, not full generation quality needed
- If the patch endpoint fails, show a quiet inline 
  error: "Couldn't update CV — try again" in red 12px
  Restore the input to its pre-submit state
- Never auto-save a failed patch
- The "I don't have this" dismissal is session-only —
  on page reload gaps reappear. Do not persist 
  dismissals to DB — the user can dismiss again 
  or leave them as acknowledged gaps