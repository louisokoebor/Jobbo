import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { SharedNavbar } from './SharedNavbar';
import { supabase } from '../lib/supabaseClient';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import {
  KeyRound, Trash2, Upload, CheckCircle2, AlertCircle,
  Star, XCircle, Loader2,
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
}

interface ToastItem {
  id: string;
  type: 'error' | 'success';
  message: string;
}

/* ─── Helpers ────────────────────────────────────────────────── */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [theme, setTheme] = useState<Theme>(() =>
    (typeof window !== 'undefined' && (localStorage.getItem('jobbo-theme') as Theme)) || 'dark'
  );
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('jobbo-theme', theme);
  }, [theme]);

  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const surfaceColor = isDark ? '#1E293B' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)';

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
      }

      const { data, error } = await supabase
        .from('cv_profiles')
        .select('id, label, created_at, is_default')
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
    // Unset all defaults
    await supabase
      .from('cv_profiles')
      .update({ is_default: false })
      .eq('user_id', userId);

    // Set new default
    const { error } = await supabase
      .from('cv_profiles')
      .update({ is_default: true })
      .eq('id', profileId);

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

    const { error } = await supabase
      .from('cv_profiles')
      .delete()
      .eq('id', profileId);

    if (error) {
      console.error('ProfilePage: Delete error:', error.message);
      addToast('error', 'Failed to delete. Please try again.');
    } else {
      addToast('success', 'CV profile deleted');
      setConfirmDeleteId(null);

      // If deleted was default and others exist, set the next as default
      const remaining = cvProfiles.filter(p => p.id !== profileId);
      if (wasDefault && remaining.length > 0 && userId) {
        await supabase
          .from('cv_profiles')
          .update({ is_default: true })
          .eq('id', remaining[0].id);
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
    if (!validTypes.includes(file.type)) {
      addToast('error', 'Please upload a PDF or DOCX file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      addToast('error', 'File too large. Max 10 MB.');
      return;
    }

    setIsUploadingCv(true);
    setUploadStatus('uploading');
    setUploadFileName(file.name);

    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session;
      }
      if (!session?.access_token) {
        addToast('error', 'Your session has expired. Please log in again.');
        setIsUploadingCv(false);
        return;
      }

      const accessToken = session.access_token;
      const uid = session.user?.id ?? 'anon';
      const filePath = `${uid}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('cv-uploads')
        .upload(filePath, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        addToast('error', 'Upload failed. Please try again.');
        setIsUploadingCv(false);
        return;
      }

      const { data: urlData } = await supabase.storage
        .from('cv-uploads')
        .createSignedUrl(filePath, 3600);

      const fileUrl = urlData?.signedUrl;
      if (!fileUrl) {
        addToast('error', 'Upload failed. Please try again.');
        setIsUploadingCv(false);
        return;
      }

      setUploadStatus('reading');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/make-server-3bbff5cf/parse-cv`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-User-Token': accessToken,
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
        return;
      }

      const { data: existingProfiles } = await supabase
        .from('cv_profiles')
        .select('id')
        .eq('user_id', session.user.id);

      const isFirst = !existingProfiles || existingProfiles.length === 0;

      const { error: saveError } = await supabase
        .from('cv_profiles')
        .insert({
          user_id: session.user.id,
          label: result.label || file.name.replace(/\.[^/.]+$/, ''),
          parsed_json: result.parsed_json,
          raw_file_url: fileUrl,
          is_default: isFirst,
        });

      if (saveError) {
        console.error('cv_profiles save error:', saveError);
        addToast('error', 'CV parsed but could not be saved. Please try again.');
        setIsUploadingCv(false);
        return;
      }

      addToast('success', 'CV uploaded and ready to use');
      setIsUploadingCv(false);
      fetchData();
    } catch (err) {
      console.error('CV upload unexpected error:', err);
      addToast('error', 'Upload failed. Please try again.');
      setIsUploadingCv(false);
    }
  }, [addToast, fetchData]);

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

        {/* ── SECTION 1: Account ── */}
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
              }}>
                Email
              </p>
              <p style={{
                margin: 0, fontSize: 15, fontWeight: 500,
                fontFamily: 'Inter, sans-serif', color: primaryText, lineHeight: 1.4,
              }}>
                {email || 'Loading...'}
              </p>
            </div>
            <GhostButton
              icon={<KeyRound size={14} />}
              label="Change Password"
              isDark={isDark}
              onClick={handleChangePassword}
            />
          </div>
        </div>

        {/* ── SECTION 2: CV Profiles ── */}
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
              <div key={profile.id} style={{
                ...cardStyle,
                display: 'flex', alignItems: 'center', gap: 12,
                flexWrap: 'wrap',
              }}>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 15, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                      color: primaryText, lineHeight: 1.3,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {profile.label}
                    </span>
                    {profile.is_default && (
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500,
                        fontFamily: 'Inter, sans-serif',
                        background: 'rgba(16,185,129,0.15)', color: '#10B981',
                        border: '1px solid rgba(16,185,129,0.3)',
                        lineHeight: 1.6, whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        Default
                      </span>
                    )}
                  </div>
                  <p style={{
                    margin: 0, fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif',
                    color: secondaryText, lineHeight: 1.4,
                  }}>
                    Uploaded {formatDate(profile.created_at)}
                  </p>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  {!profile.is_default && (
                    <GhostButton
                      icon={<Star size={13} />}
                      label="Set as Default"
                      isDark={isDark}
                      onClick={() => handleSetDefault(profile.id)}
                    />
                  )}
                  {confirmDeleteId === profile.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        onClick={() => handleDelete(profile.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#EF4444', fontSize: 12, fontWeight: 600,
                          fontFamily: 'Inter, sans-serif', padding: 0, lineHeight: 1,
                        }}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: secondaryText, fontSize: 12, fontWeight: 500,
                          fontFamily: 'Inter, sans-serif', padding: 0, lineHeight: 1,
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(profile.id)}
                      aria-label="Delete CV profile"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: secondaryText, padding: 6,
                        display: 'flex', alignItems: 'center', borderRadius: 6, lineHeight: 1,
                        transition: 'color 0.15s',
                      }}
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

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      <ToastStack toasts={toasts} isDark={isDark} />

      <style>{`
        @keyframes jb-card-in {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
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
      `}</style>
    </div>
  );
}

/* ─── Ghost Button ───────────────────────────────────────────── */
function GhostButton({ icon, label, isDark, onClick }: {
  icon: React.ReactNode; label: string; isDark: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 14px',
        background: hovered ? (isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)') : 'none',
        border: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)'}`,
        borderRadius: 8, cursor: 'pointer',
        color: '#1A56DB', fontSize: 13, fontWeight: 500,
        fontFamily: 'Inter, sans-serif', lineHeight: 1,
        transition: 'background 0.15s',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/* ─── Upload Button ──────────────────────────────────────────── */
function UploadButton({ isDark, disabled, onClick }: {
  isDark: boolean; disabled: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
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
    >
      <Upload size={16} />
      Upload new CV
    </button>
  );
}

/* ─── Skeleton Row ───────────────────────────────────────────── */
function SkeletonRow({ isDark }: { isDark: boolean }) {
  const bg = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.12)';
  return (
    <div style={{
      background: isDark ? '#1E293B' : '#FFFFFF',
      border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
      borderRadius: 12, padding: '20px 24px',
      display: 'flex', alignItems: 'center', gap: 12,
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