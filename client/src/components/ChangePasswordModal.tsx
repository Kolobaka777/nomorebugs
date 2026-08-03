import { useState } from 'react';
import { authApi } from '../api';
import { setAccessToken } from '../auth';

interface Props {
  forced?: boolean;
  onDone: () => void;
  onClose?: () => void;
}

export default function ChangePasswordModal({ forced, onDone, onClose }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Новый пароль должен быть не короче 8 символов');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    setSaving(true);
    try {
      const res = await authApi.changePassword(currentPassword, newPassword);
      // The server revokes every refresh token on a password change,
      // including this tab's own — without adopting the fresh one it hands
      // back, this tab kept "working" only until the 15-min access token
      // expired, then got silently logged out with no explanation.
      if (res.data?.token) setAccessToken(res.data.token);
      onDone();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось изменить пароль');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', zIndex: 300 }}
      onClick={() => !forced && onClose?.()}
    >
      <div
        className="rounded-lg p-6 w-full max-w-sm"
        style={{ background: '#1a1a2e', border: '2px solid #1D9E75' }}
        onClick={e => e.stopPropagation()}
      >
        <p className="font-pixel text-primary mb-1" style={{ fontSize: '0.65rem', lineHeight: 1.8 }}>
          {forced ? 'Нужно сменить пароль' : 'Смена пароля'}
        </p>
        {forced && (
          <p className="text-pixel/60 text-xs font-sans mb-4">
            Твой пароль был сброшен администратором — задай новый, чтобы продолжить.
          </p>
        )}
        <form onSubmit={submit} className="space-y-3 mt-4">
          <div>
            <label className="text-pixel/60 text-xs font-sans block mb-1">Текущий пароль</label>
            <input
              type="password"
              className="pixel-input w-full text-sm"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="text-pixel/60 text-xs font-sans block mb-1">Новый пароль (мин. 8 символов)</label>
            <input
              type="password"
              className="pixel-input w-full text-sm"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="text-pixel/60 text-xs font-sans block mb-1">Повтори новый пароль</label>
            <input
              type="password"
              className="pixel-input w-full text-sm"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          {error && <p className="text-xs font-sans" style={{ color: '#e05252' }}>{error}</p>}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded font-sans font-bold text-sm"
              style={{ background: '#1D9E75', color: '#0f0f1a' }}
            >
              {saving ? '...' : 'Сохранить'}
            </button>
            {!forced && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded font-sans text-sm"
                style={{ background: 'rgba(232,232,208,0.07)', color: 'rgba(232,232,208,0.7)' }}
              >
                Отмена
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
