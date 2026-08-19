import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api';
import Icon from '../components/Icon';
import logoUrl from '../assets/logo.svg';
import { PAGE_GRADIENT, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, TRACK_WIDE, ERROR } from '../utils/theme';
import { apiErrorMessage } from '../utils/toast';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) { setError('Пароль должен быть не короче 8 символов'); return; }
    if (newPassword !== confirmPassword) { setError('Пароли не совпадают'); return; }
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

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center" style={{ background: PAGE_GRADIENT }}>
        <p style={{ fontSize: 40 }} className="mb-4">😕</p>
        <h1 className="font-montserrat font-bold mb-2" style={{ fontSize: 22, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>Опс...</h1>
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: PAGE_GRADIENT }}>
      <div className="w-full max-w-md relative z-10 fade-in">
        <div className="text-center mb-8">
          <img src={logoUrl} alt="baganet" style={{ height: 40, width: 'auto', margin: '0 auto' }} />
        </div>
        <div className="p-8 rounded-lg" style={{ background: CARD_BG, boxShadow: '0 6px 12px 0 rgba(0, 0, 0, 0.25)' }}>
          <h2 className="font-montserrat font-bold mb-2 text-center" style={{ fontSize: 20, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
            Восстановление доступа
          </h2>
          {done ? (
            <div className="text-center space-y-4 mt-4">
              <p className="font-geist text-sm" style={{ color: 'rgba(197, 198, 199,0.75)' }}>Пароль изменён. Теперь можно войти с новым паролем.</p>
              <button onClick={() => navigate('/')} className="font-geist text-sm hover:underline cursor-pointer" style={{ color: ACCENT }}>Ко входу <Icon name="chevronRight" size={22} color="currentColor" /></button>
            </div>
          ) : (
            <>
              <p className="font-geist text-sm text-center mb-6" style={{ color: TEXT_MUTED }}>Придумайте новый пароль</p>
              <form onSubmit={submit} className="space-y-4">
                {error && (
                  <div className="px-4 py-3 rounded-lg text-sm font-geist break-words" style={{ background: 'rgba(224,82,82,0.1)', color: ERROR }}>
                    {error}
                  </div>
                )}
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="pixel-input" placeholder="Новый пароль" aria-label="Новый пароль" disabled={loading} required minLength={8} />
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="pixel-input" placeholder="Повтори пароль" aria-label="Повтори пароль" disabled={loading} required minLength={8} />
                <button type="submit" disabled={loading} className="btn-primary w-full mt-2 disabled:opacity-50" style={{ padding: '12px', fontSize: '14px' }}>
                  {loading ? '...' : 'СМЕНИТЬ ПАРОЛЬ'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
