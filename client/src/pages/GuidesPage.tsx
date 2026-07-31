import { useEffect, useState } from 'react';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import PixelIcon from '../components/PixelIcon';
import { guidesApi, knowledgeApi } from '../api';

interface Props {
  user: any;
  onLogout: () => void;
}

interface GuideListItem {
  id: number;
  title: string;
  category: string;
  updated_at: string;
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
        ? <code key={idx} className="px-1 rounded text-xs" style={{ background: 'rgba(232,232,208,0.1)', color: '#EF9F27' }}>{part.slice(1, -1)}</code>
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
        <pre key={key++} className="p-3 rounded text-xs font-mono overflow-x-auto my-3" style={{ background: '#0f0f1a', color: 'rgba(232,232,208,0.8)' }}>
          {codeLines.join('\n')}
        </pre>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push(<h3 key={key++} className="font-pixel text-pixel mt-5 mb-2" style={{ fontSize: '0.6rem', lineHeight: 1.8 }}>{renderInline(line.slice(3))}</h3>);
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push(<h2 key={key++} className="font-pixel text-primary mt-6 mb-3" style={{ fontSize: '0.7rem', lineHeight: 1.8 }}>{renderInline(line.slice(2))}</h2>);
      i++;
      continue;
    }
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) { items.push(lines[i].slice(2)); i++; }
      blocks.push(
        <ul key={key++} className="list-disc ml-5 space-y-1 my-2">
          {items.map((it, idx) => <li key={idx} className="text-pixel/80 font-sans text-sm">{renderInline(it)}</li>)}
        </ul>
      );
      continue;
    }
    if (line.trim() === '') { i++; continue; }
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('- ') && !lines[i].startsWith('```')) {
      paraLines.push(lines[i]); i++;
    }
    blocks.push(<p key={key++} className="text-pixel/80 font-sans text-sm leading-relaxed my-2">{renderInline(paraLines.join(' '))}</p>);
  }
  return blocks;
}

function GuideForm({ initial, onSave, onCancel, error, saving }: { initial?: Guide; onSave: (data: { title: string; category: string; content: string }) => void; onCancel: () => void; error: string; saving: boolean }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [category, setCategory] = useState(initial?.category || 'Общее');
  const [content, setContent] = useState(initial?.content || '');

  return (
    <div className="p-4 rounded space-y-3" style={{ background: '#1a1a2e', border: '1px solid rgba(29,158,117,0.3)' }}>
      <input className="pixel-input w-full text-sm" placeholder="Заголовок" value={title} onChange={e => setTitle(e.target.value)} />
      <input className="pixel-input w-full text-sm" placeholder="Категория" value={category} onChange={e => setCategory(e.target.value)} />
      <textarea
        className="pixel-input w-full text-sm font-mono"
        style={{ minHeight: 240 }}
        placeholder={'# Заголовок\n\nТекст. Поддерживается:\n## Подзаголовок\n- пункт списка\n`код`\n```\nблок кода\n```'}
        value={content}
        onChange={e => setContent(e.target.value)}
      />
      {error && <p className="text-xs font-sans" style={{ color: '#e05252' }}>{error}</p>}
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
    guidesApi.get(id).then(r => setSelected(r.data)).catch(() => {});
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

  const remove = async (id: number) => {
    if (!confirm('Удалить гайд?')) return;
    try {
      await guidesApi.remove(id);
      setSelected(null);
      load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Не удалось удалить гайд');
    }
  };

  const grouped = guides.reduce((acc: Record<string, GuideListItem[]>, g) => {
    (acc[g.category] = acc[g.category] || []).push(g);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />
      <div className="max-w-6xl mx-auto px-6 pt-16 pb-8 fade-in">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-pixel text-primary" style={{ fontSize: '0.8rem', lineHeight: 1.8 }}>
            <span className="flex items-center gap-2"><PixelIcon name="books" size={14} color="#1D9E75" /> Гайды</span>
          </h1>
          {canEdit && (
            <button onClick={() => { setSelected(null); setFormError(''); setCreating(true); setEditing(false); }} className="btn-primary text-xs px-4 py-2">
              + Новый гайд
            </button>
          )}
        </div>

        {listError && (
          <div className="card text-center py-4 mb-6">
            <p className="text-sm font-sans mb-3" style={{ color: '#e05252' }}>{listError}</p>
            <button onClick={load} className="btn-secondary text-xs px-4 py-2">Повторить</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            {!listError && Object.keys(grouped).length === 0 && (
              <p className="text-pixel/50 text-sm font-sans">Гайдов пока нет{canEdit ? ' — добавь первый.' : '.'}</p>
            )}
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <p className="text-pixel/50 text-xs font-sans uppercase mb-1.5">{category}</p>
                <div className="space-y-1">
                  {items.map(g => (
                    <button
                      key={g.id}
                      onClick={() => { openGuide(g.id); setCreating(false); setEditing(false); }}
                      className="w-full text-left px-3 py-2 rounded text-sm font-sans transition-colors"
                      style={{
                        background: selected?.id === g.id ? 'rgba(29,158,117,0.15)' : '#1a1a2e',
                        color: selected?.id === g.id ? '#1D9E75' : 'rgba(232,232,208,0.8)',
                        border: '1px solid rgba(232,232,208,0.06)',
                      }}
                    >
                      {g.title}
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
              <div className="p-6 rounded" style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.06)' }}>
                <div className="flex items-start justify-between mb-2">
                  <p className="text-pixel/50 text-xs font-sans">{selected.category}</p>
                  {canEdit && (
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => { setFormError(''); setEditing(true); }} className="btn-secondary text-xs px-2 py-1">
                        <PixelIcon name="pencil" size={11} color="currentColor" />
                      </button>
                      <button onClick={() => remove(selected.id)} className="btn-secondary text-xs px-2 py-1" style={{ color: '#e05252' }}>
                        <PixelIcon name="wrench" size={11} color="currentColor" />
                      </button>
                    </div>
                  )}
                </div>
                {renderMarkdown(selected.content)}
              </div>
            ) : !listError ? (
              <p className="text-pixel/50 text-sm font-sans">Выбери гайд слева.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
