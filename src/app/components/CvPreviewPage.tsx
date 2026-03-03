/**
 * CvPreviewPage — Screen 8: PDF Preview Modal
 *
 * Accessible at /cv-preview
 * Renders a full-screen PDF viewer with template selector, iframe preview,
 * skeleton shimmer while generating, and a Download button.
 *
 * cvJson comes from generated_cvs.cv_json — mocked here until CV Editor is built.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Sun, Moon, Download, ArrowLeft, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';

// @ts-ignore — JS utility, types inferred at call site
import { downloadCvPdf, getCvPdfBlobUrl } from '../lib/pdf-generator.js';

/* ─── Types ──────────────────────────────────────────────────── */
type Theme = 'dark' | 'light';
type TemplateId = 'clean' | 'sidebar' | 'minimal';

interface ToastItem {
  id: string;
  type: 'success' | 'error';
  message: string;
}

/* ─── Mock CV JSON (generated_cvs.cv_json) ───────────────────── */
const SAMPLE_CV_JSON = {
  name: 'Alex Johnson',
  email: 'alex.johnson@email.com',
  phone: '+44 7700 900123',
  location: 'London, UK',
  linkedin: 'linkedin.com/in/alexjohnson',
  summary:
    'Senior Frontend Engineer with 7+ years of experience building scalable web applications and design systems. Passionate about developer experience, accessibility, and shipping high-quality products that delight users.',
  skills: [
    'React', 'TypeScript', 'Node.js', 'GraphQL',
    'CSS / Tailwind', 'Jest', 'Figma', 'AWS',
  ],
  work_history: [
    {
      title: 'Senior Frontend Engineer',
      company: 'Anthropic',
      start_date: 'Jan 2023',
      end_date: 'Present',
      bullets: [
        'Led the redesign of the core product UI serving 50,000+ researchers worldwide',
        'Built a real-time collaboration feature using WebSockets, reducing latency by 40%',
        'Defined and maintained the internal component library used across 4 product teams',
        'Conducted 200+ code reviews and mentored 4 junior engineers through bi-weekly 1:1s',
      ],
    },
    {
      title: 'Frontend Engineer',
      company: 'Vercel',
      start_date: 'Mar 2020',
      end_date: 'Dec 2022',
      bullets: [
        'Contributed to the Next.js dashboard and deployment pipeline UI',
        'Optimised Core Web Vitals across the marketing site, achieving 95+ Lighthouse scores',
        'Shipped the dark mode feature used by 2M+ monthly active users',
      ],
    },
    {
      title: 'Frontend Developer',
      company: 'Monzo',
      start_date: 'Aug 2018',
      end_date: 'Feb 2020',
      bullets: [
        'Built the customer-facing transaction detail and dispute flow in React Native',
        'Reduced app bundle size by 22% through code-splitting and lazy loading',
      ],
    },
  ],
  education: [
    {
      qualification: 'BSc Computer Science',
      institution: 'University of Edinburgh',
      dates: '2014 – 2018',
      grade: 'First Class Honours',
    },
  ],
  certifications: [
    { name: 'AWS Certified Developer – Associate', issuer: 'Amazon Web Services', year: '2022' },
  ],
};

const TEMPLATES: { id: TemplateId; label: string; description: string }[] = [
  { id: 'clean',   label: 'Clean',   description: 'Serif headings, generous whitespace' },
  { id: 'sidebar', label: 'Sidebar', description: 'Two-column with dark sidebar' },
  { id: 'minimal', label: 'Minimal', description: 'Sans-serif, thin line dividers' },
];

/* ─── Skeleton shimmer ───────────────────────────────────────── */
function PreviewSkeleton({ isDark }: { isDark: boolean }) {
  const base = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.06)';
  const shine = isDark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.10)';
  return (
    <div style={{
      width: '100%', height: '100%', minHeight: 600,
      background: isDark ? '#1E293B' : '#FFFFFF',
      borderRadius: 4, padding: 32, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Name line */}
      <div style={{ height: 28, width: '55%', borderRadius: 4, background: base, animation: 'cvp-shimmer 1.4s ease-in-out infinite alternate' }} />
      {/* Contact line */}
      <div style={{ height: 12, width: '80%', borderRadius: 4, background: base, animation: 'cvp-shimmer 1.4s 0.1s ease-in-out infinite alternate' }} />
      <div style={{ height: 1, background: base, margin: '8px 0' }} />
      {/* Section */}
      <div style={{ height: 10, width: '20%', borderRadius: 4, background: shine, animation: 'cvp-shimmer 1.4s 0.2s ease-in-out infinite alternate' }} />
      <div style={{ height: 12, width: '95%', borderRadius: 4, background: base, animation: 'cvp-shimmer 1.4s 0.25s ease-in-out infinite alternate' }} />
      <div style={{ height: 12, width: '88%', borderRadius: 4, background: base, animation: 'cvp-shimmer 1.4s 0.3s ease-in-out infinite alternate' }} />
      <div style={{ height: 1, background: base, margin: '8px 0' }} />
      {/* Experience */}
      <div style={{ height: 10, width: '22%', borderRadius: 4, background: shine, animation: 'cvp-shimmer 1.4s 0.35s ease-in-out infinite alternate' }} />
      {[0.4, 0.45, 0.5, 0.55].map((d, i) => (
        <div key={i} style={{ height: 11, width: `${75 + i * 5}%`, borderRadius: 4, background: base, animation: `cvp-shimmer 1.4s ${d}s ease-in-out infinite alternate` }} />
      ))}
      <div style={{ height: 1, background: base, margin: '8px 0' }} />
      {[0.6, 0.65, 0.7].map((d, i) => (
        <div key={i} style={{ height: 11, width: `${80 + i * 4}%`, borderRadius: 4, background: base, animation: `cvp-shimmer 1.4s ${d}s ease-in-out infinite alternate` }} />
      ))}
    </div>
  );
}

/* ─── Toast ──────────────────────────────────────────────────── */
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
            fontSize: 13, fontFamily: 'Inter, sans-serif', fontWeight: 400,
            boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(15,23,42,0.08)',
            minWidth: 280, maxWidth: 380,
            animation: 'cvp-slide-in 0.2s ease-out',
          }}
        >
          {t.type === 'error'
            ? <AlertCircle size={15} color="#EF4444" style={{ flexShrink: 0 }} />
            : <CheckCircle2 size={15} color="#10B981" style={{ flexShrink: 0 }} />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export function CvPreviewPage() {
  const navigate = useNavigate();

  const [theme, setTheme] = useState<Theme>(() =>
    (typeof window !== 'undefined' && (localStorage.getItem('jobbo-theme') as Theme)) || 'dark'
  );
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('jobbo-theme', theme);
  }, [theme]);

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('clean');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [iframeLoading, setIframeLoading] = useState(true); // skeleton visible
  const [isGeneratingBlob, setIsGeneratingBlob] = useState(false);

  const [isDownloading, setIsDownloading] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const prevBlobUrl = useRef<string | null>(null);
  const [themeHov, setThemeHov] = useState(false);
  const [backHov, setBackHov] = useState(false);
  const [dlHov, setDlHov] = useState(false);

  /* Generate blob URL when template changes */
  useEffect(() => {
    let cancelled = false;

    const generate = async () => {
      setIsGeneratingBlob(true);
      setIframeLoading(true);
      setBlobUrl(null);

      // Revoke previous blob to avoid memory leak
      if (prevBlobUrl.current) {
        URL.revokeObjectURL(prevBlobUrl.current);
        prevBlobUrl.current = null;
      }

      try {
        const url = await getCvPdfBlobUrl(SAMPLE_CV_JSON, selectedTemplate);
        if (!cancelled) {
          setBlobUrl(url);
          prevBlobUrl.current = url;
          // iframe onLoad will clear the skeleton
        }
      } catch (err) {
        if (!cancelled) {
          addToast('error', 'Failed to generate preview. Check your network connection.');
          setIframeLoading(false);
        }
      } finally {
        if (!cancelled) setIsGeneratingBlob(false);
      }
    };

    generate();
    return () => { cancelled = true; };
  }, [selectedTemplate]);

  /* Revoke blob on unmount */
  useEffect(() => {
    return () => {
      if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
    };
  }, []);

  const addToast = (type: ToastItem['type'], message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  };

  /* Download handler */
  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadCvPdf(SAMPLE_CV_JSON, selectedTemplate);
      addToast('success', 'Your CV has been downloaded');
    } catch (err) {
      addToast('error', 'Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const bg = isDark ? '#0F172A' : '#F1F5F9';
  const surfaceBg = isDark ? '#1E293B' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const primaryText = isDark ? '#F8FAFC' : '#0F172A';

  return (
    <div style={{
      fontFamily: 'Inter, sans-serif',
      minHeight: '100vh', height: '100vh',
      display: 'flex', flexDirection: 'column',
      background: isDark
        ? 'radial-gradient(ellipse at 30% 10%, #1E293B 0%, #0F172A 55%)'
        : 'radial-gradient(ellipse at 30% 10%, #EFF6FF 0%, #F1F5F9 65%)',
      color: primaryText,
      transition: 'background 0.2s, color 0.2s',
      overflow: 'hidden',
    }}>

      <ToastStack toasts={toasts} isDark={isDark} />

      {/* ── Top bar ── */}
      <div style={{
        flexShrink: 0, height: 60, padding: '0 24px',
        display: 'flex', alignItems: 'center', gap: 16,
        background: isDark ? 'rgba(30,41,59,0.65)' : 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${borderColor}`,
        zIndex: 100, position: 'relative',
        transition: 'background 0.2s, border-color 0.2s',
      }}>
        {/* Back */}
        <button
          onClick={() => navigate('/dashboard')}
          onMouseEnter={() => setBackHov(true)}
          onMouseLeave={() => setBackHov(false)}
          aria-label="Back to dashboard"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: backHov ? (isDark ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.06)') : 'none',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            color: secondaryText, padding: '6px 10px',
            fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif',
            transition: 'background 0.15s, color 0.15s', lineHeight: 1, flexShrink: 0,
          }}
        >
          <ArrowLeft size={15} /> Back
        </button>

        {/* Title */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: secondaryText, textTransform: 'uppercase', letterSpacing: '0.07em', lineHeight: 1 }}>
            CV Preview
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 15, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: primaryText, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {SAMPLE_CV_JSON.name} · Senior Frontend Engineer @ Anthropic
          </p>
        </div>

        {/* Template tabs */}
        <div style={{
          display: 'flex', gap: 4, padding: 4,
          background: isDark ? 'rgba(15,23,42,0.5)' : 'rgba(241,245,249,0.8)',
          borderRadius: 10,
          border: `1px solid ${borderColor}`,
          flexShrink: 0,
        }}>
          {TEMPLATES.map(t => (
            <TemplateTab
              key={t.id}
              template={t}
              isSelected={selectedTemplate === t.id}
              isDark={isDark}
              onClick={() => setSelectedTemplate(t.id)}
            />
          ))}
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(th => th === 'dark' ? 'light' : 'dark')}
          onMouseEnter={() => setThemeHov(true)}
          onMouseLeave={() => setThemeHov(false)}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            background: themeHov ? (isDark ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.06)') : 'none',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            color: secondaryText, padding: 8,
            display: 'flex', alignItems: 'center', lineHeight: 1,
            transition: 'background 0.15s', flexShrink: 0,
          }}
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* Download button */}
        <DownloadButton
          isDownloading={isDownloading}
          isDark={isDark}
          onClick={handleDownload}
        />
      </div>

      {/* ── Main area ── */}
      <div style={{
        flex: 1, overflow: 'hidden',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        background: isDark ? 'rgba(10,15,26,0.6)' : 'rgba(226,232,240,0.6)',
        padding: '32px 24px',
        position: 'relative', zIndex: 1,
      }}>

        {/* Document card */}
        <div style={{
          width: '100%', maxWidth: 860,
          height: '100%', maxHeight: 'calc(100vh - 60px - 64px)',
          background: surfaceBg,
          borderRadius: 8,
          boxShadow: isDark ? '0 8px 48px rgba(0,0,0,0.6)' : '0 8px 48px rgba(15,23,42,0.15)',
          border: `1px solid ${borderColor}`,
          overflow: 'hidden', position: 'relative',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Skeleton shimmer — shown while blob is generating or iframe loading */}
          {iframeLoading && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              background: surfaceBg,
              padding: 24,
            }}>
              <PreviewSkeleton isDark={isDark} />
            </div>
          )}

          {/* iframe — only mounted when we have a blob URL */}
          {blobUrl && (
            <iframe
              key={blobUrl} // remount on new blob so onLoad fires reliably
              src={blobUrl}
              onLoad={() => setIframeLoading(false)}
              style={{
                flex: 1, width: '100%', height: '100%',
                border: 'none', display: 'block',
                opacity: iframeLoading ? 0 : 1,
                transition: 'opacity 0.2s ease',
              }}
              title="CV PDF Preview"
            />
          )}
        </div>
      </div>

      <style>{`
        @keyframes cvp-shimmer {
          from { opacity: 0.5; }
          to   { opacity: 1; }
        }
        @keyframes cvp-slide-in {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}

/* ─── Template Tab ───────────────────────────────────────────── */
function TemplateTab({
  template, isSelected, isDark, onClick,
}: {
  template: { id: TemplateId; label: string; description: string };
  isSelected: boolean; isDark: boolean; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={template.description}
      style={{
        padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
        fontSize: 13, fontWeight: isSelected ? 600 : 400, fontFamily: 'Inter, sans-serif',
        lineHeight: 1,
        background: isSelected
          ? isDark ? '#1E293B' : '#FFFFFF'
          : hov
          ? isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)'
          : 'none',
        color: isSelected
          ? isDark ? '#F8FAFC' : '#0F172A'
          : isDark ? '#94A3B8' : '#64748B',
        boxShadow: isSelected
          ? isDark ? '0 1px 6px rgba(0,0,0,0.4)' : '0 1px 6px rgba(15,23,42,0.12)'
          : 'none',
        transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
      }}
    >
      {template.label}
    </button>
  );
}

/* ─── Download Button ────────────────────────────────────────── */
function DownloadButton({
  isDownloading, isDark, onClick,
}: { isDownloading: boolean; isDark: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  const [press, setPress] = useState(false);

  return (
    <button
      onClick={isDownloading ? undefined : onClick}
      disabled={isDownloading}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        height: 36, padding: '0 16px', flexShrink: 0,
        background: isDownloading ? '#1E40AF' : hov ? '#1E40AF' : '#1A56DB',
        color: '#FFFFFF', border: 'none', borderRadius: 8,
        cursor: isDownloading ? 'not-allowed' : 'pointer',
        fontSize: 14, fontWeight: 600, fontFamily: 'Inter, sans-serif',
        transform: press && !isDownloading ? 'scale(0.97)' : 'scale(1)',
        transition: 'background 0.15s, transform 0.1s',
        lineHeight: 1, whiteSpace: 'nowrap',
      }}
    >
      {isDownloading ? (
        <>
          <Loader2 size={14} style={{ animation: 'cvp-spin 0.8s linear infinite', flexShrink: 0 }} />
          Generating…
        </>
      ) : (
        <>
          <Download size={14} style={{ flexShrink: 0 }} />
          Download PDF
        </>
      )}
      <style>{`@keyframes cvp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
