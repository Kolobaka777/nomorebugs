import { useState } from 'react';
import { clickableProps } from '../../utils/a11y';
import LessonEditor from './LessonEditor';
import { emptyLesson } from './types';
import type { BLesson, BModule } from './types';

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
