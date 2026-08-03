import { useEffect, useState } from 'react';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import { leadApi, permissionsApi, adminApi, presenceApi } from '../api';
import { TeamMember, SKillChart, ActivityItem, LectureStat, TesterSkillBreakdown, PresenceEntry } from '../types';
import PixelIcon, { IconName } from '../components/PixelIcon';
import { showApiError } from '../utils/toast';
import AwardBonusModal from '../components/uley/AwardBonusModal';
import PresenceEditModal from '../components/uley/PresenceEditModal';
import TeamTab from '../components/uley/TeamTab';
import BeforeAfterTab from '../components/uley/BeforeAfterTab';
import LecturesTab from '../components/uley/LecturesTab';
import RatingsTab from '../components/uley/RatingsTab';
import ActivityTab from '../components/uley/ActivityTab';
import { Tab } from '../components/uley/constants';

interface UleyPageProps {
  user: any;
  onLogout: () => void;
}

export default function UleyPage({ user, onLogout }: UleyPageProps) {
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
          <TeamTab
            team={team}
            presence={presence}
            archived={archived}
            showArchived={showArchived}
            setShowArchived={setShowArchived}
            grants={grants}
            expiryByMember={expiryByMember}
            setExpiryByMember={setExpiryByMember}
            resettingId={resettingId}
            resetResult={resetResult}
            archivingId={archivingId}
            bonusResult={bonusResult}
            noteDrafts={noteDrafts}
            setNoteDrafts={setNoteDrafts}
            savingNoteId={savingNoteId}
            onSetPresenceTarget={setPresenceTarget}
            noteValue={noteValue}
            saveNote={saveNote}
            togglePermission={togglePermission}
            resetPassword={resetPassword}
            setBonusTarget={setBonusTarget}
            archiveMember={archiveMember}
            restoreMember={restoreMember}
          />
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

        {/* ===== TAB: BEFORE/AFTER ===== */}
        {tab === 'before-after' && (
          <BeforeAfterTab
            skillChart={skillChart}
            byTester={byTester}
            byTesterError={byTesterError}
            loadByTester={loadByTester}
          />
        )}

        {/* ===== TAB: LECTURE STATS ===== */}
        {tab === 'lectures' && <LecturesTab lectureStats={lectureStats} />}

        {/* ===== TAB: INTERNAL RATINGS (hidden from testers) ===== */}
        {tab === 'ratings' && (
          <RatingsTab ratings={ratings} ratingsError={ratingsError} loadRatings={loadRatings} />
        )}

        {/* ===== TAB: ACTIVITY FEED ===== */}
        {tab === 'activity' && (
          <ActivityTab
            activity={activity}
            activityHasMore={activityHasMore}
            activityLoading={activityLoading}
            loadMoreActivity={loadMoreActivity}
            teamNameById={teamNameById}
          />
        )}
      </div>
    </div>
  );
}
