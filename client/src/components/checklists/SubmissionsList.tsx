import SnailLoader from '../SnailLoader';
import { clickableProps } from '../../utils/a11y';
import { parseServerDate } from '../../utils/date';
import type { Submission } from './types';

export default function SubmissionsList({
  submissions,
  loading,
  onOpenDetail,
}: {
  submissions: Submission[];
  loading: boolean;
  onOpenDetail: (id: number) => void;
}) {
  return (
    <div className="space-y-2">
      {loading && <SnailLoader />}
      {!loading && submissions.length === 0 && (
        <p className="text-pixel/55 text-sm font-sans text-center py-8">Нет проверок</p>
      )}
      {submissions.map(sub => {
        const failRate = sub.total_items > 0 ? Math.round((sub.fail_count / sub.total_items) * 100) : 0;
        return (
          <div
            key={sub.id}
            className="p-3 flex items-center gap-4 cursor-pointer transition-all"
            style={{
              background: '#1a1a2e',
              borderTop:    '2px solid rgba(255,255,255,0.1)',
              borderLeft:   '2px solid rgba(255,255,255,0.1)',
              borderBottom: '2px solid rgba(0,0,0,0.45)',
              borderRight:  '2px solid rgba(0,0,0,0.45)',
              outline: `1px solid ${sub.color}35`,
              outlineOffset: '-3px',
            }}
            onClick={() => onOpenDetail(sub.id)}
            {...clickableProps(() => onOpenDetail(sub.id))}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <div className="w-7 h-7 rounded flex items-center justify-center font-pixel text-xs shrink-0" style={{ background: sub.color, color: '#0f0f1a' }}>
              {sub.avatar_initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-pixel text-xs font-sans font-semibold leading-snug">{sub.task_name}</p>
              <p className="text-pixel/60 text-xs font-sans">
                {sub.tester_name} · {sub.template_name}
                {sub.content_author && ` · К: ${sub.content_author}`}
                {sub.verska_author && ` · В: ${sub.verska_author}`}
                {' · '}{parseServerDate(sub.submitted_at).toLocaleDateString('ru-RU')}
              </p>
            </div>
            <div className="text-right shrink-0">
              {sub.fail_count > 0
                ? <p className="text-xs font-sans font-semibold" style={{ color: '#e05252' }}>{sub.fail_count} ошибок ({failRate}%)</p>
                : <p className="text-xs font-sans font-semibold" style={{ color: '#1D9E75' }}>Всё ОК ✓</p>
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}
