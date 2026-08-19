import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import FrogLoader from './FrogLoader';
import { suggestionsApi } from '../api';
import { Suggestion } from '../types';
import { showApiError } from '../utils/toast';
import { timeAgo, parseServerDate } from '../utils/date';
import { CARD_BG, PAGE_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, CARD_SHADOW, BADGE_NOTIFY, ERROR } from '../utils/theme';

// Questions to the team, moved here from the Идеи board. They were always a
// poor fit there — an idea is something you vote on and a lead triages into
// a folder, a question is something you want an answer to — and they were
// hard to find: someone with a question opened Помощь, read the FAQ, found
// nothing, and had no reason to think the answer might be one page over.
// Now the two sit together: the static FAQ first, and if it doesn't cover
// it, the form to ask right underneath.
//
// The storage is unchanged (suggestions, type 'question'), so everything
// already asked and answered came along. The board simply stopped showing
// that type — see the ?type= filter in server/src/routes/suggestions.js.

const MAX_LENGTH = 2000;
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function QuestionCard({ q, isLead, userId, onAnswer, onDelete, onLike, isLiking }: {
  q: Suggestion;
  isLead: boolean;
  userId: number;
  onAnswer: (q: Suggestion, answer: string) => Promise<void>;
  onDelete: (q: Suggestion) => void;
  onLike: (q: Suggestion) => void;
  isLiking: boolean;
}) {
  const navigate = useNavigate();
  const [answering, setAnswering] = useState(false);
  const [answerText, setAnswerText] = useState(q.answer || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const mine = q.user_id === userId && Date.now() - parseServerDate(q.created_at).getTime() < EDIT_WINDOW_MS;

  const submit = async () => {
    if (!answerText.trim()) { setError('Напиши текст ответа'); return; }
    setSaving(true);
    setError('');
    try {
      await onAnswer(q, answerText.trim());
      setAnswering(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось отправить ответ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 rounded-lg" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199,0.2)', boxShadow: CARD_SHADOW }}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span
          className={`flex items-center gap-1 text-xs font-geist min-w-0 ${!q.is_anonymous && q.user_id ? 'cursor-pointer hover:underline' : ''}`}
          style={{ color: TEXT_MUTED }}
          onClick={() => !q.is_anonymous && q.user_id && navigate(`/profile/${q.user_id}`)}
        >
          {q.is_anonymous ? <Icon name="lock" size={12} color={TEXT_MUTED} /> : null}
          <span className="break-words min-w-0">{q.is_anonymous ? 'Аноним' : (q.author_name || '—')}</span>
        </span>
        {isLead && q.is_anonymous && (
          <span className="flex items-center gap-1 text-xs font-geist px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,159,39,0.12)', color: BADGE_NOTIFY }}>
            <Icon name="lock" size={12} color={BADGE_NOTIFY} /> анонимно для команды
          </span>
        )}
        <span className="text-xs font-geist ml-auto shrink-0" style={{ color: TEXT_MUTED }}>{timeAgo(q.created_at)}</span>
      </div>

      <p className="font-geist text-sm leading-relaxed mb-3 break-words" style={{ color: TEXT_PRIMARY }}>{q.text}</p>

      {q.answer ? (
        <div className="p-3 rounded-lg mb-3 flex gap-2" style={{ background: 'rgba(102, 252, 241, 0.08)', border: `1px solid ${ACCENT}30` }}>
          <Icon name="check" size={14} color={ACCENT} />
          <div className="min-w-0">
            <p className="text-xs font-geist font-semibold mb-1" style={{ color: ACCENT }}>
              Ответ{q.answered_by_name ? ` от ${q.answered_by_name}` : ''}
            </p>
            <p className="text-sm font-geist leading-relaxed break-words" style={{ color: TEXT_PRIMARY }}>{q.answer}</p>
          </div>
        </div>
      ) : isLead ? (
        answering ? (
          <div className="mb-3">
            <textarea
              value={answerText}
              onChange={e => setAnswerText(e.target.value.slice(0, MAX_LENGTH))}
              rows={3}
              placeholder="Твой ответ..."
              aria-label="Текст ответа"
              className="w-full rounded-lg px-3 py-2 font-geist text-sm resize-none outline-none mb-2"
              style={{ background: PAGE_BG, color: TEXT_PRIMARY, border: '1px solid rgba(197, 198, 199,0.2)', lineHeight: 1.6 }}
            />
            <div className="flex gap-2">
              <button onClick={submit} disabled={saving} className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50">
                {saving ? '...' : 'Ответить'}
              </button>
              <button onClick={() => setAnswering(false)} className="text-xs font-geist px-3 py-1.5 rounded-lg cursor-pointer" style={{ color: TEXT_MUTED }}>Отмена</button>
            </div>
            {error && <p className="text-xs font-geist mt-2 break-words" style={{ color: ERROR }}>{error}</p>}
          </div>
        ) : (
          <button onClick={() => setAnswering(true)} className="btn-secondary text-xs px-3 py-1.5 mb-3 flex items-center gap-1.5" style={{ color: ACCENT }}>
            <Icon name="lightbulb" size={13} color="currentColor" /> Ответить
          </button>
        )
      ) : (
        <p className="text-xs font-geist mb-3 flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
          <Icon name="clock" size={12} color={TEXT_MUTED} /> Ждём ответа тимлида
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {/* Not a popularity contest — it tells the lead which unanswered
            question more than one person is waiting on. */}
        <button
          onClick={() => onLike(q)}
          disabled={isLiking}
          className="flex items-center gap-1.5 text-xs font-geist cursor-pointer disabled:opacity-50"
          style={{ color: q.likedByMe ? ACCENT : TEXT_MUTED }}
        >
          <Icon name="sparkle" size={14} color="currentColor" /> Тоже интересно{q.likeCount > 0 ? ` · ${q.likeCount}` : ''}
        </button>
        {(isLead || mine) && (
          <button
            onClick={() => onDelete(q)}
            className="ml-auto cursor-pointer"
            style={{ color: TEXT_MUTED }}
            aria-label="Удалить вопрос"
            title="Удалить"
          >
            <Icon name="close" size={14} color="currentColor" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function TeamQuestions({ user }: { user: any }) {
  const isLead = user.role === 'lead' || user.role === 'admin';
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [sent, setSent] = useState(false);
  const [likingIds, setLikingIds] = useState<Set<number>>(new Set());

  const load = () => {
    setLoadError('');
    suggestionsApi.list({ type: 'question' })
      .then(r => {
        setList(r.data.rows);
        setHasMore(r.data.hasMore);
        setOffset(r.data.rows.length);
      })
      .catch((err: any) => setLoadError(err.response?.data?.error || 'Не удалось загрузить вопросы'));
  };
  useEffect(load, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await suggestionsApi.list({ offset, type: 'question' });
      setList(ls => ls ? [...ls, ...res.data.rows] : res.data.rows);
      setHasMore(res.data.hasMore);
      setOffset(o => o + res.data.rows.length);
    } catch (err: any) {
      showApiError(err, 'Не удалось загрузить ещё');
    } finally {
      setLoadingMore(false);
    }
  };

  const submit = async () => {
    if (!text.trim()) { setSubmitError('Напиши вопрос'); return; }
    setSubmitting(true);
    setSubmitError('');
    try {
      await suggestionsApi.create({ type: 'question', text: text.trim(), is_anonymous: isAnonymous });
      setText('');
      setIsAnonymous(false);
      setSent(true);
      load();
    } catch (err: any) {
      setSubmitError(err.response?.data?.error || 'Не удалось отправить');
    } finally {
      setSubmitting(false);
    }
  };

  const answer = async (q: Suggestion, answerText: string) => {
    await suggestionsApi.answer(q.id, answerText);
    setList(ls => ls ? ls.map(x => x.id === q.id
      ? { ...x, answer: answerText, answered_at: new Date().toISOString(), answered_by_name: user.name }
      : x) : ls);
  };

  const remove = async (q: Suggestion) => {
    if (!confirm('Удалить этот вопрос?')) return;
    try {
      await suggestionsApi.remove(q.id);
      setList(ls => ls ? ls.filter(x => x.id !== q.id) : ls);
    } catch (err: any) {
      showApiError(err, 'Не удалось удалить');
    }
  };

  const toggleLike = async (q: Suggestion) => {
    if (likingIds.has(q.id)) return; // already in flight — ignore the double-click
    setLikingIds(ids => new Set(ids).add(q.id));
    setList(ls => ls ? ls.map(x => x.id === q.id
      ? { ...x, likedByMe: !x.likedByMe, likeCount: x.likeCount + (x.likedByMe ? -1 : 1) }
      : x) : ls);
    try {
      if (q.likedByMe) await suggestionsApi.unlike(q.id);
      else await suggestionsApi.like(q.id);
    } catch (err: any) {
      showApiError(err, 'Не удалось отметить');
      load();
    } finally {
      setLikingIds(ids => { const next = new Set(ids); next.delete(q.id); return next; });
    }
  };

  // Unanswered first: someone scrolling down here is either waiting for an
  // answer or (as a lead) looking for what still needs one. Within each
  // half the server's newest-first order is kept.
  const sorted = list ? [...list].sort((a, b) => Number(!!a.answer) - Number(!!b.answer)) : null;

  return (
    <div>
      <div className="p-5 rounded-lg mb-6" style={{ background: CARD_BG, border: `1px solid ${ACCENT}40`, boxShadow: CARD_SHADOW }}>
        <p className="font-geist text-sm font-semibold mb-1" style={{ color: TEXT_PRIMARY }}>Не нашлось ответа? Спроси</p>
        <p className="font-geist text-xs mb-3" style={{ color: TEXT_MUTED }}>
          Отвечает тимлид, ответ видит вся команда — так вопрос заодно попадает сюда же, в общий список.
          Можно анонимно: тимлид всё равно увидит автора (чтобы было кому ответить лично, если нужно), остальные увидят «Аноним».
        </p>
        <textarea
          value={text}
          onChange={e => { setText(e.target.value.slice(0, MAX_LENGTH)); setSent(false); }}
          placeholder="О чём хочешь спросить?"
          aria-label="Текст вопроса"
          rows={3}
          className="w-full rounded-lg px-3 py-2 font-geist text-sm resize-none outline-none mb-2"
          style={{ background: PAGE_BG, color: TEXT_PRIMARY, border: '1px solid rgba(197, 198, 199,0.2)', lineHeight: 1.6 }}
        />
        <div className="flex items-center justify-between flex-wrap gap-3">
          <label className="flex items-center gap-2 text-xs font-geist cursor-pointer" style={{ color: TEXT_MUTED }}>
            <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} />
            Спросить анонимно
          </label>
          <button onClick={submit} disabled={submitting} className="btn-primary text-xs px-5 py-2 disabled:opacity-50">
            {submitting ? '...' : 'Спросить'}
          </button>
        </div>
        {submitError && <p className="text-xs font-geist mt-2 break-words" style={{ color: ERROR }}>{submitError}</p>}
        {sent && !submitError && (
          <p className="text-xs font-geist mt-2 flex items-center gap-1.5" style={{ color: ACCENT }}>
            <Icon name="check" size={13} color="currentColor" /> Отправлено — ответ появится тут же.
          </p>
        )}
      </div>

      {loadError && (
        <div className="text-center py-6">
          <p className="text-sm font-geist mb-3 break-words" style={{ color: ERROR }}>{loadError}</p>
          <button onClick={load} className="btn-secondary text-xs px-4 py-2">Повторить</button>
        </div>
      )}
      {!loadError && !sorted && <FrogLoader />}
      {sorted && sorted.length === 0 && (
        <p className="text-sm font-geist text-center py-8" style={{ color: TEXT_MUTED }}>
          Вопросов пока никто не задавал.
        </p>
      )}

      {sorted && sorted.length > 0 && (
        <div className="space-y-3 stagger-in">
          {sorted.map(q => (
            <QuestionCard
              key={q.id}
              q={q}
              isLead={isLead}
              userId={user.id}
              onAnswer={answer}
              onDelete={remove}
              onLike={toggleLike}
              isLiking={likingIds.has(q.id)}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="text-center mt-4">
          <button onClick={loadMore} disabled={loadingMore} className="btn-secondary text-xs px-5 py-2 disabled:opacity-50">
            {loadingMore ? '...' : 'Показать ещё'}
          </button>
        </div>
      )}
    </div>
  );
}
