import PixelIcon from '../PixelIcon';
import QuestionEditor from './QuestionEditor';
import { emptyQuestion } from './types';
import type { BLesson, BQuestion, PrerequisiteType } from './types';

export default function LessonEditor({
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
