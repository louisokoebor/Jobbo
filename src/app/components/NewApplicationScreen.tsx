import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  ChevronDown, Lock,
  Loader2, CheckCircle2, AlertTriangle, AlertCircle,
  Plus, ArrowRight, FileSearch,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { UpgradeModal } from './UpgradeModal';
import { SharedNavbar } from './SharedNavbar';

/* ─── Constants ──────────────────────────────────────────────── */
const SUPABASE_URL = `https://${projectId}.supabase.co`;

const GENERATE_MESSAGES = [
  'Analysing job description…',
  'Matching your experience…',
  'Optimising for ATS…',
  'Almost done…',
];

/* ─── Types ──────────────────────────────────────────────────── */
type Theme = 'dark' | 'light';
type SourceMode = 'url' | 'paste';
type FetchState = 'idle' | 'loading' | 'success' | 'error';
type GenerateState = 'idle' | 'generating';

interface CvProfile {
  id: string;
  label: string;
  created_at: string;
  is_default: boolean;
}

interface ParsedJob {
  company: string;
  location: string;
  job_title: string;
  employment_type: string;
  salary_range: string | null;
  requirements: string[];
  responsibilities: string[];
  nice_to_haves: string[];
  key_skills: string[];
  atsMatch: number; // calculated client-side
}

interface ToastItem {
  id: string;
  type: 'error' | 'success';
  message: string;
}

/* ─── Helpers ────────────────────────────────────────────────── */
function formatDate(isoString: string): string {
  const d = new Date(isoString);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  // Use the static anon key for the gateway Authorization header so
  // the Supabase gateway never rejects the request with "Invalid JWT".
  // Functions that need user identity (parse-cv, generate-cv) are routed
  // through the make-server which reads X-User-Token separately.
  return {
    'Authorization': `Bearer ${publicAnonKey}`,
    'Content-Type': 'application/json',
    'apikey': publicAnonKey,
  };
}

async function fetchCvProfiles(): Promise<CvProfile[]> {
  try {
    const { data, error } = await supabase
      .from('cv_profiles')
      .select('id, label, created_at, is_default')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('cv_profiles fetch error:', error);
      return [];
    }
    return (data ?? []) as CvProfile[];
  } catch (err) {
    console.error('cv_profiles unexpected error:', err);
    return [];
  }
}

/* ─── Toast Stack ────────────────────────────────────────────── */
function ToastStack({ toasts, isDark }: { toasts: ToastItem[]; isDark: boolean }) {
  return (
    <div style={{ position: 'fixed', top: 76, right: 20, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            pointerEvents: 'auto',
            background: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(248,250,252,0.98)',
            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
            borderLeft: `3px solid ${t.type === 'error' ? '#EF4444' : '#10B981'}`,
            borderRadius: 8, padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 8,
            color: isDark ? '#F8FAFC' : '#0F172A',
            fontSize: 13, fontFamily: 'Inter, sans-serif', fontWeight: 400,
            boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(15,23,42,0.08)',
            minWidth: 280, maxWidth: 400,
            animation: 'na-slide-in 0.2s ease-out',
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

/* ─── Upgrade Modal → imported from ./UpgradeModal ───────────── */

/* ─── Toggle Switch ──────────────────────────────────────────── */
function ToggleSwitch({
  checked, onChange, disabled = false, isDark,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; isDark: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 38, height: 21, borderRadius: 11, flexShrink: 0,
        background: checked ? '#1A56DB' : isDark ? 'rgba(148,163,184,0.25)' : 'rgba(148,163,184,0.35)',
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', transition: 'background 0.2s', padding: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: 2.5,
        left: checked ? 19 : 2.5,
        width: 16, height: 16, borderRadius: '50%',
        background: '#FFFFFF',
        transition: 'left 0.2s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
      }} />
    </button>
  );
}

/* ─── Surface Card ───────────────────────────────────────────── */
function SurfaceCard({ children, isDark, style }: {
  children: React.ReactNode; isDark: boolean; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      background: isDark ? '#1E293B' : '#FFFFFF',
      border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
      borderRadius: 12, padding: 24, marginBottom: 16,
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ─── Section Label ──────────────────────────────────────────── */
function SectionLabel({ children, isDark }: { children: React.ReactNode; isDark: boolean }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, fontFamily: 'Inter, sans-serif',
      textTransform: 'uppercase', letterSpacing: '0.07em',
      color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.4,
    }}>
      {children}
    </span>
  );
}

/* ─── Input ──────────────────────────────────────────────────── */
function StyledInput({
  value, onChange, placeholder, isDark, type = 'text', autoFocus,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  isDark: boolean; type?: string; autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '100%', height: 44, padding: '0 14px',
        background: isDark ? '#0F172A' : '#F8FAFC',
        border: `1px solid ${focused ? '#1A56DB' : isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'}`,
        borderRadius: 8, fontSize: 14, fontWeight: 400, fontFamily: 'Inter, sans-serif',
        color: isDark ? '#F8FAFC' : '#0F172A', outline: 'none',
        boxShadow: focused ? '0 0 0 3px rgba(26,86,219,0.25)' : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s', boxSizing: 'border-box',
      }}
    />
  );
}

/* ─── Primary Button ─────────────────────────────────────────── */
function PrimaryBtn({
  children, onClick, disabled, isLoading, loadingText, fullWidth, height = 44, fontSize = 14,
}: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  isLoading?: boolean; loadingText?: string; fullWidth?: boolean; height?: number; fontSize?: number;
}) {
  const [hov, setHov] = useState(false);
  const [press, setPress] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        height, padding: '0 20px',
        width: fullWidth ? '100%' : undefined,
        background: disabled ? '#1E293B' : hov ? '#1E40AF' : '#1A56DB',
        color: disabled ? 'rgba(148,163,184,0.5)' : '#FFFFFF',
        border: disabled ? '1px solid rgba(148,163,184,0.15)' : 'none',
        borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize, fontWeight: 600, fontFamily: 'Inter, sans-serif',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        transform: press && !disabled ? 'scale(0.97)' : 'scale(1)',
        transition: 'background 0.15s, transform 0.1s',
        flexShrink: 0, whiteSpace: 'nowrap',
      }}
    >
      {isLoading ? (
        <>
          <Loader2 size={15} style={{ animation: 'na-spin 0.8s linear infinite', flexShrink: 0 }} />
          <span>{loadingText ?? 'Loading…'}</span>
        </>
      ) : children}
    </button>
  );
}

/* ─── Upgrade Tooltip ────────────────────────────────────────── */
function UpgradeTooltip({ isDark }: { isDark: boolean }) {
  return (
    <div style={{
      position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
      transform: 'translateX(-50%)', zIndex: 20,
      background: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(248,250,252,0.98)',
      border: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)'}`,
      borderRadius: 8, padding: '8px 12px', whiteSpace: 'nowrap',
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      fontSize: 12, fontWeight: 500, fontFamily: 'Inter, sans-serif',
      color: isDark ? '#F8FAFC' : '#0F172A',
    }}>
      Available on Pro plan
      <div style={{
        position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
        borderTop: `5px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)'}`,
      }} />
    </div>
  );
}

/* ─── Pro Badge ──────────────────────────────────────────────── */
function ProBadge() {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
      fontFamily: 'Inter, sans-serif',
      background: 'rgba(139,92,246,0.15)', color: '#8B5CF6',
      border: '1px solid rgba(139,92,246,0.3)', lineHeight: 1.6, flexShrink: 0,
    }}>
      Pro
    </span>
  );
}

/* ─── Card 1: Job Source ─────────────────────────────────────── */
function JobSourceCard({
  isDark, sourceMode, onSourceModeChange, jobUrl, onUrlChange,
  jobDescription, onDescriptionChange, fetchState,
  onFetch, onParse, fetchFallbackBanner, parseError,
}: {
  isDark: boolean; sourceMode: SourceMode; onSourceModeChange: (m: SourceMode) => void;
  jobUrl: string; onUrlChange: (v: string) => void;
  jobDescription: string; onDescriptionChange: (v: string) => void;
  fetchState: FetchState; onFetch: () => void; onParse: (text: string) => void;
  fetchFallbackBanner: string | null; parseError: string | null;
}) {
  const [pasteWarning, setPasteWarning] = useState('');
  const charCount = jobDescription.length;
  const MAX_CHARS = 5000;
  const secondaryText = isDark ? '#94A3B8' : '#64748B';

  const handleParse = () => {
    if (charCount < 50) {
      setPasteWarning('This looks too short — paste the full job description for best results');
      return;
    }
    setPasteWarning('');
    onParse(jobDescription);
  };

  // Clear local warning when description changes
  const handleDescriptionChange = (v: string) => {
    onDescriptionChange(v);
    if (pasteWarning) setPasteWarning('');
  };

  return (
    <SurfaceCard isDark={isDark}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <SectionLabel isDark={isDark}>Job Source</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText, lineHeight: 1 }}>
            Paste instead
          </span>
          <ToggleSwitch
            checked={sourceMode === 'paste'}
            onChange={v => onSourceModeChange(v ? 'paste' : 'url')}
            isDark={isDark}
          />
        </div>
      </div>

      {/* URL mode */}
      <div style={{
        maxHeight: sourceMode === 'url' ? 220 : 0,
        opacity: sourceMode === 'url' ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.22s ease, opacity 0.18s ease',
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <StyledInput
              value={jobUrl}
              onChange={onUrlChange}
              placeholder="https://reed.co.uk/jobs/..."
              isDark={isDark}
            />
            {fetchState === 'error' && (
              <div style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: '#F59E0B',
              }}>
                <AlertTriangle size={15} />
              </div>
            )}
          </div>
          <PrimaryBtn
            isLoading={fetchState === 'loading'}
            loadingText="Fetching…"
            onClick={onFetch}
            disabled={!jobUrl.trim() || fetchState === 'loading' || fetchState === 'success'}
          >
            Fetch Job
          </PrimaryBtn>
        </div>

        {/* Fallback banner (shown when scrape-job returns fallback:true) */}
        {fetchFallbackBanner && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8,
            padding: '10px 12px',
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 8,
          }}>
            <AlertTriangle size={14} color="#F59E0B" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, fontFamily: 'Inter, sans-serif', color: '#F59E0B', lineHeight: 1.5 }}>
              {fetchFallbackBanner}
            </span>
          </div>
        )}

        {/* Success banner */}
        {fetchState === 'success' && !fetchFallbackBanner && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
            padding: '10px 12px',
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 8,
          }}>
            <CheckCircle2 size={15} color="#10B981" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: '#10B981', lineHeight: 1.4 }}>
              Job found! Details extracted and ready to go.
            </span>
          </div>
        )}

        <p style={{
          margin: 0, fontSize: 12, fontWeight: 400, fontFamily: 'Inter, sans-serif',
          color: secondaryText, lineHeight: 1.5,
        }}>
          Works with Reed, Indeed, Totaljobs, and more. LinkedIn will ask you to paste manually.
        </p>
      </div>

      {/* Paste mode */}
      <div style={{
        maxHeight: sourceMode === 'paste' ? 430 : 0,
        opacity: sourceMode === 'paste' ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.22s ease, opacity 0.18s ease',
      }}>
        <PasteTextarea
          value={jobDescription}
          onChange={handleDescriptionChange}
          isDark={isDark}
          maxChars={MAX_CHARS}
        />
        {/* Local too-short warning */}
        {pasteWarning && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
            fontSize: 12, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: '#F59E0B',
          }}>
            <AlertTriangle size={13} style={{ flexShrink: 0 }} />
            {pasteWarning}
          </div>
        )}
        {/* API parse error (not_a_job_description) */}
        {parseError && !pasteWarning && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
            fontSize: 12, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: '#F59E0B',
          }}>
            <AlertTriangle size={13} style={{ flexShrink: 0 }} />
            {parseError}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <PrimaryBtn
            isLoading={fetchState === 'loading'}
            loadingText="Parsing…"
            onClick={handleParse}
            disabled={fetchState === 'success'}
          >
            {fetchState === 'success' ? (
              <><CheckCircle2 size={15} />Parsed!</>
            ) : 'Parse Description'}
          </PrimaryBtn>
        </div>
      </div>
    </SurfaceCard>
  );
}

function PasteTextarea({
  value, onChange, isDark, maxChars,
}: { value: string; onChange: (v: string) => void; isDark: boolean; maxChars: number }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value.slice(0, maxChars))}
        placeholder="Paste the full job description here…"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', height: 200, padding: '12px 14px',
          background: isDark ? '#0F172A' : '#F8FAFC',
          border: `1px solid ${focused ? '#1A56DB' : isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'}`,
          borderRadius: 8, fontSize: 14, fontWeight: 400, fontFamily: 'Inter, sans-serif',
          color: isDark ? '#F8FAFC' : '#0F172A', outline: 'none', resize: 'vertical',
          boxShadow: focused ? '0 0 0 3px rgba(26,86,219,0.25)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s', boxSizing: 'border-box',
        }}
      />
      <span style={{
        position: 'absolute', bottom: 8, right: 10,
        fontSize: 12, fontWeight: 400, fontFamily: 'Inter, sans-serif',
        color: isDark ? '#64748B' : '#94A3B8', lineHeight: 1,
        pointerEvents: 'none',
      }}>
        {value.length} / {maxChars.toLocaleString()}
      </span>
    </div>
  );
}

/* ─── Card 2: Base CV ────────────────────────────────────────── */
function BaseCvCard({
  isDark, cvProfiles, isLoading, selectedCvId, onSelect,
  isUploadingCv, uploadingCvFile, uploadCvStatus, onUploadClick,
}: {
  isDark: boolean;
  cvProfiles: CvProfile[];
  isLoading: boolean;
  selectedCvId: string;
  onSelect: (id: string) => void;
  isUploadingCv: boolean;
  uploadingCvFile: { name: string; sizeStr: string } | null;
  uploadCvStatus: 'uploading' | 'reading';
  onUploadClick: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const inputBorder = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)';

  return (
    <SurfaceCard isDark={isDark}>
      <SectionLabel isDark={isDark}>Base CV</SectionLabel>
      <div style={{ marginTop: 12 }}>
        {isUploadingCv && uploadingCvFile ? (
          /* Upload progress indicator — same dimensions as the dropdown */
          <div style={{
            height: 52, borderRadius: 8, padding: '0 14px',
            border: `1px solid ${inputBorder}`,
            background: isDark ? '#0F172A' : '#F8FAFC',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            boxSizing: 'border-box',
          }}>
            {/* Left: filename + size */}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif',
                color: isDark ? '#F8FAFC' : '#0F172A',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                lineHeight: 1.3,
              }}>
                {uploadingCvFile.name}
              </div>
              <div style={{
                fontSize: 12, fontFamily: 'Inter, sans-serif',
                color: secondaryText, lineHeight: 1.3, marginTop: 2,
              }}>
                {uploadingCvFile.sizeStr}
              </div>
            </div>
            {/* Right: spinner + status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <Loader2
                size={14}
                color="#1A56DB"
                style={{ animation: 'na-spin 0.8s linear infinite', flexShrink: 0 }}
              />
              <span style={{
                fontSize: 13, fontFamily: 'Inter, sans-serif',
                color: secondaryText, lineHeight: 1,
              }}>
                {uploadCvStatus === 'uploading' ? 'Uploading…' : 'Reading your CV…'}
              </span>
            </div>
          </div>
        ) : isLoading ? (
          /* Skeleton while fetching profiles */
          <div style={{
            height: 52, borderRadius: 8,
            background: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.1)',
            animation: 'na-shimmer 1.4s ease-in-out infinite alternate',
          }} />
        ) : cvProfiles.length === 0 ? (
          /* Empty state — no CV profiles */
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 8,
          }}>
            <AlertTriangle size={15} color="#F59E0B" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontFamily: 'Inter, sans-serif', color: '#F59E0B', flex: 1, lineHeight: 1.4 }}>
              No base CV saved — upload one first
            </span>
            <button
              onClick={onUploadClick}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#F59E0B', fontSize: 13, fontWeight: 600,
                fontFamily: 'Inter, sans-serif', padding: 0, display: 'flex',
                alignItems: 'center', gap: 4, flexShrink: 0, lineHeight: 1,
              }}
            >
              Upload CV <ArrowRight size={12} />
            </button>
          </div>
        ) : (
          /* Dropdown with real profiles */
          <div style={{ position: 'relative' }}>
            <select
              value={selectedCvId}
              onChange={e => onSelect(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                width: '100%', height: 52, padding: '0 40px 0 14px',
                background: isDark ? '#0F172A' : '#F8FAFC',
                border: `1px solid ${focused ? '#1A56DB' : isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'}`,
                borderRadius: 8, fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif',
                color: isDark ? '#F8FAFC' : '#0F172A', outline: 'none', cursor: 'pointer',
                boxShadow: focused ? '0 0 0 3px rgba(26,86,219,0.25)' : 'none',
                appearance: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
            >
              {cvProfiles.map(cv => (
                <option key={cv.id} value={cv.id}>
                  {cv.label} · Uploaded {formatDate(cv.created_at)}{cv.is_default ? ' (Default)' : ''}
                </option>
              ))}
              <option value="upload">+ Upload new CV</option>
            </select>
            <ChevronDown
              size={16}
              color={secondaryText}
              style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
          </div>
        )}
      </div>
    </SurfaceCard>
  );
}

/* ─── Card 3: Civil Service Mode ─────────────────────────────── */
function CivilServiceCard({
  isDark, value, onChange,
}: { isDark: boolean; value: boolean; onChange: (v: boolean) => void }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const secondaryText = isDark ? '#94A3B8' : '#64748B';

  return (
    <SurfaceCard isDark={isDark}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <p style={{
            margin: '0 0 4px', fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif',
            color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.3,
          }}>
            Civil Service Mode
          </p>
          <p style={{
            margin: 0, fontSize: 12, fontWeight: 400, fontFamily: 'Inter, sans-serif',
            color: secondaryText, lineHeight: 1.5,
          }}>
            Rewrites bullets in STAR format aligned to Civil Service Success Profiles
          </p>
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setShowTooltip(v => !v)}
            onBlur={() => setShowTooltip(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', lineHeight: 1 }}
            aria-label="Locked — available on Pro plan"
          >
            <Lock size={14} color={secondaryText} />
          </button>
          {/* Toggle wired to state but visually locked (Pro-only) */}
          <ToggleSwitch checked={value} onChange={onChange} disabled isDark={isDark} />
          {showTooltip && <UpgradeTooltip isDark={isDark} />}
        </div>
      </div>
    </SurfaceCard>
  );
}

/* ─── Card 4: Supplementary Documents (Locked) ───────────────── */
function SupplementaryDocsCard({ isDark }: { isDark: boolean }) {
  const secondaryText = isDark ? '#94A3B8' : '#64748B';

  return (
    <SurfaceCard isDark={isDark} style={{ position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <SectionLabel isDark={isDark}>Supporting Documents</SectionLabel>
        <ProBadge />
      </div>
      <div style={{
        background: isDark ? 'rgba(15,23,42,0.6)' : 'rgba(241,245,249,0.8)',
        border: `2px dashed ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)'}`,
        borderRadius: 8, padding: '32px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        textAlign: 'center',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Lock size={18} color={secondaryText} />
        </div>
        <p style={{
          margin: 0, fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif',
          color: secondaryText, lineHeight: 1.5, maxWidth: 300,
        }}>
          Upgrade to Pro to upload competency frameworks, person specs, and more
        </p>
        <UpgradeButton />
      </div>
    </SurfaceCard>
  );
}

function UpgradeButton() {
  const [hov, setHov] = useState(false);
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate('/billing')}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        height: 34, padding: '0 16px',
        background: hov ? '#1E40AF' : '#1A56DB',
        color: '#FFFFFF', border: 'none', borderRadius: 8, cursor: 'pointer',
        fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif',
        transition: 'background 0.15s', lineHeight: 1,
      }}
    >
      Upgrade to Pro
    </button>
  );
}

/* ─── Right Panel Empty State ────────────────────────────────── */
function RightPanelEmpty({ isDark }: { isDark: boolean }) {
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 320, padding: '40px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: isDark ? 'rgba(148,163,184,0.06)' : 'rgba(148,163,184,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
      }}>
        <FileSearch size={28} color={isDark ? '#475569' : '#94A3B8'} strokeWidth={1.5} />
      </div>
      <p style={{
        margin: 0, fontSize: 14, fontWeight: 400, fontFamily: 'Inter, sans-serif',
        color: secondaryText, lineHeight: 1.6, maxWidth: 280,
      }}>
        Your job summary will appear here once you fetch or paste a job description
      </p>
    </div>
  );
}

/* ─── Right Panel Loaded ─────────────────────────────────────── */
function RightPanelLoaded({ job, isDark }: { job: ParsedJob; isDark: boolean }) {
  const [showAllResp, setShowAllResp] = useState(false);
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const surfaceElev = isDark ? '#263348' : '#F8FAFC';
  const borderColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)';

  const visibleResp = showAllResp ? job.responsibilities : job.responsibilities.slice(0, 5);
  const atsColor = job.atsMatch >= 80 ? '#10B981' : job.atsMatch >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <div style={{
      background: isDark ? '#1E293B' : '#FFFFFF',
      border: `1px solid ${borderColor}`,
      borderRadius: 12, padding: 24,
      animation: 'na-fade-in 0.2s ease-out',
    }}>
      {/* Company + location */}
      <div style={{ marginBottom: 12 }}>
        <h2 style={{
          margin: '0 0 2px', fontSize: 20, fontWeight: 700, fontFamily: 'Inter, sans-serif',
          color: primaryText, lineHeight: 1.3,
        }}>
          {job.company}
        </h2>
        <p style={{
          margin: '0 0 8px', fontSize: 14, fontWeight: 400, fontFamily: 'Inter, sans-serif',
          color: secondaryText, lineHeight: 1.4,
        }}>
          {job.location}
        </p>
        <p style={{
          margin: '0 0 12px', fontSize: 16, fontWeight: 600, fontFamily: 'Inter, sans-serif',
          color: '#1A56DB', lineHeight: 1.3,
        }}>
          {job.job_title}
        </p>
        {/* Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {job.employment_type && (
            <span style={{
              padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500,
              fontFamily: 'Inter, sans-serif',
              background: surfaceElev, color: secondaryText,
              border: `1px solid ${borderColor}`, lineHeight: 1.6,
            }}>
              {job.employment_type}
            </span>
          )}
          {job.salary_range && (
            <span style={{
              padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500,
              fontFamily: 'Inter, sans-serif',
              background: surfaceElev, color: secondaryText,
              border: `1px solid ${borderColor}`, lineHeight: 1.6,
            }}>
              {job.salary_range}
            </span>
          )}
        </div>
      </div>

      <div style={{ height: 1, background: borderColor, margin: '16px 0' }} />

      {/* Key Requirements */}
      <RightSection label="Key Requirements" isDark={isDark}>
        {job.requirements.map((r, i) => (
          <BulletItem key={i} text={r} isDark={isDark} />
        ))}
      </RightSection>

      <div style={{ height: 1, background: borderColor, margin: '16px 0' }} />

      {/* Responsibilities */}
      <RightSection label="Responsibilities" isDark={isDark}>
        {visibleResp.map((r, i) => (
          <BulletItem key={i} text={r} isDark={isDark} />
        ))}
        {job.responsibilities.length > 5 && (
          <button
            type="button"
            onClick={() => setShowAllResp(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#1A56DB', fontSize: 13, fontWeight: 500,
              fontFamily: 'Inter, sans-serif', padding: '4px 0', lineHeight: 1,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {showAllResp ? 'Show less' : `Show all (${job.responsibilities.length})`}
            <ChevronDown
              size={13}
              style={{ transition: 'transform 0.2s', transform: showAllResp ? 'rotate(180deg)' : 'none' }}
            />
          </button>
        )}
      </RightSection>

      {/* Nice to Have */}
      {job.nice_to_haves && job.nice_to_haves.length > 0 && (
        <>
          <div style={{ height: 1, background: borderColor, margin: '16px 0' }} />
          <div style={{
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 8, padding: '12px 14px',
          }}>
            <span style={{
              fontSize: 11, fontWeight: 500, fontFamily: 'Inter, sans-serif',
              textTransform: 'uppercase', letterSpacing: '0.07em', color: '#F59E0B',
              display: 'block', marginBottom: 8, lineHeight: 1.4,
            }}>
              Nice to Have
            </span>
            {job.nice_to_haves.map((r, i) => (
              <BulletItem key={i} text={r} isDark={isDark} color="#F59E0B" />
            ))}
          </div>
        </>
      )}

      {/* ATS Match pill */}
      <div style={{ marginTop: 16 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 999,
          background: 'rgba(26,86,219,0.1)',
          border: '1px solid rgba(26,86,219,0.2)',
        }}>
          <span style={{
            fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif',
            color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1,
          }}>
            Estimated ATS match:
          </span>
          <span style={{
            fontSize: 14, fontWeight: 700, fontFamily: 'Inter, sans-serif',
            color: atsColor, lineHeight: 1,
          }}>
            ~{job.atsMatch}%
          </span>
        </div>
      </div>
    </div>
  );
}

function RightSection({ label, isDark, children }: { label: string; isDark: boolean; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel isDark={isDark}>{label}</SectionLabel>
      <ul style={{ margin: '10px 0 0', padding: '0 0 0 4px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </ul>
    </div>
  );
}

function BulletItem({ text, isDark, color }: { text: string; isDark: boolean; color?: string }) {
  const textColor = color || (isDark ? '#F8FAFC' : '#0F172A');
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ flexShrink: 0, marginTop: 6, width: 5, height: 5, borderRadius: '50%', background: color || (isDark ? '#94A3B8' : '#64748B'), display: 'inline-block' }} />
      <span style={{ fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: textColor, lineHeight: 1.55 }}>
        {text}
      </span>
    </li>
  );
}

/* ─── Mobile Job Info (no accordion — shown directly in flow) ── */
function MobileRightPanel({ job, isDark }: { job: ParsedJob | null; isDark: boolean }) {
  if (!job) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <RightPanelLoaded job={job} isDark={isDark} />
    </div>
  );
}

/* ─── Generating Overlay ─────────────────────────────────────── */
function GeneratingOverlay({ statusIndex, isDark }: { statusIndex: number; isDark: boolean }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: isDark ? 'rgba(10,15,28,0.88)' : 'rgba(241,245,249,0.88)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
        padding: '40px 48px',
        background: isDark ? 'rgba(30,41,59,0.7)' : 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
        borderRadius: 16,
        boxShadow: isDark ? '0 8px 48px rgba(0,0,0,0.5)' : '0 8px 48px rgba(15,23,42,0.12)',
      }}>
        <div style={{ position: 'relative', width: 48, height: 48 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '3px solid rgba(26,86,219,0.15)',
            borderTop: '3px solid #1A56DB',
            animation: 'na-spin 0.8s linear infinite',
          }} />
        </div>
        <div style={{ textAlign: 'center', minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p
            key={statusIndex}
            style={{
              margin: 0, fontSize: 16, fontWeight: 500, fontFamily: 'Inter, sans-serif',
              color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.4,
              animation: 'na-status-in 0.4s ease-out',
            }}
          >
            {GENERATE_MESSAGES[statusIndex]}
          </p>
        </div>
        <p style={{
          margin: 0, fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif',
          color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.4,
        }}>
          Tailoring your CV — please wait
        </p>
      </div>
    </div>
  );
}

/* ─── (Navbar moved to SharedNavbar) ─────────────────────────── */



/* ─── Main Screen ────────────────────────────────────────────── */
export function NewApplicationScreen() {
  const navigate = useNavigate();

  const [theme, setTheme] = useState<Theme>(() =>
    (typeof window !== 'undefined' && (localStorage.getItem('jobbo-theme') as Theme)) || 'dark'
  );
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('jobbo-theme', theme);
  }, [theme]);

  /* ── CV Profiles (real data) ── */
  const [cvProfiles, setCvProfiles] = useState<CvProfile[]>([]);
  const [cvProfilesLoading, setCvProfilesLoading] = useState(true);

  useEffect(() => {
    const loadProfiles = async () => {
      try {
        const profiles = await fetchCvProfiles();
        setCvProfiles(profiles);
        const defaultProfile = profiles.find((p: CvProfile) => p.is_default);
        if (defaultProfile) setSelectedCvId(defaultProfile.id);
        else if (profiles.length > 0) setSelectedCvId(profiles[0].id);
      } catch (err) {
        console.error('Unexpected error loading CV profiles:', err);
      } finally {
        setCvProfilesLoading(false);
      }
    };
    loadProfiles();
  }, []);

  /* ── Form state ── */
  const [sourceMode, setSourceMode] = useState<SourceMode>('url');
  const [jobUrl, setJobUrl] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [rawText, setRawText] = useState('');
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [fetchFallbackBanner, setFetchFallbackBanner] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedJob, setParsedJob] = useState<ParsedJob | null>(null);
  const [selectedCvId, setSelectedCvId] = useState('');
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [civilServiceMode, setCivilServiceMode] = useState(false);
  const [generateState, setGenerateState] = useState<GenerateState>('idle');
  const [generateStatusIndex, setGenerateStatusIndex] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  /* ── CV Upload state ── */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingCv, setIsUploadingCv] = useState(false);
  const [uploadingCvFile, setUploadingCvFile] = useState<{ name: string; sizeStr: string } | null>(null);
  const [uploadCvStatus, setUploadCvStatus] = useState<'uploading' | 'reading'>('uploading');

  /* ── Toasts ── */
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const addToast = useCallback((type: ToastItem['type'], message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  /* ── Mobile ── */
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  /* ── Generate enabled when applicationId exists AND a CV is selected AND not uploading ── */
  const canGenerate = applicationId !== null && selectedCvId !== '' && selectedCvId !== 'upload' && !isUploadingCv;
  const bgColor = isDark ? '#0F172A' : '#F1F5F9';
  const borderColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';

  /* ─────────────────────────────────────────────────────────────
     PARSE JOB — shared between URL and paste flows
  ───────────────────────────────────────────────────────────── */
  const runParseJob = useCallback(async (
    text: string,
    urlForInsert: string | null,
  ): Promise<boolean> => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-job`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ raw_text: text }),
      });
      const result = await response.json();

      if (result.success === true) {
        /* Insert application row */
        const { data: { user } } = await supabase.auth.getUser();
        const { data: appRow, error: insertError } = await supabase
          .from('applications')
          .insert({
            user_id: user?.id,
            job_url: urlForInsert ?? null,
            job_description_raw: text,
            job_parsed_json: result.parsed,
            job_title: result.parsed.job_title,
            company: result.parsed.company,
            status: 'saved',
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('Error inserting application:', insertError);
          addToast('error', "Couldn't save the application. Please try again.");
          return false;
        }

        setApplicationId(appRow.id);

        /* Calculate ATS match score */
        let atsMatch = 75;
        if (selectedCvId && selectedCvId !== 'upload') {
          try {
            const { data: cvProfile } = await supabase
              .from('cv_profiles')
              .select('parsed_json')
              .eq('id', selectedCvId)
              .single();

            if (cvProfile?.parsed_json?.skills) {
              const cvSkills: string[] = cvProfile.parsed_json.skills.map((s: string) => s.toLowerCase());
              const jobSkills: string[] = (result.parsed.key_skills ?? []).map((s: string) => s.toLowerCase());
              const matched = jobSkills.filter((s: string) =>
                cvSkills.some(cs => cs.includes(s) || s.includes(cs))
              );
              atsMatch = jobSkills.length > 0
                ? Math.round((matched.length / jobSkills.length) * 100)
                : 75;
            }
          } catch (err) {
            console.error('Error calculating ATS match:', err);
          }
        }

        setParsedJob({ ...result.parsed, atsMatch });
        return true;

      } else if (result.error === 'not_a_job_description') {
        setParseError("This doesn't look like a job description. Try pasting a more complete version.");
        return false;
      } else {
        console.error('parse-job error:', result);
        addToast('error', "Couldn't parse the job description. Please try again.");
        return false;
      }
    } catch (err) {
      console.error('parse-job network error:', err);
      addToast('error', "Couldn't parse the job description. Please try again.");
      return false;
    }
  }, [selectedCvId, addToast]);

  /* ─────────────────────────────────────────────────────────────
     FETCH JOB (URL mode)
  ───────────────────────────────────────────────────────────── */
  const handleFetch = useCallback(async () => {
    setFetchState('loading');
    setFetchFallbackBanner(null);
    setParseError(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${SUPABASE_URL}/functions/v1/scrape-job`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ url: jobUrl }),
      });
      const result = await response.json();

      if (result.success === true) {
        const scrapedText = result.raw_text as string;
        setRawText(scrapedText);
        const parsed = await runParseJob(scrapedText, jobUrl);
        if (parsed) {
          setFetchState('success');
        } else {
          // Parse failed — switch to paste so user can correct
          setSourceMode('paste');
          setJobDescription(scrapedText);
          setFetchState('idle');
        }
      } else if (result.fallback === true) {
        setSourceMode('paste');
        setFetchFallbackBanner("We couldn't fetch this URL automatically. Paste the job description below.");
        setFetchState('idle');
      } else {
        console.error('scrape-job failure:', result);
        addToast('error', 'Connection error. Please try again.');
        setFetchState('error');
        setTimeout(() => setFetchState('idle'), 1200);
      }
    } catch (err) {
      console.error('scrape-job network error:', err);
      addToast('error', 'Connection error. Please try again.');
      setFetchState('error');
      setTimeout(() => setFetchState('idle'), 1200);
    }
  }, [jobUrl, runParseJob, addToast]);

  /* ─────────────────────────────────────────────────────────────
     PARSE DESCRIPTION (paste mode button)
  ───────────────────────────────────────────────────────────── */
  const handlePaste = useCallback(async (text: string) => {
    setParseError(null);
    setFetchState('loading');
    const success = await runParseJob(text, null);
    setFetchState(success ? 'success' : 'idle');
  }, [runParseJob]);

  /* ─────────────────────────────────────────────────────────────
     GENERATE CV
  ───────────────────────────────────────────────────────────── */
  const handleGenerate = useCallback(async () => {
    if (!applicationId || !selectedCvId) return;

    setGenerateState('generating');
    setGenerateStatusIndex(0);
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % GENERATE_MESSAGES.length;
      setGenerateStatusIndex(i);
    }, 1500);

    try {
      /* Update civil_service_mode on the application row first */
      const { error: updateError } = await supabase
        .from('applications')
        .update({ civil_service_mode: civilServiceMode })
        .eq('id', applicationId);

      if (updateError) {
        console.error('Error updating civil service mode:', updateError);
      }

      // Route through our make-server proxy so the gateway always gets the
      // anon key (never expires) and the user JWT travels in X-User-Token.
      const { data: { session: genSession } } = await supabase.auth.getSession();
      const response = await fetch(`${SUPABASE_URL}/functions/v1/make-server-3bbff5cf/generate-cv`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
          'apikey': publicAnonKey,
          ...(genSession?.access_token ? { 'X-User-Token': genSession.access_token } : {}),
        },
        body: JSON.stringify({
          application_id: applicationId,
          cv_profile_id: selectedCvId,
        }),
      });
      const result = await response.json();

      clearInterval(interval);
      setGenerateState('idle');

      if (result.success === true) {
        navigate(`/cv-editor/${result.generated_cv_id}`);

        // Fire and forget — runs in background while CV editor loads
        ;(async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return
            
            await fetch(
              `https://hrexgjahkdjqxvulodqu.supabase.co/functions/v1/analyse-application`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                  'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyZXhnamFoa2RqcXh2dWxvZHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNzAzNjUsImV4cCI6MjA4Nzk0NjM2NX0.pkV8MPJYG-AyBPk5qG7iDJCT86aOzVKcti1wfygqpRM'
                },
                body: JSON.stringify({
                  application_id: applicationId,
                  generated_cv_id: result.generated_cv_id
                })
              }
            )
          } catch (e) {
            console.log('Background analysis failed silently:', e)
          }
        })()
      } else if (response.status === 403 || result.upgrade_required === true) {
        setShowUpgradeModal(true);
      } else {
        console.error('generate-cv error:', result);
        addToast('error', 'Something went wrong. Please try again.');
      }
    } catch (err) {
      clearInterval(interval);
      setGenerateState('idle');
      console.error('generate-cv network error:', err);
      addToast('error', 'Something went wrong. Please try again.');
    }
  }, [applicationId, selectedCvId, civilServiceMode, navigate, addToast]);

  /* ─────────────────────────────────────────────────────────────
     CV FILE UPLOAD — triggered when user picks "Upload new CV"
  ───────────────────────────────────────────────────────────── */
  const handleCvFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so same file can be re-selected later
    e.target.value = '';

    // Validate type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowedTypes.includes(file.type)) {
      addToast('error', 'Please upload a PDF or DOCX file');
      return;
    }
    // Validate size
    if (file.size > 10 * 1024 * 1024) {
      addToast('error', 'File exceeds 10MB. Please use a smaller file.');
      return;
    }

    const sizeStr = formatFileSize(file.size);
    const prevId = selectedCvId;

    // Show inline progress indicator
    setIsUploadingCv(true);
    setUploadingCvFile({ name: file.name, sizeStr });
    setUploadCvStatus('uploading');

    try {
      // Get session once — reuse the same access_token throughout this handler
      // so it never goes stale between the storage upload and the parse-cv call.
      // If there's no valid session the gateway will reject with Invalid JWT,
      // so we bail early with a friendly message.
      let { data: { session } } = await supabase.auth.getSession();

      // If the stored session looks stale, force a refresh
      if (!session?.access_token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session;
      }

      if (!session?.access_token) {
        addToast('error', 'Your session has expired. Please log in again.');
        setIsUploadingCv(false);
        setUploadingCvFile(null);
        setSelectedCvId(prevId);
        return;
      }

      const accessToken = session.access_token;
      const userId = session.user?.id ?? 'anon';
      const filePath = `${userId}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase
        .storage
        .from('cv-uploads')
        .upload(filePath, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        addToast('error', 'Upload failed. Please try again.');
        setIsUploadingCv(false);
        setUploadingCvFile(null);
        setSelectedCvId(prevId);
        return;
      }

      // Get a signed URL valid for 1 hour
      const { data: urlData } = await supabase
        .storage
        .from('cv-uploads')
        .createSignedUrl(filePath, 3600);

      const fileUrl = urlData?.signedUrl;
      if (!fileUrl) {
        addToast('error', 'Upload failed. Please try again.');
        setIsUploadingCv(false);
        setUploadingCvFile(null);
        setSelectedCvId(prevId);
        return;
      }

      // Update status text: "Uploading…" → "Reading your CV…"
      setUploadCvStatus('reading');

      // Call the dedicated parse-cv Edge Function.
      // Authorization uses the static anon key so the Supabase gateway never
      // rejects it with "Invalid JWT" due to an expired user access token.
      // The user's real JWT travels in X-User-Token so the server can still
      // extract userId from it.
      const response = await fetch(`${SUPABASE_URL}/functions/v1/make-server-3bbff5cf/parse-cv`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-User-Token': session.access_token,
          'Content-Type': 'application/json',
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({
          file_url: fileUrl,
          label: file.name.replace(/\.[^/.]+$/, ''),
        }),
      });

      const result = await response.json();

      if (!response.ok || result.success === false) {
        console.error('parse-cv error:', result);
        addToast('error', "Couldn't read your CV. Make sure it's a readable PDF or DOCX.");
        setIsUploadingCv(false);
        setUploadingCvFile(null);
        setSelectedCvId(prevId);
        return;
      }

      // Check if this is the user's first CV profile
      const { data: existingProfiles } = await supabase
        .from('cv_profiles')
        .select('id')
        .eq('user_id', session.user.id);

      const isFirst = !existingProfiles || existingProfiles.length === 0;

      // Save parsed CV to Supabase directly from frontend
      const { data: savedProfile, error: saveError } = await supabase
        .from('cv_profiles')
        .insert({
          user_id: session.user.id,
          label: result.label || file.name.replace(/\.[^/.]+$/, ''),
          parsed_json: result.parsed_json,
          raw_file_url: fileUrl,
          is_default: isFirst,
        })
        .select('id')
        .single();

      if (saveError) {
        console.error('cv_profiles save error:', saveError);
        addToast('error', 'CV parsed but could not be saved. Please try again.');
        setIsUploadingCv(false);
        setUploadingCvFile(null);
        setSelectedCvId(prevId);
        return;
      }

      // Fetch fresh profiles and auto-select the new one
      const freshProfiles = await fetchCvProfiles();
      setCvProfiles(freshProfiles);
      setSelectedCvId(savedProfile.id);
      setIsUploadingCv(false);
      setUploadingCvFile(null);
      addToast('success', 'CV uploaded and ready to use');
    } catch (err) {
      // Error fallback — restore dropdown, never leave UI broken
      console.error('CV upload unexpected error:', err);
      addToast('error', 'Upload failed. Please try again.');
      setIsUploadingCv(false);
      setUploadingCvFile(null);
      setSelectedCvId(prevId);
    }
  }, [selectedCvId, addToast]);

  return (
    <div style={{
      fontFamily: 'Inter, sans-serif',
      background: isDark
        ? 'radial-gradient(ellipse at 30% 10%, #1E293B 0%, #0F172A 55%)'
        : 'radial-gradient(ellipse at 30% 10%, #EFF6FF 0%, #F1F5F9 65%)',
      color: isDark ? '#F8FAFC' : '#0F172A',
      transition: 'background 0.2s, color 0.2s',
      height: '100vh', overflow: isMobile ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      {/* Grid bg */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M40 0H0v1h40V0zM0 0v40h1V0H0z' fill='%23${isDark ? 'ffffff' : '000000'}'/%3E%3C/svg%3E")`,
        backgroundSize: '40px 40px',
      }} />

      <ToastStack toasts={toasts} isDark={isDark} />

      <SharedNavbar
        isDark={isDark}
        onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
      />

      {/* Page header */}
      <div style={{
        padding: isMobile ? '20px 16px 0' : '28px 24px 0', flexShrink: 0, position: 'relative', zIndex: 1,
        maxWidth: 1280, width: '100%', margin: '0 auto', boxSizing: 'border-box',
      }}>
        <p style={{
          margin: '0 0 6px', fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif',
          color: secondaryText, lineHeight: 1.4,
        }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: secondaryText, fontSize: 13, fontFamily: 'Inter, sans-serif',
              padding: 0, lineHeight: 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >
            Dashboard
          </button>
          {' / New Application'}
        </p>
        <h1 style={{
          margin: 0, fontSize: 28, fontWeight: 600, fontFamily: 'Inter, sans-serif',
          color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.2,
        }}>
          New Application
        </h1>
      </div>

      {/* Two-panel area */}
      <div style={{
        flex: isMobile ? 'none' : 1, overflow: isMobile ? 'visible' : 'hidden', display: 'flex',
        maxWidth: 1280, width: '100%', margin: '0 auto', boxSizing: 'border-box',
        flexDirection: isMobile ? 'column' : 'row',
        position: 'relative', zIndex: 1,
        minHeight: 0,
      }}>
        {/* Left Panel */}
        <div
          className="na-left-panel"
          style={{
            flex: isMobile ? 'none' : '0 0 55%',
            width: isMobile ? '100%' : undefined,
            minHeight: 0,
            overflowY: isMobile ? 'visible' : 'auto', display: 'flex', flexDirection: 'column',
            padding: isMobile ? '16px 16px 0' : '20px 24px 0',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(26,86,219,0.3) transparent',
          }}
        >
          <JobSourceCard
            isDark={isDark}
            sourceMode={sourceMode}
            onSourceModeChange={mode => {
              setSourceMode(mode);
              setFetchFallbackBanner(null);
            }}
            jobUrl={jobUrl}
            onUrlChange={setJobUrl}
            jobDescription={jobDescription}
            onDescriptionChange={setJobDescription}
            fetchState={fetchState}
            onFetch={handleFetch}
            onParse={handlePaste}
            fetchFallbackBanner={fetchFallbackBanner}
            parseError={parseError}
          />

          <BaseCvCard
            isDark={isDark}
            cvProfiles={cvProfiles}
            isLoading={cvProfilesLoading}
            selectedCvId={selectedCvId}
            onSelect={id => {
              if (id === 'upload') {
                fileInputRef.current?.click();
                return;
              }
              setSelectedCvId(id);
            }}
            isUploadingCv={isUploadingCv}
            uploadingCvFile={uploadingCvFile}
            uploadCvStatus={uploadCvStatus}
            onUploadClick={() => fileInputRef.current?.click()}
          />

          <CivilServiceCard
            isDark={isDark}
            value={civilServiceMode}
            onChange={setCivilServiceMode}
          />

          <SupplementaryDocsCard isDark={isDark} />

          {/* Mobile: show job info directly in flow */}
          {isMobile && <MobileRightPanel job={parsedJob} isDark={isDark} />}

          {/* Spacer — on mobile add extra space for the fixed bottom CTA */}
          <div style={{ flex: 1, minHeight: isMobile ? 120 : 80 }} />

          {/* Sticky CTA (desktop only — on mobile it's rendered as a fixed bar below) */}
          {!isMobile && (
            <div style={{ position: 'sticky', bottom: 0, zIndex: 10 }}>
              <div style={{
                height: 32,
                background: `linear-gradient(to bottom, transparent, ${bgColor})`,
                pointerEvents: 'none',
              }} />
              <div style={{ background: bgColor, padding: '0 0 24px' }}>
                <button
                  type="button"
                  onClick={canGenerate ? handleGenerate : undefined}
                  disabled={!canGenerate}
                  style={{
                    width: '100%', height: 48,
                    background: canGenerate ? '#1A56DB' : isDark ? 'rgba(30,41,59,0.8)' : 'rgba(226,232,240,0.8)',
                    color: canGenerate ? '#FFFFFF' : isDark ? 'rgba(148,163,184,0.4)' : 'rgba(148,163,184,0.6)',
                    border: canGenerate ? 'none' : `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)'}`,
                    borderRadius: 8, cursor: canGenerate ? 'pointer' : 'not-allowed',
                    fontSize: 16, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (canGenerate) (e.currentTarget as HTMLButtonElement).style.background = '#1E40AF'; }}
                  onMouseLeave={e => { if (canGenerate) (e.currentTarget as HTMLButtonElement).style.background = '#1A56DB'; }}
                >
                  Generate CV <ArrowRight size={18} />
                </button>
                {!canGenerate && (
                  <p style={{
                    margin: '6px 0 0', textAlign: 'center', fontSize: 12,
                    fontFamily: 'Inter, sans-serif', fontWeight: 400,
                    color: secondaryText, lineHeight: 1.4,
                  }}>
                    {applicationId === null
                      ? 'Fetch or paste a job description to continue'
                      : 'Select a base CV to continue'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Vertical divider (desktop) */}
        {!isMobile && (
          <div style={{ width: 1, background: borderColor, flexShrink: 0, alignSelf: 'stretch' }} />
        )}

        {/* Right Panel (desktop) */}
        {!isMobile && (
          <div
            className="na-right-panel"
            style={{
              flex: '0 0 45%',
              overflowY: 'auto',
              padding: '20px 24px 24px',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(26,86,219,0.3) transparent',
            }}
          >
            {parsedJob ? (
              <RightPanelLoaded job={parsedJob} isDark={isDark} />
            ) : (
              <RightPanelEmpty isDark={isDark} />
            )}
          </div>
        )}
      </div>

      {/* Fixed mobile CTA bar */}
      {isMobile && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          padding: '0 16px 16px',
          background: `linear-gradient(to bottom, transparent 0%, ${bgColor} 28%)`,
          pointerEvents: 'none',
        }}>
          <div style={{ pointerEvents: 'auto' }}>
            <button
              type="button"
              onClick={canGenerate ? handleGenerate : undefined}
              disabled={!canGenerate}
              style={{
                width: '100%', height: 48,
                background: canGenerate ? '#1A56DB' : isDark ? 'rgba(30,41,59,0.8)' : 'rgba(226,232,240,0.8)',
                color: canGenerate ? '#FFFFFF' : isDark ? 'rgba(148,163,184,0.4)' : 'rgba(148,163,184,0.6)',
                border: canGenerate ? 'none' : `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)'}`,
                borderRadius: 8, cursor: canGenerate ? 'pointer' : 'not-allowed',
                fontSize: 16, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background 0.15s',
                boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
              }}
              onMouseEnter={e => { if (canGenerate) (e.currentTarget as HTMLButtonElement).style.background = '#1E40AF'; }}
              onMouseLeave={e => { if (canGenerate) (e.currentTarget as HTMLButtonElement).style.background = '#1A56DB'; }}
            >
              Generate CV <ArrowRight size={18} />
            </button>
            {!canGenerate && (
              <p style={{
                margin: '6px 0 0', textAlign: 'center', fontSize: 12,
                fontFamily: 'Inter, sans-serif', fontWeight: 400,
                color: secondaryText, lineHeight: 1.4,
              }}>
                {applicationId === null
                  ? 'Fetch or paste a job description to continue'
                  : 'Select a base CV to continue'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Generating overlay */}
      {generateState === 'generating' && (
        <GeneratingOverlay statusIndex={generateStatusIndex} isDark={isDark} />
      )}

      {/* Upgrade modal */}
      {showUpgradeModal && (
        <UpgradeModal isDark={isDark} onClose={() => setShowUpgradeModal(false)} />
      )}

      {/* Hidden file input — triggered when user picks "Upload new CV" */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx"
        style={{ display: 'none' }}
        onChange={handleCvFileSelect}
      />

      <style>{`
        @keyframes na-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes na-card-in {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes na-modal-in {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes na-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes na-status-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes na-slide-in {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes na-shimmer {
          from { opacity: 0.5; }
          to   { opacity: 1; }
        }
        * { box-sizing: border-box; }
        textarea::placeholder, input::placeholder { opacity: 0.5; }
        .na-left-panel::-webkit-scrollbar,
        .na-right-panel::-webkit-scrollbar { width: 4px; }
        .na-left-panel::-webkit-scrollbar-track,
        .na-right-panel::-webkit-scrollbar-track { background: transparent; }
        .na-left-panel::-webkit-scrollbar-thumb,
        .na-right-panel::-webkit-scrollbar-thumb { background: rgba(26,86,219,0.3); border-radius: 2px; }
      `}</style>
    </div>
  );
}
