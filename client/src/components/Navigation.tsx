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
import { ACCENT, TRACK_WIDE, STAT_LABEL_COLOR, PAGE_BG, HEADER_BG, HEADER_SHADOW, HEADER_BLUR, BADGE_BG, BADGE_BORDER, ERROR } from '../utils/theme';

// Distance from the header's own top/bottom edge to a nav tab, per the kit
// spec — with the header's own height, this fixes the tab's rendered
// height (centered) rather than driving it off padding, so active/inactive
// tabs share one box and switching tabs never shifts other tabs around.
const HEADER_HEIGHT = 80;
const TAB_INSET = 20;
const TAB_HEIGHT = HEADER_HEIGHT - TAB_INSET * 2;

// The header floats HEADER_SIDE_MARGIN away from the viewport edge at the
// kit's reference width (1440) and stays capped there on wider screens (the
// header's own max-width takes over beyond that) — but a flat 80px would
// leave almost nothing to work with on a 320px phone, so it scales down
// fluidly below the reference width instead of stepping at a breakpoint.
// clamp(min, preferred, max): preferred is exactly 80px at 1440px viewport
// width (80 / 1440 = 5.5556vw), floored at 16px for anything narrower.
const HEADER_SIDE_MARGIN = 'clamp(16px, 5.5556vw, 80px)';

interface NavigationProps {
  user: any;
  onLogout: () => void;
}

interface AvatarProfile { avatar_id: string; avatar_frame: string; custom_avatar: string | null }

// Module-level (outside the component) so it survives Navigation's own
// remounts across route changes — see the comment at avatarProfile's
// useState for why that matters. Cleared naturally on a full page reload.
const avatarCache = new Map<number, AvatarProfile>();

// A resolved cache entry alone isn't enough to stop duplicate requests: the
// very first navigations of a session (before the first fetch has landed)
// remount Navigation faster than one round trip to buildFullProfile() takes,
// and each of those mounts would otherwise see an empty cache and kick off
// its own fetch. Tracking the in-flight promise per user id lets every
// mount that lands during that window share the one real request instead.
const avatarFetchesInFlight = new Map<number, Promise<AvatarProfile>>();

function fetchAvatarProfile(userId: number): Promise<AvatarProfile> {
  const cached = avatarCache.get(userId);
  if (cached) return Promise.resolve(cached);
  const inFlight = avatarFetchesInFlight.get(userId);
  if (inFlight) return inFlight;

  const request = usersApi.getProfile(userId)
    .then((r: any) => {
      avatarCache.set(userId, r.data);
      avatarFetchesInFlight.delete(userId);
      return r.data as AvatarProfile;
    })
    .catch(err => {
      avatarFetchesInFlight.delete(userId);
      throw err;
    });
  avatarFetchesInFlight.set(userId, request);
  return request;
}

// Lets ProfileEditModal's callers (MoyaNora.tsx, ProfilePage.tsx) push a
// freshly-saved avatar straight into the cache the moment it changes,
// instead of waiting on a future Navigation remount to notice — see the
// skip-if-cached check in the effect below for why Navigation won't
// refetch on its own otherwise.
export function primeAvatarCache(userId: number, profile: AvatarProfile) {
  avatarCache.set(userId, profile);
}

export default function Navigation({ user, onLogout }: NavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Below `lg` the full 8-link row plus logo and the name/role/avatar block
  // no longer fit in one 80px-tall row — it used to just flex-wrap, which
  // made the tab list stack into a many-line column and blew the header
  // way past its fixed 80px height at phone widths. Below `lg` the inline
  // row is hidden entirely in favor of this dropdown, opened from a
  // hamburger button next to the avatar (see the `lg:hidden` button below).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  // Tracked in state (not a direct DOM style mutation like the nav tabs
  // above) because the hover here also needs to flip the hamburger icon's
  // own stroke color to match the quick-links buttons' fill+dark-icon
  // treatment, and that icon is built from several nested <path> elements.
  const [hamburgerHover, setHamburgerHover] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  // Own equipped avatar for the nav-bar button — avatar_id/frame/custom_avatar
  // live on the per-page profile record, not the top-level `user` passed in
  // here, so it's fetched once via the same role-agnostic route
  // PublicProfilePage uses (self-view always returns the full shape).
  // Silent-fails to the initials circle below if it doesn't load.
  //
  // No page in this app shares a persistent layout — every route owns its
  // own <Navigation>, so this component fully unmounts/remounts on every
  // navigation. Without a cache, avatarProfile reset to null on each mount
  // and the initials circle flashed for a moment before the refetch
  // resolved, every single time. This module-level cache (keyed by user id,
  // survives remounts for the lifetime of the tab) makes every navigation
  // after the first paint the avatar immediately — letters only ever show
  // once, on true first load of the session, never again after.
  const [avatarProfile, setAvatarProfile] = useState<AvatarProfile | null>(() => avatarCache.get(user.id) ?? null);

  useEffect(() => {
    // fetchAvatarProfile short-circuits on its own if a copy is already
    // cached, and shares one in-flight request across any other Navigation
    // mounts racing for the same user id (see its own comment) — so this
    // effect never needs to duplicate that bookkeeping itself. The endpoint
    // behind it (self-view GET /api/users/:id/profile) runs a full
    // buildFullProfile() server-side (stats/cards/badges/etc., ~15
    // queries) just to hand back 3 avatar fields, and custom_avatar can be
    // several hundred KB of base64 — refetching that on every single
    // navigation (Navigation remounts per-route, see above) was pure waste
    // once a copy was already in hand. primeAvatarCache keeps this from
    // going stale after an actual edit (see its own comment).
    let cancelled = false;
    fetchAvatarProfile(user.id)
      .then(data => { if (!cancelled) setAvatarProfile(data); })
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
      if (mobileNavRef.current && !mobileNavRef.current.contains(e.target as Node)) {
        setMobileNavOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const goTo = (path: string) => { navigate(path); setMobileNavOpen(false); };

  return (
    // Spacer/positioning layer only (no visual styling of its own) — holds
    // the floating header its 8px-from-top / fluid-side-margin position
    // without the header itself needing to know about viewport edges.
    <div className="sticky top-0 z-50" style={{ padding: `8px ${HEADER_SIDE_MARGIN} 0` }}>
      <header
        className="mx-auto flex justify-between items-center"
        style={{
          maxWidth: 1280,
          minHeight: HEADER_HEIGHT,
          padding: '0 24px',
          borderRadius: 12,
          background: HEADER_BG,
          boxShadow: HEADER_SHADOW,
          backdropFilter: HEADER_BLUR,
          WebkitBackdropFilter: HEADER_BLUR,
        }}
      >
        {/* Logo — the mark's native artwork is 95×50 (crown icon stacked
            over the "baganet" wordmark), so a 95×23 box (this used to be
            the box size) forced object-fit:contain to shrink it to ~46% to
            fit the height constraint, leaving it reading as tiny with a lot
            of dead space on either side. Sizing the box to the same 95:50
            ratio (here 76×40, matching the nav tabs' own height for a
            clean shared baseline) lets it render at full box size with no
            extra shrinkage. */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center shrink-0 cursor-pointer transition-all duration-150 hover:brightness-125"
        >
          <img src={logoUrl} alt="baganet" style={{ width: 76, height: 40, objectFit: 'contain' }} />
        </button>

        {/* Nav links — Geist 16px/400, #E0E0E0; active tab gets a bordered
            box (8px radius, accent border, white label) instead of a
            filled/pill background. Every tab shares the same box height
            (TAB_HEIGHT, inset 20px off the header's own top/bottom) and
            horizontal padding regardless of active state, so switching
            tabs never shifts anything else in the row. */}
        <nav className="hidden lg:flex gap-1 flex-wrap">
          {links.map(link => {
            const isActive = location.pathname === link.path;
            return (
              <button
                key={link.path}
                data-tour={link.tourId}
                onClick={() => navigate(link.path)}
                className="font-geist font-normal rounded-lg transition-all duration-150 cursor-pointer flex items-center"
                style={{
                  fontSize: 16,
                  height: TAB_HEIGHT,
                  padding: '0 8px',
                  // Border stays the accent color; the label itself goes
                  // white on the active tab (kit: bordered box, white text —
                  // was accent-on-accent, too low-contrast against the box).
                  color: isActive ? '#FFFFFF' : STAT_LABEL_COLOR,
                  border: `1px solid ${isActive ? ACCENT : 'transparent'}`,
                  background: 'transparent',
                }}
                // Same solid-fill treatment as the homepage's quick-links
                // rows (LinkRow in HomePage.tsx: bg → ACCENT, text → PAGE_BG)
                // instead of the previous translucent tint, so every
                // "button-shaped" element in the app hovers the same way.
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = PAGE_BG; } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = STAT_LABEL_COLOR; } }}
              >
                {link.label}
              </button>
            );
          })}
        </nav>

        {/* Name + role + avatar, with dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Hamburger — the mobile stand-in for the hidden <nav> above,
              same breakpoint (lg). */}
          <div className="relative lg:hidden" ref={mobileNavRef}>
            <button
              onClick={() => setMobileNavOpen(o => !o)}
              onMouseEnter={() => setHamburgerHover(true)}
              onMouseLeave={() => setHamburgerHover(false)}
              aria-label="Меню разделов"
              aria-haspopup="menu"
              aria-expanded={mobileNavOpen}
              // Only visible below lg, which is exactly what makes it a
              // usable tour target on a phone: the onboarding step aimed at
              // it auto-skips on a desktop, where this button is hidden and
              // the real nav links are the ones on screen.
              data-tour="nav-menu"
              className="flex items-center justify-center cursor-pointer rounded-lg transition-all duration-150"
              style={{
                width: TAB_HEIGHT, height: TAB_HEIGHT,
                border: `1px solid ${mobileNavOpen ? ACCENT : 'transparent'}`,
                // Same solid-fill treatment as the quick-links buttons —
                // see the nav tabs above for the same swap.
                background: !mobileNavOpen && hamburgerHover ? ACCENT : 'transparent',
              }}
            >
              {mobileNavOpen ? (
                <Icon name="close" size={18} color={ACCENT} />
              ) : (
                <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
                  <path d="M0 1H20" stroke={hamburgerHover ? PAGE_BG : STAT_LABEL_COLOR} strokeWidth="2" strokeLinecap="round" />
                  <path d="M0 7H20" stroke={hamburgerHover ? PAGE_BG : STAT_LABEL_COLOR} strokeWidth="2" strokeLinecap="round" />
                  <path d="M0 13H20" stroke={hamburgerHover ? PAGE_BG : STAT_LABEL_COLOR} strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </button>

            {mobileNavOpen && (
              <div
                className="absolute left-0 top-full mt-2 flex flex-col gap-1 rounded-lg"
                style={{
                  width: 'max-content',
                  maxWidth: '80vw',
                  padding: 8,
                  background: '#1F2833',
                  border: `1px solid ${ACCENT}55`,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  zIndex: 100,
                }}
              >
                {links.map(link => {
                  const isActive = location.pathname === link.path;
                  return (
                    <button
                      key={link.path}
                      data-tour={link.tourId}
                      onClick={() => goTo(link.path)}
                      className="font-geist font-normal rounded-lg transition-all duration-150 cursor-pointer text-left px-3 py-2"
                      style={{
                        fontSize: 16,
                        color: isActive ? '#FFFFFF' : STAT_LABEL_COLOR,
                        background: isActive ? 'rgba(102, 252, 241,0.1)' : 'transparent',
                        border: `1px solid ${isActive ? ACCENT : 'transparent'}`,
                      }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = PAGE_BG; } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = STAT_LABEL_COLOR; } }}
                    >
                      {link.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="text-left hidden sm:block">
            <p className="font-geist text-sm font-normal leading-tight break-words" style={{ color: STAT_LABEL_COLOR }}>
              {user.displayName || user.name}
            </p>
            <span
              className="font-montserrat font-medium inline-block"
              style={{
                marginTop: 6,
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
              onMouseEnter={e => { if (!menuOpen) { e.currentTarget.style.outline = `2px solid ${ACCENT}66`; e.currentTarget.style.outlineOffset = '2px'; } }}
              onMouseLeave={e => { if (!menuOpen) { e.currentTarget.style.outline = 'none'; } }}
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
                onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(224,82,82,0.06)'; (e.currentTarget).style.color = ERROR; }}
                onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; (e.currentTarget).style.color = 'rgba(197, 198, 199,0.45)'; }}
              >
                Выйти
              </button>
            </div>
          )}
          </div>
        </div>
      </header>

      {showPasswordChange && (
        <ChangePasswordModal
          onDone={() => setShowPasswordChange(false)}
          onClose={() => setShowPasswordChange(false)}
        />
      )}
    </div>
  );
}
