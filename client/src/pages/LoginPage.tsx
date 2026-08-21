import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import FrogIcon from '../components/FrogIcon';
import Icon from '../components/Icon';
import TelegramLoginButton from '../components/TelegramLoginButton';
import { ERROR } from '../utils/theme';
import { apiErrorMessage } from '../utils/toast';

interface LoginPageProps {
  onLogin: (token: string, user: any, needsBaselineSurvey: boolean, mustChangePassword?: boolean) => void;
  sessionExpired?: boolean;
}

export default function LoginPage({ onLogin, sessionExpired }: LoginPageProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await authApi.login(email, password, remember);
      onLogin(data.token, data.user, data.needsBaselineSurvey, data.mustChangePassword);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Ошибка входа'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0B0C10' }}
    >
      {/* Background grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-5"
        style={{
          backgroundImage: 'linear-gradient(#66FCF1 1px, transparent 1px), linear-gradient(90deg, #66FCF1 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Decorative frogs */}
      <div className="fixed top-8 left-8 opacity-20">
        <FrogIcon size={40} color="#66FCF1" />
      </div>
      <div className="fixed bottom-8 right-8 opacity-20">
        <FrogIcon size={56} color="#EF9F27" />
      </div>
      <div className="fixed top-1/3 right-12 opacity-10">
        <FrogIcon size={28} color="#66FCF1" />
      </div>

      <div className="w-full max-w-md relative z-10 fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1
            className="font-pixel text-primary mb-4"
            style={{ fontSize: '1.5rem', lineHeight: 1.8, textShadow: '4px 4px 0 rgba(102, 252, 241,0.3)' }}
          >
            baga-net
          </h1>
          <p className="text-pixel/60 text-sm font-sans italic">
            "come in as a tadpole. leave as a feature."
          </p>
        </div>

        {/* Card */}
        <div
          className="p-8 rounded-lg"
          style={{
            background: '#1F2833',
            border: '1px solid #66FCF1',
            boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)',
          }}
        >
          <h2
            className="font-pixel text-pixel mb-6 text-center"
            style={{ fontSize: '0.65rem', lineHeight: 1.8 }}
          >
            ВХОД В БОЛОТО
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {sessionExpired && !error && (
              <div
                className="px-4 py-3 rounded-lg text-sm font-sans"
                style={{
                  background: 'rgba(239,159,39,0.1)',
                  color: '#EF9F27',
                  border: '1px solid #EF9F27',
                  boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)',
                }}
              >
                Сессия истекла. Войди ещё раз.
              </div>
            )}
            {error && (
              <div
                className="px-4 py-3 rounded-lg text-sm font-sans break-words"
                style={{
                  background: 'rgba(224,82,82,0.1)',
                  color: ERROR,
                  border: `1px solid ${ERROR}`,
                  boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)',
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
                className="mt-2 text-xs font-sans link-muted"
              >
                Забыли пароль?
              </button>
            </div>

            {/* Per the kit. Unchecked, the browser keeps the session only
                until it closes — the server-side token is unchanged either
                way, this is about the copy the browser holds. */}
            <div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                  disabled={loading}
                  className="sr-only"
                  aria-label="Запомнить меня"
                />
                <span
                  aria-hidden="true"
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 16, height: 16, borderRadius: 2,
                    background: remember ? 'transparent' : '#0B0C10',
                    border: `2px solid ${remember ? '#66FCF1' : 'rgba(197, 198, 199, 0.35)'}`,
                  }}
                >
                  {remember && <Icon name="check" size={11} color="#66FCF1" />}
                </span>
                <span className="text-xs font-sans" style={{ color: remember ? '#66FCF1' : 'rgba(197, 198, 199, 0.6)' }}>
                  Запомнить меня
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-6 disabled:opacity-50"
              style={{ padding: '12px', fontSize: '14px' }}
            >
              {loading ? (
                <span className="pixel-pulse flex items-center justify-center gap-1"><Icon name="frog" size={13} color="currentColor" /> скачем...</span>
              ) : (
                'ВОЙТИ'
              )}
            </button>
          </form>

          <button
            onClick={() => navigate('/register')}
            className="w-full text-center mt-4 text-xs font-sans link-muted"
          >
            Нет аккаунта? Зарегистрироваться <Icon name="arrowRight" size={16} color="currentColor" />
          </button>

          <TelegramLoginButton onLogin={onLogin} />

          {/* Creds hint — dev-only. Vite strips this block (and the strings
              in it) out of the production bundle entirely, so demo
              passwords never ship to a real login screen. */}
          {import.meta.env.DEV && (
            <div
              className="mt-6 p-3 rounded-lg"
              style={{
                background: 'rgba(102, 252, 241,0.05)',
                border: '1px solid rgba(102, 252, 241,0.2)',
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
