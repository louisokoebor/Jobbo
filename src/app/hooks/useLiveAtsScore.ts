/**
 * useLiveAtsScore — Custom hook for debounced, live ATS scoring.
 *
 * Converts CvData → plain text, runs calculateAtsScore against jobText,
 * debounced to 800ms after the last change.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { calculateAtsScore, cvToPlainText, type AtsResult, type CvStructured } from '../lib/atsScorer';
import type { AiExtractedTerms } from '../lib/atsScorer';

export interface LiveAtsInput {
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

export interface LiveAtsResult {
  /** Final ATS score 0-100 */
  overallScore: number;
  mustHaveScore: number;
  skillsToolsScore: number;
  responsibilitiesScore: number;
  qualityModifierScore: number;
  mustHavePass: boolean;
  missingKeywords: string[];
  weakEvidence: string[];
  missingMustHaves: string[];
  matchedHighlights: Record<string, string>;
  /** True while debounce timer is active (score is stale) */
  isRecalculating: boolean;
  /** Full result object — null if no job text provided */
  raw: AtsResult | null;
}

const EMPTY_RESULT: LiveAtsResult = {
  overallScore: 0,
  mustHaveScore: 0,
  skillsToolsScore: 0,
  responsibilitiesScore: 0,
  qualityModifierScore: 0,
  mustHavePass: true,
  missingKeywords: [],
  weakEvidence: [],
  missingMustHaves: [],
  matchedHighlights: {},
  isRecalculating: false,
  raw: null,
};

export function useLiveAtsScore(cvInput: LiveAtsInput, jobText: string, extractedTerms?: AiExtractedTerms | null): LiveAtsResult {
  const [result, setResult] = useState<LiveAtsResult>(EMPTY_RESULT);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const prevScoreRef = useRef<number>(0);

  // Memoize CV → plain text conversion
  const cvText = useMemo(() => cvToPlainText(cvInput), [cvInput]);

  const hasJobText = jobText && jobText.trim().length >= 20;

  useEffect(() => {
    if (!hasJobText) {
      // Fallback: simple skills ratio
      const matched = cvInput.skills.filter(s => s.type === 'matched').length;
      const total = cvInput.skills.length;
      const fallbackScore = total > 0 ? Math.round((matched / total) * 100) : 0;
      prevScoreRef.current = fallbackScore;
      setResult({
        ...EMPTY_RESULT,
        overallScore: fallbackScore,
      });
      return;
    }

    // Mark as recalculating
    setResult(prev => ({ ...prev, isRecalculating: true }));

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      const atsResult = calculateAtsScore(cvText, jobText, extractedTerms);
      prevScoreRef.current = atsResult.overallScore;
      setResult({
        overallScore: atsResult.overallScore,
        mustHaveScore: atsResult.mustHaveScore,
        skillsToolsScore: atsResult.skillsToolsScore,
        responsibilitiesScore: atsResult.responsibilitiesScore,
        qualityModifierScore: atsResult.qualityModifierScore,
        mustHavePass: atsResult.mustHavePass,
        missingKeywords: atsResult.missingKeywords,
        weakEvidence: atsResult.weakEvidence,
        missingMustHaves: atsResult.missingMustHaves,
        matchedHighlights: atsResult.matchedHighlights,
        isRecalculating: false,
        raw: atsResult,
      });
    }, 800);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [cvText, jobText, hasJobText, cvInput.skills, extractedTerms]);

  return result;
}

/**
 * Compute the score delta for adding a single term to the skills list.
 * Pure function — no side effects.
 */
export function computeScoreDelta(
  cvInput: LiveAtsInput,
  jobText: string,
  term: string,
  currentScore: number,
  extractedTerms?: AiExtractedTerms | null,
): number {
  const augmented: LiveAtsInput = {
    ...cvInput,
    skills: [...cvInput.skills, { name: term, type: 'matched' }],
  };
  const cvText = cvToPlainText(augmented);
  const result = calculateAtsScore(cvText, jobText, extractedTerms);
  return result.overallScore - currentScore;
}