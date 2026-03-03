/**
 * ApplicationDetailDrawer — Screen 10: Application Detail Panel
 *
 * Side drawer (540px desktop) / full page (mobile).
 * Glass treatment, slide-in from right (240ms ease-out).
 * 5 tabs: Overview · Feedback · CV · Cover Letter · Notes
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  ChevronLeft, ChevronDown, ChevronUp, X, FileText, Download,
  ArrowRight, RefreshCw, Paperclip, Upload, Lock, Trash2,
  Phone, Video, Users, ClipboardList, Check, AlertTriangle,
  Sparkles, Brain, Target, Lightbulb, TrendingUp,
} from 'lucide-react';
import { useUserPlan } from '../lib/UserPlanContext';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'sonner';

/* ─── Types ──────────────────────────────────────────────────── */
type Theme = 'dark' | 'light';
type StatusKey =
  | 'saved'
  | 'applied'
  | 'interview_scheduled'
  | 'interview_done'
  | 'offer'
  | 'rejected';

type TabKey = 'overview' | 'feedback' | 'cv' | 'cover-letter' | 'notes';
type InterviewType = 'phone' | 'video' | 'in-person' | 'assessment';
type Tone = 'Professional' | 'Conversational' | 'Confident';

export interface AppDetailData {
  id: string;
  company: string;
  job_title: string;
  status: StatusKey;
  created_at: string;
  next_action_date: string | null;
  job_parsed_json: {
    location?: string;
    skills?: string[];
    requirements?: string[];
    summary?: string;
  } | null;
}

interface StatusConfig {
  label: string;
  color: string;
}

const STATUS_CONFIG: Record<StatusKey, StatusConfig> = {
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
  { key: 'overview', label: 'Overview' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'cv', label: 'CV' },
  { key: 'cover-letter', label: 'Cover Letter' },
  { key: 'notes', label: 'Notes' },
];

const font = 'Inter, sans-serif';
const SUPABASE_URL = 'https://hrexgjahkdjqxvulodqu.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyZXhnamFoa2RqcXh2dWxvZHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNzAzNjUsImV4cCI6MjA4Nzk0NjM2NX0.pkV8MPJYG-AyBPk5qG7iDJCT86aOzVKcti1wfygqpRM';

/* ─── Feedback types ─────────────────────────────────────────── */
interface FeedbackData {
  overall_score: number;
  verdict_summary: string;
  interview_likelihood: string;
  interview_likelihood_reasoning: string;
  cv_quality: {
    summary_quality: { score: number; feedback: string };
    bullet_strength: { score: number; feedback: string };
    keyword_match: { score: number; feedback: string };
  };
  strengths: { title: string; detail: string }[];
  weaknesses: { title: string; detail: string; fix: string }[];
  top_actions: { action: string; reason: string }[];
  missing_keywords: string[];
}

/* ─── Timeline Events ────────────────────────────────────────── */
interface TimelineEvent {
  id: string;
  status: StatusKey;
  date: string;
}

function generateTimeline(currentStatus: StatusKey, dateApplied: string): TimelineEvent[] {
  const idx = STATUS_ORDER.indexOf(currentStatus);
  const events: TimelineEvent[] = [];
  if (idx >= 0) events.push({ id: 'tl-0', status: 'saved', date: dateApplied });
  if (idx >= 1) events.push({ id: 'tl-1', status: 'applied', date: dateApplied });
  if (idx >= 2) events.push({ id: 'tl-2', status: 'interview_scheduled', date: dateApplied });
  if (idx >= 3) events.push({ id: 'tl-3', status: 'interview_done', date: dateApplied });
  if (idx >= 4) events.push({ id: 'tl-4', status: 'offer', date: dateApplied });
  if (currentStatus === 'rejected') events.push({ id: 'tl-r', status: 'rejected', date: dateApplied });
  return events.reverse();
}

function formatDateShort(iso: string) {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-GB', { month: 'short' });
  const yr = d.getFullYear();
  return `${day} ${mon} ${yr}`;
}

/* ─── Sub-components ─────────────────────────────────────────── */

function StatusBadge({ status, size = 'md' }: { status: StatusKey; size?: 'sm' | 'md' }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.saved;
  const bg = cfg.color + '26';
  return (
    <span style={{
      padding: size === 'sm' ? '2px 8px' : '4px 12px',
      borderRadius: 999,
      fontSize: size === 'sm' ? 11 : 12,
      fontWeight: 500,
      fontFamily: font,
      background: bg,
      color: cfg.color,
      border: `1px solid ${cfg.color}40`,
      lineHeight: 1.6,
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {cfg.label}
    </span>
  );
}

/* ─── Hover Button Helper ────────────────────────────────────── */
function DrawerButton({
  children, variant = 'secondary', fullWidth = false, disabled = false,
  onClick, isDark, icon, style: overrideStyle,
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  fullWidth?: boolean; disabled?: boolean;
  onClick?: () => void; isDark: boolean;
  icon?: React.ReactNode; style?: React.CSSProperties;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  let bg = 'none';
  let color = isDark ? '#F8FAFC' : '#0F172A';
  let border = `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)'}`;

  if (variant === 'primary') {
    bg = hovered ? '#1E40AF' : '#1A56DB';
    color = '#FFFFFF';
    border = 'none';
  } else if (variant === 'secondary') {
    bg = hovered ? (isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)') : 'none';
    color = '#1A56DB';
    border = `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)'}`;
  } else if (variant === 'ghost') {
    bg = hovered ? (isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)') : 'none';
    color = isDark ? '#94A3B8' : '#64748B';
    border = 'none';
  } else if (variant === 'destructive') {
    bg = hovered ? '#DC2626' : '#EF4444';
    color = '#FFFFFF';
    border = 'none';
  }

  if (disabled) {
    bg = isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)';
    color = isDark ? '#64748B' : '#94A3B8';
    border = 'none';
  }

  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => !disabled && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: 36, padding: '0 14px', background: bg, color, border,
        borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 13, fontWeight: 500, fontFamily: font, lineHeight: 1,
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s, transform 0.1s',
        width: fullWidth ? '100%' : 'auto',
        opacity: disabled ? 0.6 : 1,
        ...overrideStyle,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

/* ─── Overview Tab ───────────────────────────────────────────── */
function OverviewTab({
  app, isDark, onStatusChange,
}: {
  app: AppDetailData; isDark: boolean;
  onStatusChange: (status: StatusKey) => void;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [nextAction, setNextAction] = useState(app.next_action_date || '');
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  const jobSummary = app.job_parsed_json?.summary ||
    'No job description summary available. Parse the job listing to see key requirements here.';
  const skills = app.job_parsed_json?.skills || [];
  const requirements = app.job_parsed_json?.requirements || [];

  useEffect(() => {
    if (!statusOpen) return;
    const handler = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statusOpen]);

  // Save next action date
  const handleNextActionChange = async (val: string) => {
    setNextAction(val);
    const { error } = await supabase
      .from('applications')
      .update({ next_action_date: val || null })
      .eq('id', app.id);
    if (error) {
      console.error('Failed to update next action date:', error);
      toast.error('Failed to save next action date');
    }
  };

  const timeline = generateTimeline(app.status, formatDateShort(app.created_at));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Status updater */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 11, fontWeight: 500, fontFamily: font,
          letterSpacing: '0.05em', textTransform: 'uppercase',
          color: isDark ? '#94A3B8' : '#64748B',
        }}>Status</span>
        <div ref={statusRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setStatusOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              height: 36, padding: '0 12px',
              background: isDark ? '#1E293B' : '#FFFFFF',
              border: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'}`,
              borderRadius: 8, cursor: 'pointer',
              color: isDark ? '#F8FAFC' : '#0F172A',
              fontSize: 13, fontWeight: 500, fontFamily: font,
              transition: 'border-color 0.15s',
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: (STATUS_CONFIG[app.status] || STATUS_CONFIG.saved).color, flexShrink: 0,
            }} />
            {(STATUS_CONFIG[app.status] || STATUS_CONFIG.saved).label}
            <ChevronDown size={14} style={{
              transition: 'transform 0.2s',
              transform: statusOpen ? 'rotate(180deg)' : 'rotate(0)',
              color: isDark ? '#94A3B8' : '#64748B',
            }} />
          </button>

          {statusOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', right: 0,
              minWidth: 200, zIndex: 10,
              background: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(248,250,252,0.98)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
              borderRadius: 10, padding: 4,
              boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(15,23,42,0.12)',
            }}>
              {STATUS_ORDER.map(s => {
                const cfg = STATUS_CONFIG[s];
                const isActive = s === app.status;
                return (
                  <StatusDropdownItem
                    key={s}
                    label={cfg.label}
                    color={cfg.color}
                    isActive={isActive}
                    isDark={isDark}
                    onClick={() => { onStatusChange(s); setStatusOpen(false); }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Next action date */}
      <div>
        <label style={{
          fontSize: 11, fontWeight: 500, fontFamily: font,
          letterSpacing: '0.05em', textTransform: 'uppercase',
          color: isDark ? '#94A3B8' : '#64748B', display: 'block', marginBottom: 6,
        }}>Next Action Date</label>
        <input
          type="date"
          value={nextAction}
          onChange={e => handleNextActionChange(e.target.value)}
          style={{
            width: '100%', height: 44, padding: '0 12px', boxSizing: 'border-box',
            background: isDark ? '#1E293B' : '#FFFFFF',
            border: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'}`,
            borderRadius: 8, fontSize: 14, fontFamily: font, fontWeight: 400,
            color: isDark ? '#F8FAFC' : '#0F172A', outline: 'none',
            colorScheme: isDark ? 'dark' : 'light',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = '#1A56DB';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)';
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      </div>

      {/* Key Skills */}
      {skills.length > 0 && (
        <div>
          <span style={{
            fontSize: 11, fontWeight: 500, fontFamily: font,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            color: isDark ? '#94A3B8' : '#64748B', display: 'block', marginBottom: 8,
          }}>Key Skills</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {skills.map((s, i) => (
              <span key={i} style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, fontFamily: font,
                background: isDark ? '#263348' : '#F8FAFC',
                color: isDark ? '#94A3B8' : '#64748B',
                border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.2)'}`,
              }}>{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Requirements */}
      {requirements.length > 0 && (
        <div>
          <span style={{
            fontSize: 11, fontWeight: 500, fontFamily: font,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            color: isDark ? '#94A3B8' : '#64748B', display: 'block', marginBottom: 8,
          }}>Top Requirements</span>
          <ul style={{
            margin: 0, paddingLeft: 16,
            fontSize: 13, fontFamily: font, color: isDark ? '#94A3B8' : '#64748B',
            lineHeight: 1.7,
          }}>
            {requirements.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Job summary */}
      <div>
        <button
          onClick={() => setSummaryExpanded(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontSize: 14, fontWeight: 600, fontFamily: font,
            color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.3,
          }}
        >
          Job Summary
          {summaryExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <div style={{
          marginTop: 8, fontSize: 14, fontFamily: font, fontWeight: 400,
          color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.6,
          maxHeight: summaryExpanded ? 500 : 60, overflow: 'hidden',
          transition: 'max-height 0.3s ease', position: 'relative',
        }}>
          {jobSummary}
          {!summaryExpanded && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: 32,
              background: `linear-gradient(transparent, ${isDark ? '#1E293B' : '#FFFFFF'})`,
            }} />
          )}
        </div>
        {!summaryExpanded && (
          <button onClick={() => setSummaryExpanded(true)} style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontSize: 13, fontWeight: 500, fontFamily: font, color: '#1A56DB', marginTop: 4,
          }}>Show more</button>
        )}
      </div>

      {/* Status timeline */}
      <div>
        <span style={{
          fontSize: 11, fontWeight: 500, fontFamily: font,
          letterSpacing: '0.05em', textTransform: 'uppercase',
          color: isDark ? '#94A3B8' : '#64748B', display: 'block', marginBottom: 12,
        }}>Timeline</span>
        <div style={{ position: 'relative', paddingLeft: 20 }}>
          <div style={{
            position: 'absolute', left: 4, top: 3, bottom: 3,
            width: 2, background: isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.3)',
            borderRadius: 1,
          }} />
          {timeline.map((ev, i) => {
            const cfg = STATUS_CONFIG[ev.status];
            return (
              <div key={ev.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                marginBottom: i < timeline.length - 1 ? 16 : 0, position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', left: -17, top: 4,
                  width: 8, height: 8, borderRadius: '50%',
                  background: cfg.color, flexShrink: 0,
                  border: `2px solid ${isDark ? '#0F172A' : '#F1F5F9'}`,
                  boxSizing: 'content-box',
                }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 500, fontFamily: font,
                    color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.3,
                  }}>{cfg.label}</span>
                  <span style={{
                    fontSize: 12, fontWeight: 400, fontFamily: font,
                    color: isDark ? '#64748B' : '#94A3B8', lineHeight: 1.3,
                  }}>{ev.date}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatusDropdownItem({
  label, color, isActive, isDark, onClick,
}: {
  label: string; color: string; isActive: boolean; isDark: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '8px 10px',
        background: isActive
          ? (isDark ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.05)')
          : hovered
          ? (isDark ? 'rgba(148,163,184,0.06)' : 'rgba(15,23,42,0.03)')
          : 'none',
        border: 'none', borderRadius: 6, cursor: 'pointer',
        color: isDark ? '#F8FAFC' : '#0F172A',
        fontSize: 13, fontWeight: isActive ? 600 : 400, fontFamily: font,
        textAlign: 'left', transition: 'background 0.12s', lineHeight: 1,
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
      }} />
      {label}
      {isActive && <Check size={14} style={{ marginLeft: 'auto', color: '#1A56DB' }} />}
    </button>
  );
}

/* ─── Score helpers ───────────────────────────────────────────── */
function scoreColor(score: number) {
  if (score >= 80) return '#10B981';
  if (score >= 60) return '#F59E0B';
  return '#EF4444';
}

function scoreVerdict(score: number) {
  if (score >= 90) return 'Strong Match';
  if (score >= 80) return 'Good Match';
  if (score >= 60) return 'Moderate Match';
  if (score >= 40) return 'Weak Match';
  return 'Poor Match';
}

function likelihoodStyle(likelihood: string) {
  const l = likelihood.toLowerCase();
  if (l.includes('likely') && !l.includes('unlikely')) return { color: '#10B981', bg: 'rgba(16,185,129,0.12)' };
  if (l.includes('possible')) return { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' };
  return { color: '#EF4444', bg: 'rgba(239,68,68,0.12)' };
}

/* ─── Feedback Tab ───────────────────────────────────────────── */
function FeedbackTab({ app, isDark }: { app: AppDetailData; isDark: boolean }) {
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCopy, setLoadingCopy] = useState('Reading the job requirements…');
  const [expandedBars, setExpandedBars] = useState<Record<string, boolean>>({});
  const [strengthsOpen, setStrengthsOpen] = useState(true);
  const [weaknessesOpen, setWeaknessesOpen] = useState(true);

  // Rotating copy
  useEffect(() => {
    if (!loading) return;
    const copies = [
      'Reading the job requirements…',
      'Reviewing your CV…',
      'Forming an honest opinion…',
      'Writing up feedback…',
    ];
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % copies.length;
      setLoadingCopy(copies[idx]);
    }, 1500);
    return () => clearInterval(interval);
  }, [loading]);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to analyse applications');
        setLoading(false);
        return;
      }

      // Get generated CV for this application
      const { data: cvData } = await supabase
        .from('generated_cvs')
        .select('id')
        .eq('application_id', app.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!cvData) {
        toast.error('Generate a CV for this application first');
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/analyse-application`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': ANON_KEY,
          },
          body: JSON.stringify({
            application_id: app.id,
            generated_cv_id: cvData.id,
          }),
        }
      );

      const result = await response.json();
      if (result.success && result.feedback) {
        setFeedback(result.feedback);
      } else {
        console.error('Analysis failed:', result);
        toast.error(result.error || 'Analysis failed. Please try again.');
      }
    } catch (err) {
      console.error('Analysis error:', err);
      toast.error('Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleBar = (key: string) => setExpandedBars(p => ({ ...p, [key]: !p[key] }));

  // Loading state
  if (loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 20, padding: '60px 24px', textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'rgba(26,86,219,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'jb-pulse 1.5s ease-in-out infinite',
        }}>
          <Brain size={28} color="#1A56DB" />
        </div>
        <p style={{
          margin: 0, fontSize: 15, fontWeight: 500, fontFamily: font,
          color: isDark ? '#F8FAFC' : '#0F172A',
        }}>{loadingCopy}</p>
        {/* Shimmer bars */}
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: '100%', height: 14, borderRadius: 7,
            background: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.05)',
          }} className="jb-fb-shimmer" />
        ))}
      </div>
    );
  }

  // Initial empty state
  if (!feedback) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 16, padding: '48px 24px', textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'rgba(26,86,219,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={28} color="#1A56DB" />
        </div>
        <h3 style={{
          margin: 0, fontSize: 17, fontWeight: 600, fontFamily: font,
          color: isDark ? '#F8FAFC' : '#0F172A',
        }}>Get AI Feedback</h3>
        <p style={{
          margin: 0, fontSize: 14, fontFamily: font, fontWeight: 400,
          color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.6, maxWidth: 320,
        }}>
          Find out how strong this application really is. Our AI analyses your CV against the job requirements and gives you honest, actionable feedback.
        </p>
        <DrawerButton variant="primary" isDark={isDark} onClick={runAnalysis} icon={<Sparkles size={14} />}>
          Analyse Application
        </DrawerButton>
      </div>
    );
  }

  // ─── Feedback loaded ───
  const sc = scoreColor(feedback.overall_score);
  const lk = likelihoodStyle(feedback.interview_likelihood);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Section 1: Score */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          border: `4px solid ${sc}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column',
        }}>
          <span style={{
            fontSize: 32, fontWeight: 700, fontFamily: font, color: sc, lineHeight: 1,
          }}>{feedback.overall_score}</span>
        </div>
        <span style={{
          fontSize: 15, fontWeight: 600, fontFamily: font,
          color: isDark ? '#F8FAFC' : '#0F172A',
        }}>{scoreVerdict(feedback.overall_score)}</span>
        <p style={{
          margin: 0, fontSize: 13, fontFamily: font, fontWeight: 400,
          color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.5, textAlign: 'center', maxWidth: 360,
        }}>{feedback.verdict_summary}</p>

        {/* Interview likelihood */}
        <div style={{ position: 'relative' }}>
          <span title={feedback.interview_likelihood_reasoning} style={{
            padding: '4px 12px', borderRadius: 999,
            fontSize: 12, fontWeight: 500, fontFamily: font,
            background: lk.bg, color: lk.color, cursor: 'help',
          }}>{feedback.interview_likelihood}</span>
        </div>
      </div>

      {/* Section 2: CV Quality bars */}
      <div>
        <span style={{
          fontSize: 11, fontWeight: 500, fontFamily: font,
          letterSpacing: '0.05em', textTransform: 'uppercase',
          color: isDark ? '#94A3B8' : '#64748B', display: 'block', marginBottom: 10,
        }}>CV Quality</span>
        {(['summary_quality', 'bullet_strength', 'keyword_match'] as const).map(key => {
          const item = feedback.cv_quality[key];
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const barColor = scoreColor(item.score * 10);
          const expanded = expandedBars[key];
          return (
            <div key={key} style={{ marginBottom: 8 }}>
              <button onClick={() => toggleBar(key)} style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0',
                fontFamily: font, fontSize: 13, fontWeight: 500,
                color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1,
              }}>
                <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
                {/* Progress bar */}
                <div style={{
                  flex: 2, height: 6, borderRadius: 3,
                  background: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.15)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${item.score * 10}%`, height: '100%',
                    borderRadius: 3, background: barColor,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <span style={{
                  fontSize: 13, fontWeight: 600, fontFamily: font,
                  color: barColor, minWidth: 32, textAlign: 'right',
                }}>{item.score}/10</span>
              </button>
              {expanded && (
                <p style={{
                  margin: '4px 0 0', padding: '8px 12px', fontSize: 13, fontFamily: font,
                  color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.5,
                  background: isDark ? 'rgba(148,163,184,0.06)' : 'rgba(15,23,42,0.03)',
                  borderRadius: 8,
                }}>{item.feedback}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Section 3: Strengths */}
      <div>
        <button onClick={() => setStrengthsOpen(v => !v)} style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontSize: 14, fontWeight: 600, fontFamily: font,
          color: '#10B981', lineHeight: 1.3, marginBottom: 10,
        }}>
          <Check size={16} /> Strengths
          {strengthsOpen ? <ChevronUp size={14} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={14} style={{ marginLeft: 'auto' }} />}
        </button>
        {strengthsOpen && feedback.strengths.map((s, i) => (
          <div key={i} style={{
            padding: '10px 14px', marginBottom: 6, borderRadius: 8,
            background: isDark ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.04)',
            border: `1px solid rgba(16,185,129,0.15)`,
          }}>
            <span style={{
              fontSize: 13, fontWeight: 600, fontFamily: font,
              color: isDark ? '#F8FAFC' : '#0F172A', display: 'block', marginBottom: 2,
            }}>{s.title}</span>
            <span style={{
              fontSize: 13, fontFamily: font, fontWeight: 400,
              color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.5,
            }}>{s.detail}</span>
          </div>
        ))}
      </div>

      {/* Section 4: Weaknesses */}
      <div>
        <button onClick={() => setWeaknessesOpen(v => !v)} style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontSize: 14, fontWeight: 600, fontFamily: font,
          color: '#F59E0B', lineHeight: 1.3, marginBottom: 10,
        }}>
          <AlertTriangle size={16} /> Areas to Improve
          {weaknessesOpen ? <ChevronUp size={14} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={14} style={{ marginLeft: 'auto' }} />}
        </button>
        {weaknessesOpen && feedback.weaknesses.map((w, i) => (
          <div key={i} style={{
            padding: '10px 14px', marginBottom: 6, borderRadius: 8,
            background: isDark ? 'rgba(245,158,11,0.04)' : 'rgba(245,158,11,0.03)',
            border: `1px solid rgba(245,158,11,0.15)`,
          }}>
            <span style={{
              fontSize: 13, fontWeight: 600, fontFamily: font,
              color: isDark ? '#F8FAFC' : '#0F172A', display: 'block', marginBottom: 2,
            }}>{w.title}</span>
            <span style={{
              fontSize: 13, fontFamily: font, fontWeight: 400,
              color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.5,
              display: 'block', marginBottom: w.fix ? 6 : 0,
            }}>{w.detail}</span>
            {w.fix && (
              <div style={{
                padding: '8px 10px', borderRadius: 6,
                background: 'rgba(26,86,219,0.06)',
                border: '1px solid rgba(26,86,219,0.12)',
                fontSize: 12, fontFamily: font, color: '#3B82F6', lineHeight: 1.5,
              }}>
                <Lightbulb size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                Fix: {w.fix}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Section 5: Top Actions */}
      {feedback.top_actions.length > 0 && (
        <div>
          <span style={{
            fontSize: 11, fontWeight: 500, fontFamily: font,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            color: isDark ? '#94A3B8' : '#64748B', display: 'block', marginBottom: 10,
          }}>Top Actions to Improve</span>
          {feedback.top_actions.map((a, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, padding: '10px 14px', marginBottom: 6,
              borderRadius: 8,
              background: isDark ? 'rgba(148,163,184,0.04)' : 'rgba(15,23,42,0.02)',
              border: `1px solid ${isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)'}`,
            }}>
              <span style={{
                fontSize: 20, fontWeight: 700, fontFamily: font,
                color: '#1A56DB', lineHeight: 1, flexShrink: 0, width: 24,
              }}>{i + 1}</span>
              <div>
                <span style={{
                  fontSize: 13, fontWeight: 600, fontFamily: font,
                  color: isDark ? '#F8FAFC' : '#0F172A', display: 'block', marginBottom: 2,
                }}>{a.action}</span>
                <span style={{
                  fontSize: 12, fontFamily: font, fontWeight: 400,
                  color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.5,
                }}>{a.reason}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Section 6: Missing Keywords */}
      {feedback.missing_keywords.length > 0 && (
        <div>
          <span style={{
            fontSize: 11, fontWeight: 500, fontFamily: font,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            color: isDark ? '#94A3B8' : '#64748B', display: 'block', marginBottom: 8,
          }}>Missing Keywords</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {feedback.missing_keywords.map((kw, i) => (
              <span key={i} style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, fontFamily: font,
                background: 'rgba(245,158,11,0.15)', color: '#F59E0B',
                border: '1px solid rgba(245,158,11,0.3)',
              }}>{kw}</span>
            ))}
          </div>
          <p style={{
            margin: '0 0 8px', fontSize: 12, fontFamily: font,
            color: isDark ? '#94A3B8' : '#64748B',
          }}>Consider adding these to your CV</p>
          <DrawerButton variant="secondary" isDark={isDark}
            icon={<ArrowRight size={14} />}
            onClick={() => navigate(`/cv-editor`)}
          >Edit CV</DrawerButton>
        </div>
      )}

      {/* Re-analyse */}
      <DrawerButton variant="ghost" isDark={isDark} fullWidth
        icon={<RefreshCw size={14} />}
        onClick={runAnalysis}
      >Re-analyse</DrawerButton>
    </div>
  );
}

/* ─── CV Tab ─────────────────────────────────────────────────── */
function CvTab({ app, isDark }: { app: AppDetailData; isDark: boolean }) {
  const navigate = useNavigate();
  const [cvData, setCvData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('generated_cvs')
        .select('id, cv_json')
        .eq('application_id', app.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (!error && data) setCvData(data);
      setLoading(false);
    })();
  }, [app.id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '24px 0' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            height: 14, borderRadius: 7, width: `${70 - i * 15}%`,
            background: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.05)',
          }} className="jb-fb-shimmer" />
        ))}
      </div>
    );
  }

  if (!cvData) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 12, padding: '48px 24px', textAlign: 'center',
      }}>
        <FileText size={32} color={isDark ? '#64748B' : '#94A3B8'} strokeWidth={1.5} />
        <p style={{
          margin: 0, fontSize: 14, fontFamily: font, fontWeight: 400,
          color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.5,
        }}>No CV generated for this application yet</p>
        <DrawerButton variant="primary" isDark={isDark}
          icon={<ArrowRight size={14} />}
          onClick={() => navigate('/new-application')}
        >Generate CV</DrawerButton>
      </div>
    );
  }

  const cv = cvData.cv_json || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Mini CV Preview */}
      <div style={{
        background: '#FFFFFF', borderRadius: 8, padding: 24,
        border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.2)'}`,
        color: '#0F172A', fontSize: 11, fontFamily: font, lineHeight: 1.5,
        maxHeight: 360, overflow: 'hidden', position: 'relative',
      }}>
        {cv.name && <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{cv.name}</h3>}
        {cv.contact && <p style={{ margin: '0 0 8px', fontSize: 10, color: '#64748B' }}>{cv.contact}</p>}
        <div style={{ height: 1, background: '#E2E8F0', margin: '8px 0' }} />
        {cv.summary && (
          <>
            <h4 style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#334155' }}>
              Professional Summary
            </h4>
            <p style={{ margin: '0 0 8px', fontSize: 10, color: '#475569' }}>{cv.summary}</p>
          </>
        )}
        {cv.skills && cv.skills.length > 0 && (
          <>
            <h4 style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#334155' }}>Skills</h4>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
              {cv.skills.slice(0, 8).map((s: string, i: number) => (
                <span key={i} style={{
                  padding: '2px 6px', borderRadius: 4, fontSize: 9,
                  background: '#F1F5F9', color: '#475569',
                }}>{s}</span>
              ))}
            </div>
          </>
        )}
        {cv.experience && cv.experience.slice(0, 2).map((exp: any, i: number) => (
          <div key={i} style={{ marginBottom: 6 }}>
            <p style={{ margin: 0, fontSize: 10, color: '#475569' }}>
              <strong>{exp.title}</strong> · {exp.company} · {exp.dates}
            </p>
          </div>
        ))}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 48,
          background: 'linear-gradient(transparent, #FFFFFF)',
        }} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <DrawerButton variant="secondary" isDark={isDark}
          icon={<ArrowRight size={14} />} style={{ flex: 1 }}
          onClick={() => navigate(`/cv-editor/${cvData.id}`)}
        >Edit CV</DrawerButton>
        <DrawerButton variant="primary" isDark={isDark}
          icon={<Download size={14} />} style={{ flex: 1 }}
        >Download PDF</DrawerButton>
      </div>
    </div>
  );
}

/* ─── Cover Letter Tab ───────────────────────────────────────── */
function CoverLetterTab({ app, isDark }: { app: AppDetailData; isDark: boolean }) {
  const navigate = useNavigate();
  const { isFreeTier } = useUserPlan();
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedTone, setSelectedTone] = useState<Tone>('Professional');
  const tones: Tone[] = ['Professional', 'Conversational', 'Confident'];

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('cover_letters')
        .select('content')
        .eq('application_id', app.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      if (!error && data) setCoverLetter(data.content);
      setLoading(false);
    })();
  }, [app.id]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Please log in first'); setGenerating(false); return; }

      const { data: cvData } = await supabase
        .from('generated_cvs')
        .select('id')
        .eq('application_id', app.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!cvData) { toast.error('Generate a CV first'); setGenerating(false); return; }

      navigate(`/cover-letter/${app.id}/${cvData.id}?tone=${selectedTone.toLowerCase()}`);
    } catch (err) {
      toast.error('Something went wrong');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '24px 0' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            height: 14, borderRadius: 7, width: `${80 - i * 20}%`,
            background: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.05)',
          }} className="jb-fb-shimmer" />
        ))}
      </div>
    );
  }

  if (isFreeTier) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 16, padding: '40px 24px', textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Lock size={24} color={isDark ? '#64748B' : '#94A3B8'} />
        </div>
        <div>
          <p style={{
            margin: '0 0 4px', fontSize: 15, fontWeight: 600, fontFamily: font,
            color: isDark ? '#F8FAFC' : '#0F172A',
          }}>Cover Letters are a Pro feature</p>
          <p style={{
            margin: 0, fontSize: 13, fontFamily: font, fontWeight: 400,
            color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.5,
          }}>Upgrade to generate tailored cover letters for every application.</p>
        </div>
        <DrawerButton variant="primary" isDark={isDark} fullWidth>Upgrade to Pro</DrawerButton>
      </div>
    );
  }

  if (coverLetter) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <textarea
          readOnly
          value={coverLetter}
          style={{
            width: '100%', minHeight: 280, padding: 16, boxSizing: 'border-box',
            background: isDark ? '#1E293B' : '#FFFFFF',
            border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
            borderRadius: 8, fontSize: 13, fontFamily: font, fontWeight: 400,
            color: isDark ? '#F8FAFC' : '#0F172A', resize: 'vertical',
            lineHeight: 1.7, outline: 'none',
          }}
        />
        <DrawerButton variant="primary" isDark={isDark} fullWidth
          icon={<ArrowRight size={14} />}
          onClick={() => navigate(`/cover-letter/${app.id}`)}
        >Edit &amp; Download</DrawerButton>
      </div>
    );
  }

  // No cover letter
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 0' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        padding: '24px 0', textAlign: 'center',
      }}>
        <FileText size={28} color={isDark ? '#64748B' : '#94A3B8'} strokeWidth={1.5} />
        <p style={{
          margin: 0, fontSize: 14, fontFamily: font, fontWeight: 400,
          color: isDark ? '#94A3B8' : '#64748B',
        }}>No cover letter yet</p>
      </div>

      <div>
        <span style={{
          fontSize: 11, fontWeight: 500, fontFamily: font,
          letterSpacing: '0.05em', textTransform: 'uppercase',
          color: isDark ? '#94A3B8' : '#64748B', display: 'block', marginBottom: 8,
        }}>Tone</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {tones.map(t => (
            <TonePill key={t} label={t} isActive={t === selectedTone}
              isDark={isDark} onClick={() => setSelectedTone(t)} />
          ))}
        </div>
      </div>

      <DrawerButton variant="primary" isDark={isDark} fullWidth
        disabled={generating} onClick={handleGenerate}
      >{generating ? 'Opening editor…' : 'Generate Cover Letter'}</DrawerButton>
    </div>
  );
}

function TonePill({ label, isActive, isDark, onClick }: {
  label: string; isActive: boolean; isDark: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, height: 34, borderRadius: 8,
        background: isActive ? '#1A56DB'
          : hovered ? (isDark ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.04)')
          : isDark ? '#263348' : '#F8FAFC',
        color: isActive ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
        border: isActive ? 'none' : `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.2)'}`,
        fontSize: 12, fontWeight: 500, fontFamily: font,
        cursor: 'pointer', transition: 'all 0.15s', lineHeight: 1,
      }}
    >{label}</button>
  );
}

/* ─── Notes Tab ──────────────────────────────────────────────── */
function NotesTab({ app, isDark }: { app: AppDetailData; isDark: boolean }) {
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewType, setInterviewType] = useState<InterviewType>('video');
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch existing notes on mount
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('interview_notes')
        .select('*')
        .eq('application_id', app.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (!error && data) {
        setNotes(data.notes_text || '');
        setInterviewDate(data.interview_date || '');
        setInterviewType(data.interview_type || 'video');
        setOutcome(data.outcome || '');
      }
      setLoaded(true);
    })();
  }, [app.id]);

  const interviewTypes: { key: InterviewType; label: string; Icon: React.ElementType }[] = [
    { key: 'phone', label: 'Phone', Icon: Phone },
    { key: 'video', label: 'Video', Icon: Video },
    { key: 'in-person', label: 'In-Person', Icon: Users },
    { key: 'assessment', label: 'Assessment', Icon: ClipboardList },
  ];

  const saveToSupabase = useCallback(async (
    notesVal: string, dateVal: string, typeVal: InterviewType, outcomeVal: string,
  ) => {
    setSaveState('saving');
    const { error } = await supabase
      .from('interview_notes')
      .upsert({
        application_id: app.id,
        notes_text: notesVal,
        interview_date: dateVal || null,
        interview_type: typeVal,
        outcome: outcomeVal,
      }, { onConflict: 'application_id' });
    if (error) {
      console.error('Notes save error:', error);
      toast.error('Failed to save notes');
      setSaveState('idle');
    } else {
      setSaveState('saved');
    }
  }, [app.id]);

  const debounceSave = useCallback((
    notesVal: string, dateVal: string, typeVal: InterviewType, outcomeVal: string,
  ) => {
    setSaveState('idle');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveToSupabase(notesVal, dateVal, typeVal, outcomeVal);
    }, 1000);
  }, [saveToSupabase]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleNotesChange = (val: string) => {
    setNotes(val);
    debounceSave(val, interviewDate, interviewType, outcome);
  };

  const handleFieldBlur = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    saveToSupabase(notes, interviewDate, interviewType, outcome);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 44, padding: '0 12px', boxSizing: 'border-box',
    background: isDark ? '#1E293B' : '#FFFFFF',
    border: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'}`,
    borderRadius: 8, fontSize: 14, fontFamily: font, fontWeight: 400,
    color: isDark ? '#F8FAFC' : '#0F172A', outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };

  const focusHandler = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = '#1A56DB';
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)';
  };
  const blurHandler = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)';
    e.currentTarget.style.boxShadow = 'none';
    handleFieldBlur();
  };

  if (!loaded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '24px 0' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            height: 14, borderRadius: 7, width: `${60 + i * 10}%`,
            background: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.05)',
          }} className="jb-fb-shimmer" />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{
            fontSize: 11, fontWeight: 500, fontFamily: font,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            color: isDark ? '#94A3B8' : '#64748B', display: 'block', marginBottom: 6,
          }}>Interview Date</label>
          <input
            type="date"
            value={interviewDate}
            onChange={e => { setInterviewDate(e.target.value); }}
            style={{ ...inputStyle, colorScheme: isDark ? 'dark' : 'light' }}
            onFocus={focusHandler}
            onBlur={blurHandler}
          />
        </div>
        <div>
          <label style={{
            fontSize: 11, fontWeight: 500, fontFamily: font,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            color: isDark ? '#94A3B8' : '#64748B', display: 'block', marginBottom: 6,
          }}>Interview Type</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {interviewTypes.map(({ key, label, Icon }) => (
              <InterviewTypePill
                key={key} label={label} icon={<Icon size={13} />}
                isActive={interviewType === key} isDark={isDark}
                onClick={() => { setInterviewType(key); }}
              />
            ))}
          </div>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <label style={{
          fontSize: 11, fontWeight: 500, fontFamily: font,
          letterSpacing: '0.05em', textTransform: 'uppercase',
          color: isDark ? '#94A3B8' : '#64748B', display: 'block', marginBottom: 6,
        }}>Notes</label>
        <textarea
          value={notes}
          onChange={e => handleNotesChange(e.target.value)}
          placeholder="Interview prep, questions asked, feedback received..."
          style={{
            ...inputStyle,
            height: 'auto', minHeight: 200, padding: 12,
            resize: 'vertical', lineHeight: 1.6,
          }}
          onFocus={focusHandler as any}
          onBlur={blurHandler as any}
        />
        {saveState === 'saved' && (
          <span style={{
            position: 'absolute', bottom: 10, right: 12,
            fontSize: 12, fontWeight: 500, fontFamily: font,
            color: '#10B981', display: 'flex', alignItems: 'center', gap: 4,
          }}><Check size={12} /> Saved</span>
        )}
        {saveState === 'saving' && (
          <span style={{
            position: 'absolute', bottom: 10, right: 12,
            fontSize: 12, fontWeight: 500, fontFamily: font,
            color: isDark ? '#94A3B8' : '#64748B',
          }}>Saving…</span>
        )}
      </div>

      <div>
        <label style={{
          fontSize: 11, fontWeight: 500, fontFamily: font,
          letterSpacing: '0.05em', textTransform: 'uppercase',
          color: isDark ? '#94A3B8' : '#64748B', display: 'block', marginBottom: 6,
        }}>Outcome</label>
        <input
          type="text"
          value={outcome}
          onChange={e => setOutcome(e.target.value)}
          placeholder="e.g. Progressed to next round, Rejected, Awaiting feedback"
          style={inputStyle}
          onFocus={focusHandler}
          onBlur={blurHandler}
        />
      </div>
    </div>
  );
}

function InterviewTypePill({ label, icon, isActive, isDark, onClick }: {
  label: string; icon: React.ReactNode; isActive: boolean; isDark: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={label}
      title={label}
      style={{
        flex: 1, height: 44, borderRadius: 8,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        background: isActive ? '#1A56DB'
          : hovered ? (isDark ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.04)')
          : isDark ? '#1E293B' : '#FFFFFF',
        color: isActive ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
        border: isActive ? 'none' : `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'}`,
        fontSize: 10, fontWeight: 500, fontFamily: font,
        cursor: 'pointer', transition: 'all 0.15s', lineHeight: 1,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* ─── Main Drawer Component ──────────────────────────────────── */
export function ApplicationDetailDrawer({
  app,
  isDark,
  onClose,
  onStatusChange,
  defaultTab = 'overview',
}: {
  app: AppDetailData;
  isDark: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: StatusKey) => void;
  defaultTab?: TabKey;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
  const [isClosing, setIsClosing] = useState(false);
  const [tabFade, setTabFade] = useState(false);
  const [currentApp, setCurrentApp] = useState(app);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCurrentApp(app); }, [app]);
  useEffect(() => { setActiveTab(defaultTab); }, [defaultTab]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(onClose, 240);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

  const switchTab = useCallback((tab: TabKey) => {
    if (tab === activeTab) return;
    setTabFade(true);
    setTimeout(() => { setActiveTab(tab); setTabFade(false); }, 100);
  }, [activeTab]);

  const handleStatusChange = useCallback(async (status: StatusKey) => {
    setCurrentApp(prev => ({ ...prev, status }));
    onStatusChange(app.id, status);
    const { error } = await supabase
      .from('applications')
      .update({ status })
      .eq('id', app.id);
    if (error) {
      console.error('Failed to update status:', error);
      toast.error('Failed to update status');
    }
  }, [app.id, onStatusChange]);

  const DRAWER_WIDTH = 540;

  return (
    <>
      <div
        className="app-detail-overlay"
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.3)',
          opacity: isClosing ? 0 : 1,
          transition: 'opacity 240ms ease-out',
        }}
      />

      <div
        ref={drawerRef}
        className="app-detail-drawer"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: DRAWER_WIDTH, maxWidth: '100vw', zIndex: 501,
          background: isDark ? 'rgba(30,41,59,0.95)' : 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderLeft: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
          boxShadow: isDark ? '-8px 0 40px rgba(0,0,0,0.4)' : '-8px 0 40px rgba(15,23,42,0.1)',
          display: 'flex', flexDirection: 'column', fontFamily: font,
          transform: isClosing ? `translateX(${DRAWER_WIDTH}px)` : 'translateX(0)',
          transition: 'transform 240ms ease-out',
          animation: isClosing ? 'none' : 'app-drawer-slide-in 240ms ease-out',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '24px 24px 16px',
          borderBottom: `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)'}`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <DrawerCloseButton isDark={isDark} onClick={handleClose} />
            <StatusBadge status={currentApp.status} />
          </div>

          <h2 style={{
            margin: '0 0 2px', fontSize: 20, fontWeight: 700, fontFamily: font,
            color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.3,
          }}>{currentApp.job_title}</h2>
          <p style={{
            margin: '0 0 2px', fontSize: 14, fontWeight: 500, fontFamily: font,
            color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.4,
          }}>{currentApp.company}</p>
          <p style={{
            margin: 0, fontSize: 13, fontWeight: 400, fontFamily: font,
            color: isDark ? '#64748B' : '#94A3B8', lineHeight: 1.3,
          }}>Applied {formatDateShort(currentApp.created_at)}</p>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex', alignItems: 'stretch', padding: '0 24px',
          borderBottom: `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)'}`,
          flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none',
        }}>
          {TABS.map(tab => (
            <TabButton key={tab.key} label={tab.label}
              isActive={activeTab === tab.key} isDark={isDark}
              onClick={() => switchTab(tab.key)}
            />
          ))}
        </div>

        {/* Tab content */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: 24,
          opacity: tabFade ? 0 : 1, transition: 'opacity 100ms ease',
          scrollbarWidth: 'thin',
          scrollbarColor: isDark ? 'rgba(148,163,184,0.2) transparent' : 'rgba(148,163,184,0.15) transparent',
        }}>
          {activeTab === 'overview' && (
            <OverviewTab app={currentApp} isDark={isDark} onStatusChange={handleStatusChange} />
          )}
          {activeTab === 'feedback' && <FeedbackTab app={currentApp} isDark={isDark} />}
          {activeTab === 'cv' && <CvTab app={currentApp} isDark={isDark} />}
          {activeTab === 'cover-letter' && <CoverLetterTab app={currentApp} isDark={isDark} />}
          {activeTab === 'notes' && <NotesTab app={currentApp} isDark={isDark} />}
        </div>
      </div>

      <style>{`
        @keyframes app-drawer-slide-in {
          from { transform: translateX(${DRAWER_WIDTH}px); }
          to   { transform: translateX(0); }
        }
        @keyframes jb-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes jb-fb-shimmer-anim {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        .jb-fb-shimmer { animation: jb-fb-shimmer-anim 1.2s ease-in-out infinite; }

        .app-detail-drawer::-webkit-scrollbar { width: 4px; }
        .app-detail-drawer::-webkit-scrollbar-track { background: transparent; }
        .app-detail-drawer::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.2); border-radius: 2px; }

        @media (max-width: 767px) {
          .app-detail-drawer { width: 100vw !important; }
          .app-detail-overlay { display: none !important; }
        }
      `}</style>
    </>
  );
}

/* ─── Tab Button ─────────────────────────────────────────────── */
function TabButton({ label, isActive, isDark, onClick }: {
  label: string; isActive: boolean; isDark: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'none', border: 'none',
        borderBottom: isActive ? '2px solid #1A56DB' : '2px solid transparent',
        padding: '12px 14px', cursor: 'pointer',
        fontSize: 14, fontWeight: 500, fontFamily: font,
        color: isActive
          ? (isDark ? '#F8FAFC' : '#0F172A')
          : hovered
          ? (isDark ? '#F8FAFC' : '#0F172A')
          : isDark ? '#94A3B8' : '#64748B',
        transition: 'color 0.15s, border-color 0.15s',
        lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >{label}</button>
  );
}

/* ─── Close Button ──��───────────────────────────────────────── */
function DrawerCloseButton({ isDark, onClick }: { isDark: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      aria-label="Close drawer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: hovered ? (isDark ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.06)') : 'none',
        border: 'none', borderRadius: 8, cursor: 'pointer',
        color: isDark ? '#94A3B8' : '#64748B',
        padding: '6px 8px',
        fontSize: 13, fontWeight: 500, fontFamily: font,
        transition: 'background 0.15s, color 0.15s', lineHeight: 1,
      }}
    >
      <ChevronLeft size={16} />
    </button>
  );
}
