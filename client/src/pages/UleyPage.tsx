import { useEffect, useState } from 'react';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import { leadApi, permissionsApi, adminApi } from '../api';
import { TeamMember, SKillChart, ActivityItem, LectureStat, getLevel } from '../types';
import PixelIcon, { IconName } from '../components/PixelIcon';
import { parseServerDate } from '../utils/date';

interface UleyPageProps {
  user: any;
  onLogout: () => void;
}

type Tab = 'team' | 'before-after' | 'activity' | 'lectures' | 'ratings';

const PERMISSION_LABELS: Record<string, string> = {
  manage_knowledge_base: 'Багодельня',
  manage_courses: 'Курсы',
  manage_checklists: 'Чек-листы',
  manage_guides: 'Гайды',
};
const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS);

const ACTION_LABELS: Record<string, string> = {
  passed_lecture: '✓ прошла лекцию',
  failed_lecture: '✗ не прошла лекцию',
  login: '→ вошла в систему',
  completed_baseline: '· заполнила анкету',
};

export default function UleyPage({ user, onLogout }: UleyPageProps) {
  const [tab, setTab] = useState<Tab>('team');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [skillChart, setSkillChart] = useState<SKillChart[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [lectureStats, setLectureStats] = useState<LectureStat[]>([]);
  const [loading, setLoading] = useState(true);

  const [grants, setGrants] = useState<{ id: number; user_id: number; permission: string; expires_at: string | null }[]>([]);
  const [expiryByMember, setExpiryByMember] = useState<Record<number, string>>({});
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [resetResult, setResetResult] = useState<{ id: number; message: string } | null>(null);
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [archived, setArchived] = useState<{ id: number; name: string; avatar_initials: string; archived_at: string }[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [ratings, setRatings] = useState<any[] | null>(null);

  useEffect(() => {
    loadData();
    loadGrants();
    loadArchived();
  }, []);

  useEffect(() => {
    if (tab === 'ratings' && !ratings) {
      leadApi.getInternalRatings().then(r => setRatings(r.data)).catch(() => {});
    }
  }, [tab]);

  const loadArchived = async () => {
    try {
      const res = await leadApi.getArchivedTesters();
      setArchived(res.data);
    } catch {}
  };

  const archiveMember = async (memberId: number, name: string) => {
    if (!confirm(`Архивировать «${name}»? Вход будет заблокирован, история (тесты, чек-листы) сохранится.`)) return;
    setArchivingId(memberId);
    try {
      await adminApi.archiveUser(memberId);
      loadData();
      loadArchived();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Не удалось архивировать');
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
    } catch {
    } finally {
      setArchivingId(null);
    }
  };

  const loadData = async () => {
    try {
      const [teamRes, chartRes, activityRes, lectureStatsRes] = await Promise.all([
        leadApi.getTeam(),
        leadApi.getBeforeAfter(),
        leadApi.getActivity(),
        leadApi.getLectureStats(),
      ]);
      setTeam(teamRes.data);
      setSkillChart(chartRes.data);
      setActivity(activityRes.data.rows);
      setLectureStats(lectureStatsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadGrants = async () => {
    try {
      const res = await permissionsApi.list();
      setGrants(res.data);
    } catch {}
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
    } catch {}
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

  const awardBonus = async (userId: number) => {
    const amountStr = prompt('Сколько баг-коинов начислить? (макс. 500)');
    if (!amountStr) return;
    const amount = parseInt(amountStr, 10);
    if (!Number.isInteger(amount) || amount <= 0) { alert('Некорректная сумма'); return; }
    const reason = prompt('За что премия?');
    if (!reason?.trim()) return;
    try {
      await leadApi.awardBonus({ user_id: userId, amount, reason });
      alert('Премия начислена!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Не удалось начислить премию');
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
                {checkInCount === 1 ? 'не заходил(а) неделю или больше' : 'не заходили неделю или больше'}. Может, дело в чём-то,
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
                        <p className="text-pixel font-sans font-semibold text-sm">{member.name}</p>
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
                      <button onClick={() => awardBonus(member.id)} className="btn-secondary text-xs px-3 py-1">
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
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
                    <span className="text-pixel/40 text-xs font-sans">архивирован(а) {parseServerDate(a.archived_at).toLocaleDateString('ru-RU')}</span>
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
            <p className="text-pixel/45 text-xs font-sans mb-4">
              Баллы начисляются только за результат ≥90% без единого подозрительно быстрого ответа и почти без переключений вкладки — списать и получить баллы не получится.
            </p>
            {ratings ? (
              <div className="space-y-1.5">
                {ratings.map((r: any, i: number) => (
                  <div key={r.id} className="p-3 rounded flex items-center justify-between gap-3 flex-wrap" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.08)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-pixel/40 text-xs font-sans w-5">{i + 1}.</span>
                      <span className="text-pixel text-sm font-sans font-semibold">{r.name}</span>
                    </div>
                    <span className="text-xs font-sans" style={{ color: 'rgba(232,232,208,0.6)' }}>
                      {r.excellentQuizzes} отличных тестов · {r.cleanChecklists} чистых чеклистов · видимых баллов: {r.premiumPoints}
                    </span>
                    <span className="text-primary text-sm font-pixel font-semibold shrink-0">★ {r.hiddenScore}</span>
                  </div>
                ))}
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
              <span className="text-pixel/55 text-xs font-sans">последние 20 событий</span>
            </div>
            <div className="space-y-2">
              {activity.length === 0 ? (
                <div className="card text-center py-8">
                  <p className="text-pixel/60 text-sm font-sans">Нет активности</p>
                </div>
              ) : (
                activity.map(item => (
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
                        {ACTION_LABELS[item.action] || item.action}
                        {item.lecture_title ? `: "${item.lecture_title}"` : ''}
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
          </div>
        )}
      </div>
    </div>
  );
}
