import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import PixelIcon from './PixelIcon';
import TelegramLinkWidget from './TelegramLinkWidget';
import ChangePasswordModal from './ChangePasswordModal';
import { ROLE_META } from '../utils/roles';
import { computeInitials } from '../utils/initials';

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

  // Testers get their full gamified /cabinet; lead/admin get the dedicated
  // /profile page (see ProfilePage.tsx), which also hosts the same
  // ProfileEditModal they used to open straight from this dropdown.
  const handleProfileClick = () => {
    navigate(user.role === 'tester' ? '/cabinet' : '/profile');
    setMenuOpen(false);
  };

  const testerLinks = [
    { path: '/', label: 'Главная', tourId: 'nav-home' },
    { path: '/zhukademia', label: 'Курсы', tourId: 'nav-courses' },
    { path: '/checklists', label: 'Чеклисты', tourId: 'nav-checklists' },
    { path: '/bagodelnya', label: 'Багодельня', tourId: 'nav-shop' },
    { path: '/guides', label: 'Гайды', tourId: 'nav-guides' },
    { path: '/suggestions', label: 'Идеи', tourId: 'nav-suggestions' },
    { path: '/help', label: 'Помощь', tourId: 'nav-help' },
  ];

  const leadLinks = [
    { path: '/', label: 'Главная', tourId: 'nav-home' },
    { path: '/zhukademia', label: 'Курсы', tourId: 'nav-courses' },
    { path: '/dashboard', label: 'Команда', tourId: 'nav-team' },
    { path: '/checklists', label: 'Чеклисты', tourId: 'nav-checklists' },
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
      style={{ background: '#1a1a2e', borderBottom: '2px solid #1D9E75' }}
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center gap-4">
        {/* Logo */}
        <button
          onClick={() => navigate('/')}
          className="font-pixel text-primary text-xs pixel-pulse shrink-0"
          style={{ letterSpacing: '0.05em' }}
        >
          baga-net
        </button>

        {/* Nav links */}
        <nav className="flex gap-1 flex-wrap">
          {links.map(link => {
            const isActive = location.pathname === link.path;
            return (
              <button
                key={link.path}
                data-tour={link.tourId}
                onClick={() => navigate(link.path)}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                {link.label}
              </button>
            );
          })}
        </nav>

        {/* Avatar with dropdown */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            data-tour="nav-account"
            onClick={() => setMenuOpen(p => !p)}
            aria-label="Меню аккаунта"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="w-8 h-8 rounded flex items-center justify-center font-pixel text-game text-xs cursor-pointer transition-all"
            style={{
              background: '#1D9E75',
              ...(menuOpen ? { outline: '2px solid #EF9F27', outlineOffset: 2 } : {}),
            }}
          >
            {computeInitials(user.displayName || user.name)}
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-48 rounded overflow-hidden"
              style={{
                background: '#1a1a2e',
                border: '2px solid rgba(29,158,117,0.5)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                zIndex: 100,
              }}
            >
              {/* User info header */}
              <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(29,158,117,0.15)' }}>
                <p className="text-pixel text-xs font-sans font-medium leading-tight">{user.displayName || user.name}</p>
                <p className="text-pixel/60 text-xs font-sans leading-tight mt-0.5 flex items-center gap-1">
                  <PixelIcon name={roleMeta.icon} size={10} color={roleMeta.color} />
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
                style={{ color: 'rgba(232,232,208,0.7)' }}
                onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(29,158,117,0.08)'; (e.currentTarget).style.color = '#1D9E75'; }}
                onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; (e.currentTarget).style.color = 'rgba(232,232,208,0.7)'; }}
              >
                Мой профиль →
              </button>

              <button
                onClick={() => { setShowPasswordChange(true); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-xs font-sans cursor-pointer transition-colors"
                style={{ color: 'rgba(232,232,208,0.7)' }}
                onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(29,158,117,0.08)'; (e.currentTarget).style.color = '#1D9E75'; }}
                onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; (e.currentTarget).style.color = 'rgba(232,232,208,0.7)'; }}
              >
                Сменить пароль
              </button>

              {/* Logout */}
              <button
                onClick={() => { onLogout(); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-xs font-sans cursor-pointer transition-colors"
                style={{ color: 'rgba(232,232,208,0.6)', borderTop: '1px solid rgba(29,158,117,0.08)' }}
                onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(224,82,82,0.06)'; (e.currentTarget).style.color = '#e05252'; }}
                onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; (e.currentTarget).style.color = 'rgba(232,232,208,0.45)'; }}
              >
                Выйти
              </button>
            </div>
          )}
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
