/**
 * CvEditorScreen — Screen 7: CV Editor + Live Preview
 *
 * Split-panel layout: left editor (58%) / right live A4 preview (42%).
 * Top action bar with breadcrumb, ATS match score, template selector, Preview PDF & Save.
 * Sections: Personal Details, Professional Summary, Skills, Skills Gap Banner,
 *           Work Experience, Education, Certifications & Links.
 * Live preview updates on 300ms debounce.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router';
import {
  ChevronDown, ChevronUp, Plus, X, Save,
  Loader2, CheckCircle2, AlertTriangle, GripVertical, Trash2, Eye,
  FileText, ExternalLink, ToggleLeft, ToggleRight, ArrowLeft, ArrowRight,
  ZoomIn, ZoomOut, Maximize, Move,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { PdfPreviewModal } from './PdfPreviewModal';
import { SharedNavbar } from './SharedNavbar';

const SUPABASE_URL = `https://${projectId}.supabase.co`;

/* ─── Types ──────────────────────────────────────────────────── */
type Theme = 'dark' | 'light';
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

interface ToastItem {
  id: string;
  type: 'success' | 'error';
  message: string;
}

/* ─── Sample Data ────────────────────────────────────────────── */
const INITIAL_CV: CvData = {
  personal: {
    fullName: 'Alex Johnson',
    email: 'alex.johnson@email.com',
    phone: '+44 7700 900123',
    location: 'London, UK',
    linkedin: 'linkedin.com/in/alexjohnson',
    portfolio: 'alexjohnson.dev',
  },
  summary:
    'Senior Frontend Engineer with 7+ years of experience building scalable web applications and design systems. Passionate about developer experience, accessibility, and shipping high-quality products that delight users. Experienced in leading cross-functional teams and mentoring junior engineers.',
  skills: [
    { id: 's1', name: 'React', type: 'matched' },
    { id: 's2', name: 'TypeScript', type: 'matched' },
    { id: 's3', name: 'Node.js', type: 'matched' },
    { id: 's4', name: 'GraphQL', type: 'general' },
    { id: 's5', name: 'CSS / Tailwind', type: 'matched' },
    { id: 's6', name: 'Jest', type: 'general' },
    { id: 's7', name: 'Figma', type: 'general' },
    { id: 's8', name: 'AWS', type: 'general' },
  ],
  skillsGap: ['Docker', 'Kubernetes', 'CI/CD Pipelines'],
  workHistory: [
    {
      id: 'w1', title: 'Senior Frontend Engineer', company: 'Anthropic',
      startDate: 'Jan 2023', endDate: 'Present', expanded: true,
      bullets: [
        { id: 'b1', text: 'Led the redesign of the core product UI serving 50,000+ researchers worldwide' },
        { id: 'b2', text: 'Built a real-time collaboration feature using WebSockets, reducing latency by 40%' },
        { id: 'b3', text: 'Defined and maintained the internal component library used across 4 product teams' },
        { id: 'b4', text: 'Conducted 200+ code reviews and mentored 4 junior engineers through bi-weekly 1:1s' },
      ],
    },
    {
      id: 'w2', title: 'Frontend Engineer', company: 'Vercel',
      startDate: 'Mar 2020', endDate: 'Dec 2022', expanded: false,
      bullets: [
        { id: 'b5', text: 'Contributed to the Next.js dashboard and deployment pipeline UI' },
        { id: 'b6', text: 'Optimised Core Web Vitals across the marketing site, achieving 95+ Lighthouse scores' },
        { id: 'b7', text: 'Shipped the dark mode feature used by 2M+ monthly active users' },
      ],
    },
    {
      id: 'w3', title: 'Frontend Developer', company: 'Monzo',
      startDate: 'Aug 2018', endDate: 'Feb 2020', expanded: false,
      bullets: [
        { id: 'b8', text: 'Built the customer-facing transaction detail and dispute flow in React Native' },
        { id: 'b9', text: 'Reduced app bundle size by 22% through code-splitting and lazy loading' },
      ],
    },
  ],
  education: [
    {
      id: 'e1', institution: 'University of Edinburgh',
      qualification: 'BSc Computer Science', dates: '2014 – 2018',
      grade: 'First Class Honours', expanded: true,
    },
  ],
  certifications: [
    { id: 'c1', label: 'AWS Certified Developer – Associate', url: 'https://aws.amazon.com' },
  ],
  showCertifications: true,
};

/* ─── Helpers ────────────────────────────────────────────────── */
function uid() { return `_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function calcAtsMatch(skills: Skill[]): number {
  const matched = skills.filter(s => s.type === 'matched').length;
  return skills.length > 0 ? Math.round((matched / skills.length) * 100) : 0;
}

/* ─── Shared Styles ──────────────────────────────────────────── */
const font = 'Inter, sans-serif';

function getInputStyle(isDark: boolean, hasError = false): React.CSSProperties {
  return {
    width: '100%', height: 44, padding: '0 12px', boxSizing: 'border-box',
    background: isDark ? '#1E293B' : '#FFFFFF',
    border: `1px solid ${hasError ? '#EF4444' : isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'}`,
    borderRadius: 8, fontSize: 14, fontFamily: font, fontWeight: 400,
    color: isDark ? '#F8FAFC' : '#0F172A', outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };
}

const labelStyle = (isDark: boolean): React.CSSProperties => ({
  fontSize: 11, fontWeight: 500, fontFamily: font,
  letterSpacing: '0.05em', textTransform: 'uppercase',
  color: isDark ? '#94A3B8' : '#64748B', marginBottom: 6, display: 'block', lineHeight: 1.4,
});

const sectionLabelStyle = (isDark: boolean): React.CSSProperties => ({
  fontSize: 11, fontWeight: 600, fontFamily: font,
  letterSpacing: '0.07em', textTransform: 'uppercase',
  color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.4, margin: 0,
});

const cardStyle = (isDark: boolean): React.CSSProperties => ({
  background: isDark ? '#1E293B' : '#FFFFFF',
  border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
  borderRadius: 12, padding: 24,
  transition: 'background 0.2s, border-color 0.2s',
});

/* ─── Toast Stack ────────────────────────────────────────────── */
function ToastStack({ toasts, isDark }: { toasts: ToastItem[]; isDark: boolean }) {
  return (
    <div style={{ position: 'fixed', top: 76, right: 20, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
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
          animation: 'cve-slide-in 0.2s ease-out',
        }}>
          {t.type === 'error'
            ? <AlertTriangle size={15} color="#EF4444" style={{ flexShrink: 0 }} />
            : <CheckCircle2 size={15} color="#10B981" style={{ flexShrink: 0 }} />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── (Navbar moved to SharedNavbar) ─────────────────────────── */

/* ─── Skill Chip ─────────────────────────────────────────────── */
function SkillChip({ skill, isDark, onRemove }: {
  skill: Skill; isDark: boolean; onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const styles: Record<Skill['type'], { bg: string; color: string; border: string }> = {
    matched: { bg: 'rgba(16,185,129,0.15)', color: '#10B981', border: 'rgba(16,185,129,0.3)' },
    general: {
      bg: isDark ? '#263348' : '#F8FAFC',
      color: isDark ? '#94A3B8' : '#64748B',
      border: isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.3)',
    },
    gap: { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: 'rgba(245,158,11,0.3)' },
  };
  const s = styles[skill.type];

  return (
    <span
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '6px 12px', borderRadius: 999,
        background: s.bg, color: s.color,
        border: `1px solid ${s.border}`,
        fontSize: 13, fontWeight: 500, fontFamily: font, lineHeight: 1,
        cursor: 'default', transition: 'opacity 0.15s',
      }}
    >
      {skill.name}
      {hovered && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${skill.name}`}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: s.color, padding: 0, display: 'flex', alignItems: 'center',
            lineHeight: 1, marginLeft: 2,
          }}
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}

/* ─── Add Skill Input (inline) ───────────────────────────────── */
function AddSkillInline({ isDark, onAdd }: { isDark: boolean; onAdd: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onAdd(trimmed);
    setValue('');
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '6px 12px', borderRadius: 999,
          background: 'none',
          border: `1px dashed ${isDark ? 'rgba(148,163,184,0.3)' : 'rgba(148,163,184,0.4)'}`,
          color: isDark ? '#94A3B8' : '#64748B',
          fontSize: 13, fontWeight: 500, fontFamily: font, cursor: 'pointer', lineHeight: 1,
          transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = '#1A56DB';
          e.currentTarget.style.color = '#1A56DB';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = isDark ? 'rgba(148,163,184,0.3)' : 'rgba(148,163,184,0.4)';
          e.currentTarget.style.color = isDark ? '#94A3B8' : '#64748B';
        }}
      >
        <Plus size={12} /> Add skill
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') { setValue(''); setEditing(false); }
      }}
      onBlur={submit}
      placeholder="Type & press Enter"
      style={{
        width: 140, height: 30, padding: '0 10px',
        background: isDark ? '#1E293B' : '#FFFFFF',
        border: `1px solid #1A56DB`, borderRadius: 999,
        fontSize: 13, fontFamily: font, fontWeight: 400,
        color: isDark ? '#F8FAFC' : '#0F172A', outline: 'none',
        boxShadow: '0 0 0 3px rgba(26,86,219,0.25)',
      }}
    />
  );
}

/* ─── Collapsible Role Card ──────────────────────────────────── */
function RoleCard({ role, isDark, onChange, onDelete }: {
  role: WorkRole; isDark: boolean;
  onChange: (updated: WorkRole) => void;
  onDelete: () => void;
}) {
  const toggle = () => onChange({ ...role, expanded: !role.expanded });
  const updateBullet = (bulletId: string, text: string) => {
    onChange({ ...role, bullets: role.bullets.map(b => b.id === bulletId ? { ...b, text } : b) });
  };
  const removeBullet = (bulletId: string) => {
    onChange({ ...role, bullets: role.bullets.filter(b => b.id !== bulletId) });
  };
  const addBullet = () => {
    onChange({ ...role, bullets: [...role.bullets, { id: uid(), text: '' }] });
  };

  const inlineInput = (value: string, placeholder: string, onChange: (v: string) => void, fw = 400, fs = 14): React.CSSProperties => ({
    background: 'none', border: 'none', outline: 'none',
    fontFamily: font, fontWeight: fw, fontSize: fs,
    color: isDark ? '#F8FAFC' : '#0F172A', padding: '4px 0',
    width: '100%', lineHeight: 1.4,
    borderBottom: '1px solid transparent',
    transition: 'border-color 0.15s',
  });

  return (
    <div style={{
      background: isDark ? '#263348' : '#F8FAFC',
      border: `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)'}`,
      borderRadius: 8, padding: 16, marginBottom: 8,
      transition: 'background 0.2s, border-color 0.2s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <GripVertical size={16} color={isDark ? '#64748B' : '#94A3B8'} style={{ cursor: 'grab', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            value={role.title}
            onChange={e => onChange({ ...role, title: e.target.value })}
            placeholder="Job Title"
            style={{
              ...inlineInput(role.title, 'Job Title', () => {}, 600, 14),
              flex: '1 1 140px', minWidth: 120,
            }}
            onFocus={e => e.currentTarget.style.borderBottomColor = '#1A56DB'}
            onBlur={e => e.currentTarget.style.borderBottomColor = 'transparent'}
          />
          <input
            value={role.company}
            onChange={e => onChange({ ...role, company: e.target.value })}
            placeholder="Company"
            style={{
              ...inlineInput(role.company, 'Company', () => {}, 400, 14),
              flex: '1 1 120px', minWidth: 100,
              color: isDark ? '#94A3B8' : '#64748B',
            }}
            onFocus={e => e.currentTarget.style.borderBottomColor = '#1A56DB'}
            onBlur={e => e.currentTarget.style.borderBottomColor = 'transparent'}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <input
              value={role.startDate}
              onChange={e => onChange({ ...role, startDate: e.target.value })}
              placeholder="Start"
              style={{
                ...inlineInput(role.startDate, 'Start', () => {}, 400, 13),
                width: 80, textAlign: 'center',
                color: isDark ? '#94A3B8' : '#64748B',
              }}
              onFocus={e => e.currentTarget.style.borderBottomColor = '#1A56DB'}
              onBlur={e => e.currentTarget.style.borderBottomColor = 'transparent'}
            />
            <span style={{ color: isDark ? '#64748B' : '#94A3B8', fontSize: 12 }}>–</span>
            <input
              value={role.endDate}
              onChange={e => onChange({ ...role, endDate: e.target.value })}
              placeholder="End"
              style={{
                ...inlineInput(role.endDate, 'End', () => {}, 400, 13),
                width: 80, textAlign: 'center',
                color: isDark ? '#94A3B8' : '#64748B',
              }}
              onFocus={e => e.currentTarget.style.borderBottomColor = '#1A56DB'}
              onBlur={e => e.currentTarget.style.borderBottomColor = 'transparent'}
            />
          </div>
        </div>
        <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDark ? '#94A3B8' : '#64748B', padding: 4, display: 'flex', lineHeight: 1 }}>
          {role.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Body */}
      {role.expanded && (
        <div style={{ marginTop: 12, paddingLeft: 24 }}>
          {role.bullets.map(bullet => (
            <div key={bullet.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <GripVertical size={14} color={isDark ? '#64748B' : '#94A3B8'} style={{ cursor: 'grab', flexShrink: 0, marginTop: 6 }} />
              <textarea
                value={bullet.text}
                onChange={e => updateBullet(bullet.id, e.target.value)}
                placeholder="Describe an achievement…"
                rows={1}
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none',
                  fontFamily: font, fontSize: 14, fontWeight: 400,
                  color: isDark ? '#F8FAFC' : '#0F172A', padding: '4px 0', lineHeight: 1.5,
                  borderBottom: `1px solid ${isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.12)'}`,
                  transition: 'border-color 0.15s', overflow: 'hidden',
                  minHeight: 28, fieldSizing: 'content' as any,
                }}
                onFocus={e => e.currentTarget.style.borderBottomColor = '#1A56DB'}
                onBlur={e => e.currentTarget.style.borderBottomColor = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.12)'}
              />
              <button
                onClick={() => removeBullet(bullet.id)}
                aria-label="Delete bullet"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: isDark ? '#64748B' : '#94A3B8', padding: 4, display: 'flex', lineHeight: 1,
                  flexShrink: 0, marginTop: 2, transition: 'color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                onMouseLeave={e => (e.currentTarget.style.color = isDark ? '#64748B' : '#94A3B8')}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={addBullet}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#1A56DB', fontSize: 13, fontWeight: 500, fontFamily: font,
              padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1,
              marginTop: 4,
            }}
          >
            <Plus size={12} /> Add bullet
          </button>
          <button
            onClick={onDelete}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#EF4444', fontSize: 12, fontWeight: 500, fontFamily: font,
              padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1,
              marginTop: 8, opacity: 0.8,
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.8')}
          >
            <Trash2 size={12} /> Delete this role
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Education Card ─────────────────────────────────────────── */
function EducationCard({ edu, isDark, onChange, onDelete }: {
  edu: Education; isDark: boolean;
  onChange: (updated: Education) => void;
  onDelete: () => void;
}) {
  const toggle = () => onChange({ ...edu, expanded: !edu.expanded });

  return (
    <div style={{
      background: isDark ? '#263348' : '#F8FAFC',
      border: `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)'}`,
      borderRadius: 8, padding: 16, marginBottom: 8,
      transition: 'background 0.2s, border-color 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <GripVertical size={16} color={isDark ? '#64748B' : '#94A3B8'} style={{ cursor: 'grab', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, fontFamily: font, color: isDark ? '#F8FAFC' : '#0F172A' }}>
          {edu.qualification || 'New Education'}
        </span>
        <span style={{ fontSize: 13, fontFamily: font, color: isDark ? '#94A3B8' : '#64748B', flexShrink: 0 }}>
          {edu.dates}
        </span>
        <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDark ? '#94A3B8' : '#64748B', padding: 4, display: 'flex', lineHeight: 1 }}>
          {edu.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {edu.expanded && (
        <div style={{ marginTop: 12, paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="cve-input-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle(isDark)}>Institution</label>
              <input
                value={edu.institution}
                onChange={e => onChange({ ...edu, institution: e.target.value })}
                placeholder="University name"
                style={getInputStyle(isDark)}
                onFocus={e => { e.currentTarget.style.borderColor = '#1A56DB'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>
            <div>
              <label style={labelStyle(isDark)}>Qualification</label>
              <input
                value={edu.qualification}
                onChange={e => onChange({ ...edu, qualification: e.target.value })}
                placeholder="e.g. BSc Computer Science"
                style={getInputStyle(isDark)}
                onFocus={e => { e.currentTarget.style.borderColor = '#1A56DB'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>
          </div>
          <div className="cve-input-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle(isDark)}>Dates</label>
              <input
                value={edu.dates}
                onChange={e => onChange({ ...edu, dates: e.target.value })}
                placeholder="e.g. 2014 – 2018"
                style={getInputStyle(isDark)}
                onFocus={e => { e.currentTarget.style.borderColor = '#1A56DB'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>
            <div>
              <label style={labelStyle(isDark)}>Grade</label>
              <input
                value={edu.grade}
                onChange={e => onChange({ ...edu, grade: e.target.value })}
                placeholder="e.g. First Class Honours"
                style={getInputStyle(isDark)}
                onFocus={e => { e.currentTarget.style.borderColor = '#1A56DB'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>
          </div>
          <button
            onClick={onDelete}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#EF4444', fontSize: 12, fontWeight: 500, fontFamily: font,
              padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1,
              opacity: 0.8, alignSelf: 'flex-start',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.8')}
          >
            <Trash2 size={12} /> Delete this education
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Live Preview Document ──────────────────────────────────── */
function LivePreviewDocument({ cv, template }: { cv: CvData; template: TemplateId }) {
  const allSkills = cv.skills.map(s => s.name);

  if (template === 'sidebar') {
    return (
      <div style={{
        width: 794, minHeight: 1123, background: '#FFFFFF', fontFamily: 'Inter, sans-serif',
        display: 'flex', flexDirection: 'row',
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
        {/* Main content */}
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
      <div style={{ width: 794, minHeight: 1123, background: '#FFFFFF', padding: 36, fontFamily: 'Inter, sans-serif' }}>
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

  // Default: clean template
  return (
    <div style={{ width: 794, minHeight: 1123, background: '#FFFFFF', padding: 32, fontFamily: 'Georgia, serif' }}>
      {/* Name & contact */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', fontFamily: 'Inter, sans-serif' }}>{cv.personal.fullName}</div>
        <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, fontFamily: 'Inter, sans-serif', display: 'flex', gap: 0, flexWrap: 'wrap' }}>
          {[cv.personal.email, cv.personal.phone, cv.personal.location, cv.personal.linkedin, cv.personal.portfolio]
            .filter(Boolean)
            .map((item, i) => (
              <span key={i}>{i > 0 && <span style={{ margin: '0 6px', color: '#CBD5E1' }}>·</span>}{item}</span>
            ))}
        </div>
      </div>

      {/* Summary */}
      {cv.summary && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #E2E8F0', paddingBottom: 4, marginBottom: 6, fontFamily: 'Inter, sans-serif' }}>Professional Summary</div>
          <p style={{ fontSize: 11, color: '#374151', lineHeight: 1.5, margin: 0, fontFamily: 'Inter, sans-serif' }}>{cv.summary}</p>
        </div>
      )}

      {/* Skills */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #E2E8F0', paddingBottom: 4, marginBottom: 6, fontFamily: 'Inter, sans-serif' }}>Skills</div>
        <p style={{ fontSize: 11, color: '#374151', lineHeight: 1.5, margin: 0, fontFamily: 'Inter, sans-serif' }}>{allSkills.join(', ')}</p>
      </div>

      {/* Work History */}
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

      {/* Education */}
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

      {/* Certifications */}
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
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export function CvEditorScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: generatedCvId } = useParams<{ id: string }>();
  const [jobTitle, setJobTitle] = useState(searchParams.get('job') || 'Software Engineer');
  const [company, setCompany] = useState(searchParams.get('company') || 'Acme Corp');
  const [applicationId, setApplicationId] = useState<string | null>(searchParams.get('appId') || null);
  const [isLoadingCv, setIsLoadingCv] = useState(!!generatedCvId);

  /* ─── Theme ───────────────────────────────────────────────── */
  const [theme, setTheme] = useState<Theme>(() =>
    (typeof window !== 'undefined' && (localStorage.getItem('jobbo-theme') as Theme)) || 'dark'
  );
  const isDark = theme === 'dark';
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('jobbo-theme', theme);
  }, [theme]);

  /* ─── CV Data ─────────────────────────────────────────────── */
  const [cv, setCv] = useState<CvData>(INITIAL_CV);
  const [savedCv, setSavedCv] = useState<CvData>(INITIAL_CV);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('clean');

  /* ─── Load Generated CV by ID ──────────────────────────────── */
  useEffect(() => {
    if (!generatedCvId) return;
    let cancelled = false;

    const loadGeneratedCv = async () => {
      setIsLoadingCv(true);
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/make-server-3bbff5cf/generated-cv/${generatedCvId}`,
          {
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
              'apikey': publicAnonKey,
            },
          }
        );
        const data = await res.json();
        if (cancelled) return;

        if (data.success && data.cv_json) {
          const raw = data.cv_json;
          // Map server CV JSON shape → CvData
          const loaded: CvData = {
            personal: {
              fullName: raw.name || '',
              email: raw.email || '',
              phone: raw.phone || '',
              location: raw.location || '',
              linkedin: raw.linkedin || '',
              portfolio: raw.portfolio || '',
            },
            summary: raw.summary || '',
            skills: (raw.skills || []).map((s: string, i: number) => ({
              id: `s${i}`,
              name: s,
              type: 'matched' as const,
            })),
            skillsGap: raw.skills_gap || [],
            workHistory: (raw.work_history || []).map((w: any, i: number) => ({
              id: `w${i}`,
              title: w.title || '',
              company: w.company || '',
              startDate: w.start_date || '',
              endDate: w.end_date || '',
              bullets: (w.bullets || []).map((b: string, j: number) => ({
                id: `b${i}_${j}`,
                text: b,
              })),
              expanded: i === 0,
            })),
            education: (raw.education || []).map((e: any, i: number) => ({
              id: `e${i}`,
              institution: e.institution || '',
              qualification: e.qualification || '',
              dates: e.dates || '',
              grade: e.grade || '',
              expanded: i === 0,
            })),
            certifications: (raw.certifications || []).map((c: string, i: number) => ({
              id: `c${i}`,
              label: typeof c === 'string' ? c : (c as any).label || '',
              url: typeof c === 'string' ? '' : (c as any).url || '',
            })),
            showCertifications: (raw.certifications || []).length > 0,
          };
          setCv(loaded);
          setSavedCv(loaded);
          if (data.template) setSelectedTemplate(data.template as TemplateId);
          if (data.job_title) setJobTitle(data.job_title);
          if (data.company) setCompany(data.company);
          if (data.application_id) setApplicationId(data.application_id);
        } else {
          console.error('Failed to load generated CV:', data);
        }
      } catch (err) {
        console.error('Error loading generated CV:', err);
      } finally {
        if (!cancelled) setIsLoadingCv(false);
      }
    };

    loadGeneratedCv();
    return () => { cancelled = true; };
  }, [generatedCvId]);

  /* ─── Save State ──────────────────────────────────────────── */
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const hasUnsavedChanges = JSON.stringify(cv) !== JSON.stringify(savedCv);

  /* ─── Toasts ──────────────────────────────────────────────── */
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const addToast = useCallback((type: ToastItem['type'], message: string) => {
    const id = uid();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  /* ─── Preview debounce ────────────────────────────────────── */
  const [previewCv, setPreviewCv] = useState<CvData>(cv);
  const [previewOpacity, setPreviewOpacity] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    setPreviewOpacity(0.7);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreviewCv(cv);
      setPreviewOpacity(1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [cv]);

  /* ─── ATS Match ───────────────────────────────────────────── */
  const atsMatch = useMemo(() => calcAtsMatch(cv.skills), [cv.skills]);
  const atsColor = atsMatch >= 80 ? '#10B981' : atsMatch >= 60 ? '#F59E0B' : '#EF4444';

  /* ─── Preview Scale ───────────────────────────────────────── */
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [basePreviewScale, setBasePreviewScale] = useState(0.5);
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = fit, >1 = zoomed in
  const previewScale = basePreviewScale * zoomLevel;
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width - 32; // padding
        setBasePreviewScale(Math.min(w / 794, 0.75));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ─── Preview Pan (drag-to-move when zoomed) ─────────────── */
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const isZoomedIn = zoomLevel > 1;

  const handleZoomIn = useCallback(() => {
    setZoomLevel(z => Math.min(z + 0.25, 3));
  }, []);
  const handleZoomOut = useCallback(() => {
    setZoomLevel(z => {
      const next = Math.max(z - 0.25, 1);
      if (next <= 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);
  const handleZoomReset = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handlePreviewPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isZoomedIn) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...panOffset };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }, [isZoomedIn, panOffset]);

  const handlePreviewPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanOffset({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy });
  }, []);

  const handlePreviewPointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  /* ─── Section highlight ───────────────────────────────────── */
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightSection = (key: string) => {
    const el = sectionRefs.current[key];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.boxShadow = '0 0 0 2px #1A56DB';
    setTimeout(() => { el.style.boxShadow = 'none'; }, 1200);
  };

  /* ─── Updaters ────────────────────────────────────────────── */
  const updatePersonal = (field: keyof PersonalDetails, value: string) => {
    setCv(prev => ({ ...prev, personal: { ...prev.personal, [field]: value } }));
  };
  const updateSummary = (value: string) => setCv(prev => ({ ...prev, summary: value }));
  const removeSkill = (id: string) => setCv(prev => ({ ...prev, skills: prev.skills.filter(s => s.id !== id) }));
  const addSkill = (name: string) => setCv(prev => ({ ...prev, skills: [...prev.skills, { id: uid(), name, type: 'general' }] }));
  const addGapSkill = (name: string) => {
    setCv(prev => ({
      ...prev,
      skills: [...prev.skills, { id: uid(), name, type: 'matched' }],
      skillsGap: prev.skillsGap.filter(s => s !== name),
    }));
  };
  const updateRole = (updated: WorkRole) => {
    setCv(prev => ({ ...prev, workHistory: prev.workHistory.map(w => w.id === updated.id ? updated : w) }));
  };
  const deleteRole = (id: string) => setCv(prev => ({ ...prev, workHistory: prev.workHistory.filter(w => w.id !== id) }));
  const addRole = () => {
    const newRole: WorkRole = { id: uid(), title: '', company: '', startDate: '', endDate: '', bullets: [{ id: uid(), text: '' }], expanded: true };
    setCv(prev => ({ ...prev, workHistory: [...prev.workHistory, newRole] }));
  };
  const updateEdu = (updated: Education) => {
    setCv(prev => ({ ...prev, education: prev.education.map(e => e.id === updated.id ? updated : e) }));
  };
  const deleteEdu = (id: string) => setCv(prev => ({ ...prev, education: prev.education.filter(e => e.id !== id) }));
  const addEdu = () => {
    const newEdu: Education = { id: uid(), institution: '', qualification: '', dates: '', grade: '', expanded: true };
    setCv(prev => ({ ...prev, education: [...prev.education, newEdu] }));
  };
  const updateCert = (id: string, field: 'label' | 'url', value: string) => {
    setCv(prev => ({ ...prev, certifications: prev.certifications.map(c => c.id === id ? { ...c, [field]: value } : c) }));
  };
  const removeCert = (id: string) => setCv(prev => ({ ...prev, certifications: prev.certifications.filter(c => c.id !== id) }));
  const addCert = () => setCv(prev => ({ ...prev, certifications: [...prev.certifications, { id: uid(), label: '', url: '' }] }));
  const toggleCerts = () => setCv(prev => ({ ...prev, showCertifications: !prev.showCertifications }));

  /* ─── Save ────────────────────────────────────────────────── */
  const handleSave = async () => {
    setSaveState('saving');
    await new Promise(r => setTimeout(r, 800)); // simulate
    setSavedCv(cv);
    setSaveState('saved');
    addToast('success', 'CV saved successfully');
    setTimeout(() => setSaveState('idle'), 2000);
  };

  /* ─── Logout ──────────────────────────────────────────────── */
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  /* ─── PDF Preview Modal ───────────────────────────────────── */
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);

  /* ─── Template dropdown ───────────────────────────────────── */
  const [templateOpen, setTemplateOpen] = useState(false);
  const templateRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!templateOpen) return;
    const handler = (e: MouseEvent) => {
      if (templateRef.current && !templateRef.current.contains(e.target as Node)) setTemplateOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [templateOpen]);

  const TEMPLATES: { id: TemplateId; label: string }[] = [
    { id: 'clean', label: 'Clean' },
    { id: 'sidebar', label: 'Sidebar' },
    { id: 'minimal', label: 'Minimal' },
  ];

  /* ─── Focus ring helper ───────────────────────────────────── */
  const focusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = '#1A56DB';
      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)';
      e.currentTarget.style.boxShadow = 'none';
    },
  };

  return (
    <div style={{
      fontFamily: font, minHeight: '100vh',
      background: isDark
        ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)'
        : 'linear-gradient(135deg, #F1F5F9 0%, #EFF6FF 50%, #F1F5F9 100%)',
      transition: 'background 0.3s',
    }}>
      {/* Keyframes */}
      <style>{`
        @keyframes cve-slide-in { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes cve-card-in { from { transform: scale(0.96); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes cve-glow { 0%,100% { box-shadow: none; } 50% { box-shadow: 0 0 0 2px #1A56DB; } }
        .cve-editor::-webkit-scrollbar { width: 6px; }
        .cve-editor::-webkit-scrollbar-track { background: transparent; }
        .cve-editor::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.3); border-radius: 3px; }
        .cve-editor::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.5); }
        @media (max-width: 1024px) {
          .cve-split { flex-direction: column !important; min-height: auto !important; }
          .cve-left, .cve-right { width: 100% !important; max-width: 100% !important; }
          .cve-left { overflow-y: visible !important; height: auto !important; }
          .cve-right {
            position: relative !important; top: auto !important; height: auto !important;
            min-height: auto !important; overflow: hidden !important;
            display: flex !important; justify-content: center !important;
            align-items: flex-start !important; padding: 16px !important;
          }
          .cve-divider { display: none !important; }
        }
        @media (max-width: 768px) {
          .cve-action-bar {
            flex-wrap: wrap !important; gap: 8px !important; height: auto !important;
            padding: 10px 16px !important; justify-content: flex-start !important;
          }
          .cve-action-left { flex: 0 1 auto !important; }
          .cve-action-right { flex-wrap: wrap !important; gap: 6px !important; width: 100% !important; justify-content: flex-start !important; }
          .cve-action-right button { font-size: 12px !important; padding: 0 10px !important; height: 32px !important; }
          .cve-back-label { display: none !important; }
          .cve-left { padding: 16px !important; }
          .cve-right { padding: 12px !important; }
          .cve-input-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <ToastStack toasts={toasts} isDark={isDark} />

      {/* Loading overlay when fetching generated CV */}
      {isLoadingCv && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: isDark ? 'rgba(15,23,42,0.85)' : 'rgba(248,250,252,0.85)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <Loader2 size={36} color="#1A56DB" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ fontFamily: font, fontSize: 16, fontWeight: 500, color: isDark ? '#F8FAFC' : '#0F172A' }}>
            Loading your tailored CV...
          </p>
        </div>
      )}

      {/* Nav */}
      <SharedNavbar isDark={isDark} onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />

      {/* Action Bar */}
      <div className="cve-action-bar" style={{
        minHeight: 56, padding: '0 24px',
        background: isDark ? '#1E293B' : '#FFFFFF',
        borderBottom: `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'background 0.2s, border-color 0.2s',
        flexWrap: 'wrap', gap: 8,
      }}>
        {/* Left: Back + Breadcrumb */}
        <div className="cve-action-left" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 0%' }}>
          {applicationId && (
            <button
              onClick={() => navigate(`/new-application?appId=${applicationId}`)}
              aria-label="Back to Application"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 32, padding: '0 12px',
                background: 'none',
                border: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)'}`,
                borderRadius: 8, cursor: 'pointer',
                color: isDark ? '#94A3B8' : '#64748B',
                fontSize: 13, fontWeight: 500, fontFamily: font, lineHeight: 1,
                transition: 'border-color 0.15s, color 0.15s, background 0.15s',
                whiteSpace: 'nowrap', flexShrink: 0,
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
              <ArrowLeft size={14} />
              <span className="cve-back-label">Back to Application</span>
            </button>
          )}
        </div>

        {/* ATS Badge (center) */}
        <div style={{
          padding: '4px 12px', borderRadius: 999,
          background: `${atsColor}20`, color: atsColor,
          fontSize: 14, fontWeight: 600, fontFamily: font, lineHeight: 1.3,
          border: `1px solid ${atsColor}40`, whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {atsMatch}% ATS Match
        </div>

        {/* Right actions */}
        <div className="cve-action-right" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {/* Template Selector */}
          <div ref={templateRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setTemplateOpen(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 36, padding: '0 12px',
                background: 'none',
                border: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)'}`,
                borderRadius: 8, cursor: 'pointer',
                color: isDark ? '#F8FAFC' : '#0F172A',
                fontSize: 13, fontWeight: 500, fontFamily: font, lineHeight: 1,
                transition: 'border-color 0.15s',
              }}
            >
              <FileText size={14} />
              {TEMPLATES.find(t => t.id === selectedTemplate)?.label}
              <ChevronDown size={13} style={{ color: isDark ? '#94A3B8' : '#64748B' }} />
            </button>
            {templateOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 160, zIndex: 200,
                background: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(248,250,252,0.97)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
                borderRadius: 8, padding: 4,
                boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(15,23,42,0.1)',
                animation: 'cve-card-in 0.15s ease-out',
              }}>
                {TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedTemplate(t.id); setTemplateOpen(false); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 10px', background: selectedTemplate === t.id ? (isDark ? 'rgba(26,86,219,0.15)' : 'rgba(26,86,219,0.08)') : 'none',
                      border: 'none', borderRadius: 6, cursor: 'pointer',
                      color: selectedTemplate === t.id ? '#1A56DB' : isDark ? '#F8FAFC' : '#0F172A',
                      fontSize: 13, fontWeight: 500, fontFamily: font, lineHeight: 1.3,
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { if (selectedTemplate !== t.id) e.currentTarget.style.background = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)'; }}
                    onMouseLeave={e => { if (selectedTemplate !== t.id) e.currentTarget.style.background = 'none'; }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Preview PDF */}
          <button
            onClick={() => setPdfPreviewOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 36, padding: '0 14px',
              background: 'none',
              border: `1px solid #1A56DB`, borderRadius: 8, cursor: 'pointer',
              color: '#1A56DB', fontSize: 13, fontWeight: 500, fontFamily: font, lineHeight: 1,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,86,219,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <Eye size={14} /> Preview PDF
          </button>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saveState === 'saving'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, position: 'relative',
              height: 36, padding: '0 16px',
              background: saveState === 'saved' ? '#10B981' : '#1A56DB',
              border: 'none', borderRadius: 8, cursor: saveState === 'saving' ? 'wait' : 'pointer',
              color: '#FFFFFF', fontSize: 13, fontWeight: 600, fontFamily: font, lineHeight: 1,
              transition: 'background 0.2s, transform 0.1s',
            }}
            onMouseEnter={e => { if (saveState === 'idle') e.currentTarget.style.background = '#1E40AF'; }}
            onMouseLeave={e => { if (saveState === 'idle') e.currentTarget.style.background = '#1A56DB'; }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {hasUnsavedChanges && saveState === 'idle' && (
              <span style={{
                position: 'absolute', top: -3, right: -3,
                width: 8, height: 8, borderRadius: '50%',
                background: '#F59E0B', border: '2px solid ' + (isDark ? '#1E293B' : '#FFFFFF'),
              }} />
            )}
            {saveState === 'saving' && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {saveState === 'saved' && <CheckCircle2 size={14} />}
            {saveState === 'idle' && <Save size={14} />}
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save'}
          </button>

          {/* Generate Cover Letter */}
          {applicationId && generatedCvId && (
            <button
              onClick={() => navigate(`/cover-letter/${applicationId}/${generatedCvId}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 36, padding: '0 14px',
                background: '#1A56DB',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                color: '#FFFFFF', fontSize: 13, fontWeight: 600, fontFamily: font, lineHeight: 1,
                transition: 'background 0.15s, transform 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#1E40AF')}
              onMouseLeave={e => (e.currentTarget.style.background = '#1A56DB')}
              onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
              onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              Generate Cover Letter <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Split Panel */}
      <div className="cve-split" style={{ display: 'flex', minHeight: 'calc(100vh - 116px)' }}>
        {/* Left Panel — Editor */}
        <div
          className="cve-left cve-editor"
          style={{
            width: '58%', overflowY: 'auto', padding: 24,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}
        >
          {/* Page Header — Job Title & Company */}
          <div style={{ marginBottom: 4 }}>
            <p style={{
              margin: '0 0 6px', fontSize: 13, fontWeight: 400, fontFamily: font,
              color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.4,
            }}>
              <button
                onClick={() => navigate('/dashboard')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, fontFamily: font,
                  padding: 0, lineHeight: 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
              >
                Dashboard
              </button>
              {' / CV Editor'}
            </p>
            <h1 style={{
              margin: 0, fontSize: 28, fontWeight: 600, fontFamily: font,
              color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.2,
            }}>
              {jobTitle || 'CV Editor'}
            </h1>
            {company && (
              <p style={{
                margin: '4px 0 0', fontSize: 14, fontWeight: 400, fontFamily: font,
                color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.4,
              }}>
                {company}
              </p>
            )}
          </div>

          {/* PERSONAL DETAILS */}
          <div ref={el => { sectionRefs.current['personal'] = el; }} style={{ ...cardStyle(isDark), transition: 'background 0.2s, border-color 0.2s, box-shadow 0.6s' }}>
            <p style={sectionLabelStyle(isDark)}>Personal Details</p>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle(isDark)}>Full Name</label>
                <input value={cv.personal.fullName} onChange={e => updatePersonal('fullName', e.target.value)} placeholder="Full Name" style={getInputStyle(isDark)} {...focusHandlers} />
              </div>
              <div className="cve-input-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle(isDark)}>Email</label>
                  <input value={cv.personal.email} onChange={e => updatePersonal('email', e.target.value)} placeholder="Email" style={getInputStyle(isDark)} {...focusHandlers} />
                </div>
                <div>
                  <label style={labelStyle(isDark)}>Phone</label>
                  <input value={cv.personal.phone} onChange={e => updatePersonal('phone', e.target.value)} placeholder="Phone" style={getInputStyle(isDark)} {...focusHandlers} />
                </div>
              </div>
              <div className="cve-input-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle(isDark)}>Location</label>
                  <input value={cv.personal.location} onChange={e => updatePersonal('location', e.target.value)} placeholder="Location" style={getInputStyle(isDark)} {...focusHandlers} />
                </div>
                <div>
                  <label style={labelStyle(isDark)}>LinkedIn URL</label>
                  <input value={cv.personal.linkedin} onChange={e => updatePersonal('linkedin', e.target.value)} placeholder="linkedin.com/in/..." style={getInputStyle(isDark)} {...focusHandlers} />
                </div>
              </div>
              <div>
                <label style={labelStyle(isDark)}>Portfolio URL</label>
                <input value={cv.personal.portfolio} onChange={e => updatePersonal('portfolio', e.target.value)} placeholder="yoursite.com" style={getInputStyle(isDark)} {...focusHandlers} />
              </div>
            </div>
          </div>

          {/* PROFESSIONAL SUMMARY */}
          <div ref={el => { sectionRefs.current['summary'] = el; }} style={{ ...cardStyle(isDark), transition: 'background 0.2s, border-color 0.2s, box-shadow 0.6s' }}>
            <p style={sectionLabelStyle(isDark)}>Professional Summary</p>
            <div style={{ marginTop: 16 }}>
              <textarea
                value={cv.summary}
                onChange={e => { if (e.target.value.length <= 600) updateSummary(e.target.value); }}
                placeholder="Write a concise professional summary…"
                rows={5}
                style={{
                  ...getInputStyle(isDark),
                  height: 120, padding: 12, resize: 'vertical',
                  lineHeight: 1.5,
                }}
                {...focusHandlers}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 12, fontFamily: font, color: isDark ? '#64748B' : '#94A3B8' }}>
                  Aim for 3–5 sentences
                </span>
                <span style={{ fontSize: 12, fontFamily: font, color: cv.summary.length > 550 ? '#F59E0B' : isDark ? '#64748B' : '#94A3B8' }}>
                  {cv.summary.length} / 600
                </span>
              </div>
            </div>
          </div>

          {/* SKILLS */}
          <div ref={el => { sectionRefs.current['skills'] = el; }} style={{ ...cardStyle(isDark), transition: 'background 0.2s, border-color 0.2s, box-shadow 0.6s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ ...sectionLabelStyle(isDark), flex: 1 }}>Skills</p>
              <span style={{
                padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500, fontFamily: font,
                background: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.15)',
                color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.6,
              }}>
                {cv.skills.length}
              </span>
            </div>
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {cv.skills.map(skill => (
                <SkillChip key={skill.id} skill={skill} isDark={isDark} onRemove={() => removeSkill(skill.id)} />
              ))}
              <AddSkillInline isDark={isDark} onAdd={addSkill} />
            </div>
          </div>

          {/* SKILLS GAP BANNER */}
          {cv.skillsGap.length > 0 && (
            <div style={{
              background: 'rgba(245,158,11,0.08)',
              borderLeft: '3px solid #F59E0B',
              borderRadius: 8, padding: '12px 16px',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <AlertTriangle size={16} color="#F59E0B" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, fontFamily: font, color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.5 }}>
                <span>Missing keywords from this job: </span>
                {cv.skillsGap.map((skill, i) => (
                  <span key={skill}>
                    <button
                      onClick={() => addGapSkill(skill)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#F59E0B', fontWeight: 700, fontFamily: font, fontSize: 13,
                        padding: 0, textDecoration: 'underline', lineHeight: 1.5,
                      }}
                    >
                      {skill}
                    </button>
                    {i < cv.skillsGap.length - 1 && ', '}
                  </span>
                ))}
                <span style={{ color: '#1A56DB', fontWeight: 500, marginLeft: 4, cursor: 'pointer' }}
                  onClick={() => highlightSection('skills')}
                >
                  Add them above ↑
                </span>
              </div>
            </div>
          )}

          {/* WORK EXPERIENCE */}
          <div ref={el => { sectionRefs.current['work'] = el; }} style={{ ...cardStyle(isDark), transition: 'background 0.2s, border-color 0.2s, box-shadow 0.6s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <p style={{ ...sectionLabelStyle(isDark), flex: 1 }}>Work Experience</p>
              <button
                onClick={addRole}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#1A56DB', fontSize: 13, fontWeight: 500, fontFamily: font,
                  display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1, padding: 0,
                }}
              >
                <Plus size={14} /> Add Role
              </button>
            </div>
            {cv.workHistory.map(role => (
              <RoleCard key={role.id} role={role} isDark={isDark} onChange={updateRole} onDelete={() => deleteRole(role.id)} />
            ))}
            {cv.workHistory.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: isDark ? '#64748B' : '#94A3B8', fontSize: 13, fontFamily: font }}>
                No work experience added yet. Click "Add Role" to get started.
              </div>
            )}
          </div>

          {/* EDUCATION */}
          <div ref={el => { sectionRefs.current['education'] = el; }} style={{ ...cardStyle(isDark), transition: 'background 0.2s, border-color 0.2s, box-shadow 0.6s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <p style={{ ...sectionLabelStyle(isDark), flex: 1 }}>Education</p>
              <button
                onClick={addEdu}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#1A56DB', fontSize: 13, fontWeight: 500, fontFamily: font,
                  display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1, padding: 0,
                }}
              >
                <Plus size={14} /> Add Education
              </button>
            </div>
            {cv.education.map(edu => (
              <EducationCard key={edu.id} edu={edu} isDark={isDark} onChange={updateEdu} onDelete={() => deleteEdu(edu.id)} />
            ))}
            {cv.education.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: isDark ? '#64748B' : '#94A3B8', fontSize: 13, fontFamily: font }}>
                No education added yet. Click "Add Education" to get started.
              </div>
            )}
          </div>

          {/* CERTIFICATIONS & LINKS */}
          <div ref={el => { sectionRefs.current['certs'] = el; }} style={{ ...cardStyle(isDark), transition: 'background 0.2s, border-color 0.2s, box-shadow 0.6s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ ...sectionLabelStyle(isDark), flex: 1 }}>Certifications & Links</p>
              <button
                onClick={toggleCerts}
                aria-label="Toggle certifications section"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: cv.showCertifications ? '#1A56DB' : isDark ? '#64748B' : '#94A3B8',
                  display: 'flex', alignItems: 'center', lineHeight: 1, padding: 0,
                }}
              >
                {cv.showCertifications ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
              </button>
            </div>
            {cv.showCertifications && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cv.certifications.map(cert => (
                  <div key={cert.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <input
                        value={cert.label}
                        onChange={e => updateCert(cert.id, 'label', e.target.value)}
                        placeholder="Certificate name"
                        style={getInputStyle(isDark)}
                        {...focusHandlers}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <input
                        value={cert.url}
                        onChange={e => updateCert(cert.id, 'url', e.target.value)}
                        placeholder="URL (optional)"
                        style={getInputStyle(isDark)}
                        {...focusHandlers}
                      />
                    </div>
                    <button
                      onClick={() => removeCert(cert.id)}
                      aria-label="Remove certification"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: isDark ? '#64748B' : '#94A3B8', padding: 4, display: 'flex', lineHeight: 1,
                        flexShrink: 0, transition: 'color 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = isDark ? '#64748B' : '#94A3B8')}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={addCert}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#1A56DB', fontSize: 13, fontWeight: 500, fontFamily: font,
                    display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1, padding: '4px 0',
                  }}
                >
                  <Plus size={12} /> Add entry
                </button>
              </div>
            )}
          </div>

          {/* Bottom spacer */}
          <div style={{ height: 48 }} />
        </div>

        {/* Divider */}
        <div className="cve-divider" style={{
          width: 1, flexShrink: 0,
          background: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)',
        }} />

        {/* Right Panel — Live Preview */}
        <div
          ref={previewContainerRef}
          className="cve-right"
          style={{
            width: '42%', position: 'sticky', top: 60, height: 'calc(100vh - 116px)',
            overflow: 'hidden', padding: 16,
            display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
            cursor: isZoomedIn ? 'grab' : 'default',
          }}
          onPointerDown={handlePreviewPointerDown}
          onPointerMove={handlePreviewPointerMove}
          onPointerUp={handlePreviewPointerUp}
          onPointerCancel={handlePreviewPointerUp}
        >
          <div
            className="cve-preview-sizer"
            style={{
              width: 794 * previewScale,
              height: 1123 * previewScale,
              overflow: 'hidden',
              flexShrink: 0,
              position: 'relative',
              transform: isZoomedIn ? `translate(${panOffset.x}px, ${panOffset.y}px)` : undefined,
              transition: isDraggingRef.current ? 'none' : 'transform 0.15s ease-out',
              userSelect: 'none',
            }}
          >
            <div className="cve-preview-inner" style={{
              transformOrigin: 'top left',
              transform: `scale(${previewScale})`,
              transition: 'opacity 0.15s',
              opacity: previewOpacity,
              boxShadow: '0 2px 16px rgba(0,0,0,0.15)',
              borderRadius: 4,
              overflow: 'hidden',
              width: 794,
              pointerEvents: isZoomedIn ? 'none' : undefined,
            }}>
              <LivePreviewDocument cv={previewCv} template={selectedTemplate} />
            </div>
          </div>

          {/* Zoom controls */}
          <div onPointerDown={e => e.stopPropagation()} style={{
            position: 'absolute', bottom: 16, right: 16, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 4,
            background: isDark ? 'rgba(30,41,59,0.85)' : 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
            borderRadius: 8, padding: '4px 6px',
            boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(15,23,42,0.08)',
          }}>
            <button
              onClick={handleZoomOut}
              disabled={zoomLevel <= 1}
              title="Zoom out"
              aria-label="Zoom out"
              style={{
                width: 30, height: 30, borderRadius: 6, border: 'none', cursor: zoomLevel <= 1 ? 'not-allowed' : 'pointer',
                background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: zoomLevel <= 1 ? (isDark ? 'rgba(148,163,184,0.3)' : 'rgba(100,116,139,0.3)') : (isDark ? '#94A3B8' : '#64748B'),
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { if (zoomLevel > 1) e.currentTarget.style.background = isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            ><ZoomOut size={16} /></button>

            <span style={{
              minWidth: 44, textAlign: 'center', fontSize: 12, fontWeight: 600,
              fontFamily: 'Inter, sans-serif', color: isDark ? '#F8FAFC' : '#0F172A',
              userSelect: 'none',
            }}>{Math.round(zoomLevel * 100)}%</span>

            <button
              onClick={handleZoomIn}
              disabled={zoomLevel >= 3}
              title="Zoom in"
              aria-label="Zoom in"
              style={{
                width: 30, height: 30, borderRadius: 6, border: 'none', cursor: zoomLevel >= 3 ? 'not-allowed' : 'pointer',
                background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: zoomLevel >= 3 ? (isDark ? 'rgba(148,163,184,0.3)' : 'rgba(100,116,139,0.3)') : (isDark ? '#94A3B8' : '#64748B'),
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { if (zoomLevel < 3) e.currentTarget.style.background = isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            ><ZoomIn size={16} /></button>

            {isZoomedIn && (
              <>
                <div style={{ width: 1, height: 18, background: isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)', margin: '0 2px' }} />
                <button
                  onClick={handleZoomReset}
                  title="Reset zoom"
                  aria-label="Reset zoom"
                  style={{
                    width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isDark ? '#94A3B8' : '#64748B',
                    transition: 'color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                ><Maximize size={14} /></button>
              </>
            )}

            {isZoomedIn && (
              <span style={{
                fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', fontFamily: 'Inter, sans-serif',
                display: 'flex', alignItems: 'center', gap: 3, marginLeft: 2,
              }}><Move size={11} /> Drag</span>
            )}
          </div>
        </div>
      </div>

      {/* Spin keyframe for loader */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        isOpen={pdfPreviewOpen}
        onClose={() => setPdfPreviewOpen(false)}
        cv={previewCv}
        selectedTemplate={selectedTemplate}
        onTemplateChange={setSelectedTemplate}
        isDark={isDark}
        jobTitle={jobTitle}
        company={company}
      />
    </div>
  );
}
