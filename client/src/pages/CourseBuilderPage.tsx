import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import Icon from '../components/Icon';
import { API_BASE_URL as API } from '../config';
import { authFetch } from '../auth';
import ModuleEditor from '../components/courseBuilder/ModuleEditor';
import { uid, PRESET_COLORS, TAGS, emptyModule } from '../components/courseBuilder/types';
import type { BModule, FormState } from '../components/courseBuilder/types';
import {
  PAGE_GRADIENT, PAGE_BG, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, TRACK_WIDE, CARD_SHADOW,
} from '../utils/theme';

interface Props {
  user: any;
  onLogout: () => void;
}

export default function CourseBuilderPage({ user, onLogout }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    tag: 'Custom',
    color: '#66FCF1',
    requirements: '',
    deadline_at: '',
    modules: [emptyModule()],
  });
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);
  const [error, setError] = useState('');
  // Captured at load time, compared against the server's current value
  // right before saving — lets us detect that someone else (or another tab)
  // changed the course while this editor was open, per your conflict-
  // detection decision (warn + explicit confirm before overwriting).
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);

  // Load existing course if editing
  useEffect(() => {
    if (!isEdit) return;
    authFetch(`${API}/custom-courses/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setLoadedUpdatedAt(data.updated_at || null);
        setForm({
          title: data.title,
          description: data.description || '',
          tag: data.tag || 'Custom',
          color: data.color || '#66FCF1',
          requirements: data.requirements || '',
          deadline_at: data.deadline_at ? String(data.deadline_at).slice(0, 10) : '',
          modules: (data.modules || []).map((m: any) => ({
            // Same reasoning as lessons below: reusing the real DB id lets
            // the server diff modules on save instead of deleting and
            // recreating everything (which used to silently wipe every
            // tester's lesson-completion progress on every course edit).
            _id: String(m.id),
            title: m.title,
            lessons: (m.lessons || []).map((l: any) => ({
              // Reuse the real DB id as the local draft id (as a string) so
              // prerequisite_lesson_id (a real id) maps directly onto
              // prerequisite_lesson_local_id without a separate lookup —
              // both existing and newly-added lessons share one id space
              // for the rest of this editing session.
              _id: String(l.id),
              title: l.title,
              type: l.type || 'lesson',
              content: l.content || '',
              questions: (l.questions || []).map((q: any) => ({ _id: uid(), ...q })),
              prerequisite_type: l.prerequisite_type || 'none',
              prerequisite_lesson_local_id: l.prerequisite_lesson_id != null ? String(l.prerequisite_lesson_id) : undefined,
              prerequisite_note: l.prerequisite_note || '',
            })),
          })),
        });
      })
      .catch(() => setError('Ошибка загрузки курса'))
      .finally(() => setLoadingEdit(false));
  }, [id, isEdit]);

  const addModule = () => setForm(f => ({ ...f, modules: [...f.modules, emptyModule()] }));
  const updateModule = (i: number, m: BModule) =>
    setForm(f => ({ ...f, modules: f.modules.map((old, idx) => (idx === i ? m : old)) }));
  const deleteModule = (i: number) =>
    setForm(f => ({ ...f, modules: f.modules.filter((_, idx) => idx !== i) }));

  const save = async (publish: boolean) => {
    if (!form.title.trim()) { setError('Укажите название курса'); return; }
    setSaving(true);
    setError('');
    try {
      // What we're about to tell the server we loaded — the pre-check below
      // may bump this to the fresher value if the lead chooses to proceed
      // anyway, so the actual save doesn't then also 409 as if it were a
      // second, unacknowledged conflict.
      let expectedUpdatedAt = loadedUpdatedAt;

      if (isEdit) {
        // Conflict check: has someone else saved this course since we loaded it?
        // This is a courtesy heads-up, not the real guarantee — the server
        // enforces the same check authoritatively on the save itself (a
        // direct API call, or a save landing in the gap right after this
        // check, would otherwise still be able to silently delete whatever
        // the other editor added).
        const current = await authFetch(`${API}/custom-courses/${id}`).then(r => r.json()).catch(() => null);
        if (current && !current.error && loadedUpdatedAt && current.updated_at !== loadedUpdatedAt) {
          const proceed = window.confirm(
            'Курс был изменён с момента открытия тобой этой страницы (кто-то ещё сохранил изменения). ' +
            'Сохранить твою версию поверх текущей?'
          );
          if (!proceed) { setSaving(false); return; }
          expectedUpdatedAt = current.updated_at;
        }
      }

      const body = {
        ...form,
        is_published: publish ? 1 : 0,
        deadline_at: form.deadline_at || null,
        expected_updated_at: expectedUpdatedAt,
        modules: form.modules.map(m => ({
          _id: m._id,
          title: m.title,
          lessons: m.lessons.map(l => ({
            _id: l._id,
            title: l.title,
            type: l.type,
            content: l.content,
            prerequisite_type: l.prerequisite_type,
            prerequisite_lesson_local_id: l.prerequisite_type === 'mandatory' ? l.prerequisite_lesson_local_id : undefined,
            prerequisite_note: l.prerequisite_type === 'optional' ? l.prerequisite_note : undefined,
            questions: l.questions.map(q => ({
              question_text: q.question_text,
              option_a: q.option_a,
              option_b: q.option_b,
              option_c: q.option_c,
              option_d: q.option_d,
              correct_idx: q.correct_idx,
              explanation: q.explanation,
            })),
          })),
        })),
      };

      const url = isEdit ? `${API}/custom-courses/${id}` : `${API}/custom-courses`;
      const method = isEdit ? 'PUT' : 'POST';

      const r = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json();
      if (data.error) { setError(data.error); return; }

      navigate('/zhukademia');
    } catch {
      setError('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const color = form.color;
  const allLessonsFlat = form.modules.flatMap(m => m.lessons.map(l => ({ _id: l._id, title: l.title })));

  if (loadingEdit) {
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

      <div className="max-w-4xl mx-auto px-6 pt-16 pb-8 fade-in">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/zhukademia')}
            className="font-geist text-sm transition-colors cursor-pointer flex items-center gap-1"
            style={{ color: 'rgba(197, 198, 199, 0.6)' }}
            onMouseEnter={e => (e.currentTarget.style.color = TEXT_PRIMARY)}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(197, 198, 199, 0.6)')}
          >
            <Icon name="chevronLeft" size={18} color="currentColor" />
            Назад
          </button>
          <h1 className="font-montserrat font-bold flex items-center gap-2.5" style={{ fontSize: 24, color: TEXT_PRIMARY, letterSpacing: TRACK_WIDE }}>
            <Icon name={isEdit ? 'pencil' : 'sparkle'} size={22} color={ACCENT} />
            {isEdit ? 'Редактировать курс' : 'Новый курс'}
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ─── LEFT: Basic info ─── */}
          <div className="lg:col-span-1 space-y-4">
            <div
              className="rounded-lg p-5"
              style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.2)', boxShadow: CARD_SHADOW }}
            >
              <p className="font-montserrat font-semibold mb-4" style={{ fontSize: 13, color: ACCENT, letterSpacing: TRACK_WIDE }}>
                Основная информация
              </p>

              {/* Title */}
              <div className="mb-4">
                <label className="font-geist text-xs block mb-1.5" style={{ color: TEXT_MUTED }}>Название курса *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Напр.: Тестирование API для начинающих"
                  className="pixel-input text-sm"
                  style={{ borderColor: form.title ? color + '50' : undefined }}
                />
              </div>

              {/* Tag */}
              <div className="mb-4">
                <label className="font-geist text-xs block mb-1.5" style={{ color: TEXT_MUTED }}>Тег</label>
                <select
                  value={form.tag}
                  onChange={e => setForm(f => ({ ...f, tag: e.target.value }))}
                  className="pixel-input text-sm"
                >
                  {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Color */}
              <div className="mb-4">
                <label className="font-geist text-xs block mb-2" style={{ color: TEXT_MUTED }}>Цвет карточки</label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      title={c.name}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110 cursor-pointer"
                      style={{
                        background: c.value,
                        boxShadow: form.color === c.value ? `0 0 0 2px ${PAGE_BG}, 0 0 0 4px ${c.value}` : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="font-geist text-xs block mb-1.5" style={{ color: TEXT_MUTED }}>Описание</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Что студент узнает из этого курса?"
                  rows={4}
                  className="pixel-input text-xs resize-none"
                  style={{ lineHeight: 1.7 }}
                />
              </div>

              {/* Requirements */}
              <div>
                <label className="font-geist text-xs block mb-1.5" style={{ color: TEXT_MUTED }}>Требования / аудитория</label>
                <textarea
                  value={form.requirements}
                  onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))}
                  placeholder="Подходит для новичков, не нужен опыт..."
                  rows={3}
                  className="pixel-input text-xs resize-none"
                  style={{ lineHeight: 1.7 }}
                />
              </div>

              {/* Deadline */}
              <div className="mt-4">
                <label className="font-geist text-xs block mb-1.5" style={{ color: TEXT_MUTED }}>Дедлайн прохождения (необязательно)</label>
                <input
                  type="date"
                  value={form.deadline_at}
                  onChange={e => setForm(f => ({ ...f, deadline_at: e.target.value }))}
                  className="pixel-input text-xs"
                  style={{ width: 'auto' }}
                />
                <p className="text-xs font-geist mt-1" style={{ color: 'rgba(197, 198, 199, 0.45)' }}>Для отдельных сотрудников дедлайн можно продлить на странице курса.</p>
              </div>
            </div>

            {/* Preview card */}
            <div
              className="rounded-lg overflow-hidden"
              style={{
                background: CARD_BG,
                border: `1px solid ${color}`,
                boxShadow: CARD_SHADOW,
              }}
            >
              <div className="h-16 flex items-center justify-center" style={{ background: `${color}12` }}>
                <Icon name={
                  form.tag === 'HTML' ? 'globe' :
                  form.tag === 'CSS' ? 'palette' :
                  form.tag === 'DevTools' ? 'microscope' :
                  form.tag === 'JS' ? 'gear' :
                  form.tag === 'Network' ? 'antenna' : 'books'
                } size={28} color={color} />
              </div>
              <div className="p-3">
                <span className="text-xs font-geist font-semibold px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color }}>
                  {form.tag}
                </span>
                <p className="font-geist font-semibold text-xs mt-2 leading-snug" style={{ color: TEXT_PRIMARY }}>
                  {form.title || 'Название курса'}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  <span className="text-xs font-geist font-bold px-1.5 py-0.5 rounded" style={{ background: '#EF9F27', color: PAGE_BG }}>NEW</span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── RIGHT: Structure builder ─── */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <p className="font-montserrat font-semibold" style={{ fontSize: 13, color: ACCENT, letterSpacing: TRACK_WIDE }}>
                Структура курса
              </p>
              <span className="font-geist text-xs" style={{ color: 'rgba(197, 198, 199, 0.55)' }}>
                {form.modules.length} модул{form.modules.length === 1 ? 'ь' : 'я'}
              </span>
            </div>

            {form.modules.map((mod, mi) => (
              <ModuleEditor
                key={mod._id}
                mod={mod}
                modIdx={mi}
                onChange={updated => updateModule(mi, updated)}
                onDelete={() => deleteModule(mi)}
                color={color}
                allLessons={allLessonsFlat}
              />
            ))}

            <button
              onClick={addModule}
              className="w-full py-3 rounded-lg font-geist text-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 mb-6"
              style={{ background: 'rgba(197, 198, 199, 0.04)', color: 'rgba(197, 198, 199, 0.6)', border: '1px dashed rgba(197, 198, 199, 0.2)' }}
            >
              <Icon name="sparkle" size={14} color="currentColor" />
              Добавить модуль
            </button>

            {/* Error */}
            {error && (
              <div
                className="rounded-lg p-3 mb-4 font-geist text-sm text-center"
                style={{ background: 'rgba(224,82,82,0.1)', color: '#e05252', border: '1px solid rgba(224,82,82,0.4)' }}
              >
                {error}
              </div>
            )}

            {/* Save buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => save(false)}
                disabled={saving}
                className="flex-1 py-3 rounded-lg font-geist font-semibold text-sm transition-all cursor-pointer"
                style={{ background: 'rgba(197, 198, 199, 0.07)', color: 'rgba(197, 198, 199, 0.6)' }}
              >
                {saving ? 'Сохраняю...' : <span className="flex items-center justify-center gap-2"><Icon name="floppy" size={16} color="currentColor" />Сохранить черновик</span>}
              </button>
              <button
                onClick={() => save(true)}
                disabled={saving}
                className="flex-1 py-3 rounded-lg font-geist font-bold text-sm transition-all hover:-translate-y-0.5 cursor-pointer"
                style={{ background: color, color: PAGE_BG, boxShadow: saving ? 'none' : CARD_SHADOW }}
              >
                {saving ? 'Публикую...' : <span className="flex items-center justify-center gap-2"><Icon name="rocket" size={16} color="currentColor" />Опубликовать</span>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
