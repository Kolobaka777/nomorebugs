import { useEffect, useState } from 'react';
import Icon from './Icon';
import FrogLoader from './FrogLoader';
import { frogLinesApi } from '../api';
import { FrogLine, invalidateFrogLines } from '../utils/frogLines';
import { ACCENT, CARD_BG, CARD_SHADOW, TEXT_PRIMARY, TEXT_MUTED, TRACK_WIDE, BADGE_NOTIFY } from '../utils/theme';

// Lead-facing editor for everything the mascot says. Lives inside Багодельня
// rather than getting a page of its own because that page is already the
// place where the team's curated copy is maintained (bug examples, glossary)
// and it already has the tab chrome and the permission check this needs.
//
// Three kinds share one screen since they share a shape — a line of text
// with an order. Tour steps carry a title and a target on top of that, so
// their rows get two extra fields and everything else hides them.

type Kind = 'tip' | 'loader' | 'tour';

const KIND_META: { id: Kind; label: string; hint: string }[] = [
  { id: 'tip', label: 'Советы в углу', hint: 'Лягух показывает их сам, время от времени, пока человек работает.' },
  { id: 'loader', label: 'Фразы загрузки', hint: 'Одна строка под лягухом на экранах ожидания. Берётся случайная.' },
  { id: 'tour', label: 'Первый вход', hint: 'Шаги знакомства с сервисом. Показываются один раз, по порядку, со стрелкой на нужную кнопку.' },
];

// Must stay in step with FROG_LINE_TARGETS in server/src/routes/frogLines.js —
// the server rejects anything not on its own list. Values are data-tour
// attributes, so a step can only point at something that actually exists.
const TARGETS: { value: string; label: string }[] = [
  { value: 'nav-home', label: 'Меню — Главная' },
  { value: 'nav-news', label: 'Меню — Новости' },
  { value: 'nav-courses', label: 'Меню — Курсы' },
  { value: 'nav-team', label: 'Меню — Команда' },
  { value: 'nav-shop', label: 'Меню — Багодельня' },
  { value: 'nav-guides', label: 'Меню — Гайды' },
  { value: 'nav-suggestions', label: 'Меню — Идеи' },
  { value: 'nav-help', label: 'Меню — Помощь' },
  { value: 'nav-admin', label: 'Меню — Админка' },
  { value: 'nav-account', label: 'Меню — Аккаунт' },
  { value: 'frog-companion', label: 'Лягух в углу' },
];

const ROLES: { value: string; label: string }[] = [
  { value: '', label: 'Всем' },
  { value: 'tester', label: 'Только тестировщикам' },
  { value: 'lead', label: 'Только лиду и админу' },
  { value: 'admin', label: 'Только админу' },
];

interface Draft {
  text: string;
  title: string;
  target: string;
  role: string;
}

const emptyDraft = (): Draft => ({ text: '', title: '', target: TARGETS[0].value, role: '' });
const draftOf = (l: FrogLine): Draft => ({
  text: l.text, title: l.title || '', target: l.target || TARGETS[0].value, role: l.role || '',
});

function LineForm({ kind, draft, setDraft, onSave, onCancel, saving, error }: {
  kind: Kind;
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}) {
  return (
    <div className="p-4 rounded-lg space-y-3" style={{ background: CARD_BG, border: `1px solid ${ACCENT}55`, boxShadow: CARD_SHADOW }}>
      {kind === 'tour' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-geist mb-1.5" style={{ color: TEXT_MUTED }}>Заголовок</label>
            <input
              className="pixel-input text-sm"
              value={draft.title}
              maxLength={60}
              onChange={e => setDraft({ ...draft, title: e.target.value })}
              placeholder="Курсы"
            />
          </div>
          <div>
            <label className="block text-xs font-geist mb-1.5" style={{ color: TEXT_MUTED }}>Показывает на</label>
            <select className="pixel-input text-sm" value={draft.target} onChange={e => setDraft({ ...draft, target: e.target.value })}>
              {TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
      )}
      <div>
        <label className="block text-xs font-geist mb-1.5" style={{ color: TEXT_MUTED }}>Текст</label>
        <textarea
          className="pixel-input text-sm"
          rows={kind === 'tour' ? 3 : 2}
          maxLength={400}
          value={draft.text}
          onChange={e => setDraft({ ...draft, text: e.target.value })}
          placeholder="Что говорит лягух"
        />
      </div>
      <div>
        <label className="block text-xs font-geist mb-1.5" style={{ color: TEXT_MUTED }}>Кому показывать</label>
        <select className="pixel-input text-sm" value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })}>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      {error && <p className="text-xs font-geist break-words" style={{ color: '#e05252' }}>{error}</p>}
      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving} className="btn-primary text-xs px-4 py-2">
          {saving ? 'Сохраняю...' : 'Сохранить'}
        </button>
        <button onClick={onCancel} className="btn-secondary text-xs px-4 py-2">Отмена</button>
      </div>
    </div>
  );
}

export default function FrogLinesEditor() {
  const [lines, setLines] = useState<FrogLine[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [kind, setKind] = useState<Kind>('tip');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoadError('');
    frogLinesApi.getAll()
      .then(r => setLines(r.data))
      .catch(() => setLoadError('Не удалось загрузить фразы'));
  };
  useEffect(load, []);

  // Every write drops the session cache, otherwise the corner tips and the
  // loading phrases keep serving the old copy until a full page reload.
  const afterWrite = () => {
    invalidateFrogLines();
    load();
    setAdding(false);
    setEditingId(null);
    setError('');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = { text: draft.text, title: draft.title, target: draft.target, role: draft.role };
      if (editingId != null) await frogLinesApi.update(editingId, payload);
      else await frogLinesApi.create({ ...payload, kind });
      afterWrite();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (l: FrogLine) => {
    if (!confirm('Удалить эту фразу?')) return;
    try {
      await frogLinesApi.remove(l.id);
      afterWrite();
    } catch (e: any) {
      setLoadError(e?.response?.data?.error || 'Не удалось удалить');
    }
  };

  if (loadError && !lines) {
    return (
      <div className="rounded-lg text-center py-8" style={{ background: CARD_BG, boxShadow: CARD_SHADOW }}>
        <p className="text-sm font-geist mb-3" style={{ color: '#e05252' }}>{loadError}</p>
        <button onClick={load} className="btn-secondary text-xs px-4 py-2">Повторить</button>
      </div>
    );
  }
  if (!lines) return <FrogLoader />;

  const meta = KIND_META.find(k => k.id === kind)!;
  const rows = lines.filter(l => l.kind === kind).sort((a, b) => a.order_num - b.order_num);
  const roleLabel = (r: string | null) => ROLES.find(x => x.value === (r || ''))?.label ?? '';

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="font-montserrat font-semibold flex items-center gap-2" style={{ fontSize: 16, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
            <Icon name="frog" size={18} color="currentColor" />
            Что говорит лягух
          </h2>
          <p className="font-geist text-xs mt-1" style={{ color: TEXT_MUTED }}>
            Правки видны всем сразу — фразы не зашиты в приложение.
          </p>
        </div>
        {!adding && editingId == null && (
          <button
            onClick={() => { setDraft(emptyDraft()); setAdding(true); }}
            className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
          >
            <Icon name="sparkle" size={14} color="currentColor" />
            Добавить
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {KIND_META.map(k => (
          <button
            key={k.id}
            onClick={() => { setKind(k.id); setAdding(false); setEditingId(null); }}
            className="rounded-lg font-geist cursor-pointer px-3 py-1.5 transition-colors"
            style={{
              fontSize: 12,
              background: kind === k.id ? `${ACCENT}22` : 'rgba(197, 198, 199, 0.06)',
              color: kind === k.id ? ACCENT : 'rgba(197, 198, 199, 0.6)',
              border: `1px solid ${kind === k.id ? `${ACCENT}66` : 'transparent'}`,
            }}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="font-geist text-xs mb-4" style={{ color: TEXT_MUTED }}>{meta.hint}</p>

      {loadError && <p className="text-xs font-geist mb-3" style={{ color: '#e05252' }}>{loadError}</p>}

      {adding && (
        <div className="mb-4">
          <LineForm kind={kind} draft={draft} setDraft={setDraft} onSave={save} onCancel={() => { setAdding(false); setError(''); }} saving={saving} error={error} />
        </div>
      )}

      {rows.length === 0 && !adding && (
        <p className="text-sm font-geist text-center py-8" style={{ color: 'rgba(197, 198, 199, 0.55)' }}>
          Тут пока пусто
        </p>
      )}

      <div className="space-y-2 stagger-in">
        {rows.map(l => (
          editingId === l.id ? (
            <LineForm
              key={l.id}
              kind={kind}
              draft={draft}
              setDraft={setDraft}
              onSave={save}
              onCancel={() => { setEditingId(null); setError(''); }}
              saving={saving}
              error={error}
            />
          ) : (
            <div
              key={l.id}
              className="p-3 rounded-lg flex items-start gap-3"
              style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.14)', boxShadow: CARD_SHADOW }}
            >
              <div className="flex-1 min-w-0">
                {l.kind === 'tour' && (
                  <p className="font-geist font-semibold text-sm mb-0.5 break-words" style={{ color: TEXT_PRIMARY }}>
                    {l.title}
                    <span className="font-normal ml-2" style={{ fontSize: 11, color: ACCENT }}>
                      → {TARGETS.find(t => t.value === l.target)?.label || l.target}
                    </span>
                  </p>
                )}
                <p className="font-geist text-sm break-words" style={{ color: l.kind === 'tour' ? TEXT_MUTED : TEXT_PRIMARY }}>{l.text}</p>
                {l.role && (
                  <p className="font-geist mt-1" style={{ fontSize: 11, color: BADGE_NOTIFY }}>{roleLabel(l.role)}</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => { setDraft(draftOf(l)); setEditingId(l.id); setAdding(false); }}
                  aria-label="Редактировать фразу"
                  className="btn-secondary text-xs px-2 py-0.5"
                >
                  <Icon name="pencil" size={13} color="currentColor" />
                </button>
                <button
                  onClick={() => remove(l)}
                  aria-label="Удалить фразу"
                  className="btn-secondary text-xs px-2 py-0.5"
                  style={{ color: '#e05252' }}
                >
                  <Icon name="close" size={13} color="currentColor" />
                </button>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
