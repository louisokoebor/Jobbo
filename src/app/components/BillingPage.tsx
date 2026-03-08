/**
 * BillingPage — Billing & Plan management for Applyly
 *
 * Reads plan state from Supabase DB (source of truth, kept in sync by Stripe webhook).
 * Three-column plan comparison, usage meter, upgrade via Stripe Checkout redirect.
 price_1T7JbqHYGHQaP9adhPuFLRK6
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Check, X as XIcon, Lock, Zap, ChevronRight, Loader2,
} from 'lucide-react';
import { SharedNavbar } from './SharedNavbar';
import { supabase } from '../lib/supabaseClient';
import { useUserPlan } from '../lib/UserPlanContext';
import { projectId, publicAnonKey } from '../lib/supabaseClient';

/* ─── Constants ──────────────────────────────────────────────── */
const STRIPE_PRICE_MONTHLY = 'price_1T713fQU76dJHu8oq10BA26E';
const STRIPE_PRICE_ANNUAL = 'price_1T714cQU76dJHu8oOnj4GcXa';
const SERVER_URL = `https://${projectId}.supabase.co/functions/v1/make-server-3bbff5cf`;

async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/* ─── Types ──────────────────────────────────────────────────── */
type Theme = 'dark' | 'light';
type PlanId = 'pro_monthly' | 'pro_annual';

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
  const { refresh: refreshGlobalPlan } = useUserPlan();

  /* ── Theme ── */
  const [theme, setTheme] = useState<Theme>(() =>
    (typeof window !== 'undefined' && (localStorage.getItem('applyly-theme') as Theme)) || 'light',
  );
  const isDark = theme === 'dark';
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('applyly-theme', theme);
  }, [theme]);

  /* ── State ── */
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanState>({ planTier: 'free', generationsUsed: 0, generationsLimit: 3 });
  const [activePlanId, setActivePlanId] = useState<PlanId | 'free'>('free');
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);

  const [purchasingId, setPurchasingId] = useState<PlanId | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>();

  /* ── Poll for pro upgrade after Stripe checkout ── */
  const pollForProUpgrade = useCallback(async (uid: string) => {
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const { data } = await supabase
        .from('users')
        .select('plan_tier, generations_limit')
        .eq('id', uid)
        .single();

      console.log('[BillingPage] poll iteration', i, 'plan_tier:', data?.plan_tier, 'generations_limit:', data?.generations_limit);

      // Detect upgrade via plan_tier OR generations_limit (belt-and-suspenders)
      const isPro = data?.plan_tier === 'pro';
      const hasProLimit = (data?.generations_limit ?? 0) >= 999;

      if (isPro || hasProLimit) {
        // Self-heal: if generations_limit is pro but plan_tier isn't, fix it
        if (hasProLimit && !isPro) {
          console.log('[BillingPage] self-healing: generations_limit=999 but plan_tier is not pro, writing plan_tier=pro');
          await supabase.from('users').update({ plan_tier: 'pro' }).eq('id', uid);
        }

        setPlan(prev => ({
          ...prev,
          planTier: 'pro',
          generationsLimit: data?.generations_limit ?? 999,
        }));
        setActivePlanId('pro_monthly');
        setSuccessMsg("You're now on Pro! \u{1F389}");
        window.history.replaceState({}, '', '/billing');
        setTimeout(() => setSuccessMsg(null), 5000);
        // Refresh global UserPlanContext so all components see pro
        refreshGlobalPlan();
        return;
      }
    }
    // After 18s still not updated — force-write plan_tier to pro and set optimistically
    console.log('[BillingPage] polling timed out, force-writing plan_tier=pro');
    await supabase.from('users').update({ plan_tier: 'pro', generations_limit: 999 }).eq('id', uid);
    setPlan(prev => ({ ...prev, planTier: 'pro', generationsLimit: 999 }));
    setActivePlanId('pro_monthly');
    setSuccessMsg("You're now on Pro! \u{1F389}");
    window.history.replaceState({}, '', '/billing');
    setTimeout(() => setSuccessMsg(null), 5000);
    refreshGlobalPlan();
  }, [refreshGlobalPlan]);

  /* ── On mount: auth + plan ── */
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/login', { replace: true }); return; }
      if (cancelled) return;
      setUserId(user.id);
      setUserEmail(user.email ?? null);

      const { data } = await supabase
        .from('users')
        .select('plan_tier, generations_used, generations_limit, stripe_customer_id')
        .eq('id', user.id)
        .single();

      if (cancelled) return;

      console.log('[BillingPage] init DB read:', { plan_tier: data?.plan_tier, generations_used: data?.generations_used, generations_limit: data?.generations_limit });

      // Detect pro via either field (self-healing)
      const hasProLimit = (data?.generations_limit ?? 0) >= 999;
      const isPro = data?.plan_tier === 'pro' || hasProLimit;

      // Self-heal if generations_limit shows pro but plan_tier doesn't
      if (hasProLimit && data?.plan_tier !== 'pro') {
        console.log('[BillingPage] self-healing: generations_limit>=999 but plan_tier is not pro, writing fix');
        supabase.from('users').update({ plan_tier: 'pro' }).eq('id', user.id);
      }

      setPlan({
        planTier: isPro ? 'pro' : 'free',
        generationsUsed: data?.generations_used ?? 0,
        generationsLimit: data?.generations_limit ?? (isPro ? 999 : 3),
      });
      setActivePlanId(isPro ? 'pro_monthly' : 'free');
      setHasStripeCustomer(!!data?.stripe_customer_id);
      setLoading(false);

      // Check URL params for success/cancel redirect from Stripe
      const params = new URLSearchParams(window.location.search);
      if (params.get('success') === 'true') {
        setSuccessMsg("Payment successful! Your plan is being activated...");
        pollForProUpgrade(user.id);
      }
      if (params.get('cancelled') === 'true') {
        window.history.replaceState({}, '', '/billing');
      }
    }

    init();
    return () => { cancelled = true; };
  }, [navigate, pollForProUpgrade]);

  /* ── Upgrade handler (Stripe Checkout redirect) ── */
  const handleUpgrade = useCallback(async (planId: PlanId) => {
    setPurchasingId(planId);
    setPurchaseError(null);

    try {
      const token = await getAuthToken();
      const priceId = planId === 'pro_monthly'
        ? STRIPE_PRICE_MONTHLY
        : STRIPE_PRICE_ANNUAL;

      const res = await fetch(`${SERVER_URL}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-User-Token': token || '',
        },
        body: JSON.stringify({ priceId, planId }),
      });

      const data = await res.json();
      if (!data.success || !data.url) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;

    } catch (err: any) {
      setPurchaseError(err.message || 'Something went wrong. Please try again.');
      setPurchasingId(null);
    }
    // Note: don't reset purchasingId on success — page will redirect
  }, []);

  /* ── Manage subscription (Stripe Customer Portal) ── */
  const handleManage = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${SERVER_URL}/create-portal-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-User-Token': token || '',
        },
      });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Portal error:', err);
    }
  }, []);

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

  const isPro = plan.planTier === 'pro';
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
            onPurchase={() => handleUpgrade('pro_monthly')}
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
            onPurchase={() => handleUpgrade('pro_annual')}
            purchaseError={purchasingId === null && purchaseError ? purchaseError : undefined}
          />
        </div>

        {/* ── Payment Footer ── */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
            <Lock size={14} color={secondaryText} />
            <span style={{ fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText }}>
              Payments processed securely by Stripe
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
              <><Loader2 size={15} style={{ animation: 'billSpin 0.75s linear infinite' }} /> Redirecting...</>
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