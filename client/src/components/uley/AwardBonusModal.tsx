import { useState } from 'react';
import { leadApi } from '../../api';
import { useEscapeKey } from '../../utils/a11y';
import { MAX_BONUS_AMOUNT } from './constants';
import Modal from '../Modal';
import { TEXT_MUTED } from '../../utils/theme';

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
    <Modal title={<span className="break-words min-w-0">Премия · {member.name}</span>} onClose={onClose} maxWidth={384}>
      <div className="space-y-4">
        <div>
          <label className="block font-geist text-xs mb-2" style={{ color: TEXT_MUTED }}>
            Сколько премиальных баллов начислить? (макс. {MAX_BONUS_AMOUNT})
          </label>
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
          <label className="block font-geist text-xs mb-2" style={{ color: TEXT_MUTED }}>За что премия?</label>
          <input
            className="pixel-input"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Например: отличная неделя"
          />
        </div>

        {error && <p className="font-geist text-xs break-words" style={{ color: '#e05252' }}>{error}</p>}

        <button onClick={submit} disabled={saving} className="btn-primary w-full py-3 text-sm disabled:opacity-50">
          {saving ? '...' : 'Начислить'}
        </button>
      </div>
    </Modal>
  );
}
