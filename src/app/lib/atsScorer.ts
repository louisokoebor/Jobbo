/**
 * ATS Match Scorer — deterministic, client-side, no external calls.
 *
 * Given cvText and jobText (plain strings), computes:
 *   overallScore (0-100), sub-scores, missing/weak lists.
 *
 * Scoring model:
 *   A) Must-Have Requirements  (0-40)
 *   B) Skills & Tools          (0-35)
 *   C) Responsibilities        (0-20)
 *   D) Quality Modifiers       (0-5)
 */

/* ════════════════════════════════════════════════════════════════
   TYPES
   ════════════════════════════════════════════════════════════════ */

export interface AtsResult {
  overallScore: number;          // 0-100
  mustHaveScore: number;         // 0-40
  skillsToolsScore: number;      // 0-35
  responsibilitiesScore: number; // 0-20
  qualityModifierScore: number;  // 0-5
  mustHavePass: boolean;
  missingMustHaves: string[];
  missingKeywords: string[];
  weakEvidence: string[];
  matchedHighlights: Record<string, string>; // term -> section where found
}

/** AI-extracted job terms from the /extract-job-terms endpoint */
export interface AiExtractedTerms {
  mustHaves: string[];
  skills: string[];
  tools: string[];
  responsibilities: string[];
  niceToHaves: string[];
  certifications: string[];
  experienceYears: number | null;
}

/* ════════════════════════════════════════════════════════════════
   SYNONYMS DICTIONARY
   ════════════════════════════════════════════════════════════════ */

const SYNONYM_GROUPS: string[][] = [
  ['project manager', 'pm', 'project management'],
  ['stakeholder management', 'client management', 'stakeholder engagement'],
  ['vendor management', 'supplier management', 'contractor management'],
  ['bms', 'building management system'],
  ['javascript', 'js'],
  ['typescript', 'ts'],
  ['react', 'reactjs', 'react.js'],
  ['node', 'nodejs', 'node.js'],
  ['python', 'py'],
  ['machine learning', 'ml'],
  ['artificial intelligence', 'ai'],
  ['ci/cd', 'ci cd', 'continuous integration', 'continuous deployment'],
  ['amazon web services', 'aws'],
  ['google cloud platform', 'gcp', 'google cloud'],
  ['microsoft azure', 'azure'],
  ['kubernetes', 'k8s'],
  ['postgresql', 'postgres'],
  ['mongodb', 'mongo'],
  ['docker', 'containerization'],
  ['rest api', 'restful', 'rest'],
  ['graphql', 'gql'],
  ['html', 'html5'],
  ['css', 'css3'],
  ['ux', 'user experience'],
  ['ui', 'user interface'],
  ['qa', 'quality assurance'],
  ['devops', 'dev ops'],
  ['saas', 'software as a service'],
  ['sql', 'structured query language'],
  ['nosql', 'no sql'],
  ['agile', 'scrum'],
  ['kanban', 'lean'],
  ['jira', 'atlassian jira'],
  ['figma', 'sketch', 'adobe xd'],
  ['communication skills', 'written communication', 'verbal communication'],
  ['leadership', 'team leadership', 'people management'],
];

// Build fast lookup: normalized term -> group index
const synonymLookup = new Map<string, number>();
SYNONYM_GROUPS.forEach((group, gi) => {
  group.forEach(term => synonymLookup.set(term, gi));
});

function getSynonyms(term: string): string[] {
  const gi = synonymLookup.get(term);
  if (gi === undefined) return [];
  return SYNONYM_GROUPS[gi].filter(t => t !== term);
}

/* ════════════════════════════════════════════════════════════════
   TEXT NORMALIZATION
   ════════════════════════════════════════════════════════════════ */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s+#/.-]/g, ' ')   // keep +, #, /, ., -
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean);
}

/* ════════════════════════════════════════════════════════════════
   CV SECTION DETECTION
   ════════════════════════════════════════════════════════════════ */

interface CvSections {
  summary: string;
  skills: string;
  experience: string;   // includes projects
  education: string;
  full: string;
}

const EXPERIENCE_HEADINGS = /\b(experience|employment|work history|professional experience|projects|career history)\b/i;
const SKILLS_HEADINGS = /\b(skills|technical skills|core competencies|technologies|tools|proficiencies)\b/i;
const EDUCATION_HEADINGS = /\b(education|qualifications|academic|certifications|training)\b/i;
const SUMMARY_HEADINGS = /\b(summary|profile|objective|about|personal statement)\b/i;

function detectCvSections(cvText: string): CvSections {
  const lines = cvText.split('\n');
  const sections: { heading: string; start: number; category: keyof Omit<CvSections, 'full'> }[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.length < 40 && trimmed.length > 0) {
      if (EXPERIENCE_HEADINGS.test(trimmed)) sections.push({ heading: trimmed, start: i, category: 'experience' });
      else if (SKILLS_HEADINGS.test(trimmed)) sections.push({ heading: trimmed, start: i, category: 'skills' });
      else if (EDUCATION_HEADINGS.test(trimmed)) sections.push({ heading: trimmed, start: i, category: 'education' });
      else if (SUMMARY_HEADINGS.test(trimmed)) sections.push({ heading: trimmed, start: i, category: 'summary' });
    }
  });

  const result: CvSections = { summary: '', skills: '', experience: '', education: '', full: cvText };

  if (sections.length === 0) {
    // Can't detect sections — treat everything as experience (generous)
    result.experience = cvText;
    return result;
  }

  sections.sort((a, b) => a.start - b.start);

  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].start;
    const end = i + 1 < sections.length ? sections[i + 1].start : lines.length;
    const content = lines.slice(start, end).join('\n');
    result[sections[i].category] += '\n' + content;
  }

  // Text before first heading -> summary (if no summary heading found)
  if (sections[0].start > 0 && !sections.some(s => s.category === 'summary')) {
    result.summary = lines.slice(0, sections[0].start).join('\n');
  }

  return result;
}

/* ════════════════════════════════════════════════════════════════
   JOB DESCRIPTION PARSING
   ════════════════════════════════════════════════════════════════ */

const MUST_HAVE_PATTERNS = /\b(must|required|essential|need to|minimum|you will have|years?\b.*\bexperience|certification|certified|eligible to work|right to work|mandatory)\b/i;
const RESPONSIBILITY_PATTERNS = /\b(responsible for|you will|deliver|manage|lead|coordinate|own|develop|implement|design|build|create|ensure|support|collaborate|drive|oversee)\b/i;

interface JobTerms {
  mustHaves: string[];
  skills: string[];
  responsibilities: string[];
}

function splitIntoLines(text: string): string[] {
  // split by newlines or bullet chars
  return text.split(/[\n\r]+|(?:^|\n)\s*[-*\u2022\u25CF\u25CB\u2023]\s*/g)
    .map(l => l.trim())
    .filter(l => l.length > 3);
}

function extractNounPhrases(line: string): string[] {
  const norm = normalize(line);
  const results: string[] = [];

  // Extract comma-separated skill lists (e.g., "React, TypeScript, Node.js")
  const commaSegments = norm.split(/,|;|\band\b/).map(s => s.trim()).filter(s => s.length > 0 && s.length < 50);
  if (commaSegments.length >= 2) {
    commaSegments.forEach(s => {
      // Clean up leading verbs/articles
      const cleaned = s.replace(/^(experience with|knowledge of|proficiency in|familiarity with|understanding of|exposure to|working with|using)\s+/i, '').trim();
      if (cleaned.length > 1 && cleaned.length < 40) results.push(cleaned);
    });
  }

  // Extract multi-word noun phrases / tool names using pattern
  const toolPattern = /\b([a-z][a-z0-9.+#/-]*(?:\s+[a-z0-9.+#/-]+){0,3})\b/g;
  let m;
  while ((m = toolPattern.exec(norm)) !== null) {
    const phrase = m[1].trim();
    if (phrase.length > 1 && phrase.length < 40 && !['a', 'an', 'the', 'and', 'or', 'in', 'to', 'for', 'of', 'with', 'on', 'at', 'by', 'is', 'are', 'be', 'as', 'we', 'our', 'you', 'your', 'will', 'have', 'has', 'had', 'this', 'that', 'it', 'not', 'but', 'from', 'can', 'do', 'if', 'all', 'its', 'may', 'than', 'been', 'who', 'would', 'should', 'could', 'about', 'into', 'which', 'their', 'them', 'then', 'some', 'when', 'what', 'being', 'were', 'was', 'also', 'how', 'more', 'any'].includes(phrase)) {
      results.push(phrase);
    }
  }

  return [...new Set(results)];
}

function extractYearsRequirement(line: string): { years: number; skill: string } | null {
  const m = line.match(/(\d+)\+?\s*years?\s*(?:of\s+)?(?:experience\s+(?:in|with)\s+)?(.+)/i);
  if (m) {
    return { years: parseInt(m[1], 10), skill: normalize(m[2]).split(/[,.]/).shift()?.trim() || '' };
  }
  return null;
}

function parseJobDescription(jobText: string): JobTerms {
  const lines = splitIntoLines(jobText);
  const mustHaves: string[] = [];
  const skills: string[] = [];
  const responsibilities: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const normLine = normalize(line);
    const isMustHave = MUST_HAVE_PATTERNS.test(line);
    const isResponsibility = RESPONSIBILITY_PATTERNS.test(line);

    const phrases = extractNounPhrases(line);
    for (const phrase of phrases) {
      if (seen.has(phrase)) continue;
      seen.add(phrase);

      if (isMustHave) {
        mustHaves.push(phrase);
        skills.push(phrase); // must-haves are also skills
      } else if (isResponsibility) {
        skills.push(phrase);
      } else {
        skills.push(phrase);
      }
    }

    if (isResponsibility) {
      responsibilities.push(normLine);
    }
  }

  return { mustHaves: [...new Set(mustHaves)], skills: [...new Set(skills)], responsibilities };
}

/* ════════════════════════════════════════════════════════════════
   MATCHING HELPERS
   ════════════════════════════════════════════════════════════════ */

function termExistsInText(term: string, text: string): 'exact' | 'synonym' | 'partial' | 'none' {
  const normText = normalize(text);
  const normTerm = normalize(term);

  // Exact match
  if (normText.includes(normTerm)) return 'exact';

  // Synonym match
  const syns = getSynonyms(normTerm);
  for (const syn of syns) {
    if (normText.includes(syn)) return 'synonym';
  }

  // Partial (token overlap >= 0.6)
  const termTokens = normTerm.split(' ').filter(Boolean);
  if (termTokens.length >= 2) {
    const textTokens = new Set(normText.split(' '));
    const overlap = termTokens.filter(t => textTokens.has(t)).length;
    if (overlap / termTokens.length >= 0.6) return 'partial';
  }

  return 'none';
}

function matchStrength(matchType: 'exact' | 'synonym' | 'partial' | 'none'): number {
  switch (matchType) {
    case 'exact': return 1.0;
    case 'synonym': return 0.9;
    case 'partial': return 0.6;
    case 'none': return 0;
  }
}

/* token Jaccard similarity */
function tokenJaccard(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 && tb.size === 0) return 0;
  let intersection = 0;
  ta.forEach(t => { if (tb.has(t)) intersection++; });
  return intersection / (ta.size + tb.size - intersection);
}

/* verb overlap */
const COMMON_VERBS = new Set([
  'manage', 'managed', 'managing', 'lead', 'led', 'leading',
  'develop', 'developed', 'developing', 'build', 'built', 'building',
  'design', 'designed', 'designing', 'implement', 'implemented', 'implementing',
  'create', 'created', 'creating', 'deliver', 'delivered', 'delivering',
  'coordinate', 'coordinated', 'coordinating', 'support', 'supported', 'supporting',
  'collaborate', 'collaborated', 'collaborating', 'drive', 'drove', 'driving',
  'oversee', 'oversaw', 'overseeing', 'ensure', 'ensured', 'ensuring',
  'analyse', 'analyze', 'analysed', 'analyzed', 'maintain', 'maintained',
  'optimize', 'optimise', 'optimized', 'optimised', 'improve', 'improved',
  'define', 'defined', 'establish', 'established', 'execute', 'executed',
  'ship', 'shipped', 'shipping', 'launch', 'launched', 'test', 'tested',
  'review', 'reviewed', 'mentor', 'mentored', 'train', 'trained',
]);

function verbOverlap(a: string, b: string): number {
  const verbsA = tokenize(a).filter(t => COMMON_VERBS.has(t));
  const verbsB = tokenize(b).filter(t => COMMON_VERBS.has(t));
  if (verbsA.length === 0 && verbsB.length === 0) return 0;
  if (verbsA.length === 0 || verbsB.length === 0) return 0;
  const setA = new Set(verbsA);
  let overlap = 0;
  verbsB.forEach(v => { if (setA.has(v)) overlap++; });
  return overlap / Math.max(setA.size, new Set(verbsB).size);
}

/* ════════════════════════════════════════════════════════════════
   RECENCY DETECTION
   ════════════════════════════════════════════════════════════════ */

function extractYears(text: string): number[] {
  const matches = text.match(/\b(19|20)\d{2}\b/g);
  if (!matches) return [];
  return matches.map(Number);
}

function recencyBoost(cvText: string): number {
  const years = extractYears(cvText);
  if (years.length === 0) return 0;
  const currentYear = new Date().getFullYear();
  const maxYear = Math.max(...years);
  if (currentYear - maxYear <= 3) return 2;
  if (currentYear - maxYear <= 5) return 1;
  return 0;
}

/* ════════════════════════════════════════════════════════════════
   ATS HYGIENE CHECK
   ════════════════════════════════════════════════════════════════ */

function atsHygienePenalty(cvText: string): number {
  let penalty = 0;
  // Check for lack of structured headings
  const hasHeadings = EXPERIENCE_HEADINGS.test(cvText) || SKILLS_HEADINGS.test(cvText);
  if (!hasHeadings) penalty += 1;
  // Check for lack of dates
  const hasDates = /\b(19|20)\d{2}\b/.test(cvText);
  if (!hasDates) penalty += 1;
  return penalty;
}

/* ════════════════════════════════════════════════════════════════
   MAIN SCORER
   ════════════════════════════════════════════════════════════════ */

export function calculateAtsScore(cvText: string, jobText: string, extractedTerms?: AiExtractedTerms | null): AtsResult {
  // Edge case: no job text
  if (!jobText || jobText.trim().length < 20) {
    return {
      overallScore: 0,
      mustHaveScore: 0,
      skillsToolsScore: 0,
      responsibilitiesScore: 0,
      qualityModifierScore: 0,
      mustHavePass: true,
      missingMustHaves: [],
      missingKeywords: [],
      weakEvidence: [],
      matchedHighlights: {},
    };
  }

  const cvSections = detectCvSections(cvText);

  // Use AI-extracted terms if available, otherwise fall back to regex parsing
  const jobTerms: JobTerms = (extractedTerms && (extractedTerms.mustHaves.length > 0 || extractedTerms.skills.length > 0))
    ? {
        mustHaves: [...extractedTerms.mustHaves, ...extractedTerms.certifications],
        skills: [...extractedTerms.skills, ...extractedTerms.tools, ...extractedTerms.niceToHaves],
        responsibilities: extractedTerms.responsibilities,
      }
    : parseJobDescription(jobText);

  const missingMustHaves: string[] = [];
  const missingKeywords: string[] = [];
  const weakEvidence: string[] = [];
  const matchedHighlights: Record<string, string> = {};

  /* ── A) Must-Have Requirements (0-40) ── */
  let mustHaveScore: number;
  let mustHavePass = true;

  if (jobTerms.mustHaves.length === 0) {
    mustHaveScore = 20; // neutral baseline
  } else {
    let totalEvidence = 0;

    for (const term of jobTerms.mustHaves) {
      const inExperience = termExistsInText(term, cvSections.experience);
      const inFull = termExistsInText(term, cvSections.full);

      if (inExperience !== 'none') {
        // Strong evidence
        totalEvidence += matchStrength(inExperience);
        matchedHighlights[term] = 'experience';
      } else if (inFull !== 'none') {
        // Weak evidence (only in skills/summary)
        totalEvidence += matchStrength(inFull) * 0.6;
        weakEvidence.push(term);
        matchedHighlights[term] = 'skills/summary only';
      } else {
        // Missing
        totalEvidence += 0;
        missingMustHaves.push(term);
      }
    }

    mustHaveScore = Math.round(40 * (totalEvidence / jobTerms.mustHaves.length));

    // Critical fail: check for mandatory cert / work authorization missing
    const criticalPatterns = /\b(certification|certified|eligible to work|right to work|security clearance|work authorization|work authorisation)\b/i;
    for (const term of jobTerms.mustHaves) {
      if (criticalPatterns.test(term)) {
        const found = termExistsInText(term, cvSections.full);
        if (found === 'none') {
          mustHavePass = false;
        }
      }
    }
  }

  /* ── B) Skills & Tools Relevance (0-35) ── */
  let skillsToolsScore: number;

  // Deduplicate skills against must-haves (must-haves already scored separately in section A)
  const mustHaveSet = new Set(jobTerms.mustHaves.map(normalize));
  const pureSkills = jobTerms.skills.filter(s => !mustHaveSet.has(normalize(s)));

  if (pureSkills.length === 0) {
    skillsToolsScore = 17; // neutral baseline
  } else {
    let weightedMatched = 0;
    let weightedTotal = 0;

    for (const term of pureSkills) {
      // Determine weight based on where term appears in job text
      const normTerm = normalize(term);
      let locationWeight = 0.4;
      for (const mh of jobTerms.mustHaves) {
        if (normalize(mh).includes(normTerm) || normTerm.includes(normalize(mh))) {
          locationWeight = 1.0;
          break;
        }
      }
      // Check responsibility lines
      if (locationWeight < 1.0) {
        for (const resp of jobTerms.responsibilities) {
          if (resp.includes(normTerm)) {
            locationWeight = Math.max(locationWeight, 0.7);
            break;
          }
        }
      }

      weightedTotal += locationWeight;

      const inCv = termExistsInText(term, cvSections.full);
      if (inCv !== 'none') {
        weightedMatched += locationWeight * matchStrength(inCv);

        // Track if weak evidence
        const inExp = termExistsInText(term, cvSections.experience);
        if (inExp === 'none') {
          weakEvidence.push(term);
          matchedHighlights[term] = 'skills/summary only';
        } else {
          matchedHighlights[term] = 'experience';
        }
      } else {
        missingKeywords.push(term);
      }
    }

    skillsToolsScore = weightedTotal > 0
      ? Math.round(35 * (weightedMatched / weightedTotal))
      : 17;
  }

  /* ── C) Responsibilities Alignment (0-20) ── */
  let responsibilitiesScore: number;

  if (jobTerms.responsibilities.length === 0) {
    responsibilitiesScore = 7; // conservative neutral
  } else {
    const expLines = splitIntoLines(cvSections.experience);
    const similarities: number[] = [];

    for (const resp of jobTerms.responsibilities) {
      let bestSim = 0;
      for (const expLine of expLines) {
        const tj = tokenJaccard(resp, expLine);
        const vo = verbOverlap(resp, expLine);
        const sim = 0.7 * tj + 0.3 * vo;
        bestSim = Math.max(bestSim, sim);
      }
      similarities.push(bestSim);
    }

    const avgSim = similarities.length > 0
      ? similarities.reduce((a, b) => a + b, 0) / similarities.length
      : 0;
    responsibilitiesScore = Math.round(20 * avgSim);
  }

  /* ── D) Quality Modifiers (0-5) ── */
  let qualityModifierScore = 0;

  // Recency boost (0-2)
  qualityModifierScore += recencyBoost(cvText);

  // Evidence density boost (0-2)
  const matchedInExp = Object.values(matchedHighlights).filter(v => v === 'experience').length;
  if (matchedInExp >= 5) qualityModifierScore += 2;
  else if (matchedInExp >= 2) qualityModifierScore += 1;

  // ATS hygiene penalty (0 to -2)
  qualityModifierScore -= atsHygienePenalty(cvText);

  // Clamp to 0-5
  qualityModifierScore = Math.max(0, Math.min(5, qualityModifierScore));

  /* ── Final Score ── */
  let overallScore = mustHaveScore + skillsToolsScore + responsibilitiesScore + qualityModifierScore;

  // Cap at 49 if must-have critical fail
  if (!mustHavePass) {
    overallScore = Math.min(overallScore, 49);
  }

  // Clamp to 0-100
  overallScore = Math.max(0, Math.min(100, overallScore));

  return {
    overallScore: Math.round(overallScore),
    mustHaveScore: Math.round(mustHaveScore),
    skillsToolsScore: Math.round(skillsToolsScore),
    responsibilitiesScore: Math.round(responsibilitiesScore),
    qualityModifierScore: Math.round(qualityModifierScore),
    mustHavePass,
    missingMustHaves: [...new Set(missingMustHaves)],
    missingKeywords: [...new Set(missingKeywords)].slice(0, 20), // cap for UI
    weakEvidence: [...new Set(weakEvidence)].slice(0, 20),
    matchedHighlights,
  };
}

/* ════════════════════════════════════════════════════════════════
   CV → PLAIN TEXT BUILDER
   ════════════════════════════════════════════════════════════════ */

export interface CvStructured {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  portfolio: string;
  summary: string;
  skills: { name: string; type: string }[];
  workHistory: { title: string; company: string; startDate: string; endDate: string; bullets: string[] }[];
  education: { institution: string; qualification: string; dates: string; grade: string }[];
  certifications: string[];
}

export function cvToPlainText(cv: CvStructured): string {
  const lines: string[] = [];

  // Personal
  lines.push(cv.fullName);
  if (cv.email) lines.push(cv.email);
  if (cv.phone) lines.push(cv.phone);
  if (cv.location) lines.push(cv.location);
  if (cv.linkedin) lines.push(cv.linkedin);
  if (cv.portfolio) lines.push(cv.portfolio);
  lines.push('');

  // Summary
  if (cv.summary) {
    lines.push('Summary');
    lines.push(cv.summary);
    lines.push('');
  }

  // Skills
  if (cv.skills.length > 0) {
    lines.push('Skills');
    lines.push(cv.skills.map(s => s.name).join(', '));
    lines.push('');
  }

  // Experience
  if (cv.workHistory.length > 0) {
    lines.push('Experience');
    for (const role of cv.workHistory) {
      lines.push(`${role.title} at ${role.company}`);
      lines.push(`${role.startDate} - ${role.endDate}`);
      for (const bullet of role.bullets) {
        lines.push(`- ${bullet}`);
      }
      lines.push('');
    }
  }

  // Education
  if (cv.education.length > 0) {
    lines.push('Education');
    for (const edu of cv.education) {
      lines.push(`${edu.qualification} - ${edu.institution}`);
      if (edu.dates) lines.push(edu.dates);
      if (edu.grade) lines.push(edu.grade);
      lines.push('');
    }
  }

  // Certifications
  if (cv.certifications.length > 0) {
    lines.push('Certifications');
    for (const cert of cv.certifications) {
      lines.push(cert);
    }
  }

  return lines.join('\n');
}