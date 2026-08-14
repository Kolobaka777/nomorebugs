import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import FrogIcon from '../components/FrogIcon';
import Icon from '../components/Icon';
import TelegramLoginButton from '../components/TelegramLoginButton';

interface RegisterPageProps {
  onLogin: (token: string, user: any, needsBaselineSurvey: boolean) => void;
}

export default function RegisterPage({ onLogin }: RegisterPageProps) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  // Set once, here, at registration — there's no editable birthday field
  // anywhere else in the app afterward (see MoyaNora.tsx/presence.js).
  const [birthday, setBirthday] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const BIRTHDAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

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
    if (birthday && !BIRTHDAY_RE.test(birthday)) {
      setError('Дата рождения — в формате ММ-ДД, например 08-15');
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.register(email, password, name, gender, birthday || null);
      onLogin(data.token, data.user, data.needsBaselineSurvey);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0B0C10' }}
    >
      <div
        className="fixed inset-0 pointer-events-none opacity-5"
        style={{
          backgroundImage: 'linear-gradient(#66FCF1 1px, transparent 1px), linear-gradient(90deg, #66FCF1 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="fixed top-8 left-8 opacity-20">
        <FrogIcon size={40} color="#66FCF1" />
      </div>
      <div className="fixed bottom-8 right-8 opacity-20">
        <FrogIcon size={56} color="#EF9F27" />
      </div>

      <div className="w-full max-w-md relative z-10 fade-in">
        <div className="text-center mb-8">
          <h1
            className="font-pixel text-primary mb-4"
            style={{ fontSize: '1.5rem', lineHeight: 1.8, textShadow: '4px 4px 0 rgba(102, 252, 241,0.3)' }}
          >
            baga-net
          </h1>
          <p className="text-pixel/60 text-sm font-sans italic">
            новая лягушка в болоте
          </p>
        </div>

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
            РЕГИСТРАЦИЯ
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                className="px-4 py-3 rounded-lg text-sm font-sans break-words"
                style={{
                  background: 'rgba(224,82,82,0.1)',
                  color: '#e05252',
                  border: '1px solid #e05252',
                  boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)',
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
                    className="flex-1 py-2 rounded-lg text-xs font-sans cursor-pointer transition-colors"
                    style={{
                      background: gender === opt.value ? 'rgba(102, 252, 241,0.15)' : 'rgba(197, 198, 199,0.04)',
                      color: gender === opt.value ? '#66FCF1' : 'rgba(197, 198, 199,0.5)',
                      border: gender === opt.value ? '1px solid #66FCF1' : 'none',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block mb-2 text-pixel/60 text-xs font-sans font-medium">
                День рождения (необязательно)
              </label>
              <input
                type="text"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="pixel-input"
                placeholder="ММ-ДД, например 08-15"
                disabled={loading}
                maxLength={5}
              />
              <p className="text-pixel/40 text-xs font-sans mt-1.5">
                Указывается один раз — потом её не получится изменить самостоятельно
              </p>
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
                'ЗАРЕГИСТРИРОВАТЬСЯ'
              )}
            </button>
          </form>

          <button
            onClick={() => navigate('/')}
            className="w-full text-center mt-4 text-pixel/60 text-xs font-sans cursor-pointer hover:text-pixel/80"
          >
            Уже есть аккаунт? Войти <Icon name="arrowRight" size={16} color="currentColor" />
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
