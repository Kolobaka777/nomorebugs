import { useState } from 'react';
import { leadApi } from '../../api';
import { useEscapeKey } from '../../utils/a11y';
import { TIMEZONES, HOUR_OPTIONS } from '../../utils/timezones';
import { PresenceEntry, LeaveType } from '../../types';
import { WEEKDAY_LABELS, LEAVE_LABELS } from './constants';
import Modal from '../Modal';
import { ACCENT, TEXT_MUTED, BADGE_NOTIFY } from '../../utils/theme';

// Lets a lead configure a tester's working hours/status and schedule leave
// — powers both the "работают сейчас" dots below and the team news feed's
// vacation start/end items (see GET /api/team/news).
export default function PresenceEditModal({
  member,
  entry,
  onClose,
  onSaved,
}: {
  member: { id: number; name: string };
  entry: PresenceEntry | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  useEscapeKey(onClose);
  const [workStart, setWorkStart] = useState(entry?.workStart || '');
  const [workEnd, setWorkEnd] = useState(entry?.workEnd || '');
  const [days, setDays] = useState<Set<string>>(new Set((entry?.workDays || '1,2,3,4,5').split(',')));
  const [timezone, setTimezone] = useState(entry?.timezone || 'Europe/Moscow');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [leaveType, setLeaveType] = useState<LeaveType>('vacation');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveNote, setLeaveNote] = useState('');
  const [savingLeave, setSavingLeave] = useState(false);

  const toggleDay = (d: string) => setDays(prev => {
    const next = new Set(prev);
    if (next.has(d)) next.delete(d); else next.add(d);
    return next;
  });

  const saveHours = async () => {
    setSaving(true);
    setError('');
    try {
      await leadApi.updatePresence(member.id, {
        work_start: workStart || null,
        work_end: workEnd || null,
        work_days: Array.from(days).join(',') || '1,2,3,4,5',
        timezone,
      });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const addLeave = async () => {
    if (!leaveStart) { setError('Укажи дату начала'); return; }
    setSavingLeave(true);
    setError('');
    try {
      await leadApi.addLeave(member.id, { type: leaveType, start_date: leaveStart, end_date: leaveEnd || null, note: leaveNote });
      setLeaveStart(''); setLeaveEnd(''); setLeaveNote('');
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось добавить отсутствие');
    } finally {
      setSavingLeave(false);
    }
  };

  const cancelCurrentLeave = async () => {
    if (!entry?.currentLeave) return;
    setSavingLeave(true);
    try {
      await leadApi.removeLeave(member.id, entry.currentLeave.id);
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось отменить');
    } finally {
      setSavingLeave(false);
    }
  };

  return (
    <Modal title={`Рабочее время · ${member.name}`} onClose={onClose} maxWidth={384}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block font-geist mb-1" style={{ fontSize: 11, color: TEXT_MUTED }}>Начало</label>
            <select value={workStart} onChange={e => setWorkStart(e.target.value)} className="pixel-input">
              <option value="">—</option>
              {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-geist mb-1" style={{ fontSize: 11, color: TEXT_MUTED }}>Конец</label>
            <select value={workEnd} onChange={e => setWorkEnd(e.target.value)} className="pixel-input">
              <option value="">—</option>
              {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block font-geist mb-1" style={{ fontSize: 11, color: TEXT_MUTED }}>Рабочие дни</label>
          <div className="flex gap-1">
            {WEEKDAY_LABELS.map(([d, label]) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className="flex-1 py-1.5 rounded-lg text-xs font-geist cursor-pointer"
                style={{ background: days.has(d) ? `${ACCENT}20` : 'rgba(197, 198, 199, 0.04)', color: days.has(d) ? ACCENT : TEXT_MUTED }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Own full-width row — timezone labels ("Владивосток (UTC+10)")
            would clip sharing a half/quarter-width cell; mirrors the same
            fix in MoyaNora's equivalent working-hours form. */}
        <div>
          <label className="block font-geist mb-1" style={{ fontSize: 11, color: TEXT_MUTED }}>Часовой пояс</label>
          <select value={timezone} onChange={e => setTimezone(e.target.value)} className="pixel-input w-full">
            {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
          </select>
        </div>

        {error && <p className="font-geist text-xs" style={{ color: '#e05252' }}>{error}</p>}

        <button onClick={saveHours} disabled={saving} className="btn-primary w-full py-3 text-sm disabled:opacity-50">
          {saving ? '...' : 'Сохранить'}
        </button>

        <div style={{ borderTop: '1px solid rgba(197, 198, 199, 0.12)' }} className="pt-4 mt-2">
          <p className="font-geist text-xs mb-2" style={{ color: TEXT_MUTED }}>Отпуск / больничный / отгул</p>

          {entry?.currentLeave && (
            <div className="mb-3 p-2 rounded-lg flex items-center justify-between gap-2" style={{ background: `${BADGE_NOTIFY}14` }}>
              <p className="font-geist text-xs" style={{ color: BADGE_NOTIFY }}>
                {LEAVE_LABELS[entry.currentLeave.type]}{entry.currentLeave.end_date ? ` до ${entry.currentLeave.end_date}` : ' (без даты окончания)'}
              </p>
              <button onClick={cancelCurrentLeave} disabled={savingLeave} className="font-geist text-xs cursor-pointer shrink-0" style={{ color: '#e05252' }}>
                Отменить
              </button>
            </div>
          )}

          <div className="flex gap-2 mb-2">
            {(Object.keys(LEAVE_LABELS) as LeaveType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setLeaveType(t)}
                className="flex-1 py-1.5 rounded-lg text-xs font-geist cursor-pointer"
                style={{ background: leaveType === t ? 'rgba(127, 119, 221, 0.15)' : 'rgba(197, 198, 199, 0.04)', color: leaveType === t ? '#7F77DD' : TEXT_MUTED }}
              >
                {LEAVE_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input type="date" value={leaveStart} onChange={e => setLeaveStart(e.target.value)} className="pixel-input" />
            <input type="date" value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)} className="pixel-input" placeholder="без даты" />
          </div>
          <input value={leaveNote} onChange={e => setLeaveNote(e.target.value.slice(0, 300))} className="pixel-input mb-2" placeholder="Комментарий (необязательно)" />
          <button
            onClick={addLeave}
            disabled={savingLeave}
            className="w-full py-2 text-xs font-geist font-semibold rounded-lg cursor-pointer disabled:opacity-50"
            style={{ background: 'rgba(127, 119, 221, 0.2)', color: '#7F77DD' }}
          >
            {savingLeave ? '...' : 'Добавить'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
