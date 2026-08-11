import { useEffect, useState } from 'react';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import Icon from '../components/Icon';
import { guidesApi, knowledgeApi } from '../api';
import { showApiError } from '../utils/toast';
import { PAGE_GRADIENT, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, CARD_SHADOW, TRACK_WIDE, PAGE_BG } from '../utils/theme';

interface Props {
  user: any;
  onLogout: () => void;
}

interface GuideListItem {
  id: number;
  title: string;
  category: string;
  updated_at: string;
  is_published?: boolean | number;
  proposal_status?: 'pending' | 'approved' | 'rejected' | null;
  created_by?: number;
  author_name?: string;
}

interface Guide extends GuideListItem {
  content: string;
}

// Renders a small safe subset of markdown as real React elements — never
// dangerouslySetInnerHTML, so there's no XSS surface no matter what a lead
// pastes in (matches the rest of the codebase: dangerouslySetInnerHTML
// doesn't appear anywhere in client/src). Supports: # / ## headings, ```
// code blocks, `inline code`, - bullets, and plain paragraphs.
function renderMarkdown(content: string) {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const renderInline = (text: string) => {
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, idx) =>
      part.startsWith('`') && part.endsWith('`') && part.length > 1
        ? <code key={idx} className="px-1 rounded text-xs" style={{ background: 'rgba(197, 198, 199,0.1)', color: '#EF9F27' }}>{part.slice(1, -1)}</code>
        : part
    );
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      i++;
      blocks.push(
        <pre key={key++} className="p-3 rounded-lg text-xs font-mono overflow-x-auto my-3" style={{ background: PAGE_BG, color: TEXT_PRIMARY }}>
          {codeLines.join('\n')}
        </pre>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push(<h3 key={key++} className="font-montserrat font-semibold mt-5 mb-2 break-words" style={{ fontSize: 15, color: TEXT_PRIMARY }}>{renderInline(line.slice(3))}</h3>);
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push(<h2 key={key++} className="font-montserrat font-bold mt-6 mb-3 break-words" style={{ fontSize: 18, color: TEXT_PRIMARY }}>{renderInline(line.slice(2))}</h2>);
      i++;
      continue;
    }
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) { items.push(lines[i].slice(2)); i++; }
      blocks.push(
        <ul key={key++} className="list-disc ml-5 space-y-1 my-2">
          {items.map((it, idx) => <li key={idx} className="font-geist text-sm break-words" style={{ color: TEXT_PRIMARY }}>{renderInline(it)}</li>)}
        </ul>
      );
      continue;
    }
    if (line.trim() === '') { i++; continue; }
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('- ') && !lines[i].startsWith('```')) {
      paraLines.push(lines[i]); i++;
    }
    blocks.push(<p key={key++} className="font-geist text-sm leading-relaxed my-2 break-words" style={{ color: TEXT_PRIMARY }}>{renderInline(paraLines.join(' '))}</p>);
  }
  return blocks;
}

function GuideForm({ initial, onSave, onCancel, error, saving }: { initial?: Guide; onSave: (data: { title: string; category: string; content: string }) => void; onCancel: () => void; error: string; saving: boolean }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [category, setCategory] = useState(initial?.category || 'Общее');
  const [content, setContent] = useState(initial?.content || '');

  return (
    <div className="p-4 rounded-lg space-y-3" style={{ background: CARD_BG, border: `1px solid ${ACCENT}4D`, boxShadow: CARD_SHADOW }}>
      <input className="pixel-input w-full text-sm" placeholder="Заголовок" value={title} onChange={e => setTitle(e.target.value)} />
      <input className="pixel-input w-full text-sm" placeholder="Категория" value={category} onChange={e => setCategory(e.target.value)} />
      <textarea
        className="pixel-input w-full text-sm font-mono"
        style={{ minHeight: 240 }}
        placeholder={'# Заголовок\n\nТекст. Поддерживается:\n## Подзаголовок\n- пункт списка\n`код`\n```\nблок кода\n```'}
        value={content}
        onChange={e => setContent(e.target.value)}
      />
      {error && <p className="text-xs font-geist" style={{ color: '#e05252' }}>{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => onSave({ title, category, content })} disabled={saving} className="btn-primary text-xs px-4 py-2 disabled:opacity-50">
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

  const load = () => {
    setListError('');
    guidesApi.list()
      .then(r => setGuides(r.data))
      .catch((err: any) => setListError(err.response?.data?.error || 'Не удалось загрузить гайды'))
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

  const save = async (data: { title: string; category: string; content: string }) => {
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
      setFormError(err.response?.data?.error || 'Не удалось сохранить гайд');
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

  const grouped = guides.reduce((acc: Record<string, GuideListItem[]>, g) => {
    (acc[g.category] = acc[g.category] || []).push(g);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_GRADIENT }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
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
            <p className="text-sm font-geist mb-3" style={{ color: '#e05252' }}>{listError}</p>
            <button onClick={load} className="btn-secondary text-xs px-4 py-2">Повторить</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            {!listError && Object.keys(grouped).length === 0 && (
              <p className="font-geist text-sm" style={{ color: TEXT_MUTED }}>Гайдов пока нет — добавь первый.</p>
            )}
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <p className="font-geist text-xs uppercase mb-1.5 break-words" style={{ color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>{category}</p>
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
              <GuideForm onSave={save} onCancel={() => setCreating(false)} error={formError} saving={saving} />
            ) : editing && selected ? (
              <GuideForm initial={selected} onSave={save} onCancel={() => setEditing(false)} error={formError} saving={saving} />
            ) : selected ? (
              <div className="p-6 rounded-lg" style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.2)', boxShadow: CARD_SHADOW }}>
                <div className="flex items-start justify-between mb-2 gap-3 flex-wrap">
                  <p className="font-geist text-xs flex items-center gap-2" style={{ color: TEXT_MUTED }}>
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
                        className="btn-secondary text-xs px-2 py-1" style={{ color: '#e05252' }}
                      >
                        <Icon name="close" size={14} color="currentColor" />
                      </button>
                    </div>
                  )}
                </div>
                {canEdit && selected.proposal_status === 'pending' && selected.author_name && (
                  <p className="font-geist text-xs mb-4" style={{ color: TEXT_MUTED }}>
                    Предложил(а): <span className="break-words" style={{ color: TEXT_PRIMARY }}>{selected.author_name}</span>
                  </p>
                )}
                {!canEdit && selected.created_by === user.id && selected.proposal_status === 'pending' && (
                  <p className="font-geist text-xs mb-4 flex items-center gap-2" style={{ color: '#EF9F27' }}>
                    <Icon name="clock" size={14} color="#EF9F27" /> Ждёт рассмотрения лидом — как только одобрят, гайд станет виден всей команде.
                  </p>
                )}
                {renderMarkdown(selected.content)}
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
