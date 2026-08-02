import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import BugSprite from '../components/BugSprite';
import PixelIcon from '../components/PixelIcon';
import TelegramLoginButton from '../components/TelegramLoginButton';

interface RegisterPageProps {
  onLogin: (token: string, refreshToken: string, user: any, needsBaselineSurvey: boolean) => void;
}

export default function RegisterPage({ onLogin }: RegisterPageProps) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    if (password.length < 8) {
      setError('Пароль должен быть не короче 8 символов');
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.register(email, password, name, gender);
      onLogin(data.token, data.refreshToken, data.user, data.needsBaselineSurvey);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0f0f1a' }}
    >
      <div
        className="fixed inset-0 pointer-events-none opacity-5"
        style={{
          backgroundImage: 'linear-gradient(#1D9E75 1px, transparent 1px), linear-gradient(90deg, #1D9E75 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="fixed top-8 left-8 opacity-20">
        <BugSprite size={48} color="teal" />
      </div>
      <div className="fixed bottom-8 right-8 opacity-20">
        <BugSprite size={64} color="amber" />
      </div>

      <div className="w-full max-w-md relative z-10 fade-in">
        <div className="text-center mb-8">
          <h1
            className="font-pixel text-primary mb-4"
            style={{ fontSize: '1.5rem', lineHeight: 1.8, textShadow: '4px 4px 0 rgba(29,158,117,0.3)' }}
          >
            baga-net
          </h1>
          <p className="text-pixel/60 text-sm font-sans italic">
            новый жук в норе
          </p>
        </div>

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
            РЕГИСТРАЦИЯ
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                Имя
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pixel-input"
                placeholder="Как к тебе обращаться"
                disabled={loading}
                maxLength={60}
              />
            </div>

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
                placeholder="Не короче 8 символов"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block mb-2 text-pixel/60 text-xs font-sans font-medium">
                Повтори пароль
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pixel-input"
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block mb-2 text-pixel/60 text-xs font-sans font-medium">
                Пол
              </label>
              <div className="flex gap-2">
                {([
                  { value: 'male' as const, label: 'Мужской' },
                  { value: 'female' as const, label: 'Женский' },
                  { value: null, label: 'Не указывать' },
                ]).map(opt => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setGender(opt.value)}
                    disabled={loading}
                    className="flex-1 py-2 rounded text-xs font-sans cursor-pointer transition-colors"
                    style={{
                      background: gender === opt.value ? 'rgba(29,158,117,0.15)' : 'rgba(232,232,208,0.04)',
                      color: gender === opt.value ? '#1D9E75' : 'rgba(232,232,208,0.5)',
                      boxShadow: gender === opt.value
                        ? '1px 0 0 0 #1D9E75,-1px 0 0 0 #1D9E75,0 1px 0 0 #1D9E75,0 -1px 0 0 #1D9E75'
                        : 'none',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
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
                'ЗАРЕГИСТРИРОВАТЬСЯ'
              )}
            </button>
          </form>

          <button
            onClick={() => navigate('/')}
            className="w-full text-center mt-4 text-pixel/60 text-xs font-sans cursor-pointer hover:text-pixel/80"
          >
            Уже есть аккаунт? Войти →
          </button>

          <TelegramLoginButton onLogin={onLogin} />
        </div>

        <p className="text-center text-pixel/55 text-xs font-pixel mt-6" style={{ lineHeight: 1.8 }}>
          de[bug] starts here
        </p>
      </div>
    </div>
  );
}
