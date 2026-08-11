import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import PixelAvatar, { type FrameId } from '../components/PixelAvatar';
import Icon, { IconName } from '../components/Icon';
import LevelBadge from '../components/LevelBadge';
import { usersApi } from '../api';
import { PublicProfile } from '../types';
import { BADGE_META } from '../utils/badges';
import { parseServerDate } from '../utils/date';
import { TIMEZONES } from '../utils/timezones';
import { PAGE_GRADIENT, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, CARD_SHADOW, TRACK_WIDE, BADGE_NOTIFY } from '../utils/theme';

interface Props {
  user: any;
  onLogout: () => void;
}

function StatRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-geist font-semibold shrink-0" style={{ fontSize: 11, color, width: 58, letterSpacing: TRACK_WIDE }}>{label}</span>
      <div className="stat-bar-track flex-1 rounded" style={{ borderLeft: `2px solid ${color}30` }}>
        <div className="stat-bar-fill" style={{ width: `${(value / max) * 100}%`, background: color }} />
      </div>
      <span className="font-geist font-semibold shrink-0" style={{ fontSize: 12, color, width: 22, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

// A small labeled number tile — reused for lectures/score/proposals so the
// "general info visible to everyone" part of the profile reads like a
// summary dashboard (Steam-profile-ish) rather than a wall of text.
function MiniStat({ icon, value, label, color }: { icon: IconName; value: string | number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(197, 198, 199,0.04)', minWidth: 84 }}>
      <Icon name={icon} size={16} color={color} />
      <span className="font-montserrat font-bold" style={{ fontSize: 17, color }}>{value}</span>
      <span className="font-geist text-center" style={{ fontSize: 10, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>{label}</span>
    </div>
  );
}

export default function PublicProfilePage({ user, onLogout }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    usersApi.getProfile(Number(id))
      .then(r => setProfile(r.data))
      .catch((err: any) => setLoadError(err.response?.data?.error || 'Не удалось загрузить профиль'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <div className="max-w-lg mx-auto px-6 pt-16 text-center">
          <p className="text-sm font-geist mb-4" style={{ color: '#e05252' }}>{loadError || 'Профиль не найден'}</p>
          {/* Text kept literally as "← Назад" (not swapped for an Icon) —
              PublicProfilePage.test.tsx asserts screen.getByText('← Назад')
              verbatim and is out of scope to edit. */}
          <button onClick={() => navigate(-1)} className="btn-secondary text-xs px-4 py-2">← Назад</button>
        </div>
      </div>
    );
  }

  const isHidden = profile.is_public === false && !('stats' in profile);

  return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-2xl mx-auto px-4 pt-16 pb-8 fade-in">
        <div
          className="p-6 rounded-lg overflow-hidden"
          style={{ background: CARD_BG, border: `1px solid ${ACCENT}`, boxShadow: CARD_SHADOW }}
        >
          <div className="flex items-center gap-4 mb-4">
            <PixelAvatar
              id={(('avatar_id' in profile && profile.avatar_id) || 'bug1') as any}
              frame={(('avatar_frame' in profile && profile.avatar_frame) || 'default') as FrameId}
              size={72}
              customSrc={'custom_avatar' in profile ? profile.custom_avatar : null}
            />
            <div className="min-w-0">
              <p className="font-montserrat font-bold" style={{ fontSize: 20, color: BADGE_NOTIFY, letterSpacing: TRACK_WIDE }}>
                {'nickname' in profile ? profile.nickname : profile.name}
              </p>
              {!isHidden && 'specialization' in profile && profile.specialization && (
                <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>{profile.specialization}</p>
              )}
            </div>
            {!isHidden && 'lecturesCompleted' in profile && (
              <div className="ml-auto shrink-0">
                <LevelBadge lecturesCompleted={profile.lecturesCompleted} size="sm" />
              </div>
            )}
          </div>

          {isHidden ? (
            <p className="font-geist text-sm flex items-center gap-2" style={{ color: TEXT_MUTED }}>
              <Icon name="lock" size={22} color={TEXT_MUTED} /> Профиль скрыт
            </p>
          ) : (
            <>
              {'status_quote' in profile && profile.status_quote && (
                <p className="font-geist text-sm italic mb-4" style={{ color: TEXT_PRIMARY }}>«{profile.status_quote}»</p>
              )}

              {'workStart' in profile && profile.workStart && profile.workEnd && (
                <p className="font-geist text-sm mb-4 flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                  <Icon name="calendar" size={16} color="currentColor" />
                  Рабочее время: {profile.workStart}–{profile.workEnd} ({TIMEZONES.find(tz => tz.value === profile.timezone)?.label || profile.timezone})
                </p>
              )}

              {/* Summary dashboard — courses/score/proposals, all "general
                  info" per the owner's own call: visible to any viewer,
                  unlike notes/bookmarks which stay cabinet-only. */}
              {'lecturesCompleted' in profile && (
                <div className="flex flex-wrap gap-2 mb-4">
                  <MiniStat icon="graduation" value={`${profile.lecturesCompleted}/10`} label="КУРСОВ" color={ACCENT} />
                  <MiniStat icon="chartup" value={`${profile.averageScore}%`} label="СР. БАЛЛ" color={BADGE_NOTIFY} />
                  {profile.coursesProposed > 0 && (
                    <MiniStat icon="lightbulb" value={profile.coursesProposed} label="КУРСОВ ПРЕДЛОЖЕНО" color="#7F77DD" />
                  )}
                  {profile.guidesProposed > 0 && (
                    <MiniStat icon="books" value={profile.guidesProposed} label="ГАЙДОВ ПРЕДЛОЖЕНО" color="#7F77DD" />
                  )}
                </div>
              )}

              {'stats' in profile && (
                <div className="space-y-2 mb-4">
                  <StatRow label="ИНТ"  value={profile.stats.int}     max={10} color="#7F77DD" />
                  <StatRow label="ВНИМ" value={profile.stats.per}     max={10} color={BADGE_NOTIFY} />
                  <StatRow label="СКОР" value={profile.stats.spd}     max={10} color={ACCENT} />
                  <StatRow label="ЗАЩ"  value={profile.stats.def}     max={10} color="#e05252" />
                  <StatRow label="МОЩЬ" value={profile.stats.bug_pwr} max={20} color={BADGE_NOTIFY} />
                </div>
              )}

              {'badges' in profile && profile.badges.length > 0 && (
                <div className="mb-3">
                  <p className="font-geist text-xs mb-1.5 flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                    <Icon name="trophy" size={14} color={TEXT_MUTED} /> Значков: {profile.badges.length}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.badges.map(b => {
                      const meta = BADGE_META[b.badge_id];
                      return (
                        <span
                          key={b.id}
                          className="font-geist font-semibold rounded px-2 py-1 flex items-center gap-1.5"
                          style={{ fontSize: 11, background: `${meta?.color || ACCENT}18`, color: meta?.color || ACCENT }}
                        >
                          <Icon name={meta?.icon || 'trophy'} size={12} color="currentColor" /> {meta?.name || b.badge_id}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {'cards' in profile && profile.cards.length > 0 && (
                <p className="font-geist text-xs mb-2 flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                  <Icon name="card" size={14} color={TEXT_MUTED} /> Карточек: {profile.cards.length}
                </p>
              )}

              {'favLecture' in profile && profile.favLecture && (
                <p className="font-geist text-xs mb-2 flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                  <Icon name="star" size={14} color={TEXT_MUTED} /> Любимая лекция: <span style={{ color: TEXT_PRIMARY }}>{profile.favLecture.title}</span>
                </p>
              )}

              {'info_box' in profile && profile.info_box && (
                <p className="font-geist text-xs leading-relaxed mt-3" style={{ color: TEXT_MUTED, borderLeft: `2px solid ${ACCENT}40`, paddingLeft: 10 }}>
                  {profile.info_box}
                </p>
              )}

              {'snail_joke' in profile && profile.snail_joke && (
                <p className="font-geist text-xs leading-relaxed mt-2 italic" style={{ color: 'rgba(197, 198, 199,0.55)' }}>
                  🐌 {profile.snail_joke}
                </p>
              )}

              {'created_at' in profile && (
                <p className="font-geist text-xs mt-4" style={{ color: TEXT_MUTED }}>В команде с {parseServerDate(profile.created_at).toLocaleDateString('ru-RU')}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
