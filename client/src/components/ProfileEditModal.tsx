import { useState, useRef } from 'react';
import { testerApi } from '../api';
import { FullProfile, Achievement, Lecture } from '../types';
import PixelAvatar, { AVATAR_LIST, FRAME_LIST, BG_LIST, AvatarId, FrameId, BgId } from './PixelAvatar';

const SPECIALIZATIONS = [
  { value: 'HTML-жук',       label: '🌐 HTML-жук' },
  { value: 'CSS-жук',        label: '🎨 CSS-жук' },
  { value: 'DevTools-жук',   label: '🔍 DevTools-жук' },
  { value: 'Консольный жук', label: '> Консольный жук' },
  { value: 'Жук-репортёр',   label: '🐛 Жук-репортёр' },
  { value: 'Сетевой жук',    label: '📡 Сетевой жук' },
  { value: '',               label: '— Не выбрано —' },
];

type EditTab = 'main' | 'looks' | 'showcase';

interface Props {
  profile: FullProfile;
  achievements: Achievement[];
  passedLectures: Lecture[];
  unlockedFrames: string[];
  unlockedBgs: string[];
  onSave: (updated: Partial<FullProfile>) => void;
  onClose: () => void;
}

export default function ProfileEditModal({
  profile,
  achievements,
  passedLectures,
  unlockedFrames,
  unlockedBgs,
  onSave,
  onClose,
}: Props) {
  const [tab, setTab]               = useState<EditTab>('main');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  // Form state
  const [nickname, setNickname]             = useState(profile.nickname || '');
  const [statusQuote, setStatusQuote]       = useState(profile.status_quote || '');
  const [spec, setSpec]                     = useState(profile.specialization || '');
  const [infoBox, setInfoBox]               = useState(profile.info_box || '');
  const [snailJoke, setSnailJoke]           = useState(profile.snail_joke || '');
  const [isPublic, setIsPublic]             = useState(profile.is_public);
  const [avatarId, setAvatarId]             = useState<AvatarId>((profile.avatar_id as AvatarId) || 'bug1');
  const [frame, setFrame]                   = useState<FrameId>((profile.avatar_frame as FrameId) || 'default');
  const [bg, setBg]                         = useState<BgId>((profile.profile_bg as BgId) || 'default');
  const [showcase, setShowcase]             = useState<string[]>(profile.showcase_badges || []);
  const [favLectureId, setFavLectureId]     = useState<number | null>(profile.favorite_lecture_id);
  const [customAvatar, setCustomAvatar]     = useState<string | null>(profile.custom_avatar);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const earnedAchs = achievements.filter(a => a.earned);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError('Файл слишком большой (макс 2 MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setCustomAvatar(reader.result as string);
      setAvatarId('custom');
    };
    reader.readAsDataURL(file);
  };

  const toggleShowcase = (id: string) => {
    setShowcase(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 3 ? [...prev, id] : prev
    );
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await testerApi.updateProfile({
        nickname, status_quote: statusQuote, specialization: spec,
        info_box: infoBox, snail_joke: snailJoke, is_public: isPublic,
        avatar_id: avatarId, avatar_frame: frame, profile_bg: bg,
        showcase_badges: showcase, favorite_lecture_id: favLectureId,
        custom_avatar: customAvatar,
      });
      onSave({
        nickname, status_quote: statusQuote, specialization: spec,
        info_box: infoBox, snail_joke: snailJoke, is_public: isPublic,
        avatar_id: avatarId, avatar_frame: frame, profile_bg: bg,
        showcase_badges: showcase, favorite_lecture_id: favLectureId,
        custom_avatar: customAvatar,
      });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: '#0f0f1a', border: 'none', outline: 'none',
    color: '#e8e8d0', fontSize: 13, fontFamily: 'Inter, sans-serif',
    padding: '8px 10px', width: '100%', borderBottom: '2px solid rgba(29,158,117,0.3)',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '0.6rem', fontFamily: 'Press Start 2P', color: 'rgba(29,158,117,0.7)',
    display: 'block', marginBottom: 6, lineHeight: 1.8,
  };

  const TABS: { id: EditTab; label: string }[] = [
    { id: 'main',     label: '📝 Основное' },
    { id: 'looks',    label: '🎨 Внешний вид' },
    { id: 'showcase', label: '📌 Витрина' },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded"
        style={{
          background: '#1a1a2e',
          boxShadow: '2px 0 0 0 #1D9E75,-2px 0 0 0 #1D9E75,0 2px 0 0 #1D9E75,0 -2px 0 0 #1D9E75',
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4" style={{ borderBottom: '1px solid rgba(29,158,117,0.2)' }}>
          <p className="font-pixel text-primary" style={{ fontSize: '0.6rem', lineHeight: 1.8 }}>
            РЕДАКТИРОВАТЬ ПРОФИЛЬ
          </p>
          <button
            onClick={onClose}
            className="text-pixel/50 hover:text-pixel text-xl font-sans cursor-pointer"
          >×</button>
        </div>

        {/* Sub-tabs */}
        <div className="flex" style={{ borderBottom: '1px solid rgba(29,158,117,0.15)' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 py-2 text-xs font-sans cursor-pointer transition-colors"
              style={{
                background: tab === t.id ? 'rgba(29,158,117,0.15)' : 'transparent',
                color: tab === t.id ? '#1D9E75' : 'rgba(232,232,208,0.4)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">

          {/* ── MAIN TAB ── */}
          {tab === 'main' && (
            <>
              <div>
                <label style={labelStyle}>НИК (макс 40)</label>
                <input
                  value={nickname}
                  onChange={e => setNickname(e.target.value.slice(0, 40))}
                  placeholder={profile.name}
                  style={inputStyle}
                />
                <p className="text-pixel/30 text-xs font-sans mt-1 text-right">{nickname.length}/40</p>
              </div>

              <div>
                <label style={labelStyle}>СТАТУС-ЦИТАТА (макс 60)</label>
                <input
                  value={statusQuote}
                  onChange={e => setStatusQuote(e.target.value.slice(0, 60))}
                  placeholder="ловлю жуков с 2024..."
                  style={inputStyle}
                />
                <p className="text-pixel/30 text-xs font-sans mt-1 text-right">{statusQuote.length}/60</p>
              </div>

              <div>
                <label style={labelStyle}>СПЕЦИАЛИЗАЦИЯ</label>
                <select
                  value={spec}
                  onChange={e => setSpec(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {SPECIALIZATIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>ИНФОБОКС (макс 200)</label>
                <textarea
                  value={infoBox}
                  onChange={e => setInfoBox(e.target.value.slice(0, 200))}
                  placeholder="Специализация: консольные баги..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'none' }}
                />
                <p className="text-pixel/30 text-xs font-sans mt-1 text-right">{infoBox.length}/200</p>
              </div>

              <div>
                <label style={labelStyle}>МОЙ АНЕКДОТ ПРО УЛИТКУ 🐌</label>
                <textarea
                  value={snailJoke}
                  onChange={e => setSnailJoke(e.target.value.slice(0, 300))}
                  placeholder="Вставь свой любимый анекдот..."
                  rows={2}
                  style={{ ...inputStyle, resize: 'none' }}
                />
              </div>

              <div className="flex items-center justify-between">
                <label style={{ ...labelStyle, marginBottom: 0 }}>ПУБЛИЧНЫЙ ПРОФИЛЬ</label>
                <button
                  onClick={() => setIsPublic(v => !v)}
                  className="font-pixel cursor-pointer px-3 py-1 rounded"
                  style={{
                    fontSize: '0.45rem',
                    background: isPublic ? 'rgba(29,158,117,0.2)' : 'rgba(232,232,208,0.05)',
                    color: isPublic ? '#1D9E75' : 'rgba(232,232,208,0.3)',
                    boxShadow: isPublic ? '1px 0 0 0 #1D9E75,-1px 0 0 0 #1D9E75,0 1px 0 0 #1D9E75,0 -1px 0 0 #1D9E75' : 'none',
                  }}
                >
                  {isPublic ? '✓ ПУБЛИЧНЫЙ' : '🔒 ПРИВАТНЫЙ'}
                </button>
              </div>
            </>
          )}

          {/* ── LOOKS TAB ── */}
          {tab === 'looks' && (
            <>
              {/* Avatar grid */}
              <div>
                <label style={labelStyle}>АВАТАР</label>
                <div className="grid grid-cols-4 gap-2">
                  {AVATAR_LIST.map(av => (
                    <button
                      key={av.id}
                      onClick={() => { setAvatarId(av.id); setCustomAvatar(null); }}
                      className="flex flex-col items-center gap-1 p-2 rounded cursor-pointer transition-all"
                      style={{
                        background: avatarId === av.id ? 'rgba(29,158,117,0.15)' : 'rgba(232,232,208,0.04)',
                        boxShadow: avatarId === av.id
                          ? '2px 0 0 0 #1D9E75,-2px 0 0 0 #1D9E75,0 2px 0 0 #1D9E75,0 -2px 0 0 #1D9E75'
                          : 'none',
                      }}
                    >
                      <PixelAvatar id={av.id} size={40} />
                      <span className="text-pixel/50 font-sans" style={{ fontSize: '0.6rem' }}>{av.name}</span>
                    </button>
                  ))}

                  {/* Upload custom */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-1 p-2 rounded cursor-pointer transition-all"
                    style={{
                      background: avatarId === 'custom' ? 'rgba(29,158,117,0.15)' : 'rgba(232,232,208,0.04)',
                      boxShadow: avatarId === 'custom'
                        ? '2px 0 0 0 #1D9E75,-2px 0 0 0 #1D9E75,0 2px 0 0 #1D9E75,0 -2px 0 0 #1D9E75'
                        : 'none',
                      minHeight: 64,
                    }}
                  >
                    {customAvatar
                      ? <PixelAvatar id="custom" size={40} customSrc={customAvatar} />
                      : <span style={{ fontSize: '1.5rem' }}>📸</span>
                    }
                    <span className="text-pixel/50 font-sans" style={{ fontSize: '0.6rem' }}>
                      {customAvatar ? 'Своя' : 'Загрузить'}
                    </span>
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </div>

              {/* Frame selector */}
              <div>
                <label style={labelStyle}>РАМКА АВАТАРА</label>
                <div className="grid grid-cols-3 gap-2">
                  {FRAME_LIST.map(f => {
                    const locked = !unlockedFrames.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() => !locked && setFrame(f.id)}
                        disabled={locked}
                        className="flex flex-col items-center gap-1 p-2 rounded transition-all"
                        style={{
                          cursor: locked ? 'not-allowed' : 'pointer',
                          opacity: locked ? 0.4 : 1,
                          background: frame === f.id ? 'rgba(29,158,117,0.15)' : 'rgba(232,232,208,0.04)',
                          boxShadow: frame === f.id
                            ? '2px 0 0 0 #1D9E75,-2px 0 0 0 #1D9E75,0 2px 0 0 #1D9E75,0 -2px 0 0 #1D9E75'
                            : 'none',
                        }}
                      >
                        <PixelAvatar id="bug1" size={32} frame={f.id} />
                        <span className="text-pixel/60 font-sans text-center" style={{ fontSize: '0.55rem' }}>
                          {f.name}{locked ? ' 🔒' : ''}
                        </span>
                        {locked && (
                          <span className="text-pixel/30 font-sans text-center" style={{ fontSize: '0.5rem' }}>
                            {f.unlock}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Background selector */}
              <div>
                <label style={labelStyle}>ФОН ПРОФИЛЯ</label>
                <div className="grid grid-cols-3 gap-2">
                  {BG_LIST.map(b => {
                    const locked = !unlockedBgs.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        onClick={() => !locked && setBg(b.id)}
                        disabled={locked}
                        className="flex flex-col items-center gap-1 p-2 rounded cursor-pointer transition-all"
                        style={{
                          ...b.style,
                          cursor: locked ? 'not-allowed' : 'pointer',
                          opacity: locked ? 0.45 : 1,
                          border: bg === b.id ? '2px solid #1D9E75' : '2px solid transparent',
                          minHeight: 56,
                          justifyContent: 'center',
                        }}
                      >
                        <span className="font-pixel" style={{ fontSize: '0.45rem', color: '#e8e8d0' }}>
                          {b.name}{locked ? ' 🔒' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ── SHOWCASE TAB ── */}
          {tab === 'showcase' && (
            <>
              <div>
                <label style={labelStyle}>ВИТРИНА ДОСТИЖЕНИЙ (выбери до 3)</label>
                <p className="text-pixel/30 text-xs font-sans mb-4">
                  Выбрано {showcase.length}/3
                </p>
                {earnedAchs.length === 0 ? (
                  <p className="text-pixel/30 text-sm font-sans">Пока нет заработанных достижений</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {earnedAchs.map(ach => {
                      const selected = showcase.includes(ach.id);
                      const locked   = !selected && showcase.length >= 3;
                      return (
                        <button
                          key={ach.id}
                          onClick={() => !locked && toggleShowcase(ach.id)}
                          disabled={locked}
                          className="flex items-center gap-3 p-3 rounded text-left transition-all"
                          style={{
                            cursor: locked ? 'not-allowed' : 'pointer',
                            opacity: locked ? 0.4 : 1,
                            background: selected ? 'rgba(239,159,39,0.1)' : 'rgba(232,232,208,0.04)',
                            boxShadow: selected
                              ? '2px 0 0 0 #EF9F27,-2px 0 0 0 #EF9F27,0 2px 0 0 #EF9F27,0 -2px 0 0 #EF9F27'
                              : 'none',
                          }}
                        >
                          <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{ach.icon}</span>
                          <span className="text-pixel font-sans text-xs">{ach.name}</span>
                          {selected && <span style={{ marginLeft: 'auto', color: '#EF9F27' }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>ИЗБРАННАЯ ЛЕКЦИЯ</label>
                {passedLectures.length === 0 ? (
                  <p className="text-pixel/30 text-sm font-sans">Пройди хотя бы одну лекцию</p>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={() => setFavLectureId(null)}
                      className="w-full p-2 rounded text-left text-xs font-sans transition-colors"
                      style={{
                        background: favLectureId === null ? 'rgba(29,158,117,0.15)' : 'rgba(232,232,208,0.04)',
                        color: 'rgba(232,232,208,0.5)',
                        cursor: 'pointer',
                      }}
                    >
                      — Не выбрано —
                    </button>
                    {passedLectures.map(lec => (
                      <button
                        key={lec.id}
                        onClick={() => setFavLectureId(lec.id)}
                        className="w-full p-2 rounded text-left text-xs font-sans flex justify-between transition-colors"
                        style={{
                          background: favLectureId === lec.id ? 'rgba(29,158,117,0.15)' : 'rgba(232,232,208,0.04)',
                          color: favLectureId === lec.id ? '#e8e8d0' : 'rgba(232,232,208,0.6)',
                          cursor: 'pointer',
                          boxShadow: favLectureId === lec.id
                            ? '2px 0 0 0 #1D9E75,-2px 0 0 0 #1D9E75,0 2px 0 0 #1D9E75,0 -2px 0 0 #1D9E75'
                            : 'none',
                        }}
                      >
                        <span>{lec.title}</span>
                        <span style={{ color: '#1D9E75', marginLeft: 8 }}>{lec.score}%</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs font-sans" style={{ color: '#e05252' }}>{error}</p>
          )}

          {/* Save */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex-1 cursor-pointer"
              style={{ opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Сохраняю...' : 'Сохранить'}
            </button>
            <button onClick={onClose} className="btn-secondary px-4 cursor-pointer">
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
