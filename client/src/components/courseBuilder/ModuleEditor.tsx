import { useState } from 'react';
import { clickableProps } from '../../utils/a11y';
import Icon from '../Icon';
import LessonEditor from './LessonEditor';
import { emptyLesson } from './types';
import type { BLesson, BModule } from './types';
import { CARD_BG, TEXT_PRIMARY, TEXT_MUTED, ERROR } from '../../utils/theme';

export default function ModuleEditor({
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
      style={{ background: CARD_BG, border: `1px solid ${color}25` }}
    >
      {/* Module header */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer"
        onClick={() => setCollapsed(c => !c)}
        {...clickableProps(() => setCollapsed(c => !c))}
        aria-expanded={!collapsed}
      >
        <span className="font-geist text-xs font-bold" style={{ color, minWidth: '20px' }}>
          М{modIdx + 1}
        </span>
        <input
          value={mod.title}
          onChange={e => { e.stopPropagation(); onChange({ ...mod, title: e.target.value }); }}
          onClick={e => e.stopPropagation()}
          placeholder={`Название модуля ${modIdx + 1}`}
          className="flex-1 rounded-lg px-3 py-1.5 font-geist text-sm font-semibold outline-none"
          style={{ background: 'rgba(197, 198, 199, 0.04)', color: TEXT_PRIMARY, border: '1px solid rgba(197, 198, 199, 0.12)' }}
        />
        <span className="font-geist text-xs flex-shrink-0" style={{ color: TEXT_MUTED }}>
          {mod.lessons.length} эл.
        </span>
        <Icon
          name={collapsed ? 'chevronDown' : 'chevronUp'}
          size={18}
          color={TEXT_MUTED}
          className="flex-shrink-0"
          style={{ transition: 'transform 0.15s' }}
        />
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          aria-label="Удалить модуль"
          className="flex-shrink-0 transition-colors cursor-pointer"
          style={{ color: TEXT_MUTED }}
          onMouseEnter={e => (e.currentTarget.style.color = ERROR)}
          onMouseLeave={e => (e.currentTarget.style.color = TEXT_MUTED)}
        >
          <Icon name="close" size={16} color="currentColor" />
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
              className="flex-1 py-2 rounded-lg font-geist text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              style={{ background: 'rgba(197, 198, 199, 0.05)', color: 'rgba(197, 198, 199, 0.6)', border: '1px dashed rgba(197, 198, 199, 0.2)' }}
            >
              <Icon name="sparkle" size={13} color="currentColor" />
              Добавить урок
            </button>
            <button
              onClick={addQuiz}
              className="flex-1 py-2 rounded-lg font-geist text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              style={{ background: `${color}10`, color, border: `1px dashed ${color}40` }}
            >
              <Icon name="sparkle" size={13} color="currentColor" />
              Добавить тест
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
