/**
 * PdfPreviewModal — Screen 8: PDF Preview Modal
 *
 * Full-viewport glassmorphic overlay on the CV Editor.
 * Top toolbar: title, template thumbnails, zoom controls, download, close.
 * Centre: scrollable A4 document viewer.
 * Free-tier lock on Sidebar & Minimal templates.
 * Keyboard: Escape closes, Cmd/Ctrl+S triggers download.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Minus, Plus, Download, Loader2, CheckCircle2, Lock,
  ZoomIn, ZoomOut, Move,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/* ─── Types (mirrored from CvEditorScreen) ─────────────────── */
type TemplateId = 'clean' | 'sidebar' | 'minimal';

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
  selectedTemplate: TemplateId;
  onTemplateChange: (t: TemplateId) => void;
  isDark: boolean;
  jobTitle: string;
  company: string;
}

/* ─── Constants ──────────────────────────────────────────────── */
const font = 'Inter, sans-serif';
const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

const ZOOM_STEPS = [50, 75, 100, 125, 150];

/* ─── Template Thumbnails ────────────────────────────────────── */
function TemplateThumbnail({ id, label, isActive, isLocked, isDark, onClick }: {
  id: TemplateId; label: string; isActive: boolean; isLocked: boolean;
  isDark: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = () => {
    if (isLocked) {
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 3000);
      return;
    }
    onClick();
  };

  /* Mini geometric representation of each template */
  const renderMiniLayout = () => {
    const lineColor = isActive ? '#1A56DB' : isDark ? '#94A3B8' : '#64748B';
    const opacity = isLocked ? 0.4 : 0.7;

    if (id === 'clean') {
      return (
        <svg width="80" height="28" viewBox="0 0 80 28" style={{ opacity }}>
          <rect x="4" y="3" width="72" height="3" rx="1" fill={lineColor} opacity={0.8} />
          <rect x="4" y="9" width="50" height="2" rx="0.5" fill={lineColor} opacity={0.5} />
          <rect x="4" y="14" width="72" height="2" rx="0.5" fill={lineColor} opacity={0.35} />
          <rect x="4" y="18" width="72" height="2" rx="0.5" fill={lineColor} opacity={0.35} />
          <rect x="4" y="22" width="60" height="2" rx="0.5" fill={lineColor} opacity={0.35} />
        </svg>
      );
    }
    if (id === 'sidebar') {
      return (
        <svg width="80" height="28" viewBox="0 0 80 28" style={{ opacity }}>
          <rect x="2" y="2" width="22" height="24" rx="1.5" fill={lineColor} opacity={0.25} />
          <rect x="5" y="5" width="16" height="2" rx="0.5" fill={lineColor} opacity={0.6} />
          <rect x="5" y="10" width="12" height="1.5" rx="0.5" fill={lineColor} opacity={0.4} />
          <rect x="5" y="13" width="14" height="1.5" rx="0.5" fill={lineColor} opacity={0.4} />
          <rect x="5" y="16" width="10" height="1.5" rx="0.5" fill={lineColor} opacity={0.4} />
          <rect x="28" y="3" width="48" height="2.5" rx="0.5" fill={lineColor} opacity={0.7} />
          <rect x="28" y="8" width="35" height="1.5" rx="0.5" fill={lineColor} opacity={0.4} />
          <rect x="28" y="12" width="48" height="1.5" rx="0.5" fill={lineColor} opacity={0.3} />
          <rect x="28" y="16" width="48" height="1.5" rx="0.5" fill={lineColor} opacity={0.3} />
          <rect x="28" y="20" width="40" height="1.5" rx="0.5" fill={lineColor} opacity={0.3} />
        </svg>
      );
    }
    // minimal
    return (
      <svg width="80" height="28" viewBox="0 0 80 28" style={{ opacity }}>
        <rect x="20" y="3" width="40" height="2.5" rx="0.5" fill={lineColor} opacity={0.7} />
        <rect x="25" y="8" width="30" height="1.5" rx="0.5" fill={lineColor} opacity={0.4} />
        <line x1="8" y1="12" x2="72" y2="12" stroke={lineColor} strokeWidth="0.5" opacity={0.3} />
        <rect x="4" y="15" width="72" height="1.5" rx="0.5" fill={lineColor} opacity={0.3} />
        <rect x="4" y="19" width="72" height="1.5" rx="0.5" fill={lineColor} opacity={0.3} />
        <rect x="4" y="23" width="55" height="1.5" rx="0.5" fill={lineColor} opacity={0.3} />
      </svg>
    );
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setShowTooltip(false); }}
        aria-label={`${label} template${isLocked ? ' (Pro only)' : ''}`}
        style={{
          width: 100, height: 40, padding: 0,
          background: isDark
            ? (isActive ? 'rgba(26,86,219,0.12)' : hovered ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.05)')
            : (isActive ? 'rgba(26,86,219,0.08)' : hovered ? 'rgba(15,23,42,0.04)' : 'rgba(15,23,42,0.02)'),
          border: isActive
            ? '2px solid #1A56DB'
            : `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
          borderRadius: 6, cursor: isLocked ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        {renderMiniLayout()}
        {isLocked && (
          <div style={{
            position: 'absolute', inset: 0,
            background: isDark ? 'rgba(15,23,42,0.5)' : 'rgba(241,245,249,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={14} color={isDark ? '#94A3B8' : '#64748B'} />
          </div>
        )}
      </button>
      {/* Label below */}
      <div style={{
        textAlign: 'center', fontSize: 10, fontWeight: 500, fontFamily: font,
        color: isActive ? '#1A56DB' : isDark ? '#94A3B8' : '#64748B',
        marginTop: 3, lineHeight: 1,
      }}>
        {label}
      </div>
      {/* Locked tooltip */}
      {showTooltip && isLocked && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 16px)', left: '50%', transform: 'translateX(-50%)',
          width: 220, padding: '8px 12px', borderRadius: 8,
          background: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(248,250,252,0.97)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
          boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(15,23,42,0.12)',
          zIndex: 300, fontSize: 12, fontFamily: font, lineHeight: 1.5,
          color: isDark ? '#F8FAFC' : '#0F172A',
          animation: 'pdf-tooltip-in 0.15s ease-out',
        }}>
          Available on Pro{' '}
          <span style={{ color: '#1A56DB', fontWeight: 600, cursor: 'pointer' }}>
            Upgrade to unlock all templates
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── CV Document Renderer (same as LivePreviewDocument) ────── */
function CvDocument({ cv, template }: { cv: CvData; template: TemplateId }) {
  const allSkills = cv.skills.map(s => s.name);

  if (template === 'sidebar') {
    return (
      <div style={{
        width: A4_WIDTH, minHeight: A4_HEIGHT, background: '#FFFFFF',
        fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'row',
      }}>
        {/* Sidebar */}
        <div style={{
          width: '30%', background: '#0F172A', color: '#F8FAFC', padding: 28,
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, marginBottom: 4 }}>{cv.personal.fullName}</div>
            <div style={{ fontSize: 10, color: '#94A3B8', lineHeight: 1.5 }}>
              {cv.personal.email}<br />
              {cv.personal.phone}<br />
              {cv.personal.location}
            </div>
            {cv.personal.linkedin && <div style={{ fontSize: 10, color: '#3B82F6', marginTop: 4 }}>{cv.personal.linkedin}</div>}
            {cv.personal.portfolio && <div style={{ fontSize: 10, color: '#3B82F6' }}>{cv.personal.portfolio}</div>}
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, borderBottom: '1px solid rgba(148,163,184,0.3)', paddingBottom: 4 }}>Skills</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {allSkills.map(s => (
                <span key={s} style={{ fontSize: 10, lineHeight: 1.4 }}>{s}</span>
              ))}
            </div>
          </div>
          {cv.showCertifications && cv.certifications.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, borderBottom: '1px solid rgba(148,163,184,0.3)', paddingBottom: 4 }}>Certifications</div>
              {cv.certifications.map(c => (
                <span key={c.id} style={{ fontSize: 10, lineHeight: 1.5, display: 'block' }}>{c.label}</span>
              ))}
            </div>
          )}
        </div>
        {/* Main */}
        <div style={{ width: '70%', padding: 28 }}>
          {cv.summary && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #E2E8F0', paddingBottom: 4, marginBottom: 6 }}>Professional Summary</div>
              <p style={{ fontSize: 11, color: '#374151', lineHeight: 1.5, margin: 0 }}>{cv.summary}</p>
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #E2E8F0', paddingBottom: 4, marginBottom: 6 }}>Work Experience</div>
            {cv.workHistory.map(w => (
              <div key={w.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{w.title}</span>
                  <span style={{ fontSize: 10, color: '#64748B' }}>{w.startDate} – {w.endDate}</span>
                </div>
                <div style={{ fontSize: 11, fontStyle: 'italic', color: '#64748B', marginBottom: 4 }}>{w.company}</div>
                <ul style={{ margin: 0, paddingLeft: 14 }}>
                  {w.bullets.filter(b => b.text).map(b => (
                    <li key={b.id} style={{ fontSize: 11, color: '#374151', lineHeight: 1.5, listStyleType: 'disc' }}>{b.text}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #E2E8F0', paddingBottom: 4, marginBottom: 6 }}>Education</div>
            {cv.education.map(e => (
              <div key={e.id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{e.qualification}</span>
                  <span style={{ fontSize: 10, color: '#64748B' }}>{e.dates}</span>
                </div>
                <div style={{ fontSize: 11, color: '#64748B' }}>{e.institution}{e.grade ? ` · ${e.grade}` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (template === 'minimal') {
    return (
      <div style={{ width: A4_WIDTH, minHeight: A4_HEIGHT, background: '#FFFFFF', padding: 36, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>{cv.personal.fullName}</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            {[cv.personal.email, cv.personal.phone, cv.personal.location].filter(Boolean).map((item, i) => (
              <span key={i}>{i > 0 && <span style={{ margin: '0 4px', color: '#CBD5E1' }}>|</span>}{item}</span>
            ))}
          </div>
        </div>
        <div style={{ height: 1, background: '#E2E8F0', margin: '0 0 16px' }} />
        {cv.summary && (
          <>
            <p style={{ fontSize: 11, color: '#374151', lineHeight: 1.6, margin: '0 0 16px' }}>{cv.summary}</p>
            <div style={{ height: 1, background: '#E2E8F0', margin: '0 0 16px' }} />
          </>
        )}
        <div style={{ fontSize: 10, fontWeight: 600, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Skills</div>
        <p style={{ fontSize: 11, color: '#374151', lineHeight: 1.5, margin: '0 0 16px' }}>{allSkills.join(' · ')}</p>
        <div style={{ height: 1, background: '#E2E8F0', margin: '0 0 16px' }} />
        <div style={{ fontSize: 10, fontWeight: 600, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Experience</div>
        {cv.workHistory.map(w => (
          <div key={w.id} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>{w.title}</span>
              <span style={{ fontSize: 10, color: '#64748B' }}>{w.startDate} – {w.endDate}</span>
            </div>
            <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>{w.company}</div>
            {w.bullets.filter(b => b.text).map(b => (
              <div key={b.id} style={{ fontSize: 11, color: '#374151', lineHeight: 1.5, paddingLeft: 12, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0 }}>–</span>{b.text}
              </div>
            ))}
          </div>
        ))}
        <div style={{ height: 1, background: '#E2E8F0', margin: '0 0 16px' }} />
        <div style={{ fontSize: 10, fontWeight: 600, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Education</div>
        {cv.education.map(e => (
          <div key={e.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>{e.qualification}</span>
              <span style={{ fontSize: 10, color: '#64748B' }}>{e.dates}</span>
            </div>
            <div style={{ fontSize: 11, color: '#64748B' }}>{e.institution}{e.grade ? ` · ${e.grade}` : ''}</div>
          </div>
        ))}
      </div>
    );
  }

  /* ── Default: Clean ──────────────────────────────────────────── */
  return (
    <div style={{ width: A4_WIDTH, minHeight: A4_HEIGHT, background: '#FFFFFF', padding: 32, fontFamily: 'Georgia, serif' }}>
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
        <p style={{ fontSize: 11, color: '#374151', lineHeight: 1.5, margin: 0, fontFamily: 'Inter, sans-serif' }}>{allSkills.join(', ')}</p>
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
                <span style={{ position: 'absolute', left: 0 }}>—</span>{b.text}
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
  isOpen, onClose, cv, selectedTemplate, onTemplateChange, isDark, jobTitle, company,
}: PdfPreviewModalProps) {
  const [zoom, setZoom] = useState(75); // percent
  const [downloadState, setDownloadState] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [visible, setVisible] = useState(false); // for animation
  const [docOpacity, setDocOpacity] = useState(1); // fade on template switch
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const documentRef = useRef<HTMLDivElement>(null);
  const prevTemplate = useRef(selectedTemplate);

  /* ─── Open/Close animation ────────────────────────────────── */
  useEffect(() => {
    if (isOpen) {
      // Force re-render then animate in
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  /* ─── Template switch fade ────────────────────────────────── */
  useEffect(() => {
    if (prevTemplate.current !== selectedTemplate) {
      setDocOpacity(0);
      const t = setTimeout(() => setDocOpacity(1), 30);
      prevTemplate.current = selectedTemplate;
      return () => clearTimeout(t);
    }
  }, [selectedTemplate]);

  /* ─── Zoom helpers ────────────────────────────────────────── */
  const zoomIn = () => {
    const idx = ZOOM_STEPS.findIndex(z => z >= zoom);
    if (idx < ZOOM_STEPS.length - 1) setZoom(ZOOM_STEPS[idx + 1]);
  };
  const zoomOut = () => {
    const idx = ZOOM_STEPS.findIndex(z => z >= zoom);
    if (idx > 0) setZoom(ZOOM_STEPS[idx - 1]);
  };

  /* ─── Drag-to-pan when zoomed in ─────────────────────────── */
  const viewerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const handleViewerPointerDown = useCallback((e: React.PointerEvent) => {
    const el = viewerRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y };
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
    e.preventDefault();
  }, [panOffset]);

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

  /* ─── Download PDF ────────────────────────────────────────── */
  const handleDownload = useCallback(async () => {
    if (downloadState === 'generating') return;
    const el = documentRef.current;
    if (!el) return;

    setDownloadState('generating');
    let wrapper: HTMLDivElement | null = null;
    try {
      // Clone the document into an isolated container so html2canvas
      // doesn't encounter any inherited oklch() colours from Tailwind v4.
      wrapper = document.createElement('div');
      // `all: initial` resets every inherited CSS property (including oklch custom props)
      wrapper.style.setProperty('all', 'initial');
      wrapper.style.position = 'fixed';
      wrapper.style.left = '-9999px';
      wrapper.style.top = '0';
      wrapper.style.zIndex = '-1';
      wrapper.style.background = '#FFFFFF';
      wrapper.style.color = '#000000';
      wrapper.style.fontFamily = 'Inter, sans-serif';
      wrapper.style.pointerEvents = 'none';

      const clone = el.cloneNode(true) as HTMLElement;

      // Recursively strip any oklch() values from inline/computed styles
      const stripOklch = (node: HTMLElement) => {
        const style = node.style;
        for (let i = style.length - 1; i >= 0; i--) {
          const prop = style[i];
          const val = style.getPropertyValue(prop);
          if (val && val.includes('oklch')) {
            style.removeProperty(prop);
          }
        }
        // Also override color/background if computed values contain oklch
        const computed = window.getComputedStyle(node);
        const colorProps = ['color', 'background-color', 'border-color', 'outline-color'];
        for (const cp of colorProps) {
          const cv = computed.getPropertyValue(cp);
          if (cv && cv.includes('oklch')) {
            if (cp === 'color') node.style.color = '#000000';
            else if (cp === 'background-color') node.style.backgroundColor = 'transparent';
            else if (cp === 'border-color') node.style.borderColor = 'transparent';
            else if (cp === 'outline-color') node.style.outlineColor = 'transparent';
          }
        }
        for (let i = 0; i < node.children.length; i++) {
          if (node.children[i] instanceof HTMLElement) {
            stripOklch(node.children[i] as HTMLElement);
          }
        }
      };

      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      // Strip oklch after appending so computed styles are available
      stripOklch(clone);

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FFFFFF',
        logging: false,
        width: A4_WIDTH,
        windowWidth: A4_WIDTH,
      });

      // Clean up the temporary clone
      document.body.removeChild(wrapper);
      wrapper = null;

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      // Handle multi-page if content exceeds one page
      let heightLeft = imgHeight;
      let position = 0;
      let page = 0;

      while (heightLeft > 0) {
        if (page > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
        position -= pdfHeight;
        page++;
      }

      const fileName = `${cv.personal.fullName.replace(/\s+/g, '_')}_CV.pdf`;
      pdf.save(fileName);

      setDownloadState('done');
      setTimeout(() => setDownloadState('idle'), 2000);
    } catch (err) {
      console.error('PDF generation error:', err);
      // Clean up wrapper if still in DOM
      if (wrapper && wrapper.parentNode) {
        document.body.removeChild(wrapper);
      }
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

  const scale = zoom / 100;

  const templates: { id: TemplateId; label: string; locked: boolean }[] = [
    { id: 'clean', label: 'Clean', locked: false },
    { id: 'sidebar', label: 'Sidebar', locked: true },
    { id: 'minimal', label: 'Minimal', locked: true },
  ];

  /* ─── Download button content ─────────────────────────────── */
  const downloadBtnContent = () => {
    switch (downloadState) {
      case 'generating':
        return (
          <>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            Generating...
          </>
        );
      case 'done':
        return (
          <>
            <CheckCircle2 size={14} />
            Downloaded!
          </>
        );
      case 'error':
        return (
          <>
            <X size={14} />
            Failed — retry
          </>
        );
      default:
        return (
          <>
            <Download size={14} />
            Download PDF
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
        @keyframes pdf-tooltip-in { from { opacity: 0; transform: translateX(-50%) translateY(-4px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
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
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Modal content wrapper with scale animation */}
        <div style={{
          display: 'flex', flexDirection: 'column', flex: 1,
          transform: visible ? 'scale(1)' : 'scale(0.96)',
          opacity: visible ? 1 : 0,
          transition: 'transform 200ms ease-out, opacity 200ms ease-out',
        }}>
          {/* ── TOP TOOLBAR ─────────────────────────────────────── */}
          <div style={{
            height: 56, flexShrink: 0,
            padding: '0 24px',
            background: isDark ? '#1E293B' : '#FFFFFF',
            borderBottom: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
            display: 'flex', alignItems: 'center',
            transition: 'background 0.2s, border-color 0.2s',
          }}>
            {/* Left: Title */}
            <div style={{ flex: '0 1 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', marginRight: 24, minWidth: 0 }}>
              <span style={{
                fontSize: 16, fontWeight: 600, fontFamily: font, lineHeight: 1.2,
                color: isDark ? '#F8FAFC' : '#0F172A',
              }}>
                CV Preview
              </span>
              <span style={{
                fontSize: 13, fontWeight: 400, fontFamily: font, lineHeight: 1.3,
                color: isDark ? '#94A3B8' : '#64748B',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {jobTitle} — {company}
              </span>
            </div>

            {/* Centre: Template switcher */}
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            }}>
              {templates.map(t => (
                <TemplateThumbnail
                  key={t.id}
                  id={t.id}
                  label={t.label}
                  isActive={selectedTemplate === t.id}
                  isLocked={t.locked}
                  isDark={isDark}
                  onClick={() => onTemplateChange(t.id)}
                />
              ))}
            </div>

            {/* Right: Zoom + Download + Close */}
            <div style={{ flex: '0 1 auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Zoom controls */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 0,
                border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
                borderRadius: 8, overflow: 'hidden',
              }}>
                <button
                  onClick={zoomOut}
                  aria-label="Zoom out"
                  disabled={zoom <= ZOOM_STEPS[0]}
                  style={{
                    background: 'none', border: 'none', cursor: zoom <= ZOOM_STEPS[0] ? 'not-allowed' : 'pointer',
                    padding: '6px 8px', display: 'flex', alignItems: 'center',
                    color: zoom <= ZOOM_STEPS[0] ? (isDark ? '#475569' : '#CBD5E1') : isDark ? '#94A3B8' : '#64748B',
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
                    background: 'none', border: 'none', cursor: zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1] ? 'not-allowed' : 'pointer',
                    padding: '6px 8px', display: 'flex', alignItems: 'center',
                    color: zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1] ? (isDark ? '#475569' : '#CBD5E1') : isDark ? '#94A3B8' : '#64748B',
                    transition: 'color 0.15s',
                  }}
                >
                  <ZoomIn size={14} />
                </button>
              </div>

              {/* Download PDF */}
              <button
                onClick={handleDownload}
                disabled={downloadState === 'generating'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  height: 36, padding: '0 16px',
                  background: downloadBtnBg(),
                  border: 'none', borderRadius: 8,
                  cursor: downloadState === 'generating' ? 'wait' : 'pointer',
                  color: '#FFFFFF', fontSize: 14, fontWeight: 600, fontFamily: font, lineHeight: 1,
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

              {/* Close */}
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

          {/* ── DOCUMENT VIEWER ──────────────────────────────────── */}
          <div
            ref={viewerRef}
            style={{
              flex: 1, overflow: 'hidden', padding: '32px 48px',
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
                  overflow: 'hidden',
                  opacity: docOpacity,
                  transition: 'opacity 200ms ease-out',
                  pointerEvents: 'none',
                }}
              >
                <CvDocument cv={cv} template={selectedTemplate} />
              </div>
            </div>

            {/* Drag hint — always visible */}
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
          </div>
        </div>
      </div>
    </>
  );
}