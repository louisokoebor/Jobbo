/**
 * BillingPage — Billing & Plan management for Jobbo
 *
 * Reads plan state from RevenueCat (source of truth) with Supabase DB fallback.
 * Three-column plan comparison, usage meter, purchase via RC Stripe sheet.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Check, X as XIcon, Lock, Zap, ChevronRight, Loader2, ArrowLeft,
} from 'lucide-react';
import { SharedNavbar } from './SharedNavbar';
import { supabase } from '../lib/supabaseClient';
import {
  getProEntitlement,
  getManagementURL,
  purchasePackage,
  type PackageId,
} from '../lib/revenueCatClient';

/* ─── Types ──────────────────────────────────────────────────── */
type Theme = 'dark' | 'light';

interface PlanState {
  planTier: 'free' | 'pro';
  generationsUsed: number;
  generationsLimit: number;
}

/* ─── Feature comparison data ────────────────────────────────── */
interface FeatureRow {
  label: string;
  free: string | boolean;
  pro: string | boolean;
}

const FEATURES: FeatureRow[] = [
  { label: 'CV generations',    free: '3 lifetime',  pro: 'Unlimited' },
  { label: 'Cover letters',     free: false,         pro: true },
  { label: 'Base CV profiles',  free: '1',           pro: '3' },
  { label: 'CV templates',      free: '1',           pro: 'All 3' },
  { label: 'Doc upload',        free: false,         pro: 'Up to 5' },
  { label: 'Civil Service Mode',free: false,         pro: true },
  { label: 'App tracker',       free: '10 apps',     pro: 'Unlimited' },
  { label: 'Interview notes',   free: false,         pro: true },
  { label: 'App history',       free: '30 days',     pro: 'Unlimited' },
];

/* ─── Shimmer Skeleton ───────────────────────────────────────── */
function Shimmer({ width, height, isDark, style }: { width: string | number; height: number; isDark: boolean; style?: React.CSSProperties }) {
  return (
    <div className="jb-shimmer" style={{
      width, height, borderRadius: 6,
      background: isDark
        ? 'linear-gradient(90deg, rgba(148,163,184,0.06) 25%, rgba(148,163,184,0.12) 50%, rgba(148,163,184,0.06) 75%)'
        : 'linear-gradient(90deg, rgba(148,163,184,0.08) 25%, rgba(148,163,184,0.16) 50%, rgba(148,163,184,0.08) 75%)',
      backgroundSize: '200% 100%',
      ...style,
    }} />
  );
}

/* ─── Feature Row Render ─────────────────────────────────────── */
function FeatureRowItem({ label, value, isDark }: { label: string; value: string | boolean; isDark: boolean }) {
  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const mutedText = isDark ? '#475569' : '#94A3B8';
  const isIncluded = value !== false;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {isIncluded
        ? <Check size={14} color="#10B981" strokeWidth={2.5} style={{ flexShrink: 0 }} />
        : <XIcon size={14} color={mutedText} style={{ flexShrink: 0 }} />
      }
      <span style={{
        fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif',
        color: isIncluded ? primaryText : mutedText,
        lineHeight: 1.4,
      }}>
        {label}
        {typeof value === 'string' && (
          <span style={{ color: secondaryText }}> &mdash; {value}</span>
        )}
      </span>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export function BillingPage() {
  const navigate = useNavigate();

  /* ── Theme ── */
  const [theme, setTheme] = useState<Theme>(() =>
    (typeof window !== 'undefined' && (localStorage.getItem('jobbo-theme') as Theme)) || 'dark',
  );
  const isDark = theme === 'dark';
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('jobbo-theme', theme);
  }, [theme]);

  /* ── State ── */
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanState>({ planTier: 'free', generationsUsed: 0, generationsLimit: 3 });
  const [rcIsPro, setRcIsPro] = useState(false);
  const [activePlanId, setActivePlanId] = useState<PackageId | 'free'>('free');

  const [purchasingId, setPurchasingId] = useState<PackageId | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>();

  /* ── On mount: auth + plan ── */
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/login', { replace: true }); return; }
      if (cancelled) return;
      setUserId(user.id);
      setUserEmail(user.email ?? null);

      // DB plan state
      const { data: dbUser } = await supabase
        .from('users')
        .select('plan_tier, generations_used, generations_limit')
        .eq('id', user.id)
        .single();

      if (cancelled) return;

      const dbPlan: PlanState = {
        planTier: dbUser?.plan_tier === 'pro' ? 'pro' : 'free',
        generationsUsed: dbUser?.generations_used ?? 0,
        generationsLimit: dbUser?.generations_limit ?? 3,
      };

      // Live RC entitlement — source of truth
      let rcIsPro = false;
      try {
        rcIsPro = await getProEntitlement(user.id);
      } catch (err) {
        console.warn('[BillingPage] RC entitlement check failed:', err);
      }

      if (cancelled) return;

      // User is pro if EITHER source says so
      const isPro = dbPlan.planTier === 'pro' || rcIsPro;

      // Always set plan to pro if either source confirms it
      if (isPro) {
        dbPlan.planTier = 'pro';
      }

      setRcIsPro(isPro);
      setPlan(dbPlan);

      // Set activePlanId based on confirmed pro status
      setActivePlanId(isPro ? 'pro_monthly' : 'free');

      console.log('[BillingPage] DB plan_tier:', dbUser?.plan_tier);
      console.log('[BillingPage] RC isPro:', rcIsPro);
      console.log('[BillingPage] final isPro:', isPro);
      console.log('[BillingPage] activePlanId:', isPro ? 'pro_monthly' : 'free');

      setLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, [navigate]);

  /* ── Purchase handler ── */
  const handlePurchase = useCallback(async (packageId: PackageId) => {
    if (!userId) return;

    setPurchasingId(packageId);
    setPurchaseError(null);
    setSuccessMsg(null);

    try {
      await purchasePackage(userId, packageId, userEmail ?? undefined);

      // 1. Optimistically update DB
      await supabase
        .from('users')
        .update({ plan_tier: 'pro' })
        .eq('id', userId);

      // 2. Confirm with RC as source of truth
      const isPro = await getProEntitlement(userId);

      // 3. Update all plan state atomically
      setRcIsPro(isPro);
      setActivePlanId(packageId);
      setPlan(prev => ({ ...prev, planTier: isPro ? 'pro' : prev.planTier }));

      // 4. Show success message for 5 seconds
      setSuccessMsg("You're now on Pro! \u{1F389}");
      successTimerRef.current = setTimeout(() => setSuccessMsg(null), 5000);

    } catch (err: any) {
      const msg: string = err?.message ?? '';
      const wasCancelled =
        err?.userCancelled === true ||
        msg.includes('PURCHASE_CANCELLED') ||
        msg.includes('USER_CANCELLED') ||
        msg.toLowerCase().includes('cancel') ||
        err?.code === 'PURCHASE_CANCELLED';

      if (!wasCancelled) {
        setPurchaseError(msg || 'Payment failed. Please try again.');
      }
      // If cancelled: silently reset, no error shown
    } finally {
      setPurchasingId(null);
    }
  }, [userId, userEmail]);

  /* ── Manage subscription ── */
  const handleManage = useCallback(async () => {
    if (!userId) return;
    try {
      const url = await getManagementURL(userId);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('[BillingPage] getManagementURL error:', err);
    }
  }, [userId]);

  /* ── Cleanup ── */
  useEffect(() => () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
  }, []);

  /* ── Tokens ── */
  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)';
  const surfaceBg = isDark ? '#1E293B' : '#FFFFFF';
  const surfaceElevated = isDark ? '#263348' : '#F8FAFC';

  const isPro = plan.planTier === 'pro' || rcIsPro;
  const usageRatio = Math.min(plan.generationsUsed / plan.generationsLimit, 1);

  return (
    <div style={{
      fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 400, lineHeight: 1.5,
      minHeight: '100vh',
      background: isDark
        ? 'radial-gradient(ellipse at 30% 20%, #1E293B 0%, #0F172A 60%)'
        : 'radial-gradient(ellipse at 30% 20%, #EFF6FF 0%, #F1F5F9 70%)',
      color: primaryText,
      transition: 'background 0.2s, color 0.2s',
    }}>
      {/* Subtle grid */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M40 0H0v1h40V0zM0 0v40h1V0H0z' fill='%23${isDark ? 'ffffff' : '000000'}'/%3E%3C/svg%3E")`,
        backgroundSize: '40px 40px',
      }} />

      <SharedNavbar isDark={isDark} onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />

      {/* Page wrapper with entrance animation */}
      <div style={{
        position: 'relative', zIndex: 1,
        maxWidth: 720, margin: '0 auto',
        padding: '40px 24px 80px',
        animation: 'billFadeUp 0.3s ease-out',
      }}>

        {/* ── Page Header ── */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: primaryText, lineHeight: 1.3 }}>
            Billing &amp; Plan
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText, lineHeight: 1.5 }}>
            Manage your subscription and usage
          </p>
        </div>

        {/* ── Current Plan Card (glass) ── */}
        <div style={{
          background: isDark ? 'rgba(30,41,59,0.6)' : 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${borderColor}`,
          borderRadius: 12,
          boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(15,23,42,0.08)',
          padding: 24,
          marginBottom: 40,
        }}>
          {loading ? (
            /* Skeleton shimmer */
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Shimmer width={100} height={24} isDark={isDark} />
                <Shimmer width={60}  height={28} isDark={isDark} />
                <Shimmer width={140} height={14} isDark={isDark} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
                <Shimmer width={100} height={12} isDark={isDark} />
                <Shimmer width={240} height={8}  isDark={isDark} />
                <Shimmer width={120} height={14} isDark={isDark} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
              {/* Left column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Plan badge */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
                  padding: '4px 12px', borderRadius: 20,
                  fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                  background: isPro ? '#1A56DB' : surfaceElevated,
                  color: isPro ? '#FFFFFF' : secondaryText,
                  lineHeight: 1.4,
                }}>
                  {isPro && <Zap size={13} />}
                  {isPro ? 'Pro Plan' : 'Free Plan'}
                </span>

                {/* Plan name */}
                <h2 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700, fontFamily: 'Inter, sans-serif', color: primaryText, lineHeight: 1.3 }}>
                  {isPro ? 'Pro' : 'Free'}
                </h2>

                {isPro && (
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText, lineHeight: 1.4 }}>
                    Active since your upgrade
                  </p>
                )}
              </div>

              {/* Right column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 240 }}>
                {isPro ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 14, lineHeight: 1 }}>&infin;</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText }}>Unlimited generations</span>
                    </div>
                    <button onClick={handleManage}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        color: '#1A56DB', fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif',
                        transition: 'opacity 0.15s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.8'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                    >
                      Manage Subscription <ChevronRight size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{
                      fontSize: 11, fontWeight: 500, fontFamily: 'Inter, sans-serif',
                      textTransform: 'uppercase', letterSpacing: '0.05em', color: secondaryText,
                    }}>
                      CV Generations
                    </span>
                    {/* Progress bar */}
                    <div style={{
                      width: 240, height: 8, borderRadius: 4, overflow: 'hidden',
                      background: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 4,
                        width: `${usageRatio * 100}%`,
                        background: usageRatio >= 1 ? '#EF4444' : '#1A56DB',
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText }}>
                      {plan.generationsUsed} of {plan.generationsLimit} used
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Success message ── */}
        {successMsg && (
          <div style={{
            marginBottom: 24, padding: '14px 20px', borderRadius: 10,
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
            display: 'flex', alignItems: 'center', gap: 10,
            animation: 'billFadeUp 0.2s ease-out',
          }}>
            <Check size={16} color="#10B981" strokeWidth={2.5} />
            <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: '#10B981' }}>
              {successMsg}
            </span>
          </div>
        )}

        {/* ── Plans Section ── */}
        <h3 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: primaryText, lineHeight: 1.3 }}>
          Plans
        </h3>

        <div style={{
          display: 'flex', gap: 16, flexWrap: 'wrap',
          marginBottom: 48,
        }}>
          {/* ── Free Card ── */}
          <PlanCompareCard
            name="Free"
            price={<>&pound;0</>}
            priceSub=""
            isCurrent={activePlanId === 'free'}
            isHighlighted={false}
            badge={activePlanId === 'free' ? 'Current Plan' : undefined}
            badgeColor="blue"
            features={FEATURES}
            featureColumn="free"
            isDark={isDark}
            ctaLabel={activePlanId === 'free' ? 'Current Plan' : undefined}
            ctaDisabled
            purchasing={false}
          />

          {/* ── Pro Monthly ── */}
          <PlanCompareCard
            name="Pro Monthly"
            price={<>&pound;9<span style={{ fontSize: 16, fontWeight: 400 }}>/mo</span></>}
            priceSub=""
            isCurrent={activePlanId === 'pro_monthly'}
            isHighlighted={false}
            badge={activePlanId === 'pro_monthly' ? 'Current Plan' : undefined}
            badgeColor="blue"
            features={FEATURES}
            featureColumn="pro"
            isDark={isDark}
            ctaLabel={isPro ? undefined : 'Upgrade'}
            ctaDisabled={isPro}
            purchasing={purchasingId === 'pro_monthly'}
            onPurchase={() => handlePurchase('pro_monthly')}
            purchaseError={purchasingId === null && purchaseError ? purchaseError : undefined}
          />

          {/* ── Pro Annual ── */}
          <PlanCompareCard
            name="Pro Annual"
            price={<>&pound;6.60<span style={{ fontSize: 16, fontWeight: 400 }}>/mo</span></>}
            priceSub={<>&pound;79 billed annually</>}
            isCurrent={activePlanId === 'pro_annual'}
            isHighlighted={!isPro}
            badge={activePlanId === 'pro_annual' ? 'Current Plan' : (!isPro ? 'Best Value' : undefined)}
            badgeColor={activePlanId === 'pro_annual' ? 'blue' : 'green'}
            features={FEATURES}
            featureColumn="pro"
            isDark={isDark}
            ctaLabel={isPro ? undefined : 'Upgrade'}
            ctaDisabled={isPro}
            purchasing={purchasingId === 'pro_annual'}
            onPurchase={() => handlePurchase('pro_annual')}
            purchaseError={purchasingId === null && purchaseError ? purchaseError : undefined}
          />
        </div>

        {/* ── Payment Footer ── */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
            <Lock size={14} color={secondaryText} />
            <span style={{ fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText }}>
              Payments processed securely by RevenueCat &amp; Stripe
            </span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: isDark ? '#475569' : '#94A3B8' }}>
            Cancel anytime from your account
          </span>
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes billFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes billSpin { to { transform: rotate(360deg); } }
        @keyframes jb-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .jb-shimmer { animation: jb-shimmer 1.5s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

/* ─── Plan Compare Card ──────────────────────────────────────── */
function PlanCompareCard({
  name,
  price,
  priceSub,
  isCurrent,
  isHighlighted,
  badge,
  badgeColor,
  features,
  featureColumn,
  isDark,
  ctaLabel,
  ctaDisabled,
  purchasing,
  onPurchase,
  purchaseError,
}: {
  name: string;
  price: React.ReactNode;
  priceSub: React.ReactNode;
  isCurrent: boolean;
  isHighlighted: boolean;
  badge?: string;
  badgeColor?: 'green' | 'blue';
  features: FeatureRow[];
  featureColumn: 'free' | 'pro';
  isDark: boolean;
  ctaLabel?: string;
  ctaDisabled: boolean;
  purchasing: boolean;
  onPurchase?: () => void;
  purchaseError?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)';
  const surfaceBg = isDark ? '#1E293B' : '#FFFFFF';

  const cardBorder = isCurrent
    ? '2px solid #1A56DB'
    : `1px solid ${borderColor}`;

  const cardShadow = isCurrent
    ? '0 0 0 1px rgba(26,86,219,0.15), 0 4px 24px rgba(26,86,219,0.12)'
    : 'none';

  return (
    <div style={{
      flex: '1 1 200px', minWidth: 200,
      background: surfaceBg,
      border: cardBorder,
      borderRadius: 12,
      padding: 24,
      display: 'flex', flexDirection: 'column', gap: 20,
      position: 'relative',
      boxShadow: cardShadow,
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}>
      {/* Badge */}
      {badge && (
        <span style={{
          position: 'absolute', top: -10, right: 12,
          padding: '3px 10px', borderRadius: 999,
          fontSize: 11, fontWeight: 600, fontFamily: 'Inter, sans-serif',
          background: badgeColor === 'green' ? 'rgba(16,185,129,0.15)' : 'rgba(26,86,219,0.12)',
          color: badgeColor === 'green' ? '#10B981' : '#3B82F6',
          border: `1px solid ${badgeColor === 'green' ? 'rgba(16,185,129,0.3)' : 'rgba(26,86,219,0.25)'}`,
          lineHeight: 1.6, whiteSpace: 'nowrap',
        }}>
          {badge}
        </span>
      )}

      {/* Name */}
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: 'Inter, sans-serif', color: primaryText, lineHeight: 1.3 }}>
        {name}
      </h4>

      {/* Price */}
      <div>
        <p style={{ margin: 0, fontSize: 28, fontWeight: 700, fontFamily: 'Inter, sans-serif', color: primaryText, lineHeight: 1.2 }}>
          {price}
        </p>
        {priceSub && (
          <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText, lineHeight: 1.4 }}>
            {priceSub}
          </p>
        )}
      </div>

      {/* Features */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {features.map(f => (
          <FeatureRowItem key={f.label} label={f.label} value={featureColumn === 'free' ? f.free : f.pro} isDark={isDark} />
        ))}
      </div>

      {/* CTA */}
      {ctaLabel && (
        <div>
          <button
            onClick={onPurchase}
            disabled={ctaDisabled || purchasing}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); setPressed(false); }}
            onMouseDown={() => setPressed(true)}
            onMouseUp={() => setPressed(false)}
            style={{
              width: '100%', height: 42,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: ctaDisabled
                ? isDark ? '#263348' : '#E2E8F0'
                : hovered ? '#1E40AF' : '#1A56DB',
              color: ctaDisabled ? secondaryText : '#FFFFFF',
              border: 'none', borderRadius: 8, cursor: ctaDisabled ? 'default' : 'pointer',
              fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif', lineHeight: 1,
              transform: pressed && !ctaDisabled ? 'scale(0.97)' : 'scale(1)',
              transition: 'background 0.15s, transform 0.1s',
            }}
          >
            {purchasing ? (
              <><Loader2 size={15} style={{ animation: 'billSpin 0.75s linear infinite' }} /> Processing...</>
            ) : (
              <>{ctaLabel} {!ctaDisabled && <ChevronRight size={14} />}</>
            )}
          </button>

          {purchaseError && (
            <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: '#EF4444', lineHeight: 1.4 }}>
              {purchaseError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}