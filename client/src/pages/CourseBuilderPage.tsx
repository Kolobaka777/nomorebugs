import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import SnailLoader from '../components/SnailLoader';
import PixelIcon from '../components/PixelIcon';
import { API_BASE_URL as API } from '../config';
import { authFetch } from '../auth';
import { clickableProps } from '../utils/a11y';

interface Props {
  user: any;
  onLogout: () => void;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface BQuestion {
  _id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_idx: number;
  explanation: string;
}

type PrerequisiteType = 'none' | 'optional' | 'mandatory';

interface BLesson {
  _id: string;
  title: string;
  type: 'lesson' | 'quiz';
  content: string;
  questions: BQuestion[];
  // 'none': always accessible. 'optional': a non-blocking recommendation
  // (e.g. external reading we can't verify was done) shown as a hint but
  // never gates access. 'mandatory': blocks access until the referenced
  // lesson (prerequisite_lesson_local_id, a draft _id — resolved to a real
  // DB id server-side on save) is completed.
  prerequisite_type: PrerequisiteType;
  prerequisite_lesson_local_id?: string;
  prerequisite_note?: string;
}

interface BModule {
  _id: string;
  title: string;
  lessons: BLesson[];
}

interface FormState {
  title: string;
  description: string;
  tag: string;
  color: string;
  requirements: string;
  modules: BModule[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2);

const PRESET_COLORS = [
  { name: 'Зелёный', value: '#1D9E75' },
  { name: 'Фиолетовый', value: '#7F77DD' },
  { name: 'Янтарный', value: '#EF9F27' },
  { name: 'Красный', value: '#e05252' },
  { name: 'Синий', value: '#4A90D9' },
];

const TAGS = ['HTML', 'CSS', 'DevTools', 'Console', 'Responsive', 'Network', 'JS', 'Bug Reports', 'Advanced', 'Custom'];

function emptyQuestion(): BQuestion {
  return { _id: uid(), question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_idx: 0, explanation: '' };
}

function emptyLesson(type: 'lesson' | 'quiz' = 'lesson'): BLesson {
  return { _id: uid(), title: '', type, content: '', questions: type === 'quiz' ? [emptyQuestion()] : [], prerequisite_type: 'none' };
}

function emptyModule(): BModule {
  return { _id: uid(), title: '', lessons: [emptyLesson()] };
}

// ─── Question editor ──────────────────────────────────────────────────────────

function QuestionEditor({
  q,
  idx,
  onChange,
  onDelete,
  color,
}: {
  q: BQuestion;
  idx: number;
  onChange: (q: BQuestion) => void;
  onDelete: () => void;
  color: string;
}) {
  const opts: [keyof BQuestion, string][] = [
    ['option_a', 'A'],
    ['option_b', 'B'],
    ['option_c', 'C'],
    ['option_d', 'D'],
  ];

  return (
    <div
      className="rounded p-4 mb-3"
      style={{ background: 'rgba(232,232,208,0.03)', border: '1px solid rgba(232,232,208,0.08)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-sans text-xs font-semibold" style={{ color }}>
          Вопрос {idx + 1}
        </span>
        <button onClick={onDelete} className="text-pixel/55 hover:text-red-400 transition-colors text-sm">
          × удалить
        </button>
      </div>

      <textarea
        value={q.question_text}
        onChange={e => onChange({ ...q, question_text: e.target.value })}
        placeholder="Текст вопроса"
        rows={2}
        className="w-full rounded px-3 py-2 font-sans text-xs mb-3 resize-none outline-none"
        style={{ background: '#0f0f1a', color: '#e8e8d0', border: '1px solid rgba(232,232,208,0.1)' }}
      />

      <div className="grid grid-cols-2 gap-2 mb-3">
        {opts.map(([field, label], oi) => (
          <div key={field} className="flex items-center gap-2">
            <button
              onClick={() => onChange({ ...q, correct_idx: oi })}
              className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border transition-all"
              style={{
                borderColor: q.correct_idx === oi ? color : 'rgba(232,232,208,0.2)',
                background: q.correct_idx === oi ? `${color}30` : 'transparent',
                color: q.correct_idx === oi ? color : 'rgba(232,232,208,0.4)',
              }}
            >
              {label}
            </button>
            <input
              value={q[field] as string}
              onChange={e => onChange({ ...q, [field]: e.target.value })}
              placeholder={`Вариант ${label}`}
              className="flex-1 rounded px-2 py-1.5 font-sans text-xs outline-none"
              style={{ background: '#0f0f1a', color: '#e8e8d0', border: '1px solid rgba(232,232,208,0.1)' }}
            />
          </div>
        ))}
      </div>

      <input
        value={q.explanation}
        onChange={e => onChange({ ...q, explanation: e.target.value })}
        placeholder="Объяснение правильного ответа (необязательно)"
        className="w-full rounded px-3 py-1.5 font-sans text-xs outline-none"
        style={{ background: '#0f0f1a', color: 'rgba(232,232,208,0.6)', border: '1px solid rgba(232,232,208,0.07)' }}
      />
    </div>
  );
}

// ─── Lesson editor ────────────────────────────────────────────────────────────

function LessonEditor({
  lesson,
  idx,
  onChange,
  onDelete,
  color,
  allLessons,
}: {
  lesson: BLesson;
  idx: number;
  onChange: (l: BLesson) => void;
  onDelete: () => void;
  color: string;
  allLessons: { _id: string; title: string }[];
}) {
  const addQuestion = () => onChange({ ...lesson, questions: [...lesson.questions, emptyQuestion()] });
  const updateQuestion = (qi: number, q: BQuestion) =>
    onChange({ ...lesson, questions: lesson.questions.map((old, i) => (i === qi ? q : old)) });
  const deleteQuestion = (qi: number) =>
    onChange({ ...lesson, questions: lesson.questions.filter((_, i) => i !== qi) });

  return (
    <div
      className="rounded-lg p-4 mb-3"
      style={{
        background: '#141424',
        border: `1px solid ${lesson.type === 'quiz' ? `${color}30` : 'rgba(232,232,208,0.07)'}`,
      }}
    >
      {/* Lesson header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="font-sans text-xs" style={{ color: 'rgba(232,232,208,0.55)' }}>
          {lesson.type === 'quiz' ? <PixelIcon name="memo" size={12} color="rgba(232,232,208,0.3)" /> : `${idx + 1}.`}
        </span>

        <input
          value={lesson.title}
          onChange={e => onChange({ ...lesson, title: e.target.value })}
          placeholder={lesson.type === 'quiz' ? 'Название теста' : 'Название урока'}
          className="flex-1 rounded px-3 py-1.5 font-sans text-sm outline-none"
          style={{ background: '#0f0f1a', color: '#e8e8d0', border: '1px solid rgba(232,232,208,0.1)' }}
        />

        {/* Type toggle */}
        <div className="flex rounded overflow-hidden flex-shrink-0" style={{ border: '1px solid rgba(232,232,208,0.1)' }}>
          {(['lesson', 'quiz'] as const).map(t => (
            <button
              key={t}
              onClick={() => onChange({ ...lesson, type: t, questions: t === 'quiz' && lesson.questions.length === 0 ? [emptyQuestion()] : lesson.questions })}
              className="px-2.5 py-1 font-sans text-xs transition-colors"
              style={{
                background: lesson.type === t ? `${color}25` : 'transparent',
                color: lesson.type === t ? color : 'rgba(232,232,208,0.35)',
              }}
            >
              {t === 'lesson' ? 'Урок' : 'Тест'}
            </button>
          ))}
        </div>

        <button onClick={onDelete} aria-label="Удалить урок" className="flex-shrink-0 text-pixel/55 hover:text-red-400 transition-colors text-xs">
          ×
        </button>
      </div>

      {/* Prerequisite */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="font-sans text-xs shrink-0" style={{ color: 'rgba(232,232,208,0.6)' }}>Пререквизит:</span>
        <div className="flex rounded overflow-hidden flex-shrink-0" style={{ border: '1px solid rgba(232,232,208,0.1)' }}>
          {([
            ['none', 'Нет'],
            ['optional', 'Рекомендация'],
            ['mandatory', 'Обязательно'],
          ] as [PrerequisiteType, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => onChange({ ...lesson, prerequisite_type: t })}
              className="px-2.5 py-1 font-sans text-xs transition-colors"
              style={{
                background: lesson.prerequisite_type === t ? `${color}25` : 'transparent',
                color: lesson.prerequisite_type === t ? color : 'rgba(232,232,208,0.35)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {lesson.prerequisite_type === 'mandatory' && (
          <select
            value={lesson.prerequisite_lesson_local_id || ''}
            onChange={e => onChange({ ...lesson, prerequisite_lesson_local_id: e.target.value || undefined })}
            className="rounded px-2 py-1 font-sans text-xs outline-none flex-1 min-w-[160px]"
            style={{ background: '#0f0f1a', color: '#e8e8d0', border: '1px solid rgba(232,232,208,0.1)' }}
          >
            <option value="">— выбери урок —</option>
            {allLessons.filter(l => l._id !== lesson._id).map(l => (
              <option key={l._id} value={l._id}>{l.title || '(без названия)'}</option>
            ))}
          </select>
        )}

        {lesson.prerequisite_type === 'optional' && (
          <input
            value={lesson.prerequisite_note || ''}
            onChange={e => onChange({ ...lesson, prerequisite_note: e.target.value })}
            placeholder="Например: рекомендуем сначала прочитать статью о ..."
            className="rounded px-2 py-1 font-sans text-xs outline-none flex-1 min-w-[220px]"
            style={{ background: '#0f0f1a', color: '#e8e8d0', border: '1px solid rgba(232,232,208,0.1)' }}
          />
        )}
      </div>

      {/* Content (lesson) */}
      {lesson.type === 'lesson' && (
        <textarea
          value={lesson.content}
          onChange={e => onChange({ ...lesson, content: e.target.value })}
          placeholder={`Содержимое урока...\n\nАбзацы разделяются пустой строкой. Поддерживается разметка:\n# Заголовок     ## Подзаголовок\n> Совет (подсветится как подсказка)\n! Предупреждение (подсветится как варнинг)\n- Пункт списка\n- Ещё пункт\n\`\`\`\nблок кода\n\`\`\``}
          rows={6}
          className="w-full rounded px-3 py-2 font-sans text-xs resize-y outline-none"
          style={{ background: '#0f0f1a', color: 'rgba(232,232,208,0.75)', border: '1px solid rgba(232,232,208,0.08)', lineHeight: 1.7 }}
        />
      )}

      {/* Questions (quiz) */}
      {lesson.type === 'quiz' && (
        <div className="mt-2">
          {lesson.questions.map((q, qi) => (
            <QuestionEditor
              key={q._id}
              q={q}
              idx={qi}
              onChange={updated => updateQuestion(qi, updated)}
              onDelete={() => deleteQuestion(qi)}
              color={color}
            />
          ))}
          <button
            onClick={addQuestion}
            className="w-full py-2 rounded font-sans text-xs transition-colors mt-1"
            style={{ background: `${color}15`, color, border: `1px dashed ${color}40` }}
          >
            + Добавить вопрос
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Module editor ────────────────────────────────────────────────────────────

function ModuleEditor({
  mod,
  modIdx,
  onChange,
  onDelete,
  color,
  allLessons,
}: {
  mod: BModule;
  modIdx: number;
  onChange: (m: BModule) => void;
  onDelete: () => void;
  color: string;
  allLessons: { _id: string; title: string }[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const addLesson = () => onChange({ ...mod, lessons: [...mod.lessons, emptyLesson()] });
  const addQuiz = () => onChange({ ...mod, lessons: [...mod.lessons, emptyLesson('quiz')] });
  const updateLesson = (i: number, l: BLesson) =>
    onChange({ ...mod, lessons: mod.lessons.map((old, idx) => (idx === i ? l : old)) });
  const deleteLesson = (i: number) =>
    onChange({ ...mod, lessons: mod.lessons.filter((_, idx) => idx !== i) });

  return (
    <div
      className="rounded-lg mb-4"
      style={{ background: '#1a1a2e', border: `1px solid ${color}25` }}
    >
      {/* Module header */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer"
        onClick={() => setCollapsed(c => !c)}
        {...clickableProps(() => setCollapsed(c => !c))}
        aria-expanded={!collapsed}
      >
        <span className="font-sans text-xs font-bold" style={{ color, minWidth: '20px' }}>
          М{modIdx + 1}
        </span>
        <input
          value={mod.title}
          onChange={e => { e.stopPropagation(); onChange({ ...mod, title: e.target.value }); }}
          onClick={e => e.stopPropagation()}
          placeholder={`Название модуля ${modIdx + 1}`}
          className="flex-1 rounded px-3 py-1.5 font-sans text-sm font-semibold outline-none"
          style={{ background: 'rgba(232,232,208,0.04)', color: '#e8e8d0', border: '1px solid rgba(232,232,208,0.08)' }}
        />
        <span className="text-pixel/55 font-sans text-xs flex-shrink-0">
          {mod.lessons.length} эл.
        </span>
        <span className="text-pixel/55 text-xs flex-shrink-0" style={{ transform: collapsed ? 'none' : 'rotate(90deg)', display: 'inline-block', transition: 'transform 0.15s' }}>›</span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          aria-label="Удалить модуль"
          className="flex-shrink-0 text-pixel/55 hover:text-red-400 transition-colors text-sm"
        >
          ×
        </button>
      </div>

      {!collapsed && (
        <div className="px-5 pb-4">
          {mod.lessons.map((lesson, li) => (
            <LessonEditor
              key={lesson._id}
              lesson={lesson}
              idx={li}
              onChange={updated => updateLesson(li, updated)}
              onDelete={() => deleteLesson(li)}
              color={color}
              allLessons={allLessons}
            />
          ))}
          <div className="flex gap-2 mt-2">
            <button
              onClick={addLesson}
              className="flex-1 py-2 rounded font-sans text-xs transition-colors"
              style={{ background: 'rgba(232,232,208,0.05)', color: 'rgba(232,232,208,0.6)', border: '1px dashed rgba(232,232,208,0.15)' }}
            >
              + Добавить урок
            </button>
            <button
              onClick={addQuiz}
              className="flex-1 py-2 rounded font-sans text-xs transition-colors"
              style={{ background: `${color}10`, color, border: `1px dashed ${color}40` }}
            >
              + Добавить тест
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CourseBuilderPage({ user, onLogout }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    tag: 'Custom',
    color: '#1D9E75',
    requirements: '',
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
          color: data.color || '#1D9E75',
          requirements: data.requirements || '',
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
      if (isEdit) {
        // Conflict check: has someone else saved this course since we loaded it?
        const current = await authFetch(`${API}/custom-courses/${id}`).then(r => r.json()).catch(() => null);
        if (current && !current.error && loadedUpdatedAt && current.updated_at !== loadedUpdatedAt) {
          const proceed = window.confirm(
            'Курс был изменён после того, как ты его открыл(а) (кто-то ещё сохранил изменения). ' +
            'Сохранить твою версию поверх текущей?'
          );
          if (!proceed) { setSaving(false); return; }
        }
      }

      const body = {
        ...form,
        is_published: publish ? 1 : 0,
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
      <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
        <Navigation user={user} onLogout={onLogout} />
        <SnailLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#0f0f1a' }}>
      <Navigation user={user} onLogout={onLogout} />

      <div className="max-w-4xl mx-auto px-6 pt-16 pb-8 fade-in">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/zhukademia')}
            className="font-sans text-sm transition-colors"
            style={{ color: 'rgba(232,232,208,0.6)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#e8e8d0')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(232,232,208,0.35)')}
          >
            ← Назад
          </button>
          <h1 className="font-pixel text-pixel" style={{ fontSize: '0.7rem', lineHeight: 2 }}>
            <span className="flex items-center gap-2">
              <PixelIcon name={isEdit ? 'pencil' : 'sparkle'} size={13} color="currentColor" />
              {isEdit ? 'Редактировать курс' : 'Новый курс'}
            </span>
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ─── LEFT: Basic info ─── */}
          <div className="lg:col-span-1 space-y-4">
            <div
              className="rounded-lg p-5"
              style={{ background: '#1a1a2e', border: '1px solid rgba(232,232,208,0.07)' }}
            >
              <p className="font-pixel text-pixel/60 mb-4" style={{ fontSize: '0.55rem', lineHeight: 2 }}>
                Основная информация
              </p>

              {/* Title */}
              <div className="mb-4">
                <label className="font-sans text-xs text-pixel/60 block mb-1.5">Название курса *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Напр.: Тестирование API для начинающих"
                  className="w-full rounded px-3 py-2 font-sans text-sm outline-none"
                  style={{ background: '#0f0f1a', color: '#e8e8d0', border: `1px solid ${form.title ? color + '50' : 'rgba(232,232,208,0.1)'}` }}
                />
              </div>

              {/* Tag */}
              <div className="mb-4">
                <label className="font-sans text-xs text-pixel/60 block mb-1.5">Тег</label>
                <select
                  value={form.tag}
                  onChange={e => setForm(f => ({ ...f, tag: e.target.value }))}
                  className="w-full rounded px-3 py-2 font-sans text-sm outline-none"
                  style={{ background: '#0f0f1a', color: '#e8e8d0', border: '1px solid rgba(232,232,208,0.1)' }}
                >
                  {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Color */}
              <div className="mb-4">
                <label className="font-sans text-xs text-pixel/60 block mb-2">Цвет карточки</label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      title={c.name}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                      style={{
                        background: c.value,
                        boxShadow: form.color === c.value ? `0 0 0 2px #0f0f1a, 0 0 0 4px ${c.value}` : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="font-sans text-xs text-pixel/60 block mb-1.5">Описание</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Что студент узнает из этого курса?"
                  rows={4}
                  className="w-full rounded px-3 py-2 font-sans text-xs resize-none outline-none"
                  style={{ background: '#0f0f1a', color: 'rgba(232,232,208,0.75)', border: '1px solid rgba(232,232,208,0.1)', lineHeight: 1.7 }}
                />
              </div>

              {/* Requirements */}
              <div>
                <label className="font-sans text-xs text-pixel/60 block mb-1.5">Требования / аудитория</label>
                <textarea
                  value={form.requirements}
                  onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))}
                  placeholder="Подходит для новичков, не нужен опыт..."
                  rows={3}
                  className="w-full rounded px-3 py-2 font-sans text-xs resize-none outline-none"
                  style={{ background: '#0f0f1a', color: 'rgba(232,232,208,0.75)', border: '1px solid rgba(232,232,208,0.1)', lineHeight: 1.7 }}
                />
              </div>
            </div>

            {/* Preview card */}
            <div
              className="rounded-lg overflow-hidden"
              style={{
                background: '#141424',
                boxShadow: `2px 0 0 0 ${color}, -2px 0 0 0 ${color}, 0 2px 0 0 ${color}, 0 -2px 0 0 ${color}`,
              }}
            >
              <div className="h-16 flex items-center justify-center text-2xl" style={{ background: `${color}12` }}>
                <PixelIcon name={
                  form.tag === 'HTML' ? 'globe' :
                  form.tag === 'CSS' ? 'palette' :
                  form.tag === 'DevTools' ? 'microscope' :
                  form.tag === 'JS' ? 'gear' :
                  form.tag === 'Network' ? 'antenna' : 'books'
                } size={28} color={color} />
              </div>
              <div className="p-3">
                <span className="text-xs font-sans font-semibold px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color }}>
                  {form.tag}
                </span>
                <p className="font-sans font-semibold text-xs mt-2 text-pixel leading-snug">
                  {form.title || 'Название курса'}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  <span className="text-xs font-sans font-bold px-1.5 py-0.5 rounded" style={{ background: '#EF9F27', color: '#0f0f1a' }}>NEW</span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── RIGHT: Structure builder ─── */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <p className="font-pixel text-pixel/60" style={{ fontSize: '0.55rem', lineHeight: 2 }}>
                Структура курса
              </p>
              <span className="font-sans text-xs text-pixel/55">
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
              className="w-full py-3 rounded font-sans text-sm transition-all mb-6"
              style={{ background: 'rgba(232,232,208,0.04)', color: 'rgba(232,232,208,0.6)', border: '1px dashed rgba(232,232,208,0.12)' }}
            >
              + Добавить модуль
            </button>

            {/* Error */}
            {error && (
              <div
                className="rounded p-3 mb-4 font-sans text-sm text-center"
                style={{ background: 'rgba(224,82,82,0.1)', color: '#e05252', border: '1px solid rgba(224,82,82,0.2)' }}
              >
                {error}
              </div>
            )}

            {/* Save buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => save(false)}
                disabled={saving}
                className="flex-1 py-3 rounded font-sans font-semibold text-sm transition-all"
                style={{ background: 'rgba(232,232,208,0.07)', color: 'rgba(232,232,208,0.6)' }}
              >
                {saving ? 'Сохраняю...' : <span className="flex items-center justify-center gap-2"><PixelIcon name="floppy" size={13} color="currentColor" />Сохранить черновик</span>}
              </button>
              <button
                onClick={() => save(true)}
                disabled={saving}
                className="flex-1 py-3 rounded font-sans font-bold text-sm transition-all hover:-translate-y-0.5"
                style={{ background: color, color: '#0f0f1a', boxShadow: saving ? 'none' : `0 4px 0 0 ${color}50` }}
              >
                {saving ? 'Публикую...' : <span className="flex items-center justify-center gap-2"><PixelIcon name="rocket" size={13} color="currentColor" />Опубликовать</span>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
