import { useState } from 'react';
import { authApi } from '../api';
import TelegramLoginButton from '../components/TelegramLoginButton';
import AuthShell, { AUTH_BTN, AUTH_FIELD, AuthLink } from '../components/AuthShell';
import { ACCENT, BADGE_NOTIFY, PAGE_BG, TEXT_MUTED } from '../utils/theme';
import { apiErrorMessage } from '../utils/toast';
import FieldError from '../components/FieldError';

interface RegisterPageProps {
  onLogin: (token: string, user: any, needsBaselineSurvey: boolean) => void;
}

export default function RegisterPage({ onLogin }: RegisterPageProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  // Set once, here, at registration — there is no editable birthday field
  // anywhere else in the app afterward (see MoyaNora.tsx/presence.js).
  const [birthday, setBirthday] = useState('');
  const [error, setError] = useState('');
  // Two different failures, told apart because the reader's next move
  // differs: a validation problem is theirs to fix, a server error is not.
  const [invalid, setInvalid] = useState<{ title: string; hint: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const BIRTHDAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInvalid(null);

    if (password !== confirmPassword) {
      setInvalid({ title: 'Пароли не совпадают', hint: 'Проверь оба поля — второй пароль должен повторять первый.' });
      return;
    }
    if (password.length < 8) {
      setInvalid({ title: 'Пароль слишком короткий', hint: 'Нужно не меньше 8 символов.' });
      return;
    }
    if (birthday && !BIRTHDAY_RE.test(birthday)) {
      setInvalid({ title: 'Неверная дата рождения', hint: 'Формат — ММ-ДД, например 08-15.' });
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.register(email, password, name, gender, birthday || null);
      onLogin(data.token, data.user, data.needsBaselineSurvey);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Ошибка регистрации'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Регистрация"
      subtitle="Зарегистрируйте аккаунт"
      footer={
        <>
          <p className="font-geist text-center" style={{ fontSize: 14, color: TEXT_MUTED }}>Уже есть аккаунт?</p>
          <AuthLink to="/">Войти</AuthLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        {invalid && <FieldError title={invalid.title} pointer="none">{invalid.hint}</FieldError>}
        {error && (
          <p role="alert" className="font-geist break-words" style={{ fontSize: 14, color: BADGE_NOTIFY }}>{error}</p>
        )}

        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          style={AUTH_FIELD}
          placeholder="Как к тебе обращаться"
          aria-label="Имя"
          disabled={loading}
        />
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={AUTH_FIELD}
          placeholder="your@email.com"
          aria-label="Email"
          disabled={loading}
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={AUTH_FIELD}
          placeholder="Не короче 8 символов"
          aria-label="Пароль"
          disabled={loading}
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          style={AUTH_FIELD}
          placeholder="••••••••"
          aria-label="Повтори пароль"
          disabled={loading}
        />

        {/* Not a public identity field — it decides verb endings in the
            activity feed and on the home page. "Не указывать" is a real
            option, not a placeholder. */}
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
              className="flex-1 cursor-pointer transition-colors"
              style={{
                ...AUTH_FIELD, padding: '12px 8px', textAlign: 'center', fontSize: 14,
                background: gender === opt.value ? `${ACCENT}1F` : PAGE_BG,
                color: gender === opt.value ? ACCENT : 'rgba(197, 198, 199,0.6)',
                borderColor: gender === opt.value ? ACCENT : `${ACCENT}55`,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div>
          <input
            type="text"
            value={birthday}
            onChange={e => setBirthday(e.target.value)}
            style={AUTH_FIELD}
            placeholder="День рождения — ММ-ДД, например 08-15"
            aria-label="День рождения"
            disabled={loading}
            maxLength={5}
          />
          <p className="font-geist" style={{ fontSize: 12, color: 'rgba(197, 198, 199,0.4)', marginTop: 6 }}>
            Указывается один раз — потом её не получится изменить самостоятельно
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ ...AUTH_BTN, marginTop: 26, opacity: loading ? 0.6 : 1 }}
          className="transition-all hover:brightness-110"
        >
          {loading ? 'Регистрируем...' : 'Регистрация'}
        </button>
      </form>

      <TelegramLoginButton onLogin={onLogin} />
    </AuthShell>
  );
}
