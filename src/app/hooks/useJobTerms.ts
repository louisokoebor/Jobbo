/**
 * useJobTerms — Fetches AI-extracted job description terms.
 *
 * 1. Checks Supabase cache (extracted_job_terms column) directly
 * 2. If not cached, calls /extract-job-terms Edge Function
 * 3. Returns structured terms for use by ATS scorer & recommendations
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { projectId, publicAnonKey } from '../lib/supabaseClient';
import { apiFetch } from '../lib/apiFetch';

const SUPABASE_URL = `https://${projectId}.supabase.co`;

export interface ExtractedJobTerms {
  mustHaves: string[];
  skills: string[];
  tools: string[];
  responsibilities: string[];
  niceToHaves: string[];
  certifications: string[];
  experienceYears: number | null;
}

export interface UseJobTermsResult {
  terms: ExtractedJobTerms | null;
  loading: boolean;
  error: string | null;
}

export function useJobTerms(
  applicationId: string | null,
  jobDescriptionRaw: string,
): UseJobTermsResult {
  const [terms, setTerms] = useState<ExtractedJobTerms | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedForApp = useRef<string | null>(null);

  useEffect(() => {
    // Skip if no application or job text
    if (!applicationId || !jobDescriptionRaw || jobDescriptionRaw.trim().length < 20) return;
    // Skip if already fetched for this application
    if (fetchedForApp.current === applicationId && terms) return;

    let cancelled = false;

    async function fetchTerms() {
      setLoading(true);
      setError(null);

      try {
        // 1. Check Supabase cache directly (avoids Edge Function cold start)
        const { data: appRow } = await supabase
          .from('applications')
          .select('extracted_job_terms')
          .eq('id', applicationId!)
          .single();

        if (!cancelled && appRow?.extracted_job_terms) {
          setTerms(appRow.extracted_job_terms as ExtractedJobTerms);
          setLoading(false);
          fetchedForApp.current = applicationId;
          return;
        }

        // 2. Not cached — call the extraction endpoint
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const res = await apiFetch(
          '/make-server-3bbff5cf/extract-job-terms',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              application_id: applicationId,
              job_description_raw: jobDescriptionRaw,
            }),
          },
        );

        const data = await res.json();

        if (!cancelled) {
          if (data.success && data.terms) {
            setTerms(data.terms);
            fetchedForApp.current = applicationId;
          } else {
            console.error('[useJobTerms] extraction failed:', data.error);
            setError(data.error || 'Failed to extract job terms');
          }
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('[useJobTerms] exception:', err);
          setError(err.message || 'Network error');
          setLoading(false);
        }
      }
    }

    fetchTerms();
    return () => { cancelled = true; };
  }, [applicationId, jobDescriptionRaw]);

  return { terms, loading, error };
}
