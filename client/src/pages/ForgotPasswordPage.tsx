import { useState } from 'react';
import { authApi } from '../api';
import AuthShell, { AUTH_BTN, AUTH_FIELD, AUTH_FIELD_BAD, AuthLink, FieldWarning } from '../components/AuthShell';
import { BADGE_NOTIFY, TEXT_MUTED } from '../utils/theme';
import { apiErrorMessage } from '../utils/toast';

const LOOKS_LIKE_EMAIL = /^\S+@\S+\.\S+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailBad, setEmailBad] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bad = !email.trim() ? 'Введите email' : !LOOKS_LIKE_EMAIL.test(email.trim()) ? 'Некорректный email' : '';
    setEmailBad(bad);
    if (bad) return;
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Ошибка. Попробуйте позже.'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Восстановление доступа"
        subtitle="Проверьте почту"
        footer={<AuthLink to="/">Войти</AuthLink>}
      >
        <p className="font-geist text-center" style={{ fontSize: 14, color: 'rgba(197, 198, 199,0.75)', lineHeight: 1.6 }}>
          Если такой email зарегистрирован — на него (или в Telegram, если он привязан) отправлена
          ссылка для сброса пароля. Ссылка действует 30 минут.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Восстановление доступа"
      subtitle="Введите почту, на которую зарегистрирован аккаунт"
      footer={
        <>
          <p className="font-geist text-center" style={{ fontSize: 14, color: TEXT_MUTED }}>Вспомнили пароль?</p>
          <AuthLink to="/">Войти</AuthLink>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
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

        {error && (
          <p role="alert" className="font-geist break-words" style={{ fontSize: 14, color: BADGE_NOTIFY }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ ...AUTH_BTN, marginTop: 12, opacity: loading ? 0.6 : 1 }}
          className="transition-all hover:brightness-110"
        >
          {loading ? 'Отправляем...' : 'Отправить ссылку'}
        </button>
      </form>
    </AuthShell>
  );
}
