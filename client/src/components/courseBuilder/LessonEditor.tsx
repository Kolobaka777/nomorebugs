import { lazy, Suspense } from 'react';
import Icon from '../Icon';
import QuestionEditor from './QuestionEditor';
import { emptyQuestion } from './types';
import type { BLesson, BQuestion, PrerequisiteType } from './types';
import { parseRichContent } from '../../utils/richContent';
import { CARD_BG, TEXT_MUTED, ERROR, PAGE_BG, H4 } from '../../utils/theme';

// Same lazy-split reasoning as GuidesPage.tsx/CourseBuilderPage.tsx.
const RichTextEditor = lazy(() => import('../RichTextEditor'));

function RichTextEditorFallback() {
  return (
    <div className="flex items-center justify-center py-6">
      <div className="pixel-pulse font-geist text-xs" style={{ color: TEXT_MUTED }}>загружаю редактор...</div>
    </div>
  );
}

export default function LessonEditor({
  lesson,
  idx,
  onChange,
  onDelete,
  onDuplicate,
  color,
  allLessons,
}: {
  lesson: BLesson;
  idx: number;
  onChange: (l: BLesson) => void;
  onDelete: () => void;
  onDuplicate: () => void;
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
        background: CARD_BG,
        border: `1px solid ${lesson.type === 'quiz' ? `${color}30` : 'rgba(197, 198, 199, 0.12)'}`,
      }}
    >
      {/* A named row above the field, per the design: the label says which
          element this is and what goes in it, so the input itself does not
          have to carry that in a placeholder nobody reads twice. */}
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <p className="font-montserrat" style={{ ...H4, fontSize: 15 }}>
          {lesson.type === 'quiz' ? 'Тест' : 'Урок'} {idx + 1}. {lesson.title || (lesson.type === 'quiz' ? 'Название теста' : 'Название урока')}
        </p>

        {/* Type toggle */}
        <div className="flex rounded overflow-hidden flex-shrink-0" style={{ border: `1px solid ${color}55` }}>
          {(['lesson', 'quiz'] as const).map(t => (
            <button
              key={t}
              onClick={() => onChange({ ...lesson, type: t, questions: t === 'quiz' && lesson.questions.length === 0 ? [emptyQuestion()] : lesson.questions })}
              className="px-4 py-1.5 font-geist text-xs transition-colors cursor-pointer"
              style={{
                background: lesson.type === t ? `${color}66` : 'transparent',
                color: lesson.type === t ? PAGE_BG : 'rgba(197, 198, 199, 0.55)',
                fontWeight: lesson.type === t ? 600 : 400,
              }}
            >
              {t === 'lesson' ? 'Урок' : 'Тест'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <input
          value={lesson.title}
          onChange={e => onChange({ ...lesson, title: e.target.value })}
          placeholder={lesson.type === 'quiz' ? 'Название теста' : 'Название урока'}
          className="flex-1 pixel-input text-sm"
        />
        <button
          onClick={onDuplicate}
          aria-label="Дублировать урок"
          className="flex-shrink-0 transition-colors cursor-pointer"
          style={{ color: TEXT_MUTED }}
          onMouseEnter={e => (e.currentTarget.style.color = color)}
          onMouseLeave={e => (e.currentTarget.style.color = TEXT_MUTED)}
        >
          <Icon name="copy" size={18} color="currentColor" />
        </button>
        <button
          onClick={onDelete}
          aria-label="Удалить урок"
          className="flex-shrink-0 transition-colors cursor-pointer"
          style={{ color: TEXT_MUTED }}
          onMouseEnter={e => (e.currentTarget.style.color = ERROR)}
          onMouseLeave={e => (e.currentTarget.style.color = TEXT_MUTED)}
        >
          <Icon name="trash" size={18} color="currentColor" />
        </button>
      </div>

      {/* Prerequisite */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="font-geist text-xs shrink-0" style={{ color: TEXT_MUTED }}>Пререквизит:</span>
        <div className="flex rounded overflow-hidden flex-shrink-0" style={{ border: `1px solid ${color}55` }}>
          {([
            ['none', 'Нет'],
            ['optional', 'Рекомендация'],
            ['mandatory', 'Обязательно'],
          ] as [PrerequisiteType, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => onChange({ ...lesson, prerequisite_type: t })}
              className="px-3 py-1.5 font-geist text-xs transition-colors cursor-pointer"
              style={{
                background: lesson.prerequisite_type === t ? `${color}66` : 'transparent',
                color: lesson.prerequisite_type === t ? PAGE_BG : 'rgba(197, 198, 199, 0.55)',
                fontWeight: lesson.prerequisite_type === t ? 600 : 400,
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
            className="pixel-input text-xs flex-1 min-w-[160px]"
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
            className="pixel-input text-xs flex-1 min-w-[220px]"
          />
        )}
      </div>

      {/* Content (lesson) */}
      {lesson.type === 'lesson' && (
        <Suspense fallback={<RichTextEditorFallback />}>
          <RichTextEditor
            content={parseRichContent(lesson.content)}
            editable
            onChangeJSON={json => onChange({ ...lesson, content: json })}
            placeholder="Содержимое урока..."
          />
        </Suspense>
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
            className="w-full py-2 rounded-lg font-geist text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 mt-1"
            style={{ background: `${color}15`, color, border: `1px dashed ${color}40` }}
          >
            <Icon name="sparkle" size={13} color="currentColor" />
            Добавить вопрос
          </button>
        </div>
      )}
    </div>
  );
}
