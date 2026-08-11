import Icon from '../Icon';
import type { BQuestion } from './types';
import { TEXT_MUTED } from '../../utils/theme';

export default function QuestionEditor({
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
      className="rounded-lg p-4 mb-3"
      style={{ background: 'rgba(197, 198, 199, 0.03)', border: '1px solid rgba(197, 198, 199, 0.12)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-geist text-xs font-semibold" style={{ color }}>
          Вопрос {idx + 1}
        </span>
        <button
          onClick={onDelete}
          className="flex items-center gap-1 font-geist text-xs transition-colors cursor-pointer"
          style={{ color: TEXT_MUTED }}
          onMouseEnter={e => (e.currentTarget.style.color = '#e05252')}
          onMouseLeave={e => (e.currentTarget.style.color = TEXT_MUTED)}
        >
          <Icon name="close" size={13} color="currentColor" />
          удалить
        </button>
      </div>

      <textarea
        value={q.question_text}
        onChange={e => onChange({ ...q, question_text: e.target.value })}
        placeholder="Текст вопроса"
        rows={2}
        className="pixel-input text-xs mb-3 resize-none"
      />

      <div className="grid grid-cols-2 gap-2 mb-3">
        {opts.map(([field, label], oi) => (
          <div key={field} className="flex items-center gap-2">
            <button
              onClick={() => onChange({ ...q, correct_idx: oi })}
              className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border transition-all cursor-pointer"
              style={{
                borderColor: q.correct_idx === oi ? color : 'rgba(197, 198, 199, 0.25)',
                background: q.correct_idx === oi ? `${color}30` : 'transparent',
                color: q.correct_idx === oi ? color : 'rgba(197, 198, 199, 0.45)',
              }}
            >
              {label}
            </button>
            <input
              value={q[field] as string}
              onChange={e => onChange({ ...q, [field]: e.target.value })}
              placeholder={`Вариант ${label}`}
              className="flex-1 pixel-input text-xs"
            />
          </div>
        ))}
      </div>

      <input
        value={q.explanation}
        onChange={e => onChange({ ...q, explanation: e.target.value })}
        placeholder="Объяснение правильного ответа (необязательно)"
        className="pixel-input text-xs"
        style={{ color: 'rgba(197, 198, 199, 0.6)' }}
      />
    </div>
  );
}
