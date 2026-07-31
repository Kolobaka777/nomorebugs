import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api';

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
      setError(err.response?.data?.error || 'Ссылка недействительна или устарела');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0f0f1a' }}>
        <p className="text-pixel/60 text-sm font-sans">Ссылка недействительна — токен не найден.</p>
      </div>
    );
  }

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
            НОВЫЙ ПАРОЛЬ
          </h2>
          {done ? (
            <div className="text-center space-y-4">
              <p className="text-pixel/70 text-sm font-sans">Пароль изменён. Теперь можно войти с новым паролем.</p>
              <button onClick={() => navigate('/')} className="text-primary font-sans text-sm hover:underline">Ко входу →</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && (
                <div className="px-4 py-3 rounded text-sm font-sans" style={{ background: 'rgba(224,82,82,0.1)', color: '#e05252' }}>
                  {error}
                </div>
              )}
              <div>
                <label className="block mb-2 text-pixel/60 text-xs font-sans font-medium">Новый пароль</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="pixel-input" disabled={loading} required minLength={8} />
              </div>
              <div>
                <label className="block mb-2 text-pixel/60 text-xs font-sans font-medium">Повтори пароль</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="pixel-input" disabled={loading} required minLength={8} />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full mt-2 disabled:opacity-50" style={{ padding: '12px', fontSize: '14px' }}>
                {loading ? '...' : 'Сохранить новый пароль'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
