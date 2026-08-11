import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import Icon from '../components/Icon';
import { suggestionsApi } from '../api';
import { Suggestion, SuggestionType, SuggestionStatus, SuggestionFolder } from '../types';
import { showApiError } from '../utils/toast';
import { timeAgo, parseServerDate } from '../utils/date';
import { PAGE_GRADIENT, CARD_BG, PAGE_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, CARD_SHADOW, TRACK_WIDE, BADGE_NOTIFY } from '../utils/theme';

interface Props {
  user: any;
  onLogout: () => void;
}

const TYPE_LABELS: Record<SuggestionType, string> = {
  idea: 'Идея',
  suggestion: 'Предложение',
  complaint: 'Что бесит',
  question: 'Вопрос',
};
const TYPE_ORDER: SuggestionType[] = ['idea', 'suggestion', 'complaint', 'question'];
const TYPE_COLORS: Record<SuggestionType, string> = {
  idea: '#7F77DD',
  suggestion: ACCENT,
  complaint: '#e05252',
  question: '#4fc3f7',
};
const STATUS_LABELS: Record<SuggestionStatus, string> = {
  new: 'Новое',
  reviewed: 'Рассмотрено',
  implemented: 'Внедрено',
  declined: 'Отклонено',
};

const MAX_LENGTH = 2000;
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function canStillEdit(s: Suggestion, userId: number): boolean {
  return s.user_id === userId && Date.now() - parseServerDate(s.created_at).getTime() < EDIT_WINDOW_MS;
}

function SuggestionCard({
  s, isLead, userId, folders, isLiking, onLike, onSetStatus, onSetFolder, onSave, onDelete, onAnswer,
}: {
  s: Suggestion;
  isLead: boolean;
  userId: number;
  folders: SuggestionFolder[];
  isLiking: boolean;
  onLike: (s: Suggestion) => void;
  onSetStatus: (s: Suggestion, status: SuggestionStatus) => void;
  onSetFolder: (s: Suggestion, folderId: number | null) => void;
  onSave: (s: Suggestion, data: { type: SuggestionType; text: string; is_anonymous: boolean }) => Promise<void>;
  onDelete: (s: Suggestion) => void;
  onAnswer: (s: Suggestion, answer: string) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState(s.type);
  const [editText, setEditText] = useState(s.text);
  const [editAnon, setEditAnon] = useState(s.is_anonymous);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [answering, setAnswering] = useState(false);
  const [answerText, setAnswerText] = useState(s.answer || '');
  const [answerSaving, setAnswerSaving] = useState(false);
  const [answerError, setAnswerError] = useState('');

  const editable = canStillEdit(s, userId);

  const submitAnswer = async () => {
    if (!answerText.trim()) { setAnswerError('Напиши текст ответа'); return; }
    setAnswerSaving(true);
    setAnswerError('');
    try {
      await onAnswer(s, answerText.trim());
      setAnswering(false);
    } catch (err: any) {
      setAnswerError(err.response?.data?.error || 'Не удалось отправить ответ');
    } finally {
      setAnswerSaving(false);
    }
  };

  const save = async () => {
    if (!editText.trim()) { setError('Напиши текст'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(s, { type: editType, text: editText.trim(), is_anonymous: editAnon });
      setEditing(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="p-4 rounded-lg" style={{ background: CARD_BG, border: '1px solid rgba(127,119,221,0.4)', boxShadow: CARD_SHADOW }}>
        <div className="flex gap-2 mb-2 flex-wrap">
          {TYPE_ORDER.map(t => (
            <button
              key={t}
              onClick={() => setEditType(t)}
              className="flex-1 min-w-[70px] py-1.5 rounded-lg text-xs font-geist font-semibold cursor-pointer"
              style={{ background: editType === t ? `${TYPE_COLORS[t]}25` : 'rgba(197, 198, 199,0.04)', color: editType === t ? TYPE_COLORS[t] : TEXT_MUTED }}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <textarea
          value={editText}
          onChange={e => setEditText(e.target.value.slice(0, MAX_LENGTH))}
          rows={3}
          className="w-full rounded-lg px-3 py-2 font-geist text-sm resize-none outline-none mb-2"
          style={{ background: PAGE_BG, color: TEXT_PRIMARY, border: '1px solid rgba(197, 198, 199,0.2)', lineHeight: 1.6 }}
        />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="flex items-center gap-2 text-xs font-geist cursor-pointer" style={{ color: TEXT_MUTED }}>
            <input type="checkbox" checked={editAnon} onChange={e => setEditAnon(e.target.checked)} />
            Анонимно
          </label>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="text-xs font-geist px-3 py-1.5 rounded-lg cursor-pointer" style={{ color: TEXT_MUTED }}>Отмена</button>
            <button onClick={save} disabled={saving} className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50">{saving ? '...' : 'Сохранить'}</button>
          </div>
        </div>
        {error && <p className="text-xs font-geist mt-2 break-words" style={{ color: '#e05252' }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199,0.2)', boxShadow: CARD_SHADOW }}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs font-geist font-semibold px-2 py-0.5 rounded" style={{ background: `${TYPE_COLORS[s.type]}20`, color: TYPE_COLORS[s.type] }}>
          {TYPE_LABELS[s.type]}
        </span>
        <span
          className={`flex items-center gap-1 text-xs font-geist min-w-0 ${!s.is_anonymous && s.user_id ? 'cursor-pointer hover:underline' : ''}`}
          style={{ color: TEXT_MUTED }}
          onClick={() => !s.is_anonymous && s.user_id && navigate(`/profile/${s.user_id}`)}
        >
          {s.is_anonymous ? <Icon name="lock" size={12} color={TEXT_MUTED} /> : null}
          <span className="break-words min-w-0">{s.is_anonymous ? 'Аноним' : (s.author_name || '—')}</span>
        </span>
        {isLead && s.is_anonymous && (
          <span className="flex items-center gap-1 text-xs font-geist px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,159,39,0.12)', color: BADGE_NOTIFY }}>
            <Icon name="lock" size={12} color={BADGE_NOTIFY} /> анонимно для команды
          </span>
        )}
        <span className="text-xs font-geist ml-auto shrink-0" style={{ color: TEXT_MUTED }}>{timeAgo(s.created_at)}</span>
      </div>

      <p className="font-geist text-sm leading-relaxed mb-3 break-words" style={{ color: TEXT_PRIMARY }}>{s.text}</p>

      {s.type === 'question' && (
        s.answer ? (
          <div className="p-3 rounded-lg mb-3 flex gap-2" style={{ background: 'rgba(102, 252, 241, 0.08)', border: `1px solid ${ACCENT}30` }}>
            <Icon name="check" size={14} color={ACCENT} />
            <div className="min-w-0">
              <p className="text-xs font-geist font-semibold mb-1" style={{ color: ACCENT }}>
                Ответ{s.answered_by_name ? ` от ${s.answered_by_name}` : ''}
              </p>
              <p className="text-sm font-geist leading-relaxed break-words" style={{ color: TEXT_PRIMARY }}>{s.answer}</p>
            </div>
          </div>
        ) : isLead ? (
          answering ? (
            <div className="mb-3">
              <textarea
                value={answerText}
                onChange={e => setAnswerText(e.target.value.slice(0, MAX_LENGTH))}
                rows={2}
                placeholder="Твой ответ..."
                className="w-full rounded-lg px-3 py-2 font-geist text-sm resize-none outline-none mb-2"
                style={{ background: PAGE_BG, color: TEXT_PRIMARY, border: '1px solid rgba(197, 198, 199,0.2)', lineHeight: 1.6 }}
              />
              <div className="flex gap-2">
                <button onClick={submitAnswer} disabled={answerSaving} className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50">
                  {answerSaving ? '...' : 'Ответить'}
                </button>
                <button onClick={() => setAnswering(false)} className="text-xs font-geist px-3 py-1.5 rounded-lg cursor-pointer" style={{ color: TEXT_MUTED }}>Отмена</button>
              </div>
              {answerError && <p className="text-xs font-geist mt-2 break-words" style={{ color: '#e05252' }}>{answerError}</p>}
            </div>
          ) : (
            <button onClick={() => setAnswering(true)} className="btn-secondary text-xs px-3 py-1.5 mb-3 flex items-center gap-1.5" style={{ color: TYPE_COLORS.question }}>
              <Icon name="lightbulb" size={13} color="currentColor" /> Ответить
            </button>
          )
        ) : (
          <p className="text-xs font-geist mb-3 flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
            <Icon name="clock" size={12} color={TEXT_MUTED} /> Ждём ответа тимлида
          </p>
        )
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => onLike(s)}
          disabled={isLiking}
          className="flex items-center gap-1.5 text-xs font-geist cursor-pointer disabled:opacity-50"
          style={{ color: s.likedByMe ? ACCENT : TEXT_MUTED }}
        >
          <Icon name="sparkle" size={14} color="currentColor" /> {s.likeCount}
        </button>

        {isLead && (
          <select
            value={s.folder_id ?? ''}
            onChange={e => onSetFolder(s, e.target.value ? Number(e.target.value) : null)}
            className="pixel-input text-xs"
            style={{ width: 'auto', padding: '2px 8px' }}
          >
            <option value="">Без папки</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}

        {isLead ? (
          <select
            value={s.status}
            onChange={e => onSetStatus(s, e.target.value as SuggestionStatus)}
            className="pixel-input text-xs ml-auto"
            style={{ width: 'auto', padding: '2px 8px' }}
          >
            {(Object.keys(STATUS_LABELS) as SuggestionStatus[]).map(st => (
              <option key={st} value={st}>{STATUS_LABELS[st]}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-geist ml-auto" style={{ color: TEXT_MUTED }}>{STATUS_LABELS[s.status]}</span>
        )}

        {editable && (
          <button
            onClick={() => setEditing(true)}
            className="cursor-pointer transition-colors"
            style={{ color: TEXT_MUTED }}
            onMouseEnter={e => { e.currentTarget.style.color = ACCENT; }}
            onMouseLeave={e => { e.currentTarget.style.color = TEXT_MUTED; }}
            title="Редактировать (доступно 24 часа)"
          >
            <Icon name="pencil" size={14} color="currentColor" />
          </button>
        )}
        {(isLead || editable) && (
          <button
            onClick={() => onDelete(s)}
            className="cursor-pointer transition-colors"
            style={{ color: TEXT_MUTED }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e05252'; }}
            onMouseLeave={e => { e.currentTarget.style.color = TEXT_MUTED; }}
            title="Удалить"
          >
            <Icon name="close" size={14} color="currentColor" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function SuggestionsPage({ user, onLogout }: Props) {
  const isLead = user.role === 'lead' || user.role === 'admin';
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [folders, setFolders] = useState<SuggestionFolder[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [loadError, setLoadError] = useState('');

  const [type, setType] = useState<SuggestionType>('idea');
  const [text, setText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [likingIds, setLikingIds] = useState<Set<number>>(new Set());

  const load = () => {
    suggestionsApi.list()
      .then(r => {
        setList(r.data.rows);
        setHasMore(r.data.hasMore);
        setOffset(r.data.rows.length);
      })
      .catch((err: any) => setLoadError(err.response?.data?.error || 'Не удалось загрузить идеи'));
    if (isLead) {
      suggestionsApi.getFolders().then(r => setFolders(r.data)).catch((err: any) => showApiError(err, 'Не удалось загрузить папки'));
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await suggestionsApi.list({ offset });
      setList(ls => ls ? [...ls, ...res.data.rows] : res.data.rows);
      setHasMore(res.data.hasMore);
      setOffset(o => o + res.data.rows.length);
    } catch (err: any) {
      showApiError(err, 'Не удалось загрузить ещё');
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!text.trim()) { setSubmitError('Напиши текст'); return; }
    setSubmitting(true);
    setSubmitError('');
    try {
      await suggestionsApi.create({ type, text: text.trim(), is_anonymous: isAnonymous });
      setText('');
      setIsAnonymous(false);
      load();
    } catch (err: any) {
      setSubmitError(err.response?.data?.error || 'Не удалось отправить');
    } finally {
      setSubmitting(false);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await suggestionsApi.createFolder(newFolderName.trim());
      setNewFolderName('');
      load();
    } catch (err: any) {
      showApiError(err, 'Не удалось создать папку');
    }
  };

  const removeFolder = async (id: number) => {
    if (!confirm('Удалить папку? Идеи внутри останутся, просто станут «без папки».')) return;
    try {
      await suggestionsApi.removeFolder(id);
      load();
    } catch (err: any) {
      showApiError(err, 'Не удалось удалить папку');
    }
  };

  const toggleLike = async (s: Suggestion) => {
    if (likingIds.has(s.id)) return; // already in flight — ignore the double-click
    setLikingIds(ids => new Set(ids).add(s.id));
    setList(ls => ls ? ls.map(x => x.id === s.id ? { ...x, likedByMe: !x.likedByMe, likeCount: x.likeCount + (x.likedByMe ? -1 : 1) } : x) : ls);
    try {
      if (s.likedByMe) await suggestionsApi.unlike(s.id);
      else await suggestionsApi.like(s.id);
    } catch (err: any) {
      showApiError(err, 'Не удалось поставить лайк');
      load();
    } finally {
      setLikingIds(ids => { const next = new Set(ids); next.delete(s.id); return next; });
    }
  };

  const setStatus = async (s: Suggestion, status: SuggestionStatus) => {
    setList(ls => ls ? ls.map(x => x.id === s.id ? { ...x, status } : x) : ls);
    try {
      await suggestionsApi.setStatus(s.id, status);
    } catch (err: any) {
      showApiError(err, 'Не удалось изменить статус');
      load();
    }
  };

  const setFolder = async (s: Suggestion, folderId: number | null) => {
    setList(ls => ls ? ls.map(x => x.id === s.id ? { ...x, folder_id: folderId, folder_name: folders.find(f => f.id === folderId)?.name ?? null } : x) : ls);
    try {
      await suggestionsApi.setFolder(s.id, folderId);
    } catch (err: any) {
      showApiError(err, 'Не удалось переложить в папку');
      load();
    }
  };

  const saveEdit = async (s: Suggestion, data: { type: SuggestionType; text: string; is_anonymous: boolean }) => {
    await suggestionsApi.update(s.id, data);
    setList(ls => ls ? ls.map(x => x.id === s.id ? { ...x, ...data } : x) : ls);
  };

  const remove = async (s: Suggestion) => {
    if (!confirm('Удалить это предложение?')) return;
    try {
      await suggestionsApi.remove(s.id);
      setList(ls => ls ? ls.filter(x => x.id !== s.id) : ls);
    } catch (err: any) {
      showApiError(err, 'Не удалось удалить');
    }
  };

  const answerQuestion = async (s: Suggestion, answer: string) => {
    await suggestionsApi.answer(s.id, answer);
    setList(ls => ls ? ls.map(x => x.id === s.id ? { ...x, answer, answered_at: new Date().toISOString(), answered_by_name: user.name } : x) : ls);
  };

  const cardProps = { isLead, userId: user.id, folders, onLike: toggleLike, onSetStatus: setStatus, onSetFolder: setFolder, onSave: saveEdit, onDelete: remove, onAnswer: answerQuestion };

  const typeGroups = useMemo(() => {
    if (!list) return [];
    return TYPE_ORDER.filter(t => list.some(s => s.type === t))
      .map(t => ({ type: t, items: list.filter(s => s.type === t) }));
  }, [list]);

  const folderGroups = useMemo(() => {
    if (!list) return [];
    return [{ id: null as number | null, name: 'Без папки' }, ...folders]
      .map(f => ({ folder: f, items: list.filter(s => (s.folder_id ?? null) === f.id) }))
      .filter(g => g.items.length > 0);
  }, [list, folders]);

  return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="mb-6">
          <h1 className="font-montserrat font-bold mb-2 flex items-center gap-2" style={{ fontSize: 24, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
            <Icon name="lightbulb" size={22} color={BADGE_NOTIFY} /> Идеи и предложения
          </h1>
          <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>
            Идея, предложение, то, что бесит, или вопрос — пиши сюда. На вопрос ответит тимлид, ответ увидят все (это заодно и мини-FAQ команды). Можно анонимно: тимлид всё равно увидит автора (чтобы было кому сказать спасибо), но остальные увидят только «Аноним». Своё можно править или удалить в течение суток после публикации.
          </p>
        </div>

        {/* Submit form */}
        <div className="p-5 rounded-lg mb-6" style={{ background: CARD_BG, border: `1px solid ${ACCENT}40`, boxShadow: CARD_SHADOW }}>
          <div className="flex gap-2 mb-3 flex-wrap">
            {TYPE_ORDER.map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className="flex-1 min-w-[70px] py-2 rounded-lg text-xs font-geist font-semibold cursor-pointer transition-colors"
                style={{
                  background: type === t ? `${TYPE_COLORS[t]}25` : 'rgba(197, 198, 199,0.04)',
                  color: type === t ? TYPE_COLORS[t] : TEXT_MUTED,
                }}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value.slice(0, MAX_LENGTH))}
            placeholder={type === 'question' ? 'О чём хочешь спросить?' : 'Что предложить, посоветовать или на что пожаловаться?'}
            rows={4}
            className="w-full rounded-lg px-3 py-2 font-geist text-sm resize-none outline-none mb-2"
            style={{ background: PAGE_BG, color: TEXT_PRIMARY, border: '1px solid rgba(197, 198, 199,0.2)', lineHeight: 1.6 }}
          />
          <div className="flex items-center justify-between flex-wrap gap-3">
            <label className="flex items-center gap-2 text-xs font-geist cursor-pointer" style={{ color: TEXT_MUTED }}>
              <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} />
              Разместить анонимно
            </label>
            <button onClick={submit} disabled={submitting} className="btn-primary text-xs px-5 py-2 disabled:opacity-50">
              {submitting ? '...' : 'Отправить'}
            </button>
          </div>
          {submitError && <p className="text-xs font-geist mt-2 break-words" style={{ color: '#e05252' }}>{submitError}</p>}
        </div>

        {/* Lead-only folder management — purely their own private sorting */}
        {isLead && (
          <div className="p-4 rounded-lg mb-6" style={{ background: CARD_BG, border: '1px dashed rgba(197, 198, 199,0.2)' }}>
            <p className="text-xs font-geist mb-2" style={{ color: TEXT_MUTED }}>Папки видны только тебе — способ разложить идеи по смыслу или срочности.</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {folders.map(f => (
                <span key={f.id} className="flex items-center gap-1.5 text-xs font-geist px-2.5 py-1 rounded-lg" style={{ background: 'rgba(197, 198, 199,0.07)', color: TEXT_PRIMARY }}>
                  <span className="break-words min-w-0">{f.name}</span>
                  <button onClick={() => removeFolder(f.id)} aria-label={`Удалить папку ${f.name}`} style={{ color: '#e05252' }}>
                    <Icon name="close" size={12} color="currentColor" />
                  </button>
                </span>
              ))}
              {folders.length === 0 && <p className="text-xs font-geist" style={{ color: TEXT_MUTED }}>Папок пока нет.</p>}
            </div>
            <div className="flex gap-2 max-w-sm">
              <input
                className="pixel-input text-xs"
                placeholder="Например: Доработка сервисов"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createFolder()}
              />
              <button onClick={createFolder} className="btn-secondary text-xs px-4 py-2 shrink-0">+ Папка</button>
            </div>
          </div>
        )}

        {/* List */}
        {loadError && <p className="text-sm font-geist text-center py-6 break-words" style={{ color: '#e05252' }}>{loadError}</p>}
        {!loadError && !list && <SnailLoader />}
        {list && list.length === 0 && (
          <p className="text-sm font-geist text-center py-10" style={{ color: TEXT_MUTED }}>Пока ничего нет — стань первым.</p>
        )}

        {list && list.length > 0 && !isLead && (
          <div className="space-y-6">
            {typeGroups.map(({ type: t, items }) => (
              <div key={t}>
                <p className="font-montserrat font-semibold mb-3" style={{ color: TYPE_COLORS[t], fontSize: 13, letterSpacing: TRACK_WIDE }}>{TYPE_LABELS[t].toUpperCase()}</p>
                <div className="space-y-3">
                  {items.map(s => <SuggestionCard key={s.id} s={s} {...cardProps} isLiking={likingIds.has(s.id)} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {list && list.length > 0 && isLead && (
          <div className="space-y-6">
            {folderGroups.map(({ folder: f, items }) => (
              <div key={String(f.id)}>
                <p className="font-montserrat font-semibold mb-3 break-words" style={{ color: TEXT_MUTED, fontSize: 13, letterSpacing: TRACK_WIDE }}>{f.name.toUpperCase()}</p>
                <div className="space-y-3">
                  {items.map(s => <SuggestionCard key={s.id} s={s} {...cardProps} isLiking={likingIds.has(s.id)} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {list && list.length > 0 && hasMore && (
          <div className="flex justify-center mt-6">
            <button onClick={loadMore} disabled={loadingMore} className="btn-secondary text-xs px-4 py-2 disabled:opacity-50">
              {loadingMore ? 'Загрузка...' : 'Показать ещё'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
