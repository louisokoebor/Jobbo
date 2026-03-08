import { supabase } from '../lib/supabaseClient';
import { toast, Toaster } from 'sonner';
import { useNavigate } from 'react-router';
import { SharedNavbar } from './SharedNavbar';
import {
  Search, Inbox, SearchX, Sparkles, Eye, Trash2, ChevronDown, Plus,
} from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';

/* ─── Types ─────────────────────────────────────────────────── */
type Theme = 'dark' | 'light';
type AppStatus = 'saved' | 'applied' | 'interview_scheduled' | 'interview_done' | 'offer' | 'rejected';
type FilterKey = 'all' | 'saved' | 'applied' | 'interview' | 'offer' | 'rejected';
type SortKey = 'newest' | 'oldest' | 'company';

interface Application {
  id: string;
  job_title: string;
  company: string;
  status: AppStatus;
  created_at: string;
  next_action_date: string | null;
  job_parsed_json: { location?: string } | null;
}

/* ─── Constants ─────────────────────────────────────────────── */
const STATUS_CONFIG: Record<AppStatus, { label: string; color: string; bg: string }> = {
  saved:               { label: 'Saved',               color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
  applied:             { label: 'Applied',             color: '#1A56DB', bg: 'rgba(26,86,219,0.12)' },
  interview_scheduled: { label: 'Interview Scheduled', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  interview_done:      { label: 'Interview Done',      color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  offer:               { label: 'Offer',               color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  rejected:            { label: 'Rejected',            color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
};

const FILTER_PILLS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'saved', label: 'Saved' },
  { key: 'applied', label: 'Applied' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
  { key: 'rejected', label: 'Rejected' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'company', label: 'Company A–Z' },
];

/* ─── Helpers ───────────────────────────────────────────────── */
function formatDate(iso: string) {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-GB', { month: 'short' });
  const yr = d.getFullYear();
  return `${day} ${mon} ${yr}`;
}

function formatShortDate(iso: string) {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-GB', { month: 'short' });
  return `${day} ${mon}`;
}

function startOfWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(diff);
  return d;
}

function matchesFilter(app: Application, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'interview') return app.status === 'interview_scheduled' || app.status === 'interview_done';
  return app.status === filter;
}

function getFilterCount(apps: Application[], filter: FilterKey): number {
  return apps.filter(a => matchesFilter(a, filter)).length;
}

/* ─── Skeleton Row ──────────────────────────────────────────── */
function SkeletonRow({ isDark }: { isDark: boolean }) {
  const shimmer = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.05)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '16px 20px', borderRadius: 12,
      background: isDark ? '#1E293B' : '#FFFFFF',
      border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
    }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: shimmer, flexShrink: 0 }} className="jb-shimmer" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ width: '45%', height: 14, borderRadius: 6, background: shimmer }} className="jb-shimmer" />
        <div style={{ width: '30%', height: 12, borderRadius: 6, background: shimmer }} className="jb-shimmer" />
        <div style={{ width: '25%', height: 12, borderRadius: 6, background: shimmer }} className="jb-shimmer" />
      </div>
    </div>
  );
}

/* ─── Stat Card ─────────────────────────────────────────────── */
function StatCard({ label, value, isDark }: { label: string; value: number; isDark: boolean }) {
  return (
    <div style={{
      flex: '1 1 0', minWidth: 120,
      background: isDark ? '#1E293B' : '#FFFFFF',
      border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
      borderRadius: 12, padding: '16px 20px',
    }}>
      <div style={{
        fontSize: 12, fontWeight: 500, fontFamily: 'Inter, sans-serif',
        color: isDark ? '#94A3B8' : '#64748B',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, lineHeight: 1,
      }}>{label}</div>
      <div style={{
        fontSize: 24, fontWeight: 700, fontFamily: 'Inter, sans-serif',
        color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.2,
      }}>{value}</div>
    </div>
  );
}

/* ─── Icon Button ───────────────────────────────────────────── */
function IconBtn({ icon, tooltip, hoverColor, hoverBg, isDark, onClick }: {
  icon: React.ReactNode; tooltip: string; hoverColor: string; hoverBg: string;
  isDark: boolean; onClick: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      title={tooltip}
      aria-label={tooltip}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', borderRadius: 8, cursor: 'pointer', padding: 0,
        background: hovered ? hoverBg : 'transparent',
        color: hovered ? hoverColor : (isDark ? '#94A3B8' : '#64748B'),
        transition: 'background 0.15s, color 0.15s',
      }}
    >{icon}</button>
  );
}

/* ─── Application Row ───────────────────────────────────────── */
function AppRow({ app, isDark, onView, onAnalyse, onDelete }: {
  app: Application; isDark: boolean;
  onView: () => void; onAnalyse: () => void; onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const st = STATUS_CONFIG[app.status] || STATUS_CONFIG.saved;
  const location = app.job_parsed_json?.location;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={e => e.key === 'Enter' && onView()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 20px', borderRadius: 12, cursor: 'pointer',
        background: hovered
          ? (isDark ? '#263348' : '#F8FAFC')
          : (isDark ? '#1E293B' : '#FFFFFF'),
        border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
        transition: 'background 0.15s',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, #1A56DB, #8B5CF6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 700, fontFamily: 'Inter, sans-serif', color: '#FFFFFF', lineHeight: 1,
      }}>
        {app.company?.charAt(0)?.toUpperCase() || '?'}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 600, fontFamily: 'Inter, sans-serif',
          color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{app.job_title}</div>
        <div style={{
          fontSize: 13, fontFamily: 'Inter, sans-serif',
          color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.4, marginTop: 2,
        }}>
          {app.company}
          {location && <span className="jb-location"> · {location}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Status badge */}
          <span style={{
            borderRadius: 999, padding: '2px 10px',
            fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif',
            background: st.bg, color: st.color, lineHeight: '18px',
          }}>{st.label}</span>
          {/* Date */}
          <span style={{
            fontSize: 12, fontFamily: 'Inter, sans-serif',
            color: isDark ? '#94A3B8' : '#64748B', lineHeight: '18px',
          }}>{formatDate(app.created_at)}</span>
          {/* Next action */}
          {app.next_action_date && (
            <span style={{
              borderRadius: 999, padding: '2px 10px',
              fontSize: 12, fontFamily: 'Inter, sans-serif', lineHeight: '18px',
              background: 'rgba(245,158,11,0.10)',
              border: '1px solid rgba(245,158,11,0.25)',
              color: '#F59E0B',
            }}>Action: {formatShortDate(app.next_action_date)}</span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="jb-row-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span className="jb-analyse-btn">
          <IconBtn
            icon={<Sparkles size={16} />} tooltip="AI Feedback"
            hoverColor="#1A56DB" hoverBg="rgba(26,86,219,0.1)" isDark={isDark}
            onClick={e => { e.stopPropagation(); onAnalyse(); }}
          />
        </span>
        <IconBtn
          icon={<Eye size={16} />} tooltip="View Details"
          hoverColor="#1A56DB" hoverBg="rgba(26,86,219,0.1)" isDark={isDark}
          onClick={e => { e.stopPropagation(); onView(); }}
        />
        <IconBtn
          icon={<Trash2 size={16} />} tooltip="Delete"
          hoverColor="#EF4444" hoverBg="rgba(239,68,68,0.1)" isDark={isDark}
          onClick={e => { e.stopPropagation(); onDelete(); }}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ApplicationsPage
   ═══════════════════════════════════════════════════════════════ */
export function ApplicationsPage() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>(() =>
    (typeof window !== 'undefined' && (localStorage.getItem('applyly-theme') as Theme)) || 'light',
  );
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('applyly-theme', theme);
  }, [theme]);

  /* ─── Data State ────────────────────────────────────────────── */
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  /* ─── Filter / Search / Sort ────────────────────────────────── */
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('newest');

  /* ─── Fetch ─────────────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('applications')
        .select('id, job_title, company, status, created_at, next_action_date, job_parsed_json')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to load applications:', error);
        toast.error('Failed to load applications');
      } else {
        setApplications((data as Application[]) || []);
      }
      setLoading(false);
    })();
  }, []);

  /* ─── Derived ───────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = applications;
    // filter
    list = list.filter(a => matchesFilter(a, filter));
    // search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.job_title.toLowerCase().includes(q) || a.company.toLowerCase().includes(q),
      );
    }
    // sort
    if (sort === 'newest') list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    else if (sort === 'oldest') list = [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    else if (sort === 'company') list = [...list].sort((a, b) => a.company.localeCompare(b.company));
    return list;
  }, [applications, filter, search, sort]);

  /* ─── Stats ─────────────────────────────────────────────────── */
  const weekStart = useMemo(startOfWeek, []);
  const stats = useMemo(() => ({
    total: applications.length,
    thisWeek: applications.filter(a => new Date(a.created_at) >= weekStart).length,
    interviews: applications.filter(a => a.status === 'interview_scheduled' || a.status === 'interview_done').length,
    offers: applications.filter(a => a.status === 'offer').length,
  }), [applications, weekStart]);

  /* ─── Delete ────────────────────────────────────────────────── */
  const handleDelete = useCallback(async (app: Application) => {
    if (!window.confirm(`Delete ${app.job_title} at ${app.company}? This cannot be undone.`)) return;
    const prev = [...applications];
    setApplications(a => a.filter(x => x.id !== app.id));
    const { error } = await supabase.from('applications').delete().eq('id', app.id);
    if (error) {
      console.error('Delete failed:', error);
      toast.error('Failed to delete. Please try again.');
      setApplications(prev);
    } else {
      toast.success(`${app.job_title} deleted`);
    }
  }, [applications]);

  /* ─── Colours ───────────────────────────────────────────────── */
  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)';
  const inputBg = isDark ? '#1E293B' : '#FFFFFF';
  const inputBorder = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)';

  /* ─── Clear Filters ────────────────────────────────────────── */
  const clearFilters = () => { setSearch(''); setFilter('all'); };

  return (
    <div style={{
      fontFamily: 'Inter, sans-serif', minHeight: '100vh',
      background: isDark
        ? 'radial-gradient(ellipse at 30% 20%, #1E293B 0%, #0F172A 60%)'
        : 'radial-gradient(ellipse at 30% 20%, #EFF6FF 0%, #F1F5F9 70%)',
      color: primaryText, transition: 'background 0.2s, color 0.2s',
      display: 'flex', flexDirection: 'column',
      overflowX: 'hidden',
    }}>
      {/* Grid bg */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M40 0H0v1h40V0zM0 0v40h1V0H0z' fill='%23${isDark ? 'ffffff' : '000000'}'/%3E%3C/svg%3E")`,
        backgroundSize: '40px 40px',
      }} />

      <SharedNavbar isDark={isDark} onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />

      <div className="jb-content-wrap" style={{
        flex: 1, padding: '32px 24px', maxWidth: 1280, width: '100%',
        margin: '0 auto', position: 'relative', zIndex: 1,
        overflowX: 'hidden', boxSizing: 'border-box',
      }}>
        {/* ─── Header ─────────────────────────────────────────── */}
        <div className="jb-header" style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 16, marginBottom: 24,
        }}>
          <div>
            <h1 style={{
              margin: 0, fontSize: 28, fontWeight: 600, fontFamily: 'Inter, sans-serif',
              color: primaryText, lineHeight: 1.3,
            }}>Applications</h1>
            <p style={{
              margin: '4px 0 0', fontSize: 13, fontFamily: 'Inter, sans-serif',
              color: secondaryText, lineHeight: 1.4,
            }}>
              {loading ? '…' : `${applications.length} application${applications.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => navigate('/new-application')}
            className="jb-primary-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: '0 20px',
              background: '#1A56DB', color: '#FFFFFF', border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
              lineHeight: 1, transition: 'background 0.15s, transform 0.1s',
            }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <Plus size={16} strokeWidth={2.5} /> New Application
          </button>
        </div>

        {/* ─── Stats Bar ──────────────────────────────────────── */}
        {!loading && applications.length > 0 && (
          <div className="jb-stats-bar" style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <StatCard label="Total" value={stats.total} isDark={isDark} />
            <StatCard label="This Week" value={stats.thisWeek} isDark={isDark} />
            <StatCard label="Interviews" value={stats.interviews} isDark={isDark} />
            <StatCard label="Offers" value={stats.offers} isDark={isDark} />
          </div>
        )}

        {/* ─── Search / Filter / Sort ─────────────────────────── */}
        {!loading && applications.length > 0 && (
          <div className="jb-filters" style={{
            display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap',
            overflow: 'hidden',
          }}>
            {/* Search */}
            <div style={{ position: 'relative', maxWidth: 300, flex: '1 1 200px', minWidth: 0 }}>
              <Search size={16} style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                color: secondaryText, pointerEvents: 'none',
              }} />
              <input
                type="text"
                placeholder="Search job title or company…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', height: 40, padding: '0 12px 0 36px',
                  background: inputBg, color: primaryText,
                  border: `1px solid ${inputBorder}`, borderRadius: 8,
                  fontSize: 14, fontFamily: 'Inter, sans-serif', fontWeight: 400,
                  outline: 'none', lineHeight: 1, transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#1A56DB'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = inputBorder; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>

            {/* Filter pills */}
            <div className="jb-pills-scroll" style={{
              display: 'flex', gap: 6, alignItems: 'center', flex: '1 1 auto',
              overflowX: 'auto', WebkitOverflowScrolling: 'touch',
              minWidth: 0, maxWidth: '100%',
            }}>
              {FILTER_PILLS.map(p => {
                const active = filter === p.key;
                const count = getFilterCount(applications, p.key);
                return (
                  <button
                    key={p.key}
                    onClick={() => setFilter(p.key)}
                    style={{
                      whiteSpace: 'nowrap', height: 32, padding: '0 14px',
                      borderRadius: 999, fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif',
                      cursor: 'pointer', lineHeight: 1, flexShrink: 0,
                      border: active ? 'none' : `1px solid ${borderColor}`,
                      background: active ? '#1A56DB' : (isDark ? '#1E293B' : '#FFFFFF'),
                      color: active ? '#FFFFFF' : secondaryText,
                      transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {p.label}
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: active ? 'rgba(255,255,255,0.7)' : secondaryText,
                    }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Sort */}
            <div className="jb-sort" style={{ position: 'relative', flexShrink: 0 }}>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                style={{
                  height: 40, padding: '0 32px 0 12px',
                  background: inputBg, color: primaryText,
                  border: `1px solid ${inputBorder}`, borderRadius: 8,
                  fontSize: 14, fontFamily: 'Inter, sans-serif', fontWeight: 400,
                  appearance: 'none', cursor: 'pointer', outline: 'none', lineHeight: 1,
                }}
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
              <ChevronDown size={14} style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                color: secondaryText, pointerEvents: 'none',
              }} />
            </div>
          </div>
        )}

        {/* ─── Loading ────────────────────────────────────────── */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2, 3].map(i => <SkeletonRow key={i} isDark={isDark} />)}
          </div>
        )}

        {/* ─── Empty: no applications at all ──────────────────── */}
        {!loading && applications.length === 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '80px 0',
          }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              textAlign: 'center',
            }}>
              <Inbox size={56} color={secondaryText} strokeWidth={1.2} />
              <h3 style={{
                margin: 0, fontSize: 18, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                color: primaryText, lineHeight: 1.3,
              }}>No applications yet</h3>
              <p style={{
                margin: 0, fontSize: 14, fontFamily: 'Inter, sans-serif',
                color: secondaryText, lineHeight: 1.5,
              }}>Add your first job application to get started</p>
              <button
                onClick={() => navigate('/new-application')}
                style={{
                  marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
                  height: 40, padding: '0 20px',
                  background: '#1A56DB', color: '#FFFFFF', border: 'none', borderRadius: 8,
                  fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer', lineHeight: 1,
                }}
              >
                <Plus size={16} strokeWidth={2.5} /> New Application
              </button>
            </div>
          </div>
        )}

        {/* ─── Empty: no search/filter match ──────────────────── */}
        {!loading && applications.length > 0 && filtered.length === 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '64px 0',
          }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              textAlign: 'center',
            }}>
              <SearchX size={48} color={secondaryText} strokeWidth={1.2} />
              <h3 style={{
                margin: 0, fontSize: 18, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                color: primaryText, lineHeight: 1.3,
              }}>No results</h3>
              <p style={{
                margin: 0, fontSize: 14, fontFamily: 'Inter, sans-serif',
                color: secondaryText, lineHeight: 1.5,
              }}>No applications match your search</p>
              <button
                onClick={clearFilters}
                style={{
                  marginTop: 4, height: 36, padding: '0 16px',
                  background: 'transparent', border: 'none', borderRadius: 8,
                  fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif',
                  color: secondaryText, cursor: 'pointer', lineHeight: 1,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#263348' : '#F8FAFC')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                Clear filters
              </button>
            </div>
          </div>
        )}

        {/* ─── Application List ───────────────────────────────── */}
        {!loading && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(app => (
              <AppRow
                key={app.id}
                app={app}
                isDark={isDark}
                onView={() => navigate(`/applications/${app.id}`)}
                onAnalyse={() => navigate(`/applications/${app.id}?tab=feedback`)}
                onDelete={() => handleDelete(app)}
              />
            ))}
          </div>
        )}
      </div>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 14,
            borderRadius: 10,
            background: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)',
            color: primaryText,
            border: `1px solid ${borderColor}`,
            backdropFilter: 'blur(12px)',
          },
        }}
      />

      <style>{`
        * { box-sizing: border-box; }
        @keyframes jb-shimmer {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .jb-shimmer { animation: jb-shimmer 1.2s ease-in-out infinite; }
        @keyframes jb-card-in {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .jb-primary-btn:hover { background: #1E40AF !important; }

        /* Mobile responsive */
        @media (max-width: 767px) {
          .jb-header { flex-direction: column !important; }
          .jb-header .jb-primary-btn { width: 100%; justify-content: center; }
          .jb-filters { flex-direction: column !important; align-items: stretch !important; overflow: visible !important; }
          .jb-filters > div:first-child { max-width: 100% !important; flex: 1 1 100% !important; width: 100% !important; }
          .jb-sort { width: 100%; }
          .jb-sort select { width: 100%; }
          .jb-pills-scroll { flex: 1 1 100% !important; max-width: 100% !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
          .jb-pills-scroll::-webkit-scrollbar { display: none; }
          .jb-location { display: none !important; }
          .jb-analyse-btn { display: none !important; }
          .jb-content-wrap { padding: 20px 16px !important; }
          .jb-stats-bar { gap: 8px !important; }
          .jb-stats-bar > div { min-width: 0 !important; flex: 1 1 calc(50% - 4px) !important; }
          .jb-app-row { padding: 12px 14px !important; gap: 12px !important; }
          .jb-app-row .jb-avatar { width: 36px !important; height: 36px !important; font-size: 15px !important; }
        }
      `}</style>
    </div>
  );
}