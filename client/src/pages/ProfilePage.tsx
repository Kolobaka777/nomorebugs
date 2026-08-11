import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import Icon from '../components/Icon';
import ProfileEditModal from '../components/ProfileEditModal';
import PixelAvatar from '../components/PixelAvatar';
import { testerApi, leadApi, adminApi } from '../api';
import { FullProfile } from '../types';
import { parseServerDate } from '../utils/date';
import { showApiError } from '../utils/toast';
import { ROLE_LABELS } from '../utils/roles';
import { formatActivityAction } from '../utils/activity';
import {
  PAGE_GRADIENT, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, BADGE_NOTIFY, TRACK_WIDE, CARD_SHADOW,
} from '../utils/theme';

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
  const [recentBonuses, setRecentBonuses] = useState<any[] | null>(null);
  // Activity actions like "permission_granted:target=4:..." only name their
  // target by id — resolved to a real name here (best-effort; falls back to
  // "#id" for anyone not in this map) so "Моя активность" below reads like
  // a sentence instead of a raw log line.
  const [nameById, setNameById] = useState<Record<number, string>>({});

  useEffect(() => {
    testerApi.getProfileFull().then(r => {
      setProfile(r.data);
      // The nav dropdown reads user.displayName from localStorage, which is
      // only ever set at login or after actively editing the nickname here —
      // without this, a nickname set in an earlier session (or on another
      // device) keeps showing the real name in the nav even while this very
      // page correctly shows the nickname, since the two read from different
      // places.
      const nickname = r.data.nickname?.trim();
      if (nickname && nickname !== user.name && nickname !== user.displayName) {
        onUserUpdate?.({ displayName: nickname });
      }
      // Same staleness problem as displayName — gender set on another
      // device/session wouldn't otherwise reach the localStorage user
      // object that HomePage etc. read it from.
      if (r.data.gender !== undefined && r.data.gender !== user.gender) {
        onUserUpdate?.({ gender: r.data.gender });
      }
    })
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
      adminApi.getUsers().then(r => setNameById(Object.fromEntries(r.data.map((u: any) => [u.id, u.name]))))
        .catch(() => {}); // Purely cosmetic (activity-feed name resolution) — silent fallback to "#id" is fine.
    } else if (user.role === 'lead') {
      leadApi.getTeam().then(r => {
        setRoleStats({
          'Размер команды': r.data.length,
          'Средний балл команды': r.data.length ? Math.round(r.data.reduce((s: number, m: any) => s + m.avgScore, 0) / r.data.length) : 0,
        });
        setNameById(Object.fromEntries(r.data.map((m: any) => [m.id, m.name])));
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
    custom_avatar: null, gender: null, bug_coins: 0, purchased_items: [],
    stats: { int: 0, per: 0, spd: 0, def: 0, bug_pwr: 0 },
    streak: 0, cards: [], badges: [], craftable: [], favLecture: null,
    lecturesCompleted: 0, averageScore: 0,
    coursesProposed: 0, coursesApproved: 0, guidesProposed: 0, guidesApproved: 0,
  } as FullProfile;

  const shown = profile ?? defaultProfile;

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="rounded-lg p-6 mb-6 flex items-center gap-5 flex-wrap" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.2)', boxShadow: CARD_SHADOW }}>
          <PixelAvatar id={shown.avatar_id as any} frame={shown.avatar_frame as any} customSrc={shown.custom_avatar} size={72} />
          <div className="flex-1 min-w-0">
            <h1 className="font-montserrat font-bold mb-1" style={{ fontSize: 22, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>{shown.nickname || shown.name}</h1>
            <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>{shown.email}</p>
            <p className="font-geist text-xs mt-1 flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
              <Icon name="crown" size={14} color={BADGE_NOTIFY} /> {ROLE_LABELS[user.role] || user.role}
              {shown.specialization && ` · ${shown.specialization}`}
            </p>
            <p className="font-geist text-xs mt-1" style={{ color: TEXT_MUTED }}>
              В команде с {parseServerDate(shown.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            {shown.status_quote && <p className="font-geist text-sm italic mt-2" style={{ color: 'rgba(197, 198, 199, 0.7)' }}>«{shown.status_quote}»</p>}
          </div>
          <button onClick={() => setEditing(true)} className="btn-secondary text-xs px-4 py-2 shrink-0">
            Редактировать профиль
          </button>
        </div>

        {roleStats && (
          <div className={`grid ${Object.keys(roleStats).length >= 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-3 mb-6`}>
            {Object.entries(roleStats).map(([label, value]) => (
              <div key={label} className="p-4 rounded-lg text-center" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.2)', boxShadow: CARD_SHADOW }}>
                <p className="font-montserrat font-bold" style={{ color: ACCENT, fontSize: 18 }}>{value}</p>
                <p className="font-geist text-xs mt-1" style={{ color: TEXT_MUTED }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Quick links — shortcuts to the things this role actually uses
            most, so the profile is a useful landing spot, not a dead end. */}
        <div className="flex gap-2 flex-wrap mb-6">
          {user.role === 'lead' && (
            <>
              <button onClick={() => navigate('/dashboard')} className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"><Icon name="bee" size={14} color="currentColor" /> Команда</button>
              <button onClick={() => navigate('/lead/course-builder')} className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"><Icon name="pencil" size={14} color="currentColor" /> Создать курс</button>
            </>
          )}
          {user.role === 'admin' && (
            <>
              <button onClick={() => navigate('/admin')} className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"><Icon name="gear" size={14} color="currentColor" /> Админка</button>
              <button onClick={() => navigate('/dashboard')} className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"><Icon name="bee" size={14} color="currentColor" /> Команда</button>
            </>
          )}
        </div>

        {user.role === 'lead' && recentBonuses !== null && recentBonuses.length > 0 && (
          <div className="rounded-lg p-5 mb-6" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.2)', boxShadow: CARD_SHADOW }}>
            <h2 className="font-montserrat font-semibold text-sm mb-3 flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
              <Icon name="trophy" size={16} color={BADGE_NOTIFY} /> Недавние премии в команде
            </h2>
            <div className="space-y-1.5">
              {recentBonuses.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between font-geist text-xs" style={{ color: 'rgba(197, 198, 199, 0.7)' }}>
                  <span>{b.user_name} — {b.amount} баллов{b.reason ? `: «${b.reason}»` : ''}</span>
                  <span className="shrink-0" style={{ color: TEXT_MUTED }}>{parseServerDate(b.awarded_at).toLocaleDateString('ru-RU')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg p-5" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.2)', boxShadow: CARD_SHADOW }}>
          <h2 className="font-montserrat font-semibold text-sm mb-3" style={{ color: TEXT_PRIMARY }}>Моя активность</h2>
          {activity.length === 0 ? (
            <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>Пока нет активности.</p>
          ) : (
            <div className="space-y-1.5">
              {activity.map(a => (
                <div key={a.id} className="flex items-center justify-between font-geist text-xs" style={{ color: 'rgba(197, 198, 199, 0.7)' }}>
                  <span>{formatActivityAction(a.action, { lectureTitle: a.lecture_title, courseTitle: a.course_title, nameById, gender: shown.gender })}</span>
                  <span className="shrink-0" style={{ color: TEXT_MUTED }}>{parseServerDate(a.created_at).toLocaleString('ru-RU')}</span>
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
            // gender rides along the same way — it's read from `user` in
            // several places (see HomePage's own-activity text) that don't
            // otherwise refetch the profile.
            onUserUpdate?.({ displayName: patch.nickname?.trim() || user.name, gender: patch.gender ?? null });
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
