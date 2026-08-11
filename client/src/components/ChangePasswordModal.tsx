import { useState } from 'react';
import { authApi } from '../api';
import { setAccessToken } from '../auth';
import Modal from './Modal';

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
    <Modal
      title={forced ? 'Нужно сменить пароль' : 'Смена пароля'}
      onClose={forced ? undefined : onClose}
      zIndex={300}
      maxWidth={384}
    >
      <>
        {forced && (
          <p className="text-pixel/60 text-xs font-sans mb-4">
            Твой пароль был сброшен администратором — задай новый, чтобы продолжить.
          </p>
        )}
        <form onSubmit={submit} className="space-y-3">
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
              className="flex-1 py-2 rounded-lg font-sans font-bold text-sm"
              style={{ background: '#66FCF1', color: '#0B0C10' }}
            >
              {saving ? '...' : 'Сохранить'}
            </button>
            {!forced && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg font-sans text-sm"
                style={{ background: 'rgba(197, 198, 199,0.07)', color: 'rgba(197, 198, 199,0.7)' }}
              >
                Отмена
              </button>
            )}
          </div>
        </form>
      </>
    </Modal>
  );
}
