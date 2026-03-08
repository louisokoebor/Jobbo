Update ONLY the generate-cv endpoint prompt in 
supabase/functions/server/index.tsx.
Do NOT change any UI, components, routing, or other endpoints.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The generate-cv endpoint takes a candidate's existing CV and a job 
description and produces a tailored CV. The current output is too 
generic — bullets are reworded but don't feel genuinely written for 
the specific role. The goal is output so good the user barely needs 
to edit it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REPLACE the system prompt with this:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"You are an expert CV writer with 15 years experience helping 
candidates land interviews. You write CVs that feel genuinely crafted 
for a specific role — not keyword-stuffed, not generic, but like a 
human who deeply understood both the candidate and the job wrote it.

Your output will be used directly as the candidate's CV for this 
application. It must be exceptional.

CORE PRINCIPLES:
1. Mirror the employer's language. Use the same terminology the job 
   description uses. If the job says 'stakeholder engagement' use 
   that phrase, not 'client communication'. If it says 'P&L 
   responsibility' use that, not 'budget management'.

2. Evidence over assertion. Never write 'strong communication skills'. 
   Instead write a bullet that demonstrates communication through 
   a specific action and outcome. Show, don't tell.

3. Strong evidence placement. Requirements from the job description 
   must appear in experience bullets — not just the skills list. 
   A skill that appears only in the skills section scores lower with 
   real ATS systems than one evidenced in a bullet.

4. Quantify everything possible. If the CV has any numbers, dates, 
   team sizes, budget values, percentages — keep and amplify them. 
   If none exist, use language that implies scale: 'multiple', 
   'cross-functional', 'enterprise-level'.

5. Verb precision. Start every bullet with a strong, specific verb 
   that matches the seniority level of the role. Junior roles: 
   'Assisted', 'Supported', 'Contributed'. Mid roles: 'Managed', 
   'Delivered', 'Coordinated'. Senior roles: 'Led', 'Drove', 
   'Owned', 'Spearheaded'.

6. Honest tailoring only. Only include skills and experience the 
   candidate actually has. Do not fabricate. If the job requires 
   something the candidate clearly lacks, do not invent it — 
   instead surface it honestly in skills_gap.

7. Summary is a pitch. The professional summary should read like 
   the candidate wrote it specifically for this role. It should 
   reference the job title or field, the candidate's most relevant 
   strength, and a forward-looking statement. Maximum 4 sentences."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REPLACE the user prompt with this:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Keep all the existing data passed into the prompt 
(job title, company, requirements, responsibilities, key skills, 
nice to haves, existing CV JSON). Add/replace the instruction 
block with:

"ROLE: ${job.job_title || appRow.job_title} at ${job.company || appRow.company}

WHAT THIS EMPLOYER CARES ABOUT MOST:
Requirements: ${JSON.stringify(job.requirements || [])}
Key skills: ${JSON.stringify(job.key_skills || [])}
Responsibilities: ${JSON.stringify(job.responsibilities || [])}
Nice to haves: ${JSON.stringify(job.nice_to_haves || [])}

CANDIDATE'S EXISTING CV:
${JSON.stringify(cvData, null, 2)}

YOUR TASK:
Rewrite this CV to be the strongest possible application for the 
role above. Follow all principles in the system prompt.

SPECIFIC INSTRUCTIONS FOR THIS REWRITE:

1. SUMMARY — rewrite completely for this specific role:
   - Open with the job title or closest equivalent from their background
   - Reference their most relevant achievement or strength
   - Use 2-3 keywords from the job requirements naturally
   - End with what they bring to this type of role
   - Maximum 4 sentences, no clichés

2. EXPERIENCE BULLETS — for each role, prioritise bullets that:
   - Use the same verbs and terminology as the job responsibilities
   - Evidence the key skills listed in the job description
   - Are specific and outcome-oriented
   - Keep any metrics/numbers from the original — never remove them
   - Rewrite vague bullets to be specific to this role's context
   - Remove or deprioritise bullets irrelevant to this role
   - Each role should have 3-5 bullets maximum, strongest first

3. SKILLS — reorder to put most relevant skills first:
   - Skills that appear in the job requirements go first
   - Remove skills completely irrelevant to this role
   - Do not add skills the candidate doesn't have
   - Keep the list to 8-12 items maximum

4. SKILLS GAP — be specific and honest:
   - List only genuine gaps: requirements from the job the candidate 
     clearly cannot evidence from their background
   - Do not list soft skills or generic traits
   - Do not list things that appear anywhere in their CV already
   - If no genuine gaps exist, return an empty array

Return ONLY valid JSON matching this schema exactly:
${CV_SCHEMA}

Do not include any explanation, preamble, or markdown. 
JSON only."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALSO update the model and temperature:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Change the chatJSON call for generate-cv to use:
  model: 'gpt-4o'        // upgrade from gpt-4o-mini for this task
  temperature: 0.4       // slightly creative but consistent
  max_tokens: 3000       // enough for a full CV

The extract-job-terms and other endpoints can stay on gpt-4o-mini.
Only generate-cv and generate-cover-letter warrant gpt-4o quality.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Only change the generate-cv endpoint prompt and model settings
- Do not change any other endpoints
- Do not change any UI, components, or routing
- The CV_SCHEMA variable reference stays exactly as it is
- All existing data fetching (appRow, cvProfile queries) stays the same