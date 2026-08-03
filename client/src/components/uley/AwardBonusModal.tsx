import { useState } from 'react';
import { leadApi } from '../../api';
import { useEscapeKey } from '../../utils/a11y';
import { MAX_BONUS_AMOUNT } from './constants';

export default function AwardBonusModal({
  member,
  onClose,
  onAwarded,
}: {
  member: { id: number; name: string };
  onClose: () => void;
  onAwarded: (amount: number) => void;
}) {
  useEscapeKey(onClose);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const amt = parseInt(amount, 10);
    if (!Number.isInteger(amt) || amt <= 0 || amt > MAX_BONUS_AMOUNT) {
      setError(`Сумма должна быть от 1 до ${MAX_BONUS_AMOUNT}`);
      return;
    }
    if (!reason.trim()) {
      setError('Укажите причину премии');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await leadApi.awardBonus({ user_id: member.id, amount: amt, reason: reason.trim() });
      onAwarded(amt);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось начислить премию');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded p-6" style={{ background: '#1a1a2e', border: '2px solid rgba(29,158,117,0.4)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <p className="font-pixel text-primary" style={{ fontSize: '0.6rem', lineHeight: 1.8 }}>🏆 Премия · {member.name}</p>
          <button onClick={onClose} aria-label="Закрыть" className="text-pixel/60 cursor-pointer hover:text-pixel/80">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-pixel/60 text-xs font-sans mb-2">Сколько премиальных баллов начислить? (макс. {MAX_BONUS_AMOUNT})</label>
            <input
              className="pixel-input"
              type="number"
              min={1}
              max={MAX_BONUS_AMOUNT}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Например: 50"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-pixel/60 text-xs font-sans mb-2">За что премия?</label>
            <input
              className="pixel-input"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Например: отличная неделя"
            />
          </div>

          {error && <p className="text-xs font-sans" style={{ color: '#e05252' }}>{error}</p>}

          <button
            onClick={submit}
            disabled={saving}
            className="w-full py-3 text-sm font-sans font-semibold rounded cursor-pointer disabled:opacity-50"
            style={{ background: '#1D9E75', color: '#0f0f1a' }}
          >
            {saving ? '...' : 'Начислить'}
          </button>
        </div>
      </div>
    </div>
  );
}
