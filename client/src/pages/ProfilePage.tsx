import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import PixelIcon from '../components/PixelIcon';
import ProfileEditModal from '../components/ProfileEditModal';
import PixelAvatar from '../components/PixelAvatar';
import { testerApi, leadApi, adminApi } from '../api';
import { FullProfile } from '../types';
import { parseServerDate } from '../utils/date';
import { showApiError } from '../utils/toast';
import { ROLE_LABELS } from '../utils/roles';

interface Props {
  user: any;
  onLogout: () => void;
  onUserUpdate?: (patch: Record<string, any>) => void;
}

// The dedicated profile page lead/admin didn't have before — they only got
// a quick-edit modal from the nav dropdown. Testers keep using their much
// richer /cabinet (Моя нора) instead; this isn't meant to duplicate that.
export default function ProfilePage({ user, onLogout, onUserUpdate }: Props) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [activity, setActivity] = useState<any[]>([]);
  const [roleStats, setRoleStats] = useState<Record<string, number> | null>(null);
  const [needsCheckIn, setNeedsCheckIn] = useState<{ id: number; name: string }[]>([]);
  const [recentBonuses, setRecentBonuses] = useState<any[] | null>(null);

  useEffect(() => {
    testerApi.getProfileFull().then(r => setProfile(r.data))
      // Falls back to `defaultProfile` below on failure — that fallback is
      // deliberate (better than a blank page), but silently showing zeroed
      // stats with no explanation reads as "you have no data" rather than
      // "this failed to load", so it still needs a toast.
      .catch((err: any) => showApiError(err, 'Не удалось загрузить профиль'))
      .finally(() => setLoading(false));
    leadApi.getActivity({ user_id: user.id }).then(r => setActivity(r.data.rows.slice(0, 10)))
      .catch((err: any) => showApiError(err, 'Не удалось загрузить активность'));

    if (user.role === 'admin') {
      adminApi.getOverview().then(r => setRoleStats({
        'Всего пользователей': r.data.totalUsers,
        'Тестировщиков': r.data.byRole.tester || 0,
        'Активны за 7 дней': r.data.active7d,
      })).catch((err: any) => showApiError(err, 'Не удалось загрузить статистику'));
    } else if (user.role === 'lead') {
      leadApi.getTeam().then(r => {
        setRoleStats({
          'Размер команды': r.data.length,
          'Средний балл команды': r.data.length ? Math.round(r.data.reduce((s: number, m: any) => s + m.avgScore, 0) / r.data.length) : 0,
          'Нужен чек-ин': r.data.filter((m: any) => m.needsCheckIn).length,
        });
        setNeedsCheckIn(r.data.filter((m: any) => m.needsCheckIn).map((m: any) => ({ id: m.id, name: m.name })));
      }).catch((err: any) => showApiError(err, 'Не удалось загрузить статистику команды'));
      leadApi.getBonusAwards().then(r => setRecentBonuses(r.data.slice(0, 5)))
        .catch((err: any) => showApiError(err, 'Не удалось загрузить историю премий'));
    }
  }, []);

  const defaultProfile: FullProfile = {
    id: user.id, email: user.email, name: user.name,
    avatar_initials: user.avatar_initials,
    created_at: new Date().toISOString(),
    nickname: user.name, status_quote: '', specialization: '',
    info_box: '', snail_joke: '', avatar_id: 'bug1',
    avatar_frame: 'default', profile_bg: 'default',
    showcase_badges: [], favorite_lecture_id: null, is_public: true,
    custom_avatar: null, bug_coins: 0, purchased_items: [],
    stats: { int: 0, per: 0, spd: 0, def: 0, bug_pwr: 0 },
    streak: 0, cards: [], badges: [], craftable: [], favLecture: null,
  } as FullProfile;

  const shown = profile ?? defaultProfile;

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="rounded-lg p-6 mb-6 flex items-center gap-5 flex-wrap" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.08)' }}>
          <PixelAvatar id={shown.avatar_id as any} frame={shown.avatar_frame as any} customSrc={shown.custom_avatar} size={72} />
          <div className="flex-1 min-w-0">
            <h1 className="font-pixel text-primary mb-1" style={{ fontSize: '0.75rem', lineHeight: 1.8 }}>{shown.nickname || shown.name}</h1>
            <p className="text-pixel/60 text-sm font-sans">{shown.email}</p>
            <p className="text-pixel/50 text-xs font-sans mt-1 flex items-center gap-1.5">
              <PixelIcon name="crown" size={11} color="#EF9F27" /> {ROLE_LABELS[user.role] || user.role}
              {shown.specialization && ` · ${shown.specialization}`}
            </p>
            <p className="text-pixel/40 text-xs font-sans mt-1">
              В команде с {parseServerDate(shown.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            {shown.status_quote && <p className="text-pixel/70 text-sm font-sans italic mt-2">«{shown.status_quote}»</p>}
          </div>
          <button onClick={() => setEditing(true)} className="btn-secondary text-xs px-4 py-2 shrink-0">
            Редактировать профиль
          </button>
        </div>

        {roleStats && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {Object.entries(roleStats).map(([label, value]) => (
              <div key={label} className="p-4 rounded text-center" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.08)' }}>
                <p className="text-primary font-pixel" style={{ fontSize: '0.9rem' }}>{value}</p>
                <p className="text-pixel/60 text-xs font-sans mt-1">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Quick links — shortcuts to the things this role actually uses
            most, so the profile is a useful landing spot, not a dead end. */}
        <div className="flex gap-2 flex-wrap mb-6">
          {user.role === 'lead' && (
            <>
              <button onClick={() => navigate('/dashboard')} className="btn-secondary text-xs px-3 py-2">🐝 Команда</button>
              <button onClick={() => navigate('/checklists')} className="btn-secondary text-xs px-3 py-2">📋 Отчёты по чек-листам</button>
              <button onClick={() => navigate('/lead/course-builder')} className="btn-secondary text-xs px-3 py-2">✎ Создать курс</button>
            </>
          )}
          {user.role === 'admin' && (
            <>
              <button onClick={() => navigate('/admin')} className="btn-secondary text-xs px-3 py-2">⚙ Админка</button>
              <button onClick={() => navigate('/dashboard')} className="btn-secondary text-xs px-3 py-2">🐝 Команда</button>
            </>
          )}
        </div>

        {user.role === 'lead' && needsCheckIn.length > 0 && (
          <div className="rounded-lg p-5 mb-6" style={{ background: 'rgba(239,159,39,0.08)', border: '1px solid rgba(239,159,39,0.25)' }}>
            <h2 className="font-pixel mb-2 flex items-center gap-2" style={{ fontSize: '0.6rem', lineHeight: 1.8, color: '#EF9F27' }}>
              <PixelIcon name="user" size={12} color="#EF9F27" /> Возможно, стоит написать
            </h2>
            <p className="text-pixel/60 text-xs font-sans mb-2">Не заходили неделю или больше — недельная тишина не всегда про лень:</p>
            <div className="flex flex-wrap gap-1.5">
              {needsCheckIn.map(m => (
                <span key={m.id} className="text-xs font-sans px-2 py-1 rounded" style={{ background: 'rgba(239,159,39,0.15)', color: '#EF9F27' }}>
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {user.role === 'lead' && recentBonuses !== null && recentBonuses.length > 0 && (
          <div className="rounded-lg p-5 mb-6" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.08)' }}>
            <h2 className="font-pixel text-pixel mb-3" style={{ fontSize: '0.6rem', lineHeight: 1.8 }}>🏆 Недавние премии в команде</h2>
            <div className="space-y-1.5">
              {recentBonuses.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between text-xs font-sans" style={{ color: 'rgba(232,232,208,0.7)' }}>
                  <span>{b.user_name} — {b.amount} баллов{b.reason ? `: «${b.reason}»` : ''}</span>
                  <span className="text-pixel/40 shrink-0">{parseServerDate(b.awarded_at).toLocaleDateString('ru-RU')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg p-5" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.08)' }}>
          <h2 className="font-pixel text-pixel mb-3" style={{ fontSize: '0.6rem', lineHeight: 1.8 }}>Моя активность</h2>
          {activity.length === 0 ? (
            <p className="text-pixel/50 text-sm font-sans">Пока нет активности.</p>
          ) : (
            <div className="space-y-1.5">
              {activity.map(a => (
                <div key={a.id} className="flex items-center justify-between text-xs font-sans" style={{ color: 'rgba(232,232,208,0.7)' }}>
                  <span>{a.action}{a.lecture_title ? ` — ${a.lecture_title}` : ''}</span>
                  <span className="text-pixel/40 shrink-0">{parseServerDate(a.created_at).toLocaleString('ru-RU')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <ProfileEditModal
          profile={shown}
          passedLectures={[]}
          unlockedFrames={['default', 'code']}
          unlockedBgs={['default', 'forest', 'console']}
          onSave={patch => {
            setProfile(p => ({ ...(p ?? defaultProfile), ...patch }));
            // Keeps the nav dropdown's name in sync — it reads the shared
            // user object, not this page's own profile state, so without
            // this it kept showing the login-time name after a nickname edit.
            onUserUpdate?.({ displayName: patch.nickname?.trim() || user.name });
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
