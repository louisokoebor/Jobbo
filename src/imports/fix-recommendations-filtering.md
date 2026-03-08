Fix the recommendations pill filtering in the CV editor.
Do NOT change any UI styling, layout, or other components.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 1 — Never suggest terms already in the CV
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before generating pills, build a normalised set of all terms 
already present anywhere in the CV:

  const cvTermsAlreadyPresent = new Set([
    ...cvData.skills.map(s => s.toLowerCase().trim()),
    // Also extract key words from summary to catch paraphrased matches
    ...cvData.summary.toLowerCase().split(/\W+/).filter(w => w.length > 4),
  ]);

Then filter candidate pills:
  const candidatePills = rawTerms.filter(term => {
    const normalised = term.toLowerCase().trim();
    // Exclude if exact match already in CV skills
    if (cvTermsAlreadyPresent.has(normalised)) return false;
    // Exclude if any word in the term matches a CV skill closely
    const termWords = normalised.split(/\s+/);
    const alreadyCovered = cvData.skills.some(skill => {
      const skillWords = skill.toLowerCase().split(/\s+/);
      const overlap = termWords.filter(w => skillWords.includes(w)).length;
      return overlap / termWords.length >= 0.7;
    });
    return !alreadyCovered;
  });

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 2 — Block generic soft skill terms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add a GENERIC_TRAITS blocklist. Any pill whose normalised text 
matches an entry in this list should be silently excluded:

  const GENERIC_TRAITS = new Set([
    'attention to detail', 'attention to details',
    'positive attitude', 'can do attitude', 'can-do attitude',
    'team player', 'team work', 'teamwork', 'team worker',
    'self motivated', 'self-motivated', 'self starter', 'self-starter',
    'solutions focused', 'solutions-focused', 'solution focused',
    'results driven', 'results-driven', 'target driven',
    'hard working', 'hardworking', 'hard worker',
    'good communicator', 'excellent communicator',
    'communication skills', 'interpersonal skills',
    'problem solving', 'problem-solving', 'analytical skills',
    'time management', 'organisational skills', 'organizational skills',
    'multitasking', 'multi-tasking', 'adaptable', 'adaptability',
    'proactive', 'flexible', 'enthusiastic', 'motivated',
    'reliable', 'responsible', 'dedicated', 'committed',
    'detail oriented', 'detail-oriented', 'fast learner',
    'quick learner', 'willing to learn', 'eager to learn',
    'passionate', 'driven', 'ambitious', 'dynamic',
    'strong work ethic', 'work ethic',
  ]);

  const filteredPills = candidatePills.filter(term =>
    !GENERIC_TRAITS.has(term.toLowerCase().trim())
  );

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 3 — Enforce minimum delta of 2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After calculating score delta per pill, enforce a minimum threshold.
A delta of 1 is within noise range and not worth showing.

  const visiblePills = filteredPills
    .filter(p => p.scoreDelta >= 2)
    .sort((a, b) => b.scoreDelta - a.scoreDelta)
    .slice(0, 8);

This ensures every pill shown represents a meaningful score improvement.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 4 — Critical gaps should also respect the blocklist
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Apply the same GENERIC_TRAITS filter to missingMustHaves before 
rendering them as critical gap pills. A "must have" that is just 
"self-motivated" is not a real critical gap — it's a poorly written 
job description and should be suppressed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 5 — If fewer than 2 valid pills remain, hide the panel
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If after all filtering the total number of visible pills 
(recommendations + critical gaps combined) is less than 2, 
hide the entire "Boost your score" panel rather than showing 
an almost-empty state. Instead show a small success indicator:

  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <Check size={14} color="#10B981" />
    <span style={{ fontSize: 13, color: '#10B981' }}>
      Your CV is well matched to this role
    </span>
  </div>