import { lazy, Suspense, useEffect, useState } from 'react';
import Navigation from '../components/Navigation';
import FrogLoader from '../components/FrogLoader';
import Icon from '../components/Icon';
import EmojiPicker from '../components/EmojiPicker';
import { guidesApi, knowledgeApi } from '../api';
import { apiErrorMessage, showApiError } from '../utils/toast';
import { parseRichContent } from '../utils/richContent';
import { pickByGender } from '../utils/gender';
import { Gender } from '../types';
import { PAGE_GRADIENT, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, CARD_SHADOW, TRACK_WIDE, ERROR } from '../utils/theme';

// Tiptap (the block editor) is the single heaviest dependency in the app —
// its own chunk is ~150KB gzipped, more than every other route combined.
// Loading it lazily here means opening the Guides page (browsing titles,
// switching categories) doesn't pay that cost until a guide is actually
// opened or edited.
const RichTextEditor = lazy(() => import('../components/RichTextEditor'));

function RichTextEditorFallback() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="pixel-pulse font-geist text-xs" style={{ color: TEXT_MUTED }}>загружаю редактор...</div>
    </div>
  );
}

interface Props {
  user: any;
  onLogout: () => void;
}

interface GuideListItem {
  id: number;
  title: string;
  category: string;
  icon: string | null;
  updated_at: string;
  is_published?: boolean | number;
  proposal_status?: 'pending' | 'approved' | 'rejected' | null;
  created_by?: number;
  author_name?: string;
  author_gender?: Gender;
}

interface Guide extends GuideListItem {
  content: string;
}

// Category select: existing categories as a dropdown (so a lead reaches for
// one rather than retyping "Общее" with a typo that silently forks the
// group), plus a free-text fallback for a genuinely new one.
function CategoryPicker({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  const [customMode, setCustomMode] = useState(!options.includes(value) && value !== '');
  if (customMode) {
    return (
      <div className="flex gap-2">
        <input className="pixel-input w-full text-sm" placeholder="Новая категория" value={value} onChange={e => onChange(e.target.value)} />
        {options.length > 0 && (
          <button type="button" onClick={() => setCustomMode(false)} className="btn-secondary text-xs px-3 shrink-0">Список</button>
        )}
      </div>
    );
  }
  return (
    <select className="pixel-input w-full text-sm" value={value} onChange={e => {
      if (e.target.value === '__new__') { setCustomMode(true); onChange(''); } else { onChange(e.target.value); }
    }}>
      {!options.includes(value) && <option value={value}>{value}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
      <option value="__new__">+ Новая категория...</option>
    </select>
  );
}

function GuideForm({
  initial, onSave, onCancel, error, saving, categories,
}: {
  initial?: Guide;
  onSave: (data: { title: string; category: string; content: string; icon: string | null }) => void;
  onCancel: () => void;
  error: string;
  saving: boolean;
  categories: string[];
}) {
  const [title, setTitle] = useState(initial?.title || '');
  const [category, setCategory] = useState(initial?.category || 'Общее');
  const [icon, setIcon] = useState<string | null>(initial?.icon || null);
  const [content, setContent] = useState<string>(initial?.content || '');
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="p-4 rounded-lg space-y-3" style={{ background: CARD_BG, border: `1px solid ${ACCENT}4D`, boxShadow: CARD_SHADOW }}>
      <div className="flex gap-2 items-start">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setPickerOpen(o => !o)}
            aria-label="Выбрать иконку"
            className="rounded-lg flex items-center justify-center cursor-pointer"
            style={{ width: 40, height: 40, fontSize: 18, background: 'rgba(197, 198, 199, 0.08)', border: '1px solid rgba(197, 198, 199, 0.2)' }}
          >
            {icon || <Icon name="books" size={16} color={TEXT_MUTED} />}
          </button>
          {pickerOpen && <EmojiPicker value={icon} onChange={setIcon} onClose={() => setPickerOpen(false)} />}
        </div>
        <input className="pixel-input w-full text-sm" placeholder="Заголовок" value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <CategoryPicker value={category} onChange={setCategory} options={categories} />
      <Suspense fallback={<RichTextEditorFallback />}>
        <RichTextEditor content={parseRichContent(content)} editable onChangeJSON={setContent} />
      </Suspense>
      {error && <p className="text-xs font-geist" style={{ color: ERROR }}>{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => onSave({ title, category, content, icon })} disabled={saving} className="btn-primary text-xs px-4 py-2 disabled:opacity-50">
          {saving ? '...' : 'Сохранить'}
        </button>
        <button onClick={onCancel} className="btn-secondary text-xs px-4 py-2">Отмена</button>
      </div>
    </div>
  );
}

export default function GuidesPage({ user, onLogout }: Props) {
  const [guides, setGuides] = useState<GuideListItem[]>([]);
  const [selected, setSelected] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(user.role === 'lead' || user.role === 'admin');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [listError, setListError] = useState('');
  const [approving, setApproving] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const load = () => {
    setListError('');
    guidesApi.list()
      .then(r => setGuides(r.data))
      .catch((err: any) => setListError(apiErrorMessage(err, 'Не удалось загрузить гайды')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (!canEdit) {
      knowledgeApi.getMyPermissions().then(r => setCanEdit(r.data.includes('manage_guides'))).catch(() => {});
    }
  }, []);

  const openGuide = (id: number) => {
    guidesApi.get(id).then(r => setSelected(r.data)).catch((err: any) => showApiError(err, 'Не удалось загрузить гайд'));
  };

  const save = async (data: { title: string; category: string; content: string; icon: string | null }) => {
    if (!data.title.trim()) { setFormError('Укажите заголовок'); return; }
    setSaving(true);
    setFormError('');
    try {
      if (selected) {
        await guidesApi.update(selected.id, data);
        openGuide(selected.id);
      } else {
        const res = await guidesApi.create(data);
        openGuide(res.data.id);
      }
      setCreating(false);
      setEditing(false);
      load();
    } catch (err: any) {
      // Was a bare `catch {}` — a failed save looked identical to nothing
      // happening at all (form just sat there), which is exactly what was
      // reported as "гайды не создаются". Now the real reason shows.
      setFormError(apiErrorMessage(err, 'Не удалось сохранить гайд'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number, isDecline = false) => {
    if (!confirm(isDecline ? 'Отклонить это предложение?' : 'Удалить гайд?')) return;
    try {
      await guidesApi.remove(id);
      setSelected(null);
      load();
    } catch (err: any) {
      showApiError(err, isDecline ? 'Не удалось отклонить предложение' : 'Не удалось удалить гайд');
    }
  };

  const approve = async (id: number) => {
    setApproving(true);
    try {
      await guidesApi.approve(id);
      openGuide(id);
      load();
    } catch (err: any) {
      showApiError(err, 'Не удалось одобрить предложение');
    } finally {
      setApproving(false);
    }
  };

  const startRenameCategory = (cat: string) => { setRenamingCategory(cat); setRenameValue(cat); };
  const saveRenameCategory = async () => {
    const to = renameValue.trim();
    if (!to || !renamingCategory || to === renamingCategory) { setRenamingCategory(null); return; }
    try {
      await guidesApi.renameCategory(renamingCategory, to);
      setRenamingCategory(null);
      load();
    } catch (err: any) {
      showApiError(err, 'Не удалось переименовать категорию');
      setRenamingCategory(null);
    }
  };

  const categories = Array.from(new Set(guides.map(g => g.category)));
  const grouped = guides.reduce((acc: Record<string, GuideListItem[]>, g) => {
    (acc[g.category] = acc[g.category] || []).push(g);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <FrogLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-6xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="font-montserrat font-bold flex items-center gap-2" style={{ fontSize: 24, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
            <Icon name="books" size={22} color={ACCENT} /> Гайды
          </h1>
          {canEdit ? (
            <button onClick={() => { setSelected(null); setFormError(''); setCreating(true); setEditing(false); }} className="btn-primary text-xs px-4 py-2">
              + Новый гайд
            </button>
          ) : (
            // Anyone without edit rights can still propose one — same form,
            // the server just forces it unpublished + pending review (see
            // POST /api/guides) until a lead approves it.
            <button
              onClick={() => { setSelected(null); setFormError(''); setCreating(true); setEditing(false); }}
              className="rounded-lg font-geist font-semibold flex items-center gap-2 px-4 py-2 cursor-pointer"
              style={{ background: `${ACCENT}18`, color: ACCENT, border: `1px solid ${ACCENT}55`, fontSize: 12 }}
            >
              <Icon name="lightbulb" size={14} color={ACCENT} /> Предложить гайд
            </button>
          )}
        </div>

        {listError && (
          <div className="card text-center py-4 mb-6">
            <p className="text-sm font-geist mb-3" style={{ color: ERROR }}>{listError}</p>
            <button onClick={load} className="btn-secondary text-xs px-4 py-2">Повторить</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4 stagger-in">
            {!listError && Object.keys(grouped).length === 0 && (
              <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>Гайдов пока нет — добавь первый.</p>
            )}
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  {renamingCategory === category ? (
                    <input
                      autoFocus
                      className="pixel-input text-xs"
                      style={{ height: 22, padding: '0 6px', width: 140 }}
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveRenameCategory(); if (e.key === 'Escape') setRenamingCategory(null); }}
                      onBlur={saveRenameCategory}
                    />
                  ) : (
                    <p className="font-geist text-xs uppercase break-words" style={{ color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>{category}</p>
                  )}
                  {canEdit && renamingCategory !== category && (
                    <button onClick={() => startRenameCategory(category)} aria-label={`Переименовать категорию ${category}`} style={{ color: 'rgba(197, 198, 199,0.4)' }}>
                      <Icon name="pencil" size={10} color="currentColor" />
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {items.map(g => (
                    <button
                      key={g.id}
                      onClick={() => { openGuide(g.id); setCreating(false); setEditing(false); }}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm font-geist transition-colors flex items-center gap-2"
                      style={{
                        background: selected?.id === g.id ? 'rgba(102, 252, 241,0.12)' : CARD_BG,
                        color: selected?.id === g.id ? ACCENT : TEXT_PRIMARY,
                        border: selected?.id === g.id ? `1px solid ${ACCENT}66` : '1px solid rgba(197, 198, 199, 0.2)',
                        boxShadow: CARD_SHADOW,
                      }}
                    >
                      <span className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 22, height: 22, fontSize: 13, background: 'rgba(197, 198, 199, 0.08)' }}>
                        {g.icon || <Icon name="memo" size={11} color={TEXT_MUTED} />}
                      </span>
                      <span className="flex-1 truncate">{g.title}</span>
                      {g.proposal_status === 'pending' && (
                        <span className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: '#EF9F27' }} title="На рассмотрении" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-2">
            {creating ? (
              <GuideForm onSave={save} onCancel={() => setCreating(false)} error={formError} saving={saving} categories={categories} />
            ) : editing && selected ? (
              <GuideForm initial={selected} onSave={save} onCancel={() => setEditing(false)} error={formError} saving={saving} categories={categories} />
            ) : selected ? (
              <div className="p-6 rounded-lg" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.2)', boxShadow: CARD_SHADOW }}>
                <div className="flex items-start justify-between mb-2 gap-3 flex-wrap">
                  <p className="font-geist text-xs flex items-center gap-2" style={{ color: TEXT_MUTED }}>
                    {selected.icon && <span style={{ fontSize: 14 }}>{selected.icon}</span>}
                    <span className="break-words min-w-0">{selected.category}</span>
                    {selected.proposal_status === 'pending' && (
                      <span className="font-geist font-semibold rounded px-2 py-0.5 shrink-0" style={{ fontSize: 10, background: 'rgba(239,159,39,0.15)', color: '#EF9F27' }}>
                        НА РАССМОТРЕНИИ
                      </span>
                    )}
                  </p>
                  {canEdit && (
                    <div className="flex gap-1.5 shrink-0">
                      {selected.proposal_status === 'pending' && (
                        <button onClick={() => approve(selected.id)} disabled={approving} className="btn-primary text-xs px-3 py-1 disabled:opacity-50">
                          {approving ? '...' : 'Одобрить'}
                        </button>
                      )}
                      <button onClick={() => { setFormError(''); setEditing(true); }} aria-label="Редактировать гайд" className="btn-secondary text-xs px-2 py-1">
                        <Icon name="pencil" size={14} color="currentColor" />
                      </button>
                      <button
                        onClick={() => remove(selected.id, selected.proposal_status === 'pending')}
                        aria-label={selected.proposal_status === 'pending' ? 'Отклонить предложение' : 'Удалить гайд'}
                        className="btn-secondary text-xs px-2 py-1" style={{ color: ERROR }}
                      >
                        <Icon name="close" size={14} color="currentColor" />
                      </button>
                    </div>
                  )}
                </div>
                {canEdit && selected.proposal_status === 'pending' && selected.author_name && (
                  <p className="font-geist text-xs mb-4" style={{ color: TEXT_MUTED }}>
                    {pickByGender(selected.author_gender, 'Предложил', 'Предложила', 'Предложение от')}: <span className="break-words" style={{ color: TEXT_PRIMARY }}>{selected.author_name}</span>
                  </p>
                )}
                {!canEdit && selected.created_by === user.id && selected.proposal_status === 'pending' && (
                  <p className="font-geist text-xs mb-4 flex items-center gap-2" style={{ color: '#EF9F27' }}>
                    <Icon name="clock" size={14} color="#EF9F27" /> Ждёт рассмотрения лидом — как только одобрят, гайд станет виден всей команде.
                  </p>
                )}
                <Suspense fallback={<RichTextEditorFallback />}>
                  <RichTextEditor content={parseRichContent(selected.content)} editable={false} />
                </Suspense>
              </div>
            ) : !listError ? (
              <div
                className="h-full min-h-[280px] rounded-lg flex flex-col items-center justify-center text-center p-8"
                style={{ background: CARD_BG, border: '1px dashed rgba(197, 198, 199,0.2)' }}
              >
                <Icon name="books" size={32} color="rgba(197, 198, 199,0.25)" className="mb-3" />
                <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>Выбери гайд слева, чтобы посмотреть его тут.</p>
                {Object.keys(grouped).length === 0 && (
                  <p className="font-geist text-xs mt-1" style={{ color: 'rgba(197, 198, 199,0.4)' }}>Гайдов пока нет — начни с любого раздела.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
