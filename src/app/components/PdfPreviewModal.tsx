/**
 * PdfPreviewModal — Screen 8: PDF Preview Modal
 *
 * Full-viewport glassmorphic overlay on the CV Editor.
 * Top toolbar: title, zoom controls, download, close.
 * Centre: scrollable A4 document viewer (Clean template only).
 * Keyboard: Escape closes, Cmd/Ctrl+S triggers download.
 * Responsive: full-screen on mobile, scaled document.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Download, Loader2, CheckCircle2,
  ZoomIn, ZoomOut, Move,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { projectId, publicAnonKey } from '../lib/supabaseClient';

/* ─── Types (mirrored from CvEditorScreen) ─────────────────── */
interface PersonalDetails {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  portfolio: string;
}

interface Skill {
  id: string;
  name: string;
  type: 'matched' | 'general' | 'gap';
}

interface Bullet {
  id: string;
  text: string;
}

interface WorkRole {
  id: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  bullets: Bullet[];
  expanded: boolean;
}

interface Education {
  id: string;
  institution: string;
  qualification: string;
  dates: string;
  grade: string;
  expanded: boolean;
}

interface CertEntry {
  id: string;
  label: string;
  url: string;
}

interface CvData {
  personal: PersonalDetails;
  summary: string;
  skills: Skill[];
  skillsGap: string[];
  workHistory: WorkRole[];
  education: Education[];
  certifications: CertEntry[];
  showCertifications: boolean;
}

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  cv: CvData;
  isDark: boolean;
  jobTitle: string;
  company: string;
}

/* ─── Constants ──────────────────────────────────────────────── */
const font = 'Inter, sans-serif';
const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

const ZOOM_STEPS = [50, 75, 100, 125, 150];
const MOBILE_BREAKPOINT = 768;

/* ─── Hook: responsive isMobile ──────────────────────────────── */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

/* ─── CV Document Renderer (Clean template) ───────────────────── */
function CvDocument({ cv }: { cv: CvData }) {
  const allSkills = cv.skills.map(s => s.name);

  return (
    <div id="cv-document" style={{ width: A4_WIDTH, minHeight: A4_HEIGHT, background: '#FFFFFF', padding: '48px 48px 64px', fontFamily: 'Georgia, serif' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', fontFamily: 'Inter, sans-serif' }}>{cv.personal.fullName}</div>
        <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, fontFamily: 'Inter, sans-serif', display: 'flex', gap: 0, flexWrap: 'wrap' }}>
          {[cv.personal.email, cv.personal.phone, cv.personal.location, cv.personal.linkedin, cv.personal.portfolio]
            .filter(Boolean).map((item, i) => (
              <span key={i}>{i > 0 && <span style={{ margin: '0 6px', color: '#CBD5E1' }}>·</span>}{item}</span>
            ))}
        </div>
      </div>
      {cv.summary && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #E2E8F0', paddingBottom: 4, marginBottom: 6, fontFamily: 'Inter, sans-serif' }}>Professional Summary</div>
          <p style={{ fontSize: 11, color: '#374151', lineHeight: 1.5, margin: 0, fontFamily: 'Inter, sans-serif' }}>{cv.summary}</p>
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #E2E8F0', paddingBottom: 4, marginBottom: 6, fontFamily: 'Inter, sans-serif' }}>Skills</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px 8px', marginTop: 4, fontFamily: 'Inter, sans-serif' }}>
          {allSkills.map((skill, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10, color: '#4B5563', lineHeight: '16px', padding: '1px 0' }}>
              <span style={{ fontSize: 10, marginTop: 1, flexShrink: 0, color: '#6B7280' }}>•</span>
              <span style={{ wordBreak: 'break-word', overflow: 'hidden' }}>{skill}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #E2E8F0', paddingBottom: 4, marginBottom: 6, fontFamily: 'Inter, sans-serif' }}>Work Experience</div>
        {cv.workHistory.map(w => (
          <div key={w.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', fontFamily: 'Inter, sans-serif' }}>{w.title}</span>
              <span style={{ fontSize: 10, color: '#64748B', fontFamily: 'Inter, sans-serif' }}>{w.startDate} – {w.endDate}</span>
            </div>
            <div style={{ fontSize: 11, fontStyle: 'italic', color: '#64748B', marginBottom: 4, fontFamily: 'Inter, sans-serif' }}>{w.company}</div>
            {w.bullets.filter(b => b.text).map(b => (
              <div key={b.id} style={{ fontSize: 11, color: '#374151', lineHeight: 1.5, paddingLeft: 14, position: 'relative', fontFamily: 'Inter, sans-serif' }}>
                <span style={{ position: 'absolute', left: 0 }}>{'\u2014'}</span>{b.text}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #E2E8F0', paddingBottom: 4, marginBottom: 6, fontFamily: 'Inter, sans-serif' }}>Education</div>
        {cv.education.map(e => (
          <div key={e.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', fontFamily: 'Inter, sans-serif' }}>{e.qualification}</span>
              <span style={{ fontSize: 10, color: '#64748B', fontFamily: 'Inter, sans-serif' }}>{e.dates}</span>
            </div>
            <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'Inter, sans-serif' }}>{e.institution}{e.grade ? ` · ${e.grade}` : ''}</div>
          </div>
        ))}
      </div>
      {cv.showCertifications && cv.certifications.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #E2E8F0', paddingBottom: 4, marginBottom: 6, fontFamily: 'Inter, sans-serif' }}>Certifications</div>
          {cv.certifications.map(c => (
            <div key={c.id} style={{ fontSize: 11, color: '#374151', lineHeight: 1.5, fontFamily: 'Inter, sans-serif' }}>{c.label}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PDF PREVIEW MODAL — MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export function PdfPreviewModal({
  isOpen, onClose, cv, isDark, jobTitle, company,
}: PdfPreviewModalProps) {
  const isMobile = useIsMobile();

  const [zoom, setZoom] = useState(75);
  const [downloadState, setDownloadState] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [visible, setVisible] = useState(false);
  const [docOpacity] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const documentRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);

  /* ─── Mobile document scaling ─────────────────────────────── */
  const scaleContainerRef = useRef<HTMLDivElement>(null);
  const [mobileScale, setMobileScale] = useState(1);

  useEffect(() => {
    if (!isMobile) { setMobileScale(1); return; }
    function updateScale() {
      if (!scaleContainerRef.current) return;
      const availableWidth = scaleContainerRef.current.clientWidth - 32;
      const newScale = Math.min(1, availableWidth / A4_WIDTH);
      setMobileScale(newScale);
    }
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [isMobile]);

  /* ─── Open/Close animation ────────────────────────────────── */
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  /* ─── Zoom helpers ────────────────────────────────────────── */
  const zoomIn = () => {
    const idx = ZOOM_STEPS.findIndex(z => z >= zoom);
    if (idx < ZOOM_STEPS.length - 1) setZoom(ZOOM_STEPS[idx + 1]);
  };
  const zoomOut = () => {
    const idx = ZOOM_STEPS.findIndex(z => z >= zoom);
    if (idx > 0) setZoom(ZOOM_STEPS[idx - 1]);
  };

  /* ─── Drag-to-pan when zoomed in (desktop only) ──────────── */
  const viewerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const handleViewerPointerDown = useCallback((e: React.PointerEvent) => {
    if (isMobile) return;
    const el = viewerRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y };
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
    e.preventDefault();
  }, [panOffset, isMobile]);

  const handleViewerPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanOffset({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy });
  }, []);

  const handleViewerPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const el = viewerRef.current;
    if (el) {
      el.releasePointerCapture(e.pointerId);
      el.style.cursor = 'grab';
    }
  }, []);

  /* ─── Reset pan when zoom changes ────────────────────────── */
  const prevZoomRef = useRef(zoom);
  useEffect(() => {
    if (prevZoomRef.current !== zoom) {
      setPanOffset({ x: 0, y: 0 });
      prevZoomRef.current = zoom;
    }
  }, [zoom]);

  /* ─── Track page count via ResizeObserver ──────────────────── */
  useEffect(() => {
    const el = documentRef.current;
    if (!el || !isOpen) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      setPageCount(Math.max(1, Math.ceil(h / A4_HEIGHT)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  /* ─── Download PDF (server-side generation) ────────────────── */
  const handleDownload = useCallback(async () => {
    if (downloadState === 'generating') return;

    setDownloadState('generating');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('Not authenticated');

      const cvPayload = {
        name: cv.personal.fullName,
        email: cv.personal.email,
        phone: cv.personal.phone,
        location: cv.personal.location,
        linkedin: cv.personal.linkedin,
        portfolio: cv.personal.portfolio,
        summary: cv.summary,
        skills: cv.skills.map(s => s.name),
        work_history: cv.workHistory.map(w => ({
          title: w.title,
          company: w.company,
          start_date: w.startDate,
          end_date: w.endDate,
          bullets: w.bullets.filter(b => b.text).map(b => b.text),
        })),
        education: cv.education.map(e => ({
          qualification: e.qualification,
          institution: e.institution,
          dates: e.dates,
          grade: e.grade,
        })),
        certifications: cv.showCertifications
          ? cv.certifications.map(c => ({ label: c.label }))
          : [],
      };

      const SUPABASE_URL = `https://${projectId}.supabase.co`;
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/make-server-3bbff5cf/generate-pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
            'apikey': publicAnonKey,
            'X-User-Token': accessToken,
          },
          body: JSON.stringify({
            cv_json: cvPayload,
          }),
        },
      );

      if (!response.ok) {
        const errBody = await response.text();
        console.error('[download-pdf] server error:', response.status, errBody);
        throw new Error(`PDF generation failed (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cv.personal.fullName.replace(/\s+/g, '_')}_CV.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloadState('done');
      setTimeout(() => setDownloadState('idle'), 2000);
    } catch (err) {
      console.error('[download-pdf] error:', err);
      setDownloadState('error');
      setTimeout(() => setDownloadState('idle'), 3000);
    }
  }, [cv, downloadState]);

  /* ─── Keyboard shortcuts ──────────────────────────────────── */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleDownload();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, handleDownload]);

  /* ─── Don't render if not open ────────────────────────────── */
  if (!isOpen) return null;

  const scale = isMobile ? 1 : zoom / 100;

  /* ─── Download button content ─────────────────────────────── */
  const downloadBtnContent = () => {
    switch (downloadState) {
      case 'generating':
        return (
          <>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            {!isMobile && 'Generating...'}
          </>
        );
      case 'done':
        return (
          <>
            <CheckCircle2 size={14} />
            {!isMobile && 'Downloaded!'}
          </>
        );
      case 'error':
        return (
          <>
            <X size={14} />
            {!isMobile && 'Failed \u2014 retry'}
          </>
        );
      default:
        return (
          <>
            <Download size={14} />
            {!isMobile && 'Download PDF'}
          </>
        );
    }
  };

  const downloadBtnBg = () => {
    switch (downloadState) {
      case 'done': return '#10B981';
      case 'error': return '#EF4444';
      default: return '#1A56DB';
    }
  };

  return (
    <>
      {/* Keyframes */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Overlay */}
      <div
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: isDark ? 'rgba(15,23,42,0.85)' : 'rgba(241,245,249,0.85)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 200ms ease-out',
          display: 'flex',
          justifyContent: 'center',
          alignItems: isMobile ? 'stretch' : 'flex-start',
          padding: isMobile ? 0 : '5vh 0',
        }}
      >
        {/* Modal container */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          width: isMobile ? '100%' : '90%',
          maxWidth: isMobile ? '100%' : 900,
          height: isMobile ? '100%' : '90vh',
          borderRadius: isMobile ? 0 : 12,
          overflow: 'hidden',
          background: isDark ? '#0F172A' : '#F1F5F9',
          transform: visible ? 'scale(1)' : 'scale(0.96)',
          opacity: visible ? 1 : 0,
          transition: 'transform 200ms ease-out, opacity 200ms ease-out',
        }}>
          {/* ── TOP TOOLBAR ─────────────────────────────────────── */}
          <div style={{
            height: isMobile ? 'auto' : 56, flexShrink: 0,
            padding: isMobile ? '10px 16px' : '0 24px',
            background: isDark ? '#1E293B' : '#FFFFFF',
            borderBottom: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            transition: 'background 0.2s, border-color 0.2s',
          }}>
            {/* Left: Title */}
            <div style={{ flex: '0 1 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
              <span style={{
                fontSize: isMobile ? 15 : 16, fontWeight: 600, fontFamily: font, lineHeight: 1.2,
                color: isDark ? '#F8FAFC' : '#0F172A',
              }}>
                CV Preview
              </span>
              <span style={{
                fontSize: isMobile ? 12 : 13, fontWeight: 400, fontFamily: font, lineHeight: 1.3,
                color: isDark ? '#94A3B8' : '#64748B',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: isMobile ? '50vw' : undefined,
              }}>
                {jobTitle} {'\u2014'} {company}
              </span>
            </div>

            {/* Right: Download + Close */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={handleDownload}
                disabled={downloadState === 'generating'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  height: 36, padding: '0 16px',
                  background: downloadBtnBg(),
                  border: 'none', borderRadius: 8,
                  cursor: downloadState === 'generating' ? 'wait' : 'pointer',
                  color: '#FFFFFF', fontSize: isMobile ? 13 : 14, fontWeight: 600, fontFamily: font, lineHeight: 1,
                  transition: 'background 0.2s, transform 0.1s',
                  whiteSpace: 'nowrap',
                }}
                onMouseDown={e => { if (downloadState === 'idle') e.currentTarget.style.transform = 'scale(0.97)'; }}
                onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseEnter={e => { if (downloadState === 'idle') e.currentTarget.style.background = '#1E40AF'; }}
                onMouseLeave={e => { if (downloadState === 'idle') e.currentTarget.style.background = '#1A56DB'; }}
              >
                {downloadBtnContent()}
              </button>

              <button
                onClick={onClose}
                aria-label="Close preview"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 8, display: 'flex', alignItems: 'center', borderRadius: 8,
                  color: isDark ? '#94A3B8' : '#64748B',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = isDark ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.06)';
                  e.currentTarget.style.color = isDark ? '#F8FAFC' : '#0F172A';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'none';
                  e.currentTarget.style.color = isDark ? '#94A3B8' : '#64748B';
                }}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* ── DOCUMENT VIEWER ─────────────────────────────────── */}
          {isMobile ? (
            /* MOBILE: Scrollable scaled document */
            <div
              ref={scaleContainerRef}
              style={{
                flex: 1, overflowY: 'auto', overflowX: 'hidden',
                padding: '16px 16px 48px',
                WebkitOverflowScrolling: 'touch' as any,
              }}
            >
              <div style={{
                width: A4_WIDTH,
                transformOrigin: 'top left',
                transform: `scale(${mobileScale})`,
              }}>
                <div
                  ref={documentRef}
                  style={{
                    boxShadow: isDark
                      ? '0 8px 40px rgba(0,0,0,0.4)'
                      : '0 8px 40px rgba(15,23,42,0.15)',
                    borderRadius: 4,
                    overflow: 'visible',
                    opacity: docOpacity,
                    transition: 'opacity 200ms ease-out',
                    position: 'relative',
                  }}
                >
                  <CvDocument cv={cv} />
                  {/* Page break indicators */}
                  {pageCount > 1 && Array.from({ length: pageCount - 1 }, (_, i) => (
                    <div key={i} data-page-break="true" style={{ position: 'absolute', top: A4_HEIGHT * (i + 1), left: 0, right: 0, pointerEvents: 'none', zIndex: 10 }}>
                      <div style={{
                        width: '100%', height: 1,
                        background: 'repeating-linear-gradient(to right, rgba(99,102,241,0.35) 0px, rgba(99,102,241,0.35) 6px, transparent 6px, transparent 12px)',
                      }} />
                      <span style={{
                        position: 'absolute', right: 8, top: -8,
                        fontSize: 9, fontWeight: 500, fontFamily: font,
                        color: 'rgba(99,102,241,0.5)',
                        background: '#FFFFFF', padding: '1px 4px', borderRadius: 2, lineHeight: 1,
                      }}>p.{i + 2}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* DESKTOP: Pannable + zoomable viewer */
            <div
              ref={viewerRef}
              style={{
                flex: 1, overflow: 'hidden', padding: '32px 48px 48px',
                display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
                cursor: 'grab',
                userSelect: 'none',
                position: 'relative',
              }}
              onPointerDown={handleViewerPointerDown}
              onPointerMove={handleViewerPointerMove}
              onPointerUp={handleViewerPointerUp}
              onPointerCancel={handleViewerPointerUp}
            >
              {/* Pannable + zoomable container */}
              <div style={{
                transformOrigin: 'top center',
                transform: `scale(${scale}) translate(${panOffset.x / scale}px, ${panOffset.y / scale}px)`,
                transition: isDraggingRef.current ? 'none' : 'transform 0.2s ease-out',
                flexShrink: 0,
              }}>
                {/* The actual A4 document */}
                <div
                  ref={documentRef}
                  style={{
                    boxShadow: isDark
                      ? '0 8px 40px rgba(0,0,0,0.4)'
                      : '0 8px 40px rgba(15,23,42,0.15)',
                    borderRadius: 4,
                    overflow: 'visible',
                    opacity: docOpacity,
                    transition: 'opacity 200ms ease-out',
                    pointerEvents: 'none',
                    position: 'relative',
                  }}
                >
                  <CvDocument cv={cv} />
                  {/* Page break indicators */}
                  {pageCount > 1 && Array.from({ length: pageCount - 1 }, (_, i) => (
                    <div key={i} data-page-break="true" style={{ position: 'absolute', top: A4_HEIGHT * (i + 1), left: 0, right: 0, pointerEvents: 'none', zIndex: 10 }}>
                      <div style={{
                        width: '100%', height: 1,
                        background: 'repeating-linear-gradient(to right, rgba(99,102,241,0.35) 0px, rgba(99,102,241,0.35) 6px, transparent 6px, transparent 12px)',
                      }} />
                      <span style={{
                        position: 'absolute', right: 8, top: -8,
                        fontSize: 9, fontWeight: 500, fontFamily: font,
                        color: 'rgba(99,102,241,0.5)',
                        background: '#FFFFFF', padding: '1px 4px', borderRadius: 2, lineHeight: 1,
                      }}>p.{i + 2}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Drag hint */}
              <div
                onPointerDown={e => e.stopPropagation()}
                style={{
                  position: 'absolute', bottom: 16, right: 16,
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 8,
                  background: isDark ? 'rgba(30,41,59,0.85)' : 'rgba(255,255,255,0.85)',
                  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                  border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
                  boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(15,23,42,0.08)',
                  fontSize: 12, fontWeight: 500, fontFamily: font,
                  color: isDark ? '#94A3B8' : '#64748B',
                  pointerEvents: 'none',
                  zIndex: 10,
                }}
              >
                <Move size={13} /> Drag to pan
              </div>

              {/* Floating zoom controls */}
              <div
                onPointerDown={e => e.stopPropagation()}
                style={{
                  position: 'absolute', bottom: 16, left: 16,
                  display: 'flex', alignItems: 'center', gap: 0,
                  borderRadius: 8, overflow: 'hidden',
                  background: isDark ? 'rgba(30,41,59,0.85)' : 'rgba(255,255,255,0.85)',
                  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                  border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
                  boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(15,23,42,0.08)',
                  zIndex: 10,
                  pointerEvents: 'auto',
                }}
              >
                <button
                  onClick={zoomOut}
                  aria-label="Zoom out"
                  disabled={zoom <= ZOOM_STEPS[0]}
                  style={{
                    background: 'none', border: 'none',
                    cursor: zoom <= ZOOM_STEPS[0] ? 'not-allowed' : 'pointer',
                    padding: '6px 8px', display: 'flex', alignItems: 'center',
                    color: zoom <= ZOOM_STEPS[0]
                      ? (isDark ? '#475569' : '#CBD5E1')
                      : isDark ? '#94A3B8' : '#64748B',
                    transition: 'color 0.15s',
                  }}
                >
                  <ZoomOut size={14} />
                </button>
                <span style={{
                  fontSize: 12, fontWeight: 500, fontFamily: font, lineHeight: 1,
                  color: isDark ? '#F8FAFC' : '#0F172A',
                  padding: '0 6px', minWidth: 36, textAlign: 'center',
                  borderLeft: `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)'}`,
                  borderRight: `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)'}`,
                }}>
                  {zoom}%
                </span>
                <button
                  onClick={zoomIn}
                  aria-label="Zoom in"
                  disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                  style={{
                    background: 'none', border: 'none',
                    cursor: zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1] ? 'not-allowed' : 'pointer',
                    padding: '6px 8px', display: 'flex', alignItems: 'center',
                    color: zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]
                      ? (isDark ? '#475569' : '#CBD5E1')
                      : isDark ? '#94A3B8' : '#64748B',
                    transition: 'color 0.15s',
                  }}
                >
                  <ZoomIn size={14} />
                </button>
                {pageCount > 1 && (
                  <>
                    <div style={{
                      width: 1, alignSelf: 'stretch',
                      background: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)',
                    }} />
                    <span style={{
                      fontSize: 11, fontWeight: 500, fontFamily: font, lineHeight: 1,
                      color: isDark ? '#94A3B8' : '#64748B',
                      padding: '0 8px', whiteSpace: 'nowrap',
                    }}>
                      {pageCount} pages
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
