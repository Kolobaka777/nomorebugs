import { useNavigate, useLocation } from 'react-router-dom';

interface NavigationProps {
  user: any;
  onLogout: () => void;
}

export default function Navigation({ user, onLogout }: NavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const testerLinks = [
    { path: '/', label: 'Главная' },
    { path: '/zhukademia', label: 'Жукадemia' },
    { path: '/cabinet', label: 'Моя нора' },
    { path: '/bagodelnya', label: 'Багодельня' },
    { path: '/zhukovodstvo', label: 'Жуководство' },
  ];

  const leadLinks = [
    { path: '/', label: 'Главная' },
    { path: '/zhukademia', label: 'Жукадemia' },
    { path: '/dashboard', label: 'Улей' },
    { path: '/bagodelnya', label: 'Багодельня' },
    { path: '/zhukovodstvo', label: 'Жуководство' },
  ];

  const links = user.role === 'lead' ? leadLinks : testerLinks;

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
                onClick={() => navigate(link.path)}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                {link.label}
              </button>
            );
          })}
        </nav>

        {/* User area */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="w-8 h-8 rounded flex items-center justify-center font-pixel text-game text-xs shrink-0"
            style={{ background: '#1D9E75' }}
          >
            {user.avatar_initials}
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-pixel text-xs font-sans font-medium leading-tight">{user.name}</p>
            <p className="text-pixel/40 text-xs leading-tight">{user.role === 'lead' ? '👑🐝 Королева улья' : '🐞 тестировщик'}</p>
          </div>
          <button onClick={onLogout} className="btn-secondary text-xs px-2 py-1">
            Выход
          </button>
        </div>
      </div>
    </header>
  );
}
