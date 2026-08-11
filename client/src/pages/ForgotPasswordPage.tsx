import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import Icon from '../components/Icon';
import logoUrl from '../assets/logo.svg';
import { PAGE_GRADIENT, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, TRACK_WIDE } from '../utils/theme';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  };

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
          {sent ? (
            <div className="text-center space-y-4 mt-4">
              <p className="font-geist text-sm" style={{ color: 'rgba(197, 198, 199,0.75)' }}>
                Если такой email зарегистрирован — на него (или в Telegram, если он привязан) отправлена ссылка для сброса пароля. Ссылка действует 30 минут.
              </p>
              <button onClick={() => navigate('/')} className="font-geist text-sm hover:underline cursor-pointer" style={{ color: ACCENT }}><Icon name="chevronLeft" size={22} color="currentColor" /> Ко входу</button>
            </div>
          ) : (
            <>
              <p className="font-geist text-sm text-center mb-6" style={{ color: TEXT_MUTED }}>Введите почту, на которую зарегистрирован аккаунт</p>
              <form onSubmit={submit} className="space-y-4">
                {error && (
                  <div className="px-4 py-3 rounded-lg text-sm font-geist" style={{ background: 'rgba(224,82,82,0.1)', color: '#e05252' }}>
                    {error}
                  </div>
                )}
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="pixel-input"
                  placeholder="Email"
                  aria-label="Email"
                  disabled={loading}
                  required
                />
                <button type="submit" disabled={loading} className="btn-primary w-full mt-2 disabled:opacity-50" style={{ padding: '12px', fontSize: '14px' }}>
                  {loading ? '...' : 'ОТПРАВИТЬ ССЫЛКУ'}
                </button>
                <div className="text-center pt-2">
                  <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>Вспомнили пароль?</p>
                  <button type="button" onClick={() => navigate('/')} className="font-geist text-sm cursor-pointer hover:underline" style={{ color: ACCENT }}>
                    Войти
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
