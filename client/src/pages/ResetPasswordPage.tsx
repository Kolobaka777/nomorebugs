import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api';
import Icon from '../components/Icon';
import AuthShell, { AUTH_BTN, AUTH_FIELD, AUTH_FIELD_BAD, AuthLink, FieldWarning } from '../components/AuthShell';
import { ACCENT, BADGE_NOTIFY, PAGE_GRADIENT, TEXT_MUTED, TEXT_PRIMARY, H2 } from '../utils/theme';
import { apiErrorMessage } from '../utils/toast';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBad, setPwBad] = useState('');
  const [confirmBad, setConfirmBad] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Both rules are answered beside the field they are about, rather than
    // as one line above a form with two password boxes in it.
    const badPw = newPassword.length < 8 ? 'Пароль должен быть не короче 8 символов' : '';
    const badConfirm = !badPw && newPassword !== confirmPassword ? 'Пароли не совпадают' : '';
    setPwBad(badPw);
    setConfirmBad(badConfirm);
    if (badPw || badConfirm) return;

    setError('');
    setLoading(true);
    try {
      await authApi.resetPassword(token, newPassword);
      setDone(true);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Ссылка недействительна или устарела'));
    } finally {
      setLoading(false);
    }
  };

  // Not the recovery card at all: there is nothing to fill in, so this says
  // what happened and offers the one action that helps.
  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center" style={{ background: PAGE_GRADIENT }}>
        <Icon name="warning" size={40} color={BADGE_NOTIFY} className="mb-4" />
        <h1 className="font-montserrat mb-2" style={{ ...H2 }}>Опс...</h1>
        <p className="font-montserrat font-semibold mb-3" style={{ fontSize: 15, color: TEXT_PRIMARY }}>Ссылка недействительна</p>
        <p className="font-geist text-sm max-w-sm mb-6" style={{ color: TEXT_MUTED }}>
          Возможно, истекла сессия, либо исчерпан лимит использований, попробуйте ещё раз
        </p>
        <button onClick={() => navigate('/forgot-password')} className="font-geist text-sm hover:underline cursor-pointer" style={{ color: ACCENT }}>
          <Icon name="chevronLeft" size={22} color="currentColor" /> Запросить новую ссылку
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <AuthShell
        title="Восстановление доступа"
        subtitle="Пароль изменён"
        footer={<AuthLink to="/">Войти</AuthLink>}
      >
        <p className="font-geist text-center" style={{ fontSize: 14, color: 'rgba(197, 198, 199,0.75)', lineHeight: 1.6 }}>
          Теперь можно войти с новым паролем.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Восстановление доступа"
      subtitle="Придумайте новый пароль"
      footer={
        <>
          <p className="font-geist text-center" style={{ fontSize: 14, color: TEXT_MUTED }}>Вспомнили пароль?</p>
          <AuthLink to="/">Войти</AuthLink>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-2">
        <div style={{ position: 'relative' }}>
          <input
            type="password"
            value={newPassword}
            onChange={e => { setNewPassword(e.target.value); if (pwBad) setPwBad(''); }}
            style={pwBad ? AUTH_FIELD_BAD : AUTH_FIELD}
            placeholder="Password"
            aria-label="Новый пароль"
            aria-invalid={!!pwBad}
            disabled={loading}
          />
          {pwBad && <FieldWarning message={pwBad} />}
        </div>

        <div style={{ position: 'relative' }}>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => { setConfirmPassword(e.target.value); if (confirmBad) setConfirmBad(''); }}
            style={confirmBad ? AUTH_FIELD_BAD : AUTH_FIELD}
            placeholder="Repeat Password"
            aria-label="Повтори пароль"
            aria-invalid={!!confirmBad}
            disabled={loading}
          />
          {confirmBad && <FieldWarning message={confirmBad} />}
        </div>

        {error && (
          <p role="alert" className="font-geist break-words" style={{ fontSize: 14, color: BADGE_NOTIFY }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ ...AUTH_BTN, marginTop: 26, opacity: loading ? 0.6 : 1 }}
          className="transition-all hover:brightness-110"
        >
          {loading ? 'Меняем...' : 'Сменить пароль'}
        </button>
      </form>
    </AuthShell>
  );
}
