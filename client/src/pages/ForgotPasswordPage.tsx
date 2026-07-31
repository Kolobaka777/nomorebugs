import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';

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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0f0f1a' }}>
      <div className="w-full max-w-md relative z-10 fade-in">
        <div className="text-center mb-8">
          <h1 className="font-pixel text-primary mb-4" style={{ fontSize: '1.2rem', lineHeight: 1.8 }}>baga-net</h1>
        </div>
        <div
          className="p-8 rounded"
          style={{ background: '#1a1a2e', boxShadow: '4px 0 0 0 #1D9E75, -4px 0 0 0 #1D9E75, 0 4px 0 0 #1D9E75, 0 -4px 0 0 #1D9E75' }}
        >
          <h2 className="font-pixel text-pixel mb-6 text-center" style={{ fontSize: '0.65rem', lineHeight: 1.8 }}>
            ВОССТАНОВЛЕНИЕ ПАРОЛЯ
          </h2>
          {sent ? (
            <div className="text-center space-y-4">
              <p className="text-pixel/70 text-sm font-sans">
                Если такой email зарегистрирован — на него (или в Telegram, если он привязан) отправлена ссылка для сброса пароля. Ссылка действует 30 минут.
              </p>
              <button onClick={() => navigate('/')} className="text-primary font-sans text-sm hover:underline">← Ко входу</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-pixel/60 text-xs font-sans">Укажи email, которым регистрировался — пришлём ссылку для сброса пароля.</p>
              {error && (
                <div className="px-4 py-3 rounded text-sm font-sans" style={{ background: 'rgba(224,82,82,0.1)', color: '#e05252' }}>
                  {error}
                </div>
              )}
              <div>
                <label className="block mb-2 text-pixel/60 text-xs font-sans font-medium">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="pixel-input"
                  placeholder="your@email.com"
                  disabled={loading}
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full mt-2 disabled:opacity-50" style={{ padding: '12px', fontSize: '14px' }}>
                {loading ? '...' : 'Отправить ссылку'}
              </button>
              <button type="button" onClick={() => navigate('/')} className="w-full text-center text-pixel/60 text-xs font-sans cursor-pointer hover:text-pixel/80">
                ← Ко входу
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
