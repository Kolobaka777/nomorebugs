import { useEffect, useRef, useState } from 'react';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import PixelIcon from '../components/PixelIcon';
import { adminApi, leadApi } from '../api';
import { parseServerDate } from '../utils/date';
import { ROLE_LABELS } from '../utils/roles';
import { formatActivityAction } from '../utils/activity';

interface AdminPageProps {
  user: any;
  onLogout: () => void;
}

interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: string;
  avatar_initials: string;
  created_at: string;
  archived_at: string | null;
  has_telegram: number;
  must_change_password: number;
  last_active: string | null;
}

interface TaskType {
  id: number;
  name: string;
}

interface TrashItem {
  type: string;
  typeLabel: string;
  id: number;
  title: string;
  deleted_at: string;
}

interface ActivityRow {
  id: number;
  action: string;
  created_at: string;
  user_id: number;
  name: string;
  gender?: 'male' | 'female' | null;
  lecture_title: string | null;
}

interface Overview {
  totalUsers: number;
  byRole: Record<string, number>;
  viaTelegram: number;
  viaEmail: number;
  active7d: number;
  active30d: number;
  totalSubmissions: number;
  totalCourses: number;
  totalGuides: number;
  totalBugExamples: number;
  pendingPasswordResets: number;
}

// Mirrors server/src/roles.js — the server is the actual source of truth
// (it validates and rejects anything not in ROLES), this list only drives
// the dropdown. Adding a role means updating both, same as any other
// client/server contract.
const ROLE_OPTIONS = ['tester', 'lead', 'admin'];

// Was its own hand-rolled map here, duplicating (and drifting from —
// permission grants/revokes didn't even say who or what permission)
// utils/activity.ts's formatActivityAction. That one is capitalized for
// standalone use elsewhere (ProfilePage, UleyPage); lowercased here to read
// naturally after the actor's name on the same line.
function actionLabel(row: ActivityRow, nameById: Record<number, string>): string {
  const formatted = formatActivityAction(row.action, {
    lectureTitle: row.lecture_title,
    nameById,
    gender: row.gender,
  });
  return formatted.charAt(0).toLowerCase() + formatted.slice(1);
}

type Tab = 'users' | 'activity' | 'analytics' | 'settings' | 'trash';

export default function AdminPage({ user, onLogout }: AdminPageProps) {
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [resetResult, setResetResult] = useState<{ id: number; message: string } | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityOffset, setActivityOffset] = useState(0);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [bonusCandidates, setBonusCandidates] = useState<any[] | null>(null);

  const [taskTypes, setTaskTypes] = useState<TaskType[] | null>(null);
  const [newTaskType, setNewTaskType] = useState('');

  const [trash, setTrash] = useState<TrashItem[] | null>(null);

  useEffect(() => {
    load(showArchived);
  }, [showArchived]);

  useEffect(() => {
    if (tab === 'activity' && activity.length === 0) loadActivity(0);
    if (tab === 'analytics' && !overview) loadOverview();
    if (tab === 'analytics' && !bonusCandidates) loadBonusCandidates();
    if (tab === 'settings' && !taskTypes) loadTaskTypes();
    if (tab === 'trash' && !trash) loadTrash();
  }, [tab]);

  // Guards against a fast double-toggle of "Показать архив": if the first
  // request (say, archived=false) is slower to come back than the second
  // (archived=true), its response would otherwise land last and silently
  // overwrite the list with the wrong archived/active set. Only the
  // response matching the CURRENT toggle state at completion time is applied.
  const loadRequestRef = useRef(0);

  const load = async (archived: boolean) => {
    const requestId = ++loadRequestRef.current;
    try {
      const res = await adminApi.getUsers({ archived });
      if (requestId !== loadRequestRef.current) return;
      setUsers(res.data);
      setError('');
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      console.error(err);
      setError('Не удалось загрузить список пользователей. Попробуйте обновить страницу.');
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  };

  const loadTaskTypes = async () => {
    try {
      const res = await adminApi.getTaskTypes();
      setTaskTypes(res.data);
    } catch {
      setError('Не удалось загрузить типы задач');
    }
  };

  const addTaskType = async () => {
    if (!newTaskType.trim()) return;
    try {
      await adminApi.createTaskType(newTaskType.trim());
      setNewTaskType('');
      loadTaskTypes();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось добавить тип задачи');
    }
  };

  const removeTaskType = async (id: number) => {
    if (!confirm('Удалить этот тип задачи из списка?')) return;
    try {
      await adminApi.deleteTaskType(id);
      loadTaskTypes();
    } catch {
      setError('Не удалось удалить тип задачи');
    }
  };

  const loadTrash = async () => {
    try {
      const res = await adminApi.getTrash();
      setTrash(res.data);
    } catch {
      setError('Не удалось загрузить корзину');
    }
  };

  const restoreTrashItem = async (item: TrashItem) => {
    try {
      await adminApi.restoreTrash(item.type, item.id);
      loadTrash();
    } catch {
      setError('Не удалось восстановить');
    }
  };

  const purgeTrashItem = async (item: TrashItem) => {
    if (!confirm(`Удалить «${item.title}» навсегда? Это действие нельзя отменить.`)) return;
    try {
      await adminApi.purgeTrash(item.type, item.id);
      loadTrash();
    } catch {
      setError('Не удалось удалить окончательно');
    }
  };

  const archiveUser = async (targetId: number, name: string) => {
    if (!confirm(`Архивировать «${name}»? Вход в аккаунт будет заблокирован, но вся история (тесты, чек-листы) сохранится и её можно будет посмотреть через архив.`)) return;
    setArchivingId(targetId);
    try {
      await adminApi.archiveUser(targetId);
      load(showArchived);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось архивировать');
    } finally {
      setArchivingId(null);
    }
  };

  const restoreUser = async (targetId: number) => {
    setArchivingId(targetId);
    try {
      await adminApi.restoreUser(targetId);
      load(showArchived);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось восстановить');
    } finally {
      setArchivingId(null);
    }
  };

  const loadActivity = async (offset: number) => {
    setActivityLoading(true);
    try {
      const res = await leadApi.getActivity({ offset });
      setActivity(prev => offset === 0 ? res.data.rows : [...prev, ...res.data.rows]);
      setActivityHasMore(res.data.hasMore);
      setActivityOffset(offset);
    } catch {
      setError('Не удалось загрузить журнал активности');
    } finally {
      setActivityLoading(false);
    }
  };

  const loadOverview = async () => {
    try {
      const res = await adminApi.getOverview();
      setOverview(res.data);
    } catch {
      setError('Не удалось загрузить аналитику');
    }
  };

  const loadBonusCandidates = async () => {
    try {
      const res = await adminApi.getBonusCandidates();
      setBonusCandidates(res.data);
    } catch {
      setError('Не удалось загрузить кандидатов на премию');
    }
  };

  const changeRole = async (targetId: number, role: string, name: string) => {
    if (!window.confirm(`Изменить роль пользователя «${name}» на «${ROLE_LABELS[role] || role}»?`)) {
      // The native <select> already shows the picked option even though we're
      // bailing out — force a re-render so the controlled value snaps back.
      setUsers(u => [...u]);
      return;
    }
    setError('');
    setSavingId(targetId);
    const prev = users;
    // Optimistic update — the confirm-then-refetch round trip is
    // noticeable on a plain <select>, and a failure just gets reverted.
    setUsers(u => u.map(row => (row.id === targetId ? { ...row, role } : row)));
    try {
      await adminApi.setUserRole(targetId, role);
    } catch (err: any) {
      setUsers(prev);
      setError(err.response?.data?.error || 'Не удалось изменить роль');
    } finally {
      setSavingId(null);
    }
  };

  const resetPassword = async (targetId: number, name: string) => {
    if (!confirm(`Сбросить пароль пользователю «${name}»? Ему придёт новый временный пароль.`)) return;
    setResettingId(targetId);
    try {
      const res = await adminApi.resetPassword(targetId);
      const { delivered, tempPassword } = res.data;
      const message = delivered === 'none'
        ? `Не удалось доставить автоматически. Временный пароль: ${tempPassword} — передай лично.`
        : `Отправлено через ${delivered === 'telegram' ? 'Telegram' : 'почту'}.`;
      setResetResult({ id: targetId, message });
      load(showArchived);
    } catch (err: any) {
      setResetResult({ id: targetId, message: err.response?.data?.error || 'Не удалось сбросить пароль' });
    } finally {
      setResettingId(null);
    }
  };

  const filteredUsers = users.filter(u =>
    !search.trim() ||
    u.name.toLowerCase().includes(search.trim().toLowerCase()) ||
    u.email.toLowerCase().includes(search.trim().toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  // For resolving a permission/role-change/archive action's *target* name —
  // the activity log only stores their id (see utils/activity.ts).
  const usersNameById = Object.fromEntries(users.map(u => [u.id, u.name]));

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-5xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="mb-6">
          <h1 className="font-pixel text-primary mb-2" style={{ fontSize: '0.8rem', lineHeight: 1.8 }}>
            <span className="flex items-center gap-2"><PixelIcon name="crown" size={14} color="#EF9F27" /> Админка</span>
          </h1>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {(['users', 'activity', 'analytics', 'settings', 'trash'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded text-xs font-sans font-semibold"
              style={{
                background: tab === t ? '#1D9E75' : 'rgba(232,232,208,0.07)',
                color: tab === t ? '#0f0f1a' : 'rgba(232,232,208,0.7)',
              }}
            >
              {t === 'users' ? 'Пользователи' : t === 'activity' ? 'Активность' : t === 'analytics' ? 'Аналитика' : t === 'settings' ? 'Настройки' : 'Корзина'}
            </button>
          ))}
        </div>

        {error && (
          <div
            className="px-4 py-3 rounded text-sm font-sans mb-4"
            style={{
              background: 'rgba(224,82,82,0.1)',
              color: '#e05252',
              boxShadow: '1px 0 0 0 #e05252, -1px 0 0 0 #e05252, 0 1px 0 0 #e05252, 0 -1px 0 0 #e05252',
            }}
          >
            {error}
          </div>
        )}

        {tab === 'users' && (
          <>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <p className="text-pixel/60 text-sm font-sans">{filteredUsers.length} из {users.length}</p>
                <label className="flex items-center gap-1.5 text-xs font-sans cursor-pointer" style={{ color: 'rgba(232,232,208,0.6)' }}>
                  <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
                  Показать архив
                </label>
              </div>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по имени или email..."
                className="pixel-input text-xs"
                style={{ width: 260 }}
              />
            </div>

            <div className="space-y-2">
              {filteredUsers.map(row => (
                <div
                  key={row.id}
                  className="p-3 rounded flex items-center gap-4 flex-wrap"
                  style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.08)' }}
                >
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center font-pixel text-xs shrink-0"
                    style={{ background: '#1D9E75', color: '#0f0f1a' }}
                  >
                    {row.avatar_initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-pixel text-sm font-sans font-semibold flex items-center gap-1.5">
                      {row.name}
                      {!!row.has_telegram && <PixelIcon name="bug" size={10} color="#1D9E75" />}
                      {!!row.must_change_password && (
                        <span className="text-xs font-sans px-1.5 rounded" style={{ background: 'rgba(239,159,39,0.15)', color: '#EF9F27' }}>
                          ждёт смены пароля
                        </span>
                      )}
                    </p>
                    <p className="text-pixel/60 text-xs font-sans">{row.email}</p>
                    <p className="text-pixel/40 text-xs font-sans">
                      Последняя активность: {row.last_active ? parseServerDate(row.last_active).toLocaleString('ru-RU') : 'нет данных'}
                    </p>
                    {resetResult?.id === row.id && (
                      <p className="text-xs font-sans mt-1" style={{ color: '#1D9E75' }}>{resetResult.message}</p>
                    )}
                  </div>
                  {row.archived_at ? (
                    <button
                      onClick={() => restoreUser(row.id)}
                      disabled={archivingId === row.id}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      {archivingId === row.id ? '...' : '↺ Восстановить'}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => resetPassword(row.id, row.name)}
                        disabled={resettingId === row.id}
                        className="btn-secondary text-xs px-3 py-1.5"
                      >
                        {resettingId === row.id ? '...' : '🔑 Сбросить пароль'}
                      </button>
                      <button
                        onClick={() => archiveUser(row.id, row.name)}
                        disabled={archivingId === row.id || row.id === user.id}
                        className="btn-secondary text-xs px-3 py-1.5"
                        style={{ color: '#e05252' }}
                      >
                        {archivingId === row.id ? '...' : '🗄 Архивировать'}
                      </button>
                      <select
                        value={row.role}
                        onChange={e => changeRole(row.id, e.target.value, row.name)}
                        disabled={savingId === row.id || row.id === user.id}
                        className="pixel-input text-xs"
                        style={{ width: 140 }}
                        aria-label={`Роль пользователя ${row.name}`}
                      >
                        {ROLE_OPTIONS.map(r => (
                          <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              ))}
            </div>

            <p className="text-pixel/55 text-xs font-sans mt-4">
              Свою роль можно изменить только через другого администратора — это защита от случайной потери доступа.
              Архивированный сотрудник не может войти в аккаунт, но вся его история (тесты, чек-листы, активность) сохраняется.
            </p>
          </>
        )}

        {tab === 'activity' && (
          <>
            <div className="space-y-1">
              {activity.map(row => (
                <div key={row.id} className="p-2.5 rounded flex items-center justify-between gap-3" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.06)' }}>
                  <p className="text-xs font-sans" style={{ color: 'rgba(232,232,208,0.75)' }}>
                    <span className="font-semibold text-pixel">{row.name}</span> {actionLabel(row, usersNameById)}
                    {row.lecture_title && <span className="text-pixel/50"> — {row.lecture_title}</span>}
                  </p>
                  <span className="text-pixel/40 text-xs font-sans shrink-0">{parseServerDate(row.created_at).toLocaleString('ru-RU')}</span>
                </div>
              ))}
              {activity.length === 0 && !activityLoading && (
                <p className="text-pixel/50 text-sm font-sans">Пока нет активности.</p>
              )}
            </div>
            {activityHasMore && (
              <button
                onClick={() => loadActivity(activityOffset + 50)}
                disabled={activityLoading}
                className="btn-secondary text-xs px-4 py-2 mt-4"
              >
                {activityLoading ? '...' : 'Показать ещё'}
              </button>
            )}
          </>
        )}

        {tab === 'analytics' && (
          overview ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                {[
                  ['Всего пользователей', overview.totalUsers],
                  ['Тестировщиков', overview.byRole.tester || 0],
                  ['Тимлидов', overview.byRole.lead || 0],
                  ['Админов', overview.byRole.admin || 0],
                  ['Регистрация: email', overview.viaEmail],
                  ['Регистрация: Telegram', overview.viaTelegram],
                  ['Активны за 7 дней', overview.active7d],
                  ['Активны за 30 дней', overview.active30d],
                  ['Ждут смены пароля', overview.pendingPasswordResets],
                  ['Отправлено чек-листов', overview.totalSubmissions],
                  ['Курсов создано', overview.totalCourses],
                  ['Гайдов создано', overview.totalGuides],
                  ['Примеров багов', overview.totalBugExamples],
                ].map(([label, value]) => (
                  <div key={label as string} className="p-4 rounded" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.08)' }}>
                    <p className="text-primary font-pixel" style={{ fontSize: '0.9rem' }}>{value as number}</p>
                    <p className="text-pixel/60 text-xs font-sans mt-1">{label}</p>
                  </div>
                ))}
              </div>

              <h2 className="font-pixel text-pixel mb-3" style={{ fontSize: '0.6rem', lineHeight: 1.8 }}>Кандидаты на премию (30 дней)</h2>
              <p className="text-pixel/50 text-xs font-sans mb-3">Реальные бонусы/повышения — решение за вами; это только исходные данные.</p>
              {bonusCandidates ? (
                <div className="space-y-1.5">
                  {bonusCandidates.map((c: any) => (
                    <div key={c.id} className="p-2.5 rounded flex items-center justify-between gap-3 flex-wrap" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.06)' }}>
                      <span className="text-pixel text-sm font-sans font-semibold">{c.name}</span>
                      <span className="text-pixel/60 text-xs font-sans">
                        {c.quizzesLast30d} тестов · {c.avgScoreLast30d ?? '—'}% ср. балл · {c.submissionsLast30d} чек-листов · получено премий: {c.totalBonusReceived}
                      </span>
                    </div>
                  ))}
                </div>
              ) : <SnailLoader />}
            </>
          ) : (
            <SnailLoader />
          )
        )}

        {tab === 'settings' && (
          <div>
            <h2 className="font-pixel text-pixel mb-3" style={{ fontSize: '0.6rem', lineHeight: 1.8 }}>Типы задач для чек-листов</h2>
            <p className="text-pixel/50 text-xs font-sans mb-3">Этот список появляется в выпадающем меню при отправке чек-листа. Тестировщик всё ещё может ввести свой вариант вручную.</p>
            {taskTypes ? (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  {taskTypes.map(t => (
                    <span key={t.id} className="flex items-center gap-1.5 text-xs font-sans px-2.5 py-1 rounded" style={{ background: 'rgba(232,232,208,0.07)', color: 'rgba(232,232,208,0.8)' }}>
                      {t.name}
                      <button onClick={() => removeTaskType(t.id)} aria-label={`Удалить тип ${t.name}`} style={{ color: '#e05252' }}>✕</button>
                    </span>
                  ))}
                  {taskTypes.length === 0 && <p className="text-pixel/40 text-xs font-sans">Список пуст.</p>}
                </div>
                <div className="flex gap-2 max-w-sm">
                  <input
                    className="pixel-input text-xs"
                    placeholder="Новый тип задачи"
                    value={newTaskType}
                    onChange={e => setNewTaskType(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addTaskType()}
                  />
                  <button onClick={addTaskType} className="btn-primary text-xs px-4 py-2 shrink-0">Добавить</button>
                </div>
              </>
            ) : <SnailLoader />}
          </div>
        )}

        {tab === 'trash' && (
          <div>
            <p className="text-pixel/50 text-xs font-sans mb-4">Курсы, примеры багов, термины глоссария и гайды — удалённое отсюда можно вернуть, пока не нажали «Удалить навсегда».</p>
            {trash ? (
              trash.length === 0 ? (
                <p className="text-pixel/50 text-sm font-sans">Корзина пуста.</p>
              ) : (
                <div className="space-y-1.5">
                  {trash.map(item => (
                    <div key={`${item.type}-${item.id}`} className="p-3 rounded flex items-center justify-between gap-3 flex-wrap" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.08)' }}>
                      <div>
                        <span className="text-xs font-sans px-1.5 py-0.5 rounded mr-2" style={{ background: 'rgba(232,232,208,0.08)', color: 'rgba(232,232,208,0.5)' }}>{item.typeLabel}</span>
                        <span className="text-pixel text-sm font-sans">{item.title}</span>
                        <span className="text-pixel/40 text-xs font-sans ml-2">удалено {parseServerDate(item.deleted_at).toLocaleString('ru-RU')}</span>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => restoreTrashItem(item)} className="btn-secondary text-xs px-3 py-1.5">↺ Вернуть</button>
                        <button onClick={() => purgeTrashItem(item)} className="btn-secondary text-xs px-3 py-1.5" style={{ color: '#e05252' }}>Удалить навсегда</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : <SnailLoader />}
          </div>
        )}
      </div>
    </div>
  );
}
