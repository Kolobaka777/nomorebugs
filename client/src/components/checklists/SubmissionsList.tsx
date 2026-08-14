import FrogLoader from '../FrogLoader';
import { clickableProps } from '../../utils/a11y';
import { parseServerDate } from '../../utils/date';
import { PAGE_BG, TEXT_PRIMARY, TEXT_MUTED, ACCENT, CARD_BG, CARD_SHADOW } from '../../utils/theme';
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
      {loading && <FrogLoader />}
      {!loading && submissions.length === 0 && (
        <p className="font-geist text-sm text-center py-8" style={{ color: TEXT_MUTED }}>Нет проверок</p>
      )}
      {submissions.map(sub => {
        const failRate = sub.total_items > 0 ? Math.round((sub.fail_count / sub.total_items) * 100) : 0;
        return (
          <div
            key={sub.id}
            className="p-3 flex items-center gap-4 cursor-pointer transition-all rounded-lg"
            style={{
              background: CARD_BG,
              border: `1px solid ${sub.color}35`,
              boxShadow: CARD_SHADOW,
            }}
            onClick={() => onOpenDetail(sub.id)}
            {...clickableProps(() => onOpenDetail(sub.id))}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center font-geist font-semibold text-xs shrink-0" style={{ background: sub.color, color: PAGE_BG }}>
              {sub.avatar_initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-geist text-xs font-semibold leading-snug break-words" style={{ color: TEXT_PRIMARY }}>{sub.task_name}</p>
              <p className="font-geist text-xs break-words" style={{ color: TEXT_MUTED }}>
                {sub.tester_name} · {sub.template_name}
                {sub.content_author && ` · К: ${sub.content_author}`}
                {sub.verska_author && ` · В: ${sub.verska_author}`}
                {' · '}{parseServerDate(sub.submitted_at).toLocaleDateString('ru-RU')}
              </p>
            </div>
            <div className="text-right shrink-0">
              {sub.fail_count > 0
                ? <p className="text-xs font-geist font-semibold" style={{ color: '#e05252' }}>{sub.fail_count} ошибок ({failRate}%)</p>
                : <p className="text-xs font-geist font-semibold" style={{ color: ACCENT }}>Всё ОК ✓</p>
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}
