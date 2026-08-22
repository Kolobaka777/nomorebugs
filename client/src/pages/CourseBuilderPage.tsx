import { lazy, Suspense, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import FrogLoader from '../components/FrogLoader';
import Icon from '../components/Icon';
import { DEFAULT_SUCCESS_TEXT, DEFAULT_FAIL_TEXT, RESULT_TEXT_MAX } from '../utils/courseResult';
import { knowledgeApi, coursesApi } from '../api';
import ModuleEditor from '../components/courseBuilder/ModuleEditor';
import { uid, PRESET_COLORS, TAGS, emptyModule } from '../components/courseBuilder/types';
import type { BModule, FormState } from '../components/courseBuilder/types';
import { parseRichContent } from '../utils/richContent';
import { PAGE_GRADIENT, PAGE_BG, CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, TRACK_WIDE, CARD_SHADOW, ERROR, H2, H3, H4, SMALL, CARD_BG_PATTERN, readableTextOn } from '../utils/theme';
import { apiErrorMessage } from '../utils/toast';
import { getCourseTagColor, tagChipStyle, tagChipStyleMuted } from '../utils/topics';
import { counted } from '../utils/plural';
import { BookOpenIcon, PagesIcon, CapIcon } from '../components/CatalogIcons';

// Same lazy-split reasoning as GuidesPage.tsx — Tiptap is the app's single
// heaviest dependency, no reason to pay for it before this form is open.
const RichTextEditor = lazy(() => import('../components/RichTextEditor'));

function RichTextEditorFallback() {
  return (
    <div className="flex items-center justify-center py-6">
      <div className="pixel-pulse font-geist text-xs" style={{ color: TEXT_MUTED }}>загружаю редактор...</div>
    </div>
  );
}

interface Props {
  user: any;
  onLogout: () => void;
}

export default function CourseBuilderPage({ user, onLogout }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  // Lead/admin (or a tester with a manage_courses grant) publish directly,
  // exactly like before. A plain tester lands here to *propose* a course
  // instead — same builder, but the server always forces it unpublished +
  // pending review regardless of what's sent (see POST /api/custom-courses),
  // so the UI below swaps the draft/publish choice for a single submit
  // action rather than offering a publish toggle that wouldn't do anything.
  const [canPublishDirectly, setCanPublishDirectly] = useState(user.role === 'lead' || user.role === 'admin');
  useEffect(() => {
    if (canPublishDirectly) return;
    knowledgeApi.getMyPermissions().then(r => { if (r.data.includes('manage_courses')) setCanPublishDirectly(true); }).catch(() => {});
  }, []);
  const isProposing = !canPublishDirectly;

  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    tag: 'Custom',
    color: '#66FCF1',
    requirements: '',
    success_text: '',
    fail_text: '',
    deadline_at: '',
    modules: [emptyModule()],
    is_onboarding: false,
    section_id: null,
  });
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    coursesApi.getSections().then(r => { if (Array.isArray(r.data)) setSections(r.data); }).catch(() => {});
  }, []);
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
    coursesApi.get(id!)
      .then(r => {
        const data = r.data;
        setLoadedUpdatedAt(data.updated_at || null);
        setForm({
          title: data.title,
          description: data.description || '',
          tag: data.tag || 'Custom',
          color: data.color || '#66FCF1',
          requirements: data.requirements || '',
          success_text: data.success_text || '',
          fail_text: data.fail_text || '',
          deadline_at: data.deadline_at ? String(data.deadline_at).slice(0, 10) : '',
          is_onboarding: !!data.is_onboarding,
          section_id: data.section_id ?? null,
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
  // Fresh local ids throughout, or the copy and the original would be the
  // same elements to React and to the prerequisite picker. Prerequisite
  // references are dropped: pointing at the original's target is a guess,
  // and pointing at the original itself is a loop.
  const duplicateModule = (i: number) => {
    const src = form.modules[i];
    const copy: BModule = {
      ...src,
      _id: uid(),
      title: src.title ? `${src.title} (копия)` : src.title,
      lessons: src.lessons.map(l => ({
        ...l,
        _id: uid(),
        prerequisite_type: 'none' as const,
        prerequisite_lesson_local_id: undefined,
        questions: l.questions.map(q => ({ ...q, _id: uid() })),
      })),
    };
    setForm(f => ({ ...f, modules: [...f.modules.slice(0, i + 1), copy, ...f.modules.slice(i + 1)] }));
  };

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
        const current = await coursesApi.get(id!).then(r => r.data).catch(() => null);
        if (current && loadedUpdatedAt && current.updated_at !== loadedUpdatedAt) {
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

      if (isEdit) await coursesApi.update(id!, body);
      else await coursesApi.create(body);

      navigate('/zhukademia');
    } catch (e: any) {
      // axios rejects on a non-2xx, so the server's own explanation (a
      // validation message, a 409 from the conflict check) arrives here
      // instead of having to be sniffed out of a 200 body.
      setError(apiErrorMessage(e, 'Ошибка сохранения'));
    } finally {
      setSaving(false);
    }
  };

  const color = form.color;
  const allLessonsFlat = form.modules.flatMap(m => m.lessons.map(l => ({ _id: l._id, title: l.title })));
  const allLessonsRaw = form.modules.flatMap(m => m.lessons);
  const lessonCount = allLessonsRaw.length;
  // Only a test with a question in it counts as a test — an empty one is a
  // placeholder the author has not filled in yet.
  const quizCount = allLessonsRaw.filter(l => l.type === 'quiz' && l.questions.length > 0).length;

  if (loadingEdit) {
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

      <div className="max-w-4xl mx-auto px-6 pt-16 pb-8 fade-in">
        {/* Header */}
        <div className="flex items-start justify-between gap-6 mb-8 flex-wrap">
          <button
            onClick={() => navigate('/zhukademia')}
            className="transition-colors cursor-pointer flex items-center gap-2 shrink-0"
            style={{ ...SMALL }}
            onMouseEnter={e => (e.currentTarget.style.color = TEXT_PRIMARY)}
            onMouseLeave={e => (e.currentTarget.style.color = TEXT_MUTED)}
          >
            <Icon name="chevronLeft" size={18} color={ACCENT} />
            К КАТАЛОГУ КУРСОВ
          </button>
          {/* The course's own name is the heading, per the design — what you
              are making, not what screen you are on. Until it has one, the
              screen says which of the three things this is. */}
          <h1 className="font-montserrat break-words min-w-0 text-right" style={{ ...H2 }}>
            {form.title || (isEdit ? 'Редактировать курс' : isProposing ? 'Предложить курс' : 'Новый курс')}
          </h1>
        </div>

        {isProposing && !isEdit && (
          <p className="font-geist text-sm mb-6 -mt-4" style={{ color: TEXT_MUTED, maxWidth: 640 }}>
            Заполни курс полностью — он отправится лиду на рассмотрение и появится в общем каталоге для всей команды, если его одобрят.
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ─── LEFT: Basic info ─── */}
          <div className="lg:col-span-1 space-y-4">
            <div
              className="rounded-lg p-5"
              style={{ background: CARD_BG, border: '1px solid rgba(197, 198, 199, 0.2)', boxShadow: CARD_SHADOW }}
            >
              <p className="font-montserrat mb-5" style={{ ...H4 }}>
                ОСНОВНАЯ ИНФОРМАЦИЯ
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
                <label className="font-geist text-xs block mb-2" style={{ color: TEXT_MUTED }}>Тег</label>
                {/* Chips rather than a dropdown: there are seven of them, they
                    are colour-coded everywhere else in the app, and a select
                    hides both facts behind one closed row. */}
                <div className="flex flex-wrap gap-2">
                  {TAGS.map(t => {
                    const c = getCourseTagColor(t);
                    const on = form.tag === t;
                    return (
                      <button
                        key={t}
                        onClick={() => setForm(f => ({ ...f, tag: t }))}
                        aria-pressed={on}
                        className="font-geist font-semibold px-2 py-0.5 cursor-pointer transition-all"
                        style={{ fontSize: 11, letterSpacing: '0.06em', ...(on ? tagChipStyle(c, t) : tagChipStyleMuted(c, t)) }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color */}
              <div className="mb-4">
                <label className="font-geist text-xs block mb-2" style={{ color: TEXT_MUTED }}>Цветовая схема</label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      title={c.name}
                      aria-label={c.name}
                      aria-pressed={form.color === c.value}
                      className="transition-all hover:brightness-110 cursor-pointer"
                      style={{
                        width: 34, height: 34, borderRadius: 4,
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
                <Suspense fallback={<RichTextEditorFallback />}>
                  <RichTextEditor
                    content={parseRichContent(form.description)}
                    editable
                    onChangeJSON={json => setForm(f => ({ ...f, description: json }))}
                    placeholder="Что студент узнает из этого курса?"
                  />
                </Suspense>
              </div>

              {/* Requirements */}
              <div>
                <label className="font-geist text-xs block mb-1.5" style={{ color: TEXT_MUTED }}>Требования / аудитория</label>
                <Suspense fallback={<RichTextEditorFallback />}>
                  <RichTextEditor
                    content={parseRichContent(form.requirements)}
                    editable
                    onChangeJSON={json => setForm(f => ({ ...f, requirements: json }))}
                    placeholder="Подходит для новичков, не нужен опыт..."
                  />
                </Suspense>
              </div>

              {/* What the frog says at the end. Optional on purpose — the
                  placeholders show the exact defaults that ship if these
                  are left empty, so it's clear nothing is missing rather
                  than merely unset. */}
              <div className="mt-4">
                <label className="font-geist text-xs block mb-1.5" style={{ color: TEXT_MUTED }}>
                  Что скажет лягух в конце
                </label>
                <input
                  className="pixel-input text-sm mb-2"
                  value={form.success_text}
                  maxLength={RESULT_TEXT_MAX}
                  onChange={e => setForm(f => ({ ...f, success_text: e.target.value }))}
                  placeholder={`Если сдал — по умолчанию: «${DEFAULT_SUCCESS_TEXT}»`}
                  aria-label="Фраза при успешном прохождении"
                />
                <input
                  className="pixel-input text-sm"
                  value={form.fail_text}
                  maxLength={RESULT_TEXT_MAX}
                  onChange={e => setForm(f => ({ ...f, fail_text: e.target.value }))}
                  placeholder={`Если не сдал — по умолчанию: «${DEFAULT_FAIL_TEXT}»`}
                  aria-label="Фраза при неудачном прохождении"
                />
                <p className="text-xs font-geist mt-1" style={{ color: 'rgba(197, 198, 199, 0.45)' }}>
                  Необязательно. Оставишь пустым — лягух скажет фразу по умолчанию.
                </p>
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

              {/* Section — lead/admin only, same reasoning as is_onboarding
                  below: cross-cutting catalog organization, not something a
                  proposing tester should set. Sections themselves are
                  managed from the catalog page (create/rename/delete), not
                  here — this is just "which one", not "manage the list". */}
              {!isProposing && (
                <div className="mt-4">
                  <label className="font-geist text-xs block mb-1.5" style={{ color: TEXT_MUTED }}>Раздел каталога</label>
                  <select
                    value={form.section_id ?? ''}
                    onChange={e => setForm(f => ({ ...f, section_id: e.target.value ? Number(e.target.value) : null }))}
                    className="pixel-input text-sm"
                  >
                    <option value="">Без раздела</option>
                    {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {/* Onboarding flag — lead/admin only, mirrors why the propose
                  flow itself never shows a publish toggle: a proposing
                  tester has no say over cross-cutting catalog placement. */}
              {!isProposing && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(197, 198, 199, 0.12)' }}>
                  <label className="flex items-start gap-2 text-xs font-geist cursor-pointer" style={{ color: TEXT_MUTED }}>
                    <input
                      type="checkbox"
                      checked={form.is_onboarding}
                      onChange={e => setForm(f => ({ ...f, is_onboarding: e.target.checked }))}
                      className="mt-0.5"
                    />
                    <span>
                      Это вводный курс для новичков — будет отдельным блоком «Для новичков» в каталоге, доступным всем в любое время.
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Preview card — the catalog card itself, not a different card
                that stands for it. The author sees the strip, the chip and
                the title exactly as a reader will, so "what will this look
                like" is answered here instead of after publishing. */}
            <div
              className="rounded-lg overflow-hidden"
              style={{ background: CARD_BG_PATTERN, border: `1.5px solid ${color}70`, boxShadow: CARD_SHADOW }}
            >
              <div
                className="flex items-center px-3 py-1.5"
                style={{ background: 'rgba(197, 198, 199, 0.06)', borderBottom: `1px solid ${color}40` }}
              >
                <span className="font-geist" style={{ fontSize: 12, color: 'rgba(197, 198, 199,0.8)', letterSpacing: TRACK_WIDE }}>
                  {form.modules.length > 0
                    ? `0/${form.modules.length} модулей`
                    : 'Дополнительный курс'}
                </span>
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-4">
                  <p
                    className="font-montserrat break-words min-w-0"
                    style={form.title
                      ? { ...H3 }
                      : { ...H3, color: 'rgba(197, 198, 199,0.35)', fontStyle: 'italic', fontWeight: 400 }}
                  >
                    {form.title || 'Название появится здесь'}
                  </p>
                  <span
                    className="shrink-0 mt-0.5 font-geist font-semibold px-2 py-0.5"
                    style={{ fontSize: 11, letterSpacing: '0.06em', ...tagChipStyle(color, form.tag) }}
                  >
                    {form.tag}
                  </span>
                </div>
                <div className="flex items-center justify-end">
                  <span
                    className="font-geist font-semibold flex items-center gap-1"
                    style={{ fontSize: 12, color, letterSpacing: TRACK_WIDE }}
                  >
                    ПРЕДПРОСМОТР КУРСА <Icon name="chevronRight" size={14} color="currentColor" />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── RIGHT: Structure builder ─── */}
          <div className="lg:col-span-2">
            {/* The same three counts a reader sees on the course itself, so
                the author is looking at the same summary they will get. The
                old line said "2 модуля" with a hand-built ending. */}
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <p className="font-montserrat" style={{ ...H3 }}>Структура курса</p>
              <span className="flex items-center gap-5 flex-wrap font-geist" style={{ fontSize: 12, color: TEXT_MUTED, letterSpacing: TRACK_WIDE }}>
                <span className="flex items-center gap-2"><BookOpenIcon size={15} color="currentColor" />{counted(lessonCount, ['УРОК', 'УРОКА', 'УРОКОВ'])}</span>
                <span className="flex items-center gap-2"><PagesIcon size={15} color="currentColor" />{counted(form.modules.length, ['МОДУЛЬ', 'МОДУЛЯ', 'МОДУЛЕЙ'])}</span>
                <span className="flex items-center gap-2"><CapIcon size={15} color="currentColor" />{counted(quizCount, ['ТЕСТ', 'ТЕСТА', 'ТЕСТОВ'])}</span>
              </span>
            </div>

            {form.modules.map((mod, mi) => (
              <ModuleEditor
                key={mod._id}
                mod={mod}
                modIdx={mi}
                onChange={updated => updateModule(mi, updated)}
                onDelete={() => deleteModule(mi)}
                onDuplicate={() => duplicateModule(mi)}
                color={color}
                allLessons={allLessonsFlat}
              />
            ))}

            <button
              onClick={addModule}
              className="w-full py-3 rounded-lg font-geist font-semibold text-sm transition-all hover:brightness-110 cursor-pointer mb-6"
              style={{ background: color, color: readableTextOn(color), letterSpacing: TRACK_WIDE, boxShadow: CARD_SHADOW }}
            >
              + ДОБАВИТЬ МОДУЛЬ
            </button>

            {/* Error */}
            {error && (
              <div
                className="rounded-lg p-3 mb-4 font-geist text-sm text-center"
                style={{ background: 'rgba(224,82,82,0.1)', color: ERROR, border: '1px solid rgba(224,82,82,0.4)' }}
              >
                {error}
              </div>
            )}

            {/* Save buttons — a proposing tester gets one action (there's no
                "draft" state for them to save to: the server always
                requires the full structure and marks it pending review
                regardless), instead of the lead's draft/publish choice. */}
            {isProposing ? (
              <button
                onClick={() => save(false)}
                disabled={saving}
                className="w-full py-3 rounded-lg font-geist font-bold text-sm transition-all hover:brightness-110 cursor-pointer"
                style={{ background: color, color: readableTextOn(color), boxShadow: saving ? 'none' : CARD_SHADOW }}
              >
                {saving ? 'Отправляю...' : <span className="flex items-center justify-center gap-2"><Icon name="lightbulb" size={16} color="currentColor" />Отправить на рассмотрение</span>}
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={() => save(false)}
                  disabled={saving}
                  className="flex-1 py-3 rounded-lg font-geist font-semibold text-sm transition-all hover:brightness-125 cursor-pointer"
                  style={{ background: 'rgba(11, 12, 16, 0.5)', color: TEXT_PRIMARY, border: `1px solid ${color}55`, letterSpacing: TRACK_WIDE }}
                >
                  {saving ? 'СОХРАНЯЮ...' : <span className="flex items-center justify-center gap-2"><Icon name="floppy" size={16} color="currentColor" />СОХРАНИТЬ ЧЕРНОВИК</span>}
                </button>
                <button
                  onClick={() => save(true)}
                  disabled={saving}
                  className="flex-1 py-3 rounded-lg font-geist font-bold text-sm transition-all hover:brightness-110 cursor-pointer"
                  style={{ background: color, color: readableTextOn(color), letterSpacing: TRACK_WIDE, boxShadow: saving ? 'none' : CARD_SHADOW }}
                >
                  {saving ? 'ПУБЛИКУЮ...' : <span className="flex items-center justify-center gap-2"><Icon name="rocket" size={16} color="currentColor" />ОПУБЛИКОВАТЬ</span>}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
