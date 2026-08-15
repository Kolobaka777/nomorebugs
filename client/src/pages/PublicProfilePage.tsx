import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import FrogLoader from '../components/FrogLoader';
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

// Same palette as MoyaNora's own "Коллекция" tab — kept as its own local
// copy rather than extracted to a shared util for two small lookup tables.
const RARITY_COLORS: Record<string, string> = { common: ACCENT, rare: '#7F77DD', epic: '#EF9F27' };
const RARITY_LABEL: Record<string, string> = { common: '', rare: 'RARE', epic: 'EPIC' };
const WEEKDAY_LABELS: [string, string][] = [['1', 'Пн'], ['2', 'Вт'], ['3', 'Ср'], ['4', 'Чт'], ['5', 'Пт'], ['6', 'Сб'], ['7', 'Вс']];
const ROLE_LABELS: Record<string, string> = { tester: 'Тестировщик', lead: 'Тимлид', admin: 'Админ' };

// Birthday is stored as 'MM-DD' (no year — see server/src/routes/presence.js).
// Same formatting MoyaNora's own presence tab uses for its own birthday.
const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function formatBirthday(mmdd: string): string {
  const [mm, dd] = mmdd.split('-').map(Number);
  const month = MONTHS_GENITIVE[mm - 1];
  return month ? `${dd} ${month}` : mmdd;
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

// A small labeled number tile — reused for lectures/score/streak so the
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
        <FrogLoader />
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <div className="max-w-lg mx-auto px-6 pt-16 text-center">
          <p className="text-sm font-geist mb-4 break-words" style={{ color: '#e05252' }}>{loadError || 'Профиль не найден'}</p>
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
              id={(('avatar_id' in profile && profile.avatar_id) || 'frog1') as any}
              frame={(('avatar_frame' in profile && profile.avatar_frame) || 'default') as FrameId}
              size={72}
              customSrc={'custom_avatar' in profile ? profile.custom_avatar : null}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-montserrat font-bold break-words" style={{ fontSize: 20, color: BADGE_NOTIFY, letterSpacing: TRACK_WIDE }}>
                  {'nickname' in profile ? profile.nickname : profile.name}
                </p>
                {!isHidden && 'role' in profile && profile.role && ROLE_LABELS[profile.role] && (
                  <span
                    className="font-geist font-semibold rounded px-2 py-0.5 shrink-0"
                    style={{ fontSize: 10, letterSpacing: TRACK_WIDE, background: `${ACCENT}18`, color: ACCENT, border: `1px solid ${ACCENT}55` }}
                  >
                    {ROLE_LABELS[profile.role].toUpperCase()}
                  </span>
                )}
              </div>
              {!isHidden && 'specialization' in profile && profile.specialization && (
                <p className="font-geist text-sm break-words" style={{ color: TEXT_MUTED }}>{profile.specialization}</p>
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
                <p className="font-geist text-sm italic mb-4 break-words" style={{ color: TEXT_PRIMARY }}>«{profile.status_quote}»</p>
              )}

              {(('birthday' in profile && profile.birthday) || ('workStart' in profile && profile.workStart && profile.workEnd)) && (
                <div className="space-y-1 mb-4">
                  {'birthday' in profile && profile.birthday && (
                    <p className="font-geist text-sm flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                      <Icon name="star" size={16} color="currentColor" />
                      День рождения: {formatBirthday(profile.birthday)}
                    </p>
                  )}
                  {'workStart' in profile && profile.workStart && profile.workEnd && (
                    <p className="font-geist text-sm flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                      <Icon name="calendar" size={16} color="currentColor" />
                      Рабочее время: {profile.workStart}–{profile.workEnd} ({TIMEZONES.find(tz => tz.value === profile.timezone)?.label || profile.timezone})
                      {'workDays' in profile && profile.workDays && (
                        <span style={{ color: 'rgba(197, 198, 199,0.5)' }}>
                          · {WEEKDAY_LABELS.filter(([d]) => profile.workDays!.split(',').includes(d)).map(([, l]) => l).join(', ')}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              )}

              {/* Summary dashboard — courses/score/streak, all "general
                  info" per the owner's own call: visible to any viewer,
                  unlike bookmarks/premium points/proposals which stay
                  cabinet-only (see profile.js's payload-stripping comment). */}
              {'lecturesCompleted' in profile && (
                <div className="flex flex-wrap gap-2 mb-4">
                  <MiniStat icon="graduation" value={`${profile.lecturesCompleted}/10`} label="КУРСОВ" color={ACCENT} />
                  <MiniStat icon="chartup" value={`${profile.averageScore}%`} label="СР. БАЛЛ" color={BADGE_NOTIFY} />
                  {'streak' in profile && profile.streak > 0 && (
                    <MiniStat icon="lightning" value={profile.streak} label="ДНЕЙ ПОДРЯД" color="#EF9F27" />
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
                <div className="mb-4">
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

              {/* Card collection — a real grid (rarity-colored tiles, same
                  as MoyaNora's own "Коллекция" tab), not just a count —
                  the Steam-profile "inventory showcase" this whole
                  expansion is aiming for. */}
              {'cards' in profile && profile.cards.length > 0 && (
                <div className="mb-4">
                  <p className="font-geist text-xs mb-1.5 flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                    <Icon name="card" size={14} color={TEXT_MUTED} /> Карточек: {profile.cards.length}
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {profile.cards.map(c => {
                      const color = RARITY_COLORS[c.rarity] || ACCENT;
                      return (
                        <div key={c.id} className="rounded-lg p-2.5" style={{ background: 'rgba(197, 198, 199,0.04)', border: `1px solid ${color}40` }}>
                          <p className="font-geist font-semibold" style={{ fontSize: 9, color, letterSpacing: TRACK_WIDE }}>{RARITY_LABEL[c.rarity] || 'CARD'}</p>
                          <p className="font-geist text-xs font-semibold mt-0.5 break-words" style={{ color: TEXT_PRIMARY }}>{c.skill_area}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {'favLecture' in profile && profile.favLecture && (
                <p className="font-geist text-xs mb-2 flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                  <Icon name="star" size={14} color={TEXT_MUTED} />
                  Любимая лекция: <span className="break-words min-w-0" style={{ color: TEXT_PRIMARY }}>{profile.favLecture.title}</span>
                  {typeof profile.favLecture.score === 'number' && (
                    <span style={{ color: 'rgba(197, 198, 199,0.5)' }}>({profile.favLecture.score}%)</span>
                  )}
                </p>
              )}

              {'info_box' in profile && profile.info_box && (
                <p className="font-geist text-xs leading-relaxed mt-3 break-words" style={{ color: TEXT_MUTED, borderLeft: `2px solid ${ACCENT}40`, paddingLeft: 10 }}>
                  {profile.info_box}
                </p>
              )}

              {'snail_joke' in profile && profile.snail_joke && (
                <p className="font-geist text-xs leading-relaxed mt-2 italic break-words" style={{ color: 'rgba(197, 198, 199,0.55)' }}>
                  🐸 {profile.snail_joke}
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