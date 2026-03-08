import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { SharedNavbar } from './SharedNavbar';
import { supabase } from '../lib/supabaseClient';
import { projectId, publicAnonKey } from '../lib/supabaseClient';
import { useUserPlan } from '../lib/UserPlanContext';
import {
  KeyRound, Trash2, Upload, CheckCircle2, AlertCircle,
  Star, Loader2, Eye, X, ChevronDown, ChevronUp, Mail,
} from 'lucide-react';

/* ─── Constants ──────────────────────────────────────────────── */
const SUPABASE_URL = `https://${projectId}.supabase.co`;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ─── Types ──────────────────────────────────────────────────── */
type Theme = 'dark' | 'light';

interface CvProfile {
  id: string;
  label: string;
  created_at: string;
  is_default: boolean;
  raw_file_url?: string | null;
}

interface ToastItem {
  id: string;
  type: 'error' | 'success';
  message: string;
}

interface PersonalDetails {
  name: string;
  phone: string;
  location: string;
  linkedin: string;
  portfolio: string;
}

const DEFAULT_PERSONAL: PersonalDetails = { name: '', phone: '', location: '', linkedin: '', portfolio: '' };

/* ─── Helpers ────────────────────────────────────────────────── */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
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
            animation: 'jb-card-in 0.2s ease-out',
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

/* ─── Profile Page ───────────────────────────────────────────── */
export function ProfilePage() {
  const navigate = useNavigate();
  const { planTier, isFreeTier, isProTier, generationsUsed, generationsLimit } = useUserPlan();
  const [theme, setTheme] = useState<Theme>(() =>
    (typeof window !== 'undefined' && (localStorage.getItem('applyly-theme') as Theme)) || 'light'
  );
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('applyly-theme', theme);
  }, [theme]);

  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const surfaceColor = isDark ? '#1E293B' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)';
  const inputFill = isDark ? '#1E293B' : '#FFFFFF';
  const inputBorder = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)';

  /* ── State ── */
  const [email, setEmail] = useState<string>('');
  const [userId, setUserId] = useState<string | null>(null);
  const [cvProfiles, setCvProfiles] = useState<CvProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isUploadingCv, setIsUploadingCv] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'uploading' | 'reading'>('uploading');
  const [uploadFileName, setUploadFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── CV Preview state ── */
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  /* ── Personal Details state ── */
  const [personalDetails, setPersonalDetails] = useState<PersonalDetails>(DEFAULT_PERSONAL);
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);
  const [personalSaved, setPersonalSaved] = useState(false);

  /* ── Connected Accounts state ── */
  const [providers, setProviders] = useState<string[]>([]);

  /* ── Danger Zone state ── */
  const [dangerOpen, setDangerOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  /* ── Portal loading state ── */
  const [portalLoading, setPortalLoading] = useState(false);

  const addToast = useCallback((type: ToastItem['type'], message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  /* ── Fetch user & profiles ── */
  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email || '');
        setUserId(user.id);
        setProviders(user.app_metadata?.providers ?? []);

        // Fetch personal_details from users table
        const { data: userRow } = await supabase
          .from('users')
          .select('personal_details')
          .eq('id', user.id)
          .single();

        if (userRow?.personal_details) {
          setPersonalDetails({ ...DEFAULT_PERSONAL, ...userRow.personal_details });
        }
      }

      const { data, error } = await supabase
        .from('cv_profiles')
        .select('id, label, created_at, is_default, raw_file_url')
        .order('is_default', { ascending: false });

      if (error) {
        console.error('ProfilePage: Failed to fetch cv_profiles:', error.message);
      } else {
        setCvProfiles((data || []) as CvProfile[]);
      }
    } catch (err) {
      console.error('ProfilePage: Unexpected error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Change password ── */
  const handleChangePassword = useCallback(async () => {
    if (!email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      console.error('ProfilePage: resetPasswordForEmail error:', error.message);
      addToast('error', 'Failed to send reset email. Please try again.');
    } else {
      addToast('success', 'Password reset email sent');
    }
  }, [email, addToast]);

  /* ── Set default ── */
  const handleSetDefault = useCallback(async (profileId: string) => {
    if (!userId) return;
    await supabase.from('cv_profiles').update({ is_default: false }).eq('user_id', userId);
    const { error } = await supabase.from('cv_profiles').update({ is_default: true }).eq('id', profileId);
    if (error) {
      console.error('ProfilePage: Set default error:', error.message);
      addToast('error', 'Failed to set default. Please try again.');
    } else {
      addToast('success', 'Default CV updated');
      fetchData();
    }
  }, [userId, addToast, fetchData]);

  /* ── Delete profile ── */
  const handleDelete = useCallback(async (profileId: string) => {
    const profile = cvProfiles.find(p => p.id === profileId);
    const wasDefault = profile?.is_default;
    const { error } = await supabase.from('cv_profiles').delete().eq('id', profileId);
    if (error) {
      console.error('ProfilePage: Delete error:', error.message);
      addToast('error', 'Failed to delete. Please try again.');
    } else {
      addToast('success', 'CV profile deleted');
      setConfirmDeleteId(null);
      const remaining = cvProfiles.filter(p => p.id !== profileId);
      if (wasDefault && remaining.length > 0 && userId) {
        await supabase.from('cv_profiles').update({ is_default: true }).eq('id', remaining[0].id);
      }
      fetchData();
    }
  }, [cvProfiles, userId, addToast, fetchData]);

  /* ── CV Upload ── */
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(file.type)) { addToast('error', 'Please upload a PDF or DOCX file.'); return; }
    if (file.size > 10 * 1024 * 1024) { addToast('error', 'File too large. Max 10 MB.'); return; }

    setIsUploadingCv(true);
    setUploadStatus('uploading');
    setUploadFileName(file.name);

    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session;
      }
      if (!session?.access_token) { addToast('error', 'Your session has expired. Please log in again.'); setIsUploadingCv(false); return; }

      const accessToken = session.access_token;
      const uid = session.user?.id ?? 'anon';
      const filePath = `${uid}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage.from('cv-uploads').upload(filePath, file, { contentType: file.type, upsert: false });
      if (uploadError) { console.error('Storage upload error:', uploadError); addToast('error', 'Upload failed. Please try again.'); setIsUploadingCv(false); return; }

      const { data: urlData } = await supabase.storage.from('cv-uploads').createSignedUrl(filePath, 3600);
      const fileUrl = urlData?.signedUrl;
      if (!fileUrl) { addToast('error', 'Upload failed. Please try again.'); setIsUploadingCv(false); return; }

      setUploadStatus('reading');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/make-server-3bbff5cf/parse-cv`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-User-Token': accessToken,
          'Content-Type': 'application/json',
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({ file_url: fileUrl, label: file.name.replace(/\.[^/.]+$/, '') }),
      });

      const result = await response.json();
      if (!response.ok || result.success === false) { console.error('parse-cv error:', result); addToast('error', "Couldn't read your CV. Make sure it's a readable PDF or DOCX."); setIsUploadingCv(false); return; }

      const { data: existingProfiles } = await supabase.from('cv_profiles').select('id').eq('user_id', session.user.id);
      const isFirst = !existingProfiles || existingProfiles.length === 0;

      const { error: saveError } = await supabase.from('cv_profiles').insert({
        user_id: session.user.id,
        label: result.label || file.name.replace(/\.[^/.]+$/, ''),
        parsed_json: result.parsed_json,
        raw_file_url: fileUrl,
        is_default: isFirst,
      });

      if (saveError) { console.error('cv_profiles save error:', saveError); addToast('error', 'CV parsed but could not be saved. Please try again.'); setIsUploadingCv(false); return; }
      addToast('success', 'CV uploaded and ready to use');
      setIsUploadingCv(false);
      fetchData();
    } catch (err) { console.error('CV upload unexpected error:', err); addToast('error', 'Upload failed. Please try again.'); setIsUploadingCv(false); }
  }, [addToast, fetchData]);

  /* ── CV Preview handler ── */
  const handlePreviewCv = useCallback(async (profile: CvProfile) => {
    setPreviewLabel(profile.label);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewUrl(null);
    setPreviewError(null);

    let storagePath: string | null = null;
    if (profile.raw_file_url) {
      const match = profile.raw_file_url.match(/\/object\/sign\/cv-uploads\/(.+?)(\?|$)/);
      storagePath = match ? decodeURIComponent(match[1]) : null;
    }

    if (!storagePath) {
      setPreviewError('Original file not available for preview.');
      setPreviewLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.storage.from('cv-uploads').createSignedUrl(storagePath, 3600);
      if (error || !data?.signedUrl) {
        console.error('Preview signed URL error:', error);
        setPreviewError('Could not load preview. The file may have been removed from storage.');
        setPreviewLoading(false);
        return;
      }
      setPreviewUrl(data.signedUrl);
    } catch (err) { console.error('Preview error:', err); setPreviewError('Failed to load preview.'); }
    finally { setPreviewLoading(false); }
  }, []);

  const closePreview = useCallback(() => { setPreviewOpen(false); setPreviewUrl(null); setPreviewError(null); }, []);

  useEffect(() => {
    if (!previewOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closePreview(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewOpen, closePreview]);

  /* ── Save personal details ── */
  const handleSavePersonal = useCallback(async () => {
    if (!userId) return;
    setIsSavingPersonal(true);
    const { error } = await supabase.from('users').update({ personal_details: personalDetails }).eq('id', userId);
    setIsSavingPersonal(false);
    if (error) {
      console.error('ProfilePage: save personal_details error:', error.message);
      addToast('error', 'Failed to save details. Please try again.');
    } else {
      setPersonalSaved(true);
      setTimeout(() => setPersonalSaved(false), 2000);
    }
  }, [userId, personalDetails, addToast]);

  /* ── Manage subscription (portal) ── */
  const handleManageSubscription = useCallback(async () => {
    if (!userId) return;
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/make-server-3bbff5cf/create-portal-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-User-Token': session?.access_token || '',
          'Content-Type': 'application/json',
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      if (result.url) { window.location.href = result.url; }
      else { addToast('error', 'Could not open subscription management.'); }
    } catch (err) { console.error('Portal session error:', err); addToast('error', 'Could not open subscription management.'); }
    finally { setPortalLoading(false); }
  }, [userId, addToast]);

  /* ── Delete account ── */
  const handleDeleteAccount = useCallback(async () => {
    if (!userId || deleteConfirmText !== 'DELETE') return;
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/make-server-3bbff5cf/delete-account`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-User-Token': session?.access_token || '',
          'Content-Type': 'application/json',
          'apikey': publicAnonKey,
        },
      });
      const result = await res.json();
      if (result.success) {
        await supabase.auth.signOut();
        navigate('/');
      } else {
        console.error('Delete account error:', result);
        addToast('error', 'Failed to delete account. Please try again.');
      }
    } catch (err) { console.error('Delete account error:', err); addToast('error', 'Failed to delete account. Please try again.'); }
    finally { setIsDeleting(false); setDeleteModalOpen(false); }
  }, [userId, deleteConfirmText, navigate, addToast]);

  // Escape key to close delete modal
  useEffect(() => {
    if (!deleteModalOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDeleteModalOpen(false); setDeleteConfirmText(''); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deleteModalOpen]);

  /* ── Shared styles ── */
  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 500, fontFamily: 'Inter, sans-serif',
    letterSpacing: '0.07em', textTransform: 'uppercase',
    color: secondaryText, marginBottom: 16, display: 'block', lineHeight: 1.4,
  };

  const cardStyle: React.CSSProperties = {
    background: surfaceColor,
    border: `1px solid ${borderColor}`,
    borderRadius: 12, padding: '20px 24px',
  };

  const inputLabelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 500, fontFamily: 'Inter, sans-serif',
    letterSpacing: '0.05em', textTransform: 'uppercase',
    color: secondaryText, marginBottom: 6, display: 'block', lineHeight: 1,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, padding: '0 12px',
    background: inputFill, border: `1px solid ${inputBorder}`,
    borderRadius: 8, color: primaryText,
    fontSize: 14, fontWeight: 400, fontFamily: 'Inter, sans-serif',
    outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
  };

  /* ── Usage bar color ── */
  const usageRatio = generationsLimit > 0 ? generationsUsed / generationsLimit : 0;
  const usageBarColor = usageRatio > 0.8 ? '#EF4444' : usageRatio >= 0.5 ? '#F59E0B' : '#10B981';

  const hasGoogle = providers.includes('google');
  const hasEmail = providers.includes('email');

  return (
    <div style={{
      fontFamily: 'Inter, sans-serif',
      minHeight: '100vh',
      background: isDark
        ? 'radial-gradient(ellipse at 30% 20%, #1E293B 0%, #0F172A 60%)'
        : 'radial-gradient(ellipse at 30% 20%, #EFF6FF 0%, #F1F5F9 70%)',
      color: primaryText,
      transition: 'background 0.2s, color 0.2s',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Grid bg */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M40 0H0v1h40V0zM0 0v40h1V0H0z' fill='%23${isDark ? 'ffffff' : '000000'}'/%3E%3C/svg%3E")`,
        backgroundSize: '40px 40px',
      }} />

      <SharedNavbar
        isDark={isDark}
        onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
      />

      <div style={{
        flex: 1, padding: '32px 24px', maxWidth: 720, width: '100%',
        margin: '0 auto', position: 'relative', zIndex: 1,
        overflowY: 'auto',
      }}>
        {/* Breadcrumb */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24,
          fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif',
          color: secondaryText, lineHeight: 1,
        }}>
          <span style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>Dashboard</span>
          <span>/</span>
          <span style={{ color: primaryText, fontWeight: 500 }}>Profile</span>
        </div>

        <h1 style={{
          margin: '0 0 40px', fontSize: 28, fontWeight: 600,
          fontFamily: 'Inter, sans-serif', color: primaryText, lineHeight: 1.3,
        }}>
          Profile
        </h1>

        {/* ═══════════════ SECTION 1: Plan & Usage ═══════════════ */}
        <span style={sectionLabelStyle}>Plan & Usage</span>
        <div style={{ ...cardStyle, marginBottom: 40 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 16,
          }}>
            <div>
              {/* Plan badge */}
              <span style={{
                display: 'inline-block',
                padding: '4px 12px', borderRadius: 999,
                fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                background: isProTier ? 'rgba(26,86,219,0.12)' : 'rgba(107,114,128,0.12)',
                color: isProTier ? '#1A56DB' : '#6B7280',
                lineHeight: 1.6,
              }}>
                {isProTier ? 'Pro Plan' : 'Free Plan'}
              </span>

              <p style={{
                margin: '8px 0 0', fontSize: 12, fontWeight: 400,
                fontFamily: 'Inter, sans-serif', color: secondaryText, lineHeight: 1,
              }}>
                CV Generations
              </p>

              <p style={{
                margin: '6px 0 6px', fontSize: 13, fontWeight: 500,
                fontFamily: 'Inter, sans-serif', color: primaryText, lineHeight: 1,
              }}>
                {generationsUsed} / {generationsLimit} used
              </p>

              {/* Progress bar */}
              <div style={{
                width: 240, height: 6, borderRadius: 999,
                background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              }}>
                <div style={{
                  width: `${Math.min(usageRatio * 100, 100)}%`,
                  height: '100%', borderRadius: 999,
                  background: usageBarColor,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>

            {/* Right side */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              {isFreeTier ? (
                <>
                  <PrimaryButton label="Upgrade to Pro" onClick={() => navigate('/billing')} />
                  <span style={{ fontSize: 11, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText, textAlign: 'center' }}>
                    £9/mo or £79/yr
                  </span>
                </>
              ) : (
                <button
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#1A56DB', fontSize: 13, fontWeight: 500,
                    fontFamily: 'Inter, sans-serif', padding: '8px 0',
                    opacity: portalLoading ? 0.6 : 1,
                  }}
                >
                  {portalLoading ? 'Loading...' : 'Manage subscription \u2192'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ═══════════════ SECTION 2: Account ═══════════════ */}
        <span style={sectionLabelStyle}>Account</span>
        <div style={{ ...cardStyle, marginBottom: 40 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              <p style={{
                margin: '0 0 4px', fontSize: 12, fontWeight: 500,
                fontFamily: 'Inter, sans-serif', color: secondaryText,
                textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1,
              }}>Email</p>
              <p style={{
                margin: 0, fontSize: 15, fontWeight: 500,
                fontFamily: 'Inter, sans-serif', color: primaryText, lineHeight: 1.4,
              }}>{email || 'Loading...'}</p>
            </div>
            <GhostButton icon={<KeyRound size={14} />} label="Change Password" isDark={isDark} onClick={handleChangePassword} />
          </div>
        </div>

        {/* ═══════════════ SECTION 3: Connected Accounts ═══════════════ */}
        <span style={sectionLabelStyle}>Connected Accounts</span>
        <div style={{ ...cardStyle, marginBottom: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Google row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <GoogleIcon />
                <span style={{ fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: primaryText }}>Google</span>
              </div>
              {hasGoogle ? (
                <ConnectedBadge />
              ) : (
                <button
                  onClick={async () => {
                    try { await (supabase.auth as any).linkIdentity({ provider: 'google' }); }
                    catch (err) { console.error('Link Google error:', err); addToast('error', 'Could not connect Google account.'); }
                  }}
                  style={{
                    padding: '4px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                    fontFamily: 'Inter, sans-serif', cursor: 'pointer',
                    background: 'none', border: `1px solid ${borderColor}`, color: primaryText,
                    transition: 'background 0.15s',
                  }}
                >
                  Connect
                </button>
              )}
            </div>

            {/* Email row */}
            {hasEmail && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Mail size={18} color={secondaryText} />
                  <span style={{ fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: primaryText }}>Email & Password</span>
                </div>
                <ConnectedBadge />
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════ SECTION 4: Personal Details ═══════════════ */}
        <span style={sectionLabelStyle}>Personal Details</span>
        <p style={{ fontSize: 12, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText, margin: '-8px 0 16px', lineHeight: 1.5 }}>
          These details pre-fill every CV you generate.
        </p>
        <div style={{ ...cardStyle, marginBottom: 40 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div>
              <label style={inputLabelStyle}>Full Name</label>
              <input
                type="text" value={personalDetails.name}
                onChange={e => setPersonalDetails(p => ({ ...p, name: e.target.value }))}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = '#1A56DB'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = inputBorder; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>
            <div>
              <label style={inputLabelStyle}>Phone</label>
              <input
                type="tel" value={personalDetails.phone}
                onChange={e => setPersonalDetails(p => ({ ...p, phone: e.target.value }))}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = '#1A56DB'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = inputBorder; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>
            <div>
              <label style={inputLabelStyle}>Location</label>
              <input
                type="text" value={personalDetails.location}
                placeholder="e.g. Salford, Manchester"
                onChange={e => setPersonalDetails(p => ({ ...p, location: e.target.value }))}
                style={{ ...inputStyle, ...(personalDetails.location ? {} : { color: isDark ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.6)' }) }}
                onFocus={e => { e.currentTarget.style.borderColor = '#1A56DB'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)'; e.currentTarget.style.color = primaryText; }}
                onBlur={e => { e.currentTarget.style.borderColor = inputBorder; e.currentTarget.style.boxShadow = 'none'; if (!personalDetails.location) e.currentTarget.style.color = isDark ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.6)'; }}
              />
            </div>
            <div>
              <label style={inputLabelStyle}>LinkedIn URL</label>
              <input
                type="text" value={personalDetails.linkedin}
                placeholder="linkedin.com/in/..."
                onChange={e => setPersonalDetails(p => ({ ...p, linkedin: e.target.value }))}
                style={{ ...inputStyle, ...(personalDetails.linkedin ? {} : { color: isDark ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.6)' }) }}
                onFocus={e => { e.currentTarget.style.borderColor = '#1A56DB'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)'; e.currentTarget.style.color = primaryText; }}
                onBlur={e => { e.currentTarget.style.borderColor = inputBorder; e.currentTarget.style.boxShadow = 'none'; if (!personalDetails.linkedin) e.currentTarget.style.color = isDark ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.6)'; }}
              />
            </div>
            <div>
              <label style={inputLabelStyle}>Portfolio URL</label>
              <input
                type="text" value={personalDetails.portfolio}
                placeholder="yoursite.com"
                onChange={e => setPersonalDetails(p => ({ ...p, portfolio: e.target.value }))}
                style={{ ...inputStyle, ...(personalDetails.portfolio ? {} : { color: isDark ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.6)' }) }}
                onFocus={e => { e.currentTarget.style.borderColor = '#1A56DB'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,86,219,0.25)'; e.currentTarget.style.color = primaryText; }}
                onBlur={e => { e.currentTarget.style.borderColor = inputBorder; e.currentTarget.style.boxShadow = 'none'; if (!personalDetails.portfolio) e.currentTarget.style.color = isDark ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.6)'; }}
              />
            </div>
          </div>

          {/* Save button row */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 20 }}>
            {personalSaved && (
              <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: '#10B981', display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={14} /> Saved
              </span>
            )}
            <PrimaryButton label={isSavingPersonal ? 'Saving...' : 'Save Details'} onClick={handleSavePersonal} disabled={isSavingPersonal} />
          </div>
        </div>

        {/* ═══════════════ SECTION 5: CV Profiles ═══════════════ */}
        <span style={sectionLabelStyle}>Base CV Profiles</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {isLoading ? (
            <>
              <SkeletonRow isDark={isDark} />
              <SkeletonRow isDark={isDark} />
            </>
          ) : cvProfiles.length === 0 ? (
            <div style={{
              ...cardStyle,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 8, padding: '40px 24px',
              color: secondaryText, textAlign: 'center',
            }}>
              <Upload size={24} strokeWidth={1.5} />
              <p style={{ margin: 0, fontSize: 13, fontFamily: 'Inter, sans-serif', fontStyle: 'italic', lineHeight: 1.5 }}>
                No CV profiles yet. Upload your first CV below.
              </p>
            </div>
          ) : (
            cvProfiles.map(profile => (
              <div key={profile.id}
                className="jb-cv-card"
                onClick={() => handlePreviewCv(profile)}
                style={{
                  ...cardStyle,
                  display: 'flex', alignItems: 'center', gap: 12,
                  flexWrap: 'wrap',
                  cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s',
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 15, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                      color: primaryText, lineHeight: 1.3,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{profile.label}</span>
                    <Eye size={13} className="jb-cv-card-eye" style={{ color: '#6B7280', opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }} />
                    {profile.is_default && (
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500,
                        fontFamily: 'Inter, sans-serif',
                        background: 'rgba(16,185,129,0.15)', color: '#10B981',
                        border: '1px solid rgba(16,185,129,0.3)',
                        lineHeight: 1.6, whiteSpace: 'nowrap', flexShrink: 0,
                      }}>Default</span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText, lineHeight: 1.4 }}>
                    Uploaded {formatDate(profile.created_at)}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  {!profile.is_default && (
                    <div onClick={e => e.stopPropagation()}>
                      <GhostButton icon={<Star size={13} />} label="Set as Default" isDark={isDark} onClick={() => handleSetDefault(profile.id)} />
                    </div>
                  )}
                  {confirmDeleteId === profile.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleDelete(profile.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif', padding: 0, lineHeight: 1 }}>Confirm</button>
                      <button onClick={() => setConfirmDeleteId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: secondaryText, fontSize: 12, fontWeight: 500, fontFamily: 'Inter, sans-serif', padding: 0, lineHeight: 1 }}>Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDeleteId(profile.id); }}
                      aria-label="Delete CV profile"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: secondaryText, padding: 6, display: 'flex', alignItems: 'center', borderRadius: 6, lineHeight: 1, transition: 'color 0.15s' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#EF4444')}
                      onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = secondaryText)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Upload progress */}
        {isUploadingCv && (
          <div style={{
            ...cardStyle,
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
            background: isDark ? 'rgba(26,86,219,0.06)' : 'rgba(26,86,219,0.04)',
            border: `1px solid rgba(26,86,219,0.2)`,
          }}>
            <Loader2 size={18} color="#1A56DB" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: primaryText, lineHeight: 1.4 }}>
                {uploadStatus === 'uploading' ? 'Uploading...' : 'Reading your CV...'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText, lineHeight: 1.4 }}>
                {uploadFileName}
              </p>
            </div>
          </div>
        )}

        {/* Upload button */}
        <UploadButton isDark={isDark} disabled={isUploadingCv} onClick={() => fileInputRef.current?.click()} />

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Spacer before danger zone */}
        <div style={{ height: 40 }} />

        {/* ═══════════════ SECTION 6: Danger Zone ═══════════════ */}
        <span style={{ ...sectionLabelStyle, color: '#EF4444' }}>Danger Zone</span>
        <div style={{ ...cardStyle, marginBottom: 40 }}>
          {/* Collapsible header */}
          <button
            type="button"
            onClick={() => setDangerOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: secondaryText,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif' }}>Account deletion</span>
            {dangerOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {dangerOpen && (
            <div style={{ marginTop: 16 }}>
              <p style={{
                margin: '0 0 16px', fontSize: 13, fontWeight: 400,
                fontFamily: 'Inter, sans-serif', color: '#F87171',
                lineHeight: 1.6,
              }}>
                Deleting your account is permanent and cannot be undone. All your applications, generated CVs, and uploaded files will be deleted immediately.
              </p>
              <DangerButton label="Delete my account" isDark={isDark} onClick={() => { setDeleteModalOpen(true); setDeleteConfirmText(''); }} />
            </div>
          )}
        </div>
      </div>

      <ToastStack toasts={toasts} isDark={isDark} />

      {/* ── CV Preview Modal ── */}
      {previewOpen && (
        <>
          <div onClick={closePreview} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)' }} />
          <div style={{ position: 'fixed', inset: 0, zIndex: 1001, display: 'flex', flexDirection: 'column', animation: 'jb-card-in 0.2s ease-out' }}>
            <div style={{
              height: 56, flexShrink: 0, background: isDark ? '#263348' : '#F8FAFC',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 20px', borderBottom: `1px solid ${borderColor}`,
            }}>
              <span style={{ fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: primaryText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewLabel}</span>
              <button onClick={closePreview} aria-label="Close preview" style={{ background: 'none', border: 'none', cursor: 'pointer', color: secondaryText, padding: 4, display: 'flex', alignItems: 'center', borderRadius: 6, transition: 'color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = primaryText; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = secondaryText; }}
              ><X size={20} /></button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', background: '#1a1a2e' }}>
              {previewLoading && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Loader2 size={32} color="#6B7280" style={{ animation: 'spin 1s linear infinite' }} /></div>}
              {previewError && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, padding: 24 }}><p style={{ color: '#9CA3AF', fontSize: 14, fontFamily: 'Inter, sans-serif', textAlign: 'center', margin: 0, maxWidth: 400, lineHeight: 1.6 }}>{previewError}</p></div>}
              {previewUrl && !previewLoading && !previewError && (
                <object data={previewUrl} type="application/pdf" style={{ width: '100%', height: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
                    <p style={{ color: '#9CA3AF', fontSize: 14, fontFamily: 'Inter, sans-serif', margin: 0 }}>Preview not available in this browser</p>
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ background: '#1A56DB', color: 'white', padding: '10px 20px', borderRadius: 8, fontSize: 14, fontFamily: 'Inter, sans-serif', textDecoration: 'none', fontWeight: 500 }}>Open PDF ↗</a>
                  </div>
                </object>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Delete Account Confirmation Modal ── */}
      {deleteModalOpen && (
        <>
          <div onClick={() => { setDeleteModalOpen(false); setDeleteConfirmText(''); }}
            style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          />
          <div role="dialog" aria-modal="true" aria-label="Delete account confirmation"
            style={{ position: 'fixed', inset: 0, zIndex: 1501, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, pointerEvents: 'none' }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                pointerEvents: 'auto', width: '100%', maxWidth: 440,
                background: isDark ? 'rgba(30,41,59,0.95)' : 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                border: `1px solid ${borderColor}`, borderRadius: 16,
                boxShadow: '0 24px 80px rgba(0,0,0,0.5)', padding: '32px 28px',
                animation: 'upgradeModalIn 0.2s ease-out',
              }}
            >
              <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: primaryText }}>
                Are you absolutely sure?
              </h2>
              <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText, lineHeight: 1.6 }}>
                This will permanently delete your Applyly account and all associated data including:
              </p>
              <ul style={{ margin: '0 0 20px', paddingLeft: 20, fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: secondaryText, lineHeight: 1.8 }}>
                <li>All job applications</li>
                <li>Generated CVs and cover letters</li>
                <li>Uploaded CV files</li>
                <li>Interview prep questions</li>
              </ul>
              <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: '#EF4444', lineHeight: 1.4 }}>
                This action cannot be reversed.
              </p>

              <label style={{ ...inputLabelStyle, color: secondaryText }}>Type "DELETE" to confirm</label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                style={{ ...inputStyle, marginBottom: 20 }}
                onFocus={e => { e.currentTarget.style.borderColor = '#EF4444'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.25)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = inputBorder; e.currentTarget.style.boxShadow = 'none'; }}
                autoFocus
              />

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => { setDeleteModalOpen(false); setDeleteConfirmText(''); }}
                  style={{
                    flex: 1, height: 44, borderRadius: 8, cursor: 'pointer',
                    background: 'none', border: `1px solid ${borderColor}`,
                    color: primaryText, fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif',
                  }}
                >Cancel</button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                  style={{
                    flex: 1, height: 44, borderRadius: 8, border: 'none',
                    cursor: deleteConfirmText === 'DELETE' && !isDeleting ? 'pointer' : 'not-allowed',
                    background: '#EF4444', color: '#FFFFFF',
                    fontSize: 14, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                    opacity: deleteConfirmText === 'DELETE' && !isDeleting ? 1 : 0.4,
                    transition: 'opacity 0.15s',
                  }}
                >{isDeleting ? 'Deleting...' : 'Permanently delete account'}</button>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes jb-card-in {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes upgradeModalIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes jb-shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.7; }
          100% { opacity: 0.4; }
        }
        * { box-sizing: border-box; }
        .jb-cv-card:hover { border-color: rgba(255,255,255,0.08) !important; }
        .jb-cv-card:hover .jb-cv-card-eye { opacity: 1 !important; }
      `}</style>
    </div>
  );
}

/* ─── Small Sub-Components ───────────────────────────────────── */

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function ConnectedBadge() {
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500,
      fontFamily: 'Inter, sans-serif',
      background: 'rgba(16,185,129,0.12)', color: '#10B981',
      lineHeight: 1.6,
    }}>Connected</span>
  );
}

function GhostButton({ icon, label, isDark, onClick }: {
  icon: React.ReactNode; label: string; isDark: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
        background: hovered ? (isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)') : 'none',
        border: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)'}`,
        borderRadius: 8, cursor: 'pointer', color: '#1A56DB', fontSize: 13, fontWeight: 500,
        fontFamily: 'Inter, sans-serif', lineHeight: 1, transition: 'background 0.15s',
      }}
    >{icon}{label}</button>
  );
}

function PrimaryButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)} onMouseUp={() => setPressed(false)}
      style={{
        padding: '10px 24px', borderRadius: 8, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: hovered && !disabled ? '#1E40AF' : '#1A56DB', color: '#FFFFFF',
        fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', lineHeight: 1,
        transform: pressed && !disabled ? 'scale(0.97)' : 'scale(1)',
        transition: 'background 0.15s, transform 0.1s',
        opacity: disabled ? 0.6 : 1,
      }}
    >{label}</button>
  );
}

function DangerButton({ label, isDark, onClick }: { label: string; isDark: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
        background: hovered ? 'rgba(239,68,68,0.08)' : 'transparent',
        border: '1px solid #EF4444', color: '#EF4444',
        fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', lineHeight: 1,
        transition: 'background 0.15s',
      }}
    >{label}</button>
  );
}

function UploadButton({ isDark, disabled, onClick }: { isDark: boolean; disabled: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)} onMouseUp={() => setPressed(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: '100%', height: 44,
        background: hovered && !disabled ? '#1E40AF' : '#1A56DB',
        color: '#FFFFFF', border: 'none', borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif',
        transform: pressed && !disabled ? 'scale(0.97)' : 'scale(1)',
        transition: 'background 0.15s, transform 0.1s', lineHeight: 1,
        opacity: disabled ? 0.6 : 1,
      }}
    ><Upload size={16} />Upload new CV</button>
  );
}

function SkeletonRow({ isDark }: { isDark: boolean }) {
  const bg = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.12)';
  return (
    <div style={{
      background: isDark ? '#1E293B' : '#FFFFFF',
      border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
      borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div>
        <div style={{ width: 160, height: 14, borderRadius: 6, background: bg, marginBottom: 8, animation: 'jb-shimmer 1.5s ease-in-out infinite' }} />
        <div style={{ width: 100, height: 10, borderRadius: 6, background: bg, animation: 'jb-shimmer 1.5s ease-in-out infinite' }} />
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ width: 80, height: 30, borderRadius: 6, background: bg, animation: 'jb-shimmer 1.5s ease-in-out infinite' }} />
    </div>
  );
}