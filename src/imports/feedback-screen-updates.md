Make targeted improvements to the Feedback screen.
Do NOT change layout, routing, or any other screen.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 1 — Replace the score circle and interview likelihood
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Remove:
- The circular score badge (78)
- The "Moderate Match" label
- The "Unlikely to be interviewed" red pill
- The overall_score and interview_likelihood fields from the 
  analyse-application prompt and response

Replace the entire top card with a cleaner summary card:

  MATCH SUMMARY
  [verdict_summary text — 2-3 sentences, same as before]
  
  Below the summary, show a single horizontal row of 3 stat pills:
  
  [Summary  8/10]  [Bullets  7/10]  [Keywords  6/10]
  
  These are the existing cv_quality sub-scores. Show them as small 
  pills not progress bars. Pill style: surface bg, border, 
  Inter 600 13px. No overall score. No interview prediction.

  Keep the "Re-run Analysis" button below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 2 — Connect Areas to Improve to skills_gap
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the analyse-application endpoint in server/index.tsx:

When building the analysis prompt, also fetch skills_gap from the 
generated CV:

  const cvJson = genCv.cv_json as Record<string, unknown>;
  const skillsGap = (cvJson.skills_gap as string[] ?? []);

Add to the analysis user prompt:
  "KNOWN CV GAPS (from CV generation):
   ${skillsGap.join(', ')}
   
   Use these as the basis for the weaknesses/areas to improve section.
   Do not invent new gaps that contradict this list. You may add context 
   or suggest how to address them, but the gap list itself comes from above."

This ensures the feedback weaknesses and the editor gap analysis 
show the same items — they're sourced from the same skills_gap data.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 3 — Clean up Missing Keywords panel
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Apply the same GENERIC_TRAITS blocklist from the CV editor to the 
missing_keywords array before rendering it on the feedback screen.

Filter out from missing_keywords display:
- Any term in the GENERIC_TRAITS blocklist 
  (self-motivated, solutions-focused, team player, etc.)
- Any term already present in cvJson.skills array
- Any term under 4 characters

Import or duplicate the GENERIC_TRAITS set — keep it in a shared 
constants file at src/app/lib/genericTraits.ts so both the CV editor 
and feedback screen use the identical list.

If after filtering fewer than 2 keywords remain, hide the 
Missing Keywords panel entirely. Show nothing rather than 
a panel with 1-2 generic items.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 4 — Add cover letter bridge section
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If the application has both a generated CV (with skills_gap) AND 
a cover letter, add a new section below "Areas to Improve":

  COVER LETTER GAP COVERAGE
  
  For each item in skills_gap, check if the cover letter text 
  mentions or addresses it (simple case-insensitive includes check 
  on key words from the gap term).
  
  Show two sub-lists:
  
  ✓ Addressed in your cover letter:
    [gap items whose keywords appear in cover letter text]
    — green check, secondary text
  
  ○ Not yet addressed:  
    [gap items not mentioned in cover letter]
    — amber circle, secondary text
    Below each: "Consider mentioning this in your cover letter"
  
  If skills_gap is empty, do not show this section.
  If no cover letter exists yet, show:
    "Generate a cover letter to see how well it addresses your CV gaps"
    with a "Generate Cover Letter →" button linking to the action.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Keep strengths section exactly as is
- Keep top actions panel exactly as is  
- Keep CV Quality progress bars (Summary, Bullets, Keywords) 
  but move them into the 3 stat pills in Change 1
- Keep the Edit CV button in the missing keywords panel
- Do not change any other screens
- Do not change the CV editor, billing, or auth