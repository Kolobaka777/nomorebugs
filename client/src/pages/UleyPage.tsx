import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import { leadApi, permissionsApi, adminApi, presenceApi } from '../api';
import { TeamMember, SKillChart, ActivityItem, LectureStat, TesterSkillBreakdown, getLevel, PresenceEntry, LeaveType } from '../types';
import PixelIcon, { IconName } from '../components/PixelIcon';
import { parseServerDate } from '../utils/date';
import { useEscapeKey } from '../utils/a11y';
import { showApiError } from '../utils/toast';
import { formatActivityAction } from '../utils/activity';
import { TIMEZONES, HOUR_OPTIONS } from '../utils/timezones';

interface UleyPageProps {
  user: any;
  onLogout: () => void;
}

type Tab = 'team' | 'before-after' | 'activity' | 'lectures' | 'ratings';

// Was two native browser prompt() calls back to back — worked, but looked
// broken (an unstyled OS dialog titled with the raw production domain,
// asking for two separate inputs one after another) and gave no real
// feedback beyond a generic alert on failure. A proper modal, matching the
// styling other forms in the app already use.
const MAX_BONUS_AMOUNT = 500;

function AwardBonusModal({
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

const WEEKDAY_LABELS: [string, string][] = [['1', 'Пн'], ['2', 'Вт'], ['3', 'Ср'], ['4', 'Чт'], ['5', 'Пт'], ['6', 'Сб'], ['7', 'Вс']];
const LEAVE_LABELS: Record<LeaveType, string> = { vacation: 'Отпуск', sick: 'Больничный', day_off: 'Отгул', other: 'Другое' };

// Lets a lead configure a tester's working hours/status and schedule leave
// — powers both the "работают сейчас" dots below and the team news feed's
// vacation start/end items (see GET /api/team/news).
function PresenceEditModal({
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

const PERMISSION_LABELS: Record<string, string> = {
  manage_knowledge_base: 'Багодельня',
  manage_courses: 'Курсы',
  manage_checklists: 'Чек-листы',
  manage_guides: 'Гайды',
};
const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS);

export default function UleyPage({ user, onLogout }: UleyPageProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('team');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [skillChart, setSkillChart] = useState<SKillChart[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityOffset, setActivityOffset] = useState(0);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [lectureStats, setLectureStats] = useState<LectureStat[]>([]);
  const [loading, setLoading] = useState(true);

  const [grants, setGrants] = useState<{ id: number; user_id: number; permission: string; expires_at: string | null }[]>([]);
  const [expiryByMember, setExpiryByMember] = useState<Record<number, string>>({});
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [resetResult, setResetResult] = useState<{ id: number; message: string } | null>(null);
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [archived, setArchived] = useState<{ id: number; name: string; avatar_initials: string; archived_at: string; gender?: 'male' | 'female' | null }[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [ratings, setRatings] = useState<any[] | null>(null);
  const [ratingsError, setRatingsError] = useState('');
  const [expandedRatingId, setExpandedRatingId] = useState<number | null>(null);
  const [presence, setPresence] = useState<PresenceEntry[]>([]);
  const [presenceTarget, setPresenceTarget] = useState<{ id: number; name: string } | null>(null);

  const loadPresence = async () => {
    try {
      const res = await presenceApi.getTeam();
      setPresence(res.data);
    } catch (err: any) {
      showApiError(err, 'Не удалось загрузить статус команды');
    }
  };

  useEffect(() => {
    loadData();
    loadGrants();
    loadArchived();
    loadPresence();
  }, []);

  const loadRatings = () => {
    setRatingsError('');
    leadApi.getInternalRatings()
      .then(r => setRatings(r.data))
      // Previously a silent no-op on failure — the tab just spun forever
      // with no way to tell "still loading" apart from "broken". Now the
      // actual server message (or a generic fallback) shows, with a retry.
      .catch((err: any) => setRatingsError(err.response?.data?.error || 'Не удалось загрузить рейтинг'));
  };

  useEffect(() => {
    if (tab === 'ratings' && !ratings && !ratingsError) {
      loadRatings();
    }
  }, [tab]);

  const [byTester, setByTester] = useState<TesterSkillBreakdown[] | null>(null);
  const [byTesterError, setByTesterError] = useState('');

  const loadByTester = () => {
    setByTesterError('');
    leadApi.getBeforeAfterByTester()
      .then(r => setByTester(r.data))
      .catch((err: any) => setByTesterError(err.response?.data?.error || 'Не удалось загрузить разбивку по сотрудникам'));
  };

  useEffect(() => {
    if (tab === 'before-after' && !byTester && !byTesterError) {
      loadByTester();
    }
  }, [tab]);

  const loadMoreActivity = async () => {
    setActivityLoading(true);
    try {
      const res = await leadApi.getActivity({ offset: activityOffset });
      setActivity(prev => [...prev, ...res.data.rows]);
      setActivityHasMore(res.data.hasMore);
      setActivityOffset(o => o + res.data.rows.length);
    } catch (err: any) {
      showApiError(err, 'Не удалось загрузить ещё активность');
    } finally {
      setActivityLoading(false);
    }
  };

  const loadArchived = async () => {
    try {
      const res = await leadApi.getArchivedTesters();
      setArchived(res.data);
    } catch (err: any) {
      showApiError(err, 'Не удалось загрузить архив сотрудников');
    }
  };

  const archiveMember = async (memberId: number, name: string) => {
    if (!confirm(`Архивировать «${name}»? Вход будет заблокирован, история (тесты, чек-листы) сохранится.`)) return;
    setArchivingId(memberId);
    try {
      await adminApi.archiveUser(memberId);
      loadData();
      loadArchived();
    } catch (err: any) {
      showApiError(err, 'Не удалось архивировать');
    } finally {
      setArchivingId(null);
    }
  };

  const restoreMember = async (memberId: number) => {
    setArchivingId(memberId);
    try {
      await adminApi.restoreUser(memberId);
      loadData();
      loadArchived();
    } catch (err: any) {
      // Was a bare `catch {}` — clicking "Восстановить" and having it
      // silently fail is indistinguishable from the button not working.
      showApiError(err, 'Не удалось восстановить сотрудника');
    } finally {
      setArchivingId(null);
    }
  };

  const [loadError, setLoadError] = useState('');

  const loadData = async () => {
    setLoadError('');
    try {
      const [teamRes, chartRes, activityRes, lectureStatsRes] = await Promise.all([
        leadApi.getTeam(),
        leadApi.getBeforeAfter(),
        leadApi.getActivity({ offset: 0 }),
        leadApi.getLectureStats(),
      ]);
      setTeam(teamRes.data);
      setSkillChart(chartRes.data);
      setActivity(activityRes.data.rows);
      setActivityHasMore(activityRes.data.hasMore);
      setActivityOffset(activityRes.data.rows.length);
      setLectureStats(lectureStatsRes.data);
    } catch (err: any) {
      // Used to just console.error and leave every stat at its zeroed
      // default — "0% прогресс, 0 жуков в улье" looked like a genuinely
      // empty team, not a failed request.
      setLoadError(err.response?.data?.error || 'Не удалось загрузить данные команды');
    } finally {
      setLoading(false);
    }
  };

  const loadGrants = async () => {
    try {
      const res = await permissionsApi.list();
      setGrants(res.data);
    } catch (err: any) {
      showApiError(err, 'Не удалось загрузить права доступа');
    }
  };

  const EXPIRY_OPTIONS: Record<string, () => string | null> = {
    never: () => null,
    '24h': () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    '7d': () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    '30d': () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const togglePermission = async (userId: number, permission: string, currentlyGranted: number | null) => {
    try {
      if (currentlyGranted) {
        await permissionsApi.revoke(currentlyGranted);
      } else {
        const expiry = expiryByMember[userId] || 'never';
        await permissionsApi.grant({ user_id: userId, permission, expires_at: EXPIRY_OPTIONS[expiry]() });
      }
      loadGrants();
    } catch (err: any) {
      // Was silent — clicking a permission checkbox and having it fail
      // with no feedback looks exactly like the checkbox did nothing.
      showApiError(err, 'Не удалось изменить право доступа');
    }
  };

  const resetPassword = async (userId: number) => {
    if (!confirm('Сбросить пароль этому сотруднику? Ему придёт новый временный пароль.')) return;
    setResettingId(userId);
    try {
      const res = await adminApi.resetPassword(userId);
      const { delivered, tempPassword } = res.data;
      const message = delivered === 'none'
        ? `Не удалось доставить автоматически. Временный пароль: ${tempPassword} — передай его сотруднику лично.`
        : `Новый пароль отправлен через ${delivered === 'telegram' ? 'Telegram' : 'почту'}.`;
      setResetResult({ id: userId, message });
    } catch (err: any) {
      setResetResult({ id: userId, message: err.response?.data?.error || 'Не удалось сбросить пароль' });
    } finally {
      setResettingId(null);
    }
  };

  const [bonusTarget, setBonusTarget] = useState<{ id: number; name: string } | null>(null);
  const [bonusResult, setBonusResult] = useState<{ id: number; message: string } | null>(null);

  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<number | null>(null);
  const noteValue = (member: TeamMember) => noteDrafts[member.id] ?? member.lead_note ?? '';
  const saveNote = async (memberId: number) => {
    setSavingNoteId(memberId);
    try {
      const value = noteDrafts[memberId] ?? '';
      await leadApi.updateTeamNote(memberId, value);
      setTeam(t => t.map(m => m.id === memberId ? { ...m, lead_note: value } : m));
    } catch (err: any) {
      showApiError(err, 'Не удалось сохранить заметку');
    } finally {
      setSavingNoteId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
        <Navigation user={user} onLogout={onLogout} />
        <div className="max-w-7xl mx-auto px-6 pt-16 pb-8">
          <div className="card text-center py-10">
            <p className="text-sm font-sans mb-4" style={{ color: '#e05252' }}>{loadError}</p>
            <button onClick={() => { setLoading(true); loadData(); }} className="btn-secondary text-xs px-4 py-2">Повторить</button>
          </div>
        </div>
      </div>
    );
  }

  const teamNameById = Object.fromEntries(team.map(m => [m.id, m.name]));

  const avgProgress = team.length
    ? Math.round(team.reduce((acc, m) => acc + (m.lecturesCompleted / 10) * 100, 0) / team.length)
    : 0;
  const avgScore = team.length
    ? Math.round(team.reduce((acc, m) => acc + m.avgScore, 0) / team.length)
    : 0;
  const checkInCount = team.filter(m => m.needsCheckIn).length;

  const TABS: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'team', label: 'Команда', icon: 'bee' },
    { id: 'before-after', label: 'До/После', icon: 'barchart' },
    { id: 'lectures', label: 'Лекции', icon: 'chartup' },
    { id: 'ratings', label: 'Рейтинг', icon: 'trophy' },
    { id: 'activity', label: 'Жучиная нора', icon: 'bug' },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-6 pt-16 pb-8 fade-in">
        {/* ===== HEADER ===== */}
        <div className="mb-8">
          <h1
            className="font-pixel text-primary mb-2"
            style={{ fontSize: '0.8rem', lineHeight: 1.8 }}
          >
            <span className="flex items-center gap-2"><PixelIcon name="crown" size={14} color="#EF9F27" /><PixelIcon name="bee" size={14} color="#EF9F27" /> Улей</span>
          </h1>
          <p className="text-pixel/60 text-sm font-sans">Дашборд тимлида · {team.length} жуков в улье</p>
        </div>

        {/* ===== METRIC CARDS ===== */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Средний прогресс', value: `${avgProgress}%`, color: '#1D9E75' },
            { label: 'Средний балл', value: `${avgScore}%`, color: '#EF9F27' },
            { label: 'Жуков в улье', value: team.length, color: '#7F77DD' },
            {
              label: 'Могут ждать поддержки',
              value: checkInCount,
              color: checkInCount > 0 ? '#EF9F27' : '#1D9E75',
            },
          ].map((m, idx) => (
            <div
              key={idx}
              className="p-4 rounded"
              style={{
                background: '#1a1a2e',
                boxShadow: `2px 0 0 0 ${m.color}40, -2px 0 0 0 ${m.color}40, 0 2px 0 0 ${m.color}40, 0 -2px 0 0 ${m.color}40`,
              }}
            >
              <p className="text-pixel/60 text-xs font-sans mb-2">{m.label}</p>
              <p className="font-pixel" style={{ color: m.color, fontSize: '1.1rem', lineHeight: 1.6 }}>
                {m.value}
              </p>
            </div>
          ))}
        </div>

        {/* ===== CHECK-IN SUGGESTION ===== */}
        {checkInCount > 0 && (
          <div
            className="mb-6 p-4 rounded flex items-start gap-3"
            style={{
              background: 'rgba(239,159,39,0.06)',
              boxShadow: '2px 0 0 0 rgba(239,159,39,0.4), -2px 0 0 0 rgba(239,159,39,0.4), 0 2px 0 0 rgba(239,159,39,0.4), 0 -2px 0 0 rgba(239,159,39,0.4)',
            }}
          >
            <PixelIcon name="snail" size={22} color="#EF9F27" />
            <div>
              <p className="font-pixel text-xs" style={{ color: '#EF9F27', lineHeight: 1.8 }}>
                Возможно, стоит написать
              </p>
              <p className="text-pixel/60 text-sm font-sans mt-1">
                {team.filter(m => m.needsCheckIn).map(m => m.name).join(', ')} —{' '}
                {checkInCount === 1
                  ? (team.find(m => m.needsCheckIn)?.gender === 'female' ? 'не заходила' : team.find(m => m.needsCheckIn)?.gender === 'male' ? 'не заходил' : 'не заходил(а)') + ' неделю или больше'
                  : 'не заходили неделю или больше'}. Может, дело в чём-то,
                чем можно помочь — недельная тишина не всегда про лень.
              </p>
            </div>
          </div>
        )}

        {/* ===== TABS ===== */}
        <div
          className="flex gap-0 mb-6 rounded overflow-hidden"
          style={{ border: '2px solid rgba(29,158,117,0.2)' }}
        >
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 py-3 text-xs font-sans font-medium transition-all cursor-pointer"
              style={{
                background: tab === t.id ? '#1D9E75' : 'transparent',
                color: tab === t.id ? '#0f0f1a' : 'rgba(232,232,208,0.5)',
                borderRight: '1px solid rgba(29,158,117,0.2)',
              }}
            >
              <span className="flex items-center justify-center gap-1.5">
                <PixelIcon name={t.icon} size={12} color="currentColor" />
                {t.label}
              </span>
            </button>
          ))}
        </div>

        {/* ===== TAB: TEAM ===== */}
        {tab === 'team' && (
          <div className="space-y-4">
            {presence.length > 0 && (
              <div className="p-4 rounded mb-2" style={{ background: '#1a1a2e', boxShadow: '2px 0 0 0 rgba(29,158,117,0.25), -2px 0 0 0 rgba(29,158,117,0.25), 0 2px 0 0 rgba(29,158,117,0.25), 0 -2px 0 0 rgba(29,158,117,0.25)' }}>
                <p className="font-pixel text-xs mb-3" style={{ color: '#1D9E75', lineHeight: 1.8 }}>Работают сейчас</p>
                <div className="flex flex-wrap gap-2">
                  {presence.map(p => {
                    const dotColor = p.currentLeave ? '#EF9F27' : p.isWorkingNow ? '#1D9E75' : 'rgba(232,232,208,0.3)';
                    const subtitle = p.currentLeave
                      ? `${LEAVE_LABELS[p.currentLeave.type]}${p.currentLeave.end_date ? ` до ${p.currentLeave.end_date}` : ''}`
                      : (p.workStart && p.workEnd) ? `${p.workStart}–${p.workEnd}` : 'часы не заданы';
                    return (
                      <button
                        key={p.id}
                        onClick={() => setPresenceTarget({ id: p.id, name: p.name })}
                        className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-left"
                        style={{ background: 'rgba(232,232,208,0.04)' }}
                        title="Настроить рабочее время"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                        <span>
                          <span className="block text-pixel text-xs font-sans font-semibold">{p.name}</span>
                          <span className="block text-pixel/50 text-[11px] font-sans">{subtitle}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {team.map(member => {
              const lvl = getLevel(member.lecturesCompleted);
              const progPct = Math.round((member.lecturesCompleted / 10) * 100);
              return (
                <div
                  key={member.id}
                  className="p-5 rounded"
                  style={{
                    background: '#1a1a2e',
                    boxShadow: '2px 0 0 0 #1D9E75, -2px 0 0 0 #1D9E75, 0 2px 0 0 #1D9E75, 0 -2px 0 0 #1D9E75',
                  }}
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    {/* Avatar + name */}
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded flex items-center justify-center font-pixel text-game text-xs shrink-0"
                        style={{ background: '#1D9E75' }}
                      >
                        {member.avatar_initials}
                      </div>
                      <div>
                        <p
                          className="text-pixel font-sans font-semibold text-sm cursor-pointer hover:underline"
                          onClick={() => navigate(`/profile/${member.id}`)}
                        >
                          {member.name}
                        </p>
                        <p className="text-pixel/60 text-xs font-sans">
                          <span className="flex items-center gap-1"><PixelIcon name={lvl.icon as IconName} size={12} color="currentColor" />{lvl.name}</span>
                        </p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="text-right shrink-0">
                      <p className="text-primary text-sm font-sans font-semibold">
                        {member.avgScore}%
                      </p>
                      <p className="text-pixel/60 text-xs font-sans">средний балл</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="flex items-center gap-3">
                    <div className="xp-bar-track flex-1">
                      <div className="xp-bar-fill" style={{ width: `${progPct}%` }} />
                    </div>
                    <span className="text-pixel/60 text-xs font-sans min-w-[80px] text-right">
                      {member.lecturesCompleted}/10 лекций
                    </span>
                  </div>

                  {/* Skill growth */}
                  <div className="flex items-center justify-between mt-3 pt-3"
                    style={{ borderTop: '1px solid rgba(232,232,208,0.05)' }}
                  >
                    <p className="text-pixel/55 text-xs font-sans">
                      {member.daysInactive < 999
                        ? `Активность: ${member.daysInactive === 0 ? 'сегодня' : `${member.daysInactive} дн назад`}`
                        : 'Активность: —'}
                    </p>
                    <p className="text-primary text-xs font-sans font-semibold">
                      рост: +{member.skillGrowth}
                    </p>
                  </div>

                  {/* Soft anti-cheat signals — never an accusation, just a
                      "might be worth a look" flag for a lead to interpret. */}
                  {(member.fastAnswers > 0 || member.tabSwitches > 0) && (
                    <p className="text-xs font-sans mt-2" style={{ color: '#EF9F27' }}>
                      {member.fastAnswers > 0 && `⚡ ${member.fastAnswers} слишком быстрых ответов`}
                      {member.fastAnswers > 0 && member.tabSwitches > 0 && ' · '}
                      {member.tabSwitches > 0 && `↔ ${member.tabSwitches} переключений вкладки во время тестов`}
                    </p>
                  )}

                  {/* Task-type breakdown — same data the tester sees about
                      themselves in "Моя нора", surfaced here so a lead can
                      tell at a glance who's handling which kind of work. */}
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(232,232,208,0.05)' }}>
                    <p className="text-pixel/45 text-xs font-sans uppercase mb-2">Задачи</p>
                    {(member.taskCounts ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(member.taskCounts ?? []).map(tc => (
                          <span
                            key={tc.name}
                            className="text-xs font-sans px-2 py-1 rounded"
                            style={{ background: `${tc.color}20`, color: tc.color }}
                          >
                            {tc.name}: {tc.count}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-pixel/40 text-xs font-sans">
                        Пока не {member.gender === 'female' ? 'отправляла' : member.gender === 'male' ? 'отправлял' : 'отправлял(а)'} чек-листы
                      </p>
                    )}
                  </div>

                  {/* Private lead notes — free-text characteristics, never
                      shown to the tester themselves (see /api/lead/team). */}
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(232,232,208,0.05)' }}>
                    <p className="text-pixel/45 text-xs font-sans uppercase mb-2">Заметки (видно только лиду/админу)</p>
                    <textarea
                      className="pixel-input w-full text-xs font-sans"
                      style={{ minHeight: 56 }}
                      value={noteValue(member)}
                      onChange={e => setNoteDrafts(d => ({ ...d, [member.id]: e.target.value }))}
                      placeholder="Например: сильна в вёрстке, можно доверять сложные вайты; иногда путает статусы задач..."
                      maxLength={2000}
                    />
                    {noteValue(member) !== (member.lead_note ?? '') && (
                      <button
                        onClick={() => saveNote(member.id)}
                        disabled={savingNoteId === member.id}
                        className="btn-secondary text-xs px-3 py-1 mt-1.5"
                      >
                        {savingNoteId === member.id ? '...' : '💾 Сохранить заметку'}
                      </button>
                    )}
                  </div>

                  {/* Scoped permissions — точечный доступ к разделам без
                      полной смены роли. Отмеченный чекбокс = выдано. */}
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(232,232,208,0.05)' }}>
                    <div className="flex items-center gap-3 flex-wrap mb-2">
                      {ALL_PERMISSIONS.map(perm => {
                        const grant = grants.find(g => g.user_id === member.id && g.permission === perm);
                        return (
                          <label key={perm} className="flex items-center gap-1.5 text-xs font-sans cursor-pointer" style={{ color: grant ? '#1D9E75' : 'rgba(232,232,208,0.6)' }}>
                            <input
                              type="checkbox"
                              checked={!!grant}
                              onChange={() => togglePermission(member.id, perm, grant?.id ?? null)}
                            />
                            {PERMISSION_LABELS[perm]}
                            {grant?.expires_at && ` (до ${parseServerDate(grant.expires_at).toLocaleDateString('ru-RU')})`}
                          </label>
                        );
                      })}
                      <select
                        className="pixel-input text-xs"
                        style={{ width: 130 }}
                        value={expiryByMember[member.id] || 'never'}
                        onChange={e => setExpiryByMember(m => ({ ...m, [member.id]: e.target.value }))}
                        title="Срок действия для следующей выдачи прав"
                      >
                        <option value="never">Без срока</option>
                        <option value="24h">На 24 часа</option>
                        <option value="7d">На 7 дней</option>
                        <option value="30d">На 30 дней</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => resetPassword(member.id)}
                        disabled={resettingId === member.id}
                        className="btn-secondary text-xs px-3 py-1"
                      >
                        {resettingId === member.id ? '...' : '🔑 Сбросить пароль'}
                      </button>
                      <button onClick={() => setBonusTarget({ id: member.id, name: member.name })} className="btn-secondary text-xs px-3 py-1">
                        🏆 Премия
                      </button>
                      <button
                        onClick={() => archiveMember(member.id, member.name)}
                        disabled={archivingId === member.id}
                        className="btn-secondary text-xs px-3 py-1"
                        style={{ color: '#e05252' }}
                      >
                        {archivingId === member.id ? '...' : '🗄 Архивировать'}
                      </button>
                      {resetResult?.id === member.id && (
                        <span className="text-xs font-sans" style={{ color: 'rgba(232,232,208,0.6)' }}>{resetResult.message}</span>
                      )}
                      {bonusResult?.id === member.id && (
                        <span className="text-xs font-sans" style={{ color: '#1D9E75' }}>🏆 {bonusResult.message}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {bonusTarget && (
          <AwardBonusModal
            member={bonusTarget}
            onClose={() => setBonusTarget(null)}
            onAwarded={(amt) => setBonusResult({ id: bonusTarget.id, message: `Начислено ${amt} баллов` })}
          />
        )}

        {presenceTarget && (
          <PresenceEditModal
            member={presenceTarget}
            entry={presence.find(p => p.id === presenceTarget.id)}
            onClose={() => setPresenceTarget(null)}
            onSaved={() => { setPresenceTarget(null); loadPresence(); }}
          />
        )}

        {tab === 'team' && archived.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowArchived(p => !p)}
              className="text-xs font-sans cursor-pointer"
              style={{ color: 'rgba(232,232,208,0.5)' }}
            >
              {showArchived ? '▾' : '▸'} Архив ({archived.length})
            </button>
            {showArchived && (
              <div className="space-y-1.5 mt-2">
                {archived.map(a => (
                  <div key={a.id} className="p-2.5 rounded flex items-center justify-between gap-3" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.06)' }}>
                    <span className="text-pixel/70 text-sm font-sans">{a.name}</span>
                    <span className="text-pixel/40 text-xs font-sans">
                      {a.gender === 'female' ? 'архивирована' : a.gender === 'male' ? 'архивирован' : 'архивирован(а)'} {parseServerDate(a.archived_at).toLocaleDateString('ru-RU')}
                    </span>
                    <button
                      onClick={() => restoreMember(a.id)}
                      disabled={archivingId === a.id}
                      className="btn-secondary text-xs px-3 py-1"
                    >
                      {archivingId === a.id ? '...' : '↺ Восстановить'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== TAB: BEFORE/AFTER ===== */}
        {tab === 'before-after' && (
          <div className="space-y-5">
            <p className="text-pixel/60 text-xs font-sans">
              Сравнение средних навыков команды до и после обучения
            </p>
            {skillChart.map(skill => (
              <div key={skill.skill} className="card">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-pixel font-sans font-semibold text-sm">{skill.skill}</p>
                  <span
                    className="text-xs font-sans font-bold px-2 py-1 rounded"
                    style={{
                      color: skill.delta > 0 ? '#1D9E75' : 'rgba(232,232,208,0.4)',
                      background: skill.delta > 0 ? 'rgba(29,158,117,0.15)' : 'transparent',
                    }}
                  >
                    {skill.delta > 0 ? `+${skill.delta}` : skill.delta === 0 ? '—' : skill.delta}
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-pixel/60 text-xs font-sans w-12 shrink-0">ДО</span>
                    <div className="xp-bar-track-amber flex-1">
                      <div
                        className="xp-bar-fill-amber"
                        style={{ width: `${(skill.before / 5) * 100}%` }}
                      />
                    </div>
                    <span className="text-amber text-xs font-sans w-10 text-right">{skill.before}/5</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-pixel/60 text-xs font-sans w-12 shrink-0">ПОСЛЕ</span>
                    <div className="xp-bar-track flex-1">
                      <div
                        className="xp-bar-fill"
                        style={{ width: `${(skill.after / 5) * 100}%` }}
                      />
                    </div>
                    <span className="text-primary text-xs font-sans w-10 text-right">{skill.after}/5</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Per-employee breakdown — the chart above answers "is the team
                improving", this answers "who specifically, in which topic" —
                so a lead can tell who's grown and who might need a topic
                re-explained one-on-one. */}
            <div className="mt-2">
              <p className="text-pixel/60 text-xs font-sans mb-3">По сотрудникам — самооценка «до» против реального результата тестов «после» по той же теме</p>
              {byTesterError ? (
                <div className="card text-center py-6">
                  <p className="text-sm font-sans mb-3" style={{ color: '#e05252' }}>{byTesterError}</p>
                  <button onClick={loadByTester} className="btn-secondary text-xs px-4 py-2">Повторить</button>
                </div>
              ) : byTester ? (
                byTester.length === 0 ? (
                  <p className="text-pixel/50 text-sm font-sans">В команде пока нет тестировщиков.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-sans" style={{ borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(232,232,208,0.1)' }}>
                          <th className="text-left py-2 pr-3 text-pixel/50 font-normal">Тестировщик</th>
                          {byTester[0]?.skills.map(s => (
                            <th key={s.skill} className="text-center py-2 px-2 text-pixel/50 font-normal whitespace-nowrap">{s.skill}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {byTester.map(t => (
                          <tr key={t.id} style={{ borderBottom: '1px solid rgba(232,232,208,0.05)' }}>
                            <td className="py-2 pr-3 text-pixel font-semibold whitespace-nowrap">{t.name}</td>
                            {t.skills.map(s => {
                              const noData = s.after === null;
                              // Green = grew since baseline; amber = still weak
                              // (below the midpoint) even after taking the
                              // related lectures — a candidate for a
                              // one-on-one re-explanation; gray = no quiz
                              // attempts in this topic yet.
                              const needsHelp = !noData && (s.after as number) < 3;
                              const color = noData ? 'rgba(232,232,208,0.35)' : needsHelp ? '#EF9F27' : (s.delta ?? 0) > 0 ? '#1D9E75' : 'rgba(232,232,208,0.6)';
                              return (
                                <td key={s.skill} className="text-center py-2 px-2" style={{ color }}>
                                  {noData ? '—' : `${s.before ?? '—'} → ${s.after}`}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-pixel/40 text-xs font-sans mt-3">
                      <span style={{ color: '#EF9F27' }}>●</span> результат ниже среднего даже после лекций — возможно, стоит объяснить тему ещё раз ·{' '}
                      <span style={{ color: '#1D9E75' }}>●</span> заметный рост
                    </p>
                  </div>
                )
              ) : (
                <SnailLoader />
              )}
            </div>
          </div>
        )}

        {/* ===== TAB: LECTURE STATS ===== */}
        {tab === 'lectures' && (
          <div className="space-y-3">
            <p className="text-pixel/60 text-xs font-sans mb-2">
              Средний балл и процент сдачи по каждой лекции — помогает увидеть, где команде тяжелее всего
            </p>
            {lectureStats.map(lec => {
              const noData = lec.attempts === 0;
              const passColor = noData ? 'rgba(232,232,208,0.55)'
                : lec.passRate! >= 70 ? '#1D9E75'
                : lec.passRate! >= 40 ? '#EF9F27'
                : '#e05252';
              return (
                <div key={lec.id} className="card">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <p className="text-pixel font-sans font-semibold text-sm">{lec.title}</p>
                      <p className="text-pixel/55 text-xs font-sans">{lec.skill_area}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {noData ? (
                        <p className="text-pixel/55 text-xs font-sans">нет данных</p>
                      ) : (
                        <>
                          <p className="text-sm font-sans font-semibold" style={{ color: passColor }}>{lec.passRate}% сдали</p>
                          <p className="text-pixel/55 text-xs font-sans">ср. балл {lec.avgScore}% · {lec.attempts} чел.</p>
                        </>
                      )}
                    </div>
                  </div>
                  {!noData && (
                    <div className="xp-bar-track">
                      <div className="xp-bar-fill" style={{ width: `${lec.passRate}%`, background: passColor }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ===== TAB: INTERNAL RATINGS (hidden from testers) ===== */}
        {tab === 'ratings' && (
          <div>
            <p className="text-pixel/60 text-xs font-sans mb-1">
              Автоматический рейтинг качества + скорости — тестировщики его не видят.
            </p>
            <div className="text-pixel/45 text-xs font-sans mb-4 space-y-1">
              <p>⭐ <b>+5 баллов</b> — лекция сдана на ≥90%, без единого подозрительно быстрого ответа и без переключений вкладки во время теста.</p>
              <p>⭐ <b>+3 балла</b> — чек-лист из 5+ пунктов пройден без единого «fail» (максимум 5 раз в день за один и тот же тип задачи, чтобы нельзя было фармить повторной отправкой).</p>
              <p>Списать баллы, срезав угол, не получится — начисление идёт только по серверной проверке, не по тому, что прислал браузер.</p>
            </div>
            {ratingsError ? (
              <div className="card text-center py-8">
                <p className="text-sm font-sans mb-3" style={{ color: '#e05252' }}>{ratingsError}</p>
                <button onClick={loadRatings} className="btn-secondary text-xs px-4 py-2">Повторить</button>
              </div>
            ) : ratings ? (
              <div className="space-y-1.5">
                {ratings.map((r: any, i: number) => {
                  const expanded = expandedRatingId === r.id;
                  return (
                    <div key={r.id} className="rounded" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.08)' }}>
                      <button
                        onClick={() => setExpandedRatingId(expanded ? null : r.id)}
                        className="w-full p-3 flex items-center justify-between gap-3 flex-wrap text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-pixel/40 text-xs font-sans w-5">{i + 1}.</span>
                          <span className="text-pixel text-sm font-sans font-semibold">{r.name}</span>
                          <span className="text-pixel/40 text-xs font-sans">{expanded ? '▾' : '▸'}</span>
                        </div>
                        <span className="text-xs font-sans" style={{ color: 'rgba(232,232,208,0.6)' }}>
                          {r.excellentQuizzes} отличных тестов · {r.cleanChecklists} чистых чеклистов · видимых баллов: {r.premiumPoints}
                        </span>
                        <span className="text-primary text-sm font-pixel font-semibold shrink-0">★ {r.hiddenScore}</span>
                      </button>
                      {expanded && (
                        <div className="px-3 pb-3 pt-1" style={{ borderTop: '1px solid rgba(232,232,208,0.06)' }}>
                          {r.recentEvents?.length > 0 ? (
                            <div className="space-y-1 mt-2">
                              {r.recentEvents.map((e: any, ei: number) => (
                                <div key={ei} className="flex items-center justify-between gap-3 text-xs font-sans" style={{ color: 'rgba(232,232,208,0.6)' }}>
                                  <span>+{e.points} — {e.reason}</span>
                                  <span className="text-pixel/40 shrink-0">{parseServerDate(e.created_at).toLocaleDateString('ru-RU')}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-pixel/40 text-xs font-sans mt-2">Пока нет начислений.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {ratings.length === 0 && <p className="text-pixel/50 text-sm font-sans">Пока нет данных.</p>}
              </div>
            ) : <SnailLoader />}
          </div>
        )}

        {/* ===== TAB: ACTIVITY FEED ===== */}
        {tab === 'activity' && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <h2
                className="font-pixel text-pixel/60"
                style={{ fontSize: '0.6rem', lineHeight: 1.8 }}
              >
                <span className="flex items-center gap-2"><PixelIcon name="bug" size={12} color="currentColor" />Жучиная нора</span>
              </h2>
            </div>
            <div className="space-y-2">
              {(Array.isArray(activity) ? activity : []).length === 0 ? (
                <div className="card text-center py-8">
                  <p className="text-pixel/60 text-sm font-sans">Нет активности</p>
                </div>
              ) : (
                (Array.isArray(activity) ? activity : []).map(item => (
                  <div
                    key={item.id}
                    className="p-3 rounded flex items-start justify-between gap-4"
                    style={{
                      background: '#1a1a2e',
                      borderLeft: `3px solid ${
                        item.action === 'passed_lecture' ? '#1D9E75' :
                        item.action === 'failed_lecture' ? '#e05252' :
                        '#EF9F27'
                      }`,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-pixel font-sans font-semibold text-sm">{item.name}</p>
                      <p className="text-pixel/60 text-xs font-sans">
                        {formatActivityAction(item.action, { lectureTitle: item.lecture_title, nameById: teamNameById, gender: item.gender })}
                      </p>
                    </div>
                    <p className="text-pixel/55 text-xs font-sans shrink-0">
                      {parseServerDate(item.created_at).toLocaleString('ru-RU', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                ))
              )}
            </div>
            {activityHasMore && (
              <div className="text-center mt-4">
                <button onClick={loadMoreActivity} disabled={activityLoading} className="btn-secondary text-xs px-4 py-2 disabled:opacity-50">
                  {activityLoading ? '...' : 'Показать ещё'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
