import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import PixelAvatar, { type FrameId } from '../components/PixelAvatar';
import PixelIcon from '../components/PixelIcon';
import { usersApi } from '../api';
import { PublicProfile } from '../types';
import { parseServerDate } from '../utils/date';
import { TIMEZONES } from '../utils/timezones';

interface Props {
  user: any;
  onLogout: () => void;
}

function StatRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-pixel shrink-0" style={{ fontSize: '0.6rem', color, width: 58, lineHeight: 2 }}>{label}</span>
      <div className="stat-bar-track flex-1" style={{ borderLeft: `2px solid ${color}30` }}>
        <div className="stat-bar-fill" style={{ width: `${(value / max) * 100}%`, background: color }} />
      </div>
      <span className="font-pixel shrink-0" style={{ fontSize: '0.6rem', color, width: 22, textAlign: 'right', lineHeight: 2 }}>
        {value}
      </span>
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
      <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
        <Navigation user={user} onLogout={onLogout} />
        <div className="max-w-lg mx-auto px-6 pt-16 text-center">
          <p className="text-sm font-sans mb-4" style={{ color: '#e05252' }}>{loadError || 'Профиль не найден'}</p>
          <button onClick={() => navigate(-1)} className="btn-secondary text-xs px-4 py-2">← Назад</button>
        </div>
      </div>
    );
  }

  const isHidden = profile.is_public === false && !('stats' in profile);

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-2xl mx-auto px-4 pt-16 pb-8 fade-in">
        <div
          className="p-6 rounded overflow-hidden"
          style={{ background: '#1a1a2e', boxShadow: '4px 0 0 0 #1D9E75, -4px 0 0 0 #1D9E75, 0 4px 0 0 #1D9E75, 0 -4px 0 0 #1D9E75' }}
        >
          <div className="flex items-center gap-4 mb-4">
            <PixelAvatar
              id={(('avatar_id' in profile && profile.avatar_id) || 'bug1') as any}
              frame={(('avatar_frame' in profile && profile.avatar_frame) || 'default') as FrameId}
              size={72}
              customSrc={'custom_avatar' in profile ? profile.custom_avatar : null}
            />
            <div>
              <p className="font-pixel" style={{ fontSize: '0.7rem', color: '#EF9F27', lineHeight: 1.8 }}>
                {'nickname' in profile ? profile.nickname : profile.name}
              </p>
              {!isHidden && 'specialization' in profile && profile.specialization && (
                <p className="text-pixel/60 text-sm font-sans">{profile.specialization}</p>
              )}
            </div>
          </div>

          {isHidden ? (
            <p className="text-pixel/50 text-sm font-sans flex items-center gap-2">
              <PixelIcon name="lock" size={14} color="rgba(232,232,208,0.4)" /> Профиль скрыт
            </p>
          ) : (
            <>
              {'status_quote' in profile && profile.status_quote && (
                <p className="text-pixel/70 text-sm font-sans italic mb-4">«{profile.status_quote}»</p>
              )}

              {'workStart' in profile && profile.workStart && profile.workEnd && (
                <p className="text-pixel/60 text-xs font-sans mb-4 flex items-center gap-1.5">
                  <PixelIcon name="calendar" size={12} color="currentColor" />
                  Рабочее время: {profile.workStart}–{profile.workEnd} ({TIMEZONES.find(tz => tz.value === profile.timezone)?.label || profile.timezone})
                </p>
              )}

              {'stats' in profile && (
                <div className="space-y-2 mb-4">
                  <StatRow label="ИНТ"  value={profile.stats.int}     max={10} color="#7F77DD" />
                  <StatRow label="ВНИМ" value={profile.stats.per}     max={10} color="#EF9F27" />
                  <StatRow label="СКОР" value={profile.stats.spd}     max={10} color="#1D9E75" />
                  <StatRow label="ЗАЩ"  value={profile.stats.def}     max={10} color="#e05252" />
                  <StatRow label="МОЩЬ" value={profile.stats.bug_pwr} max={20} color="#EF9F27" />
                </div>
              )}

              {'badges' in profile && profile.badges.length > 0 && (
                <p className="text-pixel/60 text-xs font-sans mb-2">🏅 Значков: {profile.badges.length}</p>
              )}
              {'cards' in profile && profile.cards.length > 0 && (
                <p className="text-pixel/60 text-xs font-sans mb-2">🃏 Карточек: {profile.cards.length}</p>
              )}

              {'info_box' in profile && profile.info_box && (
                <p className="text-xs font-sans leading-relaxed mt-3" style={{ color: 'rgba(232,232,208,0.6)', borderLeft: '2px solid rgba(29,158,117,0.25)', paddingLeft: 10 }}>
                  {profile.info_box}
                </p>
              )}

              {'created_at' in profile && (
                <p className="text-pixel/40 text-xs font-sans mt-4">В команде с {parseServerDate(profile.created_at).toLocaleDateString('ru-RU')}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
