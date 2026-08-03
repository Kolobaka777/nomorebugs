import { useState } from 'react';
import { leadApi } from '../../api';
import { useEscapeKey } from '../../utils/a11y';
import { TIMEZONES, HOUR_OPTIONS } from '../../utils/timezones';
import { PresenceEntry, LeaveType } from '../../types';
import { WEEKDAY_LABELS, LEAVE_LABELS } from './constants';

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
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded p-6 max-h-[90vh] overflow-y-auto" style={{ background: '#1a1a2e', border: '2px solid rgba(29,158,117,0.4)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <p className="font-pixel text-primary" style={{ fontSize: '0.6rem', lineHeight: 1.8 }}>🕒 Рабочее время · {member.name}</p>
          <button onClick={onClose} aria-label="Закрыть" className="text-pixel/60 cursor-pointer hover:text-pixel/80">✕</button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-pixel/60 text-xs font-sans mb-1">Начало</label>
              <select value={workStart} onChange={e => setWorkStart(e.target.value)} className="pixel-input">
                <option value="">—</option>
                {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-pixel/60 text-xs font-sans mb-1">Конец</label>
              <select value={workEnd} onChange={e => setWorkEnd(e.target.value)} className="pixel-input">
                <option value="">—</option>
                {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-pixel/60 text-xs font-sans mb-1">Рабочие дни</label>
            <div className="flex gap-1">
              {WEEKDAY_LABELS.map(([d, label]) => (
                <button
                  key={d}
                  onClick={() => toggleDay(d)}
                  className="flex-1 py-1.5 rounded text-xs font-sans cursor-pointer"
                  style={{ background: days.has(d) ? 'rgba(29,158,117,0.2)' : 'rgba(232,232,208,0.04)', color: days.has(d) ? '#1D9E75' : 'rgba(232,232,208,0.4)' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-pixel/60 text-xs font-sans mb-1">Часовой пояс</label>
            <select value={timezone} onChange={e => setTimezone(e.target.value)} className="pixel-input">
              {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </select>
          </div>

          {error && <p className="text-xs font-sans" style={{ color: '#e05252' }}>{error}</p>}

          <button
            onClick={saveHours}
            disabled={saving}
            className="w-full py-3 text-sm font-sans font-semibold rounded cursor-pointer disabled:opacity-50"
            style={{ background: '#1D9E75', color: '#0f0f1a' }}
          >
            {saving ? '...' : 'Сохранить'}
          </button>

          <div style={{ borderTop: '1px solid rgba(232,232,208,0.1)' }} className="pt-4 mt-2">
            <p className="text-pixel/60 text-xs font-sans mb-2">Отпуск / больничный / отгул</p>

            {entry?.currentLeave && (
              <div className="mb-3 p-2 rounded flex items-center justify-between gap-2" style={{ background: 'rgba(239,159,39,0.08)' }}>
                <p className="text-xs font-sans" style={{ color: '#EF9F27' }}>
                  {LEAVE_LABELS[entry.currentLeave.type]}{entry.currentLeave.end_date ? ` до ${entry.currentLeave.end_date}` : ' (без даты окончания)'}
                </p>
                <button onClick={cancelCurrentLeave} disabled={savingLeave} className="text-xs font-sans cursor-pointer shrink-0" style={{ color: '#e05252' }}>
                  Отменить
                </button>
              </div>
            )}

            <div className="flex gap-2 mb-2">
              {(Object.keys(LEAVE_LABELS) as LeaveType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setLeaveType(t)}
                  className="flex-1 py-1.5 rounded text-xs font-sans cursor-pointer"
                  style={{ background: leaveType === t ? 'rgba(127,119,221,0.15)' : 'rgba(232,232,208,0.04)', color: leaveType === t ? '#7F77DD' : 'rgba(232,232,208,0.5)' }}
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
              className="w-full py-2 text-xs font-sans font-semibold rounded cursor-pointer disabled:opacity-50"
              style={{ background: 'rgba(127,119,221,0.2)', color: '#7F77DD' }}
            >
              {savingLeave ? '...' : 'Добавить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
