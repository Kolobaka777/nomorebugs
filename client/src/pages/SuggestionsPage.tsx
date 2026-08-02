import { useEffect, useState } from 'react';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import PixelIcon from '../components/PixelIcon';
import { suggestionsApi } from '../api';
import { Suggestion, SuggestionType, SuggestionStatus } from '../types';
import { showApiError } from '../utils/toast';
import { timeAgo } from '../utils/date';

interface Props {
  user: any;
  onLogout: () => void;
}

const TYPE_LABELS: Record<SuggestionType, string> = {
  idea: 'Идея',
  suggestion: 'Предложение',
  complaint: 'Что бесит',
};
const TYPE_COLORS: Record<SuggestionType, string> = {
  idea: '#7F77DD',
  suggestion: '#1D9E75',
  complaint: '#e05252',
};
const STATUS_LABELS: Record<SuggestionStatus, string> = {
  new: 'Новое',
  reviewed: 'Рассмотрено',
  implemented: 'Внедрено',
  declined: 'Отклонено',
};

const MAX_LENGTH = 2000;

export default function SuggestionsPage({ user, onLogout }: Props) {
  const isLead = user.role === 'lead' || user.role === 'admin';
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [loadError, setLoadError] = useState('');

  const [type, setType] = useState<SuggestionType>('idea');
  const [text, setText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const load = () => {
    suggestionsApi.list()
      .then(r => setList(r.data))
      .catch((err: any) => setLoadError(err.response?.data?.error || 'Не удалось загрузить идеи'));
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

  const toggleLike = async (s: Suggestion) => {
    // Optimistic — a like is low-stakes and this is the kind of interaction
    // that feels broken if it visibly waits on a round trip.
    setList(ls => ls ? ls.map(x => x.id === s.id ? { ...x, likedByMe: !x.likedByMe, likeCount: x.likeCount + (x.likedByMe ? -1 : 1) } : x) : ls);
    try {
      if (s.likedByMe) await suggestionsApi.unlike(s.id);
      else await suggestionsApi.like(s.id);
    } catch (err: any) {
      showApiError(err, 'Не удалось поставить лайк');
      load();
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

  const remove = async (s: Suggestion) => {
    if (!confirm('Удалить это предложение?')) return;
    try {
      await suggestionsApi.remove(s.id);
      setList(ls => ls ? ls.filter(x => x.id !== s.id) : ls);
    } catch (err: any) {
      showApiError(err, 'Не удалось удалить');
    }
  };

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="mb-6">
          <h1 className="font-pixel text-primary mb-2" style={{ fontSize: '0.8rem', lineHeight: 1.8 }}>
            <span className="flex items-center gap-2"><PixelIcon name="lightbulb" size={14} color="#EF9F27" /> Идеи и предложения</span>
          </h1>
          <p className="text-pixel/60 text-sm font-sans">
            Идея, предложение или то, что бесит — пиши сюда. Можно анонимно: тимлид всё равно увидит автора (чтобы было кому сказать спасибо), но остальные увидят только «Аноним».
          </p>
        </div>

        {/* Submit form */}
        <div className="p-5 rounded mb-6" style={{ background: '#1a1a2e', boxShadow: '2px 0 0 0 rgba(29,158,117,0.25), -2px 0 0 0 rgba(29,158,117,0.25), 0 2px 0 0 rgba(29,158,117,0.25), 0 -2px 0 0 rgba(29,158,117,0.25)' }}>
          <div className="flex gap-2 mb-3">
            {(Object.keys(TYPE_LABELS) as SuggestionType[]).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className="flex-1 py-2 rounded text-xs font-sans font-semibold cursor-pointer transition-colors"
                style={{
                  background: type === t ? `${TYPE_COLORS[t]}25` : 'rgba(232,232,208,0.04)',
                  color: type === t ? TYPE_COLORS[t] : 'rgba(232,232,208,0.5)',
                }}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value.slice(0, MAX_LENGTH))}
            placeholder="Что предложить, посоветовать или на что пожаловаться?"
            rows={4}
            className="w-full rounded px-3 py-2 font-sans text-sm resize-none outline-none mb-2"
            style={{ background: '#0f0f1a', color: 'rgba(232,232,208,0.85)', border: '1px solid rgba(232,232,208,0.1)', lineHeight: 1.6 }}
          />
          <div className="flex items-center justify-between flex-wrap gap-3">
            <label className="flex items-center gap-2 text-xs font-sans cursor-pointer text-pixel/60">
              <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} />
              Разместить анонимно
            </label>
            <button onClick={submit} disabled={submitting} className="btn-primary text-xs px-5 py-2 disabled:opacity-50">
              {submitting ? '...' : 'Отправить'}
            </button>
          </div>
          {submitError && <p className="text-xs font-sans mt-2" style={{ color: '#e05252' }}>{submitError}</p>}
        </div>

        {/* List */}
        {loadError && <p className="text-sm font-sans text-center py-6" style={{ color: '#e05252' }}>{loadError}</p>}
        {!loadError && !list && <SnailLoader />}
        {list && list.length === 0 && (
          <p className="text-pixel/50 text-sm font-sans text-center py-10">Пока ничего нет — стань первым.</p>
        )}
        {list && list.length > 0 && (
          <div className="space-y-3">
            {list.map(s => (
              <div key={s.id} className="p-4 rounded" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.06)' }}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs font-sans font-semibold px-2 py-0.5 rounded" style={{ background: `${TYPE_COLORS[s.type]}20`, color: TYPE_COLORS[s.type] }}>
                    {TYPE_LABELS[s.type]}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-sans text-pixel/60">
                    {s.is_anonymous ? <PixelIcon name="lock" size={10} color="rgba(232,232,208,0.4)" /> : null}
                    {s.is_anonymous ? 'Аноним' : (s.author_name || '—')}
                  </span>
                  {isLead && s.is_anonymous && (
                    <span className="text-xs font-sans px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,159,39,0.12)', color: '#EF9F27' }}>
                      🕶 анонимно для команды
                    </span>
                  )}
                  <span className="text-pixel/40 text-xs font-sans ml-auto shrink-0">{timeAgo(s.created_at)}</span>
                </div>

                <p className="text-pixel font-sans text-sm leading-relaxed mb-3">{s.text}</p>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => toggleLike(s)}
                    className="flex items-center gap-1.5 text-xs font-sans cursor-pointer"
                    style={{ color: s.likedByMe ? '#1D9E75' : 'rgba(232,232,208,0.5)' }}
                  >
                    <PixelIcon name="sparkle" size={11} color="currentColor" /> {s.likeCount}
                  </button>

                  {isLead ? (
                    <select
                      value={s.status}
                      onChange={e => setStatus(s, e.target.value as SuggestionStatus)}
                      className="pixel-input text-xs ml-auto"
                      style={{ width: 'auto', padding: '2px 8px' }}
                    >
                      {(Object.keys(STATUS_LABELS) as SuggestionStatus[]).map(st => (
                        <option key={st} value={st}>{STATUS_LABELS[st]}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs font-sans ml-auto text-pixel/45">{STATUS_LABELS[s.status]}</span>
                  )}

                  {isLead && (
                    <button onClick={() => remove(s)} className="text-xs font-sans cursor-pointer text-pixel/30 hover:text-pixel/60" title="Удалить">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
