import { useState, useRef, useEffect } from 'react';
import { testerApi, authApi } from '../api';
import { setAccessToken } from '../auth';
import { FullProfile, GalleryAvatar } from '../types';
import PixelAvatar, { AVATAR_LIST, FRAME_LIST, BG_LIST, AvatarId, FrameId, BgId } from './PixelAvatar';
import Icon, { IconName } from './Icon';
import Modal from './Modal';
import { useEscapeKey } from '../utils/a11y';
import { BADGE_META, ACHIEVEMENTS_CATALOG } from '../utils/badges';
import { DEFAULT_AVATAR_ID, shopItemFor, ACCENT_PALETTE } from '../utils/shop';
import { ACCENT, ERROR } from '../utils/theme';
import GalleryAvatarImage from './GalleryAvatarImage';
import { loadGalleryImage, forgetGalleryImage } from '../utils/galleryImages';
import { apiErrorMessage } from '../utils/toast';
import TelegramLinkWidget from './TelegramLinkWidget';

const SPECIALIZATIONS = [
  { value: '',                    label: '— Не выбрано —' },
  { value: 'Тестировщик',         label: 'Тестировщик' },
  { value: 'Главный вайтолог',    label: 'Главный вайтолог' },
  { value: 'Фиксик',              label: 'Фиксик' },
  { value: 'Ловец опечаток',      label: 'Ловец опечаток' },
  { value: 'Детектив ссылок',     label: 'Детектив ссылок' },
];

type EditTab = 'main' | 'looks' | 'account';

interface Props {
  profile: FullProfile;
  unlockedFrames: string[];
  unlockedBgs: string[];
  // Which of the 9 frog avatars are already free-equip/purchased/earned —
  // same "locked-but-purchasable/locked-behind-a-badge/free" split as
  // frames/backgrounds (see MoyaNora's unlockedAvatars computation).
  unlockedAvatars: string[];
  // Which achievements are actually earned — gates what can be picked for
  // the "Достижение напоказ" showcase (can't show off one you don't have).
  badgeIds: string[];
  onSave: (updated: Partial<FullProfile>) => void;
  onClose: () => void;
  // Fired right after a successful shop purchase — separate from onSave
  // since a purchase changes bug_coins/purchased_items immediately
  // server-side, without waiting for the "Сохранить" button at the bottom.
  onPurchase?: (item_id: string, newCoins: number) => void;
}

export default function ProfileEditModal({
  profile,
  unlockedFrames,
  unlockedBgs,
  unlockedAvatars,
  badgeIds,
  onSave,
  onClose,
  onPurchase,
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
  const [avatarId, setAvatarId]             = useState<AvatarId>((profile.avatar_id as AvatarId) || (DEFAULT_AVATAR_ID as AvatarId));
  const [frame, setFrame]                   = useState<FrameId>((profile.avatar_frame as FrameId) || 'default');
  const [bg, setBg]                         = useState<BgId>((profile.profile_bg as BgId) || 'default');
  const [accentColor, setAccentColor]       = useState(profile.profile_accent_color || ACCENT);
  const [showcase, setShowcase]             = useState<string[]>(profile.showcase_badges || []);
  const [favLectureId]                      = useState<number | null>(profile.favorite_lecture_id);
  const [customAvatar, setCustomAvatar]     = useState<string | null>(profile.custom_avatar);
  // Which gallery entry is currently worn, if any. Tracked by id because
  // the picker no longer holds anybody's image bytes to compare against —
  // equipping copies them server-side (POST .../gallery/:id/equip).
  const [equippedGalleryId, setEquippedGalleryId] = useState<number | null>(null);
  const [equipError, setEquipError] = useState('');
  // Whether a *just-uploaded* file (this session) should also be published
  // to the shared gallery on save — a one-shot action tied to this upload,
  // not a persistent flag on the avatar itself (see the server route
  // comment for why re-checking this on an old upload doesn't do anything
  // retroactive; only a fresh upload triggers a new gallery entry).
  const [publishPublicly, setPublishPublicly] = useState(false);
  const [galleryAvatars, setGalleryAvatars] = useState<GalleryAvatar[]>([]);

  const equipFromGallery = async (id: number) => {
    setEquipError('');
    const previous = equippedGalleryId;
    setEquippedGalleryId(id);
    try {
      await testerApi.equipGalleryAvatar(id);
      setAvatarId('custom');
      setPublishPublicly(false);
      const url = await loadGalleryImage(id);
      if (url) setCustomAvatar(url);
    } catch {
      setEquippedGalleryId(previous);
      setEquipError('Не удалось надеть аватар. Попробуй ещё раз.');
    }
  };
  const [deletingGalleryId, setDeletingGalleryId] = useState<number | null>(null);

  useEffect(() => {
    testerApi.getAvatarGallery().then(r => setGalleryAvatars(r.data.rows)).catch(() => {});
  }, []);
  // Purely for correctly-gendered verb endings elsewhere (activity feeds,
  // "Ты прошёл/прошла..." on the home page) — never shown to anyone else as
  // an identity field, and "не указывать" is a real, first-class option.
  const [gender, setGender]                 = useState<'male' | 'female' | null>(profile.gender ?? null);

  // Shop purchases made during this session — merged into unlockedFrames/
  // unlockedBgs locally so a just-bought item is pickable immediately,
  // without waiting for the parent to refetch the whole profile.
  const [justPurchased, setJustPurchased]   = useState<string[]>([]);
  const [coins, setCoins]                   = useState(profile.bug_coins);
  const [buyingId, setBuyingId]             = useState<string | null>(null);
  const [buyError, setBuyError]             = useState('');

  // ── Account tab: password/email/phone each own their own small form,
  //    each independently gated on the current password (server-enforced
  //    too — this is just so the button can't be clicked with it empty). ──
  const [pwOpen, setPwOpen]                 = useState(true);
  const [currentPw, setCurrentPw]           = useState('');
  const [newPw, setNewPw]                   = useState('');
  const [confirmPw, setConfirmPw]           = useState('');
  const [pwSaving, setPwSaving]             = useState(false);
  const [pwError, setPwError]               = useState('');
  const [pwSuccess, setPwSuccess]           = useState(false);

  const [emailOpen, setEmailOpen]           = useState(false);
  const [newEmail, setNewEmail]             = useState('');
  const [emailPw, setEmailPw]               = useState('');
  const [emailSaving, setEmailSaving]       = useState(false);
  const [emailError, setEmailError]         = useState('');
  const [currentEmail, setCurrentEmail]     = useState(profile.email);

  const [phoneOpen, setPhoneOpen]           = useState(false);
  const [newPhone, setNewPhone]             = useState(profile.phone || '');
  const [phonePw, setPhonePw]               = useState('');
  const [phoneSaving, setPhoneSaving]       = useState(false);
  const [phoneError, setPhoneError]         = useState('');
  const [phoneSuccess, setPhoneSuccess]     = useState(false);

  useEscapeKey(onClose);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const buyItem = async (itemId: string) => {
    setBuyError('');
    setBuyingId(itemId);
    try {
      const res = await testerApi.buyShopItem(itemId);
      setCoins(res.data.newCoins);
      setJustPurchased(prev => [...prev, itemId]);
      onPurchase?.(itemId, res.data.newCoins);
    } catch (e: any) {
      setBuyError(apiErrorMessage(e, 'Не удалось купить'));
    } finally {
      setBuyingId(null);
    }
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      // Publish first — if it fails, the profile save below still hasn't
      // run, so nothing's left half-applied (avatar equipped but not
      // actually shared, or vice versa).
      if (publishPublicly && avatarId === 'custom' && customAvatar) {
        await testerApi.publishAvatarToGallery(customAvatar);
        setPublishPublicly(false);
      }
      await testerApi.updateProfile({
        nickname, status_quote: statusQuote, specialization: spec,
        info_box: infoBox, snail_joke: snailJoke, is_public: isPublic,
        avatar_id: avatarId, avatar_frame: frame, profile_bg: bg,
        profile_accent_color: accentColor,
        showcase_badges: showcase, favorite_lecture_id: favLectureId,
        custom_avatar: customAvatar, gender,
      });
      onSave({
        nickname, status_quote: statusQuote, specialization: spec,
        info_box: infoBox, snail_joke: snailJoke, is_public: isPublic,
        avatar_id: avatarId, avatar_frame: frame, profile_bg: bg,
        profile_accent_color: accentColor,
        showcase_badges: showcase, favorite_lecture_id: favLectureId,
        custom_avatar: customAvatar, gender,
      });
      onClose();
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Ошибка сохранения'));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    setPwError(''); setPwSuccess(false);
    if (newPw.length < 8) { setPwError('Новый пароль должен быть не короче 8 символов'); return; }
    if (newPw !== confirmPw) { setPwError('Пароли не совпадают'); return; }
    setPwSaving(true);
    try {
      const res = await authApi.changePassword(currentPw, newPw);
      if (res.data?.token) setAccessToken(res.data.token);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwSuccess(true);
    } catch (e: any) {
      setPwError(apiErrorMessage(e, 'Не удалось изменить пароль'));
    } finally {
      setPwSaving(false);
    }
  };

  const changeEmail = async () => {
    setEmailError('');
    setEmailSaving(true);
    try {
      const res = await authApi.changeEmail(emailPw, newEmail);
      setCurrentEmail(res.data.email);
      setEmailPw(''); setEmailOpen(false);
    } catch (e: any) {
      setEmailError(apiErrorMessage(e, 'Не удалось изменить почту'));
    } finally {
      setEmailSaving(false);
    }
  };

  const changePhone = async () => {
    setPhoneError(''); setPhoneSuccess(false);
    setPhoneSaving(true);
    try {
      await authApi.changePhone(phonePw, newPhone);
      setPhonePw('');
      setPhoneSuccess(true);
    } catch (e: any) {
      setPhoneError(apiErrorMessage(e, 'Не удалось изменить номер'));
    } finally {
      setPhoneSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: '#0B0C10', border: 'none', outline: 'none',
    color: '#C5C6C7', fontSize: 13, fontFamily: 'Geist, system-ui, sans-serif',
    padding: '8px 10px', width: '100%', borderBottom: '2px solid rgba(102, 252, 241,0.3)',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '0.6rem', fontFamily: 'Montserrat', color: 'rgba(102, 252, 241,0.7)',
    display: 'block', marginBottom: 6, lineHeight: 1.8,
  };

  const TABS: { id: EditTab; label: string; icon: IconName }[] = [
    { id: 'main',    label: 'Основное',    icon: 'memo'    },
    { id: 'looks',   label: 'Внешний вид', icon: 'palette' },
    { id: 'account', label: 'Аккаунт',     icon: 'lock'    },
  ];

  // Locally-merged unlock lists — a purchase made just now is pickable
  // immediately, without waiting on the parent to refetch the profile.
  const effectiveUnlockedFrames = [...new Set([...unlockedFrames, ...justPurchased.map(id => SHOP_REF(id, FRAME_LIST)).filter(Boolean) as string[]])];
  const effectiveUnlockedBgs    = [...new Set([...unlockedBgs, ...justPurchased.map(id => SHOP_REF(id, BG_LIST)).filter(Boolean) as string[]])];

  return (
    <Modal title="Редактировать профиль" onClose={onClose} maxWidth={576} zIndex={100} noBodyPadding>
      <>
        {/* Sub-tabs */}
        <div className="flex" style={{ borderBottom: '1px solid rgba(102, 252, 241,0.15)' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 py-2 text-xs font-sans cursor-pointer transition-colors"
              style={{
                background: tab === t.id ? 'rgba(102, 252, 241,0.15)' : 'transparent',
                color: tab === t.id ? '#66FCF1' : 'rgba(197, 198, 199,0.4)',
              }}
            >
              <span className="flex items-center justify-center gap-1.5">
                <Icon name={t.icon} size={11} color="currentColor" />
                {t.label}
              </span>
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
                <p className="text-pixel/55 text-xs font-sans mt-1 text-right">{nickname.length}/40</p>
              </div>

              <div>
                <label style={labelStyle}>СТАТУС-ЦИТАТА (макс 60)</label>
                <input
                  value={statusQuote}
                  onChange={e => setStatusQuote(e.target.value.slice(0, 60))}
                  placeholder="ловлю мух с 2024..."
                  style={inputStyle}
                />
                <p className="text-pixel/55 text-xs font-sans mt-1 text-right">{statusQuote.length}/60</p>
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
                <p className="text-pixel/55 text-xs font-sans mt-1 text-right">{infoBox.length}/200</p>
              </div>

              <div>
                <label style={labelStyle}>ЛЯГУШАЧЬЯ ШУТКА (макс 80)</label>
                <input
                  value={snailJoke}
                  onChange={e => setSnailJoke(e.target.value.slice(0, 80))}
                  placeholder="квакнул бы, да лень..."
                  style={inputStyle}
                />
                <p className="text-pixel/55 text-xs font-sans mt-1 text-right">{snailJoke.length}/80</p>
              </div>

              <div>
                <label style={labelStyle}>ПОЛ</label>
                <div className="flex gap-2">
                  {([
                    { value: 'male' as const, label: 'Мужской' },
                    { value: 'female' as const, label: 'Женский' },
                    { value: null, label: 'Не указывать' },
                  ]).map(opt => (
                    <button
                      key={String(opt.value)}
                      onClick={() => setGender(opt.value)}
                      className="flex-1 py-2 rounded text-xs font-sans cursor-pointer transition-colors"
                      style={{
                        background: gender === opt.value ? 'rgba(102, 252, 241,0.15)' : 'rgba(197, 198, 199,0.04)',
                        color: gender === opt.value ? '#66FCF1' : 'rgba(197, 198, 199,0.5)',
                        boxShadow: gender === opt.value
                          ? '1px 0 0 0 #66FCF1,-1px 0 0 0 #66FCF1,0 1px 0 0 #66FCF1,0 -1px 0 0 #66FCF1'
                          : 'none',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label style={{ ...labelStyle, marginBottom: 0 }}>ПУБЛИЧНЫЙ ПРОФИЛЬ</label>
                <button
                  onClick={() => setIsPublic(v => !v)}
                  className="font-pixel cursor-pointer px-3 py-1 rounded"
                  style={{
                    fontSize: '0.45rem',
                    background: isPublic ? 'rgba(102, 252, 241,0.2)' : 'rgba(197, 198, 199,0.05)',
                    color: isPublic ? '#66FCF1' : 'rgba(197, 198, 199,0.3)',
                    boxShadow: isPublic ? '1px 0 0 0 #66FCF1,-1px 0 0 0 #66FCF1,0 1px 0 0 #66FCF1,0 -1px 0 0 #66FCF1' : 'none',
                  }}
                >
                  <span className="flex items-center gap-1.5">
                    <Icon name={isPublic ? 'check' : 'lock'} size={10} color="currentColor" />
                    {isPublic ? 'ПУБЛИЧНЫЙ' : 'ПРИВАТНЫЙ'}
                  </span>
                </button>
              </div>
            </>
          )}

          {/* ── LOOKS TAB ── */}
          {tab === 'looks' && (
            <>
              {/* Current-avatar preview + upload — mirrors the reference's
                  top row: a big preview of what's equipped right now, with
                  "Загрузить свой" as its own button next to it rather than
                  a tile inside the avatar grid below. */}
              <div className="flex items-center gap-3">
                <PixelAvatar
                  id={avatarId}
                  frame={frame}
                  size={84}
                  customSrc={avatarId === 'custom' ? customAvatar : null}
                />
                <div className="flex-1 flex flex-col gap-1.5">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-lg cursor-pointer flex items-center justify-center gap-2 py-3 font-geist text-xs font-semibold transition-colors"
                    style={{ background: 'rgba(102, 252, 241,0.12)', color: '#66FCF1' }}
                  >
                    Загрузить свой <Icon name="camera" size={14} color="currentColor" />
                  </button>
                  {/* Only meaningful once a custom image is actually
                      equipped — picking a built-in frog clears customAvatar
                      (see below), which hides this along with it. */}
                  {avatarId === 'custom' && customAvatar && (
                    <label className="flex items-center gap-1.5 text-xs font-sans cursor-pointer" style={{ color: 'rgba(197, 198, 199,0.7)' }}>
                      <input type="checkbox" checked={publishPublicly} onChange={e => setPublishPublicly(e.target.checked)} />
                      Показывать в общей галерее — смогут выбрать себе и другие
                    </label>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </div>

              {/* Color scheme */}
              <div>
                <label style={labelStyle}>ЦВЕТОВАЯ СХЕМА</label>
                <div className="flex flex-wrap gap-2">
                  {ACCENT_PALETTE.map(c => (
                    <button
                      key={c}
                      onClick={() => setAccentColor(c)}
                      aria-label={`Цвет ${c}`}
                      className="rounded-lg cursor-pointer transition-transform"
                      style={{
                        width: 28, height: 28, background: c,
                        border: accentColor === c ? '2px solid #FFFFFF' : '2px solid transparent',
                        boxShadow: accentColor === c ? `0 0 0 2px ${c}` : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Achievement showcase — shows every real achievement, not
                  just earned ones, so you can see what's still locked
                  (greyed "?" tile); only earned ones are actually toggleable. */}
              <div>
                <label style={labelStyle}>ДОСТИЖЕНИЕ НАПОКАЗ (до 3)</label>
                <div className="flex flex-wrap gap-2">
                  {ACHIEVEMENTS_CATALOG.map(a => {
                    const meta = BADGE_META[a.id];
                    const earned = badgeIds.includes(a.id);
                    const selected = showcase.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        onClick={() => earned && toggleShowcase(a.id)}
                        disabled={!earned}
                        title={earned ? meta?.name : `${meta?.name} — не получено`}
                        className="rounded-lg flex items-center justify-center transition-all"
                        style={{
                          width: 40, height: 40, cursor: earned ? 'pointer' : 'default',
                          background: selected ? `${meta?.color || ACCENT}25` : 'rgba(197, 198, 199,0.04)',
                          border: `1.5px solid ${selected ? (meta?.color || ACCENT) : 'transparent'}`,
                          opacity: earned ? 1 : 0.4,
                        }}
                      >
                        {earned
                          ? <Icon name={meta?.icon || 'trophy'} size={20} color={meta?.color || ACCENT} />
                          : <span className="font-montserrat font-bold" style={{ fontSize: 14, color: 'rgba(197, 198, 199,0.5)' }}>?</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Avatar gallery — most of the 9 frogs are free, one is a
                  priced shop tile (price overlay), one unlocks with any
                  earned badge (plain padlock overlay, no price). No names
                  under the tiles — just the pictures, matching the shared
                  gallery below which has no names to show anyway. */}
              <div>
                <label style={labelStyle}>ДОСТУПНЫЕ АВАТАРЫ</label>
                <div className="grid grid-cols-5 gap-2">
                  {AVATAR_LIST.map(av => {
                    const locked = !unlockedAvatars.includes(av.id);
                    const shopItem = shopItemFor('avatar', av.id);
                    return (
                      <button
                        key={av.id}
                        onClick={() => { if (!locked) { setAvatarId(av.id); setCustomAvatar(null); setPublishPublicly(false); } else if (shopItem) buyItem(shopItem.id); }}
                        disabled={locked && !shopItem}
                        className="relative flex items-center justify-center p-1 rounded-lg cursor-pointer overflow-hidden transition-all"
                        style={{
                          background: avatarId === av.id ? 'rgba(102, 252, 241,0.15)' : 'rgba(197, 198, 199,0.04)',
                          boxShadow: avatarId === av.id
                            ? '2px 0 0 0 #66FCF1,-2px 0 0 0 #66FCF1,0 2px 0 0 #66FCF1,0 -2px 0 0 #66FCF1'
                            : 'none',
                        }}
                      >
                        <PixelAvatar id={av.id} size={44} />
                        {locked && shopItem && (
                          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0, 0, 0, 0.72)' }}>
                            <span className="font-geist font-semibold rounded flex items-center gap-1 px-1 py-0.5" style={{ fontSize: '0.55rem', color: coins >= shopItem.cost ? '#EF9F27' : 'rgba(197, 198, 199,0.5)' }}>
                              {buyingId === shopItem.id ? '...' : <>{shopItem.cost}<Icon name="lightning" size={8} color="currentColor" /></>}
                            </span>
                          </div>
                        )}
                        {locked && !shopItem && (
                          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0, 0, 0, 0.6)' }}>
                            <Icon name="lock" size={16} color="rgba(197, 198, 199,0.7)" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Shared gallery — avatars other testers (or you, earlier)
                  published publicly. Picking one is exactly equivalent to
                  uploading that same image yourself (avatar_id stays
                  'custom'); the trash icon only shows on your own entries. */}
              {galleryAvatars.length > 0 && (
                <div>
                  <label style={labelStyle}>ОБЩАЯ ГАЛЕРЕЯ</label>
                  {equipError && (
                    <p role="alert" className="font-geist text-xs mb-2" style={{ color: ERROR }}>{equipError}</p>
                  )}
                  <div className="grid grid-cols-5 gap-2">
                    {galleryAvatars.map(g => {
                      const isMine = g.user_id === profile.id;
                      const equipped = equippedGalleryId === g.id;
                      return (
                        <div
                          key={g.id}
                          className="relative flex items-center justify-center p-1 rounded-lg overflow-hidden"
                          style={{
                            background: equipped ? 'rgba(102, 252, 241,0.15)' : 'rgba(197, 198, 199,0.04)',
                            boxShadow: equipped
                              ? '2px 0 0 0 #66FCF1,-2px 0 0 0 #66FCF1,0 2px 0 0 #66FCF1,0 -2px 0 0 #66FCF1'
                              : 'none',
                          }}
                        >
                          <button
                            onClick={() => equipFromGallery(g.id)}
                            title={`Загрузил(а): ${g.uploader_name}`}
                            aria-label={`Надеть аватар из галереи, загрузил(а) ${g.uploader_name}`}
                            className="cursor-pointer flex items-center justify-center"
                          >
                            <GalleryAvatarImage id={g.id} />
                          </button>
                          {isMine && (
                            <button
                              onClick={async () => {
                                setDeletingGalleryId(g.id);
                                try {
                                  await testerApi.deleteGalleryAvatar(g.id);
                                  forgetGalleryImage(g.id);
                                  setGalleryAvatars(prev => prev.filter(x => x.id !== g.id));
                                } catch { /* toast not critical here — the tile just stays */ }
                                finally { setDeletingGalleryId(null); }
                              }}
                              disabled={deletingGalleryId === g.id}
                              aria-label="Убрать из общей галереи"
                              title="Убрать из общей галереи"
                              className="absolute top-0.5 right-0.5 rounded flex items-center justify-center cursor-pointer"
                              style={{ width: 16, height: 16, background: 'rgba(0, 0, 0, 0.7)' }}
                            >
                              <Icon name="close" size={10} color={ERROR} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Frame gallery — empty swatches (just the border style, no
                  avatar inside), matching the reference; locked-but-
                  purchasable items get a "Купить" button right there
                  instead of just being greyed out. */}
              <div>
                <label style={labelStyle}>ДОСТУПНЫЕ РАМКИ</label>
                <div className="grid grid-cols-3 gap-2">
                  {FRAME_LIST.map(f => {
                    const locked = !effectiveUnlockedFrames.includes(f.id);
                    const shopItem = shopItemFor('frame', f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() => !locked && setFrame(f.id)}
                        disabled={locked}
                        className="flex flex-col items-center gap-1 p-2 rounded transition-all"
                        style={{
                          cursor: locked ? 'default' : 'pointer', opacity: locked && !shopItem ? 0.4 : 1,
                          background: frame === f.id ? 'rgba(102, 252, 241,0.15)' : 'rgba(197, 198, 199,0.04)',
                        }}
                      >
                        <PixelAvatar id="frog1" size={40} frame={f.id} empty />
                        <span className="text-pixel/60 font-sans text-center" style={{ fontSize: '0.55rem' }}>{f.name}</span>
                        {locked && shopItem ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={e => { e.stopPropagation(); buyItem(shopItem.id); }}
                            className="font-geist font-semibold rounded cursor-pointer flex items-center gap-1"
                            style={{ fontSize: '0.55rem', color: coins >= shopItem.cost ? '#EF9F27' : 'rgba(197, 198, 199,0.4)', padding: '2px 6px', background: 'rgba(239,159,39,0.1)' }}
                          >
                            {buyingId === shopItem.id ? '...' : <>{shopItem.cost}<Icon name="lightning" size={9} color="currentColor" /></>}
                          </span>
                        ) : locked ? (
                          <span className="text-pixel/45 font-sans text-center" style={{ fontSize: '0.5rem' }}>{f.unlock}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Background gallery — same buy-inline treatment */}
              <div>
                <label style={labelStyle}>ФОН ПРОФИЛЯ</label>
                <div className="grid grid-cols-3 gap-2">
                  {BG_LIST.map(b2 => {
                    const locked = !effectiveUnlockedBgs.includes(b2.id);
                    const shopItem = shopItemFor('bg', b2.id);
                    return (
                      <button
                        key={b2.id}
                        onClick={() => !locked && setBg(b2.id)}
                        disabled={locked}
                        className="flex flex-col items-center justify-center gap-1 p-2 rounded transition-all"
                        style={{
                          ...b2.style, cursor: locked ? 'default' : 'pointer', opacity: locked && !shopItem ? 0.45 : 1,
                          border: bg === b2.id ? '2px solid #66FCF1' : '2px solid transparent', minHeight: 56,
                        }}
                      >
                        <span className="font-sans" style={{ fontSize: '0.6rem', color: '#C5C6C7' }}>{b2.name}</span>
                        {locked && shopItem ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={e => { e.stopPropagation(); buyItem(shopItem.id); }}
                            className="font-geist font-semibold rounded cursor-pointer flex items-center gap-1"
                            style={{ fontSize: '0.55rem', color: coins >= shopItem.cost ? '#EF9F27' : 'rgba(197, 198, 199,0.4)', padding: '2px 6px', background: 'rgba(0,0,0,0.4)' }}
                          >
                            {buyingId === shopItem.id ? '...' : <>{shopItem.cost}<Icon name="lightning" size={9} color="currentColor" /></>}
                          </span>
                        ) : locked ? (
                          <span className="font-sans text-center" style={{ fontSize: '0.5rem', color: 'rgba(197, 198, 199,0.55)' }}>{b2.unlock}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-geist text-xs flex items-center gap-1.5" style={{ color: 'rgba(197, 198, 199,0.55)' }}>
                  Баланс: <span style={{ color: '#EF9F27' }} className="font-semibold flex items-center gap-1">{coins}<Icon name="lightning" size={12} color="currentColor" /></span>
                </span>
                {buyError && <p className="text-xs font-sans break-words" style={{ color: ERROR }}>{buyError}</p>}
              </div>
            </>
          )}

          {/* ── ACCOUNT TAB ── */}
          {tab === 'account' && (
            <>
              {/* Telegram lives here rather than in the header dropdown. It
                  loads its state asynchronously, so putting it in a menu meant
                  the menu changed height under the cursor a moment after it
                  opened — and a linked account is a setting, not a shortcut. */}
              <div>
                <p style={labelStyle}>TELEGRAM</p>
                <TelegramLinkWidget />
              </div>

              <div>
                <button
                  onClick={() => setPwOpen(o => !o)}
                  className="w-full flex items-center justify-between cursor-pointer"
                  style={{ ...labelStyle, marginBottom: pwOpen ? 10 : 0 }}
                >
                  <span>СМЕНИТЬ ПАРОЛЬ</span>
                  <Icon name={pwOpen ? 'chevronUp' : 'chevronDown'} size={12} color="currentColor" />
                </button>
                {pwOpen && (
                  <>
                    <div className="space-y-2">
                      <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Текущий пароль" style={inputStyle} />
                      <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Новый пароль" style={inputStyle} />
                      <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Повтори пароль" style={inputStyle} />
                    </div>
                    {pwError && <p className="text-xs font-sans mt-1 break-words" style={{ color: ERROR }}>{pwError}</p>}
                    {pwSuccess && <p className="text-xs font-sans mt-1" style={{ color: '#4ADE80' }}>Пароль изменён</p>}
                    <button
                      onClick={changePassword}
                      disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                      className="mt-2 px-4 py-2 rounded font-sans text-xs font-semibold cursor-pointer disabled:cursor-not-allowed"
                      style={{ background: 'rgba(102, 252, 241,0.15)', color: '#66FCF1', opacity: pwSaving || !currentPw || !newPw || !confirmPw ? 0.5 : 1 }}
                    >
                      {pwSaving ? '...' : 'Сохранить пароль'}
                    </button>
                  </>
                )}
              </div>

              <div style={{ borderTop: '1px solid rgba(102, 252, 241,0.1)', paddingTop: 16 }}>
                <button onClick={() => setEmailOpen(o => !o)} className="w-full flex items-center justify-between cursor-pointer" style={{ ...labelStyle, marginBottom: emailOpen ? 10 : 0 }}>
                  <span>СМЕНИТЬ ПОЧТУ</span>
                  <Icon name={emailOpen ? 'chevronUp' : 'chevronDown'} size={12} color="currentColor" />
                </button>
                {!emailOpen && <p className="text-pixel/55 text-xs font-sans">{currentEmail}</p>}
                {emailOpen && (
                  <div className="space-y-2">
                    <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={currentEmail} style={inputStyle} />
                    <input type="password" value={emailPw} onChange={e => setEmailPw(e.target.value)} placeholder="Текущий пароль" style={inputStyle} />
                    {emailError && <p className="text-xs font-sans break-words" style={{ color: ERROR }}>{emailError}</p>}
                    <button
                      onClick={changeEmail}
                      disabled={emailSaving || !newEmail || !emailPw}
                      className="px-4 py-2 rounded font-sans text-xs font-semibold cursor-pointer disabled:cursor-not-allowed"
                      style={{ background: 'rgba(102, 252, 241,0.15)', color: '#66FCF1', opacity: emailSaving || !newEmail || !emailPw ? 0.5 : 1 }}
                    >
                      {emailSaving ? '...' : 'Сохранить почту'}
                    </button>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid rgba(102, 252, 241,0.1)', paddingTop: 16 }}>
                <button onClick={() => setPhoneOpen(o => !o)} className="w-full flex items-center justify-between cursor-pointer" style={{ ...labelStyle, marginBottom: phoneOpen ? 10 : 0 }}>
                  <span>СМЕНИТЬ НОМЕР</span>
                  <Icon name={phoneOpen ? 'chevronUp' : 'chevronDown'} size={12} color="currentColor" />
                </button>
                {!phoneOpen && <p className="text-pixel/55 text-xs font-sans">{profile.phone || 'Не указан'}</p>}
                {phoneOpen && (
                  <div className="space-y-2">
                    <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+7 900 000-00-00" style={inputStyle} />
                    <input type="password" value={phonePw} onChange={e => setPhonePw(e.target.value)} placeholder="Текущий пароль" style={inputStyle} />
                    {phoneError && <p className="text-xs font-sans break-words" style={{ color: ERROR }}>{phoneError}</p>}
                    {phoneSuccess && <p className="text-xs font-sans" style={{ color: '#4ADE80' }}>Номер изменён</p>}
                    <button
                      onClick={changePhone}
                      disabled={phoneSaving || !phonePw}
                      className="px-4 py-2 rounded font-sans text-xs font-semibold cursor-pointer disabled:cursor-not-allowed"
                      style={{ background: 'rgba(102, 252, 241,0.15)', color: '#66FCF1', opacity: phoneSaving || !phonePw ? 0.5 : 1 }}
                    >
                      {phoneSaving ? '...' : 'Сохранить номер'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs font-sans break-words" style={{ color: ERROR }}>{error}</p>
          )}

          {/* Save — hidden on the Account tab, which saves each of its own
              fields independently rather than through this bottom button. */}
          {tab !== 'account' && (
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
          )}
        </div>
      </>
    </Modal>
  );
}

// Resolves a shop item_id (e.g. "frame_gold") back to the FrameId/BgId it
// unlocks, by matching against the given registry's `unlock`-carrying id
// list — avoids importing utils/shop.ts's SHOP_ITEMS twice just to do the
// same lookup shopItemFor already does, the other direction.
function SHOP_REF(itemId: string, list: { id: string }[]): string | undefined {
  const isFrame = itemId.startsWith('frame_');
  const isBg = itemId.startsWith('bg_');
  if (!isFrame && !isBg) return undefined;
  const key = itemId.replace(/^(frame|bg)_/, '');
  const known = list.find(x => x.id === key || x.id === (key === 'gold' ? 'gold' : key));
  return known?.id;
}