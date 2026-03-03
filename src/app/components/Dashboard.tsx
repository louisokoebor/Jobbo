import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import {
  Plus, Trash2, ArrowRight, Bookmark, Send,
  Calendar, CheckSquare, Star, XCircle,
  TrendingUp, Building2,
  AlertCircle, CheckCircle2,
} from 'lucide-react';
import { SharedNavbar } from './SharedNavbar';
import { supabase } from '../lib/supabaseClient';

/* ─── Types ──────────────────────────────────────────────────── */
type Theme = 'dark' | 'light';
type StatusKey =
  | 'saved'
  | 'applied'
  | 'interview-scheduled'
  | 'interview-done'
  | 'offer'
  | 'rejected';

/** DB uses underscores; UI uses hyphens */
type DbStatus = 'saved' | 'applied' | 'interview_scheduled' | 'interview_done' | 'offer' | 'rejected';

interface AppCard {
  id: string;
  company: string;
  jobTitle: string;
  dateApplied: string;
  status: StatusKey;
  logoColor: string;
  nextActionDate?: string | null;
}

interface DragItem {
  id: string;
  fromStatus: StatusKey;
}

interface StatusConfig {
  label: string;
  color: string;
  EmptyIcon: React.ElementType;
  emptyText: string;
}

interface ToastItem {
  id: number;
  type: 'success' | 'error';
  message: string;
}

/* ─── Status mapping ─────────────────────────────────────────── */
const DB_TO_UI: Record<DbStatus, StatusKey> = {
  saved: 'saved',
  applied: 'applied',
  interview_scheduled: 'interview-scheduled',
  interview_done: 'interview-done',
  offer: 'offer',
  rejected: 'rejected',
};

const UI_TO_DB: Record<StatusKey, DbStatus> = {
  saved: 'saved',
  applied: 'applied',
  'interview-scheduled': 'interview_scheduled',
  'interview-done': 'interview_done',
  offer: 'offer',
  rejected: 'rejected',
};

/* ─── Status Config ──────────────────────────────────────────── */
const STATUS_CONFIG: Record<StatusKey, StatusConfig> = {
  saved:                { label: 'Saved',               color: '#94A3B8', EmptyIcon: Bookmark,     emptyText: 'Nothing saved yet' },
  applied:              { label: 'Applied',             color: '#3B82F6', EmptyIcon: Send,         emptyText: 'No applications yet — go for it!' },
  'interview-scheduled':{ label: 'Interview Scheduled', color: '#F59E0B', EmptyIcon: Calendar,     emptyText: 'No interviews yet — keep applying!' },
  'interview-done':     { label: 'Interview Done',      color: '#8B5CF6', EmptyIcon: CheckSquare,  emptyText: 'No completed interviews' },
  offer:                { label: 'Offer',               color: '#10B981', EmptyIcon: Star,         emptyText: 'Your offer is coming' },
  rejected:             { label: 'Rejected',            color: '#EF4444', EmptyIcon: XCircle,      emptyText: 'Rejections are just redirections' },
};

const STATUS_ORDER: StatusKey[] = [
  'saved', 'applied', 'interview-scheduled', 'interview-done', 'offer', 'rejected',
];

/* ─── Helpers ────────────────────────────────────────────────── */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function parseDate(str: string): Date {
  const parts = str.split(' ');
  const months: Record<string, number> = {
    Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
    Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11,
  };
  return new Date(+parts[2], months[parts[1]], +parts[0]);
}

const LOGO_COLORS = ['#635BFF','#5E6AD2','#F24E1E','#3ECF8E','#FF6363','#625DF5','#C17F24','#24292F','#1A56DB'];

function companyToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return LOGO_COLORS[Math.abs(hash) % LOGO_COLORS.length];
}

/* ─── Toast Container ────────────────────────────────────────── */
function ToastContainer({ toasts, isDark, onDismiss }: { toasts: ToastItem[]; isDark: boolean; onDismiss: (id: number) => void }) {
  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 600,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            pointerEvents: 'auto',
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px',
            background: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(248,250,252,0.98)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
            borderLeft: `3px solid ${t.type === 'error' ? '#EF4444' : '#10B981'}`,
            borderRadius: 10,
            boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(15,23,42,0.12)',
            animation: 'jb-card-in 0.2s ease-out',
            minWidth: 240, maxWidth: 360,
          }}
        >
          {t.type === 'error'
            ? <AlertCircle size={16} color="#EF4444" style={{ flexShrink: 0 }} />
            : <CheckCircle2 size={16} color="#10B981" style={{ flexShrink: 0 }} />
          }
          <span style={{
            fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif',
            color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.4, flex: 1,
          }}>
            {t.message}
          </span>
          <button
            onClick={() => onDismiss(t.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              color: isDark ? '#64748B' : '#94A3B8', lineHeight: 1, flexShrink: 0,
            }}
          >
            <XCircle size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─── Skeleton Card ──────────────────────────────────────────── */
function SkeletonCard({ isDark }: { isDark: boolean }) {
  const bg = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.12)';
  return (
    <div style={{
      borderRadius: 12, padding: 16, marginBottom: 12,
      background: isDark ? 'rgba(30,41,59,0.4)' : 'rgba(255,255,255,0.4)',
      border: `1px solid ${isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.12)'}`,
    }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <div className="jb-shimmer" style={{ width: 22, height: 22, borderRadius: '50%', background: bg }} />
        <div className="jb-shimmer" style={{ width: '60%', height: 14, borderRadius: 6, background: bg }} />
      </div>
      <div className="jb-shimmer" style={{ width: '85%', height: 12, borderRadius: 6, background: bg, marginBottom: 8 }} />
      <div className="jb-shimmer" style={{ width: '40%', height: 10, borderRadius: 6, background: bg }} />
    </div>
  );
}

/* ─── CompanyLogo ────────────────────────────────────────────── */
function CompanyLogo({ company, color, size = 28 }: { company: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{
        fontSize: size * 0.43, fontWeight: 700, fontFamily: 'Inter, sans-serif',
        color: '#FFFFFF', lineHeight: 1, textTransform: 'uppercase', userSelect: 'none',
      }}>
        {company[0]}
      </span>
    </div>
  );
}

/* ─── StatusBadge ────────────────────────────────────────────── */
function StatusBadge({ status }: { status: StatusKey }) {
  const cfg = STATUS_CONFIG[status];
  const bg = cfg.color + '26'; // ~15% opacity
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500,
      fontFamily: 'Inter, sans-serif', background: bg, color: cfg.color,
      border: `1px solid ${cfg.color}40`, lineHeight: 1.6, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {cfg.label}
    </span>
  );
}

/* ─── Stats Bar ──────────────────────────────────────────────── */
function StatsBar({ cards, isDark }: { cards: AppCard[]; isDark: boolean }) {
  const total = cards.length;

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }, []);

  const thisWeek = useMemo(() =>
    cards.filter(c => parseDate(c.dateApplied) >= weekStart).length,
  [cards, weekStart]);

  const interviewed = useMemo(() =>
    cards.filter(c => ['interview-scheduled', 'interview-done'].includes(c.status)).length,
  [cards]);

  const offerCount = useMemo(() =>
    cards.filter(c => c.status === 'offer').length,
  [cards]);

  const interviewRate = total > 0 ? Math.round((interviewed / total) * 100) : 0;
  const offerRate = total > 0 ? Math.round((offerCount / total) * 100) : 0;

  const stats = [
    { label: 'Total Applications', value: String(total), icon: <Building2 size={14} /> },
    { label: 'This Week',          value: String(thisWeek),  icon: <Send size={14} /> },
    { label: 'Interview Rate',     value: `${interviewRate}%`,       icon: <Calendar size={14} /> },
    { label: 'Offer Rate',         value: `${offerRate}%`,           icon: <TrendingUp size={14} /> },
  ];

  return (
    <div style={{
      background: isDark ? 'rgba(30,41,59,0.6)' : 'rgba(255,255,255,0.6)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)'}`,
      boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.25)' : '0 4px 16px rgba(15,23,42,0.05)',
    }}>
      <div className="stats-inner" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        padding: '0',
      }}>
        {stats.map((stat, i) => (
          <StatBlock
            key={stat.label}
            stat={stat}
            isDark={isDark}
            showDivider={i < stats.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function StatBlock({
  stat, isDark, showDivider,
}: {
  stat: { label: string; value: string; icon: React.ReactNode };
  isDark: boolean;
  showDivider: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'stretch' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          flex: 1,
          padding: '16px 24px',
          borderLeft: `3px solid ${hovered ? '#1A56DB' : 'transparent'}`,
          transition: 'border-color 0.2s',
          cursor: 'default',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
          color: isDark ? '#94A3B8' : '#64748B',
        }}>
          {stat.icon}
          <span style={{
            fontSize: 11, fontWeight: 500, fontFamily: 'Inter, sans-serif',
            textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1,
          }}>
            {stat.label}
          </span>
        </div>
        <p style={{
          margin: 0, fontSize: 28, fontWeight: 700, fontFamily: 'Inter, sans-serif',
          color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1,
        }}>
          {stat.value}
        </p>
      </div>
      {showDivider && (
        <div style={{
          width: 1, alignSelf: 'stretch', margin: '12px 0',
          background: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)',
        }} />
      )}
    </div>
  );
}

/* ─── Kanban Card ────────────────────────────────────────────── */
function KanbanCard({
  card, isDark, onDelete, onView,
}: {
  card: AppCard; isDark: boolean; onDelete: (id: string) => void; onView: (card: AppCard) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [{ isDragging }, drag] = useDrag<DragItem, void, { isDragging: boolean }>({
    type: 'CARD',
    item: { id: card.id, fromStatus: card.status },
    collect: monitor => ({ isDragging: monitor.isDragging() }),
  });

  return (
    <div
      ref={drag}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
      style={{
        background: isDark ? 'rgba(30,41,59,0.65)' : 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.2)'}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.85 : 1,
        transform: isDragging ? 'scale(1.02)' : hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: isDragging
          ? '0 12px 40px rgba(0,0,0,0.5)'
          : hovered
          ? '0 8px 32px rgba(0,0,0,0.4)'
          : '0 4px 24px rgba(0,0,0,0.25)',
        transition: isDragging ? 'none' : 'transform 0.15s, box-shadow 0.15s, opacity 0.15s',
        userSelect: 'none',
      }}
    >
      {/* Top row: logo + company + badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <CompanyLogo company={card.company} color={card.logoColor} size={22} />
        <span style={{
          flex: 1, fontSize: 14, fontWeight: 600, fontFamily: 'Inter, sans-serif',
          color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.3, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {card.company}
        </span>
        <StatusBadge status={card.status} />
      </div>

      {/* Job title */}
      <p style={{
        margin: '0 0 10px',
        fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif',
        color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.4,
        display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {card.jobTitle}
      </p>

      {/* Date + next action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <p style={{
          margin: 0, fontSize: 12, fontWeight: 400, fontFamily: 'Inter, sans-serif',
          color: isDark ? '#64748B' : '#94A3B8', lineHeight: 1.3,
        }}>
          {card.dateApplied}
        </p>
        {card.nextActionDate && (
          <span style={{
            padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500,
            fontFamily: 'Inter, sans-serif',
            background: 'rgba(245,158,11,0.15)', color: '#F59E0B',
            border: '1px solid rgba(245,158,11,0.3)',
            lineHeight: 1.6, whiteSpace: 'nowrap',
          }}>
            Action: {formatShortDate(card.nextActionDate)}
          </span>
        )}
      </div>

      {/* Bottom actions */}
      {hovered && !isDragging && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)'}`, paddingTop: 10 }}>
          {!confirmDelete ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                onClick={e => { e.stopPropagation(); onView(card); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#1A56DB', fontSize: 13, fontWeight: 500,
                  fontFamily: 'Inter, sans-serif', padding: 0, lineHeight: 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
              >
                View <ArrowRight size={12} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
                aria-label="Delete application"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: isDark ? '#64748B' : '#94A3B8', padding: 4,
                  display: 'flex', alignItems: 'center', borderRadius: 4, lineHeight: 1,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#EF4444')}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = isDark ? '#64748B' : '#94A3B8')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, fontFamily: 'Inter, sans-serif', color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.3 }}>
                Delete this application?
              </span>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(card.id); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#EF4444', fontSize: 12, fontWeight: 600,
                    fontFamily: 'Inter, sans-serif', padding: 0, lineHeight: 1,
                  }}
                >
                  Yes, delete
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(false); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, fontWeight: 500,
                    fontFamily: 'Inter, sans-serif', padding: 0, lineHeight: 1,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Kanban Column ──────────────────────────────────────────── */
function KanbanColumn({
  status, cards, isDark, isLoading, onMoveCard, onDelete, onView,
}: {
  status: StatusKey; cards: AppCard[]; isDark: boolean; isLoading: boolean;
  onMoveCard: (id: string, toStatus: StatusKey) => void;
  onDelete: (id: string) => void;
  onView: (card: AppCard) => void;
}) {
  const cfg = STATUS_CONFIG[status];

  const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>({
    accept: 'CARD',
    drop: (item) => {
      if (item.fromStatus !== status) onMoveCard(item.id, status);
    },
    collect: monitor => ({ isOver: monitor.isOver() }),
  });

  return (
    <div
      ref={drop}
      className="kanban-column"
      style={{
        width: 280, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        background: isDark ? 'rgba(15,23,42,0.4)' : 'rgba(241,245,249,0.5)',
        border: `1px solid ${isOver ? '#1A56DB' : isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)'}`,
        borderRadius: 12,
        boxShadow: isOver ? 'inset 0 0 0 1px rgba(26,86,219,0.3), 0 0 0 3px rgba(26,86,219,0.08)' : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      {/* Column header */}
      <div style={{
        padding: '14px 16px 12px',
        borderTop: `3px solid ${cfg.color}`,
        borderBottom: `1px solid ${isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.12)'}`,
        display: 'flex', alignItems: 'center', gap: 8,
        background: isDark ? 'rgba(15,23,42,0.3)' : 'rgba(248,250,252,0.6)',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 14, fontWeight: 600, fontFamily: 'Inter, sans-serif',
          color: isDark ? '#F8FAFC' : '#0F172A', flex: 1, lineHeight: 1.2,
        }}>
          {cfg.label}
        </span>
        <span style={{
          padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 500,
          fontFamily: 'Inter, sans-serif',
          background: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.15)',
          color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.6,
        }}>
          {isLoading ? '-' : cards.length}
        </span>
      </div>

      {/* Cards area */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 12px 4px',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(26,86,219,0.4) transparent',
      }}>
        {isLoading ? (
          <>
            <SkeletonCard isDark={isDark} />
            <SkeletonCard isDark={isDark} />
          </>
        ) : cards.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 10, padding: '40px 16px',
            color: isDark ? '#64748B' : '#94A3B8',
          }}>
            <cfg.EmptyIcon size={24} strokeWidth={1.5} />
            <p style={{
              margin: 0, fontSize: 13, fontFamily: 'Inter, sans-serif',
              fontWeight: 400, fontStyle: 'italic', textAlign: 'center', lineHeight: 1.5,
            }}>
              {cfg.emptyText}
            </p>
          </div>
        ) : (
          cards.map(card => (
            <KanbanCard
              key={card.id}
              card={card}
              isDark={isDark}
              onDelete={onDelete}
              onView={onView}
            />
          ))
        )}

        {/* Drop placeholder */}
        {isOver && (
          <div style={{
            height: 76, border: '2px dashed rgba(26,86,219,0.4)',
            borderRadius: 12, background: 'rgba(26,86,219,0.04)',
            marginBottom: 12,
          }} />
        )}
      </div>
    </div>
  );
}

/* ─── Empty Dashboard Overlay ────────────────────────────────── */
function EmptyDashboardOverlay({ isDark, onNewApp }: { isDark: boolean; onNewApp: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 2,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{
        pointerEvents: 'auto',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        padding: '48px 40px',
        background: isDark ? 'rgba(30,41,59,0.6)' : 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
        borderRadius: 12,
        boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(15,23,42,0.08)',
        textAlign: 'center',
        animation: 'jb-modal-in 0.2s ease-out',
      }}>
        <Building2 size={40} color={isDark ? '#64748B' : '#94A3B8'} strokeWidth={1.5} />
        <h3 style={{
          margin: 0, fontSize: 20, fontWeight: 600, fontFamily: 'Inter, sans-serif',
          color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.3,
        }}>
          No applications yet
        </h3>
        <p style={{
          margin: 0, fontSize: 14, fontFamily: 'Inter, sans-serif',
          color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.5, maxWidth: 280,
        }}>
          Click &ldquo;New Application&rdquo; to get started
        </p>
        <button
          onClick={onNewApp}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => { setHovered(false); setPressed(false); }}
          onMouseDown={() => setPressed(true)}
          onMouseUp={() => setPressed(false)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 40, padding: '0 20px', marginTop: 4,
            background: hovered ? '#1E40AF' : '#1A56DB',
            color: '#FFFFFF', border: 'none', borderRadius: 8, cursor: 'pointer',
            fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif',
            transform: pressed ? 'scale(0.97)' : 'scale(1)',
            transition: 'background 0.15s, transform 0.1s', lineHeight: 1,
          }}
        >
          <Plus size={15} strokeWidth={2.5} />
          New Application
        </button>
      </div>
    </div>
  );
}

/* ─── Dashboard Inner (uses DnD hooks) ──────────────────────── */
function DashboardInner() {
  const navigate = useNavigate();

  const [theme, setTheme] = useState<Theme>(() =>
    (typeof window !== 'undefined' && (localStorage.getItem('jobbo-theme') as Theme)) || 'dark'
  );
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('jobbo-theme', theme);
  }, [theme]);

  const [cards, setCards] = useState<AppCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);

  /* ── Auth gate — wait for session before doing anything ── */
  const [authReady, setAuthReady] = useState(false);
  const sessionRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    const waitForAuth = async () => {
      try {
        // Try immediate session
        let { data: { session } } = await supabase.auth.getSession();

        // If no session, poll (covers OAuth hash processing race condition)
        if (!session) {
          for (let i = 0; i < 30; i++) {
            if (cancelled) return;
            await new Promise(r => setTimeout(r, 500));
            try {
              const result = await supabase.auth.getSession();
              if (result.data.session) {
                session = result.data.session;
                break;
              }
            } catch (_pollErr) {
              // Ignore individual poll failures; keep trying
            }
          }
        }

        if (cancelled) return;

        if (!session) {
          // No session at all — send to login
          navigate('/login', { replace: true });
          return;
        }

        sessionRef.current = session;

        // Previously this checked cv_profiles and redirected to /onboarding
        // if none existed. Removed: users who click "Skip for now" on the
        // onboarding wizard should land here with an empty dashboard.
        // The dashboard shows empty-state messaging in each Kanban column.

        if (!cancelled) setAuthReady(true);
      } catch (err) {
        console.error('Dashboard: Unexpected error during auth check:', err);
        if (!cancelled) {
          navigate('/login', { replace: true });
        }
      }
    };

    waitForAuth();
    return () => { cancelled = true; };
  }, [navigate]);

  /* ── Toast helpers ── */
  const addToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  /* ── Fetch applications from Supabase ── */
  const fetchApplications = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('id, job_title, company, status, created_at, next_action_date, updated_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Dashboard: Failed to fetch applications:', error.message);
        addToast('error', 'Failed to load applications. Please refresh.');
        setIsLoading(false);
        return;
      }

      const mapped: AppCard[] = (data || []).map((row: any) => ({
        id: String(row.id),
        company: row.company || 'Unknown',
        jobTitle: row.job_title || 'Untitled Position',
        dateApplied: row.created_at ? formatDate(row.created_at) : 'Unknown date',
        status: DB_TO_UI[row.status as DbStatus] || 'saved',
        logoColor: companyToColor(row.company || 'U'),
        nextActionDate: row.next_action_date || null,
      }));

      setCards(mapped);
    } catch (err) {
      console.error('Dashboard: Unexpected error fetching applications:', err);
      addToast('error', 'Failed to load applications. Please refresh.');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  /* ── Only fetch AFTER auth is ready ── */
  useEffect(() => {
    if (authReady) fetchApplications();
  }, [authReady, fetchApplications]);

  /* ── Real-time subscription — also gated on authReady ── */
  useEffect(() => {
    if (!authReady) return;

    let channelRef: any = null;

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;
      if (!userId) return;

      const channel = supabase
        .channel('applications-changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'applications',
          filter: `user_id=eq.${userId}`,
        }, () => {
          fetchApplications();
        })
        .subscribe();

      channelRef = channel;
    };

    setupRealtime();

    return () => {
      if (channelRef) supabase.removeChannel(channelRef);
    };
  }, [authReady, fetchApplications]);

  /* ── Move card (optimistic + persist) ── */
  const moveCard = useCallback(async (id: string, toStatus: StatusKey) => {
    // Save old status for rollback
    const oldCards = cards;
    const card = cards.find(c => c.id === id);
    if (!card || card.status === toStatus) return;

    // Optimistic update
    setCards(prev => prev.map(c => c.id === id ? { ...c, status: toStatus } : c));

    // Persist to Supabase
    const { error } = await supabase
      .from('applications')
      .update({ status: UI_TO_DB[toStatus] })
      .eq('id', id);

    if (error) {
      console.error('Dashboard: Failed to update status:', error.message);
      // Rollback
      setCards(oldCards);
      addToast('error', 'Failed to update status. Please try again.');
    }
  }, [cards, addToast]);

  /* ── Delete card (persist) ── */
  const deleteCard = useCallback(async (id: string) => {
    const oldCards = cards;

    // Optimistic removal
    setCards(prev => prev.filter(c => c.id !== id));

    const { error } = await supabase
      .from('applications')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Dashboard: Failed to delete application:', error.message);
      setCards(oldCards);
      addToast('error', 'Failed to delete. Please try again.');
    } else {
      addToast('success', 'Application deleted');
    }
  }, [cards, addToast]);

  const cardsByStatus = useMemo(() => {
    const map: Record<StatusKey, AppCard[]> = {
      saved: [], applied: [], 'interview-scheduled': [],
      'interview-done': [], offer: [], rejected: [],
    };
    cards.forEach(c => map[c.status].push(c));
    return map;
  }, [cards]);

  const isEmpty = !isLoading && cards.length === 0;

  // Lock body scroll when dashboard is empty so the empty state card stays centred
  useEffect(() => {
    if (isEmpty) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isEmpty]);

  /* ── Render ── */

  /* Show a full-screen loading spinner while auth/onboarding check runs */
  if (!authReady) {
    return (
      <div style={{
        fontFamily: 'Inter, sans-serif',
        minHeight: '100vh',
        background: isDark
          ? 'radial-gradient(ellipse at 30% 20%, #1E293B 0%, #0F172A 60%)'
          : 'radial-gradient(ellipse at 30% 20%, #EFF6FF 0%, #F1F5F9 70%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '3px solid transparent',
            borderTopColor: '#1A56DB', borderRightColor: '#1A56DB',
            animation: 'jb-spin-dash 0.75s linear infinite',
          }} />
          <p style={{ margin: 0, fontSize: 14, fontFamily: 'Inter, sans-serif', fontWeight: 500, color: isDark ? '#94A3B8' : '#64748B' }}>
            Loading your dashboard…
          </p>
        </div>
        <style>{`@keyframes jb-spin-dash { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: 'Inter, sans-serif',
      minHeight: '100vh',
      height: isEmpty ? '100vh' : undefined,
      overflow: isEmpty ? 'hidden' : undefined,
      background: isDark
        ? 'radial-gradient(ellipse at 30% 20%, #1E293B 0%, #0F172A 60%)'
        : 'radial-gradient(ellipse at 30% 20%, #EFF6FF 0%, #F1F5F9 70%)',
      color: isDark ? '#F8FAFC' : '#0F172A',
      transition: 'background 0.2s, color 0.2s',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      {/* Grid background overlay */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M40 0H0v1h40V0zM0 0v40h1V0H0z' fill='%23${isDark ? 'ffffff' : '000000'}'/%3E%3C/svg%3E")`,
        backgroundSize: '40px 40px',
      }} />

      {/* Navbar */}
      <SharedNavbar
        isDark={isDark}
        onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
      />

      {/* Stats bar */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <StatsBar cards={cards} isDark={isDark} />
      </div>

      {/* Kanban board */}
      <div
        className="kanban-scroll"
        style={{
          flex: 1,
          overflowX: isEmpty ? 'hidden' : 'auto',
          overflowY: 'hidden',
          padding: '24px',
          display: 'flex', gap: 16,
          alignItems: 'flex-start',
          position: 'relative', zIndex: 1,
          scrollbarWidth: 'thin',
          scrollbarColor: 'transparent transparent',
          minHeight: 0,
          // For viewport height consistency
          height: 'calc(100vh - 60px - 68px)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.scrollbarColor = 'rgba(26,86,219,0.4) transparent';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.scrollbarColor = 'transparent transparent';
        }}
      >
        {!isEmpty && STATUS_ORDER.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            cards={cardsByStatus[status]}
            isDark={isDark}
            isLoading={isLoading}
            onMoveCard={moveCard}
            onDelete={deleteCard}
            onView={card => {
              navigate(`/applications/${card.id}`);
            }}
          />
        ))}

        {/* Empty dashboard overlay */}
        {isEmpty && (
          <EmptyDashboardOverlay isDark={isDark} onNewApp={() => navigate('/new-application')} />
        )}
      </div>

      {/* Mobile FAB */}
      <MobileFAB onClick={() => navigate('/new-application')} />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} isDark={isDark} onDismiss={dismissToast} />

      {/* Keyframes & responsive styles */}
      <style>{`
        @keyframes jb-card-in {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes jb-modal-in {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes jb-shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.7; }
          100% { opacity: 0.4; }
        }
        .jb-shimmer { animation: jb-shimmer 1.5s ease-in-out infinite; }
        * { box-sizing: border-box; }

        /* Custom scrollbar for kanban */
        .kanban-scroll::-webkit-scrollbar { height: 6px; }
        .kanban-scroll::-webkit-scrollbar-track { background: transparent; }
        .kanban-scroll::-webkit-scrollbar-thumb {
          background: rgba(26,86,219,0.4); border-radius: 3px;
        }
        .kanban-scroll:hover::-webkit-scrollbar-thumb { background: rgba(26,86,219,0.6); }

        /* Column card scroll */
        .kanban-column > div::-webkit-scrollbar { width: 4px; }
        .kanban-column > div::-webkit-scrollbar-track { background: transparent; }
        .kanban-column > div::-webkit-scrollbar-thumb { background: rgba(26,86,219,0.3); border-radius: 2px; }

        /* Mobile: scroll-snap columns */
        @media (max-width: 767px) {
          .kanban-scroll {
            scroll-snap-type: x mandatory !important;
            -webkit-overflow-scrolling: touch;
            padding: 16px !important;
          }
          .kanban-column {
            width: 85vw !important;
            scroll-snap-align: center;
            flex-shrink: 0;
          }
          .stats-inner {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ─── Mobile FAB ─────────────────────────────────────────────── */
function MobileFAB({ onClick }: { onClick: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      aria-label="New Application"
      className="mobile-fab"
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 90,
        width: 56, height: 56, borderRadius: '50%',
        background: '#1A56DB', border: 'none', cursor: 'pointer',
        alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 20px rgba(26,86,219,0.5)',
        transform: pressed ? 'scale(0.93)' : 'scale(1)',
        transition: 'transform 0.1s, box-shadow 0.15s',
        display: 'none',
      }}
    >
      <Plus size={24} color="#FFFFFF" strokeWidth={2.5} />
      <style>{`
        @media (max-width: 767px) { .mobile-fab { display: flex !important; } }
      `}</style>
    </button>
  );
}

/* ─── Export (wraps in DndProvider) ─────────────────────────── */
export function Dashboard() {
  return (
    <DndProvider backend={HTML5Backend}>
      <DashboardInner />
    </DndProvider>
  );
}