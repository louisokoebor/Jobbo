import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Sun, Moon, Plus, ChevronDown, LogOut, User, Menu, X,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

/* ─── Types ──────────────────────────────────────────────────── */
interface NavItem {
  label: string;
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Applications', path: '/applications' },
  { label: 'Billing', path: '/billing' },
  { label: 'Profile', path: '/profile' },
];

/* ─── DropdownItem ───────────────────────────────────────────── */
function DropdownItem({ icon, label, isDark, danger = false, onClick }: {
  icon: React.ReactNode; label: string; isDark: boolean; danger?: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = danger ? '#EF4444' : isDark ? '#F8FAFC' : '#0F172A';
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '8px 10px', background: hovered ? (isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)') : 'none',
        border: 'none', borderRadius: 6, cursor: 'pointer',
        color, fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif',
        textAlign: 'left', transition: 'background 0.12s', lineHeight: 1,
      }}
    >
      {icon} {label}
    </button>
  );
}

/* ─── Avatar Dropdown ────────────────────────────────────────── */
function AvatarDropdown({ isDark, onLogout }: { isDark: boolean; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  // Fetch user display name and avatar
  const [displayName, setDisplayName] = useState('User');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserInfo = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const user = session.user;

      // Try to get profile from public.users table
      let profileName: string | null = null;
      let profileAvatar: string | null = null;
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('full_name, avatar_url')
          .eq('id', user.id)
          .maybeSingle();
        profileName = profile?.full_name || null;
        profileAvatar = profile?.avatar_url || null;
      } catch { /* ignore */ }

      // Fallback chain for display name
      const name =
        profileName ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split('@')[0] ||
        'User';

      // Fallback chain for avatar
      const avatar =
        profileAvatar ||
        user.user_metadata?.avatar_url ||
        user.user_metadata?.picture ||
        null;

      setDisplayName(name);
      setAvatarUrl(avatar);
    };

    fetchUserInfo();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              objectFit: 'cover', flexShrink: 0,
            }}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #1A56DB 0%, #8B5CF6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', color: '#FFFFFF',
          }}>
            {initial}
          </div>
        )}
        <ChevronDown
          size={14}
          color={isDark ? '#94A3B8' : '#64748B'}
          className="sn-avatar-chevron"
          style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          minWidth: 160,
          background: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(248,250,252,0.95)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
          borderRadius: 10,
          boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(15,23,42,0.12)',
          padding: '6px',
          zIndex: 200,
          animation: 'sn-dropdown-in 0.15s ease-out',
        }}>
          <DropdownItem
            icon={<User size={14} />}
            label="Profile"
            isDark={isDark}
            onClick={() => { setOpen(false); navigate('/profile'); }}
          />
          <div style={{ height: 1, background: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)', margin: '4px 0' }} />
          <DropdownItem
            icon={<LogOut size={14} />}
            label="Log out"
            isDark={isDark}
            danger
            onClick={() => { setOpen(false); onLogout(); }}
          />
        </div>
      )}
    </div>
  );
}

/* ─── NavLink ────────────────────────────────────────────────── */
function NavLinkButton({ label, isActive, isDark, onClick }: { label: string; isActive: boolean; isDark: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '6px 12px',
        fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif',
        color: isActive
          ? (isDark ? '#F8FAFC' : '#0F172A')
          : hovered
          ? (isDark ? '#CBD5E1' : '#334155')
          : (isDark ? '#94A3B8' : '#64748B'),
        borderBottom: isActive ? '2px solid #1A56DB' : '2px solid transparent',
        marginBottom: -2,
        transition: 'color 0.15s, border-color 0.15s', lineHeight: 1,
        borderRadius: '0',
      }}
    >
      {label}
    </button>
  );
}

/* ─── MobileMenuItem ─────────────────────────────────────────── */
function MobileMenuItem({ icon, label, isDark, color, onClick }: {
  icon?: React.ReactNode; label: string; isDark: boolean; color?: string; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '10px 12px',
        background: hovered ? (isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)') : 'none',
        border: 'none', borderRadius: 8, cursor: 'pointer',
        color: color || (isDark ? '#F8FAFC' : '#0F172A'),
        fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif',
        textAlign: 'left', transition: 'background 0.12s', lineHeight: 1,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/* ─── Shared Navbar ──────────────────────────────────────────── */
export function SharedNavbar({
  isDark,
  onToggleTheme,
}: {
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const [themeHov, setThemeHov] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) setMobileMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mobileMenuOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentPath]);

  const handleLogout = () => {
    navigate('/login');
  };

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      height: 60, padding: '0 24px',
      display: 'flex', alignItems: 'center', gap: 0,
      background: isDark ? 'rgba(30,41,59,0.65)' : 'rgba(255,255,255,0.65)',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      borderBottom: `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)'}`,
      transition: 'background 0.2s, border-color 0.2s',
    }}>
      {/* Logo */}
      <span
        onClick={() => navigate('/dashboard')}
        style={{
          fontSize: 20, fontWeight: 700, fontFamily: 'Inter, sans-serif',
          color: '#1A56DB', letterSpacing: '-0.025em', userSelect: 'none', lineHeight: 1,
          marginRight: 32, flexShrink: 0, cursor: 'pointer',
        }}
      >
        Applyly
      </span>

      {/* Desktop nav links */}
      <div className="sn-desktop-links" style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
        {NAV_ITEMS.map(item => (
          <NavLinkButton
            key={item.label}
            label={item.label}
            isActive={currentPath === item.path || currentPath.startsWith(item.path + '/')}
            isDark={isDark}
            onClick={() => navigate(item.path)}
          />
        ))}
      </div>

      {/* Mobile spacer to push right items */}
      <div className="sn-mobile-spacer" style={{ flex: 1 }} />

      {/* Desktop right side: theme toggle + New App + Avatar */}
      <div className="sn-desktop-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={onToggleTheme}
          onMouseEnter={() => setThemeHov(true)}
          onMouseLeave={() => setThemeHov(false)}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            background: themeHov ? (isDark ? 'rgba(148,163,184,0.1)' : 'rgba(15,23,42,0.06)') : 'none',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            color: isDark ? '#94A3B8' : '#64748B', padding: 8,
            display: 'flex', alignItems: 'center', lineHeight: 1,
            transition: 'background 0.15s',
          }}
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <NewAppButton onClick={() => navigate('/new-application')} />
        <AvatarDropdown isDark={isDark} onLogout={handleLogout} />
      </div>

      {/* Mobile right side: Avatar + Hamburger */}
      <div className="sn-mobile-actions" style={{ display: 'none', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Avatar always visible on mobile */}
        <AvatarDropdown isDark={isDark} onLogout={handleLogout} />

        {/* Hamburger */}
        <div ref={mobileMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMobileMenuOpen(v => !v)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: isDark ? '#94A3B8' : '#64748B', padding: 8,
              display: 'flex', alignItems: 'center', lineHeight: 1,
              borderRadius: 8,
              transition: 'background 0.15s',
            }}
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          {/* Mobile dropdown menu */}
          {mobileMenuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              minWidth: 220, padding: 8,
              background: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(248,250,252,0.98)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'}`,
              borderRadius: 12,
              boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(15,23,42,0.12)',
              zIndex: 300,
              animation: 'sn-dropdown-in 0.15s ease-out',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              {/* Nav links */}
              {NAV_ITEMS.map(item => {
                const isActive = currentPath === item.path || currentPath.startsWith(item.path + '/');
                return (
                  <MobileMenuItem
                    key={item.label}
                    label={item.label}
                    isDark={isDark}
                    color={isActive ? '#1A56DB' : undefined}
                    onClick={() => { setMobileMenuOpen(false); navigate(item.path); }}
                  />
                );
              })}

              <div style={{ height: 1, background: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)', margin: '4px 0' }} />

              {/* New Application */}
              <MobileMenuItem
                icon={<Plus size={15} strokeWidth={2.5} />}
                label="New Application"
                isDark={isDark}
                color="#1A56DB"
                onClick={() => { setMobileMenuOpen(false); navigate('/new-application'); }}
              />

              <div style={{ height: 1, background: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)', margin: '4px 0' }} />

              {/* Theme toggle */}
              <MobileMenuItem
                icon={isDark ? <Sun size={15} /> : <Moon size={15} />}
                label={isDark ? 'Light mode' : 'Dark mode'}
                isDark={isDark}
                color={isDark ? '#94A3B8' : '#64748B'}
                onClick={() => { setMobileMenuOpen(false); onToggleTheme(); }}
              />

              {/* Logout */}
              <MobileMenuItem
                icon={<LogOut size={15} />}
                label="Log out"
                isDark={isDark}
                color="#EF4444"
                onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Responsive styles */}
      <style>{`
        @keyframes sn-dropdown-in {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (min-width: 768px) {
          .sn-desktop-links { display: flex !important; }
          .sn-desktop-actions { display: flex !important; }
          .sn-mobile-actions { display: none !important; }
          .sn-mobile-spacer { display: none !important; }
        }
        @media (max-width: 767px) {
          .sn-desktop-links { display: none !important; }
          .sn-desktop-actions { display: none !important; }
          .sn-mobile-actions { display: flex !important; }
          .sn-mobile-spacer { display: block !important; }
          .sn-avatar-chevron { display: none !important; }
        }
      `}</style>
    </nav>
  );
}

/* ─── NewAppButton ───────────────────────────────────────────── */
function NewAppButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        height: 36, padding: '0 14px',
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
  );
}