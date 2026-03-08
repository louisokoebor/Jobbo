import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  Sun, Moon, Upload, FileText, CheckCircle2, X, AlertTriangle,
  ChevronLeft, ArrowRight, Check, MapPin, Mail, Phone, Briefcase, GraduationCap, User,
} from 'lucide-react';
import { supabase, projectId, publicAnonKey } from '../lib/supabaseClient';

/* ─── Types ──────────────────────────────────────────────────── */
type Theme = 'dark' | 'light';

interface ParsedCV {
  name: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  skills: string[];
  experience: {
    title: string;
    company: string;
    dates: string;
    bullets: string[];
  }[];
  education: {
    institution: string;
    qualification: string;
    dates: string;
  }[];
  hasParsingWarning: boolean;
}

const SUPABASE_URL = `https://${projectId}.supabase.co`;

/* ─── Helper: get a valid session, retrying if needed ────────── */
async function getValidSession() {
  // First try: immediate
  let { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session;

  // Try refreshing
  const { data: refreshed } = await supabase.auth.refreshSession();
  if (refreshed.session?.access_token) return refreshed.session;

  // Last resort: poll for session (covers OAuth redirect race condition)
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return data.session;
  }

  return null;
}

/* ─── Helper: map server parsed_json to ParsedCV ─────────────── */
function mapServerResponseToParsedCV(parsed: Record<string, unknown>): ParsedCV {
  const skills = Array.isArray(parsed.skills) ? parsed.skills.filter((s: unknown) => typeof s === 'string') as string[] : [];
  const workHistory = Array.isArray(parsed.work_history) ? parsed.work_history : [];
  const education = Array.isArray(parsed.education) ? parsed.education : [];

  const experience = workHistory.map((w: Record<string, unknown>) => ({
    title: (w.title as string) || '',
    company: (w.company as string) || '',
    dates: [w.start_date, w.end_date].filter(Boolean).join(' – ') || (w.dates as string) || '',
    bullets: Array.isArray(w.bullets) ? w.bullets.filter((b: unknown) => typeof b === 'string') as string[] : [],
  }));

  const edu = education.map((e: Record<string, unknown>) => ({
    institution: (e.institution as string) || '',
    qualification: (e.qualification as string) || '',
    dates: (e.dates as string) || '',
  }));

  const name = (parsed.name as string) || '';
  const email = (parsed.email as string) || '';
  const phone = (parsed.phone as string) || '';
  const summary = (parsed.summary as string) || '';

  // Show warning if key fields are missing
  const hasParsingWarning = !name || !email || skills.length === 0 || experience.length === 0;

  return {
    name,
    email,
    phone,
    location: (parsed.location as string) || '',
    summary,
    skills,
    experience,
    education: edu,
    hasParsingWarning,
  };
}

/* ─── Utility ────────────────────────────────────────────────── */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isValidType(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.endsWith('.pdf') ||
    file.name.endsWith('.docx')
  );
}

/* ─── Sub-components ─────────────────────────────────────────── */

function ThemeToggleButton({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? (isDark ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.06)') : 'none',
        border: 'none', borderRadius: 8, cursor: 'pointer',
        color: isDark ? '#94A3B8' : '#64748B',
        padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s', lineHeight: 1,
      }}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

/* ── Progress Stepper ── */
const STEP_LABELS = ['Upload CV', 'Preview', 'Confirm'];

function ProgressStepper({ currentStep, isDark }: { currentStep: number; isDark: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, width: '100%', marginBottom: 40 }}>
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1;
        const isCompleted = currentStep > stepNum;
        const isActive = currentStep === stepNum;
        const isUpcoming = currentStep < stepNum;
        const isLast = i === STEP_LABELS.length - 1;

        return (
          <div key={stepNum} style={{ display: 'flex', alignItems: 'flex-start', flex: isLast ? 0 : 1, flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              {/* Circle */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {/* Pulse ring for active */}
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    inset: -5,
                    borderRadius: '50%',
                    border: '2px solid rgba(26,86,219,0.3)',
                    animation: 'jb-pulse 2s ease-in-out infinite',
                  }} />
                )}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: isCompleted || isActive
                      ? '#1A56DB'
                      : isDark ? '#1E293B' : '#E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: isUpcoming
                      ? `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'}`
                      : 'none',
                    transition: 'background 0.3s',
                    flexShrink: 0,
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  {isCompleted ? (
                    <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
                  ) : (
                    <span style={{
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: 'Inter, sans-serif',
                      color: isActive ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
                      lineHeight: 1,
                    }}>
                      {stepNum}
                    </span>
                  )}
                </div>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div style={{
                  flex: 1,
                  height: 2,
                  background: isCompleted ? '#1A56DB' : isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.3)',
                  marginLeft: 0,
                  transition: 'background 0.3s',
                }} />
              )}
            </div>

            {/* Label */}
            <span style={{
              marginTop: 8,
              fontSize: 12,
              fontWeight: 500,
              fontFamily: 'Inter, sans-serif',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: isActive || isCompleted
                ? isDark ? '#F8FAFC' : '#0F172A'
                : isDark ? '#94A3B8' : '#64748B',
              whiteSpace: 'nowrap',
              transition: 'color 0.2s',
              lineHeight: 1,
            }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Skeleton loader block ── */
function Skeleton({ width = '100%', height = 16, borderRadius = 6, style = {} }: {
  width?: string | number; height?: number; borderRadius?: number; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      width, height, borderRadius,
      background: 'linear-gradient(90deg, rgba(148,163,184,0.08) 0%, rgba(148,163,184,0.18) 50%, rgba(148,163,184,0.08) 100%)',
      backgroundSize: '200% 100%',
      animation: 'jb-shimmer 1.5s ease-in-out infinite',
      flexShrink: 0,
      ...style,
    }} />
  );
}

/* ── Section card wrapper ── */
function SectionCard({ isDark, children, style = {} }: { isDark: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: isDark ? '#1E293B' : '#FFFFFF',
      border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.2)'}`,
      borderRadius: 12,
      padding: '20px 24px',
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children, isDark }: { children: React.ReactNode; isDark: boolean }) {
  return (
    <p style={{
      fontSize: 11,
      fontWeight: 500,
      fontFamily: 'Inter, sans-serif',
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      color: isDark ? '#94A3B8' : '#64748B',
      margin: '0 0 14px',
      lineHeight: 1.4,
    }}>
      {children}
    </p>
  );
}

/* ── Step 2 skeleton ── */
function ParsedCVSkeleton({ isDark }: { isDark: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      {[1, 2, 3].map(i => (
        <SectionCard isDark={isDark} key={i}>
          <Skeleton height={12} width="35%" style={{ marginBottom: 16 }} />
          <Skeleton height={20} width="60%" style={{ marginBottom: 10 }} />
          <Skeleton height={13} width="80%" style={{ marginBottom: 6 }} />
          <Skeleton height={13} width="70%" />
        </SectionCard>
      ))}
    </div>
  );
}

/* ── Step 2: Parsed CV display ── */
function ParsedCVPreview({ data, isDark }: { data: ParsedCV; isDark: boolean }) {
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [showAllSkills, setShowAllSkills] = useState(false);

  const MAX_SKILLS_VISIBLE = 12;
  const MAX_ROLES_VISIBLE = 3;
  const visibleSkills = showAllSkills ? data.skills : data.skills.slice(0, MAX_SKILLS_VISIBLE);
  const hiddenSkillsCount = data.skills.length - MAX_SKILLS_VISIBLE;
  const visibleRoles = showAllRoles ? data.experience : data.experience.slice(0, MAX_ROLES_VISIBLE);
  const hiddenRolesCount = data.experience.length - MAX_ROLES_VISIBLE;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', animation: 'jb-step-in 0.2s ease-out' }}>
      {/* Parsing warning */}
      {data.hasParsingWarning && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '12px 16px',
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 8,
        }}>
          <AlertTriangle size={15} color="#F59E0B" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 13, fontFamily: 'Inter, sans-serif', fontWeight: 400, color: '#F59E0B', lineHeight: 1.5 }}>
            Some sections couldn't be fully parsed — you can edit these after generating.
          </p>
        </div>
      )}

      {/* 1. Profile */}
      <SectionCard isDark={isDark}>
        <SectionLabel isDark={isDark}>Profile</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Avatar placeholder */}
          <div style={{
            width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #1A56DB 0%, #8B5CF6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <User size={20} color="#FFFFFF" />
          </div>
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.2 }}>
              {data.name}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {[
                { icon: <Mail size={12} />, text: data.email },
                { icon: <Phone size={12} />, text: data.phone },
                { icon: <MapPin size={12} />, text: data.location },
              ].map(({ icon, text }) => (
                <span key={text} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontFamily: 'Inter, sans-serif', fontWeight: 400, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.4 }}>
                  {icon}{text}
                </span>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* 2. Summary */}
      <SectionCard isDark={isDark}>
        <SectionLabel isDark={isDark}>Professional Summary</SectionLabel>
        {data.summary ? (
          <div style={{
            background: isDark ? 'rgba(148,163,184,0.05)' : 'rgba(148,163,184,0.06)',
            borderRadius: 8,
            padding: '12px 14px',
          }}>
            <p style={{ margin: 0, fontSize: 14, fontFamily: 'Inter, sans-serif', fontWeight: 400, color: isDark ? '#CBD5E1' : '#334155', lineHeight: 1.7 }}>
              {data.summary}
            </p>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, fontFamily: 'Inter, sans-serif', fontStyle: 'italic', color: isDark ? '#94A3B8' : '#64748B' }}>Not found in CV</p>
        )}
      </SectionCard>

      {/* 3. Skills */}
      <SectionCard isDark={isDark}>
        <SectionLabel isDark={isDark}>Skills</SectionLabel>
        {data.skills.length > 0 ? (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {visibleSkills.map(skill => (
                <span key={skill} style={{
                  padding: '4px 12px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: 'Inter, sans-serif',
                  background: isDark ? '#263348' : '#F1F5F9',
                  color: isDark ? '#94A3B8' : '#475569',
                  border: `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)'}`,
                  lineHeight: 1.5,
                }}>
                  {skill}
                </span>
              ))}
              {!showAllSkills && hiddenSkillsCount > 0 && (
                <button
                  onClick={() => setShowAllSkills(true)}
                  style={{
                    padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 500,
                    fontFamily: 'Inter, sans-serif', background: 'rgba(26,86,219,0.1)',
                    color: '#1A56DB', border: '1px solid rgba(26,86,219,0.2)',
                    cursor: 'pointer', lineHeight: 1.5,
                  }}
                >
                  +{hiddenSkillsCount} more
                </button>
              )}
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, fontFamily: 'Inter, sans-serif', fontStyle: 'italic', color: isDark ? '#94A3B8' : '#64748B' }}>Not found in CV</p>
        )}
      </SectionCard>

      {/* 4. Work History */}
      <SectionCard isDark={isDark}>
        <SectionLabel isDark={isDark}><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Briefcase size={11} />Experience</span></SectionLabel>
        {data.experience.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {visibleRoles.map((role, i) => (
              <div key={i} style={{
                background: isDark ? 'rgba(148,163,184,0.04)' : 'rgba(148,163,184,0.05)',
                border: `1px solid ${isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.12)'}`,
                borderRadius: 8, padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.3 }}>
                    {role.title}
                  </p>
                  <span style={{ fontSize: 12, fontFamily: 'Inter, sans-serif', fontWeight: 400, color: isDark ? '#94A3B8' : '#64748B', flexShrink: 0, lineHeight: 1.4 }}>
                    {role.dates}
                  </span>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 13, fontFamily: 'Inter, sans-serif', fontWeight: 400, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.4 }}>
                  {role.company}
                </p>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {role.bullets.map((b, j) => (
                    <li key={j} style={{ display: 'flex', gap: 8, fontSize: 13, fontFamily: 'Inter, sans-serif', fontWeight: 400, color: isDark ? '#CBD5E1' : '#475569', lineHeight: 1.5 }}>
                      <span style={{ color: isDark ? '#64748B' : '#94A3B8', flexShrink: 0, marginTop: 2, fontSize: 10 }}>●</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!showAllRoles && hiddenRolesCount > 0 && (
              <button
                onClick={() => setShowAllRoles(true)}
                style={{
                  background: 'none', border: 'none', padding: '4px 0',
                  cursor: 'pointer', color: '#1A56DB', fontSize: 13,
                  fontWeight: 500, fontFamily: 'Inter, sans-serif',
                  textAlign: 'left', lineHeight: 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
              >
                Show all {data.experience.length} roles
              </button>
            )}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, fontFamily: 'Inter, sans-serif', fontStyle: 'italic', color: isDark ? '#94A3B8' : '#64748B' }}>Not found in CV</p>
        )}
      </SectionCard>

      {/* 5. Education */}
      <SectionCard isDark={isDark}>
        <SectionLabel isDark={isDark}><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><GraduationCap size={11} />Education</span></SectionLabel>
        {data.education.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.education.map((edu, i) => (
              <div key={i} style={{
                background: isDark ? 'rgba(148,163,184,0.04)' : 'rgba(148,163,184,0.05)',
                border: `1px solid ${isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.12)'}`,
                borderRadius: 8, padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.3 }}>
                      {edu.institution}
                    </p>
                    <p style={{ margin: 0, fontSize: 13, fontFamily: 'Inter, sans-serif', fontWeight: 400, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.4 }}>
                      {edu.qualification}
                    </p>
                  </div>
                  <span style={{ fontSize: 12, fontFamily: 'Inter, sans-serif', fontWeight: 400, color: isDark ? '#94A3B8' : '#64748B', flexShrink: 0, lineHeight: 1.4 }}>
                    {edu.dates}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, fontFamily: 'Inter, sans-serif', fontStyle: 'italic', color: isDark ? '#94A3B8' : '#64748B' }}>Not found in CV</p>
        )}
      </SectionCard>
    </div>
  );
}

/* ── Step 3: Animated success checkmark ── */
function SuccessCheckmark() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Glow ring */}
        <circle cx="48" cy="48" r="46" fill="rgba(16,185,129,0.07)" />
        {/* Outer circle */}
        <circle
          cx="48" cy="48" r="40"
          stroke="#10B981" strokeWidth="2.5" fill="none"
          strokeLinecap="round"
          strokeDasharray="251.3"
          strokeDashoffset="251.3"
          style={{ animation: 'jb-draw-circle 0.6s ease-out 0.1s forwards' }}
        />
        {/* Checkmark */}
        <path
          d="M30 48 L42 60 L66 34"
          stroke="#10B981" strokeWidth="3" fill="none"
          strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray="72"
          strokeDashoffset="72"
          style={{ animation: 'jb-draw-check 0.4s ease-out 0.55s forwards' }}
        />
      </svg>
    </div>
  );
}

/* ─── Main Wizard Component ──────────────────────────────────── */
export function OnboardingWizard() {
  const navigate = useNavigate();

  /* Theme */
  const [theme, setTheme] = useState<Theme>(() =>
    (typeof window !== 'undefined' && (localStorage.getItem('applyly-theme') as Theme)) || 'light'
  );
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('applyly-theme', theme);
  }, [theme]);

  /* ── Check if user already completed onboarding (returning Google user) ── */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkIfAlreadyOnboarded = async () => {
      const session = await getValidSession();
      if (!session) {
        // No session — let them stay, they'll need to auth during upload
        if (!cancelled) setReady(true);
        return;
      }

      try {
        const { data: profiles, error } = await supabase
          .from('cv_profiles')
          .select('id')
          .eq('user_id', session.user.id)
          .limit(1);

        if (cancelled) return;

        if (!error && profiles && profiles.length > 0) {
          // Already onboarded — redirect to dashboard
          console.log('OnboardingWizard: User already has cv_profiles, redirecting to dashboard');
          navigate('/dashboard', { replace: true });
          return;
        }
      } catch (err) {
        console.error('OnboardingWizard: Error checking profiles:', err);
      }

      if (!cancelled) setReady(true);
    };

    checkIfAlreadyOnboarded();
    return () => { cancelled = true; };
  }, [navigate]);

  /* Step & transition */
  const [step, setStep] = useState(1);
  const [fading, setFading] = useState(false);
  const [userFirstName, setUserFirstName] = useState('');

  // Fetch user display name for greeting
  useEffect(() => {
    const fetchName = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const displayName =
        session.user.user_metadata?.full_name ||
        session.user.user_metadata?.name ||
        session.user.email?.split('@')[0] ||
        'there';
      setUserFirstName(displayName.split(' ')[0]);
    };
    fetchName();
  }, []);

  const goToStep = (next: number) => {
    setFading(true);
    setTimeout(() => {
      setStep(next);
      setFading(false);
    }, 150);
  };

  /* Step 1 state */
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  /* Step 2 state */
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedCV | null>(null);
  const [parseError, setParseError] = useState('');
  const rawParsedJsonRef = useRef<Record<string, unknown> | null>(null);
  const rawFileUrlRef = useRef<string>('');
  const rawLabelRef = useRef<string>('');
  const [saving, setSaving] = useState(false);
  const [savedCvProfileId, setSavedCvProfileId] = useState<string | null>(null);

  /* Handlers */
  const handleFile = (file: File) => {
    setUploadError('');
    if (!isValidType(file)) {
      setUploadError('Please upload a PDF or DOCX file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File must be under 10 MB.');
      return;
    }
    setUploadedFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) setIsDragOver(false);
  };

  const handleStep1Next = async () => {
    if (!uploadedFile) return;
    setUploadLoading(true);
    setUploadError('');
    setParseError('');

    try {
      // 1. Get authenticated session
      const session = await getValidSession();
      if (!session?.access_token) {
        setUploadError('Your session has expired. Please log in again.');
        setUploadLoading(false);
        return;
      }

      const accessToken = session.access_token;
      const userId = session.user?.id ?? 'anon';
      const filePath = `${userId}/${Date.now()}-${uploadedFile.name}`;

      // 2. Upload file to Supabase Storage
      const { error: storageError } = await supabase
        .storage
        .from('cv-uploads')
        .upload(filePath, uploadedFile, { contentType: uploadedFile.type, upsert: false });

      if (storageError) {
        console.error('Onboarding storage upload error:', storageError);
        setUploadError('Upload failed. Please try again.');
        setUploadLoading(false);
        return;
      }

      // 3. Get signed URL for the uploaded file
      const { data: urlData } = await supabase
        .storage
        .from('cv-uploads')
        .createSignedUrl(filePath, 3600);

      const fileUrl = urlData?.signedUrl;
      if (!fileUrl) {
        setUploadError('Upload failed — could not get file URL. Please try again.');
        setUploadLoading(false);
        return;
      }

      rawFileUrlRef.current = fileUrl;
      rawLabelRef.current = uploadedFile.name.replace(/\.[^/.]+$/, '');

      setUploadLoading(false);
      goToStep(2);

      // 4. Call parse-cv endpoint after step transition
      setTimeout(async () => {
        setParsing(true);
        try {
          const response = await fetch(`${SUPABASE_URL}/functions/v1/make-server-3bbff5cf/parse-cv`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
              'X-User-Token': accessToken,
              'Content-Type': 'application/json',
              'apikey': publicAnonKey,
            },
            body: JSON.stringify({
              file_url: fileUrl,
              label: rawLabelRef.current,
            }),
          });

          const result = await response.json();
          console.log('parse-cv result:', result);

          if (!response.ok || result.success === false) {
            console.error('Onboarding parse-cv error:', result);
            setParseError(result.message || "Couldn't read your CV. Make sure it's a readable PDF or DOCX.");
            setParsing(false);
            return;
          }

          // 5. Map server response to display format
          rawParsedJsonRef.current = result.parsed_json;
          rawLabelRef.current = result.label || rawLabelRef.current;
          const mapped = mapServerResponseToParsedCV(result.parsed_json);
          setParsedData(mapped);
          setParsing(false);
        } catch (err) {
          console.error('Onboarding parse-cv exception:', err);
          setParseError('Failed to analyse your CV. Please go back and try again.');
          setParsing(false);
        }
      }, 200);

    } catch (err) {
      console.error('Onboarding upload exception:', err);
      setUploadError('Something went wrong. Please try again.');
      setUploadLoading(false);
    }
  };

  const handleStep2Next = async () => {
    // Save parsed CV to cv_profiles before going to step 3
    if (!rawParsedJsonRef.current) {
      goToStep(3);
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setParseError('Your session has expired. Please log in again.');
        setSaving(false);
        return;
      }

      // Check if user already has profiles
      const { data: existingProfiles } = await supabase
        .from('cv_profiles')
        .select('id')
        .eq('user_id', session.user.id);

      const isFirst = !existingProfiles || existingProfiles.length === 0;

      const { data: savedProfile, error: saveError } = await supabase
        .from('cv_profiles')
        .insert({
          user_id: session.user.id,
          label: rawLabelRef.current || 'My CV',
          parsed_json: rawParsedJsonRef.current,
          raw_file_url: rawFileUrlRef.current || null,
          is_default: isFirst,
        })
        .select('id')
        .single();

      console.log('cv_profiles insert result:', savedProfile);
      console.log('cv_profiles insert error:', saveError);

      if (saveError) {
        console.error('Onboarding cv_profiles save error:', saveError);
        setParseError('Failed to save CV. Please try again.');
        setSaving(false);
        return;
      }

      console.log('CV saved to cv_profiles:', savedProfile.id);
      setSavedCvProfileId(savedProfile.id);
    } catch (err) {
      console.error('Onboarding save exception:', err);
      setParseError('Failed to save CV. Please try again.');
      setSaving(false);
      return;
    }
    setSaving(false);
    goToStep(3);
  };

  const handleBack = () => {
    setParseError('');
    goToStep(step - 1);
  };

  const handleSkip = () => navigate('/dashboard');

  const handleFinishOnboarding = async () => {
    // Verify the CV profile was actually saved
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      navigate('/login', { replace: true });
      return;
    }

    const { data: profiles } = await supabase
      .from('cv_profiles')
      .select('id')
      .eq('user_id', session.user.id)
      .limit(1);

    console.log('profiles check:', profiles);

    if (!profiles || profiles.length === 0) {
      // CV was not saved — go back to step 1
      console.error('No CV profile found — restarting');
      setStep(1);
      setUploadError('Something went wrong. Please upload your CV again.');
      return;
    }

    // CV exists — safe to go to dashboard
    navigate('/dashboard', { replace: true });
  };

  /* ── Render ── */

  /* Show a loading spinner while we check if user already completed onboarding */
  if (!ready) {
    return (
      <div style={{
        fontFamily: 'Inter, sans-serif',
        minHeight: '100vh',
        background: isDark
          ? 'radial-gradient(ellipse at 50% 40%, #1E293B 0%, #0F172A 65%)'
          : 'radial-gradient(ellipse at 50% 40%, #EFF6FF 0%, #F1F5F9 65%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '3px solid transparent',
            borderTopColor: '#1A56DB', borderRightColor: '#1A56DB',
            animation: 'jb-spin 0.75s linear infinite',
          }} />
          <p style={{ margin: 0, fontSize: 14, fontFamily: 'Inter, sans-serif', fontWeight: 500, color: isDark ? '#94A3B8' : '#64748B' }}>
            Loading…
          </p>
        </div>
        <style>{`@keyframes jb-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: 'Inter, sans-serif',
      minHeight: '100vh',
      background: isDark
        ? 'radial-gradient(ellipse at 50% 40%, #1E293B 0%, #0F172A 65%)'
        : 'radial-gradient(ellipse at 50% 40%, #EFF6FF 0%, #F1F5F9 65%)',
      color: isDark ? '#F8FAFC' : '#0F172A',
      transition: 'background 0.2s, color 0.2s',
      position: 'relative',
    }}>
      {/* Noise texture */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.035,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: '300px 300px',
      }} />

      {/* Navbar */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100, height: 60,
        padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        background: isDark ? 'rgba(30,41,59,0.6)' : 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
        transition: 'background 0.2s, border-color 0.2s',
      }}>
        <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Inter, sans-serif', color: '#1A56DB', letterSpacing: '-0.025em', userSelect: 'none', lineHeight: 1 }}>
          Applyly
        </span>
        <ThemeToggleButton isDark={isDark} onToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />
      </nav>

      {/* Content */}
      <main style={{
        position: 'relative', zIndex: 1,
        display: 'flex', justifyContent: 'center',
        padding: '48px 16px 80px',
      }}>
        <div style={{ width: '100%', maxWidth: 560 }}>

          {/* Stepper row + Skip */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 0 }}>
            <div style={{ flex: 1 }}>
              <ProgressStepper currentStep={step} isDark={isDark} />
            </div>
            <button
              onClick={handleSkip}
              style={{
                background: 'none', border: 'none', padding: '6px 0 0',
                cursor: 'pointer', color: isDark ? '#94A3B8' : '#64748B',
                fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif',
                lineHeight: 1, flexShrink: 0, marginTop: 4, whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = isDark ? '#F8FAFC' : '#0F172A')}
              onMouseLeave={e => (e.currentTarget.style.color = isDark ? '#94A3B8' : '#64748B')}
            >
              Skip for now
            </button>
          </div>

          {/* Step content */}
          <div style={{
            opacity: fading ? 0 : 1,
            transform: fading ? 'translateY(-4px)' : 'translateY(0)',
            transition: 'opacity 0.15s ease, transform 0.15s ease',
          }}>

            {/* ── STEP 1: Upload ── */}
            {step === 1 && (
              <div style={{ animation: 'jb-step-in 0.2s ease-out' }}>
                {userFirstName && (
                  <p style={{ fontSize: 15, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: isDark ? '#94A3B8' : '#64748B', margin: '32px 0 8px', lineHeight: 1.3 }}>
                    Welcome, {userFirstName}!
                  </p>
                )}
                <h1 style={{ fontSize: 24, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: isDark ? '#F8FAFC' : '#0F172A', margin: userFirstName ? '0 0 8px' : '32px 0 8px', lineHeight: 1.3 }}>
                  Upload your base CV
                </h1>
                <p style={{ fontSize: 14, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: isDark ? '#94A3B8' : '#64748B', margin: '0 0 32px', lineHeight: 1.6 }}>
                  We'll use this as the foundation for all your tailored applications
                </p>

                {/* Upload zone or uploaded state */}
                {!uploadedFile ? (
                  <div
                    ref={dropZoneRef}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      background: isDark
                        ? isDragOver ? 'rgba(26,86,219,0.08)' : '#1E293B'
                        : isDragOver ? 'rgba(26,86,219,0.04)' : '#FFFFFF',
                      border: `2px dashed ${isDragOver ? '#1A56DB' : isDark ? 'rgba(148,163,184,0.3)' : 'rgba(148,163,184,0.35)'}`,
                      borderStyle: isDragOver ? 'solid' : 'dashed',
                      borderRadius: 12,
                      padding: '48px 32px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      transform: isDragOver ? 'scale(1.01)' : 'scale(1)',
                      transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
                      userSelect: 'none',
                      marginBottom: uploadError ? 0 : 24,
                    }}
                    onMouseEnter={e => {
                      if (!isDragOver) {
                        (e.currentTarget as HTMLDivElement).style.borderColor = '#1A56DB';
                        (e.currentTarget as HTMLDivElement).style.background = isDark ? 'rgba(26,86,219,0.04)' : 'rgba(26,86,219,0.02)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isDragOver) {
                        (e.currentTarget as HTMLDivElement).style.borderColor = isDark ? 'rgba(148,163,184,0.3)' : 'rgba(148,163,184,0.35)';
                        (e.currentTarget as HTMLDivElement).style.background = isDark ? '#1E293B' : '#FFFFFF';
                      }
                    }}
                  >
                    <Upload size={32} color={isDark ? '#94A3B8' : '#64748B'} strokeWidth={1.5} />
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.4, textAlign: 'center' }}>
                      Drag and drop your CV here
                    </p>
                    <p style={{ margin: 0, fontSize: 13, fontFamily: 'Inter, sans-serif', fontWeight: 400, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.4 }}>
                      PDF or DOCX · Max 10 MB
                    </p>
                    <span
                      style={{ fontSize: 13, fontFamily: 'Inter, sans-serif', fontWeight: 500, color: '#1A56DB', textDecoration: 'underline', marginTop: 4 }}
                    >
                      or browse files
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
                      style={{ display: 'none' }}
                      aria-label="Upload your CV"
                    />
                  </div>
                ) : (
                  /* Uploaded state */
                  <div style={{
                    background: isDark ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.04)',
                    border: '1px solid rgba(16,185,129,0.3)',
                    borderRadius: 12,
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 24,
                    animation: 'jb-step-in 0.2s ease-out',
                  }}>
                    <FileText size={20} color="#10B981" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {uploadedFile.name}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, fontFamily: 'Inter, sans-serif', fontWeight: 400, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.3 }}>
                        {formatFileSize(uploadedFile.size)}
                      </p>
                    </div>
                    <CheckCircle2 size={18} color="#10B981" style={{ flexShrink: 0 }} />
                    <button
                      onClick={e => { e.stopPropagation(); setUploadedFile(null); setUploadError(''); }}
                      aria-label="Remove file"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: isDark ? '#94A3B8' : '#64748B', padding: 4,
                        display: 'flex', alignItems: 'center', borderRadius: 4,
                        flexShrink: 0, lineHeight: 1,
                        transition: 'color 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = isDark ? '#94A3B8' : '#64748B')}
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                {/* Upload error */}
                {uploadError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#EF4444', fontSize: 12, fontFamily: 'Inter, sans-serif', fontWeight: 400, lineHeight: 1.4, margin: '8px 0 24px' }}>
                    <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                    {uploadError}
                  </div>
                )}

                {/* CTA */}
                <Step1NextButton
                  disabled={!uploadedFile}
                  isLoading={uploadLoading}
                  onClick={handleStep1Next}
                />
              </div>
            )}

            {/* ── STEP 2: Preview ── */}
            {step === 2 && (
              <div style={{ animation: 'jb-step-in 0.2s ease-out' }}>
                <h1 style={{ fontSize: 24, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: isDark ? '#F8FAFC' : '#0F172A', margin: '32px 0 8px', lineHeight: 1.3 }}>
                  Preview your CV
                </h1>
                <p style={{ fontSize: 14, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: isDark ? '#94A3B8' : '#64748B', margin: '0 0 28px', lineHeight: 1.6 }}>
                  Here's what we extracted from your upload — check it looks right
                </p>

                {parsing || !parsedData ? (
                  /* Skeleton loading or error */
                  <div>
                    {parseError ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 0' }}>
                        <div style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          padding: '14px 18px', width: '100%',
                          background: 'rgba(239,68,68,0.08)',
                          border: '1px solid rgba(239,68,68,0.25)',
                          borderRadius: 8,
                        }}>
                          <AlertTriangle size={15} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                          <p style={{ margin: 0, fontSize: 13, fontFamily: 'Inter, sans-serif', fontWeight: 400, color: '#EF4444', lineHeight: 1.5 }}>
                            {parseError}
                          </p>
                        </div>
                        <button
                          onClick={handleBack}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'none', border: 'none', padding: '10px 0',
                            cursor: 'pointer', color: isDark ? '#94A3B8' : '#64748B',
                            fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif', lineHeight: 1,
                          }}
                        >
                          <ChevronLeft size={16} /> Go back and try again
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28, gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid transparent`, borderTopColor: '#1A56DB', borderRightColor: '#1A56DB', animation: 'jb-spin 0.75s linear infinite' }} />
                          <p style={{ margin: 0, fontSize: 13, fontFamily: 'Inter, sans-serif', fontWeight: 400, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1 }}>
                            Analysing your CV…
                          </p>
                        </div>
                        <ParsedCVSkeleton isDark={isDark} />
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <ParsedCVPreview data={parsedData} isDark={isDark} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 28 }}>
                      <button
                        onClick={handleBack}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          background: 'none', border: 'none', padding: '10px 0',
                          cursor: 'pointer', color: isDark ? '#94A3B8' : '#64748B',
                          fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif', lineHeight: 1,
                          transition: 'color 0.15s', flexShrink: 0,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = isDark ? '#F8FAFC' : '#0F172A')}
                        onMouseLeave={e => (e.currentTarget.style.color = isDark ? '#94A3B8' : '#64748B')}
                      >
                        <ChevronLeft size={16} /> Back
                      </button>
                      <PrimaryButton onClick={handleStep2Next} style={{ flex: 1 }}>
                        {saving ? (
                          <>
                            <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFFFFF', animation: 'jb-spin 0.75s linear infinite', flexShrink: 0 }} />
                            Saving…
                          </>
                        ) : (
                          <>
                            Looks good, continue <ArrowRight size={15} style={{ flexShrink: 0 }} />
                          </>
                        )}
                      </PrimaryButton>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── STEP 3: Confirm ── */}
            {step === 3 && (
              <div style={{ animation: 'jb-step-in 0.2s ease-out', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 48 }}>
                <SuccessCheckmark />

                <h1 style={{ fontSize: 28, fontWeight: 700, fontFamily: 'Inter, sans-serif', color: isDark ? '#F8FAFC' : '#0F172A', margin: '0 0 14px', lineHeight: 1.2 }}>
                  You're all set!
                </h1>
                <p style={{ fontSize: 15, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: isDark ? '#94A3B8' : '#64748B', margin: '0 0 32px', lineHeight: 1.7, maxWidth: 380 }}>
                  Your CV has been saved as your base profile. You can always update it in Settings.
                </p>

                {/* Profile summary pill */}
                {parsedData && (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 20px',
                    background: isDark ? '#1E293B' : '#FFFFFF',
                    border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.2)'}`,
                    borderRadius: 999,
                    marginBottom: 40,
                    boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.2)' : '0 4px 16px rgba(15,23,42,0.06)',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, #1A56DB 0%, #8B5CF6 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <User size={16} color="#FFFFFF" />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.3 }}>
                        {parsedData.name}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, fontFamily: 'Inter, sans-serif', fontWeight: 500, color: '#10B981', lineHeight: 1.3 }}>
                        Base CV
                      </p>
                    </div>
                  </div>
                )}

                <PrimaryButton onClick={handleFinishOnboarding} style={{ width: 220 }}>
                  Go to Dashboard <ArrowRight size={15} style={{ flexShrink: 0 }} />
                </PrimaryButton>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Keyframes */}
      <style>{`
        @keyframes jb-step-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes jb-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes jb-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes jb-pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.1); }
        }
        @keyframes jb-draw-circle {
          to { stroke-dashoffset: 0; }
        }
        @keyframes jb-draw-check {
          to { stroke-dashoffset: 0; }
        }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}

/* ─── Shared button helpers ──────────────────────────────────── */
function PrimaryButton({ children, onClick, style: extraStyle = {} }: {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setPressed(false); setHovered(false); }}
      style={{
        height: 44,
        background: hovered ? '#1E40AF' : '#1A56DB',
        color: '#FFFFFF',
        border: 'none',
        borderRadius: 8,
        fontSize: 15,
        fontWeight: 600,
        fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        transition: 'background 0.15s, transform 0.1s',
        lineHeight: 1,
        ...extraStyle,
      }}
    >
      {children}
    </button>
  );
}

function Step1NextButton({ disabled, isLoading, onClick }: { disabled: boolean; isLoading: boolean; onClick: () => void }) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      onClick={onClick}
      onMouseDown={() => !disabled && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => { setPressed(false); setHovered(false); }}
      style={{
        width: '100%',
        height: 44,
        background: disabled
          ? 'rgba(26,86,219,0.35)'
          : hovered ? '#1E40AF' : '#1A56DB',
        color: disabled ? 'rgba(255,255,255,0.5)' : '#FFFFFF',
        border: 'none',
        borderRadius: 8,
        fontSize: 15,
        fontWeight: 600,
        fontFamily: 'Inter, sans-serif',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        transition: 'background 0.15s, transform 0.1s, color 0.15s',
        lineHeight: 1,
      }}
    >
      {isLoading ? (
        <>
          <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFFFFF', animation: 'jb-spin 0.75s linear infinite', flexShrink: 0 }} />
          Uploading…
        </>
      ) : (
        <>
          Next: Preview your CV
          <ArrowRight size={15} style={{ flexShrink: 0 }} />
        </>
      )}
    </button>
  );
}