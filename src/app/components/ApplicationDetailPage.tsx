/**
 * ApplicationDetailPage — /applications/:id
 *
 * Full-page view of a single application.
 * 5 tabs: Overview · Feedback · CV · Cover Letter · Notes
 * Two-column layout for Overview/Feedback (desktop), single column for rest.
 * Reads ?tab= query param to set initial tab.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import { SharedNavbar } from './SharedNavbar';
import {
  ChevronDown, ChevronUp, ChevronLeft, Check, FileText,
  Download, ArrowRight, RefreshCw, Lock, Sparkles, Brain,
  Lightbulb, AlertTriangle, Mail, Calendar, Phone, Video,
  Users, ClipboardList, ExternalLink, Pencil,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { apiFetch } from '../lib/apiFetch';
import { toast, Toaster } from 'sonner';
import { useUserPlan } from '../lib/UserPlanContext';
import { downloadCvPdf, downloadCoverLetterPdf } from '../lib/pdf-generator.js';
import { GENERIC_TRAITS } from '../lib/genericTraits';
import { InterviewPrepTab } from './InterviewPrepTab';

/* ─── Types ──────────────────────────────────────────────────── */
type Theme = 'dark' | 'light';
type StatusKey = 'saved' | 'applied' | 'interview_scheduled' | 'interview_done' | 'offer' | 'rejected';
type TabKey = 'overview' | 'feedback' | 'cv' | 'cover-letter' | 'interview-prep' | 'notes';
type InterviewType = 'phone' | 'video' | 'in-person' | 'assessment';
type Tone = 'professional' | 'conversational' | 'confident';

interface AppData {
  id: string;
  job_title: string;
  company: string;
  status: StatusKey;
  created_at: string;
  next_action_date: string | null;
  job_parsed_json: any;
  job_url?: string;
  civil_service_mode?: boolean;
}

interface GeneratedCv {
  id: string;
  cv_json: any;
  match_score: number | null;
  feedback_json: any | null;
  feedback_generated_at: string | null;
  template_id: string | null;
  pdf_url: string | null;
  created_at?: string;
}

interface CoverLetterData {
  id: string;
  content: string;
  tone: string | null;
  pdf_url: string | null;
  updated_at: string | null;
  created_at?: string;
}

interface NotesData {
  application_id: string;
  notes_text: string | null;
  interview_date: string | null;
  interview_type: string | null;
  outcome: string | null;
}

/* ─── Constants ──────────────────────────────────────────────── */
const font = 'Inter, sans-serif';
const SUPABASE_URL = 'https://hrexgjahkdjqxvulodqu.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyZXhnamFoa2RqcXh2dWxvZHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNzAzNjUsImV4cCI6MjA4Nzk0NjM2NX0.pkV8MPJYG-AyBPk5qG7iDJCT86aOzVKcti1wfygqpRM';

const STATUS_CONFIG: Record<StatusKey, { label: string; color: string }> = {
  saved:               { label: 'Saved',               color: '#94A3B8' },
  applied:             { label: 'Applied',             color: '#3B82F6' },
  interview_scheduled: { label: 'Interview Scheduled', color: '#F59E0B' },
  interview_done:      { label: 'Interview Done',      color: '#8B5CF6' },
  offer:               { label: 'Offer',               color: '#10B981' },
  rejected:            { label: 'Rejected',            color: '#EF4444' },
};

const STATUS_ORDER: StatusKey[] = [
  'saved', 'applied', 'interview_scheduled', 'interview_done', 'offer', 'rejected',
];

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview',        label: 'Overview' },
  { key: 'feedback',        label: 'Feedback' },
  { key: 'cv',              label: 'CV' },
  { key: 'cover-letter',    label: 'Cover Letter' },
  { key: 'interview-prep',  label: 'Interview Prep' },
  { key: 'notes',           label: 'Notes' },
];

/* ─── Helpers ────────────────────────────────────────────────── */
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}`;
}

function scoreColor(n: number) {
  if (n >= 80) return '#10B981';
  if (n >= 60) return '#F59E0B';
  return '#EF4444';
}

function barColor(n: number) {
  if (n >= 8) return '#10B981';
  if (n >= 6) return '#F59E0B';
  return '#EF4444';
}



/* ─── Shared inline style factories ──────────────────────────── */
function sectionLabel(isDark: boolean): React.CSSProperties {
  return {
    fontSize: 11, fontWeight: 500, fontFamily: font,
    letterSpacing: '0.05em', textTransform: 'uppercase',
    color: isDark ? '#94A3B8' : '#64748B',
    marginBottom: 12, display: 'block',
  };
}

function surfaceCard(isDark: boolean): React.CSSProperties {
  return {
    background: isDark ? '#1E293B' : '#FFFFFF',
    border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
    borderRadius: 12, padding: 24,
  };
}

function inputStyle(isDark: boolean): React.CSSProperties {
  return {
    width: '100%', height: 44, padding: '0 12px', boxSizing: 'border-box' as const,
    background: isDark ? '#1E293B' : '#FFFFFF',
    border: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'}`,
    borderRadius: 8, fontSize: 14, fontFamily: font, fontWeight: 400,
    color: isDark ? '#F8FAFC' : '#0F172A', outline: 'none',
    colorScheme: isDark ? 'dark' : 'light',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };
}

function focusRing(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = '#1A56DB';
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)';
}

function blurRing(isDark: boolean) {
  return (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)';
    e.currentTarget.style.boxShadow = 'none';
  };
}

/* ─── Button ─────────────────────────────────────────────────── */
function Btn({
  children, variant = 'secondary', fullWidth = false, disabled = false,
  onClick, isDark, icon, style: os,
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  fullWidth?: boolean; disabled?: boolean;
  onClick?: () => void; isDark: boolean;
  icon?: React.ReactNode; style?: React.CSSProperties;
}) {
  const [h, setH] = useState(false);
  const [p, setP] = useState(false);

  let bg = 'none', color = isDark ? '#F8FAFC' : '#0F172A',
      border = `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)'}`;
  if (variant === 'primary') { bg = h ? '#1E40AF' : '#1A56DB'; color = '#FFF'; border = 'none'; }
  else if (variant === 'secondary') {
    bg = h ? (isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)') : 'none'; color = '#1A56DB';
  } else if (variant === 'ghost') {
    bg = h ? (isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)') : 'none';
    color = isDark ? '#94A3B8' : '#64748B'; border = 'none';
  }
  if (disabled) { bg = isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)'; color = isDark ? '#64748B' : '#94A3B8'; border = 'none'; }

  return (
    <button onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && setH(true)}
      onMouseLeave={() => { setH(false); setP(false); }}
      onMouseDown={() => !disabled && setP(true)}
      onMouseUp={() => setP(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: 36, padding: '0 16px', background: bg, color, border, borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 13, fontWeight: 500, fontFamily: font, lineHeight: 1,
        transform: p ? 'scale(0.97)' : 'scale(1)',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s, transform 0.1s',
        width: fullWidth ? '100%' : 'auto', opacity: disabled ? 0.6 : 1, ...os,
      }}
    >{icon}{children}</button>
  );
}

/* ─── StatusBadge ────────────────────────────────────────────── */
function StatusBadge({ status }: { status: StatusKey }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.saved;
  return (
    <span style={{
      padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 500, fontFamily: font,
      background: c.color + '26', color: c.color, border: `1px solid ${c.color}40`,
      lineHeight: 1.6, whiteSpace: 'nowrap',
    }}>{c.label}</span>
  );
}

/* ─── Shimmer skeleton ───────────────────────────────────────── */
function Skeleton({ isDark }: { isDark: boolean }) {
  const sh = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.05)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '28px 0' }}>
      <div style={{ width: '35%', height: 16, borderRadius: 6, background: sh }} className="adp-shim" />
      <div style={{ width: '55%', height: 28, borderRadius: 8, background: sh }} className="adp-shim" />
      <div style={{ width: '25%', height: 14, borderRadius: 6, background: sh }} className="adp-shim" />
      <div style={{ height: 1, background: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)', margin: '8px 0' }} />
      <div style={{ display: 'flex', gap: 12 }}>
        {[0, 1, 2, 3, 4].map(i => <div key={i} style={{ width: 80, height: 32, borderRadius: 6, background: sh }} className="adp-shim" />)}
      </div>
      <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
        <div style={{ flex: '65%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2].map(i => <div key={i} style={{ height: 120, borderRadius: 12, background: sh }} className="adp-shim" />)}
        </div>
        <div style={{ flex: '35%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1].map(i => <div key={i} style={{ height: 160, borderRadius: 12, background: sh }} className="adp-shim" />)}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   OVERVIEW TAB
   ═══════════════════════════════════════════════════════════════ */
function OverviewTab({ app, isDark, onStatusChange }: {
  app: AppData; isDark: boolean; onStatusChange: (s: StatusKey) => void;
}) {
  const [nextAction, setNextAction] = useState(app.next_action_date || '');
  const [showAllResp, setShowAllResp] = useState(false);

  const parsed = app.job_parsed_json || {};
  const skills: string[] = parsed.skills || parsed.key_skills || [];
  const requirements: string[] = parsed.requirements || parsed.key_requirements || [];
  const responsibilities: string[] = parsed.responsibilities || [];
  const jobUrl = parsed.job_url || app.job_url || null;

  const handleNextAction = async (val: string) => {
    setNextAction(val);
    const { error } = await supabase.from('applications').update({ next_action_date: val || null }).eq('id', app.id);
    if (error) toast.error('Failed to save next action date');
  };

  const timeline = useMemo(() => {
    const idx = STATUS_ORDER.indexOf(app.status);
    const evts: { status: StatusKey; date: string }[] = [];
    evts.push({ status: 'saved', date: fmtDate(app.created_at) });
    if (idx >= 1) evts.push({ status: 'applied', date: fmtDate(app.created_at) });
    if (idx >= 2) evts.push({ status: 'interview_scheduled', date: fmtDate(app.created_at) });
    if (idx >= 3) evts.push({ status: 'interview_done', date: fmtDate(app.created_at) });
    if (idx >= 4) evts.push({ status: 'offer', date: fmtDate(app.created_at) });
    if (app.status === 'rejected') evts.push({ status: 'rejected', date: fmtDate(app.created_at) });
    return evts.reverse();
  }, [app.status, app.created_at]);

  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';

  const bullet = (text: string, i: number) => (
    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: secondaryText, flexShrink: 0, marginTop: 7 }} />
      <span style={{ fontSize: 13, fontFamily: font, color: primaryText, lineHeight: 1.6 }}>{text}</span>
    </div>
  );

  return (
    <div className="adp-two-col" style={{ display: 'flex', gap: 24 }}>
      {/* Left column */}
      <div className="adp-col-left" style={{ flex: '65%', minWidth: 0 }}>
        <div style={surfaceCard(isDark)}>
          {/* Skills */}
          {skills.length > 0 && (
            <>
              <span style={sectionLabel(isDark)}>Key Skills</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {skills.map((s, i) => (
                  <span key={i} style={{
                    padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 400, fontFamily: font,
                    background: isDark ? '#263348' : '#F8FAFC', color: secondaryText,
                    border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.2)'}`,
                  }}>{s}</span>
                ))}
              </div>
            </>
          )}

          {/* Requirements */}
          {requirements.length > 0 && (
            <>
              <span style={sectionLabel(isDark)}>Requirements</span>
              <div style={{ marginBottom: 16 }}>{requirements.slice(0, 6).map(bullet)}</div>
            </>
          )}

          {/* Responsibilities */}
          {responsibilities.length > 0 && (
            <>
              <span style={sectionLabel(isDark)}>Responsibilities</span>
              <div>
                {(showAllResp ? responsibilities : responsibilities.slice(0, 4)).map(bullet)}
                {responsibilities.length > 4 && !showAllResp && (
                  <button onClick={() => setShowAllResp(true)} style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontSize: 13, fontWeight: 500, fontFamily: font, color: '#1A56DB', marginTop: 4,
                  }}>Show all ({responsibilities.length})</button>
                )}
              </div>
            </>
          )}

          {/* No parsed data fallback */}
          {skills.length === 0 && requirements.length === 0 && responsibilities.length === 0 && (
            <p style={{ fontSize: 14, fontFamily: font, color: secondaryText, lineHeight: 1.6, margin: 0 }}>
              No parsed job description available. Try pasting the job listing into a new application to generate structured data.
            </p>
          )}

          {/* Job URL */}
          {jobUrl && (
            <a href={jobUrl} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 500, fontFamily: font, color: '#1A56DB',
              marginTop: 16, textDecoration: 'none',
            }}>
              View original job posting <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>

      {/* Right column */}
      <div className="adp-col-right" style={{ flex: '35%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Application Details */}
        <div style={surfaceCard(isDark)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ ...sectionLabel(isDark), marginBottom: 0 }}>Applied</span>
            <span style={{ fontSize: 14, fontFamily: font, color: primaryText }}>{fmtDate(app.created_at)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ ...sectionLabel(isDark), marginBottom: 0 }}>Status</span>
            <StatusBadge status={app.status} />
          </div>
          <div style={{ height: 1, background: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)', marginBottom: 16 }} />
          <span style={sectionLabel(isDark)}>Next Action Date</span>
          <input type="date" value={nextAction}
            onChange={e => handleNextAction(e.target.value)}
            style={inputStyle(isDark)} onFocus={focusRing} onBlur={blurRing(isDark)} />
        </div>

        {/* Timeline */}
        <div style={surfaceCard(isDark)}>
          <span style={sectionLabel(isDark)}>Timeline</span>
          <div style={{ position: 'relative', paddingLeft: 22 }}>
            <div style={{
              position: 'absolute', left: 4, top: 5, bottom: 5, width: 1,
              background: isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.3)',
            }} />
            {timeline.map((ev, i) => {
              const c = STATUS_CONFIG[ev.status];
              const isLatest = i === 0;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  marginBottom: i < timeline.length - 1 ? 18 : 0, position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute', left: -19, top: 3,
                    width: 10, height: 10, borderRadius: '50%',
                    background: isLatest ? '#1A56DB' : (isDark ? '#263348' : '#F8FAFC'),
                    border: isLatest ? '2px solid #1A56DB' : `2px solid ${c.color}`,
                    boxSizing: 'border-box',
                  }} />
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500, fontFamily: font, color: primaryText, display: 'block', lineHeight: 1.3 }}>{c.label}</span>
                    <span style={{ fontSize: 12, fontFamily: font, color: isDark ? '#64748B' : '#94A3B8', lineHeight: 1.3 }}>{ev.date}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FEEDBACK TAB
   ═══════════════════════════════════════════════════════════════ */
function FeedbackTab({ app, generatedCv, setGeneratedCv, isDark, feedback, analysisLoading, onRunAnalysis, coverLetter }: {
  app: AppData; generatedCv: GeneratedCv | null;
  setGeneratedCv: React.Dispatch<React.SetStateAction<GeneratedCv | null>>;
  isDark: boolean;
  feedback: any;
  analysisLoading: boolean;
  onRunAnalysis: (cvId: string) => void;
  coverLetter: CoverLetterData | null;
}) {
  const navigate = useNavigate();
  const { planTier } = useUserPlan();
  const isPro = planTier === 'pro';
  const analysing = analysisLoading;
  const [loadingCopy, setLoadingCopy] = useState('Reading the job requirements…');

  const [strengthsOpen, setStrengthsOpen] = useState(true);
  const [weaknessesOpen, setWeaknessesOpen] = useState(true);

  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';

  // Rotating copy
  useEffect(() => {
    if (!analysing) return;
    const copies = ['Reading the job requirements…', 'Reviewing your CV…', 'Forming an honest opinion…', 'Writing up feedback…'];
    let idx = 0;
    const iv = setInterval(() => { idx = (idx + 1) % copies.length; setLoadingCopy(copies[idx]); }, 1500);
    return () => clearInterval(iv);
  }, [analysing]);

  const handleRunAnalysis = () => {
    if (!generatedCv) return;
    onRunAnalysis(generatedCv.id);
  };

  // No generated CV at all
  if (!generatedCv) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <div style={{ ...surfaceCard(isDark), maxWidth: 460, textAlign: 'center' as const, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 12 }}>
          <Sparkles size={48} color="rgba(26,86,219,0.5)" />
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: font, color: primaryText }}>Generate a CV first</h3>
          <p style={{ margin: 0, fontSize: 14, fontFamily: font, color: secondaryText, lineHeight: 1.6, maxWidth: 360 }}>
            AI feedback is available once you have generated a tailored CV for this application.
          </p>
          <Btn variant="primary" isDark={isDark} icon={<ArrowRight size={14} />} onClick={() => navigate('/new-application')}>Generate CV</Btn>
        </div>
      </div>
    );
  }

  // Has CV but no feedback
  if (!feedback && !analysing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <div style={{ ...surfaceCard(isDark), maxWidth: 460, textAlign: 'center' as const, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 12 }}>
          <Sparkles size={48} color="rgba(26,86,219,0.5)" />
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: font, color: primaryText }}>Get AI Feedback</h3>
          <p style={{ margin: 0, fontSize: 14, fontFamily: font, color: secondaryText, lineHeight: 1.6, maxWidth: 380 }}>
            Find out exactly how strong this application is. Our AI critically analyses your tailored CV against the job requirements and gives you honest, specific, actionable feedback.
          </p>
          <Btn variant="primary" isDark={isDark} icon={<Sparkles size={14} />} onClick={handleRunAnalysis}>Analyse Application</Btn>
        </div>
      </div>
    );
  }

  // Loading
  if (analysing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <div style={{ ...surfaceCard(isDark), maxWidth: 400, textAlign: 'center' as const, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: 'rgba(26,86,219,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'adp-pulse 1.5s ease-in-out infinite',
          }}><Brain size={28} color="#1A56DB" /></div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 500, fontFamily: font, color: primaryText }}>{loadingCopy}</p>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: '100%', height: 12, borderRadius: 6, background: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.05)' }} className="adp-shim" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Feedback loaded ───
  const fb = feedback;
  const cvQuality = fb.cv_quality || {};
  const qualityPills: { key: string; label: string }[] = [
    { key: 'summary_quality', label: 'Summary' },
    { key: 'bullet_strength', label: 'Bullets' },
    { key: 'keyword_match',   label: 'Keywords' },
  ];

  // ─── Change 3: Filter missing keywords ───
  const cvJson = generatedCv?.cv_json || {};
  const cvSkills: string[] = (cvJson.skills || cvJson.key_skills || []).map((s: string) => s.toLowerCase().trim());
  const filteredMissingKeywords = (fb.missing_keywords || []).filter((kw: string) => {
    const norm = kw.toLowerCase().trim();
    if (norm.length < 4) return false;
    if (GENERIC_TRAITS.has(norm)) return false;
    if (cvSkills.includes(norm)) return false;
    return true;
  });

  // ─── Change 4: Cover letter gap coverage ───
  const skillsGap: string[] = cvJson.skills_gap || [];
  const clText = (coverLetter?.content || '').toLowerCase();
  const gapCoverage = skillsGap.map(gap => {
    // Check if cover letter mentions key words from the gap term
    const words = gap.toLowerCase().split(/[\s\-\/]+/).filter(w => w.length > 3);
    const addressed = clText.length > 0 && words.some(w => clText.includes(w));
    return { gap, addressed };
  });
  const addressedGaps = gapCoverage.filter(g => g.addressed);
  const unaddressedGaps = gapCoverage.filter(g => !g.addressed);

  return (
    <div className="adp-two-col" style={{ display: 'flex', gap: 24 }}>
      {/* Left */}
      <div className="adp-col-left" style={{ flex: '65%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Match Summary card (Change 1) */}
        <div style={surfaceCard(isDark)}>
          <span style={sectionLabel(isDark)}>Match Summary</span>
          <p style={{ margin: '0 0 16px', fontSize: 14, fontFamily: font, color: primaryText, lineHeight: 1.7 }}>
            {fb.verdict_summary}
          </p>
          {/* 3 stat pills */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {qualityPills.map(({ key, label }) => {
              const item = cvQuality[key] || { score: 0 };
              const bc = barColor(item.score);
              return (
                <span key={key} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, fontFamily: font,
                  background: isDark ? '#1E293B' : '#FFFFFF',
                  border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
                  color: primaryText,
                }}>
                  {label} <span style={{ color: bc }}>{item.score}/10</span>
                </span>
              );
            })}
          </div>
          {/* Re-run button */}
          <button
            onClick={handleRunAnalysis}
            disabled={analysing}
            style={{
              marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 8, cursor: analysing ? 'wait' : 'pointer',
              background: 'none',
              border: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)'}`,
              color: isDark ? '#94A3B8' : '#64748B',
              fontSize: 13, fontWeight: 500, fontFamily: font, lineHeight: 1,
              transition: 'border-color 0.15s, color 0.15s, background 0.15s',
              opacity: analysing ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              if (!analysing) {
                e.currentTarget.style.color = '#1A56DB';
                e.currentTarget.style.borderColor = 'rgba(26,86,219,0.4)';
                e.currentTarget.style.background = 'rgba(26,86,219,0.08)';
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = isDark ? '#94A3B8' : '#64748B';
              e.currentTarget.style.borderColor = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)';
              e.currentTarget.style.background = 'none';
            }}
          >
            <RefreshCw size={14} />
            Re-run Analysis
          </button>
        </div>

        {/* Strengths */}
        {fb.strengths && fb.strengths.length > 0 && (
          <div style={surfaceCard(isDark)}>
            <button onClick={() => setStrengthsOpen(v => !v)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 14, fontWeight: 600, fontFamily: font, color: '#10B981', lineHeight: 1.3,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={16} /> Strengths</span>
              {strengthsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {strengthsOpen && fb.strengths.map((s: any, i: number) => (
              <div key={i} style={{ marginTop: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600, fontFamily: font, color: primaryText, display: 'block' }}>{s.title}</span>
                <span style={{ fontSize: 13, fontFamily: font, color: secondaryText, lineHeight: 1.6, marginTop: 4, display: 'block' }}>{s.detail}</span>
              </div>
            ))}
          </div>
        )}

        {/* Weaknesses */}
        {fb.weaknesses && fb.weaknesses.length > 0 && (
          <div style={surfaceCard(isDark)}>
            <button onClick={() => setWeaknessesOpen(v => !v)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 14, fontWeight: 600, fontFamily: font, color: '#F59E0B', lineHeight: 1.3,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={16} /> Areas to Improve</span>
              {weaknessesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {weaknessesOpen && fb.weaknesses.map((w: any, i: number) => (
              <div key={i} style={{ marginTop: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600, fontFamily: font, color: primaryText, display: 'block' }}>{w.title}</span>
                <span style={{ fontSize: 13, fontFamily: font, color: secondaryText, lineHeight: 1.6, marginTop: 4, display: 'block' }}>{w.detail}</span>
                {w.fix && (
                  <div style={{
                    marginTop: 8, padding: '10px 14px', borderRadius: '0 6px 6px 0',
                    background: 'rgba(26,86,219,0.08)', borderLeft: '3px solid #1A56DB',
                    fontSize: 13, fontFamily: font, color: primaryText, lineHeight: 1.5,
                  }}>
                    <Lightbulb size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4, color: '#3B82F6' }} />
                    {w.fix}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Cover Letter Gap Coverage (Change 4) */}
        {skillsGap.length > 0 && (
          <div style={surfaceCard(isDark)}>
            <span style={sectionLabel(isDark)}>Cover Letter Gap Coverage</span>
            {coverLetter ? (
              <>
                {addressedGaps.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: font, color: '#10B981', display: 'block', marginBottom: 8 }}>
                      Addressed in your cover letter
                    </span>
                    {addressedGaps.map((g, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Check size={14} color="#10B981" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontFamily: font, color: secondaryText }}>{g.gap}</span>
                      </div>
                    ))}
                  </div>
                )}
                {unaddressedGaps.length > 0 && (
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: font, color: '#F59E0B', display: 'block', marginBottom: 8 }}>
                      Not yet addressed
                    </span>
                    {unaddressedGaps.map((g, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #F59E0B', flexShrink: 0, boxSizing: 'border-box' as const }} />
                          <span style={{ fontSize: 13, fontFamily: font, color: secondaryText }}>{g.gap}</span>
                        </div>
                        <span style={{ fontSize: 12, fontFamily: font, color: isDark ? '#64748B' : '#94A3B8', marginLeft: 22, display: 'block', marginTop: 2 }}>
                          Consider mentioning this in your cover letter
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center' as const, padding: '16px 0' }}>
                <p style={{ margin: '0 0 12px', fontSize: 13, fontFamily: font, color: secondaryText, lineHeight: 1.5 }}>
                  Generate a cover letter to see how well it addresses your CV gaps
                </p>
                {isPro ? (
                  <Btn variant="secondary" isDark={isDark} icon={<ArrowRight size={14} />}
                    onClick={() => navigate(`/applications/${app.id}?tab=cover-letter`)}>
                    Generate Cover Letter
                  </Btn>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <button
                      onClick={() => navigate('/billing')}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        height: 36, padding: '10px 16px',
                        background: isDark ? '#263348' : '#F8FAFC',
                        color: isDark ? '#94A3B8' : '#64748B',
                        border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.3)'}`,
                        borderRadius: 8, cursor: 'not-allowed',
                        fontSize: 13, fontWeight: 500, fontFamily: font, lineHeight: 1,
                      }}
                    >
                      <Lock size={13} /> Generate Cover Letter
                    </button>
                    <p style={{ margin: '6px 0 0', fontSize: 12, fontFamily: font, color: secondaryText, lineHeight: 1.4 }}>
                      Cover letters are a Pro feature.{' '}
                      <span
                        onClick={() => navigate('/billing')}
                        style={{ color: '#1A56DB', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Upgrade to Pro &rarr;
                      </span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right */}
      <div className="adp-col-right" style={{ flex: '35%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Top actions */}
        {fb.top_actions && fb.top_actions.length > 0 && (
          <div style={surfaceCard(isDark)}>
            <span style={sectionLabel(isDark)}>Top Actions</span>
            {fb.top_actions.map((a: any, i: number) => (
              <div key={i}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: '12px 0' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(26,86,219,0.12)', border: '1px solid rgba(26,86,219,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700, fontFamily: font, color: '#1A56DB',
                  }}>{i + 1}</div>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 600, fontFamily: font, color: primaryText, display: 'block' }}>{a.action}</span>
                    <span style={{ fontSize: 13, fontFamily: font, color: secondaryText, lineHeight: 1.5, marginTop: 4, display: 'block' }}>{a.reason}</span>
                  </div>
                </div>
                {i < fb.top_actions.length - 1 && (
                  <div style={{ height: 1, background: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)' }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Missing keywords (filtered — Change 3) */}
        {filteredMissingKeywords.length >= 2 && (
          <div style={surfaceCard(isDark)}>
            <span style={sectionLabel(isDark)}>Missing Keywords</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              {filteredMissingKeywords.map((kw: string, i: number) => (
                <span key={i} style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 13, fontWeight: 500, fontFamily: font,
                  background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)', color: '#F59E0B',
                }}>{kw}</span>
              ))}
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 12, fontFamily: font, color: secondaryText }}>
              Consider adding these keywords to strengthen your CV
            </p>
            <Btn variant="secondary" isDark={isDark} fullWidth style={{ marginTop: 12 }}
              icon={<ArrowRight size={14} />}
              disabled={!generatedCv}
              onClick={() => generatedCv && navigate(`/cv-editor/${generatedCv.id}`)}
            >Edit CV</Btn>
          </div>
        )}

        {/* Re-analyse */}
        <Btn variant="ghost" isDark={isDark} fullWidth icon={<RefreshCw size={14} />} onClick={handleRunAnalysis}>
          Re-analyse Application
        </Btn>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CV TAB
   ═══════════════════════════════════════════════════════════════ */
function CvTabContent({ app, generatedCv, isDark }: { app: AppData; generatedCv: GeneratedCv | null; isDark: boolean }) {
  const navigate = useNavigate();
  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';

  if (!generatedCv) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ ...surfaceCard(isDark), textAlign: 'center' as const, padding: 48, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 12 }}>
          <FileText size={48} color={isDark ? '#64748B' : '#94A3B8'} strokeWidth={1.5} />
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: font, color: primaryText }}>No CV generated yet</h3>
          <p style={{ margin: 0, fontSize: 14, fontFamily: font, color: secondaryText, lineHeight: 1.5 }}>Generate a tailored CV for this application</p>
          <Btn variant="primary" isDark={isDark} icon={<ArrowRight size={14} />} onClick={() => navigate('/new-application')}>Generate CV</Btn>
        </div>
      </div>
    );
  }

  const cv = generatedCv.cv_json || {};
  const matchScore = generatedCv.match_score;
  const skills: string[] = cv.skills || cv.key_skills || [];
  const experience: any[] = cv.experience || cv.work_history || [];
  const education: any[] = cv.education || [];

  const handleDownload = async () => {
    try {
      await downloadCvPdf(cv, generatedCv.template_id || 'clean');
    } catch { toast.error('Failed to download PDF'); }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Action bar */}
      <div className="adp-cv-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 600, fontFamily: font, color: primaryText }}>Tailored CV</span>
          {matchScore != null && (
            <span style={{
              padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, fontFamily: font,
              background: scoreColor(matchScore) + '20', color: scoreColor(matchScore),
            }}>{matchScore}% Match</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" isDark={isDark} icon={<ArrowRight size={14} />} onClick={() => navigate(`/cv-editor/${generatedCv.id}`)}>Edit CV</Btn>
          <Btn variant="primary" isDark={isDark} icon={<Download size={14} />} onClick={handleDownload}>Download PDF</Btn>
        </div>
      </div>

      {/* CV preview card */}
      <div style={surfaceCard(isDark)}>
        {cv.name && <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, fontFamily: font, color: primaryText }}>{cv.name}</h2>}
        {(cv.email || cv.phone || cv.location) && (
          <p style={{ margin: '0 0 4px', fontSize: 13, fontFamily: font, color: secondaryText }}>
            {[cv.email, cv.phone, cv.location].filter(Boolean).join(' · ')}
          </p>
        )}
        {(cv.linkedin || cv.portfolio) && (
          <p style={{ margin: '0 0 0', fontSize: 13, fontFamily: font }}>
            {cv.linkedin && <a href={cv.linkedin} target="_blank" rel="noopener noreferrer" style={{ color: '#1A56DB', marginRight: 12 }}>LinkedIn</a>}
            {cv.portfolio && <a href={cv.portfolio} target="_blank" rel="noopener noreferrer" style={{ color: '#1A56DB' }}>Portfolio</a>}
          </p>
        )}

        <div style={{ height: 1, background: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)', margin: '16px 0' }} />

        {cv.summary && (
          <>
            <span style={sectionLabel(isDark)}>Summary</span>
            <p style={{ margin: '0 0 16px', fontSize: 14, fontFamily: font, color: primaryText, lineHeight: 1.7 }}>{cv.summary}</p>
          </>
        )}

        {skills.length > 0 && (
          <>
            <div style={{ height: 1, background: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)', margin: '16px 0' }} />
            <span style={sectionLabel(isDark)}>Skills</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {skills.map((s: string, i: number) => (
                <span key={i} style={{
                  padding: '4px 12px', borderRadius: 999, fontSize: 13, fontFamily: font,
                  background: isDark ? '#263348' : '#F8FAFC', color: secondaryText,
                  border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.2)'}`,
                }}>{s}</span>
              ))}
            </div>
          </>
        )}

        {experience.length > 0 && (
          <>
            <div style={{ height: 1, background: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)', margin: '16px 0' }} />
            <span style={sectionLabel(isDark)}>Experience</span>
            {experience.slice(0, 3).map((exp: any, i: number) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 15, fontWeight: 600, fontFamily: font, color: primaryText, display: 'block' }}>{exp.title || exp.role}</span>
                <span style={{ fontSize: 13, fontFamily: font, color: secondaryText, display: 'block', marginTop: 2 }}>
                  {exp.company}{exp.dates ? ` · ${exp.dates}` : ''}
                </span>
                {(exp.bullets || exp.achievements || []).length > 0 && (
                  <div style={{ borderLeft: '2px solid rgba(26,86,219,0.3)', paddingLeft: 12, marginLeft: 4, marginTop: 8 }}>
                    {(exp.bullets || exp.achievements || []).map((b: string, j: number) => (
                      <p key={j} style={{ margin: '0 0 4px', fontSize: 13, fontFamily: font, color: primaryText, lineHeight: 1.6 }}>{b}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {education.length > 0 && (
          <>
            <div style={{ height: 1, background: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)', margin: '16px 0' }} />
            <span style={sectionLabel(isDark)}>Education</span>
            {education.map((ed: any, i: number) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, fontFamily: font, color: primaryText, display: 'block' }}>{ed.institution}</span>
                <span style={{ fontSize: 13, fontFamily: font, color: secondaryText }}>{ed.qualification || ed.degree}{ed.dates ? ` · ${ed.dates}` : ''}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   COVER LETTER TAB
   ═══════════════════════════════════════════════════════════════ */
function CoverLetterTabContent({ app, generatedCv, coverLetter, setCoverLetter, isDark }: {
  app: AppData; generatedCv: GeneratedCv | null;
  coverLetter: CoverLetterData | null;
  setCoverLetter: React.Dispatch<React.SetStateAction<CoverLetterData | null>>;
  isDark: boolean;
}) {
  const navigate = useNavigate();
  const { planTier } = useUserPlan();
  const isPro = planTier === 'pro';
  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';

  // Gate: free users see upgrade prompt instead of cover letter content
  if (!isPro) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
        <div style={{
          maxWidth: 480, width: '100%', padding: 40, borderRadius: 12,
          background: isDark ? 'rgba(30,41,59,0.6)' : 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
          boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(15,23,42,0.08)',
          display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
        }}>
          <Lock size={32} color="#1A56DB" style={{ marginBottom: 16 }} />
          <h3 style={{
            margin: '0 0 8px', fontSize: 20, fontWeight: 600, fontFamily: font,
            color: primaryText, textAlign: 'center' as const,
          }}>Cover Letters are a Pro feature</h3>
          <p style={{
            margin: '0 0 24px', fontSize: 14, fontFamily: font,
            color: secondaryText, textAlign: 'center' as const, lineHeight: 1.6,
          }}>
            Upgrade to Pro to generate tailored cover letters that address your CV gaps and make a strong first impression.
          </p>
          <div style={{ alignSelf: 'stretch', marginBottom: 24 }}>
            {[
              'AI-written cover letters tailored to each job',
              'Automatically addresses your CV gaps',
              'Multiple tone options (professional, confident, conversational)',
            ].map((text, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < 2 ? 8 : 0 }}>
                <Check size={14} color="#10B981" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontFamily: font, color: primaryText }}>{text}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate('/billing')}
            style={{
              width: '100%', height: 44, borderRadius: 8, border: 'none',
              background: '#1A56DB', color: '#FFF', cursor: 'pointer',
              fontSize: 14, fontWeight: 600, fontFamily: font,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1E40AF'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1A56DB'; }}
          >
            Upgrade to Pro →
          </button>
          <p style={{
            margin: '8px 0 0', fontSize: 12, fontFamily: font,
            color: secondaryText, textAlign: 'center' as const,
          }}>£9/mo or £6.60/mo billed annually</p>
        </div>
      </div>
    );
  }
  const [selectedTone, setSelectedTone] = useState<Tone>('professional');
  const [generating, setGenerating] = useState(false);
  const [editContent, setEditContent] = useState(coverLetter?.content || '');
  const [regenOpen, setRegenOpen] = useState(false);
  const regenRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => { if (coverLetter) setEditContent(coverLetter.content); }, [coverLetter]);

  useEffect(() => {
    if (!regenOpen) return;
    const h = (e: MouseEvent) => { if (regenRef.current && !regenRef.current.contains(e.target as Node)) setRegenOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [regenOpen]);

  const generateCL = async (tone: Tone) => {
    if (!generatedCv) { toast.error('Generate a CV for this application first'); return; }
    setGenerating(true);
    setRegenOpen(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Please log in'); setGenerating(false); return; }
      const res = await apiFetch('/make-server-3bbff5cf/generate-cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: app.id, generated_cv_id: generatedCv.id, tone }),
      });
      const result = await res.json();
      if (result.success) {
        setCoverLetter({ id: result.cover_letter_id || '', content: result.content, tone, pdf_url: null, updated_at: new Date().toISOString() });
        setEditContent(result.content);
        toast.success('Cover letter generated');
      } else { toast.error('Failed to generate cover letter'); }
    } catch { toast.error('Failed to generate cover letter'); }
    finally { setGenerating(false); }
  };

  const handleEditChange = (val: string) => {
    setEditContent(val);
    if (saveRef.current) clearTimeout(saveRef.current);
    setSaveState('idle');
    saveRef.current = setTimeout(async () => {
      if (!coverLetter) return;
      setSaveState('saving');
      try {
        const res = await apiFetch('/make-server-3bbff5cf/save-cover-letter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cover_letter_id: coverLetter.id, application_id: app.id, content: val }),
        });
        const result = await res.json();
        if (!result.success) { toast.error('Failed to save'); setSaveState('idle'); }
        else {
          setCoverLetter(prev => prev ? { ...prev, content: val } : prev);
          setSaveState('saved');
          setTimeout(() => setSaveState('idle'), 1500);
        }
      } catch { toast.error('Failed to save'); setSaveState('idle'); }
    }, 800);
  };

  useEffect(() => { return () => { if (saveRef.current) clearTimeout(saveRef.current); }; }, []);

  const handleDownload = async () => {
    try {
      const name = generatedCv?.cv_json?.name || '';
      await downloadCoverLetterPdf(coverLetter?.content || editContent, name, `${app.job_title} - Cover Letter.pdf`);
    } catch { toast.error('Failed to download PDF'); }
  };

  const tones: Tone[] = ['professional', 'conversational', 'confident'];
  const toneLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  // No cover letter
  if (!coverLetter) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ ...surfaceCard(isDark), textAlign: 'center' as const, padding: 48, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 16 }}>
          <Mail size={48} color={isDark ? '#64748B' : '#94A3B8'} strokeWidth={1.5} />
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: font, color: primaryText }}>No cover letter yet</h3>
          <p style={{ margin: 0, fontSize: 14, fontFamily: font, color: secondaryText, lineHeight: 1.5 }}>Generate a cover letter tailored to this role</p>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {tones.map(t => (
              <button key={t} onClick={() => setSelectedTone(t)} style={{
                height: 34, padding: '0 16px', borderRadius: 999, fontSize: 13, fontWeight: 500, fontFamily: font,
                cursor: 'pointer', border: t === selectedTone ? 'none' : `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
                background: t === selectedTone ? '#1A56DB' : (isDark ? '#1E293B' : '#FFFFFF'),
                color: t === selectedTone ? '#FFF' : secondaryText,
                transition: 'all 0.15s',
              }}>{toneLabel(t)}</button>
            ))}
          </div>

          <Btn variant="primary" isDark={isDark} disabled={generating}
            onClick={() => generateCL(selectedTone)}
            icon={generating ? <RefreshCw size={14} className="adp-spin" /> : undefined}
          >{generating ? 'Generating…' : 'Generate Cover Letter'}</Btn>
        </div>
      </div>
    );
  }

  // Cover letter exists
  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Action bar */}
      <div className="adp-cv-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <span style={{
          padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 500, fontFamily: font,
          background: isDark ? '#263348' : '#F8FAFC', color: secondaryText,
          border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.2)'}`,
        }}>{toneLabel(coverLetter.tone || 'professional')}</span>
        <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
          <div ref={regenRef} style={{ position: 'relative' }}>
            <Btn variant="ghost" isDark={isDark} icon={<RefreshCw size={14} />} onClick={() => setRegenOpen(v => !v)}>
              Regenerate
            </Btn>
            {regenOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0, minWidth: 180, zIndex: 10,
                background: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(248,250,252,0.98)',
                backdropFilter: 'blur(20px)', borderRadius: 10, padding: 4,
                border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
                boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(15,23,42,0.12)',
              }}>
                {tones.map(t => (
                  <button key={t} onClick={() => generateCL(t)} style={{
                    display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left' as const,
                    background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer',
                    fontSize: 13, fontFamily: font, color: primaryText,
                    transition: 'background 0.12s',
                  }} onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)'}
                     onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    {toneLabel(t)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Btn variant="primary" isDark={isDark} icon={<Download size={14} />} onClick={handleDownload}>Download PDF</Btn>
        </div>
      </div>

      {/* Preview */}
      <div style={surfaceCard(isDark)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          {generatedCv?.cv_json?.name && <span style={{ fontSize: 16, fontWeight: 700, fontFamily: font, color: primaryText }}>{generatedCv.cv_json.name}</span>}
          <span style={{ fontSize: 13, fontFamily: font, color: secondaryText }}>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
        <div style={{ height: 1, background: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)', marginBottom: 16 }} />
        <div style={{ fontSize: 14, fontFamily: font, color: primaryText, lineHeight: 1.9, whiteSpace: 'pre-wrap' as const }}>{editContent}</div>
      </div>

      {/* Editable textarea */}
      <div style={{ marginTop: 24, position: 'relative' }}>
        <span style={sectionLabel(isDark)}>Edit Letter</span>
        <textarea value={editContent} onChange={e => handleEditChange(e.target.value)}
          style={{
            ...inputStyle(isDark), height: 'auto', minHeight: 300, padding: 16,
            resize: 'vertical' as const, lineHeight: 1.7, fontSize: 14,
          }}
          onFocus={focusRing as any} onBlur={blurRing(isDark) as any}
        />
        {saveState === 'saved' && (
          <span style={{ position: 'absolute', bottom: 12, right: 14, fontSize: 12, fontWeight: 500, fontFamily: font, color: '#10B981', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Check size={12} /> Saved
          </span>
        )}
        {saveState === 'saving' && (
          <span style={{ position: 'absolute', bottom: 12, right: 14, fontSize: 12, fontWeight: 500, fontFamily: font, color: secondaryText }}>Saving…</span>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NOTES TAB
   ═══════════════════════════════════════════════════════════════ */
function NotesTabContent({ app, initialNotes, isDark }: {
  app: AppData; initialNotes: NotesData | null; isDark: boolean;
}) {
  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const [interviewDate, setInterviewDate] = useState(initialNotes?.interview_date || '');
  const [interviewType, setInterviewType] = useState(initialNotes?.interview_type || '');
  const [outcome, setOutcome] = useState(initialNotes?.outcome || '');
  const [notes, setNotes] = useState(initialNotes?.notes_text || '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const saveToDb = async (n: string, d: string, t: string, o: string) => {
    setSaveState('saving');
    try {
      const res = await apiFetch('/make-server-3bbff5cf/save-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: app.id, notes_text: n, interview_date: d || null, interview_type: t || null, outcome: o || null }),
      });
      const result = await res.json();
      if (!result.success) { toast.error('Failed to save notes'); setSaveState('idle'); }
      else { setSaveState('saved'); setTimeout(() => setSaveState('idle'), 1500); }
    } catch { toast.error('Failed to save notes'); setSaveState('idle'); }
  };

  const handleBlur = () => saveToDb(notes, interviewDate, interviewType, outcome);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ ...surfaceCard(isDark), position: 'relative' }}>
        <span style={sectionLabel(isDark)}>Interview Details</span>
        <div className="adp-notes-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ ...sectionLabel(isDark), fontSize: 11, marginBottom: 6 }}>Interview Date</label>
            <input type="date" value={interviewDate}
              onChange={e => setInterviewDate(e.target.value)}
              style={inputStyle(isDark)} onFocus={focusRing} onBlur={e => { blurRing(isDark)(e); handleBlur(); }} />
          </div>
          <div>
            <label style={{ ...sectionLabel(isDark), fontSize: 11, marginBottom: 6 }}>Interview Type</label>
            <select value={interviewType}
              onChange={e => setInterviewType(e.target.value)}
              style={{ ...inputStyle(isDark), appearance: 'none' as const, cursor: 'pointer', paddingRight: 32 }}
              onFocus={focusRing as any} onBlur={e => { (blurRing(isDark) as any)(e); handleBlur(); }}>
              <option value="">Select type</option>
              <option value="phone">Phone</option>
              <option value="video">Video</option>
              <option value="in-person">In-Person</option>
              <option value="assessment">Assessment Centre</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <span style={sectionLabel(isDark)}>Outcome</span>
          <input type="text" value={outcome}
            onChange={e => setOutcome(e.target.value)}
            placeholder="e.g. Positive, awaiting feedback…"
            style={inputStyle(isDark)} onFocus={focusRing} onBlur={e => { blurRing(isDark)(e); handleBlur(); }} />
        </div>

        <div style={{ marginTop: 16 }}>
          <span style={sectionLabel(isDark)}>Notes</span>
          <textarea value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Interview prep notes, questions asked, feedback received…"
            style={{ ...inputStyle(isDark), height: 'auto', minHeight: 220, padding: 12, resize: 'vertical' as const, lineHeight: 1.6 }}
            onFocus={focusRing as any} onBlur={e => { (blurRing(isDark) as any)(e); handleBlur(); }} />
        </div>

        {saveState !== 'idle' && (
          <span style={{
            position: 'absolute', bottom: 16, right: 20,
            fontSize: 12, fontWeight: 500, fontFamily: font, display: 'flex', alignItems: 'center', gap: 4,
            color: saveState === 'saved' ? '#10B981' : secondaryText,
          }}>
            {saveState === 'saved' ? <><Check size={12} /> Saved</> : 'Saving…'}
          </span>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { planTier } = useUserPlan();

  const [theme, setTheme] = useState<Theme>(() =>
    (typeof window !== 'undefined' && (localStorage.getItem('applyly-theme') as Theme)) || 'light',
  );
  const isDark = theme === 'dark';
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('applyly-theme', theme);
  }, [theme]);

  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)';

  /* ─── Data state ───────────────────────────────────────────── */
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [app, setApp] = useState<AppData | null>(null);
  const [generatedCv, setGeneratedCv] = useState<GeneratedCv | null>(null);
  const [coverLetter, setCoverLetter] = useState<CoverLetterData | null>(null);
  const [notesData, setNotesData] = useState<NotesData | null>(null);
  const [feedback, setFeedback] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  /* ─── Tab state ────────────────────────────────────────────── */
  const tabParam = (searchParams.get('tab') || 'overview') as TabKey;
  const validTab = TABS.some(t => t.key === tabParam) ? tabParam : 'overview';
  const [activeTab, setActiveTab] = useState<TabKey>(validTab);
  const [tabFade, setTabFade] = useState(false);

  const switchTab = useCallback((tab: TabKey) => {
    if (tab === activeTab) return;
    setTabFade(true);
    setTimeout(() => {
      setActiveTab(tab);
      setSearchParams({ tab }, { replace: true });
      setTabFade(false);
    }, 100);
  }, [activeTab, setSearchParams]);

  /* ─── Run analysis (page-level, for auto-trigger + re-analyse) */
  const runAnalysis = useCallback(async (cvId: string) => {
    if (!id) return;
    setAnalysisLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to analyse your application');
        setAnalysisLoading(false);
        return;
      }

      const response = await apiFetch(
        '/make-server-3bbff5cf/analyse-application',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id: id,
            generated_cv_id: cvId,
          }),
        }
      );

      const result = await response.json();
      if (result.success && result.feedback) {
        setFeedback(result.feedback);
        setGeneratedCv(prev => prev ? {
          ...prev,
          feedback_json: result.feedback,
          match_score: result.feedback.overall_score,
        } : prev);
        toast.success('Analysis complete');
      } else {
        console.error('Analysis failed:', result.error);
        toast.error(result.error || 'Analysis failed. Please try again.');
      }
    } catch (e) {
      console.error('Analysis error:', e);
      toast.error('Failed to analyse application. Please try again.');
    } finally {
      setAnalysisLoading(false);
    }
  }, [id]);

  /* ─── Fetch data ───────────────────────────────────────────── */
  // Uses server endpoint that checks BOTH Supabase tables AND kv_store
  // fallbacks. This fixes the bug where data saved to kv_store (when
  // generated_cvs / cover_letters tables don't exist) was invisible.
  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(
          `/make-server-3bbff5cf/application-data/${id}`,
        );

        if (!res.ok) {
          console.error('Failed to fetch application data:', res.status);
          setLoadError(true);
          setLoading(false);
          return;
        }

        const result = await res.json();

        if (!result.success || !result.application) {
          console.error('Application data error:', result.error);
          setLoadError(true);
          setLoading(false);
          return;
        }

        setApp(result.application as AppData);
        setGeneratedCv(result.generated_cv as GeneratedCv | null ?? null);
        setCoverLetter(result.cover_letter as CoverLetterData | null ?? null);
        setNotesData(result.notes as NotesData | null ?? null);
        setLoading(false);

        console.log('Application data loaded — cv:', !!result.generated_cv, 'cl:', !!result.cover_letter, 'notes:', !!result.notes);

        // If CV exists and feedback_json is null, auto-trigger analysis
        if (result.generated_cv && !result.generated_cv.feedback_json) {
          runAnalysis(result.generated_cv.id);
        }

        // If CV exists and feedback_json already exists, load directly
        if (result.generated_cv?.feedback_json) {
          setFeedback(result.generated_cv.feedback_json);
        }
      } catch (e) {
        console.error('Error fetching application data:', e);
        setLoadError(true);
        setLoading(false);
      }
    })();
  }, [id, runAnalysis]);

  /* ─── Inline editing for title/company ──────────────────────── */
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingCompany, setEditingCompany] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [companyDraft, setCompanyDraft] = useState('');

  const saveInlineField = async (field: 'job_title' | 'company', value: string, original: string) => {
    if (!app || !value.trim() || value.trim() === original) {
      if (field === 'job_title') setEditingTitle(false);
      else setEditingCompany(false);
      return;
    }
    const trimmed = value.trim();
    // Optimistic update
    setApp(prev => prev ? { ...prev, [field]: trimmed } : prev);
    if (field === 'job_title') setEditingTitle(false);
    else setEditingCompany(false);

    const { error } = await supabase.from('applications').update({ [field]: trimmed }).eq('id', app.id);
    if (error) {
      toast.error(`Failed to update ${field === 'job_title' ? 'job title' : 'company name'}`);
      setApp(prev => prev ? { ...prev, [field]: original } : prev);
    }
  };

  /* ─── Status change ────────────────────────────────────────── */
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!statusOpen) return;
    const h = (e: MouseEvent) => { if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [statusOpen]);

  const handleStatusChange = async (status: StatusKey) => {
    if (!app) return;
    setApp(prev => prev ? { ...prev, status } : prev);
    setStatusOpen(false);
    const { error } = await supabase.from('applications').update({ status }).eq('id', app.id);
    if (error) toast.error('Failed to update status');
  };

  /* ─── Render ───────────────────────────────────────────────── */
  return (
    <div style={{
      fontFamily: font, minHeight: '100vh',
      background: isDark
        ? 'radial-gradient(ellipse at 30% 20%, #1E293B 0%, #0F172A 60%)'
        : 'radial-gradient(ellipse at 30% 20%, #EFF6FF 0%, #F1F5F9 70%)',
      color: primaryText, transition: 'background 0.2s, color 0.2s',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Grid bg */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M40 0H0v1h40V0zM0 0v40h1V0H0z' fill='%23${isDark ? 'ffffff' : '000000'}'/%3E%3C/svg%3E")`,
        backgroundSize: '40px 40px',
      }} />

      <SharedNavbar isDark={isDark} onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />

      <div style={{ flex: 1, padding: '0 24px', maxWidth: 1280, width: '100%', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* Loading */}
        {loading && <Skeleton isDark={isDark} />}

        {/* Not found */}
        {!loading && (!app || loadError) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, fontFamily: font, color: primaryText }}>Application not found</h2>
            <p style={{ margin: 0, fontSize: 14, fontFamily: font, color: secondaryText }}>This application may have been deleted.</p>
            <Btn variant="primary" isDark={isDark} icon={<ChevronLeft size={14} />} onClick={() => navigate('/applications')}>Back to Applications</Btn>
          </div>
        )}

        {/* Loaded */}
        {!loading && app && (
          <>
            {/* Breadcrumb */}
            <div style={{ paddingTop: 28 }}>
              <div style={{ fontSize: 13, fontFamily: font, color: secondaryText, display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => navigate('/applications')} style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontSize: 13, fontFamily: font, color: secondaryText,
                  textDecoration: 'none', transition: 'color 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; e.currentTarget.style.color = primaryText; }}
                  onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; e.currentTarget.style.color = secondaryText; }}
                >Applications</button>
                <span style={{ color: isDark ? '#475569' : '#CBD5E1' }}>/</span>
                <span style={{ color: primaryText, fontWeight: 500 }}>{app.job_title}</span>
              </div>
            </div>

            {/* Header */}
            <div className="adp-header" style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              marginTop: 8, flexWrap: 'wrap', gap: 12,
            }}>
              <div>
                {/* Job title — inline editable */}
                {editingTitle ? (
                  <input
                    autoFocus
                    defaultValue={app.job_title}
                    onChange={e => setTitleDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveInlineField('job_title', (e.target as HTMLInputElement).value, app.job_title);
                      if (e.key === 'Escape') setEditingTitle(false);
                    }}
                    onBlur={e => saveInlineField('job_title', e.target.value, app.job_title)}
                    style={{
                      background: 'transparent', border: 'none', borderBottom: '1px solid #1A56DB',
                      color: primaryText, fontSize: 28, fontWeight: 600, fontFamily: font,
                      padding: '0 2px', outline: 'none', width: 'auto', minWidth: 120, lineHeight: 1.3,
                    }}
                  />
                ) : (
                  <h1
                    className="adp-editable-row"
                    onClick={() => { setTitleDraft(app.job_title); setEditingTitle(true); }}
                    style={{ margin: 0, fontSize: 28, fontWeight: 600, fontFamily: font, color: primaryText, lineHeight: 1.3, cursor: 'text', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {app.job_title}
                    <Pencil size={13} className="adp-edit-icon" style={{ color: '#6B7280', opacity: 0.6, cursor: 'pointer', verticalAlign: 'middle', transition: 'opacity 0.15s', flexShrink: 0 }} />
                  </h1>
                )}

                {/* Company — inline editable */}
                {editingCompany ? (
                  <input
                    autoFocus
                    defaultValue={app.company}
                    onChange={e => setCompanyDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveInlineField('company', (e.target as HTMLInputElement).value, app.company);
                      if (e.key === 'Escape') setEditingCompany(false);
                    }}
                    onBlur={e => saveInlineField('company', e.target.value, app.company)}
                    style={{
                      background: 'transparent', border: 'none', borderBottom: '1px solid #1A56DB',
                      color: secondaryText, fontSize: 16, fontWeight: 400, fontFamily: font,
                      padding: '0 2px', outline: 'none', width: 'auto', minWidth: 120, marginTop: 4,
                    }}
                  />
                ) : (
                  <p
                    className="adp-editable-row"
                    onClick={() => { setCompanyDraft(app.company); setEditingCompany(true); }}
                    style={{ margin: '4px 0 0', fontSize: 16, fontFamily: font, color: secondaryText, cursor: 'text', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {app.company}
                    <Pencil size={13} className="adp-edit-icon" style={{ color: '#6B7280', opacity: 0.6, cursor: 'pointer', verticalAlign: 'middle', transition: 'opacity 0.15s', flexShrink: 0 }} />
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Status dropdown */}
                <div ref={statusRef} style={{ position: 'relative' }}>
                  <button onClick={() => setStatusOpen(v => !v)} style={{
                    display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px',
                    background: isDark ? '#1E293B' : '#FFFFFF',
                    border: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'}`,
                    borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: font,
                    color: primaryText, transition: 'border-color 0.15s',
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: (STATUS_CONFIG[app.status] || STATUS_CONFIG.saved).color }} />
                    {(STATUS_CONFIG[app.status] || STATUS_CONFIG.saved).label}
                    <ChevronDown size={14} style={{ color: secondaryText, transition: 'transform 0.2s', transform: statusOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
                  </button>
                  {statusOpen && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 4px)', right: 0, minWidth: 200, zIndex: 20,
                      background: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(248,250,252,0.98)',
                      backdropFilter: 'blur(20px)', borderRadius: 10, padding: 4,
                      border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
                      boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(15,23,42,0.12)',
                    }}>
                      {STATUS_ORDER.map(s => {
                        const cfg = STATUS_CONFIG[s];
                        const active = s === app.status;
                        return (
                          <button key={s} onClick={() => handleStatusChange(s)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px',
                              background: active ? (isDark ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.05)') : 'none',
                              border: 'none', borderRadius: 6, cursor: 'pointer',
                              color: primaryText, fontSize: 13, fontWeight: active ? 600 : 400, fontFamily: font,
                              textAlign: 'left', transition: 'background 0.12s',
                            }}
                            onMouseEnter={e => { if (!active) e.currentTarget.style.background = isDark ? 'rgba(148,163,184,0.06)' : 'rgba(15,23,42,0.03)'; }}
                            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'none'; }}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color }} />
                            {cfg.label}
                            {active && <Check size={14} style={{ marginLeft: 'auto', color: '#1A56DB' }} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <Btn variant="ghost" isDark={isDark} icon={<ChevronLeft size={14} />} onClick={() => navigate('/applications')}>Applications</Btn>
              </div>
            </div>

            {/* Tab bar */}
            <div style={{
              display: 'flex', alignItems: 'stretch', marginTop: 24,
              borderBottom: `1px solid ${borderColor}`,
              overflowX: 'auto', scrollbarWidth: 'none',
            }}>
              {TABS.map(tab => {
                const active = activeTab === tab.key;
                const showLock = tab.key === 'cover-letter' && planTier !== 'pro';
                return (
                  <TabBtn key={tab.key} label={tab.label} active={active} isDark={isDark}
                    onClick={() => switchTab(tab.key)} showLock={showLock} />
                );
              })}
            </div>

            {/* Tab content */}
            <div style={{
              paddingTop: 24, paddingBottom: 60,
              opacity: tabFade ? 0 : 1, transform: tabFade ? 'translateY(4px)' : 'translateY(0)',
              transition: 'opacity 0.15s ease, transform 0.15s ease',
            }}>
              {activeTab === 'overview' && <OverviewTab app={app} isDark={isDark} onStatusChange={handleStatusChange} />}
              {activeTab === 'feedback' && <FeedbackTab app={app} generatedCv={generatedCv} setGeneratedCv={setGeneratedCv} isDark={isDark} feedback={feedback} analysisLoading={analysisLoading} onRunAnalysis={runAnalysis} coverLetter={coverLetter} />}
              {activeTab === 'cv' && <CvTabContent app={app} generatedCv={generatedCv} isDark={isDark} />}
              {activeTab === 'cover-letter' && <CoverLetterTabContent app={app} generatedCv={generatedCv} coverLetter={coverLetter} setCoverLetter={setCoverLetter} isDark={isDark} />}
              {activeTab === 'interview-prep' && (
                <InterviewPrepTab
                  applicationId={app.id}
                  jobTitle={app.job_title}
                  hasGeneratedCv={!!generatedCv}
                  isDark={isDark}
                  onSwitchTab={(tab) => switchTab(tab as TabKey)}
                />
              )}
              {activeTab === 'notes' && <NotesTabContent app={app} initialNotes={notesData} isDark={isDark} />}
            </div>
          </>
        )}
      </div>

      <Toaster position="top-right" toastOptions={{ style: {
        fontFamily: font, fontSize: 14, borderRadius: 10,
        background: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)',
        color: primaryText, border: `1px solid ${borderColor}`, backdropFilter: 'blur(12px)',
      } }} />

      <style>{`
        * { box-sizing: border-box; }
        @keyframes adp-shimmer { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        .adp-shim { animation: adp-shimmer 1.2s ease-in-out infinite; }
        @keyframes adp-pulse { 0%, 100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
        @keyframes adp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .adp-spin { animation: adp-spin 1s linear infinite; }

        .adp-editable-row .adp-edit-icon { opacity: 0.4; }
        .adp-editable-row:hover .adp-edit-icon { opacity: 1; }

        @media (max-width: 767px) {
          .adp-two-col { flex-direction: column !important; }
          .adp-col-left, .adp-col-right { flex: 1 1 100% !important; }
          .adp-header { flex-direction: column !important; }
          .adp-cv-actions { flex-direction: column !important; }
          .adp-cv-actions > div { width: 100%; }
          .adp-notes-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

/* ─── Tab button ─────────────────────────────────────────────── */
function TabBtn({ label, active, isDark, onClick, showLock = false }: {
  label: string; active: boolean; isDark: boolean; onClick: () => void; showLock?: boolean;
}) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'none', border: 'none',
        borderBottom: active ? '2px solid #1A56DB' : '2px solid transparent',
        marginBottom: -1,
        height: 44, padding: '0 20px', cursor: 'pointer',
        fontSize: 14, fontWeight: 500, fontFamily: font,
        color: active ? (isDark ? '#F8FAFC' : '#0F172A') : h ? (isDark ? '#F8FAFC' : '#0F172A') : (isDark ? '#94A3B8' : '#64748B'),
        transition: 'color 0.15s, border-color 0.15s',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >{label}{showLock && <Lock size={11} style={{ opacity: 0.7 }} />}</button>
  );
}
