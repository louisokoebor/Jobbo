Fix the generate-cv endpoint prompt in supabase/functions/server/index.tsx
so the generated CV accurately reflects the candidate's actual years of 
experience rather than mirroring the job description's minimum requirement.

Do NOT change any UI, layout, or other screens.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROOT CAUSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When a job description states "3-5 years experience", GPT 
anchors to that number and writes "3 years experience in X" 
in the summary and bullets — even when the candidate's actual 
work history shows significantly more. This undersells the 
candidate and is factually inaccurate.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 1 — Calculate actual years before calling GPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before building the GPT prompt, calculate the candidate's 
actual total years of experience from their work_history:

  function calculateTotalYears(workHistory: any[]): number {
    if (!workHistory || workHistory.length === 0) return 0;
    
    let totalMonths = 0;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    for (const role of workHistory) {
      try {
        // Parse start date — expect "Month YYYY" format e.g. "March 2019"
        const startParts = role.start_date?.split(' ');
        const startYear = parseInt(startParts?.[startParts.length - 1]);
        const startMonthStr = startParts?.[0];
        const months = ['january','february','march','april','may','june',
                        'july','august','september','october','november','december'];
        const startMonth = months.indexOf(startMonthStr?.toLowerCase()) + 1 || 1;

        // Parse end date — "Present" or "Month YYYY"
        let endYear = currentYear;
        let endMonth = currentMonth;
        if (role.end_date && role.end_date.toLowerCase() !== 'present') {
          const endParts = role.end_date.split(' ');
          endYear = parseInt(endParts?.[endParts.length - 1]);
          const endMonthStr = endParts?.[0];
          endMonth = months.indexOf(endMonthStr?.toLowerCase()) + 1 || 12;
        }

        if (!isNaN(startYear) && !isNaN(endYear)) {
          const months_in_role = (endYear - startYear) * 12 + (endMonth - startMonth);
          totalMonths += Math.max(0, months_in_role);
        }
      } catch {
        // Skip unparseable dates
      }
    }

    return Math.round(totalMonths / 12);
  }

  const actualYears = calculateTotalYears(cvData.work_history ?? []);
  const yearsLabel = actualYears >= 10 
    ? 'over 10 years'
    : actualYears > 0 
      ? `${actualYears}+ years`
      : null;

  console.log('[generate-cv] calculated actual experience:', yearsLabel);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 2 — Pass actual years to the prompt explicitly
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add this block to the generate-cv user prompt, immediately 
before the CANDIDATE CV section:

  `CANDIDATE EXPERIENCE FACTS (use these, do not override):
   ${yearsLabel ? `Total years of professional experience: ${yearsLabel}` : ''}
   First role start date: ${cvData.work_history?.[cvData.work_history.length - 1]?.start_date ?? 'unknown'}
   Most recent role: ${cvData.work_history?.[0]?.title ?? ''} at ${cvData.work_history?.[0]?.company ?? ''}
   
   IMPORTANT: When writing the summary or any bullet that references 
   years of experience, always use the candidate's ACTUAL years above.
   Never use the years requirement from the job description as the 
   candidate's experience level. The job says "3-5 years" as a MINIMUM 
   requirement — if the candidate has more, state their actual experience.`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 3 — Add explicit instruction in system prompt
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the generate-cv system prompt, add this rule to the 
existing principles list:

  "8. Never mirror the job description's experience requirement 
      back as the candidate's experience level. The job description 
      states a minimum threshold — the candidate may exceed it 
      significantly. Always derive years of experience from the 
      candidate's actual work history dates, not from what the 
      job asks for. If the candidate has 7 years and the job asks 
      for 3-5, write '7 years experience' or 'over 5 years experience' 
      — never '3 years experience'."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 4 — Post-generation validation for years
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After GPT returns the generated CV, before saving, run a 
quick check on the summary field:

  if (yearsLabel && generatedCv.summary) {
    // Check if summary contains a years figure lower than actual
    const summaryYearsMatch = generatedCv.summary.match(/(\d+)\+?\s*years?/i);
    if (summaryYearsMatch) {
      const summaryYears = parseInt(summaryYearsMatch[1]);
      if (summaryYears < actualYears - 1) {
        // Summary is underselling — log a warning
        // Do not auto-fix as it may break sentence structure,
        // but log so we can monitor frequency
        console.warn(
          `[generate-cv] summary says "${summaryYears} years" but ` +
          `actual is ${actualYears} years — candidate undersold`
        );
      }
    }
  }

This is monitoring only — do not auto-correct the summary 
as string replacement risks breaking sentence structure. 
The prompt changes in Changes 2 and 3 should prevent this 
from happening in the first place.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Only change the generate-cv endpoint
- Do not change any other endpoints  
- Do not change any UI, components, or routing
- calculateTotalYears must be wrapped in try/catch — if it 
  throws for any reason, set yearsLabel to null and continue 
  without it rather than failing the generation
- If work_history is empty or dates are unparseable, 
  omit the years fact from the prompt entirely rather 
  than passing an inaccurate value