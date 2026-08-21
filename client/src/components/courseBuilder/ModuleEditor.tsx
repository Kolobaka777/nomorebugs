import { useState } from 'react';
import { clickableProps } from '../../utils/a11y';
import Icon from '../Icon';
import LessonEditor from './LessonEditor';
import { emptyLesson, uid } from './types';
import type { BLesson, BModule } from './types';
import { CARD_BG, TEXT_MUTED, ERROR, PAGE_BG, TEXT_PRIMARY, H4 } from '../../utils/theme';
import { counted } from '../../utils/plural';

export default function ModuleEditor({
  mod,
  modIdx,
  onChange,
  onDelete,
  onDuplicate,
  color,
  allLessons,
}: {
  mod: BModule;
  modIdx: number;
  onChange: (m: BModule) => void;
  onDelete: () => void;
  onDuplicate: () => void;
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
  // A copy needs its own local ids, or the two would be the same element as
  // far as React and the prerequisite picker are concerned. Its prerequisite
  // reference is dropped for the same reason: pointing at the original's
  // target is a guess, and pointing at the original itself is a loop.
  const duplicateLesson = (i: number) => {
    const src = mod.lessons[i];
    const copy: BLesson = {
      ...src,
      _id: uid(),
      title: src.title ? `${src.title} (копия)` : src.title,
      prerequisite_type: 'none',
      prerequisite_lesson_local_id: undefined,
      questions: src.questions.map(q => ({ ...q, _id: uid() })),
    };
    onChange({ ...mod, lessons: [...mod.lessons.slice(0, i + 1), copy, ...mod.lessons.slice(i + 1)] });
  };

  return (
    <div
      className="rounded-lg mb-4"
      style={{ background: CARD_BG, border: `1px solid ${color}25` }}
    >
      {/* A named header row that collapses the module, and the field with
          its own actions underneath — the header says which module this is,
          the field holds what it is called. They used to be the same row, so
          a module with no name yet was a nameless input in a nameless card. */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer"
        onClick={() => setCollapsed(c => !c)}
        {...clickableProps(() => setCollapsed(c => !c))}
        aria-expanded={!collapsed}
      >
        <p className="font-montserrat break-words min-w-0" style={{ ...H4, fontSize: 17, letterSpacing: '2.4px' }}>
          Модуль {modIdx + 1}. {mod.title || 'Название модуля'}
        </p>
        <span className="flex items-center gap-3 flex-shrink-0">
          <span className="font-geist text-xs" style={{ color: TEXT_MUTED }}>
            {counted(mod.lessons.length, ['элемент', 'элемента', 'элементов'])}
          </span>
          <Icon name={collapsed ? 'chevronDown' : 'chevronUp'} size={20} color={color} />
        </span>
      </div>

      {!collapsed && (
        <div className="px-5 pb-4">
          <div className="flex items-center gap-2 mb-4">
            <input
              value={mod.title}
              onChange={e => onChange({ ...mod, title: e.target.value })}
              placeholder="Название модуля"
              className="flex-1 pixel-input text-sm"
            />
            <button
              onClick={onDuplicate}
              aria-label="Дублировать модуль"
              className="flex-shrink-0 transition-colors cursor-pointer"
              style={{ color: TEXT_MUTED }}
              onMouseEnter={e => (e.currentTarget.style.color = color)}
              onMouseLeave={e => (e.currentTarget.style.color = TEXT_MUTED)}
            >
              <Icon name="copy" size={18} color="currentColor" />
            </button>
            <button
              onClick={onDelete}
              aria-label="Удалить модуль"
              className="flex-shrink-0 transition-colors cursor-pointer"
              style={{ color: TEXT_MUTED }}
              onMouseEnter={e => (e.currentTarget.style.color = ERROR)}
              onMouseLeave={e => (e.currentTarget.style.color = TEXT_MUTED)}
            >
              <Icon name="trash" size={18} color="currentColor" />
            </button>
          </div>
          {mod.lessons.map((lesson, li) => (
            <LessonEditor
              key={lesson._id}
              lesson={lesson}
              idx={li}
              onChange={updated => updateLesson(li, updated)}
              onDelete={() => deleteLesson(li)}
              onDuplicate={() => duplicateLesson(li)}
              color={color}
              allLessons={allLessons}
            />
          ))}
          <div className="flex gap-3 mt-3">
            <button
              onClick={addLesson}
              className="flex-1 py-2.5 rounded font-geist text-sm transition-all hover:brightness-110 cursor-pointer"
              style={{ background: `${color}66`, color: PAGE_BG, fontWeight: 600 }}
            >
              + Добавить урок
            </button>
            <button
              onClick={addQuiz}
              className="flex-1 py-2.5 rounded font-geist text-sm transition-all hover:brightness-125 cursor-pointer"
              style={{ background: 'rgba(11, 12, 16, 0.5)', color: TEXT_PRIMARY, border: `1px solid ${color}55` }}
            >
              + Добавить тест
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
