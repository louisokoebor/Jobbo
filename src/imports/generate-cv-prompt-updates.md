Fix the generate-cv endpoint prompt in supabase/functions/server/index.tsx
to enforce minimum bullet points per role and remove single-page constraints.
Do NOT change any UI, layout, or other screens.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 1 — Enforce minimum 4 bullets per role
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the generate-cv user prompt, find the section that 
instructs bullet point count and replace it with:

"EXPERIENCE BULLETS — rules per role:
 - MINIMUM 4 bullets per role, NO EXCEPTIONS
 - Maximum 6 bullets per role
 - If the candidate's original CV has fewer than 4 bullets 
   for a role, expand them by:
   * Breaking compound bullets into separate points
   * Adding context around responsibilities implied by the role title
   * Elaborating on tools, stakeholders, or outcomes mentioned elsewhere
   * Never fabricate — only expand on what is plausibly true given 
     their role title, company, and other bullet content
 - Most recent role (current or last job): aim for 5-6 bullets
 - Roles older than 5 years: minimum 4 bullets still required
 - Each bullet must start with a strong past or present tense verb
 - Each bullet must be a complete, specific statement
 - Never produce a role with 1, 2, or 3 bullets under any circumstance"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 2 — Remove single page constraint
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Search the entire generate-cv system prompt and user prompt 
for any of these phrases and remove them entirely:
  - "one page"
  - "single page"  
  - "fit on one page"
  - "concise"
  - "keep it brief"
  - "keep it short"
  - "summarise"
  - any instruction that implies length should be minimised

Replace with this length guidance:

"LENGTH GUIDANCE:
 - Do not try to fit the CV onto one page
 - A CV should be as long as it needs to be to represent 
   the candidate well — typically 2 pages for candidates 
   with 3+ years experience
 - Never truncate or omit content to save space
 - Include all work history roles from the original CV
 - Do not merge separate roles into one entry
 - Quality and completeness over brevity"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 3 — Add a post-generation validation step
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After parsing the GPT response in the generate-cv endpoint, 
before saving to Supabase, add a server-side validation 
that enforces the minimum bullet rule:

  // Enforce minimum 4 bullets per role
  if (generatedCv.work_history && Array.isArray(generatedCv.work_history)) {
    generatedCv.work_history = generatedCv.work_history.map((role: any) => {
      const bullets = Array.isArray(role.bullets) ? role.bullets : [];
      
      if (bullets.length < 4) {
        console.log(`[generate-cv] role "${role.title} at ${role.company}" ` +
          `only has ${bullets.length} bullets — padding to 4`);
        
        // Find matching role from original CV to pull extra bullets from
        const originalRole = cvData.work_history?.find((r: any) => 
          r.company?.toLowerCase() === role.company?.toLowerCase()
        );
        const originalBullets = originalRole?.bullets || [];
        
        // Merge: keep generated bullets, pad with original ones not already included
        const mergedBullets = [...bullets];
        for (const originalBullet of originalBullets) {
          if (mergedBullets.length >= 4) break;
          // Only add if not already very similar to an existing bullet
          const alreadyIncluded = mergedBullets.some(b => 
            b.toLowerCase().slice(0, 30) === originalBullet.toLowerCase().slice(0, 30)
          );
          if (!alreadyIncluded) {
            mergedBullets.push(originalBullet);
          }
        }
        
        // If still under 4 after merging originals, log a warning
        if (mergedBullets.length < 4) {
          console.warn(`[generate-cv] could not reach 4 bullets for ` +
            `"${role.title} at ${role.company}" — only ${mergedBullets.length} available`);
        }
        
        return { ...role, bullets: mergedBullets };
      }
      
      return role;
    });
  }

This runs AFTER GPT returns and BEFORE saving — it's a 
safety net that catches any case where GPT still under-generates 
despite the prompt instruction.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 4 — Increase max_tokens for generate-cv
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The current token limit may be causing GPT to truncate 
bullets to fit within the response limit.

Find the generate-cv chatJSON or fetch call and update:
  max_tokens: 4000  (increase from current value — 
                     likely 2000 or 3000)

This gives GPT enough room to write full bullet points 
for all roles without truncating.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Only change the generate-cv endpoint
- Do not change any other endpoints
- Do not change any UI, components, or routing
- The post-generation validation in Change 3 must not 
  block saving if it partially fails — wrap in try/catch 
  and if validation throws, save the GPT output as-is 
  rather than failing the whole generation