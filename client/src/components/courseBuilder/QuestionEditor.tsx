import type { BQuestion } from './types';

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
