import { useState } from 'react';
import { authApi } from '../api';
import TelegramLoginButton from '../components/TelegramLoginButton';
import AuthShell, { AUTH_BTN, AUTH_FIELD, AUTH_FIELD_BAD, AuthLink, FieldWarning, RememberMe } from '../components/AuthShell';
import { BADGE_NOTIFY } from '../utils/theme';
import { apiErrorMessage } from '../utils/toast';

interface LoginPageProps {
  onLogin: (token: string, user: any, needsBaselineSurvey: boolean, mustChangePassword?: boolean) => void;
  sessionExpired?: boolean;
}

// Deliberately loose. This is here to catch a typo before the round trip, not
// to decide what an address may be — the server owns that, and a regex strict
// enough to be interesting rejects real addresses.
const LOOKS_LIKE_EMAIL = /^\S+@\S+\.\S+$/;

export default function LoginPage({ onLogin, sessionExpired }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailBad, setEmailBad] = useState('');
  const [passwordBad, setPasswordBad] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Checked here rather than left to the server so a typo is answered
    // beside the field that has it, instead of as one line above the form.
    const badEmail = !email.trim() ? 'Введите email' : !LOOKS_LIKE_EMAIL.test(email.trim()) ? 'Некорректный email' : '';
    const badPassword = password ? '' : 'Введите пароль';
    setEmailBad(badEmail);
    setPasswordBad(badPassword);
    if (badEmail || badPassword) return;

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
    <AuthShell
      title="Добро пожаловать"
      subtitle="Войдите в свой аккаунт"
      footer={
        <>
          <AuthLink to="/forgot-password">Забыли пароль?</AuthLink>
          <AuthLink to="/register">Зарегистрироваться</AuthLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        {sessionExpired && !error && (
          <p className="font-geist" style={{ fontSize: 14, color: BADGE_NOTIFY }}>
            Сессия истекла. Войди ещё раз.
          </p>
        )}

        <div style={{ position: 'relative' }}>
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); if (emailBad) setEmailBad(''); }}
            style={emailBad ? AUTH_FIELD_BAD : AUTH_FIELD}
            placeholder="Email"
            aria-label="Email"
            aria-invalid={!!emailBad}
            disabled={loading}
          />
          {emailBad && <FieldWarning message={emailBad} />}
        </div>

        <div style={{ position: 'relative' }}>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); if (passwordBad) setPasswordBad(''); }}
            style={passwordBad ? AUTH_FIELD_BAD : AUTH_FIELD}
            placeholder="Password"
            aria-label="Пароль"
            aria-invalid={!!passwordBad}
            disabled={loading}
          />
          {passwordBad && <FieldWarning message={passwordBad} />}
        </div>

        {/* Unchecked, the browser keeps the session only until it closes.
            The server-side token is the same either way — this is about the
            copy the browser holds. */}
        <div style={{ marginTop: 3 }}><RememberMe checked={remember} onChange={setRemember} disabled={loading} /></div>

        {/* Whatever the server said, in the same amber the fields use: it is
            an answer to this attempt, not a fault in the page. */}
        {error && (
          <p role="alert" className="font-geist break-words" style={{ fontSize: 14, color: BADGE_NOTIFY }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ ...AUTH_BTN, marginTop: 26, opacity: loading ? 0.6 : 1 }}
          className="transition-all hover:brightness-110"
        >
          {loading ? 'Входим...' : 'Войти'}
        </button>

        <TelegramLoginButton onLogin={onLogin} divider={false} />
      </form>

      {/* Dev-only. Vite strips this block and its strings out of the
          production bundle, so demo passwords never reach a real login. */}
      {import.meta.env.DEV && (
        <div className="mt-6 p-3 rounded-lg" style={{ background: 'rgba(102, 252, 241,0.05)', border: '1px solid rgba(102, 252, 241,0.2)' }}>
          <p className="font-geist mb-1 font-semibold" style={{ fontSize: 12, color: 'rgba(197, 198, 199,0.6)' }}>Тестовые аккаунты (dev):</p>
          <p className="font-geist" style={{ fontSize: 12, color: 'rgba(197, 198, 199,0.6)' }}>Admin: admin@qa.com / admin123</p>
          <p className="font-geist" style={{ fontSize: 12, color: 'rgba(197, 198, 199,0.6)' }}>Lead: lead@qa.com / lead123</p>
          <p className="font-geist" style={{ fontSize: 12, color: 'rgba(197, 198, 199,0.6)' }}>Tester: nazar@qa.com / test123</p>
        </div>
      )}
    </AuthShell>
  );
}
