import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import BugSprite from '../components/BugSprite';
import PixelIcon from '../components/PixelIcon';
import TelegramLoginButton from '../components/TelegramLoginButton';

interface LoginPageProps {
  onLogin: (token: string, refreshToken: string, user: any, needsBaselineSurvey: boolean, mustChangePassword?: boolean) => void;
  sessionExpired?: boolean;
}

export default function LoginPage({ onLogin, sessionExpired }: LoginPageProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await authApi.login(email, password);
      onLogin(data.token, data.refreshToken, data.user, data.needsBaselineSurvey, data.mustChangePassword);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0f0f1a' }}
    >
      {/* Background grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-5"
        style={{
          backgroundImage: 'linear-gradient(#1D9E75 1px, transparent 1px), linear-gradient(90deg, #1D9E75 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Decorative bugs */}
      <div className="fixed top-8 left-8 opacity-20">
        <BugSprite size={48} color="teal" />
      </div>
      <div className="fixed bottom-8 right-8 opacity-20">
        <BugSprite size={64} color="amber" />
      </div>
      <div className="fixed top-1/3 right-12 opacity-10">
        <BugSprite size={32} color="teal" />
      </div>

      <div className="w-full max-w-md relative z-10 fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1
            className="font-pixel text-primary mb-4"
            style={{ fontSize: '1.5rem', lineHeight: 1.8, textShadow: '4px 4px 0 rgba(29,158,117,0.3)' }}
          >
            baga-net
          </h1>
          <p className="text-pixel/60 text-sm font-sans italic">
            "come in as a bug. leave as a feature."
          </p>
        </div>

        {/* Card */}
        <div
          className="p-8 rounded"
          style={{
            background: '#1a1a2e',
            boxShadow: '4px 0 0 0 #1D9E75, -4px 0 0 0 #1D9E75, 0 4px 0 0 #1D9E75, 0 -4px 0 0 #1D9E75',
          }}
        >
          <h2
            className="font-pixel text-pixel mb-6 text-center"
            style={{ fontSize: '0.65rem', lineHeight: 1.8 }}
          >
            ВХОД В НОРУ
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {sessionExpired && !error && (
              <div
                className="px-4 py-3 rounded text-sm font-sans"
                style={{
                  background: 'rgba(239,159,39,0.1)',
                  color: '#EF9F27',
                  boxShadow: '1px 0 0 0 #EF9F27, -1px 0 0 0 #EF9F27, 0 1px 0 0 #EF9F27, 0 -1px 0 0 #EF9F27',
                }}
              >
                Сессия истекла. Войди ещё раз.
              </div>
            )}
            {error && (
              <div
                className="px-4 py-3 rounded text-sm font-sans"
                style={{
                  background: 'rgba(224,82,82,0.1)',
                  color: '#e05252',
                  boxShadow: '1px 0 0 0 #e05252, -1px 0 0 0 #e05252, 0 1px 0 0 #e05252, 0 -1px 0 0 #e05252',
                }}
              >
                {error}
              </div>
            )}

            <div>
              <label className="block mb-2 text-pixel/60 text-xs font-sans font-medium">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pixel-input"
                placeholder="your@email.com"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block mb-2 text-pixel/60 text-xs font-sans font-medium">
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pixel-input"
                placeholder="••••••"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="mt-2 text-pixel/50 text-xs font-sans cursor-pointer hover:text-pixel/70"
              >
                Забыли пароль?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-6 disabled:opacity-50"
              style={{ padding: '12px', fontSize: '14px' }}
            >
              {loading ? (
                <span className="pixel-pulse flex items-center justify-center gap-1"><PixelIcon name="snail" size={13} color="currentColor" /> ползём...</span>
              ) : (
                'ВОЙТИ'
              )}
            </button>
          </form>

          <button
            onClick={() => navigate('/register')}
            className="w-full text-center mt-4 text-pixel/60 text-xs font-sans cursor-pointer hover:text-pixel/80"
          >
            Нет аккаунта? Зарегистрироваться →
          </button>

          <TelegramLoginButton onLogin={onLogin} />

          {/* Creds hint — dev-only. Vite strips this block (and the strings
              in it) out of the production bundle entirely, so demo
              passwords never ship to a real login screen. */}
          {import.meta.env.DEV && (
            <div
              className="mt-6 p-3 rounded"
              style={{
                background: 'rgba(29,158,117,0.05)',
                border: '1px solid rgba(29,158,117,0.2)',
              }}
            >
              <p className="text-pixel/60 text-xs font-sans mb-1 font-semibold">Тестовые аккаунты (dev):</p>
              <p className="text-pixel/60 text-xs font-sans">Admin: admin@qa.com / admin123</p>
              <p className="text-pixel/60 text-xs font-sans">Lead: lead@qa.com / lead123</p>
              <p className="text-pixel/60 text-xs font-sans">Tester: nazar@qa.com / test123</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-pixel/55 text-xs font-pixel mt-6" style={{ lineHeight: 1.8 }}>
          de[bug] starts here
        </p>
      </div>
    </div>
  );
}
