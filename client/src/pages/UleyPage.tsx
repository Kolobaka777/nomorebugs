import { useEffect, useState } from 'react';
import Navigation from '../components/Navigation';
import FrogLoader from '../components/FrogLoader';
import { leadApi, permissionsApi, adminApi, presenceApi } from '../api';
import { TeamMember, SKillChart, ActivityItem, ActivityFilters, LectureStat, TesterSkillBreakdown, PresenceEntry } from '../types';
import Icon, { IconName } from '../components/Icon';
import { apiErrorMessage, showApiError } from '../utils/toast';
import AwardBonusModal from '../components/uley/AwardBonusModal';
import PresenceEditModal from '../components/uley/PresenceEditModal';
import TeamTab from '../components/uley/TeamTab';
import BeforeAfterTab from '../components/uley/BeforeAfterTab';
import LecturesTab from '../components/uley/LecturesTab';
import RatingsTab from '../components/uley/RatingsTab';
import ActivityTab, { EMPTY_ACTIVITY_FILTERS } from '../components/uley/ActivityTab';
import { Tab } from '../components/uley/constants';
import { PAGE_GRADIENT, PAGE_BG, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, BADGE_NOTIFY, TRACK_WIDE, CARD_SHADOW, ERROR } from '../utils/theme';

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
  const [activityFilters, setActivityFilters] = useState<ActivityFilters>(EMPTY_ACTIVITY_FILTERS);
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
      .catch((err: any) => setRatingsError(apiErrorMessage(err, 'Не удалось загрузить рейтинг')));
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
      .catch((err: any) => setByTesterError(apiErrorMessage(err, 'Не удалось загрузить разбивку по сотрудникам')));
  };

  useEffect(() => {
    if (tab === 'before-after' && !byTester && !byTesterError) {
      loadByTester();
    }
  }, [tab]);

  // Empty strings are dropped rather than sent as `?q=&from=` — the server
  // ignores them either way, but a request whose URL lists filters that
  // aren't set is a confusing thing to find in a network tab.
  const activityQuery = (f: ActivityFilters) => ({
    ...(f.category ? { category: f.category } : {}),
    ...(f.q.trim() ? { q: f.q.trim() } : {}),
    ...(f.userId ? { user_id: Number(f.userId) } : {}),
    ...(f.from ? { from: f.from } : {}),
    ...(f.to ? { to: f.to } : {}),
  });

  // Refetches from offset 0 whenever a filter changes, debounced because
  // the search box changes on every keystroke. Skipped entirely until the
  // log tab is actually open, so the other five tabs don't pay for it.
  useEffect(() => {
    if (tab !== 'activity') return;
    const handle = setTimeout(async () => {
      setActivityLoading(true);
      try {
        const res = await leadApi.getActivity({ offset: 0, ...activityQuery(activityFilters) });
        setActivity(res.data.rows);
        setActivityHasMore(res.data.hasMore);
        setActivityOffset(res.data.rows.length);
      } catch (err: any) {
        showApiError(err, 'Не удалось отфильтровать журнал');
      } finally {
        setActivityLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activityFilters]);

  const loadMoreActivity = async () => {
    setActivityLoading(true);
    try {
      const res = await leadApi.getActivity({ offset: activityOffset, ...activityQuery(activityFilters) });
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
      setLoadError(apiErrorMessage(err, 'Не удалось загрузить данные команды'));
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
      setResetResult({ id: userId, message: apiErrorMessage(err, 'Не удалось сбросить пароль') });
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
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <FrogLoader />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <div className="max-w-7xl mx-auto px-6 pt-16 pb-8">
          <div className="card text-center py-10">
            <p className="font-geist text-sm mb-4 break-words" style={{ color: ERROR }}>{loadError}</p>
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

  const TABS: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'team', label: 'Команда', icon: 'bee' },
    { id: 'before-after', label: 'До/После', icon: 'barchart' },
    { id: 'lectures', label: 'Лекции', icon: 'chartup' },
    { id: 'ratings', label: 'Рейтинг', icon: 'trophy' },
    { id: 'activity', label: 'Лягушачье болото', icon: 'frog' },
  ];

  return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-6 pt-16 pb-8 fade-in">
        {/* ===== HEADER ===== */}
        <div className="mb-8">
          <h1
            className="font-montserrat font-bold mb-2 flex items-center gap-2"
            style={{ fontSize: 24, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}
          >
            <Icon name="crown" size={22} color={BADGE_NOTIFY} /><Icon name="bee" size={22} color={BADGE_NOTIFY} /> Команда
          </h1>
          <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>Дашборд тимлида · {team.length} человек в команде</p>
        </div>

        {/* ===== METRIC CARDS ===== */}
        {/* items-stretch plus h-full on the card: the wrapper stretches by
            default, but the card inside it does not inherit that, so a
            longer label made one of the three shorter than the others. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 items-stretch">
          {[
            { label: 'Средний прогресс', value: `${avgProgress}%`, color: ACCENT },
            { label: 'Средний балл', value: `${avgScore}%`, color: BADGE_NOTIFY },
            { label: 'Человек в команде', value: team.length, color: '#7F77DD' },
          ].map((m, idx) => (
            <div
              key={idx}
              className="p-4 rounded-lg h-full flex flex-col justify-between"
              style={{
                background: CARD_BG,
                border: `1px solid ${m.color}40`,
                boxShadow: CARD_SHADOW,
              }}
            >
              <p className="font-geist text-xs mb-2" style={{ color: TEXT_MUTED }}>{m.label}</p>
              <p className="font-montserrat font-bold" style={{ color: m.color, fontSize: 20 }}>
                {m.value}
              </p>
            </div>
          ))}
        </div>

        {/* ===== TABS ===== */}
        <div className="flex flex-wrap gap-1.5 mb-6">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="rounded-lg font-geist font-semibold cursor-pointer px-3.5 py-2 flex items-center gap-1.5 transition-colors"
              style={{
                fontSize: 13,
                background: tab === t.id ? ACCENT : 'rgba(197, 198, 199, 0.06)',
                color: tab === t.id ? PAGE_BG : 'rgba(197, 198, 199, 0.6)',
              }}
            >
              <Icon name={t.icon} size={14} color="currentColor" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Keyed on the active tab so React builds a fresh node on every
            switch — that remount is what re-runs .fade-in. Without the key
            the class would only ever animate on first paint. */}
        <div key={tab} className="fade-in">
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
            team={team}
            filters={activityFilters}
            onFiltersChange={setActivityFilters}
          />
        )}
        </div>
      </div>
    </div>
  );
}
