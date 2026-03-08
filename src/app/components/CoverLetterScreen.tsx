/**
 * CoverLetterScreen — Screen 9: Cover Letter Editor
 *
 * Two-panel layout at /cover-letter/:applicationId/:generatedCvId
 * Left: Tone selector → Generate → Editable letter → Regenerate
 * Right: Live formatted preview
 * Bottom: Sticky action bar — Back / Download / Save & Finish
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useNavigation } from '../lib/NavigationContext';
import {
  Loader2, CheckCircle2, AlertCircle, FileText, Download,
  RefreshCw, Check, Lock, Sparkles, ArrowLeft, ArrowRight,
} from 'lucide-react';
import { SharedNavbar } from './SharedNavbar';
import { useUserPlan } from '../lib/UserPlanContext';
import { supabase } from '../lib/supabaseClient';
import { projectId, publicAnonKey } from '../lib/supabaseClient';
import { apiFetch } from '../lib/apiFetch';

// @ts-ignore — JS utility
import { downloadCoverLetterPdf } from '../lib/pdf-generator.js';

/* ─── Constants ──────────────────────────────────────────────── */
const SUPABASE_URL = `https://${projectId}.supabase.co`;
const font = 'Inter, sans-serif';

type Theme = 'dark' | 'light';
type Tone = 'professional' | 'conversational' | 'confident';

interface ToastItem {
  id: string;
  type: 'success' | 'error';
  message: string;
}

const TONES: { key: Tone; title: string; description: string }[] = [
  { key: 'professional', title: 'Professional', description: 'Formal but warm, confident language' },
  { key: 'conversational', title: 'Conversational', description: 'Natural, first-person friendly tone' },
  { key: 'confident', title: 'Confident', description: 'Assertive, achievement-focused' },
];

const LOADING_MESSAGES = [
  'Analysing the job description…',
  'Matching your experience…',
  'Crafting the perfect tone…',
  'Writing your cover letter…',
  'Almost done…',
];

/* ─── Toast Stack ────────────────────────────────────────────── */
function ToastStack({ toasts, isDark }: { toasts: ToastItem[]; isDark: boolean }) {
  return (
    <div style={{ position: 'fixed', top: 76, right: 20, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            pointerEvents: 'auto',
            background: isDark ? 'rgba(15,23,42,0.93)' : 'rgba(248,250,252,0.97)',
            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
            borderLeft: `3px solid ${t.type === 'error' ? '#EF4444' : '#10B981'}`,
            borderRadius: 8, padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 8,
            color: isDark ? '#F8FAFC' : '#0F172A',
            fontSize: 13, fontFamily: font, fontWeight: 400,
            boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(15,23,42,0.08)',
            minWidth: 280, maxWidth: 380,
            animation: 'cl-slide-in 0.2s ease-out',
          }}
        >
          {t.type === 'error'
            ? <AlertCircle size={15} color="#EF4444" style={{ flexShrink: 0 }} />
            : <CheckCircle2 size={15} color="#10B981" style={{ flexShrink: 0 }} />}
          <span style={{ lineHeight: 1.4 }}>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────── */
function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/* ─── Tone Card ──────────────────────────────────────────────── */
function ToneCard({
  tone, isSelected, isDark, onClick,
}: {
  tone: { key: Tone; title: string; description: string };
  isSelected: boolean;
  isDark: boolean;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1,
        padding: 16,
        borderRadius: 10,
        border: `1px solid ${isSelected ? '#1A56DB' : isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
        background: isSelected
          ? 'rgba(26,86,219,0.06)'
          : hov
          ? (isDark ? 'rgba(148,163,184,0.04)' : 'rgba(15,23,42,0.02)')
          : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        transition: 'border-color 0.15s, background 0.15s',
        outline: 'none',
      }}
    >
      <span style={{
        fontSize: 14, fontWeight: 600, fontFamily: font,
        color: isSelected ? '#1A56DB' : isDark ? '#F8FAFC' : '#0F172A',
        lineHeight: 1.3,
      }}>
        {tone.title}
      </span>
      <span style={{
        fontSize: 12, fontWeight: 400, fontFamily: font,
        color: isDark ? '#94A3B8' : '#64748B',
        lineHeight: 1.4,
      }}>
        {tone.description}
      </span>
    </button>
  );
}

/* ─── Free Tier Lock ─────────────────────────────────────────── */
function FreeTierLock({ isDark }: { isDark: boolean }) {
  const navigate = useNavigate();
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 20, padding: '64px 32px', textAlign: 'center',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Lock size={28} color={isDark ? '#64748B' : '#94A3B8'} />
      </div>
      <div>
        <h2 style={{
          margin: '0 0 8px', fontSize: 18, fontWeight: 600, fontFamily: font,
          color: isDark ? '#F8FAFC' : '#0F172A',
        }}>
          Cover letters are a Pro feature
        </h2>
        <p style={{
          margin: 0, fontSize: 14, fontFamily: font, fontWeight: 400,
          color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.6, maxWidth: 360,
        }}>
          Generate personalised, tone-matched cover letters for every application. Upgrade to unlock unlimited cover letter generations.
        </p>
      </div>
      <HoverButton variant="primary" isDark={isDark} onClick={() => navigate('/billing')} style={{ height: 48, padding: '0 32px', fontSize: 15 }}>
        Upgrade to Pro — £9/month
      </HoverButton>
    </div>
  );
}

/* ─── Skeleton Preview ───────────────────────────────────────── */
function SkeletonPreview({ isDark }: { isDark: boolean }) {
  const shimmer = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.12)';
  return (
    <div style={{ padding: '48px 52px' }}>
      <div style={{ width: 160, height: 18, borderRadius: 6, background: shimmer, marginBottom: 8, animation: 'cl-shimmer 1.5s ease-in-out infinite' }} />
      <div style={{ width: 120, height: 10, borderRadius: 4, background: shimmer, marginBottom: 32, animation: 'cl-shimmer 1.5s ease-in-out infinite' }} />
      <div style={{ width: 80, height: 10, borderRadius: 4, background: shimmer, marginBottom: 28, animation: 'cl-shimmer 1.5s ease-in-out infinite' }} />
      {[0.95, 1, 0.7, 1, 0.85, 0.6, 1, 0.9].map((w, i) => (
        <div key={i} style={{ width: `${w * 100}%`, height: 10, borderRadius: 4, background: shimmer, marginBottom: i === 3 ? 20 : 10, animation: 'cl-shimmer 1.5s ease-in-out infinite' }} />
      ))}
    </div>
  );
}

/* ─── Hover Button ───────────────────────────────────────────── */
function HoverButton({
  children, variant = 'primary', isDark, onClick, icon, style: s, disabled = false,
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  isDark: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  style?: React.CSSProperties;
  disabled?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const [press, setPress] = useState(false);

  let bg = 'none';
  let color = isDark ? '#F8FAFC' : '#0F172A';
  let border = `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)'}`;

  if (variant === 'primary') {
    bg = hov ? '#1E40AF' : '#1A56DB';
    color = '#FFFFFF';
    border = 'none';
  } else if (variant === 'secondary') {
    bg = hov ? (isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)') : 'none';
    color = '#1A56DB';
  } else if (variant === 'ghost') {
    bg = hov ? (isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)') : 'none';
    color = isDark ? '#94A3B8' : '#64748B';
    border = 'none';
  }

  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => { setHov(false); setPress(false); }}
      onMouseDown={() => !disabled && setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: 40, padding: '0 16px',
        background: bg, color, border, borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 14, fontWeight: 500, fontFamily: font, lineHeight: 1,
        transform: press ? 'scale(0.97)' : 'scale(1)',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s, transform 0.1s',
        opacity: disabled ? 0.5 : 1,
        ...s,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

/* ─── Live Preview Panel ─────────────────────────────────────── */
function LivePreview({ content, candidateName, isDark }: { content: string; candidateName: string; isDark: boolean }) {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const paragraphs = content.split('\n').filter(p => p.trim().length > 0);

  return (
    <div style={{
      width: '100%',
      background: '#FFFFFF',
      borderRadius: 4,
      padding: '48px 52px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      fontFamily: 'Georgia, serif',
      fontSize: 12,
      color: '#1a1a1a',
      lineHeight: 1.75,
    }}>
      {/* Sender name */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a', fontFamily: 'Georgia, serif' }}>{candidateName || 'Your Name'}</p>
      </div>

      {/* Date */}
      <p style={{ margin: '0 0 24px', fontSize: 11, color: '#64748B', textAlign: 'right', fontFamily: 'Georgia, serif' }}>{today}</p>

      {/* Letter body */}
      {paragraphs.length > 0 ? (
        paragraphs.map((p, i) => (
          <p key={i} style={{ margin: '0 0 14px', fontSize: 12, lineHeight: 1.75, color: '#1a1a1a', fontFamily: 'Georgia, serif' }}>{p}</p>
        ))
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
          Your cover letter preview will appear here…
        </p>
      )}
    </div>
  );
}

/* ─── Main Screen ────────────────────────────────────────────── */
export function CoverLetterScreen() {
  const navigate = useNavigate();
  const { goBack } = useNavigation();
  const { applicationId, generatedCvId } = useParams<{ applicationId: string; generatedCvId: string }>();

  const [theme, setTheme] = useState<Theme>(() =>
    (typeof window !== 'undefined' && (localStorage.getItem('applyly-theme') as Theme)) || 'light'
  );
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('applyly-theme', theme);
  }, [theme]);

  const { isFreeTier } = useUserPlan();

  /* ── State ── */
  const [selectedTone, setSelectedTone] = useState<Tone>('professional');
  const [content, setContent] = useState('');
  const [coverLetterId, setCoverLetterId] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoGenerated = useRef(false);

  /* ── Preview content (300ms debounce) ── */
  const [previewContent, setPreviewContent] = useState('');
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(() => setPreviewContent(content), 300);
    return () => { if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current); };
  }, [content]);

  const addToast = useCallback((type: ToastItem['type'], message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  /* ── Fetch context (candidate name, job info) from generated CV ── */
  useEffect(() => {
    if (!generatedCvId) return;
    (async () => {
      try {
        const res = await apiFetch(
          `/make-server-3bbff5cf/generated-cv/${generatedCvId}`,
        );
        const data = await res.json();

        if (!data.success) {
          console.error('CoverLetter: Failed to load generated CV:', data.error);
          return;
        }
        const cv = data.cv_json as Record<string, unknown> | null;
        if (cv?.name) setCandidateName(cv.name as string);
        if (data.job_title) setJobTitle(data.job_title);
        if (data.company) setCompany(data.company);
      } catch (err) {
        console.error('CoverLetter: Error fetching CV context:', err);
      }
    })();
  }, [generatedCvId]);

  /* ── Check for existing cover letter ── */
  useEffect(() => {
    if (!applicationId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('cover_letters')
          .select('id, content, tone')
          .eq('application_id', applicationId)
          .single();

        if (data) {
          setCoverLetterId(data.id);
          setContent(data.content || '');
          setPreviewContent(data.content || '');
          if (data.tone && ['professional', 'conversational', 'confident'].includes(data.tone)) {
            setSelectedTone(data.tone as Tone);
          }
          setHasGenerated(true);
          hasAutoGenerated.current = true;
        }
      } catch {
        // No existing cover letter — that's fine
      }
    })();
  }, [applicationId]);

  /* ── Generate / Regenerate ── */
  const handleGenerate = useCallback(async (tone: Tone) => {
    if (!applicationId || !generatedCvId) {
      addToast('error', 'Missing application or CV data.');
      return;
    }
    setIsGenerating(true);
    setLoadingMsgIdx(0);

    // Rotate loading messages
    let idx = 0;
    loadingIntervalRef.current = setInterval(() => {
      idx = (idx + 1) % LOADING_MESSAGES.length;
      setLoadingMsgIdx(idx);
    }, 2000);

    try {
      // Route through make-server proxy so the gateway always gets the
      // anon key (never expires) and the user JWT travels in X-User-Token.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        addToast('error', 'Your session has expired. Please log in again.');
        setIsGenerating(false);
        if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
        return;
      }

      const response = await apiFetch(
        '/make-server-3bbff5cf/generate-cover-letter',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id: applicationId,
            generated_cv_id: generatedCvId,
            tone,
          }),
        }
      );

      const result = await response.json();

      if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);

      if (result.success) {
        setCoverLetterId(result.cover_letter_id);
        setContent(result.content);
        setPreviewContent(result.content);
        setHasGenerated(true);
        setIsGenerating(false);
        setSaveState('idle');
        addToast('success', 'Cover letter generated successfully');
      } else {
        console.error('generate-cover-letter error:', result);
        setIsGenerating(false);
        addToast('error', 'Failed to generate cover letter. Please try again.');
      }
    } catch (err) {
      console.error('generate-cover-letter network error:', err);
      if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
      setIsGenerating(false);
      addToast('error', 'Connection error. Please try again.');
    }
  }, [applicationId, generatedCvId, addToast]);

  /* ── Auto-generate on mount ── */
  useEffect(() => {
    if (hasAutoGenerated.current || !applicationId || !generatedCvId) return;
    // Wait a tick for existing cover letter check
    const timer = setTimeout(() => {
      if (!hasAutoGenerated.current && !isFreeTier) {
        hasAutoGenerated.current = true;
        handleGenerate('professional');
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [applicationId, generatedCvId, isFreeTier, handleGenerate]);

  /* ── Auto-save on blur (1000ms debounce) ── */
  const handleAutoSave = useCallback(async () => {
    if (!coverLetterId || !content.trim()) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(async () => {
      setSaveState('saving');
      try {
        const { error } = await supabase
          .from('cover_letters')
          .update({ content })
          .eq('id', coverLetterId);
        if (error) {
          console.error('Auto-save error:', error.message);
          addToast('error', 'Failed to save changes.');
          setSaveState('idle');
        } else {
          setSaveState('saved');
          setTimeout(() => setSaveState('idle'), 2000);
        }
      } catch (err) {
        console.error('Auto-save unexpected error:', err);
        setSaveState('idle');
      }
    }, 1000);
  }, [coverLetterId, content, addToast]);

  /* ── Content change ── */
  const handleContentChange = useCallback((value: string) => {
    setContent(value);
    setSaveState('idle');
  }, []);

  /* ── Download ── */
  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      await downloadCoverLetterPdf(content, candidateName);
    } catch (err) {
      console.error('Cover letter PDF download error:', err);
      addToast('error', 'Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  }, [content, candidateName, addToast]);

  /* ── Save & Finish ── */
  const handleSaveAndFinish = useCallback(async () => {
    // Save content if there's a cover letter id
    if (coverLetterId && content.trim()) {
      await supabase.from('cover_letters').update({ content }).eq('id', coverLetterId);
    }
    addToast('success', 'Application saved! Good luck 🎉');
    setTimeout(() => navigate('/dashboard'), 600);
  }, [coverLetterId, content, navigate, addToast]);

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, []);

  const wordCount = countWords(content);
  const bg = isDark
    ? 'radial-gradient(ellipse at 30% 10%, #1E293B 0%, #0F172A 55%)'
    : 'radial-gradient(ellipse at 30% 10%, #EFF6FF 0%, #F1F5F9 65%)';
  const surfaceBg = isDark ? '#1E293B' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const primaryText = isDark ? '#F8FAFC' : '#0F172A';

  return (
    <div style={{
      fontFamily: font,
      height: '100vh',
      display: 'flex', flexDirection: 'column',
      background: bg, color: primaryText,
      transition: 'background 0.2s, color 0.2s',
      overflow: 'hidden',
    }}>
      {/* Grid overlay */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M40 0H0v1h40V0zM0 0v40h1V0H0z' fill='%23${isDark ? 'ffffff' : '000000'}'/%3E%3C/svg%3E")`,
        backgroundSize: '40px 40px',
      }} />

      <ToastStack toasts={toasts} isDark={isDark} />

      <SharedNavbar
        isDark={isDark}
        onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
      />

      {/* Breadcrumb bar */}
      <div style={{
        padding: '12px 24px',
        borderBottom: `1px solid ${isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)'}`,
        background: isDark ? 'rgba(30,41,59,0.4)' : 'rgba(255,255,255,0.4)',
        flexShrink: 0, position: 'relative', zIndex: 1,
      }}>
        <p style={{ margin: 0, fontSize: 13, color: secondaryText, fontFamily: font, lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <BreadcrumbLink label="Dashboard" isDark={isDark} onClick={() => navigate('/dashboard')} />
          <span>/</span>
          <BreadcrumbLink label="New Application" isDark={isDark} onClick={() => navigate(applicationId ? `/new-application?appId=${applicationId}` : '/new-application')} />
          <span>/</span>
          <span style={{ color: primaryText, fontWeight: 500 }}>Cover Letter</span>
          {jobTitle && company && (
            <span style={{
              marginLeft: 8,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 999,
              background: isDark ? '#263348' : '#F8FAFC',
              border: `1px solid ${borderColor}`,
              fontSize: 12, fontWeight: 400, fontFamily: font,
              color: secondaryText, lineHeight: 1.3,
            }}>
              <Sparkles size={11} color="#1A56DB" />
              {jobTitle} at {company}
            </span>
          )}
        </p>
      </div>

      {/* Free tier gate */}
      {isFreeTier ? (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{
            background: surfaceBg,
            border: `1px solid ${borderColor}`,
            borderRadius: 12,
            maxWidth: 500,
            width: '100%',
            margin: '0 24px',
          }}>
            <FreeTierLock isDark={isDark} />
          </div>
        </div>
      ) : (
        <>
          {/* Two-panel layout */}
          <div className="cl-split" style={{
            flex: 1, display: 'flex', overflow: 'hidden',
            position: 'relative', zIndex: 1,
          }}>
            {/* LEFT PANEL — Editor */}
            <div className="cl-left" style={{
              width: '55%', overflowY: 'auto', padding: 24,
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              {/* Tone Selector */}
              <div style={{
                background: surfaceBg,
                border: `1px solid ${borderColor}`,
                borderRadius: 12,
                padding: 20,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 500, fontFamily: font,
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                  color: secondaryText, display: 'block', marginBottom: 12, lineHeight: 1.4,
                }}>
                  Tone
                </span>
                <div className="cl-tone-grid" style={{ display: 'flex', gap: 12 }}>
                  {TONES.map(tone => (
                    <ToneCard
                      key={tone.key}
                      tone={tone}
                      isSelected={selectedTone === tone.key}
                      isDark={isDark}
                      onClick={() => setSelectedTone(tone.key)}
                    />
                  ))}
                </div>
              </div>

              {/* Generate button — show when no letter yet */}
              {!hasGenerated && !isGenerating && (
                <button
                  onClick={() => handleGenerate(selectedTone)}
                  style={{
                    width: '100%', height: 48,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: '#1A56DB', color: '#FFFFFF', border: 'none', borderRadius: 8,
                    cursor: 'pointer', fontSize: 15, fontWeight: 600, fontFamily: font, lineHeight: 1,
                    transition: 'background 0.15s, transform 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#1E40AF')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#1A56DB')}
                  onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                  onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <Sparkles size={16} />
                  Generate Cover Letter
                </button>
              )}

              {/* Generating state */}
              {isGenerating && (
                <button
                  disabled
                  style={{
                    width: '100%', height: 48,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: '#1E40AF', color: '#FFFFFF', border: 'none', borderRadius: 8,
                    cursor: 'not-allowed', fontSize: 15, fontWeight: 600, fontFamily: font, lineHeight: 1,
                  }}
                >
                  <Loader2 size={16} style={{ animation: 'cl-spin 0.8s linear infinite', flexShrink: 0 }} />
                  {LOADING_MESSAGES[loadingMsgIdx]}
                </button>
              )}

              {/* Empty state before generation */}
              {!hasGenerated && !isGenerating && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 16, padding: '64px 24px',
                  textAlign: 'center',
                }}>
                  <div style={{
                    width: 80, height: 100, borderRadius: 8,
                    border: `2px dashed ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <FileText size={36} color={isDark ? '#475569' : '#94A3B8'} strokeWidth={1.2} />
                  </div>
                  <p style={{
                    margin: 0, fontSize: 15, fontFamily: font, fontWeight: 400,
                    color: secondaryText, lineHeight: 1.5, maxWidth: 320,
                  }}>
                    Select a tone and generate your cover letter
                  </p>
                </div>
              )}

              {/* Editor card — after generation */}
              {hasGenerated && !isGenerating && (
                <div style={{
                  background: surfaceBg,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 12,
                  padding: 24,
                  animation: 'cl-card-in 0.25s ease-out',
                  flex: 1,
                  display: 'flex', flexDirection: 'column',
                }}>
                  {/* Top row */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 16, flexWrap: 'wrap', gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 16, fontWeight: 600, fontFamily: font, color: primaryText, lineHeight: 1.3 }}>
                        Your Cover Letter
                      </span>
                      <span style={{ fontSize: 13, fontFamily: font, color: secondaryText, lineHeight: 1.3 }}>
                        {wordCount} words
                      </span>
                    </div>

                    {/* Save indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {saveState === 'saved' && (
                        <span style={{
                          fontSize: 12, fontWeight: 500, fontFamily: font,
                          color: '#10B981', display: 'flex', alignItems: 'center', gap: 4,
                          animation: 'cl-card-in 0.2s ease-out',
                        }}>
                          <Check size={13} /> Saved
                        </span>
                      )}
                      {saveState === 'saving' && (
                        <span style={{ fontSize: 12, fontWeight: 500, fontFamily: font, color: secondaryText }}>
                          Saving…
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Textarea */}
                  <textarea
                    value={content}
                    onChange={e => handleContentChange(e.target.value)}
                    onBlur={handleAutoSave}
                    placeholder="Your cover letter will appear here…"
                    style={{
                      width: '100%', minHeight: 400, flex: 1,
                      resize: 'vertical',
                      padding: 20,
                      background: isDark ? 'rgba(15,23,42,0.3)' : 'rgba(248,250,252,0.5)',
                      border: `1px solid ${borderColor}`,
                      borderRadius: 8,
                      outline: 'none',
                      fontSize: 15, fontFamily: font, fontWeight: 400,
                      color: primaryText,
                      lineHeight: 1.7,
                      boxSizing: 'border-box',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = '#1A56DB';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)';
                    }}
                    onBlurCapture={e => {
                      e.currentTarget.style.borderColor = borderColor;
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />

                  {/* Character count */}
                  <div style={{ textAlign: 'right', marginTop: 8 }}>
                    <span style={{ fontSize: 12, fontFamily: font, color: secondaryText, lineHeight: 1 }}>
                      {content.length} characters
                    </span>
                  </div>

                  {/* Regenerate button */}
                  <div style={{ marginTop: 12 }}>
                    <HoverButton
                      variant="ghost"
                      isDark={isDark}
                      icon={<RefreshCw size={14} />}
                      onClick={() => handleGenerate(selectedTone)}
                      disabled={isGenerating}
                      style={{ height: 36, fontSize: 13 }}
                    >
                      ↻ Regenerate with {TONES.find(t => t.key === selectedTone)?.title || selectedTone}
                    </HoverButton>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="cl-divider" style={{
              width: 1,
              background: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)',
              flexShrink: 0,
            }} />

            {/* RIGHT PANEL — Live Preview */}
            <div className="cl-right" style={{
              width: '45%',
              overflowY: 'auto',
              padding: 24,
              position: 'sticky', top: 0,
              background: isDark ? 'rgba(15,23,42,0.3)' : 'rgba(248,250,252,0.5)',
            }}>
              <span style={{
                fontSize: 11, fontWeight: 500, fontFamily: font,
                letterSpacing: '0.05em', textTransform: 'uppercase',
                color: secondaryText, display: 'block', marginBottom: 16, lineHeight: 1.4,
              }}>
                Live Preview
              </span>

              <div style={{
                border: `1px solid ${borderColor}`,
                borderRadius: 8,
                overflow: 'hidden',
              }}>
                {isGenerating ? (
                  <SkeletonPreview isDark={isDark} />
                ) : (
                  <LivePreview content={previewContent} candidateName={candidateName} isDark={isDark} />
                )}
              </div>
            </div>
          </div>

          {/* Bottom Action Bar (sticky) */}
          <div className="cl-bottom-bar" style={{
            flexShrink: 0,
            padding: '12px 24px',
            borderTop: `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)'}`,
            background: isDark ? 'rgba(30,41,59,0.8)' : 'rgba(255,255,255,0.8)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12,
            position: 'relative', zIndex: 2,
          }}>
            {/* Left: Back */}
            <HoverButton
              variant="ghost"
              isDark={isDark}
              icon={<ArrowLeft size={14} />}
              onClick={() => goBack(navigate, applicationId ? `/applications/${applicationId}` : '/dashboard')}
            >
              Back to CV
            </HoverButton>

            {/* Right: Download + Save & Finish */}
            <div className="cl-bottom-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <HoverButton
                variant="secondary"
                isDark={isDark}
                icon={isDownloading ? <Loader2 size={14} style={{ animation: 'cl-spin 0.8s linear infinite' }} /> : <Download size={14} />}
                onClick={handleDownload}
                disabled={!hasGenerated || isGenerating || isDownloading}
              >
                {isDownloading ? 'Downloading…' : 'Download Cover Letter'}
              </HoverButton>

              <HoverButton
                variant="primary"
                isDark={isDark}
                icon={<ArrowRight size={14} />}
                onClick={handleSaveAndFinish}
                disabled={!hasGenerated || isGenerating}
                style={{ fontWeight: 600 }}
              >
                Save & Finish
              </HoverButton>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes cl-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes cl-slide-in {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes cl-card-in {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cl-shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.7; }
          100% { opacity: 0.4; }
        }
        * { box-sizing: border-box; }
        textarea::placeholder { opacity: 0.4; }

        @media (max-width: 1024px) {
          .cl-split { flex-direction: column !important; }
          .cl-left, .cl-right { width: 100% !important; }
          .cl-right { position: relative !important; max-height: 500px; }
          .cl-divider { display: none !important; }
        }
        @media (max-width: 767px) {
          .cl-tone-grid { flex-direction: column !important; }
          .cl-bottom-bar { flex-direction: column !important; }
          .cl-bottom-right { width: 100%; justify-content: flex-end; }
        }
      `}</style>
    </div>
  );
}

/* ─── Breadcrumb Link ────────────────────────────────────────── */
function BreadcrumbLink({ label, isDark, onClick }: { label: string; isDark: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: isDark ? '#94A3B8' : '#64748B',
        fontSize: 13, fontFamily: font, padding: 0, lineHeight: 1,
      }}
      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
    >
      {label}
    </button>
  );
}