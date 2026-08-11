import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import PixelAvatar from './PixelAvatar';
import TelegramLinkWidget from './TelegramLinkWidget';
import ChangePasswordModal from './ChangePasswordModal';
import { ROLE_META } from '../utils/roles';
import { computeInitials } from '../utils/initials';
import { usersApi } from '../api';
import logoUrl from '../assets/logo.svg';
import {
  ACCENT, TEXT_PRIMARY, TRACK_WIDE,
  HEADER_BG, HEADER_SHADOW, HEADER_BLUR, BADGE_BG, BADGE_BORDER,
} from '../utils/theme';

interface NavigationProps {
  user: any;
  onLogout: () => void;
}

export default function Navigation({ user, onLogout }: NavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  // Own equipped avatar for the nav-bar button — avatar_id/frame/custom_avatar
  // live on the per-page profile record, not the top-level `user` passed in
  // here, so it's fetched once via the same role-agnostic route
  // PublicProfilePage uses (self-view always returns the full shape).
  // Silent-fails to the initials circle below if it doesn't load.
  const [avatarProfile, setAvatarProfile] = useState<{ avatar_id: string; avatar_frame: string; custom_avatar: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    usersApi.getProfile(user.id)
      .then((r: any) => { if (!cancelled) setAvatarProfile(r.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user.id]);

  // Testers get their full gamified /cabinet; lead/admin get the dedicated
  // /profile page (see ProfilePage.tsx), which also hosts the same
  // ProfileEditModal they used to open straight from this dropdown.
  const handleProfileClick = () => {
    navigate(user.role === 'tester' ? '/cabinet' : '/profile');
    setMenuOpen(false);
  };

  const testerLinks = [
    { path: '/', label: 'Главная', tourId: 'nav-home' },
    { path: '/news', label: 'Новости', tourId: 'nav-news' },
    { path: '/zhukademia', label: 'Курсы', tourId: 'nav-courses' },
    // Чеклисты — temporarily pulled from the nav, still being reworked.
    // { path: '/checklists', label: 'Чеклисты', tourId: 'nav-checklists' },
    { path: '/bagodelnya', label: 'Багодельня', tourId: 'nav-shop' },
    { path: '/guides', label: 'Гайды', tourId: 'nav-guides' },
    { path: '/suggestions', label: 'Идеи', tourId: 'nav-suggestions' },
    { path: '/help', label: 'Помощь', tourId: 'nav-help' },
  ];

  const leadLinks = [
    { path: '/', label: 'Главная', tourId: 'nav-home' },
    { path: '/news', label: 'Новости', tourId: 'nav-news' },
    { path: '/zhukademia', label: 'Курсы', tourId: 'nav-courses' },
    { path: '/dashboard', label: 'Команда', tourId: 'nav-team' },
    // Чеклисты — temporarily pulled from the nav, still being reworked.
    // { path: '/checklists', label: 'Чеклисты', tourId: 'nav-checklists' },
    { path: '/bagodelnya', label: 'Багодельня', tourId: 'nav-shop' },
    { path: '/guides', label: 'Гайды', tourId: 'nav-guides' },
    { path: '/suggestions', label: 'Идеи', tourId: 'nav-suggestions' },
    { path: '/help', label: 'Помощь', tourId: 'nav-help' },
  ];

  // Admin can reach everything lead can (the server's requireRole('lead')
  // lets 'admin' through too — see server/src/auth.js) plus the admin
  // panel itself, so its nav is lead's nav with one link appended rather
  // than a third parallel list to keep in sync.
  const adminLinks = [...leadLinks, { path: '/admin', label: 'Админка', tourId: 'nav-admin' }];

  const links = user.role === 'admin' ? adminLinks : user.role === 'lead' ? leadLinks : testerLinks;

  const roleMeta = ROLE_META[user.role] || ROLE_META.tester;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        height: 80,
        background: HEADER_BG,
        boxShadow: HEADER_SHADOW,
        backdropFilter: HEADER_BLUR,
        WebkitBackdropFilter: HEADER_BLUR,
      }}
    >
      {/* Full-bleed glass bar — the frosted fill spans the whole viewport
          width edge to edge (per the full-canvas Figma screenshot: no side
          margins, no visible rounding); only the row of content inside it
          is capped at 1280px and centered, same as the page below. */}
      <div className="max-w-[1280px] mx-auto h-full flex justify-between items-center gap-4" style={{ padding: '0 24px' }}>
        {/* Logo */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center shrink-0 cursor-pointer"
        >
          <img src={logoUrl} alt="baganet" style={{ height: 46, width: 'auto' }} />
        </button>

        {/* Nav links — Geist 16px, active tab gets a bordered box (8px
            radius) instead of a filled/pill background (matches Figma). */}
        <nav className="flex gap-1 flex-wrap">
          {links.map(link => {
            const isActive = location.pathname === link.path;
            return (
              <button
                key={link.path}
                data-tour={link.tourId}
                onClick={() => navigate(link.path)}
                className="font-geist text-base px-2 py-1.5 rounded-lg transition-all duration-150 cursor-pointer"
                style={{
                  // Border stays the accent color; the label itself goes
                  // white on the active tab (kit: bordered box, white text —
                  // was accent-on-accent, too low-contrast against the box).
                  color: isActive ? '#FFFFFF' : TEXT_PRIMARY,
                  border: `1px solid ${isActive ? ACCENT : 'transparent'}`,
                }}
              >
                {link.label}
              </button>
            );
          })}
        </nav>

        {/* Name + role + avatar, with dropdown */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="font-geist text-sm font-normal leading-tight break-words" style={{ color: TEXT_PRIMARY }}>
              {user.displayName || user.name}
            </p>
            <span
              className="font-montserrat font-medium inline-block mt-0.5"
              style={{
                fontSize: 10,
                lineHeight: 1.6,
                letterSpacing: TRACK_WIDE,
                color: '#0B0C10',
                background: BADGE_BG,
                border: `1px solid ${BADGE_BORDER}`,
                borderRadius: 4,
                padding: '2px 4px',
              }}
            >
              {roleMeta.label.toUpperCase()}
            </span>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              data-tour="nav-account"
              onClick={() => setMenuOpen(p => !p)}
              aria-label="Меню аккаунта"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="rounded-full overflow-hidden flex items-center justify-center font-geist text-xs font-semibold cursor-pointer transition-all"
              style={{
                width: 38,
                height: 38,
                background: '#1F2833',
                color: ACCENT,
                border: `1px solid ${ACCENT}`,
                ...(menuOpen ? { outline: '2px solid #EF9F27', outlineOffset: 2 } : {}),
              }}
            >
              {avatarProfile ? (
                <PixelAvatar
                  id={avatarProfile.avatar_id as any}
                  frame={avatarProfile.avatar_frame as any}
                  customSrc={avatarProfile.custom_avatar}
                  size={36}
                />
              ) : (
                computeInitials(user.displayName || user.name)
              )}
            </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-48 rounded overflow-hidden"
              style={{
                background: '#1F2833',
                border: `2px solid ${ACCENT}80`,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                zIndex: 100,
              }}
            >
              {/* User info header */}
              <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(102, 252, 241,0.15)' }}>
                <p className="text-pixel text-xs font-sans font-medium leading-tight break-words">{user.displayName || user.name}</p>
                <p className="text-pixel/60 text-xs font-sans leading-tight mt-0.5 flex items-center gap-1">
                  <Icon name={roleMeta.icon} size={10} color={roleMeta.color} />
                  {roleMeta.label}
                </p>
              </div>

              <TelegramLinkWidget />

              {/* Profile link — testers get their full gamified cabinet;
                  leads/admins get a lighter edit-profile modal right here,
                  since they have no /cabinet page of their own. */}
              <button
                onClick={handleProfileClick}
                className="w-full text-left px-3 py-2.5 text-xs font-sans cursor-pointer transition-colors"
                style={{ color: 'rgba(197, 198, 199,0.7)' }}
                onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(102, 252, 241,0.08)'; (e.currentTarget).style.color = '#66FCF1'; }}
                onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; (e.currentTarget).style.color = 'rgba(197, 198, 199,0.7)'; }}
              >
                <span className="inline-flex items-center gap-1">Мой профиль <Icon name="arrowRight" size={14} color="currentColor" /></span>
              </button>

              <button
                onClick={() => { setShowPasswordChange(true); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-xs font-sans cursor-pointer transition-colors"
                style={{ color: 'rgba(197, 198, 199,0.7)' }}
                onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(102, 252, 241,0.08)'; (e.currentTarget).style.color = '#66FCF1'; }}
                onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; (e.currentTarget).style.color = 'rgba(197, 198, 199,0.7)'; }}
              >
                Сменить пароль
              </button>

              {/* Logout */}
              <button
                onClick={() => { onLogout(); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-xs font-sans cursor-pointer transition-colors"
                style={{ color: 'rgba(197, 198, 199,0.6)', borderTop: '1px solid rgba(102, 252, 241,0.08)' }}
                onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(224,82,82,0.06)'; (e.currentTarget).style.color = '#e05252'; }}
                onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; (e.currentTarget).style.color = 'rgba(197, 198, 199,0.45)'; }}
              >
                Выйти
              </button>
            </div>
          )}
          </div>
        </div>
      </div>

      {showPasswordChange && (
        <ChangePasswordModal
          onDone={() => setShowPasswordChange(false)}
          onClose={() => setShowPasswordChange(false)}
        />
      )}
    </header>
  );
}
