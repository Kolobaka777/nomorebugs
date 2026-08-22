import { useState, useRef, useEffect } from 'react';
import { testerApi, authApi } from '../api';
import { setAccessToken } from '../auth';
import { FullProfile, GalleryAvatar } from '../types';
import PixelAvatar, { AVATAR_LIST, FRAME_LIST, BG_LIST, AvatarId, FrameId, BgId } from './PixelAvatar';
import Icon from './Icon';
import Modal from './Modal';
import { useEscapeKey } from '../utils/a11y';
import { BADGE_META, ACHIEVEMENTS_CATALOG } from '../utils/badges';
import { DEFAULT_AVATAR_ID, shopItemFor, ACCENT_PALETTE } from '../utils/shop';
import { ACCENT, ERROR, PAGE_BG, TEXT_PRIMARY, TRACK_WIDE } from '../utils/theme';
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

// ── The dialog's chrome ──────────────────────────────────────────────────
//
// One definition per shape. These were re-typed at every call site before,
// which is how a field on the account tab ended up a different size from the
// identical-looking field on the first one.

// A column, not a share of the width: the three labels are known, and the
// section beside them is what should absorb a resize.
const RAIL_WIDTH = 200;

const MODAL_TITLE: React.CSSProperties = {
  fontFamily: 'Montserrat, sans-serif', fontSize: 20, fontWeight: 600,
  letterSpacing: '3px', color: TEXT_PRIMARY,
};

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: 'Montserrat, sans-serif', fontSize: 15, fontWeight: 600,
  letterSpacing: '2.4px', color: TEXT_PRIMARY, display: 'block', marginBottom: 5,
};

const FIELD: React.CSSProperties = {
  width: '100%', background: PAGE_BG, color: TEXT_PRIMARY,
  fontFamily: 'Geist, system-ui, sans-serif', fontSize: 15, lineHeight: 1.4,
  padding: '13px 16px', borderRadius: 8, border: `1px solid ${ACCENT}`, outline: 'none',
};

// Sits inside the field rather than under it, so a counter never adds a row
// of its own between one field and the next.
const COUNTER: React.CSSProperties = {
  position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
  fontFamily: 'Geist, system-ui, sans-serif', fontSize: 13,
  color: 'rgba(197, 198, 199,0.45)', pointerEvents: 'none',
};

const TILE: React.CSSProperties = {
  position: 'relative', width: 80, height: 80, flexShrink: 0, overflow: 'hidden',
  borderRadius: 6, border: `1px solid ${ACCENT}`, background: 'rgba(11, 12, 16, 0.45)',
};
const TILE_ON: React.CSSProperties = {
  background: `${ACCENT}1F`, boxShadow: `0 0 0 1px ${ACCENT}`,
};

// A band across the foot of a locked tile rather than a plate floating in
// the middle of it, so the picture underneath stays readable.
const PRICE_TAG: React.CSSProperties = {
  background: ACCENT, fontSize: 13, padding: '3px 0', letterSpacing: '0.04em',
};

const SOLID_BTN: React.CSSProperties = {
  background: ACCENT, color: PAGE_BG, borderRadius: 8, padding: '11px 20px',
  fontFamily: 'Geist, system-ui, sans-serif', fontSize: 14, fontWeight: 600,
  letterSpacing: TRACK_WIDE,
};
const SECTION_RULE: React.CSSProperties = {
  borderTop: `1px solid ${ACCENT}22`, paddingTop: 18,
};

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
  // The mockup puts a caret on these two headings; the third (Фон) has none,
  // so it stays open.
  const [avatarsOpen, setAvatarsOpen] = useState(true);
  const [framesOpen, setFramesOpen]   = useState(true);
  const [galleryOpen, setGalleryOpen] = useState(true);

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

  const TABS: { id: EditTab; label: string }[] = [
    { id: 'main',    label: 'Основное'    },
    { id: 'looks',   label: 'Внешний вид' },
    { id: 'account', label: 'Аккаунт'     },
  ];

  // Locally-merged unlock lists — a purchase made just now is pickable
  // immediately, without waiting on the parent to refetch the profile.
  const effectiveUnlockedFrames = [...new Set([...unlockedFrames, ...justPurchased.map(id => SHOP_REF(id, FRAME_LIST)).filter(Boolean) as string[]])];
  const effectiveUnlockedBgs    = [...new Set([...unlockedBgs, ...justPurchased.map(id => SHOP_REF(id, BG_LIST)).filter(Boolean) as string[]])];

  // The rail is a fixed column, not a share of the width: the three labels
  // are known and the section beside them is what should absorb a resize.
  const railItem = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    width: '100%', padding: '12px 14px', borderRadius: 6, cursor: 'pointer',
    fontFamily: 'Montserrat, sans-serif', fontSize: 13, fontWeight: 600,
    letterSpacing: TRACK_WIDE, textTransform: 'uppercase',
    background: active ? ACCENT : 'transparent',
    color: active ? PAGE_BG : TEXT_PRIMARY,
    borderBottom: `1px solid ${active ? 'transparent' : `${ACCENT}33`}`,
    transition: 'background 120ms, color 120ms',
  });

  const collapsibleLabel = (open: boolean): React.CSSProperties => ({
    ...SECTION_LABEL, marginBottom: open ? 10 : 0,
    display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', width: '100%',
  });

  return (
    <Modal
      title={<span style={MODAL_TITLE}>Редактирование профиля</span>}
      onClose={onClose}
      maxWidth={800}
      zIndex={100}
      noBodyPadding
    >
      <div className="flex flex-col">
        <div className="flex gap-6 px-6 pt-5">
          {/* Section rail. Was a row of three tabs across the top; the
              mockup stands it up on the left, which is also what lets the
              save button sit under both columns instead of under the form. */}
          <nav className="shrink-0 flex flex-col" style={{ width: RAIL_WIDTH }} aria-label="Разделы профиля">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={railItem(tab === t.id)}>
                {t.label}
                <Icon name="chevronRight" size={14} color="currentColor" />
              </button>
            ))}
          </nav>

          {/* Only this column scrolls, so the rail and the save button stay
              where the reader left them however long the section is. */}
          <div
            className="flex-1 min-w-0 flex flex-col gap-5"
            style={{ maxHeight: 'calc(90vh - 210px)', overflowY: 'auto', paddingRight: 12, paddingBottom: 4 }}
          >

          {/* ── MAIN TAB ── */}
          {tab === 'main' && (
            <>
              <div>
                <label style={SECTION_LABEL} htmlFor="pe-nickname">Имя</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="pe-nickname"
                    value={nickname}
                    onChange={e => setNickname(e.target.value.slice(0, 40))}
                    placeholder={profile.name}
                    style={{ ...FIELD, paddingRight: 72 }}
                  />
                  <span style={COUNTER}>{nickname.length}/40</span>
                </div>
              </div>

              <div>
                <label style={SECTION_LABEL} htmlFor="pe-status">Статус</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="pe-status"
                    value={statusQuote}
                    onChange={e => setStatusQuote(e.target.value.slice(0, 60))}
                    placeholder="ловлю мух с 2024..."
                    style={{ ...FIELD, paddingRight: 64 }}
                  />
                  <span style={COUNTER}>{statusQuote.length}/60</span>
                </div>
              </div>

              <div>
                <label style={SECTION_LABEL} htmlFor="pe-spec">Специализация</label>
                <select id="pe-spec" value={spec} onChange={e => setSpec(e.target.value)} style={{ ...FIELD, cursor: 'pointer' }}>
                  {SPECIALIZATIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={SECTION_LABEL} htmlFor="pe-info">Инфобокс</label>
                <div style={{ position: 'relative' }}>
                  <textarea
                    id="pe-info"
                    value={infoBox}
                    onChange={e => setInfoBox(e.target.value.slice(0, 200))}
                    placeholder="Специализация: консольные баги..."
                    rows={3}
                    style={{ ...FIELD, resize: 'none', height: 100, paddingBottom: 30 }}
                  />
                  <span style={{ ...COUNTER, top: 'auto', bottom: 18, transform: 'none' }}>{infoBox.length}/200</span>
                </div>
              </div>

              {/* Not in the mockup, kept because removing them removes
                  behaviour: the joke shows on the public profile, gender
                  decides verb endings across the app, and the toggle is the
                  only control over whether anyone can open the profile. */}
              <div>
                <label style={SECTION_LABEL} htmlFor="pe-joke">Лягушачья шутка</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="pe-joke"
                    value={snailJoke}
                    onChange={e => setSnailJoke(e.target.value.slice(0, 80))}
                    placeholder="квакнул бы, да лень..."
                    style={{ ...FIELD, paddingRight: 64 }}
                  />
                  <span style={COUNTER}>{snailJoke.length}/80</span>
                </div>
              </div>

              <div>
                <span style={SECTION_LABEL}>Пол</span>
                <div className="flex gap-2">
                  {([
                    { value: 'male' as const, label: 'Мужской' },
                    { value: 'female' as const, label: 'Женский' },
                    { value: null, label: 'Не указывать' },
                  ]).map(opt => (
                    <button
                      key={String(opt.value)}
                      onClick={() => setGender(opt.value)}
                      className="flex-1 cursor-pointer transition-colors"
                      style={{
                        ...FIELD, padding: '11px 8px', textAlign: 'center', fontSize: 14,
                        background: gender === opt.value ? `${ACCENT}1F` : PAGE_BG,
                        color: gender === opt.value ? ACCENT : 'rgba(197, 198, 199,0.6)',
                        borderColor: gender === opt.value ? ACCENT : `${ACCENT}55`,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span style={{ ...SECTION_LABEL, marginBottom: 0 }}>Публичный профиль</span>
                <button
                  onClick={() => setIsPublic(v => !v)}
                  className="cursor-pointer flex items-center gap-2"
                  style={{
                    ...FIELD, width: 'auto', padding: '9px 14px', fontSize: 13,
                    background: isPublic ? `${ACCENT}1F` : PAGE_BG,
                    color: isPublic ? ACCENT : 'rgba(197, 198, 199,0.5)',
                    borderColor: isPublic ? ACCENT : `${ACCENT}55`,
                  }}
                >
                  <Icon name={isPublic ? 'check' : 'lock'} size={13} color="currentColor" />
                  {isPublic ? 'Открыт' : 'Закрыт'}
                </button>
              </div>
            </>
          )}

          {/* ── LOOKS TAB ── */}
          {tab === 'looks' && (
            <>
              <div>
                <span style={SECTION_LABEL}>Аватар</span>
                <div className="flex items-start gap-4">
                  <div style={{ ...TILE, width: 150, height: 150, flexShrink: 0 }}>
                    <PixelAvatar
                      id={avatarId}
                      frame={frame}
                      size={148}
                      customSrc={avatarId === 'custom' ? customAvatar : null}
                    />
                  </div>
                  <div className="flex-1 flex flex-col gap-2 min-w-0">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full cursor-pointer flex items-center justify-center gap-2 transition-all hover:brightness-110"
                      style={{ ...SOLID_BTN, padding: '14px 16px' }}
                    >
                      Загрузить свой <Icon name="camera" size={16} color="currentColor" />
                    </button>
                    {avatarId === 'custom' && customAvatar && (
                      <label className="flex items-start gap-2 font-geist cursor-pointer" style={{ fontSize: 12, color: 'rgba(197, 198, 199,0.7)', lineHeight: 1.5 }}>
                        <input type="checkbox" checked={publishPublicly} onChange={e => setPublishPublicly(e.target.checked)} className="mt-0.5" />
                        Показывать в общей галерее — смогут выбрать себе и другие
                      </label>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                </div>
              </div>

              <div>
                <span style={SECTION_LABEL}>Цветовая схема</span>
                <div className="flex flex-wrap gap-2">
                  {ACCENT_PALETTE.map(c => (
                    <button
                      key={c}
                      onClick={() => setAccentColor(c)}
                      aria-label={`Цвет ${c}`}
                      aria-pressed={accentColor === c}
                      className="cursor-pointer transition-transform"
                      style={{
                        width: 44, height: 44, borderRadius: 6, background: c,
                        border: accentColor === c ? '2px solid #FFFFFF' : '2px solid transparent',
                        boxShadow: accentColor === c ? `0 0 0 2px ${c}` : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Every achievement, not just the earned ones, so what is
                  still missing is visible as a "?" rather than absent. */}
              <div>
                <span style={SECTION_LABEL}>Достижение напоказ</span>
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
                        aria-pressed={selected}
                        title={earned ? meta?.name : `${meta?.name} — не получено`}
                        className="flex items-center justify-center transition-all"
                        style={{
                          width: 44, height: 44, borderRadius: '50%',
                          cursor: earned ? 'pointer' : 'default',
                          background: selected ? (meta?.color || ACCENT) : 'transparent',
                          border: `1px solid ${selected ? (meta?.color || ACCENT) : `${ACCENT}66`}`,
                          opacity: earned ? 1 : 0.5,
                        }}
                      >
                        {earned
                          ? <Icon name={meta?.icon || 'trophy'} size={20} color={selected ? PAGE_BG : (meta?.color || ACCENT)} />
                          : <span className="font-montserrat font-bold" style={{ fontSize: 15, color: `${ACCENT}99` }}>?</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <button onClick={() => setAvatarsOpen(o => !o)} style={collapsibleLabel(avatarsOpen)}>
                  Доступные аватары
                  <Icon name={avatarsOpen ? 'chevronUp' : 'chevronDown'} size={13} color={ACCENT} />
                </button>
                {avatarsOpen && (
                  <div className="flex flex-wrap gap-4">
                    {AVATAR_LIST.map(av => {
                      const locked = !unlockedAvatars.includes(av.id);
                      const shopItem = shopItemFor('avatar', av.id);
                      const worn = avatarId === av.id;
                      return (
                        <button
                          key={av.id}
                          onClick={() => { if (!locked) { setAvatarId(av.id); setCustomAvatar(null); setPublishPublicly(false); } else if (shopItem) buyItem(shopItem.id); }}
                          disabled={locked && !shopItem}
                          aria-pressed={worn}
                          className="flex items-center justify-center cursor-pointer transition-all"
                          style={{ ...TILE, ...(worn ? TILE_ON : null) }}
                        >
                          <PixelAvatar id={av.id} size={78} />
                          {locked && shopItem && (
                            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 font-geist font-semibold"
                              style={{ ...PRICE_TAG, color: coins >= shopItem.cost ? PAGE_BG : 'rgba(11, 12, 16, 0.5)' }}>
                              {buyingId === shopItem.id ? '...' : <>{shopItem.cost}<Icon name="lightning" size={11} color="currentColor" /></>}
                            </span>
                          )}
                          {locked && !shopItem && (
                            <span className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(11, 12, 16, 0.6)' }}>
                              <Icon name="lock" size={20} color={ACCENT} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Avatars other testers published. Picking one is the same as
                  uploading that image yourself — avatar_id stays 'custom'. */}
              {galleryAvatars.length > 0 && (
                <div>
                  <button onClick={() => setGalleryOpen(o => !o)} style={collapsibleLabel(galleryOpen)}>
                    Общая галерея
                    <Icon name={galleryOpen ? 'chevronUp' : 'chevronDown'} size={13} color={ACCENT} />
                  </button>
                  {galleryOpen && (
                    <>
                      {equipError && (
                        <p role="alert" className="font-geist mb-2" style={{ fontSize: 12, color: ERROR }}>{equipError}</p>
                      )}
                      <div className="flex flex-wrap gap-4">
                        {galleryAvatars.map(g => {
                          const isMine = g.user_id === profile.id;
                          const equipped = equippedGalleryId === g.id;
                          return (
                            <div key={g.id} className="flex items-center justify-center" style={{ ...TILE, ...(equipped ? TILE_ON : null) }}>
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
                                  className="absolute top-1 right-1 rounded flex items-center justify-center cursor-pointer"
                                  style={{ width: 18, height: 18, background: 'rgba(11, 12, 16, 0.7)' }}
                                >
                                  <Icon name="close" size={11} color={ERROR} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div>
                <button onClick={() => setFramesOpen(o => !o)} style={collapsibleLabel(framesOpen)}>
                  Доступные рамки
                  <Icon name={framesOpen ? 'chevronUp' : 'chevronDown'} size={13} color={ACCENT} />
                </button>
                {framesOpen && (
                  <div className="flex flex-wrap gap-4">
                    {FRAME_LIST.map(f => {
                      const locked = !effectiveUnlockedFrames.includes(f.id);
                      const shopItem = shopItemFor('frame', f.id);
                      const worn = frame === f.id;
                      return (
                        <button
                          key={f.id}
                          onClick={() => { if (!locked) setFrame(f.id); else if (shopItem) buyItem(shopItem.id); }}
                          disabled={locked && !shopItem}
                          aria-pressed={worn}
                          title={locked ? f.unlock : f.name}
                          className="flex items-center justify-center cursor-pointer transition-all"
                          style={{ ...TILE, ...(worn ? TILE_ON : null), opacity: locked && !shopItem ? 0.45 : 1 }}
                        >
                          <PixelAvatar id="frog1" size={72} frame={f.id} empty />
                          {locked && shopItem && (
                            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 font-geist font-semibold"
                              style={{ ...PRICE_TAG, color: coins >= shopItem.cost ? PAGE_BG : 'rgba(11, 12, 16, 0.5)' }}>
                              {buyingId === shopItem.id ? '...' : <>{shopItem.cost}<Icon name="lightning" size={11} color="currentColor" /></>}
                            </span>
                          )}
                          {locked && !shopItem && (
                            <span className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(11, 12, 16, 0.6)' }}>
                              <Icon name="lock" size={20} color={ACCENT} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <span style={SECTION_LABEL}>Фон</span>
                <div className="flex flex-wrap gap-4">
                  {BG_LIST.map(b2 => {
                    const locked = !effectiveUnlockedBgs.includes(b2.id);
                    const shopItem = shopItemFor('bg', b2.id);
                    const worn = bg === b2.id;
                    return (
                      <button
                        key={b2.id}
                        onClick={() => { if (!locked) setBg(b2.id); else if (shopItem) buyItem(shopItem.id); }}
                        disabled={locked && !shopItem}
                        aria-pressed={worn}
                        aria-label={b2.name}
                        title={locked ? b2.unlock : b2.name}
                        className="cursor-pointer transition-all"
                        style={{ ...TILE, ...b2.style, ...(worn ? TILE_ON : null), opacity: locked && !shopItem ? 0.45 : 1 }}
                      >
                        {locked && shopItem && (
                          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 font-geist font-semibold"
                            style={{ ...PRICE_TAG, color: coins >= shopItem.cost ? PAGE_BG : 'rgba(11, 12, 16, 0.5)' }}>
                            {buyingId === shopItem.id ? '...' : <>{shopItem.cost}<Icon name="lightning" size={11} color="currentColor" /></>}
                          </span>
                        )}
                        {locked && !shopItem && (
                          <span className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(11, 12, 16, 0.6)' }}>
                            <Icon name="lock" size={20} color={ACCENT} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="font-geist flex items-center gap-2" style={{ fontSize: 13, color: 'rgba(197, 198, 199,0.55)' }}>
                  Баланс:
                  <span className="font-semibold flex items-center gap-1" style={{ color: '#EF9F27' }}>
                    {coins}<Icon name="lightning" size={13} color="currentColor" />
                  </span>
                </span>
                {buyError && <p className="font-geist break-words" style={{ fontSize: 12, color: ERROR }}>{buyError}</p>}
              </div>
            </>
          )}

          {/* ── ACCOUNT TAB ── */}
          {tab === 'account' && (
            <>
              <div>
                <button onClick={() => setPwOpen(o => !o)} style={collapsibleLabel(pwOpen)}>
                  Сменить пароль
                  <Icon name={pwOpen ? 'chevronUp' : 'chevronDown'} size={13} color={ACCENT} />
                </button>
                {pwOpen && (
                  <>
                    <div className="flex flex-col gap-3">
                      <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Введите старый пароль" style={FIELD} />
                      <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Введите новый пароль" style={FIELD} />
                      <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Повторите новый пароль" style={FIELD} />
                    </div>
                    {pwError && <p className="font-geist mt-2 break-words" style={{ fontSize: 12, color: ERROR }}>{pwError}</p>}
                    {pwSuccess && <p className="font-geist mt-2" style={{ fontSize: 12, color: '#4ADE80' }}>Пароль изменён</p>}
                    <button
                      onClick={changePassword}
                      disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                      className="mt-3 cursor-pointer disabled:cursor-not-allowed transition-all hover:brightness-110"
                      style={{ ...SOLID_BTN, opacity: pwSaving || !currentPw || !newPw || !confirmPw ? 0.5 : 1 }}
                    >
                      {pwSaving ? '...' : 'Сохранить пароль'}
                    </button>
                  </>
                )}
              </div>

              <div style={SECTION_RULE}>
                <button onClick={() => setEmailOpen(o => !o)} style={collapsibleLabel(emailOpen)}>
                  Сменить почту
                  <Icon name={emailOpen ? 'chevronUp' : 'chevronDown'} size={13} color={ACCENT} />
                </button>
                {!emailOpen && <p className="font-geist mt-2" style={{ fontSize: 13, color: 'rgba(197, 198, 199,0.55)' }}>{currentEmail}</p>}
                {emailOpen && (
                  <div className="flex flex-col gap-3">
                    <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={currentEmail} style={FIELD} />
                    <input type="password" value={emailPw} onChange={e => setEmailPw(e.target.value)} placeholder="Текущий пароль" style={FIELD} />
                    {emailError && <p className="font-geist break-words" style={{ fontSize: 12, color: ERROR }}>{emailError}</p>}
                    <button
                      onClick={changeEmail}
                      disabled={emailSaving || !newEmail || !emailPw}
                      className="cursor-pointer disabled:cursor-not-allowed self-start transition-all hover:brightness-110"
                      style={{ ...SOLID_BTN, opacity: emailSaving || !newEmail || !emailPw ? 0.5 : 1 }}
                    >
                      {emailSaving ? '...' : 'Сохранить почту'}
                    </button>
                  </div>
                )}
              </div>

              <div style={SECTION_RULE}>
                <button onClick={() => setPhoneOpen(o => !o)} style={collapsibleLabel(phoneOpen)}>
                  Сменить номер
                  <Icon name={phoneOpen ? 'chevronUp' : 'chevronDown'} size={13} color={ACCENT} />
                </button>
                {!phoneOpen && <p className="font-geist mt-2" style={{ fontSize: 13, color: 'rgba(197, 198, 199,0.55)' }}>{profile.phone || 'Не указан'}</p>}
                {phoneOpen && (
                  <div className="flex flex-col gap-3">
                    <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+7 900 000-00-00" style={FIELD} />
                    <input type="password" value={phonePw} onChange={e => setPhonePw(e.target.value)} placeholder="Текущий пароль" style={FIELD} />
                    {phoneError && <p className="font-geist break-words" style={{ fontSize: 12, color: ERROR }}>{phoneError}</p>}
                    {phoneSuccess && <p className="font-geist" style={{ fontSize: 12, color: '#4ADE80' }}>Номер изменён</p>}
                    <button
                      onClick={changePhone}
                      disabled={phoneSaving || !phonePw}
                      className="cursor-pointer disabled:cursor-not-allowed self-start transition-all hover:brightness-110"
                      style={{ ...SOLID_BTN, opacity: phoneSaving || !phonePw ? 0.5 : 1 }}
                    >
                      {phoneSaving ? '...' : 'Сохранить номер'}
                    </button>
                  </div>
                )}
              </div>

              {/* Not in the mockup either, and it cannot move to the header
                  menu: it loads asynchronously, so a menu changed height
                  under the cursor a moment after opening. */}
              <div style={SECTION_RULE}>
                <span style={SECTION_LABEL}>Telegram</span>
                <TelegramLinkWidget />
              </div>
            </>
          )}

          {error && (
            <p className="font-geist break-words" style={{ fontSize: 12, color: ERROR }}>{error}</p>
          )}
          </div>
        </div>

        {/* One save button for the whole dialog, bottom-right, under both
            columns — the mockup shows it on every section, including the
            account one whose own forms still save themselves. */}
        <div className="flex justify-end px-6" style={{ paddingTop: 33, paddingBottom: 24 }}>
          {/* No Отмена beside it: the mockup has one button here, and the
              dialog already closes from the header cross and from Escape. */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="cursor-pointer transition-all hover:brightness-110"
            style={{ ...SOLID_BTN, padding: '15px 26px', textTransform: 'uppercase', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Сохраняю...' : 'Сохранить'}
          </button>
        </div>
      </div>
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