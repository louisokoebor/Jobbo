import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Lock, X } from 'lucide-react';
import { useUserPlan } from '../lib/UserPlanContext';
import { useNavigate } from 'react-router';

/* ─── Types ──────────────────────────────────────────────────── */
interface UpgradeModalProps {
  isDark: boolean;
  onClose: () => void;
  used?: number;
  max?: number;
}

/* ─── Circular Progress Ring ─────────────────────────────────── */
function UsageRing({ used, max, isDark }: { used: number; max: number; isDark: boolean }) {
  const size = 64;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(used / max, 1);
  const offset = circumference * (1 - ratio);
  const ringColor = ratio >= 1 ? '#EF4444' : '#1A56DB';
  const trackColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)';

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={ringColor} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease-out' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Inter, sans-serif', color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1 }}>
          {used}/{max}
        </span>
      </div>
    </div>
  );
}

/* ─── Plan Card ──────────────────────────────────────────────── */
function PlanCard({ title, price, subtitle, badge, selected, isDark, onClick }: {
  title: string; price: string; subtitle: string; badge?: string;
  selected: boolean; isDark: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const borderColor = selected ? '#1A56DB' : isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)';
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, padding: 16, borderRadius: 10,
        border: `${selected ? '2px' : '1px'} solid ${borderColor}`,
        background: selected ? (isDark ? 'rgba(26,86,219,0.06)' : 'rgba(26,86,219,0.04)') : (isDark ? '#263348' : '#F8FAFC'),
        cursor: 'pointer', textAlign: 'left', position: 'relative',
        transition: 'border-color 0.2s, background 0.2s, transform 0.15s',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        margin: selected ? 0 : 1, outline: 'none',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      {badge && (
        <span style={{
          position: 'absolute', top: -10, right: 10, padding: '2px 10px', borderRadius: 999,
          fontSize: 11, fontWeight: 600, fontFamily: 'Inter, sans-serif',
          background: 'rgba(16,185,129,0.15)', color: '#10B981', border: '1px solid rgba(16,185,129,0.3)',
          lineHeight: 1.6, whiteSpace: 'nowrap',
        }}>{badge}</span>
      )}
      <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.3 }}>{title}</span>
      <span style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Inter, sans-serif', color: '#1A56DB', lineHeight: 1.2 }}>{price}</span>
      <span style={{ fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: isDark ? '#94A3B8' : '#64748B', lineHeight: 1.4 }}>{subtitle}</span>
    </button>
  );
}

/* ─── Main Modal ─────────────────────────────────────────────── */
export function UpgradeModal({ isDark, onClose, used = 3, max = 3 }: UpgradeModalProps) {
  const { refresh, userId } = useUserPlan();
  const navigate = useNavigate();

  const [selectedIdx, setSelectedIdx] = useState<number>(1); // default annual

  const [hovUpgrade, setHovUpgrade] = useState(false);
  const [pressUpgrade, setPressUpgrade] = useState(false);
  const [hovLater, setHovLater] = useState(false);

  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)';

  const packages = [
    { id: 'pro_monthly', label: 'Pro Monthly', priceString: '\u00A39/month', subtitle: 'Billed monthly' },
    { id: 'pro_annual', label: 'Pro Annual', priceString: '\u00A379/year', subtitle: 'Billed annually' },
  ];

  /* ── Escape to close ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  /* ── Navigate to Billing ── */
  const handleUpgrade = useCallback(() => {
    onClose();
    navigate('/billing');
  }, [onClose, navigate]);

  const features = [
    'Unlimited CV generations',
    'Unlimited cover letters',
    'Civil Service Mode & STAR format',
    'All 3 CV templates',
  ];

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1500,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div role="dialog" aria-modal="true" aria-label="Upgrade to Pro"
        style={{ position: 'fixed', inset: 0, zIndex: 1501, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, pointerEvents: 'none' }}
      >
        <div onClick={e => e.stopPropagation()}
          style={{
            pointerEvents: 'auto', width: '100%', maxWidth: 480,
            background: isDark ? 'rgba(30,41,59,0.9)' : 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: `1px solid ${borderColor}`, borderRadius: 16,
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)', padding: '36px 32px 28px',
            position: 'relative', animation: 'upgradeModalIn 0.2s ease-out',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}
        >
          {/* Close */}
          <button onClick={onClose} aria-label="Close"
            style={{
              position: 'absolute', top: 16, right: 16, background: 'none', border: 'none',
              cursor: 'pointer', color: secondaryText, padding: 4,
              display: 'flex', lineHeight: 1, borderRadius: 6, transition: 'color 0.15s',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = primaryText)}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = secondaryText)}
          >
            <X size={18} />
          </button>

          <UsageRing used={used} max={max} isDark={isDark} />
          <p style={{ margin: '10px 0 0', fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText, lineHeight: 1.4, textAlign: 'center' }}>
            Free generations used
          </p>

          <h2 style={{ margin: '20px 0 0', fontSize: 24, fontWeight: 700, fontFamily: 'Inter, sans-serif', color: primaryText, lineHeight: 1.3, textAlign: 'center' }}>
            Unlock unlimited CVs
          </h2>
          <p style={{ margin: '10px 0 0', fontSize: 14, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText, lineHeight: 1.6, textAlign: 'center', maxWidth: 360 }}>
            You&rsquo;ve used your {max} free CV generations. Upgrade to Pro to keep tailoring CVs for every application.
          </p>

          <ul style={{ margin: '24px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 340 }}>
            {features.map((f, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: primaryText, lineHeight: 1.4 }}>
                <CheckCircle2 size={16} color="#10B981" style={{ flexShrink: 0 }} />{f}
              </li>
            ))}
          </ul>

          {/* Pricing Row */}
          <div style={{ display: 'flex', gap: 12, width: '100%', marginTop: 24 }}>
            {packages.map((pkg, i) => (
              <PlanCard key={pkg.id} title={pkg.label} price={pkg.priceString} subtitle={pkg.subtitle}
                badge={pkg.id === 'pro_annual' ? 'Save 27%' : undefined}
                selected={selectedIdx === i} isDark={isDark} onClick={() => setSelectedIdx(i)} />
            ))}
          </div>

          <button onClick={handleUpgrade}
            onMouseEnter={() => setHovUpgrade(true)}
            onMouseLeave={() => { setHovUpgrade(false); setPressUpgrade(false); }}
            onMouseDown={() => setPressUpgrade(true)}
            onMouseUp={() => setPressUpgrade(false)}
            style={{
              width: '100%', height: 48, marginTop: 24,
              background: hovUpgrade ? '#1E40AF' : '#1A56DB',
              color: '#FFFFFF', border: 'none', borderRadius: 8,
              cursor: 'pointer',
              fontSize: 16, fontWeight: 600, fontFamily: 'Inter, sans-serif', lineHeight: 1,
              transform: pressUpgrade ? 'scale(0.97)' : 'scale(1)',
              transition: 'background 0.15s, transform 0.1s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            Upgrade to Pro &rarr;
          </button>

          <button onClick={onClose}
            onMouseEnter={() => setHovLater(true)} onMouseLeave={() => setHovLater(false)}
            style={{
              marginTop: 8, background: 'none', border: 'none',
              cursor: 'pointer', color: secondaryText,
              fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif', lineHeight: 1,
              padding: '8px 16px', borderRadius: 6, transition: 'color 0.15s',
              textDecoration: hovLater ? 'underline' : 'none',
            }}
          >Maybe later</button>

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: secondaryText }}>
            <Lock size={12} />
            <span style={{ fontSize: 12, fontWeight: 400, fontFamily: 'Inter, sans-serif', lineHeight: 1.4 }}>
              Cancel anytime &middot; Powered by Stripe
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes upgradeModalIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </>
  );
}
