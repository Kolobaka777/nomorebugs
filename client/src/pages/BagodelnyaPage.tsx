import { useState, useEffect } from 'react';
import Navigation from '../components/Navigation';
import FrogLoader from '../components/FrogLoader';
import Icon, { IconName } from '../components/Icon';
import { knowledgeApi } from '../api';
import { showApiError } from '../utils/toast';
import { pickByGender } from '../utils/gender';
import { Gender } from '../types';
import {
  PAGE_GRADIENT, PAGE_BG, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, TRACK_WIDE, CARD_SHADOW,
} from '../utils/theme';

// "Как писать правильно" gets its own green (matching the app's other
// "good/new" green — see ZhukademiPage's NEW_BADGE_COLOR) instead of the
// site's usual teal ACCENT, so it reads visually distinct from "Как писать
// НЕ надо" (red) without the two ever being confusable with a neutral
// info color. Scoped to just this concept — the tabs/glossary sections on
// this page keep the normal ACCENT teal.
const GOOD_GREEN = '#4ADE80';
// Same amber used everywhere else in the app for a tester's proposal
// awaiting lead review (see ZhukademiPage's CourseCard, GuidesPage).
const PENDING_AMBER = '#EF9F27';

interface BagodelnyaPageProps {
  user: any;
  onLogout: () => void;
}

type Tab = 'examples' | 'glossary';

interface BugExample {
  id: number;
  tag: string;
  tag_color: string;
  problem: string;
  bad_text: string;
  good_text: string;
  is_published?: boolean | number;
  proposal_status?: 'pending' | 'approved' | 'rejected' | null;
  created_by?: number | null;
  author_name?: string | null;
  author_gender?: Gender;
}

interface GlossaryTerm {
  id: number;
  term: string;
  definition: string;
  is_published?: boolean | number;
  proposal_status?: 'pending' | 'approved' | 'rejected' | null;
  created_by?: number | null;
  author_name?: string | null;
  author_gender?: Gender;
}

const TAG_COLORS = ['#7F77DD', '#66FCF1', '#EF9F27', '#e05252', '#4fc3f7', '#ff8a65'];

function PendingBadge() {
  return (
    <span className="font-geist font-semibold rounded px-2 py-0.5 shrink-0" style={{ fontSize: 11, background: 'rgba(239,159,39,0.15)', color: PENDING_AMBER }}>
      На рассмотрении
    </span>
  );
}

function BugExampleForm({
  initial, isProposing, onSave, onCancel,
}: {
  initial?: BugExample;
  isProposing?: boolean;
  onSave: (data: { tag: string; tag_color: string; problem: string; bad_text: string; good_text: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [tag, setTag] = useState(initial?.tag || 'Общее');
  const [tagColor, setTagColor] = useState(initial?.tag_color || TAG_COLORS[0]);
  const [problem, setProblem] = useState(initial?.problem || '');
  const [badText, setBadText] = useState(initial?.bad_text || '');
  const [goodText, setGoodText] = useState(initial?.good_text || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!problem.trim() || !badText.trim() || !goodText.trim()) {
      setError('Заполните проблему и оба примера');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSave({ tag: tag.trim(), tag_color: tagColor, problem: problem.trim(), bad_text: badText.trim(), good_text: goodText.trim() });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 rounded-lg mb-5 space-y-3" style={{ background: CARD_BG, boxShadow: CARD_SHADOW }}>
      {isProposing && (
        <p className="text-xs font-geist" style={{ color: TEXT_MUTED }}>
          Пример увидят только ты и тимлид, пока тимлид его не одобрит — после этого он появится у всех.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-geist mb-1.5" style={{ color: TEXT_MUTED }}>Тег категории</label>
          <input className="pixel-input" value={tag} onChange={e => setTag(e.target.value)} placeholder="Например: Визуал" />
        </div>
        <div>
          <label className="block text-xs font-geist mb-1.5" style={{ color: TEXT_MUTED }}>Цвет тега</label>
          <div className="flex gap-2">
            {TAG_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setTagColor(c)}
                className="w-7 h-7 rounded-full cursor-pointer transition-transform"
                style={{ background: c, boxShadow: tagColor === c ? `0 0 0 2px ${PAGE_BG}, 0 0 0 4px ${c}` : 'none', transform: tagColor === c ? 'scale(1.1)' : 'scale(1)' }}
              />
            ))}
          </div>
        </div>
      </div>
      <div>
        <label className="block text-xs font-geist mb-1.5" style={{ color: TEXT_MUTED }}>Проблема (короткое описание)</label>
        <input className="pixel-input" value={problem} onChange={e => setProblem(e.target.value)} placeholder="Например: Неверный отступ в секции" />
      </div>
      <div>
        <label className="flex items-center gap-1.5 text-xs font-geist mb-1.5" style={{ color: '#e05252' }}>
          <Icon name="close" size={13} color="currentColor" /> Как писать НЕ надо
        </label>
        <textarea className="pixel-input w-full resize-y" rows={3} value={badText} onChange={e => setBadText(e.target.value)} placeholder="Плохой пример баг-репорта" />
      </div>
      <div>
        <label className="flex items-center gap-1.5 text-xs font-geist mb-1.5" style={{ color: GOOD_GREEN }}>
          <Icon name="check" size={13} color="currentColor" /> Как писать правильно
        </label>
        <textarea className="pixel-input w-full resize-y" rows={5} value={goodText} onChange={e => setGoodText(e.target.value)} placeholder="Хороший пример баг-репорта" />
      </div>
      {error && <p className="text-xs font-geist break-words" style={{ color: '#e05252' }}>{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={saving} className="btn-primary text-xs px-4 py-2">
          {saving ? 'Сохраняю...' : isProposing ? 'Отправить на рассмотрение' : 'Сохранить'}
        </button>
        <button onClick={onCancel} className="btn-secondary text-xs px-4 py-2">Отмена</button>
      </div>
    </div>
  );
}

function GlossaryForm({
  initial, isProposing, onSave, onCancel,
}: {
  initial?: GlossaryTerm;
  isProposing?: boolean;
  onSave: (data: { term: string; definition: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [term, setTerm] = useState(initial?.term || '');
  const [definition, setDefinition] = useState(initial?.definition || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!term.trim() || !definition.trim()) { setError('Заполните термин и определение'); return; }
    setError('');
    setSaving(true);
    try {
      await onSave({ term: term.trim(), definition: definition.trim() });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 rounded-lg mb-5 space-y-3" style={{ background: CARD_BG, boxShadow: CARD_SHADOW }}>
      {isProposing && (
        <p className="text-xs font-geist" style={{ color: TEXT_MUTED }}>
          Термин увидят только ты и тимлид, пока тимлид его не одобрит — после этого он появится у всех.
        </p>
      )}
      <div>
        <label className="block text-xs font-geist mb-1.5" style={{ color: TEXT_MUTED }}>Термин</label>
        <input className="pixel-input" value={term} onChange={e => setTerm(e.target.value)} placeholder="Например: Regression" />
      </div>
      <div>
        <label className="block text-xs font-geist mb-1.5" style={{ color: TEXT_MUTED }}>Определение</label>
        <textarea className="pixel-input w-full resize-y" rows={3} value={definition} onChange={e => setDefinition(e.target.value)} />
      </div>
      {error && <p className="text-xs font-geist break-words" style={{ color: '#e05252' }}>{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={saving} className="btn-primary text-xs px-4 py-2">
          {saving ? 'Сохраняю...' : isProposing ? 'Отправить на рассмотрение' : 'Сохранить'}
        </button>
        <button onClick={onCancel} className="btn-secondary text-xs px-4 py-2">Отмена</button>
      </div>
    </div>
  );
}

export default function BagodelnyaPage({ user, onLogout }: BagodelnyaPageProps) {
  const [tab, setTab] = useState<Tab>('examples');
  const [loading, setLoading] = useState(true);
  const [bugExamples, setBugExamples] = useState<BugExample[]>([]);
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([]);
  const [canEdit, setCanEdit] = useState(user.role === 'lead' || user.role === 'admin');

  const [addingExample, setAddingExample] = useState(false);
  const [editingExampleId, setEditingExampleId] = useState<number | null>(null);
  const [addingTerm, setAddingTerm] = useState(false);
  const [editingTermId, setEditingTermId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');
  const [approvingId, setApprovingId] = useState<number | null>(null);

  useEffect(() => {
    load();
    if (user.role !== 'lead' && user.role !== 'admin') {
      knowledgeApi.getMyPermissions().then(r => setCanEdit(r.data.includes('manage_knowledge_base'))).catch(() => {});
    }
  }, []);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [exRes, glRes] = await Promise.all([knowledgeApi.getBugExamples(), knowledgeApi.getGlossary()]);
      setBugExamples(exRes.data);
      setGlossary(glRes.data);
    } catch (err: any) {
      // Was a silent no-op — a failed load looked exactly like "no examples/
      // terms yet" (both left the lists at their empty default), which is
      // misleading rather than merely quiet.
      setLoadError(err.response?.data?.error || 'Не удалось загрузить базу знаний');
    }
    finally { setLoading(false); }
  };

  const deleteExample = async (id: number, isDecline?: boolean) => {
    if (!confirm(isDecline ? 'Отклонить этот пример?' : 'Удалить этот пример?')) return;
    try {
      await knowledgeApi.deleteBugExample(id);
      setBugExamples(p => p.filter(e => e.id !== id));
    } catch (err: any) {
      showApiError(err, isDecline ? 'Не удалось отклонить пример' : 'Не удалось удалить пример');
    }
  };

  const approveExample = async (id: number) => {
    setApprovingId(id);
    try {
      await knowledgeApi.approveBugExample(id);
      setBugExamples(p => p.map(e => e.id === id ? { ...e, is_published: true, proposal_status: 'approved' } : e));
    } catch (err: any) {
      showApiError(err, 'Не удалось одобрить пример');
    } finally {
      setApprovingId(null);
    }
  };

  const deleteTerm = async (id: number, isDecline?: boolean) => {
    if (!confirm(isDecline ? 'Отклонить этот термин?' : 'Удалить этот термин?')) return;
    try {
      await knowledgeApi.deleteGlossaryTerm(id);
      setGlossary(p => p.filter(g => g.id !== id));
    } catch (err: any) {
      showApiError(err, isDecline ? 'Не удалось отклонить термин' : 'Не удалось удалить термин');
    }
  };

  const approveTerm = async (id: number) => {
    setApprovingId(id);
    try {
      await knowledgeApi.approveGlossaryTerm(id);
      setGlossary(p => p.map(g => g.id === id ? { ...g, is_published: true, proposal_status: 'approved' } : g));
    } catch (err: any) {
      showApiError(err, 'Не удалось одобрить термин');
    } finally {
      setApprovingId(null);
    }
  };

  const TABS: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'examples', label: 'Примеры багов', icon: 'bug' },
    { id: 'glossary', label: 'Словарь', icon: 'books' },
  ];

  return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="max-w-6xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="mb-8 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-montserrat font-bold mb-2 flex items-center gap-2.5" style={{ fontSize: 24, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
              <Icon name="books" size={22} color={ACCENT} />
              Квакодельня
            </h1>
            <p className="text-sm font-geist" style={{ color: TEXT_MUTED }}>База знаний тестировщика</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="rounded-lg font-geist font-semibold cursor-pointer px-3.5 py-2 flex items-center gap-1.5 transition-colors"
              style={{
                fontSize: 13,
                background: tab === t.id ? ACCENT : 'rgba(197, 198, 199, 0.06)',
                color: tab === t.id ? PAGE_BG : 'rgba(197, 198, 199, 0.6)',
              }}
            >
              <Icon name={t.icon} size={14} color="currentColor" />
              {t.label}
            </button>
          ))}
        </div>

        {loading && <FrogLoader />}

        {!loading && loadError && (
          <div className="rounded-lg text-center py-8 mb-6" style={{ background: CARD_BG, boxShadow: CARD_SHADOW }}>
            <p className="text-sm font-geist mb-3 break-words" style={{ color: '#e05252' }}>{loadError}</p>
            <button onClick={load} className="btn-secondary text-xs px-4 py-2">Повторить</button>
          </div>
        )}

        {!loading && !loadError && tab === 'examples' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT: примеры */}
            <div className="lg:col-span-2">
              {!addingExample && (
                <button onClick={() => setAddingExample(true)} className="btn-primary text-xs px-4 py-2 mb-5 flex items-center gap-1.5">
                  <Icon name="sparkle" size={14} color="currentColor" />
                  {canEdit ? 'Добавить пример' : 'Предложить пример'}
                </button>
              )}
              {addingExample && (
                <BugExampleForm
                  isProposing={!canEdit}
                  onSave={async (data) => {
                    const res = await knowledgeApi.createBugExample(data);
                    setBugExamples(p => [
                      { id: res.data.id, ...data, is_published: canEdit, proposal_status: canEdit ? null : 'pending' as const, created_by: user.id, author_name: user.name },
                      ...p,
                    ]);
                    setAddingExample(false);
                  }}
                  onCancel={() => setAddingExample(false)}
                />
              )}

              {/* Column headers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 px-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#e05252' }} />
                  <span className="font-montserrat font-semibold flex items-center gap-1.5" style={{ color: '#e05252', fontSize: 13, letterSpacing: TRACK_WIDE }}>
                    <Icon name="close" size={13} color="currentColor" /> Как писать НЕ надо
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: GOOD_GREEN }} />
                  <span className="font-montserrat font-semibold flex items-center gap-1.5" style={{ color: GOOD_GREEN, fontSize: 13, letterSpacing: TRACK_WIDE }}>
                    <Icon name="check" size={13} color="currentColor" /> Как писать правильно
                  </span>
                </div>
              </div>

              {bugExamples.length === 0 && (
                <p className="text-sm font-geist text-center py-8" style={{ color: 'rgba(197, 198, 199, 0.55)' }}>Пока нет примеров</p>
              )}

              <div className="space-y-5">
                {bugExamples.map((pair) => {
                  const isPending = pair.proposal_status === 'pending';
                  const isOwn = pair.created_by === user.id;
                  return (
                    <div key={pair.id}>
                      {editingExampleId === pair.id ? (
                        <BugExampleForm
                          initial={pair}
                          onSave={async (data) => {
                            await knowledgeApi.updateBugExample(pair.id, data);
                            setBugExamples(p => p.map(e => e.id === pair.id ? { ...e, ...data } : e));
                            setEditingExampleId(null);
                          }}
                          onCancel={() => setEditingExampleId(null)}
                        />
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-2 px-1 flex-wrap">
                            <span
                              className="text-xs font-geist px-2 py-0.5 rounded font-semibold shrink-0 break-words"
                              style={{ background: `${pair.tag_color}18`, color: pair.tag_color }}
                            >
                              {pair.tag}
                            </span>
                            <span className="text-xs font-geist flex-1 min-w-0 break-words" style={{ color: TEXT_MUTED }}>{pair.problem}</span>
                            {isPending && <PendingBadge />}
                            {isPending && !canEdit && isOwn && (
                              <span className="text-xs font-geist shrink-0" style={{ color: TEXT_MUTED }}>Ждёт лида</span>
                            )}
                            {isPending && canEdit && pair.author_name && (
                              <span className="text-xs font-geist shrink-0" style={{ color: TEXT_MUTED }}>
                                {pickByGender(pair.author_gender, `Предложил: ${pair.author_name}`, `Предложила: ${pair.author_name}`, `Предложение от ${pair.author_name}`)}
                              </span>
                            )}
                            {canEdit && isPending && (
                              <div className="flex gap-1 shrink-0">
                                <button
                                  onClick={() => approveExample(pair.id)}
                                  disabled={approvingId === pair.id}
                                  aria-label="Одобрить пример"
                                  className="btn-secondary text-xs px-2 py-0.5 disabled:opacity-50"
                                  style={{ color: GOOD_GREEN }}
                                >
                                  <Icon name="check" size={13} color="currentColor" />
                                </button>
                                <button onClick={() => deleteExample(pair.id, true)} aria-label="Отклонить пример" className="btn-secondary text-xs px-2 py-0.5" style={{ color: '#e05252' }}>
                                  <Icon name="close" size={13} color="currentColor" />
                                </button>
                              </div>
                            )}
                            {canEdit && !isPending && (
                              <div className="flex gap-1 shrink-0">
                                <button onClick={() => setEditingExampleId(pair.id)} aria-label="Редактировать пример" className="btn-secondary text-xs px-2 py-0.5">
                                  <Icon name="pencil" size={13} color="currentColor" />
                                </button>
                                <button onClick={() => deleteExample(pair.id)} aria-label="Удалить пример" className="btn-secondary text-xs px-2 py-0.5" style={{ color: '#e05252' }}>
                                  <Icon name="close" size={13} color="currentColor" />
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="p-4 rounded-lg flex flex-col gap-2" style={{ background: CARD_BG, borderLeft: '3px solid #e05252', boxShadow: CARD_SHADOW }}>
                              <span className="flex items-center gap-1.5 text-xs font-montserrat font-semibold shrink-0" style={{ color: '#e05252', letterSpacing: TRACK_WIDE }}>
                                <Icon name="close" size={13} color="currentColor" /> ПЛОХО
                              </span>
                              <p className="text-xs font-geist leading-relaxed whitespace-pre-line break-words" style={{ color: TEXT_MUTED }}>{pair.bad_text}</p>
                            </div>
                            <div className="p-4 rounded-lg flex flex-col gap-2" style={{ background: CARD_BG, borderLeft: `3px solid ${GOOD_GREEN}`, boxShadow: CARD_SHADOW }}>
                              <span className="flex items-center gap-1.5 text-xs font-montserrat font-semibold shrink-0" style={{ color: GOOD_GREEN, letterSpacing: TRACK_WIDE }}>
                                <Icon name="check" size={13} color="currentColor" /> ПРАВИЛЬНО
                              </span>
                              <p className="text-xs font-geist leading-relaxed whitespace-pre-line break-words" style={{ color: 'rgba(197, 198, 199, 0.7)' }}>{pair.good_text}</p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: правила — was a full-width block below the list,
                moved into its own sidebar column so it's visible without
                scrolling past every example. */}
            <div>
              <div className="p-5 rounded-lg lg:sticky lg:top-20" style={{ background: CARD_BG, border: '1px solid rgba(239,159,39,0.35)', boxShadow: CARD_SHADOW }}>
                <p className="font-montserrat font-semibold mb-4 flex items-center gap-2" style={{ fontSize: 13, color: '#EF9F27', letterSpacing: TRACK_WIDE }}>
                  <Icon name="lightbulb" size={16} color="#EF9F27" />
                  Правила хорошего баг-отчёта
                </p>
                <div className="space-y-4">
                  {[
                    ['Конкретность', 'Укажи точное место: блок, элемент, порядковый номер пункта чеклиста'],
                    ['Воспроизводимость', 'Опиши шаги так, чтобы любой мог повторить и увидеть тот же баг'],
                    ['Ссылка на стандарт', 'Всегда указывай пункт чеклиста — это доказывает что это действительно ошибка'],
                    ['Факт, не мнение', '"Цвет #000 вместо #FF0000" — факт. "Выглядит некрасиво" — мнение'],
                    ['Один баг — один отчёт', 'Не смешивай несколько проблем в одном сообщении'],
                    ['Скриншот', 'Если возможно — прикрепи скриншот с выделенной областью ошибки'],
                  ].map(([title, desc]) => (
                    <div key={title}>
                      <p className="text-xs font-geist font-semibold mb-1" style={{ color: 'rgba(197, 198, 199, 0.7)' }}>{title}</p>
                      <p className="text-xs font-geist" style={{ color: TEXT_MUTED }}>{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && !loadError && tab === 'glossary' && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <h2 className="font-montserrat font-semibold flex items-center gap-2" style={{ fontSize: 16, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
                <Icon name="books" size={18} color="currentColor" />
                Словарь тестировщика
              </h2>
              {!addingTerm && (
                <button onClick={() => setAddingTerm(true)} className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
                  <Icon name="sparkle" size={14} color="currentColor" />
                  {canEdit ? 'Добавить термин' : 'Предложить термин'}
                </button>
              )}
            </div>

            {addingTerm && (
              <GlossaryForm
                isProposing={!canEdit}
                onSave={async (data) => {
                  const res = await knowledgeApi.createGlossaryTerm(data);
                  setGlossary(p => [
                    ...p,
                    { id: res.data.id, ...data, is_published: canEdit, proposal_status: canEdit ? null : 'pending' as const, created_by: user.id, author_name: user.name },
                  ].sort((a, b) => a.term.localeCompare(b.term)));
                  setAddingTerm(false);
                }}
                onCancel={() => setAddingTerm(false)}
              />
            )}

            {glossary.length === 0 && (
              <p className="text-sm font-geist text-center py-8" style={{ color: 'rgba(197, 198, 199, 0.55)' }}>Пока нет терминов</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {glossary.map(item => {
                const isPending = item.proposal_status === 'pending';
                const isOwn = item.created_by === user.id;
                return editingTermId === item.id ? (
                  <div key={item.id} className="md:col-span-2">
                    <GlossaryForm
                      initial={item}
                      onSave={async (data) => {
                        await knowledgeApi.updateGlossaryTerm(item.id, data);
                        setGlossary(p => p.map(g => g.id === item.id ? { ...g, ...data } : g).sort((a, b) => a.term.localeCompare(b.term)));
                        setEditingTermId(null);
                      }}
                      onCancel={() => setEditingTermId(null)}
                    />
                  </div>
                ) : (
                  <div
                    key={item.id}
                    className="p-4 rounded-lg flex flex-wrap gap-4"
                    style={{ background: CARD_BG, border: '1px solid rgba(102, 252, 241, 0.28)', boxShadow: CARD_SHADOW }}
                  >
                    <div
                      className="shrink-0 px-2 py-1 rounded text-xs font-montserrat font-semibold max-w-full break-words"
                      style={{ background: 'rgba(102, 252, 241, 0.15)', color: ACCENT, alignSelf: 'flex-start' }}
                    >
                      {item.term}
                    </div>
                    <p className="text-xs font-geist leading-relaxed flex-1 min-w-0 break-words" style={{ color: TEXT_MUTED }}>{item.definition}</p>
                    {isPending && (
                      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                        <PendingBadge />
                        {canEdit ? (
                          item.author_name && (
                            <span className="text-xs font-geist" style={{ color: TEXT_MUTED }}>
                              {pickByGender(item.author_gender, `Предложил: ${item.author_name}`, `Предложила: ${item.author_name}`, `Предложение от ${item.author_name}`)}
                            </span>
                          )
                        ) : isOwn ? (
                          <span className="text-xs font-geist" style={{ color: TEXT_MUTED }}>Ждёт лида</span>
                        ) : null}
                      </div>
                    )}
                    {canEdit && isPending && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => approveTerm(item.id)}
                          disabled={approvingId === item.id}
                          aria-label="Одобрить термин"
                          className="btn-secondary text-xs px-2 py-0.5 disabled:opacity-50"
                          style={{ color: GOOD_GREEN }}
                        >
                          <Icon name="check" size={13} color="currentColor" />
                        </button>
                        <button onClick={() => deleteTerm(item.id, true)} aria-label="Отклонить термин" className="btn-secondary text-xs px-2 py-0.5" style={{ color: '#e05252' }}>
                          <Icon name="close" size={13} color="currentColor" />
                        </button>
                      </div>
                    )}
                    {canEdit && !isPending && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setEditingTermId(item.id)} aria-label="Редактировать термин" className="btn-secondary text-xs px-2 py-0.5">
                          <Icon name="pencil" size={13} color="currentColor" />
                        </button>
                        <button onClick={() => deleteTerm(item.id)} aria-label="Удалить термин" className="btn-secondary text-xs px-2 py-0.5" style={{ color: '#e05252' }}>
                          <Icon name="close" size={13} color="currentColor" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
