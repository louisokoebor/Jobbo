/**
 * InterviewPrepTab — AI-generated interview questions
 *
 * Three states:
 *   A) No generated CV yet → prompt to go to CV tab
 *   B) CV exists, no questions → CTA to generate
 *   C) Questions loaded → scrollable card list
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  ChevronDown, ChevronUp, Check, FileText,
  Sparkles, RefreshCw, Lock, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabaseClient';
import { apiFetch } from '../lib/apiFetch';
import { useUserPlan } from '../lib/UserPlanContext';

/* ─── Types ──────────────────────────────────────────────────── */
interface InterviewQuestion {
  id: string;
  question: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  suggested_answer: string;
  user_answer?: string;
}

interface Props {
  applicationId: string;
  jobTitle: string;
  hasGeneratedCv: boolean;
  isDark: boolean;
  onSwitchTab: (tab: string) => void;
}

/* ─── Constants ──────────────────────────────────────────────── */
const font = 'Inter, sans-serif';
const SUPABASE_URL = 'https://hrexgjahkdjqxvulodqu.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyZXhnamFoa2RqcXh2dWxvZHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNzAzNjUsImV4cCI6MjA4Nzk0NjM2NX0.pkV8MPJYG-AyBPk5qG7iDJCT86aOzVKcti1wfygqpRM';

const CATEGORY_STYLES: Record<string, { bg: string; color: string }> = {
  technical:   { bg: 'rgba(26,86,219,0.12)',  color: '#1A56DB' },
  behavioural: { bg: 'rgba(124,58,237,0.12)', color: '#7C3AED' },
  experience:  { bg: 'rgba(16,185,129,0.12)', color: '#10B981' },
  motivation:  { bg: 'rgba(245,158,11,0.12)', color: '#D97706' },
  competency:  { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' },
};

const DIFFICULTY_STYLES: Record<string, { bg: string; color: string }> = {
  easy:   { bg: 'rgba(16,185,129,0.12)',  color: '#10B981' },
  medium: { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B' },
  hard:   { bg: 'rgba(239,68,68,0.12)',  color: '#EF4444' },
};

/* ─── Helpers ────────────────────────────────────────────────── */
function surfaceCard(isDark: boolean): React.CSSProperties {
  return {
    background: isDark ? '#1E293B' : '#FFFFFF',
    border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
    borderRadius: 12, padding: 24,
  };
}

function surfaceElevated(isDark: boolean): React.CSSProperties {
  return {
    background: isDark ? '#263348' : '#F8FAFC',
    border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
    borderRadius: 12, padding: 20, marginBottom: 12,
  };
}

/* ─── Skeleton Cards ─────────────────────────────────────────── */
function SkeletonCards({ isDark }: { isDark: boolean }) {
  const sh = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.05)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 800, margin: '0 auto' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ ...surfaceElevated(isDark), padding: 24 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 80, height: 22, borderRadius: 999, background: sh }} className="adp-shim" />
            <div style={{ width: 60, height: 22, borderRadius: 999, background: sh }} className="adp-shim" />
          </div>
          <div style={{ width: '90%', height: 18, borderRadius: 6, background: sh, marginBottom: 12 }} className="adp-shim" />
          <div style={{ width: '60%', height: 14, borderRadius: 6, background: sh }} className="adp-shim" />
        </div>
      ))}
    </div>
  );
}

/* ─── Question Card ──────────────────────────────────────────── */
function QuestionCard({
  question, index, isDark, applicationId,
}: {
  question: InterviewQuestion;
  index: number;
  isDark: boolean;
  applicationId: string;
}) {
  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)';

  const [answerOpen, setAnswerOpen] = useState(false);
  const [userAnswer, setUserAnswer] = useState(question.user_answer || '');
  const [savedAnswer, setSavedAnswer] = useState(question.user_answer || '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasUnsaved = userAnswer !== savedAnswer;

  const saveAnswer = useCallback(async (answer: string) => {
    setSaveState('saving');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Please log in'); setSaveState('idle'); return; }

      const res = await apiFetch(
        '/make-server-3bbff5cf/save-interview-answer',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id: applicationId,
            question_id: question.id,
            user_answer: answer,
          }),
        }
      );
      const result = await res.json();
      if (result.success) {
        setSavedAnswer(answer);
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2000);
      } else {
        toast.error('Failed to save answer');
        setSaveState('idle');
      }
    } catch {
      toast.error('Failed to save answer');
      setSaveState('idle');
    }
  }, [applicationId, question.id]);

  // Auto-save with 2s debounce
  const handleAnswerChange = (val: string) => {
    setUserAnswer(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (val !== savedAnswer) saveAnswer(val);
    }, 2000);
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const catStyle = CATEGORY_STYLES[question.category] || CATEGORY_STYLES.competency;
  const diffStyle = DIFFICULTY_STYLES[question.difficulty] || DIFFICULTY_STYLES.medium;

  return (
    <div style={surfaceElevated(isDark)}>
      {/* Top row: badges + question number */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{
            padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, fontFamily: font,
            background: catStyle.bg, color: catStyle.color,
          }}>{question.category}</span>
          <span style={{
            padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, fontFamily: font,
            background: diffStyle.bg, color: diffStyle.color,
          }}>{question.difficulty}</span>
        </div>
        <span style={{ fontSize: 12, fontFamily: font, color: secondaryText }}>Q{index + 1}</span>
      </div>

      {/* Question text */}
      <p style={{
        margin: '12px 0 16px', fontSize: 15, fontWeight: 600, fontFamily: font,
        color: primaryText, lineHeight: 1.5,
      }}>{question.question}</p>

      {/* Suggested answer (collapsible) */}
      <button
        onClick={() => setAnswerOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 500, fontFamily: font, color: '#1A56DB', display: 'flex', alignItems: 'center', gap: 4 }}>
          Suggested answer based on your CV
        </span>
        {answerOpen
          ? <ChevronUp size={14} color="#1A56DB" />
          : <ChevronDown size={14} color="#1A56DB" />
        }
      </button>
      {answerOpen && (
        <div style={{
          background: 'rgba(26,86,219,0.04)', borderRadius: 8,
          padding: '12px 14px', marginTop: 8,
          fontSize: 13, fontFamily: font, color: secondaryText, lineHeight: 1.6,
        }}>
          {question.suggested_answer}
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: borderColor, margin: '16px 0' }} />

      {/* Practice answer */}
      <div>
        <label style={{
          fontSize: 11, fontWeight: 600, fontFamily: font,
          color: secondaryText, textTransform: 'uppercase' as const,
          letterSpacing: '0.5px', marginBottom: 8, display: 'block',
        }}>Your practice answer</label>
        <textarea
          value={userAnswer}
          onChange={e => handleAnswerChange(e.target.value)}
          placeholder="Type your practice answer here..."
          style={{
            width: '100%', minHeight: 100, boxSizing: 'border-box' as const,
            background: isDark ? '#1E293B' : '#FFFFFF',
            border: `1px solid ${borderColor}`, borderRadius: 8,
            padding: '10px 12px', fontSize: 13, fontFamily: font,
            color: primaryText, resize: 'vertical' as const,
            outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = '#1A56DB';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)';
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = borderColor;
            e.currentTarget.style.boxShadow = 'none';
          }}
        />

        {/* Save state indicator */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 8, minHeight: 24 }}>
          {saveState === 'saving' && (
            <span style={{ fontSize: 12, fontWeight: 500, fontFamily: font, color: secondaryText }}>Saving...</span>
          )}
          {saveState === 'saved' && (
            <span style={{ fontSize: 12, fontWeight: 500, fontFamily: font, color: '#10B981', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Check size={12} /> Saved
            </span>
          )}
          {hasUnsaved && saveState === 'idle' && (
            <>
              <span style={{ fontSize: 12, fontFamily: font, color: secondaryText }}>Unsaved</span>
              <button
                onClick={() => { if (debounceRef.current) clearTimeout(debounceRef.current); saveAnswer(userAnswer); }}
                style={{
                  height: 28, padding: '0 12px', borderRadius: 6,
                  background: '#1A56DB', color: '#FFF', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500, fontFamily: font,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#1E40AF'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#1A56DB'; }}
              >Save answer</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export function InterviewPrepTab({ applicationId, jobTitle, hasGeneratedCv, isDark, onSwitchTab }: Props) {
  const navigate = useNavigate();
  const { planTier, loading: planLoading } = useUserPlan();
  const isPro = planTier === 'pro';

  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';

  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [cached, setCached] = useState(false);
  const [loadingCopy, setLoadingCopy] = useState('Analysing the job description...');

  // Rotating loading copy
  useEffect(() => {
    if (!generating) return;
    const copies = [
      'Analysing the job description...',
      'Reviewing your CV...',
      'Crafting targeted questions...',
      'Writing suggested answers...',
      'Almost done...',
    ];
    let idx = 0;
    const iv = setInterval(() => { idx = (idx + 1) % copies.length; setLoadingCopy(copies[idx]); }, 2000);
    return () => clearInterval(iv);
  }, [generating]);

  // Auto-load questions on mount
  useEffect(() => {
    if (!hasGeneratedCv || !applicationId) return;
    loadQuestions();
  }, [applicationId, hasGeneratedCv]);

  const loadQuestions = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await apiFetch(
        '/make-server-3bbff5cf/generate-interview-prep',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ application_id: applicationId, load_only: true }),
        }
      );
      const result = await res.json();
      if (result.success && result.questions?.length > 0) {
        setQuestions(result.questions);
        setCached(result.cached);
      }
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  };

  const generateQuestions = async (forceRegenerate = false) => {
    setGenerating(true);
    setLoadingCopy('Analysing the job description...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Please log in'); setGenerating(false); return; }

      const res = await apiFetch(
        '/make-server-3bbff5cf/generate-interview-prep',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id: applicationId,
            force_regenerate: forceRegenerate,
          }),
        }
      );
      const result = await res.json();
      if (result.success && result.questions) {
        setQuestions(result.questions);
        setCached(result.cached);
        toast.success('Interview questions generated!');
      } else if (result.code === 'NO_GENERATED_CV') {
        toast.error('Generate a CV for this application first');
      } else {
        toast.error(result.error || 'Failed to generate questions');
      }
    } catch (e) {
      console.error('Interview prep error:', e);
      toast.error('Failed to generate questions');
    } finally {
      setGenerating(false);
    }
  };

  // Plan loading → skeleton
  if (planLoading) return <SkeletonCards isDark={isDark} />;

  // STATE A — No generated CV
  if (!hasGeneratedCv) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <div style={{ ...surfaceCard(isDark), maxWidth: 460, textAlign: 'center' as const, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 12 }}>
          <FileText size={48} color="rgba(26,86,219,0.5)" />
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: font, color: primaryText }}>Generate your CV first</h3>
          <p style={{ margin: 0, fontSize: 14, fontFamily: font, color: secondaryText, lineHeight: 1.6, maxWidth: 360 }}>
            Interview questions are tailored to your generated CV and the job description.
          </p>
          <button
            onClick={() => onSwitchTab('cv')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              height: 36, padding: '0 16px', background: '#1A56DB', color: '#FFF',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: 13, fontWeight: 500, fontFamily: font,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1E40AF'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1A56DB'; }}
          >
            <ArrowRight size={14} /> Go to CV tab
          </button>
        </div>
      </div>
    );
  }

  // Generating state
  if (generating) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <div style={{ ...surfaceCard(isDark), maxWidth: 400, textAlign: 'center' as const, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: 'rgba(26,86,219,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'adp-pulse 1.5s ease-in-out infinite',
          }}><Sparkles size={28} color="#1A56DB" /></div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 500, fontFamily: font, color: primaryText }}>{loadingCopy}</p>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: '100%', height: 12, borderRadius: 6, background: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.05)' }} className="adp-shim" />
          ))}
        </div>
      </div>
    );
  }

  // STATE B — Ready to generate (loaded but no questions)
  if (loaded && questions.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <div style={{ ...surfaceCard(isDark), maxWidth: 480, textAlign: 'center' as const, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 12 }}>
          <Sparkles size={48} color="rgba(26,86,219,0.5)" />
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: font, color: primaryText }}>Prepare for your interview</h3>
          <p style={{ margin: 0, fontSize: 14, fontFamily: font, color: secondaryText, lineHeight: 1.6, maxWidth: 380 }}>
            Get {isPro ? '12' : '5'} tailored questions with suggested answers based on your CV and this role.
          </p>

          {/* Free user teaser */}
          {!isPro && (
            <div style={{ marginTop: 4 }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, fontFamily: font, color: secondaryText }}>
                Free plan includes 5 questions · Upgrade for 12 questions + detailed answers
              </p>
              <button
                onClick={() => navigate('/billing')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  fontSize: 12, fontWeight: 600, fontFamily: font, color: '#1A56DB',
                }}
              >Upgrade to Pro →</button>
            </div>
          )}

          <button
            onClick={() => generateQuestions(false)}
            style={{
              width: '100%', height: 44, borderRadius: 8, border: 'none',
              background: '#1A56DB', color: '#FFF', cursor: 'pointer',
              fontSize: 14, fontWeight: 600, fontFamily: font,
              marginTop: 8, transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1E40AF'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1A56DB'; }}
          >
            Generate Interview Questions
          </button>
        </div>
      </div>
    );
  }

  // Not yet loaded and not generating
  if (!loaded) return <SkeletonCards isDark={isDark} />;

  // STATE C — Questions loaded
  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 16, fontWeight: 600, fontFamily: font, color: primaryText }}>
          {questions.length} questions for {jobTitle}
        </span>
        {isPro && (
          <button
            onClick={() => generateQuestions(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 32, padding: '0 12px',
              background: 'none', border: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)'}`,
              borderRadius: 8, cursor: 'pointer',
              fontSize: 12, fontWeight: 500, fontFamily: font,
              color: isDark ? '#94A3B8' : '#64748B',
              transition: 'border-color 0.15s, color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#1A56DB';
              e.currentTarget.style.borderColor = 'rgba(26,86,219,0.4)';
              e.currentTarget.style.background = 'rgba(26,86,219,0.08)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = isDark ? '#94A3B8' : '#64748B';
              e.currentTarget.style.borderColor = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)';
              e.currentTarget.style.background = 'none';
            }}
          >
            <RefreshCw size={12} /> Regenerate
          </button>
        )}
      </div>

      {/* Free user upgrade banner */}
      {!isPro && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 8,
          padding: '10px 16px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.2)',
        }}>
          <span style={{ fontSize: 13, fontFamily: font, color: '#D97706', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Lock size={13} /> Showing {questions.length} of 12 questions · Upgrade to Pro to unlock all questions
          </span>
          <button
            onClick={() => navigate('/billing')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 13, fontWeight: 600, fontFamily: font, color: '#1A56DB',
            }}
          >Upgrade →</button>
        </div>
      )}

      {/* Question cards */}
      {questions.map((q, i) => (
        <QuestionCard
          key={q.id}
          question={q}
          index={i}
          isDark={isDark}
          applicationId={applicationId}
        />
      ))}
    </div>
  );
}
